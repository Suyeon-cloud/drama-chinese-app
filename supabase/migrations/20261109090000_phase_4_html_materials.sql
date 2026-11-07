-- Phase 4: 주차별 보충 자료 — HTML 학습자료 (week_materials.kind = 'html')
--
-- 기존 행은 바꾸거나 지우지 않는다. 기존 3-B·3-C 함수 본문도 바꾸지 않는다.
--   1) week_materials.html_body 칸 (UTF-8 2MB까지), kind 검사에 'html' 추가, 종류별 칸 제약에 html 추가
--      (link·file 행은 html_body가 비어 있어야 한다 — 지금 있는 행은 모두 비어 있어 그대로 통과한다)
--   2) HTML 저장 RPC: save_week_material_html (교수자, authenticated — can_manage_course 확인) ·
--      admin_save_week_material_html (service_role). 새 자료는 직접 넣고, 수정은 주차·제목·설명·공개를 기존
--      _save_week_material로 바꾼 뒤 같은 트랜잭션에서 본문을 바꾼다. 스크립트·이벤트 속성 등은 거부(_material_html_ok).
--   3) week_material_html (authenticated): 본문 열기. 편집·담당 교수자는 비공개 포함, 학생은 수강 중인 과목의 published만,
--      그 밖·없는 자료·HTML이 아닌 자료는 "없음"(P0002). 목록 RPC(list_week_materials)는 본문을 보내지 않는다(바꾸지 않음).
--   삭제·정렬·공개 전환·주차 이동은 3-B RPC를 그대로 쓴다. 테이블 직접 권한(anon·authenticated 없음)·RLS도 그대로다.
--
-- 트랜잭션: 파일 전체가 begin … commit 한 트랜잭션이다. 중간에 실패하면 전부 취소된다.
-- 재실행: [0] 사전 확인이 기존 객체가 예상과 같은지 본다. 다르면 아무것도 바꾸지 않고 멈춘다.

begin;

/* ───────── 0) 사전 확인 ───────── */

do $pre$
declare
  v_actual text;
begin
  -- 이 파일이 쓰는 기존 객체 (3-B·3-C·D1)
  if to_regclass('public.week_materials') is null
     or to_regprocedure('public._save_week_material(text,text,jsonb,uuid,text,boolean)') is null
     or to_regprocedure('public._can_see_all_week_materials(text)') is null
     or to_regprocedure('public._is_week_material_learner(text)') is null
     or to_regprocedure('public._material_text(jsonb,text,integer,boolean)') is null
     or to_regprocedure('public._material_actor_label()') is null
     or to_regprocedure('public.can_manage_course(text)') is null
     or to_regprocedure('public.lesson_course_lock_key(text)') is null
     or to_regprocedure('public.week_material_download(text)') is null then
    raise exception '4_PREFLIGHT: 3-B·3-C 객체(week_materials·저장·권한 함수)가 없어요.';
  end if;

  -- 바꿀 제약이 3-B가 만든 이름으로 있어야 한다
  select string_agg(conname, ',' order by conname) into v_actual
    from pg_constraint
   where conrelid = 'public.week_materials'::regclass and conname in ('week_materials_kind_check', 'week_materials_kind_fields');
  if v_actual is distinct from 'week_materials_kind_check,week_materials_kind_fields' then
    raise exception '4_PREFLIGHT: week_materials의 종류 제약 이름이 예상과 달라요. (%)', coalesce(v_actual, '없음');
  end if;

  -- html_body가 이미 있으면 text여야 한다
  select data_type into v_actual from information_schema.columns
   where table_schema = 'public' and table_name = 'week_materials' and column_name = 'html_body';
  if v_actual is not null and v_actual <> 'text' then
    raise exception '4_PREFLIGHT: 이미 있는 html_body 칸의 형식이 text가 아니에요. (%)', v_actual;
  end if;

  -- 테이블 정책이 생기지 않았어야 한다 (3-B: 정책 없음)
  select string_agg(policyname, ',') into v_actual from pg_policies where schemaname = 'public' and tablename = 'week_materials';
  if v_actual is not null then
    raise exception '4_PREFLIGHT: week_materials에 예상하지 않은 RLS 정책이 있어요. (%)', v_actual;
  end if;

  -- 같은 이름의 다른 함수(오버로드)가 있으면 멈춘다
  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('save_week_material_html', 'admin_save_week_material_html', '_save_week_material_html', 'week_material_html', '_material_html_ok')
     and p.oid <> all (array_remove(array[
       to_regprocedure('public.save_week_material_html(text,text,jsonb,text)'),
       to_regprocedure('public.admin_save_week_material_html(text,text,jsonb,text,text)'),
       to_regprocedure('public._save_week_material_html(text,text,jsonb,text,uuid,text,boolean)'),
       to_regprocedure('public.week_material_html(text)'),
       to_regprocedure('public._material_html_ok(text)')
     ]::oid[], null));
  if v_actual is not null then
    raise exception '4_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;
end;
$pre$;

/* ───────── 1) 칸·제약 ───────── */

alter table public.week_materials add column if not exists html_body text;

alter table public.week_materials drop constraint if exists week_materials_html_body_size;
alter table public.week_materials add constraint week_materials_html_body_size
  check (html_body is null or octet_length(html_body) between 1 and 2097152);

alter table public.week_materials drop constraint week_materials_kind_check;
alter table public.week_materials add constraint week_materials_kind_check
  check (kind in ('link', 'file', 'html'));

-- 종류별 필수 칸 (link는 주소만, file은 파일 칸만, html은 본문만)
alter table public.week_materials drop constraint week_materials_kind_fields;
alter table public.week_materials add constraint week_materials_kind_fields check (
  (kind = 'link' and url is not null and storage_path is null and file_name is null and mime_type is null and size_bytes is null and html_body is null)
  or (kind = 'file' and url is null and storage_path is not null and file_name is not null and mime_type is not null and size_bytes is not null and html_body is null)
  or (kind = 'html' and url is null and storage_path is null and file_name is null and mime_type is null and size_bytes is null and html_body is not null)
);

/* ───────── 2) 함수 ───────── */

-- 저장할 수 있는 HTML인지 (서버 src/content/materialHtml.ts의 materialHtmlProblem과 같은 기준의 핵심 부분).
-- 앱은 sandbox iframe + CSP로만 그리므로 이 검사는 보조 방어선이다.
create or replace function public._material_html_ok(p_html text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_html is not null
     and btrim(p_html) <> ''
     and octet_length(p_html) <= 2097152
     and p_html !~* '<[[:space:]]*/?[[:space:]]*script'
     and p_html !~* '<[[:space:]]*(iframe|frame|frameset|object|embed|applet|portal|base|form)([^a-z0-9_-]|$)'
     and p_html !~* '<[[:space:]]*meta[^>]*http-equiv'
     and p_html !~* '<[a-z!][^>]*[[:space:]"''/]on[a-z]+[[:space:]]*='
     and p_html !~* '(javascript|vbscript|livescript)[[:space:]]*:'
     and p_html !~* 'srcdoc[[:space:]]*='
     and p_html !~* '(expression[[:space:]]*\(|-moz-binding|behavior[[:space:]]*:)';
$$;

/*
 * HTML 자료 저장 (공통). p_material_id가 null이면 새 자료(p_course_id·p_html 필수), 아니면 그 HTML 자료를 바꾼다.
 * p_input: { week, title, description, status } — 새 자료는 week·title 필수, status 기본 draft. 수정은 보낸 칸만.
 * p_html: 본문 (수정에서 null이면 오류 — 본문 없이 칸만 바꿀 때는 기존 save_week_material을 쓴다)
 * 오류: 42501 권한 없음 / P0002 과목·자료 없음 / 22023 입력 오류·HTML이 아닌 자료 / 23505 주차당 개수 초과
 */
create or replace function public._save_week_material_html(
  p_course_id text,
  p_material_id text,
  p_input jsonb,
  p_html text,
  p_actor uuid,
  p_actor_label text,
  p_is_admin boolean
)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses;
  v_course_id text;
  v_old public.week_materials;
  v_week integer;
  v_status text;
  v_saved public.week_materials;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception '자료 정보 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_input ?| array['id', 'courseId', 'kind', 'position', 'url', 'storagePath', 'fileName', 'mimeType', 'sizeBytes', 'html'] then
    raise exception 'id·과목·종류·순서·링크·파일 칸은 서버가 정해요.' using errcode = '22023';
  end if;
  if p_html is null then
    raise exception 'HTML 내용을 입력해 주세요.' using errcode = '22023';
  end if;
  if octet_length(p_html) > 2097152 then
    raise exception 'HTML은 2MB(UTF-8)까지 저장할 수 있어요.' using errcode = '22023';
  end if;
  if not public._material_html_ok(p_html) then
    raise exception '보안을 위해 스크립트·이벤트 속성·끼워 넣기 요소 등은 넣을 수 없어요.' using errcode = '22023';
  end if;

  if p_material_id is null then
    v_course_id := p_course_id;
    if v_course_id is null then
      raise exception '강의를 찾을 수 없어요.' using errcode = 'P0002';
    end if;
    perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id));
    select * into v_course from public.courses where id = v_course_id;
    if not found then
      raise exception '강의를 찾을 수 없어요.' using errcode = 'P0002';
    end if;
    if not p_is_admin and not public.can_manage_course(v_course_id) then
      raise exception '담당 강의의 자료만 저장할 수 있어요.' using errcode = '42501';
    end if;
    if not (p_input ? 'week' and p_input ? 'title') then
      raise exception '주차·자료 제목을 입력해 주세요.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_input -> 'week') is distinct from 'number' or (p_input ->> 'week') !~ '^[0-9]{1,2}$' then
      raise exception '주차는 정수로 입력해 주세요.' using errcode = '22023';
    end if;
    v_week := (p_input ->> 'week')::integer;
    if v_week < 1 or v_week > v_course.week_count then
      raise exception '주차는 1~%주차 중에서 골라 주세요.', v_course.week_count using errcode = '22023';
    end if;
    v_status := coalesce(p_input ->> 'status', 'draft');
    if v_status not in ('draft', 'published') then
      raise exception '공개 상태는 공개(published) 또는 비공개(draft)만 고를 수 있어요.' using errcode = '22023';
    end if;
    if (select count(*) from public.week_materials where course_id = v_course_id and week = v_week) >= 20 then
      raise exception '한 주차에는 자료를 20개까지 등록할 수 있어요.' using errcode = '23505';
    end if;
    insert into public.week_materials (
      id, course_id, week, kind, title, description, url, html_body, status, position, version, updated_by, updated_by_label
    ) values (
      'material-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      v_course_id, v_week, 'html',
      public._material_text(p_input -> 'title', '자료 제목', 100, true),
      public._material_text(p_input -> 'description', '설명', 500, false),
      null, p_html, v_status,
      coalesce((select max(m.position) + 1 from public.week_materials m where m.course_id = v_course_id and m.week = v_week), 0),
      1, p_actor, p_actor_label
    )
    returning * into v_saved;
    return v_saved;
  end if;

  select course_id into v_course_id from public.week_materials where id = p_material_id;
  if not found then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id));
  if not p_is_admin and not public.can_manage_course(v_course_id) then
    raise exception '담당 강의의 자료만 저장할 수 있어요.' using errcode = '42501';
  end if;
  select * into v_old from public.week_materials where id = p_material_id for update;
  if not found then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if v_old.kind <> 'html' then
    raise exception 'HTML 자료만 HTML 내용을 바꿀 수 있어요.' using errcode = '22023';
  end if;
  -- 주차·제목·설명·공개는 기존 저장 함수가 검사·이동·순서 정리까지 한다 (같은 트랜잭션)
  if p_input ?| array['week', 'title', 'description', 'status'] then
    perform public._save_week_material(null, p_material_id, p_input, p_actor, p_actor_label, p_is_admin);
  end if;
  update public.week_materials
     set html_body = p_html,
         version = version + 1,
         updated_by = p_actor,
         updated_by_label = p_actor_label
   where id = p_material_id
  returning * into v_saved;
  return v_saved;
end;
$$;

create or replace function public.save_week_material_html(p_course_id text, p_material_id text, p_input jsonb, p_html text)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  v_label := public._material_actor_label();
  if v_label is null then
    raise exception '교수자만 자료를 저장할 수 있어요.' using errcode = '42501';
  end if;
  return public._save_week_material_html(p_course_id, p_material_id, p_input, p_html, v_uid, v_label, false);
end;
$$;

create or replace function public.admin_save_week_material_html(p_course_id text, p_material_id text, p_input jsonb, p_html text, p_admin_label text default null)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._save_week_material_html(p_course_id, p_material_id, p_input, p_html, null, coalesce(nullif(btrim(p_admin_label), ''), '관리자'), true);
end;
$$;

/*
 * HTML 본문 열기 (로그인 사용자). 열 수 있으면 id·제목·본문·수정 시각을 돌려준다. (서버가 화면용 JSON·내려받기 파일을 만든다)
 * 편집·담당 교수자(_can_see_all_week_materials): 비공개 포함 / 수강 학생: published만 / 그 밖·없는 자료·HTML이 아닌 자료: P0002
 */
create or replace function public.week_material_html(p_material_id text)
returns table (id text, title text, html_body text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.week_materials;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v from public.week_materials m where m.id = p_material_id;
  if not found or v.kind <> 'html' or v.html_body is null
     or not (public._can_see_all_week_materials(v.course_id)
             or (v.status = 'published' and public._is_week_material_learner(v.course_id))) then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  return query select v.id, v.title, v.html_body, v.updated_at;
end;
$$;

/* ───────── 권한 ───────── */

revoke all on function public._material_html_ok(text) from public, anon, authenticated, service_role;
revoke all on function public._save_week_material_html(text, text, jsonb, text, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.save_week_material_html(text, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_week_material_html(text, text, jsonb, text, text) from public, anon, authenticated, service_role;
revoke all on function public.week_material_html(text) from public, anon, authenticated, service_role;

grant execute on function public.save_week_material_html(text, text, jsonb, text) to authenticated;
grant execute on function public.admin_save_week_material_html(text, text, jsonb, text, text) to service_role;
grant execute on function public.week_material_html(text) to authenticated;

commit;

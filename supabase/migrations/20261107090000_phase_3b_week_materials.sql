-- Phase 3-B: 주차별 보충 학습자료 (week_materials) — 링크 자료
--
-- 추가형 마이그레이션이다. 기존 테이블·행(lessons·lesson_progress·courses 등)은 바꾸거나 지우지 않는다.
--   1) week_materials 테이블 (과목 + 주차, 분반별 자료 없음). kind: link(지금 사용) · file(3-C에서 사용). HTML은 4단계.
--   2) 테이블 직접 접근 금지: anon·authenticated에는 테이블 권한(열 포함)도 RLS 정책도 주지 않는다. (RLS는 켜 둔다)
--      열람은 list_week_materials RPC로만 — 행(학생은 published만)과 열(편집자 정보는 교수자에게만)을 함께 거른다.
--      쓰기는 SECURITY DEFINER RPC로만 — 교수자용(authenticated)과 관리자용(service_role)을 나눈다. 서버의 service_role 경로는 테이블을 직접 읽는다.
--   3) admin_update_course: 주차 수 축소 하한에 보충 자료의 가장 큰 주차를 더한다. (E1 함수에서 그 한 줄만 바뀜)
--   Storage 버킷(week-materials)은 만들지 않는다. 파일 업로드와 함께 3-C 마이그레이션에서 준비한다. (storage 스키마는 건드리지 않음)
--
-- 권한 규칙 (3-A JSON 모드와 같음)
--   편집: 관리자(service_role) 모든 과목(기존 자료 포함) · 교수자는 그 과목의 운영 중 담당 분반이 있을 때(can_manage_course, 비활성 과목 포함)
--   열람: 위 + 그 과목 분반을 담당하는 교수자(비활성 분반만이어도) · 승인 + 수강 중인 학생은 published만 (기존 자료 과목은 학생에게 보이지 않음)
--
-- 트랜잭션: 파일 전체가 begin … commit 한 트랜잭션이다. 함수 생성과 실행 권한 회수가 함께 커밋되고, 중간에 실패하면 전부 취소된다.
-- 재실행: 먼저 [0] 사전 확인이 이미 있는 객체가 이 파일이 만드는 구조와 같은지 본다. 다르면 아무것도 바꾸지 않고 멈춘다.
--         같으면 create … if not exists · create or replace · drop … if exists 로 같은 결과가 된다.

begin;

/* ───────── 0) 사전 확인: 의존 객체 · 이미 있는 객체가 예상 구조와 같은지 ───────── */

do $pre$
declare
  v_expected_columns constant text :=
    'id:text:NO,course_id:text:NO,week:integer:NO,kind:text:NO,title:text:NO,description:text:NO,url:text:YES,'
    || 'storage_path:text:YES,file_name:text:YES,mime_type:text:YES,size_bytes:bigint:YES,status:text:NO,position:integer:NO,'
    || 'version:integer:NO,updated_by:uuid:YES,updated_by_label:text:YES,created_at:timestamp with time zone:NO,updated_at:timestamp with time zone:NO';
  v_expected_constraints constant text :=
    'week_materials_course_id_fkey,week_materials_description_check,week_materials_file_name_check,week_materials_id_check,'
    || 'week_materials_kind_check,week_materials_kind_fields,week_materials_mime_type_check,week_materials_pkey,week_materials_position_check,'
    || 'week_materials_size_bytes_check,week_materials_status_check,week_materials_storage_path_check,week_materials_title_check,'
    || 'week_materials_updated_by_fkey,week_materials_url_check,week_materials_version_check,week_materials_week_check';
  v_names constant text[] := array[
    'list_week_materials', '_can_see_all_week_materials', '_is_week_material_learner', '_material_text', '_material_url',
    '_renumber_week_materials', '_save_week_material', '_delete_week_material', '_reorder_week_materials', '_material_actor_label',
    'save_week_material', 'delete_week_material', 'reorder_week_materials',
    'admin_save_week_material', 'admin_delete_week_material', 'admin_reorder_week_materials'];
  v_expected_oids oid[];
  v_actual text;
begin
  -- 이 파일이 쓰는 기존 객체 (Phase B·C1·D1·E1)
  if to_regprocedure('public.set_updated_at()') is null
     or to_regprocedure('public.can_manage_course(text)') is null
     or to_regprocedure('public.my_instructor_section_ids(boolean)') is null
     or to_regprocedure('public.my_enrolled_section_ids()') is null
     or to_regprocedure('public.lesson_course_lock_key(text)') is null
     or to_regprocedure('public._course_text(text,text,integer,boolean)') is null
     or to_regprocedure('public.admin_update_course(text,text,text,text,text,integer,text)') is null then
    raise exception '3B_PREFLIGHT: 필요한 기존 함수(Phase B·C1·D1·E1)가 없어요.';
  end if;

  -- 이미 week_materials가 있으면 (재실행) 열·제약·trigger·정책이 이 파일이 만드는 것과 같아야 한다.
  if to_regclass('public.week_materials') is not null then
    select string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' order by ordinal_position) into v_actual
      from information_schema.columns where table_schema = 'public' and table_name = 'week_materials';
    if v_actual is distinct from v_expected_columns then
      raise exception '3B_PREFLIGHT: 이미 있는 week_materials의 열이 예상과 달라요. (%)', v_actual;
    end if;
    select string_agg(conname, ',' order by conname collate "C") into v_actual
      from pg_constraint where conrelid = 'public.week_materials'::regclass;
    if v_actual is distinct from v_expected_constraints then
      raise exception '3B_PREFLIGHT: 이미 있는 week_materials의 제약이 예상과 달라요. (%)', v_actual;
    end if;
    select string_agg(tgname, ',' order by tgname collate "C") into v_actual
      from pg_trigger where tgrelid = 'public.week_materials'::regclass and not tgisinternal;
    if v_actual is distinct from 'week_materials_set_updated_at' then
      raise exception '3B_PREFLIGHT: 이미 있는 week_materials의 trigger가 예상과 달라요. (%)', v_actual;
    end if;
    -- 정책은 하나도 없어야 한다. (이전 초안의 week_materials_select_readable만 정리 대상으로 허용)
    select string_agg(policyname, ',' order by policyname) into v_actual
      from pg_policies where schemaname = 'public' and tablename = 'week_materials' and policyname <> 'week_materials_select_readable';
    if v_actual is not null then
      raise exception '3B_PREFLIGHT: week_materials에 예상하지 않은 RLS 정책이 있어요. (%)', v_actual;
    end if;
  end if;

  -- 같은 이름의 함수가 다른 인자로 있으면(오버로드) 멈춘다. 같은 인자면 create or replace로 이 파일의 정의가 된다.
  v_expected_oids := array_remove(array[
    to_regprocedure('public.list_week_materials(text)'),
    to_regprocedure('public._can_see_all_week_materials(text)'),
    to_regprocedure('public._is_week_material_learner(text)'),
    to_regprocedure('public._material_text(jsonb,text,integer,boolean)'),
    to_regprocedure('public._material_url(jsonb)'),
    to_regprocedure('public._renumber_week_materials(text,integer)'),
    to_regprocedure('public._save_week_material(text,text,jsonb,uuid,text,boolean)'),
    to_regprocedure('public._delete_week_material(text,boolean)'),
    to_regprocedure('public._reorder_week_materials(text,integer,text[],boolean)'),
    to_regprocedure('public._material_actor_label()'),
    to_regprocedure('public.save_week_material(text,text,jsonb)'),
    to_regprocedure('public.delete_week_material(text)'),
    to_regprocedure('public.reorder_week_materials(text,integer,text[])'),
    to_regprocedure('public.admin_save_week_material(text,text,jsonb,text)'),
    to_regprocedure('public.admin_delete_week_material(text)'),
    to_regprocedure('public.admin_reorder_week_materials(text,integer,text[])')
  ]::oid[], null);
  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = any (v_names) and p.oid <> all (v_expected_oids);
  if v_actual is not null then
    raise exception '3B_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;
  -- 이전 초안의 읽기 함수가 남아 있으면 정리 대상 (아래에서 지운다)
end;
$pre$;

/* ───────── 1) 테이블 ───────── */

create table if not exists public.week_materials (
  id text primary key check (id ~ '^material-[a-z0-9]{6,32}$'),
  course_id text not null references public.courses (id) on delete restrict,
  week integer not null check (week between 1 and 30),
  kind text not null check (kind in ('link', 'file')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  -- link: https 주소
  url text check (url is null or (char_length(url) <= 2000 and url ~ '^https://[^\s/?#@:]+\.[^\s/?#@]+' and url !~ '\s')),
  -- file (3-C): 비공개 버킷 week-materials(3-C에서 생성) 안의 경로와 파일 정보
  storage_path text check (storage_path is null or (char_length(storage_path) <= 500 and storage_path !~ '(^/|\.\.)')),
  file_name text check (file_name is null or char_length(file_name) between 1 and 200),
  mime_type text check (mime_type is null or mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp',
    'application/hwp+zip', 'application/vnd.hancom.hwpx',
    'image/jpeg', 'image/png', 'image/webp', 'text/plain')),
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 20971520),
  status text not null default 'draft' check (status in ('draft', 'published')),
  position integer not null default 0 check (position >= 0),
  version integer not null default 1 check (version >= 1),
  updated_by uuid references auth.users (id) on delete set null,
  updated_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 종류별 필수 칸 (link는 주소만, file은 파일 칸만)
  constraint week_materials_kind_fields check (
    (kind = 'link' and url is not null and storage_path is null and file_name is null and mime_type is null and size_bytes is null)
    or (kind = 'file' and url is null and storage_path is not null and file_name is not null and mime_type is not null and size_bytes is not null)
  )
);

create index if not exists week_materials_course_week_idx on public.week_materials (course_id, week, position);

drop trigger if exists week_materials_set_updated_at on public.week_materials;
create trigger week_materials_set_updated_at
  before update on public.week_materials
  for each row execute function public.set_updated_at();

/* ───────── 2) 테이블 권한 · 읽기 RPC ───────── */

-- RLS는 켜 두고 anon·authenticated용 정책은 만들지 않는다. 테이블 권한도 주지 않는다. (직접 조회 불가 — 열 단위 노출도 없음)
alter table public.week_materials enable row level security;
-- 새 테이블의 기본 권한(Supabase 기본: anon·authenticated·service_role 모두 ALL)을 지우고 서버(service_role)에만 준다.
revoke all on table public.week_materials from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.week_materials to service_role;
-- 이전 초안(authenticated SELECT 정책)이 남아 있으면 정리한다.
drop policy if exists week_materials_select_readable on public.week_materials;
drop function if exists public.can_read_week_material(text, text);

-- 비공개 포함 전체를 볼 수 있는 교수자: 편집 권한(운영 중 담당 분반) 또는 그 과목 분반 담당(비활성 분반만이어도)
create or replace function public._can_see_all_week_materials(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_course(p_course_id)
      or p_course_id in (
        select s.course_id from public.sections s where s.id in (select public.my_instructor_section_ids(false))
      );
$$;

-- 그 과목을 수강 중인 승인 학생 (운영·비활성 과목, 기존 자료 과목 제외 — my_enrolled_section_ids 기준)
create or replace function public._is_week_material_learner(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sections s
     where s.course_id = p_course_id
       and s.id in (select public.my_enrolled_section_ids())
  );
$$;

/*
 * 과목 보충 자료 목록 (로그인 사용자). 저장 경로·작성자 id·버전은 누구에게도 보내지 않는다.
 * - 교수자(_can_see_all_week_materials): 비공개 포함 전체 + 마지막 수정자 표시
 * - 수강 학생: published만, 마지막 수정자 표시는 null
 * - 그 밖: 빈 결과
 */
create or replace function public.list_week_materials(p_course_id text)
-- 결과 열 이름은 함수 인자 이름 규칙을 따른다. position은 PostgreSQL 키워드(col_name_keyword)라
-- 테이블 열 이름으로는 되지만 함수 인자·결과 열 이름으로는 따옴표가 필요하다. (응답 JSON 키는 그대로 position)
returns table (
  id text, course_id text, week integer, kind text, title text, description text, url text,
  file_name text, mime_type text, size_bytes bigint, status text, "position" integer,
  created_at timestamptz, updated_at timestamptz, updated_by_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_all boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  v_all := public._can_see_all_week_materials(p_course_id);
  if not v_all and not public._is_week_material_learner(p_course_id) then
    return;
  end if;
  return query
    select m.id, m.course_id, m.week, m.kind, m.title, m.description, m.url,
           m.file_name, m.mime_type, m.size_bytes, m.status, m.position,
           m.created_at, m.updated_at,
           case when v_all then m.updated_by_label end
      from public.week_materials m
     where m.course_id = p_course_id
       and (v_all or m.status = 'published')
     order by m.week, m.position, m.created_at, m.id;
end;
$$;

/* ───────── 3) 쓰기 RPC ───────── */

-- 입력 검사 (링크 자료). 화면·Express(src/content/materialRules.ts, server/weekMaterials.ts)와 같은 규칙
create or replace function public._material_text(p_value jsonb, p_label text, p_max integer, p_required boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    v := '';
  elsif jsonb_typeof(p_value) <> 'string' then
    raise exception '% 형식이 올바르지 않아요.', p_label using errcode = '22023';
  else
    v := btrim(p_value #>> '{}');
  end if;
  if p_required and v = '' then
    raise exception '%을 입력해 주세요.', p_label using errcode = '22023';
  end if;
  if char_length(v) > p_max then
    raise exception '%은 %자까지 입력할 수 있어요.', p_label, p_max using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public._material_url(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if jsonb_typeof(p_value) is distinct from 'string' then
    raise exception 'https://로 시작하는 올바른 링크 주소를 입력해 주세요.' using errcode = '22023';
  end if;
  v := btrim(p_value #>> '{}');
  if char_length(v) > 2000 or v !~ '^https://[^\s/?#@:]+\.[^\s/?#@]+' or v ~ '\s' then
    raise exception 'https://로 시작하는 올바른 링크 주소를 입력해 주세요.' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- 한 주차 자료의 순서를 0부터 다시 매긴다 (삭제·주차 이동 뒤)
create or replace function public._renumber_week_materials(p_course_id text, p_week integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.week_materials m
     set position = r.rn - 1
    from (
      select id, row_number() over (order by position, created_at, id) as rn
        from public.week_materials
       where course_id = p_course_id and week = p_week
    ) r
   where m.id = r.id and m.position <> r.rn - 1;
$$;

/*
 * 링크 자료 저장 (공통). p_material_id가 null이면 새 자료(p_course_id 필수), 아니면 그 자료의 보낸 칸만 바꾼다.
 * p_input: { week, title, description, url, status } — 새 자료는 week·title·url 필수, status 기본 draft.
 * 과목 잠금(lesson_course_lock_key)으로 주차 수 변경(admin_update_course)·같은 과목의 다른 자료 저장과 순서대로 처리한다.
 * 오류: 42501 권한 없음 / P0002 과목·자료 없음 / 22023 입력 오류 / 23505 주차당 개수 초과
 */
create or replace function public._save_week_material(
  p_course_id text,
  p_material_id text,
  p_input jsonb,
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
  v_old public.week_materials;
  v_course public.courses;
  v_course_id text;
  v_week integer;
  v_status text;
  v_saved public.week_materials;
  v_moving boolean := false;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception '자료 정보 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_input ?| array['id', 'courseId', 'position', 'storagePath', 'fileName', 'mimeType', 'sizeBytes'] then
    raise exception 'id·과목·순서·파일 칸은 서버가 정해요.' using errcode = '22023';
  end if;
  if p_input ? 'kind' and p_input ->> 'kind' is distinct from 'link' then
    raise exception '지금은 링크 자료만 저장할 수 있어요.' using errcode = '22023';
  end if;

  if p_material_id is null then
    v_course_id := p_course_id;
  else
    select course_id into v_course_id from public.week_materials where id = p_material_id;
    if not found then
      raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
    end if;
  end if;
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

  if p_material_id is not null then
    select * into v_old from public.week_materials where id = p_material_id for update;
    if not found then
      raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
    end if;
    if v_old.kind <> 'link' and (p_input ? 'url') then
      raise exception '파일 자료에는 링크 주소를 넣을 수 없어요.' using errcode = '22023';
    end if;
  elsif not (p_input ? 'week' and p_input ? 'title' and p_input ? 'url') then
    raise exception '주차·자료 제목·링크 주소를 입력해 주세요.' using errcode = '22023';
  end if;

  if p_input ? 'week' then
    if jsonb_typeof(p_input -> 'week') is distinct from 'number' or (p_input ->> 'week') !~ '^[0-9]{1,2}$' then
      raise exception '주차는 정수로 입력해 주세요.' using errcode = '22023';
    end if;
    v_week := (p_input ->> 'week')::integer;
  else
    v_week := v_old.week;
  end if;
  if v_week < 1 or v_week > v_course.week_count then
    raise exception '주차는 1~%주차 중에서 골라 주세요.', v_course.week_count using errcode = '22023';
  end if;
  v_status := coalesce(p_input ->> 'status', case when p_material_id is null then 'draft' else v_old.status end);
  if v_status not in ('draft', 'published') then
    raise exception '공개 상태는 공개(published) 또는 비공개(draft)만 고를 수 있어요.' using errcode = '22023';
  end if;
  if p_material_id is not null and not (p_input ?| array['week', 'title', 'description', 'url', 'status']) then
    raise exception '바꿀 내용이 없어요.' using errcode = '22023';
  end if;

  v_moving := p_material_id is null or v_week <> v_old.week;
  if v_moving and (select count(*) from public.week_materials where course_id = v_course_id and week = v_week) >= 20 then
    raise exception '한 주차에는 자료를 20개까지 등록할 수 있어요.' using errcode = '23505';
  end if;

  if p_material_id is null then
    insert into public.week_materials (
      id, course_id, week, kind, title, description, url, status, position, version, updated_by, updated_by_label
    ) values (
      'material-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      v_course_id, v_week, 'link',
      public._material_text(p_input -> 'title', '자료 제목', 100, true),
      public._material_text(p_input -> 'description', '설명', 500, false),
      public._material_url(p_input -> 'url'),
      v_status,
      coalesce((select max(position) + 1 from public.week_materials where course_id = v_course_id and week = v_week), 0),
      1, p_actor, p_actor_label
    )
    returning * into v_saved;
  else
    update public.week_materials
       set week = v_week,
           title = case when p_input ? 'title' then public._material_text(p_input -> 'title', '자료 제목', 100, true) else title end,
           description = case when p_input ? 'description' then public._material_text(p_input -> 'description', '설명', 500, false) else description end,
           url = case when p_input ? 'url' then public._material_url(p_input -> 'url') else url end,
           status = v_status,
           position = case when v_moving
                           then coalesce((select max(x.position) + 1 from public.week_materials x
                                           where x.course_id = v_course_id and x.week = v_week and x.id <> v_old.id), 0)
                           else position end,
           version = version + 1,
           updated_by = p_actor,
           updated_by_label = p_actor_label
     where id = v_old.id
    returning * into v_saved;
    if v_moving then
      perform public._renumber_week_materials(v_course_id, v_old.week);
    end if;
  end if;
  return v_saved;
end;
$$;

-- 자료 삭제 (공통). 지운 행을 돌려준다 — 3-C에서 파일 자료면 서버가 그 storage_path의 객체를 지운다.
create or replace function public._delete_week_material(p_material_id text, p_is_admin boolean)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id text;
  v_old public.week_materials;
begin
  select course_id into v_course_id from public.week_materials where id = p_material_id;
  if not found then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id));
  if not p_is_admin and not public.can_manage_course(v_course_id) then
    raise exception '담당 강의의 자료만 삭제할 수 있어요.' using errcode = '42501';
  end if;
  delete from public.week_materials where id = p_material_id returning * into v_old;
  if not found then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  perform public._renumber_week_materials(v_old.course_id, v_old.week);
  return v_old;
end;
$$;

-- 한 주차의 순서 변경 (공통). p_ids는 그 주차 자료 id 전체를 새 순서로 (빠지거나 겹치면 23505)
create or replace function public._reorder_week_materials(p_course_id text, p_week integer, p_ids text[], p_is_admin boolean)
returns setof public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text[];
begin
  if not exists (select 1 from public.courses where id = p_course_id) then
    raise exception '강의를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(p_course_id));
  if not p_is_admin and not public.can_manage_course(p_course_id) then
    raise exception '담당 강의의 자료만 정렬할 수 있어요.' using errcode = '42501';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_current
    from public.week_materials where course_id = p_course_id and week = p_week;
  if p_ids is null
     or cardinality(p_ids) <> cardinality(v_current)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x) is distinct from v_current then
    raise exception '그 주차의 자료 목록이 바뀌었어요. 새로고침한 뒤 다시 정렬해 주세요.' using errcode = '23505';
  end if;
  update public.week_materials m
     set position = o.n - 1
    from unnest(p_ids) with ordinality as o(id, n)
   where m.id = o.id and m.position <> o.n - 1;
  return query
    select * from public.week_materials where course_id = p_course_id and week = p_week order by position;
end;
$$;

-- 교수자 저장 (로그인한 교수자만, 권한은 공통 함수가 can_manage_course로 확인)
create or replace function public._material_actor_label()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(i.display_name), ''), nullif(btrim(p.name), ''), i.email)
    from public.instructors i
    left join public.profiles p on p.id = i.user_id
   where i.user_id = (select auth.uid())
   order by i.email
   limit 1;
$$;

create or replace function public.save_week_material(p_course_id text, p_material_id text, p_input jsonb)
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
  return public._save_week_material(p_course_id, p_material_id, p_input, v_uid, v_label, false);
end;
$$;

create or replace function public.delete_week_material(p_material_id text)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if public._material_actor_label() is null then
    raise exception '교수자만 자료를 삭제할 수 있어요.' using errcode = '42501';
  end if;
  return public._delete_week_material(p_material_id, false);
end;
$$;

create or replace function public.reorder_week_materials(p_course_id text, p_week integer, p_ids text[])
returns setof public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if public._material_actor_label() is null then
    raise exception '교수자만 자료를 정렬할 수 있어요.' using errcode = '42501';
  end if;
  return query select * from public._reorder_week_materials(p_course_id, p_week, p_ids, false);
end;
$$;

-- 관리자 (service_role 전용, 기존 자료 과목 포함)
create or replace function public.admin_save_week_material(p_course_id text, p_material_id text, p_input jsonb, p_admin_label text default null)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._save_week_material(p_course_id, p_material_id, p_input, null, coalesce(nullif(btrim(p_admin_label), ''), '관리자'), true);
end;
$$;

create or replace function public.admin_delete_week_material(p_material_id text)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._delete_week_material(p_material_id, true);
end;
$$;

create or replace function public.admin_reorder_week_materials(p_course_id text, p_week integer, p_ids text[])
returns setof public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public._reorder_week_materials(p_course_id, p_week, p_ids, true);
end;
$$;

/* ───────── 4) 과목 주차 수 축소: 보충 자료 주차도 지킨다 (E1 함수에서 하한 계산만 바뀜) ───────── */

/*
 * 과목 수정: null이 아닌 칸만 바꾼다. id는 바꿀 수 없고, 기존 자료(legacy) 과목은 바꾸지 않는다.
 * 상태는 active ↔ inactive만. 주차 수는 그 과목 학습자료(준비 중 포함)·학습 기록·보충 자료(비공개 포함)의 가장 큰 주차보다 작게 줄일 수 없다.
 * 오류: P0002 없는 과목 / 42501 기존 자료 과목 / P0001 입력 오류 / 23514 주차 축소 불가
 */
create or replace function public.admin_update_course(
  p_course_id text,
  p_title text default null,
  p_drama text default null,
  p_context text default null,
  p_description text default null,
  p_week_count integer default null,
  p_status text default null
)
returns public.courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.courses;
  v_min integer;
begin
  if p_title is null and p_drama is null and p_context is null and p_description is null
     and p_week_count is null and p_status is null then
    raise exception '바꿀 내용이 없어요.' using errcode = 'P0001';
  end if;
  -- 학습자료 저장(_save_lesson)과 같은 과목 잠금: 주차 수 검사와 새 학습자료 저장이 겹치지 않게
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(p_course_id));
  select * into c from public.courses where id = p_course_id for update;
  if not found then
    raise exception '과목을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if c.status = 'legacy' then
    raise exception '기존 자료 과목은 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('active', 'inactive') then
    raise exception '과목 상태는 운영 중(active) 또는 비활성(inactive)만 고를 수 있어요.' using errcode = 'P0001';
  end if;
  if p_week_count is not null then
    if p_week_count < 1 or p_week_count > 30 then
      raise exception '주차 수는 1~30 사이의 정수로 입력해 주세요.' using errcode = 'P0001';
    end if;
    if p_week_count < c.week_count then
      select greatest(
               coalesce((select max(l.week) from public.lessons l where l.course_id = c.id), 0),
               coalesce((select max(p.week) from public.lesson_progress p join public.lessons l on l.id = p.lesson_id where l.course_id = c.id), 0),
               coalesce((select max(m.week) from public.week_materials m where m.course_id = c.id), 0)
             )
        into v_min;
      if p_week_count < v_min then
        raise exception '%주차까지 학습자료나 학습 기록이 있어 %주보다 적게 줄일 수 없어요.', v_min, v_min using errcode = '23514';
      end if;
    end if;
  end if;

  update public.courses
     set title = case when p_title is null then title else public._course_text(p_title, '과목명', 60, true) end,
         drama = case when p_drama is null then drama else public._course_text(p_drama, '드라마명', 60, false) end,
         context = case when p_context is null then context else public._course_text(p_context, '학습 맥락', 200, false) end,
         description = case when p_description is null then description else public._course_text(p_description, '설명', 500, false) end,
         week_count = coalesce(p_week_count, week_count),
         status = coalesce(p_status, status)
   where id = c.id
  returning * into c;
  return c;
end;
$$;

/* ───────── 권한 ───────── */

-- 모든 함수에서 기본 실행 권한(Supabase 기본: public·anon·authenticated·service_role)을 먼저 지우고, 필요한 역할에만 다시 준다.
-- 함수 생성과 같은 트랜잭션 안이라, 권한을 지우기 전 상태가 다른 세션에 보이는 순간이 없다.
revoke all on function public.list_week_materials(text) from public, anon, authenticated, service_role;
revoke all on function public._can_see_all_week_materials(text) from public, anon, authenticated, service_role;
revoke all on function public._is_week_material_learner(text) from public, anon, authenticated, service_role;
revoke all on function public._material_text(jsonb, text, integer, boolean) from public, anon, authenticated, service_role;
revoke all on function public._material_url(jsonb) from public, anon, authenticated, service_role;
revoke all on function public._renumber_week_materials(text, integer) from public, anon, authenticated, service_role;
revoke all on function public._save_week_material(text, text, jsonb, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public._delete_week_material(text, boolean) from public, anon, authenticated, service_role;
revoke all on function public._reorder_week_materials(text, integer, text[], boolean) from public, anon, authenticated, service_role;
revoke all on function public._material_actor_label() from public, anon, authenticated, service_role;
revoke all on function public.save_week_material(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.delete_week_material(text) from public, anon, authenticated, service_role;
revoke all on function public.reorder_week_materials(text, integer, text[]) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_week_material(text, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_delete_week_material(text) from public, anon, authenticated, service_role;
revoke all on function public.admin_reorder_week_materials(text, integer, text[]) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_course(text, text, text, text, text, integer, text) from public, anon, authenticated, service_role;

-- 로그인 사용자(교수자·학생): 목록 RPC와 교수자 쓰기 RPC만 (교수자 여부·권한은 함수 안에서 확인)
grant execute on function public.list_week_materials(text) to authenticated;
grant execute on function public.save_week_material(text, text, jsonb) to authenticated;
grant execute on function public.delete_week_material(text) to authenticated;
grant execute on function public.reorder_week_materials(text, integer, text[]) to authenticated;
-- 서버(service_role): 관리자 RPC와 과목 수정
grant execute on function public.admin_save_week_material(text, text, jsonb, text) to service_role;
grant execute on function public.admin_delete_week_material(text) to service_role;
grant execute on function public.admin_reorder_week_materials(text, integer, text[]) to service_role;
grant execute on function public.admin_update_course(text, text, text, text, text, integer, text) to service_role;

commit;

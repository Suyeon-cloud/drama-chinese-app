-- Phase 5-B: 자동 생성 복습 HTML의 출처(원본 강의) 연결 · 강의당 1개 · 재생성
--
-- 기존 행은 바꾸거나 지우지 않는다(새 칸은 모두 NULL). 3-B·3-C·4단계 목록·열기 함수는 바꾸지 않는다.
--   1) week_materials 출처 칸: source_kind('lesson-review') · source_lesson_id(→ lessons, 강의 삭제 시 NULL) · source_lesson_updated_at
--      출처는 HTML 자료에만. 같은 과목에서 같은 강의로 만든 복습 HTML은 하나만 (고유 인덱스, 강의가 지워진 행은 제외).
--   2) _save_week_material_html 본문만 바꾼다 (시그니처·권한 그대로):
--      p_input.source = { kind:'lesson-review', lessonId, lessonUpdatedAt } → 등록 시 강의 존재·같은 과목·원본 수정 시각 일치를 확인하고 기록
--      p_input.source = { lessonUpdatedAt } → 재생성(수정) 시 원래 연결된 강의만, 원본 수정 시각 일치 확인 뒤 시각 갱신
--      직접 만든 HTML(출처 없음)에는 출처를 붙일 수 없다. 출처가 없으면 4단계와 똑같이 동작한다.
--   3) list_week_material_sources (authenticated): 그 과목 자료를 비공개 포함 볼 수 있는 교수자에게만 출처를 돌려준다.
--      학생 목록 RPC(list_week_materials)는 그대로라 출처를 보내지 않는다.
--
-- 트랜잭션: 파일 전체가 begin … commit 한 트랜잭션이다. 중간에 실패하면 전부 취소된다.
-- 재실행: [0] 사전 확인이 기존 객체가 예상과 같은지 본다. 다르면 아무것도 바꾸지 않고 멈춘다.

begin;

/* ───────── 0) 사전 확인 ───────── */

do $pre$
declare
  v_actual text;
begin
  -- 이 파일이 쓰는 기존 객체 (D1·3-B·4단계)
  if to_regclass('public.lessons') is null
     or to_regprocedure('public._save_week_material_html(text,text,jsonb,text,uuid,text,boolean)') is null
     or to_regprocedure('public._save_week_material(text,text,jsonb,uuid,text,boolean)') is null
     or to_regprocedure('public._material_html_ok(text)') is null
     or to_regprocedure('public._can_see_all_week_materials(text)') is null
     or to_regprocedure('public.can_manage_course(text)') is null
     or to_regprocedure('public.lesson_course_lock_key(text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'week_materials' and column_name = 'html_body') then
    raise exception '5B_PREFLIGHT: 4단계 객체(html_body·HTML 저장 함수) 또는 lessons가 없어요.';
  end if;

  -- 참조할 lessons 칸 형식
  select string_agg(column_name || ':' || data_type, ',' order by column_name) into v_actual
    from information_schema.columns
   where table_schema = 'public' and table_name = 'lessons' and column_name in ('id', 'course_id', 'updated_at');
  if v_actual is distinct from 'course_id:text,id:text,updated_at:timestamp with time zone' then
    raise exception '5B_PREFLIGHT: lessons의 id·course_id·updated_at 형식이 예상과 달라요. (%)', v_actual;
  end if;

  -- 출처 칸이 이미 있으면 형식이 같아야 한다
  select string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' order by column_name) into v_actual
    from information_schema.columns
   where table_schema = 'public' and table_name = 'week_materials'
     and column_name in ('source_kind', 'source_lesson_id', 'source_lesson_updated_at');
  if v_actual is not null
     and v_actual <> 'source_kind:text:YES,source_lesson_id:text:YES,source_lesson_updated_at:timestamp with time zone:YES' then
    raise exception '5B_PREFLIGHT: 이미 있는 출처 칸의 형식이 예상과 달라요. (%)', v_actual;
  end if;

  -- 테이블 정책이 생기지 않았어야 한다 (3-B부터 정책 없음)
  select string_agg(policyname, ',') into v_actual from pg_policies where schemaname = 'public' and tablename = 'week_materials';
  if v_actual is not null then
    raise exception '5B_PREFLIGHT: week_materials에 예상하지 않은 RLS 정책이 있어요. (%)', v_actual;
  end if;

  -- 같은 이름의 다른 함수(오버로드)가 있으면 멈춘다
  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('list_week_material_sources', '_save_week_material_html')
     and p.oid <> all (array_remove(array[
       to_regprocedure('public.list_week_material_sources(text)'),
       to_regprocedure('public._save_week_material_html(text,text,jsonb,text,uuid,text,boolean)')
     ]::oid[], null));
  if v_actual is not null then
    raise exception '5B_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;
end;
$pre$;

/* ───────── 1) 출처 칸·제약 ───────── */

alter table public.week_materials add column if not exists source_kind text;
alter table public.week_materials add column if not exists source_lesson_id text;
alter table public.week_materials add column if not exists source_lesson_updated_at timestamptz;

-- 원본 강의가 지워지면 복습 자료는 남기고 연결만 끊는다
alter table public.week_materials drop constraint if exists week_materials_source_lesson_id_fkey;
alter table public.week_materials add constraint week_materials_source_lesson_id_fkey
  foreign key (source_lesson_id) references public.lessons (id) on delete set null;

-- 출처는 HTML 자료에만, 셋이 함께 (강의가 지워진 행은 source_lesson_id만 NULL)
alter table public.week_materials drop constraint if exists week_materials_source_fields;
alter table public.week_materials add constraint week_materials_source_fields check (
  (source_kind is null and source_lesson_id is null and source_lesson_updated_at is null)
  or (source_kind = 'lesson-review' and kind = 'html' and source_lesson_updated_at is not null)
);

-- 같은 과목에서 같은 강의로 만든 복습 HTML은 하나만
create unique index if not exists week_materials_review_source_uniq
  on public.week_materials (course_id, source_kind, source_lesson_id)
  where source_lesson_id is not null;

/* ───────── 2) HTML 저장 함수 (본문만 교체, 시그니처·권한 그대로) ───────── */

/*
 * HTML 자료 저장 (공통). p_material_id가 null이면 새 자료(p_course_id·p_html 필수), 아니면 그 HTML 자료를 바꾼다.
 * p_input: { week, title, description, status, source? } — 새 자료는 week·title 필수, status 기본 draft. 수정은 보낸 칸만.
 *   source (5-B, 선택): 등록 { kind:'lesson-review', lessonId, lessonUpdatedAt } / 재생성 { lessonUpdatedAt }
 *   lessonUpdatedAt은 화면이 HTML을 만든 원본 강의의 수정 시각 — 지금 강의 시각과 다르면(그사이 수정됨) 거부한다.
 * p_html: 본문 (수정에서 null이면 오류)
 * 오류: 42501 권한 없음 / P0002 과목·자료 없음 / 22023 입력 오류·HTML이 아닌 자료·출처 오류
 *       23505 주차당 개수 초과·이 강의의 복습 자료가 이미 있음 / 40001 원본 강의가 그사이 수정됨
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
  v_source jsonb;
  v_lesson public.lessons;
  v_lesson_time timestamptz;
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
  v_source := p_input -> 'source';
  if v_source is not null then
    if jsonb_typeof(v_source) <> 'object' or jsonb_typeof(v_source -> 'lessonUpdatedAt') is distinct from 'string' then
      raise exception '출처 정보 형식이 올바르지 않아요.' using errcode = '22023';
    end if;
    begin
      v_lesson_time := (v_source ->> 'lessonUpdatedAt')::timestamptz;
    exception when others then
      raise exception '출처의 원본 수정 시각 형식이 올바르지 않아요.' using errcode = '22023';
    end;
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
    -- 출처: 같은 과목의 강의, 화면이 만든 시점의 원본과 같은지, 이 강의의 복습 자료가 이미 있는지
    if v_source is not null then
      if v_source ->> 'kind' is distinct from 'lesson-review' or jsonb_typeof(v_source -> 'lessonId') is distinct from 'string' then
        raise exception '출처 정보 형식이 올바르지 않아요.' using errcode = '22023';
      end if;
      select * into v_lesson from public.lessons where id = v_source ->> 'lessonId';
      if not found or v_lesson.course_id is distinct from v_course_id then
        raise exception '같은 과목의 강의에서 만든 복습 자료만 연결할 수 있어요.' using errcode = '22023';
      end if;
      if date_trunc('milliseconds', v_lesson.updated_at) <> date_trunc('milliseconds', v_lesson_time) then
        raise exception '원본 강의가 그사이 수정됐어요. 복습 HTML을 다시 만들어 주세요.' using errcode = '40001';
      end if;
      if exists (select 1 from public.week_materials m
                  where m.course_id = v_course_id and m.source_kind = 'lesson-review' and m.source_lesson_id = v_lesson.id) then
        raise exception '이 강의의 복습 자료가 이미 있어요.' using errcode = '23505';
      end if;
    end if;
    if (select count(*) from public.week_materials where course_id = v_course_id and week = v_week) >= 20 then
      raise exception '한 주차에는 자료를 20개까지 등록할 수 있어요.' using errcode = '23505';
    end if;
    insert into public.week_materials (
      id, course_id, week, kind, title, description, url, html_body, status, position, version, updated_by, updated_by_label,
      source_kind, source_lesson_id, source_lesson_updated_at
    ) values (
      'material-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      v_course_id, v_week, 'html',
      public._material_text(p_input -> 'title', '자료 제목', 100, true),
      public._material_text(p_input -> 'description', '설명', 500, false),
      null, p_html, v_status,
      coalesce((select max(m.position) + 1 from public.week_materials m where m.course_id = v_course_id and m.week = v_week), 0),
      1, p_actor, p_actor_label,
      case when v_source is not null then 'lesson-review' end,
      case when v_source is not null then v_lesson.id end,
      case when v_source is not null then v_lesson.updated_at end
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
  -- 재생성: 원래 연결된 강의만 (직접 만든 HTML에는 출처를 붙이지 않는다, 원본이 지워졌으면 재생성 불가)
  if v_source is not null then
    if v_old.source_kind is null then
      raise exception '직접 만든 HTML 자료에는 출처를 연결할 수 없어요.' using errcode = '22023';
    end if;
    if v_old.source_lesson_id is null then
      raise exception '원본 강의가 삭제되어 다시 만들 수 없어요. 자료는 그대로 남아 있어요.' using errcode = '22023';
    end if;
    if v_source ? 'lessonId' and v_source ->> 'lessonId' is distinct from v_old.source_lesson_id then
      raise exception '다른 강의의 복습 자료로 바꿀 수 없어요.' using errcode = '22023';
    end if;
    select * into v_lesson from public.lessons where id = v_old.source_lesson_id;
    if not found or v_lesson.course_id is distinct from v_course_id then
      raise exception '원본 강의를 찾을 수 없어 다시 만들 수 없어요.' using errcode = '22023';
    end if;
    if date_trunc('milliseconds', v_lesson.updated_at) <> date_trunc('milliseconds', v_lesson_time) then
      raise exception '원본 강의가 그사이 수정됐어요. 복습 HTML을 다시 만들어 주세요.' using errcode = '40001';
    end if;
  end if;
  -- 주차·제목·설명·공개는 기존 저장 함수가 검사·이동·순서 정리까지 한다 (같은 트랜잭션)
  if p_input ?| array['week', 'title', 'description', 'status'] then
    perform public._save_week_material(null, p_material_id, p_input, p_actor, p_actor_label, p_is_admin);
  end if;
  update public.week_materials
     set html_body = p_html,
         source_lesson_updated_at = case when v_source is not null then v_lesson.updated_at else source_lesson_updated_at end,
         version = version + 1,
         updated_by = p_actor,
         updated_by_label = p_actor_label
   where id = p_material_id
  returning * into v_saved;
  return v_saved;
end;
$$;

/* ───────── 3) 교수자 전용 출처 조회 ───────── */

/*
 * 그 과목 자료의 출처 (자동 생성 복습 HTML만). 비공개 포함 열람 권한(_can_see_all_week_materials)이 있는 교수자만.
 * 학생·권한 없는 사용자: 42501. 원본 강의가 지워진 자료는 source_lesson_id가 NULL.
 */
create or replace function public.list_week_material_sources(p_course_id text)
returns table (material_id text, source_kind text, source_lesson_id text, source_lesson_updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public._can_see_all_week_materials(p_course_id) then
    raise exception '담당 강의의 자료 출처만 볼 수 있어요.' using errcode = '42501';
  end if;
  return query
    select m.id, m.source_kind, m.source_lesson_id, m.source_lesson_updated_at
      from public.week_materials m
     where m.course_id = p_course_id and m.source_kind is not null
     order by m.week, m.position;
end;
$$;

/* ───────── 권한 ───────── */

-- _save_week_material_html은 create or replace라 4단계 권한(아무에게도 없음)이 유지되지만 한 번 더 확인해 둔다
revoke all on function public._save_week_material_html(text, text, jsonb, text, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.list_week_material_sources(text) from public, anon, authenticated, service_role;
grant execute on function public.list_week_material_sources(text) to authenticated;

commit;

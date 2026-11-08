-- Phase 6-A: 실시간 수업용 퀴즈 문제 세트 (생성·편집·저장만. 진행·응답·집계는 6-B)
--
-- 새 테이블만 추가한다. 기존 테이블·행(lessons·week_materials·lesson_progress 등)과 기존 함수는 바꾸지 않는다.
--   1) live_quiz_sets (과목 + 주차, 선택한 강의자료) · live_quiz_questions (세트의 문제, 보기 2~6개)
--      norm_key: DB가 직접 계산하는 완전 중복 판정 키 (문장 정규화 + 보기 집합, 보기 순서 무시).
--      같은 과목의 실시간 문제끼리 완전 중복이면 저장 거부 (고유 인덱스). 비슷한 문제 경고는 화면이 한다.
--   2) 테이블 직접 권한 없음 (RLS 켜짐, 정책 없음, anon·authenticated 권한 없음). RPC로만:
--      교수자: list_live_quiz_sets (비공개 포함 열람 권한) · save_live_quiz_set · delete_live_quiz_set (can_manage_course)
--      관리자(service_role): admin_list_live_quiz_sets · admin_save_live_quiz_set · admin_delete_live_quiz_set
--      내부: _live_quiz_norm · _live_quiz_sets_json · _save_live_quiz_set · _delete_live_quiz_set (아무도 실행 불가)
--   3) 동시 편집: 수정은 편집을 시작한 version이 맞아야 저장된다 (다르면 40001 → 409)
--
-- 트랜잭션: 파일 전체가 begin … commit 한 트랜잭션이다. 중간에 실패하면 전부 취소된다.
-- 재실행: [0] 사전 확인이 기존 객체가 예상과 같은지 본다. 다르면 아무것도 바꾸지 않고 멈춘다.

begin;

/* ───────── 0) 사전 확인 ───────── */

do $pre$
declare
  v_actual text;
begin
  if to_regclass('public.courses') is null
     or to_regclass('public.lessons') is null
     or to_regprocedure('public.can_manage_course(text)') is null
     or to_regprocedure('public._can_see_all_week_materials(text)') is null
     or to_regprocedure('public._material_actor_label()') is null
     or to_regprocedure('public.lesson_course_lock_key(text)') is null
     or to_regprocedure('public.set_updated_at()') is null then
    raise exception '6A_PREFLIGHT: 의존 객체(courses·lessons·권한 함수·과목 잠금·set_updated_at)가 없어요.';
  end if;

  -- 테이블이 이미 있으면 데이터가 없어야 한다 (이전 시도의 흔적이면 사람이 확인)
  if to_regclass('public.live_quiz_sets') is not null then
    execute 'select string_agg(column_name, '','' order by ordinal_position) from information_schema.columns where table_schema = ''public'' and table_name = ''live_quiz_sets''' into v_actual;
    if v_actual is distinct from 'id,course_id,week,lesson_id,title,status,version,created_by,updated_by,updated_by_label,created_at,updated_at' then
      raise exception '6A_PREFLIGHT: 이미 있는 live_quiz_sets의 열이 예상과 달라요. (%)', v_actual;
    end if;
  end if;
  if to_regclass('public.live_quiz_questions') is not null then
    execute 'select string_agg(column_name, '','' order by ordinal_position) from information_schema.columns where table_schema = ''public'' and table_name = ''live_quiz_questions''' into v_actual;
    if v_actual is distinct from 'id,set_id,course_id,position,question,options,answer,explanation,origin,norm_key,created_at' then
      raise exception '6A_PREFLIGHT: 이미 있는 live_quiz_questions의 열이 예상과 달라요. (%)', v_actual;
    end if;
  end if;

  -- 정책이 생기지 않았어야 한다
  select string_agg(tablename || ':' || policyname, ',') into v_actual
    from pg_policies where schemaname = 'public' and tablename in ('live_quiz_sets', 'live_quiz_questions');
  if v_actual is not null then
    raise exception '6A_PREFLIGHT: 실시간 퀴즈 테이블에 예상하지 않은 RLS 정책이 있어요. (%)', v_actual;
  end if;

  -- 같은 이름의 다른 함수(오버로드)가 있으면 멈춘다
  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_live_quiz_norm', '_live_quiz_sets_json', '_save_live_quiz_set', '_delete_live_quiz_set',
                       'list_live_quiz_sets', 'save_live_quiz_set', 'delete_live_quiz_set',
                       'admin_list_live_quiz_sets', 'admin_save_live_quiz_set', 'admin_delete_live_quiz_set')
     and p.oid <> all (array_remove(array[
       to_regprocedure('public._live_quiz_norm(text)'),
       to_regprocedure('public._live_quiz_sets_json(text)'),
       to_regprocedure('public._save_live_quiz_set(text,text,jsonb,integer,uuid,text,boolean)'),
       to_regprocedure('public._delete_live_quiz_set(text,boolean)'),
       to_regprocedure('public.list_live_quiz_sets(text)'),
       to_regprocedure('public.save_live_quiz_set(text,text,jsonb,integer)'),
       to_regprocedure('public.delete_live_quiz_set(text)'),
       to_regprocedure('public.admin_list_live_quiz_sets(text)'),
       to_regprocedure('public.admin_save_live_quiz_set(text,text,jsonb,integer,text)'),
       to_regprocedure('public.admin_delete_live_quiz_set(text)')
     ]::oid[], null));
  if v_actual is not null then
    raise exception '6A_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;
end;
$pre$;

/* ───────── 1) 테이블 ───────── */

create table if not exists public.live_quiz_sets (
  id text primary key check (id ~ '^livequiz-[a-z0-9]{6,32}$'),
  course_id text not null references public.courses (id) on delete restrict,
  week integer not null check (week between 1 and 30),
  -- 문제를 만든 강의자료 (선택). 강의자료가 지워지면 연결만 끊는다
  lesson_id text references public.lessons (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  status text not null default 'draft' check (status in ('draft', 'ready')),
  version integer not null default 1 check (version >= 1),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_quiz_sets_course_week_idx on public.live_quiz_sets (course_id, week);

create table if not exists public.live_quiz_questions (
  id text primary key check (id ~ '^lq-[a-z0-9]{6,32}$'),
  set_id text not null references public.live_quiz_sets (id) on delete cascade,
  -- 같은 과목 안 중복 검사용 (세트의 과목과 같아야 한다 — 저장 함수가 넣는다)
  course_id text not null references public.courses (id) on delete restrict,
  position integer not null check (position between 0 and 29),
  question text not null check (char_length(btrim(question)) between 1 and 300),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  answer integer not null check (answer >= 0 and answer < 6),
  explanation text not null default '' check (char_length(explanation) <= 500),
  origin text not null default 'manual' check (origin in ('ai', 'json', 'manual')),
  norm_key text not null check (char_length(norm_key) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (answer < jsonb_array_length(options))
);
create index if not exists live_quiz_questions_set_idx on public.live_quiz_questions (set_id, position);
-- 같은 과목의 실시간 문제끼리 완전 중복 금지 (보기 순서만 다른 것 포함)
create unique index if not exists live_quiz_questions_course_norm_uniq on public.live_quiz_questions (course_id, norm_key);

drop trigger if exists live_quiz_sets_set_updated_at on public.live_quiz_sets;
create trigger live_quiz_sets_set_updated_at
  before update on public.live_quiz_sets
  for each row execute function public.set_updated_at();

alter table public.live_quiz_sets enable row level security;
alter table public.live_quiz_questions enable row level security;
revoke all on table public.live_quiz_sets from public, anon, authenticated, service_role;
revoke all on table public.live_quiz_questions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.live_quiz_sets to service_role;
grant select, insert, update, delete on table public.live_quiz_questions to service_role;

/* ───────── 2) 함수 ───────── */

-- 비교용 문장: NFKC → 소문자 → 공백·문장부호(중국어·한국어 문장부호 포함) 제거 (화면 normalizeQuizText와 같은 취지)
create or replace function public._live_quiz_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(normalize(coalesce(p, ''), NFKC), '[[:space:][:punct:]，。！？、：；“”‘’（）《》〈〉【】「」『』…·～—－]+', '', 'g'));
$$;

-- 과목의 세트 목록 (문제 포함, 화면 형태 camelCase)
create or replace function public._live_quiz_sets_json(p_course_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'courseId', s.course_id, 'week', s.week, 'lessonId', s.lesson_id, 'title', s.title,
           'status', s.status, 'version', s.version, 'createdAt', s.created_at, 'updatedAt', s.updated_at,
           'updatedByLabel', s.updated_by_label,
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', q.id, 'question', q.question, 'options', q.options, 'answer', q.answer,
                      'explanation', q.explanation, 'origin', q.origin) order by q.position)
               from public.live_quiz_questions q where q.set_id = s.id), '[]'::jsonb)
         ) order by s.week, s.created_at, s.id), '[]'::jsonb)
    from public.live_quiz_sets s
   where s.course_id = p_course_id;
$$;

/*
 * 세트 저장 (공통). p_set_id가 null이면 새 세트(p_course_id 필수), 아니면 그 세트를 p_expected_version 기준으로 통째로 바꾼다.
 * p_input: { week, lessonId?, title, status?, questions: [{ id?, question, options[], answer, explanation?, origin? }] }
 * 문제 id: 이 세트의 기존 문제 id면 유지, 아니면 새로 만든다. 문제는 지우고 다시 넣는다(같은 id 유지).
 * 오류: 42501 권한 없음 / P0002 과목·세트 없음 / 22023 입력 오류 / 23505 같은 과목에 같은 문제 / 40001 그사이 다른 저장
 */
create or replace function public._save_live_quiz_set(
  p_course_id text,
  p_set_id text,
  p_input jsonb,
  p_expected_version integer,
  p_actor uuid,
  p_actor_label text,
  p_is_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses;
  v_course_id text;
  v_old public.live_quiz_sets;
  v_set_id text;
  v_week integer;
  v_title text;
  v_status text;
  v_lesson_id text;
  v_questions jsonb;
  v_q jsonb;
  v_opts jsonb;
  v_n integer;
  v_i integer := 0;
  v_qid text;
  v_old_ids text[] := '{}';
  v_key text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception '문제 세트 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_input ?| array['id', 'courseId', 'version', 'createdAt', 'updatedAt', 'updatedByLabel'] then
    raise exception 'id·과목·버전 등은 서버가 정해요.' using errcode = '22023';
  end if;

  if p_set_id is null then
    v_course_id := p_course_id;
  else
    select course_id into v_course_id from public.live_quiz_sets where id = p_set_id;
    if not found then
      raise exception '문제 세트를 찾을 수 없어요.' using errcode = 'P0002';
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
    raise exception '담당 강의의 문제 세트만 저장할 수 있어요.' using errcode = '42501';
  end if;
  if p_set_id is not null then
    select * into v_old from public.live_quiz_sets where id = p_set_id for update;
    if p_expected_version is null or v_old.version <> p_expected_version then
      raise exception '다른 곳에서 이 문제 세트를 먼저 저장했어요. 새로고침한 뒤 다시 편집해 주세요.' using errcode = '40001';
    end if;
    select coalesce(array_agg(id), '{}') into v_old_ids from public.live_quiz_questions where set_id = p_set_id;
  end if;

  -- 세트 칸
  if jsonb_typeof(p_input -> 'week') is distinct from 'number' or (p_input ->> 'week') !~ '^[0-9]{1,2}$' then
    raise exception '주차는 정수로 입력해 주세요.' using errcode = '22023';
  end if;
  v_week := (p_input ->> 'week')::integer;
  if v_week < 1 or v_week > v_course.week_count then
    raise exception '주차는 1~%주차 중에서 골라 주세요.', v_course.week_count using errcode = '22023';
  end if;
  if jsonb_typeof(p_input -> 'title') is distinct from 'string' or char_length(btrim(p_input ->> 'title')) not between 1 and 100 then
    raise exception '세트 제목은 1~100자로 입력해 주세요.' using errcode = '22023';
  end if;
  v_title := btrim(p_input ->> 'title');
  v_status := coalesce(p_input ->> 'status', 'draft');
  if v_status not in ('draft', 'ready') then
    raise exception '상태는 작성 중(draft) 또는 준비 완료(ready)만 고를 수 있어요.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_input -> 'lessonId') = 'string' then
    v_lesson_id := p_input ->> 'lessonId';
    if not exists (select 1 from public.lessons l where l.id = v_lesson_id and l.course_id = v_course_id) then
      raise exception '같은 과목의 강의자료만 연결할 수 있어요.' using errcode = '22023';
    end if;
  elsif p_input ? 'lessonId' and jsonb_typeof(p_input -> 'lessonId') <> 'null' then
    raise exception '강의자료 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  v_questions := p_input -> 'questions';
  if jsonb_typeof(v_questions) is distinct from 'array' or jsonb_array_length(v_questions) not between 1 and 30 then
    raise exception '문제는 1~30개 넣어 주세요.' using errcode = '22023';
  end if;

  -- 세트 행
  if p_set_id is null then
    v_set_id := 'livequiz-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    insert into public.live_quiz_sets (id, course_id, week, lesson_id, title, status, version, created_by, updated_by, updated_by_label)
    values (v_set_id, v_course_id, v_week, v_lesson_id, v_title, v_status, 1, p_actor, p_actor, p_actor_label);
  else
    v_set_id := p_set_id;
    update public.live_quiz_sets
       set week = v_week, lesson_id = v_lesson_id, title = v_title, status = v_status,
           version = version + 1, updated_by = p_actor, updated_by_label = p_actor_label
     where id = v_set_id;
    delete from public.live_quiz_questions where set_id = v_set_id;
  end if;

  -- 문제 (검사 + 정규화 키는 DB가 계산)
  for v_q in select value from jsonb_array_elements(v_questions)
  loop
    v_i := v_i + 1;
    if jsonb_typeof(v_q) <> 'object'
       or jsonb_typeof(v_q -> 'question') is distinct from 'string'
       or char_length(btrim(v_q ->> 'question')) not between 1 and 300 then
      raise exception '%번 문제 문장은 1~300자로 입력해 주세요.', v_i using errcode = '22023';
    end if;
    v_opts := v_q -> 'options';
    if jsonb_typeof(v_opts) is distinct from 'array' or jsonb_array_length(v_opts) not between 2 and 6
       or exists (select 1 from jsonb_array_elements(v_opts) o
                   where jsonb_typeof(o.value) <> 'string' or char_length(btrim(o.value #>> '{}')) not between 1 and 120) then
      raise exception '%번 문제의 보기는 1~120자 글자 2~6개여야 해요.', v_i using errcode = '22023';
    end if;
    v_n := jsonb_array_length(v_opts);
    if (select count(distinct public._live_quiz_norm(o.value #>> '{}')) from jsonb_array_elements(v_opts) o) <> v_n then
      raise exception '%번 문제에 같은 보기가 있어요.', v_i using errcode = '22023';
    end if;
    if jsonb_typeof(v_q -> 'answer') is distinct from 'number' or (v_q ->> 'answer') !~ '^[0-9]$' or (v_q ->> 'answer')::integer >= v_n then
      raise exception '%번 문제의 정답을 골라 주세요.', v_i using errcode = '22023';
    end if;
    if v_q ? 'explanation' and (jsonb_typeof(v_q -> 'explanation') is distinct from 'string' or char_length(v_q ->> 'explanation') > 500) then
      raise exception '%번 문제 해설은 500자까지 입력할 수 있어요.', v_i using errcode = '22023';
    end if;
    if coalesce(v_q ->> 'origin', 'manual') not in ('ai', 'json', 'manual') then
      raise exception '%번 문제의 출처 형식이 올바르지 않아요.', v_i using errcode = '22023';
    end if;
    -- 기존 문제 id만 유지, 그 밖은 새 id
    v_qid := case when jsonb_typeof(v_q -> 'id') = 'string' and (v_q ->> 'id') = any (v_old_ids) then v_q ->> 'id'
                  else 'lq-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) end;
    v_key := public._live_quiz_norm(v_q ->> 'question') || '|' ||
             (select string_agg(k, '|' order by k) from (select public._live_quiz_norm(o.value #>> '{}') as k from jsonb_array_elements(v_opts) o) x);
    begin
      insert into public.live_quiz_questions (id, set_id, course_id, position, question, options, answer, explanation, origin, norm_key)
      values (
        v_qid, v_set_id, v_course_id, v_i - 1, btrim(v_q ->> 'question'),
        (select jsonb_agg(to_jsonb(btrim(o.value #>> '{}')) order by o.ordinality) from jsonb_array_elements(v_opts) with ordinality o),
        (v_q ->> 'answer')::integer, btrim(coalesce(v_q ->> 'explanation', '')), coalesce(v_q ->> 'origin', 'manual'), v_key
      );
    exception when unique_violation then
      raise exception '%번 문제와 같은 문제(보기 순서만 다른 경우 포함)가 이 과목의 실시간 문제 세트에 이미 있어요.', v_i using errcode = '23505';
    end;
  end loop;

  return (select x.value from jsonb_array_elements(public._live_quiz_sets_json(v_course_id)) as x where x.value ->> 'id' = v_set_id);
end;
$$;

-- 세트 삭제 (공통). 지운 세트의 과목 id를 돌려준다
create or replace function public._delete_live_quiz_set(p_set_id text, p_is_admin boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id text;
begin
  select course_id into v_course_id from public.live_quiz_sets where id = p_set_id;
  if not found then
    raise exception '문제 세트를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id));
  if not p_is_admin and not public.can_manage_course(v_course_id) then
    raise exception '담당 강의의 문제 세트만 삭제할 수 있어요.' using errcode = '42501';
  end if;
  delete from public.live_quiz_sets where id = p_set_id;
  return v_course_id;
end;
$$;

-- 교수자 (authenticated): 목록은 그 과목 자료를 비공개 포함 볼 수 있는 교수자, 저장·삭제는 담당(can_manage_course)
create or replace function public.list_live_quiz_sets(p_course_id text)
returns jsonb
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
    raise exception '담당 강의의 문제 세트만 볼 수 있어요.' using errcode = '42501';
  end if;
  return public._live_quiz_sets_json(p_course_id);
end;
$$;

create or replace function public.save_live_quiz_set(p_course_id text, p_set_id text, p_input jsonb, p_expected_version integer)
returns jsonb
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
    raise exception '교수자만 문제 세트를 저장할 수 있어요.' using errcode = '42501';
  end if;
  return public._save_live_quiz_set(p_course_id, p_set_id, p_input, p_expected_version, v_uid, v_label, false);
end;
$$;

create or replace function public.delete_live_quiz_set(p_set_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return public._delete_live_quiz_set(p_set_id, false);
end;
$$;

-- 관리자 (service_role)
create or replace function public.admin_list_live_quiz_sets(p_course_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public._live_quiz_sets_json(p_course_id);
$$;

create or replace function public.admin_save_live_quiz_set(p_course_id text, p_set_id text, p_input jsonb, p_expected_version integer, p_admin_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._save_live_quiz_set(p_course_id, p_set_id, p_input, p_expected_version, null, coalesce(nullif(btrim(p_admin_label), ''), '관리자'), true);
end;
$$;

create or replace function public.admin_delete_live_quiz_set(p_set_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._delete_live_quiz_set(p_set_id, true);
end;
$$;

/* ───────── 권한 ───────── */

revoke all on function public._live_quiz_norm(text) from public, anon, authenticated, service_role;
revoke all on function public._live_quiz_sets_json(text) from public, anon, authenticated, service_role;
revoke all on function public._save_live_quiz_set(text, text, jsonb, integer, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public._delete_live_quiz_set(text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.list_live_quiz_sets(text) from public, anon, authenticated, service_role;
revoke all on function public.save_live_quiz_set(text, text, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.delete_live_quiz_set(text) from public, anon, authenticated, service_role;
revoke all on function public.admin_list_live_quiz_sets(text) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_live_quiz_set(text, text, jsonb, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_delete_live_quiz_set(text) from public, anon, authenticated, service_role;

grant execute on function public.list_live_quiz_sets(text) to authenticated;
grant execute on function public.save_live_quiz_set(text, text, jsonb, integer) to authenticated;
grant execute on function public.delete_live_quiz_set(text) to authenticated;
grant execute on function public.admin_list_live_quiz_sets(text) to service_role;
grant execute on function public.admin_save_live_quiz_set(text, text, jsonb, integer, text) to service_role;
grant execute on function public.admin_delete_live_quiz_set(text) to service_role;

commit;

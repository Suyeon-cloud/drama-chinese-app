-- Phase 6-B: 교수자 주도 실시간 퀴즈 세션 (출제 → 응답 접수 → 마감 → 정답 공개 → 다음 문제 → 종료)
--
-- 새 테이블만 추가한다. 기존 테이블·행과 6-A까지의 함수는 바꾸지 않는다.
--   1) live_quiz_sessions: 분반 단위 세션. 시작할 때 문제 세트를 스냅샷(questions)으로 복사 — 이후 세트를 고쳐도 진행·기록이 바뀌지 않는다.
--      참여 코드(진행 중 세션끼리 고유), 분반당 진행 중 세션 1개, phase: waiting → open → closed → revealed → (다음 문제) open …
--   2) live_quiz_participants (참여 학생) · live_quiz_responses (세션·문제 번호·학생당 1개 — 기본 키로 중복 제출 차단)
--   3) 테이블 직접 권한 없음 (RLS 켜짐, 정책 없음, anon·authenticated 권한 없음). RPC로만:
--      교수자(운영 중 담당 분반): start_live_session · live_session_control · live_session_host_state · my_live_host_sessions
--      학생(그 분반 수강생): join_live_session · live_session_student_state · submit_live_answer
--      학생 응답에는 정답·해설이 '정답 공개' 상태에서만 들어간다. 다른 학생의 개별 응답은 누구에게도 보내지 않는다(교수자도 집계만).
--   4) 진행 제어는 state_version으로 막는다 (여러 탭에서 동시에 누르면 40001 → 409)
--
-- 트랜잭션: 파일 전체가 begin … commit 한 트랜잭션이다. 재실행: [0] 사전 확인이 다르면 아무것도 바꾸지 않고 멈춘다.

begin;

/* ───────── 0) 사전 확인 ───────── */

do $pre$
declare
  v_actual text;
begin
  if to_regclass('public.live_quiz_sets') is null
     or to_regclass('public.live_quiz_questions') is null
     or to_regclass('public.sections') is null
     or to_regprocedure('public.my_instructor_section_ids(boolean)') is null
     or to_regprocedure('public.my_enrolled_section_ids()') is null
     or to_regprocedure('public.can_manage_course(text)') is null
     or to_regprocedure('public._material_actor_label()') is null
     or to_regprocedure('public.lesson_course_lock_key(text)') is null
     or to_regprocedure('public.set_updated_at()') is null then
    raise exception '6B_PREFLIGHT: 6-A 테이블 또는 의존 함수(분반·수강·권한·잠금)가 없어요.';
  end if;

  if to_regclass('public.live_quiz_sessions') is not null then
    execute 'select string_agg(column_name, '','' order by ordinal_position) from information_schema.columns where table_schema = ''public'' and table_name = ''live_quiz_sessions''' into v_actual;
    if v_actual is distinct from 'id,course_id,section_id,set_id,title,questions,join_code,status,current_index,phase,state_version,created_by,created_by_label,created_at,updated_at,ended_at' then
      raise exception '6B_PREFLIGHT: 이미 있는 live_quiz_sessions의 열이 예상과 달라요. (%)', v_actual;
    end if;
  end if;

  select string_agg(tablename || ':' || policyname, ',') into v_actual
    from pg_policies where schemaname = 'public' and tablename in ('live_quiz_sessions', 'live_quiz_participants', 'live_quiz_responses');
  if v_actual is not null then
    raise exception '6B_PREFLIGHT: 세션 테이블에 예상하지 않은 RLS 정책이 있어요. (%)', v_actual;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_live_join_code', '_live_can_host', '_live_host_json', '_live_student_json',
                       'start_live_session', 'live_session_control', 'live_session_host_state', 'my_live_host_sessions',
                       'join_live_session', 'live_session_student_state', 'submit_live_answer')
     and p.oid <> all (array_remove(array[
       to_regprocedure('public._live_join_code()'),
       to_regprocedure('public._live_can_host(text)'),
       to_regprocedure('public._live_host_json(text)'),
       to_regprocedure('public._live_student_json(text,uuid)'),
       to_regprocedure('public.start_live_session(text,text)'),
       to_regprocedure('public.live_session_control(text,text,integer)'),
       to_regprocedure('public.live_session_host_state(text)'),
       to_regprocedure('public.my_live_host_sessions(text)'),
       to_regprocedure('public.join_live_session(text)'),
       to_regprocedure('public.live_session_student_state(text)'),
       to_regprocedure('public.submit_live_answer(text,integer,integer)')
     ]::oid[], null));
  if v_actual is not null then
    raise exception '6B_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;
end;
$pre$;

/* ───────── 1) 테이블 ───────── */

create table if not exists public.live_quiz_sessions (
  id text primary key check (id ~ '^lqs-[a-z0-9]{12}$'),
  course_id text not null references public.courses (id) on delete restrict,
  section_id text not null references public.sections (id) on delete restrict,
  -- 원본 세트 (지워져도 세션 기록은 남는다)
  set_id text references public.live_quiz_sets (id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  -- 시작할 때 복사한 문제 [{id, question, options, answer, explanation}]
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 30),
  join_code text not null check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status text not null default 'active' check (status in ('active', 'ended')),
  current_index integer check (current_index is null or current_index between 0 and 29),
  phase text not null default 'waiting' check (phase in ('waiting', 'open', 'closed', 'revealed')),
  state_version integer not null default 1 check (state_version >= 1),
  created_by uuid references auth.users (id) on delete set null,
  created_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  check (current_index is null or current_index < jsonb_array_length(questions)),
  check ((phase = 'waiting') = (current_index is null))
);
-- 분반당 진행 중 세션 1개, 진행 중 세션끼리 참여 코드 고유
create unique index if not exists live_quiz_sessions_active_section_uniq on public.live_quiz_sessions (section_id) where status = 'active';
create unique index if not exists live_quiz_sessions_active_code_uniq on public.live_quiz_sessions (join_code) where status = 'active';
create index if not exists live_quiz_sessions_course_idx on public.live_quiz_sessions (course_id, status);

create table if not exists public.live_quiz_participants (
  session_id text not null references public.live_quiz_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.live_quiz_responses (
  session_id text not null references public.live_quiz_sessions (id) on delete cascade,
  question_index integer not null check (question_index between 0 and 29),
  user_id uuid not null references auth.users (id) on delete cascade,
  choice integer not null check (choice between 0 and 5),
  answered_at timestamptz not null default now(),
  -- 문제당 1회: 같은 학생의 두 번째 제출은 DB가 막는다
  primary key (session_id, question_index, user_id)
);

drop trigger if exists live_quiz_sessions_set_updated_at on public.live_quiz_sessions;
create trigger live_quiz_sessions_set_updated_at
  before update on public.live_quiz_sessions
  for each row execute function public.set_updated_at();

alter table public.live_quiz_sessions enable row level security;
alter table public.live_quiz_participants enable row level security;
alter table public.live_quiz_responses enable row level security;
revoke all on table public.live_quiz_sessions from public, anon, authenticated, service_role;
revoke all on table public.live_quiz_participants from public, anon, authenticated, service_role;
revoke all on table public.live_quiz_responses from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.live_quiz_sessions to service_role;
grant select, insert, update, delete on table public.live_quiz_participants to service_role;
grant select, insert, update, delete on table public.live_quiz_responses to service_role;

/* ───────── 2) 내부 함수 ───────── */

-- 참여 코드 6자리 (헷갈리는 0·O·1·I 제외). 권한 검사는 수강 여부로 따로 하므로 비밀 값이 아니다.
create or replace function public._live_join_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::integer, 1), '')
    from generate_series(1, 6);
$$;

-- 이 분반의 세션을 진행할 수 있는지: 운영 중인 과목의 운영 중 담당 분반
create or replace function public._live_can_host(p_section_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_section_id in (select public.my_instructor_section_ids(true));
$$;

-- 교수자 화면 상태: 현재 문제(정답·해설 포함) · 참여 인원 · 현재 문제 보기별 응답 수 · 문제별 응답·정답 수 (개별 응답 없음)
create or replace function public._live_host_json(p_session_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'courseId', s.course_id, 'sectionId', s.section_id, 'setId', s.set_id, 'title', s.title,
    'joinCode', s.join_code, 'status', s.status, 'phase', s.phase, 'currentIndex', s.current_index,
    'total', jsonb_array_length(s.questions), 'version', s.state_version, 'endedAt', s.ended_at,
    'question', case when s.current_index is null then null else s.questions -> s.current_index end,
    'participants', (select count(*) from public.live_quiz_participants p where p.session_id = s.id),
    'counts', case when s.current_index is null then '[]'::jsonb else (
      select jsonb_agg((select count(*) from public.live_quiz_responses r
                         where r.session_id = s.id and r.question_index = s.current_index and r.choice = o.n - 1) order by o.n)
        from generate_series(1, jsonb_array_length(s.questions -> s.current_index -> 'options')) as o(n)) end,
    'summary', (select coalesce(jsonb_agg(jsonb_build_object(
                  'index', q.i - 1,
                  'responded', (select count(*) from public.live_quiz_responses r where r.session_id = s.id and r.question_index = q.i - 1),
                  'correct', (select count(*) from public.live_quiz_responses r where r.session_id = s.id and r.question_index = q.i - 1
                                and r.choice = (s.questions -> (q.i - 1) ->> 'answer')::integer)) order by q.i), '[]'::jsonb)
                  from generate_series(1, coalesce(s.current_index + 1, 0)) as q(i))
  )
  from public.live_quiz_sessions s where s.id = p_session_id;
$$;

-- 학생 화면 상태: 문제·보기·내 답 / 정답·해설·보기별 응답 수는 '정답 공개'(revealed)에서만
create or replace function public._live_student_json(p_session_id text, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'title', s.title, 'status', s.status, 'phase', s.phase, 'currentIndex', s.current_index,
    'total', jsonb_array_length(s.questions), 'version', s.state_version,
    'question', case when s.current_index is null then null
                     else jsonb_build_object('question', s.questions -> s.current_index ->> 'question',
                                             'options', s.questions -> s.current_index -> 'options') end,
    'myChoice', (select r.choice from public.live_quiz_responses r
                  where r.session_id = s.id and r.question_index = s.current_index and r.user_id = p_user),
    'answer', case when s.phase = 'revealed' then (s.questions -> s.current_index ->> 'answer')::integer end,
    'explanation', case when s.phase = 'revealed' then s.questions -> s.current_index ->> 'explanation' end,
    'counts', case when s.phase = 'revealed' then (
      select jsonb_agg((select count(*) from public.live_quiz_responses r
                         where r.session_id = s.id and r.question_index = s.current_index and r.choice = o.n - 1) order by o.n)
        from generate_series(1, jsonb_array_length(s.questions -> s.current_index -> 'options')) as o(n)) end
  )
  from public.live_quiz_sessions s where s.id = p_session_id;
$$;

/* ───────── 3) 교수자 RPC ───────── */

/*
 * 세션 시작: 준비 완료(ready) 세트 + 운영 중 담당 분반(같은 과목). 문제를 스냅샷으로 복사하고 참여 코드를 만든다.
 * 오류: 28000 로그인 / 42501 권한 / P0002 세트·분반 없음 / 22023 준비 완료가 아님·다른 과목 분반 / 23505 그 분반에 진행 중 세션
 */
create or replace function public.start_live_session(p_set_id text, p_section_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_set public.live_quiz_sets;
  v_section public.sections;
  v_id text;
  v_code text;
  v_try integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_set from public.live_quiz_sets where id = p_set_id;
  if not found then
    raise exception '문제 세트를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_set.course_id));
  select * into v_section from public.sections where id = p_section_id;
  if not found or v_section.course_id <> v_set.course_id then
    raise exception '이 문제 세트의 과목 분반을 골라 주세요.' using errcode = '22023';
  end if;
  if not public._live_can_host(p_section_id) or not public.can_manage_course(v_set.course_id) then
    raise exception '운영 중인 담당 분반에서만 실시간 퀴즈를 시작할 수 있어요.' using errcode = '42501';
  end if;
  if v_set.status <> 'ready' then
    raise exception '준비 완료로 저장한 문제 세트만 시작할 수 있어요.' using errcode = '22023';
  end if;
  if exists (select 1 from public.live_quiz_sessions where section_id = p_section_id and status = 'active') then
    raise exception '이 분반에 진행 중인 실시간 퀴즈가 있어요. 그 세션을 이어서 진행하거나 종료해 주세요.' using errcode = '23505';
  end if;
  loop
    v_try := v_try + 1;
    v_code := public._live_join_code();
    exit when not exists (select 1 from public.live_quiz_sessions where join_code = v_code and status = 'active');
    if v_try >= 20 then
      raise exception '참여 코드를 만들지 못했어요. 다시 시도해 주세요.' using errcode = '55000';
    end if;
  end loop;
  v_id := 'lqs-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into public.live_quiz_sessions (id, course_id, section_id, set_id, title, questions, join_code, created_by, created_by_label)
  values (
    v_id, v_set.course_id, p_section_id, v_set.id, v_set.title,
    (select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options, 'answer', q.answer, 'explanation', q.explanation) order by q.position)
       from public.live_quiz_questions q where q.set_id = v_set.id),
    v_code, v_uid, public._material_actor_label()
  );
  return public._live_host_json(v_id);
end;
$$;

/*
 * 진행 제어: next(출제·다음 문제) · close(응답 마감) · reveal(정답 공개) · end(종료). p_expected_version이 지금 버전과 같아야 한다.
 * 상태 전이: waiting|revealed --next--> open --close--> closed --reveal--> revealed (마지막 문제 뒤 next 불가) / 언제든 end
 * 오류: 28000 / 42501 / P0002 / 22023 지금 상태에서 할 수 없음·이미 종료 / 40001 다른 화면에서 먼저 바뀜
 */
create or replace function public.live_session_control(p_session_id text, p_action text, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.live_quiz_sessions;
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v from public.live_quiz_sessions where id = p_session_id for update;
  if not found or not public._live_can_host(v.section_id) then
    raise exception '세션을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if v.status <> 'active' then
    raise exception '이미 종료된 세션이에요.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version <> v.state_version then
    raise exception '다른 화면에서 진행 상태가 먼저 바뀌었어요. 화면을 새로 불러왔어요.' using errcode = '40001';
  end if;
  v_total := jsonb_array_length(v.questions);
  if p_action = 'next' and v.phase in ('waiting', 'revealed') and coalesce(v.current_index + 1, 0) < v_total then
    update public.live_quiz_sessions set current_index = coalesce(current_index + 1, 0), phase = 'open', state_version = state_version + 1 where id = v.id;
  elsif p_action = 'close' and v.phase = 'open' then
    update public.live_quiz_sessions set phase = 'closed', state_version = state_version + 1 where id = v.id;
  elsif p_action = 'reveal' and v.phase = 'closed' then
    update public.live_quiz_sessions set phase = 'revealed', state_version = state_version + 1 where id = v.id;
  elsif p_action = 'end' then
    update public.live_quiz_sessions set status = 'ended', ended_at = now(), state_version = state_version + 1 where id = v.id;
  else
    raise exception '지금 상태에서는 할 수 없는 동작이에요.' using errcode = '22023';
  end if;
  return public._live_host_json(v.id);
end;
$$;

create or replace function public.live_session_host_state(p_session_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_section text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select section_id into v_section from public.live_quiz_sessions where id = p_session_id;
  if not found or not public._live_can_host(v_section) then
    raise exception '세션을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  return public._live_host_json(p_session_id);
end;
$$;

-- 새로고침 뒤 복구: 이 과목에서 내가 진행 중인(담당 분반의) 세션
create or replace function public.my_live_host_sessions(p_course_id text)
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
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'sectionId', s.section_id, 'title', s.title, 'joinCode', s.join_code, 'phase', s.phase,
            'currentIndex', s.current_index, 'total', jsonb_array_length(s.questions), 'createdAt', s.created_at) order by s.created_at), '[]'::jsonb)
            from public.live_quiz_sessions s
           where s.course_id = p_course_id and s.status = 'active' and public._live_can_host(s.section_id));
end;
$$;

/* ───────── 4) 학생 RPC ───────── */

/*
 * 참여: 진행 중 세션의 참여 코드 + 그 분반 수강생(승인된 학생)만. 다시 참여해도 된다(새로고침·여러 탭).
 * 코드가 없거나 수강생이 아니면 똑같이 '찾을 수 없어요'(P0002) — 세션이 있는지 알려 주지 않는다.
 */
create or replace function public.join_live_session(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v public.live_quiz_sessions;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v from public.live_quiz_sessions
   where join_code = upper(btrim(coalesce(p_code, ''))) and status = 'active';
  if not found or v.section_id not in (select public.my_enrolled_section_ids()) then
    raise exception '참여 코드를 찾을 수 없어요. 코드와 수강 중인 분반을 확인해 주세요.' using errcode = 'P0002';
  end if;
  insert into public.live_quiz_participants (session_id, user_id) values (v.id, v_uid) on conflict do nothing;
  return public._live_student_json(v.id, v_uid);
end;
$$;

create or replace function public.live_session_student_state(p_session_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_section text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select section_id into v_section from public.live_quiz_sessions where id = p_session_id;
  if not found
     or not exists (select 1 from public.live_quiz_participants p where p.session_id = p_session_id and p.user_id = v_uid)
     or v_section not in (select public.my_enrolled_section_ids()) then
    raise exception '세션을 찾을 수 없어요. 참여 코드로 다시 참여해 주세요.' using errcode = 'P0002';
  end if;
  return public._live_student_json(p_session_id, v_uid);
end;
$$;

/*
 * 답 제출: 참여한 수강생, 진행 중, 지금 문제가 '응답 접수'(open)일 때만. 문제당 1회 — 두 번째는 23505.
 * 세션 행을 FOR SHARE로 잠가, 마감(close)과 동시에 들어온 제출은 마감이 끝난 뒤 판단한다.
 * 오류: 28000 / P0002 참여하지 않음 / 40001 지금 받을 수 없음(마감·다른 문제) / 22023 보기 범위 / 23505 이미 제출
 */
create or replace function public.submit_live_answer(p_session_id text, p_question_index integer, p_choice integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v public.live_quiz_sessions;
  v_n integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v from public.live_quiz_sessions where id = p_session_id for share;
  if not found
     or not exists (select 1 from public.live_quiz_participants p where p.session_id = p_session_id and p.user_id = v_uid)
     or v.section_id not in (select public.my_enrolled_section_ids()) then
    raise exception '세션을 찾을 수 없어요. 참여 코드로 다시 참여해 주세요.' using errcode = 'P0002';
  end if;
  if v.status <> 'active' or v.phase <> 'open' or v.current_index is distinct from p_question_index then
    raise exception '지금은 이 문제에 답할 수 없어요. (응답이 마감됐거나 다음 문제로 넘어갔어요)' using errcode = '40001';
  end if;
  v_n := jsonb_array_length(v.questions -> v.current_index -> 'options');
  if p_choice is null or p_choice < 0 or p_choice >= v_n then
    raise exception '보기를 골라 주세요.' using errcode = '22023';
  end if;
  insert into public.live_quiz_responses (session_id, question_index, user_id, choice)
  values (v.id, p_question_index, v_uid, p_choice)
  on conflict do nothing;
  if not found then
    raise exception '이미 답했어요. 문제당 한 번만 제출할 수 있어요.' using errcode = '23505';
  end if;
  return public._live_student_json(v.id, v_uid);
end;
$$;

/* ───────── 권한 ───────── */

revoke all on function public._live_join_code() from public, anon, authenticated, service_role;
revoke all on function public._live_can_host(text) from public, anon, authenticated, service_role;
revoke all on function public._live_host_json(text) from public, anon, authenticated, service_role;
revoke all on function public._live_student_json(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.start_live_session(text, text) from public, anon, authenticated, service_role;
revoke all on function public.live_session_control(text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.live_session_host_state(text) from public, anon, authenticated, service_role;
revoke all on function public.my_live_host_sessions(text) from public, anon, authenticated, service_role;
revoke all on function public.join_live_session(text) from public, anon, authenticated, service_role;
revoke all on function public.live_session_student_state(text) from public, anon, authenticated, service_role;
revoke all on function public.submit_live_answer(text, integer, integer) from public, anon, authenticated, service_role;

grant execute on function public.start_live_session(text, text) to authenticated;
grant execute on function public.live_session_control(text, text, integer) to authenticated;
grant execute on function public.live_session_host_state(text) to authenticated;
grant execute on function public.my_live_host_sessions(text) to authenticated;
grant execute on function public.join_live_session(text) to authenticated;
grant execute on function public.live_session_student_state(text) to authenticated;
grant execute on function public.submit_live_answer(text, integer, integer) to authenticated;

commit;

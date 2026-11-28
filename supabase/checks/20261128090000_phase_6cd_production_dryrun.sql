-- Phase 6-C·6-D·6-D2 운영 사전 점검 (dry-run) — 자동 생성 파일: node scripts/build-6cd-dryrun.mjs (직접 고치지 않는다)
--
-- ▶ 목적: 운영 DB의 실제 상태에서 세 migration(사전 확인·함수 생성·권한 변경)과 세 rollback이 오류 없이 되는지 확인한다.
-- ▶ 남는 것 없음: 한 트랜잭션 안에서 실행하고, 마지막 블록이 '일부러' 오류를 내서 전체가 취소된다(맨 끝 rollback도 둔다).
--    이 파일에는 commit이 없다. 결과는 SQL Editor의 오류 메시지 'DRYRUN_6CD_REPORT: …'로 보인다.
-- ▶ 운영 데이터를 쓰지 않고 실제 회원정보를 쓰지 않는다: 존재하지 않는 사용자 id로 '없음·거부' 경로만 실행하고,
--    공백 정규식은 글자 상수로만 확인한다.
-- ▶ 잠금: 테이블 잠금 없음(함수 생성·함수 권한만). lock_timeout 2초 — 다른 DDL과 겹치면 기다리지 않고 실패(취소)한다.
-- ▶ 반드시 파일 전체를 선택 없이 한 번에 실행한다. 일부만 실행되면 단계마다 있는 guard가 멈춘다.

begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('dryrun.guard', 'on', true) as dryrun_guard;

/* ───────── 가상 값 사전 확인: 운영 데이터에 같은 값이 있으면 즉시 중단 (존재 여부만 읽는다) ───────── */
do $fakeids$
declare
  hit text := '';
begin
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000d0d0') then hit := hit || ' auth.users'; end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000d0d0') then hit := hit || ' profiles'; end if;
  if exists (select 1 from public.instructors where user_id = '00000000-0000-4000-8000-00000000d0d0') then hit := hit || ' instructors'; end if;
  if exists (select 1 from public.enrollments where user_id = '00000000-0000-4000-8000-00000000d0d0') then hit := hit || ' enrollments'; end if;
  if exists (select 1 from public.live_quiz_participants where user_id = '00000000-0000-4000-8000-00000000d0d0') then hit := hit || ' participants'; end if;
  if exists (select 1 from public.live_quiz_responses where user_id = '00000000-0000-4000-8000-00000000d0d0') then hit := hit || ' responses'; end if;
  if exists (select 1 from public.live_quiz_sessions where id = 'lqs-000000000000' or join_code = 'ZZZZZZ') then hit := hit || ' live_quiz_sessions'; end if;
  if exists (select 1 from public.courses where id = 'zz-no-course') then hit := hit || ' courses'; end if;
  if hit <> '' then
    raise exception 'DRYRUN_FAKE_ID_EXISTS: 점검용 가상 값이 운영 데이터에 있어요(%). 실행을 중단했어요 — 이 메시지를 보내 주세요.', hit;
  end if;
end $fakeids$;

do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(apply-1): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;

-- ═════ migrations/20261127090000_phase_6c_live_quiz_results.sql (begin/commit 줄 제외, 본문 그대로) ═════
-- Phase 6-C: 실시간 퀴즈 결과 조회 (교수자 전용, 종료된 세션)
--
-- ▶ 하는 일: 결과 조회 함수 3개만 추가한다. 테이블·열·기존 함수·기존 행은 바꾸지 않는다 (6-B 기록 그대로 호환).
--    - _live_can_view_results(section): 이 분반 담당 교수자인가 (운영 중 과목, 분반 운영 여부와 무관 — 학기 뒤에도 기록 조회)
--    - my_live_session_history(course): 이 과목에서 내가 볼 수 있는 세션 목록 (진행 중 + 종료)
--    - live_session_results(session): 종료된 세션의 학생별 응답·점수, 문항별 정답률·응답 분포, 중복 학번
-- ▶ 개인정보: 회원정보(profiles)의 이름·학번만 읽어 결과에 넣는다. 이메일·전화·사용자 id는 돌려주지 않는다(행 key는 순번).
--    결과를 따로 저장하지 않는다 (개인정보 중복 저장 없음). 관리자 계정은 auth 사용자가 아니어서 호출할 수 없다.
-- ▶ 재실행: 같은 이름·인자의 함수는 create or replace. 파일 전체가 begin … commit 한 트랜잭션이다.


/* ───────── 0) 사전 확인 ───────── */
do $pre$
declare
  v_actual text;
begin
  if to_regclass('public.live_quiz_sessions') is null
     or to_regclass('public.live_quiz_participants') is null
     or to_regclass('public.live_quiz_responses') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.my_instructor_section_ids(boolean)') is null then
    raise exception '6C_PREFLIGHT: 6-B 세션 테이블 또는 회원정보·담당 분반 함수가 없어요.';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_live_can_view_results', 'my_live_session_history', 'live_session_results')
     and p.oid <> all (array_remove(array[
       to_regprocedure('public._live_can_view_results(text)'),
       to_regprocedure('public.my_live_session_history(text)'),
       to_regprocedure('public.live_session_results(text)')
     ]::oid[], null));
  if v_actual is not null then
    raise exception '6C_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;
end;
$pre$;

/* ───────── 1) 권한: 담당 분반 교수자 ───────── */
create or replace function public._live_can_view_results(p_section_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_section_id in (select public.my_instructor_section_ids(false));
$$;

/* ───────── 2) 세션 목록 (진행 중 + 종료, 최근 50개) ───────── */
create or replace function public.my_live_session_history(p_course_id text)
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
  return (select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb)
            from (select s.created_at, jsonb_build_object(
                    'id', s.id, 'sectionId', s.section_id, 'title', s.title, 'status', s.status,
                    'total', jsonb_array_length(s.questions),
                    'participants', (select count(*) from public.live_quiz_participants p where p.session_id = s.id),
                    'createdAt', s.created_at, 'endedAt', s.ended_at) as j
                    from public.live_quiz_sessions s
                   where s.course_id = p_course_id and public._live_can_view_results(s.section_id)
                   order by s.created_at desc
                   limit 50) x);
end;
$$;

/* ───────── 3) 결과 (종료된 세션만) ───────── */
create or replace function public.live_session_results(p_session_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.live_quiz_sessions%rowtype;
  v_questions jsonb;
  v_students jsonb;
  v_dups jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v from public.live_quiz_sessions where id = p_session_id;
  if not found or not public._live_can_view_results(v.section_id) then
    raise exception '세션을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if v.status <> 'ended' then
    raise exception '세션을 종료한 뒤에 결과를 볼 수 있어요.' using errcode = '22023';
  end if;

  -- 문항별: 보기별 응답 수 · 응답 수 · 정답 수
  select coalesce(jsonb_agg(jsonb_build_object(
           'index', q.i - 1,
           'question', q.e->>'question',
           'options', q.e->'options',
           'answer', (q.e->>'answer')::int,
           'counts', (select coalesce(jsonb_agg((select count(*) from public.live_quiz_responses r
                                                  where r.session_id = v.id and r.question_index = q.i - 1 and r.choice = o.j - 1) order by o.j), '[]'::jsonb)
                        from jsonb_array_elements(q.e->'options') with ordinality o(x, j)),
           'responded', (select count(*) from public.live_quiz_responses r where r.session_id = v.id and r.question_index = q.i - 1),
           'correct', (select count(*) from public.live_quiz_responses r
                        where r.session_id = v.id and r.question_index = q.i - 1 and r.choice = (q.e->>'answer')::int)
         ) order by q.i), '[]'::jsonb)
    into v_questions
    from jsonb_array_elements(v.questions) with ordinality q(e, i);

  -- 같은 학번(공백 제거·대문자)으로 참여한 서로 다른 계정
  select coalesce(jsonb_agg(d.nsid order by d.nsid), '[]'::jsonb) into v_dups
    from (select upper(regexp_replace(pr.student_id, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) as nsid
            from public.live_quiz_participants p
            join public.profiles pr on pr.id = p.user_id
           where p.session_id = v.id and btrim(pr.student_id) <> ''
           group by 1 having count(*) > 1) d;

  -- 학생별: 이름·학번(회원정보) · 문항별 고른 보기(없으면 null) · 응답 수 · 정답 수. key는 순번 (사용자 id를 보내지 않는다)
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', 's' || st.n,
           'name', st.name,
           'studentId', st.sid,
           'joinedAt', st.joined_at,
           'choices', (select coalesce(jsonb_agg((select r.choice from public.live_quiz_responses r
                                                   where r.session_id = v.id and r.user_id = st.user_id and r.question_index = q.i - 1) order by q.i), '[]'::jsonb)
                         from jsonb_array_elements(v.questions) with ordinality q(e, i)),
           'answered', (select count(*) from public.live_quiz_responses r where r.session_id = v.id and r.user_id = st.user_id),
           'correct', (select count(*) from public.live_quiz_responses r
                         join jsonb_array_elements(v.questions) with ordinality q(e, i) on r.question_index = q.i - 1
                        where r.session_id = v.id and r.user_id = st.user_id and r.choice = (q.e->>'answer')::int),
           'duplicate', st.nsid <> '' and v_dups ? st.nsid
         ) order by st.n), '[]'::jsonb)
    into v_students
    from (select p.user_id, p.joined_at,
                 coalesce(pr.name, '') as name, coalesce(pr.student_id, '') as sid,
                 upper(regexp_replace(coalesce(pr.student_id, ''), '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) as nsid,
                 row_number() over (order by upper(regexp_replace(coalesce(pr.student_id, ''), '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')), coalesce(pr.name, ''), p.joined_at) as n
            from public.live_quiz_participants p
            left join public.profiles pr on pr.id = p.user_id
           where p.session_id = v.id) st;

  return jsonb_build_object(
    'id', v.id, 'courseId', v.course_id, 'sectionId', v.section_id, 'title', v.title,
    'createdAt', v.created_at, 'endedAt', v.ended_at, 'total', jsonb_array_length(v.questions),
    'participants', jsonb_array_length(v_students),
    'questions', v_questions, 'students', v_students, 'duplicateStudentIds', v_dups);
end;
$$;

/* ───────── 4) 함수 권한: 사용자(authenticated)는 공개 함수 2개만 ───────── */
revoke all on function public._live_can_view_results(text) from public, anon, authenticated, service_role;
revoke all on function public.my_live_session_history(text) from public, anon, authenticated, service_role;
revoke all on function public.live_session_results(text) from public, anon, authenticated, service_role;
grant execute on function public.my_live_session_history(text) to authenticated;
grant execute on function public.live_session_results(text) to authenticated;

do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(apply-2): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;

-- ═════ migrations/20261128090000_phase_6d_live_join_verified.sql (begin/commit 줄 제외, 본문 그대로) ═════
-- Phase 6-D (1/2): 실시간 퀴즈 참여 — DB에서도 실명·학번을 회원정보와 대조
--
-- ▶ 하는 일: 함수 2개 추가
--    - _live_identity_matches(name, student_id): 로그인한 본인의 회원정보(profiles)와 같은가 (내부용)
--    - join_live_session_verified(code, name, student_id): 대조에 통과해야 기존 join_live_session으로 참여
-- ▶ 하지 않는 일: 테이블·열·행 변경 없음, 입력한 실명·학번을 저장하지 않는다. 기존 join_live_session은 그대로 둔다
--    (지금 Production 코드가 쓰고 있다 — 새 코드 배포 뒤 6-D2가 직접 호출 권한을 거둔다).
-- ▶ 규칙(JSON 모드 서버와 같다): 이름은 공백 제거·소문자, 학번은 공백 제거·대문자로 비교. 회원정보에 이름·학번이 비어 있으면 불일치.
--    틀리면 어느 칸인지 알리지 않는다. 본인 확인은 세션을 찾기 전에 한다(틀린 입력으로 세션 존재 여부를 알 수 없다).
-- ▶ 재실행: create or replace. 파일 전체가 begin … commit 한 트랜잭션이다.


/* ───────── 0) 사전 확인 ───────── */
do $pre$
declare
  v_actual text;
begin
  if to_regprocedure('public.join_live_session(text)') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_instructor()') is null
     or to_regprocedure('public.my_enrolled_section_ids()') is null then
    raise exception '6D_PREFLIGHT: 6-B 참여 함수 또는 회원정보·교수자·수강 함수가 없어요.';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_live_identity_matches', 'join_live_session_verified')
     and p.oid <> all (array_remove(array[
       to_regprocedure('public._live_identity_matches(text,text)'),
       to_regprocedure('public.join_live_session_verified(text,text,text)')
     ]::oid[], null));
  if v_actual is not null then
    raise exception '6D_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;
end;
$pre$;

/* ───────── 1) 본인 회원정보와 대조 (내부용) ───────── */
create or replace function public._live_identity_matches(p_name text, p_student_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles pr
     where pr.id = (select auth.uid())
       and lower(regexp_replace(pr.name, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) <> ''
       and upper(regexp_replace(pr.student_id, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) <> ''
       and lower(regexp_replace(pr.name, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) = lower(regexp_replace(coalesce(p_name, ''), '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g'))
       and upper(regexp_replace(pr.student_id, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) = upper(regexp_replace(coalesce(p_student_id, ''), '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g'))
  );
$$;

/* ───────── 2) 본인 확인 후 참여 ───────── */
create or replace function public.join_live_session_verified(p_code text, p_name text, p_student_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_sid text := btrim(coalesce(p_student_id, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- 코드 형식이 틀리거나 교수자 계정이면 '없는 코드'와 같게 (교수자는 학생으로 참여하지 않는다)
  if upper(btrim(coalesce(p_code, ''))) !~ '^[A-HJ-NP-Z2-9]{6}$' or public.is_instructor() then
    raise exception '참여 코드를 찾을 수 없어요. 코드와 수강 중인 분반을 확인해 주세요.' using errcode = 'P0002';
  end if;
  if v_name = '' or v_sid = '' then
    raise exception '실명과 학번을 입력해 주세요.' using errcode = '22023';
  end if;
  if char_length(v_name) > 50 or char_length(v_sid) > 30 then
    raise exception '실명과 학번을 다시 확인해 주세요.' using errcode = '22023';
  end if;
  if not public._live_identity_matches(v_name, v_sid) then
    raise exception '입력한 실명·학번이 회원정보와 일치하지 않아요. 회원정보에 등록한 이름과 학번을 입력해 주세요.' using errcode = '22023';
  end if;
  -- 통과: 기존 참여 규칙(운영 중 세션 · 승인된 분반 수강생 · 참여 기록 1행) 그대로
  return public.join_live_session(p_code);
end;
$$;

/* ───────── 3) 함수 권한: 사용자는 확인 후 참여 함수만 (기존 join_live_session 권한은 6-D2에서 거둔다) ───────── */
revoke all on function public._live_identity_matches(text, text) from public, anon, authenticated, service_role;
revoke all on function public.join_live_session_verified(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.join_live_session_verified(text, text, text) to authenticated;

do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(apply-3): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;

-- ═════ migrations/20261128090100_phase_6d2_revoke_legacy_join.sql (begin/commit 줄 제외, 본문 그대로) ═════
-- Phase 6-D (2/2): 본인 확인 없는 참여 경로 닫기 — 기존 join_live_session 직접 호출 권한 회수
--
-- ▶ 반드시 새 코드(참여할 때 join_live_session_verified를 부르는 버전)를 배포한 뒤에 실행한다.
--    먼저 실행하면 이전 버전 화면의 학생 참여가 막힌다 (권한 오류). 문제가 생기면 rollback으로 바로 되돌릴 수 있다.
-- ▶ 하는 일: authenticated의 join_live_session(text) 실행 권한만 회수. 함수 본문·테이블·행은 그대로.
--    join_live_session_verified는 함수 소유자 권한으로 기존 함수를 계속 부를 수 있다.
-- ▶ 재실행: 이미 회수돼 있어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.


do $pre$
begin
  if to_regprocedure('public.join_live_session_verified(text,text,text)') is null
     or to_regprocedure('public.join_live_session(text)') is null then
    raise exception '6D2_PREFLIGHT: 6-D(1/2) join_live_session_verified를 먼저 적용해 주세요.';
  end if;
  if not has_function_privilege('authenticated', 'public.join_live_session_verified(text,text,text)', 'EXECUTE') then
    raise exception '6D2_PREFLIGHT: join_live_session_verified 실행 권한이 없어요. 6-D(1/2)를 확인해 주세요.';
  end if;
end;
$pre$;

revoke execute on function public.join_live_session(text) from public, anon, authenticated;

do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(checks): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;

/* ───────── 점검 1: 적용 상태 (데이터를 쓰지 않는다) ───────── */
do $checks$
declare
  fake uuid := '00000000-0000-4000-8000-00000000d0d0'; -- 존재하지 않는 사용자 (사전 확인 통과)
  r text := '';
  n int := 0;
  s text;
  e boolean;
  ok boolean;
  j jsonb;
begin
  -- 권한 (6-D2까지 적용된 상태)
  for s, e in
    select * from (values ('public.live_session_results(text)', true), ('public.my_live_session_history(text)', true),
                          ('public.join_live_session_verified(text,text,text)', true), ('public.join_live_session(text)', false),
                          ('public._live_can_view_results(text)', false), ('public._live_identity_matches(text,text)', false)) v(f, e)
  loop
  ok := coalesce(has_function_privilege('authenticated', s, 'EXECUTE') = e, false);
  r := r || format(E'\n%s authenticated 실행 권한 %s', case when ok then 'PASS' else 'FAIL' end, coalesce(s, ''));
  n := n + case when ok then 0 else 1 end;
  end loop;
  for s in select unnest(array['public.live_session_results(text)', 'public.my_live_session_history(text)', 'public.join_live_session_verified(text,text,text)', 'public.join_live_session(text)']) loop
  ok := coalesce(not has_function_privilege('anon', s, 'EXECUTE'), false);
  r := r || format(E'\n%s anon 실행 불가 %s', case when ok then 'PASS' else 'FAIL' end, coalesce(s, ''));
  n := n + case when ok then 0 else 1 end;
  end loop;

  -- 공백 정규식: PostgreSQL에서 컴파일되고 특수 공백(전각·줄바꿈 없는·폭 없는)을 지우는가 (글자 상수만)
  ok := coalesce(lower(regexp_replace('Kim' || chr(12288) || 'Hana' || chr(160) || chr(8203) || ' ', '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) = 'kimhana'
    and upper(regexp_replace('2024' || chr(160) || '00' || chr(65279) || '0001' || chr(9), '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) = '2024000001', false);
  r := r || format(E'\n%s 공백 정규식 동작 (전각·NBSP·폭 없는 공백)%s', case when ok then 'PASS' else 'FAIL' end, coalesce('', ''));
  n := n + case when ok then 0 else 1 end;

  -- 로그인한 '없는 사용자'로 거부 경로만 실행 — 모두 쓰기(참여 기록 insert) 전에 멈춘다:
  --   결과·목록: 읽기 전용 / 본인 확인: 코드 형식·회원정보 대조에서 거부(기존 참여 함수까지 가지 않음) / 기존 참여 함수: 실행 권한에서 거부
  perform set_config('request.jwt.claims', json_build_object('sub', fake, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fake::text, true);
  execute 'set local role authenticated';
  s := null; begin perform public.live_session_results('lqs-000000000000'); s := 'ok'; exception when others then s := sqlstate; end;
  ok := coalesce(s = 'P0002', false);
  r := r || format(E'\n%s 결과 조회: 없는 세션 P0002 → %s', case when ok then 'PASS' else 'FAIL' end, coalesce(s, ''));
  n := n + case when ok then 0 else 1 end;
  s := null; j := null; begin j := public.my_live_session_history('zz-no-course'); s := 'ok'; exception when others then s := sqlstate; end;
  ok := coalesce(s = 'ok' and j = '[]'::jsonb, false);
  r := r || format(E'\n%s 세션 목록: 담당 없음 빈 목록 → %s', case when ok then 'PASS' else 'FAIL' end, coalesce(s, ''));
  n := n + case when ok then 0 else 1 end;
  s := null; begin perform public.join_live_session_verified('ZZZZZZ', '가', '1'); s := 'ok'; exception when others then s := sqlstate; end;
  ok := coalesce(s = '22023', false);
  r := r || format(E'\n%s 본인 확인: 회원정보 없음 22023 → %s', case when ok then 'PASS' else 'FAIL' end, coalesce(s, ''));
  n := n + case when ok then 0 else 1 end;
  s := null; begin perform public.join_live_session_verified('bad', '가', '1'); s := 'ok'; exception when others then s := sqlstate; end;
  ok := coalesce(s = 'P0002', false);
  r := r || format(E'\n%s 본인 확인: 코드 형식 P0002 → %s', case when ok then 'PASS' else 'FAIL' end, coalesce(s, ''));
  n := n + case when ok then 0 else 1 end;
  s := null; begin perform public.join_live_session('ZZZZZZ'); s := 'ok'; exception when others then s := sqlstate; end;
  ok := coalesce(s = '42501', false);
  r := r || format(E'\n%s 우회 차단: 기존 참여 함수 직접 호출 42501 → %s', case when ok then 'PASS' else 'FAIL' end, coalesce(s, ''));
  n := n + case when ok then 0 else 1 end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- 가상 사용자 경로가 아무 행도 쓰지 않았다 (가상 값으로 된 행이 없다)
  ok := coalesce(not exists (select 1 from public.live_quiz_participants where user_id = fake)
    and not exists (select 1 from public.live_quiz_responses where user_id = fake)
    and not exists (select 1 from public.live_quiz_sessions where id = 'lqs-000000000000' or join_code = 'ZZZZZZ'), false);
  r := r || format(E'\n%s 가상 사용자 경로에서 쓰기 없음%s', case when ok then 'PASS' else 'FAIL' end, coalesce('', ''));
  n := n + case when ok then 0 else 1 end;

  -- 다음 블록(되돌리기 점검)으로 결과를 넘긴다 (이 트랜잭션 안에서만 유지)
  perform set_config('dryrun.report', r, true);
  perform set_config('dryrun.fail', n::text, true);
end;
$checks$;

do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(rollback-1): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;

-- ═════ rollback/20261128090100_phase_6d2_revoke_legacy_join.down.sql (begin/commit 줄 제외, 본문 그대로) ═════
-- Phase 6-D2 되돌리기: join_live_session(text) 실행 권한을 authenticated에 다시 준다 (6-B 상태)
-- ▶ 언제: 6-D2 뒤 이전 버전 화면에서 학생 참여가 막힐 때 (코드 되돌리기와 함께)
-- ▶ 데이터 변경 없음. 재실행해도 된다.


grant execute on function public.join_live_session(text) to authenticated;

do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(rollback-2): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;

-- ═════ rollback/20261128090000_phase_6d_live_join_verified.down.sql (begin/commit 줄 제외, 본문 그대로) ═════
-- Phase 6-D(1/2) 되돌리기: 본인 확인 참여 함수 2개 제거
-- ▶ 먼저 6-D2 rollback(기존 참여 함수 권한 복구)과 이전 버전 코드가 반영돼 있어야 한다 — 아니면 학생 참여 경로가 없어진다.
-- ▶ 데이터 변경 없음 (6-D는 저장하는 데이터가 없다). 재실행해도 된다.


do $pre$
begin
  if to_regprocedure('public.join_live_session(text)') is not null
     and not has_function_privilege('authenticated', 'public.join_live_session(text)', 'EXECUTE') then
    raise exception '6D_ROLLBACK: 먼저 6-D2 rollback으로 join_live_session 권한을 복구해 주세요.';
  end if;
end;
$pre$;

drop function if exists public.join_live_session_verified(text, text, text);
drop function if exists public._live_identity_matches(text, text);

do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(rollback-3): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;

-- ═════ rollback/20261127090000_phase_6c_live_quiz_results.down.sql (begin/commit 줄 제외, 본문 그대로) ═════
-- Phase 6-C 되돌리기 (20261127090000_phase_6c_live_quiz_results.sql)
--
-- ▶ 하는 일: 6-C 결과 조회 함수 3개 제거
-- ▶ 하지 않는 일: 테이블·행·6-A/6-B 함수 변경 없음 (6-C는 저장하는 데이터가 없다)
-- ▶ 재실행: 함수가 이미 없어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.


drop function if exists public.live_session_results(text);
drop function if exists public.my_live_session_history(text);
drop function if exists public._live_can_view_results(text);

do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(final): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;

/* ───────── 점검 2: 되돌리기 상태 + 보고 (이 오류로 전체 취소) ───────── */
do $dryrun$
declare
  r text := coalesce(current_setting('dryrun.report', true), '');
  -- 점검 1 결과가 없으면(NULL·빈 값) 실패로 센다
  n int := coalesce(nullif(current_setting('dryrun.fail', true), '')::int, 99);
  left_fns text;
  ok boolean;
  passes int;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into left_fns
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_live_can_view_results', 'my_live_session_history', 'live_session_results', '_live_identity_matches', 'join_live_session_verified');
  ok := coalesce(left_fns is null, false);
  r := r || format(E'\n%s 되돌리기 후 6-C·6-D 함수 없음%s', case when ok then 'PASS' else 'FAIL' end, coalesce(' ' || left_fns, ''));
  n := n + case when ok then 0 else 1 end;
  ok := coalesce(has_function_privilege('authenticated', 'public.join_live_session(text)', 'EXECUTE'), false);
  r := r || format(E'\n%s 되돌리기 후 기존 참여 함수 권한 복구%s', case when ok then 'PASS' else 'FAIL' end, coalesce('', ''));
  n := n + case when ok then 0 else 1 end;
  -- 줄 수 확인: 점검이 빠지거나 더 생기면 실패 (PASS 19줄이어야 한다)
  passes := (select count(*) from regexp_matches(r, E'\nPASS ', 'g'));
  if passes is distinct from 19 then
    n := n + 1;
    r := r || format(E'\nFAIL PASS 줄 수 %s (기대 19)', coalesce(passes::text, 'NULL'));
  end if;
  raise exception 'DRYRUN_6CD_REPORT: FAIL %건 — 이 오류로 모든 변경이 취소됐어요.%', coalesce(n, 99), r;
end;
$dryrun$;

rollback;

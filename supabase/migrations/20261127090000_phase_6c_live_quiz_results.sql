-- Phase 6-C: 실시간 퀴즈 결과 조회 (교수자 전용, 종료된 세션)
--
-- ▶ 하는 일: 결과 조회 함수 3개만 추가한다. 테이블·열·기존 함수·기존 행은 바꾸지 않는다 (6-B 기록 그대로 호환).
--    - _live_can_view_results(section): 이 분반 담당 교수자인가 (운영 중 과목, 분반 운영 여부와 무관 — 학기 뒤에도 기록 조회)
--    - my_live_session_history(course): 이 과목에서 내가 볼 수 있는 세션 목록 (진행 중 + 종료)
--    - live_session_results(session): 종료된 세션의 학생별 응답·점수, 문항별 정답률·응답 분포, 중복 학번
-- ▶ 개인정보: 회원정보(profiles)의 이름·학번만 읽어 결과에 넣는다. 이메일·전화·사용자 id는 돌려주지 않는다(행 key는 순번).
--    결과를 따로 저장하지 않는다 (개인정보 중복 저장 없음). 관리자 계정은 auth 사용자가 아니어서 호출할 수 없다.
-- ▶ 재실행: 같은 이름·인자의 함수는 create or replace. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

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

commit;

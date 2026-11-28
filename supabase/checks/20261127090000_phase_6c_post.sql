-- Phase 6-C 적용 후 점검 (읽기 전용). 블록마다 따로 실행한다.

-- [1] 함수 권한·보안 설정 (3행)
select p.proname, p.prosecdef as security_definer, array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('_live_can_view_results', 'my_live_session_history', 'live_session_results')
 order by p.proname;
-- 기대: 세 행 모두 security_definer = true, config = search_path="", anon_exec = false, service_exec = false
--       auth_exec: _live_can_view_results = false, my_live_session_history = true, live_session_results = true

-- [2] 6-B 테이블은 그대로 (행 수가 적용 전과 같아야 한다 — 6-C는 행을 바꾸지 않는다)
select (select count(*) from public.live_quiz_sessions) as sessions,
       (select count(*) from public.live_quiz_participants) as participants,
       (select count(*) from public.live_quiz_responses) as responses;

-- [3] 로그인 없이 호출하면 거부 (SQL 편집기의 postgres 역할에는 auth.uid()가 없다)
-- select public.live_session_results('lqs-000000000000');
-- 기대: ERROR: not authenticated

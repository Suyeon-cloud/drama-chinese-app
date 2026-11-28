-- Phase 6-D 점검 (읽기 전용). 6-D(1/2) 뒤, 6-D2 뒤 각각 실행한다.

-- [1] 참여 함수 권한·보안 설정
select p.oid::regprocedure as fn, p.prosecdef as security_definer, array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('join_live_session', 'join_live_session_verified', '_live_identity_matches')
 order by p.proname;
-- 기대 (6-D 1/2 뒤): join_live_session auth_exec = true (이전 코드 호환), join_live_session_verified = true, _live_identity_matches = false
-- 기대 (6-D2 뒤):    join_live_session auth_exec = false, join_live_session_verified = true, _live_identity_matches = false
-- 모두 anon_exec = false, security_definer = true, config = search_path=""

-- [2] 기존 기록 그대로 (적용 전과 같은 수 — 6-D는 행을 바꾸지 않는다)
select (select count(*) from public.live_quiz_sessions) as sessions,
       (select count(*) from public.live_quiz_participants) as participants,
       (select count(*) from public.live_quiz_responses) as responses;

-- [3] 새 열·테이블 없음: live_quiz_participants 열이 6-B와 같다
select string_agg(column_name, ',' order by ordinal_position) as participant_columns
  from information_schema.columns where table_schema = 'public' and table_name = 'live_quiz_participants';
-- 기대: session_id,user_id,joined_at

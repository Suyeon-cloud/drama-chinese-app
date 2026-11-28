-- Phase 6-C·6-D dry-run 전후 상태 확인 (읽기 전용 — select만). dry-run 실행 '전'과 '후'에 같은 블록을 실행해 값을 비교한다.
-- 회원 개인정보(이름·학번·이메일)는 읽지 않는다. 행 수와 함수·권한의 지문(md5)만 본다.

-- [1] 전제: 6-B가 적용돼 있고, 6-C·6-D 함수는 아직 없다
select
  to_regprocedure('public.join_live_session(text)') is not null                    as has_6b_join,          -- 기대: true
  has_function_privilege('authenticated', 'public.join_live_session(text)', 'EXECUTE') as legacy_join_granted, -- 기대: true
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_live_can_view_results', 'my_live_session_history', 'live_session_results',
                       '_live_identity_matches', 'join_live_session_verified'))     as new_6cd_functions;   -- 기대: 0

-- [2] public 함수 지문: 이름·인자·권한·본문 — dry-run 전후 값이 '완전히 같아야' 한다
select count(*) as public_functions,
       md5(string_agg(p.oid::regprocedure::text || ':' || coalesce(array_to_string(p.proacl, ','), '') || ':' || md5(p.prosrc),
                      '|' order by p.oid::regprocedure::text)) as functions_fingerprint
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace;

-- [3] 실시간 퀴즈 기록 행 수 — 전후 같아야 한다 (dry-run은 행을 쓰지 않는다. 실제 수업이 진행 중이면 그만큼 늘 수 있다)
select (select count(*) from public.live_quiz_sessions)     as sessions,
       (select count(*) from public.live_quiz_participants) as participants,
       (select count(*) from public.live_quiz_responses)    as responses;

-- [4] 끝나지 않은 트랜잭션이 남아 있지 않은가 (dry-run 뒤) — 이 SQL Editor 연결의 idle in transaction 상태 확인
select count(*) as idle_in_transaction
  from pg_stat_activity
 where datname = current_database() and state like 'idle in transaction%';
-- 기대: 0 (1 이상이면 SQL Editor에서 'rollback;' 한 줄만 실행하고 다시 확인)

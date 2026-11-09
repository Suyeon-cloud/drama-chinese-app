-- Phase 6-B 되돌리기 (20261112090000_phase_6b_live_quiz_sessions.sql)
--
-- ▶ 자료 보호: 세션·참여·응답 기록이 하나라도 있으면 전체를 취소한다. 기록이 비어 있을 때만 테이블을 지운다.
-- ▶ 하는 일: 6-B 함수 제거, live_quiz_responses · live_quiz_participants · live_quiz_sessions 제거 (비어 있을 때)
-- ▶ 하지 않는 일: 6-A 문제 세트·다른 테이블·함수 변경 없음
-- ▶ 재실행: 6-B 객체가 이미 없어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

do $$
declare
  v_has boolean;
  t text;
begin
  foreach t in array array['live_quiz_sessions', 'live_quiz_participants', 'live_quiz_responses'] loop
    if to_regclass('public.' || t) is not null then
      execute format('lock table public.%I in access exclusive mode', t);
      execute format('select exists (select 1 from public.%I)', t) into v_has;
      if v_has then
        raise exception '6B_ROLLBACK: 실시간 퀴즈 세션 기록(%)이 남아 있어 되돌리지 않았어요.', t;
      end if;
    end if;
  end loop;
end;
$$;

drop function if exists public.submit_live_answer(text, integer, integer);
drop function if exists public.live_session_student_state(text);
drop function if exists public.join_live_session(text);
drop function if exists public.my_live_host_sessions(text);
drop function if exists public.live_session_host_state(text);
drop function if exists public.live_session_control(text, text, integer);
drop function if exists public.start_live_session(text, text);
drop function if exists public._live_student_json(text, uuid);
drop function if exists public._live_host_json(text);
drop function if exists public._live_can_host(text);
drop function if exists public._live_join_code();

drop table if exists public.live_quiz_responses;
drop table if exists public.live_quiz_participants;
drop table if exists public.live_quiz_sessions;

commit;

-- Phase 6-C 되돌리기 (20261127090000_phase_6c_live_quiz_results.sql)
--
-- ▶ 하는 일: 6-C 결과 조회 함수 3개 제거
-- ▶ 하지 않는 일: 테이블·행·6-A/6-B 함수 변경 없음 (6-C는 저장하는 데이터가 없다)
-- ▶ 재실행: 함수가 이미 없어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

drop function if exists public.live_session_results(text);
drop function if exists public.my_live_session_history(text);
drop function if exists public._live_can_view_results(text);

commit;

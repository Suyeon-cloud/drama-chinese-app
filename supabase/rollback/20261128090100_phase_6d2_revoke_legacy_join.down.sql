-- Phase 6-D2 되돌리기: join_live_session(text) 실행 권한을 authenticated에 다시 준다 (6-B 상태)
-- ▶ 언제: 6-D2 뒤 이전 버전 화면에서 학생 참여가 막힐 때 (코드 되돌리기와 함께)
-- ▶ 데이터 변경 없음. 재실행해도 된다.

begin;

grant execute on function public.join_live_session(text) to authenticated;

commit;

-- Phase 6-D(1/2) 되돌리기: 본인 확인 참여 함수 2개 제거
-- ▶ 먼저 6-D2 rollback(기존 참여 함수 권한 복구)과 이전 버전 코드가 반영돼 있어야 한다 — 아니면 학생 참여 경로가 없어진다.
-- ▶ 데이터 변경 없음 (6-D는 저장하는 데이터가 없다). 재실행해도 된다.

begin;

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

commit;

-- Phase 6-D (2/2): 본인 확인 없는 참여 경로 닫기 — 기존 join_live_session 직접 호출 권한 회수
--
-- ▶ 반드시 새 코드(참여할 때 join_live_session_verified를 부르는 버전)를 배포한 뒤에 실행한다.
--    먼저 실행하면 이전 버전 화면의 학생 참여가 막힌다 (권한 오류). 문제가 생기면 rollback으로 바로 되돌릴 수 있다.
-- ▶ 하는 일: authenticated의 join_live_session(text) 실행 권한만 회수. 함수 본문·테이블·행은 그대로.
--    join_live_session_verified는 함수 소유자 권한으로 기존 함수를 계속 부를 수 있다.
-- ▶ 재실행: 이미 회수돼 있어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

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

commit;

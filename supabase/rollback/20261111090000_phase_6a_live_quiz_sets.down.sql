-- Phase 6-A 되돌리기 (20261111090000_phase_6a_live_quiz_sets.sql)
--
-- ▶ 자료 보호: 실시간 퀴즈 세트가 하나라도 있으면 전체를 취소한다. 세트·문제를 지우는 문장은 테이블 제거뿐이고, 비어 있을 때만 실행된다.
-- ▶ 하는 일: 6-A 함수 제거, live_quiz_questions · live_quiz_sets 테이블 제거 (비어 있을 때)
-- ▶ 하지 않는 일: 다른 테이블·함수 변경 없음
-- ▶ 재실행: 6-A 객체가 이미 없어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

do $$
declare
  v_has boolean;
begin
  if to_regclass('public.live_quiz_sets') is not null then
    execute 'lock table public.live_quiz_sets in access exclusive mode';
    execute 'select exists (select 1 from public.live_quiz_sets)' into v_has;
    if v_has then
      raise exception '6A_ROLLBACK: 실시간 퀴즈 문제 세트가 남아 있어 되돌리지 않았어요. (먼저 화면에서 정리하세요)';
    end if;
  end if;
  if to_regclass('public.live_quiz_questions') is not null then
    execute 'lock table public.live_quiz_questions in access exclusive mode';
    execute 'select exists (select 1 from public.live_quiz_questions)' into v_has;
    if v_has then
      raise exception '6A_ROLLBACK: 실시간 퀴즈 문제가 남아 있어 되돌리지 않았어요.';
    end if;
  end if;
end;
$$;

drop function if exists public.admin_delete_live_quiz_set(text);
drop function if exists public.admin_save_live_quiz_set(text, text, jsonb, integer, text);
drop function if exists public.admin_list_live_quiz_sets(text);
drop function if exists public.delete_live_quiz_set(text);
drop function if exists public.save_live_quiz_set(text, text, jsonb, integer);
drop function if exists public.list_live_quiz_sets(text);
drop function if exists public._delete_live_quiz_set(text, boolean);
drop function if exists public._save_live_quiz_set(text, text, jsonb, integer, uuid, text, boolean);
drop function if exists public._live_quiz_sets_json(text);
drop function if exists public._live_quiz_norm(text);

drop table if exists public.live_quiz_questions;
drop table if exists public.live_quiz_sets;

commit;

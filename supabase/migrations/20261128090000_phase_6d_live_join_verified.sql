-- Phase 6-D (1/2): 실시간 퀴즈 참여 — DB에서도 실명·학번을 회원정보와 대조
--
-- ▶ 하는 일: 함수 2개 추가
--    - _live_identity_matches(name, student_id): 로그인한 본인의 회원정보(profiles)와 같은가 (내부용)
--    - join_live_session_verified(code, name, student_id): 대조에 통과해야 기존 join_live_session으로 참여
-- ▶ 하지 않는 일: 테이블·열·행 변경 없음, 입력한 실명·학번을 저장하지 않는다. 기존 join_live_session은 그대로 둔다
--    (지금 Production 코드가 쓰고 있다 — 새 코드 배포 뒤 6-D2가 직접 호출 권한을 거둔다).
-- ▶ 규칙(JSON 모드 서버와 같다): 이름은 공백 제거·소문자, 학번은 공백 제거·대문자로 비교. 회원정보에 이름·학번이 비어 있으면 불일치.
--    틀리면 어느 칸인지 알리지 않는다. 본인 확인은 세션을 찾기 전에 한다(틀린 입력으로 세션 존재 여부를 알 수 없다).
-- ▶ 재실행: create or replace. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

/* ───────── 0) 사전 확인 ───────── */
do $pre$
declare
  v_actual text;
begin
  if to_regprocedure('public.join_live_session(text)') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_instructor()') is null
     or to_regprocedure('public.my_enrolled_section_ids()') is null then
    raise exception '6D_PREFLIGHT: 6-B 참여 함수 또는 회원정보·교수자·수강 함수가 없어요.';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_live_identity_matches', 'join_live_session_verified')
     and p.oid <> all (array_remove(array[
       to_regprocedure('public._live_identity_matches(text,text)'),
       to_regprocedure('public.join_live_session_verified(text,text,text)')
     ]::oid[], null));
  if v_actual is not null then
    raise exception '6D_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;
end;
$pre$;

/* ───────── 1) 본인 회원정보와 대조 (내부용) ───────── */
create or replace function public._live_identity_matches(p_name text, p_student_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles pr
     where pr.id = (select auth.uid())
       and lower(regexp_replace(pr.name, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) <> ''
       and upper(regexp_replace(pr.student_id, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) <> ''
       and lower(regexp_replace(pr.name, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) = lower(regexp_replace(coalesce(p_name, ''), '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g'))
       and upper(regexp_replace(pr.student_id, '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g')) = upper(regexp_replace(coalesce(p_student_id, ''), '[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]', '', 'g'))
  );
$$;

/* ───────── 2) 본인 확인 후 참여 ───────── */
create or replace function public.join_live_session_verified(p_code text, p_name text, p_student_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_sid text := btrim(coalesce(p_student_id, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- 코드 형식이 틀리거나 교수자 계정이면 '없는 코드'와 같게 (교수자는 학생으로 참여하지 않는다)
  if upper(btrim(coalesce(p_code, ''))) !~ '^[A-HJ-NP-Z2-9]{6}$' or public.is_instructor() then
    raise exception '참여 코드를 찾을 수 없어요. 코드와 수강 중인 분반을 확인해 주세요.' using errcode = 'P0002';
  end if;
  if v_name = '' or v_sid = '' then
    raise exception '실명과 학번을 입력해 주세요.' using errcode = '22023';
  end if;
  if char_length(v_name) > 50 or char_length(v_sid) > 30 then
    raise exception '실명과 학번을 다시 확인해 주세요.' using errcode = '22023';
  end if;
  if not public._live_identity_matches(v_name, v_sid) then
    raise exception '입력한 실명·학번이 회원정보와 일치하지 않아요. 회원정보에 등록한 이름과 학번을 입력해 주세요.' using errcode = '22023';
  end if;
  -- 통과: 기존 참여 규칙(운영 중 세션 · 승인된 분반 수강생 · 참여 기록 1행) 그대로
  return public.join_live_session(p_code);
end;
$$;

/* ───────── 3) 함수 권한: 사용자는 확인 후 참여 함수만 (기존 join_live_session 권한은 6-D2에서 거둔다) ───────── */
revoke all on function public._live_identity_matches(text, text) from public, anon, authenticated, service_role;
revoke all on function public.join_live_session_verified(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.join_live_session_verified(text, text, text) to authenticated;

commit;

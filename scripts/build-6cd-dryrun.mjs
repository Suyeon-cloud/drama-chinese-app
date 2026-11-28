// 6-C·6-D·6-D2 운영 사전 점검(dry-run) SQL 만들기: 실제 migration·rollback 파일 본문을 그대로 넣고(begin/commit 줄만 뺀다)
// 한 트랜잭션 안에서 실행한 뒤 일부러 오류를 내서 모두 취소한다. migration·rollback을 고치면 이 스크립트를 다시 실행한다.
//   node scripts/build-6cd-dryrun.mjs
import { readFileSync, writeFileSync } from "node:fs";

const MIG = [
  "migrations/20261127090000_phase_6c_live_quiz_results.sql",
  "migrations/20261128090000_phase_6d_live_join_verified.sql",
  "migrations/20261128090100_phase_6d2_revoke_legacy_join.sql",
];
// 되돌리기는 적용의 반대 순서
const DOWN = [
  "rollback/20261128090100_phase_6d2_revoke_legacy_join.down.sql",
  "rollback/20261128090000_phase_6d_live_join_verified.down.sql",
  "rollback/20261127090000_phase_6c_live_quiz_results.down.sql",
];
export const sqlBody = (file) =>
  readFileSync(`supabase/${file}`, "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "begin;" && l.trim() !== "commit;")
    .join("\n")
    .trim();

// 6-D migration에 쓰인 공백 집합 (정규식이 PostgreSQL에서 컴파일·동작하는지 글자 상수로만 확인한다 — 회원 데이터 미사용)
const spaceClass = /regexp_replace\(pr\.name, '([^']+)'/.exec(sqlBody(MIG[1]))[1];

// 트랜잭션 밖에서 실행되면(일부만 선택해 실행 등) 다음 단계로 가지 않는다
const guard = (step) => `
do $guard$ begin
  if current_setting('dryrun.guard', true) is distinct from 'on' then
    raise exception 'DRYRUN_GUARD(${step}): dry-run 트랜잭션 밖이에요. 파일 전체를 선택 없이 한 번에 실행해 주세요.';
  end if;
end $guard$;
`;

const head = `-- Phase 6-C·6-D·6-D2 운영 사전 점검 (dry-run) — 자동 생성 파일: node scripts/build-6cd-dryrun.mjs (직접 고치지 않는다)
--
-- ▶ 목적: 운영 DB의 실제 상태에서 세 migration(사전 확인·함수 생성·권한 변경)과 세 rollback이 오류 없이 되는지 확인한다.
-- ▶ 남는 것 없음: 한 트랜잭션 안에서 실행하고, 마지막 블록이 '일부러' 오류를 내서 전체가 취소된다(맨 끝 rollback도 둔다).
--    이 파일에는 commit이 없다. 결과는 SQL Editor의 오류 메시지 'DRYRUN_6CD_REPORT: …'로 보인다.
-- ▶ 운영 데이터를 쓰지 않고 실제 회원정보를 쓰지 않는다: 존재하지 않는 사용자 id로 '없음·거부' 경로만 실행하고,
--    공백 정규식은 글자 상수로만 확인한다.
-- ▶ 잠금: 테이블 잠금 없음(함수 생성·함수 권한만). lock_timeout 2초 — 다른 DDL과 겹치면 기다리지 않고 실패(취소)한다.
-- ▶ 반드시 파일 전체를 선택 없이 한 번에 실행한다. 일부만 실행되면 단계마다 있는 guard가 멈춘다.

begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('dryrun.guard', 'on', true) as dryrun_guard;
`;

// 점검에 쓰는 가상 값 (운영 데이터에 있으면 실행 전에 중단한다)
const FAKE_UID = "00000000-0000-4000-8000-00000000d0d0";
const FAKE_SESSION = "lqs-000000000000";
const FAKE_COURSE = "zz-no-course";
const FAKE_CODE = "ZZZZZZ";
/** 기대 PASS 줄 수: 권한 6 · anon 4 · 정규식 1 · 거부 경로 5 · 쓰기 없음 1 · 되돌리기 2 */
const EXPECTED_PASS = 19;

// 판정은 모두 coalesce(조건, false): 결과가 NULL이면 FAIL로 센다
const line = (label, cond, detail = "''") =>
  `  ok := coalesce(${cond}, false);
  r := r || format(E'\\n%s ${label}%s', case when ok then 'PASS' else 'FAIL' end, coalesce(${detail}, ''));
  n := n + case when ok then 0 else 1 end;`;

const fakeIds = `
/* ───────── 가상 값 사전 확인: 운영 데이터에 같은 값이 있으면 즉시 중단 (존재 여부만 읽는다) ───────── */
do $fakeids$
declare
  hit text := '';
begin
  if exists (select 1 from auth.users where id = '${FAKE_UID}') then hit := hit || ' auth.users'; end if;
  if exists (select 1 from public.profiles where id = '${FAKE_UID}') then hit := hit || ' profiles'; end if;
  if exists (select 1 from public.instructors where user_id = '${FAKE_UID}') then hit := hit || ' instructors'; end if;
  if exists (select 1 from public.enrollments where user_id = '${FAKE_UID}') then hit := hit || ' enrollments'; end if;
  if exists (select 1 from public.live_quiz_participants where user_id = '${FAKE_UID}') then hit := hit || ' participants'; end if;
  if exists (select 1 from public.live_quiz_responses where user_id = '${FAKE_UID}') then hit := hit || ' responses'; end if;
  if exists (select 1 from public.live_quiz_sessions where id = '${FAKE_SESSION}' or join_code = '${FAKE_CODE}') then hit := hit || ' live_quiz_sessions'; end if;
  if exists (select 1 from public.courses where id = '${FAKE_COURSE}') then hit := hit || ' courses'; end if;
  if hit <> '' then
    raise exception 'DRYRUN_FAKE_ID_EXISTS: 점검용 가상 값이 운영 데이터에 있어요(%). 실행을 중단했어요 — 이 메시지를 보내 주세요.', hit;
  end if;
end $fakeids$;
`;

const checks = `${guard("checks")}
/* ───────── 점검 1: 적용 상태 (데이터를 쓰지 않는다) ───────── */
do $checks$
declare
  fake uuid := '${FAKE_UID}'; -- 존재하지 않는 사용자 (사전 확인 통과)
  r text := '';
  n int := 0;
  s text;
  e boolean;
  ok boolean;
  j jsonb;
begin
  -- 권한 (6-D2까지 적용된 상태)
  for s, e in
    select * from (values ('public.live_session_results(text)', true), ('public.my_live_session_history(text)', true),
                          ('public.join_live_session_verified(text,text,text)', true), ('public.join_live_session(text)', false),
                          ('public._live_can_view_results(text)', false), ('public._live_identity_matches(text,text)', false)) v(f, e)
  loop
${line("authenticated 실행 권한 ", "has_function_privilege('authenticated', s, 'EXECUTE') = e", "s")}
  end loop;
  for s in select unnest(array['public.live_session_results(text)', 'public.my_live_session_history(text)', 'public.join_live_session_verified(text,text,text)', 'public.join_live_session(text)']) loop
${line("anon 실행 불가 ", "not has_function_privilege('anon', s, 'EXECUTE')", "s")}
  end loop;

  -- 공백 정규식: PostgreSQL에서 컴파일되고 특수 공백(전각·줄바꿈 없는·폭 없는)을 지우는가 (글자 상수만)
${line(
  "공백 정규식 동작 (전각·NBSP·폭 없는 공백)",
  `lower(regexp_replace('Kim' || chr(12288) || 'Hana' || chr(160) || chr(8203) || ' ', '${spaceClass}', '', 'g')) = 'kimhana'
    and upper(regexp_replace('2024' || chr(160) || '00' || chr(65279) || '0001' || chr(9), '${spaceClass}', '', 'g')) = '2024000001'`,
)}

  -- 로그인한 '없는 사용자'로 거부 경로만 실행 — 모두 쓰기(참여 기록 insert) 전에 멈춘다:
  --   결과·목록: 읽기 전용 / 본인 확인: 코드 형식·회원정보 대조에서 거부(기존 참여 함수까지 가지 않음) / 기존 참여 함수: 실행 권한에서 거부
  perform set_config('request.jwt.claims', json_build_object('sub', fake, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fake::text, true);
  execute 'set local role authenticated';
  s := null; begin perform public.live_session_results('${FAKE_SESSION}'); s := 'ok'; exception when others then s := sqlstate; end;
${line("결과 조회: 없는 세션 P0002 → ", "s = 'P0002'", "s")}
  s := null; j := null; begin j := public.my_live_session_history('${FAKE_COURSE}'); s := 'ok'; exception when others then s := sqlstate; end;
${line("세션 목록: 담당 없음 빈 목록 → ", "s = 'ok' and j = '[]'::jsonb", "s")}
  s := null; begin perform public.join_live_session_verified('${FAKE_CODE}', '가', '1'); s := 'ok'; exception when others then s := sqlstate; end;
${line("본인 확인: 회원정보 없음 22023 → ", "s = '22023'", "s")}
  s := null; begin perform public.join_live_session_verified('bad', '가', '1'); s := 'ok'; exception when others then s := sqlstate; end;
${line("본인 확인: 코드 형식 P0002 → ", "s = 'P0002'", "s")}
  s := null; begin perform public.join_live_session('${FAKE_CODE}'); s := 'ok'; exception when others then s := sqlstate; end;
${line("우회 차단: 기존 참여 함수 직접 호출 42501 → ", "s = '42501'", "s")}
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- 가상 사용자 경로가 아무 행도 쓰지 않았다 (가상 값으로 된 행이 없다)
${line(
  "가상 사용자 경로에서 쓰기 없음",
  `not exists (select 1 from public.live_quiz_participants where user_id = fake)
    and not exists (select 1 from public.live_quiz_responses where user_id = fake)
    and not exists (select 1 from public.live_quiz_sessions where id = '${FAKE_SESSION}' or join_code = '${FAKE_CODE}')`,
)}

  -- 다음 블록(되돌리기 점검)으로 결과를 넘긴다 (이 트랜잭션 안에서만 유지)
  perform set_config('dryrun.report', r, true);
  perform set_config('dryrun.fail', n::text, true);
end;
$checks$;
`;

const final = `${guard("final")}
/* ───────── 점검 2: 되돌리기 상태 + 보고 (이 오류로 전체 취소) ───────── */
do $dryrun$
declare
  r text := coalesce(current_setting('dryrun.report', true), '');
  -- 점검 1 결과가 없으면(NULL·빈 값) 실패로 센다
  n int := coalesce(nullif(current_setting('dryrun.fail', true), '')::int, 99);
  left_fns text;
  ok boolean;
  passes int;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into left_fns
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_live_can_view_results', 'my_live_session_history', 'live_session_results', '_live_identity_matches', 'join_live_session_verified');
${line("되돌리기 후 6-C·6-D 함수 없음", "left_fns is null", "' ' || left_fns")}
${line("되돌리기 후 기존 참여 함수 권한 복구", "has_function_privilege('authenticated', 'public.join_live_session(text)', 'EXECUTE')")}
  -- 줄 수 확인: 점검이 빠지거나 더 생기면 실패 (PASS ${EXPECTED_PASS}줄이어야 한다)
  passes := (select count(*) from regexp_matches(r, E'\\nPASS ', 'g'));
  if passes is distinct from ${EXPECTED_PASS} then
    n := n + 1;
    r := r || format(E'\\nFAIL PASS 줄 수 %s (기대 ${EXPECTED_PASS})', coalesce(passes::text, 'NULL'));
  end if;
  raise exception 'DRYRUN_6CD_REPORT: FAIL %건 — 이 오류로 모든 변경이 취소됐어요.%', coalesce(n, 99), r;
end;
$dryrun$;

rollback;
`;

const part = (f, label) => `${guard(label)}\n-- ═════ ${f} (begin/commit 줄 제외, 본문 그대로) ═════\n${sqlBody(f)}\n`;
const out =
  head +
  fakeIds +
  MIG.map((f, i) => part(f, `apply-${i + 1}`)).join("") +
  checks +
  DOWN.map((f, i) => part(f, `rollback-${i + 1}`)).join("") +
  final;
writeFileSync("supabase/checks/20261128090000_phase_6cd_production_dryrun.sql", out);
console.log("written", out.split("\n").length, "lines; space class:", spaceClass);

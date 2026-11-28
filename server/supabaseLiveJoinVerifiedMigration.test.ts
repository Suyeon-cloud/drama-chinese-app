// Phase 6-D 마이그레이션(실시간 퀴즈 참여 본인 확인) 정적 검사 + 우회 차단 + JSON 모드와 규칙·문구 일치 (npm test). DB에 연결하지 않는다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIVE_IDENTITY_INVALID,
  LIVE_IDENTITY_MISMATCH,
  LIVE_IDENTITY_REQUIRED,
  LIVE_JOIN_NOT_FOUND,
  LIVE_NAME_MAX,
  LIVE_SPACE_SQL,
  LIVE_STUDENT_ID_MAX,
  matchesMemberIdentity,
} from "../src/content/liveSession";
import { liveSessionOps } from "./liveQuizRows";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const D6 = "20261128090000_phase_6d_live_join_verified.sql";
const D62 = "20261128090100_phase_6d2_revoke_legacy_join.sql";
const code = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();
const A = code(read(path.join(MIG_DIR, D6)));
const B = code(read(path.join(MIG_DIR, D62)));
const DOWN_A = code(read(path.join("supabase", "rollback", D6.replace(".sql", ".down.sql"))));
const DOWN_B = code(read(path.join("supabase", "rollback", D62.replace(".sql", ".down.sql"))));
const fn = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `함수 없음: ${name}`);
  return src.slice(start, src.indexOf("\n$$;", start) + 4);
};

test("6-D: 6-C 뒤 두 파일(추가 → 권한 회수) 순서, 각각 한 트랜잭션·사전 확인 먼저, 테이블·행 변경 없음", () => {
  assert.deepEqual(migFiles.slice(-3), ["20261127090000_phase_6c_live_quiz_results.sql", D6, D62]);
  for (const src of [A, B]) {
    assert.match(src, /^begin;\n/);
    assert.match(src, /\ncommit;$/);
    assert.equal([...src.matchAll(/^(begin|commit|rollback);$/gm)].length, 2);
    assert.ok(src.indexOf("do $pre$") >= 0);
    assert.doesNotMatch(src, /\b(create|alter|drop)\s+table\b|\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b|\badd\s+column\b/i);
  }
  assert.ok(A.indexOf("do $pre$") < A.indexOf("create or replace function"));
  assert.deepEqual([...A.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]), ["_live_identity_matches", "join_live_session_verified"]);
  assert.doesNotMatch(B, /create or replace function/, "6-D2는 권한만 바꾼다");
});

test("6-D 본인 확인 함수: security definer·search_path, 로그인·코드 형식·교수자 거부, 입력 확인, 회원정보 대조가 기존 참여보다 먼저, 입력값 저장 없음", () => {
  for (const name of ["_live_identity_matches", "join_live_session_verified"]) {
    const body = fn(A, name);
    assert.match(body, /security definer/, name);
    assert.match(body, /set search_path = ''/, name);
  }
  const v = fn(A, "join_live_session_verified");
  const order = ["auth.uid() is null", "public.is_instructor()", "v_name = '' or v_sid = ''", "char_length(v_name) > 50", "public._live_identity_matches(", "return public.join_live_session(p_code)"];
  const idx = order.map((s) => v.indexOf(s));
  assert.ok(idx.every((i) => i > 0), `순서 확인: ${idx}`);
  assert.deepEqual([...idx].sort((a, b) => a - b), idx, "로그인 → 코드·교수자 → 입력 → 대조 → 기존 참여 순서");
  assert.match(v, /\^\[A-HJ-NP-Z2-9\]\{6\}\$/, "참여 코드 형식 (JSON 모드 isJoinCode와 같음)");
  // 입력값은 비교에만 — 어디에도 저장하지 않는다
  assert.doesNotMatch(v, /insert|update|p_name\s*\)?\s*,\s*p_student_id\)\s*values/i);
  const m = fn(A, "_live_identity_matches");
  assert.match(m, /pr\.id = \(select auth\.uid\(\)\)/, "본인 회원정보만");
  assert.ok(m.includes(`lower(regexp_replace(pr.name, '${LIVE_SPACE_SQL}', '', 'g'))`));
  assert.ok(m.includes(`upper(regexp_replace(pr.student_id, '${LIVE_SPACE_SQL}', '', 'g'))`));
  assert.ok(!/'\\s'/.test(m), "로캘에 따라 달라지는 \\s만 쓰지 않는다");
  assert.match(m, /<> ''/, "회원정보가 비어 있으면 불일치");
});

test("6-D와 JSON 모드: 오류 문구·길이 제한이 같다", () => {
  const v = fn(A, "join_live_session_verified");
  assert.ok(v.includes(`'${LIVE_JOIN_NOT_FOUND}' using errcode = 'P0002'`));
  assert.ok(v.includes(`'${LIVE_IDENTITY_REQUIRED}' using errcode = '22023'`));
  assert.ok(v.includes(`'${LIVE_IDENTITY_INVALID}' using errcode = '22023'`));
  assert.ok(v.includes(`'${LIVE_IDENTITY_MISMATCH}' using errcode = '22023'`));
  assert.ok(v.includes(`char_length(v_name) > ${LIVE_NAME_MAX} or char_length(v_sid) > ${LIVE_STUDENT_ID_MAX}`));
});

test("6-D와 JSON 모드: 대조 규칙이 같다 (SQL 정규화를 그대로 옮긴 비교 ↔ matchesMemberIdentity)", () => {
  // SQL: lower(regexp_replace(name, '\s', '', 'g')) / upper(regexp_replace(student_id, '\s', '', 'g')), 회원정보가 비면 불일치
  const sql = (input: { name: string; studentId: string }, p: { name: string; studentId: string }) => {
    const n = (s: string) => s.replace(/\s/g, "").toLowerCase();
    const id = (s: string) => s.replace(/\s/g, "").toUpperCase();
    return n(p.name) !== "" && id(p.studentId) !== "" && n(p.name) === n(input.name) && id(p.studentId) === id(input.studentId);
  };
  const profile = { name: "Kim Hana 김하나", studentId: "2024ab 001" };
  const cases = [
    { name: "Kim Hana 김하나", studentId: "2024ab 001" },
    { name: " kimhana김하나 ", studentId: "2024AB001" },
    { name: "Kim Hana", studentId: "2024ab001" },
    { name: "Kim Hana 김하나", studentId: "2024ab002" },
    { name: "", studentId: "" },
  ];
  for (const c of cases) assert.equal(matchesMemberIdentity(c, profile), sql(c, profile), JSON.stringify(c));
  for (const empty of [{ name: "", studentId: "1" }, { name: "a", studentId: "" }]) {
    assert.equal(matchesMemberIdentity({ name: empty.name, studentId: empty.studentId }, empty), false);
    assert.equal(sql({ name: empty.name, studentId: empty.studentId }, empty), false);
  }
});

test("6-D 우회 차단: 6-D는 새 함수만 authenticated, 기존 참여 함수 권한은 유지(이전 버전 호환) → 6-D2가 회수, 내부 함수는 실행 불가", () => {
  assert.match(A, /revoke all on function public\._live_identity_matches\(text, text\) from public, anon, authenticated, service_role;/);
  assert.match(A, /revoke all on function public\.join_live_session_verified\(text, text, text\) from public, anon, authenticated, service_role;/);
  assert.deepEqual([...A.matchAll(/grant execute on function public\.([\w]+)\(([^)]*)\) to (\w+);/g)].map((m) => `${m[1]}:${m[3]}`), ["join_live_session_verified:authenticated"]);
  assert.doesNotMatch(A, /join_live_session\(text\) from/, "6-D(1/2)는 기존 참여 함수 권한을 건드리지 않는다");
  assert.match(B, /revoke execute on function public\.join_live_session\(text\) from public, anon, authenticated;/);
  assert.doesNotMatch(B, /grant /);
  assert.match(B, /has_function_privilege\('authenticated', 'public\.join_live_session_verified\(text,text,text\)', 'EXECUTE'\)/, "새 함수가 준비된 뒤에만");
});

test("6-D 되돌리기: 6-D2는 권한 복구만, 6-D는 6-D2 복구를 확인한 뒤 함수 2개만 제거", () => {
  assert.match(DOWN_B, /^begin;\n+grant execute on function public\.join_live_session\(text\) to authenticated;\n+commit;$/);
  assert.match(DOWN_A, /has_function_privilege\('authenticated', 'public\.join_live_session\(text\)', 'EXECUTE'\)/);
  assert.deepEqual([...DOWN_A.matchAll(/drop function if exists public\.(\w+)\(/g)].map((m) => m[1]), ["join_live_session_verified", "_live_identity_matches"]);
  assert.doesNotMatch(DOWN_A + DOWN_B, /drop table|delete from|truncate|revoke/i);
});

test("우회 차단: 앱 화면 코드는 DB 참여 함수를 직접 부르지 않고, 서버 Supabase 경로는 본인 확인 함수를 부른다", async () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  const offenders = walk(path.join("src", "app")).filter((p) => /join_live_session/.test(readFileSync(p, "utf8")));
  assert.deepEqual(offenders, []);
  const calls: { rpc: string; args: unknown }[] = [];
  const client = { rpc: (name: string, args: unknown) => (calls.push({ rpc: name, args }), Promise.resolve({ data: {}, error: null })) } as unknown as SupabaseClient;
  await liveSessionOps(client, (e) => new Error(e.message)).join("ABC234", "김하나", "2024000001");
  assert.deepEqual(calls, [{ rpc: "join_live_session_verified", args: { p_code: "ABC234", p_name: "김하나", p_student_id: "2024000001" } }]);
  const failing = liveSessionOps({ rpc: () => Promise.resolve({ data: null, error: { code: "22023", message: LIVE_IDENTITY_MISMATCH } }) } as unknown as SupabaseClient, (e) => new Error(`E:${e.code}:${e.message}`));
  await assert.rejects(failing.join("ABC234", "x", "y"), new RegExp(`E:22023:${LIVE_IDENTITY_MISMATCH}`));
});

test("공백 처리: JS 정규화와 SQL 공백 집합이 모든 BMP 글자에서 같다 (PostgreSQL [[:space:]]가 ASCII만 잡는 C 로캘 가정)", async () => {
  const { normalizePersonName, normalizeStudentId } = await import("../src/content/liveSession");
  // SQL 집합을 JS 정규식으로: [[:space:]] → ASCII 공백만 (로캘이 넓으면 SQL이 더 지울 뿐, 이 집합은 항상 포함)
  const sqlRe = new RegExp(LIVE_SPACE_SQL.replace("[:space:]", " \t\n\v\f\r"), "u");
  const diff: string[] = [];
  for (let cp = 0; cp <= 0xffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCharCode(cp);
    const js = normalizePersonName(`a${c}b`) === "ab" && normalizeStudentId(`1${c}2`) === "12";
    if (js !== sqlRe.test(c)) diff.push(cp.toString(16));
  }
  assert.deepEqual(diff, [], `JS와 SQL이 다르게 다루는 글자: ${diff.join(",")}`);
  // 대표 예: 줄바꿈 없는 공백·전각 공백·폭 없는 공백이 섞여도 같은 사람
  for (const sp of ["\u00a0", "\u3000", "\u200b", "\ufeff", "\t"]) {
    assert.equal(normalizePersonName(`김${sp}하나`), "김하나");
  }
});

test("검증 SQL: 운영 dry-run은 실제 migration 본문 그대로·commit 없음·마지막에 일부러 오류(전체 취소), 테스트 프로젝트 검증도 commit 없음", () => {
  const dry = read(path.join("supabase", "checks", "20261128090000_phase_6cd_production_dryrun.sql"));
  const lines = dry.split("\n").map((l) => l.trim());
  assert.equal(lines.filter((l) => l === "begin;").length, 1);
  assert.equal(lines.filter((l) => l === "commit;").length, 0, "commit 없음");
  assert.match(dry, /raise exception 'DRYRUN_6CD_REPORT:[^\n]*\n\s*end;\n\$dryrun\$;\n\nrollback;\n?$/);
  assert.ok(lines.indexOf("begin;") < lines.findIndex((l) => l.startsWith("do $pre$")), "모든 본문이 트랜잭션 안");
  // migration 본문이 그대로 들어 있다 (begin/commit 줄만 뺀다) — migration을 고치면 스크립트를 다시 실행해야 테스트가 통과한다
  for (const f of ["20261127090000_phase_6c_live_quiz_results.sql", D6, D62]) {
    const body = read(path.join(MIG_DIR, f)).split("\n").filter((l) => l.trim() !== "begin;" && l.trim() !== "commit;").join("\n").trim();
    assert.ok(dry.includes(body), `${f} 본문이 dry-run과 다르다 — node scripts/build-6cd-dryrun.mjs`);
  }
  // rollback 본문도 그대로 (되돌리기를 운영 상태에서 함께 점검)
  for (const f of [D62, D6, "20261127090000_phase_6c_live_quiz_results.sql"]) {
    const body = read(path.join("supabase", "rollback", f.replace(".sql", ".down.sql"))).split("\n").filter((l) => l.trim() !== "begin;" && l.trim() !== "commit;").join("\n").trim();
    assert.ok(dry.includes(body), `${f} rollback 본문이 dry-run과 다르다 — node scripts/build-6cd-dryrun.mjs`);
  }
  // 일부만 실행되면 멈추는 guard: 트랜잭션 시작 직후 켜고, 첫 함수 생성 전·모든 단계 앞에 있다
  assert.ok(dry.indexOf("set_config('dryrun.guard', 'on', true)") > dry.indexOf("\nbegin;"));
  assert.ok(dry.indexOf("DRYRUN_GUARD(apply-1)") < dry.indexOf("create or replace function"));
  assert.equal([...dry.matchAll(/DRYRUN_GUARD\(/g)].length, 8, "적용 3 · 점검 1 · 되돌리기 3 · 마무리 1");
  // 운영 데이터를 쓰지 않는다 (함수 본문 안의 profiles 읽기는 없는 사용자 id로만 실행된다)
  assert.doesNotMatch(dry, /insert into|update (public|auth)\.|delete from|truncate/i, "운영 dry-run은 데이터를 쓰지 않는다");
  assert.match(dry, /fake uuid := '00000000-0000-4000-8000-00000000d0d0'/);
  // 가상 값이 운영 데이터에 있으면 함수를 만들기 전에 중단한다 (auth.users는 존재 여부만 읽는다)
  const fakeCheck = dry.indexOf("do $fakeids$");
  assert.ok(fakeCheck > dry.indexOf("\nbegin;") && fakeCheck < dry.indexOf("create or replace function"), "가상 값 확인이 첫 함수 생성보다 먼저");
  assert.deepEqual([...dry.matchAll(/auth\.users[^\n]*/g)].map((m) => m[0]), ["auth.users where id = '00000000-0000-4000-8000-00000000d0d0') then hit := hit || ' auth.users'; end if;"]);
  for (const v of ["lqs-000000000000", "zz-no-course", "ZZZZZZ"]) assert.ok(dry.slice(fakeCheck, dry.indexOf("$fakeids$;")).includes(v), `가상 값 ${v} 사전 확인`);
  // 판정: 모든 ok는 coalesce(…, false) — NULL은 FAIL / 실패 건수는 case로 더한다 / format 자리표시자와 인자 수가 같다
  const oks = [...dry.matchAll(/^\s*ok := (.*)$/gm)].map((m) => m[1]);
  assert.ok(oks.length >= 11 && oks.every((o) => o.startsWith("coalesce(")), oks.join(" | "));
  assert.doesNotMatch(dry, /n := n \+ \(not /, "NULL이 빠지는 (not ok)::int 대신 case로 센다");
  for (const m of dry.matchAll(/format\(E'([^']*)', case when ok then 'PASS' else 'FAIL' end(, coalesce\([^\n]*\))?\);/g)) {
    assert.equal((m[1].match(/%s/g) ?? []).length, m[2] ? 2 : 1, `format 인자 수: ${m[1]}`);
  }
  // PASS 줄 수: 권한 6 · anon 4 · 정규식 1 · 거부 경로 5 · 쓰기 없음 1 · 되돌리기 2 = 19, 다르면 FAIL로 센다
  assert.match(dry, /if passes is distinct from 19 then/);
  assert.match(dry, /n int := coalesce\(nullif\(current_setting\('dryrun\.fail', true\), ''\)::int, 99\)/, "점검 1 결과가 없으면 실패");
  // 가상 사용자 경로: 쓰기(참여 insert)까지 가지 않는다 — 본인 확인은 기존 참여 함수 호출보다 앞에서 거부, 기존 함수는 권한에서 거부
  const verified = dry.slice(dry.indexOf("create or replace function public.join_live_session_verified("));
  assert.ok(verified.indexOf("_live_identity_matches(v_name, v_sid)") < verified.indexOf("return public.join_live_session(p_code)"));
  assert.match(dry, /가상 사용자 경로에서 쓰기 없음/);
  // 전후 상태 확인 SQL은 읽기 전용
  const state = read(path.join("supabase", "checks", "20261128090000_phase_6cd_dryrun_state.sql"))
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
  assert.doesNotMatch(state, /\b(insert|update|delete|truncate|create|drop|alter|grant|revoke|begin|commit|set_config)\b/i, "상태 확인은 select만");
  assert.doesNotMatch(state, /\b(name|student_id|contact_email|phone)\b/i, "회원 개인정보 열을 읽지 않는다");
  const verify = read(path.join("supabase", "checks", "20261128090000_phase_6cd_test_project_verify.sql"));
  const vlines = verify.split("\n").map((l) => l.trim());
  assert.equal(vlines.filter((l) => l === "commit;").length, 0);
  assert.match(verify, /raise exception 'VERIFY_6CD_REPORT:[\s\S]*\nrollback;\n?$/);
  assert.match(verify, /테스트 프로젝트 전용/);
});

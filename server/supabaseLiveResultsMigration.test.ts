// Phase 6-C 마이그레이션(실시간 퀴즈 결과 조회) 정적 검사 + Supabase 호출 경로 (npm test). DB에 연결하지 않는다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { liveSessionOps } from "./liveQuizRows";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const C6_FILE = migFiles.find((f) => /_phase_6c_live_quiz_results\.sql$/.test(f));
const C6 = C6_FILE ? read(path.join(MIG_DIR, C6_FILE)) : "";
const DOWN = read(path.join("supabase", "rollback", "20261127090000_phase_6c_live_quiz_results.down.sql"));
const code = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();
const fn = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `함수 없음: ${name}`);
  return src.slice(start, src.indexOf("\n$$;", start) + 4);
};
const top = code(C6);
const PUBLIC_FNS = ["my_live_session_history", "live_session_results"];
const ALL_FNS = ["_live_can_view_results", ...PUBLIC_FNS];

test("6-C: 6-B 다음 마이그레이션 (뒤는 6-D만), 한 트랜잭션, 사전 확인이 먼저, 함수만 추가 (테이블·행 변경 없음)", () => {
  assert.ok(C6_FILE);
  // 6-C 뒤에는 6-D(본인 확인 참여) 두 파일만 온다
  assert.ok(migFiles.slice(migFiles.indexOf(C6_FILE!) + 1).every((f) => /_phase_(6d_live_join_verified|6d2_revoke_legacy_join)\.sql$/.test(f)));
  assert.ok(/_phase_6b_live_quiz_sessions\.sql$/.test(migFiles[migFiles.indexOf(C6_FILE!) - 1]));
  assert.match(top, /^begin;\n/);
  assert.match(top, /\ncommit;$/);
  assert.equal([...top.matchAll(/^(begin|commit|rollback);$/gm)].length, 2);
  assert.ok(top.indexOf("do $pre$") < top.indexOf("create or replace function"));
  assert.doesNotMatch(top, /\b(create|alter|drop)\s+table\b|\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b/i);
  assert.deepEqual([...top.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]), ALL_FNS);
});

test("6-C 함수: security definer·search_path 고정, 로그인 확인, 담당 분반 권한, 종료된 세션만, 개인정보는 이름·학번만", () => {
  for (const name of ALL_FNS) {
    const body = fn(C6, name);
    assert.match(body, /security definer/, name);
    assert.match(body, /set search_path = ''/, name);
  }
  assert.match(fn(C6, "_live_can_view_results"), /my_instructor_section_ids\(false\)/);
  for (const name of PUBLIC_FNS) {
    const body = fn(C6, name);
    assert.match(body, /auth\.uid\(\) is null/, name);
    assert.match(body, /_live_can_view_results\(/, name);
  }
  const results = fn(C6, "live_session_results");
  assert.match(results, /v\.status <> 'ended'/);
  assert.match(results, /using errcode = 'P0002'/, "권한이 없으면 세션이 없는 것처럼");
  assert.match(results, /pr\.name/);
  assert.match(results, /pr\.student_id/);
  assert.doesNotMatch(results, /contact_email|phone|google_email|'userId'|'user_id'|'email'/, "이메일·전화·사용자 id를 돌려주지 않는다");
  assert.match(results, /'key', 's' \|\| st\.n/, "행 key는 순번");
});

test("6-C 권한: 모든 함수 revoke 뒤 공개 함수 2개만 authenticated, 내부 함수는 실행 권한 없음", () => {
  for (const name of ALL_FNS) assert.match(top, new RegExp(`revoke all on function public\\.${name}\\(text\\) from public, anon, authenticated, service_role;`), name);
  const grants = [...top.matchAll(/grant execute on function public\.(\w+)\(text\) to (\w+);/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(grants, PUBLIC_FNS.map((n) => `${n}:authenticated`));
});

test("6-C 되돌리기: 함수 3개만 제거 (테이블·데이터 그대로)", () => {
  const down = code(DOWN);
  assert.match(down, /^begin;\n/);
  assert.match(down, /\ncommit;$/);
  assert.deepEqual([...down.matchAll(/drop function if exists public\.(\w+)\(text\);/g)].map((m) => m[1]).sort(), [...ALL_FNS].sort());
  assert.doesNotMatch(down, /drop table|delete from|truncate/i);
});

test("Supabase 6-C 경로: 사용자 token으로 RPC, 인자 이름 전달, 오류 전달", async () => {
  const calls: { rpc: string; args: unknown }[] = [];
  const client = { rpc: (name: string, args: unknown) => (calls.push({ rpc: name, args }), Promise.resolve({ data: [], error: null })) } as unknown as SupabaseClient;
  const ops = liveSessionOps(client, (e) => new Error(e.message));
  await ops.history("course-campus");
  await ops.results("lqs-x");
  assert.deepEqual(calls, [
    { rpc: "my_live_session_history", args: { p_course_id: "course-campus" } },
    { rpc: "live_session_results", args: { p_session_id: "lqs-x" } },
  ]);
  const failing = liveSessionOps({ rpc: () => Promise.resolve({ data: null, error: { code: "22023", message: "not ended" } }) } as unknown as SupabaseClient, (e) => new Error(`E:${e.code}`));
  await assert.rejects(failing.results("x"), /E:22023/);
});

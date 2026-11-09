// Phase 6-B 마이그레이션(실시간 퀴즈 세션) 정적 검사 + Supabase 호출 경로 (npm test). DB에 연결하지 않는다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { liveSessionOps } from "./liveQuizRows";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const B6_FILE = migFiles.find((f) => /_phase_6b_live_quiz_sessions\.sql$/.test(f));
const B6 = B6_FILE ? read(path.join(MIG_DIR, B6_FILE)) : "";
const DOWN = read(path.join("supabase", "rollback", "20261112090000_phase_6b_live_quiz_sessions.down.sql"));
const PRE = read(path.join("supabase", "checks", "20261112090000_phase_6b_pre.sql"));
const POST = read(path.join("supabase", "checks", "20261112090000_phase_6b_post.sql"));
const SMOKE = read(path.join("supabase", "checks", "20261112090000_phase_6b_rollback_smoke.sql"));
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
const top = code(B6);
const PUBLIC_FNS = ["start_live_session", "live_session_control", "live_session_host_state", "my_live_host_sessions", "join_live_session", "live_session_student_state", "submit_live_answer"];
const INTERNAL_FNS = ["_live_join_code", "_live_can_host", "_live_host_json", "_live_student_json"];

test("6-B: 마지막 마이그레이션, 한 트랜잭션, 사전 확인이 먼저, 새 테이블 3개만 (기존 테이블·함수 변경 없음)", () => {
  assert.ok(B6_FILE);
  assert.equal(migFiles[migFiles.length - 1], B6_FILE);
  assert.match(top, /^begin;\n/);
  assert.match(top, /\ncommit;$/);
  assert.equal([...top.matchAll(/^(begin|commit|rollback);$/gm)].length, 2);
  assert.ok(top.indexOf("do $pre$") < top.indexOf("create table"));
  assert.equal([...top.matchAll(/raise exception '6B_PREFLIGHT:/g)].length, 4);
  assert.deepEqual([...new Set([...top.matchAll(/alter table ([\w.]+)/g)].map((m) => m[1]))].sort(), ["public.live_quiz_participants", "public.live_quiz_responses", "public.live_quiz_sessions"]);
  const outsideFns = top.replace(/create or replace function[\s\S]*?\n\$\$;/g, "");
  assert.doesNotMatch(outsideFns, /^\s*(update|delete from|insert into)\s/im);
  assert.doesNotMatch(top, /\bdrop\s+table\b|\btruncate\b|\bdrop\s+column\b/i);
  for (const name of ["_save_live_quiz_set", "_delete_live_quiz_set", "list_live_quiz_sets", "my_instructor_section_ids", "my_enrolled_section_ids", "can_manage_course"]) {
    assert.ok(!top.includes(`create or replace function public.${name}(`), name);
  }
});

test("6-B: 테이블 직접 권한 없음, 분반당 진행 중 1개·진행 중 코드 고유, 응답 기본 키로 문제당 1회, 세트 삭제 시 세션 보존", () => {
  for (const t of ["live_quiz_sessions", "live_quiz_participants", "live_quiz_responses"]) {
    assert.match(top, new RegExp(`alter table public\\.${t} enable row level security;`));
    assert.match(top, new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated, service_role;`));
    assert.match(top, new RegExp(`grant select, insert, update, delete on table public\\.${t} to service_role;`));
  }
  assert.doesNotMatch(top, /create policy|to anon\b|on table [\w.]+ to authenticated/i);
  assert.match(top, /on public\.live_quiz_sessions \(section_id\) where status = 'active'/);
  assert.match(top, /on public\.live_quiz_sessions \(join_code\) where status = 'active'/);
  assert.match(top, /primary key \(session_id, question_index, user_id\)/);
  assert.match(top, /set_id text references public\.live_quiz_sets \(id\) on delete set null/);
  assert.match(top, /check \(\(phase = 'waiting'\) = \(current_index is null\)\)/);
});

test("6-B: 학생 상태에 정답·해설·응답 수는 정답 공개(revealed)에서만, 개별 응답은 어느 상태에도 없음", () => {
  const st = fn(B6, "_live_student_json");
  assert.match(st, /'answer', case when s\.phase = 'revealed' then/);
  assert.match(st, /'explanation', case when s\.phase = 'revealed' then/);
  assert.match(st, /'counts', case when s\.phase = 'revealed' then/);
  assert.match(st, /jsonb_build_object\('question', s\.questions -> s\.current_index ->> 'question',\s+'options', s\.questions -> s\.current_index -> 'options'\)/);
  assert.match(st, /r\.user_id = p_user/, "내 답만");
  for (const f of ["_live_student_json", "_live_host_json"]) assert.doesNotMatch(fn(B6, f), /'userId'|'user_id',|r\.user_id\s*,/);
});

test("6-B: 서버 검증 — 진행은 담당 분반·버전·상태 전이, 제출은 참여+수강·응답 접수·지금 문제·FOR SHARE·중복 23505", () => {
  const start = fn(B6, "start_live_session");
  for (const s of ["v_set.status <> 'ready'", "v_section.course_id <> v_set.course_id", "public._live_can_host(p_section_id)", "public.can_manage_course(v_set.course_id)", "status = 'active') then", "errcode = '23505'"]) assert.ok(start.includes(s), s);
  const ctl = fn(B6, "live_session_control");
  for (const s of ["for update", "public._live_can_host(v.section_id)", "p_expected_version <> v.state_version", "errcode = '40001'", "p_action = 'next' and v.phase in ('waiting', 'revealed')", "p_action = 'close' and v.phase = 'open'", "p_action = 'reveal' and v.phase = 'closed'"]) {
    assert.ok(ctl.includes(s), s);
  }
  const submit = fn(B6, "submit_live_answer");
  for (const s of ["for share", "live_quiz_participants p where p.session_id = p_session_id and p.user_id = v_uid", "v.section_id not in (select public.my_enrolled_section_ids())", "v.phase <> 'open'", "v.current_index is distinct from p_question_index", "on conflict do nothing", "if not found then", "errcode = '23505'"]) {
    assert.ok(submit.includes(s), s);
  }
  const join = fn(B6, "join_live_session");
  assert.match(join, /v\.section_id not in \(select public\.my_enrolled_section_ids\(\)\)/);
  assert.match(join, /on conflict do nothing/);
  assert.match(fn(B6, "_live_can_host"), /my_instructor_section_ids\(true\)/);
  for (const name of PUBLIC_FNS) assert.match(fn(B6, name), /auth\.uid\(\)/, name);
});

test("6-B: 함수 권한 — 공개 7개는 authenticated만, 내부 4개는 아무도 / 모두 search_path 고정", () => {
  for (const name of [...PUBLIC_FNS, ...INTERNAL_FNS]) {
    assert.match(fn(B6, name), /set search_path = ''/, name);
    assert.match(top, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role;`), name);
  }
  const grants = [...top.matchAll(/^grant execute on function public\.(\w+)\([^)]*\) to (\w+);$/gm)].map((m) => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(grants, PUBLIC_FNS.map((f) => `${f}:authenticated`).sort());
});

test("6-B 되돌리기·점검·스모크: 기록이 있으면 중단, pre/post 읽기 전용(6-A 세트 지문 포함), 스모크 단일 블록·항상 롤백·빠진 객체 보고", () => {
  const d = code(DOWN);
  assert.match(d, /^begin;\n/);
  assert.match(d, /\ncommit;$/);
  assert.ok(d.indexOf("6B_ROLLBACK:") < d.indexOf("drop function"));
  for (const name of [...PUBLIC_FNS, ...INTERNAL_FNS]) assert.match(d, new RegExp(`drop function if exists public\\.${name}\\(`), name);
  assert.doesNotMatch(d, /\bdelete\s+from\b|\btruncate\b|live_quiz_sets;|live_quiz_questions;/i, "6-A 테이블은 건드리지 않는다");
  for (const s of [PRE, POST]) {
    const c = code(s);
    assert.doesNotMatch(c, /^\s*(insert|update|delete|alter|create|drop|grant|revoke|truncate|do)\b/im);
    for (const t of ["courses", "lessons", "lesson_progress", "week_materials", "enrollments", "live_quiz_sets", "live_quiz_questions"]) assert.match(c, new RegExp(`'${t}'`), t);
  }
  const sm = code(SMOKE);
  assert.equal([...sm.matchAll(/^do \$smoke\$/gm)].length, 1);
  const expected = Number(/c_expected constant integer := (\d+);/.exec(sm)![1]);
  assert.equal([...sm.matchAll(/pg_temp\.e2_check\('/g)].length, expected);
  assert.match(SMOKE, new RegExp(`PASS ${expected} · FAIL 0`));
  assert.match(sm, /raise exception using\s+errcode = 'P0001',[\s\S]*\nend;\n\$smoke\$;$/);
  assert.match(sm, /raise exception 'LIVE_SESSION_SMOKE_ABORT: 없음 — %', v_missing;/);
  assert.doesNotMatch(sm, /insert into auth\.users|storage\.objects/i, "auth 사용자·Storage를 만들지 않는다");
});

test("Supabase 6-B 경로: 교수자·학생 모두 사용자 token으로 RPC, 인자 이름 전달", async () => {
  const calls: { rpc: string; args: unknown }[] = [];
  const client = { rpc: (name: string, args: unknown) => (calls.push({ rpc: name, args }), Promise.resolve({ data: { version: 1 }, error: null })) } as unknown as SupabaseClient;
  const ops = liveSessionOps(client, (e) => new Error(e.message));
  await ops.start("livequiz-x", "sec");
  await ops.control("lqs-x", "close", 3);
  await ops.hostState("lqs-x");
  await ops.hostSessions("course-campus");
  await ops.join("ABC234");
  await ops.studentState("lqs-x");
  await ops.submit("lqs-x", 0, 2);
  assert.deepEqual(calls.map((c) => c.rpc), PUBLIC_FNS);
  assert.deepEqual(calls[1].args, { p_session_id: "lqs-x", p_action: "close", p_expected_version: 3 });
  assert.deepEqual(calls[6].args, { p_session_id: "lqs-x", p_question_index: 0, p_choice: 2 });
  const failing = liveSessionOps({ rpc: () => Promise.resolve({ data: null, error: { code: "23505", message: "dup" } }) } as unknown as SupabaseClient, (e) => new Error(`E:${e.code}`));
  await assert.rejects(failing.submit("x", 0, 0), /E:23505/);
});

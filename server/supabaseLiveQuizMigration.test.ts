// Phase 6-A 마이그레이션(실시간 퀴즈 문제 세트) 정적 검사 + Supabase 호출 경로 (npm test). DB에 연결하지 않는다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { liveQuizOps } from "./liveQuizRows";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const A6_FILE = migFiles.find((f) => /_phase_6a_live_quiz_sets\.sql$/.test(f));
const A6 = A6_FILE ? read(path.join(MIG_DIR, A6_FILE)) : "";
const DOWN = read(path.join("supabase", "rollback", "20261111090000_phase_6a_live_quiz_sets.down.sql"));
const PRE = read(path.join("supabase", "checks", "20261111090000_phase_6a_pre.sql"));
const POST = read(path.join("supabase", "checks", "20261111090000_phase_6a_post.sql"));
const SMOKE = read(path.join("supabase", "checks", "20261111090000_phase_6a_rollback_smoke.sql"));
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
const top = code(A6);
const FUNCS = ["_live_quiz_norm", "_live_quiz_sets_json", "_save_live_quiz_set", "_delete_live_quiz_set", "list_live_quiz_sets", "save_live_quiz_set", "delete_live_quiz_set", "admin_list_live_quiz_sets", "admin_save_live_quiz_set", "admin_delete_live_quiz_set"];

test("6-A: 마지막 마이그레이션, 한 트랜잭션, 사전 확인이 먼저, 새 테이블만 (기존 테이블·함수 변경 없음)", () => {
  assert.ok(A6_FILE);
  // 6-A 뒤에는 6-B(세션)만 올 수 있다
  const after = migFiles.slice(migFiles.indexOf(A6_FILE!) + 1);
  assert.ok(after.every((f) => f.endsWith("_phase_6b_live_quiz_sessions.sql")), after.join(","));
  assert.match(top, /^begin;\n/);
  assert.match(top, /\ncommit;$/);
  assert.equal([...top.matchAll(/^(begin|commit|rollback);$/gm)].length, 2);
  assert.ok(top.indexOf("do $pre$") < top.indexOf("create table"));
  assert.equal([...top.matchAll(/raise exception '6A_PREFLIGHT:/g)].length, 5);
  assert.deepEqual([...new Set([...top.matchAll(/alter table ([\w.]+)/g)].map((m) => m[1]))].sort(), ["public.live_quiz_questions", "public.live_quiz_sets"]);
  const outsideFns = top.replace(/create or replace function[\s\S]*?\n\$\$;/g, "");
  assert.doesNotMatch(outsideFns, /^\s*(update|delete from|insert into)\s/im);
  assert.doesNotMatch(top, /\bdrop\s+table\b|\btruncate\b|\bdrop\s+column\b/i);
  for (const name of ["_save_week_material", "_save_week_material_html", "list_week_materials", "can_manage_course", "admin_update_course"]) {
    assert.ok(!top.includes(`create or replace function public.${name}(`), name);
  }
});

test("6-A: 테이블 직접 권한 없음(RLS·service_role만), 완전 중복 고유 인덱스, 강의자료 삭제 시 연결만 끊김, 세트 삭제 시 문제도", () => {
  for (const t of ["live_quiz_sets", "live_quiz_questions"]) {
    assert.match(top, new RegExp(`alter table public\\.${t} enable row level security;`));
    assert.match(top, new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated, service_role;`));
    assert.match(top, new RegExp(`grant select, insert, update, delete on table public\\.${t} to service_role;`));
  }
  assert.doesNotMatch(top, /create policy|to anon\b|on table [\w.]+ to authenticated/i);
  assert.match(top, /create unique index if not exists live_quiz_questions_course_norm_uniq on public\.live_quiz_questions \(course_id, norm_key\);/);
  assert.match(top, /lesson_id text references public\.lessons \(id\) on delete set null/);
  assert.match(top, /set_id text not null references public\.live_quiz_sets \(id\) on delete cascade/);
  assert.match(top, /jsonb_array_length\(options\) between 2 and 6/);
});

test("6-A: 저장 함수 — 과목 잠금·권한·버전·주차·강의자료 과목·보기·정답 검사, 중복 키는 DB가 계산(보기 정렬)", () => {
  const save = fn(A6, "_save_live_quiz_set");
  for (const s of [
    "pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id))",
    "not p_is_admin and not public.can_manage_course(v_course_id)",
    "v_old.version <> p_expected_version",
    "errcode = '40001'",
    "v_week > v_course.week_count",
    "l.course_id = v_course_id",
    "count(distinct public._live_quiz_norm(o.value #>> '{}'))",
    "string_agg(k, '|' order by k)",
    "exception when unique_violation then",
    "errcode = '23505'",
    "= any (v_old_ids)",
  ]) {
    assert.ok(save.includes(s), s);
  }
  assert.ok(fn(A6, "_live_quiz_norm").includes("normalize(coalesce(p, ''), NFKC)"));
  const list = fn(A6, "list_live_quiz_sets");
  assert.match(list, /auth\.uid\(\) is null/);
  assert.match(list, /not public\._can_see_all_week_materials\(p_course_id\)/);
  assert.match(fn(A6, "save_live_quiz_set"), /_material_actor_label\(\)/);
  assert.match(fn(A6, "delete_live_quiz_set"), /auth\.uid\(\) is null/);
});

test("6-A: 함수 권한 — 교수자 3개는 authenticated, 관리자 3개는 service_role, 내부 4개는 아무도 / 모두 search_path 고정", () => {
  for (const name of FUNCS) {
    assert.match(fn(A6, name), /set search_path = ''/, name);
    assert.match(top, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role;`), name);
  }
  const grants = [...top.matchAll(/^grant execute on function public\.(\w+)\([^)]*\) to (\w+);$/gm)].map((m) => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(grants, [
    "admin_delete_live_quiz_set:service_role",
    "admin_list_live_quiz_sets:service_role",
    "admin_save_live_quiz_set:service_role",
    "delete_live_quiz_set:authenticated",
    "list_live_quiz_sets:authenticated",
    "save_live_quiz_set:authenticated",
  ]);
});

test("6-A 되돌리기·점검·스모크: 세트가 있으면 중단, pre/post 읽기 전용, 스모크 단일 블록·항상 롤백·빠진 객체 이름 보고", () => {
  const d = code(DOWN);
  assert.match(d, /^begin;\n/);
  assert.match(d, /\ncommit;$/);
  assert.ok(d.indexOf("6A_ROLLBACK: 실시간 퀴즈 문제 세트가 남아") < d.indexOf("drop function"));
  for (const name of FUNCS) assert.match(d, new RegExp(`drop function if exists public\\.${name}\\(`), name);
  assert.doesNotMatch(d, /\bdelete\s+from\b|\btruncate\b/i);
  for (const s of [PRE, POST]) {
    const c = code(s);
    assert.doesNotMatch(c, /^\s*(insert|update|delete|alter|create|drop|grant|revoke|truncate|do)\b/im);
    for (const t of ["courses", "lessons", "lesson_progress", "week_materials", "enrollments"]) assert.match(c, new RegExp(`'${t}'`), t);
  }
  const sm = code(SMOKE);
  assert.equal([...sm.matchAll(/^do \$smoke\$/gm)].length, 1);
  const expected = Number(/c_expected constant integer := (\d+);/.exec(sm)![1]);
  assert.equal([...sm.matchAll(/pg_temp\.e2_check\('/g)].length, expected);
  assert.match(SMOKE, new RegExp(`PASS ${expected} · FAIL 0`));
  assert.match(sm, /raise exception using\s+errcode = 'P0001',[\s\S]*\nend;\n\$smoke\$;$/);
  assert.match(sm, /raise exception 'LIVE_QUIZ_SMOKE_ABORT: 없음 — %', v_missing;/, "빠진 함수·테이블 이름을 메시지에");
  assert.match(sm, /'public\.live_quiz_sets'::regclass/, "새 테이블 trigger도 외부 호출 검사");
  assert.doesNotMatch(sm, /storage\.objects|auth\.users/);
});

/* ───────── Supabase 호출 경로 (가짜 클라이언트) ───────── */

test("Supabase 6-A 경로: 교수자는 list/save/delete RPC, 관리자는 admin_* RPC, 인자 이름·버전 전달", async () => {
  const calls: { rpc: string; args: unknown }[] = [];
  const fake = (data: unknown) =>
    ({
      rpc(name: string, args: unknown) {
        calls.push({ rpc: name, args });
        return Promise.resolve({ data, error: null });
      },
    }) as unknown as SupabaseClient;
  const input = { week: 1, title: "t", questions: [{ question: "q", options: ["a", "b"], answer: 0, explanation: "", origin: "manual" as const }] };
  const user = liveQuizOps(fake([{ id: "livequiz-abc123def456" }]), false, (e) => new Error(e.message));
  assert.equal((await user.list("course-campus")).length, 1);
  await user.save("course-campus", null, input, null);
  await user.save(null, "livequiz-abc123def456", input, 3);
  await user.remove("livequiz-abc123def456");
  assert.deepEqual(calls.map((c) => c.rpc), ["list_live_quiz_sets", "save_live_quiz_set", "save_live_quiz_set", "delete_live_quiz_set"]);
  assert.deepEqual(calls[2].args, { p_course_id: null, p_set_id: "livequiz-abc123def456", p_input: input, p_expected_version: 3 });
  calls.length = 0;
  const admin = liveQuizOps(fake([]), true, (e) => new Error(e.message), "관리자");
  await admin.list("course-campus");
  await admin.save("course-campus", null, input, null);
  await admin.remove("x");
  assert.deepEqual(calls.map((c) => c.rpc), ["admin_list_live_quiz_sets", "admin_save_live_quiz_set", "admin_delete_live_quiz_set"]);
  assert.equal((calls[1].args as { p_admin_label: string }).p_admin_label, "관리자");
  const failing = liveQuizOps({ rpc: () => Promise.resolve({ data: null, error: { code: "42501", message: "no" } }) } as unknown as SupabaseClient, false, (e) => new Error(`E:${e.code}`));
  await assert.rejects(failing.list("c"), /E:42501/);
});

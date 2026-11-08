// Phase 5-B 마이그레이션(복습 HTML 출처 연결) 정적 검사 + Supabase 호출 경로 (npm test).
// DB에 연결하지 않는다 — SQL 문장과 구조, 가짜 클라이언트로 RPC 이름·인자만 본다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { materialFromRow, materialOps } from "./materialRows";
import { adminErrorFromPg } from "./supabaseAdmin";
import { toUserError } from "./supabaseUser";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const B5_FILE = migFiles.find((f) => /_phase_5b_review_sources\.sql$/.test(f));
const B5 = B5_FILE ? read(path.join(MIG_DIR, B5_FILE)) : "";
const H4 = read(path.join(MIG_DIR, migFiles.find((f) => /_phase_4_html_materials\.sql$/.test(f))!));
const DOWN = read(path.join("supabase", "rollback", "20261110090000_phase_5b_review_sources.down.sql"));
const PRE = read(path.join("supabase", "checks", "20261110090000_phase_5b_pre.sql"));
const POST = read(path.join("supabase", "checks", "20261110090000_phase_5b_post.sql"));
const SMOKE = read(path.join("supabase", "checks", "20261110090000_phase_5b_rollback_smoke.sql"));
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
const top = code(B5);

test("5-B: 마지막 마이그레이션, begin … commit 한 트랜잭션, 사전 확인이 먼저, 기존 행을 바꾸지 않는다", () => {
  assert.ok(B5_FILE);
  // 5-B 뒤에는 6-A(실시간 퀴즈)만 올 수 있다
  const after = migFiles.slice(migFiles.indexOf(B5_FILE!) + 1);
  assert.ok(after.every((f) => f.endsWith("_phase_6a_live_quiz_sets.sql")), after.join(","));
  assert.match(top, /^begin;\n/);
  assert.match(top, /\ncommit;$/);
  assert.equal([...top.matchAll(/^(begin|commit|rollback);$/gm)].length, 2);
  assert.ok(top.indexOf("do $pre$") < top.indexOf("alter table"));
  assert.equal([...top.matchAll(/raise exception '5B_PREFLIGHT:/g)].length, 5);
  for (const bad of [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bdrop\s+column\b/i, /\balter\s+column\b/i]) assert.doesNotMatch(top, bad);
  const outsideFns = top.replace(/create or replace function[\s\S]*?\n\$\$;/g, "");
  assert.doesNotMatch(outsideFns, /^\s*(update|delete from|insert into)\s/im, "기존 행을 바꾸는 문장 없음");
  assert.deepEqual([...new Set([...top.matchAll(/alter table ([\w.]+)/g)].map((m) => m[1]))], ["public.week_materials"]);
  // 4단계·3-B·3-C 목록·열기 함수와 학생 목록 RPC는 다시 만들지 않는다
  for (const name of ["list_week_materials", "week_material_html", "save_week_material_html", "admin_save_week_material_html", "_save_week_material", "week_material_download"]) {
    assert.ok(!top.includes(`create or replace function public.${name}(`), name);
  }
});

test("5-B: 출처 칸 3개(NULL 허용)·외래 키(강의 삭제 시 NULL)·출처는 HTML에만·강의당 1개 고유 인덱스", () => {
  for (const c of ["source_kind text", "source_lesson_id text", "source_lesson_updated_at timestamptz"]) {
    assert.match(top, new RegExp(`add column if not exists ${c};`), c);
  }
  assert.match(top, /foreign key \(source_lesson_id\) references public\.lessons \(id\) on delete set null/);
  assert.match(top, /\(source_kind is null and source_lesson_id is null and source_lesson_updated_at is null\)\s+or \(source_kind = 'lesson-review' and kind = 'html' and source_lesson_updated_at is not null\)/);
  assert.match(top, /create unique index if not exists week_materials_review_source_uniq\s+on public\.week_materials \(course_id, source_kind, source_lesson_id\)\s+where source_lesson_id is not null;/);
});

test("5-B: HTML 저장 함수 — 4단계 검사 그대로 + 출처(같은 과목 강의·원본 시각·중복·직접 만든 HTML 거부·원본 삭제 시 재생성 거부)", () => {
  const save = fn(B5, "_save_week_material_html");
  const old = fn(H4, "_save_week_material_html");
  assert.equal(save.split("\n")[0], old.split("\n")[0], "같은 시그니처");
  assert.ok(save.includes("p_html text,\n  p_actor uuid,\n  p_actor_label text,\n  p_is_admin boolean\n)"));
  for (const keep of [
    "not public._material_html_ok(p_html)",
    "octet_length(p_html) > 2097152",
    "pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id))",
    ">= 20 then",
    "v_old.kind <> 'html'",
    "perform public._save_week_material(null, p_material_id, p_input, p_actor, p_actor_label, p_is_admin)",
  ]) {
    assert.ok(save.includes(keep), keep);
  }
  assert.equal([...save.matchAll(/not p_is_admin and not public\.can_manage_course\(v_course_id\)/g)].length, 2, "등록·재생성 모두 권한 확인");
  assert.match(save, /v_lesson\.course_id is distinct from v_course_id/);
  assert.equal([...save.matchAll(/date_trunc\('milliseconds', v_lesson\.updated_at\) <> date_trunc\('milliseconds', v_lesson_time\)/g)].length, 2);
  assert.equal([...save.matchAll(/errcode = '40001'/g)].length, 2);
  assert.match(save, /'이 강의의 복습 자료가 이미 있어요\.' using errcode = '23505'/);
  assert.match(save, /v_old\.source_kind is null then\s+raise exception '직접 만든 HTML 자료에는 출처를 연결할 수 없어요\.'/);
  assert.match(save, /v_old\.source_lesson_id is null then\s+raise exception '원본 강의가 삭제되어/);
  assert.match(save, /다른 강의의 복습 자료로 바꿀 수 없어요/);
  // 출처 시각은 화면 값이 아니라 DB의 강의 시각으로 기록한다
  assert.match(save, /case when v_source is not null then v_lesson\.updated_at end/);
  assert.match(save, /source_lesson_updated_at = case when v_source is not null then v_lesson\.updated_at else source_lesson_updated_at end/);
});

test("5-B: 출처 조회 RPC — 로그인·비공개 포함 열람 권한 확인, authenticated만 실행, 저장 함수 권한은 아무에게도", () => {
  const list = fn(B5, "list_week_material_sources");
  assert.match(list, /security definer/);
  assert.match(list, /set search_path = ''/);
  assert.match(list, /auth\.uid\(\) is null then\s+raise exception 'not authenticated' using errcode = '28000'/);
  assert.match(list, /not public\._can_see_all_week_materials\(p_course_id\) then\s+raise exception '[^']+' using errcode = '42501'/);
  assert.match(list, /m\.course_id = p_course_id and m\.source_kind is not null/);
  const grants = [...top.matchAll(/^grant execute on function public\.(\w+)\([^)]*\) to (\w+);$/gm)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(grants, ["list_week_material_sources:authenticated"]);
  assert.match(top, /revoke all on function public\._save_week_material_html\(text, text, jsonb, text, uuid, text, boolean\) from public, anon, authenticated, service_role;/);
  assert.match(top, /revoke all on function public\.list_week_material_sources\(text\) from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(top, /create policy|grant (select|insert|update|delete)|\bto anon\b/i);
});

test("5-B 되돌리기: 출처 연결 자료가 있으면 중단, 자료를 지우는 문장 없음, 저장 함수는 4단계 원문 그대로 복원", () => {
  const d = code(DOWN);
  assert.match(d, /^begin;\n/);
  assert.match(d, /\ncommit;$/);
  assert.match(d, /raise exception '5B_ROLLBACK: 출처가 연결된 복습 HTML이 있어/);
  assert.ok(d.indexOf("5B_ROLLBACK: 출처가") < d.indexOf("drop function"));
  const outsideFns = d.replace(/create or replace function[\s\S]*?\n\$\$;/g, "");
  assert.doesNotMatch(outsideFns, /\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|^\s*update\s/im, "함수 본문 밖에서 자료를 바꾸는 문장 없음");
  assert.ok(DOWN.includes(fn(H4, "_save_week_material_html")), "4단계 함수 원문");
  assert.match(d, /drop function if exists public\.list_week_material_sources\(text\);/);
  for (const x of ["drop index if exists public.week_materials_review_source_uniq", "drop constraint if exists week_materials_source_fields", "drop constraint if exists week_materials_source_lesson_id_fkey", "drop column if exists source_kind"]) {
    assert.ok(d.includes(x), x);
  }
  assert.ok(d.indexOf("drop constraint if exists week_materials_source_fields") < d.indexOf("drop column if exists source_kind"));
});

test("5-B 점검 SQL: 읽기 전용·지문 9개 테이블 / 스모크: 검사 수 = 상수, 마지막에 항상 raise, 역할 복원, 강의 삭제·고유 인덱스 확인", () => {
  for (const s of [PRE, POST]) {
    const c = code(s);
    assert.doesNotMatch(c, /^\s*(insert|update|delete|alter|create|drop|grant|revoke|truncate|do)\b/im);
    for (const t of ["courses", "sections", "section_instructors", "enrollments", "lessons", "lesson_dialogues", "lesson_progress", "feedback_drafts", "week_materials"]) {
      assert.match(c, new RegExp(`'${t}'`), t);
    }
  }
  const sm = code(SMOKE);
  assert.equal([...sm.matchAll(/^do \$smoke\$/gm)].length, 1);
  const expected = Number(/c_expected constant integer := (\d+);/.exec(sm)![1]);
  assert.equal([...sm.matchAll(/pg_temp\.e2_check\('/g)].length, expected);
  assert.match(SMOKE, new RegExp(`PASS ${expected} · FAIL 0`));
  assert.match(sm, /raise exception using\s+errcode = 'P0001',[\s\S]*\nend;\n\$smoke\$;$/);
  assert.match(sm, /execute format\('set local role %I', v_before\);/);
  assert.match(sm, /delete from public\.lessons where id = l1\.id;/, "강의 삭제 동작 확인 (롤백됨)");
  assert.match(sm, /'public\.lessons'::regclass/, "lessons trigger도 외부 호출 검사");
  assert.doesNotMatch(sm, /storage\.objects|auth\.users/);
});

test("5-B 오류 변환: 원본 강의가 그사이 수정됨(40001)은 관리자·사용자 경로 모두 409", () => {
  assert.equal(adminErrorFromPg({ code: "40001", message: "원본 강의가 그사이 수정됐어요." }).status, 409);
  assert.equal(toUserError({ code: "40001", message: "원본 강의가 그사이 수정됐어요." }).status, 409);
  assert.equal(toUserError({ code: "23505", message: "이 강의의 복습 자료가 이미 있어요." }).status, 409);
});

/* ───────── Supabase 호출 경로 (가짜 클라이언트) ───────── */

type Call = { table?: string; rpc?: string; args?: unknown; ops: [string, unknown[]][] };
const fakeClient = (answer: (call: Call) => { data: unknown; error: { code?: string; message: string } | null }) => {
  const calls: Call[] = [];
  const chain = (call: Call): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (resolve: (r: unknown) => unknown) => Promise.resolve(resolve(answer(call)));
          return (...args: unknown[]) => {
            call.ops.push([String(prop), args]);
            return chain(call);
          };
        },
      },
    );
  const sb = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return chain(call);
    },
    rpc(name: string, args: unknown) {
      const call: Call = { rpc: name, args, ops: [] };
      calls.push(call);
      return chain(call);
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
};
const row = {
  id: "material-abc123def456",
  course_id: "course-campus",
  week: 1,
  kind: "html",
  title: "[복습] 1주차",
  description: "",
  url: null,
  status: "published",
  position: 0,
  created_at: "2026-11-07T00:00:00Z",
  updated_at: "2026-11-07T00:00:00Z",
  updated_by_label: "관리자",
  source_kind: "lesson-review",
  source_lesson_id: "course-campus-w01",
  source_lesson_updated_at: "2026-11-07T01:02:03.456789+00:00",
};

test("Supabase 5-B 경로: 등록·재생성에 출처를 p_input.source로, 출처 조회는 관리자 테이블·교수자 RPC, 실패해도 목록을 막지 않는다", async () => {
  const m = materialFromRow(row);
  assert.deepEqual(m.source, { kind: "lesson-review", lessonId: "course-campus-w01", lessonUpdatedAt: "2026-11-07T01:02:03.456789+00:00" });
  assert.equal(materialFromRow({ ...row, source_kind: null, source_lesson_id: null, source_lesson_updated_at: null }).source, undefined);
  assert.equal(materialFromRow({ ...row, source_lesson_id: null }).source?.lessonId, null, "원본 삭제");

  const user = fakeClient(() => ({ data: row, error: null }));
  const ops = materialOps(user.sb, false, (e) => new Error(e.message));
  await ops.saveHtml("course-campus", null, { week: 1, title: "[복습] 1주차" }, "<p>a</p>", { kind: "lesson-review", lessonId: "course-campus-w01", lessonUpdatedAt: "2026-11-07T01:02:03.456Z" });
  assert.equal(user.calls[0].rpc, "save_week_material_html");
  assert.deepEqual((user.calls[0].args as { p_input: unknown }).p_input, {
    week: 1,
    title: "[복습] 1주차",
    source: { kind: "lesson-review", lessonId: "course-campus-w01", lessonUpdatedAt: "2026-11-07T01:02:03.456Z" },
  });
  await ops.saveHtml(null, row.id, {}, "<p>v2</p>", { lessonUpdatedAt: "2026-11-08T00:00:00.000Z" });
  assert.deepEqual(user.calls[1].args, { p_course_id: null, p_material_id: row.id, p_input: { source: { lessonUpdatedAt: "2026-11-08T00:00:00.000Z" } }, p_html: "<p>v2</p>" });
  await ops.saveHtml(null, row.id, {}, "<p>v3</p>");
  assert.deepEqual((user.calls[2].args as { p_input: unknown }).p_input, {}, "출처 없이 보내면 4단계와 같다");

  const teacher = fakeClient(() => ({ data: [{ material_id: row.id, source_kind: "lesson-review", source_lesson_id: null, source_lesson_updated_at: row.source_lesson_updated_at }], error: null }));
  const map = await materialOps(teacher.sb, false, (e) => new Error(e.message)).sources("course-campus");
  assert.equal(teacher.calls[0].rpc, "list_week_material_sources");
  assert.deepEqual(teacher.calls[0].args, { p_course_id: "course-campus" });
  assert.deepEqual(map.get(row.id), { kind: "lesson-review", lessonId: null, lessonUpdatedAt: row.source_lesson_updated_at });

  const adminC = fakeClient(() => ({ data: [row], error: null }));
  const amap = await materialOps(adminC.sb, true, (e) => new Error(e.message)).sources("course-campus");
  assert.equal(adminC.calls[0].table, "week_materials");
  assert.equal(amap.get(row.id)?.lessonId, "course-campus-w01");

  const failing = fakeClient(() => ({ data: null, error: { code: "42883", message: "function does not exist" } }));
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal((await materialOps(failing.sb, false, (e) => new Error(e.message)).sources("course-campus")).size, 0, "마이그레이션 전·권한 없음: 빈 결과");
  } finally {
    console.warn = warn;
  }
});

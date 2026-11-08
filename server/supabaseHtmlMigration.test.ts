// Phase 4 마이그레이션(HTML 학습자료) 정적 검사 + Supabase 호출 경로 (npm test).
// DB에 연결하지 않는다 — SQL 문장과 구조, 가짜 클라이언트로 RPC 이름·인자만 본다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MATERIAL_HTML_MAX_BYTES } from "../src/content/materialHtml";
import { materialFromRow, materialOps } from "./materialRows";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const H4_FILE = migFiles.find((f) => /_phase_4_html_materials\.sql$/.test(f));
const H4 = H4_FILE ? read(path.join(MIG_DIR, H4_FILE)) : "";
const B3 = read(path.join(MIG_DIR, migFiles.find((f) => /_phase_3b_week_materials\.sql$/.test(f))!));
const DOWN = read(path.join("supabase", "rollback", "20261109090000_phase_4_html_materials.down.sql"));
const PRE = read(path.join("supabase", "checks", "20261109090000_phase_4_pre.sql"));
const POST = read(path.join("supabase", "checks", "20261109090000_phase_4_post.sql"));
const SMOKE = read(path.join("supabase", "checks", "20261109090000_phase_4_rollback_smoke.sql"));
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
const top = code(H4);
const NEW_FUNCS = ["_material_html_ok", "_save_week_material_html", "save_week_material_html", "admin_save_week_material_html", "week_material_html"];

test("4단계: 3-C 뒤 마이그레이션(그 뒤는 5-B 출처 연결만), begin … commit 한 트랜잭션, 사전 확인이 먼저, 기존 행·함수를 바꾸지 않는다", () => {
  assert.ok(H4_FILE);
  const after = migFiles.slice(migFiles.indexOf(H4_FILE!) + 1);
  assert.ok(after.every((f) => /_phase_(5b_review_sources|6a_live_quiz_sets)\.sql$/.test(f)), after.join(","));
  assert.match(top, /^begin;\n/);
  assert.match(top, /\ncommit;$/);
  assert.equal([...top.matchAll(/^(begin|commit|rollback);$/gm)].length, 2);
  assert.ok(top.indexOf("do $pre$") < top.indexOf("alter table"));
  assert.equal([...top.matchAll(/raise exception '4_PREFLIGHT:/g)].length, 5);
  for (const bad of [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bdrop\s+column\b/i, /\balter\s+column\b/i, /^\s*(update|delete from|insert into)\s+public\.(?!week_materials)/im]) {
    assert.doesNotMatch(top, bad);
  }
  // 기존 행을 바꾸는 문장 없음 (week_materials의 update·insert는 새 RPC 함수 안에서만)
  const outsideFns = top.replace(/create or replace function[\s\S]*?\n\$\$;/g, "");
  assert.doesNotMatch(outsideFns, /^\s*(update|delete from|insert into)\s/im);
  // 바꾸는 테이블은 week_materials뿐 (칸 추가·제약 교체)
  assert.deepEqual([...new Set([...top.matchAll(/alter table ([\w.]+)/g)].map((m) => m[1]))], ["public.week_materials"]);
  // 3-B·3-C 함수는 다시 만들지 않는다
  for (const name of ["_save_week_material", "save_week_material", "list_week_materials", "admin_update_course", "_delete_week_material", "week_material_download", "_reorder_week_materials"]) {
    assert.ok(!top.includes(`create or replace function public.${name}(`), name);
  }
});

test("4단계: 칸·제약 — html_body는 UTF-8 2MB, kind에 html 추가, link·file은 html_body가 비어 있어야 한다", () => {
  assert.equal(MATERIAL_HTML_MAX_BYTES, 2097152);
  assert.match(top, /add column if not exists html_body text;/);
  assert.match(top, /octet_length\(html_body\) between 1 and 2097152/);
  assert.match(top, /check \(kind in \('link', 'file', 'html'\)\)/);
  const fields = top.slice(top.indexOf("add constraint week_materials_kind_fields"), top.indexOf("/* ───────── 2)"));
  assert.match(fields, /kind = 'link' and url is not null and storage_path is null and file_name is null and mime_type is null and size_bytes is null and html_body is null/);
  assert.match(fields, /kind = 'file' and url is null and storage_path is not null[^)]*and html_body is null/);
  assert.match(fields, /kind = 'html' and url is null and storage_path is null and file_name is null and mime_type is null and size_bytes is null and html_body is not null/);
  // 3-B의 link·file 조건과 같은 칸 (html_body 조건만 더했다)
  const b3 = /constraint week_materials_kind_fields check \(\n\s*(\(kind = 'link'[^\n]*\))\n\s*or (\(kind = 'file'[^\n]*\))/.exec(B3)!;
  assert.ok(fields.includes(b3[1].replace(/\)$/, " and html_body is null)")), "link 조건");
  assert.ok(fields.includes(b3[2].replace(/\)$/, " and html_body is null)")), "file 조건");
});

test("4단계: 함수 권한 — 교수자 저장·열기는 authenticated만, 관리자 저장은 service_role만, 내부 함수는 아무도", () => {
  for (const name of NEW_FUNCS) {
    const body = fn(H4, name);
    assert.match(body, /set search_path = ''/, name);
    assert.match(top, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role;`), name);
  }
  const grants = [...top.matchAll(/^grant execute on function public\.(\w+)\([^)]*\) to (\w+);$/gm)].map((m) => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(grants, ["admin_save_week_material_html:service_role", "save_week_material_html:authenticated", "week_material_html:authenticated"]);
  assert.doesNotMatch(top, /\bto anon\b|\bto public\b/);
  assert.doesNotMatch(top, /create policy|grant (select|insert|update|delete)/i, "테이블 권한·정책은 그대로");
  for (const name of ["_save_week_material_html", "save_week_material_html", "admin_save_week_material_html", "week_material_html"]) {
    assert.match(fn(H4, name), /security definer/, name);
  }
});

test("4단계: 저장 RPC — 과목 잠금·권한·주차·개수·HTML 검사, 수정은 HTML 자료만, 칸 변경은 기존 저장 함수로", () => {
  const save = fn(H4, "_save_week_material_html");
  assert.match(save, /pg_advisory_xact_lock\(public\.lesson_course_lock_key\(v_course_id\)\)/);
  assert.equal([...save.matchAll(/not p_is_admin and not public\.can_manage_course\(v_course_id\)/g)].length, 2, "등록·수정 모두 권한 확인");
  assert.match(save, />= 20 then/);
  assert.match(save, /octet_length\(p_html\) > 2097152/);
  assert.match(save, /not public\._material_html_ok\(p_html\)/);
  assert.match(save, /v_old\.kind <> 'html'/);
  assert.match(save, /p_input \?\| array\['id', 'courseId', 'kind', 'position', 'url', 'storagePath', 'fileName', 'mimeType', 'sizeBytes', 'html'\]/);
  assert.match(save, /perform public\._save_week_material\(null, p_material_id, p_input, p_actor, p_actor_label, p_is_admin\)/);
  assert.match(save, /'html',/);
  const teacher = fn(H4, "save_week_material_html");
  assert.match(teacher, /auth\.uid\(\)/);
  assert.match(teacher, /_material_actor_label\(\)/);
  assert.match(teacher, /, false\);/);
  const ok = fn(H4, "_material_html_ok");
  for (const re of ["script", "iframe", "http-equiv", "on\\[a-z\\]\\+", "javascript", "srcdoc", "expression"]) assert.match(ok, new RegExp(re), re);
  const open = fn(H4, "week_material_html");
  assert.match(open, /auth\.uid\(\) is null/);
  assert.match(open, /v\.kind <> 'html'/);
  assert.match(open, /_can_see_all_week_materials\(v\.course_id\)\s+or \(v\.status = 'published' and public\._is_week_material_learner\(v\.course_id\)\)/);
  assert.match(open, /errcode = 'P0002'/);
});

test("4단계 되돌리기: HTML 자료가 하나라도 있으면 중단, 자료를 지우는 문장 없음, 3-B 제약 원문으로 복원, 재실행 가능", () => {
  const d = code(DOWN);
  assert.match(d, /^begin;\n/);
  assert.match(d, /\ncommit;$/);
  assert.match(d, /raise exception '4_ROLLBACK: HTML 자료가 남아 있어/);
  assert.ok(d.indexOf("4_ROLLBACK: HTML") < d.indexOf("drop function"));
  assert.doesNotMatch(d, /\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i);
  for (const name of NEW_FUNCS) assert.match(d, new RegExp(`drop function if exists public\\.${name}\\(`), name);
  const b3 = /constraint week_materials_kind_fields check \(\n\s*(\(kind = 'link'[^\n]*\))\n\s*or (\(kind = 'file'[^\n]*\))/.exec(B3)!;
  assert.ok(d.includes(b3[1]) && d.includes(b3[2]), "3-B 제약 원문");
  assert.match(d, /check \(kind in \('link', 'file'\)\)/);
  assert.match(d, /drop column if exists html_body/);
  assert.ok(d.indexOf("drop constraint if exists week_materials_kind_fields") < d.indexOf("drop column if exists html_body"));
});

test("4단계 점검 SQL: 읽기 전용, 지문 9개 테이블 / 스모크: 검사 수 상수 = 실제 검사 수, 마지막에 항상 raise, 역할 복원", () => {
  for (const s of [PRE, POST]) {
    const c = code(s);
    assert.doesNotMatch(c, /^\s*(insert|update|delete|alter|create|drop|grant|revoke|truncate|do)\b/im);
    assert.equal([...c.matchAll(/^(select|union all\nselect) '(\w+)'/gm)].length >= 1, true);
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
  assert.match(sm, /current_user is distinct from v_before/);
  assert.doesNotMatch(sm, /storage\.objects|auth\.users/, "Storage·사용자 계정은 건드리지 않는다");
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
const htmlRow = {
  id: "material-abc123def456",
  course_id: "course-campus",
  week: 2,
  kind: "html",
  title: "표현 정리",
  description: "",
  url: null,
  html_body: "<p>안녕</p>",
  status: "draft",
  position: 0,
  created_at: "2026-11-07T00:00:00Z",
  updated_at: "2026-11-07T00:00:00Z",
  updated_by_label: "관리자",
};

test("Supabase HTML 경로: 관리자는 admin RPC·테이블, 교수자·학생은 사용자 RPC — 목록 변환에 본문 없음", async () => {
  const m = materialFromRow(htmlRow);
  assert.equal(m.kind, "html");
  assert.equal(m.url, "");
  assert.ok(!("html" in m) && !("html_body" in m));

  const admin = fakeClient(() => ({ data: htmlRow, error: null }));
  const ops = materialOps(admin.sb, true, (e) => new Error(e.message), "관리자");
  await ops.saveHtml("course-campus", null, { week: 2, title: "표현 정리", description: "", status: "draft" }, "<p>안녕</p>");
  assert.equal(admin.calls[0].rpc, "admin_save_week_material_html");
  assert.deepEqual(admin.calls[0].args, {
    p_course_id: "course-campus",
    p_material_id: null,
    p_input: { week: 2, title: "표현 정리", description: "", status: "draft" },
    p_html: "<p>안녕</p>",
    p_admin_label: "관리자",
  });
  const adminRead = fakeClient(() => ({ data: [htmlRow], error: null }));
  const doc = await materialOps(adminRead.sb, true, (e) => new Error(e.message)).readHtml(htmlRow.id);
  assert.equal(adminRead.calls[0].table, "week_materials");
  assert.deepEqual(doc, { id: htmlRow.id, title: "표현 정리", html: "<p>안녕</p>", updatedAt: htmlRow.updated_at });
  const linkRead = fakeClient(() => ({ data: [{ ...htmlRow, kind: "link", html_body: null }], error: null }));
  assert.equal(await materialOps(linkRead.sb, true, (e) => new Error(e.message)).readHtml(htmlRow.id), null, "HTML이 아닌 자료");

  const user = fakeClient(() => ({ data: htmlRow, error: null }));
  await materialOps(user.sb, false, (e) => new Error(e.message)).saveHtml(null, htmlRow.id, { title: "새 제목" }, "<p>v2</p>");
  assert.equal(user.calls[0].rpc, "save_week_material_html");
  assert.deepEqual(user.calls[0].args, { p_course_id: null, p_material_id: htmlRow.id, p_input: { title: "새 제목" }, p_html: "<p>v2</p>" });
  const userRead = fakeClient(() => ({ data: [{ id: htmlRow.id, title: "표현 정리", html_body: "<p>안녕</p>", updated_at: htmlRow.updated_at }], error: null }));
  assert.equal((await materialOps(userRead.sb, false, (e) => new Error(e.message)).readHtml(htmlRow.id))?.html, "<p>안녕</p>");
  assert.equal(userRead.calls[0].rpc, "week_material_html");
  assert.deepEqual(userRead.calls[0].args, { p_material_id: htmlRow.id });
  // DB가 P0002(없음·권한 없음)를 주면 그 오류를 그대로 던진다 (API가 404로 바꾼다)
  const denied = fakeClient(() => ({ data: null, error: { code: "P0002", message: "자료를 찾을 수 없어요." } }));
  await assert.rejects(materialOps(denied.sb, false, (e) => new Error(`${e.code}`)).readHtml(htmlRow.id), /P0002/);
});

// Phase 3-B Supabase 보충 자료 경로 (npm test). 실제 Supabase에 연결하지 않고 가짜 클라이언트로 호출 내용·응답 변환만 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { materialFromRow, materialInput, materialOps } from "./materialRows";
import { AdminDataError, adminErrorFromPg, createSupabaseAdminStore } from "./supabaseAdmin";
import { toUserError } from "./supabaseUser";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };
type Call = { table?: string; rpc?: string; args?: unknown; ops: [string, unknown[]][] };

const fakeClient = (answer: (call: Call) => Result) => {
  const calls: Call[] = [];
  const chain = (call: Call): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (resolve: (r: Result) => unknown) => Promise.resolve(resolve(answer(call)));
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

const row = (extra: Row = {}): Row => ({
  id: "material-abc123def456",
  course_id: "course-campus",
  week: 2,
  kind: "link",
  title: "노트",
  description: "",
  url: "https://example.com/a",
  file_name: null,
  mime_type: null,
  size_bytes: null,
  storage_path: "should/not/leak",
  status: "draft",
  position: 0,
  created_at: "2026-11-07T00:00:00Z",
  updated_at: "2026-11-07T00:00:00Z",
  updated_by_label: "관리자",
  ...extra,
});

test("materialFromRow: 화면 형태로 바꾸고 저장 경로(storage_path)는 보내지 않는다", () => {
  const m = materialFromRow(row());
  assert.deepEqual(Object.keys(m).sort(), ["courseId", "createdAt", "description", "id", "kind", "position", "status", "title", "updatedAt", "updatedByLabel", "url", "week"]);
  assert.equal(m.kind, "link");
  const f = materialFromRow(row({ kind: "file", url: null, file_name: "a.pdf", mime_type: "application/pdf", size_bytes: 10 }));
  assert.equal(f.kind, "file");
  assert.equal(f.url, "");
  assert.equal(f.fileName, "a.pdf");
  assert.ok(!JSON.stringify(f).includes("should/not/leak"));
  assert.deepEqual(materialInput({ week: 3, title: "t" }), { week: 3, title: "t" });
});

test("관리자 경로: admin_* RPC에 수정자 표시와 함께 보내고, 목록은 과목별·순서대로 조회한다", async () => {
  const { sb, calls } = fakeClient((call) => {
    if (call.table === "week_materials") return { data: [row(), row({ id: "material-x", position: 1 })], error: null };
    if (call.rpc === "admin_reorder_week_materials") return { data: [row()], error: null };
    return { data: row(), error: null };
  });
  const ops = createSupabaseAdminStore(sb).materials("관리자");
  const list = await ops.list("course-campus");
  assert.equal(list.length, 2);
  const q = calls.find((c) => c.table === "week_materials")!;
  assert.ok(q.ops.some(([op, a]) => op === "eq" && a[0] === "course_id" && a[1] === "course-campus"));
  assert.deepEqual(q.ops.filter(([op]) => op === "order").map(([, a]) => a[0]), ["week", "position", "created_at"]);
  assert.ok(!String(q.ops.find(([op]) => op === "select")?.[1][0]).includes("storage_path"));

  await ops.create("course-campus", { week: 2, title: "노트", description: "", url: "https://example.com/a", status: "draft" });
  assert.deepEqual(calls.at(-1), {
    rpc: "admin_save_week_material",
    args: {
      p_course_id: "course-campus",
      p_material_id: null,
      p_input: { week: 2, title: "노트", description: "", url: "https://example.com/a", status: "draft" },
      p_admin_label: "관리자",
    },
    ops: [],
  });
  await ops.update("material-x", { status: "published" });
  assert.deepEqual((calls.at(-1)!.args as Row).p_input, { status: "published" });
  assert.equal((calls.at(-1)!.args as Row).p_course_id, null);
  assert.deepEqual(await ops.remove("material-x"), { ok: true, courseId: "course-campus", storagePath: "should/not/leak" });
  assert.equal(calls.at(-1)!.rpc, "admin_delete_week_material");
  await ops.reorder("course-campus", 2, ["material-x", "material-abc123def456"]);
  assert.deepEqual(calls.at(-1)!.args, { p_course_id: "course-campus", p_week: 2, p_ids: ["material-x", "material-abc123def456"] });
});

test("교수자·학생 경로: 목록은 list_week_materials RPC로만 (테이블 직접 조회 없음), 쓰기는 교수자 RPC", async () => {
  const { sb, calls } = fakeClient((call) => ({
    data: call.rpc === "reorder_week_materials" || call.rpc === "list_week_materials" ? [row({ updated_by_label: null })] : row(),
    error: null,
  }));
  const ops = materialOps(sb, false, toUserError);
  const list = await ops.list("course-campus");
  assert.equal(list[0].updatedByLabel, null);
  assert.deepEqual(calls.shift(), { rpc: "list_week_materials", args: { p_course_id: "course-campus" }, ops: [] });
  await ops.create("course-campus", { week: 1, title: "t", description: "", url: "https://example.com", status: "draft" });
  await ops.update("material-x", { title: "u" });
  await ops.remove("material-x");
  await ops.reorder("course-campus", 1, []);
  assert.deepEqual(calls.map((c) => c.rpc), ["save_week_material", "save_week_material", "delete_week_material", "reorder_week_materials"]);
  assert.ok(calls.every((c) => !("p_admin_label" in (c.args as Row))));
  assert.ok(calls.every((c) => c.table === undefined), "사용자 경로는 week_materials 테이블을 직접 조회하지 않는다");
});

test("DB 오류 → HTTP: 권한 403, 없음 404, 입력 400, 개수·순서 409 (관리자·사용자 경로 같음)", async () => {
  for (const [code, status] of [["42501", 403], ["P0002", 404], ["22023", 400], ["23505", 409]] as const) {
    assert.equal(adminErrorFromPg({ code, message: "m" }).status, status, `admin ${code}`);
    assert.equal(toUserError({ code, message: "m" }).status, status, `user ${code}`);
    const { sb } = fakeClient(() => ({ data: null, error: { code, message: "DB 문구" } }));
    await assert.rejects(
      materialOps(sb, false, toUserError).create("c", { week: 1, title: "t", description: "", url: "https://a.com", status: "draft" }),
      (e: unknown) => e instanceof AdminDataError && e.status === status && e.message === "DB 문구",
    );
  }
});

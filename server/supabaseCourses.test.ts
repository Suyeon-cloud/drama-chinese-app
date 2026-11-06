// Phase E1 Supabase 과목 관리 경로 (npm test). 실제 Supabase에 연결하지 않고, 가짜 클라이언트로 호출 내용과 응답 변환만 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AdminDataError,
  adminErrorFromPg,
  courseUpdateArgs,
  createSupabaseAdminStore,
  isAssignableCourseStatus,
  publicCourseFromRow,
} from "./supabaseAdmin";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };
type Call = { table?: string; rpc?: string; args?: unknown; ops: [string, unknown[]][] };

/** 아무 메서드나 이어 부를 수 있고, await하면 표·RPC 이름에 맞는 결과를 돌려주는 가짜 클라이언트 */
const fakeClient = (answer: (call: Call) => Result) => {
  const calls: Call[] = [];
  const chain = (call: Call): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
              try {
                return Promise.resolve(resolve(answer(call)));
              } catch (e) {
                return reject(e);
              }
            };
          }
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

const courseRow = (id: string, status: string, extra: Row = {}): Row => ({
  id,
  drama: "",
  title: `제목 ${id}`,
  context: "",
  description: "",
  legacy_code: null,
  week_count: 15,
  status,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  ...extra,
});

/** 관리자 과목 목록에 필요한 표들 (과목 외에는 비어 있음) */
const tables = (courses: Row[]) => (call: Call): Result => {
  if (call.table === "courses") return { data: courses, error: null };
  return { data: [], error: null };
};

test("DB 오류 코드 → HTTP: 23514(주차 축소 불가)는 409, 문구는 DB 그대로", () => {
  const msg = "5주차까지 학습자료나 학습 기록이 있어 5주보다 적게 줄일 수 없어요.";
  const e = adminErrorFromPg({ code: "23514", message: msg });
  assert.equal(e.status, 409);
  assert.equal(e.message, msg);
  assert.equal(adminErrorFromPg({ code: "42501", message: "기존 자료 과목은 바꿀 수 없어요." }).status, 403);
  assert.equal(adminErrorFromPg({ code: "P0002", message: "과목을 찾을 수 없어요." }).status, 404);
  assert.equal(adminErrorFromPg({ code: "P0001", message: "과목명을 입력해 주세요." }).status, 400);
  assert.equal(adminErrorFromPg({ code: "23505", message: "중복" }).status, 409);
});

test("courseUpdateArgs: 보낸 칸만 값, 나머지는 null (빈 문자열은 지우기 위해 그대로 보낸다)", () => {
  assert.deepEqual(courseUpdateArgs("course-abc123", { status: "inactive" }), {
    p_course_id: "course-abc123",
    p_title: null,
    p_drama: null,
    p_context: null,
    p_description: null,
    p_week_count: null,
    p_status: "inactive",
  });
  const all = courseUpdateArgs("course-abc123", { title: "새 이름", drama: "", context: "맥락", description: "", weekCount: 10, status: "active" });
  assert.equal(all.p_drama, "");
  assert.equal(all.p_description, "");
  assert.equal(all.p_week_count, 10);
});

test("createCourse: admin_create_course에 검사한 값만 보내고, 관리자 목록 형태로 돌려준다", async () => {
  const created = courseRow("course-x1y2z3", "active", { week_count: 8 });
  const { sb, calls } = fakeClient((call) =>
    call.rpc === "admin_create_course" ? { data: created, error: null } : tables([courseRow("course-campus", "active"), created])(call),
  );
  const out = await createSupabaseAdminStore(sb).createCourse({ title: "새 과목", drama: "", context: "", description: "", weekCount: 8 });
  const rpc = calls.find((c) => c.rpc);
  assert.equal(rpc?.rpc, "admin_create_course");
  assert.deepEqual(rpc?.args, { p_title: "새 과목", p_drama: "", p_context: "", p_description: "", p_week_count: 8 });
  assert.equal(out.id, "course-x1y2z3");
  assert.equal(out.status, "active");
  assert.equal(out.weekCount, 8);
  assert.deepEqual(out.sections, []);
  assert.equal(out.code, "");
  // service-role 키로 표에 직접 쓰지 않는다 (생성은 RPC만)
  assert.ok(calls.every((c) => !c.ops.some(([op]) => op === "insert" || op === "update" || op === "upsert" || op === "delete")));
});

test("updateCourse: admin_update_course 호출, inactive 상태가 응답에 그대로, DB 오류는 상태 코드로", async () => {
  const { sb, calls } = fakeClient((call) =>
    call.rpc === "admin_update_course"
      ? { data: courseRow("course-campus", "inactive"), error: null }
      : tables([courseRow("course-campus", "inactive")])(call),
  );
  const out = await createSupabaseAdminStore(sb).updateCourse("course-campus", { status: "inactive" });
  assert.equal(calls.find((c) => c.rpc)?.rpc, "admin_update_course");
  assert.equal((calls.find((c) => c.rpc)?.args as Row).p_status, "inactive");
  assert.equal(out.status, "inactive");

  for (const [code, status] of [["23514", 409], ["42501", 403], ["P0002", 404], ["P0001", 400]] as const) {
    const { sb: failing } = fakeClient((call) => (call.rpc ? { data: null, error: { code, message: "DB 문구" } } : tables([])(call)));
    await assert.rejects(
      createSupabaseAdminStore(failing).updateCourse("course-campus", { weekCount: 3 }),
      (e: unknown) => e instanceof AdminDataError && e.status === status && e.message === "DB 문구",
    );
  }
});

test("publicCourses: status = active만 조회, 기존 3과목 → 새 과목 순서, 공개 칸만", async () => {
  const rows = [
    courseRow("course-new001", "active", { created_at: "2026-11-05T00:00:00Z" }),
    courseRow("course-workplace", "active"),
    courseRow("course-campus", "active"),
  ];
  const { sb, calls } = fakeClient((call) => (call.table === "courses" ? { data: rows, error: null } : { data: [], error: null }));
  const out = await createSupabaseAdminStore(sb).publicCourses();
  const q = calls.find((c) => c.table === "courses");
  assert.ok(q?.ops.some(([op, args]) => op === "eq" && args[0] === "status" && args[1] === "active"));
  const select = q?.ops.find(([op]) => op === "select")?.[1][0] as string;
  assert.ok(!/legacy_code|sections|status/.test(select), select);
  assert.deepEqual(out.map((c) => c.id), ["course-campus", "course-workplace", "course-new001"]);
  assert.deepEqual(Object.keys(out[0]).sort(), ["context", "description", "drama", "id", "title", "weekCount"]);
  assert.equal(publicCourseFromRow(courseRow("course-a", "active", { week_count: 20 })).weekCount, 20);
});

test("assignInstructor: 운영·비활성 과목의 기존 분반은 배정, 기존 자료 과목·없는 분반은 404", async () => {
  assert.equal(isAssignableCourseStatus("active"), true);
  assert.equal(isAssignableCourseStatus("inactive"), true);
  assert.equal(isAssignableCourseStatus("legacy"), false);
  assert.equal(isAssignableCourseStatus(undefined), false);

  const store = (courseStatus: string | null) =>
    fakeClient((call) => {
      if (call.table === "sections") {
        return { data: courseStatus ? { id: "section-1", course_id: "c", courses: { status: courseStatus } } : null, error: null };
      }
      if (call.table === "instructors") return { data: { email: "t@example.test" }, error: null };
      return { data: null, error: null };
    });

  for (const status of ["active", "inactive"]) {
    const { sb, calls } = store(status);
    assert.deepEqual(await createSupabaseAdminStore(sb).assignInstructor("section-1", "T@example.test", "관리자"), { ok: true, existed: false });
    assert.ok(calls.some((c) => c.table === "section_instructors" && c.ops.some(([op]) => op === "upsert")), status);
  }
  for (const status of ["legacy", null]) {
    const { sb, calls } = store(status);
    await assert.rejects(
      createSupabaseAdminStore(sb).assignInstructor("section-1", "t@example.test", "관리자"),
      (e: unknown) => e instanceof AdminDataError && e.status === 404,
    );
    assert.ok(!calls.some((c) => c.table === "section_instructors"));
  }
});

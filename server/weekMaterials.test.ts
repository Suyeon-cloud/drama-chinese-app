// 주차별 보충 학습자료 (npm test, JSON 모드). 임시 폴더의 새 DB로 실제 API를 띄운다. 실제 data/db.json·Supabase는 건드리지 않는다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { LEGACY_COURSE_ID } from "../src/content/courses";
import { MAX_MATERIALS_PER_WEEK, materialFormProblem, safeHttpsUrl } from "../src/content/materialRules";
import type { CourseOverview, LearnerProfile, WeekMaterial } from "../src/app/store/models";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";
import { parseMaterialCreate, parseMaterialOrder, parseMaterialPatch } from "./weekMaterials";

/* ───────── 입력 규칙 (단위) ───────── */

test("safeHttpsUrl: https 주소만, 계정 정보·localhost·공백·javascript:/data:/http: 거부", () => {
  assert.equal(safeHttpsUrl(" https://example.com/a?b=1#c "), "https://example.com/a?b=1#c");
  assert.equal(safeHttpsUrl("https://docs.google.com/document/d/x"), "https://docs.google.com/document/d/x");
  for (const bad of [
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "https://localhost/x",
    "https://user:pw@example.com",
    "https://exa mple.com",
    "//example.com",
    "example.com",
    "",
    `https://example.com/${"a".repeat(2000)}`,
    42,
    null,
  ]) {
    assert.equal(safeHttpsUrl(bad), null, String(bad).slice(0, 40));
  }
  assert.equal(materialFormProblem({ title: " ", description: "", url: "https://a.com" }), "자료 제목을 입력해 주세요.");
  assert.match(materialFormProblem({ title: "t", description: "", url: "http://a.com" }) ?? "", /https/);
  assert.equal(materialFormProblem({ title: "t", description: "", url: "https://a.com" }), null);
});

test("parseMaterialCreate/Patch/Order: 기본 비공개, 주차 범위, 서버 칸 거부, 바꿀 칸 없음, 순서는 그 주차 전체", () => {
  const ok = parseMaterialCreate({ week: 3, title: "  노트  ", url: "https://a.com" }, 15);
  assert.deepEqual(ok, { ok: true, value: { week: 3, title: "노트", description: "", url: "https://a.com/", status: "draft" } });
  assert.equal(parseMaterialCreate({ week: 16, title: "t", url: "https://a.com" }, 15).ok, false);
  assert.equal(parseMaterialCreate({ week: 1.5, title: "t", url: "https://a.com" }, 15).ok, false);
  assert.equal(parseMaterialCreate({ week: 1, title: "t", url: "https://a.com", id: "x" }, 15).ok, false);
  assert.equal(parseMaterialCreate({ week: 1, title: "t", url: "https://a.com", position: 0 }, 15).ok, false);
  assert.equal(parseMaterialCreate({ week: 1, title: "t", url: "https://a.com", status: "public" }, 15).ok, false);
  assert.equal(parseMaterialCreate({ week: 1, title: "x".repeat(101), url: "https://a.com" }, 15).ok, false);
  assert.equal(parseMaterialCreate([], 15).ok, false);

  assert.equal(parseMaterialPatch({}, 15).ok, false);
  assert.deepEqual(parseMaterialPatch({ status: "published" }, 15), { ok: true, value: { status: "published" } });
  assert.equal(parseMaterialPatch({ url: "javascript:x" }, 15).ok, false);
  assert.equal(parseMaterialPatch({ week: 0 }, 15).ok, false);

  const list = [
    { id: "a", week: 2 },
    { id: "b", week: 2 },
    { id: "c", week: 3 },
  ] as WeekMaterial[];
  assert.equal(parseMaterialOrder({ week: 2, ids: ["b", "a"] }, 15, list).ok, true);
  assert.equal(parseMaterialOrder({ week: 2, ids: ["a"] }, 15, list).ok, false);
  assert.equal(parseMaterialOrder({ week: 2, ids: ["a", "a"] }, 15, list).ok, false);
  assert.equal(parseMaterialOrder({ week: 2, ids: ["a", "c"] }, 15, list).ok, false);
});

/* ───────── API (JSON 모드) ───────── */

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const T = "t@teach.test"; // course-campus 01분반 담당
const OTHER = "o@teach.test"; // 담당 분반 없음
const COURSE = "course-campus";

let dir = "";
let db: Db;
let base = "";
let adminCookie = "";
let close = () => {};
let untouched = "";

const sign = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const google = (email: string, id = email) => sign({ k: "google", id, email });
const learner = (id: string) => google(`${id}@learn.test`, id);

const call = async <R = unknown>(method: string, p: string, cookie?: string, body?: unknown) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as R & { error?: string } };
};
const list = (cookie: string, courseId = COURSE) => call<WeekMaterial[]>("GET", `/courses/${courseId}/materials`, cookie);
const create = (cookie: string, body: unknown, courseId = COURSE) => call<WeekMaterial>("POST", `/courses/${courseId}/materials`, cookie, body);
const patch = (cookie: string, id: string, body: unknown) => call<WeekMaterial>("PATCH", `/materials/${id}`, cookie, body);
const link = (week: number, title: string, status: "draft" | "published" = "draft") => ({ week, title, url: `https://example.com/${encodeURIComponent(title)}`, status });

const member = (id: string): LearnerProfile => ({
  id,
  googleEmail: `${id}@learn.test`,
  name: id,
  university: "u",
  department: "d",
  grade: "1",
  studentId: `S-${id}`,
  email: `${id}@learn.test`,
  phone: "010",
  avatarColor: "#fff",
  status: "approved",
  profileCompleted: true,
  firstSeenAt: "2026-11-06T00:00:00.000Z",
  lastSeenAt: "2026-11-06T00:00:00.000Z",
  approvedAt: "2026-11-06T00:00:00.000Z",
});
const snapshot = () => JSON.stringify({ lessons: db.data.lessons, progress: db.data.progress, enrollments: db.data.enrollments });

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-materials-"));
  db = openDb(dir);
  for (const email of [T, OTHER]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  for (const id of ["s1", "s2"]) db.data.members[id] = member(id);
  db.save();
  const app = express();
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET, ...ADMIN })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      close = () => server.close();
      resolve();
    });
  });
  const login = await fetch(`${base}/auth/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  // 교수자 배정, 학생 s1 수강 (s2는 수강하지 않음)
  const section = Object.values(db.data.sections).find((s) => s.courseId === COURSE && s.status === "active")!;
  assert.equal((await call("PUT", `/sections/${section.id}/instructors/${encodeURIComponent(T)}`, adminCookie)).status, 200);
  assert.equal((await call("POST", "/enrollments", learner("s1"), { courseCode: section.code })).status, 200);
  untouched = snapshot();
});

after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

test("권한: 로그인 필요, 담당 아닌 교수자·수강하지 않은 학생은 볼 수 없고, 학생·담당 아닌 교수자는 등록할 수 없다", async () => {
  assert.equal((await call("GET", `/courses/${COURSE}/materials`)).status, 401);
  assert.equal((await list(google(OTHER))).status, 404);
  assert.equal((await list(learner("s2"))).status, 404);
  assert.deepEqual((await list(learner("s1"))).body, []);
  assert.equal((await create(google(OTHER), link(1, "x"))).status, 403);
  assert.equal((await create(learner("s1"), link(1, "x"))).status, 403);
  assert.equal((await create(adminCookie, link(1, "x"), "course-nope")).status, 404);
});

test("등록·공개·순서·주차 이동·삭제: 학생은 공개 자료만 순서대로, 수정자 표시 없이 본다", async () => {
  const a = await create(google(T), link(2, "A", "published"));
  assert.equal(a.status, 201);
  assert.equal(a.body.position, 0);
  assert.equal(a.body.kind, "link");
  // 교수자 표시: 세션의 이름(없으면 이메일)
  assert.ok(a.body.updatedByLabel && a.body.updatedByLabel !== "관리자");
  const b = await create(google(T), link(2, "B"));
  assert.equal(b.body.position, 1);
  assert.equal(b.body.status, "draft");
  const c = await create(adminCookie, link(3, "C", "published"));
  assert.equal(c.body.updatedByLabel, "관리자");

  // 교수자: 비공개 포함 / 학생: 공개만, 수정자 표시 없음
  assert.deepEqual((await list(google(T))).body.map((m) => m.title), ["A", "B", "C"]);
  const seen = (await list(learner("s1"))).body;
  assert.deepEqual(seen.map((m) => m.title), ["A", "C"]);
  assert.ok(seen.every((m) => !("updatedByLabel" in m)));

  // 순서 변경: 그 주차 전체만 받는다
  const order = await call<WeekMaterial[]>("PUT", `/courses/${COURSE}/materials/order`, google(T), { week: 2, ids: [b.body.id, a.body.id] });
  assert.equal(order.status, 200);
  assert.deepEqual(order.body.map((m) => [m.title, m.position]), [["B", 0], ["A", 1]]);
  assert.equal((await call("PUT", `/courses/${COURSE}/materials/order`, google(T), { week: 2, ids: [a.body.id] })).status, 409);
  assert.equal((await call("PUT", `/courses/${COURSE}/materials/order`, learner("s1"), { week: 2, ids: [a.body.id, b.body.id] })).status, 403);

  // 공개 전환 → 학생 목록에 순서대로
  assert.equal((await patch(google(T), b.body.id, { status: "published" })).status, 200);
  assert.deepEqual((await list(learner("s1"))).body.map((m) => m.title), ["B", "A", "C"]);

  // 잘못된 수정은 거부, 그대로 유지
  assert.equal((await patch(google(T), a.body.id, { url: "javascript:alert(1)" })).status, 400);
  assert.equal((await patch(google(T), a.body.id, { url: "http://example.com" })).status, 400);
  assert.equal((await patch(google(T), a.body.id, {})).status, 400);
  assert.equal((await patch(google(T), a.body.id, { week: 99 })).status, 400);
  assert.equal((await patch(learner("s1"), a.body.id, { title: "x" })).status, 404);
  assert.equal(db.data.weekMaterials[a.body.id].url, "https://example.com/A");

  // 주차 이동: 새 주차 맨 뒤, 원래 주차 순서는 다시 매긴다
  const moved = await patch(google(T), b.body.id, { week: 3, title: "B2" });
  assert.equal(moved.body.week, 3);
  assert.equal(moved.body.position, 1);
  assert.equal(db.data.weekMaterials[a.body.id].position, 0);

  // 삭제
  assert.equal((await call("DELETE", `/materials/${c.body.id}`, learner("s1"))).status, 404);
  assert.equal((await call("DELETE", `/materials/${c.body.id}`, google(T))).status, 200);
  assert.equal(db.data.weekMaterials[c.body.id], undefined);
  assert.equal(db.data.weekMaterials[b.body.id].position, 0);
  assert.deepEqual((await list(learner("s1"))).body.map((m) => [m.week, m.title]), [[2, "A"], [3, "B2"]]);
  assert.deepEqual(
    (await call<WeekMaterial[]>("GET", `/courses/${COURSE}/materials?week=3`, learner("s1"))).body.map((m) => m.title),
    ["B2"],
  );
});

test(`한 주차에는 ${MAX_MATERIALS_PER_WEEK}개까지 (등록·주차 이동 모두)`, async () => {
  for (let i = 0; i < MAX_MATERIALS_PER_WEEK; i++) assert.equal((await create(adminCookie, link(9, `n${i}`))).status, 201);
  assert.equal((await create(adminCookie, link(9, "over"))).status, 409);
  const other = await create(adminCookie, link(8, "move"));
  assert.equal((await patch(adminCookie, other.body.id, { week: 9 })).status, 409);
  for (const m of Object.values(db.data.weekMaterials).filter((x) => x.week === 9)) {
    assert.equal((await call("DELETE", `/materials/${m.id}`, adminCookie)).status, 200);
  }
  assert.equal((await call("DELETE", `/materials/${other.body.id}`, adminCookie)).status, 200);
});

test("legacy 과목은 관리자만, 비활성 과목은 담당 교수자 편집·학생 열람 유지", async () => {
  assert.equal((await create(google(T), link(1, "L"), LEGACY_COURSE_ID)).status, 403);
  const legacy = await create(adminCookie, link(1, "L", "published"), LEGACY_COURSE_ID);
  assert.equal(legacy.status, 201);
  assert.equal((await list(learner("s1"), LEGACY_COURSE_ID)).status, 404);
  assert.equal((await call("DELETE", `/materials/${legacy.body.id}`, adminCookie)).status, 200);

  assert.equal((await call<CourseOverview>("PATCH", `/courses/${COURSE}`, adminCookie, { status: "inactive" })).status, 200);
  const m = await create(google(T), link(4, "inactive", "published"));
  assert.equal(m.status, 201);
  assert.ok((await list(learner("s1"))).body.some((x) => x.id === m.body.id));
  assert.equal((await call<CourseOverview>("PATCH", `/courses/${COURSE}`, adminCookie, { status: "active" })).status, 200);
});

test("주차 수 축소: 보충 자료(비공개 포함)가 있는 주차보다 작게 줄일 수 없다", async () => {
  const c = await call<CourseOverview>("POST", "/courses", adminCookie, { title: "자료 축소 검사", weekCount: 12 });
  assert.equal(c.status, 201);
  const m = await create(adminCookie, link(10, "w10"), c.body.id);
  assert.equal(m.status, 201);
  const shrink = await call("PATCH", `/courses/${c.body.id}`, adminCookie, { weekCount: 9 });
  assert.equal(shrink.status, 409);
  assert.match(shrink.body.error ?? "", /10주차/);
  assert.equal((await call<CourseOverview>("PATCH", `/courses/${c.body.id}`, adminCookie, { weekCount: 10 })).status, 200);
  assert.equal((await call("DELETE", `/materials/${m.body.id}`, adminCookie)).status, 200);
  assert.equal((await call<CourseOverview>("PATCH", `/courses/${c.body.id}`, adminCookie, { weekCount: 3 })).status, 200);
  // 범위 밖 주차로는 등록할 수 없다
  assert.equal((await create(adminCookie, link(4, "out"), c.body.id)).status, 400);
});

test("보충 자료 작업은 강의자료·학습 기록·수강 등록을 바꾸지 않는다", () => {
  assert.equal(snapshot(), untouched);
});

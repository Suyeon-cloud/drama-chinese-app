// 학습자료 저장의 과목(courseId) 검사 (npm test)
// - lessonCourse.ts 공통 함수: JSON·Supabase 관리자·Supabase 교수자 경로가 같이 쓰는 규칙
// - 실제 API(createApi, JSON 모드): 임시 폴더의 새 DB만 쓴다. 실제 data/db.json·Supabase는 건드리지 않는다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { LEGACY_COURSE_ID } from "../src/content/courses";
import type { SectionOverview } from "../src/app/store/models";
import type { Lesson } from "../src/content/types";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";
import { LEGACY_MOVE_ERROR, MISSING_COURSE_ERROR, lessonMoveProblem, resolveLessonCourseId } from "./lessonCourse";

/* ───────── 공통 함수 ───────── */

test("resolveLessonCourseId: 새 학습자료는 courseId가 꼭 있어야 하고 기존 자료 과목으로 대신 넣지 않는다", () => {
  assert.deepEqual(resolveLessonCourseId(undefined, null), { ok: false, status: 400, error: MISSING_COURSE_ERROR });
  assert.deepEqual(resolveLessonCourseId(null, null), { ok: false, status: 400, error: MISSING_COURSE_ERROR });
  assert.deepEqual(resolveLessonCourseId("", undefined), { ok: false, status: 400, error: MISSING_COURSE_ERROR });
  assert.equal(resolveLessonCourseId(123, null).ok, false);
  assert.equal(resolveLessonCourseId({ id: "course-campus" }, null).ok, false);
  assert.deepEqual(resolveLessonCourseId("course-qa8", null), { ok: true, courseId: "course-qa8" });
  // 어떤 경우에도 결과가 course-legacy로 바뀌지 않는다.
  for (const v of [undefined, null, "", 0]) {
    const r = resolveLessonCourseId(v, null);
    assert.ok(!r.ok || r.courseId !== LEGACY_COURSE_ID);
  }
});

test("resolveLessonCourseId: 기존 학습자료는 courseId가 없거나 비면 원래 과목을 쓴다", () => {
  const prev = { courseId: "course-campus" };
  assert.deepEqual(resolveLessonCourseId(undefined, prev), { ok: true, courseId: "course-campus" });
  assert.deepEqual(resolveLessonCourseId("", prev), { ok: true, courseId: "course-campus" });
  assert.deepEqual(resolveLessonCourseId("course-university", prev), { ok: true, courseId: "course-university" });
  assert.deepEqual(resolveLessonCourseId(undefined, { courseId: LEGACY_COURSE_ID }), { ok: true, courseId: LEGACY_COURSE_ID });
});

test("lessonMoveProblem: 기존 자료 과목 ↔ 그 밖의 과목 이동만 거부한다", () => {
  const status: Record<string, string> = {
    "course-campus": "active",
    "course-university": "active",
    "course-qa8": "active",
    "course-legacy": "legacy",
    "course-future": "inactive",
  };
  const of = (id: string) => status[id];
  assert.equal(lessonMoveProblem(null, "course-campus", of), null);
  assert.equal(lessonMoveProblem("course-campus", "course-campus", of), null);
  assert.equal(lessonMoveProblem("course-campus", "course-university", of), null);
  assert.equal(lessonMoveProblem("course-legacy", "course-campus", of), LEGACY_MOVE_ERROR);
  assert.equal(lessonMoveProblem("course-campus", "course-legacy", of), LEGACY_MOVE_ERROR);
  // 이후 단계의 inactive도 legacy가 아니면 운영 과목과 같은 쪽
  assert.equal(lessonMoveProblem("course-future", "course-campus", of), null);
  assert.equal(lessonMoveProblem("course-legacy", "course-future", of), LEGACY_MOVE_ERROR);
  // 상태를 모르는 과목은 각 경로의 존재 검사가 막는다.
  assert.equal(lessonMoveProblem("course-campus", "course-none", of), null);
});

/* ───────── 실제 API (JSON 모드) ───────── */

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const A = "a@teach.test"; // campus 01분반 + qa8 분반 담당
const B = "b@teach.test"; // 담당 없음
const QA8 = "course-qa8";

let dir = "";
let db: Db;
let base = "";
let adminCookie = "";
let close = () => {};

const sign = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const google = (email: string) => sign({ k: "google", id: email, email });

const call = async <T = unknown>(method: string, p: string, cookie?: string, body?: unknown) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T, headers: res.headers };
};
const put = (lesson: Partial<Lesson> & { id: string }, cookie = adminCookie) =>
  call<Lesson & { error?: string }>("PUT", `/lessons/${lesson.id}`, cookie, lesson);

/** 새 학습자료 (준비 중, 내용 없음). courseId를 빼거나 바꿔서 보낸다. */
const draft = (id: string, week: number, courseId?: unknown): Record<string, unknown> => ({
  id,
  ...(courseId === undefined ? {} : { courseId }),
  week,
  title: `테스트 ${id}`,
  description: "",
  direction: "zh-ko",
  level: "",
  status: "draft",
  video: { youtubeUrl: "", youtubeId: "", startTime: 0, endTime: 0 },
  script: { source: "manual", cues: [], updatedAt: "2026-11-05T00:00:00.000Z" },
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T00:00:00.000Z",
});
const lessonCount = () => Object.keys(db.data.lessons).length;
const lessonsIn = (courseId: string) => Object.values(db.data.lessons).filter((l) => l.courseId === courseId).length;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-lesson-course-"));
  db = openDb(dir);
  for (const email of [A, B]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  // 테스트 DB에서만: 8주 새 과목
  db.data.courses[QA8] = {
    id: QA8,
    drama: "测试",
    title: "8주 테스트 과목",
    context: "",
    description: "",
    code: "QATEST",
    weekCount: 8,
    status: "active",
    createdAt: "2026-12-01T00:00:00.000Z",
    updatedAt: "2026-12-01T00:00:00.000Z",
  };
  const app = express();
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET, ...ADMIN })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      close = () => server.close();
      resolve();
    });
  });
  const login = await call("POST", "/auth/admin", undefined, { id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  assert.equal((await call("PUT", `/sections/section-campus-01/instructors/${encodeURIComponent(A)}`, adminCookie)).status, 200);
  const qa8Section = await call<SectionOverview>("POST", `/courses/${QA8}/sections`, adminCookie, { instructors: [A] });
  assert.equal(qa8Section.status, 200);
});

after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

test("API: 새 학습자료에 courseId가 없거나 비거나 없는 과목이면 거부하고 저장하지 않는다", async () => {
  const before = lessonCount();
  const legacyBefore = lessonsIn(LEGACY_COURSE_ID);

  const missing = await put(draft("lc-new-missing", 1) as Lesson);
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, MISSING_COURSE_ERROR);

  const empty = await put(draft("lc-new-empty", 1, "") as Lesson);
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error, MISSING_COURSE_ERROR);

  const unknown = await put(draft("lc-new-unknown", 1, "course-nonexistent") as Lesson);
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, "없는 과목이에요.");

  const wrongType = await put(draft("lc-new-number", 1, 42) as Lesson);
  assert.equal(wrongType.status, 400);

  // 교수자도 같다 (권한 검사 전에 과목 지정부터 막는다)
  assert.equal((await put(draft("lc-new-missing-t", 1) as Lesson, google(A))).status, 400);

  assert.equal(lessonCount(), before);
  assert.equal(lessonsIn(LEGACY_COURSE_ID), legacyBefore);
  for (const id of ["lc-new-missing", "lc-new-empty", "lc-new-unknown", "lc-new-number", "lc-new-missing-t"]) {
    assert.equal(db.data.lessons[id], undefined, id);
  }
});

test("API: 기존 학습자료를 courseId 없이 저장하면 원래 과목을 유지한다", async () => {
  const { courseId: _drop, ...noCourse } = db.data.lessons["course-campus-w02"];
  const r = await put({ ...noCourse, description: "과목 없이 저장" } as Lesson);
  assert.equal(r.status, 200);
  assert.equal(r.body.courseId, "course-campus");
  assert.equal(db.data.lessons["course-campus-w02"].courseId, "course-campus");
  assert.equal(db.data.lessons["course-campus-w02"].description, "과목 없이 저장");

  // 빈 문자열도 원래 과목 (이전 화면 호환)
  const empty = await put({ ...db.data.lessons["course-campus-w02"], courseId: "" });
  assert.equal(empty.status, 200);
  assert.equal(db.data.lessons["course-campus-w02"].courseId, "course-campus");
});

test("API: 기존 자료(legacy) 학습자료는 그대로 편집되고, 운영 과목과의 이동은 거부한다", async () => {
  const legacy = Object.values(db.data.lessons).find((l) => l.courseId === LEGACY_COURSE_ID && l.week === 3)!;
  const edited = await put({ ...legacy, description: "기존 자료 편집" });
  assert.equal(edited.status, 200);
  assert.equal(db.data.lessons[legacy.id].courseId, LEGACY_COURSE_ID);
  assert.equal(db.data.lessons[legacy.id].description, "기존 자료 편집");

  // legacy → 운영 과목 (관리자도 거부)
  const toOpen = await put({ ...db.data.lessons[legacy.id], courseId: QA8, week: 4 });
  assert.equal(toOpen.status, 403);
  assert.equal(toOpen.body.error, LEGACY_MOVE_ERROR);
  assert.equal(db.data.lessons[legacy.id].courseId, LEGACY_COURSE_ID);

  // 운영 과목 → legacy (관리자도 거부)
  const w04 = db.data.lessons["course-campus-w04"];
  const toLegacy = await put({ ...w04, courseId: LEGACY_COURSE_ID });
  assert.equal(toLegacy.status, 403);
  assert.equal(toLegacy.body.error, LEGACY_MOVE_ERROR);
  assert.equal(db.data.lessons["course-campus-w04"].courseId, "course-campus");
});

test("API: 8주 새 과목은 1~8주차만 저장되고 9주차는 거부한다", async () => {
  for (let week = 1; week <= 8; week++) {
    const r = await put(draft(`lc-qa8-w${week}`, week, QA8) as Lesson);
    assert.equal(r.status, 200, `week ${week}: ${r.body.error ?? ""}`);
    assert.equal(r.body.courseId, QA8);
    assert.equal(r.body.week, week);
  }
  assert.equal(lessonsIn(QA8), 8);

  const w9 = await put(draft("lc-qa8-w9", 9, QA8) as Lesson);
  assert.equal(w9.status, 400);
  assert.match(w9.body.error ?? "", /1~8주차/);
  assert.equal(db.data.lessons["lc-qa8-w9"], undefined);

  // 기존 자료를 9주차로 옮기는 것도 거부
  const move = await put({ ...db.data.lessons["lc-qa8-w8"], week: 9 });
  assert.equal(move.status, 400);
  assert.equal(db.data.lessons["lc-qa8-w8"].week, 8);
});

test("API: 기존 관리자·교수자 권한 검사는 그대로다", async () => {
  // 담당 교수자 A: 담당 과목(qa8) 기존 자료 편집 가능
  const mine = await put({ ...db.data.lessons["lc-qa8-w1"], description: "담당 교수 편집" }, google(A));
  assert.equal(mine.status, 200);
  // 담당하지 않는 과목(university)은 거부
  const uni = db.data.lessons["course-university-w02"];
  assert.equal((await put({ ...uni, description: "x" }, google(A))).status, 403);
  // 담당 없는 교수자 B는 새 자료도 거부
  assert.equal((await put(draft("lc-b-new", 2, "course-campus") as Lesson, google(B))).status, 403);
  // 교수자 A가 담당 과목 자료를 담당하지 않는 과목으로 옮기기 → 거부
  assert.equal((await put({ ...db.data.lessons["lc-qa8-w2"], courseId: "course-university" }, google(A))).status, 403);
  assert.equal(db.data.lessons["lc-qa8-w2"].courseId, QA8);
  // 교수자는 기존 자료(legacy)를 편집할 수 없다
  const legacy = Object.values(db.data.lessons).find((l) => l.courseId === LEGACY_COURSE_ID)!;
  assert.equal((await put({ ...legacy, title: "x" }, google(A))).status, 403);
  // 로그인하지 않은 요청
  assert.equal((await put(draft("lc-anon", 1, QA8) as Lesson, "")).status, 401);
  assert.equal(db.data.lessons["lc-b-new"], undefined);
  assert.equal(db.data.lessons["lc-anon"], undefined);
});

// 학습자 ‘내 강의’ API 권한 테스트 (npm test)
// 임시 폴더의 새 DB로 실제 API(createApi)를 띄워 확인한다. 실제 data/db.json은 건드리지 않는다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { LEGACY_COURSE_ID } from "../src/content/courses";
import type { CourseCurriculum, CourseSummary, EnrollResult, LearnerProfile } from "../src/app/store/models";
import type { Lesson } from "../src/content/types";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";

const SECRET = "test-session-secret";
let dir = "";
let db: Db;
let base = "";
let close = () => {};

/** 서버와 같은 방식으로 서명한 로그인 쿠키 */
const cookieFor = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const learner = (id: string) => cookieFor({ k: "google", id, email: `${id}@test.com` });
const admin = cookieFor({ k: "admin" });

const call = async <T = unknown>(p: string, cookie?: string, body?: unknown) => {
  const res = await fetch(base + p, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
};

const member = (id: string, status: LearnerProfile["status"]): LearnerProfile => ({
  id,
  googleEmail: `${id}@test.com`,
  name: id,
  university: "u",
  department: "d",
  grade: "1",
  studentId: "1",
  email: `${id}@test.com`,
  phone: "010",
  avatarColor: "#fff",
  status,
  profileCompleted: true,
  firstSeenAt: "2026-10-29T00:00:00.000Z",
  lastSeenAt: "2026-10-29T00:00:00.000Z",
  approvedAt: status === "approved" ? "2026-10-29T00:00:00.000Z" : null,
});

const code = (courseId: string) => db.data.courses[courseId].code;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-test-"));
  db = openDb(dir);
  db.data.members.a = member("a", "approved");
  db.data.members.b = member("b", "approved");
  db.data.members.c = member("c", "pending");
  // 테스트용 임시 DB에서만: 과목 1의 1주차를 공개로 바꿔 학습 콘텐츠 접근을 확인한다.
  db.data.lessons["course-campus-w01"].status = "published";
  const app = express();
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      close = () => server.close();
      resolve();
    });
  });
});

after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

test("수강 과목이 없는 학습자: 내 강의는 비어 있고 커리큘럼·공개 강의자료도 없다", async () => {
  assert.deepEqual((await call("/courses", learner("a"))).body, []);
  assert.equal((await call("/courses/course-campus/curriculum", learner("a"))).status, 404);
  // 기존 자료의 공개 강의자료(lesson-week01)도 보이지 않는다.
  assert.deepEqual((await call<Lesson[]>("/lessons", learner("a"))).body, []);
});

test("잘못된 코드·기존 자료 코드는 등록되지 않는다", async () => {
  const wrong = await call<{ error: string }>("/enrollments", learner("a"), { courseCode: "WRONG1" });
  assert.equal(wrong.status, 404);
  assert.match(wrong.body.error, /강의코드/);
  assert.equal((await call("/enrollments", learner("a"), { courseCode: code(LEGACY_COURSE_ID) })).status, 404);
  assert.equal(Object.values(db.data.enrollments).filter((e) => e.userId === "a").length, 0);
});

test("승인 대기 학습자는 올바른 코드여도 등록되지 않는다", async () => {
  const r = await call("/enrollments", learner("c"), { courseCode: code("course-campus") });
  assert.equal(r.status, 403);
});

test("학습자 A: campus 코드 등록 → campus만 보이고, 같은 코드를 다시 넣어도 중복되지 않는다", async () => {
  const first = await call<EnrollResult>("/enrollments", learner("a"), { courseCode: code("course-campus") });
  assert.equal(first.status, 200);
  assert.equal(first.body.alreadyEnrolled, false);
  assert.equal(first.body.course.id, "course-campus");
  assert.equal("code" in first.body.course, false);

  const again = await call<EnrollResult>("/enrollments", learner("a"), { courseCode: ` ${code("course-campus").toLowerCase()} ` });
  assert.equal(again.body.alreadyEnrolled, true);
  assert.equal(Object.values(db.data.enrollments).filter((e) => e.userId === "a").length, 1);

  const mine = (await call<CourseSummary[]>("/courses", learner("a"))).body;
  assert.deepEqual(mine.map((c) => c.id), ["course-campus"]);
  assert.equal("code" in mine[0], false);
});

test("커리큘럼: 선택한 과목의 15주만, 학습 콘텐츠 없이 주차·주제·상태만", async () => {
  const r = await call<CourseCurriculum>("/courses/course-campus/curriculum", learner("a"));
  assert.equal(r.status, 200);
  const { weeks } = r.body;
  assert.deepEqual(weeks.map((w) => w.week), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.ok(weeks.every((w) => w.lessonId.startsWith("course-campus-w")));
  assert.equal(weeks[0].title, "첫 만남과 첫인상");
  for (const w of weeks) {
    assert.deepEqual(Object.keys(w).sort(), ["lessonId", "status", "title", "week", "youtubeId"]);
    // 준비 중인 주차는 영상 id도 보내지 않는다.
    if (w.status !== "published") assert.equal(w.youtubeId, null);
  }
  assert.equal(weeks.filter((w) => w.status === "draft").length, 14);
});

test("다른 과목·기존 자료 커리큘럼은 주소를 직접 넣어도 볼 수 없다", async () => {
  for (const id of ["course-university", "course-workplace", LEGACY_COURSE_ID, "nope"]) {
    assert.equal((await call(`/courses/${id}/curriculum`, learner("a"))).status, 404, id);
  }
});

test("학습 콘텐츠(/lessons): 수강 과목의 공개 주차만, 준비 중·다른 과목·기존 자료는 없다", async () => {
  const all = (await call<Lesson[]>("/lessons", learner("a"))).body;
  assert.deepEqual(all.map((l) => l.id), ["course-campus-w01"]);
  assert.deepEqual((await call<Lesson[]>("/lessons?course=course-university", learner("a"))).body, []);
  assert.deepEqual((await call<Lesson[]>(`/lessons?course=${LEGACY_COURSE_ID}`, learner("a"))).body, []);
  // 로그인 전에는 아무 강의자료도 받지 않는다.
  assert.deepEqual((await call<Lesson[]>("/lessons")).body, []);
});

test("학습자 B: campus + university 등록 → 두 과목만 (workplace·기존 자료 없음)", async () => {
  await call("/enrollments", learner("b"), { courseCode: code("course-campus") });
  await call("/enrollments", learner("b"), { courseCode: code("course-university") });
  const mine = (await call<CourseSummary[]>("/courses", learner("b"))).body;
  assert.deepEqual(mine.map((c) => c.id).sort(), ["course-campus", "course-university"]);
  assert.equal((await call("/courses/course-university/curriculum", learner("b"))).status, 200);
  assert.equal((await call("/courses/course-workplace/curriculum", learner("b"))).status, 404);
});

test("강의코드 미리 보기와 관리자 조회는 그대로", async () => {
  const look = await call<CourseSummary>(`/courses/lookup?code=${code("course-workplace")}`);
  assert.equal(look.status, 200);
  assert.equal(look.body.id, "course-workplace");
  assert.equal("code" in look.body, false);
  assert.equal((await call(`/courses/lookup?code=${code(LEGACY_COURSE_ID)}`)).status, 404);

  assert.equal((await call<Lesson[]>("/lessons?course=course-campus", admin)).body.length, 15);
  assert.equal((await call<Lesson[]>(`/lessons?course=${LEGACY_COURSE_ID}`, admin)).body.length, 16);
  assert.equal((await call(`/courses/${LEGACY_COURSE_ID}/curriculum`, admin)).status, 200);
  assert.equal((await call<unknown[]>("/courses", admin)).body.length, 4);
  // 교수자·관리자는 수강 등록하지 않는다.
  assert.equal((await call("/enrollments", admin, { courseCode: code("course-campus") })).status, 400);
});

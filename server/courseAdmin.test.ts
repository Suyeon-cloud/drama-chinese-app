// 관리자 과목 생성·수정·상태 변경과 공개 과목 목록 (npm test, JSON 모드)
// 임시 폴더의 새 DB로 실제 API(createApi)를 띄운다. 실제 data/db.json·Supabase는 건드리지 않는다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { ALL_COURSE_SEEDS, COURSE_SEEDS, LEGACY_COURSE_ID } from "../src/content/courses";
import type {
  Course,
  CourseCurriculum,
  CourseOverview,
  CourseSummary,
  EnrollResult,
  LearnerProfile,
  LessonProgress,
  PublicCourse,
  Section,
  SectionOverview,
} from "../src/app/store/models";
import type { Lesson } from "../src/content/types";
import { createApi, readApiEnv } from "./api";
import { COURSE_ID_PATTERN, DEFAULT_WEEK_COUNT, minWeekCountFor, newCourseId, parseCourseCreate, parseCoursePatch, randomCourseId } from "./courseInput";
import { migrateCourses } from "./courses";
import { openDb, type Db } from "./db";

/* ───────── 입력 검사 · id 생성 (단위) ───────── */

test("parseCourseCreate: 과목명 필수 1~60자, 선택 칸 길이, 주차 수 기본 15·범위 1~30", () => {
  const ok = parseCourseCreate({ title: "  새 과목  " });
  assert.deepEqual(ok, { ok: true, value: { title: "새 과목", drama: "", context: "", description: "", weekCount: DEFAULT_WEEK_COUNT } });
  assert.equal(DEFAULT_WEEK_COUNT, 15);
  const full = parseCourseCreate({ title: "가", drama: "剧", context: "맥락", description: "설명", weekCount: 30 });
  assert.equal(full.ok && full.value.weekCount, 30);
  assert.equal(parseCourseCreate({ title: "가", weekCount: 1 }).ok, true);

  const bad: unknown[] = [
    null,
    [],
    "title",
    {},
    { title: "" },
    { title: "   " },
    { title: 5 },
    { title: "가".repeat(61) },
    { title: "가", drama: "가".repeat(61) },
    { title: "가", context: "가".repeat(201) },
    { title: "가", description: "가".repeat(501) },
    { title: "가", drama: 3 },
    { title: "가", weekCount: 0 },
    { title: "가", weekCount: 31 },
    { title: "가", weekCount: 7.5 },
    { title: "가", weekCount: "15" },
    { title: "가", id: "course-mine" },
    { title: "가", status: "legacy" },
    { title: "가", status: "inactive" },
  ];
  for (const b of bad) assert.equal(parseCourseCreate(b).ok, false, JSON.stringify(b));
  // 경계값은 허용
  assert.equal(parseCourseCreate({ title: "가".repeat(60), drama: "가".repeat(60), context: "가".repeat(200), description: "가".repeat(500) }).ok, true);
});

test("parseCoursePatch: 보낸 칸만, id 변경·legacy 상태·빈 수정은 거부", () => {
  assert.deepEqual(parseCoursePatch({ title: " 새 이름 " }, "course-a"), { ok: true, value: { title: "새 이름" } });
  assert.deepEqual(parseCoursePatch({ status: "inactive", weekCount: 8 }, "course-a"), { ok: true, value: { status: "inactive", weekCount: 8 } });
  assert.deepEqual(parseCoursePatch({ id: "course-a", description: "" }, "course-a"), { ok: true, value: { description: "" } });
  for (const b of [{}, { id: "course-b" }, { status: "legacy" }, { status: "closed" }, { title: "" }, { weekCount: 0 }, { weekCount: 31 }, null, []]) {
    assert.equal(parseCoursePatch(b, "course-a").ok, false, JSON.stringify(b));
  }
});

test("과목 id: course- + 소문자·숫자 6자, 이미 있는 id와 겹치면 다시 만든다", () => {
  for (let i = 0; i < 200; i++) assert.match(randomCourseId(), COURSE_ID_PATTERN);
  const queue = ["course-aaaaaa", "course-bbbbbb"];
  const taken = new Set(["course-aaaaaa"]);
  assert.equal(newCourseId((id) => taken.has(id), () => queue.shift()!), "course-bbbbbb");
  assert.throws(() => newCourseId(() => true, () => "course-cccccc", 5));
  // course-campus·course-legacy는 새 id 형식과 모양이 같다. DB에 없어도 새 과목 id로 쓰지 않는다.
  assert.match("course-campus", COURSE_ID_PATTERN);
  for (const seed of ALL_COURSE_SEEDS) {
    const order = [seed.id, "course-dddddd"];
    assert.equal(newCourseId(() => false, () => order.shift()!), "course-dddddd", seed.id);
  }
});

test("minWeekCountFor: 학습자료·학습 기록의 가장 큰 주차", () => {
  assert.equal(minWeekCountFor([], []), 0);
  assert.equal(minWeekCountFor([1, 6, 3], []), 6);
  assert.equal(minWeekCountFor([1, 6], [7]), 7);
});

test("migrateCourses: 기본 01분반은 기본 과목에만, 관리자가 만든 과목에는 만들지 않는다", () => {
  const now = "2026-11-06T00:00:00.000Z";
  const course = (id: string, status: Course["status"] = "active"): Course => ({
    id, drama: "", title: id, context: "", description: "", code: "", weekCount: 8, status, createdAt: now, updatedAt: now,
  });
  const data = {
    version: 3,
    lessons: {},
    courses: { "course-new001": course("course-new001"), "course-new002": course("course-new002", "inactive") } as Record<string, Course>,
    courseInstructors: {},
    enrollments: {},
    sections: {} as Record<string, Section>,
    sectionInstructors: {},
  };
  migrateCourses(data, now);
  // 기본 과목은 채워지고 운영 과목마다 01분반이 생긴다.
  for (const seed of COURSE_SEEDS) assert.ok(data.sections[`section-${seed.id.replace("course-", "")}-01`], seed.id);
  // 새 과목에는 분반이 없다.
  assert.ok(!Object.values(data.sections).some((s) => s.courseId === "course-new001" || s.courseId === "course-new002"));
  // 다시 실행해도 같다.
  const snapshot = JSON.stringify(data.sections);
  assert.deepEqual(migrateCourses(data, now), []);
  assert.equal(JSON.stringify(data.sections), snapshot);
});

/* ───────── 실제 API (JSON 모드) ───────── */

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const A = "a@teach.test"; // 새 과목 01분반 담당
const B = "b@teach.test"; // 비활성 과목에 새로 배정

let dir = "";
let db: Db;
let base = "";
let adminCookie = "";
let close = () => {};
let seedSnapshot = "";

const sign = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const google = (email: string, id = email) => sign({ k: "google", id, email });
const learner = (id: string) => google(`${id}@learn.test`, id);

const call = async <T = unknown>(method: string, p: string, cookie?: string, body?: unknown) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T & { error?: string } };
};
const createCourse = (body: unknown, cookie = adminCookie) => call<CourseOverview>("POST", "/courses", cookie, body);
const patchCourse = (id: string, body: unknown, cookie = adminCookie) => call<CourseOverview>("PATCH", `/courses/${id}`, cookie, body);
const enroll = (id: string, code: string) => call<EnrollResult>("POST", "/enrollments", learner(id), { courseCode: code });

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
const draft = (id: string, courseId: string, week: number): Lesson =>
  ({
    id,
    courseId,
    week,
    title: `테스트 ${id}`,
    description: "",
    direction: "zh-ko",
    level: "",
    status: "draft",
    video: { youtubeUrl: "", youtubeId: "", startTime: 0, endTime: 0 },
    script: { source: "manual", cues: [], updatedAt: "2026-11-06T00:00:00.000Z" },
    createdAt: "2026-11-06T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
  }) as Lesson;
const progressOf = (userId: string, lessonId: string, week: number): LessonProgress => ({
  userId,
  lessonId,
  week,
  startedAt: "2026-11-06T00:00:00.000Z",
  completedAt: null,
  watchedRanges: [[0, 5]],
  progressRatio: 0.3,
  maxPosition: 5,
  quiz: null,
  quizAttempts: 0,
  lastStudiedAt: "2026-11-06T00:00:00.000Z",
});
const seedState = () =>
  JSON.stringify({
    courses: ALL_COURSE_SEEDS.map((s) => db.data.courses[s.id]),
    sections: Object.values(db.data.sections).filter((s) => ALL_COURSE_SEEDS.some((c) => c.id === s.courseId)),
    lessons: Object.values(db.data.lessons).filter((l) => ALL_COURSE_SEEDS.some((c) => c.id === l.courseId)),
  });

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-course-admin-"));
  db = openDb(dir);
  for (const email of [A, B]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  for (const id of ["s1", "s2", "s3"]) db.data.members[id] = member(id);
  db.save();
  seedSnapshot = seedState();
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
  assert.equal(login.status, 200);
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
});

after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

test("API: 관리자만 과목을 만들고 고칠 수 있다", async () => {
  const before = Object.keys(db.data.courses).length;
  assert.equal((await createCourse({ title: "x" }, "")).status, 401);
  assert.equal((await createCourse({ title: "x" }, google(A))).status, 403);
  assert.equal((await createCourse({ title: "x" }, learner("s1"))).status, 403);
  assert.equal((await patchCourse("course-campus", { title: "x" }, "")).status, 401);
  assert.equal((await patchCourse("course-campus", { title: "x" }, google(A))).status, 403);
  assert.equal(Object.keys(db.data.courses).length, before);
  assert.equal(db.data.courses["course-campus"].title, COURSE_SEEDS[0].title);
});

test("API: 새 과목은 서버 id·active·기본 15주, 분반·학습자료 없이 만들어지고 기존 과목은 그대로다", async () => {
  const r = await createCourse({ title: "新课程 테스트", drama: "测试剧", context: "맥락", description: "설명" });
  assert.equal(r.status, 201);
  assert.match(r.body.id, COURSE_ID_PATTERN);
  assert.equal(r.body.status, "active");
  assert.equal(r.body.weekCount, 15);
  assert.equal(r.body.title, "新课程 테스트");
  assert.deepEqual(r.body.sections, []);
  assert.equal(r.body.lessonCount, 0);
  const id = r.body.id;
  assert.ok(db.data.courses[id]);
  assert.ok(!Object.values(db.data.sections).some((s) => s.courseId === id));
  assert.ok(!Object.values(db.data.lessons).some((l) => l.courseId === id));

  // 주차 수 범위와 입력 검사
  assert.equal((await createCourse({ title: "w1", weekCount: 1 })).body.weekCount, 1);
  assert.equal((await createCourse({ title: "w30", weekCount: 30 })).body.weekCount, 30);
  for (const body of [{ title: "w0", weekCount: 0 }, { title: "w31", weekCount: 31 }, { title: "" }, { title: "가".repeat(61) }, { title: "x", id: "course-mine00" }]) {
    assert.equal((await createCourse(body)).status, 400, JSON.stringify(body));
  }
  assert.ok(!db.data.courses["course-mine00"]);
  assert.equal(seedState(), seedSnapshot);
});

test("API: 새 과목은 서버를 다시 켜도 분반이 생기지 않고, 기본 과목 분반은 그대로다", async () => {
  const r = await createCourse({ title: "재시작 확인", weekCount: 8 });
  const id = r.body.id;
  const reopened = openDb(dir);
  assert.ok(reopened.data.courses[id]);
  assert.ok(!Object.values(reopened.data.sections).some((s) => s.courseId === id));
  for (const seed of COURSE_SEEDS) {
    const sid = `section-${seed.id.replace("course-", "")}-01`;
    assert.deepEqual(reopened.data.sections[sid], db.data.sections[sid]);
  }
});

test("API: 과목명·설명·주차 수 수정, id 변경·legacy 수정·없는 과목은 거부", async () => {
  const id = (await createCourse({ title: "수정 전", weekCount: 10 })).body.id;
  const r = await patchCourse(id, { title: " 수정 후 ", drama: "新剧", context: "새 맥락", description: "새 설명", weekCount: 12 });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, id);
  assert.equal(r.body.title, "수정 후");
  assert.equal(r.body.weekCount, 12);
  assert.equal(db.data.courses[id].description, "새 설명");
  assert.equal(db.data.courses[id].status, "active");

  assert.equal((await patchCourse(id, { id: "course-zzzzzz", title: "x" })).status, 400);
  assert.ok(!db.data.courses["course-zzzzzz"]);
  assert.equal((await patchCourse(id, {})).status, 400);
  assert.equal((await patchCourse(id, { status: "legacy" })).status, 400);
  assert.equal((await patchCourse(id, { weekCount: 31 })).status, 400);
  assert.equal((await patchCourse("course-nonexistent", { title: "x" })).status, 404);

  const legacyBefore = JSON.stringify(db.data.courses[LEGACY_COURSE_ID]);
  assert.equal((await patchCourse(LEGACY_COURSE_ID, { title: "x" })).status, 403);
  assert.equal((await patchCourse(LEGACY_COURSE_ID, { status: "active" })).status, 403);
  assert.equal(JSON.stringify(db.data.courses[LEGACY_COURSE_ID]), legacyBefore);
});

test("API: 학습자료·학습 기록이 있는 주차 아래로는 주차 수를 줄일 수 없다", async () => {
  const id = (await createCourse({ title: "축소 확인", weekCount: 10 })).body.id;
  for (const week of [1, 6]) assert.equal((await call("PUT", `/lessons/lc-${id}-w${week}`, adminCookie, draft(`lc-${id}-w${week}`, id, week))).status, 200);
  assert.equal((await patchCourse(id, { weekCount: 5 })).status, 409);
  assert.equal(db.data.courses[id].weekCount, 10);
  assert.equal((await patchCourse(id, { weekCount: 6 })).status, 200);
  assert.equal(db.data.courses[id].weekCount, 6);
  // 학습 기록의 주차(복사본)가 더 크면 그 값까지 지킨다. (테스트 DB에서만 기록을 넣는다)
  assert.equal((await patchCourse(id, { weekCount: 9 })).status, 200);
  db.data.progress[`s3::lc-${id}-w6`] = progressOf("s3", `lc-${id}-w6`, 8);
  const blocked = await patchCourse(id, { weekCount: 7 });
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error ?? "", /8주차/);
  assert.equal((await patchCourse(id, { weekCount: 8 })).status, 200);
  // 학습자료·기록은 그대로
  assert.equal(db.data.lessons[`lc-${id}-w6`].week, 6);
  assert.ok(db.data.progress[`s3::lc-${id}-w6`]);
  // 늘리는 것은 언제나 된다
  assert.equal((await patchCourse(id, { weekCount: 20 })).body.weekCount, 20);
});

test("API: active → inactive → active — 신규 수강·분반만 막고 기존 수강생·교수자는 계속 쓴다", async () => {
  // 준비: 새 과목 + 분반(교수자 A) + 공개 학습자료 + 학생 s1 수강
  const id = (await createCourse({ title: "상태 확인", weekCount: 8 })).body.id;
  const sec = await call<SectionOverview>("POST", `/courses/${id}/sections`, adminCookie, { instructors: [A] });
  assert.equal(sec.status, 200);
  const section = sec.body;
  const pubId = `lc-${id}-pub`;
  db.data.lessons[pubId] = { ...structuredClone(db.data.lessons["course-campus-w01"]), id: pubId, courseId: id, week: 1, status: "published" };
  assert.equal((await enroll("s1", section.code)).status, 200);

  // 비활성화
  const off = await patchCourse(id, { status: "inactive" });
  assert.equal(off.status, 200);
  assert.equal(off.body.status, "inactive");
  assert.equal(db.data.courses[id].status, "inactive");

  // 신규 수강 등록·강의코드 미리보기·새 분반: 차단
  assert.equal((await enroll("s2", section.code)).status, 404);
  assert.equal((await call("GET", `/courses/lookup?code=${section.code}`)).status, 404);
  assert.equal((await call("POST", `/courses/${id}/sections`, adminCookie, {})).status, 404);
  assert.equal(Object.values(db.data.sections).filter((s) => s.courseId === id).length, 1);
  assert.ok(!Object.values(db.data.enrollments).some((e) => e.userId === "s2" && e.courseId === id));

  // 기존 수강생 s1: 과목·커리큘럼·학습자료 열람, 진도 저장
  assert.ok((await call<CourseSummary[]>("GET", "/courses", learner("s1"))).body.some((c) => c.id === id));
  const cur = await call<CourseCurriculum>("GET", `/courses/${id}/curriculum`, learner("s1"));
  assert.equal(cur.status, 200);
  assert.equal(cur.body.course.status, "inactive");
  assert.ok((await call<Lesson[]>("GET", `/lessons?course=${id}`, learner("s1"))).body.some((l) => l.id === pubId));
  const saved = await call("PUT", "/progress", learner("s1"), progressOf("s1", pubId, 1));
  assert.equal(saved.status, 200);
  assert.ok(db.data.progress[`s1::${pubId}`]);

  // 담당 교수자 A: 과목 보기, 기존 자료 편집, 새 자료 생성, 수강생 현황
  assert.ok((await call<CourseOverview[]>("GET", "/courses", google(A))).body.some((c) => c.id === id));
  assert.equal((await call("PUT", `/lessons/${pubId}`, google(A), { ...db.data.lessons[pubId], description: "비활성 과목 편집" })).status, 200);
  assert.equal(db.data.lessons[pubId].description, "비활성 과목 편집");
  assert.equal((await call("PUT", `/lessons/lc-${id}-new`, google(A), draft(`lc-${id}-new`, id, 2))).status, 200);
  assert.equal(db.data.lessons[`lc-${id}-new`].courseId, id);
  assert.equal((await call("GET", `/courses/${id}/students`, google(A))).status, 200);

  // 기존 분반에 교수자 B 새로 배정 → B도 과목을 본다
  assert.equal((await call("PUT", `/sections/${section.id}/instructors/${encodeURIComponent(B)}`, adminCookie)).status, 200);
  assert.ok((await call<CourseOverview[]>("GET", "/courses", google(B))).body.some((c) => c.id === id));

  // 공개 목록에는 없다
  assert.ok(!(await call<PublicCourse[]>("GET", "/public/courses")).body.some((c) => c.id === id));

  // 다시 운영 → 신규 수강 가능
  const on = await patchCourse(id, { status: "active" });
  assert.equal(on.body.status, "active");
  assert.equal((await enroll("s2", section.code)).status, 200);
  assert.ok((await call<PublicCourse[]>("GET", "/public/courses")).body.some((c) => c.id === id));
  // 기존 수강·진도·배정은 상태 변경 내내 그대로
  assert.ok(db.data.enrollments[`${section.id}::s1`]);
  assert.ok(db.data.progress[`s1::${pubId}`]);
});

test("API: 기존 자료(legacy) 과목은 학생·교수자에게 보이지 않고 공개 목록에도 없다", async () => {
  const pub = (await call<PublicCourse[]>("GET", "/public/courses")).body;
  assert.ok(!pub.some((c) => c.id === LEGACY_COURSE_ID));
  assert.equal((await call("GET", `/courses/${LEGACY_COURSE_ID}/curriculum`, learner("s1"))).status, 404);
  assert.equal((await call("GET", `/courses/${LEGACY_COURSE_ID}/curriculum`, google(A))).status, 404);
  assert.equal((await call("POST", `/courses/${LEGACY_COURSE_ID}/sections`, adminCookie, {})).status, 404);
  // 관리자는 기존 자료 과목을 계속 본다
  assert.ok((await call<CourseOverview[]>("GET", "/courses", adminCookie)).body.some((c) => c.id === LEGACY_COURSE_ID));
});

test("API: 공개 과목 목록은 로그인 없이 active 과목의 표시 칸만 준다", async () => {
  const inactive = (await createCourse({ title: "비공개 확인" })).body.id;
  await patchCourse(inactive, { status: "inactive" });
  const r = await call<PublicCourse[]>("GET", "/public/courses");
  assert.equal(r.status, 200);
  const ids = r.body.map((c) => c.id);
  // 기본 3과목이 먼저, 기존 순서대로
  assert.deepEqual(ids.slice(0, 3), COURSE_SEEDS.map((s) => s.id));
  for (const c of r.body) {
    assert.equal(db.data.courses[c.id].status, "active", c.id);
    assert.deepEqual(Object.keys(c).sort(), ["context", "description", "drama", "id", "title", "weekCount"]);
  }
  assert.ok(!ids.includes(inactive));
  assert.ok(!ids.includes(LEGACY_COURSE_ID));
  const raw = JSON.stringify(r.body);
  for (const secret of ["code", "sections", "instructors", "email", "enrolled"]) assert.ok(!raw.includes(`"${secret}`), secret);
});

test("API: 과목 관리 뒤에도 기본 과목·분반·학습자료는 바뀌지 않았다", () => {
  assert.equal(seedState(), seedSnapshot);
});

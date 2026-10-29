// 분반(Section) 구조의 교강사·관리자 권한 테스트 (npm test)
// 임시 폴더의 새 DB로 실제 API(createApi)를 띄워 확인한다. 실제 data/db.json은 건드리지 않는다.
// 교강사 A/B/C/D와 학생은 이 테스트 DB에만 있는 계정이다.
//
//   campus 01분반 (기존 과목 코드)   교강사 A + C(공동)   학생 s1, s2
//   campus 02분반 (자동 생성 코드)   교강사 B             학생 s3, s4
//   university 01분반                교강사 B             학생 s5
//   workplace 01분반                 교강사 C
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { LEGACY_COURSE_ID } from "../src/content/courses";
import type {
  CourseCurriculum,
  CourseOverview,
  CourseStudents,
  CourseSummary,
  EnrollResult,
  LearnerProfile,
  LessonProgress,
  SectionOverview,
} from "../src/app/store/models";
import type { Lesson } from "../src/content/types";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const A = "a@teach.test";
const B = "b@teach.test";
const C = "c@teach.test";
const D = "d@teach.test"; // 3과목 기본 01분반 모두 담당 (관리자 API로 배정)
const OPEN = ["course-campus", "course-university", "course-workplace"];
const CAMPUS1 = "section-campus-01";
const UNI1 = "section-university-01";
const WORK1 = "section-workplace-01";

let dir = "";
let db: Db;
let base = "";
let adminCookie = "";
let campus2: SectionOverview;
let close = () => {};

const sign = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
/** Google 로그인 쿠키 (교강사는 이메일, 학습자는 회원 id로 판별된다) */
const google = (email: string, id = email) => sign({ k: "google", id, email });
const learner = (id: string) => google(`${id}@learn.test`, id);

const call = async <T = unknown>(method: string, p: string, cookie?: string, body?: unknown) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T, headers: res.headers };
};
const get = <T = unknown>(p: string, cookie?: string) => call<T>("GET", p, cookie);
const enroll = (id: string, code: string) => call<EnrollResult & { error?: string }>("POST", "/enrollments", learner(id), { courseCode: code });

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
  firstSeenAt: "2026-10-29T00:00:00.000Z",
  lastSeenAt: "2026-10-29T00:00:00.000Z",
  approvedAt: "2026-10-29T00:00:00.000Z",
});

const record = (userId: string, lessonId: string, week: number): LessonProgress => ({
  userId,
  lessonId,
  week,
  startedAt: "2026-10-29T00:00:00.000Z",
  completedAt: "2026-10-29T01:00:00.000Z",
  watchedRanges: [[0, 10]],
  progressRatio: 1,
  maxPosition: 10,
  quiz: { correct: 3, total: 4, submittedAt: "2026-10-29T01:00:00.000Z" },
  quizAttempts: 1,
  lastStudiedAt: "2026-10-29T01:00:00.000Z",
});

const sectionCode = (id: string) => db.data.sections[id].code;
const studentIds = async (cookie: string, courseId: string, section?: string) =>
  (await get<CourseStudents>(`/courses/${courseId}/students${section ? `?section=${section}` : ""}`, cookie)).body.students
    .map((s) => s.userId)
    .sort();
const mySections = async (cookie: string) =>
  (await get<CourseOverview[]>("/courses", cookie)).body.flatMap((c) => c.sections.map((s) => s.id)).sort();
const putTeacher = (sectionId: string, email: string, cookie = adminCookie) =>
  call<{ existed: boolean }>("PUT", `/sections/${sectionId}/instructors/${encodeURIComponent(email)}`, cookie);

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-sections-"));
  db = openDb(dir);
  for (const email of [A, B, C, D]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  for (const id of ["s1", "s2", "s3", "s4", "s5", "s6"]) db.data.members[id] = member(id);
  db.data.instructorNames[A] = "교강사 에이";
  // 테스트 DB에서만: 공개 주차 하나씩
  db.data.lessons["course-campus-w01"].status = "published";
  db.data.lessons["course-university-w01"].status = "published";

  const app = express();
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET, ...ADMIN })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      close = () => server.close();
      resolve();
    });
  });
  // 관리자는 기존 아이디·비밀번호 로그인으로 쿠키를 받는다.
  const login = await call("POST", "/auth/admin", undefined, { id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  // 분반·배정은 관리자 API로 만든다.
  await putTeacher(CAMPUS1, A);
  await putTeacher(CAMPUS1, C);
  const created = await call<SectionOverview>("POST", "/courses/course-campus/sections", adminCookie, { instructors: [B] });
  assert.equal(created.status, 200);
  campus2 = created.body;
  await putTeacher(UNI1, B);
  await putTeacher(WORK1, C);

  for (const id of ["s1", "s2"]) assert.equal((await enroll(id, sectionCode(CAMPUS1))).status, 200);
  for (const id of ["s3", "s4"]) assert.equal((await enroll(id, campus2.code)).status, 200);
  assert.equal((await enroll("s5", sectionCode(UNI1))).status, 200);
  for (const id of ["s1", "s3"]) db.data.progress[`${id}::course-campus-w01`] = record(id, "course-campus-w01", 1);
  db.data.progress["s5::course-university-w01"] = record("s5", "course-university-w01", 1);
});

after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

/* ───────── 분반 ───────── */

test("기본 01분반: 운영 과목마다 생기고 기존 과목 강의코드를 이어받는다 (기존 자료는 분반 없음)", () => {
  for (const courseId of OPEN) {
    const s = db.data.sections[`section-${courseId.replace("course-", "")}-01`];
    assert.equal(s.courseId, courseId);
    assert.equal(s.name, "01분반");
    assert.equal(s.code, db.data.courses[courseId].code);
    assert.equal(s.status, "active");
  }
  assert.ok(!Object.values(db.data.sections).some((s) => s.courseId === LEGACY_COURSE_ID));
  const legacyCode = db.data.courses[LEGACY_COURSE_ID].code;
  assert.ok(!Object.values(db.data.sections).some((s) => s.code === legacyCode));
});

test("새 분반 개설: 다음 번호 이름, 자동·고유 강의코드, 학습자료는 늘지 않는다", async () => {
  assert.equal(campus2.id, "section-campus-02");
  assert.equal(campus2.name, "02분반");
  assert.match(campus2.code, /^[A-Z2-9]{6}$/);
  const codes = Object.values(db.data.sections).map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(!Object.values(db.data.courses).some((c) => c.code === campus2.code));

  const before = Object.keys(db.data.lessons).length;
  const third = await call<SectionOverview>("POST", "/courses/course-campus/sections", adminCookie, { instructors: [] });
  assert.equal(third.body.name, "03분반");
  assert.equal(Object.keys(db.data.lessons).length, before);
  assert.equal(Object.values(db.data.lessons).filter((l) => l.courseId === "course-campus").length, 15);
  assert.equal(Object.values(db.data.lessons).filter((l) => OPEN.includes(l.courseId)).length, 45);
  // 03분반 수강생도 과목 공통 15주를 본다 (분반별 학습자료 복제 없음)
  assert.equal((await enroll("s6", third.body.code)).status, 200);
  const cur = await get<CourseCurriculum>("/courses/course-campus/curriculum", learner("s6"));
  assert.deepEqual(cur.body.weeks.map((w) => w.lessonId), Array.from({ length: 15 }, (_, i) => `course-campus-w${String(i + 1).padStart(2, "0")}`));
  // 같은 이름의 운영 중 분반은 만들 수 없다.
  assert.equal((await call("POST", "/courses/course-campus/sections", adminCookie, { name: "02분반" })).status, 409);
  // 기존 자료 과목에는 분반을 만들지 않는다.
  assert.equal((await call("POST", `/courses/${LEGACY_COURSE_ID}/sections`, adminCookie, {})).status, 404);
});

test("분반 이름 변경과 비활성화: 비활성 분반은 신규 등록만 막고 기존 수강·기록은 그대로", async () => {
  const s3 = Object.values(db.data.sections).find((s) => s.name === "03분반")!;
  const renamed = await call<SectionOverview>("PATCH", `/sections/${s3.id}`, adminCookie, { name: "주말반" });
  assert.equal(renamed.body.name, "주말반");
  assert.equal((await call("PATCH", `/sections/${s3.id}`, adminCookie, { name: "01분반" })).status, 409);

  const off = await call<SectionOverview>("PATCH", `/sections/${s3.id}`, adminCookie, { status: "inactive" });
  assert.equal(off.body.status, "inactive");
  // 기존 수강생 s6은 그대로 수강·학습
  assert.ok(db.data.enrollments[`${s3.id}::s6`]);
  assert.deepEqual((await get<CourseSummary[]>("/courses", learner("s6"))).body.map((c) => c.id), ["course-campus"]);
  // 새 학생은 그 코드로 등록할 수 없다. 코드 미리 보기도 없다.
  db.data.members.s7 = member("s7");
  assert.equal((await enroll("s7", s3.code)).status, 404);
  assert.equal((await get(`/courses/lookup?code=${s3.code}`)).status, 404);
  // 다시 운영하면 등록할 수 있다.
  await call("PATCH", `/sections/${s3.id}`, adminCookie, { status: "active" });
  assert.equal((await get(`/courses/lookup?code=${s3.code}`)).status, 200);
});

/* ───────── 수강 등록 ───────── */

test("분반 강의코드로 등록: sectionId 기록, 같은 분반 중복 없음, 같은 과목 다른 분반은 막고 다른 과목은 허용", async () => {
  const e = db.data.enrollments[`${CAMPUS1}::s1`];
  assert.equal(e.sectionId, CAMPUS1);
  assert.equal(e.courseId, "course-campus");

  const again = await enroll("s1", sectionCode(CAMPUS1).toLowerCase());
  assert.equal(again.body.alreadyEnrolled, true);
  assert.equal(again.body.section.name, "01분반");
  const other = await enroll("s1", campus2.code);
  assert.equal(other.status, 409);
  assert.match(other.body.error ?? "", /다른 분반/);
  assert.equal(Object.values(db.data.enrollments).filter((x) => x.userId === "s1" && x.courseId === "course-campus").length, 1);

  const uni = await enroll("s1", sectionCode(UNI1));
  assert.equal(uni.status, 200);
  assert.equal(uni.body.section.id, UNI1);
  const mine = (await get<CourseSummary[]>("/courses", learner("s1"))).body;
  assert.deepEqual(mine.map((c) => c.id).sort(), ["course-campus", "course-university"]);
  // 내 강의에 분반과 (알려진) 교강사 이름
  const campus = mine.find((c) => c.id === "course-campus")!;
  assert.equal(campus.section?.name, "01분반");
  assert.deepEqual(campus.section?.instructorNames, ["교강사 에이"]);
});

/* ───────── 교강사 ───────── */

test("교강사는 담당 분반 학생만: A·C(공동)는 01분반, B는 02분반 — 서로 섞이지 않는다", async () => {
  const me = await get<{ user: { role: string; provider: string } }>("/auth/me", google(A));
  assert.equal(me.body.user.role, "instructor");
  assert.equal(me.body.user.provider, "google");

  assert.deepEqual(await studentIds(google(A), "course-campus"), ["s1", "s2"]);
  assert.deepEqual(await studentIds(google(C), "course-campus"), ["s1", "s2"]);
  assert.deepEqual(await studentIds(google(B), "course-campus"), ["s3", "s4"]);
  assert.deepEqual(await studentIds(google(A), "course-campus", CAMPUS1), ["s1", "s2"]);
  // 다른 분반을 지정해도 볼 수 없다.
  assert.equal((await get(`/courses/course-campus/students?section=${campus2.id}`, google(A))).status, 404);
  assert.equal((await get(`/courses/course-campus/students?section=${CAMPUS1}`, google(B))).status, 404);
  // 담당 분반 목록
  assert.deepEqual(await mySections(google(A)), [CAMPUS1]);
  assert.deepEqual(await mySections(google(B)), [campus2.id, UNI1].sort());
  assert.deepEqual(await mySections(google(C)), [CAMPUS1, WORK1].sort());
  // 교강사가 받는 과목 정보에는 담당 분반만
  const bCampus = (await get<CourseOverview[]>("/courses", google(B))).body.find((c) => c.id === "course-campus")!;
  assert.deepEqual(bCampus.sections.map((s) => s.id), [campus2.id]);
  assert.equal(bCampus.enrolledCount, 2);
});

test("교강사 한 명이 3과목 기본 01분반을 모두 담당할 수 있다", async () => {
  for (const s of [CAMPUS1, UNI1, WORK1]) assert.equal((await putTeacher(s, D)).status, 200);
  assert.deepEqual(await mySections(google(D)), [CAMPUS1, UNI1, WORK1].sort());
  assert.deepEqual((await get<CourseOverview[]>("/courses", google(D))).body.map((c) => c.id).sort(), [...OPEN].sort());
  assert.equal((await putTeacher(CAMPUS1, D)).body.existed, true);
  assert.equal(Object.values(db.data.sectionInstructors).filter((x) => x.email === D).length, 3);
  // 공동 담당: campus 01분반 = A, C, D
  const campus = (await get<CourseOverview[]>("/courses", adminCookie)).body.find((c) => c.id === "course-campus")!;
  assert.deepEqual(campus.sections.find((s) => s.id === CAMPUS1)!.instructors.map((t) => t.email).sort(), [A, C, D].sort());
  // 해제
  assert.equal((await call("DELETE", `/sections/${WORK1}/instructors/${encodeURIComponent(D)}`, adminCookie)).status, 200);
  assert.deepEqual(await mySections(google(D)), [CAMPUS1, UNI1].sort());
});

/* ───────── 학습자료 ───────── */

test("학습자료는 과목 공통: 같은 과목의 다른 분반 교강사 모두 편집, 담당 분반 없는 과목은 불가", async () => {
  const w3 = db.data.lessons["course-campus-w03"];
  for (const [who, note] of [[A, "A 메모"], [B, "B 메모"]] as const) {
    const r = await call<Lesson>("PUT", `/lessons/${w3.id}`, google(who), { ...db.data.lessons[w3.id], description: note });
    assert.equal(r.status, 200, who);
  }
  assert.equal(db.data.lessons[w3.id].description, "B 메모");
  // A는 university 분반이 없다.
  const uni = db.data.lessons["course-university-w02"];
  const before = JSON.stringify(uni);
  assert.equal((await call("PUT", `/lessons/${uni.id}`, google(A), { ...uni, title: "x" })).status, 403);
  assert.equal((await call("DELETE", `/lessons/${uni.id}`, google(A))).status, 403);
  assert.equal((await get<Lesson[]>("/lessons?course=course-university", google(A))).body.length, 0);
  assert.equal((await get<Lesson[]>("/lessons", google(A))).body.length, 15);
  // 과목 이동·기존 자료 수정도 불가
  assert.equal((await call("PUT", `/lessons/${w3.id}`, google(A), { ...db.data.lessons[w3.id], courseId: "course-workplace" })).status, 403);
  const legacy = db.data.lessons["lesson-week01"];
  assert.equal((await call("PUT", `/lessons/${legacy.id}`, google(C), { ...legacy, title: "x" })).status, 403);
  assert.equal(JSON.stringify(db.data.lessons[uni.id]), before);
  assert.equal(Object.values(db.data.lessons).filter((l) => OPEN.includes(l.courseId)).length, 45);
});

/* ───────── 학습 기록 · 퀴즈 ───────── */

test("교강사는 자기 분반 학생의 그 과목 기록만: 다른 분반 학생 진도·퀴즈는 차단", async () => {
  const a = (await get<CourseStudents>("/courses/course-campus/students", google(A))).body;
  assert.deepEqual(a.progress.map((p) => p.userId), ["s1"]);
  assert.equal(a.progress[0].quiz?.correct, 3);
  const b = (await get<CourseStudents>("/courses/course-campus/students", google(B))).body;
  assert.deepEqual(b.progress.map((p) => p.userId), ["s3"]);

  const aAll = (await get<LessonProgress[]>("/progress", google(A))).body;
  assert.deepEqual(aAll.map((p) => `${p.userId}:${p.lessonId}`), ["s1:course-campus-w01"]);
  const bAll = (await get<LessonProgress[]>("/progress", google(B))).body.map((p) => `${p.userId}:${p.lessonId}`).sort();
  assert.deepEqual(bAll, ["s3:course-campus-w01", "s5:course-university-w01"]);
  // 수강 등록 목록도 담당 분반만
  const enr = (await get<{ userId: string }[]>("/enrollments?course=course-campus", google(B))).body;
  assert.deepEqual(enr.map((e) => e.userId).sort(), ["s3", "s4"]);
  // 담당 분반이 없는 과목
  assert.equal((await get("/courses/course-workplace/students", google(A))).status, 404);
  assert.equal((await get("/courses/course-workplace/curriculum", google(A))).status, 404);
});

/* ───────── 관리자 ───────── */

test("관리자: 기존 아이디·비밀번호 로그인 유지, 모든 분반·학생 조회", async () => {
  assert.equal((await get<{ user: { provider: string } }>("/auth/me", adminCookie)).body.user.provider, "admin");
  assert.equal((await call("POST", "/auth/admin", undefined, { id: ADMIN.ADMIN_ID, password: "wrong" })).status, 401);
  assert.equal((await call("POST", "/auth/admin", undefined, { password: ADMIN.ADMIN_PASSWORD })).status, 401);
  assert.deepEqual(await studentIds(adminCookie, "course-campus"), ["s1", "s2", "s3", "s4", "s6"]);
  assert.deepEqual(await studentIds(adminCookie, "course-campus", campus2.id), ["s3", "s4"]);
  const open = (await get<CourseOverview[]>("/courses", adminCookie)).body.filter((c) => c.status === "active");
  assert.deepEqual(open.map((c) => c.id).sort(), [...OPEN].sort());
  for (const c of open) assert.equal(c.sections.find((s) => s.name === "01분반")!.code, db.data.courses[c.id].code);
  assert.equal((await get<Lesson[]>("/lessons", adminCookie)).body.length, 61);
});

test("분반 개설·이름 변경·비활성화·교강사 배정/해제는 관리자만", async () => {
  const before = JSON.stringify({ s: db.data.sections, i: db.data.sectionInstructors });
  for (const cookie of [google(A), learner("s1")]) {
    assert.equal((await call("POST", "/courses/course-campus/sections", cookie, { name: "99분반" })).status, 403);
    assert.equal((await call("PATCH", `/sections/${CAMPUS1}`, cookie, { name: "x" })).status, 403);
    assert.equal((await call("PATCH", `/sections/${CAMPUS1}`, cookie, { status: "inactive" })).status, 403);
    assert.equal((await putTeacher(campus2.id, A, cookie)).status, 403);
    assert.equal((await call("DELETE", `/sections/${CAMPUS1}/instructors/${encodeURIComponent(A)}`, cookie)).status, 403);
  }
  assert.equal((await call("POST", "/courses/course-campus/sections", undefined, {})).status, 401);
  // 교강사 등록·회원 관리도 관리자만
  assert.equal((await call("POST", "/instructors", google(A), { email: "x@teach.test" })).status, 403);
  assert.equal((await call("PATCH", "/members/s1", google(A), { status: "pending" })).status, 403);
  assert.equal((await get("/members", google(A))).status, 403);
  // 등록되지 않은 이메일은 배정할 수 없다.
  assert.equal((await putTeacher(CAMPUS1, "nobody@teach.test")).status, 400);
  assert.equal(JSON.stringify({ s: db.data.sections, i: db.data.sectionInstructors }), before);
});

/* ───────── 학습자 회귀 ───────── */

test("학습자: 내 강의·분반 표시·15주·draft 차단·다른 과목·기존 자료 미노출", async () => {
  const s3 = learner("s3");
  assert.equal((await get<{ user: { role: string } }>("/auth/me", s3)).body.user.role, "learner");
  const mine = (await get<CourseSummary[]>("/courses", s3)).body;
  assert.deepEqual(mine.map((c) => c.id), ["course-campus"]);
  assert.equal(mine[0].section?.name, "02분반");
  const cur = (await get<CourseCurriculum>("/courses/course-campus/curriculum", s3)).body;
  assert.equal(cur.weeks.length, 15);
  assert.equal(cur.course.section?.id, campus2.id);
  assert.deepEqual((await get<Lesson[]>("/lessons", s3)).body.map((l) => l.id), ["course-campus-w01"]);
  assert.equal((await get("/courses/course-university/curriculum", s3)).status, 404);
  assert.equal((await get(`/courses/${LEGACY_COURSE_ID}/curriculum`, s3)).status, 404);
  assert.equal((await get("/courses/course-campus/students", s3)).status, 404);
  // 코드 미리 보기는 과목과 분반 이름을 알려준다 (강의코드는 보내지 않는다)
  const look = await get<{ id: string; sectionName: string }>(`/courses/lookup?code=${campus2.code}`);
  assert.equal(look.body.id, "course-campus");
  assert.equal(look.body.sectionName, "02분반");
  assert.equal("code" in look.body, false);
  // 수강하지 않는 과목의 공개 주차 기록은 남길 수 없다.
  assert.equal((await call("PUT", "/progress", s3, record("s3", "course-university-w01", 1))).status, 403);
});

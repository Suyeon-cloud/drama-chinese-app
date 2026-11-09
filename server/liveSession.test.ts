// 6-B 실시간 퀴즈 세션 (npm test): 상태 전이·정답 비공개 단위 검사 + JSON 모드 실제 API(임시 폴더). Supabase·외부 호출 없음.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import type { LiveQuizSet } from "../src/content/liveQuiz";
import {
  isJoinCode,
  liveHostState,
  liveStudentState,
  nextLiveState,
  normalizeJoinCode,
  type LiveHostState,
  type LiveStudentState,
  type StoredLiveSession,
} from "../src/content/liveSession";
import type { LearnerProfile } from "../src/app/store/models";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";
import { sectionInstructorKey } from "./courses";

/* ───────── 1) 규칙 ───────── */

const session = (over: Partial<StoredLiveSession> = {}): StoredLiveSession => ({
  id: "lqs-abc123def456",
  courseId: "c",
  sectionId: "s",
  setId: null,
  title: "t",
  questions: [
    { id: "q1", question: "Q1", options: ["a", "b", "c", "d"], answer: 2, explanation: "SECRET-EXPLANATION-1" },
    { id: "q2", question: "Q2", options: ["x", "y"], answer: 0, explanation: "" },
  ],
  joinCode: "ABC234",
  status: "active",
  currentIndex: null,
  phase: "waiting",
  version: 1,
  createdByLabel: null,
  createdAt: "",
  updatedAt: "",
  endedAt: null,
  participants: {},
  responses: {},
  ...over,
});

test("상태 전이: 대기→출제→마감→정답 공개→다음 문제, 순서를 건너뛰면 거부, 마지막 문제 뒤 출제 불가, 종료 뒤 모두 거부", () => {
  let s = session();
  const step = (a: "next" | "close" | "reveal" | "end") => {
    const r = nextLiveState(s, a);
    if (r.ok) s = { ...s, phase: r.phase, currentIndex: r.currentIndex, status: r.status };
    return r.ok;
  };
  assert.equal(step("close"), false, "대기 중 마감 불가");
  assert.equal(step("reveal"), false);
  assert.equal(step("next"), true);
  assert.deepEqual([s.phase, s.currentIndex], ["open", 0]);
  assert.equal(step("next"), false, "응답 중 다음 문제 불가");
  assert.equal(step("reveal"), false, "마감 전 정답 공개 불가");
  assert.equal(step("close"), true);
  assert.equal(step("next"), false, "공개 전 다음 문제 불가");
  assert.equal(step("reveal"), true);
  assert.equal(step("next"), true);
  assert.deepEqual([s.phase, s.currentIndex], ["open", 1]);
  assert.ok(step("close") && step("reveal"));
  assert.equal(step("next"), false, "마지막 문제 뒤");
  assert.equal(step("end"), true);
  assert.equal(s.status, "ended");
  for (const a of ["next", "close", "reveal", "end"] as const) assert.equal(nextLiveState(s, a).ok, false, `종료 뒤 ${a}`);
  assert.ok(isJoinCode("ABC234") && !isJoinCode("ABCO12") && !isJoinCode("abc234") && !isJoinCode("ABC23"));
  assert.equal(normalizeJoinCode(" abc234 "), "ABC234");
});

test("화면 상태: 학생에게는 정답 공개 전 정답·해설·응답 수가 없고, 다른 학생 응답은 누구에게도 개별로 가지 않는다", () => {
  const s = session({ currentIndex: 0, phase: "open", participants: { u1: "", u2: "" }, responses: { "0:u1": { choice: 2, at: "" }, "0:u2": { choice: 1, at: "" } } });
  for (const phase of ["open", "closed"] as const) {
    const st = liveStudentState({ ...s, phase }, "u1");
    assert.deepEqual([st.answer, st.explanation, st.counts], [null, null, null], phase);
    assert.ok(!JSON.stringify(st).includes("SECRET-EXPLANATION-1"), phase);
    assert.ok(!("answer" in st.question!), "문제 객체에 정답 칸 없음");
    assert.equal(st.myChoice, 2);
  }
  const rev = liveStudentState({ ...s, phase: "revealed" }, "u2");
  assert.deepEqual([rev.answer, rev.explanation, rev.counts, rev.myChoice], [2, "SECRET-EXPLANATION-1", [0, 1, 1, 0], 1]);
  assert.ok(!JSON.stringify(rev).includes("u1"), "다른 학생 id 없음");
  const host = liveHostState(s);
  assert.deepEqual([host.participants, host.counts, host.summary], [2, [0, 1, 1, 0], [{ index: 0, responded: 2, correct: 1 }]]);
  assert.ok(!JSON.stringify(host).includes("u1") && !JSON.stringify(host).includes("u2"), "교수자에게도 집계만");
});

/* ───────── 2) JSON 모드 실제 API ───────── */

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const T = "t@teach.test";
const OTHER = "o@teach.test";
const COURSE = "course-campus";
let dir = "";
let db: Db;
let base = "";
let adminCookie = "";
let close = () => {};
let untouched = "";
let sectionId = "";
const sign = (s: object) => {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + 3600_000 })).toString("base64url");
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
  const text = await res.text();
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* 빈 응답 */
  }
  return { status: res.status, body: parsed as R & { error?: string }, text };
};
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
  firstSeenAt: "2026-11-09T00:00:00.000Z",
  lastSeenAt: "2026-11-09T00:00:00.000Z",
  approvedAt: "2026-11-09T00:00:00.000Z",
});
const snapshot = () => JSON.stringify({ lessons: db.data.lessons, progress: db.data.progress, enrollments: db.data.enrollments, weekMaterials: db.data.weekMaterials });

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-live-"));
  db = openDb(dir);
  for (const email of [T, OTHER]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  for (const id of ["s1", "s2", "s3"]) db.data.members[id] = member(id);
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
  const login = await fetch(`${base}/auth/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }) });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const section = Object.values(db.data.sections).find((s) => s.courseId === COURSE && s.status === "active")!;
  sectionId = section.id;
  assert.equal((await call("PUT", `/sections/${section.id}/instructors/${encodeURIComponent(T)}`, adminCookie)).status, 200);
  for (const id of ["s1", "s3"]) assert.equal((await call("POST", "/enrollments", learner(id), { courseCode: section.code })).status, 200);
  // s2: 다른 과목 수강생
  const other = Object.values(db.data.sections).find((s) => s.courseId !== COURSE && s.status === "active")!;
  assert.equal((await call("POST", "/enrollments", learner("s2"), { courseCode: other.code })).status, 200);
  untouched = snapshot();
});
after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

const qs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ question: `실시간 Q${i + 1}?`, options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`], answer: i % 4, explanation: `EXPLAIN-${i + 1}`, origin: "manual" }));

test("세션 시작 권한: 준비 완료 세트·운영 중 담당 분반의 교수자만, 분반당 진행 중 1개, 관리자·학생·담당 아닌 교수자 거부", async () => {
  const draft = await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), { week: 1, title: "작성 중", questions: qs(1) });
  assert.equal((await call("POST", "/live/sessions", google(T), { setId: draft.body.id, sectionId })).status, 400, "준비 완료만");
  const ready = await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), { week: 1, title: "준비", status: "ready", questions: qs(2).map((q) => ({ ...q, question: `${q.question} 시작` })) });
  const body = { setId: ready.body.id, sectionId };
  assert.equal((await call("POST", "/live/sessions", undefined, body)).status, 401);
  assert.equal((await call("POST", "/live/sessions", learner("s1"), body)).status, 403);
  assert.equal((await call("POST", "/live/sessions", google(OTHER), body)).status, 403);
  assert.equal((await call("POST", "/live/sessions", adminCookie, body)).status, 403, "관리자 계정은 진행하지 않는다");
  const otherSection = Object.values(db.data.sections).find((s) => s.courseId !== COURSE)!;
  assert.equal((await call("POST", "/live/sessions", google(T), { ...body, sectionId: otherSection.id })).status, 400, "다른 과목 분반");
  const started = await call<LiveHostState>("POST", "/live/sessions", google(T), body);
  assert.equal(started.status, 201);
  assert.ok(isJoinCode(started.body.joinCode));
  assert.deepEqual([started.body.phase, started.body.currentIndex, started.body.total, started.body.version], ["waiting", null, 2, 1]);
  assert.equal((await call("POST", "/live/sessions", google(T), body)).status, 409, "분반당 진행 중 세션 1개");
  // 정리: 종료
  assert.equal((await call("POST", `/live/sessions/${started.body.id}/control`, google(T), { action: "end", version: 1 })).status, 200);
  for (const id of [draft.body.id, ready.body.id]) await call("DELETE", `/live-quiz-sets/${id}`, google(T));
});

test("실시간 진행 전체: 참여(수강생만)·출제·제출 1회·마감 뒤 거부·정답은 공개 후에만·다음 문제·종료·새로고침 복구·스냅샷", async () => {
  const set = (await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), { week: 2, title: "진행", status: "ready", questions: qs(2) })).body;
  const host = (await call<LiveHostState>("POST", "/live/sessions", google(T), { setId: set.id, sectionId })).body;
  const id = host.id;

  // 복구: 진행 중 세션 목록 (담당 교수자만)
  const mine = await call<{ id: string }[]>("GET", `/courses/${COURSE}/live/sessions`, google(T));
  assert.deepEqual(mine.body.map((s) => s.id), [id]);
  assert.deepEqual((await call<unknown[]>("GET", `/courses/${COURSE}/live/sessions`, google(OTHER))).body, []);
  assert.equal((await call("GET", `/live/sessions/${id}/host`, google(OTHER))).status, 404);
  assert.equal((await call("GET", `/live/sessions/${id}/host`, learner("s1"))).status, 404, "학생은 교수자 상태(정답 포함) 불가");

  // 참여: 수강생만, 코드 대소문자 무시, 다시 참여해도 1명
  assert.equal((await call("POST", "/live/join", learner("s2"), { code: host.joinCode })).status, 404, "다른 과목 수강생");
  assert.equal((await call("POST", "/live/join", learner("s1"), { code: "ZZZZZZ" })).status, 404);
  assert.equal((await call("POST", "/live/join", google(T), { code: host.joinCode })).status, 404, "교수자는 학생으로 참여하지 않는다");
  assert.equal((await call("POST", "/live/join", learner("s1"), { code: host.joinCode.toLowerCase() })).status, 200);
  assert.equal((await call("POST", "/live/join", learner("s1"), { code: host.joinCode })).status, 200, "여러 탭·새로고침");
  assert.equal((await call("GET", `/live/sessions/${id}/state`, learner("s3"))).status, 404, "참여 전에는 상태 불가");
  let st = await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s1"));
  assert.deepEqual([st.body.phase, st.body.question], ["waiting", null]);

  // 출제: 버전이 다르면 409 (여러 탭)
  assert.equal((await call("POST", `/live/sessions/${id}/control`, google(T), { action: "next", version: 99 })).status, 409);
  assert.equal((await call("POST", `/live/sessions/${id}/control`, learner("s1"), { action: "next", version: 1 })).status, 404, "학생은 진행 불가");
  let h = (await call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action: "next", version: 1 })).body;
  assert.deepEqual([h.phase, h.currentIndex, h.participants], ["open", 0, 1]);
  st = await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s1"));
  assert.deepEqual([st.body.question?.question, st.body.answer, st.body.explanation, st.body.counts], ["실시간 Q1?", null, null, null]);
  assert.ok(!st.text.includes("EXPLAIN-1") && !st.text.includes('"answer":0'), "공개 전 응답 본문에 정답·해설 없음");

  // 제출: 1회만, 범위·문제 번호 확인
  assert.equal((await call("POST", `/live/sessions/${id}/answers`, learner("s1"), { questionIndex: 0, choice: 9 })).status, 400);
  assert.equal((await call("POST", `/live/sessions/${id}/answers`, learner("s1"), { questionIndex: 1, choice: 0 })).status, 409, "지금 문제가 아님");
  assert.equal((await call<LiveStudentState>("POST", `/live/sessions/${id}/answers`, learner("s1"), { questionIndex: 0, choice: 1 })).body.myChoice, 1);
  const dup = await call("POST", `/live/sessions/${id}/answers`, learner("s1"), { questionIndex: 0, choice: 0 });
  assert.equal(dup.status, 409, "두 번째 제출");
  assert.match(dup.body.error ?? "", /이미 답했어요/);
  assert.equal((await call("POST", `/live/sessions/${id}/answers`, learner("s2"), { questionIndex: 0, choice: 0 })).status, 404, "참여하지 않은 학생");
  h = (await call<LiveHostState>("GET", `/live/sessions/${id}/host`, google(T))).body;
  assert.deepEqual(h.counts, [0, 1, 0, 0]);
  assert.ok(!JSON.stringify(h).includes("s1"), "교수자에게도 개별 응답 없음");

  // 마감: 늦은 제출 409, 아직 정답 비공개 / 공개: 정답·해설·응답 수
  h = (await call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action: "close", version: h.version })).body;
  assert.equal(h.phase, "closed");
  await call("POST", "/live/join", learner("s3"), { code: host.joinCode });
  assert.equal((await call("POST", `/live/sessions/${id}/answers`, learner("s3"), { questionIndex: 0, choice: 0 })).status, 409, "마감 뒤 제출");
  st = await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s1"));
  assert.equal(st.body.answer, null);
  assert.ok(!st.text.includes("EXPLAIN-1"));
  h = (await call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action: "reveal", version: h.version })).body;
  st = await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s1"));
  assert.deepEqual([st.body.answer, st.body.explanation, st.body.counts, st.body.myChoice], [0, "EXPLAIN-1", [0, 1, 0, 0], 1]);

  // 세트를 고쳐도 진행 중 세션 문제는 그대로 (스냅샷)
  const edited = await call("PUT", `/live-quiz-sets/${set.id}`, google(T), { week: 2, title: "진행", status: "ready", version: set.version, questions: qs(2).map((q) => ({ ...q, question: `${q.question} 수정` })) });
  assert.equal(edited.status, 200);

  // 다음 문제: 내 답 초기화, 스냅샷 문제
  h = (await call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action: "next", version: h.version })).body;
  st = await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s1"));
  assert.deepEqual([st.body.currentIndex, st.body.question?.question, st.body.myChoice], [1, "실시간 Q2?", null]);
  h = (await call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action: "close", version: h.version })).body;
  h = (await call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action: "reveal", version: h.version })).body;
  assert.equal((await call("POST", `/live/sessions/${id}/control`, google(T), { action: "next", version: h.version })).status, 400, "마지막 문제 뒤");
  assert.deepEqual(h.summary, [{ index: 0, responded: 1, correct: 0 }, { index: 1, responded: 0, correct: 0 }]);

  // 종료: 학생에게 종료 안내, 이후 참여·진행·제출 거부, 같은 분반에서 새 세션 가능
  h = (await call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action: "end", version: h.version })).body;
  assert.equal(h.status, "ended");
  assert.equal((await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s1"))).body.status, "ended");
  assert.equal((await call("POST", "/live/join", learner("s3"), { code: host.joinCode })).status, 404);
  assert.equal((await call("POST", `/live/sessions/${id}/control`, google(T), { action: "next", version: h.version })).status, 400);
  assert.deepEqual((await call<unknown[]>("GET", `/courses/${COURSE}/live/sessions`, google(T))).body, []);
  assert.ok(db.data.sectionInstructors[sectionInstructorKey(sectionId, T)], "분반 배정은 그대로");
  await call("DELETE", `/live-quiz-sets/${set.id}`, google(T));
  assert.ok(db.data.liveSessions[id], "세트를 지워도 세션 기록은 남는다");
});

test("실시간 퀴즈 진행은 강의자료·학습 기록·수강 등록·주차 자료를 바꾸지 않는다", () => {
  assert.equal(snapshot(), untouched);
});

/* ───────── 3) 여러 학생·동시 요청·중간 참여·종료 뒤·같은 과목 다른 분반 (JSON 모드 — PostgreSQL 실제 동시성 검증이 아니다) ───────── */

test("여러 학생: 3명 동시 참여·동시 제출 집계, 같은 학생 동시 중복 제출 1건만, 동시 진행 조작 1건만, 중간 참여, 종료 뒤 제출 차단", async () => {
  const section = db.data.sections[sectionId];
  for (const id of ["s4", "s5"]) db.data.members[id] = member(id);
  db.save();
  assert.equal((await call("POST", "/enrollments", learner("s4"), { courseCode: section.code })).status, 200);
  const set = (await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), { week: 3, title: "여러 명", status: "ready", questions: qs(3).map((q) => ({ ...q, question: `${q.question} 다수` })) })).body;
  const host = (await call<LiveHostState>("POST", "/live/sessions", google(T), { setId: set.id, sectionId })).body;
  const id = host.id;
  const ctl = (action: string, version: number) => call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action, version });
  const answer = (sid: string, questionIndex: number, choice: number) => call<LiveStudentState>("POST", `/live/sessions/${id}/answers`, learner(sid), { questionIndex, choice });

  // 3명 동시 참여
  const joins = await Promise.all(["s1", "s3", "s4"].map((sid) => call("POST", "/live/join", learner(sid), { code: host.joinCode })));
  assert.deepEqual(joins.map((r) => r.status), [200, 200, 200]);
  let h = (await ctl("next", 1)).body;
  assert.deepEqual([h.participants, h.currentIndex, h.phase], [3, 0, "open"]);

  // 동시 제출: s1(0)·s3(1)·s4(0) + s1 중복 4건을 한꺼번에
  const subs = await Promise.all([answer("s1", 0, 0), answer("s3", 0, 1), answer("s4", 0, 0), answer("s1", 0, 2), answer("s1", 0, 3), answer("s1", 0, 1), answer("s1", 0, 0)]);
  const s1 = [subs[0], ...subs.slice(3)].map((r) => r.status);
  assert.equal(s1.filter((x) => x === 200).length, 1, `s1 제출 중 1건만 성공: ${s1}`);
  assert.equal(s1.filter((x) => x === 409).length, 4, "나머지는 409");
  assert.deepEqual([subs[1].status, subs[2].status], [200, 200]);
  h = (await call<LiveHostState>("GET", `/live/sessions/${id}/host`, google(T))).body;
  const s1Choice = (await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s1"))).body.myChoice!;
  const expected = [0, 0, 0, 0];
  for (const c of [s1Choice, 1, 0]) expected[c] += 1;
  assert.deepEqual(h.counts, expected, "보기별 응답 수 = 학생당 1건");
  assert.equal(h.counts.reduce((a, b) => a + b, 0), 3);
  assert.ok(!["s1", "s3", "s4"].some((sid) => JSON.stringify(h).includes(sid)), "교수자 상태에 학생 id 없음");
  // 학생은 자기 답만 본다
  assert.equal((await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s3"))).body.myChoice, 1);
  assert.equal((await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s4"))).body.myChoice, 0);

  // 같은 버전으로 동시 진행 조작(여러 탭): 1건만 성공, 나머지 409
  const both = await Promise.all([ctl("close", h.version), ctl("close", h.version), ctl("end", h.version)]);
  assert.equal(both.filter((r) => r.status === 200).length, 1, `동시 조작 1건만: ${both.map((r) => r.status)}`);
  assert.ok(both.filter((r) => r.status !== 200).every((r) => r.status === 409));
  h = (await call<LiveHostState>("GET", `/live/sessions/${id}/host`, google(T))).body;
  assert.equal(h.phase, "closed", "JSON 모드는 요청 순서대로 처리 — 첫 close가 이긴다");
  h = (await ctl("reveal", h.version)).body;
  assert.deepEqual(h.summary[0], { index: 0, responded: 3, correct: (s1Choice === 0 ? 1 : 0) + 1 });

  // 중간 참여: 2번 문제 진행 중에 s5가 수강·참여 → 지금 문제만 답할 수 있고 집계에 들어간다
  h = (await ctl("next", h.version)).body;
  assert.equal((await call("POST", "/enrollments", learner("s5"), { courseCode: section.code })).status, 200);
  const late = await call<LiveStudentState>("POST", "/live/join", learner("s5"), { code: host.joinCode });
  assert.deepEqual([late.status, late.body.currentIndex, late.body.phase, late.body.myChoice], [200, 1, "open", null]);
  assert.equal((await answer("s5", 0, 0)).status, 409, "지난 문제에는 답할 수 없음");
  assert.equal((await answer("s5", 1, 2)).status, 200);
  h = (await call<LiveHostState>("GET", `/live/sessions/${id}/host`, google(T))).body;
  assert.deepEqual([h.participants, h.counts], [4, [0, 0, 1, 0]]);

  // 종료 뒤: 열린 문제였어도 제출 차단, 재참여 404, 학생 화면 종료, 집계 그대로
  h = (await ctl("end", h.version)).body;
  assert.equal(h.status, "ended");
  assert.equal((await answer("s1", 1, 0)).status, 409, "종료 뒤 제출");
  assert.equal((await call("POST", "/live/join", learner("s4"), { code: host.joinCode })).status, 404);
  assert.equal((await call<LiveStudentState>("GET", `/live/sessions/${id}/state`, learner("s4"))).body.status, "ended");
  assert.equal((await call<LiveHostState>("GET", `/live/sessions/${id}/host`, google(T))).body.summary[1].responded, 1, "종료 뒤 제출은 집계되지 않음");
  await call("DELETE", `/live-quiz-sets/${set.id}`, google(T));
});

test("같은 과목 다른 분반: 그 분반 학생은 참여·상태·제출 불가, 그 분반 교수자는 이 분반 세션 조회·진행·시작 불가", async () => {
  const B = "b@teach.test";
  db.data.instructors[B] = { email: B, source: "local", addedBy: null, addedAt: null };
  db.data.members.s6 = member("s6");
  db.save();
  const made = await call("POST", `/courses/${COURSE}/sections`, adminCookie, { name: "다른 분반 검사", instructors: [B] });
  assert.ok(made.status === 200 || made.status === 201, made.text);
  const other = Object.values(db.data.sections).find((s) => s.courseId === COURSE && s.id !== sectionId && s.status === "active" && !!db.data.sectionInstructors[sectionInstructorKey(s.id, B)]);
  assert.ok(other, "같은 과목의 두 번째 분반");
  assert.equal((await call("POST", "/enrollments", learner("s6"), { courseCode: other.code })).status, 200);

  const set = (await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), { week: 3, title: "분반", status: "ready", questions: qs(1).map((q) => ({ ...q, question: `${q.question} 분반` })) })).body;
  const host = (await call<LiveHostState>("POST", "/live/sessions", google(T), { setId: set.id, sectionId })).body;
  const id = host.id;
  assert.equal((await call("POST", "/live/join", learner("s1"), { code: host.joinCode })).status, 200);
  const h = (await call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action: "next", version: 1 })).body;

  // 다른 분반 학생
  assert.equal((await call("POST", "/live/join", learner("s6"), { code: host.joinCode })).status, 404);
  assert.equal((await call("GET", `/live/sessions/${id}/state`, learner("s6"))).status, 404);
  assert.equal((await call("POST", `/live/sessions/${id}/answers`, learner("s6"), { questionIndex: 0, choice: 0 })).status, 404);
  // 다른 분반 교수자 (같은 과목)
  assert.equal((await call("GET", `/live/sessions/${id}/host`, google(B))).status, 404);
  assert.equal((await call("POST", `/live/sessions/${id}/control`, google(B), { action: "close", version: h.version })).status, 404);
  assert.deepEqual((await call<unknown[]>("GET", `/courses/${COURSE}/live/sessions`, google(B))).body, []);
  assert.equal((await call("POST", "/live/sessions", google(B), { setId: set.id, sectionId })).status, 403, "남의 분반에서 시작 불가");
  // 세션은 그대로: 참여 1명·응답 0·버전 변화 없음
  const now = (await call<LiveHostState>("GET", `/live/sessions/${id}/host`, google(T))).body;
  assert.deepEqual([now.participants, now.counts.reduce((a, b) => a + b, 0), now.version], [1, 0, h.version]);
  await call("POST", `/live/sessions/${id}/control`, google(T), { action: "end", version: h.version });
  await call("DELETE", `/live-quiz-sets/${set.id}`, google(T));
});

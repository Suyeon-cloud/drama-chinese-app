// 6-C 실시간 퀴즈 결과 (npm test): 결과 계산·중복 학번·CSV·학번 가림 단위 검사 + JSON 모드 실제 API 권한(임시 폴더).
// Supabase·외부 호출 없음.
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
  buildLiveResults,
  liveResultsCsv,
  maskStudentId,
  normalizeStudentId,
  type LiveHistoryItem,
  type LiveHostState,
  type LiveResults,
  type StoredLiveSession,
} from "../src/content/liveSession";
import type { LearnerProfile } from "../src/app/store/models";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";

/* ───────── 1) 규칙 ───────── */

const stored = (over: Partial<StoredLiveSession> = {}): StoredLiveSession => ({
  id: "lqs-abc123def456",
  courseId: "c",
  sectionId: "s",
  setId: null,
  title: "결과",
  questions: [
    { id: "q1", question: "Q1", options: ["a", "b", "c", "d"], answer: 2, explanation: "" },
    { id: "q2", question: "Q2", options: ["x", "y"], answer: 0, explanation: "" },
  ],
  joinCode: "ABC234",
  status: "ended",
  currentIndex: 1,
  phase: "revealed",
  version: 9,
  createdByLabel: null,
  createdAt: "2026-11-27T01:00:00.000Z",
  updatedAt: "2026-11-27T01:10:00.000Z",
  endedAt: "2026-11-27T01:10:00.000Z",
  participants: { u1: "2026-11-27T01:01:00.000Z", u2: "2026-11-27T01:02:00.000Z", u3: "2026-11-27T01:03:00.000Z", gone: "2026-11-27T01:04:00.000Z" },
  responses: { "0:u1": { choice: 2, at: "" }, "0:u2": { choice: 1, at: "" }, "1:u2": { choice: 0, at: "" }, "0:u3": { choice: 2, at: "" } },
  ...over,
});
const PROFILES: Record<string, { name: string; studentId: string }> = {
  u1: { name: "김하나", studentId: "2023123456" },
  u2: { name: "이둘", studentId: "2023000001" },
  u3: { name: "박셋", studentId: " 2023123456 " }, // u1과 같은 학번 (공백만 다름)
};

test("결과 계산: 문항별 응답·정답·분포, 학생별 응답·정답·고른 보기, 학번 순 정렬, 중복 학번, 회원정보 없는 참여자", () => {
  const r = buildLiveResults(stored(), (id) => PROFILES[id] ?? null);
  assert.equal(r.participants, 4);
  assert.deepEqual(
    r.questions.map((q) => [q.responded, q.correct, q.counts]),
    [
      [3, 2, [0, 1, 2, 0]],
      [1, 1, [1, 0]],
    ],
  );
  assert.deepEqual(r.duplicateStudentIds, ["2023123456"]);
  // 정렬: 정규화 학번 → 이름 ('' 학번이 맨 앞)
  assert.deepEqual(
    r.students.map((s) => [s.key, s.name, s.answered, s.correct, s.choices, s.duplicate]),
    [
      ["s1", "", 0, 0, [null, null], false],
      ["s2", "이둘", 2, 1, [1, 0], false],
      ["s3", "김하나", 1, 1, [2, null], true],
      ["s4", "박셋", 1, 1, [2, null], true],
    ],
  );
  assert.ok(!JSON.stringify(r).match(/"u[123]"|gone/), "사용자 id를 결과에 넣지 않는다");
  assert.equal(normalizeStudentId(" ab 12 "), "AB12");
});

test("학번 가림·CSV: 앞 4·끝 2자리만, BOM·따옴표·수식 실행 방지, 문항 요약 포함", () => {
  assert.equal(maskStudentId("2023123456"), "2023****56");
  assert.equal(maskStudentId("12345"), "*****");
  assert.equal(maskStudentId(""), "");
  const r = buildLiveResults(stored(), (id) => (id === "u1" ? { name: '=HYPERLINK("x")', studentId: "2023123456" } : (PROFILES[id] ?? null)));
  const csv = liveResultsCsv(r);
  assert.ok(csv.startsWith("﻿이름,학번,중복 학번,응답 수,정답 수,총 문항,점수(%),1번,2번\r\n"));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), "수식으로 시작하는 셀은 ' 를 붙이고 따옴표를 이스케이프");
  assert.ok(csv.includes("이둘,2023000001,,2,1,2,50,2 (X),1 (O)"));
  assert.ok(csv.includes("1번,3,2,67,0,1,2,0"), "문항 요약: 응답·정답·정답률·보기별 수");
});

/* ───────── 2) JSON 모드 실제 API ───────── */

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const T = "t@teach.test";
const OTHER = "o@teach.test";
const B = "b@teach.test";
const COURSE = "course-campus";
let dir = "";
let db: Db;
let base = "";
let adminCookie = "";
let close = () => {};
let sectionId = "";
const sign = (s: object) => {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const google = (email: string, id = email) => sign({ k: "google", id, email });
const learner = (id: string) => google(`${id}@learn.test`, id);
/** 참여 본문: 실명·학번은 회원정보 그대로 입력 */
const joinAs = (id: string, code: string) => ({ code, name: db.data.members[id]?.name ?? "", studentId: db.data.members[id]?.studentId ?? "" });
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
const member = (id: string, studentId: string): LearnerProfile => ({
  id,
  googleEmail: `${id}@learn.test`,
  name: `이름-${id}`,
  university: "u",
  department: "d",
  grade: "1",
  studentId,
  email: `${id}@learn.test`,
  phone: "010-0000-0000",
  avatarColor: "#fff",
  status: "approved",
  profileCompleted: true,
  firstSeenAt: "2026-11-27T00:00:00.000Z",
  lastSeenAt: "2026-11-27T00:00:00.000Z",
  approvedAt: "2026-11-27T00:00:00.000Z",
});

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-live-results-"));
  db = openDb(dir);
  for (const email of [T, OTHER, B]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  db.data.members.r1 = member("r1", "2024000001");
  db.data.members.r2 = member("r2", "2024000002");
  db.data.members.r3 = member("r3", "2024 000001"); // r1과 같은 학번
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
  for (const id of ["r1", "r2", "r3"]) assert.equal((await call("POST", "/enrollments", learner(id), { courseCode: section.code })).status, 200);
  // B: 같은 과목의 다른 분반 교수자
  const made = await call("POST", `/courses/${COURSE}/sections`, adminCookie, { name: "결과 검사 다른 분반", instructors: [B] });
  assert.ok(made.status === 200 || made.status === 201, made.text);
});
after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

test("결과 조회: 종료 전 400, 종료 뒤 담당 교수자만 (다른 교수자·다른 분반 교수자·학생 404, 관리자 403, 비로그인 401), 개인정보 최소", async () => {
  const qs = [0, 1].map((i) => ({ question: `결과 Q${i + 1}?`, options: ["A", "B", "C"], answer: i, explanation: `E${i}`, origin: "manual" }));
  const set = (await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), { week: 4, title: "결과 세트", status: "ready", questions: qs })).body;
  const host = (await call<LiveHostState>("POST", "/live/sessions", google(T), { setId: set.id, sectionId })).body;
  const id = host.id;
  for (const sid of ["r1", "r2", "r3"]) assert.equal((await call("POST", "/live/join", learner(sid), joinAs(sid, host.joinCode))).status, 200);
  const ctl = async (action: string) => {
    const now = (await call<LiveHostState>("GET", `/live/sessions/${id}/host`, google(T))).body;
    return call<LiveHostState>("POST", `/live/sessions/${id}/control`, google(T), { action, version: now.version });
  };
  const answer = (sid: string, q: number, c: number) => call("POST", `/live/sessions/${id}/answers`, learner(sid), { questionIndex: q, choice: c });
  await ctl("next");
  assert.equal((await answer("r1", 0, 0)).status, 200); // 정답
  assert.equal((await answer("r2", 0, 2)).status, 200); // 오답
  await ctl("close");
  await ctl("reveal");
  await ctl("next");
  assert.equal((await answer("r2", 1, 1)).status, 200); // 정답, r1·r3 응답 없음

  // 진행 중: 결과는 아직 볼 수 없고, 목록에는 진행 중으로 보인다
  const early = await call("GET", `/live/sessions/${id}/results`, google(T));
  assert.equal(early.status, 400);
  assert.match(early.body.error ?? "", /종료한 뒤/);
  const hist = await call<LiveHistoryItem[]>("GET", `/courses/${COURSE}/live/history`, google(T));
  assert.deepEqual(hist.body.map((h) => [h.id, h.status, h.participants, h.total]), [[id, "active", 3, 2]]);

  await ctl("end");
  const res = await call<LiveResults>("GET", `/live/sessions/${id}/results`, google(T));
  assert.equal(res.status, 200);
  const r = res.body;
  assert.deepEqual([r.participants, r.total], [3, 2]);
  assert.deepEqual(r.questions.map((q) => [q.responded, q.correct, q.counts]), [
    [2, 1, [1, 0, 1]],
    [1, 1, [0, 1, 0]],
  ]);
  assert.deepEqual(r.duplicateStudentIds, ["2024000001"]);
  assert.deepEqual(
    r.students.map((s) => [s.name, s.studentId, s.answered, s.correct, s.choices, s.duplicate]),
    [
      ["이름-r1", "2024000001", 1, 1, [0, null], true],
      ["이름-r3", "2024 000001", 0, 0, [null, null], true],
      ["이름-r2", "2024000002", 2, 1, [2, 1], false],
    ],
  );
  // 개인정보 최소: 사용자 id·이메일·전화 없음
  for (const secret of ["r1@learn.test", "010-0000-0000", '"r1"', '"r2"', '"r3"']) assert.ok(!res.text.includes(secret), `결과에 ${secret} 없음`);
  assert.equal((await call<LiveHistoryItem[]>("GET", `/courses/${COURSE}/live/history`, google(T))).body[0]?.status, "ended");

  // 권한
  assert.equal((await call("GET", `/live/sessions/${id}/results`)).status, 401);
  assert.equal((await call("GET", `/live/sessions/${id}/results`, learner("r1"))).status, 404, "학생");
  assert.equal((await call("GET", `/live/sessions/${id}/results`, google(OTHER))).status, 404, "담당 아닌 교수자");
  assert.equal((await call("GET", `/live/sessions/${id}/results`, google(B))).status, 404, "같은 과목 다른 분반 교수자");
  assert.equal((await call("GET", `/live/sessions/${id}/results`, adminCookie)).status, 403, "관리자 계정");
  assert.equal((await call("GET", "/live/sessions/lqs-000000000000/results", google(T))).status, 404);
  assert.deepEqual((await call<unknown[]>("GET", `/courses/${COURSE}/live/history`, google(OTHER))).body, []);
  assert.deepEqual((await call<unknown[]>("GET", `/courses/${COURSE}/live/history`, google(B))).body, []);
  assert.deepEqual((await call<unknown[]>("GET", `/courses/${COURSE}/live/history`, learner("r1"))).body, []);
  assert.equal((await call("GET", `/courses/${COURSE}/live/history`, adminCookie)).status, 403);

  // 분반 운영 종료 뒤에도 담당 교수자는 기록을 본다 (운영 중 과목)
  db.data.sections[sectionId].status = "inactive";
  db.save();
  assert.equal((await call("GET", `/live/sessions/${id}/results`, google(T))).status, 200);
  db.data.sections[sectionId].status = "active";
  db.save();

  // 결과 조회는 저장 데이터를 바꾸지 않는다
  const before = JSON.stringify(db.data.liveSessions[id]);
  await call("GET", `/live/sessions/${id}/results`, google(T));
  assert.equal(JSON.stringify(db.data.liveSessions[id]), before);
  await call("DELETE", `/live-quiz-sets/${set.id}`, google(T));
});

test("참여 실명·학번: 필수·형식, 회원정보와 대조(공백·대소문자 무시), 틀려도 어느 칸인지·세션 존재 여부를 알리지 않음, 입력값은 저장하지 않음", async () => {
  const qs = [{ question: "본인 확인 Q?", options: ["A", "B"], answer: 0, explanation: "", origin: "manual" }];
  const set = (await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), { week: 5, title: "본인 확인", status: "ready", questions: qs })).body;
  const host = (await call<LiveHostState>("POST", "/live/sessions", google(T), { setId: set.id, sectionId })).body;
  const join = (sid: string, body: object) => call("POST", "/live/join", learner(sid), { code: host.joinCode, ...body });

  // 필수·길이
  assert.equal((await join("r1", {})).status, 400);
  assert.equal((await join("r1", { name: "이름-r1" })).status, 400);
  assert.equal((await join("r1", { name: "  ", studentId: "2024000001" })).status, 400);
  assert.equal((await join("r1", { name: "x".repeat(51), studentId: "2024000001" })).status, 400);
  assert.equal((await join("r1", { name: 123, studentId: ["2024000001"] })).status, 400);
  // 대조: 다른 학생의 학번·이름, 하나만 틀림 → 같은 문구 (어느 칸인지 알리지 않음)
  const wrongs = [
    { name: "이름-r1", studentId: "2024000002" },
    { name: "이름-r2", studentId: "2024000001" },
    { name: "이름-r2", studentId: "2024000002" },
  ];
  const errs = new Set<string>();
  for (const w of wrongs) {
    const r = await join("r1", w);
    assert.equal(r.status, 400, JSON.stringify(w));
    errs.add(r.body.error ?? "");
  }
  assert.equal(errs.size, 1, "틀린 칸과 상관없이 같은 문구");
  assert.ok(![...errs][0].includes("2024000001") && ![...errs][0].includes("이름-r1"), "회원정보 값을 알려 주지 않는다");
  // 없는 코드라도 본인 확인이 틀리면 같은 400 (세션 존재 여부를 알 수 없다)
  assert.equal((await call("POST", "/live/join", learner("r1"), { code: "ZZZZZZ", name: "틀림", studentId: "0" })).status, 400);
  assert.equal(db.data.liveSessions[host.id].participants.r1, undefined, "틀린 입력으로는 참여 기록이 생기지 않는다");
  // 공백·대소문자 차이는 같은 사람으로 본다
  assert.equal((await join("r1", { name: " 이름 - R1 ".replace(" - ", "-"), studentId: "2024 0000 01" })).status, 200);
  // 학번이 비어 있는 회원정보는 참여할 수 없다 (회원정보를 먼저 채운다)
  const saved = db.data.members.r2.studentId;
  db.data.members.r2.studentId = "";
  db.save();
  assert.equal((await join("r2", { name: "이름-r2", studentId: "" })).status, 400);
  db.data.members.r2.studentId = saved;
  db.save();
  // 입력값은 세션에 저장하지 않는다 (참여 시각만)
  const stored = JSON.stringify(db.data.liveSessions[host.id]);
  assert.ok(!stored.includes("2024 0000 01") && !stored.includes("이름-R1") && !stored.includes("2024000001"), "세션 기록에 실명·학번 없음");
  // 교수자 계정은 학생으로 참여하지 않는다 (본인 확인 전에 404)
  assert.equal((await call("POST", "/live/join", google(T), { code: host.joinCode, name: "x", studentId: "1" })).status, 404);

  const now = (await call<LiveHostState>("GET", `/live/sessions/${host.id}/host`, google(T))).body;
  await call("POST", `/live/sessions/${host.id}/control`, google(T), { action: "end", version: now.version });
  await call("DELETE", `/live-quiz-sets/${set.id}`, google(T));
});

// 6-A 실시간 퀴즈 문제 세트 (npm test): 규칙 단위 검사 + JSON 모드 실제 API(임시 폴더). 외부 AI·Supabase는 부르지 않는다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import {
  LiveQuizResultError,
  buildLiveQuizPrompt,
  duplicateReport,
  isAnthropicKeyShape,
  normalizeQuizText,
  parseLiveQuizResult,
  parseLiveQuizSetInput,
  quizKey,
  quizSimilar,
  quizSimilarity,
  type LiveQuizSet,
} from "../src/content/liveQuiz";
import type { LearnerProfile } from "../src/app/store/models";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";

const q = (question: string, options: string[], answer = 0) => ({ question, options, answer, explanation: "", origin: "manual" as const });

/* ───────── 1) 규칙 ───────── */

test("정규화·완전 중복: NFKC·대소문자·공백·문장부호 무시, 보기 순서만 바꾼 문제도 같은 문제", () => {
  assert.equal(normalizeQuizText(" 你好，世界！ ＡＢＣ? "), normalizeQuizText("你好世界abc"));
  assert.equal(quizKey({ question: "你好的意思是?", options: ["안녕", "감사", "미안"] }), quizKey({ question: "你好的意思是？", options: ["미안", " 안녕 ", "감사"] }));
  assert.notEqual(quizKey({ question: "你好的意思是?", options: ["안녕", "감사"] }), quizKey({ question: "你好的意思是?", options: ["안녕", "미안"] }));
  assert.ok(quizSimilarity("‘下雨了’의 뜻은 무엇인가요?", "중국의 설날 음식은?") < 0.2, "다른 문장");
});

test("비슷한 문제 경고 기준(대표 한국어·중국어 문제): 같은 대상의 다른 표현은 경고, 틀만 같고 대상이 다른 문제는 경고하지 않음", () => {
  const warn: [string, string][] = [
    ["‘下雨了’의 뜻은 무엇인가요?", "‘下雨了’의 뜻은 무엇일까요?"],
    ["‘下雨了 还不跑起来’의 뜻으로 가장 알맞은 것은?", "‘下雨了 还不跑起来’의 뜻으로 알맞은 것은?"],
    ["‘谢谢’는 언제 쓰나요?", "‘谢谢’는 보통 언제 쓰나요?"],
    ["‘没关系’와 같은 뜻의 표현은?", "‘没关系’와 뜻이 같은 표현은?"],
    ["주인공이 비를 맞으며 뛰지 않은 이유는?", "주인공은 왜 비를 맞으며 뛰지 않았나요?"],
    ["‘附中’은 무엇의 줄임말인가요?", "‘附中’은 어떤 말의 줄임말인가요?"],
  ];
  const quiet: [string, string][] = [
    ["‘你好’의 뜻은 무엇인가요?", "‘谢谢’의 뜻은 무엇인가요?"],
    ["‘下雨了’의 뜻은 무엇인가요?", "‘跑起来’의 뜻은 무엇인가요?"],
    ["‘对不起’는 언제 쓰나요?", "‘再见’은 언제 쓰나요?"],
    ["다음 중 ‘了’의 쓰임이 다른 것은?", "다음 중 ‘过’의 쓰임이 다른 것은?"],
    ["빈칸에 들어갈 알맞은 말은? 我___中国人。", "빈칸에 들어갈 알맞은 말은? 他___学生。"],
    ["‘下雨了’의 뜻은 무엇인가요?", "중국의 설날 음식은?"],
    ["刘亦菲는 누구인가요?", "‘附中’은 무엇의 줄임말인가요?"],
  ];
  for (const [a, b] of warn) assert.equal(quizSimilar(a, b), true, `경고해야 함: ${a} / ${b}`);
  // 같은 표현을 다른 관점(뜻·병음)으로 묻는 문제는 경고될 수 있다 — 대상이 같으므로 교수자가 확인하도록 둔다
  assert.equal(quizSimilar("‘下雨了’의 뜻은 무엇인가요?", "‘下雨了’의 병음은 무엇인가요?"), true);
  for (const [a, b] of quiet) assert.equal(quizSimilar(a, b), false, `경고하지 않아야 함: ${a} / ${b}`);
  // 완전 중복은 유사 경고와 별개로 exact로 분류된다
  const ex = [{ question: "‘你好’의 뜻은?", options: ["안녕", "감사"], source: "학습" }];
  assert.deepEqual(duplicateReport({ question: "‘你好’의 뜻은？", options: ["감사", "안녕"] }, ex), { exact: ["학습"], similar: [] });
  assert.deepEqual(duplicateReport({ question: "‘谢谢’의 뜻은?", options: ["안녕", "감사"] }, ex), { exact: [], similar: [] }, "틀·보기가 같아도 대상이 다르면 경고 없음");
  assert.equal(quizSimilarity("", "a"), 0);
});

test("중복 보고: exact(저장 불가)·similar(경고)·관련 없음을 구분하고 출처를 알려 준다", () => {
  const existing = [
    { question: "‘谢谢’의 뜻은?", options: ["감사합니다", "안녕하세요", "미안합니다", "잘 가요"], source: "1주차 학습 퀴즈" },
    { question: "‘再见’은 언제 쓰나요?", options: ["헤어질 때", "만날 때"], source: "실시간 ‘A’" },
  ];
  assert.deepEqual(duplicateReport({ question: "‘谢谢’의 뜻은？", options: ["잘 가요", "감사합니다", "미안합니다", "안녕하세요"] }, existing), { exact: ["1주차 학습 퀴즈"], similar: [] });
  assert.deepEqual(duplicateReport({ question: "‘谢谢’의 뜻은?", options: ["고마워요", "반가워요"] }, existing), { exact: [], similar: ["1주차 학습 퀴즈"] }, "같은 문장·다른 보기 = 경고");
  assert.deepEqual(duplicateReport({ question: "‘再见’은 보통 언제 쓰나요?", options: ["a", "b"] }, existing).similar, ["실시간 ‘A’"]);
  assert.deepEqual(duplicateReport({ question: "중국의 설날 음식은?", options: ["饺子", "汤圆"] }, existing), { exact: [], similar: [] });
});

test("세트 입력 검사: 주차·제목·문제 수·보기 2~6·같은 보기·정답 범위·서버 칸·세트 안 중복(보기 순서 무시)", () => {
  const ok = parseLiveQuizSetInput({ week: 2, title: " 2주차 ", questions: [q("A?", ["1", "2"], 1)] }, 4);
  assert.ok(ok.ok && ok.value.title === "2주차" && ok.value.status === "draft" && ok.value.lessonId === null && ok.value.questions[0].origin === "manual");
  const bad: [unknown, RegExp][] = [
    [{ week: 5, title: "x", questions: [q("A?", ["1", "2"])] }, /주차/],
    [{ week: 1, title: " ", questions: [q("A?", ["1", "2"])] }, /제목/],
    [{ week: 1, title: "x", questions: [] }, /1개 이상/],
    [{ week: 1, title: "x", questions: Array.from({ length: 31 }, (_, i) => q(`Q${i}`, ["1", "2"])) }, /30개/],
    [{ week: 1, title: "x", questions: [q("A?", ["1"])] }, /2~6개/],
    [{ week: 1, title: "x", questions: [q("A?", ["a b", "AB"])] }, /같은 보기/],
    [{ week: 1, title: "x", questions: [q("A?", ["1", "2"], 2)] }, /정답/],
    [{ week: 1, title: "x", questions: [{ ...q("A?", ["1", "2"]), origin: "web" }] }, /출처/],
    [{ id: "x", week: 1, title: "x", questions: [q("A?", ["1", "2"])] }, /서버가 정해요/],
    [{ week: 1, title: "x", lessonId: "../x", questions: [q("A?", ["1", "2"])] }, /강의자료/],
    [{ week: 1, title: "x", questions: [q("A?", ["1", "2"]), q("a？", ["2", "1"], 1)] }, /1번과 2번 문제가 같아요/],
  ];
  for (const [body, re] of bad) {
    const r = parseLiveQuizSetInput(body, 4);
    assert.ok(!r.ok, JSON.stringify(body).slice(0, 60));
    assert.match((r as { error: string }).error, re);
  }
});

test("AI 결과 파싱: 코드 블록·앞뒤 설명 허용, 잘린 JSON·형식 오류 안내, 잘못된 문제는 빼고 수를 알려 준다 / 프롬프트·키 형식", () => {
  const text = '네, 만들었어요.\n```json\n{"questions":[{"question":"Q1","options":["a","b","c","d"],"answer":2,"explanation":"e"},{"question":"Q2","options":["a"],"answer":0}]}\n```\n끝';
  const r = parseLiveQuizResult(text, "ai");
  assert.equal(r.questions.length, 1);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.questions[0], { question: "Q1", options: ["a", "b", "c", "d"], answer: 2, explanation: "e", origin: "ai" });
  assert.equal(parseLiveQuizResult('{"questions":[{"id":"evil","question":"Q","options":["a","b"],"answer":0}]}', "json").questions[0].id, undefined, "결과의 id는 쓰지 않는다");
  assert.throws(() => parseLiveQuizResult("없음", "ai"), LiveQuizResultError);
  assert.throws(() => parseLiveQuizResult('{"questions":[{"question":"Q"', "ai"), /끊겼/);
  assert.throws(() => parseLiveQuizResult('{"questions":[]}', "ai"), /쓸 수 있는 문제가 없어요/);
  const prompt = buildLiveQuizPrompt({ week: 3, title: "T", heading: "《드라마》 1회", lines: [{ zh: "你好", ko: "안녕" }], points: ["没关系 — 괜찮아"], avoid: ["기존 문제 하나"], count: 5 });
  assert.match(prompt, /3주차/);
  assert.match(prompt, /你好 — 안녕/);
  assert.match(prompt, /기존 문제 하나/);
  assert.match(prompt, /실시간 객관식 퀴즈 5문제/);
  assert.ok(isAnthropicKeyShape("sk-ant-api03-abcdefghijklmnopqrstuvwxyz"));
  for (const k of ["", "sk-abc", "sk-ant-short", "sk-ant-" + "a".repeat(30) + " x"]) assert.ok(!isAnthropicKeyShape(k), k);
});

/* ───────── 2) JSON 모드 실제 API (임시 폴더) ───────── */

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
const sign = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const google = (email: string, id = email) => sign({ k: "google", id, email });
const learner = (id: string) => google(`${id}@learn.test`, id);
const call = async <R = unknown>(method: string, p: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...headers, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as R & { error?: string; manual?: boolean } };
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
  firstSeenAt: "2026-11-07T00:00:00.000Z",
  lastSeenAt: "2026-11-07T00:00:00.000Z",
  approvedAt: "2026-11-07T00:00:00.000Z",
});
/** 기존 데이터 보호 확인: 강의자료·학습 기록·수강·주차 자료 */
const snapshot = () => JSON.stringify({ lessons: db.data.lessons, progress: db.data.progress, enrollments: db.data.enrollments, weekMaterials: db.data.weekMaterials });

const startServer = async (extraEnv: Record<string, string> = {}) => {
  const app = express();
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET, ...ADMIN, ...extraEnv })));
  return new Promise<{ base: string; close: () => void }>((resolve) => {
    const server = app.listen(0, () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, close: () => server.close() }));
  });
};

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-livequiz-"));
  db = openDb(dir);
  for (const email of [T, OTHER]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  db.data.members.s1 = member("s1");
  db.save();
  const s = await startServer();
  base = s.base;
  close = s.close;
  const login = await fetch(`${base}/auth/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }) });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const section = Object.values(db.data.sections).find((x) => x.courseId === COURSE && x.status === "active")!;
  assert.equal((await call("PUT", `/sections/${section.id}/instructors/${encodeURIComponent(T)}`, adminCookie)).status, 200);
  assert.equal((await call("POST", "/enrollments", learner("s1"), { courseCode: section.code })).status, 200);
  untouched = snapshot();
});
after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

const setBody = (over: Record<string, unknown> = {}) => ({
  week: 1,
  title: "1주차 실시간",
  questions: [q("‘你好’의 뜻은?", ["안녕하세요", "감사합니다", "미안합니다", "잘 가요"]), q("‘谢谢’의 뜻은?", ["감사합니다", "안녕하세요"], 0)],
  ...over,
});

test("세트 권한: 로그인 없음 401, 학생·담당 아닌 교수자는 목록·저장 불가, 담당 교수자·관리자만", async () => {
  assert.equal((await call("GET", `/courses/${COURSE}/live-quiz-sets`)).status, 401);
  assert.equal((await call("GET", `/courses/${COURSE}/live-quiz-sets`, learner("s1"))).status, 404);
  assert.equal((await call("GET", `/courses/${COURSE}/live-quiz-sets`, google(OTHER))).status, 404);
  assert.equal((await call("POST", `/courses/${COURSE}/live-quiz-sets`, learner("s1"), setBody())).status, 403);
  assert.equal((await call("POST", `/courses/${COURSE}/live-quiz-sets`, google(OTHER), setBody())).status, 403);
  assert.equal((await call<LiveQuizSet[]>("GET", `/courses/${COURSE}/live-quiz-sets`, google(T))).status, 200);
  assert.equal(Object.keys(db.data.liveQuizSets).length, 0);
});

test("세트 저장·수정·삭제: 버전으로 동시 편집 막기, 기존 문제 id 유지, 같은 과목 다른 세트와 완전 중복(보기 순서만 다른 것) 409", async () => {
  const lesson = Object.values(db.data.lessons).find((l) => l.courseId === COURSE)!;
  const other = Object.values(db.data.lessons).find((l) => l.courseId !== COURSE)!;
  assert.equal((await call("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), setBody({ lessonId: other.id }))).status, 400, "다른 과목 강의자료");
  assert.equal((await call("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), setBody({ week: 99 }))).status, 400);
  const created = await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), setBody({ lessonId: lesson.id }));
  assert.equal(created.status, 201);
  const set = created.body;
  assert.match(set.id, /^livequiz-[a-z0-9]{12}$/);
  assert.equal(set.version, 1);
  assert.equal(set.status, "draft");
  assert.ok(set.questions.every((x) => /^lq-[a-z0-9]{12}$/.test(x.id)));

  // 다른 세트에 보기 순서·문장부호만 바꾼 같은 문제 → 409, 다른 문제면 저장
  const dup = await call("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), setBody({ week: 2, questions: [q("‘你好’의 뜻은？", ["잘 가요", "미안합니다", "감사합니다", "안녕하세요"], 3)] }));
  assert.equal(dup.status, 409);
  assert.match(dup.body.error ?? "", /1번 문제와 같은 문제/);
  const second = await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), setBody({ week: 2, title: "2주차", questions: [q("‘再见’의 뜻은?", ["잘 가요", "안녕"])] }));
  assert.equal(second.status, 201);

  // 수정: 첫 문제 유지·둘째 삭제·새 문제 추가, 버전 2 / 옛 버전 409 / 버전 없이 409
  const keep = set.questions[0];
  const upd = await call<LiveQuizSet>("PUT", `/live-quiz-sets/${set.id}`, google(T), {
    version: 1,
    week: 1,
    title: "수정",
    status: "ready",
    questions: [{ ...keep }, { ...q("‘对不起’의 뜻은?", ["미안합니다", "괜찮아요"]), id: second.body.questions[0].id }],
  });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.version, 2);
  assert.equal(upd.body.status, "ready");
  assert.equal(upd.body.questions[0].id, keep.id, "기존 문제 id 유지");
  assert.notEqual(upd.body.questions[1].id, second.body.questions[0].id, "다른 세트의 문제 id는 가져오지 않는다");
  assert.equal((await call("PUT", `/live-quiz-sets/${set.id}`, google(T), { ...setBody(), version: 1 })).status, 409);
  assert.equal((await call("PUT", `/live-quiz-sets/${set.id}`, google(T), setBody())).status, 409);
  assert.equal((await call("PUT", `/live-quiz-sets/${set.id}`, google(OTHER), { ...setBody(), version: 2 })).status, 404);
  assert.equal((await call("PUT", `/live-quiz-sets/${set.id}`, learner("s1"), { ...setBody(), version: 2 })).status, 404);

  // 목록: 주차 순서, 문제 포함
  const list = (await call<LiveQuizSet[]>("GET", `/courses/${COURSE}/live-quiz-sets`, google(T))).body;
  assert.deepEqual(list.map((s) => s.title), ["수정", "2주차"]);

  // 강의자료 삭제 → 세트는 남고 연결만 끊김
  const tempLesson = { ...lesson, id: "lesson-6a-temp" };
  db.data.lessons[tempLesson.id] = tempLesson;
  const linked = await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), setBody({ week: 3, title: "연결", lessonId: tempLesson.id, questions: [q("새 문제?", ["a", "b"])] }));
  assert.equal(linked.status, 201);
  assert.equal((await call("DELETE", `/lessons/${tempLesson.id}`, adminCookie)).status, 200);
  assert.equal(db.data.liveQuizSets[linked.body.id].lessonId, null);

  // 삭제
  assert.equal((await call("DELETE", `/live-quiz-sets/${set.id}`, google(OTHER))).status, 404);
  for (const id of [set.id, second.body.id, linked.body.id]) assert.equal((await call("DELETE", `/live-quiz-sets/${id}`, google(T))).status, 200);
  assert.equal(Object.keys(db.data.liveQuizSets).length, 0);
});

test("서버 직접 호출: 개인 학습 퀴즈와 완전 중복(보기 순서·문장부호만 다른 것 포함)이면 등록·수정 모두 409, 비슷하기만 하면 저장된다", async () => {
  const seed = Object.values(db.data.lessons).find((l) => l.courseId === COURSE)!;
  const lessonId = "lesson-6a-quiz";
  const now = "2026-11-09T00:00:00.000Z";
  db.data.lessons[lessonId] = {
    ...seed,
    id: lessonId,
    week: 5,
    draft: {
      expressions: [],
      grammar: [],
      lenses: [],
      quiz: [{ id: "dq1", question: "‘下雨了 还不跑起来’의 뜻은?", options: ["비가 그쳤다", "비가 오는데 안 뛰어?", "뛰지 마"], answer: 1, explanation: "" }],
      createdAt: now,
      updatedAt: now,
    },
  };
  try {
    const same = q("‘下雨了 还不跑起来’의 뜻은？ ", ["뛰지 마", "비가 그쳤다", "비가 오는데 안 뛰어?"], 2);
    const created = await call("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), setBody({ title: "직접 호출", questions: [same] }));
    assert.equal(created.status, 409, "화면을 거치지 않아도 서버가 막는다");
    assert.match(created.body.error ?? "", /5주차 학습 퀴즈와 같은 문제/);
    // 비슷하기만 한 문제(같은 문장, 다른 보기)는 서버가 막지 않는다 — 경고는 화면 몫
    const ok = await call<LiveQuizSet>("POST", `/courses/${COURSE}/live-quiz-sets`, google(T), setBody({ title: "비슷", questions: [q("‘下雨了 还不跑起来’의 뜻은?", ["비가 와요", "해가 떠요"])] }));
    assert.equal(ok.status, 201);
    // 수정으로 같은 문제를 넣어도 409
    const upd = await call("PUT", `/live-quiz-sets/${ok.body.id}`, google(T), { ...setBody({ title: "비슷", questions: [same] }), version: 1 });
    assert.equal(upd.status, 409);
    // 권한 없는 사람에게는 중복 정보 대신 권한 오류
    assert.equal((await call("POST", `/courses/${COURSE}/live-quiz-sets`, google(OTHER), setBody({ questions: [same] }))).status, 403);
    assert.equal((await call("DELETE", `/live-quiz-sets/${ok.body.id}`, google(T))).status, 200);
  } finally {
    delete db.data.lessons[lessonId];
  }
});

test("AI 생성: 본인 키가 없으면 수동(JSON 붙여넣기) 안내, 잘못된 키 형식 400, 학생은 사용 불가 — 키는 응답에 없다 (BYOK 전체는 aiByok.test)", async () => {
  assert.equal((await call("POST", "/ai/live-quiz", learner("s1"), { prompt: "x" })).status, 403);
  const manual = await call("POST", "/ai/live-quiz", google(T), { prompt: "x" });
  assert.equal(manual.status, 400);
  assert.equal(manual.body.manual, true);
  const bad = await call("POST", "/ai/live-quiz", google(T), { prompt: "x" }, { "X-Anthropic-Key": "not-a-key" });
  assert.equal(bad.status, 400);
  assert.ok(!JSON.stringify(bad.body).includes("not-a-key"));
});

test("실시간 퀴즈 작업은 강의자료·학습 기록·수강 등록·주차 자료를 바꾸지 않는다", () => {
  assert.equal(snapshot(), untouched);
});

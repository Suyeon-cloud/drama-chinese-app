// BYOK AI 생성 (npm test): 관리자·교수자 모두 본인 Anthropic 키(X-Anthropic-Key)로만 생성 — JSON 모드 실제 API(임시 폴더).
// Anthropic은 부르지 않는다: ANTHROPIC_BASE_URL을 이 파일의 가짜 서버로 돌려, 서버가 어떤 키를 보냈는지만 확인한다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import type { LearnerProfile } from "../src/app/store/models";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const T = "t@teach.test";
const COURSE = "course-campus";
// 키 형식(sk-ant- + 20자 이상)은 맞는 가짜 키들
const ADMIN_KEY = "sk-ant-api03-ADMINkey000000000000000000001";
const TEACHER_KEY = "sk-ant-api03-TEACHERkey0000000000000000002";
const WRONG_KEY = "sk-ant-api03-WRONGkey00000000000000000003";
const ENV_KEY = "sk-ant-api03-ENVsharedkey000000000000000004";
const LEGACY_KEY = "sk-ant-api03-LEGACYadminkey0000000000000005";
const GOOD = new Set([ADMIN_KEY, TEACHER_KEY]);

let dir = "";
let db: Db;
let base = "";
let adminCookie = "";
let fake: Server;
const seenKeys: string[] = [];
const closers: (() => void)[] = [];
const logs: string[] = [];
const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;
const originalConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };

const sign = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const google = (email: string, id = email) => sign({ k: "google", id, email });
const student = google("s1@learn.test", "s1");
const call = async <R = unknown>(method: string, p: string, cookie: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...headers, cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* 본문 없음 */
  }
  return { status: res.status, text, body: parsed as R & { error?: string; manual?: boolean; text?: string } };
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

/** 가짜 Anthropic Messages API: 받은 키를 기록하고, 아는 키면 짧은 스트림, 모르는 키면 401 */
const sse = (text: string) =>
  [
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 7, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } }],
    ["message_stop", { type: "message_stop" }],
  ]
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");

before(async () => {
  fake = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      // SDK 버전에 따라 x-api-key 또는 Authorization: Bearer로 보낸다
      const key = String(req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
      seenKeys.push(key);
      if (!GOOD.has(key)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(sse(`GENERATED-BY-${key === ADMIN_KEY ? "ADMIN" : "TEACHER"}`));
    });
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;

  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-byok-"));
  db = openDb(dir);
  db.data.instructors[T] = { email: T, source: "local", addedBy: null, addedAt: null };
  db.data.members.s1 = member("s1");
  // 예전 관리자 공용 키가 db.json에 남아 있어도 읽지 않고, 지우지도 않는다
  db.data.anthropicApiKey = LEGACY_KEY;
  db.save();
  const app = express();
  // 서버 환경변수 ANTHROPIC_API_KEY도 더 이상 자동으로 쓰지 않는다
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET, ...ADMIN, ANTHROPIC_API_KEY: ENV_KEY, LIVE_QUIZ_SHARED_AI_KEY: "allow" })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      closers.push(() => server.close());
      resolve();
    });
  });
  const login = await fetch(`${base}/auth/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }) });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const section = Object.values(db.data.sections).find((x) => x.courseId === COURSE && x.status === "active")!;
  assert.equal((await call("PUT", `/sections/${section.id}/instructors/${encodeURIComponent(T)}`, adminCookie)).status, 200);
  assert.equal((await call("POST", "/enrollments", student, { courseCode: section.code })).status, 200);
  // 서버 로그에 키가 찍히는지 보려고 콘솔 출력을 모은다
  for (const k of ["log", "error", "warn", "info"] as const) console[k] = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
});
after(() => {
  Object.assign(console, originalConsole);
  for (const c of closers) c();
  fake.close();
  if (originalBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = originalBaseUrl;
  rmSync(dir, { recursive: true, force: true });
});

const KEY_STRINGS = [ADMIN_KEY, TEACHER_KEY, WRONG_KEY, ENV_KEY, LEGACY_KEY];
const noKeyIn = (text: string) => KEY_STRINGS.every((k) => !text.includes(k) && !text.includes(k.slice(-8)));
// 강의자료 초안·번역·병음은 /ai/draft, 실시간 퀴즈는 /ai/live-quiz
const ENDPOINTS = [
  ["강의자료 초안", "/ai/draft", "학습 콘텐츠 JSON을 만들어 주세요."],
  ["번역 자막", "/ai/draft", "1. 下雨了\n위 문장을 한국어로 번역해 주세요."],
  ["실시간 퀴즈", "/ai/live-quiz", "실시간 퀴즈 문제 JSON을 만들어 주세요."],
] as const;

test("BYOK: 관리자·교수자 모두 본인 키로 강의자료 초안·번역·실시간 퀴즈를 생성하고, 서버는 받은 그 키만 Anthropic에 보낸다", async () => {
  for (const [who, cookie, key] of [["관리자", adminCookie, ADMIN_KEY], ["교수자", google(T), TEACHER_KEY]] as const) {
    for (const [label, p, prompt] of ENDPOINTS) {
      seenKeys.length = 0;
      const r = await call("POST", p, cookie, { prompt }, { "X-Anthropic-Key": key });
      assert.equal(r.status, 200, `${who} ${label}: ${r.text}`);
      assert.equal(r.body.text, `GENERATED-BY-${who === "관리자" ? "ADMIN" : "TEACHER"}`, `${who} ${label}`);
      assert.deepEqual(seenKeys, [key], `${who} ${label}: 본인 키만 사용`);
      assert.ok(noKeyIn(r.text), `${who} ${label}: 응답에 키 없음`);
    }
  }
});

test("BYOK: 키 없음(=해제 뒤)은 수동 안내 400 — 공용 키(ANTHROPIC_API_KEY·예전 관리자 키)를 쓰지 않고 Anthropic도 부르지 않는다", async () => {
  seenKeys.length = 0;
  for (const cookie of [adminCookie, google(T)]) {
    for (const [label, p, prompt] of ENDPOINTS) {
      const r = await call("POST", p, cookie, { prompt });
      assert.equal(r.status, 400, label);
      assert.equal(r.body.manual, true, `${label}: 프롬프트 복사·JSON 붙여넣기 안내`);
      assert.match(r.body.error ?? "", /프롬프트 복사/);
      // 빈 헤더도 키 없음과 같다
      assert.equal((await call("POST", p, cookie, { prompt }, { "X-Anthropic-Key": "  " })).body.manual, true, label);
    }
  }
  assert.deepEqual(seenKeys, [], "Anthropic 호출 없음");
});

test("BYOK: 잘못된 키 — 형식 오류는 400(호출 없음), 형식만 맞는 틀린 키는 502 안내, 어느 응답에도 키가 없다", async () => {
  for (const cookie of [adminCookie, google(T)]) {
    for (const [label, p, prompt] of ENDPOINTS) {
      seenKeys.length = 0;
      const shape = await call("POST", p, cookie, { prompt }, { "X-Anthropic-Key": "not-a-key-value" });
      assert.equal(shape.status, 400, label);
      assert.match(shape.body.error ?? "", /형식/);
      assert.ok(!shape.text.includes("not-a-key-value"));
      assert.deepEqual(seenKeys, [], `${label}: 형식 오류는 Anthropic을 부르지 않음`);
      const wrong = await call("POST", p, cookie, { prompt }, { "X-Anthropic-Key": WRONG_KEY });
      assert.equal(wrong.status, 502, label);
      assert.match(wrong.body.error ?? "", /API 키가 올바르지 않아요/);
      assert.ok(noKeyIn(wrong.text), `${label}: 오류 응답에 키 없음`);
      assert.deepEqual(seenKeys, [WRONG_KEY]);
      const empty = await call("POST", p, cookie, { prompt: " " }, { "X-Anthropic-Key": ADMIN_KEY });
      assert.equal(empty.status, 400, `${label}: 빈 프롬프트`);
    }
  }
});

test("BYOK: 키를 넣어도 권한은 그대로 — 학생·로그인 없음은 거부(Anthropic 호출 없음), 콘텐츠 저장 권한도 넓어지지 않는다", async () => {
  seenKeys.length = 0;
  for (const [, p, prompt] of ENDPOINTS) {
    assert.equal((await call("POST", p, student, { prompt }, { "X-Anthropic-Key": TEACHER_KEY })).status, 403);
    assert.equal((await call("POST", p, "", { prompt }, { "X-Anthropic-Key": TEACHER_KEY })).status, 401);
  }
  assert.deepEqual(seenKeys, []);
  assert.equal((await call("GET", "/ai/status", student)).status, 403);
  // 학생이 키 헤더를 붙여도 교수자 전용 API(실시간 퀴즈 세트 저장)는 그대로 거부
  const set = { week: 1, title: "t", questions: [{ question: "Q?", options: ["a", "b"], answer: 0, explanation: "", origin: "manual" }] };
  assert.equal((await call("POST", `/courses/${COURSE}/live-quiz-sets`, student, set, { "X-Anthropic-Key": TEACHER_KEY })).status, 403);
});

test("BYOK: 서버는 키를 저장·노출하지 않는다 — 예전 키 저장 경로 없음, 상태에 키 정보 없음, db.json·로그에 키 없음, 예전 값은 보존", async () => {
  for (const method of ["PUT", "DELETE"]) {
    const r = await call(method, "/ai/key", adminCookie, method === "PUT" ? { apiKey: ADMIN_KEY } : undefined);
    assert.equal(r.status, 404, `${method} /ai/key 경로 없음`);
  }
  const st = await call<{ model: string; personalKey: boolean }>("GET", "/ai/status", google(T));
  assert.equal(st.status, 200);
  assert.deepEqual(Object.keys(st.body).sort(), ["model", "personalKey"]);
  assert.ok(noKeyIn(st.text));
  const file = readFileSync(path.join(dir, "db.json"), "utf8");
  for (const k of [ADMIN_KEY, TEACHER_KEY, WRONG_KEY, ENV_KEY]) assert.ok(!file.includes(k), "db.json에 개인·환경 키 없음");
  assert.equal(db.data.anthropicApiKey, LEGACY_KEY, "예전 데이터는 지우지 않는다");
  assert.ok(logs.every(noKeyIn), "서버 로그에 키 없음");
});

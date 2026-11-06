// AUTH_BACKEND 스위치와 서버 전용 Supabase 관리자 모듈 경계 (npm test)
// 실제 Supabase에 연결하지 않는다. (Supabase 경로 실검사는 npm run supabase:check-c3)
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { createApi, readApiEnv } from "./api";
import { openDb } from "./db";

const ADMIN = { ADMIN_ID: "backend-admin", ADMIN_PASSWORD: "backend-only-password", SESSION_SECRET: "backend-secret" };
let dir = "";
let base = "";
let cookie = "";
let close = () => {};

test("AUTH_BACKEND: 설정이 없거나 다른 값이면 dbjson, supabase일 때만 supabase", () => {
  assert.equal(readApiEnv({}).authBackend, "dbjson");
  assert.equal(readApiEnv({ AUTH_BACKEND: "dbjson" }).authBackend, "dbjson");
  assert.equal(readApiEnv({ AUTH_BACKEND: " Supabase " }).authBackend, "supabase");
  assert.equal(readApiEnv({ AUTH_BACKEND: "postgres" }).authBackend, "dbjson");
  const env = readApiEnv({ SUPABASE_URL: " https://x.supabase.co ", SUPABASE_SERVICE_ROLE_KEY: " k " });
  assert.equal(env.supabaseUrl, "https://x.supabase.co");
  assert.equal(env.supabaseServiceRoleKey, "k");
});

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-backend-"));
  const app = express();
  // supabase로 바꿨지만 서버 설정이 없는 경우
  app.use("/api", createApi(openDb(dir), readApiEnv({ ...ADMIN, AUTH_BACKEND: "supabase" })));
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
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
});

after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

test("AUTH_BACKEND=supabase인데 서버 설정이 없으면 관리자 데이터 API는 503 (db.json으로 몰래 돌아가지 않음)", async () => {
  for (const p of ["/members", "/instructors", "/courses", "/enrollments"]) {
    const r = await fetch(base + p, { headers: { cookie } });
    assert.equal(r.status, 503, p);
    assert.match(((await r.json()) as { error: string }).error, /SUPABASE_URL/);
  }
  // 관리자 로그인 자체는 그대로 동작하고, 미로그인은 여전히 막힌다.
  assert.ok(cookie.startsWith("zhuiju_sid="));
  assert.equal((await fetch(`${base}/members`)).status, 401);
});

test("AUTH_BACKEND=supabase: 과목 생성·수정·공개 목록은 501이 아니라 Supabase 경로로 (입력 오류는 400, 설정 없으면 503, db.json에 쓰지 않음)", async () => {
  const send = (method: string, p: string, body?: unknown) =>
    fetch(base + p, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const before = readFileSync(path.join(dir, "db.json"), "utf8");

  assert.equal((await send("POST", "/courses", { title: " " })).status, 400);
  assert.equal((await send("POST", "/courses", { title: "새 과목", id: "course-abcdef" })).status, 400);
  assert.equal((await send("PATCH", "/courses/course-campus", { status: "legacy" })).status, 400);
  assert.equal((await send("PATCH", "/courses/course-campus", {})).status, 400);

  const created = await send("POST", "/courses", { title: "새 과목", weekCount: 8 });
  assert.equal(created.status, 503);
  assert.equal((await send("PATCH", "/courses/course-campus", { status: "inactive" })).status, 503);

  const pub = await fetch(`${base}/public/courses`);
  assert.equal(pub.status, 503);
  assert.deepEqual(await pub.json(), { error: "과목 목록을 불러오지 못했어요." });

  assert.equal(readFileSync(path.join(dir, "db.json"), "utf8"), before);
  // 관리자 세션이 없으면 생성·수정은 막힌다.
  assert.equal((await fetch(`${base}/courses`, { method: "POST" })).status, 401);
});

test("AUTH_BACKEND=supabase에서 SESSION_SECRET이 없으면 db.json의 키로 대신하지 않고 관리자 로그인을 막는다", async () => {
  const noSecretDir = mkdtempSync(path.join(tmpdir(), "zhuiju-backend-nosecret-"));
  const app = express();
  app.use("/api", createApi(openDb(noSecretDir), readApiEnv({ ADMIN_ID: ADMIN.ADMIN_ID, ADMIN_PASSWORD: ADMIN.ADMIN_PASSWORD, AUTH_BACKEND: "supabase" })));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const config = (await (await fetch(`${url}/config`)).json()) as { adminLoginEnabled: boolean };
    const login = await fetch(`${url}/auth/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }),
    });
    assert.equal(config.adminLoginEnabled, false);
    assert.equal(login.status, 503);
    assert.equal(login.headers.get("set-cookie"), null);
  } finally {
    server.close();
    rmSync(noSecretDir, { recursive: true, force: true });
  }
});

test("서버 전용 Supabase 관리자 모듈은 브라우저 코드에서 쓰지 않는다", () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = path.join(d, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  for (const f of walk("src")) {
    const code = readFileSync(f, "utf8");
    assert.doesNotMatch(code, /supabaseAdmin|SUPABASE_SERVICE_ROLE_KEY|service_role/, f);
  }
  const mod = readFileSync(path.join("server", "supabaseAdmin.ts"), "utf8");
  assert.doesNotMatch(mod, /\.rpc\(\s*[a-zA-Z_]+\s*[,)]/, "rpc 이름은 고정 문자열이어야 한다 (범용 통로 금지)");
  assert.doesNotMatch(mod, /\.from\(\s*[a-zA-Z_]+\s*\)/, "테이블 이름은 고정 문자열이어야 한다 (범용 통로 금지)");
});

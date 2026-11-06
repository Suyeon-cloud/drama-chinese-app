// 관리자 강의 화면 규칙(courseRules) + Supabase 모드에서 과목 관리 API가 저장하지 않고 501을 돌려주는지 (npm test)
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import express from "express";
import {
  COURSE_GROUPS,
  COURSE_STATUS_LABEL,
  COURSE_TEXT_LIMITS,
  DEFAULT_WEEK_COUNT,
  courseFormProblem,
  coursesInGroup,
  enrollableCourses,
  visibleCourses,
} from "../src/content/courseRules";
import { COURSE_SEEDS, LEGACY_COURSE_ID } from "../src/content/courses";
import { createApi, readApiEnv } from "./api";
import { COURSE_TEXT_LIMITS as SERVER_LIMITS, DEFAULT_WEEK_COUNT as SERVER_DEFAULT, parseCourseCreate } from "./courseInput";
import { openDbFor } from "./db";

const C = (id: string, status: string, createdAt = "2026-11-01T00:00:00.000Z") => ({ id, status, weekCount: 15, createdAt });
const ALL = [
  C("course-new002", "inactive", "2026-12-02T00:00:00.000Z"),
  C(LEGACY_COURSE_ID, "legacy"),
  C("course-workplace", "active"),
  C("course-new001", "active", "2026-12-01T00:00:00.000Z"),
  C("course-campus", "active"),
  C("course-university", "active"),
  C("course-odd", "archived"),
];

test("visibleCourses: 운영+비활성, enrollableCourses: 운영만 (기본 3과목 순서 → 새 과목)", () => {
  assert.deepEqual(
    visibleCourses(ALL).map((c) => c.id),
    [...COURSE_SEEDS.map((s) => s.id), "course-new001", "course-new002"],
  );
  assert.deepEqual(
    enrollableCourses(ALL).map((c) => c.id),
    [...COURSE_SEEDS.map((s) => s.id), "course-new001"],
  );
  for (const list of [visibleCourses(ALL), enrollableCourses(ALL)]) {
    assert.ok(!list.some((c) => c.id === LEGACY_COURSE_ID));
    assert.ok(!list.some((c) => c.id === "course-odd"));
  }
});

test("coursesInGroup: 운영·비활성·기존 자료 탭에 상태별로 하나씩만 들어간다", () => {
  assert.deepEqual(COURSE_GROUPS.map((g) => g.id), ["active", "inactive", "legacy"]);
  assert.deepEqual(coursesInGroup(ALL, "active").map((c) => c.id), [...COURSE_SEEDS.map((s) => s.id), "course-new001"]);
  assert.deepEqual(coursesInGroup(ALL, "inactive").map((c) => c.id), ["course-new002"]);
  assert.deepEqual(coursesInGroup(ALL, "legacy").map((c) => c.id), [LEGACY_COURSE_ID]);
  assert.deepEqual(coursesInGroup([], "inactive"), []);
  for (const g of COURSE_GROUPS) assert.ok(g.empty.length > 0);
  assert.equal(COURSE_STATUS_LABEL.inactive, "신규 수강 마감");
  assert.equal(COURSE_STATUS_LABEL.active, "운영 중");
});

test("courseFormProblem: 화면 검사는 서버 입력 검사와 같은 규칙이다", () => {
  assert.deepEqual(COURSE_TEXT_LIMITS, SERVER_LIMITS);
  assert.equal(DEFAULT_WEEK_COUNT, SERVER_DEFAULT);
  const base = { title: "새 과목", drama: "", context: "", description: "", weekCount: 15 };
  assert.equal(courseFormProblem(base), null);
  const cases = [
    { ...base, title: " " },
    { ...base, title: "가".repeat(61) },
    { ...base, drama: "가".repeat(61) },
    { ...base, context: "가".repeat(201) },
    { ...base, description: "가".repeat(501) },
    { ...base, weekCount: 0 },
    { ...base, weekCount: 31 },
    { ...base, weekCount: 7.5 },
    { ...base, weekCount: Number.NaN },
  ];
  for (const v of cases) {
    assert.ok(courseFormProblem(v), JSON.stringify(v));
    // 같은 입력은 서버도 거부한다
    assert.equal(parseCourseCreate(v).ok, false, JSON.stringify(v));
  }
  // 수정: 학습자료가 있는 가장 큰 주차보다 줄이면 화면이 먼저 알려 준다
  assert.match(courseFormProblem({ ...base, weekCount: 5 }, 6) ?? "", /6주차/);
  assert.equal(courseFormProblem({ ...base, weekCount: 6 }, 6), null);
});

/* ───────── Supabase 모드: 과목 관리 API는 DB 준비 전까지 501 (저장하지 않는다) ───────── */

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
let base = "";
let adminCookie = "";
let close = () => {};

before(async () => {
  // Supabase 주소·키 없이 띄운다: db.json도 Supabase도 쓰지 않는다. (실제 DB에 닿지 않는다)
  const db = openDbFor("supabase", "unused");
  const app = express();
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET, ...ADMIN, AUTH_BACKEND: "supabase" })));
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

after(() => close());

test("Supabase 모드(설정 없음): 과목 생성·수정·공개 목록은 503을 돌려주고 성공으로 보이지 않는다", async () => {
  const send = (method: string, p: string, body?: unknown, cookie = adminCookie) =>
    fetch(base + p, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const create = await send("POST", "/courses", { title: "x" });
  assert.equal(create.status, 503);
  assert.match(((await create.json()) as { error: string }).error, /Supabase/);
  assert.equal((await send("PATCH", "/courses/course-campus", { status: "inactive" })).status, 503);
  assert.equal((await send("GET", "/public/courses")).status, 503);
  // 주차별 보충 자료: Supabase 경로로 간다 — 서버 설정이 없으면 관리자 요청은 503 (db.json으로 몰래 돌아가지 않음)
  for (const [method, p, body] of [
    ["GET", "/courses/course-campus/materials", undefined],
    ["POST", "/courses/course-campus/materials", { week: 1, title: "x", url: "https://a.com" }],
    ["PATCH", "/materials/material-x", { title: "x" }],
    ["DELETE", "/materials/material-x", undefined],
    ["PUT", "/courses/course-campus/materials/order", { week: 1, ids: [] }],
  ] as const) {
    const r = await send(method, p, body);
    assert.equal(r.status, 503, `${method} ${p}`);
    assert.match(((await r.json()) as { error: string }).error, /SUPABASE_URL/);
  }
  // 입력 오류는 Supabase에 보내기 전에 400
  assert.equal((await send("POST", "/courses/course-campus/materials", { week: 1, title: "x", url: "http://a.com" })).status, 400);
  assert.equal((await send("PUT", "/courses/course-campus/materials/order", { week: 1, ids: "x" })).status, 400);
  // 학생·교수자(Supabase token 없음)는 401
  assert.equal((await send("GET", "/courses/course-campus/materials", undefined, "")).status, 401);
  // 관리자가 아니면 503보다 먼저 권한에서 막힌다
  assert.equal((await send("POST", "/courses", { title: "x" }, "")).status, 401);
});

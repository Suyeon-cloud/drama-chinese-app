// Phase C5: AUTH_BACKEND=supabase 운영 경로가 db.json 없이 동작하는지 실제 API로 확인한다.
//   npm run supabase:check-c5   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// - 서버와 같은 방식(openDbFor)으로 저장소를 고른다: supabase면 db.json을 열지 않고, 어떤 칸이든 접근하면 바로 오류를 내는 자리 표시자를 쓴다.
//   그러므로 아래 요청에서 500이 하나도 없으면 그 경로가 db.json에 기대지 않는다는 뜻이다.
// - 테스트 행은 모두 이번 검사 태그(phasec5-…)가 붙은 id·과목·계정이며, 실제 데이터는 검사 전후 그대로인지 확인한다.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import type { Lesson } from "../src/content/types";
import type { SectionOverview, SessionUser } from "../src/app/store/models";
import { createApi, readApiEnv } from "../server/api";
import { openDb, openDbFor } from "../server/db";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !anonKey || !serviceKey) {
  console.error(".env.local에 Supabase 값 3개가 필요해요.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const sb = createClient(url, serviceKey, opts);
const tag = randomBytes(3).toString("hex");
const PREFIX = `phasec5-${tag}-`;
const mail = (who: string) => `${PREFIX}${who}@example.test`;
const courseA = `${PREFIX}a`;
const password = randomBytes(18).toString("base64url");
const SECRET = randomBytes(24).toString("hex");
const ADMIN = { ADMIN_ID: `c5-admin-${tag}`, ADMIN_PASSWORD: randomBytes(18).toString("base64url") };
const baseEnv = { ...ADMIN, AUTH_BACKEND: "supabase", SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey };
const createdUsers: string[] = [];
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const must = async <T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) => {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
};
type R = Record<string, unknown>;

const snapshot = async () => {
  const mine = (v: unknown) => String(v).includes(PREFIX);
  const q = (t: string, order: string) => must(sb.from(t).select("*").order(order));
  const [c, s, si, e, i, p, l, d, lp, lg, fb] = await Promise.all([
    q("courses", "id"), q("sections", "id"), q("section_instructors", "section_id"), q("enrollments", "id"), q("instructors", "email"),
    must(sb.from("profiles").select("id,status,approved_at,profile_completed,name").order("id")),
    q("lessons", "id"), q("lesson_dialogues", "id"),
    must(sb.from("lesson_progress").select("*").order("user_id").order("lesson_id")),
    must(sb.from("legacy_progress").select("*").order("legacy_user_id").order("lesson_id")),
    q("feedback_drafts", "id"),
  ]);
  return JSON.stringify([
    (c as R[]).filter((y) => !mine(y.id)), (s as R[]).filter((y) => !mine(y.course_id)), (si as R[]).filter((y) => !mine(y.instructor_email)),
    (e as R[]).filter((y) => !mine(y.course_id)), (i as R[]).filter((y) => !mine(y.email)), (p as R[]).filter((y) => !createdUsers.includes(String(y.id))),
    (l as R[]).filter((y) => !mine(y.id)), d, lp, lg, fb,
  ]);
};
const createUser = async (who: string, name: string) => {
  const { data, error } = await sb.auth.admin.createUser({ email: mail(who), password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new Error(`createUser ${who}: ${error.message}`);
  createdUsers.push(data.user.id);
  return data.user;
};
const signIn = async (who: string) => {
  const client = createClient(url, anonKey, opts);
  const { data, error } = await client.auth.signInWithPassword({ email: mail(who), password });
  if (error || !data.session) throw new Error(`signIn ${who}: ${error?.message}`);
  await client.rpc("sync_my_account");
  return data.session.access_token;
};

const closers: (() => void)[] = [];
type Auth = { token?: string; cookie?: string };
/** 서버(server/index.ts)와 같은 방식으로 저장소를 골라 API를 띄운다. */
const serve = async (env: Record<string, string>, dataDir: string) => {
  const apiEnv = readApiEnv(env);
  const app = express();
  app.use("/api", createApi(openDbFor(apiEnv.authBackend, dataDir), apiEnv));
  const base = await new Promise<string>((resolve) => {
    const server = app.listen(0, () => {
      closers.push(() => server.close());
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
    });
  });
  return async <T = unknown>(method: string, p: string, auth: Auth = {}, body?: unknown) => {
    const res = await fetch(base + p, {
      method,
      headers: {
        ...(auth.cookie ? { cookie: auth.cookie } : {}),
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, body: json as T, text, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
  };
};

const scratch = mkdtempSync(path.join(tmpdir(), "zhuiju-c5-"));
const missingDir = path.join(scratch, "data-should-not-exist");
const before = await snapshot();
try {
  // ── 1. SESSION_SECRET 없이: db.json·DATA_DIR 없이 시작, 일반 API는 동작, 관리자 로그인은 꺼짐
  const noSecret = await serve(baseEnv, missingDir);
  const cfg = await noSecret<{ adminLoginEnabled: boolean; authBackend: string }>("GET", "/config");
  const health = await noSecret("GET", "/health");
  const adminLogin = await noSecret("POST", "/auth/admin", {}, { id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD });
  const anonLessons = await noSecret<unknown[]>("GET", "/lessons");
  check(
    "supabase·SESSION_SECRET 없음: db.json·DATA_DIR 없이 시작, /health·/config·/lessons 정상, 관리자 로그인 꺼짐(503, 쿠키 없음)",
    health.status === 200 && cfg.status === 200 && cfg.body.authBackend === "supabase" && cfg.body.adminLoginEnabled === false &&
      adminLogin.status === 503 && !adminLogin.cookie && anonLessons.status === 200 && anonLessons.body.length === 0 && !existsSync(missingDir),
  );
  check("/config에 서버 전용 값 없음 (service-role·anon 키·관리자 값)", ![serviceKey, anonKey, ADMIN.ADMIN_PASSWORD, ADMIN.ADMIN_ID].some((v) => cfg.text.includes(v)));

  // ── 2. SESSION_SECRET 있음: 관리자 로그인 + 관리자 API 전부 db.json 없이
  const call = await serve({ ...baseEnv, SESSION_SECRET: SECRET }, missingDir);
  const login = await call<{ user: SessionUser }>("POST", "/auth/admin", {}, { id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD });
  const admin: Auth = { cookie: login.cookie };
  check("SESSION_SECRET 있음: 관리자 로그인 200 + HttpOnly 쿠키", login.status === 200 && login.body.user.provider === "admin" && !!admin.cookie);

  await must(sb.from("courses").insert({ id: courseA, title: "C5 A", drama: "C5", status: "active", legacy_code: null }));
  const tpl = openDb(path.join(scratch, "template"));
  const sample = Object.values(tpl.data.lessons).find((l) => l.status === "published" && l.courseId !== "course-legacy")!;
  const lesson: Lesson = { ...sample, dialogues: undefined, id: `${PREFIX}a-w1`, courseId: courseA, week: 1 };
  await call("POST", "/instructors", admin, { email: mail("teacher") });
  await createUser("teacher", "C5 교수");
  const st = await createUser("student", "C5 학생");
  await must(sb.from("profiles").update({ profile_completed: true, name: "C5 학생" }).eq("id", st.id));
  await call("PATCH", `/members/${st.id}`, admin, { status: "approved" });
  const sec = (await call<SectionOverview>("POST", `/courses/${courseA}/sections`, admin, { instructors: [mail("teacher")] })).body;
  const saved = await call<Lesson>("PUT", `/lessons/${lesson.id}`, admin, lesson);
  const adminPaths = ["/courses", "/members", "/instructors", "/lessons", "/progress", "/feedback", "/enrollments", `/courses/${courseA}/curriculum`, `/courses/${courseA}/students`, "/ai/status", "/auth/me"];
  const adminRes = await Promise.all(adminPaths.map((p) => call("GET", p, admin)));
  const failedAdmin = adminPaths.filter((_, i) => adminRes[i].status !== 200);
  check(
    `관리자 API ${adminPaths.length}개 + 분반 개설·회원 승인·학습자료 저장: db.json 없이 모두 200`,
    saved.status === 200 && !!sec.code && failedAdmin.length === 0,
    failedAdmin.join(", "),
  );

  // ── 3. 학생·교수자: Supabase token만으로 (예전 Google 쿠키는 받지 않음)
  const T = await signIn("teacher");
  const S = await signIn("student");
  const enroll = await call("POST", "/enrollments", { token: S }, { courseCode: sec.code });
  const meT = await call<{ user: SessionUser | null }>("GET", "/auth/me", { token: T });
  const meS = await call<{ user: SessionUser | null }>("GET", "/auth/me", { token: S });
  const studentPaths = ["/courses", "/lessons", "/progress", "/enrollments", `/courses/${courseA}/curriculum`];
  const teacherPaths = ["/courses", "/lessons", "/progress", "/enrollments", `/courses/${courseA}/curriculum`, `/courses/${courseA}/students`, "/ai/status"];
  const sRes = await Promise.all(studentPaths.map((p) => call("GET", p, { token: S })));
  const tRes = await Promise.all(teacherPaths.map((p) => call("GET", p, { token: T })));
  const prog = await call("PUT", "/progress", { token: S }, {
    userId: st.id, lessonId: lesson.id, week: 1, startedAt: new Date().toISOString(), completedAt: null, watchedRanges: [[0, 5]], progressRatio: 0.1, maxPosition: 5, quiz: null, quizAttempts: 0, lastStudiedAt: null,
  });
  const bad = [...studentPaths.filter((_, i) => sRes[i].status !== 200).map((p) => `학생 ${p}`), ...teacherPaths.filter((_, i) => tRes[i].status !== 200).map((p) => `교수자 ${p}`)];
  check(
    "학생·교수자: Supabase token으로 로그인 확인(역할), 수강 등록·과목·학습자료·학습 기록 저장/조회·커리큘럼·수강생·AI 상태 모두 db.json 없이 정상",
    enroll.status === 200 && meT.body.user?.role === "instructor" && meS.body.user?.role === "learner" && prog.status === 200 && bad.length === 0,
    bad.join(", "),
  );
  const legacyPayload = Buffer.from(JSON.stringify({ k: "google", id: "legacy", email: mail("teacher"), exp: Date.now() + 3600_000 })).toString("base64url");
  const legacyCookie = `zhuiju_sid=${legacyPayload}.${createHmac("sha256", SECRET).update(legacyPayload).digest("base64url")}`;
  const legacy = await call<{ user: SessionUser | null }>("GET", "/auth/me", { cookie: legacyCookie });
  const legacyGoogle = await call("POST", "/auth/google", {}, { accessToken: "x" });
  const legacyProfile = await call("PUT", "/me/profile", { token: S }, {});
  const legacyKey = await call("PUT", "/ai/key", admin, { apiKey: "sk-ant-x" });
  check(
    "예전 경로가 끼어들지 않음: 예전 Google 쿠키(올바른 서명이어도) 무시, /auth/google·/me/profile 400, /ai/key 경로 없음 404 (BYOK, db.json 접근 없음)",
    legacy.status === 200 && legacy.body.user === null && legacyGoogle.status === 400 && legacyProfile.status === 400 && legacyKey.status === 404,
  );
  check("검사 내내 DATA_DIR 폴더·db.json이 만들어지지 않음", !existsSync(missingDir));

  // ── 4. dbjson은 그대로 db.json을 연다
  const dbjsonDir = path.join(scratch, "dbjson");
  openDbFor("dbjson", dbjsonDir);
  openDbFor(undefined, path.join(scratch, "default"));
  check("AUTH_BACKEND=dbjson·미설정은 기존처럼 db.json을 만든다", existsSync(path.join(dbjsonDir, "db.json")) && existsSync(path.join(scratch, "default", "db.json")));
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  for (const c of closers) c();
  rmSync(scratch, { recursive: true, force: true });
  await sb.from("lesson_progress").delete().like("lesson_id", `${PREFIX}%`);
  await sb.from("lessons").delete().eq("course_id", courseA);
  for (const id of createdUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("enrollments").delete().eq("course_id", courseA);
  await sb.from("section_instructors").delete().like("instructor_email", `${PREFIX}%`);
  await sb.from("sections").delete().eq("course_id", courseA);
  await sb.from("courses").delete().eq("id", courseA);
  await sb.from("instructors").delete().like("email", `${PREFIX}%`);
  const left = await sb.from("courses").select("id", { count: "exact", head: true }).eq("id", courseA);
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftUsers = users.users.filter((u) => (u.email ?? "").startsWith(PREFIX)).length;
  console.log(`정리: 남은 테스트 과목 ${left.count}, 계정 ${leftUsers}`);
  check("테스트 데이터 모두 정리", left.count === 0 && leftUsers === 0);
  check("실제 데이터(C1~C4 + 학습자료·회화·학습 기록·보관 기록·피드백)는 검사 전후 그대로", (await snapshot()) === before);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

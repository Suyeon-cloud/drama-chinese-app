// Supabase dev 프로젝트에서 Phase C4(학생·교수자 Supabase 로그인 + 과목·분반·수강 전환)를 실제 API로 확인한다.
//   npm run supabase:check-c4   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// 임시 폴더의 새 db.json으로 실제 API(createApi, AUTH_BACKEND=supabase)를 띄운다. 학생·교수자는 Supabase access token(Bearer)으로만 요청한다.
// 테스트용 계정(example.test)·과목·분반·교수자를 만들었다가 모두 지운다. 실제 과목·분반·교수자·계정·profile은 검사 전후 그대로인지 확인한다.
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import type { Lesson } from "../src/content/types";
import type { CourseCurriculum, CourseLookup, CourseOverview, CourseStudents, CourseSummary, EnrollResult, Enrollment, LessonProgress, SectionOverview, SessionUser } from "../src/app/store/models";
import { createApi, readApiEnv } from "../server/api";
import { openDb } from "../server/db";

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
const PREFIX = `phasec4-${tag}-`;
const mail = (who: string) => `${PREFIX}${who}@example.test`;
const courseA = `${PREFIX}a`;
const courseB = `${PREFIX}b`;
const password = randomBytes(18).toString("base64url");
const SECRET = randomBytes(24).toString("hex");
const ADMIN = { ADMIN_ID: `c4-admin-${tag}`, ADMIN_PASSWORD: randomBytes(18).toString("base64url") };
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

/** 실제 데이터 스냅샷 (이번 검사 태그가 붙은 행·계정은 제외) */
const snapshot = async () => {
  const mine = (v: unknown) => String(v).includes(PREFIX);
  const [c, s, si, e, i, p] = await Promise.all([
    must(sb.from("courses").select("*").order("id")),
    must(sb.from("sections").select("*").order("id")),
    must(sb.from("section_instructors").select("*").order("section_id")),
    must(sb.from("enrollments").select("*").order("id")),
    must(sb.from("instructors").select("*").order("email")),
    must(sb.from("profiles").select("id,status,approved_at,profile_completed,name").order("id")),
  ]);
  return JSON.stringify([
    (c as { id: string }[]).filter((r) => !mine(r.id)),
    (s as { id: string; course_id: string }[]).filter((r) => !mine(r.course_id)),
    (si as { instructor_email: string }[]).filter((r) => !mine(r.instructor_email)),
    (e as { course_id: string }[]).filter((r) => !mine(r.course_id)),
    (i as { email: string }[]).filter((r) => !mine(r.email)),
    (p as { id: string }[]).filter((r) => !createdUsers.includes(r.id)),
  ]);
};

const createUser = async (who: string, name: string) => {
  const { data, error } = await sb.auth.admin.createUser({ email: mail(who), password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new Error(`createUser ${who}: ${error.message}`);
  createdUsers.push(data.user.id);
  return data.user;
};
/** 브라우저처럼 Supabase에 로그인해 access token을 받는다. */
const signIn = async (who: string) => {
  const client = createClient(url, anonKey, opts);
  const { data, error } = await client.auth.signInWithPassword({ email: mail(who), password });
  if (error || !data.session) throw new Error(`signIn ${who}: ${error?.message}`);
  return { client, token: data.session.access_token };
};

const dir = mkdtempSync(path.join(tmpdir(), "zhuiju-c4-"));
let base = "";
let close = () => {};
type Auth = { token?: string; cookie?: string };
const call = async <T = unknown>(method: string, p: string, auth: Auth = {}, body?: unknown) => {
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
  return { status: res.status, body: json as T, text };
};
const me = async (auth: Auth) => (await call<{ user: SessionUser | null }>("GET", "/auth/me", auth)).body.user;
const sessionCookie = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};

const before = await snapshot();
try {
  // ── 임시 db.json (D4부터 진도도 Supabase — db.json에는 쓰지 않는지 확인한다). 회화 id는 전역 고유라 테스트 학습자료에는 회화를 넣지 않는다. 학습자료는 D3부터 Supabase에 둔다: 테스트 과목 A·B 학습자료는 아래에서 admin_save_lesson으로 만든다.
  const db = openDb(dir);
  const tplLesson = Object.values(db.data.lessons).find((l) => l.status === "published" && l.courseId !== "course-legacy")!;
  const lesson = (courseId: string, week: number, status: Lesson["status"]): Lesson => ({ ...tplLesson, dialogues: undefined, id: `${courseId}-w${week}`, courseId, week, status });

  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createApi(
      db,
      readApiEnv({ ...ADMIN, SESSION_SECRET: SECRET, AUTH_BACKEND: "supabase", SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey }),
    ),
  );
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      close = () => server.close();
      resolve();
    });
  });
  const login = await fetch(`${base}/auth/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }) });
  const admin: Auth = { cookie: (login.headers.get("set-cookie") ?? "").split(";")[0] };
  check("관리자: 기존 아이디·비밀번호 로그인 + 서버 관리자 세션 그대로", login.status === 200 && !!admin.cookie?.startsWith("zhuiju_sid="));

  const config = await call<{ authBackend: string }>("GET", "/config");
  check("/config: authBackend=supabase만 공개 (Supabase 키 없음)", config.body.authBackend === "supabase" && !config.text.includes(serviceKey) && !config.text.includes(anonKey));

  // ── 준비: 테스트 과목·분반(관리자 API), 교수자 2명(1명만 배정), 학생 4명
  await must(sb.from("courses").insert([
    { id: courseA, title: "C4 A", drama: "C4", status: "active", legacy_code: null },
    { id: courseB, title: "C4 B", drama: "C4", status: "active", legacy_code: null },
  ]));
  for (const l of [lesson(courseA, 1, "published"), lesson(courseA, 2, "draft"), lesson(courseB, 1, "published")]) {
    await must(sb.rpc("admin_save_lesson", { p_lesson: l, p_admin_label: "C4 검사" }));
  }
  for (const t of ["t-assigned", "t-none"]) await call("POST", "/instructors", admin, { email: mail(t) });
  const tA = await createUser("t-assigned", "배정 교수");
  const tN = await createUser("t-none", "미배정 교수");
  await createUser("s-new", "새 학생");
  const sP = await createUser("s-pending", "대기 학생");
  const s1 = await createUser("s-one", "학생 하나");
  const s2 = await createUser("s-two", "학생 둘");
  for (const [u, sid] of [[sP, "C4-P"], [s1, "C4-1"], [s2, "C4-2"]] as const) {
    await must(sb.from("profiles").update({ profile_completed: true, name: u.user_metadata.full_name, student_id: sid }).eq("id", u.id));
  }
  for (const u of [s1, s2]) await call("PATCH", `/members/${u.id}`, admin, { status: "approved" });
  const secA1 = (await call<SectionOverview>("POST", `/courses/${courseA}/sections`, admin, { instructors: [mail("t-assigned")] })).body;
  const secA2 = (await call<SectionOverview>("POST", `/courses/${courseA}/sections`, admin, { name: "A 둘째" })).body;
  const secB1 = (await call<SectionOverview>("POST", `/courses/${courseB}/sections`, admin, {})).body;
  const secB2 = (await call<SectionOverview>("POST", `/courses/${courseB}/sections`, admin, { name: "B 비활성" })).body;
  await call("PATCH", `/sections/${secB2.id}`, admin, { status: "inactive" });
  if (!secA1.code || !secA2.code || !secB1.code || !secB2.code) throw new Error("테스트 분반을 만들지 못했어요.");

  const T_A = await signIn("t-assigned");
  const T_N = await signIn("t-none");
  const S0 = await signIn("s-new");
  const SP = await signIn("s-pending");
  const S1 = await signIn("s-one");
  const S2 = await signIn("s-two");
  for (const u of [T_A, T_N, S0, SP, S1, S2]) await u.client.rpc("sync_my_account");

  // ── token 검증
  const noTok = await Promise.all([me({}), call("GET", "/courses"), call<unknown[]>("GET", "/lessons"), call("GET", "/progress"), call("GET", "/enrollments"), call("GET", `/courses/lookup?code=${secA1.code}`)]);
  check(
    "token 없음: 로그인 아님 · 과목/진도/수강 401 · 학습자료 없음 · 강의코드 확인 401",
    noTok[0] === null && noTok[1].status === 401 && (noTok[2].body as unknown[]).length === 0 && noTok[3].status === 401 && noTok[4].status === 401 && noTok[5].status === 401,
  );
  const bad: Auth = { token: `${S1.token.slice(0, -4)}AAAA` };
  const badRes = await Promise.all([me(bad), call("GET", "/courses", bad), call("GET", "/courses", { token: "not-a-jwt" })]);
  check("위조·잘못된 token 거부", badRes[0] === null && badRes[1].status === 401 && badRes[2].status === 401);
  const legacyCookie = sessionCookie({ k: "google", id: s1.id, email: mail("s-one") });
  check("이전 Google 쿠키 세션은 supabase 모드에서 받지 않음", (await me({ cookie: legacyCookie })) === null);
  const g = await call("POST", "/auth/google", {}, { accessToken: "x" });
  const prof = await call("PUT", "/me/profile", { token: S1.token }, {});
  check("supabase 모드: /auth/google·/me/profile(서버 세션·db.json 경로) 400", g.status === 400 && prof.status === 400);
  check("학생·교수자 요청에 서버 로그인 쿠키를 만들지 않음", !(await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${S1.token}` } })).headers.get("set-cookie"));

  // ── 역할 판정
  const uTA = await me(T_A);
  const uTN = await me(T_N);
  const tNProfile = await must(sb.from("profiles").select("status").eq("id", tN.id).single());
  check("교수자: instructors.user_id 연결 → role instructor, 학생 회원정보·승인 대기 없음 (profile pending이어도)", uTA?.role === "instructor" && uTN?.role === "instructor" && uTN.member === null && tNProfile.status === "pending");
  const u0 = await me(S0);
  check("새 학생: profile 미완료 → 회원정보 입력 대상", u0?.role === "learner" && u0.member?.profileCompleted === false && u0.member.googleEmail === mail("s-new"));
  const done = await S0.client.rpc("complete_my_profile", {
    p_name: "새 학생", p_university: "C4 대학", p_department: "중국어", p_grade: "1학년", p_student_id: "C4-0", p_contact_email: mail("s-new"), p_phone: "010-0000-0000",
  });
  const u0b = await me(S0);
  check("complete_my_profile 후 바로 반영: 완료 + 승인 대기", !done.error && u0b?.member?.profileCompleted === true && u0b.member.status === "pending" && u0b.member.studentId === "C4-0");
  const uP = await me(SP);
  const u1 = await me(S1);
  check("완료+pending → 승인 대기 / 승인 → 앱 이용 (profile이 있다고 학생 승인이 아님)", uP?.member?.status === "pending" && u1?.member?.status === "approved" && u1.role === "learner" && u1.id === s1.id);

  // ── 학생 수강 규칙 (enroll_with_code)
  const pendLook = await call("GET", `/courses/lookup?code=${secA1.code}`, SP);
  const pendEnroll = await call("POST", "/enrollments", SP, { courseCode: secA1.code });
  check("승인 대기 학생: 강의코드 확인·등록 403", pendLook.status === 403 && pendEnroll.status === 403);
  const look = await call<CourseLookup>("GET", `/courses/lookup?code=${secA1.code.toLowerCase()}`, S1);
  const afterLook = await must(sb.from("enrollments").select("id").eq("user_id", s1.id));
  check("승인 학생: 미리보기(enroll_with_code false)는 과목·분반만 보여주고 등록하지 않음", look.status === 200 && look.body.id === courseA && look.body.sectionName === secA1.name && afterLook.length === 0);
  const e1 = await call<EnrollResult>("POST", "/enrollments", S1, { courseCode: secA1.code });
  const e1b = await call<EnrollResult>("POST", "/enrollments", S1, { courseCode: secA1.code });
  check("등록(enroll_with_code true) → 같은 코드 다시 등록은 alreadyEnrolled", e1.status === 200 && e1.body.enrollment.sectionId === secA1.id && e1.body.alreadyEnrolled === false && e1b.status === 200 && e1b.body.alreadyEnrolled === true);
  check("등록 결과에 담당 교수 이름", e1.body.course.section?.instructorNames.includes("배정 교수") === true);
  const dupCourse = await call("POST", "/enrollments", S1, { courseCode: secA2.code });
  const badCode = await call("POST", "/enrollments", S1, { courseCode: "ZZZZZZ" });
  const inactive = await call("POST", "/enrollments", S1, { courseCode: secB2.code });
  const eB = await call<EnrollResult>("POST", "/enrollments", S1, { courseCode: secB1.code });
  check("같은 과목 다른 분반 409 · 없는 코드 404 · 비활성 분반 거부 · 다른 과목은 등록", dupCourse.status === 409 && badCode.status === 404 && inactive.status >= 400 && inactive.status < 500 && eB.status === 200);
  const e2 = await call("POST", "/enrollments", S2, { courseCode: secA2.code });
  const tLook = await call("GET", `/courses/lookup?code=${secA1.code}`, T_N);
  const tEnroll = await call("POST", "/enrollments", T_A, { courseCode: secA2.code });
  check("교수자는 수강 등록 불가 (미리보기·등록 403)", e2.status === 200 && tLook.status === 403 && tEnroll.status === 403);

  // ── 학생: 본인 과목만
  const c1 = await call<CourseSummary[]>("GET", "/courses", S1);
  const c2 = await call<CourseSummary[]>("GET", "/courses", S2);
  const cP = await call<CourseSummary[]>("GET", "/courses", SP);
  check(
    "학생 과목 목록: 본인 수강 과목만 (분반·담당 교수 포함, 강의코드 없음)",
    c1.status === 200 && c1.body.map((c) => c.id).sort().join() === [courseA, courseB].sort().join() && c1.body.find((c) => c.id === courseA)?.section?.instructorNames.includes("배정 교수") === true &&
      !c1.text.includes(secA1.code) && c2.body.map((c) => c.id).join() === courseA && (cP.body as unknown[]).length === 0,
  );
  const l1 = await call<Lesson[]>("GET", "/lessons", S1);
  const l2 = await call<Lesson[]>("GET", "/lessons", S2);
  const ids = (ls: Lesson[]) => ls.map((l) => l.id).filter((id) => id.startsWith(PREFIX)).sort().join();
  check("학습자료: 수강 과목의 공개 자료만 (준비 중 제외, 다른 과목 제외)", ids(l1.body) === [`${courseA}-w1`, `${courseB}-w1`].sort().join() && ids(l2.body) === `${courseA}-w1` && l1.body.every((l) => l.courseId.startsWith(PREFIX)));
  const cur1 = await call<CourseCurriculum>("GET", `/courses/${courseA}/curriculum`, S1);
  const cur2 = await call("GET", `/courses/${courseB}/curriculum`, S2);
  check("주차 목록: 수강 과목 200 · 미수강 과목 404", cur1.status === 200 && cur1.body.weeks.length === 2 && cur2.status === 404);
  const enr1 = await call<Enrollment[]>("GET", "/enrollments", S1);
  check("학생 수강 기록: 본인 것만", enr1.status === 200 && enr1.body.length === 2 && enr1.body.every((e) => e.userId === s1.id));

  // ── 학습 기록 (D4부터 Supabase lesson_progress, userId는 Supabase 사용자 id)
  const prog = (userId: string, lessonId: string): LessonProgress => ({
    userId, lessonId, week: 1, startedAt: new Date().toISOString(), completedAt: null, watchedRanges: [[0, 5]], progressRatio: 0.2, maxPosition: 5, quiz: null, quizAttempts: 0,
  } as unknown as LessonProgress);
  const p1 = await call("PUT", "/progress", S1, prog(s1.id, `${courseA}-w1`));
  const p2 = await call("PUT", "/progress", S2, prog(s2.id, `${courseA}-w1`));
  const pDraft = await call("PUT", "/progress", S1, prog(s1.id, `${courseA}-w2`));
  const pOther = await call("PUT", "/progress", S1, prog(s2.id, `${courseA}-w1`));
  const pNotMine = await call("PUT", "/progress", S2, prog(s2.id, `${courseB}-w1`));
  const pPend = await call("PUT", "/progress", SP, prog(sP.id, `${courseA}-w1`));
  const pTeach = await call("PUT", "/progress", T_A, prog(tA.id, `${courseA}-w1`));
  check(
    "학습 기록 저장: 본인·수강 과목·공개 자료만 (준비 중 403, 남의 id 400, 미수강 403, 승인 대기 403, 교수자 403)",
    p1.status === 200 && p2.status === 200 && pDraft.status === 403 && pOther.status === 400 && pNotMine.status === 403 && pPend.status === 403 && pTeach.status === 403,
  );
  const g1 = await call<LessonProgress[]>("GET", "/progress", S1);
  // D4부터 학습 기록은 Supabase lesson_progress에 저장된다. (db.json에는 쓰지 않는다)
  const s1Rows = await must(sb.from("lesson_progress").select("user_id,lesson_id").eq("user_id", s1.id));
  check(
    "학습 기록 조회: 본인 것만 (Supabase lesson_progress, db.json에는 없음)",
    g1.body.length === 1 && g1.body[0].userId === s1.id && s1Rows.length === 1 && Object.keys(db.data.progress).length === 0,
  );

  // ── 교수자: 미배정 0과목 / 배정 교수자는 담당 분반만
  const nC = await call<unknown[]>("GET", "/courses", T_N);
  const nL = await call<Lesson[]>("GET", "/lessons", T_N);
  const nS = await call("GET", `/courses/${courseA}/students`, T_N);
  const nP = await call<unknown[]>("GET", "/progress", T_N);
  const nE = await call<unknown[]>("GET", "/enrollments", T_N);
  check("미배정 교수자: 과목 0 · 학습자료 0 · 수강생 404 · 진도/수강 기록 0", nC.status === 200 && nC.body.length === 0 && ids(nL.body) === "" && nL.body.length === 0 && nS.status === 404 && nP.body.length === 0 && nE.body.length === 0);
  const aC = await call<CourseOverview[]>("GET", "/courses", T_A);
  const ov = aC.body[0];
  check(
    "배정 교수자 과목: 담당 분반의 과목만, 담당 분반만(강의코드 포함), 수강생 수",
    aC.status === 200 && aC.body.length === 1 && ov.id === courseA && ov.sections.length === 1 && ov.sections[0].id === secA1.id && ov.sections[0].code === secA1.code && ov.sections[0].enrolledCount === 1 && ov.lessonCount === 2,
  );
  const aS = await call<CourseStudents>("GET", `/courses/${courseA}/students`, T_A);
  const aSB = await call("GET", `/courses/${courseB}/students`, T_A);
  const aSA2 = await call("GET", `/courses/${courseA}/students?section=${secA2.id}`, T_A);
  check(
    "배정 교수자 수강생: 담당 분반 학생만 (section_students RPC), 진도는 그 학생 것만",
    aS.status === 200 && aS.body.students.length === 1 && aS.body.students[0].userId === s1.id && aS.body.students[0].studentId === "C4-1" &&
      aS.body.progress.length === 1 && aS.body.progress[0].userId === s1.id && aSB.status === 404 && aSA2.status === 404,
  );
  const aL = await call<Lesson[]>("GET", "/lessons", T_A);
  check("배정 교수자 학습자료: 담당 과목 전체(준비 중 포함), 다른 과목 제외", ids(aL.body) === [`${courseA}-w1`, `${courseA}-w2`].sort().join() && aL.body.every((l) => l.courseId === courseA));
  const aP = await call<LessonProgress[]>("GET", "/progress", T_A);
  const aE = await call<Enrollment[]>("GET", "/enrollments", T_A);
  check("배정 교수자 진도·수강 기록: 담당 분반 학생만", aP.body.length === 1 && aP.body[0].userId === s1.id && aE.body.length === 1 && aE.body[0].userId === s1.id && aE.body[0].sectionId === secA1.id);
  // 학습자료는 Supabase에서 관리자 API로 읽는다 (version 포함)
  const adminLessons = async () => (await call<Lesson[]>("GET", "/lessons", admin)).body.filter((l) => l.id.startsWith(PREFIX));
  const lessonOf = async (id: string) => (await adminLessons()).find((l) => l.id === id)!;
  const lessonsBefore = JSON.stringify((await adminLessons()).filter((l) => l.courseId !== courseA));
  const a2 = await lessonOf(`${courseA}-w2`);
  const saveA = await call("PUT", `/lessons/${courseA}-w2`, T_A, { ...a2, title: "C4 수정" });
  const saveB = await call("PUT", `/lessons/${courseB}-w1`, T_A, { ...(await lessonOf(`${courseB}-w1`)), title: "C4 침범" });
  const saveN = await call("PUT", `/lessons/${courseA}-w2`, T_N, { ...a2, title: "C4 미배정" });
  const saveS = await call("PUT", `/lessons/${courseA}-w2`, S1, { ...a2, title: "C4 학생" });
  check(
    "학습자료 저장: 배정 교수자는 담당 과목만 (다른 과목·미배정 교수자 403, 학생 403)",
    saveA.status === 200 && (await lessonOf(`${courseA}-w2`)).title === "C4 수정" && saveB.status === 403 && saveN.status === 403 && saveS.status === 403 &&
      JSON.stringify((await adminLessons()).filter((l) => l.courseId !== courseA)) === lessonsBefore,
  );

  // ── 관리자 분리: 학생·교수자 token으로 관리자 API 불가
  const adminPaths: [string, string][] = [["GET", "/members"], ["GET", "/instructors"], ["POST", `/courses/${courseA}/sections`], ["PATCH", `/sections/${secA1.id}`], ["DELETE", `/lessons/${courseA}-w1`], ["GET", "/feedback"], ["PATCH", `/members/${s1.id}`]];
  let denied = true;
  for (const who of [S1, T_A]) for (const [m, p] of adminPaths) if ((await call(m, p, who, m === "GET" || m === "DELETE" ? undefined : { status: "approved" })).status !== 403) denied = false;
  const s1After = await must(sb.from("profiles").select("status").eq("id", s1.id).single());
  check("학생·교수자 token: 관리자 API 전부 403 (데이터 변경 없음)", denied && s1After.status === "approved" && !!(await lessonOf(`${courseA}-w1`)));
  check("관리자 쿠키 세션은 그대로 관리자 API 사용", (await call("GET", "/members", admin)).status === 200);

  // ── 실제 개발 계정 (조회만): 교수자 연결, 담당 분반 0
  const realIns = (await must(sb.from("instructors").select("email,user_id").not("email", "like", `${PREFIX}%`))) as { email: string; user_id: string | null }[];
  const realLinks = (await must(sb.from("section_instructors").select("instructor_email").in("instructor_email", realIns.map((r) => r.email)))) as unknown[];
  check(`실제 교수자 ${realIns.length}명: 계정 연결됨, 분반 배정 0 (이 서버에서 0과목으로 보임)`, realIns.length > 0 && realIns.every((r) => !!r.user_id) && realLinks.length === 0);
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  close();
  rmSync(dir, { recursive: true, force: true });
  for (const id of createdUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("enrollments").delete().in("course_id", [courseA, courseB]);
  await sb.from("section_instructors").delete().like("instructor_email", `${PREFIX}%`);
  await sb.from("sections").delete().in("course_id", [courseA, courseB]);
  // 학습 기록이 있는 학습자료는 지울 수 없으므로(RESTRICT) 테스트 기록부터 지운다.
  await sb.from("lesson_progress").delete().like("lesson_id", `${PREFIX}%`);
  await sb.from("lessons").delete().in("course_id", [courseA, courseB]);
  await sb.from("courses").delete().in("id", [courseA, courseB]);
  await sb.from("instructors").delete().like("email", `${PREFIX}%`);
  const left = await Promise.all([
    sb.from("courses").select("id", { count: "exact", head: true }).in("id", [courseA, courseB]),
    sb.from("sections").select("id", { count: "exact", head: true }).in("course_id", [courseA, courseB]),
    sb.from("instructors").select("email", { count: "exact", head: true }).like("email", `${PREFIX}%`),
  ]);
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftUsers = users.users.filter((u) => (u.email ?? "").startsWith(PREFIX)).length;
  console.log(`정리: 남은 테스트 과목 ${left[0].count}, 분반 ${left[1].count}, 교수자 ${left[2].count}, 계정 ${leftUsers}`);
  check("실제 데이터(과목·분반·배정·수강·교수자·profile)는 검사 전후 그대로", (await snapshot()) === before);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

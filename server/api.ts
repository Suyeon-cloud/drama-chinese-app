// 웹앱 API (/api/*). 개발 시에는 Vite 서버(npm run app)에, 배포 시에는 server/index.ts(npm start)에 붙는다.
//
// 로그인
//   - 회원: 브라우저가 Google 팝업으로 받은 access token을 보내면, 서버가 Google에 직접 확인한 뒤 로그인 쿠키를 준다.
//   - 관리자: Google 계정과 별개로 ADMIN_ID / ADMIN_PASSWORD 환경변수로 로그인한다.
//   - 교수자: 학습자와 같은 Google 로그인. 등록된 교수자 이메일이면 교수자가 된다.
// 권한
//   - 관리자(아이디·비밀번호): 플랫폼 전체 — 회원, 교수자와 과목 배정, 모든 과목·강의자료·학습 기록, 피드백
//   - 교수자: 배정(courseInstructors의 courseId + email)된 운영 과목만 — 수강생·진도·퀴즈 결과, 강의자료 편집
//   - 학습자: 본인 정보·본인 학습 기록·수강 중인 과목만. 관리자 승인 전에는 수강 등록·학습 기록을 할 수 없다.

import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { isValidEmail, normalizeEmail } from "../src/app/auth/roles";
import { lessonPublishProblems } from "../src/app/lib/subtitles";
import { LEGACY_COURSE_ID } from "../src/content/courses";
import type {
  Course,
  CourseCurriculum,
  CourseLookup,
  CourseOverview,
  CourseStudents,
  CourseSummary,
  Section,
  SectionOverview,
  SectionTeacher,
  Enrollment,
  EnrollResult,
  FeedbackDraft,
  LearnerProfile,
  LessonProgress,
  MemberProfileInput,
  PublicConfig,
  SessionUser,
} from "../src/app/store/models";
import type { Lesson } from "../src/content/types";
import type { Db } from "./db";
import { AI_MODEL, aiErrorMessage, checkAnthropicKey, generateDraftText } from "./aiDraft";
import { feedbackProblem } from "./feedbackRows";
import { AdminDataError, createSupabaseAdminClient, createSupabaseAdminStore, type SupabaseAdminStore } from "./supabaseAdmin";
import {
  bearerToken,
  curriculumFor,
  lessonFor,
  lessonIdsFor,
  listLessonsFor,
  listProgressFor,
  saveLessonAs,
  saveMyProgress,
  courseSummaryFromRow,
  createSupabaseUserResolver,
  enrollResult,
  enrollWithCode,
  learnerCourseCard,
  sectionTeachersFor,
  sessionUserFromAccess,
  studentsOfSections,
  type SupabaseAccess,
} from "./supabaseUser";
import {
  enrollmentKey,
  enrollmentsForSection,
  enrollmentsForUser,
  findSectionByCode,
  instructorsForSection,
  lessonsForCourse,
  nextSectionName,
  progressForCourse,
  sectionIdsForInstructor,
  sectionInstructorKey,
  sectionsForCourse,
  uniqueSectionCode,
} from "./courses";

export type ApiEnv = {
  googleClientId: string;
  adminId: string;
  adminPassword: string;
  /** 관리자 Gmail 발송 계정 (선택) */
  adminEmail: string;
  initialInstructorEmail: string;
  sessionSecret: string;
  /** (선택) Anthropic API 키. 관리자가 화면에서 연결한 키가 있으면 그 키를 먼저 쓴다. */
  anthropicApiKey: string;
  /**
   * 회원·교수자·과목·분반·수강 데이터의 저장소. dbjson(기본): data/db.json / supabase: Supabase.
   * Phase C3에서는 관리자 API만 이 값을 따른다. 학생·교수자 로그인은 C4에서 함께 바꾼다.
   */
  authBackend: "dbjson" | "supabase";
  /** 서버 전용 Supabase 설정 (AUTH_BACKEND=supabase일 때 관리자 API가 사용). 브라우저로 보내지 않는다. */
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** 학생·교수자 token 확인과 그 사용자 권한의 조회에 쓰는 공개 키 (RLS 적용) */
  supabaseAnonKey: string;
};

/** process.env(또는 Vite loadEnv 결과)에서 설정을 읽는다. VITE_ 이름도 함께 받는다. */
export const readApiEnv = (env: Record<string, string | undefined>): ApiEnv => ({
  googleClientId: (env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || "").trim(),
  adminId: (env.ADMIN_ID || "").trim(),
  adminPassword: env.ADMIN_PASSWORD || "",
  adminEmail: normalizeEmail(env.ADMIN_EMAIL || ""),
  initialInstructorEmail: normalizeEmail(env.INITIAL_INSTRUCTOR_EMAIL || env.VITE_INITIAL_INSTRUCTOR_EMAIL || ""),
  sessionSecret: env.SESSION_SECRET || "",
  anthropicApiKey: (env.ANTHROPIC_API_KEY || "").trim(),
  authBackend: (env.AUTH_BACKEND || "").trim().toLowerCase() === "supabase" ? "supabase" : "dbjson",
  supabaseUrl: (env.SUPABASE_URL || "").trim(),
  supabaseServiceRoleKey: (env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  supabaseAnonKey: (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim(),
});

const COOKIE = "zhuiju_sid";
const SESSION_DAYS = 30;

/** name: Google 계정 이름 (교수자 표시용. 회원은 회원정보의 성명을 쓴다) */
type Session = { k: "admin" } | { k: "google"; id: string; email: string; name?: string };

const AVATAR_COLORS = ["#A9D6F5", "#F6D3DF", "#C9EBDD", "#DCD5F7", "#FBE3B5"];
const avatarColorFor = (email: string) => {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const nowIso = () => new Date().toISOString();

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const PROFILE_FIELDS: (keyof MemberProfileInput)[] = [
  "name",
  "university",
  "department",
  "grade",
  "studentId",
  "email",
  "phone",
];

/** 회원정보 입력값 정리 (모두 필수, 길이 제한) */
const cleanProfile = (body: unknown): MemberProfileInput | null => {
  const src = (body ?? {}) as Record<string, unknown>;
  const out = {} as MemberProfileInput;
  for (const f of PROFILE_FIELDS) {
    const v = typeof src[f] === "string" ? (src[f] as string).trim().slice(0, 100) : "";
    if (!v) return null;
    out[f] = v;
  }
  out.email = normalizeEmail(out.email);
  if (!isValidEmail(out.email)) return null;
  return out;
};

export const createApi = (db: Db, env: ApiEnv) => {
  // supabase(Vercel처럼 서버 파일이 남지 않는 환경): 관리자 세션 서명 키는 SESSION_SECRET 환경변수만 쓴다.
  // db.json에 만든 키는 재시작·인스턴스마다 달라질 수 있어 쓰지 않는다. 없으면 관리자 로그인을 막는다.
  const secret = env.sessionSecret || (env.authBackend === "supabase" ? "" : db.data.sessionSecret);
  const sign = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

  // AUTH_BACKEND=supabase: 관리자 API의 회원·교수자·과목·분반·수강을 Supabase(service-role, 서버 전용)로 처리한다.
  const supabaseConfigured = !!(env.supabaseUrl && env.supabaseServiceRoleKey);
  if (env.authBackend === "supabase" && !supabaseConfigured) {
    console.error("AUTH_BACKEND=supabase인데 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없어요. 관리자 데이터 API는 503을 돌려줘요.");
  }
  const supa: SupabaseAdminStore | null =
    env.authBackend === "supabase" && supabaseConfigured
      ? createSupabaseAdminStore(createSupabaseAdminClient(env.supabaseUrl, env.supabaseServiceRoleKey))
      : null;
  const useSupabase = env.authBackend === "supabase";
  /** Supabase 관리자 작업 실행 + 오류를 기존 API 형태({ error })로 돌려준다. */
  const viaSupabase = async (res: Response, work: (store: SupabaseAdminStore) => Promise<unknown>) => {
    if (!supa) {
      return res.status(503).json({ error: "Supabase 서버 설정(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)이 없어요." });
    }
    try {
      res.json(await work(supa));
      // 관리자가 승인·분반·배정·회원을 바꿨을 수 있으므로 학생·교수자 권한을 다시 읽게 한다.
      userResolver?.clear();
    } catch (err) {
      if (err instanceof AdminDataError) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error("[supabase-admin]", err instanceof Error ? err.message : "unknown error");
      res.status(500).json({ error: "Supabase 처리 중 오류가 났어요." });
    }
  };
  const adminLabel = (req: Request & { user?: SessionUser }) => req.user?.email || req.user?.name || "관리자";
  // AUTH_BACKEND=supabase: 학생·교수자는 Supabase access token(Bearer)으로만 확인한다. (서버 세션을 만들지 않는다)
  const userResolver =
    useSupabase && env.supabaseUrl && env.supabaseAnonKey ? createSupabaseUserResolver(env.supabaseUrl, env.supabaseAnonKey) : null;
  if (useSupabase && !userResolver) console.error("AUTH_BACKEND=supabase인데 SUPABASE_URL 또는 SUPABASE_ANON_KEY가 없어 학생·교수자 로그인을 확인할 수 없어요.");

  const readSession = (req: Request): Session | null => {
    const raw = (req.headers.cookie ?? "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (!raw || !secret) return null;
    const [payload, sig] = raw.split(".");
    if (!payload || !sig || !safeEqual(sign(payload), sig)) return null;
    try {
      const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session & { exp: number };
      return s.exp > Date.now() ? s : null;
    } catch {
      return null;
    }
  };

  const setSession = (req: Request, res: Response, s: Session | null) => {
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    const attrs = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
    if (!s) {
      res.setHeader("Set-Cookie", `${COOKIE}=; ${attrs}; Max-Age=0`);
      return;
    }
    const maxAge = SESSION_DAYS * 24 * 3600;
    const payload = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + maxAge * 1000 })).toString("base64url");
    res.setHeader("Set-Cookie", `${COOKIE}=${payload}.${sign(payload)}; ${attrs}; Max-Age=${maxAge}`);
  };

  const instructorEmails = () => [
    ...(env.initialInstructorEmail ? [env.initialInstructorEmail] : []),
    ...Object.keys(db.data.instructors),
  ];

  /** 세션 → 화면에 쓸 사용자. 관리자가 회원을 삭제했으면 null */
  const sessionUser = (s: Session | null): SessionUser | null => {
    if (!s) return null;
    if (s.k === "admin") {
      return {
        id: "admin",
        name: "관리자",
        email: env.adminEmail,
        picture: null,
        avatarColor: "#DCD5F7",
        provider: "admin",
        role: "instructor",
        member: null,
      };
    }
    if (instructorEmails().includes(s.email)) {
      return {
        id: s.id,
        name: s.name || s.email.split("@")[0],
        email: s.email,
        picture: null,
        avatarColor: avatarColorFor(s.email),
        provider: "google",
        role: "instructor",
        member: null,
      };
    }
    const m = db.data.members[s.id];
    if (!m) return null;
    return {
      id: m.id,
      name: m.name || m.googleEmail,
      email: m.email || m.googleEmail,
      picture: m.picture ?? null,
      avatarColor: m.avatarColor,
      provider: "google",
      role: "learner",
      member: m,
    };
  };

  type Authed = Request & { user?: SessionUser; access?: SupabaseAccess };

  /**
   * 요청자 확인. dbjson: 기존 쿠키 세션 / supabase: 관리자는 기존 쿠키, 학생·교수자는 Bearer token만.
   * supabase에서는 이전 Google 쿠키 세션을 받지 않는다.
   */
  const withUser = async (req: Authed, _res: Response, next: NextFunction) => {
    try {
      const s = readSession(req);
      if (!useSupabase) req.user = sessionUser(s) ?? undefined;
      else if (s?.k === "admin") req.user = sessionUser(s) ?? undefined;
      else {
        const token = bearerToken(req.headers.authorization);
        const access = token && userResolver ? await userResolver.resolve(token, req.path === "/auth/me") : null;
        if (access) {
          req.access = access;
          req.user = sessionUserFromAccess(access);
        }
      }
    } catch (err) {
      console.error("[auth]", err instanceof Error ? err.message : "unknown error");
      req.user = undefined;
      req.access = undefined;
    }
    next();
  };
  /** 교수자 또는 관리자 (세션 role이 instructor) */
  const isStaff = (req: Authed) => req.user?.role === "instructor";
  /** 관리자 아이디·비밀번호로 로그인한 관리자 */
  const isPlatformAdmin = (req: Authed) => req.user?.provider === "admin";
  const isApproved = (req: Authed) => isStaff(req) || req.user?.member?.status === "approved";

  /** 교수자·관리자만 (과목별 권한은 canManageCourse로 따로 확인한다) */
  const requireStaff = (req: Authed, res: Response, next: NextFunction) =>
    isStaff(req) ? next() : res.status(req.user ? 403 : 401).json({ error: "교수자·관리자만 사용할 수 있어요." });
  /** 관리자 아이디·비밀번호 로그인(관리자 모드)만. Google 교수자는 안 된다. */
  const requireAdminMode = (req: Authed, res: Response, next: NextFunction) =>
    isPlatformAdmin(req)
      ? next()
      : res.status(req.user ? 403 : 401).json({ error: "관리자 모드에서만 사용할 수 있어요." });
  const requireLogin =(req: Authed, res: Response, next: NextFunction) =>
    req.user ? next() : res.status(401).json({ error: "로그인이 필요해요." });

  /** 학습자·교수자에게 보여도 되는 과목: 운영 중인 과목만 (기존 자료 과목은 관리자만) */
  const isOpenCourse = (c: Course | undefined): c is Course => !!c && c.status === "active";
  /**
   * 교수자(Google)가 맡은 분반 — sectionInstructors의 sectionId + email, 운영 과목의 분반만.
   * activeOnly: 운영 중인 분반만 (학습자료 편집 권한). 비활성 분반도 수강생 기록은 계속 볼 수 있다.
   */
  const instructorSections = (email: string, activeOnly = false) =>
    sectionIdsForInstructor(db.data.sectionInstructors, email)
      .map((id) => db.data.sections[id])
      .filter((s) => !!s && isOpenCourse(db.data.courses[s.courseId]) && (!activeOnly || s.status === "active"));
  /** 요청자가 운영하는 분반 id — 수강생·진도·퀴즈 권한의 기준 (관리자: 모든 분반, 교수자: 배정된 분반, 과목을 주면 그 과목만) */
  const managedSectionIds = (req: Authed, courseId?: string) =>
    useSupabase && !isPlatformAdmin(req)
      ? new Set(
          (isStaff(req) ? (req.access?.mySections ?? []) : [])
            .filter((s) => !courseId || s.course_id === courseId)
            .map((s) => String(s.id)),
        )
      : new Set(
          (isPlatformAdmin(req) ? Object.values(db.data.sections) : isStaff(req) ? instructorSections(req.user!.email) : [])
            .filter((s) => !courseId || s.courseId === courseId)
            .map((s) => s.id),
        );
  /**
   * 과목 공통 학습자료 권한: 관리자는 모든 과목(기존 자료 포함),
   * 교수자는 그 과목에 운영 중인 담당 분반이 하나라도 있을 때. (분반이 달라도 같은 과목이면 같은 15주를 함께 관리한다)
   */
  const canManageCourse = (req: Authed, courseId: string) =>
    isPlatformAdmin(req)
      ? !!db.data.courses[courseId]
      : useSupabase
        ? isStaff(req) && (req.access?.mySections ?? []).some((s) => s.course_id === courseId && s.status === "active")
        : isStaff(req) && instructorSections(req.user!.email, true).some((s) => s.courseId === courseId);
  /** 교수자가 수강생 기록을 볼 수 있는 (과목, 학생) 쌍: 담당 분반 수강생 × 그 분반의 과목 */
  const visibleStudentPairs = (req: Authed) =>
    useSupabase && !isPlatformAdmin(req)
      ? new Set(
          (req.access?.enrollments ?? [])
            .filter((e) => managedSectionIds(req).has(String(e.section_id)))
            .map((e) => `${e.course_id}::${e.user_id}`),
        )
      : new Set(
      Object.values(db.data.enrollments)
        .filter((e) => e.sectionId && managedSectionIds(req).has(e.sectionId))
        .map((e) => `${e.courseId}::${e.userId}`),
    );
  /** 학습자가 수강 중인 운영 과목 id (비활성 분반이어도 이미 등록한 수강은 유지된다) */
  const learnerCourseIds = (userId: string) =>
    new Set(
      enrollmentsForUser(db.data.enrollments, userId)
        .filter((e) => !!e.sectionId)
        .map((e) => e.courseId)
        .filter((id) => isOpenCourse(db.data.courses[id])),
    );
  /** 요청한 학습자가 수강 중인 운영 과목 (supabase: 승인된 학생의 Supabase 수강 기록) */
  const learnerCourseIdsFor = (req: Authed) =>
    useSupabase ? (req.access?.learnerCourseIds ?? new Set<string>()) : req.user ? learnerCourseIds(req.user.id) : new Set<string>();
  /** Supabase 사용자 경로 실행 + 오류를 기존 API 형태로 */
  const viaUser = async (req: Authed, res: Response, work: (a: SupabaseAccess) => Promise<unknown>) => {
    if (!req.access) return res.status(401).json({ error: "로그인이 필요해요." });
    try {
      res.json(await work(req.access));
    } catch (err) {
      if (err instanceof AdminDataError) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error("[supabase-user]", err instanceof Error ? err.message : "unknown error");
      res.status(500).json({ error: "Supabase 처리 중 오류가 났어요." });
    }
  };
  /**
   * supabase 저장 전 Express 검사 (기존 화면과 같은 문구): 과목·주차 범위·공개 조건.
   * 권한·주차 중복·동시 편집(version)은 저장 함수(save_lesson·admin_save_lesson)가 최종 확인한다.
   */
  const lessonSaveProblem = (lesson: Lesson, prev: Lesson | null, weekCount: number | null): string | null => {
    if (weekCount === null) return "없는 과목이에요.";
    if (!Number.isInteger(lesson.week) || lesson.week < 1 || lesson.week > weekCount) return `주차는 1~${weekCount}주차 중에서 골라 주세요.`;
    const problems = lessonPublishProblems(lesson);
    const alreadyInvalid = !!prev && prev.status === lesson.status && lessonPublishProblems(prev).length > 0;
    return problems.length > 0 && !alreadyInvalid ? problems[0] : null;
  };
  const courseSummary = ({ code: _code, ...c }: Course): CourseSummary => c;
  /** 분반 담당 교강사 (이름은 교강사가 로그인한 적이 있을 때만) */
  const sectionTeachers = (sectionId: string): SectionTeacher[] =>
    instructorsForSection(db.data.sectionInstructors, sectionId).map((email) => {
      const name = db.data.instructorNames[email];
      return name ? { email, name } : { email };
    });

  const api = express.Router();
  api.use(express.json({ limit: "5mb" }));
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  api.use(withUser);

  api.get("/health", (_req, res) => res.json({ ok: true }));

  api.get("/config", (_req, res) => {
    const body: PublicConfig = {
      googleClientId: env.googleClientId,
      adminLoginEnabled: !!(env.adminId && env.adminPassword && secret),
      authBackend: env.authBackend,
    };
    res.json(body);
  });

  /* ───────── 로그인 ───────── */

  api.get("/auth/me", (req: Authed, res) => {
    const s = readSession(req);
    if (s && !req.user) setSession(req, res, null); // 삭제된 회원의 쿠키 정리
    if (req.user?.member && !useSupabase) {
      req.user.member.lastSeenAt = nowIso();
      db.save();
    }
    res.json({ user: req.user ?? null });
  });

  api.post("/auth/google", async (req: Authed, res) => {
    if (useSupabase) return res.status(400).json({ error: "이 서버는 Supabase Google 로그인을 사용해요." });
    const token = typeof req.body?.accessToken === "string" ? req.body.accessToken : "";
    if (!token) return res.status(400).json({ error: "토큰이 없어요." });
    try {
      // 1) 이 앱의 Client ID로 발급된 토큰인지 확인
      if (env.googleClientId) {
        const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
        const t = (await info.json()) as { aud?: string; azp?: string };
        if (!info.ok || (t.aud !== env.googleClientId && t.azp !== env.googleClientId)) {
          return res.status(401).json({ error: "Google 로그인 확인에 실패했어요." });
        }
      }
      // 2) 계정 정보
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return res.status(401).json({ error: "Google 로그인 확인에 실패했어요." });
      const info = (await r.json()) as {
        sub?: string;
        name?: string;
        email?: string;
        email_verified?: boolean;
        picture?: string;
      };
      if (!info.sub || !info.email) return res.status(401).json({ error: "Google 계정 정보를 받지 못했어요." });
      if (info.email_verified === false) {
        return res.status(403).json({ error: "이메일이 확인된 Google 계정으로만 로그인할 수 있어요." });
      }
      const email = normalizeEmail(info.email);
      const session: Session = { k: "google", id: info.sub, email, name: info.name?.trim().slice(0, 100) || undefined };

      // 교강사: 학생 ‘내 강의’에 담당 교강사 이름을 보여주기 위해 Google 이름을 기록한다.
      if (instructorEmails().includes(email) && session.name && db.data.instructorNames[email] !== session.name) {
        db.data.instructorNames[email] = session.name;
        db.save();
      }
      // 교수자 이메일이 아니면 회원으로 등록 (처음이면 승인 대기)
      if (!instructorEmails().includes(email)) {
        const now = nowIso();
        const prev = db.data.members[info.sub];
        db.data.members[info.sub] = prev
          ? { ...prev, googleEmail: email, picture: info.picture ?? prev.picture ?? null, lastSeenAt: now }
          : {
              id: info.sub,
              googleEmail: email,
              name: info.name ?? "",
              university: "",
              department: "",
              grade: "",
              studentId: "",
              email,
              phone: "",
              avatarColor: avatarColorFor(email),
              picture: info.picture ?? null,
              status: "pending",
              profileCompleted: false,
              firstSeenAt: now,
              lastSeenAt: now,
              approvedAt: null,
            };
        db.save();
      }
      setSession(req, res, session);
      res.json({ user: sessionUser(session) });
    } catch {
      res.status(502).json({ error: "Google 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." });
    }
  });

  api.post("/auth/admin", (req, res) => {
    if (!env.adminId || !env.adminPassword) {
      return res.status(503).json({ error: "관리자 계정이 설정되지 않았어요. (ADMIN_ID, ADMIN_PASSWORD 환경변수)" });
    }
    if (!secret) return res.status(503).json({ error: "관리자 세션 설정이 없어요. (SESSION_SECRET 환경변수)" });
    const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!safeEqual(id, env.adminId) || !safeEqual(password, env.adminPassword)) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 맞지 않아요." });
    }
    const session: Session = { k: "admin" };
    setSession(req, res, session);
    res.json({ user: sessionUser(session) });
  });

  api.post("/auth/logout", (req, res) => {
    setSession(req, res, null);
    res.json({ ok: true });
  });

  /** 구글 로그인 후 회원정보 입력 (본인) */
  api.put("/me/profile", requireLogin, (req: Authed, res) => {
    if (useSupabase) return res.status(400).json({ error: "회원정보는 Supabase(complete_my_profile)로 저장해요." });
    const m = req.user?.member;
    if (!m) return res.status(400).json({ error: "회원 계정이 아니에요." });
    const profile = cleanProfile(req.body);
    if (!profile) return res.status(400).json({ error: "모든 항목을 올바르게 입력해 주세요." });
    db.data.members[m.id] = { ...m, ...profile, profileCompleted: true };
    db.save();
    res.json({ user: sessionUser(readSession(req)) });
  });

  /* ───────── 회원 관리 (관리자) ───────── */

  // 회원 목록·승인·수정·삭제는 관리자만. 교수자는 /courses/:id/students로 담당 과목 수강생만 본다.
  api.get("/members", requireAdminMode, (_req, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.listMembers());
    res.json(Object.values(db.data.members).sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)));
  });

  api.patch("/members/:id", requireAdminMode, (req, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.updateMember(req.params.id, (req.body ?? {}) as Record<string, unknown>));
    const m = db.data.members[req.params.id];
    if (!m) return res.status(404).json({ error: "회원을 찾을 수 없어요." });
    const body = (req.body ?? {}) as Partial<LearnerProfile>;
    const next: LearnerProfile = { ...m };
    for (const f of PROFILE_FIELDS) {
      if (typeof body[f] === "string") next[f] = (body[f] as string).trim().slice(0, 100);
    }
    next.email = normalizeEmail(next.email);
    if (body.status === "approved" || body.status === "pending") {
      next.status = body.status;
      next.approvedAt = body.status === "approved" ? (m.approvedAt ?? nowIso()) : null;
    }
    db.data.members[m.id] = next;
    db.save();
    res.json(next);
  });

  api.delete("/members/:id", requireAdminMode, (req, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.deleteMember(req.params.id));
    const id = req.params.id;
    delete db.data.members[id];
    for (const [k, p] of Object.entries(db.data.progress)) if (p.userId === id) delete db.data.progress[k];
    for (const [k, e] of Object.entries(db.data.enrollments)) if (e.userId === id) delete db.data.enrollments[k];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 강의자료 ───────── */

  /**
   * ?course={courseId}: 그 과목의 강의자료만 (없으면 모든 과목)
   * 관리자: 전부. 교수자: 담당 과목의 강의자료 전부(준비 중 포함).
   * 학습자: 수강 중인 과목의 공개 강의자료만 (기존 자료 과목 제외). 로그인 전: 없음.
   * 준비 중인 주차의 목록은 학습 콘텐츠 없이 /courses/:id/curriculum으로 본다.
   */
  api.get("/lessons", (req: Authed, res) => {
    const courseId = typeof req.query.course === "string" ? req.query.course : "";
    // supabase: 관리자는 service-role(이전 자료 포함), 교수자·학생은 본인 token으로 RLS 범위만. 로그인 전: 없음.
    if (useSupabase) {
      if (isPlatformAdmin(req)) return void viaSupabase(res, (st) => st.listLessons(courseId));
      if (!req.access) return res.json([]);
      return void viaUser(req, res, (a) => listLessonsFor(a, courseId));
    }
    const all = courseId ? lessonsForCourse(db.data.lessons, courseId) : Object.values(db.data.lessons);
    if (isStaff(req)) return res.json(all.filter((l) => canManageCourse(req, l.courseId)));
    const mine = learnerCourseIdsFor(req);
    res.json(all.filter((l) => l.status === "published" && mine.has(l.courseId)));
  });

  /** 저장: 관리자는 모든 과목, 교수자는 담당 과목만 (원래 과목과 저장할 과목 모두 담당이어야 한다) */
  api.put("/lessons/:id", requireStaff, (req: Authed, res) => {
    const lesson = req.body as Lesson;
    if (!lesson || lesson.id !== req.params.id || typeof lesson.week !== "number") {
      return res.status(400).json({ error: "강의자료 형식이 올바르지 않아요." });
    }
    // supabase: 기존 Express 검사 후 저장 함수로 저장. 기존 학습자료는 lesson.version(편집을 시작한 버전)이 맞아야 저장된다.
    if (useSupabase) {
      if (isPlatformAdmin(req)) {
        return void viaSupabase(res, async (st) => {
          const prev = await st.getLesson(lesson.id);
          const courseId = lesson.courseId || prev?.courseId || LEGACY_COURSE_ID;
          const problem = lessonSaveProblem(lesson, prev, (await st.getCourse(courseId))?.weekCount ?? null);
          if (problem) throw new AdminDataError(400, problem);
          return st.saveLesson({ ...lesson, courseId }, adminLabel(req));
        });
      }
      return void viaUser(req, res, async (a) => {
        const prev = await lessonFor(a, lesson.id);
        const courseId = lesson.courseId || prev?.courseId || LEGACY_COURSE_ID;
        const course = a.courses.get(courseId);
        if (!course || !canManageCourse(req, courseId)) throw new AdminDataError(403, "담당 강의의 학습자료만 저장할 수 있어요.");
        const problem = lessonSaveProblem(lesson, prev, Number(course.week_count));
        if (problem) throw new AdminDataError(400, problem);
        return saveLessonAs(a, { ...lesson, courseId });
      });
    }
    const prev = db.data.lessons[lesson.id];
    // 과목 정보가 없는 이전 화면의 저장은 원래 과목(없으면 기존 자료)으로 둔다.
    const courseId = lesson.courseId || prev?.courseId || LEGACY_COURSE_ID;
    if (!db.data.courses[courseId]) return res.status(400).json({ error: "없는 과목이에요." });
    if (!canManageCourse(req, courseId) || (prev && !canManageCourse(req, prev.courseId))) {
      return res.status(403).json({ error: "담당 강의의 학습자료만 저장할 수 있어요." });
    }
    const course = db.data.courses[courseId];
    if (!Number.isInteger(lesson.week) || lesson.week < 1 || lesson.week > course.weekCount) {
      return res.status(400).json({ error: `주차는 1~${course.weekCount}주차 중에서 골라 주세요.` });
    }
    // 같은 과목의 같은 주차에는 강의자료 하나만. 이미 그 주차에 있던 강의자료(이전 자료의 중복 포함)를 그대로 저장하는 것은 막지 않는다.
    const sameSlot = prev?.courseId === courseId && prev.week === lesson.week;
    const taken = Object.values(db.data.lessons).some(
      (l) => l.id !== lesson.id && l.courseId === courseId && l.week === lesson.week,
    );
    if (taken && !sameSlot) {
      return res.status(409).json({ error: `${lesson.week}주차에는 이미 학습자료가 있어요. 다른 주차를 골라 주세요.` });
    }
    // 공개 조건은 편집 화면과 같다. 이미 조건에 맞지 않던 이전 자료가 같은 상태로 다시 저장되는 것은 막지 않는다.
    const problems = lessonPublishProblems(lesson);
    const alreadyInvalid = prev?.status === lesson.status && lessonPublishProblems(prev).length > 0;
    if (problems.length > 0 && !alreadyInvalid) return res.status(400).json({ error: problems[0] });
    const saved = { ...lesson, courseId, updatedAt: nowIso() };
    db.data.lessons[lesson.id] = saved;
    db.save();
    res.json(saved);
  });

  /** 강의자료는 과목의 모든 분반이 함께 쓰므로 삭제는 관리자만 할 수 있다. 교수자는 ‘준비 중’으로 바꿔 비공개로 둔다. */
  api.delete("/lessons/:id", requireAdminMode, (req: Authed, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.deleteLesson(req.params.id));
    if (!db.data.lessons[req.params.id]) return res.json({ ok: true });
    delete db.data.lessons[req.params.id];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 학습 기록 ───────── */

  /**
   * ?course={courseId}: 그 과목 강의자료의 기록만 (과목은 강의자료의 courseId로 찾는다)
   * 관리자: 전부. 교수자: 담당 분반 수강생의, 그 분반 과목 강의자료 기록만. 학습자: 본인 기록만.
   */
  api.get("/progress", requireLogin, (req: Authed, res) => {
    const courseId = typeof req.query.course === "string" ? req.query.course : "";
    // supabase: 관리자는 service-role 전체, 학생·교수자는 본인 token으로 RLS 범위만 (학생 본인 / 교수자 운영 중 담당 분반 수강생)
    if (useSupabase) {
      if (isPlatformAdmin(req)) return void viaSupabase(res, (st) => st.listProgress(courseId));
      return void viaUser(req, res, (a) => listProgressFor(a, courseId));
    }
    const all = courseId
      ? progressForCourse(db.data.progress, db.data.lessons, courseId)
      : Object.values(db.data.progress);
    if (isPlatformAdmin(req)) return res.json(all);
    if (isStaff(req)) {
      const pairs = visibleStudentPairs(req);
      const courseOf = (p: LessonProgress) => db.data.lessons[p.lessonId]?.courseId ?? "";
      return res.json(all.filter((p) => pairs.has(`${courseOf(p)}::${p.userId}`)));
    }
    res.json(all.filter((p) => p.userId === req.user!.id));
  });

  api.put("/progress", requireLogin, (req: Authed, res) => {
    const p = req.body as LessonProgress;
    if (!isApproved(req) || isStaff(req)) return res.status(403).json({ error: "승인된 학습자만 기록돼요." });
    if (!p || p.userId !== req.user!.id || typeof p.lessonId !== "string") {
      return res.status(400).json({ error: "학습 기록 형식이 올바르지 않아요." });
    }
    // supabase: save_my_progress — 사용자는 token의 사용자, 승인·수강 과목·published 확인은 DB 함수가 최종 판단한다.
    if (useSupabase) return void viaUser(req, res, (a) => saveMyProgress(a, p));
    // 수강 중인 과목의 공개 강의자료만 기록한다.
    const lesson = db.data.lessons[p.lessonId];
    if (!lesson || lesson.status !== "published" || !learnerCourseIdsFor(req).has(lesson.courseId)) {
      return res.status(403).json({ error: "수강 중인 강의의 학습만 기록돼요." });
    }
    db.data.progress[`${p.userId}::${p.lessonId}`] = p;
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 피드백 (관리자) ───────── */

  // 피드백은 전체 회원 정보를 쓰므로 관리자만. supabase: feedback_drafts(service-role 전용)에 저장한다.
  // Gmail 발송 토큰은 브라우저 메모리에서만 쓰고 서버·초안에 저장하지 않는다.
  api.get("/feedback", requireAdminMode, (_req, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.listFeedback());
    res.json(Object.values(db.data.feedback));
  });

  api.put("/feedback/:id", requireAdminMode, (req, res) => {
    const draft = req.body as FeedbackDraft;
    if (!draft || draft.id !== req.params.id) return res.status(400).json({ error: "형식이 올바르지 않아요." });
    if (useSupabase) return void viaSupabase(res, (st) => st.saveFeedback(draft));
    const saved = { ...draft, updatedAt: nowIso() };
    db.data.feedback[draft.id] = saved;
    db.save();
    res.json(saved);
  });

  api.delete("/feedback/:id", requireAdminMode, (req, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.deleteFeedback(req.params.id));
    delete db.data.feedback[req.params.id];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 피드백 (교수자: 운영 중인 담당 분반 수강생) ───────── */

  /**
   * 교수자가 피드백을 쓸 수 있는 범위: 이 과목에서 운영 중인(active) 담당 분반의 수강생 × 이 과목 학습자료.
   * sectionId를 주면 그 분반만. 관리자 모드는 이 경로를 쓰지 않는다. (관리자 화면에는 학생 피드백이 없다)
   * supabase: 담당 분반·수강생·학습자료는 교수자 token(RLS·section_students)으로 확인하고, 초안은 그 범위만 service-role로 읽고 쓴다.
   */
  const feedbackScope = async (req: Authed, courseId: string, sectionId = "") => {
    if (!isStaff(req) || isPlatformAdmin(req)) throw new AdminDataError(403, "담당 교강사만 학생 피드백을 쓸 수 있어요.");
    if (useSupabase) {
      const a = req.access;
      if (!a) throw new AdminDataError(401, "로그인이 필요해요.");
      const mine = a.mySections.filter(
        (s) => s.course_id === courseId && s.status === "active" && (!sectionId || String(s.id) === sectionId),
      );
      if (mine.length === 0) throw new AdminDataError(404, "운영 중인 담당 분반이 아니에요.");
      const students = await studentsOfSections(a, mine);
      return { emails: new Map(students.map((s) => [s.userId, s.email])), lessonIds: await lessonIdsFor(a, courseId) };
    }
    const mine = new Set(
      instructorSections(req.user!.email, true)
        .filter((s) => s.courseId === courseId && (!sectionId || s.id === sectionId))
        .map((s) => s.id),
    );
    if (mine.size === 0) throw new AdminDataError(404, "운영 중인 담당 분반이 아니에요.");
    const enrolled = Object.values(db.data.enrollments).filter((e) => e.sectionId && mine.has(e.sectionId));
    return {
      emails: new Map(enrolled.map((e) => [e.userId, db.data.members[e.userId]?.email || e.email])),
      lessonIds: new Set(lessonsForCourse(db.data.lessons, courseId).map((l) => l.id)),
    };
  };
  const viaFeedback = async (res: Response, work: () => Promise<unknown>) => {
    if (useSupabase && !supa) {
      return res.status(503).json({ error: "Supabase 서버 설정(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)이 없어요." });
    }
    try {
      res.json(await work());
    } catch (err) {
      if (err instanceof AdminDataError) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error("[feedback]", err instanceof Error ? err.message : "unknown error");
      res.status(500).json({ error: "피드백을 처리하지 못했어요." });
    }
  };

  /** 담당 분반 수강생의 이 과목 피드백 초안. ?section={sectionId}: 그 분반만. */
  api.get("/courses/:id/feedback", requireLogin, (req: Authed, res) => {
    const sectionId = typeof req.query.section === "string" ? req.query.section : "";
    void viaFeedback(res, async () => {
      const { emails, lessonIds } = await feedbackScope(req, req.params.id, sectionId);
      if (useSupabase) return supa!.listFeedbackFor([...emails.keys()], [...lessonIds]);
      return Object.values(db.data.feedback)
        .filter((d) => emails.has(d.learnerId) && lessonIds.has(d.lessonId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  });

  /** 피드백 초안 저장. 학생·학습자료가 범위 안이어야 하고, 이미 있는 초안의 학생·학습자료는 바꿀 수 없다. */
  api.put("/courses/:id/feedback/:fid", requireLogin, (req: Authed, res) => {
    const draft = req.body as FeedbackDraft;
    if (!draft || draft.id !== req.params.fid || feedbackProblem(draft)) {
      return res.status(400).json({ error: "형식이 올바르지 않아요." });
    }
    void viaFeedback(res, async () => {
      const { emails, lessonIds } = await feedbackScope(req, req.params.id);
      if (!emails.has(draft.learnerId) || !lessonIds.has(draft.lessonId)) {
        throw new AdminDataError(403, "운영 중인 담당 분반 학생의 이 강의 학습자료에만 피드백을 쓸 수 있어요.");
      }
      const prev = useSupabase ? await supa!.getFeedback(draft.id) : (db.data.feedback[draft.id] ?? null);
      if (prev && (prev.learnerId !== draft.learnerId || prev.lessonId !== draft.lessonId)) {
        throw new AdminDataError(403, "다른 학생·학습자료의 피드백은 바꿀 수 없어요.");
      }
      // 받는 사람은 등록된 학생 이메일로 고정한다.
      const next: FeedbackDraft = { ...draft, to: emails.get(draft.learnerId) ?? "" };
      if (useSupabase) return supa!.saveFeedback(next);
      const saved = { ...next, updatedAt: nowIso() };
      db.data.feedback[draft.id] = saved;
      db.save();
      return saved;
    });
  });

  /* ───────── 교수자 이메일 (관리자) ───────── */

  api.get("/instructors", requireAdminMode, (_req, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.listInstructors());
    const initial = env.initialInstructorEmail;
    const local = Object.values(db.data.instructors).filter((r) => r.email !== initial);
    res.json(initial ? [{ email: initial, source: "env", addedBy: null, addedAt: null }, ...local] : local);
  });

  api.post("/instructors", requireAdminMode, (req: Authed, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.addInstructor(req.body?.email, adminLabel(req)));
    const email = normalizeEmail(typeof req.body?.email === "string" ? req.body.email : "");
    if (!isValidEmail(email)) return res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
    if (email !== env.initialInstructorEmail && !db.data.instructors[email]) {
      db.data.instructors[email] = {
        email,
        source: "local",
        addedBy: req.user!.email || req.user!.name,
        addedAt: nowIso(),
      };
      db.save();
    }
    res.json({ ok: true });
  });

  api.delete("/instructors/:email", requireAdminMode, (req, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.removeInstructor(req.params.email));
    delete db.data.instructors[normalizeEmail(req.params.email)];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── AI 학습 콘텐츠 생성 (본인 API 키 연결) ───────── */

  // supabase: 키는 서버 환경변수 ANTHROPIC_API_KEY만 쓴다. (DB·Supabase·Vault·db.json에 저장하지 않는다)
  const aiKey = () => (useSupabase ? env.anthropicApiKey : db.data.anthropicApiKey || env.anthropicApiKey);
  const ENV_ONLY_KEY = "Supabase 서버에서는 화면에서 API 키를 저장하지 않아요. 서버 환경변수 ANTHROPIC_API_KEY로 설정해 주세요.";
  /**
   * AI 사용 권한. supabase: 관리자 또는 운영 중인 담당 분반(Supabase 배정)이 있는 교수자만.
   * 키 설정 여부보다 먼저 확인해, 권한 없는 사용자는 키가 있는지 알 수 없게 한다. dbjson: 기존대로 교수자·관리자.
   */
  const requireAiUser = (req: Authed, res: Response, next: NextFunction) => {
    if (!useSupabase) return requireStaff(req, res, next);
    const assigned = isStaff(req) && (req.access?.mySections ?? []).some((s) => s.status === "active");
    if (isPlatformAdmin(req) || assigned) return next();
    res.status(req.user ? 403 : 401).json({ error: "AI 생성은 관리자 또는 운영 중인 담당 분반이 있는 교수자만 사용할 수 있어요." });
  };

  api.get("/ai/status", requireAiUser, (_req, res) => {
    const key = aiKey();
    res.json({
      connected: !!key,
      source: useSupabase ? (key ? "env" : null) : db.data.anthropicApiKey ? "app" : env.anthropicApiKey ? "env" : null,
      // supabase: 설정 여부만 알려 주고 키의 어떤 부분도 내려보내지 않는다.
      hint: key && !useSupabase ? `…${key.slice(-4)}` : null,
      model: AI_MODEL,
    });
  });

  // 키 연결·해제는 관리자 모드에서만. 키 값은 저장만 하고 다시 내려보내지 않는다. (supabase: 환경변수만, 화면 저장 없음)
  api.put("/ai/key", requireAdminMode, async (req, res) => {
    if (useSupabase) return res.status(400).json({ error: ENV_ONLY_KEY });
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!apiKey.startsWith("sk-ant-")) return res.status(400).json({ error: "Anthropic API 키는 sk-ant- 로 시작해요." });
    try {
      await checkAnthropicKey(apiKey);
    } catch (err) {
      return res.status(400).json({ error: aiErrorMessage(err) });
    }
    db.data.anthropicApiKey = apiKey;
    db.save();
    res.json({ ok: true });
  });

  api.delete("/ai/key", requireAdminMode, (_req, res) => {
    if (useSupabase) return res.status(400).json({ error: ENV_ONLY_KEY });
    delete db.data.anthropicApiKey;
    db.save();
    res.json({ ok: true });
  });

  api.post("/ai/draft", requireAiUser, async (req, res) => {
    const key = aiKey();
    if (!key && useSupabase) return res.status(400).json({ error: "AI 키가 설정되지 않았어요. 서버 환경변수 ANTHROPIC_API_KEY를 설정해 주세요." });
    if (!key) return res.status(400).json({ error: "연결된 API 키가 없어요. 관리자 모드에서 먼저 연결해 주세요." });
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
    if (!prompt.trim() || prompt.length > 200_000) return res.status(400).json({ error: "프롬프트가 비었거나 너무 길어요." });
    try {
      res.json(await generateDraftText(key, prompt));
    } catch (err) {
      res.status(502).json({ error: aiErrorMessage(err) });
    }
  });

  /* ───────── 과목 · 수강 등록 ───────── */

  /** 교수자·관리자용 분반 정보 */
  const sectionOverview = (s: Section): SectionOverview => ({
    ...s,
    instructors: sectionTeachers(s.id),
    enrolledCount: enrollmentsForSection(db.data.enrollments, s.id).length,
  });

  /**
   * 교수자·관리자용 과목 정보: 분반(강의코드·담당 교강사·수강생 수) + 강의자료 수.
   * 관리자는 모든 분반, 교수자는 담당 분반만 받는다.
   */
  const courseOverview = (req: Authed, c: Course): CourseOverview => {
    const lessons = lessonsForCourse(db.data.lessons, c.id);
    const mine = managedSectionIds(req, c.id);
    const sections = sectionsForCourse(db.data.sections, c.id)
      .filter((s) => mine.has(s.id))
      .map(sectionOverview);
    return {
      ...c,
      sections,
      enrolledCount: sections.reduce((n, s) => n + s.enrolledCount, 0),
      lessonCount: lessons.length,
      publishedCount: lessons.filter((l) => l.status === "published").length,
    };
  };

  /** 학습자의 과목 카드: 과목 + 내가 수강 중인 분반 (교강사 이름은 알려진 경우만) */
  const learnerCourse = (userId: string, c: Course): CourseSummary => {
    const e = enrollmentsForUser(db.data.enrollments, userId).find((x) => x.courseId === c.id && x.sectionId);
    const s = e ? db.data.sections[e.sectionId!] : undefined;
    return {
      ...courseSummary(c),
      ...(s
        ? {
            section: {
              id: s.id,
              name: s.name,
              instructorNames: sectionTeachers(s.id).flatMap((t) => (t.name ? [t.name] : [])),
            },
          }
        : {}),
    };
  };

  /**
   * 과목 목록. 관리자: 모든 과목(기존 자료 포함) / 교수자: 담당 분반이 있는 운영 과목만
   * 학습자: 수강 중인 운영 과목만 (강의코드는 보내지 않는다, 기존 자료 과목 제외)
   */
  api.get("/courses", requireLogin, (req: Authed, res) => {
    if (isPlatformAdmin(req)) {
      if (useSupabase) return void viaSupabase(res, (st) => st.listCourses());
      return res.json(Object.values(db.data.courses).map((c) => courseOverview(req, c)));
    }
    if (useSupabase) {
      return void viaUser(req, res, async (a) => {
        if (isStaff(req)) {
          const out: CourseOverview[] = [];
          for (const c of a.courses.values()) {
            const mine = a.mySections.filter((s) => s.course_id === c.id);
            if (mine.length === 0) continue;
            const sections: SectionOverview[] = [];
            for (const s of mine) {
              sections.push({
                id: String(s.id),
                courseId: String(s.course_id),
                name: String(s.name),
                code: String(s.code),
                status: s.status === "inactive" ? "inactive" : "active",
                createdAt: String(s.created_at),
                updatedAt: String(s.updated_at),
                instructors: await sectionTeachersFor(a, String(s.id)),
                enrolledCount: a.enrollments.filter((e) => e.section_id === s.id).length,
              });
            }
            // 강의자료 수: 담당 과목의 주차 목록(course_curriculum, 준비 중 포함)
            const lessons = await curriculumFor(a, String(c.id));
            out.push({
              ...courseSummaryFromRow(c),
              code: String(c.legacy_code ?? ""),
              sections,
              enrolledCount: sections.reduce((n, s) => n + s.enrolledCount, 0),
              lessonCount: lessons.length,
              publishedCount: lessons.filter((l) => l.status === "published").length,
            });
          }
          return out;
        }
        const out: CourseSummary[] = [];
        for (const id of a.learnerCourseIds) out.push(await learnerCourseCard(a, id));
        return out;
      });
    }
    const all = Object.values(db.data.courses);
    if (isStaff(req)) {
      return res.json(all.filter((c) => managedSectionIds(req, c.id).size > 0).map((c) => courseOverview(req, c)));
    }
    const mine = learnerCourseIds(req.user!.id);
    res.json(all.filter((c) => mine.has(c.id)).map((c) => learnerCourse(req.user!.id, c)));
  });

  /**
   * 과목 수강생과 학습 기록. ?section={sectionId}: 그 분반만.
   * 관리자는 모든 분반, 교수자는 담당 분반의 수강생만 받는다. 다른 분반·다른 과목 학생은 섞이지 않는다.
   * 학습 기록은 그 학생들의, 이 과목 강의자료 기록만 보낸다.
   */
  api.get("/courses/:id/students", requireLogin, (req: Authed, res) => {
    const courseId = req.params.id;
    if (useSupabase && isPlatformAdmin(req)) {
      const only = typeof req.query.section === "string" ? req.query.section : "";
      return void viaSupabase(res, (st) => st.courseStudents(courseId, only));
    }
    if (useSupabase) {
      const only = typeof req.query.section === "string" ? req.query.section : "";
      return void viaUser(req, res, async (a) => {
        const mine = isStaff(req) ? a.mySections.filter((s) => s.course_id === courseId) : [];
        if (mine.length === 0 || (only && !mine.some((s) => s.id === only))) throw new AdminDataError(404, "담당 분반이 아니에요.");
        const students = await studentsOfSections(a, only ? mine.filter((s) => s.id === only) : mine);
        const body: CourseStudents = {
          students,
          progress: await listProgressFor(a, courseId, students.map((s) => s.userId)),
        };
        return body;
      });
    }
    const mine = managedSectionIds(req, courseId);
    const only = typeof req.query.section === "string" ? req.query.section : "";
    if (mine.size === 0 || (only && !mine.has(only))) {
      return res.status(404).json({ error: "담당 분반이 아니에요." });
    }
    const enrolled = Object.values(db.data.enrollments).filter(
      (e) => e.sectionId && mine.has(e.sectionId) && (!only || e.sectionId === only),
    );
    const ids = new Set(enrolled.map((e) => e.userId));
    const body: CourseStudents = {
      students: enrolled
        .map((e) => {
          const m = db.data.members[e.userId];
          return {
            userId: e.userId,
            name: m?.name || e.name,
            email: m?.email || e.email,
            studentId: m?.studentId ?? "",
            joinedAt: e.joinedAt,
            sectionId: e.sectionId!,
            sectionName: db.data.sections[e.sectionId!]?.name ?? "",
          };
        })
        .sort((a, b) => a.sectionName.localeCompare(b.sectionName, "ko") || a.name.localeCompare(b.name, "ko")),
      progress: progressForCourse(db.data.progress, db.data.lessons, courseId).filter((p) => ids.has(p.userId)),
    };
    res.json(body);
  });

  /* ───────── 분반 관리 (관리자) ───────── */

  const cleanSectionName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 40) : "");
  /** 같은 과목 안에 같은 이름의 운영 중 분반이 있는지 */
  const activeNameTaken = (courseId: string, name: string, exceptId = "") =>
    sectionsForCourse(db.data.sections, courseId).some((s) => s.status === "active" && s.name === name && s.id !== exceptId);
  const assignTeacher = (sectionId: string, email: string, by: string) => {
    const key = sectionInstructorKey(sectionId, email);
    if (db.data.sectionInstructors[key]) return false;
    db.data.sectionInstructors[key] = { sectionId, email, assignedAt: nowIso(), assignedBy: by };
    return true;
  };

  /**
   * 새 분반 개설. 강의코드는 서버가 모든 분반·과목 코드와 겹치지 않게 만든다.
   * body: { name?: 분반명(없으면 다음 번호 제안), instructors?: 담당 교강사 이메일[] }
   * 학습자료는 만들지 않는다 — 분반은 과목의 15주 학습자료를 함께 쓴다.
   */
  api.post("/courses/:id/sections", requireAdminMode, (req: Authed, res) => {
    if (useSupabase) {
      return void viaSupabase(res, (st) => st.createSection(req.params.id, (req.body ?? {}) as Record<string, unknown>, adminLabel(req)));
    }
    const course = db.data.courses[req.params.id];
    if (!isOpenCourse(course)) return res.status(404).json({ error: "운영 중인 과목에만 분반을 만들 수 있어요." });
    const name = cleanSectionName(req.body?.name) || nextSectionName(db.data.sections, course.id);
    if (activeNameTaken(course.id, name)) return res.status(409).json({ error: `이미 운영 중인 ${name}이 있어요.` });
    const teachers = (Array.isArray(req.body?.instructors) ? (req.body.instructors as unknown[]) : [])
      .filter((x): x is string => typeof x === "string")
      .map(normalizeEmail);
    const unknown = teachers.filter((t) => !instructorEmails().includes(t));
    if (unknown.length) return res.status(400).json({ error: "교수자로 등록된 이메일만 배정할 수 있어요." });

    const now = nowIso();
    let n = 1;
    while (db.data.sections[`section-${course.id.replace(/^course-/, "")}-${String(n).padStart(2, "0")}`]) n++;
    const section: Section = {
      id: `section-${course.id.replace(/^course-/, "")}-${String(n).padStart(2, "0")}`,
      courseId: course.id,
      name,
      code: uniqueSectionCode(db.data),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    db.data.sections[section.id] = section;
    const by = req.user!.email || req.user!.name;
    for (const t of new Set(teachers)) assignTeacher(section.id, t, by);
    db.save();
    res.json(sectionOverview(section));
  });

  /** 분반 이름 변경 · 운영/비활성 전환. 비활성 분반은 신규 등록만 막고 수강·기록·배정은 그대로 둔다. */
  api.patch("/sections/:id", requireAdminMode, (req: Authed, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.updateSection(req.params.id, (req.body ?? {}) as Record<string, unknown>));
    const s = db.data.sections[req.params.id];
    if (!s) return res.status(404).json({ error: "분반을 찾을 수 없어요." });
    const name = req.body?.name === undefined ? s.name : cleanSectionName(req.body.name);
    const status = req.body?.status === "active" || req.body?.status === "inactive" ? req.body.status : s.status;
    if (!name) return res.status(400).json({ error: "분반 이름을 입력해 주세요." });
    if (status === "active" && activeNameTaken(s.courseId, name, s.id)) {
      return res.status(409).json({ error: `이미 운영 중인 ${name}이 있어요.` });
    }
    db.data.sections[s.id] = { ...s, name, status, updatedAt: nowIso() };
    db.save();
    res.json(sectionOverview(db.data.sections[s.id]));
  });

  /** 분반–교강사 배정 (관리자만). 같은 배정은 한 번만 생긴다. (키: sectionId::email) */
  api.put("/sections/:id/instructors/:email", requireAdminMode, (req: Authed, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.assignInstructor(req.params.id, req.params.email, adminLabel(req)));
    const s = db.data.sections[req.params.id];
    const email = normalizeEmail(req.params.email);
    if (!s || !isOpenCourse(db.data.courses[s.courseId])) return res.status(404).json({ error: "분반을 찾을 수 없어요." });
    if (!instructorEmails().includes(email)) {
      return res.status(400).json({ error: "교수자로 등록된 이메일만 배정할 수 있어요." });
    }
    const added = assignTeacher(s.id, email, req.user!.email || req.user!.name);
    if (added) db.save();
    res.json({ ok: true, existed: !added });
  });

  api.delete("/sections/:id/instructors/:email", requireAdminMode, (req, res) => {
    if (useSupabase) return void viaSupabase(res, (st) => st.unassignInstructor(req.params.id, req.params.email));
    const key = sectionInstructorKey(req.params.id, normalizeEmail(req.params.email));
    if (db.data.sectionInstructors[key]) {
      delete db.data.sectionInstructors[key];
      db.save();
    }
    res.json({ ok: true });
  });

  /** 분반 강의코드로 과목·분반 미리 보기 (참여 링크 화면). 운영 중인 분반만. */
  api.get("/courses/lookup", (req: Authed, res) => {
    // supabase: 로그인한 승인 학생만 (enroll_with_code 미리보기). 로그인 전에는 강의코드를 확인해 주지 않는다.
    if (useSupabase) {
      return void viaUser(req, res, async (a) => {
        const { course, section } = await enrollWithCode(a, String(req.query.code ?? ""), false);
        const body: CourseLookup = { ...course, sectionName: section.name };
        return body;
      });
    }
    const s = findSectionByCode(db.data.sections, String(req.query.code ?? ""));
    const course = s ? db.data.courses[s.courseId] : undefined;
    if (!s || s.status !== "active" || !isOpenCourse(course)) {
      return res.status(404).json({ error: "강의코드에 맞는 강의가 없어요." });
    }
    const body: CourseLookup = { ...courseSummary(course), sectionName: s.name };
    res.json(body);
  });

  /**
   * 과목 커리큘럼: 주차 · 학습 주제 · 상태만 (준비 중인 주차 포함, 학습 콘텐츠 없음).
   * 학습자는 수강 중인 과목만, 교수자는 담당 분반이 있는 과목만 볼 수 있다. 그 밖의 과목은 없는 과목처럼 404.
   */
  api.get("/courses/:id/curriculum", requireLogin, (req: Authed, res) => {
    if (useSupabase && !isPlatformAdmin(req)) {
      return void viaUser(req, res, async (a) => {
        const id = req.params.id;
        const allowed = isStaff(req) ? managedSectionIds(req, id).size > 0 : a.learnerCourseIds.has(id);
        if (!allowed || !a.courses.get(id)) throw new AdminDataError(404, "수강 중인 강의가 아니에요.");
        const body: CourseCurriculum = {
          course: isStaff(req) ? courseSummaryFromRow(a.courses.get(id)!) : await learnerCourseCard(a, id),
          weeks: await curriculumFor(a, id),
        };
        return body;
      });
    }
    if (useSupabase) {
      return void viaSupabase(res, async (st) => {
        const course = (await st.listCourses()).find((c) => c.id === req.params.id);
        if (!course) throw new AdminDataError(404, "수강 중인 강의가 아니에요.");
        const summary: CourseSummary = {
          id: course.id,
          drama: course.drama,
          title: course.title,
          context: course.context,
          description: course.description,
          weekCount: course.weekCount,
          status: course.status,
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
        };
        const body: CourseCurriculum = { course: summary, weeks: await st.curriculumWeeks(course.id) };
        return body;
      });
    }
    const course = db.data.courses[req.params.id];
    const allowed = isStaff(req)
      ? isPlatformAdmin(req)
        ? !!course
        : isOpenCourse(course) && managedSectionIds(req, course.id).size > 0
      : isOpenCourse(course) && learnerCourseIds(req.user!.id).has(course.id);
    if (!allowed) return res.status(404).json({ error: "수강 중인 강의가 아니에요." });
    const body: CourseCurriculum = {
      course: isStaff(req) ? courseSummary(course) : learnerCourse(req.user!.id, course),
      weeks: lessonsForCourse(db.data.lessons, course.id).map((l) => ({
        lessonId: l.id,
        week: l.week,
        title: l.title,
        status: l.status,
        youtubeId: l.status === "published" ? l.video.youtubeId || null : null,
      })),
    };
    res.json(body);
  });

  /**
   * ?course={과목 id · 분반 id · 강의코드} — 관리자는 생략하면 전체.
   * 관리자: 전부 / 교수자: 담당 분반만 / 학습자: 본인 기록만
   */
  api.get("/enrollments", requireLogin, (req: Authed, res) => {
    const q = String(req.query.course ?? "");
    if (useSupabase && isPlatformAdmin(req)) return void viaSupabase(res, (st) => st.listEnrollments(q));
    if (useSupabase) {
      return void viaUser(req, res, async (a) => {
        const match = (e: Record<string, unknown>) => !q || e.course_id === q || e.section_id === q || e.course_code === q.trim().toUpperCase();
        if (isStaff(req)) {
          const students = await studentsOfSections(a, a.mySections);
          return students.flatMap((st): Enrollment[] => {
            const e = a.enrollments.find((x) => x.user_id === st.userId && x.section_id === st.sectionId);
            return e && match(e)
              ? [{ sectionId: st.sectionId, courseId: String(e.course_id), courseCode: String(e.course_code), userId: st.userId, name: st.name, email: st.email, joinedAt: st.joinedAt }]
              : [];
          });
        }
        const me = req.user!;
        return a.enrollments
          .filter((e) => e.user_id === a.userId && match(e))
          .map((e) => ({ sectionId: String(e.section_id), courseId: String(e.course_id), courseCode: String(e.course_code), userId: a.userId, name: me.name, email: me.email, joinedAt: String(e.joined_at) }));
      });
    }
    const all = Object.values(db.data.enrollments);
    const list = q
      ? all.filter((e) => e.courseId === q || e.sectionId === q || e.courseCode === q)
      : isPlatformAdmin(req)
        ? all
        : [];
    if (isPlatformAdmin(req)) return res.json(list);
    if (isStaff(req)) {
      const mine = managedSectionIds(req);
      return res.json(list.filter((e) => e.sectionId && mine.has(e.sectionId)));
    }
    res.json(list.filter((e) => e.userId === req.user!.id));
  });

  /**
   * 분반 강의코드로 수강 등록. 관리자 승인을 받은 학습자는 코드가 맞으면 추가 승인 없이 바로 등록된다.
   * - 같은 분반: 기존 등록을 그대로 돌려준다 (중복 없음, 키: sectionId::userId)
   * - 같은 과목의 다른 운영 중 분반을 이미 수강 중: 등록하지 않는다
   * - 비활성 분반·기존 자료 코드: 등록하지 않는다
   */
  api.post("/enrollments", requireLogin, (req: Authed, res) => {
    if (useSupabase) {
      // 승인·교수자 거부·중복·비활성 검사는 enroll_with_code(DB 함수)가 한다.
      const code = typeof req.body?.courseCode === "string" ? req.body.courseCode : "";
      return void viaUser(req, res, async (a) => {
        const result = await enrollResult(a, req.user!, code);
        // 본인 수강 과목과 담당 교수자의 수강생 목록이 바뀐다.
        userResolver?.clear();
        return result;
      });
    }
    const u = req.user!;
    if (u.role !== "learner") return res.status(400).json({ error: "교수자 계정은 수강 등록하지 않아도 돼요." });
    if (!isApproved(req)) return res.status(403).json({ error: "관리자 승인 후 수강 등록할 수 있어요." });
    const code = typeof req.body?.courseCode === "string" ? req.body.courseCode : "";
    const section = findSectionByCode(db.data.sections, code);
    const course = section ? db.data.courses[section.courseId] : undefined;
    if (!section || section.status !== "active" || !isOpenCourse(course)) {
      return res.status(404).json({ error: "강의코드를 다시 확인해 주세요. 일치하는 강의가 없어요." });
    }
    const key = enrollmentKey(section.id, u.id);
    const alreadyEnrolled = !!db.data.enrollments[key];
    if (!alreadyEnrolled) {
      const other = enrollmentsForUser(db.data.enrollments, u.id).find(
        (e) => e.courseId === course.id && e.sectionId && db.data.sections[e.sectionId]?.status === "active",
      );
      if (other) return res.status(409).json({ error: "이미 이 과목의 다른 분반을 수강 중이에요." });
    }
    const e: Enrollment = db.data.enrollments[key] ?? {
      sectionId: section.id,
      courseId: course.id,
      courseCode: section.code,
      userId: u.id,
      name: u.name,
      email: u.email,
      joinedAt: nowIso(),
    };
    if (!alreadyEnrolled) {
      db.data.enrollments[key] = e;
      db.save();
    }
    const body: EnrollResult = {
      enrollment: e,
      course: learnerCourse(u.id, course),
      section: { id: section.id, name: section.name },
      alreadyEnrolled,
    };
    res.json(body);
  });

  api.use((_req, res) => res.status(404).json({ error: "없는 API예요." }));

  return api;
};

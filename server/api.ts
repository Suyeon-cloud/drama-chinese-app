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

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { isValidEmail, normalizeEmail } from "../src/app/auth/roles";
import { lessonPublishProblems } from "../src/app/lib/subtitles";
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
import { MAX_WEEK_COUNT, sortCourses } from "../src/content/courseWeeks";
import { MATERIAL_FILE_MAX_BYTES } from "../src/content/materialRules";
import type { PublicCourse, WeekMaterial, WeekMaterialHtml, WeekMaterialSource } from "../src/app/store/models";
import { MATERIAL_HTML_CSP, materialHtmlDocument, materialHtmlFileName } from "../src/content/materialHtml";
import type { Db } from "./db";
import { AI_MODEL, aiErrorMessage, checkAnthropicKey, generateDraftText } from "./aiDraft";
import { feedbackProblem } from "./feedbackRows";
import { lessonMoveProblem, resolveLessonCourseId } from "./lessonCourse";
import { minWeekCountFor, newCourseId, parseCourseCreate, parseCoursePatch } from "./courseInput";
import {
  MAX_MATERIALS_PER_WEEK,
  materialsForCourse,
  newMaterialId,
  nextPosition,
  parseMaterialCreate,
  parseMaterialOrder,
  parseMaterialPatch,
  publicMaterial,
  renumberWeek,
} from "./weekMaterials";
import { clientMaterial, parseMaterialFileInput, parseMaterialHtmlCreate, sameInstant, type StoredMaterial } from "./weekMaterials";
import { materialOps } from "./materialRows";
import { liveQuizOps, liveSessionOps } from "./liveQuizRows";
import {
  JOIN_CODE_ALPHABET,
  isJoinCode,
  liveHostState,
  liveStudentState,
  nextLiveState,
  normalizeJoinCode,
  type LiveAction,
  type StoredLiveSession,
} from "../src/content/liveSession";
import { isAnthropicKeyShape, parseLiveQuizSetInput, quizKey, type LiveQuizSet, type LiveQuizSetInput } from "../src/content/liveQuiz";
import { resolveLessonContent } from "../src/content/lessons";
import { isCourseKey, isPreviewable, newStorageKey, parseFileMeta } from "./materialFiles";
import { createLocalMaterialStorage, DOWNLOAD_URL_SECONDS, type MaterialStorage } from "./materialStorage";
import { cleanupOrphans, completeUpload, UPLOAD_INTENT_MS, type UploadDeps, type UploadIntent } from "./materialUploads";
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
  toUserError,
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
  /** 6-A: 실시간 퀴즈 AI 생성에 공용 서버 키를 써도 되는지 (관리자가 LIVE_QUIZ_SHARED_AI_KEY=allow로 명시적으로 허용할 때만) */
  liveQuizSharedAi: boolean;
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
  liveQuizSharedAi: (env.LIVE_QUIZ_SHARED_AI_KEY || "").trim().toLowerCase() === "allow",
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
  //   - isVisibleCourse: 운영(active)·비활성(inactive) 과목 — 기존 수강생 학습·진도, 담당 교수자 편집, 교수자 배정, 커리큘럼
  //   - isEnrollableCourse: 운영(active) 과목만 — 강의코드 미리보기·수강 등록·새 분반
  //   기존 자료(legacy) 과목은 둘 다 아니다. (관리자만 다룬다)
  const isVisibleCourse = (c: Course | undefined): c is Course => !!c && (c.status === "active" || c.status === "inactive");
  const isEnrollableCourse = (c: Course | undefined): c is Course => !!c && c.status === "active";
  /**
   * 교수자(Google)가 맡은 분반 — sectionInstructors의 sectionId + email, 운영 과목의 분반만.
   * activeOnly: 운영 중인 분반만 (학습자료 편집 권한). 비활성 분반도 수강생 기록은 계속 볼 수 있다.
   */
  const instructorSections = (email: string, activeOnly = false) =>
    sectionIdsForInstructor(db.data.sectionInstructors, email)
      .map((id) => db.data.sections[id])
      .filter((s) => !!s && isVisibleCourse(db.data.courses[s.courseId]) && (!activeOnly || s.status === "active"));
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
        .filter((id) => isVisibleCourse(db.data.courses[id])),
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
    // 과목: 새 학습자료는 courseId 필수, 기존 학습자료는 없으면 원래 과목 (기존 자료 과목으로 대신 넣지 않는다 — lessonCourse.ts)
    // supabase: 기존 Express 검사 후 저장 함수로 저장. 기존 학습자료는 lesson.version(편집을 시작한 버전)이 맞아야 저장된다.
    if (useSupabase) {
      if (isPlatformAdmin(req)) {
        return void viaSupabase(res, async (st) => {
          const prev = await st.getLesson(lesson.id);
          const resolved = resolveLessonCourseId(lesson.courseId, prev);
          if (!resolved.ok) throw new AdminDataError(resolved.status, resolved.error);
          const courseId = resolved.courseId;
          const course = await st.getCourse(courseId);
          const problem = lessonSaveProblem(lesson, prev, course?.weekCount ?? null);
          if (problem) throw new AdminDataError(400, problem);
          const prevCourse = prev && prev.courseId !== courseId ? await st.getCourse(prev.courseId) : null;
          const moveProblem = lessonMoveProblem(prev?.courseId, courseId, (id) => (id === courseId ? course?.status : prevCourse?.status));
          if (moveProblem) throw new AdminDataError(403, moveProblem);
          return st.saveLesson({ ...lesson, courseId }, adminLabel(req));
        });
      }
      return void viaUser(req, res, async (a) => {
        const prev = await lessonFor(a, lesson.id);
        const resolved = resolveLessonCourseId(lesson.courseId, prev);
        if (!resolved.ok) throw new AdminDataError(resolved.status, resolved.error);
        const courseId = resolved.courseId;
        const course = a.courses.get(courseId);
        if (!course || !canManageCourse(req, courseId)) throw new AdminDataError(403, "담당 강의의 학습자료만 저장할 수 있어요.");
        const moveProblem = lessonMoveProblem(prev?.courseId, courseId, (id) => {
          const c = a.courses.get(id);
          return c ? String(c.status) : null;
        });
        if (moveProblem) throw new AdminDataError(403, moveProblem);
        const problem = lessonSaveProblem(lesson, prev, Number(course.week_count));
        if (problem) throw new AdminDataError(400, problem);
        return saveLessonAs(a, { ...lesson, courseId });
      });
    }
    const prev = db.data.lessons[lesson.id];
    const resolved = resolveLessonCourseId(lesson.courseId, prev);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    const courseId = resolved.courseId;
    if (!db.data.courses[courseId]) return res.status(400).json({ error: "없는 과목이에요." });
    if (!canManageCourse(req, courseId) || (prev && !canManageCourse(req, prev.courseId))) {
      return res.status(403).json({ error: "담당 강의의 학습자료만 저장할 수 있어요." });
    }
    const moveProblem = lessonMoveProblem(prev?.courseId, courseId, (id) => db.data.courses[id]?.status);
    if (moveProblem) return res.status(403).json({ error: moveProblem });
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
    // 5-B: 이 강의에서 만든 복습 HTML은 남기고 출처의 강의 연결만 끊는다 (Supabase는 외래 키 ON DELETE SET NULL)
    for (const m of Object.values(db.data.weekMaterials)) {
      if (m.source?.lessonId === req.params.id) m.source = { ...m.source, lessonId: null };
    }
    // 6-A: 이 강의자료로 만든 실시간 퀴즈 세트는 남기고 연결만 끊는다 (Supabase는 외래 키 ON DELETE SET NULL)
    for (const s of Object.values(db.data.liveQuizSets)) {
      if (s.lessonId === req.params.id) s.lessonId = null;
    }
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
      // 6-A: 실시간 퀴즈 생성에 공용 키를 쓸 수 있는지 (관리자가 명시적으로 허용 + 키 있음)
      liveQuizShared: !!key && env.liveQuizSharedAi,
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

  /**
   * 6-A: 실시간 퀴즈 초안 생성. 교수자 개인 키(X-Anthropic-Key 헤더)를 우선 쓰고, 없으면 관리자가 허용한 공용 키만 쓴다.
   * 개인 키는 이 요청에만 쓰고 저장·로그 출력하지 않는다. 둘 다 없으면 프롬프트 복사 → 외부 AI → JSON 붙여넣기로 안내한다.
   */
  api.post("/ai/live-quiz", requireAiUser, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const header = req.headers["x-anthropic-key"];
    const personal = typeof header === "string" ? header.trim() : "";
    if (personal && !isAnthropicKeyShape(personal)) return res.status(400).json({ error: "개인 API 키 형식이 올바르지 않아요. sk-ant- 로 시작하는 키를 넣어 주세요." });
    const shared = env.liveQuizSharedAi ? aiKey() : "";
    const key = personal || shared;
    if (!key) {
      return res.status(400).json({
        error: "개인 API 키를 입력하거나, ‘프롬프트 복사’로 외부 AI에서 만든 JSON을 붙여 넣어 주세요.",
        manual: true,
      });
    }
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
    if (!prompt.trim() || prompt.length > 200_000) return res.status(400).json({ error: "프롬프트가 비었거나 너무 길어요." });
    try {
      res.json({ ...(await generateDraftText(key, prompt)), keySource: personal ? "personal" : "shared" });
    } catch (err) {
      // 오류 문구에 키가 섞여 나가지 않게 (SDK 메시지는 키를 담지 않지만 한 번 더 지운다)
      const message = aiErrorMessage(err).split(key).join("[API 키]");
      res.status(502).json({ error: message });
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

  /* ───────── 과목 관리 (관리자) · 공개 과목 목록 ───────── */

  // Supabase 모드: 생성·수정은 관리자 RPC(admin_create_course·admin_update_course, Phase E1), 입력 검사는 JSON 모드와 같은 함수로 먼저 한다.
  const PUBLIC_COURSES_ERROR = "과목 목록을 불러오지 못했어요.";

  /**
   * 새 과목 (관리자). body: { title, drama?, context?, description?, weekCount? (기본 15, 1~30) }
   * id는 서버가 만든다 (course- + 소문자·숫자 6자). 운영 중(active)으로 만들고, 분반·학습자료는 만들지 않는다.
   */
  api.post("/courses", requireAdminMode, (req: Authed, res) => {
    const parsed = parseCourseCreate(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    if (useSupabase) {
      const input = parsed.value;
      return void viaSupabase(res.status(201), (st) => st.createCourse(input));
    }
    const now = nowIso();
    const id = newCourseId((x) => !!db.data.courses[x]);
    // code: 이전 구조의 과목 강의코드 칸. 새 과목은 쓰지 않는다 (수강 등록은 분반 강의코드로).
    const course: Course = { id, ...parsed.value, code: "", status: "active", createdAt: now, updatedAt: now };
    db.data.courses[id] = course;
    db.save();
    res.status(201).json(courseOverview(req, course));
  });

  /**
   * 과목 수정 (관리자). 보낸 칸만 바꾼다: title·drama·context·description·weekCount·status(active ↔ inactive).
   * id는 바꿀 수 없다. 기존 자료(legacy) 과목은 바꾸지 않는다.
   * 주차 수는 그 과목 학습자료(준비 중 포함)·학습 기록의 가장 큰 주차보다 작게 줄일 수 없다. 기존 데이터는 지우지 않는다.
   */
  api.patch("/courses/:id", requireAdminMode, (req: Authed, res) => {
    if (useSupabase) {
      // 없는 과목 404·기존 자료 과목 403·주차 축소 불가 409는 DB 함수가 과목 잠금 안에서 확인한다.
      const parsed = parseCoursePatch(req.body, req.params.id);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const patch = parsed.value;
      return void viaSupabase(res, (st) => st.updateCourse(req.params.id, patch));
    }
    const course = db.data.courses[req.params.id];
    if (!course) return res.status(404).json({ error: "과목을 찾을 수 없어요." });
    if (course.status === "legacy") return res.status(403).json({ error: "기존 자료 과목은 바꿀 수 없어요." });
    const parsed = parseCoursePatch(req.body, course.id);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const patch = parsed.value;
    if (patch.weekCount !== undefined && patch.weekCount < course.weekCount) {
      const lessons = lessonsForCourse(db.data.lessons, course.id);
      const lessonIds = new Set(lessons.map((l) => l.id));
      const progressWeeks = Object.values(db.data.progress)
        .filter((p) => lessonIds.has(p.lessonId))
        .map((p) => p.week);
      // 주차별 보충 자료(비공개 포함)가 있는 주차도 지켜야 한다. (자료가 과목 주차 범위 밖에 남지 않게)
      const materialWeeks = materialsForCourse(db.data.weekMaterials, course.id).map((m) => m.week);
      const min = minWeekCountFor([...lessons.map((l) => l.week), ...materialWeeks], progressWeeks);
      if (patch.weekCount < min) {
        return res.status(409).json({ error: `${min}주차까지 학습자료나 학습 기록이 있어 ${min}주보다 적게 줄일 수 없어요.` });
      }
    }
    const next: Course = { ...course, ...patch, id: course.id, code: course.code, createdAt: course.createdAt, updatedAt: nowIso() };
    db.data.courses[course.id] = next;
    db.save();
    res.json(courseOverview(req, next));
  });

  /** 로그인 전 소개 화면용: 운영 중(active) 과목의 표시 정보만 (분반·강의코드·수강생·교강사 정보 없음) */
  api.get("/public/courses", async (_req, res) => {
    if (useSupabase) {
      if (!supa) return res.status(503).json({ error: PUBLIC_COURSES_ERROR });
      try {
        return res.json(await supa.publicCourses());
      } catch (err) {
        console.error("[public-courses]", err instanceof Error ? err.message : "unknown error");
        return res.status(500).json({ error: PUBLIC_COURSES_ERROR });
      }
    }
    try {
      const body: PublicCourse[] = sortCourses(Object.values(db.data.courses).filter((c) => c.status === "active")).map(
        ({ id, drama, title, context, description, weekCount }) => ({ id, drama, title, context, description, weekCount }),
      );
      res.json(body);
    } catch {
      res.status(500).json({ error: PUBLIC_COURSES_ERROR });
    }
  });

  /* ───────── 주차별 보충 학습자료 (외부 링크, JSON 모드) ───────── */
  // - 과목 + 주차에 연결한다. 영상 학습자료(lessons)·학습 기록(progress)은 읽지도 바꾸지도 않는다.
  // - 편집: 관리자(모든 과목, 기존 자료 과목 포함) · 운영 중 담당 분반이 있는 교수자 (비활성 과목 포함 — 강의자료 편집과 같은 규칙)
  // - 열람: 편집할 수 있는 사람은 비공개 포함 전체, 수강 중인 승인 학습자는 공개(published) 자료만
  // - Supabase(3-B): 관리자는 service-role로 admin_* RPC, 교수자·학생은 사용자 token으로 조회(RLS)와 교수자 RPC.
  //   Express는 같은 입력 검사를 먼저 하고(주차는 1~30까지만), 과목 주차 범위·권한·개수 한도·순서 목록은 DB 함수가 최종 확인한다.

  const materialActor = (req: Authed) => (isPlatformAdmin(req) ? "관리자" : req.user?.name?.trim() || req.user?.email || "교수자");
  /** 비공개 포함 전체 열람: 편집 권한자 + 그 과목 분반 담당 교수자(비활성 분반만 담당해도 목록은 본다) */
  const canSeeAllMaterials = (req: Authed, courseId: string) =>
    canManageCourse(req, courseId) || (isStaff(req) && managedSectionIds(req, courseId).size > 0);
  const canReadMaterials = (req: Authed, courseId: string) =>
    canSeeAllMaterials(req, courseId) || (!isStaff(req) && isApproved(req) && learnerCourseIds(req.user!.id).has(courseId));
  type MaterialOps = ReturnType<typeof materialOps>;
  /** Supabase 경로 실행: 관리자는 admin_* RPC, 그 밖은 사용자 token (access: 사용자 경로의 권한 정보, 관리자는 null) */
  const viaMaterials = (
    req: Authed,
    res: Response,
    status: number,
    work: (ops: MaterialOps, access: SupabaseAccess | null) => Promise<unknown>,
  ) =>
    isPlatformAdmin(req)
      ? void viaSupabase(res.status(status), (st) => work(st.materials(materialActor(req)), null))
      : void viaUser(req, res.status(status), (a) => work(materialOps(a.client, false, toUserError), a));

  /** 과목의 보충 자료 (?week= 그 주차만). 편집 권한이 있으면 비공개 포함, 학습자는 공개 자료만 */
  api.get("/courses/:id/materials", requireLogin, (req: Authed, res) => {
    const courseId = req.params.id;
    const week = typeof req.query.week === "string" && req.query.week ? Number(req.query.week) : null;
    if (useSupabase) {
      return viaMaterials(req, res, 200, async (ops, a) => {
        // 사용자 경로: 담당 분반(비활성 포함)이 있는 교수자 또는 수강 중인 승인 학생만. 학생에게는 RLS가 published만 보낸다.
        const staffView = !a || isStaff(req);
        if (a && !(isStaff(req) ? a.mySections.some((s) => s.course_id === courseId) : a.learnerCourseIds.has(courseId))) {
          throw new AdminDataError(404, "강의를 찾을 수 없어요.");
        }
        const all = (await ops.list(courseId)).filter((m) => week === null || m.week === week);
        if (!staffView) return all.filter((m) => m.status === "published").map(publicMaterial);
        // 5-B: 자동 생성 복습 HTML의 출처 (교수자 전용 RPC·관리자 테이블. 실패해도 목록은 그대로)
        const sources = all.some((m) => m.kind === "html") ? await ops.sources(courseId) : new Map<string, WeekMaterialSource>();
        return all.map((m) => (sources.has(m.id) ? { ...m, source: sources.get(m.id) } : m));
      });
    }
    if (!db.data.courses[courseId] || !canReadMaterials(req, courseId)) return res.status(404).json({ error: "강의를 찾을 수 없어요." });
    const all = materialsForCourse(db.data.weekMaterials, courseId)
      .filter((m) => week === null || m.week === week)
      .map(clientMaterial);
    res.json(canSeeAllMaterials(req, courseId) ? all : all.filter((m) => m.status === "published").map(publicMaterial));
  });

  /** 새 보충 자료 (링크). body: { week, title, description?, url, status? (기본 비공개) } — 그 주차 맨 뒤에 붙는다. */
  api.post("/courses/:id/materials", requireLogin, (req: Authed, res) => {
    if (useSupabase) {
      const parsed = parseMaterialCreate(req.body, MAX_WEEK_COUNT);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const input = parsed.value;
      return viaMaterials(req, res, 201, (ops) => ops.create(req.params.id, input));
    }
    const course = db.data.courses[req.params.id];
    if (!course) return res.status(404).json({ error: "강의를 찾을 수 없어요." });
    if (!canManageCourse(req, course.id)) return res.status(403).json({ error: "담당 강의의 자료만 등록할 수 있어요." });
    const parsed = parseMaterialCreate(req.body, course.weekCount);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const list = materialsForCourse(db.data.weekMaterials, course.id);
    if (list.filter((m) => m.week === parsed.value.week).length >= MAX_MATERIALS_PER_WEEK) {
      return res.status(409).json({ error: `한 주차에는 자료를 ${MAX_MATERIALS_PER_WEEK}개까지 등록할 수 있어요.` });
    }
    const now = nowIso();
    const material: WeekMaterial = {
      id: newMaterialId((x) => !!db.data.weekMaterials[x]),
      courseId: course.id,
      kind: "link",
      ...parsed.value,
      position: nextPosition(list, parsed.value.week),
      createdAt: now,
      updatedAt: now,
      updatedByLabel: materialActor(req),
    };
    db.data.weekMaterials[material.id] = material;
    db.save();
    res.status(201).json(material);
  });

  /** 보충 자료 수정 · 공개/비공개 전환 · 주차 이동 (보낸 칸만). 주차를 옮기면 그 주차 맨 뒤로 간다. */
  api.patch("/materials/:id", requireLogin, (req: Authed, res) => {
    if (useSupabase) {
      const parsed = parseMaterialPatch(req.body, MAX_WEEK_COUNT);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const { html, sourceLessonUpdatedAt, ...patch } = parsed.value;
      // HTML 본문을 바꾸면 HTML RPC(본문 + 보낸 칸을 한 트랜잭션으로, HTML 자료가 아니면 DB가 거부), 아니면 기존 RPC
      // 5-B 재생성: 원래 연결된 강의·원본 수정 시각을 DB가 확인한 뒤 본문과 출처 시각만 바꾼다 (id·공개 상태 유지)
      return viaMaterials(req, res, 200, (ops) =>
        html !== undefined
          ? ops.saveHtml(null, req.params.id, patch, html, sourceLessonUpdatedAt ? { lessonUpdatedAt: sourceLessonUpdatedAt } : undefined)
          : ops.update(req.params.id, patch),
      );
    }
    const prev = db.data.weekMaterials[req.params.id];
    const course = prev ? db.data.courses[prev.courseId] : undefined;
    if (!prev || !course || !canManageCourse(req, course.id)) return res.status(404).json({ error: "자료를 찾을 수 없어요." });
    const parsed = parseMaterialPatch(req.body, course.weekCount);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    if (prev.kind !== "link" && parsed.value.url !== undefined) return res.status(400).json({ error: "파일·HTML 자료에는 링크 주소를 넣을 수 없어요." });
    if (prev.kind !== "html" && parsed.value.html !== undefined) return res.status(400).json({ error: "HTML 내용은 HTML 자료에만 넣을 수 있어요." });
    // 5-B 재생성: 원래 연결된 강의만, 그 강의가 지금도 같은 과목에 있고 화면이 만든 시점의 원본과 같을 때만
    const { sourceLessonUpdatedAt, ...patchValue } = parsed.value;
    let nextSource = prev.source;
    if (sourceLessonUpdatedAt !== undefined) {
      if (!prev.source) return res.status(400).json({ error: "직접 만든 HTML 자료에는 출처를 연결할 수 없어요." });
      const lesson = prev.source.lessonId ? db.data.lessons[prev.source.lessonId] : undefined;
      if (!lesson || lesson.courseId !== course.id) {
        return res.status(400).json({ error: "원본 강의가 삭제되어 다시 만들 수 없어요. 자료는 그대로 남아 있어요." });
      }
      if (!sameInstant(lesson.updatedAt, sourceLessonUpdatedAt)) {
        return res.status(409).json({ error: "원본 강의가 그사이 수정됐어요. 복습 HTML을 다시 만들어 주세요." });
      }
      nextSource = { ...prev.source, lessonUpdatedAt: lesson.updatedAt };
    }
    const list = materialsForCourse(db.data.weekMaterials, course.id);
    const moving = parsed.value.week !== undefined && parsed.value.week !== prev.week;
    if (moving && list.filter((m) => m.week === parsed.value.week).length >= MAX_MATERIALS_PER_WEEK) {
      return res.status(409).json({ error: `한 주차에는 자료를 ${MAX_MATERIALS_PER_WEEK}개까지 등록할 수 있어요.` });
    }
    const next: StoredMaterial = {
      ...prev,
      ...patchValue,
      ...(nextSource ? { source: nextSource } : {}),
      position: moving ? nextPosition(list, parsed.value.week!) : prev.position,
      updatedAt: nowIso(),
      updatedByLabel: materialActor(req),
    };
    db.data.weekMaterials[prev.id] = next;
    if (moving) renumberWeek(Object.values(db.data.weekMaterials).filter((m) => m.courseId === course.id), prev.week);
    db.save();
    res.json(clientMaterial(next));
  });

  /** 보충 자료 삭제 (그 자료만, 같은 주차의 순서는 다시 매긴다). 파일 자료는 자료 행을 지운 뒤 저장된 파일도 지운다. */
  api.delete("/materials/:id", requireLogin, (req: Authed, res) => {
    if (useSupabase) {
      return viaMaterials(req, res, 200, async (ops) => {
        const r = await ops.remove(req.params.id);
        if (r.storagePath && r.courseId && isCourseKey(r.courseId, r.storagePath)) {
          if (supa) await removeStoredFile(supa.materialFiles().storage, r.storagePath);
          else console.error(`[material-file] 저장소 설정이 없어 파일을 지우지 못했어요(고아 정리 대상): ${r.storagePath}`);
        }
        return { ok: true };
      });
    }
    const prev = db.data.weekMaterials[req.params.id];
    if (!prev || !canManageCourse(req, prev.courseId)) return res.status(404).json({ error: "자료를 찾을 수 없어요." });
    delete db.data.weekMaterials[prev.id];
    renumberWeek(Object.values(db.data.weekMaterials).filter((m) => m.courseId === prev.courseId), prev.week);
    db.save();
    if (prev.storagePath && isCourseKey(prev.courseId, prev.storagePath)) {
      return void removeStoredFile(localFiles!, prev.storagePath).then(() => res.json({ ok: true }));
    }
    res.json({ ok: true });
  });

  /** 한 주차의 자료 순서 변경. body: { week, ids: 그 주차 자료 id 전체를 새 순서로 } */
  api.put("/courses/:id/materials/order", requireLogin, (req: Authed, res) => {
    if (useSupabase) {
      // 형식만 먼저 본다. 그 주차 자료 전체와 같은지는 DB 함수가 과목 잠금 안에서 확인한다(다르면 409).
      const week = req.body?.week;
      const ids = req.body?.ids;
      const valid =
        Number.isInteger(week) && week >= 1 && week <= MAX_WEEK_COUNT &&
        Array.isArray(ids) && ids.length <= MAX_MATERIALS_PER_WEEK && ids.every((x: unknown) => typeof x === "string") &&
        new Set(ids).size === ids.length;
      if (!valid) return res.status(400).json({ error: "순서 정보 형식이 올바르지 않아요." });
      return viaMaterials(req, res, 200, (ops) => ops.reorder(req.params.id, week as number, ids as string[]));
    }
    const course = db.data.courses[req.params.id];
    if (!course) return res.status(404).json({ error: "강의를 찾을 수 없어요." });
    if (!canManageCourse(req, course.id)) return res.status(403).json({ error: "담당 강의의 자료만 정렬할 수 있어요." });
    const list = materialsForCourse(db.data.weekMaterials, course.id);
    const parsed = parseMaterialOrder(req.body, course.weekCount, list);
    if (!parsed.ok) return res.status(409).json({ error: parsed.error });
    parsed.value.ids.forEach((id, i) => {
      db.data.weekMaterials[id].position = i;
    });
    db.save();
    res.json(materialsForCourse(db.data.weekMaterials, course.id).filter((m) => m.week === parsed.value.week).map(clientMaterial));
  });

  /* ───────── HTML 학습자료 (4단계): 등록 · 본문 열기 · .html 내려받기 ───────── */
  // - 수정(제목·설명·주차·공개·본문)·삭제·정렬은 위의 보충 자료 경로를 같이 쓴다. 목록에는 본문을 넣지 않는다.
  // - 본문은 요청마다 권한을 확인한 뒤에만 보낸다: 편집·담당 교수자는 비공개 포함, 학생은 수강 중인 과목의 공개 자료만 (그 밖은 404).
  // - 화면은 JSON으로 받아 sandbox iframe에 그린다. 내려받기는 첨부 파일(attachment)로만 보내고, 앱 주소에서 HTML을 직접 실행하지 않는다.

  const REVIEW_DUPLICATE = "이 강의의 복습 자료가 이미 있어요. 기존 자료를 다시 만들어 업데이트해 주세요.";

  /**
   * 새 HTML 학습자료. body: { week, title, description?, status? (기본 비공개), html, source? } — 그 주차 맨 뒤에 붙는다.
   * source(5-B): { kind: "lesson-review", lessonId, lessonUpdatedAt } — 강의에서 자동 생성한 복습 HTML (같은 과목의 강의당 하나)
   */
  api.post("/courses/:id/materials/html", requireLogin, (req: Authed, res) => {
    if (useSupabase) {
      const parsed = parseMaterialHtmlCreate(req.body, MAX_WEEK_COUNT);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const { html, source, ...input } = parsed.value;
      return viaMaterials(req, res, 201, async (ops) => {
        try {
          return await ops.saveHtml(req.params.id, null, input, html, source);
        } catch (err) {
          // 5-B 중복: DB가 권한(can_manage_course)을 확인한 뒤에야 나는 오류다. 기존 자료 id는 출처 조회(권한 확인)로 찾은 경우에만 돌려준다.
          if (source && err instanceof AdminDataError && err.status === 409 && /복습 자료가 이미|week_materials_review_source_uniq/.test(err.message)) {
            const found = [...(await ops.sources(req.params.id))].find(([, s]) => s.lessonId === source.lessonId)?.[0];
            throw new AdminDataError(409, REVIEW_DUPLICATE, found ? { existingId: found } : undefined);
          }
          throw err;
        }
      });
    }
    const course = db.data.courses[req.params.id];
    if (!course) return res.status(404).json({ error: "강의를 찾을 수 없어요." });
    if (!canManageCourse(req, course.id)) return res.status(403).json({ error: "담당 강의의 자료만 등록할 수 있어요." });
    const parsed = parseMaterialHtmlCreate(req.body, course.weekCount);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const list = materialsForCourse(db.data.weekMaterials, course.id);
    // 5-B: 강의에서 자동 생성한 복습 HTML — 같은 과목의 강의, 화면이 만든 시점의 원본, 강의당 하나
    const { source: sourceInput, ...htmlInput } = parsed.value;
    let source: WeekMaterialSource | undefined;
    if (sourceInput) {
      const lesson = db.data.lessons[sourceInput.lessonId];
      if (!lesson || lesson.courseId !== course.id) return res.status(400).json({ error: "같은 과목의 강의에서 만든 복습 자료만 연결할 수 있어요." });
      if (!sameInstant(lesson.updatedAt, sourceInput.lessonUpdatedAt)) {
        return res.status(409).json({ error: "원본 강의가 그사이 수정됐어요. 복습 HTML을 다시 만들어 주세요." });
      }
      const existing = list.find((m) => m.source?.lessonId === lesson.id);
      if (existing) return res.status(409).json({ error: REVIEW_DUPLICATE, existingId: existing.id });
      source = { kind: "lesson-review", lessonId: lesson.id, lessonUpdatedAt: lesson.updatedAt };
    }
    if (list.filter((m) => m.week === parsed.value.week).length >= MAX_MATERIALS_PER_WEEK) {
      return res.status(409).json({ error: `한 주차에는 자료를 ${MAX_MATERIALS_PER_WEEK}개까지 등록할 수 있어요.` });
    }
    const now = nowIso();
    const material: StoredMaterial = {
      id: newMaterialId((x) => !!db.data.weekMaterials[x]),
      courseId: course.id,
      kind: "html",
      ...htmlInput,
      ...(source ? { source } : {}),
      url: "",
      position: nextPosition(list, parsed.value.week),
      createdAt: now,
      updatedAt: now,
      updatedByLabel: materialActor(req),
    };
    db.data.weekMaterials[material.id] = material;
    db.save();
    res.status(201).json(clientMaterial(material));
  });

  /** RFC 5987 값: encodeURIComponent가 남기는 ' ( ) * 까지 인코딩 (한 번만) */
  const rfc5987 = (v: string) => encodeURIComponent(v).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  /**
   * HTML 본문 열기(기본: JSON { id, title, html, updatedAt }) · ?mode=download: 완전한 HTML 문서를 첨부 파일로.
   * 내려받은 문서 맨 앞에는 charset·CSP가 있어 인터넷 없이 열어도 스크립트·외부 리소스 없이 표시된다.
   */
  api.get("/materials/:id/html", requireLogin, (req: Authed, res) =>
    void (async () => {
      try {
        let doc: WeekMaterialHtml | null = null;
        if (!useSupabase) {
          const m = db.data.weekMaterials[req.params.id];
          const readable =
            !!m && m.kind === "html" && typeof m.html === "string" &&
            (isPlatformAdmin(req) || canSeeAllMaterials(req, m.courseId) || (m.status === "published" && canReadMaterials(req, m.courseId)));
          doc = readable ? { id: m.id, title: m.title, html: m.html!, updatedAt: m.updatedAt } : null;
        } else if (isPlatformAdmin(req)) {
          if (!supa) throw new AdminDataError(503, "Supabase 서버 설정(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)이 없어요.");
          doc = await supa.materials(materialActor(req)).readHtml(req.params.id);
        } else {
          if (!req.access) throw new AdminDataError(401, "로그인이 필요해요.");
          doc = await materialOps(req.access.client, false, toUserError).readHtml(req.params.id);
        }
        if (!doc) throw new AdminDataError(404, "자료를 찾을 수 없어요.");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        if (req.query.mode === "download") {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="material.html"; filename*=UTF-8''${rfc5987(materialHtmlFileName(doc.title))}`);
          // 혹시 이 주소를 브라우저가 바로 열어도 스크립트 없는 sandbox 문서로만
          res.setHeader("Content-Security-Policy", `sandbox; ${MATERIAL_HTML_CSP}`);
          return void res.status(200).send(materialHtmlDocument(doc.title, doc.html));
        }
        res.status(200).json(doc);
      } catch (err) {
        if (err instanceof AdminDataError) return void res.status(err.status).json({ error: err.message });
        console.error("[material-html]", err instanceof Error ? err.message : "unknown error");
        res.status(500).json({ error: "HTML 자료를 열지 못했어요. 잠시 후 다시 시도해 주세요." });
      }
    })(),
  );

  /* ───────── 실시간 퀴즈 문제 세트 (6-A): 교수자·관리자 전용 (학생 진행·응답은 6-B) ───────── */
  // - 기존 학습 퀴즈(강의자료)·복습 HTML·학습 기록은 읽지도 바꾸지도 않는다.
  // - 열람: 그 과목 자료를 비공개 포함 볼 수 있는 교수자 / 저장·삭제: 담당(관리자, 운영 중 담당 분반) — Supabase는 DB 함수가 최종 확인
  // - 같은 과목의 실시간 문제끼리 완전 중복(보기 순서만 다른 것 포함)은 저장 거부, 동시 편집은 version으로 막는다.

  type LiveQuizOps = ReturnType<typeof liveQuizOps>;
  const viaLiveQuiz = (req: Authed, res: Response, status: number, work: (ops: LiveQuizOps) => Promise<unknown>) =>
    isPlatformAdmin(req)
      ? void viaSupabase(res.status(status), (st) => work(st.liveQuiz(materialActor(req))))
      : void viaUser(req, res.status(status), (a) => work(liveQuizOps(a.client, false, toUserError)));
  const newLiveId = (prefix: string, exists: (id: string) => boolean) => {
    for (let i = 0; i < 20; i++) {
      const id = `${prefix}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      if (!exists(id)) return id;
    }
    throw new Error("id를 만들지 못했어요.");
  };
  /** JSON 모드: 같은 과목의 다른 세트와 완전 중복인 문제 번호 (없으면 -1) */
  const liveDuplicateIndex = (courseId: string, setId: string | null, questions: { question: string; options: string[] }[]) => {
    const others = new Set(
      Object.values(db.data.liveQuizSets)
        .filter((s) => s.courseId === courseId && s.id !== setId)
        .flatMap((s) => s.questions.map(quizKey)),
    );
    return questions.findIndex((q) => others.has(quizKey(q)));
  };
  /** JSON 모드 저장 (새 세트 또는 수정) */
  const saveLiveSetJson = (req: Authed, courseId: string, prev: LiveQuizSet | null, body: unknown): { status: number; body: unknown } => {
    const course = db.data.courses[courseId];
    if (!course) return { status: 404, body: { error: "강의를 찾을 수 없어요." } };
    const { version, ...rest } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const parsed = parseLiveQuizSetInput(rest, course.weekCount);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const input = parsed.value;
    if (prev && version !== prev.version) {
      return { status: 409, body: { error: "다른 곳에서 이 문제 세트를 먼저 저장했어요. 새로고침한 뒤 다시 편집해 주세요." } };
    }
    if (input.lessonId && db.data.lessons[input.lessonId]?.courseId !== course.id) {
      return { status: 400, body: { error: "같은 과목의 강의자료만 연결할 수 있어요." } };
    }
    const dup = liveDuplicateIndex(course.id, prev?.id ?? null, input.questions);
    if (dup >= 0) {
      return { status: 409, body: { error: `${dup + 1}번 문제와 같은 문제(보기 순서만 다른 경우 포함)가 이 과목의 실시간 문제 세트에 이미 있어요.` } };
    }
    const prevIds = new Set(prev?.questions.map((q) => q.id) ?? []);
    const used = new Set<string>();
    const allIds = new Set(Object.values(db.data.liveQuizSets).flatMap((s) => s.questions.map((q) => q.id)));
    const questions = input.questions.map((q) => {
      const id = q.id && prevIds.has(q.id) && !used.has(q.id) ? q.id : newLiveId("lq-", (x) => allIds.has(x) || used.has(x));
      used.add(id);
      return { id, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation, origin: q.origin };
    });
    const now = nowIso();
    const next: LiveQuizSet = {
      id: prev?.id ?? newLiveId("livequiz-", (x) => !!db.data.liveQuizSets[x]),
      courseId: course.id,
      week: input.week,
      lessonId: input.lessonId ?? null,
      title: input.title,
      status: input.status ?? "draft",
      questions,
      version: (prev?.version ?? 0) + 1,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      updatedByLabel: materialActor(req),
    };
    db.data.liveQuizSets[next.id] = next;
    db.save();
    return { status: prev ? 200 : 201, body: next };
  };
  /**
   * 그 과목 강의자료의 학습 퀴즈(강의자료 퀴즈 + 정답이 정해진 교수자 초안 퀴즈)와 완전 중복인 문제를 찾는다.
   * 화면 검사와 별개로 서버가 확인한다. Supabase는 service-role로 강의자료를 읽어 키만 비교한다(응답에는 넣지 않는다).
   */
  const lessonQuizDuplicate = async (courseId: string, questions: LiveQuizSetInput["questions"]) => {
    const lessons = useSupabase ? (supa ? await supa.listLessons(courseId) : []) : lessonsForCourse(db.data.lessons, courseId);
    const keys = new Map<string, string>();
    for (const l of lessons) for (const q of resolveLessonContent(l).quiz) keys.set(quizKey(q), `${l.week}주차 학습 퀴즈`);
    const i = questions.findIndex((q) => keys.has(quizKey(q)));
    return i < 0 ? null : `${i + 1}번 문제는 ${keys.get(quizKey(questions[i]))}와 같은 문제예요. (보기 순서만 다른 경우 포함) 수정하거나 지운 뒤 저장해 주세요.`;
  };
  /** Supabase: 편집 권한이 확인된 경우에만 학습 퀴즈 중복을 검사한다 (권한이 없으면 RPC가 거부하므로 정보가 새지 않게) */
  const assertNoLessonDuplicate = async (req: Authed, courseId: string | null, questions: LiveQuizSetInput["questions"]) => {
    if (!courseId || !(await canEditMaterials(req, courseId))) return;
    const dup = await lessonQuizDuplicate(courseId, questions);
    if (dup) throw new AdminDataError(409, dup);
  };
  const liveSort = (list: LiveQuizSet[]) => [...list].sort((a, b) => a.week - b.week || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  /** JSON 모드 저장 응답: 입력 검사 뒤 학습 퀴즈 중복(서버)을 확인하고 저장 */
  const respondLiveSave = async (req: Authed, res: Response, courseId: string, prev: LiveQuizSet | null) => {
    const course = db.data.courses[courseId];
    const { version: _v, ...rest } = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const parsed = course ? parseLiveQuizSetInput(rest, course.weekCount) : null;
    if (parsed?.ok) {
      const dup = await lessonQuizDuplicate(courseId, parsed.value.questions);
      if (dup) return void res.status(409).json({ error: dup });
    }
    const r = saveLiveSetJson(req, courseId, prev, req.body);
    res.status(r.status).json(r.body);
  };

  /** 과목의 실시간 퀴즈 세트 (문제 포함) — 교수자·관리자만 */
  api.get("/courses/:id/live-quiz-sets", requireLogin, (req: Authed, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (useSupabase) {
      if (!isPlatformAdmin(req) && !isStaff(req)) return res.status(404).json({ error: "강의를 찾을 수 없어요." });
      return viaLiveQuiz(req, res, 200, (ops) => ops.list(req.params.id));
    }
    if (!db.data.courses[req.params.id] || !canSeeAllMaterials(req, req.params.id)) return res.status(404).json({ error: "강의를 찾을 수 없어요." });
    res.json(liveSort(Object.values(db.data.liveQuizSets).filter((s) => s.courseId === req.params.id)));
  });

  /** 새 세트. body: { week, lessonId?, title, status?, questions[] } */
  api.post("/courses/:id/live-quiz-sets", requireLogin, (req: Authed, res) => {
    if (useSupabase) {
      const { version: _v, ...rest } = (req.body ?? {}) as Record<string, unknown>;
      const parsed = parseLiveQuizSetInput(rest, MAX_WEEK_COUNT);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      return viaLiveQuiz(req, res, 201, async (ops) => {
        await assertNoLessonDuplicate(req, req.params.id, parsed.value.questions);
        return ops.save(req.params.id, null, parsed.value, null);
      });
    }
    if (!db.data.courses[req.params.id]) return res.status(404).json({ error: "강의를 찾을 수 없어요." });
    if (!canManageCourse(req, req.params.id)) return res.status(403).json({ error: "담당 강의의 문제 세트만 저장할 수 있어요." });
    void respondLiveSave(req, res, req.params.id, null);
  });

  /** 세트 수정 (통째로). body: { version(편집을 시작한 버전), week, lessonId?, title, status?, questions[] } */
  api.put("/live-quiz-sets/:id", requireLogin, (req: Authed, res) => {
    if (useSupabase) {
      const { version, ...rest } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof version !== "number" || !Number.isInteger(version)) return res.status(400).json({ error: "편집을 시작한 버전(version)을 함께 보내 주세요." });
      const parsed = parseLiveQuizSetInput(rest, MAX_WEEK_COUNT);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      return viaLiveQuiz(req, res, 200, async (ops) => {
        await assertNoLessonDuplicate(req, supa ? await supa.liveQuizCourseOf(req.params.id) : null, parsed.value.questions);
        return ops.save(null, req.params.id, parsed.value, version);
      });
    }
    const prev = db.data.liveQuizSets[req.params.id];
    if (!prev || !canManageCourse(req, prev.courseId)) return res.status(404).json({ error: "문제 세트를 찾을 수 없어요." });
    void respondLiveSave(req, res, prev.courseId, prev);
  });

  api.delete("/live-quiz-sets/:id", requireLogin, (req: Authed, res) => {
    if (useSupabase) return viaLiveQuiz(req, res, 200, (ops) => ops.remove(req.params.id));
    const prev = db.data.liveQuizSets[req.params.id];
    if (!prev || !canManageCourse(req, prev.courseId)) return res.status(404).json({ error: "문제 세트를 찾을 수 없어요." });
    delete db.data.liveQuizSets[prev.id];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 실시간 퀴즈 세션 (6-B): 교수자 진행 · 학생 참여·응답 ───────── */
  // - 교수자: 운영 중 과목의 운영 중 담당 분반에서 준비 완료 세트로 시작. 관리자 계정은 진행하지 않는다(교수자 계정으로).
  // - 학생: 그 분반 수강생(승인)만 참여 코드로 참여. 정답·해설은 '정답 공개' 상태에서만 학생 응답에 들어간다.
  // - 동기화: 상태가 바뀌면 Supabase Realtime Broadcast로 '버전이 바뀌었다'는 신호만 보낸다(데이터 없음). 화면은 신호를 받으면
  //   이 API로 다시 읽고, 신호가 없어도 짧은 간격으로 다시 읽는다(폴링 fallback). 기록·권한 판단은 항상 서버·DB.

  const LIVE_ACTIONS: readonly LiveAction[] = ["next", "close", "reveal", "end"];
  /** Realtime Broadcast 신호 (Supabase 모드만, 실패해도 무시 — 화면이 폴링으로 맞춘다). 내용은 버전 번호뿐.
   *  Vercel 서버리스는 응답 뒤 작업이 끊길 수 있어 응답 전에 기다린다(최대 1.5초). */
  const signalLive = async (sessionId: string, version: number): Promise<void> => {
    if (!useSupabase || !env.supabaseUrl || !env.supabaseServiceRoleKey) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    await fetch(`${env.supabaseUrl.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { apikey: env.supabaseServiceRoleKey, Authorization: `Bearer ${env.supabaseServiceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: `live-quiz-${sessionId}`, event: "state", payload: { v: version }, private: false }] }),
    })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
  };
  type LiveSessionOps = ReturnType<typeof liveSessionOps>;
  /** Supabase 사용자 경로 (교수자·학생 모두 본인 token). 관리자 계정은 auth 사용자가 아니어서 진행·참여할 수 없다 */
  const viaLive = (req: Authed, res: Response, status: number, work: (ops: LiveSessionOps) => Promise<unknown>) => {
    res.setHeader("Cache-Control", "no-store");
    if (isPlatformAdmin(req)) return void res.status(403).json({ error: "실시간 퀴즈는 교수자 계정으로 진행해 주세요." });
    return void viaUser(req, res.status(status), (a) => work(liveSessionOps(a.client, toUserError)));
  };
  /* JSON 모드 권한 */
  const canHostSection = (req: Authed, sectionId: string) => {
    const section = db.data.sections[sectionId];
    return (
      !isPlatformAdmin(req) && isStaff(req) && !!section && section.status === "active" &&
      db.data.courses[section.courseId]?.status === "active" &&
      instructorSections(req.user!.email, true).some((s) => s.id === sectionId)
    );
  };
  const isLiveLearner = (req: Authed, s: StoredLiveSession) =>
    !!req.user && !isStaff(req) && isApproved(req) && db.data.courses[s.courseId]?.status === "active" &&
    enrollmentsForUser(db.data.enrollments, req.user.id).some((e) => e.sectionId === s.sectionId);
  const newJoinCode = () => {
    for (let i = 0; i < 50; i++) {
      const code = Array.from(randomUUID().replace(/-/g, "").slice(0, 6), (h) => JOIN_CODE_ALPHABET[parseInt(h, 16) % 32]).join("");
      if (!Object.values(db.data.liveSessions).some((s) => s.status === "active" && s.joinCode === code)) return code;
    }
    throw new Error("참여 코드를 만들지 못했어요.");
  };
  const touchLive = (s: StoredLiveSession) => {
    s.version += 1;
    s.updatedAt = nowIso();
  };

  /** 세션 시작. body: { setId, sectionId } */
  api.post("/live/sessions", requireLogin, (req: Authed, res) => {
    const setId = typeof req.body?.setId === "string" ? req.body.setId : "";
    const sectionId = typeof req.body?.sectionId === "string" ? req.body.sectionId : "";
    if (!setId || !sectionId) return res.status(400).json({ error: "문제 세트와 분반을 골라 주세요." });
    if (useSupabase) return viaLive(req, res, 201, async (ops) => {
      const st = await ops.start(setId, sectionId);
      await signalLive(st.id, st.version);
      return st;
    });
    res.setHeader("Cache-Control", "no-store");
    if (isPlatformAdmin(req)) return res.status(403).json({ error: "실시간 퀴즈는 교수자 계정으로 진행해 주세요." });
    const set = db.data.liveQuizSets[setId];
    if (!set) return res.status(404).json({ error: "문제 세트를 찾을 수 없어요." });
    const section = db.data.sections[sectionId];
    if (!section || section.courseId !== set.courseId) return res.status(400).json({ error: "이 문제 세트의 과목 분반을 골라 주세요." });
    if (!canHostSection(req, sectionId) || !canManageCourse(req, set.courseId)) {
      return res.status(403).json({ error: "운영 중인 담당 분반에서만 실시간 퀴즈를 시작할 수 있어요." });
    }
    if (set.status !== "ready") return res.status(400).json({ error: "준비 완료로 저장한 문제 세트만 시작할 수 있어요." });
    if (Object.values(db.data.liveSessions).some((s) => s.sectionId === sectionId && s.status === "active")) {
      return res.status(409).json({ error: "이 분반에 진행 중인 실시간 퀴즈가 있어요. 그 세션을 이어서 진행하거나 종료해 주세요." });
    }
    const now = nowIso();
    let id = "";
    do id = `lqs-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    while (db.data.liveSessions[id]);
    const session: StoredLiveSession = {
      id,
      courseId: set.courseId,
      sectionId,
      setId: set.id,
      title: set.title,
      questions: set.questions.map((q) => ({ id: q.id, question: q.question, options: [...q.options], answer: q.answer, explanation: q.explanation })),
      joinCode: newJoinCode(),
      status: "active",
      currentIndex: null,
      phase: "waiting",
      version: 1,
      createdByLabel: materialActor(req),
      createdAt: now,
      updatedAt: now,
      endedAt: null,
      participants: {},
      responses: {},
    };
    db.data.liveSessions[id] = session;
    db.save();
    res.status(201).json(liveHostState(session));
  });

  /** 진행 제어. body: { action: next|close|reveal|end, version(지금 화면의 버전) } */
  api.post("/live/sessions/:id/control", requireLogin, (req: Authed, res) => {
    const action = req.body?.action as LiveAction;
    const version = req.body?.version;
    if (!LIVE_ACTIONS.includes(action) || typeof version !== "number" || !Number.isInteger(version)) {
      return res.status(400).json({ error: "진행 동작과 버전을 확인해 주세요." });
    }
    if (useSupabase) return viaLive(req, res, 200, async (ops) => {
      const st = await ops.control(req.params.id, action, version);
      await signalLive(st.id, st.version);
      return st;
    });
    res.setHeader("Cache-Control", "no-store");
    const s = db.data.liveSessions[req.params.id];
    if (!s || !canHostSection(req, s.sectionId)) return res.status(404).json({ error: "세션을 찾을 수 없어요." });
    if (s.status !== "active") return res.status(400).json({ error: "이미 종료된 세션이에요." });
    if (version !== s.version) return res.status(409).json({ error: "다른 화면에서 진행 상태가 먼저 바뀌었어요. 화면을 새로 불러왔어요." });
    const next = nextLiveState(s, action);
    if (!next.ok) return res.status(400).json({ error: next.error });
    s.phase = next.phase;
    s.currentIndex = next.currentIndex;
    if (next.status === "ended") {
      s.status = "ended";
      s.endedAt = nowIso();
    }
    touchLive(s);
    db.save();
    res.json(liveHostState(s));
  });

  /** 교수자 화면 상태 (새로고침 복구·폴링) */
  api.get("/live/sessions/:id/host", requireLogin, (req: Authed, res) => {
    if (useSupabase) return viaLive(req, res, 200, (ops) => ops.hostState(req.params.id));
    res.setHeader("Cache-Control", "no-store");
    const s = db.data.liveSessions[req.params.id];
    if (!s || !canHostSection(req, s.sectionId)) return res.status(404).json({ error: "세션을 찾을 수 없어요." });
    res.json(liveHostState(s));
  });

  /** 이 과목에서 내가 진행 중인 세션 (새로고침 뒤 이어서 진행) */
  api.get("/courses/:id/live/sessions", requireLogin, (req: Authed, res) => {
    if (useSupabase) return viaLive(req, res, 200, (ops) => ops.hostSessions(req.params.id));
    res.setHeader("Cache-Control", "no-store");
    res.json(
      Object.values(db.data.liveSessions)
        .filter((s) => s.courseId === req.params.id && s.status === "active" && canHostSection(req, s.sectionId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((s) => ({ id: s.id, sectionId: s.sectionId, title: s.title, joinCode: s.joinCode, phase: s.phase, currentIndex: s.currentIndex, total: s.questions.length, createdAt: s.createdAt })),
    );
  });

  /** 학생 참여. body: { code } — 코드가 없거나 수강생이 아니면 똑같이 404 (세션이 있는지 알리지 않는다) */
  api.post("/live/join", requireLogin, (req: Authed, res) => {
    const code = normalizeJoinCode(req.body?.code);
    const NOT_FOUND = "참여 코드를 찾을 수 없어요. 코드와 수강 중인 분반을 확인해 주세요.";
    if (!isJoinCode(code)) return res.status(404).json({ error: NOT_FOUND });
    if (useSupabase) return viaLive(req, res, 200, (ops) => ops.join(code));
    res.setHeader("Cache-Control", "no-store");
    const s = Object.values(db.data.liveSessions).find((x) => x.status === "active" && x.joinCode === code);
    if (!s || !isLiveLearner(req, s)) return res.status(404).json({ error: NOT_FOUND });
    s.participants[req.user!.id] ??= nowIso();
    db.save();
    res.json(liveStudentState(s, req.user!.id));
  });

  /** 학생 화면 상태 (참여한 수강생만) */
  api.get("/live/sessions/:id/state", requireLogin, (req: Authed, res) => {
    if (useSupabase) return viaLive(req, res, 200, (ops) => ops.studentState(req.params.id));
    res.setHeader("Cache-Control", "no-store");
    const s = db.data.liveSessions[req.params.id];
    if (!s || !s.participants[req.user!.id] || !isLiveLearner(req, s)) {
      return res.status(404).json({ error: "세션을 찾을 수 없어요. 참여 코드로 다시 참여해 주세요." });
    }
    res.json(liveStudentState(s, req.user!.id));
  });

  /** 답 제출. body: { questionIndex, choice } — 문제당 1회, 응답 접수(open) 중인 지금 문제만 */
  api.post("/live/sessions/:id/answers", requireLogin, (req: Authed, res) => {
    const questionIndex = req.body?.questionIndex;
    const choice = req.body?.choice;
    if (!Number.isInteger(questionIndex) || !Number.isInteger(choice)) return res.status(400).json({ error: "보기를 골라 주세요." });
    if (useSupabase) return viaLive(req, res, 200, async (ops) => {
      const st = await ops.submit(req.params.id, questionIndex, choice);
      await signalLive(req.params.id, st.version);
      return st;
    });
    res.setHeader("Cache-Control", "no-store");
    const s = db.data.liveSessions[req.params.id];
    if (!s || !s.participants[req.user!.id] || !isLiveLearner(req, s)) {
      return res.status(404).json({ error: "세션을 찾을 수 없어요. 참여 코드로 다시 참여해 주세요." });
    }
    if (s.status !== "active" || s.phase !== "open" || s.currentIndex !== questionIndex) {
      return res.status(409).json({ error: "지금은 이 문제에 답할 수 없어요. (응답이 마감됐거나 다음 문제로 넘어갔어요)" });
    }
    if (choice < 0 || choice >= s.questions[questionIndex].options.length) return res.status(400).json({ error: "보기를 골라 주세요." });
    const key = `${questionIndex}:${req.user!.id}`;
    if (s.responses[key]) return res.status(409).json({ error: "이미 답했어요. 문제당 한 번만 제출할 수 있어요." });
    s.responses[key] = { choice, at: nowIso() };
    db.save();
    res.json(liveStudentState(s, req.user!.id));
  });

  /* ───────── 파일 자료 (3-C): 업로드 시작 → 저장소에 직접 업로드 → 완료(검사 후 자료 행) · 짧은 열기 주소 · 고아 정리 ───────── */
  // - 저장소: JSON 모드는 DATA_DIR/uploads (이 서버의 토큰 주소), Supabase는 비공개 버킷 week-materials (서명 주소)
  // - 권한은 요청마다 서버가 확인한다: 업로드 시작·완료(편집 권한), 열기 주소 발급(열람 권한 — 학생은 수강 과목의 공개 자료만)
  // - 파일 행은 파일 크기·형식·내용(시그니처·ZIP 내부 구조) 검사를 통과한 뒤에만 만든다.

  const localFiles = useSupabase ? null : createLocalMaterialStorage(path.resolve(path.dirname(db.file), "uploads"), secret || db.data.sessionSecret);
  const removeStoredFile = (storage: MaterialStorage, key: string) =>
    storage.remove([key]).catch((e: unknown) => console.error(`[material-file] 파일 삭제 실패(고아 정리 대상) ${key}: ${String(e)}`));
  /** 파일 처리 공통 실행: AdminDataError → 그 상태, 그 밖은 500 (내용은 감춘다) */
  const runFile = async (res: Response, status: number, work: () => Promise<unknown>) => {
    try {
      const body = await work();
      res.status(status).json(body);
    } catch (err) {
      if (err instanceof AdminDataError) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error("[material-file]", err instanceof Error ? err.message : "unknown error");
      res.status(500).json({ error: "파일을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." });
    }
  };
  /** 지금 요청한 사람의 파일 처리 도구 (JSON: 로컬, Supabase: service-role) */
  const fileDeps = (): UploadDeps & { kind: "local" | "supabase" } => {
    if (!useSupabase) {
      return {
        kind: "local",
        storage: localFiles!,
        intents: {
          async create(i) {
            db.data.materialUploads[i.token] = i;
            db.save();
          },
          async get(token) {
            return db.data.materialUploads[token] ?? null;
          },
          async consume(token) {
            const i = db.data.materialUploads[token];
            if (!i || i.consumedAt) return null;
            i.consumedAt = nowIso();
            db.save();
            return i;
          },
          async remove(token) {
            delete db.data.materialUploads[token];
            db.save();
          },
          async activeKeys() {
            const now = Date.now();
            return new Set(Object.values(db.data.materialUploads).filter((i) => !i.consumedAt && Date.parse(i.expiresAt) > now).map((i) => i.storageKey));
          },
          async purgeOld() {
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            let n = 0;
            for (const i of Object.values(db.data.materialUploads)) {
              if ((i.consumedAt && Date.parse(i.consumedAt) < cutoff) || Date.parse(i.expiresAt) < cutoff) {
                delete db.data.materialUploads[i.token];
                n++;
              }
            }
            if (n) db.save();
            return n;
          },
        },
        records: {
          async insert(i) {
            const course = db.data.courses[i.courseId];
            if (!course || !i.input) throw new AdminDataError(404, "강의를 찾을 수 없어요.");
            if (i.input.week > course.weekCount) throw new AdminDataError(400, `주차는 1~${course.weekCount}주차 중에서 골라 주세요.`);
            const list = materialsForCourse(db.data.weekMaterials, course.id);
            if (list.filter((m) => m.week === i.input!.week).length >= MAX_MATERIALS_PER_WEEK) {
              throw new AdminDataError(409, `한 주차에는 자료를 ${MAX_MATERIALS_PER_WEEK}개까지 등록할 수 있어요.`);
            }
            const now = nowIso();
            const material: StoredMaterial = {
              id: newMaterialId((x) => !!db.data.weekMaterials[x]),
              courseId: course.id,
              kind: "file",
              ...i.input,
              url: "",
              fileName: i.fileName,
              mimeType: i.mimeType,
              sizeBytes: i.sizeBytes,
              storagePath: i.storageKey,
              position: nextPosition(list, i.input.week),
              createdAt: now,
              updatedAt: now,
              updatedByLabel: i.actorLabel,
            };
            db.data.weekMaterials[material.id] = material;
            db.save();
            return clientMaterial(material);
          },
          async replace(i) {
            const prev = db.data.weekMaterials[i.materialId ?? ""];
            if (!prev || prev.kind !== "file") throw new AdminDataError(404, "파일 자료를 찾을 수 없어요.");
            if (prev.courseId !== i.courseId) throw new AdminDataError(409, "자료의 강의가 바뀌었어요. 다시 시도해 주세요.");
            const next: StoredMaterial = {
              ...prev,
              fileName: i.fileName,
              mimeType: i.mimeType,
              sizeBytes: i.sizeBytes,
              storagePath: i.storageKey,
              updatedAt: nowIso(),
              updatedByLabel: i.actorLabel,
            };
            db.data.weekMaterials[prev.id] = next;
            db.save();
            return { material: clientMaterial(next), oldKey: prev.storagePath ?? null };
          },
          async referencedKeys() {
            return new Set(Object.values(db.data.weekMaterials).flatMap((m) => (m.storagePath ? [m.storagePath] : [])));
          },
        },
      };
    }
    if (!supa) throw new AdminDataError(503, "Supabase 서버 설정(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)이 없어요.");
    const f = supa.materialFiles();
    return { kind: "supabase", storage: f.storage, intents: f.intents, records: f.records };
  };
  /** 파일 자료 정보 (저장 경로 포함, 서버 내부용) */
  const fileRowOf = async (id: string) => {
    if (!useSupabase) {
      const m = db.data.weekMaterials[id];
      return m ? { id: m.id, courseId: m.courseId, kind: m.kind, status: m.status, storagePath: m.storagePath ?? null, fileName: m.fileName ?? null, mimeType: m.mimeType ?? null } : null;
    }
    if (!supa) throw new AdminDataError(503, "Supabase 서버 설정(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)이 없어요.");
    return supa.materialFiles().fileRow(id);
  };
  /** 그 과목 자료를 편집할 수 있는지 (요청마다 확인) */
  const canEditMaterials = async (req: Authed, courseId: string) => {
    if (!useSupabase) return canManageCourse(req, courseId);
    if (isPlatformAdmin(req)) return !!(await supa?.getCourse(courseId));
    if (!req.access || !isStaff(req)) return false;
    const r = await req.access.client.rpc("can_manage_course", { p_course_id: courseId });
    if (r.error) throw toUserError(r.error);
    return r.data === true;
  };
  const actorOf = (req: Authed) => ({
    actorKey: isPlatformAdmin(req) ? "admin" : req.user!.id,
    actorId: isPlatformAdmin(req) || !useSupabase ? null : (req.access?.userId ?? null),
    actorLabel: materialActor(req),
  });
  const weekCountOf = async (courseId: string) =>
    useSupabase ? ((await supa?.getCourse(courseId))?.weekCount ?? null) : (db.data.courses[courseId]?.weekCount ?? null);
  const countInWeek = async (courseId: string, week: number) =>
    useSupabase
      ? await supa!.materialFiles().countInWeek(courseId, week)
      : materialsForCourse(db.data.weekMaterials, courseId).filter((m) => m.week === week).length;
  /** 업로드 의도를 기록하고 업로드 주소를 준다 (주소를 만들지 못하면 의도도 지운다) */
  const startUpload = async (deps: UploadDeps, intent: UploadIntent) => {
    await deps.intents.create(intent);
    try {
      const up = await deps.storage.createUpload(intent.storageKey, intent.mimeType, intent.token);
      return { token: intent.token, uploadUrl: up.uploadUrl, headers: up.headers, expiresAt: intent.expiresAt, fileName: intent.fileName, mimeType: intent.mimeType };
    } catch (e) {
      await deps.intents.remove(intent.token).catch(() => undefined);
      throw e;
    }
  };
  const newIntent = (req: Authed, courseId: string, materialId: string | null, meta: { fileName: string; mimeType: string; sizeBytes: number }, input: UploadIntent["input"]): UploadIntent => {
    const now = Date.now();
    return {
      token: randomUUID(),
      courseId,
      materialId,
      storageKey: newStorageKey(courseId, meta.fileName),
      ...meta,
      input,
      ...actorOf(req),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + UPLOAD_INTENT_MS).toISOString(),
      consumedAt: null,
    };
  };

  /** 새 파일 자료 업로드 시작. body: { week, title, description?, status?, fileName, mimeType, sizeBytes } */
  api.post("/courses/:id/materials/uploads", requireLogin, (req: Authed, res) =>
    void runFile(res, 201, async () => {
      const courseId = req.params.id;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const deps = fileDeps();
      const weekCount = await weekCountOf(courseId);
      if (weekCount === null) throw new AdminDataError(404, "강의를 찾을 수 없어요.");
      if (!(await canEditMaterials(req, courseId))) throw new AdminDataError(403, "담당 강의의 자료만 올릴 수 있어요.");
      const { fileName: _f, mimeType: _m, sizeBytes: _s, ...rest } = body;
      const input = parseMaterialFileInput(rest, weekCount);
      if (!input.ok) throw new AdminDataError(400, input.error);
      const meta = parseFileMeta(body);
      if (!meta.ok) throw new AdminDataError(400, meta.error);
      if ((await countInWeek(courseId, input.value.week)) >= MAX_MATERIALS_PER_WEEK) {
        throw new AdminDataError(409, `한 주차에는 자료를 ${MAX_MATERIALS_PER_WEEK}개까지 등록할 수 있어요.`);
      }
      return startUpload(deps, newIntent(req, courseId, null, meta.value, input.value));
    }),
  );

  /** 파일 자료의 파일 교체 시작. body: { fileName, mimeType, sizeBytes } — 완료하면 옛 파일은 지운다. */
  api.post("/materials/:id/uploads", requireLogin, (req: Authed, res) =>
    void runFile(res, 201, async () => {
      const deps = fileDeps();
      const row = await fileRowOf(req.params.id);
      if (!row || row.kind !== "file") throw new AdminDataError(404, "파일 자료를 찾을 수 없어요.");
      if (!(await canEditMaterials(req, row.courseId))) throw new AdminDataError(404, "파일 자료를 찾을 수 없어요.");
      const meta = parseFileMeta((req.body ?? {}) as Record<string, unknown>);
      if (!meta.ok) throw new AdminDataError(400, meta.error);
      return startUpload(deps, newIntent(req, row.courseId, row.id, meta.value, null));
    }),
  );

  /** JSON 모드 전용: 업로드 받기 (Supabase는 브라우저가 서명 주소로 저장소에 직접 올린다) */
  api.put(
    "/material-uploads/:token",
    requireLogin,
    express.raw({ type: () => true, limit: MATERIAL_FILE_MAX_BYTES + 1024 }),
    (req: Authed, res) =>
      void runFile(res, 200, async () => {
        if (useSupabase || !localFiles) throw new AdminDataError(404, "업로드 주소를 찾을 수 없어요.");
        const intent = db.data.materialUploads[req.params.token];
        if (!intent || intent.actorKey !== actorOf(req).actorKey || intent.consumedAt) throw new AdminDataError(404, "업로드 주소를 찾을 수 없어요.");
        if (Date.parse(intent.expiresAt) < Date.now()) throw new AdminDataError(410, "업로드 시간이 지났어요. 파일을 다시 올려 주세요.");
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (body.length < 1 || body.length > MATERIAL_FILE_MAX_BYTES) throw new AdminDataError(400, "파일 크기가 올바르지 않아요.");
        localFiles.write(intent.storageKey, body);
        return { ok: true };
      }),
  );

  /** 업로드 완료: 같은 사람·만료·중복·권한을 다시 확인하고, 파일을 검사한 뒤 자료 행을 만든다(또는 파일을 바꾼다) */
  api.post("/material-uploads/:token/complete", requireLogin, (req: Authed, res) =>
    void runFile(res, 200, async () => {
      const deps = fileDeps();
      return completeUpload(deps, req.params.token, actorOf(req).actorKey, async (intent) => {
        if (intent.materialId) {
          const row = await fileRowOf(intent.materialId);
          if (!row || row.kind !== "file" || row.courseId !== intent.courseId) return false;
        }
        return canEditMaterials(req, intent.courseId);
      });
    }),
  );

  /**
   * 파일 열기·내려받기 주소 (60초). ?mode=preview: PDF·이미지만 브라우저에서 열기, 그 밖은 내려받기.
   * 요청마다 권한을 확인한다: 편집·담당 교수자는 비공개 포함, 학생은 수강 중인 과목의 공개 자료만.
   */
  api.get("/materials/:id/file", requireLogin, (req: Authed, res) =>
    void runFile(res, 200, async () => {
      const deps = fileDeps();
      let file: { courseId: string; storagePath: string | null; fileName: string | null; mimeType: string | null } | null = null;
      if (!useSupabase || isPlatformAdmin(req)) {
        const row = await fileRowOf(req.params.id);
        const readable =
          row &&
          row.kind === "file" &&
          (isPlatformAdmin(req) || canSeeAllMaterials(req, row.courseId) || (row.status === "published" && canReadMaterials(req, row.courseId)));
        file = readable ? row : null;
      } else {
        if (!req.access) throw new AdminDataError(401, "로그인이 필요해요.");
        const r = await req.access.client.rpc("week_material_download", { p_material_id: req.params.id });
        if (r.error) throw toUserError(r.error);
        const row = (Array.isArray(r.data) ? r.data[0] : r.data) as Record<string, unknown> | undefined;
        const course = typeof row?.storage_path === "string" ? row.storage_path.split("/")[0] : "";
        file = row ? { courseId: course, storagePath: (row.storage_path as string) ?? null, fileName: (row.file_name as string) ?? null, mimeType: (row.mime_type as string) ?? null } : null;
      }
      if (!file || !file.storagePath || !file.fileName || !file.mimeType || !isCourseKey(file.courseId, file.storagePath)) {
        throw new AdminDataError(404, "파일을 찾을 수 없어요.");
      }
      const preview = req.query.mode === "preview" && isPreviewable(file.mimeType);
      const url = await deps.storage.signedUrl(file.storagePath, { download: preview ? null : file.fileName, mime: file.mimeType });
      return { url, mode: preview ? "preview" : "download", expiresIn: DOWNLOAD_URL_SECONDS };
    }),
  );

  /** JSON 모드 전용: 짧은 토큰으로 파일 보내기 (토큰에 경로·만료·내려받기 이름이 서명돼 있다) */
  api.get("/material-files/:token", (req, res) => {
    const t = localFiles?.verify(req.params.token);
    if (!t || !existsSync(t.file)) return res.status(404).json({ error: "주소가 만료됐거나 파일이 없어요. 다시 열어 주세요." });
    res.setHeader("Content-Type", t.m);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", t.d ? `attachment; filename*=UTF-8''${encodeURIComponent(t.d)}` : "inline");
    createReadStream(t.file).pipe(res);
  });

  /** 관리자: 고아 파일 정리. 기본은 미리 보기(dry-run). body { confirm: true }일 때만 지운다. */
  api.post("/materials/cleanup", requireAdminMode, (req: Authed, res) =>
    void runFile(res, 200, async () => cleanupOrphans(fileDeps(), req.body?.confirm === true)),
  );

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
    if (!isEnrollableCourse(course)) return res.status(404).json({ error: "운영 중인 과목에만 분반을 만들 수 있어요." });
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
    // 비활성 과목의 기존 분반에도 교수자를 새로 배정할 수 있다. (기존 자료 과목은 분반이 없다)
    if (!s || !isVisibleCourse(db.data.courses[s.courseId])) return res.status(404).json({ error: "분반을 찾을 수 없어요." });
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
    if (!s || s.status !== "active" || !isEnrollableCourse(course)) {
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
        : isVisibleCourse(course) && managedSectionIds(req, course.id).size > 0
      : isVisibleCourse(course) && learnerCourseIds(req.user!.id).has(course.id);
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
    if (!section || section.status !== "active" || !isEnrollableCourse(course)) {
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

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
  const secret = env.sessionSecret || db.data.sessionSecret;
  const sign = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

  const readSession = (req: Request): Session | null => {
    const raw = (req.headers.cookie ?? "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (!raw) return null;
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

  type Authed = Request & { user?: SessionUser };

  const withUser = (req: Authed, _res: Response, next: NextFunction) => {
    req.user = sessionUser(readSession(req)) ?? undefined;
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
    new Set(
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
      : isStaff(req) && instructorSections(req.user!.email, true).some((s) => s.courseId === courseId);
  /** 교수자가 수강생 기록을 볼 수 있는 (과목, 학생) 쌍: 담당 분반 수강생 × 그 분반의 과목 */
  const visibleStudentPairs = (req: Authed) =>
    new Set(
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
      adminLoginEnabled: !!(env.adminId && env.adminPassword),
    };
    res.json(body);
  });

  /* ───────── 로그인 ───────── */

  api.get("/auth/me", (req: Authed, res) => {
    const s = readSession(req);
    if (s && !req.user) setSession(req, res, null); // 삭제된 회원의 쿠키 정리
    if (req.user?.member) {
      req.user.member.lastSeenAt = nowIso();
      db.save();
    }
    res.json({ user: req.user ?? null });
  });

  api.post("/auth/google", async (req: Authed, res) => {
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
    res.json(Object.values(db.data.members).sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)));
  });

  api.patch("/members/:id", requireAdminMode, (req, res) => {
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
    const all = courseId ? lessonsForCourse(db.data.lessons, courseId) : Object.values(db.data.lessons);
    if (isStaff(req)) return res.json(all.filter((l) => canManageCourse(req, l.courseId)));
    const mine = req.user ? learnerCourseIds(req.user.id) : new Set<string>();
    res.json(all.filter((l) => l.status === "published" && mine.has(l.courseId)));
  });

  /** 저장: 관리자는 모든 과목, 교수자는 담당 과목만 (원래 과목과 저장할 과목 모두 담당이어야 한다) */
  api.put("/lessons/:id", requireStaff, (req: Authed, res) => {
    const lesson = req.body as Lesson;
    if (!lesson || lesson.id !== req.params.id || typeof lesson.week !== "number") {
      return res.status(400).json({ error: "강의자료 형식이 올바르지 않아요." });
    }
    const prev = db.data.lessons[lesson.id];
    // 과목 정보가 없는 이전 화면의 저장은 원래 과목(없으면 기존 자료)으로 둔다.
    const courseId = lesson.courseId || prev?.courseId || LEGACY_COURSE_ID;
    if (!db.data.courses[courseId]) return res.status(400).json({ error: "없는 과목이에요." });
    if (!canManageCourse(req, courseId) || (prev && !canManageCourse(req, prev.courseId))) {
      return res.status(403).json({ error: "담당 강의의 학습자료만 저장할 수 있어요." });
    }
    const saved = { ...lesson, courseId, updatedAt: nowIso() };
    db.data.lessons[lesson.id] = saved;
    db.save();
    res.json(saved);
  });

  api.delete("/lessons/:id", requireStaff, (req: Authed, res) => {
    const prev = db.data.lessons[req.params.id];
    if (!prev) return res.json({ ok: true });
    if (!canManageCourse(req, prev.courseId)) {
      return res.status(403).json({ error: "담당 강의의 학습자료만 삭제할 수 있어요." });
    }
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
    // 수강 중인 과목의 공개 강의자료만 기록한다.
    const lesson = db.data.lessons[p.lessonId];
    if (!lesson || lesson.status !== "published" || !learnerCourseIds(req.user!.id).has(lesson.courseId)) {
      return res.status(403).json({ error: "수강 중인 강의의 학습만 기록돼요." });
    }
    db.data.progress[`${p.userId}::${p.lessonId}`] = p;
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 피드백 (관리자) ───────── */

  // 피드백은 전체 회원 정보를 쓰므로 관리자만
  api.get("/feedback", requireAdminMode, (_req, res) => res.json(Object.values(db.data.feedback)));

  api.put("/feedback/:id", requireAdminMode, (req, res) => {
    const draft = req.body as FeedbackDraft;
    if (!draft || draft.id !== req.params.id) return res.status(400).json({ error: "형식이 올바르지 않아요." });
    const saved = { ...draft, updatedAt: nowIso() };
    db.data.feedback[draft.id] = saved;
    db.save();
    res.json(saved);
  });

  api.delete("/feedback/:id", requireAdminMode, (req, res) => {
    delete db.data.feedback[req.params.id];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 교수자 이메일 (관리자) ───────── */

  api.get("/instructors", requireAdminMode, (_req, res) => {
    const initial = env.initialInstructorEmail;
    const local = Object.values(db.data.instructors).filter((r) => r.email !== initial);
    res.json(initial ? [{ email: initial, source: "env", addedBy: null, addedAt: null }, ...local] : local);
  });

  api.post("/instructors", requireAdminMode, (req: Authed, res) => {
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
    delete db.data.instructors[normalizeEmail(req.params.email)];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── AI 학습 콘텐츠 생성 (본인 API 키 연결) ───────── */

  const aiKey = () => db.data.anthropicApiKey || env.anthropicApiKey;

  api.get("/ai/status", requireStaff, (_req, res) => {
    const key = aiKey();
    res.json({
      connected: !!key,
      source: db.data.anthropicApiKey ? "app" : env.anthropicApiKey ? "env" : null,
      hint: key ? `…${key.slice(-4)}` : null,
      model: AI_MODEL,
    });
  });

  // 키 연결·해제는 관리자 모드에서만. 키 값은 저장만 하고 다시 내려보내지 않는다.
  api.put("/ai/key", requireAdminMode, async (req, res) => {
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
    delete db.data.anthropicApiKey;
    db.save();
    res.json({ ok: true });
  });

  api.post("/ai/draft", requireStaff, async (req, res) => {
    const key = aiKey();
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
    const all = Object.values(db.data.courses);
    if (isPlatformAdmin(req)) return res.json(all.map((c) => courseOverview(req, c)));
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
    const key = sectionInstructorKey(req.params.id, normalizeEmail(req.params.email));
    if (db.data.sectionInstructors[key]) {
      delete db.data.sectionInstructors[key];
      db.save();
    }
    res.json({ ok: true });
  });

  /** 분반 강의코드로 과목·분반 미리 보기 (참여 링크 화면). 운영 중인 분반만. */
  api.get("/courses/lookup", (req, res) => {
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

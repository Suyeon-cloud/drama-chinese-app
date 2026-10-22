// 웹앱 API (/api/*). 개발 시에는 Vite 서버(npm run app)에, 배포 시에는 server/index.ts(npm start)에 붙는다.
//
// 로그인
//   - 회원: 브라우저가 Google 팝업으로 받은 access token을 보내면, 서버가 Google에 직접 확인한 뒤 로그인 쿠키를 준다.
//   - 관리자: Google 계정과 별개로 ADMIN_ID / ADMIN_PASSWORD 환경변수로 로그인한다.
// 권한
//   - 관리자(교수자)만: 회원 관리, 강의자료 저장, 전체 학습 기록, 피드백, 교수자 관리
//   - 학습자: 본인 정보·본인 학습 기록만. 관리자 승인 전에는 학습 기록을 저장할 수 없다.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { isValidEmail, normalizeEmail } from "../src/app/auth/roles";
import type {
  Enrollment,
  FeedbackDraft,
  LearnerProfile,
  LessonProgress,
  MemberProfileInput,
  PublicConfig,
  SessionUser,
} from "../src/app/store/models";
import type { Lesson } from "../src/content/types";
import type { Db } from "./db";

export type ApiEnv = {
  googleClientId: string;
  adminId: string;
  adminPassword: string;
  /** 관리자 Gmail 발송 계정 (선택) */
  adminEmail: string;
  initialInstructorEmail: string;
  sessionSecret: string;
};

/** process.env(또는 Vite loadEnv 결과)에서 설정을 읽는다. VITE_ 이름도 함께 받는다. */
export const readApiEnv = (env: Record<string, string | undefined>): ApiEnv => ({
  googleClientId: (env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || "").trim(),
  adminId: (env.ADMIN_ID || "").trim(),
  adminPassword: env.ADMIN_PASSWORD || "",
  adminEmail: normalizeEmail(env.ADMIN_EMAIL || ""),
  initialInstructorEmail: normalizeEmail(env.INITIAL_INSTRUCTOR_EMAIL || env.VITE_INITIAL_INSTRUCTOR_EMAIL || ""),
  sessionSecret: env.SESSION_SECRET || "",
});

const COOKIE = "zhuiju_sid";
const SESSION_DAYS = 30;

type Session = { k: "admin" } | { k: "google"; id: string; email: string };

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
        name: s.email.split("@")[0],
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
  const isAdmin = (req: Authed) => req.user?.role === "instructor";
  const isApproved = (req: Authed) => isAdmin(req) || req.user?.member?.status === "approved";

  const requireAdmin = (req: Authed, res: Response, next: NextFunction) =>
    isAdmin(req) ? next() : res.status(req.user ? 403 : 401).json({ error: "관리자만 사용할 수 있어요." });
  const requireLogin = (req: Authed, res: Response, next: NextFunction) =>
    req.user ? next() : res.status(401).json({ error: "로그인이 필요해요." });

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
      const session: Session = { k: "google", id: info.sub, email };

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

  api.get("/members", requireAdmin, (_req, res) => {
    res.json(Object.values(db.data.members).sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)));
  });

  api.patch("/members/:id", requireAdmin, (req, res) => {
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

  api.delete("/members/:id", requireAdmin, (req, res) => {
    const id = req.params.id;
    delete db.data.members[id];
    for (const [k, p] of Object.entries(db.data.progress)) if (p.userId === id) delete db.data.progress[k];
    for (const [k, e] of Object.entries(db.data.enrollments)) if (e.userId === id) delete db.data.enrollments[k];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 강의자료 ───────── */

  api.get("/lessons", (req: Authed, res) => {
    const all = Object.values(db.data.lessons);
    res.json(isAdmin(req) ? all : all.filter((l) => l.status === "published"));
  });

  api.put("/lessons/:id", requireAdmin, (req, res) => {
    const lesson = req.body as Lesson;
    if (!lesson || lesson.id !== req.params.id || typeof lesson.week !== "number") {
      return res.status(400).json({ error: "강의자료 형식이 올바르지 않아요." });
    }
    const saved = { ...lesson, updatedAt: nowIso() };
    db.data.lessons[lesson.id] = saved;
    db.save();
    res.json(saved);
  });

  api.delete("/lessons/:id", requireAdmin, (req, res) => {
    delete db.data.lessons[req.params.id];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 학습 기록 ───────── */

  api.get("/progress", requireLogin, (req: Authed, res) => {
    const all = Object.values(db.data.progress);
    res.json(isAdmin(req) ? all : all.filter((p) => p.userId === req.user!.id));
  });

  api.put("/progress", requireLogin, (req: Authed, res) => {
    const p = req.body as LessonProgress;
    if (!isApproved(req) || isAdmin(req)) return res.status(403).json({ error: "승인된 학습자만 기록돼요." });
    if (!p || p.userId !== req.user!.id || typeof p.lessonId !== "string") {
      return res.status(400).json({ error: "학습 기록 형식이 올바르지 않아요." });
    }
    db.data.progress[`${p.userId}::${p.lessonId}`] = p;
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 피드백 (관리자) ───────── */

  api.get("/feedback", requireAdmin, (_req, res) => res.json(Object.values(db.data.feedback)));

  api.put("/feedback/:id", requireAdmin, (req, res) => {
    const draft = req.body as FeedbackDraft;
    if (!draft || draft.id !== req.params.id) return res.status(400).json({ error: "형식이 올바르지 않아요." });
    const saved = { ...draft, updatedAt: nowIso() };
    db.data.feedback[draft.id] = saved;
    db.save();
    res.json(saved);
  });

  api.delete("/feedback/:id", requireAdmin, (req, res) => {
    delete db.data.feedback[req.params.id];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 교수자 이메일 (관리자) ───────── */

  api.get("/instructors", requireAdmin, (_req, res) => {
    const initial = env.initialInstructorEmail;
    const local = Object.values(db.data.instructors).filter((r) => r.email !== initial);
    res.json(initial ? [{ email: initial, source: "env", addedBy: null, addedAt: null }, ...local] : local);
  });

  api.post("/instructors", requireAdmin, (req: Authed, res) => {
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

  api.delete("/instructors/:email", requireAdmin, (req, res) => {
    delete db.data.instructors[normalizeEmail(req.params.email)];
    db.save();
    res.json({ ok: true });
  });

  /* ───────── 수업 · 참여 ───────── */

  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  api.get("/course", (_req, res) => {
    if (!db.data.course) {
      db.data.course = {
        code: Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join(""),
        title: "드라마로 배우는 중국어 (15주)",
        createdAt: nowIso(),
      };
      db.save();
    }
    res.json(db.data.course);
  });

  api.get("/enrollments", requireLogin, (req: Authed, res) => {
    const code = String(req.query.course ?? "");
    const list = Object.values(db.data.enrollments).filter((e) => e.courseCode === code);
    res.json(isAdmin(req) ? list : list.filter((e) => e.userId === req.user!.id));
  });

  api.post("/enrollments", requireLogin, (req: Authed, res) => {
    const u = req.user!;
    const code = typeof req.body?.courseCode === "string" ? req.body.courseCode : "";
    if (!db.data.course || db.data.course.code !== code || u.role !== "learner") {
      return res.status(400).json({ error: "수업에 참여할 수 없어요." });
    }
    const key = `${code}::${u.id}`;
    const e: Enrollment = db.data.enrollments[key] ?? {
      courseCode: code,
      userId: u.id,
      name: u.name,
      email: u.email,
      joinedAt: nowIso(),
    };
    db.data.enrollments[key] = e;
    db.save();
    res.json(e);
  });

  api.use((_req, res) => res.status(404).json({ error: "없는 API예요." }));

  return api;
};

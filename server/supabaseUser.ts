// 학생·교수자의 Supabase 로그인 확인과 권한 정보 (server-only). AUTH_BACKEND=supabase일 때 사용한다.
//
// - 브라우저가 보낸 Supabase access token(Authorization: Bearer)을 Supabase Auth에 확인한다. 서버 세션을 만들지 않는다.
// - 확인 뒤 조회는 그 사용자의 token으로 한다(anon 키 + 사용자 JWT). RLS·RPC 권한이 그대로 적용되고 service-role은 쓰지 않는다.
// - 신원은 Supabase Auth, 학생 승인은 profiles, 교수자는 instructors, 수강은 enrollments, 담당 분반은 section_instructors 기준이다.
// - 학습자료·진도 콘텐츠는 아직 db.json에 있으므로, 이 모듈은 권한 판단에 필요한 정보만 돌려준다.
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Lesson } from "../src/content/types";
import type { CourseStudent, CourseSummary, CurriculumWeek, EnrollResult, Enrollment, LearnerProfile, LessonProgress, SessionUser } from "../src/app/store/models";
import { LESSON_SELECT, lessonsFromEmbedded } from "./lessonRows";
import { PROGRESS_SELECT, progressFromRow } from "./progressRows";
import { AdminDataError, lessonConflictError, toLearner } from "./supabaseAdmin";

type Row = Record<string, unknown>;
type PgError = { code?: string; message: string; details?: string | null };

export type SupabaseAccess = {
  userId: string;
  email: string;
  isInstructor: boolean;
  profile: Row | null;
  /** 이 사용자가 볼 수 있는 운영 과목 (RLS: 담당 분반의 과목 또는 승인 학생의 수강 과목) */
  courses: Map<string, Row>;
  /** 학생: 수강 중인 운영 과목 (승인된 학생만, 교수자는 비어 있음) */
  learnerCourseIds: Set<string>;
  /** 볼 수 있는 수강 기록 (학생: 본인 / 교수자: 담당 분반) */
  enrollments: Row[];
  /** 학생이 볼 수 있는 분반 (강의코드 제외) */
  sections: Row[];
  /** 교수자: 담당 분반 (강의코드 포함, 비활성 포함, 운영 과목만) */
  mySections: Row[];
  /** 이 사용자의 token으로 요청하는 client */
  client: SupabaseClient;
};

const CACHE_MS = 15_000;

/** RPC·쿼리 오류를 화면용 상태로 바꾼다. */
export const toUserError = (e: PgError): AdminDataError => {
  if (e.code === "PT409") return lessonConflictError(e);
  if (e.code === "42501") return new AdminDataError(403, e.message);
  if (e.code === "P0002") return new AdminDataError(404, e.message);
  if (e.code === "23505") return new AdminDataError(409, e.message);
  if (e.code === "P0001" || e.code === "22023") return new AdminDataError(400, e.message);
  if (e.code === "28000") return new AdminDataError(401, "로그인이 필요해요.");
  console.error("[supabase-user]", e.code ?? "", e.message);
  return new AdminDataError(500, "Supabase 처리 중 오류가 났어요.");
};
const ok = <T>(r: { data: T | null; error: PgError | null }): NonNullable<T> => {
  if (r.error) throw toUserError(r.error);
  return (r.data ?? []) as NonNullable<T>;
};

export const createSupabaseUserResolver = (url: string, anonKey: string) => {
  const cache = new Map<string, { at: number; access: SupabaseAccess | null }>();
  const keyOf = (token: string) => createHash("sha256").update(token).digest("hex");

  const load = async (token: string): Promise<SupabaseAccess | null> => {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    // Supabase Auth 서버에 token을 확인한다. (만료·위조 token은 여기서 거부된다)
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    const uid = data.user.id;
    const [profile, instructor, courses, enrollments, sections, mySections] = await Promise.all([
      client.from("profiles").select("*").eq("id", uid).maybeSingle(),
      client.rpc("is_instructor"),
      client.from("courses").select("*"),
      client.from("enrollments").select("section_id,course_id,user_id,course_code,joined_at"),
      client.from("sections").select("id,course_id,name,status,created_at,updated_at"),
      client.rpc("my_sections"),
    ]);
    for (const r of [profile, instructor, courses, enrollments, sections, mySections]) if (r.error) throw toUserError(r.error);
    const isInstructor = instructor.data === true;
    const p = (profile.data as Row | null) ?? null;
    const approved = !!p && p.status === "approved" && !!p.profile_completed;
    const courseMap = new Map(((courses.data ?? []) as Row[]).map((c) => [String(c.id), c]));
    return {
      userId: uid,
      email: (data.user.email ?? "").toLowerCase(),
      isInstructor,
      profile: p,
      courses: courseMap,
      learnerCourseIds: new Set(!isInstructor && approved ? courseMap.keys() : []),
      enrollments: (enrollments.data ?? []) as Row[],
      sections: (sections.data ?? []) as Row[],
      mySections: isInstructor ? ((mySections.data ?? []) as Row[]) : [],
      client,
    };
  };

  return {
    /** fresh: 캐시를 쓰지 않는다. (내 정보 확인 — 회원정보 저장·승인 직후 바로 반영) */
    async resolve(token: string, fresh = false): Promise<SupabaseAccess | null> {
      const key = keyOf(token);
      const hit = cache.get(key);
      if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.access;
      const access = await load(token);
      cache.set(key, { at: Date.now(), access });
      if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
      return access;
    },
    /**
     * 수강 등록·관리자 변경처럼 권한 정보가 바뀐 뒤 모두 다시 읽게 한다.
     * (이 서버를 거치지 않은 변경 — 대시보드 직접 수정 등 — 은 최대 CACHE_MS 뒤 반영)
     */
    clear() {
      cache.clear();
    },
  };
};

export type SupabaseUserResolver = ReturnType<typeof createSupabaseUserResolver>;

/** 요청의 Bearer token */
export const bearerToken = (header: string | undefined) => {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
};

const AVATAR_FALLBACK = "#A9D6F5";

/** Supabase 사용자 → 화면에 쓰는 로그인 사용자. 교수자는 학생 회원정보(member)를 쓰지 않는다. */
export const sessionUserFromAccess = (a: SupabaseAccess): SessionUser => {
  const p = a.profile;
  const member: LearnerProfile | null = a.isInstructor
    ? null
    : p
      ? toLearner(p, a.email)
      : toLearner({ id: a.userId, status: "pending", profile_completed: false, contact_email: a.email }, a.email);
  return {
    id: a.userId,
    name: (p?.name as string) || a.email.split("@")[0],
    email: a.isInstructor ? a.email : member?.email || a.email,
    picture: (p?.picture as string | null) ?? null,
    avatarColor: (p?.avatar_color as string) || AVATAR_FALLBACK,
    provider: "google",
    role: a.isInstructor ? "instructor" : "learner",
    member,
  };
};

export const courseSummaryFromRow = (c: Row): CourseSummary => ({
  id: String(c.id),
  drama: String(c.drama ?? ""),
  title: String(c.title ?? ""),
  context: String(c.context ?? ""),
  description: String(c.description ?? ""),
  weekCount: Number(c.week_count ?? 15),
  status: c.status === "legacy" ? "legacy" : c.status === "inactive" ? "inactive" : "active",
  createdAt: String(c.created_at ?? ""),
  updatedAt: String(c.updated_at ?? ""),
});

const teacherNames = async (a: SupabaseAccess, sectionId: string) =>
  ok(await a.client.rpc("section_teacher_names", { p_section_id: sectionId })) as { name: string | null; email: string | null }[];

/** 학생의 과목 카드: 과목 + 내가 수강 중인 분반 + 담당 교강사 이름 */
export const learnerCourseCard = async (a: SupabaseAccess, courseId: string): Promise<CourseSummary> => {
  const course = courseSummaryFromRow(a.courses.get(courseId)!);
  const e = a.enrollments.find((x) => x.user_id === a.userId && x.course_id === courseId);
  const s = e ? a.sections.find((x) => x.id === e.section_id) : undefined;
  if (!s) return course;
  const names = (await teacherNames(a, String(s.id))).flatMap((t) => (t.name ? [t.name] : []));
  return { ...course, section: { id: String(s.id), name: String(s.name), instructorNames: names } };
};

/** 교수자 화면의 분반 담당 교강사 (이메일 포함) */
export const sectionTeachersFor = async (a: SupabaseAccess, sectionId: string) =>
  (await teacherNames(a, sectionId)).map((t) => (t.name ? { email: String(t.email ?? ""), name: t.name } : { email: String(t.email ?? "") }));

/** 교수자: 담당 분반 수강생 (분반별 RPC, 담당하지 않는 분반은 RPC가 거부) */
export const studentsOfSections = async (a: SupabaseAccess, sections: Row[]): Promise<CourseStudent[]> => {
  const out: CourseStudent[] = [];
  for (const s of sections) {
    const rows = ok(await a.client.rpc("section_students", { p_section_id: String(s.id) })) as Row[];
    for (const r of rows) {
      out.push({
        userId: String(r.user_id),
        name: String(r.name ?? ""),
        email: String(r.contact_email ?? ""),
        studentId: String(r.student_id ?? ""),
        joinedAt: String(r.joined_at),
        sectionId: String(s.id),
        sectionName: String(s.name),
      });
    }
  }
  return out.sort((x, y) => x.sectionName.localeCompare(y.sectionName, "ko") || x.name.localeCompare(y.name, "ko"));
};

/** 강의코드 미리보기·등록 (enroll_with_code). 승인·중복·비활성 검사는 DB 함수가 한다. */
export const enrollWithCode = async (a: SupabaseAccess, code: string, confirm: boolean) => {
  const r = ok(await a.client.rpc("enroll_with_code", { p_code: code, p_confirm: confirm })) as Row;
  const course = r.course as Row;
  const section = r.section as Row;
  const summary: CourseSummary = {
    id: String(course.id),
    drama: String(course.drama ?? ""),
    title: String(course.title ?? ""),
    context: String(course.context ?? ""),
    description: String(course.description ?? ""),
    weekCount: Number(course.weekCount ?? 15),
    status: "active",
    createdAt: "",
    updatedAt: "",
  };
  return { raw: r, course: summary, section: { id: String(section.id), name: String(section.name) } };
};

/** 등록 결과를 기존 POST /enrollments 응답 형태로 */
export const enrollResult = async (a: SupabaseAccess, user: SessionUser, code: string): Promise<EnrollResult> => {
  const { raw, course, section } = await enrollWithCode(a, code, true);
  const e = raw.enrollment as Row;
  const names = (await teacherNames(a, section.id)).flatMap((t) => (t.name ? [t.name] : []));
  const enrollment: Enrollment = {
    sectionId: String(e.sectionId),
    courseId: String(e.courseId),
    courseCode: code.trim().toUpperCase(),
    userId: a.userId,
    name: user.name,
    email: user.email,
    joinedAt: String(e.joinedAt),
  };
  return { enrollment, course: { ...course, section: { ...section, instructorNames: names } }, section, alreadyEnrolled: raw.alreadyEnrolled === true };
};

/* ───────── 학습자료 (사용자 token, RLS 적용) ───────── */

/**
 * 읽을 수 있는 학습자료: 교수자는 운영 중 담당 분반의 과목(준비 중 포함), 학생은 수강 과목의 published만.
 * 회화 연습도 RLS를 따른다. (학생에게는 published 회화만)
 */
export const listLessonsFor = async (a: SupabaseAccess, courseId = ""): Promise<Lesson[]> => {
  let query = a.client.from("lessons").select(LESSON_SELECT).order("week").order("created_at");
  if (courseId) query = query.eq("course_id", courseId);
  return lessonsFromEmbedded(ok(await query) as Row[]);
};

/** 과목 학습자료 id만 (교수자 피드백 범위 확인용, RLS 적용) */
export const lessonIdsFor = async (a: SupabaseAccess, courseId: string): Promise<Set<string>> =>
  new Set((ok(await a.client.from("lessons").select("id").eq("course_id", courseId)) as Row[]).map((r) => String(r.id)));

export const lessonFor = async (a: SupabaseAccess, id: string): Promise<Lesson | null> => {
  const r = await a.client.from("lessons").select(LESSON_SELECT).eq("id", id).maybeSingle();
  if (r.error) throw toUserError(r.error);
  return r.data ? lessonsFromEmbedded([r.data as Row])[0] : null;
};

/** 교수자 저장 (save_lesson). lesson.version → expected version, 새 학습자료는 version 없음 */
export const saveLessonAs = async (a: SupabaseAccess, lesson: Lesson): Promise<Lesson> => {
  const r = await a.client.rpc("save_lesson", { p_lesson: lesson, p_expected_version: lesson.version ?? null });
  if (r.error) throw toUserError(r.error);
  const saved = await lessonFor(a, lesson.id);
  if (!saved) throw new AdminDataError(500, "저장한 학습자료를 다시 읽지 못했어요.");
  return saved;
};

/** 과목 주차 목록 (주차·제목·상태만, 준비 중 주차 포함) — course_curriculum */
export const curriculumFor = async (a: SupabaseAccess, courseId: string): Promise<CurriculumWeek[]> =>
  (ok(await a.client.rpc("course_curriculum", { p_course_id: courseId })) as Row[]).map((l) => ({
    lessonId: String(l.lesson_id),
    week: Number(l.week),
    title: String(l.title),
    status: l.status as Lesson["status"],
    youtubeId: (l.youtube_id as string | null) ?? null,
  }));

/* ───────── 학습 기록 (사용자 token, RLS 적용) ───────── */

/**
 * 볼 수 있는 학습 기록 (?course= 그 과목 학습자료의 기록만).
 * 학생: 본인 기록 / 교수자: 운영 중인 담당 분반 수강생의 그 과목 기록 (RLS)
 */
export const listProgressFor = async (a: SupabaseAccess, courseId = "", userIds?: string[]): Promise<LessonProgress[]> => {
  let query = a.client.from("lesson_progress").select(PROGRESS_SELECT);
  if (courseId) query = query.eq("lessons.course_id", courseId);
  if (userIds) query = query.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  return (ok(await query) as unknown as Row[]).map(progressFromRow);
};

/** 학생 저장 (save_my_progress): 사용자는 언제나 token의 사용자, 승인·수강·published 확인은 DB 함수가 한다. */
export const saveMyProgress = async (a: SupabaseAccess, progress: LessonProgress) => {
  const r = await a.client.rpc("save_my_progress", { p_progress: progress });
  if (r.error) throw toUserError(r.error);
  return { ok: true };
};

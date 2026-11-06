// 관리자 전용 Supabase 저장소 (server-only). AUTH_BACKEND=supabase일 때 관리자 API가 이 모듈로 회원·교수자·과목·분반·수강·학습자료를 다룬다.
//
// - service-role 키를 쓰므로 RLS를 우회한다. 반드시 관리자 세션을 확인한 뒤(requireAdminMode)에만 호출한다.
// - 브라우저 코드(src/)에서 import하지 않는다. 키는 서버 환경변수(SUPABASE_SERVICE_ROLE_KEY)에서만 읽는다.
// - 임의 쿼리를 대신 실행하는 범용 통로를 두지 않고, 필요한 관리 작업만 함수로 둔다.
// - 응답은 기존 db.json 관리자 API와 같은 형태로 맞춘다. (관리자 화면을 바꾸지 않기 위해)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isValidEmail, normalizeEmail } from "../src/app/auth/roles";
import type { Lesson } from "../src/content/types";
import { LESSON_SELECT, lessonConflictFrom, lessonsFromEmbedded } from "./lessonRows";
import { feedbackFromRow, feedbackProblem, feedbackToRow } from "./feedbackRows";
import { PROGRESS_SELECT, progressFromRow } from "./progressRows";
import type {
  CourseOverview,
  FeedbackDraft,
  CourseStudent,
  Enrollment,
  InstructorRecord,
  LearnerProfile,
  LessonProgress,
  Section,
  SectionOverview,
  SectionTeacher,
} from "../src/app/store/models";

/** 관리자 화면에 보여줄 오류 (HTTP 상태 + 문구, 필요하면 응답에 더할 값 — 예: 동시 편집 충돌 정보) */
export class AdminDataError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Row = Record<string, unknown>;
type PgError = { code?: string; message: string; details?: string | null };

/** 학습자료 저장 함수의 동시 편집 충돌(PT409) → 409 + 먼저 저장한 사람 정보 */
export const lessonConflictError = (e: PgError) =>
  new AdminDataError(409, "다른 사용자가 이 강의자료를 먼저 수정했습니다.", { conflict: lessonConflictFrom(e.details) });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nowIso = () => new Date().toISOString();

/** DB 함수가 낸 오류를 화면용 상태로 바꾼다. 알 수 없는 오류는 내용을 감춘다. */
const toAdminError = (e: PgError): AdminDataError => {
  if (e.code === "PT409") return lessonConflictError(e);
  // 학습 기록이 있는 학습자료 삭제 (D4의 progress → lessons ON DELETE RESTRICT)
  if (e.code === "23503") return new AdminDataError(409, "학습 기록이 있는 강의자료는 삭제할 수 없습니다. 준비 중 상태로 변경해주세요.");
  if (e.code === "42501") return new AdminDataError(403, e.message);
  if (e.code === "23505") return new AdminDataError(409, e.message);
  if (e.code === "P0002") return new AdminDataError(404, e.message);
  if (e.code === "P0001" || e.code === "22023") return new AdminDataError(400, e.message);
  console.error("[supabase-admin]", e.code ?? "", e.message);
  return new AdminDataError(500, "Supabase 처리 중 오류가 났어요.");
};
/** 목록·단건 조회 결과 (오류면 던진다). 목록이 비면 [] */
const ok = <T>(r: { data: T | null; error: PgError | null }): NonNullable<T> => {
  if (r.error) throw toAdminError(r.error);
  return (r.data ?? []) as NonNullable<T>;
};
/** 없을 수 있는 단건 조회 (maybeSingle) */
const okMaybe = <T>(r: { data: T | null; error: PgError | null }): T | null => {
  if (r.error) throw toAdminError(r.error);
  return r.data;
};

const PROFILE_FIELDS: Record<string, string> = {
  name: "name",
  university: "university",
  department: "department",
  grade: "grade",
  studentId: "student_id",
  email: "contact_email",
  phone: "phone",
};

export const toLearner = (p: Row, googleEmail: string): LearnerProfile => ({
  id: String(p.id),
  googleEmail,
  name: String(p.name ?? ""),
  university: String(p.university ?? ""),
  department: String(p.department ?? ""),
  grade: String(p.grade ?? ""),
  studentId: String(p.student_id ?? ""),
  email: String(p.contact_email ?? ""),
  phone: String(p.phone ?? ""),
  avatarColor: String(p.avatar_color ?? ""),
  picture: (p.picture as string | null) ?? null,
  status: p.status === "approved" ? "approved" : "pending",
  profileCompleted: !!p.profile_completed,
  firstSeenAt: String(p.first_seen_at ?? ""),
  lastSeenAt: String(p.last_seen_at ?? ""),
  approvedAt: (p.approved_at as string | null) ?? null,
});

const toSection = (s: Row): Section => ({
  id: String(s.id),
  courseId: String(s.course_id),
  name: String(s.name),
  code: String(s.code),
  status: s.status === "inactive" ? "inactive" : "active",
  createdAt: String(s.created_at),
  updatedAt: String(s.updated_at),
});

export const createSupabaseAdminClient = (url: string, serviceRoleKey: string): SupabaseClient =>
  createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** 관리자 작업 모음. by: 기록에 남길 관리자 표시 (이메일 또는 이름) */
export const createSupabaseAdminStore = (sb: SupabaseClient) => {
  /** auth 사용자 id → Google 이메일 */
  const authEmails = async () => {
    const map = new Map<string, string>();
    for (let page = 1; ; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw toAdminError(error);
      for (const u of data.users) map.set(u.id, u.email ?? "");
      if (data.users.length < 1000) break;
    }
    return map;
  };
  const instructorUserIds = async () =>
    new Set(ok(await sb.from("instructors").select("user_id").not("user_id", "is", null)).map((r) => String(r.user_id)));

  /** 회원 관리 대상(학생)인지: profile이 있고 교수자 계정이 아니어야 한다. */
  const learnerProfile = async (id: string) => {
    if (!UUID_RE.test(id)) throw new AdminDataError(404, "회원을 찾을 수 없어요.");
    const p = okMaybe(await sb.from("profiles").select("*").eq("id", id).maybeSingle());
    if (!p) throw new AdminDataError(404, "회원을 찾을 수 없어요.");
    if ((await instructorUserIds()).has(id)) {
      throw new AdminDataError(400, "교수자 계정은 회원 관리에서 바꾸지 않아요. 교수자 등록에서 관리해 주세요.");
    }
    return p as Row;
  };

  const teachersBySection = async () => {
    const links = ok(await sb.from("section_instructors").select("section_id,instructor_email"));
    const instructors = ok(await sb.from("instructors").select("email,display_name,user_id"));
    const userIds = instructors.map((i) => i.user_id).filter(Boolean) as string[];
    const names = new Map<string, string>();
    if (userIds.length) {
      for (const p of ok(await sb.from("profiles").select("id,name").in("id", userIds))) names.set(String(p.id), String(p.name ?? ""));
    }
    const byEmail = new Map(instructors.map((i) => [String(i.email), i]));
    const map = new Map<string, SectionTeacher[]>();
    for (const l of links) {
      const i = byEmail.get(String(l.instructor_email));
      const name = (i?.display_name as string | null) || (i?.user_id ? names.get(String(i.user_id)) : "") || "";
      const list = map.get(String(l.section_id)) ?? [];
      list.push(name ? { email: String(l.instructor_email), name } : { email: String(l.instructor_email) });
      map.set(String(l.section_id), list);
    }
    for (const list of map.values()) list.sort((a, b) => a.email.localeCompare(b.email));
    return map;
  };
  const enrolledCounts = async () => {
    const counts = new Map<string, number>();
    for (const e of ok(await sb.from("enrollments").select("section_id"))) {
      counts.set(String(e.section_id), (counts.get(String(e.section_id)) ?? 0) + 1);
    }
    return counts;
  };
  /** 과목별 강의자료 수 (Supabase lessons 기준) */
  const lessonCounts = async () => {
    const counts = new Map<string, { lessonCount: number; publishedCount: number }>();
    for (const l of ok(await sb.from("lessons").select("course_id,status"))) {
      const c = counts.get(String(l.course_id)) ?? { lessonCount: 0, publishedCount: 0 };
      c.lessonCount++;
      if (l.status === "published") c.publishedCount++;
      counts.set(String(l.course_id), c);
    }
    return counts;
  };
  const sectionOverview = async (s: Row): Promise<SectionOverview> => {
    const [teachers, counts] = await Promise.all([teachersBySection(), enrolledCounts()]);
    return { ...toSection(s), instructors: teachers.get(String(s.id)) ?? [], enrolledCount: counts.get(String(s.id)) ?? 0 };
  };

  return {
    /* ───────── 회원 (profiles) ───────── */

    /** 학생 회원 목록 (교수자 계정의 profile은 제외 — 기존 db.json 회원 목록과 같은 의미) */
    async listMembers(): Promise<LearnerProfile[]> {
      const [profiles, emails, instructorIds] = await Promise.all([
        sb.from("profiles").select("*").order("first_seen_at", { ascending: false }).then(ok),
        authEmails(),
        instructorUserIds(),
      ]);
      return (profiles as Row[]).filter((p) => !instructorIds.has(String(p.id))).map((p) => toLearner(p, emails.get(String(p.id)) ?? ""));
    },

    /** 회원정보 수정·승인/대기 전환 (관리자만). 승인 시각은 서버가 기록한다. */
    async updateMember(id: string, body: Record<string, unknown>): Promise<LearnerProfile> {
      const prev = await learnerProfile(id);
      const patch: Row = {};
      for (const [field, column] of Object.entries(PROFILE_FIELDS)) {
        if (typeof body[field] === "string") patch[column] = (body[field] as string).trim().slice(0, 100);
      }
      if (typeof patch.contact_email === "string") patch.contact_email = normalizeEmail(patch.contact_email);
      if (body.status === "approved") {
        patch.status = "approved";
        patch.approved_at = prev.approved_at ?? nowIso();
      } else if (body.status === "pending") {
        patch.status = "pending";
        patch.approved_at = null;
      }
      const p = Object.keys(patch).length ? ok(await sb.from("profiles").update(patch).eq("id", id).select("*").single()) : prev;
      const { data: u } = await sb.auth.admin.getUserById(id);
      return toLearner(p as Row, u?.user?.email ?? "");
    },

    /** 회원 삭제: auth 사용자를 지우면 profile·수강 기록이 함께 지워진다(FK cascade). 교수자 계정은 지우지 않는다. */
    async deleteMember(id: string) {
      await learnerProfile(id);
      const { error } = await sb.auth.admin.deleteUser(id);
      if (error) throw toAdminError(error);
      return { ok: true };
    },

    /* ───────── 교수자 ───────── */

    async listInstructors(): Promise<InstructorRecord[]> {
      const rows = ok(await sb.from("instructors").select("email,added_by,added_at").order("added_at"));
      return rows.map((r) => ({ email: String(r.email), source: "local", addedBy: (r.added_by as string | null) ?? null, addedAt: (r.added_at as string | null) ?? null }));
    },

    /** 교수자 등록 (이미 있으면 그대로). 같은 이메일로 이미 로그인한 계정이 있으면 DB trigger가 바로 연결한다. */
    async addInstructor(rawEmail: unknown, by: string) {
      const email = normalizeEmail(typeof rawEmail === "string" ? rawEmail : "");
      if (!isValidEmail(email)) throw new AdminDataError(400, "올바른 이메일 주소를 입력해 주세요.");
      ok(await sb.from("instructors").upsert({ email, source: "admin", added_by: by }, { onConflict: "email", ignoreDuplicates: true }));
      return { ok: true };
    },

    /** 교수자 해제: 교수자 행과 분반 배정만 지운다(배정은 FK cascade). 계정·profile은 그대로 둔다. */
    async removeInstructor(rawEmail: string) {
      ok(await sb.from("instructors").delete().eq("email", normalizeEmail(rawEmail)));
      return { ok: true };
    },

    /* ───────── 과목·분반 ───────── */

    /** 관리자용 과목 목록 (이전 과목 포함). 강의자료 수는 Supabase lessons 기준 */
    async listCourses(): Promise<CourseOverview[]> {
      const [courses, sections, teachers, counts, lessons] = await Promise.all([
        sb.from("courses").select("*").order("id").then(ok),
        sb.from("sections").select("*").order("name").then(ok),
        teachersBySection(),
        enrolledCounts(),
        lessonCounts(),
      ]);
      return (courses as Row[]).map((c) => {
        const mine = (sections as Row[])
          .filter((s) => s.course_id === c.id)
          .map((s) => ({ ...toSection(s), instructors: teachers.get(String(s.id)) ?? [], enrolledCount: counts.get(String(s.id)) ?? 0 }));
        return {
          id: String(c.id),
          drama: String(c.drama ?? ""),
          title: String(c.title ?? ""),
          context: String(c.context ?? ""),
          description: String(c.description ?? ""),
          code: String(c.legacy_code ?? ""),
          weekCount: Number(c.week_count),
          status: c.status === "legacy" ? "legacy" : c.status === "inactive" ? "inactive" : "active",
          createdAt: String(c.created_at),
          updatedAt: String(c.updated_at),
          sections: mine,
          enrolledCount: mine.reduce((n, s) => n + s.enrolledCount, 0),
          ...(lessons.get(String(c.id)) ?? { lessonCount: 0, publishedCount: 0 }),
        };
      });
    },

    /** 분반 개설 (강의코드 생성·교강사 배정은 DB 함수가 한다. 학습자료는 만들지 않는다) */
    async createSection(courseId: string, body: Record<string, unknown>, by: string): Promise<SectionOverview> {
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : null;
      const emails = (Array.isArray(body.instructors) ? body.instructors : [])
        .filter((x): x is string => typeof x === "string")
        .map(normalizeEmail);
      const s = ok(
        await sb.rpc("admin_create_section", { p_course_id: courseId, p_name: name, p_instructor_emails: [...new Set(emails)], p_assigned_by: by }),
      );
      return sectionOverview(s as Row);
    },

    /** 분반 이름 변경·운영/비활성 전환 (재활성화 중복 수강 검사는 DB 함수가 한다). 삭제는 하지 않는다. */
    async updateSection(sectionId: string, body: Record<string, unknown>): Promise<SectionOverview> {
      const name = body.name === undefined ? null : typeof body.name === "string" ? body.name.slice(0, 40) : "";
      const status = body.status === "active" || body.status === "inactive" ? body.status : null;
      const s = ok(await sb.rpc("admin_update_section", { p_section_id: sectionId, p_name: name, p_status: status }));
      return sectionOverview(s as Row);
    },

    /** 분반–교강사 배정 (등록된 교수자만, 같은 배정은 한 번만) */
    async assignInstructor(sectionId: string, rawEmail: string, by: string) {
      const email = normalizeEmail(rawEmail);
      const s = okMaybe(await sb.from("sections").select("id,course_id,courses(status)").eq("id", sectionId).maybeSingle()) as Row | null;
      const courseStatus = (s?.courses as { status?: string } | null)?.status;
      if (!s || courseStatus !== "active") throw new AdminDataError(404, "분반을 찾을 수 없어요.");
      if (!okMaybe(await sb.from("instructors").select("email").eq("email", email).maybeSingle())) {
        throw new AdminDataError(400, "교수자로 등록된 이메일만 배정할 수 있어요.");
      }
      const existed = !!okMaybe(
        await sb.from("section_instructors").select("section_id").eq("section_id", sectionId).eq("instructor_email", email).maybeSingle(),
      );
      if (!existed) {
        ok(
          await sb
            .from("section_instructors")
            .upsert({ section_id: sectionId, instructor_email: email, assigned_by: by }, { onConflict: "section_id,instructor_email", ignoreDuplicates: true }),
        );
      }
      return { ok: true, existed };
    },

    async unassignInstructor(sectionId: string, rawEmail: string) {
      ok(await sb.from("section_instructors").delete().eq("section_id", sectionId).eq("instructor_email", normalizeEmail(rawEmail)));
      return { ok: true };
    },

    /* ───────── 수강 현황 (조회만, 등록은 학생이 enroll_with_code로) ───────── */

    /** ?course= 과목 id · 분반 id · 강의코드. 없으면 전체 */
    async listEnrollments(q: string): Promise<Enrollment[]> {
      let query = sb.from("enrollments").select("section_id,course_id,course_code,user_id,joined_at,profiles(name,contact_email)").order("joined_at");
      if (q) {
        const safe = q.replace(/[^A-Za-z0-9_-]/g, "");
        query = query.or(`course_id.eq.${safe},section_id.eq.${safe},course_code.eq.${safe.toUpperCase()}`);
      }
      return ok(await query).map((e) => {
        const p = (e.profiles as { name?: string; contact_email?: string } | null) ?? {};
        return {
          sectionId: String(e.section_id),
          courseId: String(e.course_id),
          courseCode: String(e.course_code),
          userId: String(e.user_id),
          name: p.name ?? "",
          email: p.contact_email ?? "",
          joinedAt: String(e.joined_at),
        };
      });
    },

    /* ───────── 학습자료 (이전 자료 과목 포함) ───────── */

    /** 학습자료 목록 (?course= 그 과목만). 회화 연습 포함, 기존 Lesson 형식 */
    async listLessons(courseId = ""): Promise<Lesson[]> {
      let query = sb.from("lessons").select(LESSON_SELECT).order("course_id").order("week").order("created_at");
      if (courseId) query = query.eq("course_id", courseId);
      return lessonsFromEmbedded(ok(await query) as Row[]);
    },

    async getLesson(id: string): Promise<Lesson | null> {
      const row = okMaybe(await sb.from("lessons").select(LESSON_SELECT).eq("id", id).maybeSingle()) as Row | null;
      return row ? lessonsFromEmbedded([row])[0] : null;
    },

    /** 과목 (주차 수 확인용) */
    async getCourse(id: string): Promise<{ id: string; weekCount: number; status: string } | null> {
      const c = okMaybe(await sb.from("courses").select("id,week_count,status").eq("id", id).maybeSingle()) as Row | null;
      return c ? { id: String(c.id), weekCount: Number(c.week_count), status: String(c.status) } : null;
    },

    /** 관리자 저장 (admin_save_lesson). 동시 편집 확인은 lesson.version → expected version */
    async saveLesson(lesson: Lesson, label: string): Promise<Lesson> {
      const r = await sb.rpc("admin_save_lesson", { p_lesson: lesson, p_expected_version: lesson.version ?? null, p_admin_label: label });
      if (r.error) throw toAdminError(r.error);
      const saved = await this.getLesson(lesson.id);
      if (!saved) throw new AdminDataError(500, "저장한 학습자료를 다시 읽지 못했어요.");
      return saved;
    },

    /** 관리자 hard delete (회화는 cascade). 학습 기록이 있으면 DB(lesson_progress → lessons RESTRICT)가 막는다. */
    async deleteLesson(id: string) {
      ok(await sb.from("lessons").delete().eq("id", id));
      return { ok: true };
    },

    /* ───────── 피드백 초안 (관리자 전용, Gmail 토큰은 다루지 않는다) ───────── */

    async listFeedback(): Promise<FeedbackDraft[]> {
      return (ok(await sb.from("feedback_drafts").select("*").order("updated_at", { ascending: false })) as Row[]).map(feedbackFromRow);
    },

    /** 저장 (기존 PUT /feedback/:id와 같이 보낸 초안 전체, updated_at은 서버 시각) */
    async saveFeedback(draft: FeedbackDraft): Promise<FeedbackDraft> {
      const problem = feedbackProblem(draft);
      if (problem) throw new AdminDataError(400, "형식이 올바르지 않아요.");
      const saved = okMaybe(await sb.from("feedback_drafts").upsert(feedbackToRow(draft, nowIso())).select("*").single()) as Row;
      return feedbackFromRow(saved);
    },

    /** 교수자 피드백: API가 담당 범위(학생·학습자료)를 확인한 뒤, 그 범위의 초안만 읽는다. */
    async listFeedbackFor(learnerIds: string[], lessonIds: string[]): Promise<FeedbackDraft[]> {
      if (learnerIds.length === 0 || lessonIds.length === 0) return [];
      const rows = ok(
        await sb
          .from("feedback_drafts")
          .select("*")
          .in("learner_id", learnerIds)
          .in("lesson_id", lessonIds)
          .order("updated_at", { ascending: false }),
      ) as Row[];
      return rows.map(feedbackFromRow);
    },

    async getFeedback(id: string): Promise<FeedbackDraft | null> {
      const r = okMaybe(await sb.from("feedback_drafts").select("*").eq("id", id).maybeSingle()) as Row | null;
      return r ? feedbackFromRow(r) : null;
    },

    async deleteFeedback(id: string) {
      ok(await sb.from("feedback_drafts").delete().eq("id", id));
      return { ok: true };
    },

    /** 학습 기록 전체 (?course= 그 과목 학습자료의 기록만, userIds: 그 학생들만) */
    async listProgress(courseId = "", userIds?: string[]): Promise<LessonProgress[]> {
      let query = sb.from("lesson_progress").select(PROGRESS_SELECT);
      if (courseId) query = query.eq("lessons.course_id", courseId);
      if (userIds) query = query.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      return (ok(await query) as unknown as Row[]).map(progressFromRow);
    },

    /** 과목 주차 목록 (관리자: 이전 자료 과목 포함) */
    async curriculumWeeks(courseId: string) {
      const rows = ok(await sb.from("lessons").select("id,week,title,status,youtube_id").eq("course_id", courseId).order("week").order("created_at"));
      return rows.map((l) => ({
        lessonId: String(l.id),
        week: Number(l.week),
        title: String(l.title),
        status: l.status as Lesson["status"],
        youtubeId: l.status === "published" ? String(l.youtube_id ?? "") || null : null,
      }));
    },

    /** 과목 수강생 (관리자: 모든 분반, ?section= 그 분반만) + 그 학생들의 이 과목 학습 기록 */
    async courseStudents(courseId: string, only: string) {
      const sections = ok(await sb.from("sections").select("id,name").eq("course_id", courseId)) as Row[];
      const ids = new Set(sections.map((s) => String(s.id)));
      if (ids.size === 0 || (only && !ids.has(only))) throw new AdminDataError(404, "담당 분반이 아니에요.");
      const target = only ? [only] : [...ids];
      const rows = ok(
        await sb.from("enrollments").select("user_id,section_id,joined_at,profiles(name,contact_email,student_id)").in("section_id", target),
      );
      const nameOf = new Map(sections.map((s) => [String(s.id), String(s.name)]));
      const students: CourseStudent[] = rows
        .map((e) => {
          const p = (e.profiles as { name?: string; contact_email?: string; student_id?: string } | null) ?? {};
          return {
            userId: String(e.user_id),
            name: p.name ?? "",
            email: p.contact_email ?? "",
            studentId: p.student_id ?? "",
            joinedAt: String(e.joined_at),
            sectionId: String(e.section_id),
            sectionName: nameOf.get(String(e.section_id)) ?? "",
          };
        })
        .sort((a, b) => a.sectionName.localeCompare(b.sectionName, "ko") || a.name.localeCompare(b.name, "ko"));
      return { students, progress: await this.listProgress(courseId, students.map((s) => s.userId)) };
    },
  };
};

export type SupabaseAdminStore = ReturnType<typeof createSupabaseAdminStore>;

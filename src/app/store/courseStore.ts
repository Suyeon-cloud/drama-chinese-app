import { api } from "../lib/api";
import type {
  CourseCurriculum,
  CourseLookup,
  CourseOverview,
  CourseStudents,
  CourseSummary,
  EnrollResult,
  Enrollment,
  SectionOverview,
  SectionStatus,
} from "./models";
import { createRemoteEmitter } from "./remote";

/** 과목 저장소 (서버). 학습자는 수강 중인 과목, 교수자는 담당 과목, 관리자는 모든 과목을 본다. */
export interface CourseStore {
  /** 강의코드로 운영 중인 분반과 그 과목 미리 보기 (없으면 null) */
  findByCode(code: string): Promise<CourseLookup | null>;
  /** 내가 수강 중인 과목 (학습자, 수강 분반 포함) */
  myCourses(): Promise<CourseSummary[]>;
  /** 교수자: 담당 분반이 있는 과목 / 관리자: 모든 과목 (분반별 강의코드·담당 교강사·수강생 수 포함) */
  staffCourses(): Promise<CourseOverview[]>;
  /** 과목 커리큘럼 (주차·학습 주제·상태). 수강·담당 과목이 아니면 null */
  curriculum(courseId: string): Promise<CourseCurriculum | null>;
  /** 과목 수강생과 학습 기록 (관리자·담당 교수자, sectionId를 주면 그 분반만). 권한이 없으면 null */
  students(courseId: string, sectionId?: string): Promise<CourseStudents | null>;
  /** 새 분반 개설 (관리자). 강의코드는 서버가 만든다. */
  createSection(courseId: string, input: { name: string; instructors: string[] }): Promise<SectionOverview>;
  /** 분반 이름 변경 · 운영/비활성 전환 (관리자) */
  updateSection(sectionId: string, patch: { name?: string; status?: SectionStatus }): Promise<SectionOverview>;
  /** 분반–교강사 배정·해제 (관리자) */
  assignSection(sectionId: string, email: string): Promise<void>;
  unassignSection(sectionId: string, email: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** 수강 등록 저장소 */
export interface EnrollmentStore {
  /** 과목 id 또는 강의코드의 수강 등록 */
  listByCourse(courseCode: string): Promise<Enrollment[]>;
  /** 모든 수강 등록 (관리자) */
  listAll(): Promise<Enrollment[]>;
  /** 강의코드로 수강 등록. 과목은 서버가 강의코드로 찾는다. 코드가 틀리면 ApiError */
  enroll(courseCode: string): Promise<EnrollResult>;
  subscribe(listener: () => void): () => void;
}

export const normalizeCourseCode = (code: string) => code.trim().toUpperCase();

// 수강 등록하면 과목 목록도 다시 읽는다.
const courseEmitter = createRemoteEmitter();

const coursePath = (courseId: string) => `/courses/${encodeURIComponent(courseId)}`;
const sectionPath = (sectionId: string) => `/sections/${encodeURIComponent(sectionId)}`;

export const createRemoteCourseStore = (): CourseStore => ({
  findByCode: (code) =>
    api<CourseLookup>(`/courses/lookup?code=${encodeURIComponent(normalizeCourseCode(code))}`).catch(() => null),
  myCourses: () => api<CourseSummary[]>("/courses").catch(() => [] as CourseSummary[]),
  staffCourses: () => api<CourseOverview[]>("/courses").catch(() => [] as CourseOverview[]),
  curriculum: (courseId) => api<CourseCurriculum>(`${coursePath(courseId)}/curriculum`).catch(() => null),
  students: (courseId, sectionId) =>
    api<CourseStudents>(
      `${coursePath(courseId)}/students${sectionId ? `?section=${encodeURIComponent(sectionId)}` : ""}`,
    ).catch(() => null),
  createSection: async (courseId, input) => {
    const s = await api<SectionOverview>(`${coursePath(courseId)}/sections`, { method: "POST", body: input });
    courseEmitter.emit();
    return s;
  },
  updateSection: async (sectionId, patch) => {
    const s = await api<SectionOverview>(sectionPath(sectionId), { method: "PATCH", body: patch });
    courseEmitter.emit();
    return s;
  },
  assignSection: async (sectionId, email) => {
    await api(`${sectionPath(sectionId)}/instructors/${encodeURIComponent(email)}`, { method: "PUT" });
    courseEmitter.emit();
  },
  unassignSection: async (sectionId, email) => {
    await api(`${sectionPath(sectionId)}/instructors/${encodeURIComponent(email)}`, { method: "DELETE" });
    courseEmitter.emit();
  },
  subscribe: courseEmitter.subscribe,
});

export const createRemoteEnrollmentStore = (): EnrollmentStore => {
  const emitter = createRemoteEmitter();
  return {
    listByCourse: (courseCode) =>
      api<Enrollment[]>(`/enrollments?course=${encodeURIComponent(courseCode)}`).catch(() => [] as Enrollment[]),
    listAll: () => api<Enrollment[]>("/enrollments").catch(() => [] as Enrollment[]),
    enroll: async (courseCode) => {
      const result = await api<EnrollResult>("/enrollments", {
        method: "POST",
        body: { courseCode: normalizeCourseCode(courseCode) },
      });
      emitter.emit();
      courseEmitter.emit();
      return result;
    },
    subscribe: emitter.subscribe,
  };
};

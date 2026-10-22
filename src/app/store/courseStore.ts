import { api } from "../lib/api";
import type { CourseInfo, Enrollment } from "./models";
import { createRemoteEmitter } from "./remote";

/** 수업 정보 저장소 (서버). 지금은 한 학기 수업 1개를 다룬다. */
export interface CourseStore {
  /** 현재 수업 (없으면 참여 코드를 만들어 생성) */
  current(): Promise<CourseInfo>;
  findByCode(code: string): Promise<CourseInfo | null>;
  subscribe(listener: () => void): () => void;
}

/** 수업 참여 기록 저장소 */
export interface EnrollmentStore {
  listByCourse(courseCode: string): Promise<Enrollment[]>;
  enroll(enrollment: Omit<Enrollment, "joinedAt">): Promise<Enrollment>;
  subscribe(listener: () => void): () => void;
}

export const normalizeCourseCode = (code: string) => code.trim().toUpperCase();

export const createRemoteCourseStore = (): CourseStore => {
  const emitter = createRemoteEmitter();
  const current = () => api<CourseInfo>("/course");
  return {
    current,
    findByCode: async (code) => {
      const course = await current().catch(() => null);
      return course && course.code === normalizeCourseCode(code) ? course : null;
    },
    subscribe: emitter.subscribe,
  };
};

export const createRemoteEnrollmentStore = (): EnrollmentStore => {
  const emitter = createRemoteEmitter();
  return {
    listByCourse: (courseCode) =>
      api<Enrollment[]>(`/enrollments?course=${encodeURIComponent(courseCode)}`).catch(() => [] as Enrollment[]),
    enroll: async (e) => {
      const saved = await api<Enrollment>("/enrollments", { method: "POST", body: { courseCode: e.courseCode } });
      emitter.emit();
      return saved;
    },
    subscribe: emitter.subscribe,
  };
};

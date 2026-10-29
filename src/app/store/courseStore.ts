import { api } from "../lib/api";
import type { CourseCurriculum, CourseInfo, CourseSummary, EnrollResult, Enrollment } from "./models";
import { createRemoteEmitter } from "./remote";

/** 과목 저장소 (서버). 학습자는 수강 중인 운영 과목만 볼 수 있다. */
export interface CourseStore {
  /** 이전 1과목 화면(학습자 관리의 참여 링크)용: 기존 자료 과목 */
  current(): Promise<CourseInfo>;
  /** 강의코드로 운영 과목 미리 보기 (없으면 null) */
  findByCode(code: string): Promise<CourseSummary | null>;
  /** 내가 수강 중인 과목 (학습자) */
  myCourses(): Promise<CourseSummary[]>;
  /** 과목 커리큘럼 (주차·학습 주제·상태). 수강 중이 아니면 null */
  curriculum(courseId: string): Promise<CourseCurriculum | null>;
  subscribe(listener: () => void): () => void;
}

/** 수강 등록 저장소 */
export interface EnrollmentStore {
  listByCourse(courseCode: string): Promise<Enrollment[]>;
  /** 강의코드로 수강 등록. 과목은 서버가 강의코드로 찾는다. 코드가 틀리면 ApiError */
  enroll(courseCode: string): Promise<EnrollResult>;
  subscribe(listener: () => void): () => void;
}

export const normalizeCourseCode = (code: string) => code.trim().toUpperCase();

// 수강 등록하면 과목 목록도 다시 읽는다.
const courseEmitter = createRemoteEmitter();

export const createRemoteCourseStore = (): CourseStore => ({
  current: () => api<CourseInfo>("/course"),
  findByCode: (code) =>
    api<CourseSummary>(`/courses/lookup?code=${encodeURIComponent(normalizeCourseCode(code))}`).catch(() => null),
  myCourses: () => api<CourseSummary[]>("/courses").catch(() => [] as CourseSummary[]),
  curriculum: (courseId) =>
    api<CourseCurriculum>(`/courses/${encodeURIComponent(courseId)}/curriculum`).catch(() => null),
  subscribe: courseEmitter.subscribe,
});

export const createRemoteEnrollmentStore = (): EnrollmentStore => {
  const emitter = createRemoteEmitter();
  return {
    listByCourse: (courseCode) =>
      api<Enrollment[]>(`/enrollments?course=${encodeURIComponent(courseCode)}`).catch(() => [] as Enrollment[]),
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

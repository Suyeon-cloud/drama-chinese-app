import { COURSE_WEEK_COUNT } from "../../content/course";
import { createLocalCollection } from "./localCollection";
import { createEmitter, nowIso, readJson, writeJson } from "./localJson";
import type { CourseInfo, Enrollment } from "./models";

/**
 * 수업 정보 저장소. 지금은 한 학기 수업 1개를 다룬다.
 * 로컬 구현에서는 이 브라우저에만 저장되므로, 다른 기기에서 같은 참여 코드를 찾을 수 없다.
 */
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

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const createCourseCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export const normalizeCourseCode = (code: string) => code.trim().toUpperCase();

export const createLocalCourseStore = (): CourseStore => {
  const KEY = "zhuiju.course.v1";
  const emitter = createEmitter(KEY);
  const read = () => readJson<CourseInfo | null>(KEY, null);
  return {
    current: async () => {
      const existing = read();
      if (existing) return existing;
      const course: CourseInfo = {
        code: createCourseCode(),
        title: `드라마로 배우는 중국어 (${COURSE_WEEK_COUNT}주)`,
        createdAt: nowIso(),
      };
      writeJson(KEY, course);
      emitter.emit();
      return course;
    },
    findByCode: async (code) => {
      const course = read();
      return course && course.code === normalizeCourseCode(code) ? course : null;
    },
    subscribe: emitter.subscribe,
  };
};

export const createLocalEnrollmentStore = (): EnrollmentStore => {
  const col = createLocalCollection<Enrollment>(
    "zhuiju.enrollments.v1",
    (e) => `${e.courseCode}::${e.userId}`,
  );
  return {
    listByCourse: async (courseCode) => col.all().filter((e) => e.courseCode === courseCode),
    enroll: async (e) => {
      const existing = col.find(`${e.courseCode}::${e.userId}`);
      if (existing) return existing;
      const enrollment = { ...e, joinedAt: nowIso() };
      col.put(enrollment);
      return enrollment;
    },
    subscribe: col.subscribe,
  };
};

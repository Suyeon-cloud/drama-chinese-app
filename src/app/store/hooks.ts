import { useEffect, useState } from "react";
import type { Lesson } from "../../content/types";
import {
  courseStore,
  enrollmentStore,
  feedbackStore,
  instructorStore,
  learnerStore,
  lessonStore,
  materialStore,
  progressStore,
} from "./index";
import type {
  CourseCurriculum,
  CourseOverview,
  CourseStudents,
  CourseSummary,
  Enrollment,
  FeedbackDraft,
  InstructorRecord,
  LearnerProfile,
  LessonProgress,
  WeekMaterial,
} from "./models";

/** 저장소 값을 읽고, 변경되면 다시 읽는다. 로딩 중에는 null. */
const useStoreQuery = <T>(
  load: () => Promise<T>,
  subscribe: (listener: () => void) => () => void,
  key: string,
): T | null => {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => {
      load().then(
        (v) => {
          if (alive) setValue(v);
        },
        (err: unknown) => console.warn("데이터를 불러오지 못했어요.", err),
      );
    };
    run();
    const unsubscribe = subscribe(run);
    return () => {
      alive = false;
      unsubscribe();
    };
    // load/subscribe는 key가 같으면 같은 질의다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
};

export const useLessons = (): Lesson[] | null =>
  useStoreQuery(() => lessonStore.list(), lessonStore.subscribe, "lessons");

export const useUserProgress = (userId: string | null): LessonProgress[] | null =>
  useStoreQuery(
    () => (userId ? progressStore.listByUser(userId) : Promise.resolve([])),
    progressStore.subscribe,
    `progress:${userId ?? ""}`,
  );

export const useAllProgress = (): LessonProgress[] | null =>
  useStoreQuery(() => progressStore.listAll(), progressStore.subscribe, "progress:all");

export const useLearners = (): LearnerProfile[] | null =>
  useStoreQuery(() => learnerStore.list(), learnerStore.subscribe, "learners");

/** 교수자: 운영 중인 담당 분반 수강생의 이 과목 피드백 초안 (sectionId를 주면 그 분반만) */
export const useCourseFeedback = (courseId: string, sectionId?: string): FeedbackDraft[] | null =>
  useStoreQuery(
    () => feedbackStore.listForCourse(courseId, sectionId),
    feedbackStore.subscribe,
    `course-feedback:${courseId}:${sectionId ?? ""}`,
  );

export const useInstructors = (): InstructorRecord[] | null =>
  useStoreQuery(() => instructorStore.list(), instructorStore.subscribe, "instructors");

/** 여러 저장소 중 하나라도 바뀌면 다시 읽는다. */
const subscribeAll =
  (...subs: ((listener: () => void) => () => void)[]) =>
  (listener: () => void) => {
    const offs = subs.map((s) => s(listener));
    return () => offs.forEach((off) => off());
  };

/** 교수자: 담당 과목 / 관리자: 모든 과목 (기존 자료 포함 — 화면에서 운영 과목만 골라 쓴다) */
export const useStaffCourses = (userId: string | null): CourseOverview[] | null =>
  useStoreQuery(
    () => (userId ? courseStore.staffCourses() : Promise.resolve([])),
    subscribeAll(courseStore.subscribe, lessonStore.subscribe, enrollmentStore.subscribe),
    `staff-courses:${userId ?? ""}`,
  );

/** 과목 수강생과 학습 기록 (sectionId를 주면 그 분반만). undefined: 불러오는 중, null: 권한 없음 */
export const useCourseStudents = (courseId: string, sectionId?: string): CourseStudents | null | undefined => {
  const value = useStoreQuery(
    () => courseStore.students(courseId, sectionId).then((s) => ({ s })),
    subscribeAll(courseStore.subscribe, progressStore.subscribe, enrollmentStore.subscribe),
    `course-students:${courseId}:${sectionId ?? ""}`,
  );
  return value === null ? undefined : value.s;
};

export const useAllEnrollments = (): Enrollment[] | null =>
  useStoreQuery(() => enrollmentStore.listAll(), enrollmentStore.subscribe, "enrollments:all");

/** 내가 수강 중인 과목. userId가 없으면(학습자가 아니면) 빈 목록 */
export const useMyCourses = (userId: string | null): CourseSummary[] | null =>
  useStoreQuery(
    () => (userId ? courseStore.myCourses() : Promise.resolve([])),
    courseStore.subscribe,
    `my-courses:${userId ?? ""}`,
  );

/** 과목 커리큘럼. undefined: 불러오는 중, null: 수강 중이 아니거나 없는 과목 */
export const useCurriculum = (courseId: string, userId: string | null): CourseCurriculum | null | undefined => {
  const value = useStoreQuery(
    () => (userId ? courseStore.curriculum(courseId) : Promise.resolve(null)).then((c) => ({ c })),
    courseStore.subscribe,
    `curriculum:${courseId}:${userId ?? ""}`,
  );
  return value === null ? undefined : value.c;
};

export const useEnrollments = (courseCode: string | null): Enrollment[] | null =>
  useStoreQuery(
    () => (courseCode ? enrollmentStore.listByCourse(courseCode) : Promise.resolve([])),
    enrollmentStore.subscribe,
    `enrollments:${courseCode ?? ""}`,
  );

/**
 * 과목의 주차별 보충 자료. enabled가 false면 부르지 않는다. (Supabase 운영 환경: 아직 제공하지 않음)
 * 실패는 오류 상태로 돌려준다 — 화면이 빈 목록을 성공처럼 보여 주지 않게.
 */
export type MaterialsState =
  | { state: "off" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; list: WeekMaterial[] };

export const useWeekMaterials = (courseId: string, enabled: boolean): MaterialsState => {
  const [value, setValue] = useState<MaterialsState>(enabled ? { state: "loading" } : { state: "off" });
  useEffect(() => {
    if (!enabled || !courseId) {
      setValue({ state: "off" });
      return;
    }
    let alive = true;
    const run = () => {
      materialStore.list(courseId).then(
        (list) => alive && setValue({ state: "ready", list }),
        (err: unknown) =>
          alive && setValue({ state: "error", message: err instanceof Error ? err.message : "추가 자료를 불러오지 못했어요." }),
      );
    };
    setValue({ state: "loading" });
    run();
    const off = materialStore.subscribe(run);
    return () => {
      alive = false;
      off();
    };
  }, [courseId, enabled]);
  return value;
};

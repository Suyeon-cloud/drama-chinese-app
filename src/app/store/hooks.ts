import { useEffect, useState } from "react";
import type { Lesson } from "../../content/types";
import {
  courseStore,
  enrollmentStore,
  feedbackStore,
  instructorStore,
  learnerStore,
  lessonStore,
  progressStore,
} from "./index";
import type {
  CourseInfo,
  Enrollment,
  FeedbackDraft,
  InstructorRecord,
  LearnerProfile,
  LessonProgress,
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

export const useFeedbackDrafts = (): FeedbackDraft[] | null =>
  useStoreQuery(() => feedbackStore.list(), feedbackStore.subscribe, "feedback");

export const useInstructors = (): InstructorRecord[] | null =>
  useStoreQuery(() => instructorStore.list(), instructorStore.subscribe, "instructors");

export const useCurrentCourse = (): CourseInfo | null =>
  useStoreQuery(() => courseStore.current(), courseStore.subscribe, "course");

export const useEnrollments = (courseCode: string | null): Enrollment[] | null =>
  useStoreQuery(
    () => (courseCode ? enrollmentStore.listByCourse(courseCode) : Promise.resolve([])),
    enrollmentStore.subscribe,
    `enrollments:${courseCode ?? ""}`,
  );

// 앱 전체가 사용하는 저장소 인스턴스. 원격 DB를 연결할 때는 이 파일에서 구현만 교체한다.
import {
  createLocalCourseStore,
  createLocalEnrollmentStore,
  type CourseStore,
  type EnrollmentStore,
} from "./courseStore";
import { createLocalFeedbackStore, type FeedbackStore } from "./feedbackStore";
import { createLocalInstructorStore, type InstructorStore } from "./instructorStore";
import { createLocalLearnerStore, type LearnerStore } from "./learnerStore";
import { createLocalLessonStore, type LessonStore } from "./lessonStore";
import { createLocalProgressStore, type ProgressStore } from "./progressStore";

export const lessonStore: LessonStore = createLocalLessonStore();
export const progressStore: ProgressStore = createLocalProgressStore();
export const learnerStore: LearnerStore = createLocalLearnerStore();
export const feedbackStore: FeedbackStore = createLocalFeedbackStore();
export const instructorStore: InstructorStore = createLocalInstructorStore();
export const courseStore: CourseStore = createLocalCourseStore();
export const enrollmentStore: EnrollmentStore = createLocalEnrollmentStore();

/** 현재 화면에 보이는 학습자·기록 범위 안내 (로컬 저장소 구현) */
export const LOCAL_SCOPE_NOTE =
  "현재는 원격 DB가 연결되지 않아 이 브라우저에 저장된 학습자와 학습 기록만 표시돼요.";

export const INSTRUCTOR_SCOPE_NOTE =
  "교수자 목록은 현재 브라우저의 localStorage에만 저장되는 프로토타입이에요. 다른 컴퓨터·브라우저와 공유되지 않아요.";

export const JOIN_SCOPE_NOTE =
  "원격 DB가 아직 없어 참여 링크는 수업 정보가 저장된 이 브라우저에서만 동작해요.";

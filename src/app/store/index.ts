// 앱 전체가 사용하는 저장소 인스턴스. 모든 데이터는 서버(server/api.ts)의 DB에 저장된다.
import {
  createRemoteCourseStore,
  createRemoteEnrollmentStore,
  type CourseStore,
  type EnrollmentStore,
} from "./courseStore";
import { createRemoteFeedbackStore, type FeedbackStore } from "./feedbackStore";
import { createRemoteInstructorStore, type InstructorStore } from "./instructorStore";
import { createRemoteLearnerStore, type LearnerStore } from "./learnerStore";
import { createRemoteLessonStore, type LessonStore } from "./lessonStore";
import { createRemoteProgressStore, type ProgressStore } from "./progressStore";

export const lessonStore: LessonStore = createRemoteLessonStore();
export const progressStore: ProgressStore = createRemoteProgressStore();
export const learnerStore: LearnerStore = createRemoteLearnerStore();
export const feedbackStore: FeedbackStore = createRemoteFeedbackStore();
export const instructorStore: InstructorStore = createRemoteInstructorStore();
export const courseStore: CourseStore = createRemoteCourseStore();
export const enrollmentStore: EnrollmentStore = createRemoteEnrollmentStore();

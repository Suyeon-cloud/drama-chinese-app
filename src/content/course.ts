import type { LearningDirection, LessonStatus } from "./types";

/** 한 학기 수업 주차 수 */
export const COURSE_WEEK_COUNT = 15;

/** 이 주차까지는 중국어 → 한국어, 이후는 한국어 → 중국어 */
export const ZH_KO_LAST_WEEK = 8;

export const WEEKS: number[] = Array.from({ length: COURSE_WEEK_COUNT }, (_, i) => i + 1);

export const defaultDirectionForWeek = (week: number): LearningDirection =>
  week <= ZH_KO_LAST_WEEK ? "zh-ko" : "ko-zh";

export const DIRECTION_LABEL: Record<LearningDirection, string> = {
  "zh-ko": "중국어 → 한국어",
  "ko-zh": "한국어 → 중국어",
};

export const STATUS_LABEL: Record<LessonStatus, string> = {
  draft: "준비 중",
  ready: "준비 완료",
  published: "공개",
};

export const STATUS_TONE: Record<LessonStatus, string> = {
  draft: "cream",
  ready: "sky",
  published: "mint",
};

/** 학습자 화면의 주차 구분 */
export const COURSE_PHASES = [
  { title: "1~8주차", subtitle: "중국어 → 한국어", from: 1, to: ZH_KO_LAST_WEEK },
  { title: `${ZH_KO_LAST_WEEK + 1}~${COURSE_WEEK_COUNT}주차`, subtitle: "한국어 → 중국어", from: ZH_KO_LAST_WEEK + 1, to: COURSE_WEEK_COUNT },
];

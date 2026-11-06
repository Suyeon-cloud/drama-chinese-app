// 과목 입력 규칙·상태 묶음 (화면·서버 공통)
// - 입력 길이·주차 수 규칙은 서버(server/courseInput.ts)가 최종 확인한다. 화면은 같은 규칙으로 먼저 알려 준다.
// - 과목 목록: visible = 운영(active)+비활성(inactive), enrollable = 운영(active)만. 기존 자료(legacy)는 관리자 화면에서만 따로 본다.

import { isValidWeekCount, MAX_WEEK_COUNT, MIN_WEEK_COUNT, sortCourses } from "./courseWeeks";

export const DEFAULT_WEEK_COUNT = 15;
export const COURSE_TEXT_LIMITS = { title: 60, drama: 60, context: 200, description: 500 } as const;
export type CourseTextField = keyof typeof COURSE_TEXT_LIMITS;
export const COURSE_TEXT_LABEL: Record<CourseTextField, string> = {
  title: "과목명",
  drama: "드라마명",
  context: "학습 맥락",
  description: "설명",
};
export const WEEK_COUNT_ERROR = `주차 수는 ${MIN_WEEK_COUNT}~${MAX_WEEK_COUNT} 사이의 정수로 입력해 주세요.`;

export type CourseFormValues = { title: string; drama: string; context: string; description: string; weekCount: number };

/** 화면 입력 검사: 문제가 있으면 첫 번째 문구, 없으면 null. (minWeekCount: 줄일 수 없는 하한, 수정할 때만) */
export const courseFormProblem = (v: CourseFormValues, minWeekCount = 0): string | null => {
  if (!v.title.trim()) return "과목명을 입력해 주세요.";
  for (const field of Object.keys(COURSE_TEXT_LIMITS) as CourseTextField[]) {
    if (v[field].trim().length > COURSE_TEXT_LIMITS[field]) {
      return `${COURSE_TEXT_LABEL[field]}은 ${COURSE_TEXT_LIMITS[field]}자까지 입력할 수 있어요.`;
    }
  }
  if (!isValidWeekCount(v.weekCount)) return WEEK_COUNT_ERROR;
  if (minWeekCount > 0 && v.weekCount < minWeekCount) {
    return `${minWeekCount}주차까지 학습자료가 있어 ${minWeekCount}주보다 적게 줄일 수 없어요.`;
  }
  return null;
};

type WithStatus = { id: string; weekCount: number; status: string; createdAt?: string };

/** 교수자·학생이 계속 쓰는 과목 (운영 + 비활성), 기본 순서 */
export const visibleCourses = <T extends WithStatus>(courses: T[]): T[] =>
  sortCourses(courses.filter((c) => c.status === "active" || c.status === "inactive"));

/** 신규 수강·새 분반·참여 링크를 쓰는 과목 (운영만), 기본 순서 */
export const enrollableCourses = <T extends WithStatus>(courses: T[]): T[] => sortCourses(courses.filter((c) => c.status === "active"));

export type CourseGroup = "active" | "inactive" | "legacy";
export const COURSE_GROUPS: { id: CourseGroup; label: string; empty: string }[] = [
  { id: "active", label: "운영 과목", empty: "운영 중인 강의가 없어요. ‘+ 새 강의’로 강의를 만들어 주세요." },
  { id: "inactive", label: "비활성 과목", empty: "비활성 강의가 없어요. 운영 과목에서 ‘비활성화’를 누르면 이곳으로 옮겨져요." },
  { id: "legacy", label: "기존 자료", empty: "보관 중인 기존 자료가 없어요." },
];

/** 상태별 과목 (기본 순서). 알 수 없는 상태는 어느 묶음에도 넣지 않는다. */
export const coursesInGroup = <T extends WithStatus>(courses: T[], group: CourseGroup): T[] =>
  sortCourses(courses.filter((c) => c.status === group));

/** 상태 표시 문구 */
export const COURSE_STATUS_LABEL: Record<CourseGroup, string> = {
  active: "운영 중",
  inactive: "신규 수강 마감",
  legacy: "기존 자료",
};

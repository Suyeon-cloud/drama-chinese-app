// 과목·주차 계산 (화면 공통). 과목 목록과 주차 수는 서버가 준 과목 정보(course.weekCount)를 기준으로 한다.
//
// - 하드코딩된 과목 목록(COURSE_SEEDS)은 기존 과목의 표시 순서·색을 유지하는 데만 쓴다. 과목이 있는지는 서버 목록으로 판단한다.
// - 주차 수가 없거나 올바르지 않으면 임의의 값(15 등)으로 바꾸지 않고 "주차 없음"으로 다룬다. (저장 차단)
// - 주차 범위는 DB의 courses.week_count 제약(1~30)과 같다.

import { COURSE_PHASES, ZH_KO_LAST_WEEK } from "./course";
import { COURSE_SEEDS, LEGACY_COURSE_ID } from "./courses";

export const MIN_WEEK_COUNT = 1;
export const MAX_WEEK_COUNT = 30;

/** 주차 수가 저장·표시에 쓸 수 있는 값인지 (정수 1~30) */
export const isValidWeekCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= MIN_WEEK_COUNT && n <= MAX_WEEK_COUNT;

/** 과목의 주차 목록 [1..weekCount]. 주차 수가 올바르지 않으면 빈 목록 */
export const courseWeeks = (weekCount: unknown): number[] =>
  isValidWeekCount(weekCount) ? Array.from({ length: weekCount }, (_, i) => i + 1) : [];

/** 주차가 과목의 주차 범위 안인지 */
export const isWeekInCourse = (week: unknown, weekCount: unknown): boolean =>
  isValidWeekCount(weekCount) && typeof week === "number" && Number.isInteger(week) && week >= 1 && week <= weekCount;

/** 주차 수 표시 ("15주"). 주차 수가 올바르지 않으면 null (화면은 숫자 없는 문구를 쓴다) */
export const weekCountLabel = (weekCount: unknown): string | null => (isValidWeekCount(weekCount) ? `${weekCount}주` : null);

/** 주차 범위 표시 ("1~15주", 1주 과목은 "1주"). 주차 수가 올바르지 않으면 null */
export const weekRangeLabel = (weekCount: unknown): string | null =>
  isValidWeekCount(weekCount) ? (weekCount === 1 ? "1주" : `1~${weekCount}주`) : null;

/** 진도 비율 (0~1). 주차 수가 올바르지 않으면 0 */
export const weekRatio = (done: number, weekCount: unknown): number =>
  isValidWeekCount(weekCount) ? Math.min(1, Math.max(0, done / weekCount)) : 0;

export type WeekPhase = { title: string; subtitle: string; from: number; to: number };

/**
 * 관리자·교수자 학습자료 표의 주차 구분.
 * 기존 자료 과목: 이전 규칙(1~8주 중→한, 9주~ 한→중). 그 밖의 과목: 1~N주차 하나 (중국어 원문 기반)
 */
export const coursePhases = (courseId: string, weekCount: unknown): WeekPhase[] => {
  if (!isValidWeekCount(weekCount)) return [];
  if (courseId === LEGACY_COURSE_ID) {
    return COURSE_PHASES.map((p, i) => {
      const from = i === 0 ? 1 : ZH_KO_LAST_WEEK + 1;
      const to = i === 0 ? Math.min(ZH_KO_LAST_WEEK, weekCount) : weekCount;
      return { ...p, title: from === to ? `${from}주차` : `${from}~${to}주차`, from, to };
    }).filter((p) => p.from <= p.to);
  }
  return [{ title: weekCount === 1 ? "1주차" : `1~${weekCount}주차`, subtitle: "중국어 원문 기반", from: 1, to: weekCount }];
};

type CourseLike = { id: string; weekCount: number; createdAt?: string };

/** 기존 과목의 순서 (기존 3과목 → 그 밖의 과목). 기존 과목이 아니면 -1 */
const seedIndex = (id: string) => COURSE_SEEDS.findIndex((s) => s.id === id);

/**
 * 과목 표시 순서: 기존 3과목은 지금 순서 그대로, 새 과목은 그 뒤에 생성일 → id 순.
 * 서버 목록에 있는 과목은 모두 남는다. (원본 배열은 바꾸지 않는다)
 */
export const sortCourses = <T extends CourseLike>(courses: T[]): T[] =>
  [...courses].sort((a, b) => {
    const ia = seedIndex(a.id);
    const ib = seedIndex(b.id);
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id);
  });

/** 기존 3과목의 카드 색 (순서대로 하늘·분홍·민트). 과목 id로 정하므로 정렬이 바뀌어도 그대로다. */
export const SEED_COURSE_TONES = ["sky", "pink", "mint"] as const;
/**
 * 새 과목의 카드 파스텔 색 (app.css의 .tone-*). 기존 3과목과 같은 색도 포함한 5색 팔레트에서 고른다.
 * 새 과목끼리, 또는 비활성 기존 과목과 색이 겹칠 수 있다(허용).
 */
export const NEW_COURSE_TONES = ["sky", "pink", "mint", "lavender", "peach"] as const;
/** 특정 과목을 지정한 색으로 고정한다(기존 3과목 외 추가 고정). 활성·비활성과 무관하게 항상 이 색을 쓴다. */
const PINNED_COURSE_TONES: Record<string, (typeof NEW_COURSE_TONES)[number]> = {
  "course-r7i60a": "sky", // 偷偷藏不住
};

/** 과목 id → 숫자 (FNV-1a). 같은 id는 언제나 같은 값 */
const hashId = (id: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

export const courseToneFor = (courseId: string): string => {
  const i = seedIndex(courseId);
  if (i >= 0) return SEED_COURSE_TONES[i % SEED_COURSE_TONES.length];
  if (PINNED_COURSE_TONES[courseId]) return PINNED_COURSE_TONES[courseId];
  // 기존 동작: 기존 자료 과목·id 없음은 첫 색. 새 과목은 id로 파스텔 팔레트에서 고른다.
  if (courseId === LEGACY_COURSE_ID || !courseId) return SEED_COURSE_TONES[0];
  return NEW_COURSE_TONES[hashId(courseId) % NEW_COURSE_TONES.length];
};

/**
 * 학습자료 편집 화면의 과목 확인 결과.
 * - loading: 과목 목록을 아직 받지 못함 (저장 불가)
 * - missing: 서버 목록에 없는 과목 (저장 불가, 다른 과목으로 바꾸지 않는다)
 * - invalidWeeks: 과목은 있지만 주차 수가 올바르지 않음 (저장 불가)
 * - ok: 저장할 수 있는 과목
 */
export type EditorCourse<T extends CourseLike = CourseLike> =
  | { state: "loading" }
  | { state: "missing"; courseId: string }
  | { state: "invalidWeeks"; course: T }
  | { state: "ok"; course: T; weeks: number[] };

export const resolveEditorCourse = <T extends CourseLike>(courses: T[] | null | undefined, courseId: string): EditorCourse<T> => {
  if (!courses) return { state: "loading" };
  const course = courseId ? courses.find((c) => c.id === courseId) : undefined;
  if (!course) return { state: "missing", courseId };
  if (!isValidWeekCount(course.weekCount)) return { state: "invalidWeeks", course };
  return { state: "ok", course, weeks: courseWeeks(course.weekCount) };
};

/** 편집 화면 저장 전 과목·주차 검사. 저장할 수 있으면 null, 아니면 화면에 보여 줄 문구 */
export const editorCourseProblem = (resolved: EditorCourse, week: number): string | null => {
  switch (resolved.state) {
    case "loading":
      return "강의 정보를 불러오는 중이에요. 잠시 후 다시 저장해 주세요.";
    case "missing":
      return resolved.courseId
        ? `강의(${resolved.courseId})를 찾을 수 없어요. 담당하지 않는 강의이거나 없는 강의예요. 목록에서 다시 들어와 주세요.`
        : "강의가 정해지지 않았어요. 강의의 주차별 학습자료 목록에서 다시 들어와 주세요.";
    case "invalidWeeks":
      return "강의의 주차 수 정보가 올바르지 않아 저장할 수 없어요. 관리자에게 문의해 주세요.";
    case "ok":
      return isWeekInCourse(week, resolved.course.weekCount)
        ? null
        : `주차는 1~${resolved.course.weekCount}주차 중에서 골라 주세요.`;
  }
};

/**
 * 학습자 대시보드(여러 과목 합산)의 주차 수: 수강 중인 과목 중 가장 긴 과목.
 * 수강 과목 정보가 없으면 null (화면은 주차 칸을 그리지 않는다)
 */
export const dashboardWeekCount = (courses: { weekCount: number }[] | null | undefined): number | null => {
  const valid = (courses ?? []).map((c) => c.weekCount).filter(isValidWeekCount);
  return valid.length ? Math.max(...valid) : null;
};

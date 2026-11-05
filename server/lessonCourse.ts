// 학습자료 저장(PUT /api/lessons/:id)의 과목 결정·이동 검사. JSON·Supabase 관리자·Supabase 교수자 경로가 같이 쓴다.
//
// - 새 학습자료: courseId가 반드시 있어야 한다. 없거나 빈 문자열이면 400. (기존 자료 과목으로 대신 넣지 않는다)
// - 기존 학습자료: courseId가 없거나 빈 문자열이면 원래 과목(prev.courseId)을 그대로 쓴다. (이전 화면 호환)
// - 과목이 실제로 있는지·권한·주차 범위는 각 경로가 이어서 확인한다. (Supabase는 저장 함수가 한 번 더 확인)
// - 기존 자료(legacy) 과목과 그 밖의 과목 사이 이동은 거부한다. (Supabase 저장 함수 _save_lesson과 같은 규칙)

export type LessonCourseResult = { ok: true; courseId: string } | { ok: false; status: 400; error: string };

export const MISSING_COURSE_ERROR = "학습자료의 강의를 지정해 주세요.";
export const INVALID_COURSE_ERROR = "학습자료의 강의 형식이 올바르지 않아요.";
export const LEGACY_MOVE_ERROR = "이전 자료 과목과 운영 과목 사이에서는 학습자료를 옮길 수 없어요.";

/** 저장할 과목 id. requested: 요청 본문의 courseId, prev: 이미 저장된 학습자료 (없으면 새 학습자료) */
export const resolveLessonCourseId = (requested: unknown, prev: { courseId: string } | null | undefined): LessonCourseResult => {
  if (requested !== undefined && requested !== null && typeof requested !== "string") {
    return { ok: false, status: 400, error: INVALID_COURSE_ERROR };
  }
  if (typeof requested === "string" && requested !== "") return { ok: true, courseId: requested };
  if (prev?.courseId) return { ok: true, courseId: prev.courseId };
  return { ok: false, status: 400, error: MISSING_COURSE_ERROR };
};

/**
 * 과목 이동 검사: 기존 학습자료가 다른 과목으로 갈 때, 기존 자료 과목 ↔ 그 밖의 과목이면 거부 문구.
 * 상태를 모르는 과목(없는 과목)은 여기서 판단하지 않는다. (각 경로의 과목 존재 검사가 막는다)
 */
export const lessonMoveProblem = (
  prevCourseId: string | null | undefined,
  nextCourseId: string,
  statusOf: (courseId: string) => string | null | undefined,
): string | null => {
  if (!prevCourseId || prevCourseId === nextCourseId) return null;
  const from = statusOf(prevCourseId);
  const to = statusOf(nextCourseId);
  if (!from || !to) return null;
  return (from === "legacy") !== (to === "legacy") ? LEGACY_MOVE_ERROR : null;
};

// Supabase lesson_progress 행 ↔ 기존 LessonProgress 객체 변환 (server-only, 하나의 기준).
// 학습 기록 API와 기존 기록 이전 도구가 같은 변환을 쓴다.
import type { LessonProgress } from "../src/app/store/models";

type Row = Record<string, unknown>;

/** 학습 기록 조회 칸: 과목으로 거르기 위해 학습자료의 course_id를 함께 받는다. (문자열 타입으로 두어 쿼리 타입 추론을 쓰지 않는다) */
export const PROGRESS_SELECT: string = "*, lessons!inner(course_id)";

const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());

/** lesson_progress 행 → 기존 LessonProgress (퀴즈 칸 3개 ↔ quiz 객체) */
export const progressFromRow = (r: Row): LessonProgress => ({
  userId: String(r.user_id),
  lessonId: String(r.lesson_id),
  week: Number(r.week),
  startedAt: iso(r.started_at),
  completedAt: iso(r.completed_at),
  watchedRanges: (r.watched_ranges ?? []) as [number, number][],
  progressRatio: Number(r.progress_ratio),
  maxPosition: Number(r.max_position),
  quiz:
    r.quiz_total === null || r.quiz_total === undefined
      ? null
      : { correct: Number(r.quiz_correct), total: Number(r.quiz_total), submittedAt: iso(r.quiz_submitted_at)! },
  quizAttempts: Number(r.quiz_attempts),
  lastStudiedAt: iso(r.last_studied_at),
});

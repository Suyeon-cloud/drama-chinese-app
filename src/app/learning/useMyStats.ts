import { COURSE_WEEK_COUNT } from "../../content/course";
import type { Lesson } from "../../content/types";
import type { LessonProgress } from "../store/models";

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** 실제 학습 기록으로 계산한 나의 학습 통계 */
export const computeMyStats = (lessons: Lesson[], progress: LessonProgress[]) => {
  const weeksWith = (pick: (p: LessonProgress) => unknown) => new Set(progress.filter(pick).map((p) => p.week));
  const completedWeeks = weeksWith((p) => p.completedAt);
  const startedWeeks = weeksWith((p) => p.startedAt);
  const quizzes = progress.filter((p) => p.quiz && p.quiz.total > 0);
  const quizRate = quizzes.length
    ? quizzes.reduce((s, p) => s + p.quiz!.correct / p.quiz!.total, 0) / quizzes.length
    : null;
  const avgProgress = progress.length ? progress.reduce((s, p) => s + p.progressRatio, 0) / progress.length : 0;

  // 연속 학습일: 오늘(또는 어제)부터 거꾸로 학습한 날이 이어진 날 수
  const days = new Set(
    progress.flatMap((p) => [p.startedAt, p.completedAt, p.lastStudiedAt, p.quiz?.submittedAt]).filter(Boolean).map((d) => dayKey(d!)),
  );
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.toISOString()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const published = lessons.filter((l) => l.status === "published");
  const next = published.find((l) => !progress.some((p) => p.lessonId === l.id && p.completedAt)) ?? null;

  return {
    completedWeeks,
    startedWeeks,
    completedCount: completedWeeks.size,
    totalWeeks: COURSE_WEEK_COUNT,
    avgProgress,
    quizRate,
    streak,
    next,
  };
};

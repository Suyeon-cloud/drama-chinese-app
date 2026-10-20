import { createLocalCollection } from "./localCollection";
import type { LessonProgress } from "./models";

/** 학습 기록 저장소. 원격 DB 연결 시 같은 인터페이스로 구현을 교체한다. */
export interface ProgressStore {
  get(userId: string, lessonId: string): Promise<LessonProgress | null>;
  listByUser(userId: string): Promise<LessonProgress[]>;
  /** 관리자용. 로컬 구현에서는 이 브라우저에 저장된 기록만 반환한다. */
  listAll(): Promise<LessonProgress[]>;
  save(progress: LessonProgress): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export const progressKey = (userId: string, lessonId: string) => `${userId}::${lessonId}`;

export const emptyProgress = (userId: string, lessonId: string, week: number): LessonProgress => ({
  userId,
  lessonId,
  week,
  startedAt: null,
  completedAt: null,
  watchedRanges: [],
  progressRatio: 0,
  maxPosition: 0,
  quiz: null,
  quizAttempts: 0,
  lastStudiedAt: null,
});

export const createLocalProgressStore = (): ProgressStore => {
  const col = createLocalCollection<LessonProgress>("zhuiju.progress.v1", (p) =>
    progressKey(p.userId, p.lessonId),
  );
  return {
    get: async (userId, lessonId) => col.find(progressKey(userId, lessonId)),
    listByUser: async (userId) => col.all().filter((p) => p.userId === userId),
    listAll: async () => col.all(),
    save: async (progress) => col.put(progress),
    subscribe: col.subscribe,
  };
};

/** 재생 구간 [a, b]를 추가하고 겹치거나 맞닿은 구간을 병합한다. */
export const addWatchedRange = (
  ranges: [number, number][],
  a: number,
  b: number,
): [number, number][] => {
  if (b <= a) return ranges;
  const sorted = [...ranges, [a, b] as [number, number]].sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 0.5) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
};

export const watchedSeconds = (ranges: [number, number][]) =>
  ranges.reduce((sum, [s, e]) => sum + (e - s), 0);

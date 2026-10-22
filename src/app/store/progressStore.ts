import { api } from "../lib/api";
import type { LessonProgress } from "./models";
import { createRemoteEmitter } from "./remote";

/** 학습 기록 저장소 (서버). 학습자는 본인 기록만, 관리자는 전체 기록을 받는다. */
export interface ProgressStore {
  get(userId: string, lessonId: string): Promise<LessonProgress | null>;
  listByUser(userId: string): Promise<LessonProgress[]>;
  /** 관리자용: 모든 학습자의 기록 */
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

export const createRemoteProgressStore = (): ProgressStore => {
  const emitter = createRemoteEmitter();
  // 로그인 전에는 서버가 401을 주므로 빈 목록으로 본다.
  const listAll = () => api<LessonProgress[]>("/progress").catch(() => [] as LessonProgress[]);
  return {
    get: async (userId, lessonId) =>
      (await listAll()).find((p) => p.userId === userId && p.lessonId === lessonId) ?? null,
    listByUser: async (userId) => (await listAll()).filter((p) => p.userId === userId),
    listAll,
    save: async (progress) => {
      // 화면을 떠날 때(pagehide)도 저장되도록 keepalive
      await api("/progress", { method: "PUT", body: progress, keepalive: true });
      emitter.emit();
    },
    subscribe: emitter.subscribe,
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

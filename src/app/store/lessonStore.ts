import type { Lesson } from "../../content/types";
import { api } from "../lib/api";
import { createRemoteEmitter } from "./remote";

/** 강의자료 저장소 (서버). 학습자·비로그인은 공개된 강의자료만 받는다. */
export interface LessonStore {
  list(): Promise<Lesson[]>;
  get(id: string): Promise<Lesson | null>;
  save(lesson: Lesson): Promise<Lesson>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export const createRemoteLessonStore = (): LessonStore => {
  const emitter = createRemoteEmitter();
  const list = async () =>
    (await api<Lesson[]>("/lessons")).sort(
      (a, b) => a.week - b.week || a.createdAt.localeCompare(b.createdAt),
    );
  return {
    list,
    get: async (id) => (await list()).find((l) => l.id === id) ?? null,
    save: async (lesson) => {
      const saved = await api<Lesson>(`/lessons/${encodeURIComponent(lesson.id)}`, { method: "PUT", body: lesson });
      emitter.emit();
      return saved;
    },
    remove: async (id) => {
      await api(`/lessons/${encodeURIComponent(id)}`, { method: "DELETE" });
      emitter.emit();
    },
    subscribe: emitter.subscribe,
  };
};

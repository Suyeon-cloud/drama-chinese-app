import { SEED_LESSONS } from "../../content/lessons";
import type { Lesson } from "../../content/types";
import { createLocalCollection } from "./localCollection";
import { nowIso } from "./localJson";

/** 강의자료 저장소. 원격 DB 연결 시 같은 인터페이스로 구현을 교체한다. */
export interface LessonStore {
  list(): Promise<Lesson[]>;
  get(id: string): Promise<Lesson | null>;
  save(lesson: Lesson): Promise<Lesson>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** 저장된 강의자료가 없으면 SEED_LESSONS(기본 예시 자료)를 보여준다. */
export const createLocalLessonStore = (): LessonStore => {
  const col = createLocalCollection<Lesson>("zhuiju.lessons.v1", (l) => l.id, () => SEED_LESSONS);
  return {
    list: async () =>
      col.all().sort((a, b) => a.week - b.week || a.createdAt.localeCompare(b.createdAt)),
    get: async (id) => col.find(id),
    save: async (lesson) => {
      const saved = { ...lesson, updatedAt: nowIso() };
      col.put(saved);
      return saved;
    },
    remove: async (id) => col.remove(id),
    subscribe: col.subscribe,
  };
};

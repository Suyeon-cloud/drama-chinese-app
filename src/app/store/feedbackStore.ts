import { createLocalCollection } from "./localCollection";
import { nowIso } from "./localJson";
import type { FeedbackDraft } from "./models";

/** 피드백 초안 저장소. Gmail 발송 기능은 다음 단계에서 이 데이터를 사용해 연결한다. */
export interface FeedbackStore {
  list(): Promise<FeedbackDraft[]>;
  save(draft: FeedbackDraft): Promise<FeedbackDraft>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export const createLocalFeedbackStore = (): FeedbackStore => {
  const col = createLocalCollection<FeedbackDraft>("zhuiju.feedback.v1", (f) => f.id);
  return {
    list: async () => col.all().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    save: async (draft) => {
      const saved = { ...draft, updatedAt: nowIso() };
      col.put(saved);
      return saved;
    },
    remove: async (id) => col.remove(id),
    subscribe: col.subscribe,
  };
};

import { api } from "../lib/api";
import type { FeedbackDraft } from "./models";
import { createRemoteEmitter } from "./remote";

/** 피드백 초안 저장소 (서버, 관리자 전용) */
export interface FeedbackStore {
  list(): Promise<FeedbackDraft[]>;
  save(draft: FeedbackDraft): Promise<FeedbackDraft>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export const createRemoteFeedbackStore = (): FeedbackStore => {
  const emitter = createRemoteEmitter();
  return {
    list: async () =>
      (await api<FeedbackDraft[]>("/feedback")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    save: async (draft) => {
      const saved = await api<FeedbackDraft>(`/feedback/${encodeURIComponent(draft.id)}`, {
        method: "PUT",
        body: draft,
      });
      emitter.emit();
      return saved;
    },
    remove: async (id) => {
      await api(`/feedback/${encodeURIComponent(id)}`, { method: "DELETE" });
      emitter.emit();
    },
    subscribe: emitter.subscribe,
  };
};

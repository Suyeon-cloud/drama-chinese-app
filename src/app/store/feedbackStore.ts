import { api } from "../lib/api";
import type { FeedbackDraft } from "./models";
import { createRemoteEmitter } from "./remote";

/**
 * 피드백 초안 저장소 (서버).
 * 교수자는 과목 경로(listForCourse·saveForCourse)로 운영 중인 담당 분반 수강생의 초안만 읽고 쓴다.
 * list·save·remove는 관리자 API(/feedback)용으로 남겨 둔다. (관리자 화면에는 학생 피드백이 없다)
 */
export interface FeedbackStore {
  list(): Promise<FeedbackDraft[]>;
  save(draft: FeedbackDraft): Promise<FeedbackDraft>;
  remove(id: string): Promise<void>;
  listForCourse(courseId: string, sectionId?: string): Promise<FeedbackDraft[]>;
  saveForCourse(courseId: string, draft: FeedbackDraft): Promise<FeedbackDraft>;
  subscribe(listener: () => void): () => void;
}

const newestFirst = (drafts: FeedbackDraft[]) => drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const createRemoteFeedbackStore = (): FeedbackStore => {
  const emitter = createRemoteEmitter();
  return {
    list: async () => newestFirst(await api<FeedbackDraft[]>("/feedback")),
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
    listForCourse: async (courseId, sectionId) =>
      newestFirst(
        await api<FeedbackDraft[]>(
          `/courses/${encodeURIComponent(courseId)}/feedback${sectionId ? `?section=${encodeURIComponent(sectionId)}` : ""}`,
        ),
      ),
    saveForCourse: async (courseId, draft) => {
      const saved = await api<FeedbackDraft>(
        `/courses/${encodeURIComponent(courseId)}/feedback/${encodeURIComponent(draft.id)}`,
        { method: "PUT", body: draft },
      );
      emitter.emit();
      return saved;
    },
    subscribe: emitter.subscribe,
  };
};

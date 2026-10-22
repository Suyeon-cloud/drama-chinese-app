import { api } from "../lib/api";
import type { LearnerProfile } from "./models";
import { createRemoteEmitter } from "./remote";

/** 회원(학습자) 저장소 (서버, 관리자 전용). 가입·최종 접속은 서버가 로그인할 때 기록한다. */
export interface LearnerStore {
  list(): Promise<LearnerProfile[]>;
  /** 회원정보 수정·승인 상태 변경 */
  update(id: string, patch: Partial<LearnerProfile>): Promise<LearnerProfile>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export const createRemoteLearnerStore = (): LearnerStore => {
  const emitter = createRemoteEmitter();
  return {
    list: () => api<LearnerProfile[]>("/members"),
    update: async (id, patch) => {
      const saved = await api<LearnerProfile>(`/members/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
      emitter.emit();
      return saved;
    },
    remove: async (id) => {
      await api(`/members/${encodeURIComponent(id)}`, { method: "DELETE" });
      emitter.emit();
    },
    subscribe: emitter.subscribe,
  };
};

import { createLocalCollection } from "./localCollection";
import { nowIso } from "./localJson";
import type { LearnerProfile } from "./models";

/** 학습자 목록 저장소. 로컬 구현에서는 이 브라우저에서 로그인한 학습자만 기록된다. */
export interface LearnerStore {
  list(): Promise<LearnerProfile[]>;
  /** 로그인 시 호출: 없으면 등록, 있으면 최근 접속 시각 갱신 */
  touch(
    profile: Pick<LearnerProfile, "id" | "name" | "email" | "avatarColor" | "picture">,
  ): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export const createLocalLearnerStore = (): LearnerStore => {
  const col = createLocalCollection<LearnerProfile>("zhuiju.learners.v1", (l) => l.id);
  return {
    list: async () => col.all(),
    touch: async (profile) => {
      const prev = col.find(profile.id);
      const now = nowIso();
      col.put({ ...profile, firstSeenAt: prev?.firstSeenAt ?? now, lastSeenAt: now });
    },
    subscribe: col.subscribe,
  };
};

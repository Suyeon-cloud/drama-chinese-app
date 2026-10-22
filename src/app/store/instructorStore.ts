import { api } from "../lib/api";
import type { InstructorRecord } from "./models";
import { createRemoteEmitter } from "./remote";

/** 교수자 이메일 저장소 (서버, 관리자 전용). 등록된 Google 이메일로 로그인하면 교수자 화면이 열린다. */
export interface InstructorStore {
  list(): Promise<InstructorRecord[]>;
  add(email: string): Promise<void>;
  remove(email: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export const createRemoteInstructorStore = (): InstructorStore => {
  const emitter = createRemoteEmitter();
  return {
    list: () => api<InstructorRecord[]>("/instructors"),
    add: async (email) => {
      await api("/instructors", { method: "POST", body: { email } });
      emitter.emit();
    },
    remove: async (email) => {
      await api(`/instructors/${encodeURIComponent(email)}`, { method: "DELETE" });
      emitter.emit();
    },
    subscribe: emitter.subscribe,
  };
};

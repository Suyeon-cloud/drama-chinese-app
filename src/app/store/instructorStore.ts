import { isValidEmail, normalizeEmail } from "../auth/roles";
import { createLocalCollection } from "./localCollection";
import { nowIso } from "./localJson";
import type { InstructorRecord } from "./models";

/**
 * 교수자 이메일 저장소. 원격 DB 연결 시 같은 인터페이스로 구현을 교체한다.
 * 로컬 구현은 이 브라우저의 localStorage에만 저장되며 다른 기기·브라우저와 공유되지 않는다.
 */
export interface InstructorStore {
  list(): Promise<InstructorRecord[]>;
  add(email: string, addedBy: string): Promise<void>;
  remove(email: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** .env의 VITE_INITIAL_INSTRUCTOR_EMAIL (선택). 없거나 형식이 틀리면 사용하지 않는다. */
const initialInstructorEmail = (): string | null => {
  const raw = import.meta.env.VITE_INITIAL_INSTRUCTOR_EMAIL ?? "";
  return isValidEmail(raw) ? normalizeEmail(raw) : null;
};

export const createLocalInstructorStore = (): InstructorStore => {
  const col = createLocalCollection<InstructorRecord>("zhuiju.instructors.v1", (r) => r.email);
  const initial = initialInstructorEmail();
  return {
    list: async () => {
      const local = col.all().filter((r) => r.email !== initial);
      return initial
        ? [{ email: initial, source: "env", addedBy: null, addedAt: null }, ...local]
        : local;
    },
    add: async (email, addedBy) => {
      const e = normalizeEmail(email);
      if (!isValidEmail(e) || e === initial || col.find(e)) return;
      col.put({ email: e, source: "local", addedBy: normalizeEmail(addedBy), addedAt: nowIso() });
    },
    remove: async (email) => col.remove(normalizeEmail(email)),
    subscribe: col.subscribe,
  };
};

import { api } from "../lib/api";
import type { WeekMaterial, WeekMaterialInput, WeekMaterialPatch } from "./models";
import { createRemoteEmitter } from "./remote";

/**
 * 주차별 보충 학습자료 저장소 (서버). 실패하면 ApiError를 그대로 던진다 — 화면이 오류를 보여 주고, 성공한 것처럼 보이지 않게.
 * 교수자·관리자는 비공개 포함 전체, 학습자는 공개 자료만 받는다. (서버가 권한에 맞춰 거른다)
 */
export interface MaterialStore {
  list(courseId: string): Promise<WeekMaterial[]>;
  create(courseId: string, input: WeekMaterialInput): Promise<WeekMaterial>;
  update(materialId: string, patch: WeekMaterialPatch): Promise<WeekMaterial>;
  remove(materialId: string): Promise<void>;
  /** 한 주차의 자료 id 전체를 새 순서로 */
  reorder(courseId: string, week: number, ids: string[]): Promise<WeekMaterial[]>;
  subscribe(listener: () => void): () => void;
}

const coursePath = (courseId: string) => `/courses/${encodeURIComponent(courseId)}/materials`;
const materialPath = (materialId: string) => `/materials/${encodeURIComponent(materialId)}`;

export const createRemoteMaterialStore = (): MaterialStore => {
  const emitter = createRemoteEmitter();
  const changed = <T>(p: Promise<T>) =>
    p.then((v) => {
      emitter.emit();
      return v;
    });
  return {
    list: (courseId) => api<WeekMaterial[]>(coursePath(courseId)),
    create: (courseId, input) => changed(api<WeekMaterial>(coursePath(courseId), { method: "POST", body: input })),
    update: (materialId, patch) => changed(api<WeekMaterial>(materialPath(materialId), { method: "PATCH", body: patch })),
    remove: (materialId) => changed(api(materialPath(materialId), { method: "DELETE" }).then(() => undefined)),
    reorder: (courseId, week, ids) =>
      changed(api<WeekMaterial[]>(`${coursePath(courseId)}/order`, { method: "PUT", body: { week, ids } })),
    subscribe: emitter.subscribe,
  };
};

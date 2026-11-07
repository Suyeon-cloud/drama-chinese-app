import { api, apiBlob, ApiError } from "../lib/api";
import type { WeekMaterial, WeekMaterialHtml, WeekMaterialHtmlInput, WeekMaterialInput, WeekMaterialPatch, WeekMaterialStatus } from "./models";
import { createRemoteEmitter } from "./remote";

/** 업로드 시작 응답: 이 주소로 파일을 PUT한다 (JSON 모드는 이 서버, Supabase는 Storage 서명 주소) */
export type UploadTicket = { token: string; uploadUrl: string; headers: Record<string, string>; expiresAt: string; fileName: string; mimeType: string };
export type FileUploadInput = { week: number; title: string; description?: string; status?: WeekMaterialStatus };
export type FileOpenMode = "preview" | "download";

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
  /** 새 파일 자료: 업로드 시작 → 파일 올리기 → 완료(서버가 검사한 뒤 자료가 생긴다) */
  uploadFile(courseId: string, input: FileUploadInput, file: File, onProgress?: (ratio: number) => void): Promise<WeekMaterial>;
  /** 파일 자료의 파일 교체 */
  replaceFile(materialId: string, file: File, onProgress?: (ratio: number) => void): Promise<WeekMaterial>;
  /** 파일 열기·내려받기 주소 (60초). 요청마다 서버가 권한을 확인한다 */
  fileUrl(materialId: string, mode: FileOpenMode): Promise<{ url: string; mode: FileOpenMode }>;
  /** 새 HTML 학습자료 (4단계). 본문 수정은 update(materialId, { html }) */
  createHtml(courseId: string, input: WeekMaterialHtmlInput): Promise<WeekMaterial>;
  /** HTML 본문 열기 — 요청마다 서버가 권한을 확인한다 (학생은 수강 과목의 공개 자료만) */
  html(materialId: string): Promise<WeekMaterialHtml>;
  /** 내려받을 완전한 HTML 문서 (서버가 charset·CSP를 맨 앞에 넣는다) */
  htmlFile(materialId: string): Promise<Blob>;
  subscribe(listener: () => void): () => void;
}

const coursePath = (courseId: string) => `/courses/${encodeURIComponent(courseId)}/materials`;
const materialPath = (materialId: string) => `/materials/${encodeURIComponent(materialId)}`;

/** 파일을 업로드 주소로 PUT한다 (진행률을 보여 주려고 XHR). 실패하면 ApiError */
const putFile = (ticket: UploadTicket, file: File, onProgress?: (ratio: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl);
    for (const [k, v] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, "파일을 올리지 못했어요. 형식·크기를 확인하고 다시 시도해 주세요."));
    xhr.onerror = () => reject(new ApiError(0, "파일을 올리는 중 연결이 끊겼어요. 다시 시도해 주세요."));
    xhr.send(file);
  });

const fileMeta = (file: File) => ({ fileName: file.name, mimeType: file.type, sizeBytes: file.size });

export const createRemoteMaterialStore = (): MaterialStore => {
  const emitter = createRemoteEmitter();
  const changed = <T>(p: Promise<T>) =>
    p.then((v) => {
      emitter.emit();
      return v;
    });
  const finish = async (ticket: UploadTicket, file: File, onProgress?: (ratio: number) => void) => {
    await putFile(ticket, file, onProgress);
    return changed(api<WeekMaterial>(`/material-uploads/${encodeURIComponent(ticket.token)}/complete`, { method: "POST", body: {} }));
  };
  return {
    list: (courseId) => api<WeekMaterial[]>(coursePath(courseId)),
    create: (courseId, input) => changed(api<WeekMaterial>(coursePath(courseId), { method: "POST", body: input })),
    update: (materialId, patch) => changed(api<WeekMaterial>(materialPath(materialId), { method: "PATCH", body: patch })),
    remove: (materialId) => changed(api(materialPath(materialId), { method: "DELETE" }).then(() => undefined)),
    reorder: (courseId, week, ids) =>
      changed(api<WeekMaterial[]>(`${coursePath(courseId)}/order`, { method: "PUT", body: { week, ids } })),
    uploadFile: async (courseId, input, file, onProgress) => {
      const ticket = await api<UploadTicket>(`${coursePath(courseId)}/uploads`, { method: "POST", body: { ...input, ...fileMeta(file) } });
      return finish(ticket, file, onProgress);
    },
    replaceFile: async (materialId, file, onProgress) => {
      const ticket = await api<UploadTicket>(`${materialPath(materialId)}/uploads`, { method: "POST", body: fileMeta(file) });
      return finish(ticket, file, onProgress);
    },
    fileUrl: (materialId, mode) => api<{ url: string; mode: FileOpenMode }>(`${materialPath(materialId)}/file?mode=${mode}`),
    createHtml: (courseId, input) => changed(api<WeekMaterial>(`${coursePath(courseId)}/html`, { method: "POST", body: input })),
    html: (materialId) => api<WeekMaterialHtml>(`${materialPath(materialId)}/html`),
    htmlFile: (materialId) => apiBlob(`${materialPath(materialId)}/html?mode=download`),
    subscribe: emitter.subscribe,
  };
};

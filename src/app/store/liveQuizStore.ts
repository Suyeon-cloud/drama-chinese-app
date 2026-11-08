// 6-A: 실시간 퀴즈 문제 세트 저장소 (서버). 교수자 개인 AI 키는 이 모듈의 메모리에만 둔다 — 저장·전송 기록 없음, 새로고침하면 사라진다.
import type { LiveQuizSet, LiveQuizSetInput } from "../../content/liveQuiz";
import { api } from "../lib/api";

let personalKey = "";
/** 교수자 개인 Anthropic 키 (브라우저 메모리에만. localStorage·sessionStorage에 쓰지 않는다) */
export const setPersonalAiKey = (key: string) => {
  personalKey = key.trim();
};
export const hasPersonalAiKey = () => personalKey.length > 0;
export const clearPersonalAiKey = () => {
  personalKey = "";
};

export type AiStatus = { connected: boolean; liveQuizShared?: boolean; model?: string };

export const liveQuizStore = {
  list: (courseId: string) => api<LiveQuizSet[]>(`/courses/${encodeURIComponent(courseId)}/live-quiz-sets`),
  create: (courseId: string, input: LiveQuizSetInput) =>
    api<LiveQuizSet>(`/courses/${encodeURIComponent(courseId)}/live-quiz-sets`, { method: "POST", body: input }),
  update: (setId: string, version: number, input: LiveQuizSetInput) =>
    api<LiveQuizSet>(`/live-quiz-sets/${encodeURIComponent(setId)}`, { method: "PUT", body: { ...input, version } }),
  remove: (setId: string) => api<{ ok: true }>(`/live-quiz-sets/${encodeURIComponent(setId)}`, { method: "DELETE" }),
  aiStatus: () => api<AiStatus>("/ai/status"),
  /** AI 초안: 개인 키가 있으면 그 키로(요청 헤더, 서버는 저장하지 않음), 없으면 관리자가 허용한 공용 키 */
  generate: (prompt: string) =>
    api<{ text: string; keySource: "personal" | "shared" }>("/ai/live-quiz", {
      method: "POST",
      body: { prompt },
      headers: personalKey ? { "X-Anthropic-Key": personalKey } : {},
    }),
};

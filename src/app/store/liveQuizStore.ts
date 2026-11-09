// 6-A: 실시간 퀴즈 문제 세트 저장소 (서버). AI 생성은 본인 API 키(store/aiKey — 브라우저 메모리에만)를 요청 헤더로 붙인다.
import type { LiveQuizSet, LiveQuizSetInput } from "../../content/liveQuiz";
import { api } from "../lib/api";
import { personalAiKeyHeaders } from "./aiKey";

export const liveQuizStore = {
  list: (courseId: string) => api<LiveQuizSet[]>(`/courses/${encodeURIComponent(courseId)}/live-quiz-sets`),
  create: (courseId: string, input: LiveQuizSetInput) =>
    api<LiveQuizSet>(`/courses/${encodeURIComponent(courseId)}/live-quiz-sets`, { method: "POST", body: input }),
  update: (setId: string, version: number, input: LiveQuizSetInput) =>
    api<LiveQuizSet>(`/live-quiz-sets/${encodeURIComponent(setId)}`, { method: "PUT", body: { ...input, version } }),
  remove: (setId: string) => api<{ ok: true }>(`/live-quiz-sets/${encodeURIComponent(setId)}`, { method: "DELETE" }),
  /** AI 초안: 본인 키로(요청 헤더, 서버는 저장하지 않음). 키가 없으면 서버가 프롬프트 복사·JSON 붙여넣기로 안내한다 */
  generate: (prompt: string) => api<{ text: string }>("/ai/live-quiz", { method: "POST", body: { prompt }, headers: personalAiKeyHeaders() }),
};

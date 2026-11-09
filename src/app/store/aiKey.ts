// 본인 Anthropic API 키(BYOK) — 관리자·교수자 공통. 이 모듈의 메모리 변수에만 둔다.
// localStorage·sessionStorage·서버·DB에 저장하지 않는다. 새로고침하거나 로그아웃하면 사라진다.
// 강의자료 AI 초안·번역·병음·실시간 퀴즈가 같은 키를 쓰고, AI 생성 요청에만 X-Anthropic-Key 헤더로 붙인다.
import { useSyncExternalStore } from "react";

let personalKey = "";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const setPersonalAiKey = (key: string) => {
  personalKey = key.trim();
  emit();
};
export const clearPersonalAiKey = () => {
  personalKey = "";
  emit();
};
export const hasPersonalAiKey = () => personalKey.length > 0;
/** AI 생성 요청에만 붙이는 헤더 (키가 없으면 빈 객체 → 서버가 프롬프트 복사·JSON 붙여넣기로 안내) */
export const personalAiKeyHeaders = (): Record<string, string> => (personalKey ? { "X-Anthropic-Key": personalKey } : {});
/** 키 입력 여부 (화면끼리 같은 상태를 본다) */
export const usePersonalAiKey = () => useSyncExternalStore(subscribe, hasPersonalAiKey);

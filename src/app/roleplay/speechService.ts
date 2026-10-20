// 음성 관련 서비스 레이어.
// - speak: 브라우저 내장 speechSynthesis(무료, API key 불필요)를 사용하고, 없으면 조용히 실패한다.
// - evaluatePronunciation: 1차 판본에서는 Demo 결과를 돌려준다.
//   실제 음성인식/발음평가 API를 붙일 때 이 함수만 교체하면 된다.

import type { RolePlayLine } from "../../content/types";

export type PronunciationResult = {
  score: number;
  summary: string;
  tip: string;
  demo: boolean;
};

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export const speak = (text: string, onEnd?: () => void): boolean => {
  if (!canSpeak()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 0.9;
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  window.speechSynthesis.speak(u);
  return true;
};

export const stopSpeaking = () => {
  if (canSpeak()) window.speechSynthesis.cancel();
};

/** Demo: 녹음하는 것처럼 잠시 기다린 뒤, 콘텐츠 데이터의 예시 피드백을 돌려준다. */
export const evaluatePronunciation = async (
  line: RolePlayLine,
): Promise<PronunciationResult> => {
  await new Promise((r) => setTimeout(r, 2200));
  return { ...line.demoFeedback, demo: true };
};

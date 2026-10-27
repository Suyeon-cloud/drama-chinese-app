import React from "react";
import { lowerPinyin } from "../../content/lessons";
import type { SubtitleCue } from "../../content/types";
import { toPinyin, usePinyinReady } from "../lib/pinyin";

/** 중국어 cue의 병음: 저장된 값(사람·AI가 입력) → 자동 변환값. 항상 소문자로 보여준다. */
export const cuePinyin = (cue: SubtitleCue) => lowerPinyin(cue.pinyin?.trim() || toPinyin(cue.zh));

/**
 * 영상 프레임 하단 중앙에 자막을 표시한다. 기본은 한국어 번역(ko).
 * langs를 주면 언어별로 현재 cue를 찾아 위에서부터 차례로 표시한다. (예: 원문 + 번역)
 * pinyin이 true면 중국어 줄 바로 아래에 병음 줄을 붙인다. (중국어 줄을 숨기면 병음도 숨겨진다)
 * 영상에 포함된 원본 자막·YouTube 컨트롤보다 약간 위에 배치된다.
 */
export const SubtitleLayer: React.FC<{
  cues: SubtitleCue[];
  time: number;
  lang?: "ko" | "zh";
  langs?: ("ko" | "zh")[];
  /** 중국어 줄 아래 병음 표시 */
  pinyin?: boolean;
  /** 자막 가리기 박스(CaptionMaskBox) 안에 표시할 때 */
  inMask?: boolean;
}> = ({ cues, time, lang = "ko", langs, pinyin = false, inMask = false }) => {
  usePinyinReady();
  const lines = (langs ?? [lang]).flatMap((l) => {
    const cue = cues.find((c) => time >= c.start && time < c.end && c[l]);
    if (!cue) return [];
    const text = cue[l]!;
    const py = l === "zh" && pinyin ? cuePinyin(cue) : "";
    return [
      { key: `${l}-${cue.start}`, kind: l, text },
      ...(py ? [{ key: `py-${cue.start}`, kind: "py" as const, text: py }] : []),
    ];
  });
  if (lines.length === 0) return null;
  return (
    <div className={`ko-subtitle ${lines.length > 1 ? "multi" : ""} ${inMask ? "in-mask" : ""}`} aria-live="polite">
      {lines.map((line) => (
        <span
          key={line.key}
          className={line.kind === "py" ? "sub-py" : undefined}
          lang={line.kind === "zh" ? "zh-CN" : line.kind === "py" ? "zh-Latn-pinyin" : "ko"}
        >
          {line.text}
        </span>
      ))}
    </div>
  );
};

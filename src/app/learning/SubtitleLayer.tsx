import React, { useMemo } from "react";
import { lowerPinyin } from "../../content/lessons";
import type { SubtitleCue } from "../../content/types";
import { toPinyin, usePinyinReady } from "../lib/pinyin";

/** 중국어 cue의 병음: 저장된 값(사람·AI가 입력) → 자동 변환값. 항상 소문자로 보여준다. */
export const cuePinyin = (cue: SubtitleCue) => lowerPinyin(cue.pinyin?.trim() || toPinyin(cue.zh));

type Lang = "ko" | "zh";
type SubLine = { key: string; kind: Lang | "py"; text: string };

/** time 시점에 표시할 자막 줄 (언어 순서대로, 중국어 아래 병음) */
const linesAt = (cues: SubtitleCue[], time: number, langs: Lang[], pinyin: boolean): SubLine[] =>
  langs.flatMap((l) => {
    const cue = cues.find((c) => time >= c.start && time < c.end && c[l]);
    if (!cue) return [];
    const text = cue[l]!;
    const py = l === "zh" && pinyin ? cuePinyin(cue) : "";
    return [
      { key: `${l}-${cue.start}`, kind: l, text },
      ...(py ? [{ key: `py-${cue.start}`, kind: "py" as const, text: py }] : []),
    ];
  });

/** 자막 한 묶음. SubtitleLayer(보이는 자막)와 SubtitleReserve(높이 확보용)가 같은 구조·클래스를 쓴다. */
const SubtitleBlock: React.FC<{ lines: SubLine[]; inMask: boolean; live?: boolean }> = ({ lines, inMask, live }) => (
  <div className={`ko-subtitle ${lines.length > 1 ? "multi" : ""} ${inMask ? "in-mask" : ""}`} aria-live={live ? "polite" : undefined}>
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
  const lines = linesAt(cues, time, langs ?? [lang], pinyin);
  if (lines.length === 0) return null;
  return <SubtitleBlock lines={lines} inMask={inMask} live />;
};

/**
 * 자막 가리기 박스의 높이 확보용 (보이지 않음·보조기기 제외). 이 강의에서 나올 수 있는 모든 자막 묶음을
 * 같은 칸에 겹쳐 두어, 박스가 '가장 긴 자막(실제 길이·줄바꿈 포함)' 높이를 처음부터 차지하게 한다.
 * 재생 중 자막이 없거나 짧거나 길어도 박스 크기·위치·글자 크기가 바뀌지 않는다.
 * 재생 시각이 아니라 자막·표시 설정이 바뀔 때만 다시 만든다.
 */
export const SubtitleReserve: React.FC<{ cues: SubtitleCue[]; langs: Lang[]; pinyin: boolean }> = React.memo(
  ({ cues, langs, pinyin }) => {
    const ready = usePinyinReady();
    const langsKey = langs.join(",");
    const blocks = useMemo(() => {
      const ls = langsKey ? (langsKey.split(",") as Lang[]) : [];
      const seen = new Set<string>();
      const out: SubLine[][] = [];
      // 자막이 바뀌는 모든 시점(각 cue 시작)에서 실제로 함께 보이는 줄 묶음을 모은다. 같은 내용은 한 번만.
      for (const t of [...new Set(cues.map((c) => c.start))]) {
        const lines = linesAt(cues, t, ls, pinyin);
        const sig = lines.map((l) => l.kind + ":" + l.text).join("|");
        if (!lines.length || seen.has(sig)) continue;
        seen.add(sig);
        out.push(lines);
      }
      return out;
      // ready: 병음 사전을 불러온 뒤 병음 줄 길이를 다시 잰다
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cues, langsKey, pinyin, ready]);
    if (!blocks.length) return null;
    return (
      <div className="subtitle-reserve" aria-hidden>
        {blocks.map((lines, i) => (
          <SubtitleBlock key={i} lines={lines} inMask />
        ))}
      </div>
    );
  },
);
SubtitleReserve.displayName = "SubtitleReserve";

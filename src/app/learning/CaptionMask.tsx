import React from "react";
import type { CaptionMask, SubtitlePosition } from "../../content/types";

/**
 * 기본값: 영상 속 자막이 흔히 놓이는 하단(약 78~90%) — 아래 컨트롤 바 영역은 남겨 둔다.
 * 너비는 화면 전체가 아닌 가운데 자막 패널 형태(영상 너비의 70%).
 */
export const DEFAULT_CAPTION_MASK: Required<CaptionMask> = { enabled: false, top: 78, height: 12, width: 70 };

export const MASK_TOP_RANGE = { min: 40, max: 96 } as const;
export const MASK_HEIGHT_RANGE = { min: 4, max: 30 } as const;
export const MASK_WIDTH_RANGE = { min: 30, max: 100 } as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 저장값을 안전한 범위로 맞춘다. (영상 밖으로 나가지 않게, width가 없던 이전 데이터는 기본 너비) */
export const normalizeMask = (mask: CaptionMask | null | undefined): Required<CaptionMask> => {
  const m = mask ?? DEFAULT_CAPTION_MASK;
  const height = clamp(Number(m.height) || DEFAULT_CAPTION_MASK.height, MASK_HEIGHT_RANGE.min, MASK_HEIGHT_RANGE.max);
  const top = clamp(Number(m.top) || DEFAULT_CAPTION_MASK.top, MASK_TOP_RANGE.min, Math.min(MASK_TOP_RANGE.max, 100 - height));
  const width = clamp(Number(m.width) || DEFAULT_CAPTION_MASK.width, MASK_WIDTH_RANGE.min, MASK_WIDTH_RANGE.max);
  return { enabled: !!m.enabled, top, height, width };
};

/**
 * 자막 위치별 패널 범위(영상 높이 대비 %). middle은 저장된 값을 그대로 쓴다.
 * midLow는 원본 자막(77.6~90%, 긴 문장은 폭 약 80%)을 넉넉히 덮는다. 자막 줄은 패널 안 세로 가운데에 놓인다.
 */
const POSITION_RANGE: Record<SubtitlePosition, Partial<CaptionMask>> = {
  high: { top: 70 },
  middle: {},
  midLow: { top: 75, height: 19, width: 82 },
  low: { top: 85, width: 66 },
};

export const maskAtPosition = (mask: CaptionMask, position: SubtitlePosition): CaptionMask => ({
  ...mask,
  ...POSITION_RANGE[position],
});

/**
 * 원본 영상 자막을 덮는 불투명 자막 패널(가로 중앙). 위치·크기는 영상(16:9 프레임) 대비 %라서
 * 일반 화면과 학습 전체화면에서 같은 비율로 놓인다. 앱 자막(children)은 이 안에 표시된다.
 */
export const CaptionMaskBox: React.FC<{
  mask: CaptionMask;
  /** 표시할 자막 줄 수 (원문·병음·번역). 3줄이면 글자 크기를 줄여 패널 안에 맞춘다. */
  lines?: number;
  children?: React.ReactNode;
}> = ({ mask, lines = 2, children }) => {
  const { top, height, width } = normalizeMask(mask);
  // 원문(주 자막) + 번역(0.8배 보조 자막) 두 줄이 패널 안에 들어가도록 글자 크기를 패널 높이(영상 너비 기준 cqi)에 맞춘다.
  // 병음까지 3줄이면 (주 자막 1 + 병음 0.72 + 번역 0.8) 높이에 맞춰 나누는 값을 키운다.
  const fontCqi = Math.min(2.3, (height * 0.5625) / (lines >= 3 ? 3.6 : 2.7));
  return (
    <div
      className="caption-mask"
      style={
        {
          top: `${top}%`,
          height: `${height}%`,
          left: `${(100 - width) / 2}%`,
          width: `${width}%`,
          "--mask-fs": `${fontCqi.toFixed(2)}cqi`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
};

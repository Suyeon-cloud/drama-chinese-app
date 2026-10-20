import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, TONES, type Tone } from "./theme";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** Card-level enter (fade + short slide-up) and exit (fade) shared by all overlays. */
export const useEnterExit = (enter = 12, exit = 15) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity =
    interpolate(frame, [0, enter], [0, 1], clamp) *
    interpolate(
      frame,
      [durationInFrames - exit, durationInFrames - 1],
      [1, 0],
      clamp,
    );
  const translateY = interpolate(frame, [0, enter], [24, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  return { opacity, translateY };
};

/** Linear interpolation that is always clamped. */
export const lerp = (
  frame: number,
  input: number[],
  output: number[],
  easing?: (t: number) => number,
) => interpolate(frame, input, output, { ...clamp, easing });

export const OverlayRoot: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <AbsoluteFill style={{ fontFamily: FONT, color: C.ink }}>
    {children}
  </AbsoluteFill>
);

export const OverlayCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: "rgba(255,255,255,0.97)",
      borderRadius: 30,
      border: `2px solid ${C.sky200}`,
      boxShadow: "0 10px 28px rgba(47,143,214,0.16)",
      padding: "26px 30px",
      boxSizing: "border-box",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Label: React.FC<{
  tone?: Tone;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ tone = "sky", children, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 18px",
      borderRadius: 999,
      background: TONES[tone].bg,
      color: TONES[tone].ink,
      fontSize: 24,
      fontWeight: 700,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Pinyin: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div style={{ fontSize: 24, color: C.sky600, fontWeight: 500, ...style }}>
    {children}
  </div>
);

export const Meaning: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      fontSize: 26,
      color: C.ink2,
      fontWeight: 500,
      lineHeight: 1.45,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Splits a sentence around the first occurrence of `highlight`. */
export const splitHighlight = (sentence: string, highlight: string) => {
  const i = sentence.indexOf(highlight);
  if (i < 0) return { before: sentence, match: "", after: "" };
  return {
    before: sentence.slice(0, i),
    match: highlight,
    after: sentence.slice(i + highlight.length),
  };
};

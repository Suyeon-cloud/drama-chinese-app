import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "./theme";

export type HeroMotionProps = {
  chips: { zh: string; ko: string }[];
};

const SLOTS = [
  { x: 40, y: 50, bg: C.white, ink: C.sky600 },
  { x: 330, y: 30, bg: C.lavender, ink: C.lavenderInk },
  { x: 300, y: 250, bg: C.white, ink: C.pinkInk },
  { x: 60, y: 270, bg: C.mint, ink: C.mintInk },
];

/** 홈 Hero 카드에서 반복 재생되는 루프 모션. 학습 표현 칩이 부드럽게 떠다닌다. */
export const HeroMotion: React.FC<HeroMotionProps> = ({ chips }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const loop = (frame / durationInFrames) * Math.PI * 2;
  const pulse = 1 + Math.sin(loop * 2) * 0.04;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      {/* screen */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 110,
          width: 300,
          height: 190,
          borderRadius: 32,
          background: C.sky200,
          border: `6px solid ${C.white}`,
          boxShadow: "0 14px 30px rgba(47,143,214,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            background: C.white,
            scale: String(pulse),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              marginLeft: 8,
              borderTop: "18px solid transparent",
              borderBottom: "18px solid transparent",
              borderLeft: `28px solid ${C.sky500}`,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom: 18,
            height: 8,
            borderRadius: 4,
            background: "rgba(255,255,255,0.6)",
          }}
        >
          <div
            style={{
              width: `${interpolate(frame, [0, durationInFrames], [10, 100])}%`,
              height: "100%",
              borderRadius: 4,
              background: C.white,
            }}
          />
        </div>
      </div>

      {chips.slice(0, SLOTS.length).map((chip, i) => {
        const s = SLOTS[i];
        const dy = Math.sin(loop + i * 1.7) * 10;
        const dx = Math.cos(loop + i * 1.3) * 6;
        return (
          <div
            key={chip.zh}
            style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              translate: `${dx}px ${dy}px`,
              padding: "12px 20px",
              borderRadius: 22,
              background: s.bg,
              boxShadow: "0 8px 20px rgba(47,143,214,0.14)",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 800, color: s.ink }}>{chip.zh}</div>
            <div style={{ fontSize: 17, color: C.ink2, marginTop: 2 }}>{chip.ko}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

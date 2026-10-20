import React from "react";
import { Easing, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Label,
  Meaning,
  OverlayCard,
  OverlayRoot,
  Pinyin,
  lerp,
  useEnterExit,
} from "../primitives";
import { C } from "../theme";

export type MetaphorOverlayProps = {
  label: string;
  expression: string;
  /** 위에서 떨어지는 글자 (예: 掉进) */
  fallingPart: string;
  pinyin: string;
  literal: { label: string; text: string };
  actual: { label: string; text: string };
};

const FLIP_START = 105;
const FLIP_END = 130;

const HoneyPot: React.FC<{ frame: number }> = ({ frame }) => {
  const bob = Math.sin(frame / 10) * 3;
  const drip = (frame % 60) / 60;
  return (
    <svg width={110} height={110} viewBox="0 0 110 110" style={{ translate: `0 ${bob}px` }}>
      <ellipse cx={55} cy={100} rx={34} ry={6} fill="#F1E3C4" />
      <path
        d="M24 46 C14 66 18 92 55 94 C92 92 96 66 86 46 Z"
        fill="#FFD98A"
        stroke="#E5A93B"
        strokeWidth={4}
      />
      <rect x={30} y={30} width={50} height={18} rx={8} fill="#F6C45C" stroke="#E5A93B" strokeWidth={4} />
      <path d="M36 48 Q40 60 44 48" fill="#F6C45C" />
      <path d="M62 48 Q66 64 70 48" fill="#F6C45C" />
      <circle cx={66} cy={56 + drip * 14} r={4 * (1 - drip * 0.5)} fill="#F6C45C" opacity={1 - drip} />
      <text x={55} y={80} textAnchor="middle" fontSize={20} fontWeight={800} fill="#B9781B">
        蜜
      </text>
      <path d="M82 22 q8 -10 16 0" stroke="#7EC1EE" strokeWidth={4} fill="none" strokeLinecap="round" />
    </svg>
  );
};

/** 직역 → 실제 의미 순으로 카드를 옆으로 넘기며 비유 표현의 의미 변화를 보여준다. */
export const MetaphorOverlay: React.FC<MetaphorOverlayProps> = ({
  label,
  expression,
  fallingPart,
  pinyin,
  literal,
  actual,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { opacity, translateY } = useEnterExit();
  const rest = expression.startsWith(fallingPart)
    ? expression.slice(fallingPart.length)
    : expression;
  const falling = expression.startsWith(fallingPart) ? fallingPart : "";

  const literalX = lerp(frame, [FLIP_START, FLIP_END], [0, -110], Easing.in(Easing.cubic));
  const literalO = lerp(frame, [FLIP_START, FLIP_END - 5], [1, 0]);
  const actualX = lerp(frame, [FLIP_START + 5, FLIP_END + 5], [110, 0], Easing.out(Easing.cubic));
  const actualO = lerp(frame, [FLIP_START + 8, FLIP_END + 5], [0, 1]);

  const panel = (tone: "cream" | "sky"): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    borderRadius: 22,
    padding: "18px 22px",
    background: tone === "cream" ? C.cream : C.sky50,
    border: `2px solid ${tone === "cream" ? "#F6E2B5" : C.sky200}`,
    boxSizing: "border-box",
  });

  return (
    <OverlayRoot>
      <div style={{ opacity, translate: `0 ${translateY}px` }}>
        <OverlayCard>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <Label tone="cream">{label}</Label>
              <div style={{ fontSize: 52, fontWeight: 800, marginTop: 16, display: "flex" }}>
                {falling.split("").map((ch, i) => {
                  const s = spring({
                    frame: frame - 10 - i * 5,
                    fps,
                    config: { damping: 11, stiffness: 140 },
                  });
                  return (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        color: C.creamInk,
                        translate: `0 ${(1 - s) * -46}px`,
                        opacity: Math.min(1, s * 1.5),
                      }}
                    >
                      {ch}
                    </span>
                  );
                })}
                <span style={{ opacity: lerp(frame, [24, 36], [0, 1]) }}>{rest}</span>
              </div>
              <Pinyin style={{ opacity: lerp(frame, [28, 40], [0, 1]) }}>{pinyin}</Pinyin>
            </div>
            <HoneyPot frame={frame} />
          </div>

          <div
            style={{
              position: "relative",
              height: 150,
              marginTop: 20,
              overflow: "hidden",
              borderRadius: 22,
              opacity: lerp(frame, [34, 48], [0, 1]),
            }}
          >
            <div style={{ ...panel("cream"), translate: `${literalX}% 0`, opacity: literalO }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.creamInk }}>{literal.label}</div>
              <Meaning style={{ fontSize: 30, marginTop: 8, color: C.ink }}>{literal.text}</Meaning>
            </div>
            <div style={{ ...panel("sky"), translate: `${actualX}% 0`, opacity: actualO }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.sky600 }}>{actual.label}</div>
              <Meaning style={{ fontSize: 28, marginTop: 8, color: C.ink }}>{actual.text}</Meaning>
            </div>
          </div>
        </OverlayCard>
      </div>
    </OverlayRoot>
  );
};

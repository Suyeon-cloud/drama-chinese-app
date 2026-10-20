import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Label, OverlayRoot, Pinyin, lerp, useEnterExit } from "../primitives";
import { C } from "../theme";

export type ExpressionOverlayProps = {
  label: string;
  expression: string;
  /** 짧게 pulse 되는 글자 */
  pulseChar: string;
  pinyin: string;
  /** 순차적으로 전환되는 한국어 의미 */
  meanings: string[];
  note: { zh: string; ko: string };
};

const MEANING_START = 36;

/** 화용 표현: 말풍선 + 의미의 순차 전환으로 "상황에 따른 뉘앙스"를 보여준다. */
export const ExpressionOverlay: React.FC<ExpressionOverlayProps> = ({
  label,
  expression,
  pulseChar,
  pinyin,
  meanings,
  note,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { opacity } = useEnterExit();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const bubbleScale = 0.8 + 0.2 * pop;
  const pulse = lerp(frame, [22, 29, 38], [1, 1.28, 1]);

  const span = (durationInFrames - 20 - MEANING_START) / Math.max(1, meanings.length);

  return (
    <OverlayRoot>
      <div style={{ opacity }}>
        <div
          style={{
            position: "relative",
            background: C.white,
            borderRadius: 34,
            border: `2px solid ${C.sky200}`,
            boxShadow: "0 10px 28px rgba(47,143,214,0.16)",
            padding: "24px 30px 26px",
            scale: String(bubbleScale),
            transformOrigin: "top right",
          }}
        >
          <Label tone="pink">{label}</Label>
          <div style={{ fontSize: 64, fontWeight: 800, marginTop: 12, letterSpacing: 2 }}>
            {expression.split("").map((ch, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  color: ch === pulseChar ? C.pinkInk : C.ink,
                  scale: ch === pulseChar ? String(pulse) : undefined,
                }}
              >
                {ch}
              </span>
            ))}
          </div>
          <Pinyin>{pinyin}</Pinyin>
          <div style={{ position: "relative", height: 48, marginTop: 12 }}>
            {meanings.map((m, i) => {
              const start = MEANING_START + i * span;
              const isLast = i === meanings.length - 1;
              const o =
                lerp(frame, [start, start + 10], [0, 1]) *
                (isLast ? 1 : lerp(frame, [start + span - 8, start + span], [1, 0]));
              const y = lerp(frame, [start, start + 10], [14, 0]);
              return (
                <div
                  key={m}
                  style={{
                    position: "absolute",
                    inset: 0,
                    fontSize: 30,
                    fontWeight: 700,
                    color: C.ink2,
                    opacity: o,
                    translate: `0 ${y}px`,
                  }}
                >
                  “{m}”
                </div>
              );
            })}
          </div>
          {/* bubble tail */}
          <div
            style={{
              position: "absolute",
              right: 70,
              bottom: -20,
              width: 36,
              height: 36,
              background: C.white,
              borderRight: `2px solid ${C.sky200}`,
              borderBottom: `2px solid ${C.sky200}`,
              rotate: "45deg",
              borderBottomRightRadius: 8,
            }}
          />
        </div>
        <div
          style={{
            marginTop: 34,
            marginLeft: 12,
            display: "inline-block",
            padding: "14px 22px",
            borderRadius: 22,
            background: C.pink,
            opacity: lerp(frame, [56, 70], [0, 1]),
            translate: `0 ${lerp(frame, [56, 70], [10, 0])}px`,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: C.pinkInk }}>{note.zh}</div>
          <div style={{ fontSize: 22, color: C.ink2, marginTop: 2 }}>{note.ko}</div>
        </div>
      </div>
    </OverlayRoot>
  );
};

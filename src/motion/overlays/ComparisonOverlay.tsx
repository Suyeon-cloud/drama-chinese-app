import React from "react";
import { Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { Label, OverlayRoot, lerp, splitHighlight } from "../primitives";
import { C } from "../theme";

export type ComparisonItem = {
  zh: string;
  pinyin: string;
  ko: string;
  /** 실제 대사 예문 */
  example: string;
  /** 핵심 차이 한 줄 */
  keyPoint: string;
};

export type ComparisonOverlayProps = {
  label: string;
  items: [ComparisonItem, ComparisonItem];
};

/** 유사 표현: 두 카드를 나란히 놓고 예문과 핵심 차이를 비교한 뒤, 서로 가까워지며 사라진다. */
export const ComparisonOverlay: React.FC<ComparisonOverlayProps> = ({ label, items }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = durationInFrames;
  const close = lerp(frame, [out - 50, out - 25], [0, 1], Easing.inOut(Easing.cubic));
  const fade = lerp(frame, [out - 28, out - 1], [1, 0]);
  const tones = [
    { ink: C.sky600, bg: C.sky50, border: C.sky200 },
    { ink: C.lavenderInk, bg: C.lavender, border: "#E2DAF7" },
  ];

  return (
    <OverlayRoot>
      <div style={{ opacity: fade * lerp(frame, [0, 10], [0, 1]) }}>
        <Label tone="mint">{label}</Label>
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          {items.map((item, i) => {
            const enter = lerp(frame, [i * 8, i * 8 + 16], [0, 1], Easing.out(Easing.cubic));
            const toward = (i === 0 ? 1 : -1) * close * 24;
            const parts = splitHighlight(item.example, item.zh);
            return (
              <div
                key={item.zh}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.97)",
                  borderRadius: 28,
                  border: `2px solid ${tones[i].border}`,
                  boxShadow: "0 10px 28px rgba(47,143,214,0.14)",
                  padding: "22px 22px",
                  opacity: enter,
                  translate: `${(1 - enter) * -30 + toward}px 0`,
                }}
              >
                <div style={{ fontSize: 50, fontWeight: 800, color: tones[i].ink }}>{item.zh}</div>
                <div style={{ fontSize: 22, color: C.muted }}>{item.pinyin}</div>
                <div style={{ fontSize: 23, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>
                  {item.ko}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: tones[i].bg,
                    fontSize: 21,
                    lineHeight: 1.45,
                    color: C.ink2,
                    opacity: lerp(frame, [30, 45], [0, 1]),
                  }}
                >
                  {parts.before}
                  <b style={{ color: tones[i].ink }}>{parts.match}</b>
                  {parts.after}
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 14,
            padding: "14px 20px",
            borderRadius: 22,
            background: C.white,
            border: `2px solid ${C.sky200}`,
            opacity: lerp(frame, [80, 96], [0, 1]),
            translate: `0 ${lerp(frame, [80, 96], [10, 0])}px`,
          }}
        >
          {items.map((item, i) => (
            <div key={item.zh} style={{ fontSize: 23, lineHeight: 1.6 }}>
              <b style={{ color: tones[i].ink }}>{item.zh}</b>
              <span style={{ color: C.muted }}> → </span>
              <span style={{ color: C.ink2 }}>{item.keyPoint}</span>
            </div>
          ))}
        </div>
      </div>
    </OverlayRoot>
  );
};

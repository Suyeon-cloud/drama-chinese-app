import React from "react";
import { Easing, useCurrentFrame } from "remotion";
import { Label, OverlayRoot, lerp, useEnterExit } from "../primitives";
import { C, OVERLAY_WIDTH } from "../theme";

export type SplitItem = {
  zh: string;
  pinyin: string;
  ko: string;
  /** 쓰임 (짧게) */
  usage: string;
};

export type SplitOverlayProps = {
  label: string;
  dialogue: string;
  left: SplitItem;
  right: SplitItem;
  note: string;
};

const SPLIT_START = 45;
const SPLIT_END = 72;
const GAP = 14;

/** 하나의 카드가 가운데에서 두 개로 펼쳐지며 두 표현을 나란히 비교한다. */
export const SplitOverlay: React.FC<SplitOverlayProps> = ({
  label,
  dialogue,
  left,
  right,
  note,
}) => {
  const frame = useCurrentFrame();
  const { opacity, translateY } = useEnterExit();
  const ease = Easing.inOut(Easing.cubic);
  const half = (OVERLAY_WIDTH - GAP) / 2;
  // 0 = 하나로 합쳐진 상태, 1 = 두 장으로 펼쳐진 상태
  const t = lerp(frame, [SPLIT_START, SPLIT_END], [0, 1], ease);
  const mergedO = lerp(frame, [SPLIT_START - 5, SPLIT_START + 8], [1, 0]);
  const itemO = lerp(frame, [SPLIT_END - 6, SPLIT_END + 10], [0, 1]);

  const card = (side: "left" | "right"): React.CSSProperties => {
    const startX = 0;
    const endX = side === "left" ? 0 : half + GAP;
    const width = OVERLAY_WIDTH + (half - OVERLAY_WIDTH) * t;
    return {
      position: "absolute",
      top: 0,
      left: startX + (endX - startX) * t,
      width,
      height: 290,
      background: "rgba(255,255,255,0.97)",
      borderRadius: 28,
      border: `2px solid ${side === "left" ? C.sky200 : "#E2DAF7"}`,
      boxShadow: "0 10px 28px rgba(47,143,214,0.14)",
      padding: "22px 24px",
      boxSizing: "border-box",
      overflow: "hidden",
    };
  };

  const renderItem = (item: SplitItem, tone: string) => (
    <div style={{ opacity: itemO, translate: `0 ${(1 - itemO) * 10}px` }}>
      <div style={{ fontSize: 46, fontWeight: 800, color: tone }}>{item.zh}</div>
      <div style={{ fontSize: 22, color: C.muted }}>{item.pinyin}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 10, lineHeight: 1.4 }}>{item.ko}</div>
      <div
        style={{
          fontSize: 21,
          color: C.ink2,
          marginTop: 10,
          lineHeight: 1.4,
          padding: "8px 12px",
          borderRadius: 14,
          background: C.sky50,
        }}
      >
        {item.usage}
      </div>
    </div>
  );

  return (
    <OverlayRoot>
      <div style={{ opacity, translate: `0 ${translateY}px` }}>
        <Label tone="mint">{label}</Label>
        <div style={{ position: "relative", height: 290, marginTop: 14 }}>
          <div style={card("right")}>
            {renderItem(right, C.lavenderInk)}
          </div>
          <div style={card("left")}>
            {mergedO > 0 ? (
              <div style={{ position: "absolute", inset: "22px 24px", opacity: mergedO }}>
                <div style={{ fontSize: 22, color: C.muted, fontWeight: 600 }}>대사</div>
                <div style={{ fontSize: 32, fontWeight: 700, marginTop: 10, lineHeight: 1.5 }}>
                  {dialogue}
                </div>
              </div>
            ) : null}
            {renderItem(left, C.sky600)}
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            padding: "12px 20px",
            borderRadius: 20,
            background: C.mint,
            color: C.ink2,
            fontSize: 22,
            lineHeight: 1.45,
            opacity: lerp(frame, [95, 110], [0, 1]),
          }}
        >
          {note}
        </div>
      </div>
    </OverlayRoot>
  );
};

import React from "react";
import { Easing, useCurrentFrame } from "remotion";
import {
  Label,
  Meaning,
  OverlayCard,
  OverlayRoot,
  Pinyin,
  lerp,
  splitHighlight,
  useEnterExit,
} from "../primitives";
import { C } from "../theme";

export type GrammarOverlayProps = {
  grammar: {
    label: string;
    sentence: string;
    highlight: string;
    pattern: string;
    meaning: string;
  };
  expression: {
    label: string;
    sentence: string;
    zh: string;
    pinyin: string;
    ko: string;
  };
  badge?: {
    zh: string;
    pinyin: string;
    ko: string[];
  };
};

// Phase timing (frames @30fps)
const SWITCH_START = 180;
const SWITCH_END = 205;
const BADGE_IN = 265;

/**
 * 문법 → 핵심 표현 → badge 순으로 한 장의 카드 안에서 정보가 전환된다.
 * 문장 구조(为了 + 목적)를 underline으로 강조한 뒤, 핵심 표현 카드로 넘어간다.
 */
export const GrammarOverlay: React.FC<GrammarOverlayProps> = ({
  grammar,
  expression,
  badge,
}) => {
  const frame = useCurrentFrame();
  const { opacity, translateY } = useEnterExit();
  const parts = splitHighlight(grammar.sentence, grammar.highlight);
  const exprParts = splitHighlight(expression.sentence, expression.zh);

  const underline = lerp(frame, [18, 42], [0, 100], Easing.out(Easing.cubic));
  const phaseA = lerp(frame, [SWITCH_START, SWITCH_END - 8], [1, 0]);
  const phaseB = lerp(frame, [SWITCH_START + 8, SWITCH_END], [0, 1]);
  const shiftA = lerp(frame, [SWITCH_START, SWITCH_END], [0, -40], Easing.in(Easing.cubic));
  const shiftB = lerp(frame, [SWITCH_START, SWITCH_END], [40, 0], Easing.out(Easing.cubic));
  const badgeScale = lerp(
    frame,
    [BADGE_IN, BADGE_IN + 10, BADGE_IN + 18],
    [0.85, 1.05, 1],
  );
  const badgeOpacity = lerp(frame, [BADGE_IN, BADGE_IN + 8], [0, 1]);

  return (
    <OverlayRoot>
      <div style={{ opacity, translate: `0 ${translateY}px` }}>
        <OverlayCard style={{ position: "relative", minHeight: 300 }}>
          {/* Phase A — 문법 */}
          <div
            style={{
              opacity: phaseA,
              translate: `${shiftA}px 0`,
              position: phaseB > 0 ? "absolute" : "relative",
              inset: phaseB > 0 ? "26px 30px auto 30px" : undefined,
            }}
          >
            <Label tone="sky">{grammar.label}</Label>
            <div
              style={{
                fontSize: 30,
                marginTop: 22,
                lineHeight: 1.6,
                color: C.ink2,
              }}
            >
              {parts.before}
              <span
                style={{
                  position: "relative",
                  color: C.sky600,
                  fontWeight: 800,
                }}
              >
                {parts.match}
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: -4,
                    height: 7,
                    borderRadius: 4,
                    width: `${underline}%`,
                    background: C.sky400,
                  }}
                />
              </span>
              {parts.after}
            </div>
            <div
              style={{
                marginTop: 22,
                padding: "18px 22px",
                borderRadius: 20,
                background: C.sky50,
                opacity: lerp(frame, [40, 55], [0, 1]),
                translate: `0 ${lerp(frame, [40, 55], [12, 0])}px`,
              }}
            >
              <div style={{ fontSize: 40, fontWeight: 800 }}>
                {grammar.pattern}
              </div>
              <Meaning style={{ marginTop: 4 }}>= {grammar.meaning}</Meaning>
            </div>
          </div>

          {/* Phase B — 핵심 표현 */}
          {phaseB > 0 ? (
            <div style={{ opacity: phaseB, translate: `${shiftB}px 0` }}>
              <Label tone="lavender">{expression.label}</Label>
              <div style={{ fontSize: 24, color: C.muted, marginTop: 18 }}>
                {exprParts.before}
                <b style={{ color: C.lavenderInk }}>{exprParts.match}</b>
                {exprParts.after}
              </div>
              <div
                style={{
                  fontSize: 58,
                  fontWeight: 800,
                  marginTop: 10,
                  letterSpacing: 2,
                }}
              >
                {expression.zh}
              </div>
              <Pinyin>{expression.pinyin}</Pinyin>
              <Meaning style={{ marginTop: 8 }}>= {expression.ko}</Meaning>
            </div>
          ) : null}
        </OverlayCard>

        {badge && frame >= BADGE_IN ? (
          <div
            style={{
              marginTop: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 22px",
              borderRadius: 24,
              background: C.cream,
              border: `2px solid #F6E2B5`,
              boxShadow: "0 8px 20px rgba(217,150,42,0.14)",
              scale: String(badgeScale),
              opacity: badgeOpacity,
              transformOrigin: "left center",
            }}
          >
            <span style={{ fontSize: 34, fontWeight: 800 }}>⚡ {badge.zh}</span>
            <span>
              <span
                style={{ display: "block", fontSize: 20, color: C.creamInk }}
              >
                {badge.pinyin}
              </span>
              <span style={{ display: "block", fontSize: 22, color: C.ink2 }}>
                {badge.ko.join(" · ")}
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </OverlayRoot>
  );
};

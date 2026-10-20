import React from "react";
import { Easing, useCurrentFrame } from "remotion";
import {
  Label,
  Meaning,
  OverlayCard,
  OverlayRoot,
  lerp,
  useEnterExit,
} from "../primitives";
import { C } from "../theme";

export type FocusOverlayProps = {
  label: string;
  /** 후보 표현들. focusIndex의 표현만 남고 나머지는 뒤로 밀린다. */
  options: string[];
  focusIndex: number;
  pattern: string;
  meaning: string;
};

const FADE_START = 45;
const FADE_END = 80;

/** 여러 선택지 중 하나만 남기는 모션으로 "~할 수밖에 없다"의 의미를 시각화한다. */
export const FocusOverlay: React.FC<FocusOverlayProps> = ({
  label,
  options,
  focusIndex,
  pattern,
  meaning,
}) => {
  const frame = useCurrentFrame();
  const { opacity, translateY } = useEnterExit();
  const ease = Easing.inOut(Easing.cubic);

  return (
    <OverlayRoot>
      <div style={{ opacity, translate: `0 ${translateY}px` }}>
        <OverlayCard>
          <Label tone="sky">{label}</Label>
          <div
            style={{
              marginTop: 22,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {options.map((opt, i) => {
              const isFocus = i === focusIndex;
              const appear = lerp(frame, [6 + i * 6, 16 + i * 6], [0, 1]);
              const dim = isFocus ? 1 : lerp(frame, [FADE_START, FADE_END], [1, 0.28], ease);
              const scale = isFocus
                ? lerp(frame, [FADE_START, FADE_END], [1, 1.1], ease)
                : lerp(frame, [FADE_START, FADE_END], [1, 0.9], ease);
              const push = isFocus ? 0 : lerp(frame, [FADE_START, FADE_END], [0, 18], ease);
              return (
                <div
                  key={opt}
                  style={{
                    alignSelf: "flex-start",
                    padding: "8px 22px",
                    borderRadius: 18,
                    fontSize: 36,
                    fontWeight: isFocus ? 800 : 600,
                    background: isFocus
                      ? frame > FADE_START
                        ? C.sky100
                        : C.sky50
                      : C.sky50,
                    border: `2px solid ${isFocus && frame > FADE_START ? C.sky300 : "transparent"}`,
                    color: isFocus ? C.ink : C.ink2,
                    opacity: appear * dim,
                    scale: String(scale),
                    translate: `${push}px 0`,
                    transformOrigin: "left center",
                    filter: isFocus ? undefined : `blur(${(1 - dim) * 1.4}px)`,
                  }}
                >
                  {opt}
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: `2px dashed ${C.sky200}`,
              opacity: lerp(frame, [FADE_END, FADE_END + 15], [0, 1]),
              translate: `0 ${lerp(frame, [FADE_END, FADE_END + 15], [10, 0])}px`,
            }}
          >
            <div style={{ fontSize: 36, fontWeight: 800 }}>{pattern}</div>
            <Meaning>{meaning}</Meaning>
          </div>
        </OverlayCard>
      </div>
    </OverlayRoot>
  );
};

import React from "react";
import { Label, Meaning, OverlayCard, OverlayRoot, Pinyin, useEnterExit } from "../primitives";
import type { Tone } from "../theme";

export type NoteOverlayProps = {
  label: string;
  tone: Tone;
  /** 원문 표현 */
  text: string;
  /** 교수자가 입력한 번역/설명 (없으면 생략) */
  note: string;
  /** 중국어 표현의 병음 (없으면 생략) */
  pinyin?: string;
  /** true면 병음을 설명 아래에 (한국어 → 중국어: 중국어 표현이 설명 안에 있을 때) */
  pinyinAfterNote?: boolean;
};

/** 교수자가 작성한 핵심 표현·어휘·문법 카드: 원문 표현 + 병음 + 교수자 설명 */
export const NoteOverlay: React.FC<NoteOverlayProps> = ({ label, tone, text, note, pinyin, pinyinAfterNote }) => {
  const { opacity, translateY } = useEnterExit();
  return (
    <OverlayRoot>
      <div style={{ opacity, translate: `0 ${translateY}px` }}>
        <OverlayCard>
          <Label tone={tone}>{label}</Label>
          <div
            style={{
              fontSize: text.length > 14 ? 40 : 54,
              fontWeight: 800,
              lineHeight: 1.3,
              marginTop: 14,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {text}
          </div>
          {pinyin && !pinyinAfterNote ? <Pinyin style={{ marginTop: 6 }}>{pinyin}</Pinyin> : null}
          {note ? (
            <Meaning
              style={{
                marginTop: 12,
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {note}
            </Meaning>
          ) : null}
          {pinyin && pinyinAfterNote ? <Pinyin style={{ marginTop: 6 }}>{pinyin}</Pinyin> : null}
        </OverlayCard>
      </div>
    </OverlayRoot>
  );
};

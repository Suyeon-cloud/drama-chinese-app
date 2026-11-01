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

const textFontSize = (text: string) => (text.length > 14 ? 40 : 54);

/** 카드 안쪽 너비에 들어가는 줄 수 (넉넉하게): 한글·한자는 글자 크기만큼, 그 밖의 글자는 0.62배로 센다. */
const estimateLines = (text: string, fontSize: number, width: number) => {
  const units = [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e7f ? 1 : 0.62), 0);
  return Math.ceil((units * fontSize) / width) + (units * fontSize > width ? 1 : 0);
};

/** 내용이 잘리지 않는 컴포지션 높이. 짧은 카드는 기본 높이(420)를 그대로 쓴다. */
export const noteOverlayHeight = ({ text, note, pinyin }: NoteOverlayProps) => {
  const inner = 536; // 컴포지션 600 - 좌우 여백 60 - 테두리 4
  const size = textFontSize(text);
  const height =
    60 + // 카드 위아래 여백 + 테두리
    48 + // 라벨
    14 + estimateLines(text, size, inner) * size * 1.3 +
    (pinyin ? 6 + estimateLines(pinyin, 24, inner) * 36 : 0) +
    (note ? 12 + estimateLines(note, 26, inner) * 26 * 1.45 : 0) +
    24; // 그림자
  return Math.max(420, Math.ceil(height));
};

/** 교수자가 작성한 핵심 표현·어휘·문법 카드: 원문 표현 + 병음 + 교수자 설명 (내용은 줄이지 않고 끝까지 보여준다) */
export const NoteOverlay: React.FC<NoteOverlayProps> = ({ label, tone, text, note, pinyin, pinyinAfterNote }) => {
  const { opacity, translateY } = useEnterExit();
  return (
    <OverlayRoot>
      <div style={{ opacity, translate: `0 ${translateY}px` }}>
        <OverlayCard>
          <Label tone={tone}>{label}</Label>
          <div
            style={{
              fontSize: textFontSize(text),
              fontWeight: 800,
              lineHeight: 1.3,
              marginTop: 14,
            }}
          >
            {text}
          </div>
          {pinyin && !pinyinAfterNote ? <Pinyin style={{ marginTop: 6 }}>{pinyin}</Pinyin> : null}
          {note ? <Meaning style={{ marginTop: 12 }}>{note}</Meaning> : null}
          {pinyin && pinyinAfterNote ? <Pinyin style={{ marginTop: 6 }}>{pinyin}</Pinyin> : null}
        </OverlayCard>
      </div>
    </OverlayRoot>
  );
};

import React, { useState } from "react";
import type { CultureLens, CultureLensCue } from "../../content/types";
import { Icon } from "../components/Icon";

/** 관계 시각화: 어른 두 명 → 아이 세 명 */
export const RelationDiagram: React.FC<{ adults: string[]; kids: string[] }> = ({
  adults,
  kids,
}) => (
  <div className="relation">
    <div className="relation-row">
      {adults.map((a) => (
        <span key={a} className="rel-node adult">
          {a}
        </span>
      ))}
    </div>
    <svg className="relation-lines" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden>
      <path d="M50 2 L95 36" />
      <path d="M150 2 L105 36" />
    </svg>
    <div className="relation-row kids">
      {kids.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 ? <span className="rel-dot">·</span> : null}
          <span className="rel-node kid">{k}</span>
        </React.Fragment>
      ))}
    </div>
  </div>
);

/**
 * 문화 렌즈: 정해진 구간에 작은 버튼만 표시하고, 사용자가 원할 때만 카드가 확장된다.
 * 렌즈를 열어도 영상은 멈추지 않는다.
 */
export const CultureLensLayer: React.FC<{
  cue: CultureLensCue | undefined;
  lens: CultureLens | undefined;
  onMore: () => void;
}> = ({ cue, lens, onMore }) => {
  const [open, setOpen] = useState(false);
  if (!lens) return null;

  if (open) {
    return (
      <div className="lens-panel" role="dialog" aria-label="문화 렌즈">
        <button className="lens-close" onClick={() => setOpen(false)} aria-label="닫기">
          <Icon name="close" size={18} />
        </button>
        <span className="lens-kicker">🔍 文化镜头 · 문화 렌즈</span>
        <h3>{lens.title}</h3>
        {lens.subtitle ? <p className="lens-sub">{lens.subtitle}</p> : null}
        {lens.adults.length || lens.children.length ? (
          <RelationDiagram adults={lens.adults} kids={lens.children} />
        ) : null}
        {lens.paragraphs.map((p) => (
          <p key={p} className="lens-text">
            {p}
          </p>
        ))}
        {lens.caution ? <p className="lens-caution">{lens.caution}</p> : null}
        <button className="btn btn-primary btn-sm" onClick={onMore}>
          🇨🇳🇰🇷 한중문화 더 알아보기 →
        </button>
      </div>
    );
  }

  if (!cue) return null;
  return (
    <button className={`lens-button ${cue.position}`} onClick={() => setOpen(true)}>
      <span className="lens-icon">🔍</span>
      <span>
        <b>文化镜头 · 문화 렌즈</b>
        <small>{cue.hint}</small>
      </span>
    </button>
  );
};

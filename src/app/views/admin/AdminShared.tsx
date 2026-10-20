import React from "react";
import { STATUS_LABEL, STATUS_TONE } from "../../../content/course";
import { getLevel } from "../../../content/levels";
import type { LessonStatus } from "../../../content/types";
import { LOCAL_SCOPE_NOTE } from "../../store";

export const PageIntro: React.FC<{ title: string; desc: string; children?: React.ReactNode }> = ({
  title,
  desc,
  children,
}) => (
  <div className="page-intro admin-intro">
    <div>
      <h2>{title}</h2>
      <p className="muted">{desc}</p>
    </div>
    {children ? <div className="row-start">{children}</div> : null}
  </div>
);

export const StatusBadge: React.FC<{ status: LessonStatus }> = ({ status }) => (
  <span className={`pill pill-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
);

export const LevelBadge: React.FC<{ level: string }> = ({ level }) => {
  const def = getLevel(level);
  return <span className={`pill pill-${def.tone}`}>{def.label}</span>;
};

/** 로컬 저장소 범위 안내 — 공유 DB처럼 보이지 않도록 학습자 관련 화면에 표시한다. */
export const LocalScopeNote: React.FC = () => <p className="scope-note">ℹ️ {LOCAL_SCOPE_NOTE}</p>;

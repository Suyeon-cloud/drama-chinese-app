// 메인 화면 인포그래픽: 영상 학습 → 표현 이해 → 퀴즈·복습 (아이콘 · 단계 번호 · 연결선 · 짧은 카드). 이미지·애니메이션 없음.
import React from "react";
import { Icon, type IconName } from "./Icon";

const FLOW: { icon: IconName; zh: string; title: string; text: string }[] = [
  { icon: "play", zh: "看", title: "영상 학습", text: "드라마 장면을 보며 중국어 자막·병음·번역을 함께 확인해요." },
  { icon: "book", zh: "学", title: "표현 이해", text: "핵심 표현·어휘·문법과 문화 배경을 하나씩 짚어요." },
  { icon: "check", zh: "练", title: "퀴즈·복습", text: "퀴즈로 확인하고 복습 자료로 다시 정리해요." },
];

/** compact: 학생 홈처럼 강의 목록 위에 짧게 (설명 문장 없이 한 줄) */
export const LearningFlow: React.FC<{ compact?: boolean; labelledBy?: string }> = ({ compact, labelledBy }) => (
  <ol className={`flow ${compact ? "compact" : ""}`} aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : "학습 과정"}>
    {FLOW.map((s, i) => (
      <li key={s.title} className={`flow-step flow-tone-${i + 1}`}>
        <span className="flow-num" aria-hidden>
          {i + 1}
        </span>
        <span className="flow-icon" aria-hidden>
          <Icon name={s.icon} size={compact ? 20 : 26} />
        </span>
        <div className="flow-text">
          <b>
            {s.title}{" "}
            <span className="flow-zh" lang="zh-CN" aria-hidden>
              {s.zh}
            </span>
          </b>
          {compact ? null : <p>{s.text}</p>}
        </div>
      </li>
    ))}
  </ol>
);

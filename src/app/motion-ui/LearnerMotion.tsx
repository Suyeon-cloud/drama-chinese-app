// 학습자 화면 모션그래픽: ProgressRing(진행률 원) · CompletionBurst(학습 완료 효과)
// - 진행률은 호출하는 쪽이 실제 학습 기록으로 계산한 값을 그대로 그린다 (여기서 계산·추정하지 않는다).
// - 움직임 줄이기면 애니메이션 없이 최종 상태만.
import React, { useLayoutEffect, useRef } from "react";
import { useMotionEnabled } from "./MotionStage";

/** 진행률 원: done / total. 처음 나타날 때 0에서 채워진다 (Web Animations) */
export const ProgressRing: React.FC<{ done: number; total: number; size?: number; label: string }> = ({ done, total, size = 56, label }) => {
  const motion = useMotionEnabled();
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const pct = Math.round(ratio * 100);
  const stroke = Math.max(5, Math.round(size / 9));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ref = useRef<SVGCircleElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!motion || !el || typeof el.animate !== "function") return;
    el.animate([{ strokeDashoffset: String(c) }, { strokeDashoffset: String(c * (1 - ratio)) }], {
      duration: 900,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "backwards",
    });
  }, [motion, ratio, c]);
  return (
    <span className={`progress-ring ${ratio >= 1 ? "is-done" : ""}`} role="img" aria-label={`${label} ${pct}%`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="pr-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          ref={ref}
          className="pr-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b className="pr-text" aria-hidden>
        {ratio >= 1 ? "✓" : `${pct}%`}
      </b>
    </span>
  );
};

/** 학습 완료: 체크 표시가 그려지고 색 조각이 퍼진다 (움직임 줄이기면 체크만) */
export const CompletionBurst: React.FC = () => {
  const motion = useMotionEnabled();
  return (
    <span className={`completion-burst ${motion ? "is-animated" : ""}`} aria-hidden>
      <svg viewBox="0 0 52 52" width="52" height="52">
        <circle cx="26" cy="26" r="24" className="cb-circle" />
        <path d="M15 27 l7 7 l15 -16" className="cb-check" />
      </svg>
      {motion ? (
        <span className="cb-pieces">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ "--i": i } as React.CSSProperties} />
          ))}
        </span>
      ) : null}
    </span>
  );
};

// 공통 모션그래픽 (퀴즈): Countdown · AnswerReveal · ResponseBars
// - 라이브러리 없이 CSS 애니메이션만 쓴다. 움직임 줄이기(prefers-reduced-motion)면 애니메이션 없이 결과만 보여 준다.
// - 보여 주는 내용은 받은 데이터 그대로다. 정답은 서버가 '정답 공개' 상태에서만 보내므로 이 컴포넌트가 정답을 먼저 드러낼 수 없다.
import React, { useEffect, useRef, useState } from "react";
import { MixedText } from "../components/Zh";

/** 사용자가 움직임 줄이기를 켰는가 (설정이 바뀌면 다시 그린다) */
export const useReducedMotion = () => {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
};

/**
 * 새 문제가 열린 '순간'에만 true (처음 불러오거나 새로고침으로 이미 열린 문제를 볼 때는 false).
 * 교수자·학생 화면이 같은 진행 상태(문제 번호·단계)를 보고 판단한다.
 */
export const useQuestionIntro = (index: number | null, phase: string, ms: number) => {
  const seen = useRef<{ index: number | null; phase: string } | null>(null);
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { index, phase };
    if (prev && phase === "open" && index !== null && (prev.index !== index || prev.phase !== "open")) {
      setIntro(true);
      const t = window.setTimeout(() => setIntro(false), ms);
      return () => window.clearTimeout(t);
    }
    if (phase !== "open") setIntro(false);
    return undefined;
  }, [index, phase, ms]);
  return intro;
};

/** 3 · 2 · 1 카운트다운 (새 문제가 열릴 때). 움직임 줄이기면 그리지 않는다. */
export const Countdown: React.FC<{ from?: number; label?: string }> = ({ from = 3, label = "곧 문제가 나와요" }) => {
  const reduced = useReducedMotion();
  const [n, setN] = useState(from);
  useEffect(() => {
    if (reduced) return;
    setN(from);
    const t = window.setInterval(() => setN((v) => (v > 1 ? v - 1 : v)), 1000);
    return () => window.clearInterval(t);
  }, [from, reduced]);
  if (reduced) return null;
  return (
    <div className="qm-countdown" role="status" aria-live="polite">
      <span className="qm-countdown-num" key={n} aria-hidden>
        {n}
      </span>
      <span className="qm-countdown-label">{label}</span>
    </div>
  );
};

/** 보기별 응답 막대: 처음 나타날 때·값이 바뀔 때 부드럽게 자란다. answer가 있으면(공개·교수자 마감 뒤) 정답 막대 강조 */
export const ResponseBars: React.FC<{ options: string[]; counts: number[]; answer: number | null; total?: number }> = ({
  options,
  counts,
  answer,
  total,
}) => {
  const sum = total ?? counts.reduce((a, b) => a + b, 0);
  const pct = (n: number) => (sum ? Math.round((n / sum) * 100) : 0);
  return (
    <ol className="live-bars qm-bars">
      {options.map((o, i) => (
        <li key={i} className={answer === i ? "is-answer" : ""}>
          <span className="live-bar-label">
            {i + 1}. <MixedText text={o} />
            {answer === i ? " ✓" : ""}
          </span>
          <span className="live-bar-track">
            <span style={{ width: `${pct(counts[i] ?? 0)}%` }} />
          </span>
          <span className="live-bar-num">
            {counts[i] ?? 0}명 · {pct(counts[i] ?? 0)}%
          </span>
        </li>
      ))}
    </ol>
  );
};

/** 정답 공개: 내 결과 배지(정답·오답·미응답)가 튀어나오고, 정답이면 작은 축하 효과 */
export const AnswerReveal: React.FC<{ result: "correct" | "wrong" | "none"; children?: React.ReactNode }> = ({ result, children }) => {
  const text = result === "correct" ? "정답이에요! 🎉" : result === "wrong" ? "아쉬워요. 정답을 확인해 보세요." : "이번 문제는 답하지 않았어요.";
  return (
    <div className={`live-reveal qm-reveal is-${result}`} role="status">
      <p className="qm-reveal-badge">
        <b>{text}</b>
        {result === "correct" ? (
          <span className="qm-burst" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </span>
        ) : null}
      </p>
      {children}
    </div>
  );
};

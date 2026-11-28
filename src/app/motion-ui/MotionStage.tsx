// 공통 모션그래픽 바탕: MotionStage — 단계별로 차례대로 보여 주기 (재생 · 일시정지 · 다시보기 · 건너뛰기 · 키보드)
// - 신규 패키지 없이 Web Animations API(element.animate)와 CSS만 쓴다.
// - enabled=false(모션 끄기·움직임 줄이기)면 모든 단계를 처음부터 그대로 보여 준다 (일반 표시).
// - 아직 나오지 않은 단계도 자리를 차지하고 DOM에 있다 (레이아웃이 흔들리지 않고, 보조기기는 전체 내용을 읽는다).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "./QuizMotion";

/** 모션을 켤지: 화면의 모션 토글(있으면)과 사용자의 움직임 줄이기 설정을 함께 본다 */
export const useMotionEnabled = (toggle = true) => {
  const reduced = useReducedMotion();
  return toggle && !reduced;
};

/**
 * 학습자 화면의 직접 재생 모션(카드·획순)끼리 알린다: 하나가 재생을 시작하면 다른 카드는 한 번에 보여 주고 멈추며,
 * 학습 화면은 재생 중인 영상을 일시정지한다. 발표모드의 자동 재생 모션은 알리지 않는다.
 */
const learningMotionBus = new EventTarget();
const LEARNING_MOTION_START = "learning-motion-start";
export const announceLearningMotion = (owner: object) =>
  learningMotionBus.dispatchEvent(new CustomEvent(LEARNING_MOTION_START, { detail: owner }));
export const useLearningMotionStart = (onStart: (owner: object) => void) => {
  const cb = useRef(onStart);
  cb.current = onStart;
  useEffect(() => {
    const h = (e: Event) => cb.current((e as CustomEvent<object>).detail);
    learningMotionBus.addEventListener(LEARNING_MOTION_START, h);
    return () => learningMotionBus.removeEventListener(LEARNING_MOTION_START, h);
  }, []);
};

/** 요소가 나타날 때 한 번 재생하는 Web Animations (움직임 줄이기면 호출하지 않는다) */
export const enterAnimation = (el: Element, delay = 0, kind: "rise" | "pop" | "slide" = "rise") => {
  if (typeof (el as HTMLElement).animate !== "function") return;
  const frames: Keyframe[] =
    kind === "pop"
      ? [{ opacity: 0, transform: "scale(0.85)" }, { opacity: 1, transform: "scale(1.04)", offset: 0.6 }, { opacity: 1, transform: "none" }]
      : kind === "slide"
        ? [{ opacity: 0, transform: "translateX(-24px)" }, { opacity: 1, transform: "none" }]
        : [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }];
  (el as HTMLElement).animate(frames, { duration: 480, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" });
};

type Props = {
  /** 차례대로 보여 줄 단계 */
  steps: React.ReactNode[];
  /** false면 모든 단계를 바로 보여 준다 */
  enabled: boolean;
  /** 이 값이 바뀌면 처음부터 다시 재생 (예: 슬라이드 key) */
  resetKey?: string;
  /** 단계 사이 간격 (ms). 함수면 다음에 보일 단계 번호로 간격을 정한다 (앞 단계를 읽을 시간) */
  interval?: number | ((next: number) => number);
  /**
   * 학습자 직접 재생: 처음에는 모든 단계를 그대로 보여 주고(바로 읽을 수 있게), '재생'을 누를 때만 순차 등장한다.
   * 다른 직접 재생 모션이 시작되면 한 번에 보여 주고 멈춘다. 기본(false)은 발표모드용 자동 재생.
   */
  manual?: boolean;
  /** 단계가 새로 보일 때 (보인 단계 수, 이전 단계 수) */
  onStep?: (shown: number, from: number) => void;
  /** 단계 등장 방식 */
  kind?: "rise" | "pop" | "slide";
  /** 컨트롤 버튼·키 안내에 쓰는 이름 */
  label: string;
  className?: string;
  /** 단계 목록 요소 (기본 div, 목록이면 ol·ul) */
  as?: "div" | "ol" | "ul";
  stepClassName?: string;
};

export const MotionStage: React.FC<Props> = ({
  steps,
  enabled,
  resetKey,
  interval = 650,
  kind = "rise",
  label,
  className = "",
  as = "div",
  stepClassName = "",
  manual = false,
  onStep,
}) => {
  const total = steps.length;
  const auto = enabled && !manual;
  const [shown, setShown] = useState(auto ? 0 : total);
  const [playing, setPlaying] = useState(auto);
  // 직접 재생: 한 번이라도 재생을 눌렀는지 (단계 표시·다시 보기)
  const [started, setStarted] = useState(false);
  const owner = useRef({});
  const refs = useRef<(HTMLElement | null)[]>([]);
  const prevShown = useRef(shown);
  // 화면에 보일 때 재생을 시작한다 (긴 목록에서 보이지 않는 카드가 미리 재생되지 않게)
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!auto || !el) return;
    if (typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setInView(true), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [auto]);

  // 처음·다시보기·데이터 변경: 자동 재생은 처음 단계부터, 직접 재생은 모든 단계를 보인 채 멈춘 상태로
  const restart = useCallback(() => {
    prevShown.current = auto ? 0 : total;
    setShown(auto ? 0 : total);
    setPlaying(auto);
    setStarted(false);
  }, [auto, total]);
  useEffect(restart, [restart, resetKey]);

  // 직접 재생: 처음부터 / 이어서 (다른 카드·영상에 알린다)
  const playFromStart = () => {
    prevShown.current = 0;
    setShown(0);
    setPlaying(true);
    setStarted(true);
    announceLearningMotion(owner.current);
  };
  const resume = () => {
    setPlaying(true);
    announceLearningMotion(owner.current);
  };
  useLearningMotionStart((who) => {
    if (!manual || who === owner.current) return;
    setPlaying(false);
    setShown(total);
  });

  // 재생: 한 단계씩. 간격 함수는 부모가 다시 그릴 때마다 새로 만들어지므로(영상 시계 등) ref로 읽어 타이머를 다시 걸지 않는다.
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const fixedInterval = typeof interval === "function" ? -1 : interval;
  useEffect(() => {
    if (!enabled || !playing || (auto && !inView) || shown >= total) return;
    const gap = intervalRef.current;
    const wait = shown === 0 ? 120 : typeof gap === "function" ? gap(shown) : gap;
    const t = window.setTimeout(() => setShown((n) => Math.min(total, n + 1)), wait);
    return () => window.clearTimeout(t);
  }, [enabled, auto, playing, inView, shown, total, fixedInterval]);

  // 새로 나타난 단계만 Web Animations로 등장 (건너뛰기로 여러 단계가 한꺼번에 나오면 짧은 간격으로)
  useLayoutEffect(() => {
    if (!enabled) return;
    const from = prevShown.current;
    for (let i = from; i < shown; i++) {
      const el = refs.current[i];
      if (el) enterAnimation(el, (i - from) * 60, kind);
    }
    if (shown > from) onStep?.(shown, from);
    prevShown.current = shown;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStep은 알림용 (바뀌어도 다시 재생하지 않는다)
  }, [shown, enabled, kind]);

  const done = shown >= total;
  const toggle = manual
    ? () => (!started || done ? playFromStart() : playing ? setPlaying(false) : resume())
    : () => (done ? restart() : setPlaying((p) => !p));
  const skip = () => {
    setShown(total);
    setPlaying(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!enabled) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") toggle();
    else if (k === "r") (manual ? playFromStart : restart)();
    else if (k === "enter" || k === "s") skip();
    else return;
    // 발표 화면의 같은 키(재생·자막 따라가기 등)로 번지지 않게
    e.preventDefault();
    e.stopPropagation();
  };
  const keep = (e: React.MouseEvent) => e.preventDefault(); // 버튼을 눌러도 발표 화면 키 조작 포커스를 뺏지 않는다

  const List = as;
  return (
    <div
      ref={rootRef}
      className={`motion-stage ${enabled ? "is-animated" : "is-static"} ${className}`}
      onKeyDown={onKeyDown}
      tabIndex={enabled && total > 1 ? 0 : undefined}
      aria-label={
        enabled && total > 1
          ? manual
            ? `${label} — Space 재생·멈춤, R 처음부터, Enter 한 번에 보기`
            : `${label} — Space 일시정지·재생, R 다시보기, Enter 모두 보기`
          : undefined
      }
    >
      <List className="motion-steps">
        {steps.map((step, i) => {
          const Item = as === "div" ? "div" : "li";
          return (
            <Item
              key={i}
              ref={(el: HTMLElement | null) => {
                refs.current[i] = el;
              }}
              className={`motion-step ${stepClassName} ${i < shown ? "is-shown" : "is-pending"}`}
            >
              {step}
            </Item>
          );
        })}
      </List>
      {enabled && total > 1 && manual ? (
        <div className="motion-controls is-manual" role="group" aria-label={`${label} 재생 조작`}>
          <button type="button" className="motion-pill is-primary" onMouseDown={keep} onClick={toggle}>
            {!started ? "▶ 재생" : done ? "↺ 다시 보기" : playing ? "⏸ 멈춤" : "▶ 재생"}
          </button>
          {started && !done ? (
            <button type="button" className="motion-pill" onMouseDown={keep} onClick={skip}>
              ⏭ 한 번에 보기
            </button>
          ) : null}
          {started ? (
            <span className="motion-progress" aria-hidden>
              <span style={{ width: `${(shown / total) * 100}%` }} />
            </span>
          ) : null}
          <span className="motion-count" aria-live="polite">
            {started ? `${shown}/${total}단계` : `${total}단계`}
          </span>
        </div>
      ) : enabled && total > 1 ? (
        <div className="motion-controls" role="group" aria-label={`${label} 재생 조작`}>
          <span className="motion-progress" aria-hidden>
            <span style={{ width: `${(shown / total) * 100}%` }} />
          </span>
          <button type="button" className="motion-btn" onMouseDown={keep} onClick={toggle} aria-label={done ? "다시보기" : playing ? "일시정지" : "재생"}>
            {done ? "↺" : playing ? "⏸" : "▶"}
          </button>
          {!done ? (
            <button type="button" className="motion-btn" onMouseDown={keep} onClick={skip} aria-label="모두 보기">
              ⏭
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

/** 숫자가 0부터 올라간다 (requestAnimationFrame). enabled=false면 바로 최종 값 */
export const CountUp: React.FC<{ value: number; enabled: boolean; duration?: number }> = ({ value, enabled, duration = 900 }) => {
  const [n, setN] = useState(enabled ? 0 : value);
  useEffect(() => {
    if (!enabled) return setN(value);
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, enabled, duration]);
  return <>{n}</>;
};

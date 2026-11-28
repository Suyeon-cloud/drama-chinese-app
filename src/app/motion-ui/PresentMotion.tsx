// 발표모드 모션그래픽: PresentIntro · GoalsSlide · SectionTransition · SummaryCards
// - 모두 강의 데이터(LessonDeck)에서 만든다. 데이터가 없으면 일반 표시로 대체한다.
// - motion=false(발표 화면의 '모션' 끄기 또는 움직임 줄이기)면 애니메이션 없이 모든 내용을 바로 보여 준다.
import React, { useLayoutEffect, useRef } from "react";
import type { DeckGoal, LessonDeck, SectionStart } from "../../content/lessonDeck";
import { CountUp, MotionStage, enterAnimation } from "./MotionStage";

/** 글자 하나씩 떠오르는 제목 (보조기기는 aria-label로 전체 제목을 읽는다) */
const KineticTitle: React.FC<{ text: string; motion: boolean; className: string }> = ({ text, motion, className }) => {
  if (!motion) return <h1 className={className}>{text}</h1>;
  const chars = Array.from(text);
  return (
    <h1 className={`${className} kinetic`} aria-label={text}>
      {chars.map((c, i) => (
        <span key={i} aria-hidden style={{ animationDelay: `${Math.min(i, 24) * 45}ms` }}>
          {c === " " ? " " : c}
        </span>
      ))}
    </h1>
  );
};

/** 시작: 주차 → 작품·회차 제목(키네틱) → 주제 → 이번 시간 구성(숫자가 올라간다) */
export const PresentIntro: React.FC<{ deck: LessonDeck; motion: boolean }> = ({ deck, motion }) => {
  const stats = [
    { icon: "🎬", label: "장면 대사", n: deck.lines.length },
    { icon: "💬", label: "표현·문법", n: deck.points.filter((p) => p.kind !== "summary").length },
    { icon: "🏮", label: "문화", n: deck.culture.length },
    { icon: "🎯", label: "퀴즈", n: deck.quiz.length },
  ].filter((s) => s.n > 0);
  return (
    <div className="present-card is-title present-intro">
      <MotionStage
        enabled={motion}
        resetKey={deck.lessonId}
        label="시작 화면"
        kind="pop"
        interval={520}
        steps={[
          <span key="w" className="intro-week">
            {deck.week}주차
          </span>,
          <KineticTitle key="h" text={deck.heading} motion={motion} className="present-h1" />,
          <div key="sub" className="intro-sub">
            {deck.heading !== deck.title ? <p className="present-sub">{deck.title}</p> : null}
            {deck.description ? <p className="present-sub">{deck.description}</p> : null}
          </div>,
          stats.length ? (
            <ul key="st" className="intro-stats" aria-label="이번 시간 구성">
              {stats.map((s) => (
                <li key={s.label}>
                  <span aria-hidden>{s.icon}</span>
                  <b>
                    <CountUp value={s.n} enabled={motion} />
                  </b>
                  <small>{s.label}</small>
                </li>
              ))}
            </ul>
          ) : (
            <span key="st" />
          ),
        ]}
      />
    </div>
  );
};

/** 학습 목표: 목표가 하나씩 체크리스트로 등장 (구체적인 표현·문화 예시를 함께) */
export const GoalsSlide: React.FC<{ goals: DeckGoal[]; motion: boolean }> = ({ goals, motion }) => (
  <div className="present-card present-goals">
    <div className="present-section">학습 목표</div>
    <h2 className="present-h2">오늘은 이렇게 배워요</h2>
    <MotionStage
      enabled={motion}
      resetKey={goals.map((g) => g.text).join("|")}
      label="학습 목표"
      kind="slide"
      interval={700}
      as="ol"
      stepClassName="goal-item"
      steps={goals.map((g, i) => (
        <>
          <span className="goal-num" aria-hidden>
            {i + 1}
          </span>
          <span className="goal-icon" aria-hidden>
            {g.icon}
          </span>
          <span className="goal-text">
            <b>{g.text}</b>
            {g.detail ? (
              <small lang="zh-CN" className="goal-detail">
                {g.detail}
              </small>
            ) : null}
          </span>
        </>
      ))}
    />
  </div>
);

/** 섹션 전환: 섹션의 첫 슬라이드에서 '몇 번째 단계 · 이름'과 전체 흐름 점을 보여 준다 */
export const SectionTransition: React.FC<{ sections: SectionStart[]; current: number; motion: boolean }> = ({ sections, current, motion }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (motion && ref.current) enterAnimation(ref.current, 0, "slide");
  }, [motion, current]);
  if (current < 0 || sections.length < 2) return null;
  return (
    // eslint-disable-next-line @remotion/non-pure-animation -- web app UI (CSS 애니메이션), not rendered by Remotion
    <div ref={ref} className={`section-transition ${motion ? "is-animated" : ""}`} role="status">
      <span className="st-step">
        {current + 1} / {sections.length}
      </span>
      <b className="st-name">{sections[current].section}</b>
      <ol className="st-dots" aria-hidden>
        {sections.map((s, i) => (
          <li key={s.section} className={i < current ? "is-done" : i === current ? "is-now" : ""} title={s.section} />
        ))}
      </ol>
    </div>
  );
};

/** 핵심 정리: 오늘 배운 표현·문법·정리 문장을 카드로 차례대로 (없으면 일반 마무리 문구만) */
export const SummaryCards: React.FC<{ deck: LessonDeck; motion: boolean; showPinyin: boolean; showKo: boolean }> = ({ deck, motion, showPinyin, showKo }) => {
  const summary = deck.points.filter((p) => p.kind === "summary");
  const key = deck.points.filter((p) => p.kind !== "summary");
  const cards = [...key.slice(0, 6 - Math.min(summary.length, 2)), ...summary.slice(0, 2)].slice(0, 6);
  return (
    <div className="present-card is-title present-summary">
      <h1 className="present-h1">수고했어요!</h1>
      {cards.length ? (
        <>
          <p className="present-sub">오늘의 핵심 정리</p>
          <MotionStage
            enabled={motion}
            resetKey={deck.lessonId}
            label="핵심 정리"
            kind="pop"
            interval={420}
            className="summary-stage"
            stepClassName="summary-card"
            steps={cards.map((p) => (
              <>
                <span className={`summary-kind kind-${p.kind}`}>{p.kind === "expression" ? "표현" : p.kind === "grammar" ? "문법" : "정리"}</span>
                <b lang={deck.direction === "zh-ko" ? "zh-CN" : undefined}>{p.text}</b>
                {showPinyin && p.pinyin ? <small className="present-py">{p.pinyin}</small> : null}
                {showKo && p.note ? <small className="summary-note">{p.note}</small> : null}
              </>
            ))}
          />
        </>
      ) : null}
      <p className="present-sub small">학생용 복습 자료는 ‘복습 HTML’에서 만들어 주차 자료로 등록할 수 있어요.</p>
    </div>
  );
};

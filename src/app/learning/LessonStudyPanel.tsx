import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "../../content";
import { cultureTopics } from "../../content/culture";
import type {
  CultureLensCue,
  LearningDirection,
  LessonContent,
  SubtitleCue,
} from "../../content/types";
import { draftNotePinyin } from "../../content/lessons";
import { toPinyin, usePinyinReady } from "../lib/pinyin";
import { navigate } from "../router";
import { cuePinyin } from "./SubtitleLayer";
import type { LessonProgress } from "../store/models";
import { RelationDiagram } from "./CultureLensLayer";

export type StudyTab = "script" | "points" | "culture" | "quiz";

const TABS: { key: StudyTab; label: string }[] = [
  { key: "script", label: "스크립트" },
  { key: "points", label: "표현 학습" },
  { key: "culture", label: "문화렌즈" },
  { key: "quiz", label: "퀴즈" },
];

export const TYPE_LABEL: Record<string, string> = {
  grammar: "문법",
  expression: "핵심 표현",
  metaphor: "비유 표현",
  pragmatic: "화용 표현",
  similar: "유사 표현",
  culture: "문화 렌즈",
};

const ScriptRow = React.memo<{
  cue: SubtitleCue;
  active: boolean;
  direction: LearningDirection;
  showTarget: boolean;
  /** 중국어 줄 아래 병음 (빈 문자열이면 생략) */
  pinyin: string;
  onSeek: (t: number) => void;
}>(({ cue, active, direction, showTarget, pinyin, onSeek }) => {
  const source = direction === "zh-ko" ? cue.zh : cue.ko;
  const target = direction === "zh-ko" ? cue.ko : cue.zh;
  return (
    <li className={active ? "active" : ""}>
      <button onClick={() => onSeek(cue.start)}>
        <span className="point-time">{formatTime(cue.start)}</span>
        <span className="script-text">
          {source ? <b className={direction === "zh-ko" ? "zh" : ""}>{source}</b> : null}
          {pinyin && source && direction === "zh-ko" ? <small className="script-py">{pinyin}</small> : null}
          {target ? (
            <span className={`script-target ${showTarget ? "" : "veiled"} ${direction === "ko-zh" ? "zh" : ""}`}>
              {target}
            </span>
          ) : null}
          {/* 한국어 → 중국어: 중국어(목표 언어) 바로 아래 병음. 중국어를 가리면 병음도 가린다. */}
          {pinyin && target && direction === "ko-zh" ? (
            <small className={`script-py ${showTarget ? "" : "veiled"}`}>{pinyin}</small>
          ) : null}
        </span>
      </button>
    </li>
  );
});
ScriptRow.displayName = "ScriptRow";

/** 시간 동기화 전 원문 텍스트: 영상 시점과 연결하지 않고 목록으로만 보여준다. */
const UntimedScript: React.FC<{ lines: string[]; direction: LearningDirection; showPinyin: boolean }> = ({
  lines,
  direction,
  showPinyin,
}) => (
  <div className="untimed-script">
    <small className="muted">원문 스크립트 · 아직 영상 시간과 맞추지 않은 문장이에요.</small>
    <ol>
      {lines.map((l, i) => (
        <li key={i} className={direction === "zh-ko" ? "zh" : ""}>
          {l}
          {showPinyin && direction === "zh-ko" && toPinyin(l) ? (
            <small className="script-py">{toPinyin(l)}</small>
          ) : null}
        </li>
      ))}
    </ol>
  </div>
);

const ScriptTab: React.FC<{
  cues: SubtitleCue[];
  time: number;
  direction: LearningDirection;
  showPinyin: boolean;
  onSeek: (t: number) => void;
}> = ({ cues, time, direction, showPinyin, onSeek }) => {
  const [showTarget, setShowTarget] = useState(true);
  const listRef = useRef<HTMLOListElement>(null);
  const activeIndex = cues.findIndex((c) => time >= c.start && time < c.end);

  // 현재 대사가 목록 안에서 보이도록 목록만 스크롤한다. (페이지는 움직이지 않음)
  useEffect(() => {
    const list = listRef.current;
    const el = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop || el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: el.offsetTop - list.clientHeight / 3, behavior: "smooth" });
    }
  }, [activeIndex]);

  if (cues.length === 0) {
    return <p className="muted">아직 등록된 자막/스크립트가 없어요.</p>;
  }
  return (
    <>
      <div className="study-tab-head">
        <small className="muted">
          {direction === "zh-ko" ? "중국어 원문 · 한국어 번역" : "한국어 원문 · 중국어 표현"}
        </small>
        <button className="link-btn" onClick={() => setShowTarget((v) => !v)}>
          {direction === "zh-ko" ? "번역" : "중국어"} {showTarget ? "가리기" : "보기"}
        </button>
      </div>
      <ol className="script-list" ref={listRef}>
        {cues.map((c, i) => (
          <ScriptRow
            key={`${c.start}-${i}`}
            cue={c}
            active={i === activeIndex}
            direction={direction}
            showTarget={showTarget}
            pinyin={showPinyin ? cuePinyin(c) : ""}
            onSeek={onSeek}
          />
        ))}
      </ol>
    </>
  );
};

/**
 * 한 화면 학습 패널: 영상 옆에서 스크립트·표현 학습·문화렌즈·퀴즈를 탭으로 오간다.
 */
export const LessonStudyPanel: React.FC<{
  tab: StudyTab;
  onTab: (tab: StudyTab) => void;
  content: LessonContent;
  script: SubtitleCue[];
  /** 시간 동기화 전 원문 문장 (선택) */
  untimed?: string[];
  /** 중국어 아래 병음 표시 (학습 화면의 병음 ON/OFF) */
  showPinyin?: boolean;
  direction: LearningDirection;
  time: number;
  startTime: number;
  onSeek: (t: number) => void;
  progress: LessonProgress | null;
  onOpenReview: () => void;
}> = ({
  tab,
  onTab,
  content,
  script,
  untimed = [],
  showPinyin = true,
  direction,
  time,
  startTime,
  onSeek,
  progress,
  onOpenReview,
}) => {
  usePinyinReady(); // 병음 사전이 준비되면 다시 그린다.
  const lensCues = useMemo(
    () => content.cues.filter((c): c is CultureLensCue => c.kind === "culture-lens"),
    [content],
  );
  const jump = (t: number) => onSeek(Math.max(startTime, t - 2));
  // 교수자 초안 — 시간 정보가 없으므로 영상 시점과 연결하지 않는다.
  const draft = content.draft;
  const expressions = draft?.expressions.filter((x) => x.source.trim()) ?? [];
  const grammar = draft?.grammar.filter((x) => x.source.trim()) ?? [];
  const draftLenses = draft?.lenses.filter((x) => x.title.trim() || x.text.trim()) ?? [];
  const sourceClass = direction === "zh-ko" ? "zh" : "";
  // 등장 시점이 있는 초안 항목은 학습 cue(draft-{id})로 변환되어 있다.
  const draftTime = (id: string) => content.cues.find((c) => c.id === `draft-${id}`)?.time;

  return (
    <div className="card study-panel">
      <div className="study-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => onTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="study-body" role="tabpanel">
        {tab === "script" ? (
          script.length === 0 && untimed.length > 0 ? (
            <UntimedScript lines={untimed} direction={direction} showPinyin={showPinyin} />
          ) : (
            <>
              <ScriptTab cues={script} time={time} direction={direction} showPinyin={showPinyin} onSeek={onSeek} />
              {untimed.length > 0 ? (
                <UntimedScript lines={untimed} direction={direction} showPinyin={showPinyin} />
              ) : null}
            </>
          )
        ) : null}

        {tab === "points" ? (
          content.cues.length === 0 &&
          content.summary.length === 0 &&
          expressions.length === 0 &&
          grammar.length === 0 ? (
            <p className="muted">이 강의자료의 표현 학습 콘텐츠는 준비 중이에요.</p>
          ) : (
            <>
              {content.cues.length > 0 ? (
                <>
                  <h3 className="card-title">이 회차 학습 포인트</h3>
                  <ul className="point-list">
                    {content.cues.map((c) => (
                      <li key={c.id} className={time >= c.time + c.duration ? "done" : ""}>
                        <button onClick={() => jump(c.time)}>
                          <span className="point-time">{formatTime(c.time)}</span>
                          <span className="point-title">{c.title}</span>
                          <span className="point-type">{TYPE_LABEL[c.learningType]}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {[
                { title: "핵심 표현", items: expressions },
                { title: "어휘·문법", items: grammar },
              ].map((sec) =>
                sec.items.length > 0 ? (
                  <React.Fragment key={sec.title}>
                    <h3 className="card-title">{sec.title}</h3>
                    <ul className="expr-list">
                      {sec.items.map((x) => {
                        const t = draftTime(x.id);
                        // 중국어 표현 → 병음 → 설명 (한국어 → 중국어는 설명 속 중국어 표현 다음에 병음)
                        const py = showPinyin ? draftNotePinyin(x, direction, toPinyin) : "";
                        return (
                          <li key={x.id}>
                            <b className={sourceClass}>{x.source}</b>
                            {py && direction === "zh-ko" ? <small>{py}</small> : null}
                            {x.note.trim() ? <span>{x.note}</span> : null}
                            {py && direction === "ko-zh" ? <small>{py}</small> : null}
                            {t !== undefined ? (
                              <button className="link-btn" onClick={() => jump(t)}>
                                ▶ {formatTime(t)} 장면 보기
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </React.Fragment>
                ) : null,
              )}
              {content.summary.length > 0 ? (
                <>
                  <h3 className="card-title">핵심 표현 정리</h3>
                  <ul className="expr-list">
                    {content.summary.map((s) => (
                      <li key={s.zh}>
                        <span className="summary-type">{s.type}</span>
                        <b>{s.zh}</b>
                        <small>{s.pinyin}</small>
                        <span>{s.ko}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )
        ) : null}

        {tab === "culture" ? (
          lensCues.length === 0 && draftLenses.length === 0 ? (
            <p className="muted">이 강의자료의 문화렌즈는 준비 중이에요.</p>
          ) : (
            <>
            {draftLenses.map((l) => (
              <article key={l.id} className="study-lens">
                <span className="lens-kicker">🔍 文化镜头 · 문화 렌즈</span>
                {l.title.trim() ? <h3>{l.title}</h3> : null}
                {l.source.trim() ? <p className={`lens-quote ${sourceClass}`}>“{l.source}”</p> : null}
                {l.text
                  .split(/\n+/)
                  .filter((p) => p.trim())
                  .map((p, i) => (
                    <p key={i} className="lens-text">
                      {p}
                    </p>
                  ))}
                {draftTime(l.id) !== undefined ? (
                  <div className="row-start">
                    <button className="btn btn-soft btn-sm" onClick={() => jump(draftTime(l.id)!)}>
                      ▶ {formatTime(draftTime(l.id)!)} 장면 보기
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
            {lensCues.map((cue) => {
              const topic = cultureTopics.find((t) => t.id === cue.cultureId);
              if (!topic) return null;
              const { lens } = topic;
              return (
                <article key={cue.id} className="study-lens">
                  <span className="lens-kicker">🔍 文化镜头 · 문화 렌즈</span>
                  <h3>{lens.title}</h3>
                  <p className="lens-sub">{lens.subtitle}</p>
                  <RelationDiagram adults={lens.adults} kids={lens.children} />
                  {lens.paragraphs.map((p) => (
                    <p key={p} className="lens-text">
                      {p}
                    </p>
                  ))}
                  <div className="compare-cols">
                    <div className="compare-col cn">
                      <span className="flag">🇨🇳 중국 작품</span>
                      <b>《{topic.comparison.china.work}》</b>
                      <p>{topic.comparison.china.text}</p>
                    </div>
                    <div className="compare-col kr">
                      <span className="flag">🇰🇷 한국 작품</span>
                      <b>{topic.comparison.korea.work ?? "비교 콘텐츠 추후 추가"}</b>
                      <p>{topic.comparison.korea.text}</p>
                    </div>
                  </div>
                  <p className="think-q small-q">“{topic.thinkQuestion}”</p>
                  <p className="lens-caution">{lens.caution}</p>
                  <div className="row-start">
                    <button className="btn btn-soft btn-sm" onClick={() => jump(cue.time)}>
                      ▶ {formatTime(cue.time)} 장면 보기
                    </button>
                    <button className="link-btn" onClick={() => navigate("culture")}>
                      한중문화에서 전체 보기 →
                    </button>
                  </div>
                </article>
              );
            })}
            </>
          )
        ) : null}

        {tab === "quiz" ? (
          <div className="study-quiz">
            {content.quiz.length === 0 ? (
              <p className="muted">이 강의자료의 퀴즈는 준비 중이에요.</p>
            ) : (
              <>
                <p>
                  복습 퀴즈 <b>{content.quiz.length}문제</b>
                </p>
                {progress?.quiz ? (
                  <p className="muted small">
                    최근 결과: {progress.quiz.total}문제 중 {progress.quiz.correct}문제 정답 (응시{" "}
                    {progress.quizAttempts}회)
                  </p>
                ) : (
                  <p className="muted small">영상을 끝까지 보면 요약과 함께 퀴즈가 열려요.</p>
                )}
                <button className="btn btn-primary btn-sm" onClick={onOpenReview}>
                  📝 복습 퀴즈 풀기
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

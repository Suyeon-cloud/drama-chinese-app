import React, { useState } from "react";
import {
  draftNoteChinese,
  draftQuizToQuestions,
  matchSourceStart,
  type TimelineLine,
} from "../../../content/lessons";
import { toPinyin, usePinyinReady } from "../../lib/pinyin";
import type {
  DraftLens,
  DraftNote,
  DraftQuiz,
  LearningDirection,
  LessonContent,
  LessonDraft,
} from "../../../content/types";
import { formatClock } from "../../lib/subtitles";
import { createId, nowIso } from "../../store/localJson";
import { TimeInput } from "./ScriptSyncPanel";

type Timing = { timeline: TimelineLine[]; segmentStart: number; segmentEnd: number | null };

/**
 * 관련 원문을 바꿀 때: 원문 목록의 다른 문장을 새로 고르면 등장 시점을 원문 시각(자동)으로 되돌리고,
 * 문장을 다듬는 등 직접 고친 경우에는 교수자가 정한 등장 시점을 유지한다.
 */
const withSource = <T extends { source: string; at?: number | null }>(item: T, value: string, timeline: TimelineLine[]): T => {
  const picked = value.trim() !== item.source.trim() && timeline.some((l) => l.text === value.trim());
  return { ...item, source: value, at: picked ? null : item.at };
};

/** 등장 시점: 기본은 관련 원문의 동기화 시각, 직접 입력하면 그 값을 저장한다. 비우면 자동으로 돌아간다. */
const TimingField: React.FC<
  Timing & { item: { source: string; at?: number | null }; onAt: (at: number | null) => void }
> = ({ item, onAt, timeline, segmentStart, segmentEnd }) => {
  const auto = matchSourceStart(timeline, item.source);
  const manual = typeof item.at === "number";
  const t = manual ? (item.at as number) : auto;
  const outside = t !== null && (t < segmentStart || (segmentEnd !== null && t >= segmentEnd));
  return (
    <div className="timing-field">
      <span className="timing-label">등장 시점</span>
      <TimeInput value={t} onCommit={onAt} label="등장 시점" placeholder="시간 없음" showError />
      {manual ? (
        <>
          <small className="muted">직접 지정</small>
          {auto !== null && auto !== t ? (
            <button type="button" className="link-btn" onClick={() => onAt(null)}>
              원문 시각({formatClock(auto)})으로 되돌리기
            </button>
          ) : null}
        </>
      ) : t !== null ? (
        <small className="muted">관련 원문 시각에 자동 연결</small>
      ) : (
        <small className="muted">시간 없음 · 영상 위에는 나타나지 않고 학습 탭에서만 보여요</small>
      )}
      {outside ? <small className="field-error">⚠️ 학습 구간 밖이라 영상 위에 나타나지 않아요.</small> : null}
    </div>
  );
};

const OPTION_COUNT = 4;

/** 목록에서 고르게 count개를 고른다. (순서 유지) */
const spread = (lines: string[], count: number) => {
  if (lines.length <= count) return lines;
  const step = lines.length / count;
  return Array.from({ length: count }, (_, i) => lines[Math.floor(i * step)]);
};

const note = (source = ""): DraftNote => ({ id: createId("note"), source, note: "" });
const lens = (source = ""): DraftLens => ({ id: createId("lens"), title: "", source, text: "" });
const quiz = (question = ""): DraftQuiz => ({
  id: createId("quiz"),
  question,
  options: Array.from({ length: OPTION_COUNT }, () => ""),
  answer: null,
  explanation: "",
});

/**
 * 규칙·템플릿 기반 초안: 원문 문장을 고르게 골라 표현·어휘·문화렌즈·퀴즈 칸에 배치한다.
 * 번역·설명·정답 등 의미 정보는 만들지 않고 교수자가 채우도록 비워 둔다.
 */
const buildDraft = (lines: string[], direction: LearningDirection): LessonDraft => {
  const expr = spread(lines, 5);
  const rest = lines.filter((l) => !expr.includes(l));
  const grammar = spread(rest, 3);
  const now = nowIso();
  const question = (s: string) =>
    direction === "zh-ko" ? `「${s}」의 뜻으로 알맞은 것은?` : `「${s}」를 중국어로 바르게 표현한 것은?`;
  return {
    expressions: expr.map((s) => note(s)),
    grammar: grammar.length ? grammar.map((s) => note(s)) : [note()],
    lenses: [lens(lines[0] ?? "")],
    quiz: expr.slice(0, 3).map((s) => quiz(question(s))),
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * 병음: 비어 있으면 중국어 표현의 자동 변환값을 보여주고, 교수자가 고치면 그 값만 저장한다.
 * (중국어 → 한국어는 원문 표현, 한국어 → 중국어는 설명 속 중국어 표현 기준)
 */
const PinyinField: React.FC<{ item: DraftNote; direction: LearningDirection; onPinyin: (v: string | undefined) => void }> = ({
  item,
  direction,
  onPinyin,
}) => {
  const chinese = draftNoteChinese(item, direction);
  const auto = toPinyin(chinese);
  const manual = !!item.pinyin?.trim();
  if (!chinese && !manual) return null;
  return (
    <div className="timing-field">
      <span className="timing-label">병음</span>
      <input
        className="cue-input pinyin-input"
        value={manual ? item.pinyin : auto}
        placeholder={chinese ? "병음 준비 중…" : "병음"}
        onChange={(e) => onPinyin(e.target.value.trim() && e.target.value !== auto ? e.target.value : undefined)}
        aria-label="병음"
      />
      {manual ? (
        <>
          <small className="muted">직접 입력</small>
          {auto && auto !== item.pinyin ? (
            <button type="button" className="link-btn" onClick={() => onPinyin(undefined)}>
              자동 병음으로 되돌리기
            </button>
          ) : null}
        </>
      ) : (
        <small className="muted">자동 생성 · 다음자(多音字)는 확인 후 고쳐 주세요</small>
      )}
    </div>
  );
};

const NoteList: React.FC<
  Timing & {
    title: string;
    items: DraftNote[];
    noteLabel: string;
    addLabel: string;
    direction: LearningDirection;
    onChange: (items: DraftNote[]) => void;
  }
> = ({ title, items, noteLabel, addLabel, direction, onChange, ...timing }) => (
  <div className="draft-block">
    <h4>{title}</h4>
    {items.length === 0 ? <p className="muted small">항목이 없어요.</p> : null}
    {items.map((it, i) => (
      <div key={it.id} className="draft-row">
        <label className="field">
          <span>원문 표현</span>
          <input
            list="draft-source-lines"
            value={it.source}
            onChange={(e) =>
              onChange(items.map((x) => (x.id === it.id ? withSource(x, e.target.value, timing.timeline) : x)))
            }
          />
        </label>
        <label className="field">
          <span>{noteLabel}</span>
          <textarea
            rows={2}
            value={it.note}
            placeholder="교수자가 직접 입력"
            onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, note: e.target.value } : x)))}
          />
        </label>
        <button
          type="button"
          className="link-btn danger"
          onClick={() => onChange(items.filter((x) => x.id !== it.id))}
          aria-label={`${title} ${i + 1} 삭제`}
        >
          삭제
        </button>
        <PinyinField
          item={it}
          direction={direction}
          onPinyin={(pinyin) => onChange(items.map((x) => (x.id === it.id ? { ...x, pinyin } : x)))}
        />
        <TimingField
          {...timing}
          item={it}
          onAt={(at) => onChange(items.map((x) => (x.id === it.id ? { ...x, at } : x)))}
        />
      </div>
    ))}
    <button type="button" className="btn btn-soft btn-sm" onClick={() => onChange([...items, note()])}>
      + {addLabel}
    </button>
  </div>
);

/**
 * 4·5단계 학습 콘텐츠 초안 구성과 교수자 검토·편집.
 * 실제 AI 분석 없이 원문 문장을 바탕으로 편집 가능한 틀만 만든다.
 */
export const ContentDraftSection: React.FC<{
  draft: LessonDraft | null;
  onChange: (draft: LessonDraft | null) => void;
  /** 원문 문장과 동기화된 시작 시각 (타임코드 자막 또는 원문 텍스트) */
  timeline: TimelineLine[];
  segmentStart: number;
  segmentEnd: number | null;
  secured: boolean;
  synced: boolean;
  direction: LearningDirection;
  sourceName: string;
  /** 기존(번들) 학습 콘텐츠 */
  base: LessonContent | null;
}> = ({ draft, onChange, timeline, segmentStart, segmentEnd, secured, synced, direction, sourceName, base }) => {
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  usePinyinReady(); // 병음 사전이 준비되면 자동 병음을 다시 그린다.
  const sourceLines = timeline.map((l) => l.text);
  const timing: Timing = { timeline, segmentStart, segmentEnd };
  const update = (patch: Partial<LessonDraft>) => draft && onChange({ ...draft, ...patch, updatedAt: nowIso() });

  const baseHas = !!base && (base.cues.length > 0 || base.quiz.length > 0 || base.summary.length > 0);
  const readyQuiz = draft ? draftQuizToQuestions(draft.quiz).length : 0;

  const build = () => {
    onChange(buildDraft(sourceLines, direction));
    setConfirmRebuild(false);
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3 className="card-title">
          <span className="step">4</span> 학습 콘텐츠 초안 구성 · 교수자 검토·편집
        </h3>
        {draft ? <span className="pill pill-mint">초안 있음</span> : null}
      </div>

      {!secured ? (
        <div className="content-locked">
          <b>🔒 {sourceName} 원문 스크립트를 먼저 확보해 주세요.</b>
          <p className="small">
            2단계에서 {sourceName} 자막을 가져오거나 SRT·원문 텍스트를 등록하면 학습 콘텐츠 초안을 만들 수 있어요.
            작업 중인 강의자료는 ‘준비 중’으로 저장할 수 있어요.
          </p>
        </div>
      ) : (
        <>
          <p className="draft-proto">
            현재 2차 프로토타입에서는 입력한 원문을 바탕으로 규칙·템플릿 기반 학습 콘텐츠 초안을 구성합니다. 향후
            생성형 AI 연동을 통해 자동 분석·생성 기능으로 확장할 수 있습니다.
          </p>
          {!synced ? (
            <p className="sync-hint">
              시간 동기화 전이어도 초안을 만들고 편집할 수 있어요. 등장 시점이 없는 항목은 영상 위 모션그래픽이 아니라
              학습 패널의 표현·문화렌즈·퀴즈에만 표시돼요. 3단계에서 원문 시간을 맞추면 자동으로 연결돼요.
            </p>
          ) : null}
          {baseHas && base ? (
            <p className="muted small">
              기존 학습 콘텐츠도 함께 사용돼요 — 모션그래픽 {base.cues.filter((c) => c.kind === "motion").length}개 ·
              문화렌즈 {base.cues.filter((c) => c.kind === "culture-lens").length}개 · 표현 정리 {base.summary.length}개 ·
              퀴즈 {base.quiz.length}문제
            </p>
          ) : null}

          <div className="row-start">
            {draft && confirmRebuild ? (
              <>
                <span className="small">지금 초안을 지우고 원문으로 다시 구성할까요?</span>
                <button type="button" className="btn btn-danger btn-sm" onClick={build}>
                  다시 구성
                </button>
                <button type="button" className="btn btn-soft btn-sm" onClick={() => setConfirmRebuild(false)}>
                  취소
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={sourceLines.length === 0}
                onClick={() => (draft ? setConfirmRebuild(true) : build())}
              >
                {draft ? "↻ 원문으로 초안 다시 구성" : "📝 학습 콘텐츠 초안 만들기"}
              </button>
            )}
            {draft ? (
              <small className="muted">
                학생 화면 반영: 핵심 표현 {draft.expressions.filter((x) => x.source.trim()).length} · 어휘·문법{" "}
                {draft.grammar.filter((x) => x.source.trim()).length} · 문화렌즈{" "}
                {draft.lenses.filter((x) => x.title.trim() || x.text.trim()).length} · 완성된 퀴즈 {readyQuiz}문제
              </small>
            ) : null}
          </div>

          {draft ? (
            <div className="draft-editor">
              <datalist id="draft-source-lines">
                {sourceLines.map((l, i) => (
                  <option key={i} value={l} />
                ))}
              </datalist>

              <p className="muted small">
                ⏱ 등장 시점은 ‘관련 원문’의 동기화 시각으로 자동 연결돼요. 필요하면 직접 고칠 수 있고, 시간이 있는 핵심
                표현·어휘·문법·문화렌즈는 학생 영상의 해당 장면 위에 나타나요.
              </p>
              <NoteList
                {...timing}
                direction={direction}
                title="핵심 표현"
                items={draft.expressions}
                noteLabel="번역 / 설명"
                addLabel="핵심 표현 추가"
                onChange={(expressions) => update({ expressions })}
              />
              <NoteList
                {...timing}
                direction={direction}
                title="어휘·문법"
                items={draft.grammar}
                noteLabel="설명"
                addLabel="어휘·문법 추가"
                onChange={(grammar) => update({ grammar })}
              />

              <div className="draft-block">
                <h4>Culture Lens · 문화렌즈</h4>
                {draft.lenses.map((it) => {
                  const set = (p: Partial<DraftLens>) =>
                    update({ lenses: draft.lenses.map((x) => (x.id === it.id ? { ...x, ...p } : x)) });
                  return (
                    <div key={it.id} className="draft-row lens-row">
                      <label className="field">
                        <span>제목</span>
                        <input value={it.title} onChange={(e) => set({ title: e.target.value })} />
                      </label>
                      <label className="field">
                        <span>관련 원문</span>
                        <input
                          list="draft-source-lines"
                          value={it.source}
                          onChange={(e) => {
                            const next = withSource(it, e.target.value, timeline);
                            set({ source: next.source, at: next.at });
                          }}
                        />
                      </label>
                      <label className="field span-all">
                        <span>문화 설명</span>
                        <textarea
                          rows={3}
                          value={it.text}
                          placeholder="교수자가 직접 입력"
                          onChange={(e) => set({ text: e.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className="link-btn danger"
                        onClick={() => update({ lenses: draft.lenses.filter((x) => x.id !== it.id) })}
                      >
                        삭제
                      </button>
                      <TimingField {...timing} item={it} onAt={(at) => set({ at })} />
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => update({ lenses: [...draft.lenses, lens()] })}
                >
                  + 문화렌즈 추가
                </button>
              </div>

              <div className="draft-block">
                <h4>복습 퀴즈</h4>
                {draft.quiz.map((q, qi) => {
                  const set = (p: Partial<DraftQuiz>) =>
                    update({ quiz: draft.quiz.map((x) => (x.id === q.id ? { ...x, ...p } : x)) });
                  const ready = draftQuizToQuestions([q]).length > 0;
                  return (
                    <div key={q.id} className="draft-quiz">
                      <div className="row-start">
                        <b className="small">Q{qi + 1}</b>
                        {ready ? (
                          <span className="pill pill-mint">학생에게 표시</span>
                        ) : (
                          <span className="pill pill-cream">미완성 · 문제, 보기 2개 이상, 정답을 채워 주세요</span>
                        )}
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => update({ quiz: draft.quiz.filter((x) => x.id !== q.id) })}
                        >
                          삭제
                        </button>
                      </div>
                      <label className="field">
                        <span>문제</span>
                        <input value={q.question} onChange={(e) => set({ question: e.target.value })} />
                      </label>
                      <div className="draft-options">
                        {q.options.map((opt, oi) => (
                          <label key={oi} className={`draft-option ${q.answer === oi ? "answer" : ""}`}>
                            <input
                              type="radio"
                              name={`answer-${q.id}`}
                              checked={q.answer === oi}
                              onChange={() => set({ answer: oi })}
                              aria-label={`보기 ${oi + 1}을 정답으로`}
                            />
                            <input
                              className="cue-input"
                              value={opt}
                              placeholder={`보기 ${oi + 1}`}
                              onChange={(e) =>
                                set({ options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <small className="muted">동그라미를 눌러 정답을 고르세요.</small>
                      <label className="field">
                        <span>해설</span>
                        <input value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} />
                      </label>
                    </div>
                  );
                })}
                <button type="button" className="btn btn-soft btn-sm" onClick={() => update({ quiz: [...draft.quiz, quiz()] })}>
                  + 퀴즈 추가
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

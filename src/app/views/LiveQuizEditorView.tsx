import React, { useCallback, useEffect, useMemo, useState } from "react";
import { buildLessonDeck } from "../../content/lessonDeck";
import { resolveLessonContent } from "../../content/lessons";
import {
  LIVE_QUIZ_LIMITS,
  LiveQuizResultError,
  buildLiveQuizPrompt,
  duplicateReport,
  isAnthropicKeyShape,
  parseLiveQuizResult,
  parseLiveQuizSetInput,
  type LiveQuizOrigin,
  type LiveQuizSet,
  type LiveQuizSetInput,
  type QuizRef,
} from "../../content/liveQuiz";
import type { Lesson } from "../../content/types";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { ApiError } from "../lib/api";
import { toPinyin, usePinyinReady } from "../lib/pinyin";
import { playbackCues } from "../lib/subtitles";
import { navigate } from "../router";
import { useLessons, useStaffCourses } from "../store/hooks";
import { clearPersonalAiKey, hasPersonalAiKey, liveQuizStore, setPersonalAiKey, type AiStatus } from "../store/liveQuizStore";

type EditQ = { id?: string; question: string; options: string[]; answer: number; explanation: string; origin: LiveQuizOrigin };
type Draft = { id: string | null; version: number | null; week: number; lessonId: string | null; title: string; status: "draft" | "ready"; questions: EditQ[] };

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : err instanceof Error ? err.message : fallback);
const emptyQ = (): EditQ => ({ question: "", options: ["", "", "", ""], answer: 0, explanation: "", origin: "manual" });
const draftOf = (s: LiveQuizSet): Draft => ({
  id: s.id,
  version: s.version,
  week: s.week,
  lessonId: s.lessonId,
  title: s.title,
  status: s.status,
  questions: s.questions.map((q) => ({ ...q, options: [...q.options] })),
});

/** 교수자 화면의 진입 버튼 (주차별 학습자료 탭·관리자 과목 화면) */
export const LiveQuizEntry: React.FC<{ courseId: string }> = ({ courseId }) => (
  <section className="card live-quiz-entry row-start" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
    <div>
      <b>⚡ 실시간 퀴즈 문제 세트</b>
      <p className="muted small" style={{ margin: 0 }}>
        수업 중 학생이 바로 답하는 퀴즈 문제를 만들고 저장해요. 학습 퀴즈·복습 자료와는 따로 관리돼요.
      </p>
    </div>
    <span className="row-start" style={{ gap: 6 }}>
      <button className="btn btn-soft btn-sm" onClick={() => navigate("live-quiz", { course: courseId })}>
        문제 세트 관리
      </button>
      <button className="btn btn-primary btn-sm" onClick={() => navigate("live-host", { course: courseId })}>
        실시간 진행
      </button>
    </span>
  </section>
);

/** #/live-quiz?course={courseId} — 실시간 퀴즈 문제 세트 생성·편집·저장 (6-A, 교수자·관리자) */
export const LiveQuizEditorView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const courseId = params.get("course") ?? "";
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  const lessons = useLessons();
  const course = courses?.find((c) => c.id === courseId);
  if (!courses || !lessons) return <p className="muted">불러오는 중…</p>;
  if (!course) {
    return (
      <div className="card empty">
        <p>강의를 찾을 수 없거나 담당 강의가 아니에요.</p>
        <button className="btn btn-soft btn-sm" onClick={() => window.history.back()}>
          돌아가기
        </button>
      </div>
    );
  }
  return <Editor key={course.id} courseId={course.id} courseTitle={course.title} weekCount={course.weekCount} lessons={lessons.filter((l) => l.courseId === course.id)} />;
};

const Editor: React.FC<{ courseId: string; courseTitle: string; weekCount: number; lessons: Lesson[] }> = ({ courseId, courseTitle, weekCount, lessons }) => {
  const toast = useToast();
  const [sets, setSets] = useState<LiveQuizSet[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(
    () =>
      liveQuizStore
        .list(courseId)
        .then((list) => {
          setSets(list);
          return list;
        })
        .catch((err) => {
          setLoadError(errorText(err, "문제 세트를 불러오지 못했어요."));
          return null;
        }),
    [courseId],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  // 중복 비교용 기존 문제: 학습 퀴즈(강의자료·교수자 초안) + 다른 실시간 세트
  const lessonRefs: QuizRef[] = useMemo(
    () =>
      lessons.flatMap((l) =>
        resolveLessonContent(l).quiz.map((q) => ({ question: q.question, options: q.options, source: `${l.week}주차 학습 퀴즈` })),
      ),
    [lessons],
  );
  const liveRefs: QuizRef[] = useMemo(
    () =>
      (sets ?? [])
        .filter((s) => s.id !== draft?.id)
        .flatMap((s) => s.questions.map((q) => ({ question: q.question, options: q.options, source: `실시간 ‘${s.title}’` }))),
    [sets, draft?.id],
  );

  const startNew = () => {
    setError(null);
    const week = 1;
    setDraft({ id: null, version: null, week, lessonId: lessons.find((l) => l.week === week)?.id ?? null, title: `${week}주차 실시간 퀴즈`, status: "draft", questions: [] });
  };

  const save = async () => {
    if (!draft) return;
    setError(null);
    const input: LiveQuizSetInput = { week: draft.week, lessonId: draft.lessonId, title: draft.title, status: draft.status, questions: draft.questions };
    const parsed = parseLiveQuizSetInput(input, weekCount);
    if (!parsed.ok) return setError(parsed.error);
    const blocked = draft.questions.findIndex((q, i) => reportFor(q, i).exact.length > 0);
    if (blocked >= 0) return setError(`${blocked + 1}번 문제가 기존 문제와 같아요. 수정하거나 지운 뒤 저장해 주세요.`);
    setBusy(true);
    try {
      const saved = draft.id ? await liveQuizStore.update(draft.id, draft.version!, parsed.value) : await liveQuizStore.create(courseId, parsed.value);
      toast.show("문제 세트를 저장했어요.", "success");
      await reload();
      setDraft(draftOf(saved));
    } catch (err) {
      setError(errorText(err, "문제 세트를 저장하지 못했어요."));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!draft?.id || !window.confirm(`‘${draft.title}’ 문제 세트를 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      await liveQuizStore.remove(draft.id);
      toast.show("문제 세트를 삭제했어요.", "success");
      setDraft(null);
      await reload();
    } catch (err) {
      setError(errorText(err, "문제 세트를 삭제하지 못했어요."));
    } finally {
      setBusy(false);
    }
  };

  const reportFor = (q: EditQ, i: number) => {
    if (!q.question.trim() || q.options.filter((o) => o.trim()).length < 2) return { exact: [], similar: [] };
    const inSet = (draft?.questions ?? []).flatMap((o, j) => (j === i ? [] : [{ question: o.question, options: o.options, source: `이 세트 ${j + 1}번` }]));
    return duplicateReport({ question: q.question, options: q.options.filter((o) => o.trim()) }, [...lessonRefs, ...liveRefs, ...inSet]);
  };

  const setQ = (i: number, next: Partial<EditQ>) =>
    setDraft((d) => (d ? { ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...next } : q)) } : d));

  return (
    <div className="page live-quiz-page">
      <div className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">⚡ 실시간 퀴즈 문제 세트 · {courseTitle}</h2>
        <button className="btn btn-quiet btn-sm" onClick={() => window.history.back()}>
          돌아가기
        </button>
      </div>
      <p className="muted small">
        수업 중 학생이 바로 답하는 객관식 문제를 만들어 둬요. 학습 퀴즈·복습 HTML·학습 기록과는 따로 저장돼요. (진행·응답은 다음 단계에서 열려요)
      </p>
      {loadError ? (
        <p className="field-error small" role="alert">
          {loadError}
        </p>
      ) : null}

      <section className="card">
        <div className="row-start" style={{ flexWrap: "wrap", gap: 6 }}>
          {(sets ?? []).map((s) => (
            <button key={s.id} className={`btn btn-sm ${draft?.id === s.id ? "btn-primary" : "btn-soft"}`} onClick={() => setDraft(draftOf(s))}>
              {s.week}주차 · {s.title} ({s.questions.length}){s.status === "ready" ? " ✓" : ""}
            </button>
          ))}
          <button className="btn btn-soft btn-sm" onClick={startNew}>
            + 새 문제 세트
          </button>
        </div>
        {sets && sets.length === 0 ? <p className="muted small">아직 만든 문제 세트가 없어요.</p> : null}
      </section>

      {draft ? (
        <section className="card live-quiz-editor" aria-label="문제 세트 편집">
          <div className="form-grid">
            <label className="field">
              <span>세트 제목 *</span>
              <input value={draft.title} maxLength={LIVE_QUIZ_LIMITS.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="field">
              <span>주차</span>
              <select
                value={draft.week}
                onChange={(e) => {
                  const week = Number(e.target.value);
                  setDraft({ ...draft, week, lessonId: lessons.find((l) => l.week === week)?.id ?? null });
                }}
              >
                {Array.from({ length: weekCount }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    {w}주차
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>바탕 강의자료 (AI·중복 검사용)</span>
              <select value={draft.lessonId ?? ""} onChange={(e) => setDraft({ ...draft, lessonId: e.target.value || null })}>
                <option value="">선택 안 함</option>
                {lessons
                  .slice()
                  .sort((a, b) => a.week - b.week)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.week}주차 · {l.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-check">
              <input type="checkbox" checked={draft.status === "ready"} onChange={(e) => setDraft({ ...draft, status: e.target.checked ? "ready" : "draft" })} />
              <span>준비 완료 (검토를 마친 세트)</span>
            </label>
          </div>

          <AiPanel
            lesson={lessons.find((l) => l.id === draft.lessonId) ?? null}
            avoid={[...lessonRefs, ...liveRefs, ...draft.questions.map((q) => ({ question: q.question, options: q.options, source: "" }))].map((r) => r.question)}
            room={LIVE_QUIZ_LIMITS.questions - draft.questions.length}
            onAdd={(qs) => setDraft((d) => (d ? { ...d, questions: [...d.questions, ...qs.map((q) => ({ ...q, options: [...q.options] }))] } : d))}
          />

          <ol className="live-quiz-questions">
            {draft.questions.map((q, i) => {
              const rep = reportFor(q, i);
              return (
                <li key={q.id ?? `new-${i}`} className={`card live-quiz-q ${rep.exact.length ? "is-dup" : rep.similar.length ? "is-similar" : ""}`}>
                  <div className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                    <b>
                      {i + 1}번 <span className="pill pill-sky">{q.origin === "ai" ? "AI" : q.origin === "json" ? "붙여넣기" : "직접"}</span>
                    </b>
                    <span className="row-start">
                      <button className="btn btn-quiet btn-sm" disabled={i === 0} onClick={() => setDraft({ ...draft, questions: move(draft.questions, i, -1) })}>
                        ↑
                      </button>
                      <button className="btn btn-quiet btn-sm" disabled={i === draft.questions.length - 1} onClick={() => setDraft({ ...draft, questions: move(draft.questions, i, 1) })}>
                        ↓
                      </button>
                      <button className="btn btn-quiet btn-sm" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}>
                        삭제
                      </button>
                    </span>
                  </div>
                  <label className="field">
                    <span>문제</span>
                    <textarea rows={2} maxLength={LIVE_QUIZ_LIMITS.question} value={q.question} onChange={(e) => setQ(i, { question: e.target.value })} />
                  </label>
                  {q.options.map((o, k) => (
                    <div key={k} className="row-start live-quiz-option">
                      <input type="radio" name={`answer-${i}`} checked={q.answer === k} onChange={() => setQ(i, { answer: k })} aria-label={`${k + 1}번 보기를 정답으로`} />
                      <input
                        value={o}
                        maxLength={LIVE_QUIZ_LIMITS.option}
                        placeholder={`보기 ${k + 1}`}
                        onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })}
                        style={{ flex: 1 }}
                      />
                      <button
                        className="btn btn-quiet btn-sm"
                        disabled={q.options.length <= LIVE_QUIZ_LIMITS.optionsMin}
                        onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== k), answer: q.answer === k ? 0 : q.answer > k ? q.answer - 1 : q.answer })}
                        aria-label={`보기 ${k + 1} 삭제`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {q.options.length < LIVE_QUIZ_LIMITS.optionsMax ? (
                    <button className="btn btn-quiet btn-sm" onClick={() => setQ(i, { options: [...q.options, ""] })}>
                      + 보기 추가
                    </button>
                  ) : null}
                  <label className="field">
                    <span>해설 (정답 공개 때 보여요)</span>
                    <textarea rows={2} maxLength={LIVE_QUIZ_LIMITS.explanation} value={q.explanation} onChange={(e) => setQ(i, { explanation: e.target.value })} />
                  </label>
                  {rep.exact.length ? (
                    <p className="field-error small" role="alert">
                      같은 문제가 이미 있어요 (보기 순서만 다른 경우 포함): {rep.exact.join(", ")} — 저장할 수 없어요.
                    </p>
                  ) : rep.similar.length ? (
                    <p className="small" role="status" style={{ color: "#9a6700" }}>
                      비슷한 문제가 있어요: {rep.similar.slice(0, 4).join(", ")}
                      {rep.similar.length > 4 ? ` 외 ${rep.similar.length - 4}개` : ""} — 확인한 뒤 그대로 둘지 정해 주세요.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div className="row-start" style={{ flexWrap: "wrap", gap: 6 }}>
            <button
              className="btn btn-soft btn-sm"
              disabled={draft.questions.length >= LIVE_QUIZ_LIMITS.questions}
              onClick={() => setDraft({ ...draft, questions: [...draft.questions, emptyQ()] })}
            >
              + 문제 직접 추가
            </button>
            <span className="muted small">
              {draft.questions.length}/{LIVE_QUIZ_LIMITS.questions}문제
            </span>
          </div>
          {error ? (
            <p className="field-error small" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row-start" style={{ gap: 6 }}>
            <button className="btn btn-primary btn-sm" disabled={busy || draft.questions.length === 0} onClick={() => void save()}>
              {busy ? "저장 중…" : draft.id ? "저장" : "새 세트로 저장"}
            </button>
            {draft.id ? (
              <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void remove()}>
                세트 삭제
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
};

const move = <T,>(list: T[], i: number, dir: -1 | 1) => {
  const next = [...list];
  [next[i], next[i + dir]] = [next[i + dir], next[i]];
  return next;
};

/** AI 초안: 개인 키(메모리에만) → 관리자가 허용한 공용 키 → 프롬프트 복사 + JSON 붙여넣기 (항상 사용 가능) */
const AiPanel: React.FC<{ lesson: Lesson | null; avoid: string[]; room: number; onAdd: (qs: LiveQuizSetInput["questions"]) => void }> = ({ lesson, avoid, room, onAdd }) => {
  const toast = useToast();
  const pinyinReady = usePinyinReady();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keySet, setKeySet] = useState(hasPersonalAiKey());
  const [count, setCount] = useState(5);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    liveQuizStore.aiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const prompt = useMemo(() => {
    if (!lesson) return "";
    const py = pinyinReady ? toPinyin : undefined;
    const deck = buildLessonDeck({ lesson, content: resolveLessonContent(lesson, py), cues: playbackCues(lesson), pinyinOf: py });
    return buildLiveQuizPrompt({
      week: deck.week,
      title: deck.title,
      heading: deck.heading,
      lines: deck.lines.map((l) => ({ zh: l.zh, ko: l.ko })),
      points: [
        ...deck.points.map((p) => `${p.text}${p.note ? ` — ${p.note}` : ""}`),
        ...deck.culture.map((c) => `문화: ${c.title}${c.paragraphs[0] ? ` — ${c.paragraphs[0].slice(0, 120)}` : ""}`),
      ],
      avoid: avoid.filter((q) => q.trim()),
      count: Math.max(1, Math.min(count, room)),
    });
  }, [lesson, pinyinReady, avoid, count, room]);

  const take = (text: string, origin: "ai" | "json") => {
    try {
      const { questions, skipped } = parseLiveQuizResult(text, origin);
      const added = questions.slice(0, Math.max(0, room));
      onAdd(added);
      setMessage(`${added.length}문제를 아래에 추가했어요.${skipped ? ` 형식이 맞지 않는 ${skipped}문제는 뺐어요.` : ""} 검토·수정한 뒤 저장해 주세요.`);
      return true;
    } catch (err) {
      setMessage(err instanceof LiveQuizResultError ? err.message : "결과를 읽지 못했어요.");
      return false;
    }
  };
  const generate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await liveQuizStore.generate(prompt);
      if (take(r.text, "ai")) toast.show(r.keySource === "personal" ? "개인 API로 초안을 만들었어요." : "공용 API로 초안을 만들었어요.", "success");
    } catch (err) {
      setMessage(errorText(err, "AI 생성에 실패했어요. 프롬프트 복사로 외부 AI를 써 주세요."));
    } finally {
      setBusy(false);
    }
  };
  const canAi = keySet || !!status?.liveQuizShared;

  return (
    <details className="card live-quiz-ai" open>
      <summary>
        <b>🤖 AI로 문제 초안 만들기</b> <span className="muted small">— 초안은 아래 목록에 추가되고, 저장 전에 검토·수정해요</span>
      </summary>
      {!lesson ? <p className="muted small">위에서 바탕 강의자료를 고르면 그 강의 내용으로 프롬프트를 만들어요.</p> : null}
      <div className="form-grid">
        <label className="field">
          <span>만들 문제 수</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[3, 5, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}문제
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>개인 Anthropic API 키 (선택 · 이 화면 메모리에만, 저장 안 함)</span>
          <span className="row-start" style={{ gap: 4 }}>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={keySet ? "입력됨 (새로고침하면 지워져요)" : "sk-ant-…"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              style={{ flex: 1 }}
            />
            {keySet ? (
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  clearPersonalAiKey();
                  setKeySet(false);
                }}
              >
                지우기
              </button>
            ) : (
              <button
                className="btn btn-soft btn-sm"
                disabled={!isAnthropicKeyShape(keyInput.trim())}
                onClick={() => {
                  setPersonalAiKey(keyInput);
                  setKeyInput("");
                  setKeySet(true);
                }}
              >
                사용
              </button>
            )}
          </span>
        </label>
      </div>
      <p className="muted small">
        {keySet
          ? "개인 키로 생성해요. 키는 서버에 저장되지 않고 요청할 때만 쓰여요."
          : status?.liveQuizShared
            ? "개인 키가 없으면 관리자가 허용한 공용 키로 생성해요."
            : "개인 키가 없으면 ‘프롬프트 복사’로 외부 AI(ChatGPT·Claude 등)에서 만든 JSON을 아래에 붙여 넣어 주세요."}
      </p>
      <div className="row-start" style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" disabled={!lesson || !canAi || busy || room <= 0} onClick={() => void generate()}>
          {busy ? "만드는 중…" : "AI로 만들기"}
        </button>
        <button
          className="btn btn-soft btn-sm"
          disabled={!lesson}
          onClick={() =>
            void navigator.clipboard
              .writeText(prompt)
              .then(() => toast.show("프롬프트를 복사했어요. 외부 AI에 붙여 넣으세요.", "success"))
              .catch(() => window.prompt("이 프롬프트를 복사해 외부 AI에 붙여 넣으세요.", prompt))
          }
        >
          프롬프트 복사
        </button>
      </div>
      <label className="field">
        <span>외부 AI 결과(JSON) 붙여넣기</span>
        <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"questions":[{"question":"…","options":["…","…"],"answer":0,"explanation":"…"}]}' />
      </label>
      <button
        className="btn btn-soft btn-sm"
        disabled={!paste.trim() || room <= 0}
        onClick={() => {
          if (take(paste, "json")) setPaste("");
        }}
      >
        붙여 넣은 결과 불러오기
      </button>
      {message ? (
        <p className="small" role="status">
          {message}
        </p>
      ) : null}
    </details>
  );
};

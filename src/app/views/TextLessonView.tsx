import React, { useEffect, useMemo, useState } from "react";
import { DIRECTION_LABEL } from "../../content/course";
import { draftNotePinyin, draftQuizToQuestions, lessonHeading } from "../../content/lessons";
import { getLevel } from "../../content/levels";
import type { Lesson } from "../../content/types";
import { useAuth } from "../auth/AuthContext";
import { QuizCard } from "../learning/QuizCard";
import { toPinyin, usePinyinReady } from "../lib/pinyin";
import { navigate } from "../router";
import { progressStore } from "../store";
import { nowIso } from "../store/localJson";
import { emptyProgress } from "../store/progressStore";

/**
 * 영상이 아직 연결되지 않은 강의자료: 대본 · 핵심 표현 · 어휘·문법 · 문화렌즈 · 퀴즈로 학습한다.
 * 학습 기록: 화면을 열면 학습 시작, 퀴즈를 끝까지 풀면 학습 완료로 저장한다.
 */
export const TextLessonView: React.FC<{ lesson: Lesson }> = ({ lesson }) => {
  const { user } = useAuth();
  const pinyinReady = usePinyinReady();
  const py = (text: string) => (pinyinReady ? toPinyin(text) : "");
  const level = getLevel(lesson.level);
  const draft = lesson.draft;
  const lines = lesson.script.plain?.lines.map((l) => l.text) ?? lesson.script.cues.map((c) => c.zh ?? c.ko ?? "");
  const quiz = useMemo(() => draftQuizToQuestions(draft?.quiz ?? []), [draft]);
  const zhSource = lesson.direction === "zh-ko";
  const recordFor = user?.role === "learner" ? user.id : null;
  const [done, setDone] = useState(false);

  const save = async (patch: (p: ReturnType<typeof emptyProgress>) => ReturnType<typeof emptyProgress>) => {
    if (!recordFor) return;
    const prev = (await progressStore.get(recordFor, lesson.id)) ?? emptyProgress(recordFor, lesson.id, lesson.week);
    await progressStore.save({ ...patch(prev), lastStudiedAt: nowIso() });
  };

  // 화면을 열면 학습 시작으로 기록
  useEffect(() => {
    void save((p) => ({ ...p, startedAt: p.startedAt ?? nowIso() })).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordFor, lesson.id]);

  const onQuizFinish = (correct: number, total: number) => {
    setDone(true);
    void save((p) => ({
      ...p,
      startedAt: p.startedAt ?? nowIso(),
      completedAt: p.completedAt ?? nowIso(),
      progressRatio: 1,
      quiz: { correct, total, submittedAt: nowIso() },
      quizAttempts: p.quizAttempts + 1,
    })).catch(() => undefined);
  };

  const notes = [
    { title: "💬 핵심 표현", items: draft?.expressions ?? [] },
    { title: "📖 어휘·문법", items: draft?.grammar ?? [] },
  ];

  return (
    <div className="page text-lesson">
      <section className="card">
        <span className="row-start">
          <span className="pill pill-sky">{lesson.week}주차</span>
          <span className="pill pill-lavender">{DIRECTION_LABEL[lesson.direction]}</span>
          <span className={`pill pill-${level.tone}`} title={level.definition || undefined}>
            {level.label}
          </span>
          {lesson.status !== "published" ? <span className="pill pill-pink">미리보기 · 비공개</span> : null}
        </span>
        <h2>{lessonHeading(lesson)}</h2>
        <p className="muted">{lesson.title}</p>
        <p>{lesson.description}</p>
        <p className="scope-note">
          🎬 이 주차의 영상은 준비 중이에요. 지금은 대본과 표현, 문화렌즈, 퀴즈로 먼저 학습해요.
          {user?.role === "instructor" ? (
            <>
              {" "}
              <button className="link-btn" onClick={() => navigate("admin-editor", { id: lesson.id })}>
                강의자료 만들기에서 영상 연결 ›
              </button>
            </>
          ) : null}
        </p>
      </section>

      <div className="text-lesson-grid">
        <section className="card">
          <h3 className="card-title">🎞 장면 대본</h3>
          <ol className="script-list untimed-script">
            {lines.map((l, i) => (
              <li key={i}>
                <span className="script-text">
                  <b className={zhSource ? "zh" : undefined}>{l}</b>
                  {zhSource && py(l) ? <small className="script-py">{py(l)}</small> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          {notes.map((sec) =>
            sec.items.length > 0 ? (
              <React.Fragment key={sec.title}>
                <h3 className="card-title">{sec.title}</h3>
                <ul className="expr-list">
                  {sec.items.map((x) => {
                    const pinyin = draftNotePinyin(x, lesson.direction, pinyinReady ? toPinyin : undefined);
                    return (
                      <li key={x.id}>
                        <b>{x.source}</b>
                        {pinyin && zhSource ? <small>{pinyin}</small> : null}
                        <span>{x.note}</span>
                        {pinyin && !zhSource ? <small>{pinyin}</small> : null}
                      </li>
                    );
                  })}
                </ul>
              </React.Fragment>
            ) : null,
          )}
        </section>
      </div>

      {draft?.lenses.map((l) => (
        <section key={l.id} className="card study-lens">
          <span className="lens-kicker">🔍 문화렌즈</span>
          <h3>{l.title}</h3>
          {l.source ? <p className="lens-quote">“{l.source}”</p> : null}
          {l.text.split(/\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      ))}

      {quiz.length > 0 ? (
        <section>
          <h3 className="section-title">📝 복습 퀴즈</h3>
          <QuizCard questions={quiz} onFinish={onQuizFinish} />
          {done && recordFor ? <p className="muted small center">✅ 학습 완료로 기록했어요. ‘내 대시보드’에서 확인할 수 있어요.</p> : null}
        </section>
      ) : null}
    </div>
  );
};

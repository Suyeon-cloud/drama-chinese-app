import React, { useEffect, useState } from "react";
import type { LiveQuizSet } from "../../content/liveQuiz";
import { liveJoinHash, normalizeJoinCode, type LiveAction, type LiveHostState, type LiveHostSummary } from "../../content/liveSession";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { MixedText } from "../components/Zh";
import { ApiError } from "../lib/api";
import { navigate } from "../router";
import { useStaffCourses } from "../store/hooks";
import { liveQuizStore } from "../store/liveQuizStore";
import { liveSessionStore, useLiveSync } from "../store/liveSessionStore";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const PHASE_LABEL = { waiting: "시작 전", open: "응답 받는 중", closed: "응답 마감", revealed: "정답 공개" } as const;
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** 보기별 응답 막대 (교수자·정답 공개 뒤 학생) */
const Bars: React.FC<{ options: string[]; counts: number[]; answer: number | null }> = ({ options, counts, answer }) => {
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <ol className="live-bars">
      {options.map((o, i) => (
        <li key={i} className={answer === i ? "is-answer" : ""}>
          <span className="live-bar-label">
            {i + 1}. <MixedText text={o} />
            {answer === i ? " ✓" : ""}
          </span>
          <span className="live-bar-track">
            <span style={{ width: `${pct(counts[i] ?? 0, total)}%` }} />
          </span>
          <span className="live-bar-num">
            {counts[i] ?? 0}명 · {pct(counts[i] ?? 0, total)}%
          </span>
        </li>
      ))}
    </ol>
  );
};

/* ───────── 교수자: #/live-host?course={courseId}[&session={sessionId}] ───────── */

export const LiveHostView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const courseId = params.get("course") ?? "";
  const sessionId = params.get("session");
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  const course = courses?.find((c) => c.id === courseId);
  if (!courses) return <p className="muted">불러오는 중…</p>;
  if (!course) {
    return (
      <div className="card empty">
        <p>강의를 찾을 수 없거나 담당 강의가 아니에요.</p>
      </div>
    );
  }
  return sessionId ? (
    <HostSession key={sessionId} sessionId={sessionId} courseId={course.id} />
  ) : (
    <HostSetup courseId={course.id} courseTitle={course.title} sections={course.sections.filter((s) => s.status === "active")} />
  );
};

const HostSetup: React.FC<{ courseId: string; courseTitle: string; sections: { id: string; name: string }[] }> = ({ courseId, courseTitle, sections }) => {
  const [sets, setSets] = useState<LiveQuizSet[] | null>(null);
  const [active, setActive] = useState<LiveHostSummary[] | null>(null);
  const [setId, setSetId] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    liveQuizStore
      .list(courseId)
      .then((list) => {
        const ready = list.filter((s) => s.status === "ready");
        setSets(ready);
        setSetId((cur) => cur || ready[0]?.id || "");
      })
      .catch((err) => setError(errorText(err, "문제 세트를 불러오지 못했어요.")));
    liveSessionStore
      .hostSessions(courseId)
      .then(setActive)
      .catch(() => setActive([]));
  }, [courseId]);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await liveSessionStore.start(setId, sectionId);
      navigate("live-host", { course: courseId, session: s.id });
    } catch (err) {
      setError(errorText(err, "실시간 퀴즈를 시작하지 못했어요."));
    } finally {
      setBusy(false);
    }
  };
  const sectionName = (id: string) => sections.find((s) => s.id === id)?.name ?? id;
  return (
    <div className="page live-host">
      <h2 className="section-title">⚡ 실시간 퀴즈 · {courseTitle}</h2>
      {active && active.length > 0 ? (
        <section className="card">
          <b>진행 중인 세션</b>
          {active.map((s) => (
            <div key={s.id} className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <span>
                {sectionName(s.sectionId)} · {s.title} · 코드 <b>{s.joinCode}</b> · {s.currentIndex === null ? "시작 전" : `${s.currentIndex + 1}/${s.total}번`}
              </span>
              <button className="btn btn-primary btn-sm" onClick={() => navigate("live-host", { course: courseId, session: s.id })}>
                이어서 진행
              </button>
            </div>
          ))}
        </section>
      ) : null}
      <section className="card">
        <b>새 세션 시작</b>
        {sections.length === 0 ? <p className="muted small">운영 중인 담당 분반이 있어야 시작할 수 있어요.</p> : null}
        {sets && sets.length === 0 ? (
          <p className="muted small">
            준비 완료로 저장한 문제 세트가 없어요.{" "}
            <button className="link-btn" onClick={() => navigate("live-quiz", { course: courseId })}>
              문제 세트 관리
            </button>
          </p>
        ) : null}
        <div className="form-grid">
          <label className="field">
            <span>분반</span>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>문제 세트 (준비 완료만)</span>
            <select value={setId} onChange={(e) => setSetId(e.target.value)}>
              {(sets ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.week}주차 · {s.title} ({s.questions.length}문제)
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p className="field-error small" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary btn-sm" disabled={busy || !setId || !sectionId} onClick={() => void start()}>
          {busy ? "시작하는 중…" : "세션 시작 (참여 코드 발급)"}
        </button>
      </section>
    </div>
  );
};

const HostSession: React.FC<{ sessionId: string; courseId: string }> = ({ sessionId, courseId }) => {
  const toast = useToast();
  const sync = useLiveSync<LiveHostState>(sessionId, liveSessionStore.host);
  const [busy, setBusy] = useState(false);
  const s = sync.state;
  const act = async (action: LiveAction) => {
    if (!s) return;
    if (action === "end" && !window.confirm("실시간 퀴즈를 종료할까요? 학생 화면에도 종료 안내가 나가요.")) return;
    setBusy(true);
    try {
      sync.setState(await liveSessionStore.control(sessionId, action, s.version));
    } catch (err) {
      toast.show(errorText(err, "진행하지 못했어요."), "error");
      await sync.refresh();
    } finally {
      setBusy(false);
    }
  };
  if (sync.error && !s) {
    return (
      <div className="card empty">
        <p>{sync.error.message}</p>
        <button className="btn btn-soft btn-sm" onClick={() => navigate("live-host", { course: courseId })}>
          세션 목록
        </button>
      </div>
    );
  }
  if (!s) return <p className="muted">불러오는 중…</p>;
  const responded = s.counts.reduce((a, b) => a + b, 0);
  const joinUrl = `${window.location.origin}${window.location.pathname}${liveJoinHash(s.joinCode)}`;
  const isLast = s.currentIndex !== null && s.currentIndex + 1 >= s.total;
  return (
    <div className="page live-host">
      <div className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">⚡ {s.title}</h2>
        <span className="muted small">
          {sync.realtime ? "실시간 연결됨" : "자동 새로고침"}
          {sync.stale ? " · 연결 지연 중" : ""}
        </span>
      </div>
      <section className="card live-code">
        <div>
          참여 코드 <b className="live-code-text">{s.joinCode}</b>
        </div>
        <small className="muted">
          학생: 로그인 → 내 강의 → ‘실시간 퀴즈 참여’에 코드 입력 (또는 {joinUrl})
        </small>
        <div className="row-start" style={{ gap: 12, marginTop: 6 }}>
          <span>👥 참여 {s.participants}명</span>
          <span>
            {s.status === "ended"
              ? `${s.currentIndex === null ? "시작 전" : `${s.currentIndex + 1} / ${s.total}번`} · 종료됨`
              : s.currentIndex === null
                ? "시작 전"
                : `${s.currentIndex + 1} / ${s.total}번 · ${PHASE_LABEL[s.phase]}`}
          </span>
        </div>
      </section>

      {s.status === "ended" ? (
        <section className="card">
          <b>세션이 종료됐어요.</b>
          <Summary s={s} />
          <button className="btn btn-soft btn-sm" onClick={() => navigate("live-host", { course: courseId })}>
            세션 목록으로
          </button>
        </section>
      ) : (
        <>
          {s.question ? (
            <section className="card live-question">
              <h3 className="live-q-text">
                {s.currentIndex! + 1}. <MixedText text={s.question.question} />
              </h3>
              <p className="muted small">
                응답 {responded}명 / 참여 {s.participants}명
              </p>
              <Bars options={s.question.options} counts={s.counts} answer={s.phase === "revealed" || s.phase === "closed" ? s.question.answer : null} />
              {s.phase === "closed" ? <p className="muted small">✓ 표시는 교수자 화면에만 보여요. ‘정답 공개’를 누르면 학생에게도 보여요.</p> : null}
              {s.phase === "revealed" && s.question.explanation ? <p className="live-explain"><MixedText text={s.question.explanation} /></p> : null}
            </section>
          ) : (
            <section className="card">
              <p>학생들이 참여 코드로 들어오면 첫 문제를 내 주세요.</p>
            </section>
          )}
          <div className="row-start live-controls" style={{ gap: 6, flexWrap: "wrap" }}>
            {s.phase === "waiting" || s.phase === "revealed" ? (
              <button className="btn btn-primary" disabled={busy || isLast} onClick={() => void act("next")}>
                {s.phase === "waiting" ? "첫 문제 내기" : isLast ? "마지막 문제였어요" : "다음 문제 내기"}
              </button>
            ) : null}
            {s.phase === "open" ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => void act("close")}>
                응답 마감
              </button>
            ) : null}
            {s.phase === "closed" ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => void act("reveal")}>
                정답·해설 공개
              </button>
            ) : null}
            <button className="btn btn-quiet" disabled={busy} onClick={() => void act("end")}>
              세션 종료
            </button>
          </div>
          {s.summary.length > 0 ? <Summary s={s} /> : null}
        </>
      )}
    </div>
  );
};

const Summary: React.FC<{ s: LiveHostState }> = ({ s }) =>
  s.summary.length ? (
    <table className="live-summary">
      <thead>
        <tr>
          <th>문제</th>
          <th>응답</th>
          <th>정답률</th>
        </tr>
      </thead>
      <tbody>
        {s.summary.map((r) => (
          <tr key={r.index}>
            <td>{r.index + 1}번</td>
            <td>{r.responded}명</td>
            <td>{pct(r.correct, r.responded)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : null;

/* ───────── 학생: #/live?code=… (참여) → #/live?session=… (응답) ───────── */

export const LiveJoinView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const sessionId = params.get("session");
  return sessionId ? <StudentSession key={sessionId} sessionId={sessionId} /> : <JoinForm initial={params.get("code") ?? ""} />;
};

const JoinForm: React.FC<{ initial: string }> = ({ initial }) => {
  const [code, setCode] = useState(normalizeJoinCode(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const join = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await liveSessionStore.join(code);
      navigate("live", { session: s.id });
    } catch (err) {
      setError(errorText(err, "참여하지 못했어요."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page live-student">
      <form className="card live-join" onSubmit={(e) => void join(e)}>
        <h2 className="section-title">⚡ 실시간 퀴즈 참여</h2>
        <label className="field">
          <span>참여 코드 (6자리)</span>
          <input
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
            onChange={(e) => setCode(normalizeJoinCode(e.target.value))}
            className="live-code-input"
            placeholder="ABC234"
          />
        </label>
        {error ? (
          <p className="field-error small" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" disabled={busy || code.length !== 6}>
          {busy ? "참여하는 중…" : "참여하기"}
        </button>
      </form>
    </div>
  );
};

const StudentSession: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const toast = useToast();
  const sync = useLiveSync(sessionId, liveSessionStore.state);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const s = sync.state;
  // 다음 문제로 넘어가면 고른 보기 초기화
  useEffect(() => setPicked(null), [s?.currentIndex]);
  if (sync.error && !s) {
    return (
      <div className="card empty">
        <p>{sync.error.message}</p>
        <button className="btn btn-soft btn-sm" onClick={() => navigate("live")}>
          참여 코드 입력
        </button>
      </div>
    );
  }
  if (!s) return <p className="muted">불러오는 중…</p>;
  const submit = async () => {
    if (picked === null || s.currentIndex === null) return;
    setBusy(true);
    try {
      sync.setState(await liveSessionStore.submit(sessionId, s.currentIndex, picked));
    } catch (err) {
      toast.show(errorText(err, "제출하지 못했어요."), "error");
      await sync.refresh();
    } finally {
      setBusy(false);
    }
  };
  const answered = s.myChoice !== null;
  return (
    <div className="page live-student">
      <section className="card">
        <div className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <b>⚡ {s.title}</b>
          <span className="muted small">
            {s.currentIndex === null ? "시작 전" : `${s.currentIndex + 1} / ${s.total}`}
            {sync.stale ? " · 연결 지연 중" : ""}
          </span>
        </div>
      </section>
      {s.status === "ended" ? (
        <section className="card">
          <b>실시간 퀴즈가 끝났어요. 수고했어요! 👏</b>
        </section>
      ) : !s.question ? (
        <section className="card">
          <p>곧 첫 문제가 나와요. 이 화면을 열어 두세요.</p>
        </section>
      ) : (
        <section className="card live-question">
          <h3 className="live-q-text">
            <MixedText text={s.question.question} />
          </h3>
          <div className="live-options">
            {s.question.options.map((o, i) => {
              const mine = s.myChoice === i;
              const correct = s.answer === i;
              return (
                <button
                  key={i}
                  type="button"
                  className={`live-option ${picked === i || mine ? "is-picked" : ""} ${correct ? "is-answer" : ""} ${s.answer !== null && mine && !correct ? "is-wrong" : ""}`}
                  disabled={answered || s.phase !== "open" || busy}
                  onClick={() => setPicked(i)}
                >
                  {i + 1}. <MixedText text={o} />
                  {correct ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          {s.phase === "open" && !answered ? (
            <button className="btn btn-primary" disabled={picked === null || busy} onClick={() => void submit()}>
              {busy ? "제출 중…" : "제출 (한 번만 가능)"}
            </button>
          ) : null}
          {answered && s.phase !== "revealed" ? <p className="small">제출했어요. 정답 공개를 기다려 주세요.</p> : null}
          {!answered && s.phase === "closed" ? <p className="muted small">응답이 마감됐어요.</p> : null}
          {s.phase === "revealed" ? (
            <div className="live-reveal">
              <p>
                <b>{answered ? (s.myChoice === s.answer ? "정답이에요! 🎉" : "아쉬워요. 정답을 확인해 보세요.") : "이번 문제는 답하지 않았어요."}</b>
              </p>
              {s.explanation ? (
                <p className="live-explain">
                  <MixedText text={s.explanation} />
                </p>
              ) : null}
              {s.counts ? <Bars options={s.question.options} counts={s.counts} answer={s.answer} /> : null}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
};

/** 학생 강의 화면의 진입 버튼 */
export const LiveJoinEntry: React.FC = () => (
  <button className="btn btn-soft btn-sm" onClick={() => navigate("live")}>
    ⚡ 실시간 퀴즈 참여
  </button>
);

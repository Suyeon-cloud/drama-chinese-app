// 6-C: 실시간 퀴즈 결과 (교수자 전용) — 종료된 세션의 학생별 응답·점수, 문항별 정답률·응답 분포, 중복 학번, CSV
// 개인정보: 학번은 기본으로 가려서 보여 준다. CSV는 받을 때 한 번 더 확인한다. 결과는 브라우저에 저장하지 않는다.
import React, { useEffect, useState } from "react";
import { liveResultsCsv, maskStudentId, type LiveHistoryItem, type LiveResults } from "../../content/liveSession";
import { MixedText } from "../components/Zh";
import { ApiError } from "../lib/api";
import { navigate } from "../router";
import { liveSessionStore } from "../store/liveSessionStore";

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);

/** 세션 목록 (진행 중 + 종료). 종료된 세션은 결과 보기 */
export const LiveHistoryList: React.FC<{ courseId: string; sectionName: (id: string) => string }> = ({ courseId, sectionName }) => {
  const [list, setList] = useState<LiveHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    liveSessionStore
      .history(courseId)
      .then(setList)
      .catch((err) => setError(err instanceof ApiError ? err.message : "지난 세션을 불러오지 못했어요."));
  }, [courseId]);
  const ended = (list ?? []).filter((s) => s.status === "ended");
  return (
    <section className="card">
      <b>📊 지난 세션 결과</b>
      {error ? <p className="field-error small">{error}</p> : null}
      {list && ended.length === 0 ? <p className="muted small">종료된 세션이 아직 없어요. 세션을 종료하면 여기에서 결과를 볼 수 있어요.</p> : null}
      {ended.length > 0 ? (
        <ul className="live-history">
          {ended.map((s) => (
            <li key={s.id}>
              <span>
                <b>{s.title}</b>
                <small className="muted">
                  {sectionName(s.sectionId)} · {when(s.endedAt ?? s.createdAt)} · 참여 {s.participants}명 · {s.total}문항
                </small>
              </span>
              <button className="btn btn-soft btn-sm" onClick={() => navigate("live-host", { course: courseId, results: s.id })}>
                결과 보기
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

/** 종료된 세션 결과 */
export const LiveResultsView: React.FC<{ sessionId: string; courseId: string; sectionName: (id: string) => string }> = ({
  sessionId,
  courseId,
  sectionName,
}) => {
  const [r, setR] = useState<LiveResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIds, setShowIds] = useState(false);
  useEffect(() => {
    liveSessionStore
      .results(sessionId)
      .then(setR)
      .catch((err) => setError(err instanceof ApiError ? err.message : "결과를 불러오지 못했어요."));
  }, [sessionId]);

  const back = (
    <button className="btn btn-soft btn-sm" onClick={() => navigate("live-host", { course: courseId })}>
      세션 목록으로
    </button>
  );
  if (error) {
    return (
      <div className="card empty">
        <p>{error}</p>
        {back}
      </div>
    );
  }
  if (!r) return <p className="muted">결과를 불러오는 중…</p>;

  const download = () => {
    const ok = window.confirm(
      "학생 이름·학번이 들어간 파일이에요.\n수업 평가·관리 목적으로만 사용하고, 공유하거나 공개된 곳에 올리지 말아 주세요.\n내려받을까요?",
    );
    if (!ok) return;
    const blob = new Blob([liveResultsCsv(r)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `실시간퀴즈_${fileSafe(r.title)}_${(r.endedAt ?? r.createdAt).slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const avg = r.students.length ? Math.round(r.students.reduce((a, s) => a + pct(s.correct, r.total), 0) / r.students.length) : 0;

  return (
    <div className="page live-host live-results">
      <div className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">📊 {r.title} · 결과</h2>
        <div className="row-start" style={{ gap: 6 }}>
          {back}
          <button className="btn btn-primary btn-sm" onClick={download} disabled={r.students.length === 0}>
            CSV 내려받기
          </button>
        </div>
      </div>

      <section className="card live-results-meta">
        <span>{sectionName(r.sectionId)}</span>
        <span>종료 {when(r.endedAt)}</span>
        <span>👥 참여 {r.participants}명</span>
        <span>📝 {r.total}문항</span>
        <span>평균 점수 {avg}%</span>
      </section>

      {r.duplicateStudentIds.length > 0 ? (
        <section className="card live-dup" role="alert">
          ⚠️ 같은 학번으로 참여한 계정이 {r.duplicateStudentIds.length}건 있어요. 아래 표에서 <b>중복</b> 표시를 확인해 주세요.
        </section>
      ) : null}

      <section className="card">
        <h3 className="card-title">🎯 문항별 정답률·응답 분포</h3>
        <ol className="live-q-results">
          {r.questions.map((q) => (
            <li key={q.index}>
              <div className="live-q-head">
                <b>
                  {q.index + 1}. <MixedText text={q.question} />
                </b>
                <span className="muted small">
                  응답 {q.responded}명 · 정답률 {pct(q.correct, q.responded)}%
                </span>
              </div>
              <ol className="live-bars">
                {q.options.map((o, i) => (
                  <li key={i} className={q.answer === i ? "is-answer" : ""}>
                    <span className="live-bar-label">
                      {i + 1}. <MixedText text={o} />
                      {q.answer === i ? " ✓" : ""}
                    </span>
                    <span className="live-bar-track">
                      <span style={{ width: `${pct(q.counts[i] ?? 0, q.responded)}%` }} />
                    </span>
                    <span className="live-bar-num">
                      {q.counts[i] ?? 0}명 · {pct(q.counts[i] ?? 0, q.responded)}%
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <div className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h3 className="card-title">👥 학생별 응답·점수</h3>
          <button className="link-btn" aria-pressed={showIds} onClick={() => setShowIds((v) => !v)}>
            {showIds ? "학번 가리기" : "학번 전체 보기"}
          </button>
        </div>
        {r.students.length === 0 ? (
          <p className="muted small">참여한 학생이 없어요.</p>
        ) : (
          <div className="data-table live-student-table">
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>학번</th>
                  <th>응답</th>
                  <th>정답</th>
                  <th>점수</th>
                  {r.questions.map((q) => (
                    <th key={q.index} className="num">
                      {q.index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.students.map((st) => (
                  <tr key={st.key} className={st.duplicate ? "is-dup" : ""}>
                    <td>{st.name || <span className="muted">(이름 없음)</span>}</td>
                    <td>
                      {st.studentId ? (showIds ? st.studentId : maskStudentId(st.studentId)) : <span className="muted">미입력</span>}
                      {st.duplicate ? <span className="pill pill-pink live-dup-tag">중복</span> : null}
                    </td>
                    <td>
                      {st.answered}/{r.total}
                    </td>
                    <td>{st.correct}</td>
                    <td>{pct(st.correct, r.total)}%</td>
                    {st.choices.map((c, i) => (
                      <td
                        key={i}
                        className={`num ${c === null ? "is-none" : c === r.questions[i].answer ? "is-ok" : "is-wrong"}`}
                        title={c === null ? "응답 없음" : `${c + 1}번 선택`}
                      >
                        {c === null ? "–" : c === r.questions[i].answer ? "○" : "×"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          이름·학번은 회원정보 기준이에요. 학번은 기본으로 가려 보여 주고, 결과는 따로 저장하지 않아요. ○ 정답 · × 오답 · – 응답 없음
        </p>
      </section>
    </div>
  );
};

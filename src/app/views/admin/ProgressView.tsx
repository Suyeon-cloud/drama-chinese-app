import React from "react";
import { formatTime } from "../../../content";
import { WEEKS } from "../../../content/course";
import { lessonHeading } from "../../../content/lessons";
import { formatDateTime, formatPercent } from "../../lib/format";
import { navigate } from "../../router";
import { useAllProgress, useLearners, useLessons } from "../../store/hooks";
import type { LessonProgress } from "../../store/models";
import { LocalScopeNote, PageIntro } from "./AdminShared";

/** 주차 칸 표시: 완료 > 학습 중(진행률) > 기록 없음 */
const WeekCell: React.FC<{ records: LessonProgress[] }> = ({ records }) => {
  if (records.some((r) => r.completedAt)) return <span className="cell done" title="학습 완료">✓</span>;
  const started = records.filter((r) => r.startedAt);
  if (started.length === 0) return <span className="cell none">·</span>;
  const best = Math.max(...started.map((r) => r.progressRatio));
  return (
    <span className="cell started" title={`학습 중 ${formatPercent(best)}`}>
      {Math.round(best * 100)}
    </span>
  );
};

/** 학습 현황: 학습자별 출석·주차 진도·영상 재생·퀴즈 */
export const ProgressView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const learners = useLearners();
  const progress = useAllProgress();
  const lessons = useLessons();
  if (!learners || !progress || !lessons) return null;

  const selected = params.get("learner");
  const rows = progress
    .filter((p) => !selected || p.userId === selected)
    .sort((a, b) => (b.lastStudiedAt ?? "").localeCompare(a.lastStudiedAt ?? ""));
  const nameOf = (id: string) => learners.find((l) => l.id === id)?.name ?? id;

  return (
    <div className="page">
      <PageIntro title="학습 현황" desc="학습자별 출석(학습 시작), 주차 진도, 영상 재생 정도, 퀴즈 결과를 확인해요." />
      <LocalScopeNote />

      <section className="card data-table">
        <h3 className="card-title">주차별 진도</h3>
        {learners.length === 0 ? (
          <p className="muted">아직 학습 기록이 없어요.</p>
        ) : (
          <table className="week-matrix">
            <thead>
              <tr>
                <th>학습자</th>
                {WEEKS.map((w) => (
                  <th key={w}>{w}</th>
                ))}
                <th>최근 학습 주차</th>
              </tr>
            </thead>
            <tbody>
              {learners.map((l) => {
                const mine = progress.filter((p) => p.userId === l.id);
                const startedWeeks = mine.filter((p) => p.startedAt).map((p) => p.week);
                return (
                  <tr key={l.id} className={selected === l.id ? "selected" : ""}>
                    <td>
                      <button
                        className="link-btn"
                        onClick={() =>
                          selected === l.id ? navigate("admin-progress") : navigate("admin-progress", { learner: l.id })
                        }
                      >
                        {l.name}
                      </button>
                    </td>
                    {WEEKS.map((w) => (
                      <td key={w}>
                        <WeekCell records={mine.filter((p) => p.week === w)} />
                      </td>
                    ))}
                    <td>{startedWeeks.length ? `${Math.max(...startedWeeks)}주차` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted small legend">✓ 학습 완료 · 숫자 = 학습 중(영상 재생 %) · “·” = 기록 없음</p>
      </section>

      <section className="card data-table">
        <div className="card-head">
          <h3 className="card-title">학습 기록 상세 {selected ? `· ${nameOf(selected)}` : ""}</h3>
          {selected ? (
            <button className="more" onClick={() => navigate("admin-progress")}>
              전체 보기
            </button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="muted">학습 기록이 없어요.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>학습자</th>
                <th>주차 · 강의자료</th>
                <th>출석(학습 시작)</th>
                <th>영상 재생</th>
                <th>최대 재생 위치</th>
                <th>학습 완료</th>
                <th>퀴즈</th>
                <th>마지막 학습</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const lesson = lessons.find((l) => l.id === p.lessonId);
                return (
                  <tr key={`${p.userId}-${p.lessonId}`}>
                    <td>{nameOf(p.userId)}</td>
                    <td>
                      {p.week}주차 · {lesson ? lessonHeading(lesson) : "(삭제된 강의자료)"}
                    </td>
                    <td className="tabular">{formatDateTime(p.startedAt)}</td>
                    <td>
                      <span className="mini-bar wide">
                        <span style={{ width: formatPercent(p.progressRatio) }} />
                      </span>{" "}
                      {formatPercent(p.progressRatio)}
                    </td>
                    <td className="tabular">{formatTime(p.maxPosition)}</td>
                    <td className="tabular">{p.completedAt ? `✓ ${formatDateTime(p.completedAt)}` : "—"}</td>
                    <td>{p.quiz ? `${p.quiz.correct}/${p.quiz.total} (${p.quizAttempts}회)` : "—"}</td>
                    <td className="tabular">{formatDateTime(p.lastStudiedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

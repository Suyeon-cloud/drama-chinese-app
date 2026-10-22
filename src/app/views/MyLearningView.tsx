import React from "react";
import { formatTime } from "../../content";
import { WEEKS } from "../../content/course";
import { baseLessonContent, lessonHeading } from "../../content/lessons";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "../auth/AuthControls";
import { computeMyStats } from "../learning/useMyStats";
import { formatDateTime, formatPercent } from "../lib/format";
import { navigate } from "../router";
import { useLessons, useUserProgress } from "../store/hooks";

/** 학습자 대시보드: 회원정보 · 학습 통계 · 15주 진도 · 주차별 기록 · 다음 학습 · 복습할 표현 */
export const MyLearningView: React.FC = () => {
  const { user } = useAuth();
  const lessons = useLessons();
  const progress = useUserProgress(user?.role === "learner" ? user.id : null);

  // 로그인 전 접근은 App의 LoginRequired가 처리한다.
  if (!user) return null;
  if (user.role !== "learner") {
    return (
      <div className="page">
        <div className="card empty">
          <span>🧑‍🏫</span>
          <p>관리자 계정에는 학습 기록이 없어요. 학습자 현황은 ‘학습 현황’ 메뉴에서 확인해요.</p>
        </div>
      </div>
    );
  }

  const m = user.member;
  const list = progress ?? [];
  const s = computeMyStats(lessons ?? [], list);
  const tiles = [
    { icon: "✅", label: "완료한 주차", value: `${s.completedCount} / ${s.totalWeeks}주`, tone: "sky" },
    { icon: "▶️", label: "학습을 시작한 주차", value: `${s.startedWeeks.size}주`, tone: "lavender" },
    { icon: "🎬", label: "평균 진행률", value: formatPercent(s.avgProgress), tone: "pink" },
    { icon: "📝", label: "퀴즈 정답률", value: s.quizRate === null ? "—" : formatPercent(s.quizRate), tone: "cream" },
    { icon: "🔥", label: "연속 학습", value: `${s.streak}일째`, tone: "mint" },
  ];

  // 복습할 표현: 학습을 시작한 강의자료의 핵심 표현
  const studied = (lessons ?? []).filter((l) => list.some((p) => p.lessonId === l.id && p.startedAt));
  const review = studied
    .flatMap((l) => [
      ...(l.draft?.expressions ?? []).map((x) => ({ zh: x.source, ko: x.note, week: l.week, lesson: l.id })),
      ...baseLessonContent(l).summary.map((x) => ({ zh: x.zh, ko: x.ko, week: l.week, lesson: l.id })),
    ])
    .slice(0, 8);

  return (
    <div className="page">
      <div className="card my-hello">
        <Avatar name={user.name} color={user.avatarColor} src={user.picture} size={56} />
        <div>
          <h2>{user.name}님의 학습 대시보드</h2>
          {m ? (
            <p className="muted">
              {m.university} · {m.department} · {m.grade} · 학번 {m.studentId}
            </p>
          ) : null}
          {m ? (
            <p className="muted small">
              가입일 {formatDateTime(m.firstSeenAt)} · 최종 접속 {formatDateTime(m.lastSeenAt)}
            </p>
          ) : null}
        </div>
        <span className="pill pill-mint">승인된 회원</span>
      </div>

      <div className="summary-cards five">
        {tiles.map((t) => (
          <div key={t.label} className={`card summary-card tone-${t.tone}`}>
            <span className="stat-icon">{t.icon}</span>
            <small>{t.label}</small>
            <b>{t.value}</b>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <h3 className="card-title">📅 15주 진도</h3>
          {s.next ? (
            <button className="btn btn-primary btn-sm" onClick={() => navigate("lesson", { lesson: s.next!.id })}>
              다음 학습: {s.next.week}주차 →
            </button>
          ) : null}
        </div>
        <div className="week-strip">
          {WEEKS.map((w) => {
            const lesson = lessons?.find((l) => l.week === w && l.status === "published");
            const tone = s.completedWeeks.has(w) ? "tone-mint has" : s.startedWeeks.has(w) ? "tone-sky has" : "";
            return (
              <button
                key={w}
                className={`week-dot ${tone}`}
                disabled={!lesson}
                onClick={() => lesson && navigate("lesson", { lesson: lesson.id })}
                title={lesson ? `${w}주차 · ${lesson.title}` : `${w}주차 · 준비 중`}
              >
                <b>{w}</b>
                <small>{s.completedWeeks.has(w) ? "완료" : s.startedWeeks.has(w) ? "학습 중" : "주차"}</small>
              </button>
            );
          })}
        </div>
        <p className="muted small legend">
          <span className="legend-dot tone-mint" /> 완료 <span className="legend-dot tone-sky" /> 학습 중{" "}
          <span className="legend-dot" /> 시작 전
        </p>
      </section>

      <div className="my-grid two">
        <section className="card">
          <h3 className="card-title">📈 주차별 학습 기록</h3>
          {list.length === 0 ? (
            <p className="muted">
              아직 학습 기록이 없어요. ‘주차·상황별 학습’에서 강의를 열면 출석과 진행률이 기록돼요.
            </p>
          ) : (
            <ul className="progress-list">
              {[...list]
                .sort((a, b) => a.week - b.week)
                .map((p) => {
                  const lesson = lessons?.find((l) => l.id === p.lessonId);
                  return (
                    <li key={p.lessonId}>
                      <span className="week-no">{p.week}주차</span>
                      <div>
                        <b>{lesson ? lessonHeading(lesson) : "(삭제된 강의자료)"}</b>
                        <small className="muted">
                          진행률 {formatPercent(p.progressRatio)}
                          {p.maxPosition ? ` · 최대 ${formatTime(p.maxPosition)}` : ""}
                          {p.quiz ? ` · 퀴즈 ${p.quiz.correct}/${p.quiz.total}` : ""}
                        </small>
                        <span className="mini-bar wide">
                          <span style={{ width: formatPercent(p.progressRatio) }} />
                        </span>
                      </div>
                      {p.completedAt ? (
                        <span className="pill pill-mint">✅ 완료</span>
                      ) : (
                        <span className="pill pill-sky">학습 중</span>
                      )}
                      {lesson ? (
                        <button className="link-btn" onClick={() => navigate("lesson", { lesson: lesson.id })}>
                          이어서 ›
                        </button>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <section className="card">
          <h3 className="card-title">⭐ 복습할 표현</h3>
          {review.length === 0 ? (
            <p className="muted">강의를 시작하면 그 주차의 핵심 표현이 여기에 모여요.</p>
          ) : (
            <ul className="saved-list">
              {review.map((r) => (
                <li key={`${r.lesson}-${r.zh}`}>
                  <b>{r.zh}</b>
                  <small>{r.week}주차</small>
                  <span>{r.ko}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

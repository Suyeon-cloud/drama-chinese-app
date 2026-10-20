import React from "react";
import { formatTime, featuredEpisode } from "../../content";
import { lessonHeading } from "../../content/lessons";
import {
  REVIEW_THRESHOLD_DAYS,
  learningStats,
  recentLearning,
  reviewItems,
  savedExpressions,
} from "../../content/myLearning";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "../auth/AuthControls";
import { formatPercent } from "../lib/format";
import { navigate } from "../router";
import { useLessons, useUserProgress } from "../store/hooks";

const dateLabel = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

export const MyLearningView: React.FC = () => {
  const { user } = useAuth();
  const lessons = useLessons();
  const progress = useUserProgress(user?.role === "learner" ? user.id : null);

  // 로그인 전 접근은 App의 LoginRequired가 처리한다.
  if (!user) return null;

  const summary = [
    { icon: "🎬", label: "이번 주 학습한 장면", value: `${learningStats.scenesThisWeek}개`, tone: "sky" },
    { icon: "🎙", label: "역할극 완료", value: `${learningStats.rolePlaysDone}회`, tone: "pink" },
    { icon: "🏷", label: "가장 많이 연습한 태그", value: `#${learningStats.topTag}`, tone: "cream" },
    { icon: "🔥", label: "연속 학습", value: `${learningStats.streakDays}일째`, tone: "mint" },
  ];

  return (
    <div className="page">
      <div className="card my-hello">
        <Avatar name={user.name} color={user.avatarColor} src={user.picture} size={56} />
        <div>
          <h2>{user.name}님의 학습 기록</h2>
          <p className="muted">오늘도 드라마 한 장면, 표현 하나씩! 꾸준히 잘하고 있어요. 💙</p>
        </div>
      </div>

      <section className="card">
        <h3 className="card-title">📅 주차별 학습 기록</h3>
        {!progress || progress.length === 0 ? (
          <p className="muted">
            아직 학습 기록이 없어요. ‘주차별 학습’에서 영상을 재생하면 출석과 진행률이 기록돼요.
          </p>
        ) : (
          <ul className="progress-list">
            {[...progress]
              .sort((a, b) => a.week - b.week)
              .map((p) => {
                const lesson = lessons?.find((l) => l.id === p.lessonId);
                return (
                  <li key={p.lessonId}>
                    <span className="week-no">{p.week}주차</span>
                    <div>
                      <b>{lesson ? lessonHeading(lesson) : "(삭제된 강의자료)"}</b>
                      <small className="muted">
                        영상 {formatPercent(p.progressRatio)} · 최대 {formatTime(p.maxPosition)}
                        {p.quiz ? ` · 퀴즈 ${p.quiz.correct}/${p.quiz.total}` : ""}
                      </small>
                      <span className="mini-bar wide">
                        <span style={{ width: formatPercent(p.progressRatio) }} />
                      </span>
                    </div>
                    {p.completedAt ? <span className="pill pill-mint">✅ 완료</span> : <span className="pill pill-sky">학습 중</span>}
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

      <div className="summary-cards">
        {summary.map((s) => (
          <div key={s.label} className={`card summary-card tone-${s.tone}`}>
            <span className="stat-icon">{s.icon}</span>
            <small>{s.label}</small>
            <b>{s.value}</b>
          </div>
        ))}
      </div>

      <div className="my-grid">
        <section className="card">
          <h3 className="card-title">最近学习 · 최근 학습</h3>
          {recentLearning.map((r) => (
            <div key={r.label} className="recent-block">
              <div className="recent-head">
                <b>{r.label}</b>
                <small>{dateLabel(r.daysAgo)}</small>
              </div>
              <div className="chip-wrap">
                {r.items.map((it) => (
                  <span key={it} className="zh-chip">
                    {it}
                  </span>
                ))}
              </div>
              <button className="btn btn-soft btn-sm" onClick={() => navigate("lesson", { ep: r.episodeId })}>
                이어서 학습하기 →
              </button>
            </div>
          ))}
        </section>

        <section className="card">
          <h3 className="card-title">⭐ 저장한 표현</h3>
          <ul className="saved-list">
            {savedExpressions.map((s) => (
              <li key={s.zh}>
                <b>{s.zh}</b>
                <small>{s.pinyin}</small>
                <span>{s.ko}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3 className="card-title">复习推荐 · 복습 추천</h3>
          <ul className="review-list">
            {reviewItems.map((r) => {
              const stale = r.lastReviewedDaysAgo >= REVIEW_THRESHOLD_DAYS;
              return (
                <li key={r.zh} className={stale ? "stale" : ""}>
                  <div>
                    <b>{r.zh}</b>
                    <span>{r.ko}</span>
                    <small>마지막 복습 {r.lastReviewedDaysAgo}일 전</small>
                  </div>
                  {stale ? <span className="badge-review">복습 추천</span> : null}
                  <button className="link-btn" onClick={() => navigate("lesson", { ep: featuredEpisode.id, t: r.time })}>
                    장면 보기 ›
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <p className="muted small center">
        * ‘주차별 학습 기록’은 이 브라우저에 저장된 실제 학습 기록이고, 그 외 통계·저장한 표현·복습 추천은 sample 데이터예요. (서버/DB 미연결)
      </p>
    </div>
  );
};

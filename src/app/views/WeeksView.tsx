import React from "react";
import { youtubeThumbnail } from "../../content";
import { COURSE_PHASES, WEEKS } from "../../content/course";
import { lessonHeading } from "../../content/lessons";
import { getLevel } from "../../content/levels";
import { useAuth } from "../auth/AuthContext";
import { useGuardedNavigate } from "../auth/LoginPrompt";
import { useLessons, useUserProgress } from "../store/hooks";

/** 학습자: 15주차 강의자료 목록. 공개된 강의자료만 학습할 수 있다. */
export const WeeksView: React.FC = () => {
  const lessons = useLessons();
  const { user } = useAuth();
  const go = useGuardedNavigate();
  const progress = useUserProgress(user?.role === "learner" ? user.id : null);
  if (!lessons) return null;
  const published = lessons.filter((l) => l.status === "published");

  return (
    <div className="page">
      <div className="page-intro">
        <h2>주차별 학습</h2>
        <p className="muted">15주 동안 드라마 영상으로 중국어와 문화를 함께 배워요.</p>
      </div>

      {COURSE_PHASES.map((phase) => (
        <section key={phase.title} className="week-phase">
          <h3 className="section-title">
            {phase.title} <span className="muted">· {phase.subtitle}</span>
          </h3>
          <div className="week-grid">
            {WEEKS.filter((w) => w >= phase.from && w <= phase.to).map((week) => {
              const items = published.filter((l) => l.week === week);
              if (items.length === 0) {
                return (
                  <div key={week} className="card week-card empty-week">
                    <span className="week-no">{week}주차</span>
                    <p className="muted small">강의자료 준비 중</p>
                  </div>
                );
              }
              return items.map((lesson) => {
                const p = progress?.find((x) => x.lessonId === lesson.id);
                const level = getLevel(lesson.level);
                return (
                  <button
                    key={lesson.id}
                    className="card week-card"
                    onClick={() => go("lesson", { lesson: lesson.id })}
                  >
                    <span className="week-thumb">
                      {/* eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion */}
                      <img src={youtubeThumbnail(lesson.video.youtubeId)} alt="" loading="lazy" />
                      <span className="week-no on-thumb">{week}주차</span>
                    </span>
                    <span className="row-start">
                      <span className={`pill pill-${level.tone}`}>{level.label}</span>
                      {p?.completedAt ? (
                        <span className="pill pill-mint">✅ 완료</span>
                      ) : p?.startedAt ? (
                        <span className="pill pill-sky">학습 중 {Math.round(p.progressRatio * 100)}%</span>
                      ) : null}
                    </span>
                    <b className="week-title">{lessonHeading(lesson)}</b>
                    <small className="muted">{lesson.title}</small>
                    {p ? (
                      <span className="mini-bar" aria-label={`진행률 ${Math.round(p.progressRatio * 100)}%`}>
                        <span style={{ width: `${p.progressRatio * 100}%` }} />
                      </span>
                    ) : null}
                  </button>
                );
              });
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

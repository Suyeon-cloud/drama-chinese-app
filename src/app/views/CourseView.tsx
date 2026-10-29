import React from "react";
import { youtubeThumbnail } from "../../content";
import { useAuth } from "../auth/AuthContext";
import { navigate } from "../router";
import { useCurriculum, useUserProgress } from "../store/hooks";
import type { CurriculumWeek } from "../store/models";
import { courseTone } from "./MyCoursesView";

/** 과목 커리큘럼 (#/course?id=…): 1~15주. 공개된 주차만 학습 화면으로 들어가고, 나머지는 ‘준비 중’ */
export const CourseView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const courseId = params.get("id") ?? "";
  const data = useCurriculum(courseId, user?.id ?? null);
  const progress = useUserProgress(user?.role === "learner" ? user.id : null);

  if (data === undefined) return null;
  if (!data) {
    return (
      <div className="page">
        <div className="card empty">
          <span>🎫</span>
          <p>수강 중인 강의가 아니에요. 강의코드를 먼저 등록해 주세요.</p>
          <button className="btn btn-soft btn-sm" style={{ marginTop: 12 }} onClick={() => navigate("weeks")}>
            내 강의로
          </button>
        </div>
      </div>
    );
  }

  const { course, weeks } = data;
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  const weekNumbers = Array.from({ length: course.weekCount }, (_, i) => i + 1);
  const openCount = weeks.filter((w) => w.status === "published").length;

  return (
    <div className="page">
      <button className="link-btn back-link" onClick={() => navigate("weeks")}>
        ← 내 강의
      </button>
      <section className={`card course-hero tone-${courseTone(course.id)}`}>
        <span className="course-drama">《{course.drama}》</span>
        <h2 className="course-name">{course.title}</h2>
        <p className="course-desc">{course.description}</p>
        <small className="muted">{course.context}</small>
        <span className="row-start">
          <span className="pill pill-cream">{course.weekCount}주 과정</span>
          <span className="pill pill-sky">
            학습 가능 {openCount} / {course.weekCount}주
          </span>
        </span>
      </section>

      <h3 className="section-title">주차별 학습</h3>
      <div className="week-grid">
        {weekNumbers.map((week) => {
          const w = byWeek.get(week);
          return w ? (
            <WeekCard key={week} week={w} progress={progress?.find((p) => p.lessonId === w.lessonId)?.progressRatio} />
          ) : (
            <div key={week} className="card week-card empty-week">
              <span className="week-no">{week}주차</span>
              <p className="muted small">강의자료 준비 중</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const WeekCard: React.FC<{ week: CurriculumWeek; progress?: number }> = ({ week, progress }) => {
  // 공개되지 않은 주차는 학습 화면으로 들어가지 않는다. (서버도 학습 콘텐츠를 보내지 않는다)
  if (week.status !== "published") {
    return (
      <div className="card week-card week-locked" aria-disabled="true">
        <span className="row-between">
          <span className="week-no">{week.week}주차</span>
          <span className="pill pill-cream">준비 중</span>
        </span>
        <b className="week-title">{week.title}</b>
        <small className="muted">🔒 학습 콘텐츠를 준비하고 있어요.</small>
      </div>
    );
  }
  return (
    <button className="card week-card" onClick={() => navigate("lesson", { lesson: week.lessonId })}>
      <span className="week-thumb">
        {week.youtubeId ? (
          // eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion
          <img src={youtubeThumbnail(week.youtubeId)} alt="" loading="lazy" />
        ) : (
          <span className="thumb-placeholder" aria-hidden>
            📖
          </span>
        )}
        <span className="week-no on-thumb">{week.week}주차</span>
      </span>
      <span className="row-start">
        <span className="pill pill-mint">학습 가능</span>
        {progress !== undefined ? <span className="pill pill-sky">진행 {Math.round(progress * 100)}%</span> : null}
      </span>
      <b className="week-title">{week.title}</b>
      {progress !== undefined ? (
        <span className="mini-bar" aria-label={`진행률 ${Math.round(progress * 100)}%`}>
          <span style={{ width: `${progress * 100}%` }} />
        </span>
      ) : null}
    </button>
  );
};

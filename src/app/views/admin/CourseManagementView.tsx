import React from "react";
import { COURSE_PHASES, DIRECTION_LABEL, WEEKS, defaultDirectionForWeek } from "../../../content/course";
import { lessonHeading } from "../../../content/lessons";
import { navigate } from "../../router";
import { useLessons } from "../../store/hooks";
import { LevelBadge, PageIntro, StatusBadge } from "./AdminShared";

/** 수업 관리: 1~15주차와 각 주차의 강의자료를 한눈에 보고 추가·수정한다. */
export const CourseManagementView: React.FC = () => {
  const lessons = useLessons();
  if (!lessons) return null;

  return (
    <div className="page">
      <PageIntro
        title="수업 관리"
        desc="1~8주차는 중국어 → 한국어, 9~15주차는 한국어 → 중국어로 구성돼요. 주차마다 강의자료를 여러 개 추가할 수 있어요."
      >
        <button className="btn btn-primary btn-sm" onClick={() => navigate("admin-editor")}>
          + 강의자료 만들기
        </button>
      </PageIntro>

      {COURSE_PHASES.map((phase) => (
        <section key={phase.title} className="card course-table">
          <h3 className="card-title">
            {phase.title} <span className="muted small">· {phase.subtitle}</span>
          </h3>
          <div className="course-row course-head" aria-hidden>
            <span>주차</span>
            <span>강의 제목</span>
            <span>학습 방향</span>
            <span>수준</span>
            <span>상태</span>
            <span>관리</span>
          </div>
          {WEEKS.filter((w) => w >= phase.from && w <= phase.to).map((week) => {
            const items = lessons.filter((l) => l.week === week);
            if (items.length === 0) {
              return (
                <div key={week} className="course-row empty-row">
                  <span className="week-no">{week}주차</span>
                  <span className="muted">강의자료 없음</span>
                  <span className="muted small">{DIRECTION_LABEL[defaultDirectionForWeek(week)]}</span>
                  <span />
                  <span />
                  <span className="course-actions">
                    <button className="btn btn-soft btn-sm" onClick={() => navigate("admin-editor", { week })}>
                      + 만들기
                    </button>
                  </span>
                </div>
              );
            }
            return items.map((lesson, i) => (
              <div key={lesson.id} className="course-row">
                <span className="week-no">{i === 0 ? `${week}주차` : ""}</span>
                <span className="course-title">
                  <b>{lesson.title || "(제목 없음)"}</b>
                  {lesson.source ? <small className="muted">{lessonHeading(lesson)}</small> : null}
                </span>
                <span className="small">{DIRECTION_LABEL[lesson.direction]}</span>
                <span>
                  <LevelBadge level={lesson.level} />
                </span>
                <span>
                  <StatusBadge status={lesson.status} />
                </span>
                <span className="course-actions">
                  <button className="btn btn-soft btn-sm" onClick={() => navigate("admin-editor", { id: lesson.id })}>
                    편집
                  </button>
                  <button
                    className="link-btn"
                    onClick={() => navigate("lesson", { lesson: lesson.id })}
                    disabled={!lesson.video.youtubeId}
                  >
                    미리보기
                  </button>
                  {i === items.length - 1 ? (
                    <button className="link-btn" onClick={() => navigate("admin-editor", { week })}>
                      + 추가
                    </button>
                  ) : null}
                </span>
              </div>
            ));
          })}
        </section>
      ))}
    </div>
  );
};

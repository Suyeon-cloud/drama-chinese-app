import React from "react";
import { recommendedLevelLabel } from "../../content/levels";
import type { Lesson } from "../../content/types";
import { useAuth } from "../auth/AuthContext";
import { navigate } from "../router";
import { useCurriculum, useLessons, useUserProgress } from "../store/hooks";
import type { CurriculumWeek, LessonProgress } from "../store/models";
import { COURSE_VISUALS, CourseImage } from "./courseVisuals";
import { SectionLine } from "./MyCoursesView";

/** 학습 화면 위 복귀 링크: 학생이 수강 중인 과목의 주차 목록으로 돌아간다. */
export const CourseBackLink: React.FC<{ courseId: string }> = ({ courseId }) => {
  const { user } = useAuth();
  const data = useCurriculum(courseId, user?.role === "learner" ? user.id : null);
  if (!data) return null;
  return (
    <button className="link-btn back-link" onClick={() => navigate("course", { id: courseId })}>
      ← 《{data.course.drama}》 주차 목록으로
    </button>
  );
};

/** 과목 커리큘럼 (#/course?id=…): 1~15주. 공개된 주차만 학습 화면으로 들어가고, 나머지는 ‘준비 중’ */
export const CourseView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const courseId = params.get("id") ?? "";
  const data = useCurriculum(courseId, user?.id ?? null);
  const progress = useUserProgress(user?.role === "learner" ? user.id : null);
  // 권장 수준·소개 문구: 공개 주차의 강의자료에서 읽는다. (준비 중 주차의 내용은 서버가 보내지 않는다)
  const lessons = useLessons();

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
  const completed = weeks.filter((w) => progress?.find((p) => p.lessonId === w.lessonId)?.completedAt).length;
  const v = COURSE_VISUALS[course.id];

  return (
    <div className="page">
      <button className="link-btn back-link" onClick={() => navigate("weeks")}>
        ← 내 강의
      </button>
      <section className="card course-hero">
        <CourseImage courseId={course.id} drama={course.drama} />
        <div className="course-hero-body">
          {v ? <span className="journey-stage">{v.stage}</span> : null}
          <h2 className="course-drama">《{course.drama}》</h2>
          <p className="course-name">{course.title}</p>
          {course.section ? <SectionLine section={course.section} /> : null}
          <p className="course-desc">{course.description}</p>
          <span className="row-start">
            <span className="pill pill-cream">{course.weekCount}주 과정</span>
            <span className="pill pill-sky">
              학습 가능 {openCount} / {course.weekCount}주
            </span>
            {user?.role === "learner" ? (
              <span className="pill pill-mint">
                완료 {completed} / {course.weekCount}주
              </span>
            ) : null}
          </span>
        </div>
      </section>

      <h3 className="section-title">주차별 학습</h3>
      <ol className="week-list">
        {weekNumbers.map((week) => {
          const w = byWeek.get(week);
          return w ? (
            <WeekRow
              key={week}
              week={w}
              lesson={lessons?.find((l) => l.id === w.lessonId)}
              record={progress?.find((p) => p.lessonId === w.lessonId)}
            />
          ) : (
            <li key={week} className="week-row is-locked">
              <span className="week-no">{week}주차</span>
              <div className="week-row-main">
                <b>학습자료 준비 중</b>
              </div>
              <span className="pill pill-cream">준비 중</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** 주차 한 줄: 주차 · 학습 주제 · 권장 수준 · 진행 상태 · 학습 버튼. 공개되지 않은 주차는 들어가지 않는다. (서버도 학습 콘텐츠를 보내지 않는다) */
const WeekRow: React.FC<{ week: CurriculumWeek; lesson?: Lesson; record?: LessonProgress }> = ({
  week,
  lesson,
  record,
}) => {
  if (week.status !== "published") {
    return (
      <li className="week-row is-locked">
        <span className="week-no">{week.week}주차</span>
        <div className="week-row-main">
          <b>{week.title}</b>
        </div>
        <span className="pill pill-cream">🔒 준비 중</span>
      </li>
    );
  }
  const level = lesson ? recommendedLevelLabel(lesson.level) : null;
  const percent = record ? Math.round(record.progressRatio * 100) : 0;
  const open = () => navigate("lesson", { lesson: week.lessonId });
  return (
    <li className="week-row">
      <span className="week-no">{week.week}주차</span>
      <div className="week-row-main">
        <b>{week.title}</b>
        {lesson?.description ? <p>{lesson.description}</p> : null}
        <span className="row-start">
          {level ? <span className="pill pill-lavender">{level}</span> : null}
          {record?.completedAt ? (
            <span className="pill pill-mint">✓ 학습 완료</span>
          ) : record?.startedAt ? (
            <span className="pill pill-sky">학습 중 {percent}%</span>
          ) : (
            <span className="pill pill-mint">학습 가능</span>
          )}
        </span>
      </div>
      <button className="btn btn-primary btn-sm" onClick={open}>
        {record?.completedAt ? "다시 보기" : record?.startedAt ? "이어서 학습" : "학습 시작"}
      </button>
    </li>
  );
};

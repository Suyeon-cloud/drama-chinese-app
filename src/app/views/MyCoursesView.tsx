import React, { useState } from "react";
import { courseToneFor, weekRatio } from "../../content/courseWeeks";
import type { Lesson } from "../../content/types";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { ApiError } from "../lib/api";
import { navigate } from "../router";
import { enrollmentStore } from "../store";
import { useLessons, useMyCourses, useUserProgress } from "../store/hooks";
import type { CourseSummary, LessonProgress } from "../store/models";

/** 과목 카드 색: 기존 3과목은 순서대로 하늘·분홍·민트, 새 과목은 과목마다 정해진 색 */
export const courseTone = courseToneFor;

/** 수강 중인 분반 · 담당 교강사 (이름을 아는 경우만) */
export const SectionLine: React.FC<{ section: NonNullable<CourseSummary["section"]> }> = ({ section }) => (
  <span className="section-line">
    <b>{section.name}</b>
    {section.instructorNames.length ? ` · 담당 교강사 ${section.instructorNames.join(", ")}` : null}
  </span>
);

/**
 * 과목의 학습 현황: 학습자가 받은 공개 강의자료와 본인 학습 기록으로 계산한다.
 * next: 이어서 볼 주차 (학습 중 → 아직 완료하지 않은 공개 주차 순). 모두 완료했으면 null
 */
export const courseStats = (courseId: string, lessons: Lesson[], progress: LessonProgress[]) => {
  const open = lessons.filter((l) => l.courseId === courseId && l.status === "published").sort((a, b) => a.week - b.week);
  const recordOf = (l: Lesson) => progress.find((p) => p.lessonId === l.id);
  const completed = open.filter((l) => recordOf(l)?.completedAt).length;
  const inProgress = open.find((l) => recordOf(l)?.startedAt && !recordOf(l)?.completedAt);
  const next = inProgress ?? open.find((l) => !recordOf(l)?.completedAt) ?? null;
  return { open, completed, started: open.some((l) => recordOf(l)?.startedAt), next, nextStarted: !!inProgress };
};

/** 수강 중인 드라마 과목 카드: 대표 이미지 · 분반 · 진도 · 학습 진입 */
const CourseCard: React.FC<{ course: CourseSummary; lessons: Lesson[]; progress: LessonProgress[] }> = ({
  course,
  lessons,
  progress,
}) => {
  const { open, completed, started, next, nextStarted } = courseStats(course.id, lessons, progress);
  const allDone = open.length > 0 && !next;
  const state = allDone ? "공개 주차 완료" : started ? "학습 중" : "학습 전";
  const openCourse = () => navigate("course", { id: course.id });
  return (
    <article className="card course-card">
      {/* 메인 화면 간결화: 장식용 일러스트 대신 색 띠 (과목 정보·들어가기 버튼은 아래 본문에) */}
      <span className="course-band" aria-hidden />
      <div className="course-body">
        <h3 className="course-drama" lang="zh-CN">
          《{course.drama}》
        </h3>
        <p className="course-name">
          {course.title}{" "}
          {course.status === "inactive" ? <span className="pill pill-cream" title="이미 수강 중인 학습은 계속할 수 있어요">신규 수강 마감</span> : null}
        </p>
        {course.section ? <SectionLine section={course.section} /> : null}
        <div className="course-progress">
          <span className="row-between">
            <small>
              완료 {completed} / {course.weekCount}주
            </small>
            <span className={`pill ${started ? "pill-sky" : "pill-cream"}`}>{state}</span>
          </span>
          <span className="mini-bar" role="img" aria-label={`${course.weekCount}주 중 ${completed}주 완료`}>
            <span style={{ width: `${weekRatio(completed, course.weekCount) * 100}%` }} />
          </span>
        </div>
        <div className="course-foot">
          {next ? (
            <button className="btn btn-primary btn-sm" onClick={() => navigate("lesson", { lesson: next.id })}>
              ▶ {nextStarted ? "이어서 학습" : "학습 시작"} · {next.week}주차
            </button>
          ) : null}
          <button className="btn btn-soft btn-sm" onClick={openCourse}>
            과목 들어가기 <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
};

/** 강의코드 입력 → 수강 등록 (기존 수강 등록 API) */
const CourseCodeForm: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { course, section, alreadyEnrolled } = await enrollmentStore.enroll(code);
      setCode("");
      toast.show(
        alreadyEnrolled
          ? `이미 수강 중인 강의예요. 《${course.drama}》 ${section.name}`
          : `《${course.drama}》 ${course.title} ${section.name} 수강 등록을 마쳤어요!`,
        alreadyEnrolled ? "info" : "success",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "수강 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`code-form ${compact ? "" : "card"}`} onSubmit={(e) => void submit(e)}>
      {compact ? null : (
        <div>
          <h3 className="card-title">🎫 강의코드로 과목 추가</h3>
          <p className="muted small">선생님께 받은 6자리 강의코드를 입력하면 바로 ‘내 강의’에 추가돼요.</p>
        </div>
      )}
      <div className="code-row">
        <input
          className="code-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/\s/g, ""));
            setError(null);
          }}
          maxLength={12}
          placeholder="강의코드 6자리"
          aria-label="강의코드"
          aria-invalid={!!error}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>
          {busy ? "확인 중…" : "수강 등록"}
        </button>
      </div>
      {error ? (
        <p className="field-error small" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
};

/** 학습자의 ‘내 강의’: 수강 중인 과목 카드 + 강의코드 등록. 수강하지 않은 과목·기존 자료는 나오지 않는다. */
export const MyCoursesSection: React.FC = () => {
  const { user } = useAuth();
  const courses = useMyCourses(user?.role === "learner" ? user.id : null);
  const lessons = useLessons();
  const progress = useUserProgress(user?.role === "learner" ? user.id : null);

  if (user?.role === "instructor") {
    return (
      <div className="card empty">
        <span>🧑‍🏫</span>
        <p>
          {user.provider === "admin"
            ? "관리자는 ‘전체 강의·학습자료’에서 과목별 학습자료를 확인해요."
            : "교수자는 ‘내 담당 강의’에서 담당 과목을 관리해요."}
        </p>
        <button
          className="btn btn-soft btn-sm"
          style={{ marginTop: 12 }}
          onClick={() => navigate(user.provider === "admin" ? "admin-course" : "teach")}
        >
          {user.provider === "admin" ? "전체 강의·학습자료로" : "내 담당 강의로"}
        </button>
      </div>
    );
  }
  if (!courses) return null;

  if (courses.length === 0) {
    return (
      <div className="card course-empty">
        <span className="gate-emoji">🎬</span>
        <h3>아직 등록한 강의가 없어요</h3>
        <p className="muted">
          강의코드를 입력하면 중국 드라마로 배우는 중국어 과목이 ‘내 강의’에 추가돼요.
          <br className="br-desktop" />
          선생님께 받은 6자리 코드를 입력해 학습을 시작해 보세요.
        </p>
        <CourseCodeForm compact />
      </div>
    );
  }

  return (
    <>
      <div className="course-grid">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} lessons={lessons ?? []} progress={progress ?? []} />
        ))}
      </div>
      <CourseCodeForm />
    </>
  );
};

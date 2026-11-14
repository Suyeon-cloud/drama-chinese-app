// 교수자·관리자가 함께 쓰는 과목·분반 단위 화면 조각: 과목 카드, 분반 카드, 참여 링크, 주차별 학습자료 표, 수강생 현황
import React, { useState } from "react";
import { formatTime } from "../../../content";
import { DIRECTION_LABEL } from "../../../content/course";
import { LEGACY_COURSE_ID, defaultDirectionFor } from "../../../content/courses";
import { COURSE_STATUS_LABEL, enrollableCourses, visibleCourses } from "../../../content/courseRules";
import { courseWeeks, coursePhases, weekRatio } from "../../../content/courseWeeks";
import { lessonHeading } from "../../../content/lessons";
import type { Lesson } from "../../../content/types";
import { useToast } from "../../components/Toast";
import { ApiError, lessonConflictOf } from "../../lib/api";
import { formatDateTime, formatPercent } from "../../lib/format";
import { joinUrl, navigate } from "../../router";
import { lessonStore } from "../../store";
import { useCourseStudents } from "../../store/hooks";
import { refreshAllStores } from "../../store/remote";
import type { CourseOverview, LessonProgress, SectionOverview, SectionTeacher } from "../../store/models";
import { courseTone } from "../MyCoursesView";
import { LevelBadge, StatusBadge } from "./AdminShared";
import { StudentFeedback } from "./StudentFeedback";

/**
 * 과목 목록 (기존 3과목은 지금 순서, 새 과목은 그 뒤에 생성일 순):
 * - visibleCourses: 운영 + 비활성 — 교수자 담당 강의, 학습 현황, 분반·교강사 관리처럼 기존 수강·배정이 계속 쓰는 화면
 * - enrollableCourses: 운영만 — 참여 링크·강의코드처럼 신규 수강에 쓰는 화면
 * 기존 자료(legacy)는 둘 다 아니다. (전체 강의·학습자료 화면의 ‘기존 자료’에서만 다룬다)
 */
export { enrollableCourses, visibleCourses };

/** 과목 상태 표시: 운영 중 / 신규 수강 마감 / 기존 자료 */
export const CourseStatusPill: React.FC<{ status: CourseOverview["status"] }> = ({ status }) => (
  <span className={`pill ${status === "active" ? "pill-mint" : status === "inactive" ? "pill-cream" : "pill-lavender"}`}>
    {COURSE_STATUS_LABEL[status]}
  </span>
);

/** 교강사 표시: 이름을 알면 “이름 (이메일)”, 모르면 이메일 */
export const teacherLabel = (t: SectionTeacher) => (t.name ? `${t.name} (${t.email})` : t.email);

export const SectionStatusPill: React.FC<{ status: SectionOverview["status"] }> = ({ status }) =>
  status === "active" ? <span className="pill pill-mint">운영 중</span> : <span className="pill pill-cream">비활성</span>;

/** 과목 카드 (관리자): 드라마 · 과목명 · 분반 · 수강생 · 학습자료 현황. 강의코드는 분반마다 있어 분반 목록에 보여준다. */
export const CourseOverviewCard: React.FC<{
  course: CourseOverview;
  showSections?: boolean;
  /** 운영 중 과목에도 상태를 보여 줄지 (비활성 과목은 언제나 ‘신규 수강 마감’을 보여 준다) */
  showStatus?: boolean;
  children?: React.ReactNode;
}> = ({ course, showSections, showStatus, children }) => {
    const active = course.sections.filter((s) => s.status === "active");
  return (
    <section className={`card course-admin-card tone-${courseTone(course.id)}`}>
      <div className="course-admin-head">
        <span className="course-drama">{course.drama ? `《${course.drama}》` : course.title}</span>
        <span className="course-name">
          {course.drama ? course.title : null} {showStatus || course.status === "inactive" ? <CourseStatusPill status={course.status} /> : null}
        </span>
      </div>
      <dl className="section-card-stats">
        <div>
          <dt>공통 학습자료 (공개)</dt>
          <dd>
            {course.publishedCount} / {course.lessonCount}
          </dd>
        </div>
        <div>
          <dt>운영 분반</dt>
          <dd>{active.length}개</dd>
        </div>
        <div>
          <dt>수강생</dt>
          <dd>{course.enrolledCount}명</dd>
        </div>
      </dl>
      {showSections && course.sections.length ? (
        <ul className="section-mini-list">
          {course.sections.map((s) => (
            <li key={s.id}>
              <b>{s.name}</b> <span className="code-chip">{s.code}</span> <SectionStatusPill status={s.status} />
              <span className="muted small block">
                수강생 {s.enrolledCount}명 · 담당{" "}
                {s.instructors.length ? s.instructors.map((t) => t.name || t.email).join(", ") : "미배정"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {children ? <div className="row-start">{children}</div> : null}
    </section>
  );
};

/** 분반 카드 (교수자): 과목 · 분반 · 강의코드 · 수강생 · 학습자료 현황 (일러스트 없이 텍스트 중심, 관리자 과목 카드와 같은 색 체계) */
export const SectionCard: React.FC<{
  course: CourseOverview;
  section: SectionOverview;
  children?: React.ReactNode;
}> = ({ course, section, children }) => (
  <section className={`card section-card tone-${courseTone(course.id)}`}>
    <div className="course-admin-head">
      <span className="course-drama">《{course.drama}》</span>
      <span className="course-name">
        {course.title} · {section.name} {section.status === "inactive" ? <SectionStatusPill status="inactive" /> : null}{" "}
        {course.status === "inactive" ? <CourseStatusPill status="inactive" /> : null}
      </span>
    </div>
    <dl className="section-card-stats">
      <div>
        <dt>강의코드</dt>
        <dd className="code-chip">{section.code}</dd>
      </div>
      <div>
        <dt>수강생</dt>
        <dd>{section.enrolledCount}명</dd>
      </div>
      <div>
        <dt>공개 학습자료</dt>
        <dd>
          {course.publishedCount} / {course.lessonCount}
        </dd>
      </div>
    </dl>
    {section.instructors.length ? (
      <p className="small course-admin-teachers">
        <b>담당 교강사</b> {section.instructors.map((t) => t.name || t.email).join(", ")}
      </p>
    ) : null}
    {children ? <div className="row-start">{children}</div> : null}
  </section>
);

/** 학습자료가 강의 공통임을 알리는 안내 (교강사·관리자 학습자료 화면, 편집 화면) */
export const SharedLessonNote: React.FC = () => (
  <p className="scope-note info">
    ℹ️ 이 학습자료는 같은 강의의 모든 분반에서 공통으로 사용돼요. 수정한 내용은 해당 강의의 모든 분반에 반영돼요.
  </p>
);

const useCopyJoinLink = (code: string, label: string) => {
  const toast = useToast();
  const link = joinUrl(code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.show(`${label} 참여 링크를 복사했어요.`, "success");
    } catch {
      toast.show("복사하지 못했어요. 분반 화면에서 링크를 직접 선택해 복사해 주세요.", "error");
    }
  };
  return { link, copy };
};

/** 참여 링크 복사 버튼만 (카드용) */
export const JoinLinkCopy: React.FC<{ code: string; label: string }> = ({ code, label }) => {
  const { copy } = useCopyJoinLink(code, label);
  return (
    <button className="link-btn" onClick={() => void copy()}>
      🔗 참여 링크 복사
    </button>
  );
};

/** 분반 강의코드 + 참여 링크 복사 */
export const JoinLinkBox: React.FC<{ code: string; label: string }> = ({ code, label }) => {
  const { link, copy } = useCopyJoinLink(code, label);
  return (
    <div className="join-link-row">
      <input
        className="join-link-input"
        value={link}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`${label} 참여 링크`}
      />
      <button className="btn btn-soft btn-sm" onClick={() => void copy()}>
        링크 복사
      </button>
    </div>
  );
};

/* ───────── 주차별 학습자료 ───────── */

/**
 * 과목의 주차별 학습자료 표 (편집·주차 이동·미리보기). 기존 ‘수업 관리’ 표를 과목 단위로 쓴다.
 * 운영 과목은 1~N주(과목의 주차 수) 한 표, 기존 자료는 예전처럼 중→한 / 한→중 두 표.
 * 학습자료가 없는 주차는 빈 주차로 보여 준다. (가짜 학습자료를 만들지 않는다)
 */
export const CourseLessonsTable: React.FC<{
  courseId: string;
  /** 서버가 준 과목의 주차 수 (course.weekCount) */
  weekCount: number;
  lessons: Lesson[];
  /** 분반 화면에서 열었으면 편집을 마치고 그 분반으로 돌아오게 넘긴다. */
  sectionId?: string;
}> = ({ courseId, weekCount, lessons, sectionId }) => {
  const backTo: Record<string, string> = sectionId ? { section: sectionId } : {};
  const toast = useToast();
  const [moving, setMoving] = useState<string | null>(null);
  // 주차 이동은 바로 저장하지 않고 한 번 확인한다.
  const [pendingMove, setPendingMove] = useState<{ id: string; week: number } | null>(null);
  const items = lessons.filter((l) => l.courseId === courseId);
  const takenWeeks = new Set(items.map((l) => l.week));
  const weeks = courseWeeks(weekCount);
  const phases = coursePhases(courseId, weekCount);
  // 주차 범위 밖에 저장된 학습자료 (숨기지 않고 따로 보여 준다)
  const outOfRange = items.filter((l) => !weeks.includes(l.week));

  /** 같은 과목 안에서 다른 주차로 옮긴다. 학습 방향은 대본 언어와 묶여 있어 그대로 둔다. */
  const moveTo = async (lesson: Lesson, week: number) => {
    setMoving(lesson.id);
    try {
      await lessonStore.save({ ...lesson, week });
      const keepDirection = lesson.direction !== defaultDirectionFor(courseId, week);
      toast.show(
        keepDirection
          ? `${week}주차로 옮겼어요. 학습 방향(${DIRECTION_LABEL[lesson.direction]})은 그대로예요. 바꾸려면 편집에서 바꿔 주세요.`
          : `${week}주차로 옮겼어요.`,
        "success",
      );
    } catch (err) {
      // 다른 사람이 먼저 저장했으면 옮기지 않고 목록을 최신으로 다시 읽는다. (입력한 내용이 없어 지울 것이 없다)
      if (lessonConflictOf(err)) {
        toast.show("다른 사용자가 이 강의자료를 먼저 수정해서 주차를 옮기지 않았어요. 목록을 새로 불러왔으니 다시 확인해 주세요.", "error");
        refreshAllStores();
      } else toast.show(err instanceof ApiError ? err.message : "주차를 옮기지 못했어요.", "error");
    } finally {
      setMoving(null);
      setPendingMove(null);
    }
  };

  if (weeks.length === 0) {
    return (
      <section className="card course-table" role="alert">
        <p className="muted">강의의 주차 수 정보가 올바르지 않아 주차별 학습자료를 보여 줄 수 없어요. 관리자에게 문의해 주세요.</p>
      </section>
    );
  }

  return (
    <>
      {phases.map((phase) => (
        <section key={phase.title} className="card course-table">
          <h3 className="card-title">
            {phase.title} <span className="muted small">· {phase.subtitle}</span>
          </h3>
          <div className="course-row course-head" aria-hidden>
            <span>주차</span>
            <span>학습 주제</span>
            <span>학습 방향</span>
            <span>수준</span>
            <span>상태</span>
            <span>관리</span>
          </div>
          {weeks.filter((w) => w >= phase.from && w <= phase.to).map((week) => {
            const weekItems = items.filter((l) => l.week === week);
            if (weekItems.length === 0) {
              return (
                <div key={week} className="course-row empty-row">
                  <span className="week-no">{week}주차</span>
                  <span className="muted">학습자료 없음</span>
                  <span className="muted small">{DIRECTION_LABEL[defaultDirectionFor(courseId, week)]}</span>
                  <span />
                  <span />
                  <span className="course-actions">
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => navigate("admin-editor", { week, course: courseId, ...backTo })}
                    >
                      + 만들기
                    </button>
                  </span>
                </div>
              );
            }
            return weekItems.map((lesson, i) => (
              <div key={lesson.id} className="course-row">
                <span className="week-no">{i === 0 ? `${week}주차` : ""}</span>
                <span className="course-title">
                  <b>{lesson.title || "(제목 없음)"}</b>
                  {lesson.source ? (
                    <small className="muted">{lesson.source.videoTitle || lessonHeading(lesson)}</small>
                  ) : null}
                </span>
                <span className="small">{DIRECTION_LABEL[lesson.direction]}</span>
                <span>
                  <LevelBadge level={lesson.level} />
                </span>
                <span>
                  <StatusBadge status={lesson.status} />
                </span>
                <span className="course-actions">
                  <select
                    className="week-move"
                    aria-label={`${lesson.title || "학습자료"} 주차 이동`}
                    title="다른 주차로 옮기기"
                    value={lesson.week}
                    disabled={moving === lesson.id}
                    onChange={(e) => setPendingMove({ id: lesson.id, week: Number(e.target.value) })}
                  >
                    {weeks.map((w) => (
                      <option key={w} value={w} disabled={w !== week && takenWeeks.has(w)}>
                        {w === week ? `${w}주차` : takenWeeks.has(w) ? `${w}주차 (사용 중)` : `${w}주차로 이동`}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-soft btn-sm" onClick={() => navigate("admin-editor", { id: lesson.id, ...backTo })}>
                    편집
                  </button>
                  <button
                    className="link-btn"
                    onClick={() => navigate("lesson", { lesson: lesson.id })}
                    disabled={!lesson.video.youtubeId}
                  >
                    미리보기
                  </button>
                  <button className="link-btn" onClick={() => navigate("present", { lesson: lesson.id })}>
                    발표 모드
                  </button>
                  {pendingMove?.id === lesson.id ? (
                    <span className="week-move-confirm">
                      <span className="small">
                        {lesson.week}주차 → {pendingMove.week}주차로 옮길까요? 모든 분반에 반영돼요.
                      </span>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={moving === lesson.id}
                        onClick={() => void moveTo(lesson, pendingMove.week)}
                      >
                        옮기기
                      </button>
                      <button className="btn btn-soft btn-sm" disabled={moving === lesson.id} onClick={() => setPendingMove(null)}>
                        취소
                      </button>
                    </span>
                  ) : null}
                </span>
              </div>
            ));
          })}
        </section>
      ))}
      {outOfRange.length > 0 ? (
        <section className="card course-table">
          <h3 className="card-title">
            주차 범위 밖 학습자료 <span className="muted small">· 이 강의는 {weekCount}주차까지예요</span>
          </h3>
          {outOfRange.map((lesson) => (
            <div key={lesson.id} className="course-row">
              <span className="week-no">{lesson.week}주차</span>
              <span className="course-title">
                <b>{lesson.title || "(제목 없음)"}</b>
              </span>
              <span className="small">{DIRECTION_LABEL[lesson.direction]}</span>
              <span>
                <LevelBadge level={lesson.level} />
              </span>
              <span>
                <StatusBadge status={lesson.status} />
              </span>
              <span className="course-actions">
                <button className="btn btn-soft btn-sm" onClick={() => navigate("admin-editor", { id: lesson.id, ...backTo })}>
                  편집
                </button>
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
};

/* ───────── 수강생 현황 ───────── */

/** 주차 칸 표시: 완료 > 학습 중(진행률) > 기록 없음 */
export const WeekCell: React.FC<{ records: LessonProgress[] }> = ({ records }) => {
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

const latest = (values: (string | null)[]) =>
  values.reduce<string | null>((a, b) => (b && (!a || b > a) ? b : a), null);

/**
 * 수강생 현황: 수강생 목록 + 완료 주차 + 퀴즈 결과 + 주차별 진도. sectionId를 주면 그 분반만.
 * 서버가 요청자가 운영하는 분반의 수강생과, 그 학생들의 이 과목 강의자료 기록만 보내므로 다른 분반·과목 기록은 섞이지 않는다.
 * 기록이 없으면 ‘학습 전’·‘기록 없음’으로 표시한다.
 * feedback: 교강사 화면(운영 중인 담당 분반)에서만 준다. 학생을 고르면 학습 기록 아래에서 피드백을 작성·발송한다.
 */
export const CourseStudentsPanel: React.FC<{
  courseId: string;
  weekCount: number;
  sectionId?: string;
  highlight?: string | null;
  feedback?: { lessons: Lesson[] };
}> = ({ courseId, weekCount, sectionId, highlight, feedback }) => {
  const data = useCourseStudents(courseId, sectionId);
  const [selected, setSelected] = useState<string | null>(highlight ?? null);
  if (data === undefined) return null;
  if (data === null) {
    return (
      <div className="card empty">
        <span>🔒</span>
        <p>담당 강의가 아니라서 수강생을 볼 수 없어요.</p>
      </div>
    );
  }
  const { students, progress } = data;
  if (students.length === 0) {
    return (
      <div className="card empty">
        <span>👥</span>
        <p>아직 수강 등록한 학생이 없어요. 학생이 강의코드를 입력하면 여기에 표시돼요.</p>
      </div>
    );
  }
  const weeks = courseWeeks(weekCount);
  const detail = selected ? progress.filter((p) => p.userId === selected) : [];
  const selectedStudent = selected ? students.find((s) => s.userId === selected) : undefined;
  // 여러 분반을 함께 볼 때만 분반을 표시한다.
  const multiSection = new Set(students.map((s) => s.sectionId)).size > 1;

  return (
    <>
      <section className="card data-table">
        <h3 className="card-title">수강생 {students.length}명</h3>
        {feedback ? <p className="muted small">학생 이름을 누르면 학습 기록 상세와 학습 피드백 작성이 열려요.</p> : null}
        <table>
          <thead>
            <tr>
              <th>학생</th>
              {multiSection ? <th>분반</th> : null}
              <th>이메일</th>
              <th>완료 주차</th>
              <th>퀴즈 결과</th>
              <th>최근 학습</th>
              <th>수강 등록</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const mine = progress.filter((p) => p.userId === s.userId);
              const done = new Set(mine.filter((p) => p.completedAt).map((p) => p.week)).size;
              const quizzes = mine.filter((p) => p.quiz);
              const correct = quizzes.reduce((n, p) => n + p.quiz!.correct, 0);
              const total = quizzes.reduce((n, p) => n + p.quiz!.total, 0);
              const last = latest(mine.map((p) => p.lastStudiedAt));
              return (
                <tr key={s.userId} className={selected === s.userId ? "selected" : ""}>
                  <td>
                    <button
                      className="link-btn"
                      title={feedback ? "학습 기록 상세 · 피드백" : "학습 기록 상세"}
                      onClick={() => setSelected(selected === s.userId ? null : s.userId)}
                    >
                      {s.name}
                    </button>
                    {s.studentId ? <small className="muted"> · {s.studentId}</small> : null}
                  </td>
                  {multiSection ? <td>{s.sectionName}</td> : null}
                  <td className="muted">{s.email}</td>
                  <td>
                    <span className="mini-bar wide">
                      <span style={{ width: `${weekRatio(done, weekCount) * 100}%` }} />
                    </span>{" "}
                    {done} / {weekCount}
                  </td>
                  <td>{quizzes.length ? `${correct}/${total} (${quizzes.length}개 주차)` : <span className="muted">기록 없음</span>}</td>
                  <td className="tabular">{last ? formatDateTime(last) : <span className="muted">학습 전</span>}</td>
                  <td className="tabular">{formatDateTime(s.joinedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card data-table">
        <h3 className="card-title">주차별 진도</h3>
        <table className="week-matrix">
          <thead>
            <tr>
              <th>학생</th>
              {weeks.map((w) => (
                <th key={w}>{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const mine = progress.filter((p) => p.userId === s.userId);
              return (
                <tr key={s.userId} className={selected === s.userId ? "selected" : ""}>
                  <td>
                    {s.name}
                    {multiSection ? <small className="muted"> · {s.sectionName}</small> : null}
                  </td>
                  {weeks.map((w) => (
                    <td key={w}>
                      <WeekCell records={mine.filter((p) => p.week === w)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small legend">✓ 학습 완료 · 숫자 = 학습 중(영상 재생 %) · “·” = 기록 없음</p>
      </section>

      {selected ? (
        <section className="card data-table">
          <h3 className="card-title">학습 기록 상세 · {students.find((s) => s.userId === selected)?.name}</h3>
          {detail.length === 0 ? (
            <p className="muted">아직 이 강의의 학습 기록이 없어요.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>주차</th>
                  <th>출석(학습 시작)</th>
                  <th>영상 재생</th>
                  <th>최대 재생 위치</th>
                  <th>학습 완료</th>
                  <th>퀴즈</th>
                  <th>마지막 학습</th>
                </tr>
              </thead>
              <tbody>
                {[...detail]
                  .sort((a, b) => a.week - b.week)
                  .map((p) => (
                    <tr key={p.lessonId}>
                      <td>{p.week}주차</td>
                      <td className="tabular">{formatDateTime(p.startedAt)}</td>
                      <td>{formatPercent(p.progressRatio)}</td>
                      <td className="tabular">{formatTime(p.maxPosition)}</td>
                      <td className="tabular">{p.completedAt ? `✓ ${formatDateTime(p.completedAt)}` : "—"}</td>
                      <td>{p.quiz ? `${p.quiz.correct}/${p.quiz.total} (${p.quizAttempts}회)` : "—"}</td>
                      <td className="tabular">{formatDateTime(p.lastStudiedAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
      {selectedStudent && feedback && sectionId ? (
        <StudentFeedback
          key={selectedStudent.userId}
          courseId={courseId}
          sectionId={sectionId}
          student={selectedStudent}
          records={detail}
          lessons={feedback.lessons}
        />
      ) : null}
    </>
  );
};

/** 과목 고르기 탭 (관리자 화면) */
export const CourseTabs: React.FC<{
  courses: { id: string; drama: string; title: string }[];
  active: string;
  onSelect: (id: string) => void;
}> = ({ courses, active, onSelect }) => (
  <div className="learn-tabs" role="tablist" aria-label="강의">
    {courses.map((c) => (
      <button
        key={c.id}
        role="tab"
        aria-selected={active === c.id}
        className={`learn-tab ${active === c.id ? "active" : ""}`}
        onClick={() => onSelect(c.id)}
      >
        {c.id === LEGACY_COURSE_ID ? (
          <>
            <b>🗂 기존 자료</b>
            <small>3강의 개편 전 보관 자료</small>
          </>
        ) : (
          <>
            <b>{c.drama ? `《${c.drama}》` : c.title}</b>
            <small>{c.drama ? c.title : ""}</small>
          </>
        )}
      </button>
    ))}
  </div>
);

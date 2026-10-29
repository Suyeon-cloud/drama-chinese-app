// 교수자·관리자가 함께 쓰는 과목·분반 단위 화면 조각: 과목 카드, 분반 카드, 참여 링크, 주차별 학습자료 표, 수강생 현황
import React, { useState } from "react";
import { formatTime } from "../../../content";
import { COURSE_PHASES, DIRECTION_LABEL, WEEKS } from "../../../content/course";
import { COURSE_SEEDS, LEGACY_COURSE_ID, defaultDirectionFor } from "../../../content/courses";
import { lessonHeading } from "../../../content/lessons";
import type { Lesson } from "../../../content/types";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { formatDateTime, formatPercent } from "../../lib/format";
import { joinUrl, navigate } from "../../router";
import { lessonStore } from "../../store";
import { useCourseStudents } from "../../store/hooks";
import type { CourseOverview, LessonProgress, SectionOverview, SectionTeacher } from "../../store/models";
import { courseTone } from "../MyCoursesView";
import { LevelBadge, StatusBadge } from "./AdminShared";

/** 운영 과목만 (기존 자료 제외), 기본 과목 순서대로 */
export const operatingCourses = (courses: CourseOverview[]) =>
  courses
    .filter((c) => c.status === "active")
    .sort((a, b) => COURSE_SEEDS.findIndex((s) => s.id === a.id) - COURSE_SEEDS.findIndex((s) => s.id === b.id));

/** 교강사 표시: 이름을 알면 “이름 (이메일)”, 모르면 이메일 */
export const teacherLabel = (t: SectionTeacher) => (t.name ? `${t.name} (${t.email})` : t.email);

export const SectionStatusPill: React.FC<{ status: SectionOverview["status"] }> = ({ status }) =>
  status === "active" ? <span className="pill pill-mint">운영 중</span> : <span className="pill pill-cream">비활성</span>;

/** 과목 카드 (관리자): 드라마 · 과목명 · 분반 · 수강생 · 학습자료 현황. 강의코드는 분반마다 있어 분반 목록에 보여준다. */
export const CourseOverviewCard: React.FC<{
  course: CourseOverview;
  showSections?: boolean;
  children?: React.ReactNode;
}> = ({ course, showSections, children }) => {
  const preparing = course.lessonCount - course.publishedCount;
  const active = course.sections.filter((s) => s.status === "active");
  return (
    <section className={`card course-admin-card tone-${courseTone(course.id)}`}>
      <div className="course-admin-head">
        <span className="course-drama">《{course.drama}》</span>
        <span className="course-name">{course.title}</span>
      </div>
      <dl className="course-admin-stats">
        <div>
          <dt>운영 분반</dt>
          <dd>{active.length}개</dd>
        </div>
        <div>
          <dt>수강생</dt>
          <dd>{course.enrolledCount}명</dd>
        </div>
        <div>
          <dt>과정</dt>
          <dd>{course.weekCount}주</dd>
        </div>
        <div>
          <dt>공개</dt>
          <dd>{course.publishedCount}개</dd>
        </div>
        <div>
          <dt>준비 중</dt>
          <dd>{preparing}개</dd>
        </div>
      </dl>
      {showSections && course.sections.length ? (
        <ul className="section-mini-list">
          {course.sections.map((s) => (
            <li key={s.id}>
              <b>{s.name}</b> <span className="code-chip">{s.code}</span> <SectionStatusPill status={s.status} />
              <span className="muted small">
                {" "}
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

/** 분반 카드 (교수자): 과목 · 분반 · 강의코드 · 수강생 · 학습자료 현황 */
export const SectionCard: React.FC<{
  course: CourseOverview;
  section: SectionOverview;
  children?: React.ReactNode;
}> = ({ course, section, children }) => (
  <section className={`card course-admin-card tone-${courseTone(course.id)}`}>
    <div className="course-admin-head">
      <span className="course-drama">《{course.drama}》</span>
      <span className="course-name">
        {course.title} · {section.name} {section.status === "inactive" ? <SectionStatusPill status="inactive" /> : null}
      </span>
    </div>
    <dl className="course-admin-stats">
      <div>
        <dt>강의코드</dt>
        <dd className="code-chip">{section.code}</dd>
      </div>
      <div>
        <dt>수강생</dt>
        <dd>{section.enrolledCount}명</dd>
      </div>
      <div>
        <dt>과정</dt>
        <dd>{course.weekCount}주</dd>
      </div>
      <div>
        <dt>공개</dt>
        <dd>{course.publishedCount}개</dd>
      </div>
      <div>
        <dt>준비 중</dt>
        <dd>{course.lessonCount - course.publishedCount}개</dd>
      </div>
    </dl>
    {section.instructors.length > 1 ? (
      <p className="small course-admin-teachers">
        <b>공동 담당</b> {section.instructors.map(teacherLabel).join(", ")}
      </p>
    ) : null}
    {children ? <div className="row-start">{children}</div> : null}
  </section>
);

/** 분반 강의코드 + 참여 링크 복사 */
export const JoinLinkBox: React.FC<{ code: string; label: string }> = ({ code, label }) => {
  const toast = useToast();
  const link = joinUrl(code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.show(`${label} 참여 링크를 복사했어요.`, "success");
    } catch {
      toast.show("복사하지 못했어요. 링크를 직접 선택해 복사해 주세요.", "error");
    }
  };
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
 * 운영 과목은 1~15주 한 표, 기존 자료는 예전처럼 중→한 / 한→중 두 표.
 */
export const CourseLessonsTable: React.FC<{ courseId: string; lessons: Lesson[] }> = ({ courseId, lessons }) => {
  const toast = useToast();
  const [moving, setMoving] = useState<string | null>(null);
  const items = lessons.filter((l) => l.courseId === courseId);
  const phases =
    courseId === LEGACY_COURSE_ID
      ? COURSE_PHASES
      : [{ title: "1~15주차", subtitle: "중국어 원문 기반", from: 1, to: WEEKS.length }];

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
      toast.show(err instanceof ApiError ? err.message : "주차를 옮기지 못했어요.", "error");
    } finally {
      setMoving(null);
    }
  };

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
          {WEEKS.filter((w) => w >= phase.from && w <= phase.to).map((week) => {
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
                      onClick={() => navigate("admin-editor", { week, course: courseId })}
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
                    onChange={(e) => void moveTo(lesson, Number(e.target.value))}
                  >
                    {WEEKS.map((w) => (
                      <option key={w} value={w}>
                        {w === week ? `${w}주차` : `${w}주차로 이동`}
                      </option>
                    ))}
                  </select>
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
                </span>
              </div>
            ));
          })}
        </section>
      ))}
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
 */
export const CourseStudentsPanel: React.FC<{
  courseId: string;
  weekCount: number;
  sectionId?: string;
  highlight?: string | null;
}> = ({ courseId, weekCount, sectionId, highlight }) => {
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
  const weeks = Array.from({ length: weekCount }, (_, i) => i + 1);
  const detail = selected ? progress.filter((p) => p.userId === selected) : [];
  // 여러 분반을 함께 볼 때만 분반을 표시한다.
  const multiSection = new Set(students.map((s) => s.sectionId)).size > 1;

  return (
    <>
      <section className="card data-table">
        <h3 className="card-title">수강생 {students.length}명</h3>
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
                    <button className="link-btn" onClick={() => setSelected(selected === s.userId ? null : s.userId)}>
                      {s.name}
                    </button>
                    {s.studentId ? <small className="muted"> · {s.studentId}</small> : null}
                  </td>
                  {multiSection ? <td>{s.sectionName}</td> : null}
                  <td className="muted">{s.email}</td>
                  <td>
                    <span className="mini-bar wide">
                      <span style={{ width: `${(done / weekCount) * 100}%` }} />
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
            <p className="muted">아직 이 과목의 학습 기록이 없어요.</p>
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
    </>
  );
};

/** 과목 고르기 탭 (관리자 화면) */
export const CourseTabs: React.FC<{
  courses: { id: string; drama: string; title: string }[];
  active: string;
  onSelect: (id: string) => void;
}> = ({ courses, active, onSelect }) => (
  <div className="learn-tabs" role="tablist" aria-label="과목">
    {courses.map((c) => (
      <button
        key={c.id}
        role="tab"
        aria-selected={active === c.id}
        className={`learn-tab ${active === c.id ? "active" : ""}`}
        onClick={() => onSelect(c.id)}
      >
        <b>{c.drama ? `《${c.drama}》` : "🗂 기존 자료"}</b>
        <small>{c.drama ? c.title : "3과목 개편 전 보관 자료"}</small>
      </button>
    ))}
  </div>
);

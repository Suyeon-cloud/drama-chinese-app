// 교수자(Google 로그인) 화면: 내 담당 강의(분반) → 담당 분반(수강생 현황 · 주차별 학습자료)
// 담당 분반은 관리자가 ‘분반·교강사 관리’에서 정한다. 서버가 담당 분반 수강생의 데이터만 보내므로 다른 분반 학생은 볼 수 없다.
// 학습자료는 과목 공통이라, 같은 과목의 다른 분반 교강사와 같은 주차별 학습자료를 함께 관리한다.
import React from "react";
import { weekRangeLabel } from "../../../content/courseWeeks";
import { useAuth } from "../../auth/AuthContext";
import { navigate } from "../../router";
import { useLessons, useStaffCourses, useWeekMaterials } from "../../store/hooks";
import { WeekMaterialsPanel } from "./WeekMaterialsPanel";
import { PageIntro } from "./AdminShared";
import {
  CourseLessonsTable,
  CourseStudentsPanel,
  CourseTabs,
  JoinLinkBox,
  JoinLinkCopy,
  SectionCard,
  SharedLessonNote,
  visibleCourses,
} from "./CourseAdminShared";

/** 내 담당 강의: 담당 분반 카드 */
export const InstructorHomeView: React.FC = () => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  if (!courses) return null;
  // 운영 + 비활성 과목 (비활성 과목도 담당 교강사는 수강생 현황·학습자료를 계속 관리한다)
  const mine = visibleCourses(courses).flatMap((c) => c.sections.map((s) => ({ course: c, section: s })));

  return (
    <div className="page">
      <PageIntro
        title="내 담당 강의"
        desc={`${user?.name ?? "교강사"}님이 담당하는 분반이에요. 분반 수강생의 학습 진행과 강의 공통 주차별 학습자료를 관리해요.`}
      />
      {mine.length === 0 ? (
        <div className="card course-empty">
          <span className="gate-emoji">🧑‍🏫</span>
          <h3>현재 배정된 강의가 없어요</h3>
          <p className="muted">관리자에게 분반 배정을 요청해 주세요. 배정되면 이곳에 담당 분반이 나타나요.</p>
        </div>
      ) : (
        <div className="course-admin-grid">
          {mine.map(({ course, section }) => (
            <SectionCard key={section.id} course={course} section={section}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate("teach-course", { id: course.id, section: section.id, tab: "students" })}
              >
                👥 수강생 현황
              </button>
              <button
                className="btn btn-soft btn-sm"
                onClick={() => navigate("teach-course", { id: course.id, section: section.id, tab: "lessons" })}
              >
                📚 주차별 학습자료
              </button>
              {course.status === "active" ? <JoinLinkCopy code={section.code} label={`《${course.drama}》 ${section.name}`} /> : null}
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
};

/** 주차별 추가 자료 (과목 공통) */
const CourseMaterials: React.FC<{ courseId: string; weekCount: number; editable: boolean }> = ({ courseId, weekCount, editable }) => {
  const materials = useWeekMaterials(courseId, true);
  return <WeekMaterialsPanel courseId={courseId} weekCount={weekCount} materials={materials} editable={editable} />;
};

type Tab = "students" | "lessons";

/** 담당 분반: 수강생 현황(그 분반만) / 주차별 학습자료(과목 공통) */
export const InstructorCourseView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  const lessons = useLessons();
  if (!courses || !lessons) return null;
  const course = visibleCourses(courses).find((c) => c.id === params.get("id"));
  // 분반을 지정했는데 담당 분반이 아니면 다른 분반으로 바꿔 보여주지 않고 막는다.
  const sectionParam = params.get("section");
  const section = sectionParam ? course?.sections.find((s) => s.id === sectionParam) : course?.sections[0];
  const tab: Tab = params.get("tab") === "lessons" ? "lessons" : "students";

  if (!course || !section) {
    return (
      <div className="page">
        <div className="card empty">
          <span>🔒</span>
          <p>담당 분반이 아니에요. 관리자가 배정한 분반만 관리할 수 있어요.</p>
          <button className="btn btn-soft btn-sm" style={{ marginTop: 12 }} onClick={() => navigate("teach")}>
            내 담당 강의로
          </button>
        </div>
      </div>
    );
  }

  const go = (patch: { section?: string; tab?: Tab }) =>
    navigate("teach-course", { id: course.id, section: patch.section ?? section.id, tab: patch.tab ?? tab });

  return (
    <div className="page">
      <button className="link-btn back-link admin-back" onClick={() => navigate("teach")}>
        ← 내 담당 강의
      </button>
      {course.sections.length > 1 ? (
        <CourseTabs
          courses={course.sections.map((s) => ({ id: s.id, drama: course.drama, title: `${course.title} · ${s.name}` }))}
          active={section.id}
          onSelect={(id) => go({ section: id })}
        />
      ) : null}
      <SectionCard course={course} section={section}>
        {course.status === "active" ? (
          <JoinLinkBox code={section.code} label={`《${course.drama}》 ${section.name}`} />
        ) : (
          <p className="muted small">신규 수강이 마감된 강의라 참여 링크를 쓰지 않아요. 기존 수강생은 계속 학습해요.</p>
        )}
      </SectionCard>

      <div className="learn-tabs sub-tabs scope-tabs" role="tablist" aria-label="담당 분반 관리">
        {(
          [
            ["students", "이 분반", "👥 수강생 현황", `${section.name} 학생의 진도 · 퀴즈 결과 · 피드백`, "section"],
            ["lessons", "강의 공통", "📚 주차별 학습자료", `${weekRangeLabel(course.weekCount) ?? "주차별"} 편집 · 공개 · 모든 분반 공유`, "course"],
          ] as [Tab, string, string, string, string][]
        ).map(([key, scope, label, sub, tone]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`learn-tab ${tone} ${tab === key ? "active" : ""}`}
            onClick={() => go({ tab: key })}
          >
            <span className="scope-kicker">{scope}</span>
            <b>{label}</b>
            <small>{sub}</small>
          </button>
        ))}
      </div>

      {tab === "students" ? (
        <div className="scope-panel section">
          {/* 학습 피드백은 운영 중인 분반에서만 쓴다. (서버도 운영 중인 담당 분반인지 다시 확인한다) */}
          <CourseStudentsPanel
            key={section.id}
            courseId={course.id}
            sectionId={section.id}
            weekCount={course.weekCount}
            feedback={section.status === "active" ? { lessons } : undefined}
          />
        </div>
      ) : (
        <div className="scope-panel course">
          <SharedLessonNote />
          <CourseLessonsTable courseId={course.id} weekCount={course.weekCount} lessons={lessons} sectionId={section.id} />
          {/* 추가 자료 편집: 이 과목에 운영 중인 담당 분반이 있을 때 (서버도 같은 기준으로 다시 확인한다) */}
          <CourseMaterials
            courseId={course.id}
            weekCount={course.weekCount}
            editable={course.sections.some((s) => s.status === "active")}
          />
        </div>
      )}
    </div>
  );
};

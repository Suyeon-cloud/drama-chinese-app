// 교수자(Google 로그인) 화면: 내 담당 강의(분반) → 담당 분반(수강생 현황 · 주차별 학습자료)
// 담당 분반은 관리자가 ‘분반·교강사 관리’에서 정한다. 서버가 담당 분반 수강생의 데이터만 보내므로 다른 분반 학생은 볼 수 없다.
// 학습자료는 과목 공통이라, 같은 과목의 다른 분반 교강사와 같은 15주를 함께 관리한다.
import React from "react";
import { useAuth } from "../../auth/AuthContext";
import { navigate } from "../../router";
import { useLessons, useStaffCourses } from "../../store/hooks";
import { PageIntro } from "./AdminShared";
import {
  CourseLessonsTable,
  CourseStudentsPanel,
  CourseTabs,
  JoinLinkBox,
  SectionCard,
  operatingCourses,
} from "./CourseAdminShared";

/** 내 담당 강의: 담당 분반 카드 */
export const InstructorHomeView: React.FC = () => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  if (!courses) return null;
  const mine = operatingCourses(courses).flatMap((c) => c.sections.map((s) => ({ course: c, section: s })));

  return (
    <div className="page">
      <PageIntro
        title="내 담당 강의"
        desc={`${user?.name ?? "교수자"}님이 담당하는 분반이에요. 분반 수강생의 학습 진행과 과목 공통 주차별 학습자료를 관리해요.`}
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
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
};

type Tab = "students" | "lessons";

/** 담당 분반: 수강생 현황(그 분반만) / 주차별 학습자료(과목 공통) */
export const InstructorCourseView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  const lessons = useLessons();
  if (!courses || !lessons) return null;
  const course = operatingCourses(courses).find((c) => c.id === params.get("id"));
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
      <button className="link-btn back-link" onClick={() => navigate("teach")}>
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
        <JoinLinkBox code={section.code} label={`《${course.drama}》 ${section.name}`} />
      </SectionCard>

      <div className="learn-tabs sub-tabs" role="tablist" aria-label="담당 분반 관리">
        {(
          [
            ["students", "👥 수강생 현황", `${section.name} · 진도 · 완료 주차 · 퀴즈 결과`],
            ["lessons", "📚 주차별 학습자료", "과목 공통 1~15주 편집 · 공개"],
          ] as [Tab, string, string][]
        ).map(([key, label, sub]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`learn-tab ${tab === key ? "active" : ""}`}
            onClick={() => go({ tab: key })}
          >
            <b>{label}</b>
            <small>{sub}</small>
          </button>
        ))}
      </div>

      {tab === "students" ? (
        <CourseStudentsPanel key={section.id} courseId={course.id} sectionId={section.id} weekCount={course.weekCount} />
      ) : (
        <>
          <p className="scope-note">
            📚 학습자료는 《{course.drama}》의 모든 분반이 함께 쓰는 공통 콘텐츠예요. 고치면 같은 과목의 다른 분반에도
            반영돼요.
          </p>
          <CourseLessonsTable courseId={course.id} lessons={lessons} />
        </>
      )}
    </div>
  );
};

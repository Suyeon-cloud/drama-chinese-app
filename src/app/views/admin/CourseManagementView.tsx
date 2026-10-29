import React from "react";
import { LEGACY_COURSE_ID } from "../../../content/courses";
import { useAuth } from "../../auth/AuthContext";
import { navigate } from "../../router";
import { useLessons, useStaffCourses } from "../../store/hooks";
import { PageIntro } from "./AdminShared";
import { CourseLessonsTable, CourseOverviewCard, CourseTabs, operatingCourses } from "./CourseAdminShared";

/**
 * 전체 강의·학습자료 (관리자): 운영 3과목의 1~15주 학습자료를 과목별로 관리한다.
 * 기존 자료(3과목 개편 전)는 마지막 탭에서만 보이고 운영 과목과 섞이지 않는다.
 */
export const CourseManagementView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  const lessons = useLessons();
  if (!courses || !lessons) return null;

  const operating = operatingCourses(courses);
  const legacy = courses.find((c) => c.id === LEGACY_COURSE_ID);
  const tabs = legacy ? [...operating, legacy] : operating;
  const active = tabs.find((c) => c.id === params.get("course")) ?? operating[0];
  if (!active) return null;

  return (
    <div className="page">
      <PageIntro
        title="전체 강의·학습자료"
        desc="운영 중인 3과목의 1~15주 학습자료를 과목별로 관리해요. 학습자료는 과목의 모든 분반이 함께 써요. 수준은 실제 대사를 확인한 뒤 HSK 1~6급으로 정해요."
      />
      <CourseTabs courses={tabs} active={active.id} onSelect={(id) => navigate("admin-course", { course: id })} />

      {active.id === LEGACY_COURSE_ID ? (
        <p className="scope-note">
          🗂 3과목 개편 전의 강의자료를 보관하는 곳이에요. 학생·교수자 화면에는 나오지 않고, 이 강의코드로는 수강 등록되지
          않아요.
        </p>
      ) : (
        <CourseOverviewCard course={active} showSections>
          <button className="link-btn" onClick={() => navigate("admin-instructors")}>
            분반·교강사 관리 ›
          </button>
        </CourseOverviewCard>
      )}

      <CourseLessonsTable courseId={active.id} lessons={lessons} />
    </div>
  );
};

import React from "react";
import { useAuth } from "../../auth/AuthContext";
import { navigate } from "../../router";
import { useStaffCourses } from "../../store/hooks";
import { PageIntro } from "./AdminShared";
import { CourseStudentsPanel, CourseTabs, operatingCourses } from "./CourseAdminShared";

/**
 * 학습 현황 (관리자): 운영 과목별 · 분반별 수강생의 출석·주차 진도·퀴즈.
 * ‘전체’는 과목의 모든 분반을 분반 표시와 함께 보여준다. 과목끼리 기록이 섞이지 않는다.
 */
export const ProgressView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  if (!courses) return null;
  const operating = operatingCourses(courses);
  const active = operating.find((c) => c.id === params.get("course")) ?? operating[0];
  if (!active) return null;
  const section = active.sections.find((s) => s.id === params.get("section"));

  return (
    <div className="page">
      <PageIntro title="학습 현황" desc="과목·분반별 수강생의 학습 시작, 완료 주차, 영상 재생 정도, 퀴즈 결과를 확인해요." />
      <CourseTabs courses={operating} active={active.id} onSelect={(id) => navigate("admin-progress", { course: id })} />
      <div className="row-start section-filter" role="tablist" aria-label="분반">
        {[{ id: "", name: "전체" }, ...active.sections].map((s) => (
          <button
            key={s.id || "all"}
            role="tab"
            aria-selected={(section?.id ?? "") === s.id}
            className={`pill pill-btn ${(section?.id ?? "") === s.id ? "pill-sky" : "pill-cream"}`}
            onClick={() => navigate("admin-progress", s.id ? { course: active.id, section: s.id } : { course: active.id })}
          >
            {s.name}
            {"status" in s && s.status === "inactive" ? " (비활성)" : ""}
          </button>
        ))}
      </div>
      <CourseStudentsPanel
        key={`${active.id}:${section?.id ?? ""}`}
        courseId={active.id}
        sectionId={section?.id}
        weekCount={active.weekCount}
        highlight={params.get("learner")}
      />
    </div>
  );
};

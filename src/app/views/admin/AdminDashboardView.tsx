import React from "react";
import { useAuth } from "../../auth/AuthContext";
import { navigate } from "../../router";
import { useFeedbackDrafts, useInstructors, useLearners, useStaffCourses } from "../../store/hooks";
import { PageIntro } from "./AdminShared";
import { CourseOverviewCard, operatingCourses } from "./CourseAdminShared";

/** 전체 운영 관리 (관리자): 할 일(승인 대기) → 운영 수치 → 강의별 현황 */
export const AdminDashboardView: React.FC = () => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  const learners = useLearners();
  const instructors = useInstructors();
  const drafts = useFeedbackDrafts();
  if (!courses) return null;
  const operating = operatingCourses(courses);
  const pending = learners?.filter((l) => l.status === "pending").length ?? 0;

  const stats = [
    { label: "운영 강의", value: `${operating.length}개` },
    { label: "운영 분반", value: `${operating.reduce((n, c) => n + c.sections.filter((s) => s.status === "active").length, 0)}개` },
    { label: "교강사", value: `${instructors?.length ?? 0}명` },
    { label: "승인된 회원", value: `${learners?.filter((l) => l.status === "approved").length ?? 0}명` },
    { label: "수강 등록", value: `${operating.reduce((n, c) => n + c.enrolledCount, 0)}건` },
    {
      label: "공개 학습자료",
      value: `${operating.reduce((n, c) => n + c.publishedCount, 0)} / ${operating.reduce((n, c) => n + c.lessonCount, 0)}`,
    },
    { label: "피드백 초안", value: `${drafts?.length ?? 0}건` },
  ];

  return (
    <div className="page">
      <PageIntro title="전체 운영 관리" desc="《追剧学汉语》의 회원·교강사·운영 강의를 한눈에 확인해요." />

      <button
        className={`card admin-todo ${pending ? "has-todo" : ""}`}
        onClick={() => navigate("admin-learners")}
      >
        <span className="admin-todo-count">{pending}명</span>
        <span>
          <b>승인 대기 회원</b>
          <small className="muted">{pending ? "확인하고 승인해 주세요." : "지금 승인할 회원이 없어요."}</small>
        </span>
        <span className="link-btn">회원 관리 →</span>
      </button>

      <dl className="card admin-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="section-title">운영 강의</h3>
      <div className="course-admin-grid">
        {operating.map((c) => (
          <CourseOverviewCard key={c.id} course={c} showSections>
            <button className="btn btn-soft btn-sm" onClick={() => navigate("admin-course", { course: c.id })}>
              📚 학습자료
            </button>
            <button className="btn btn-soft btn-sm" onClick={() => navigate("admin-progress", { course: c.id })}>
              👥 수강생 현황
            </button>
            <button className="link-btn" onClick={() => navigate("admin-instructors", { course: c.id })}>
              분반·교강사 관리 ›
            </button>
          </CourseOverviewCard>
        ))}
      </div>
    </div>
  );
};

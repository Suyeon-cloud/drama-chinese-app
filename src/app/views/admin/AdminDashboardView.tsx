import React from "react";
import { useAuth } from "../../auth/AuthContext";
import { openMemberPopup } from "../../auth/memberPopup";
import { navigate, type ViewKey } from "../../router";
import { useFeedbackDrafts, useInstructors, useLearners, useStaffCourses } from "../../store/hooks";
import { PageIntro } from "./AdminShared";
import { CourseOverviewCard, operatingCourses } from "./CourseAdminShared";

const SHORTCUTS: { label: string; text: string; to: ViewKey }[] = [
  { label: "회원 관리", text: "가입 승인 · 회원 정보 · 수강 과목", to: "admin-learners" },
  { label: "분반·교강사 관리", text: "분반 개설 · 교강사 등록 · 담당 분반 배정", to: "admin-instructors" },
  { label: "학습 현황", text: "과목별 진도 · 완료 주차 · 퀴즈", to: "admin-progress" },
  { label: "피드백", text: "학습 결과 기반 피드백 작성", to: "admin-feedback" },
];

/** 전체 운영 관리 (관리자): 회원 · 교수자 · 운영 3과목 현황 */
export const AdminDashboardView: React.FC = () => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  const learners = useLearners();
  const instructors = useInstructors();
  const drafts = useFeedbackDrafts();
  if (!courses) return null;
  const operating = operatingCourses(courses);

  const tiles = [
    { icon: "👥", label: "회원 (승인 완료)", value: `${learners?.filter((l) => l.status === "approved").length ?? 0}명`, tone: "lavender" },
    { icon: "⏳", label: "승인 대기 회원", value: `${learners?.filter((l) => l.status === "pending").length ?? 0}명`, tone: "pink" },
    { icon: "🧑‍🏫", label: "등록된 교수자", value: `${instructors?.length ?? 0}명`, tone: "sky" },
    { icon: "🎬", label: "운영 과목", value: `${operating.length}개`, tone: "mint" },
    {
      icon: "🏫",
      label: "운영 분반",
      value: `${operating.reduce((n, c) => n + c.sections.filter((s) => s.status === "active").length, 0)}개`,
      tone: "sky",
    },
    { icon: "🎫", label: "수강 등록", value: `${operating.reduce((n, c) => n + c.enrolledCount, 0)}건`, tone: "cream" },
    { icon: "✉️", label: "피드백 초안", value: `${drafts?.length ?? 0}건`, tone: "pink" },
  ];

  return (
    <div className="page">
      <PageIntro title="전체 운영 관리" desc="《追剧学汉语》의 회원·교수자·운영 과목을 한눈에 확인해요.">
        <button className="btn btn-soft btn-sm" onClick={openMemberPopup}>
          👥 회원 현황
        </button>
      </PageIntro>

      <div className="admin-tiles">
        {tiles.map((t) => (
          <div key={t.label} className={`card summary-card tone-${t.tone}`}>
            <span className="stat-icon">{t.icon}</span>
            <small>{t.label}</small>
            <b>{t.value}</b>
          </div>
        ))}
      </div>

      <h3 className="section-title">운영 과목</h3>
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

      <div className="admin-shortcuts">
        {SHORTCUTS.map((s) => (
          <button key={s.to} className="card shortcut" onClick={() => navigate(s.to)}>
            <b>{s.label} →</b>
            <small className="muted">{s.text}</small>
          </button>
        ))}
      </div>
    </div>
  );
};

import React from "react";
import { useAuth } from "../../auth/AuthContext";
import { useAllEnrollments, useStaffCourses } from "../../store/hooks";
import { PageIntro } from "./AdminShared";
import { JoinLinkBox, operatingCourses } from "./CourseAdminShared";
import { EditorGroup } from "./EditorSection";
import { MemberTable } from "./MemberTable";

/** 회원 관리 (관리자): 가입 회원 확인 · 승인 · 수정 · 삭제를 한 표에서 한다. */
export const LearnersView: React.FC = () => {
  const { user } = useAuth();
  const enrollments = useAllEnrollments();
  const courses = useStaffCourses(user?.id ?? null);
  if (!enrollments || !courses) return null;
  const operating = operatingCourses(courses);

  return (
    <div className="page">
      <PageIntro
        title="회원 관리"
        desc="Google로 가입한 회원을 확인하고 승인해요. 승인된 학생은 강의코드로 분반에 수강 등록해요."
      />

      <MemberTable enrollments={enrollments} courses={operating} />

      <EditorGroup title="🎫 분반 강의코드" defaultOpen={false}>
        <p className="muted small">
          학생은 승인 후 자기 분반의 강의코드를 ‘내 강의’에 입력하거나 참여 링크로 들어와 수강 등록해요. 운영 중인 분반만
          보여요.
        </p>
        <div className="join-code-list">
          {operating.flatMap((c) =>
            c.sections
              .filter((s) => s.status === "active")
              .map((s) => (
                <div key={s.id} className="join-code-item">
                  <span>
                    <b>《{c.drama}》</b> <span className="muted small">{c.title} · {s.name}</span>
                  </span>
                  <span className="code-chip">{s.code}</span>
                  <JoinLinkBox code={s.code} label={`《${c.drama}》 ${s.name}`} />
                </div>
              )),
          )}
        </div>
      </EditorGroup>
      <p className="muted small legend">교강사는 ‘분반·교강사 관리’에서 관리해요. 교강사 계정은 회원 목록에 나오지 않아요.</p>
    </div>
  );
};

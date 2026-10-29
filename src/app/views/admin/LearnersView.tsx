import React from "react";
import { Avatar } from "../../auth/AuthControls";
import { useAuth } from "../../auth/AuthContext";
import { openMemberPopup } from "../../auth/memberPopup";
import { formatDateTime } from "../../lib/format";
import { navigate } from "../../router";
import { useAllEnrollments, useLearners, useStaffCourses } from "../../store/hooks";
import { PageIntro } from "./AdminShared";
import { JoinLinkBox, operatingCourses } from "./CourseAdminShared";

/** 회원 관리 (관리자): 가입 회원 · 승인 상태 · 역할 · 수강 과목. 승인·수정·삭제는 ‘회원 현황’에서 한다. */
export const LearnersView: React.FC = () => {
  const { user } = useAuth();
  const learners = useLearners();
  const enrollments = useAllEnrollments();
  const courses = useStaffCourses(user?.id ?? null);
  if (!learners || !enrollments || !courses) return null;
  const operating = operatingCourses(courses);
  const pending = learners.filter((l) => l.status === "pending").length;

  return (
    <div className="page">
      <PageIntro
        title="회원 관리"
        desc="Google로 가입한 회원과 승인 상태를 확인해요. 승인된 학생은 강의코드로 과목에 바로 수강 등록해요."
      >
        <button className="btn btn-primary btn-sm" onClick={openMemberPopup}>
          👥 회원 현황 · 승인 {pending ? `(대기 ${pending}명)` : ""}
        </button>
      </PageIntro>

      <section className="card join-link-card">
        <h3 className="card-title">🎫 분반 강의코드</h3>
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
      </section>

      {learners.length === 0 ? (
        <div className="card empty">
          <span>👥</span>
          <p>아직 가입한 회원이 없어요. 학습자가 Google로 로그인하면 여기에 표시돼요.</p>
        </div>
      ) : (
        <section className="card data-table">
          <h3 className="card-title">전체 회원 {learners.length}명</h3>
          <table>
            <thead>
              <tr>
                <th>회원</th>
                <th>대학 · 학과</th>
                <th>역할</th>
                <th>승인</th>
                <th>수강 과목 · 분반</th>
                <th>가입일</th>
                <th>최종 접속</th>
              </tr>
            </thead>
            <tbody>
              {learners.map((l) => {
                // 수강 중인 과목 · 분반
                const mine = enrollments.flatMap((e) => {
                  if (e.userId !== l.id || !e.sectionId) return [];
                  const c = operating.find((x) => x.id === e.courseId);
                  const s = c?.sections.find((x) => x.id === e.sectionId);
                  return c && s ? [{ c, s }] : [];
                });
                return (
                  <tr key={l.id}>
                    <td>
                      <span className="who">
                        <Avatar name={l.name} color={l.avatarColor} src={l.picture} size={30} />
                        <span>
                          <b>{l.name || "(이름 미입력)"}</b>
                          <small className="muted block">{l.googleEmail}</small>
                        </span>
                      </span>
                    </td>
                    <td className="muted">{l.university ? `${l.university} · ${l.department}` : "—"}</td>
                    <td>학습자</td>
                    <td>
                      {l.status === "approved" ? (
                        <span className="pill pill-mint">승인</span>
                      ) : (
                        <span className="pill pill-cream">대기</span>
                      )}
                    </td>
                    <td>
                      {mine.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="row-start">
                          {mine.map(({ c, s }) => (
                            <button
                              key={s.id}
                              className="pill pill-sky pill-btn"
                              onClick={() =>
                                navigate("admin-progress", { course: c.id, section: s.id, learner: l.id })
                              }
                              title="이 분반의 학습 현황"
                            >
                              {c.title} · {s.name}
                            </button>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="tabular">{formatDateTime(l.firstSeenAt)}</td>
                    <td className="tabular">{formatDateTime(l.lastSeenAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small legend">교강사는 ‘분반·교강사 관리’에서 관리해요. 교강사 계정은 회원 목록에 나오지 않아요.</p>
        </section>
      )}
    </div>
  );
};

import React from "react";
import { useAuth } from "../auth/AuthContext";
import { navigate } from "../router";
import { useLessons, useMyCourses, useUserProgress } from "../store/hooks";
import { LandingContent } from "./LandingView";
import { MyCoursesSection, courseStats } from "./MyCoursesView";

/** 승인된 학생의 홈: 이어서 학습할 주차 + 내 강의 (강의코드 등록 포함) */
const StudentHome: React.FC<{ userId: string; name: string }> = ({ userId, name }) => {
  const courses = useMyCourses(userId);
  const lessons = useLessons();
  const progress = useUserProgress(userId);

  // 가장 최근에 학습한 과목을 앞에 두고, 이어서 학습할 주차를 고른다.
  const lastStudied = (courseId: string) =>
    (progress ?? [])
      .filter((p) => lessons?.some((l) => l.id === p.lessonId && l.courseId === courseId))
      .reduce((latest, p) => ((p.lastStudiedAt ?? "") > latest ? (p.lastStudiedAt ?? "") : latest), "");
  const next = [...(courses ?? [])]
    .sort((a, b) => lastStudied(b.id).localeCompare(lastStudied(a.id)))
    .map((c) => ({ course: c, stats: courseStats(c.id, lessons ?? [], progress ?? []) }))
    .find((x) => x.stats.next);

  return (
    <div className="page">
      <div className="page-intro">
        <h2>{name}님, 오늘은 어떤 장면을 볼까요?</h2>
      </div>

      {next?.stats.next ? (
        <section className="card continue-card">
          <div className="continue-body">
            <small className="muted">{next.stats.nextStarted ? "이어서 학습하기" : "다음 학습"}</small>
            <h3>
              {next.stats.next.week}주차 · {next.stats.next.title}
            </h3>
            <p className="muted">
              《{next.course.drama}》 {next.course.title}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate("lesson", { lesson: next.stats.next!.id })}>
            ▶ {next.stats.nextStarted ? "이어서 학습하기" : "학습 시작하기"}
          </button>
        </section>
      ) : null}

      <h3 className="section-title home-section-title">내 강의</h3>
      <MyCoursesSection />
    </div>
  );
};

/** 로그인 후 홈. 학생은 학습 중심 화면, 교수자·관리자는 서비스 소개와 자기 화면으로 가는 버튼 */
export const HomeView: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === "learner") return <StudentHome userId={user.id} name={user.name} />;
  return (
    <LandingContent
      cta={
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate(user?.provider === "admin" ? "admin" : "teach")}
        >
          {user?.provider === "admin" ? "전체 운영 관리로" : "내 담당 강의로"}
        </button>
      }
    />
  );
};

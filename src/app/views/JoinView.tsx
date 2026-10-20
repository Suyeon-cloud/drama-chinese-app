import React, { useEffect, useState } from "react";
import { COURSE_PHASES } from "../../content/course";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { navigate } from "../router";
import { JOIN_SCOPE_NOTE, courseStore, enrollmentStore } from "../store";
import { normalizeCourseCode } from "../store/courseStore";
import { useEnrollments } from "../store/hooks";
import type { CourseInfo } from "../store/models";

/**
 * 학생 참여 링크(#/join/{courseCode}) 화면.
 * 로그인하지 않았으면 Google 로그인을 요청하고, 로그인 후 학습자로 수업에 참여한다.
 * 로컬 프로토타입이므로 수업 정보가 저장된 이 브라우저에서만 참여 코드를 찾을 수 있다.
 */
export const JoinView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const code = normalizeCourseCode(params.get("code") ?? "");
  const { user, signIn, pending } = useAuth();
  const toast = useToast();
  const [course, setCourse] = useState<CourseInfo | null | undefined>(undefined);
  const [joining, setJoining] = useState(false);
  const enrollments = useEnrollments(course ? course.code : null);

  useEffect(() => {
    let alive = true;
    void courseStore.findByCode(code).then((c) => alive && setCourse(c));
    return () => {
      alive = false;
    };
  }, [code]);

  if (course === undefined) return null;

  if (!course) {
    return (
      <div className="page">
        <div className="card login-gate">
          <span className="gate-emoji">🔗</span>
          <h2>수업을 찾을 수 없어요</h2>
          <p className="muted">
            참여 코드 <b>{code || "(없음)"}</b>에 해당하는 수업 정보가 이 브라우저에 없어요.
          </p>
          <p className="scope-note">ℹ️ {JOIN_SCOPE_NOTE}</p>
          <button className="btn btn-soft" onClick={() => navigate("home")}>
            홈으로
          </button>
        </div>
      </div>
    );
  }

  const enrolled = !!user && !!enrollments?.some((e) => e.userId === user.id);

  const join = async () => {
    setJoining(true);
    try {
      const u = user ?? (await signIn());
      if (!u) return;
      if (u.role === "instructor") {
        toast.show("교수자 계정은 수업에 참여하지 않아도 돼요.", "info");
        navigate("admin");
        return;
      }
      await enrollmentStore.enroll({ courseCode: course.code, userId: u.id, name: u.name, email: u.email });
      toast.show("수업에 참여했어요.", "success");
      navigate("weeks");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="page">
      <div className="card login-gate join-card">
        <span className="gate-emoji">🎓</span>
        <span className="pill pill-sky">수업 참여</span>
        <h2>{course.title}</h2>
        <ul className="join-phases">
          {COURSE_PHASES.map((p) => (
            <li key={p.title}>
              <b>{p.title}</b> {p.subtitle}
            </li>
          ))}
        </ul>
        <p className="muted small">참여 코드 {course.code}</p>
        {enrolled ? (
          <>
            <p>이미 참여 중인 수업이에요.</p>
            <button className="btn btn-primary" onClick={() => navigate("weeks")}>
              주차별 학습으로 →
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              {user ? `${user.name}님, 학습자로 이 수업에 참여할까요?` : "Google 계정으로 로그인하면 이 수업에 참여할 수 있어요."}
            </p>
            <button className="btn btn-primary" onClick={() => void join()} disabled={pending || joining}>
              {pending ? "로그인 중…" : user ? "수업 참여하기" : "Google로 로그인하고 참여하기"}
            </button>
          </>
        )}
        <p className="scope-note">ℹ️ {JOIN_SCOPE_NOTE}</p>
      </div>
    </div>
  );
};

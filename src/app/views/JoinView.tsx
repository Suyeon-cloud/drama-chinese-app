import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { ApiError } from "../lib/api";
import { navigate } from "../router";
import { courseStore, enrollmentStore } from "../store";
import { normalizeCourseCode } from "../store/courseStore";
import { useMyCourses } from "../store/hooks";
import type { CourseLookup } from "../store/models";

/**
 * 학생 참여 링크(#/join/{강의코드}) 화면.
 * 로그인하지 않았으면 Google 로그인을 요청하고, 관리자 승인을 받은 학습자는 바로 그 과목에 수강 등록된다.
 */
export const JoinView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const code = normalizeCourseCode(params.get("code") ?? "");
  const { user, signIn, pending } = useAuth();
  const toast = useToast();
  const [course, setCourse] = useState<CourseLookup | null | undefined>(undefined);
  const [joining, setJoining] = useState(false);
  const myCourses = useMyCourses(user?.role === "learner" ? user.id : null);

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
          <h2>강의를 찾을 수 없어요</h2>
          <p className="muted">
            강의코드 <b>{code || "(없음)"}</b>에 해당하는 강의가 없어요. 링크를 다시 확인해 주세요.
          </p>
          <button className="btn btn-soft" onClick={() => navigate("weeks")}>
            내 강의로
          </button>
        </div>
      </div>
    );
  }

  const enrolled = !!myCourses?.some((c) => c.id === course.id);

  const join = async () => {
    setJoining(true);
    try {
      const u = user ?? (await signIn());
      if (!u) return;
      if (u.role === "instructor") {
        toast.show("교수자 계정은 수강 등록하지 않아도 돼요.", "info");
        navigate(u.provider === "admin" ? "admin" : "teach");
        return;
      }
      const { section, alreadyEnrolled } = await enrollmentStore.enroll(code);
      toast.show(
        alreadyEnrolled
          ? `이미 수강 중인 강의예요. 《${course.drama}》 ${section.name}`
          : `《${course.drama}》 ${course.title} ${section.name} 수강 등록을 마쳤어요!`,
        alreadyEnrolled ? "info" : "success",
      );
      navigate("course", { id: course.id });
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "수강 등록에 실패했어요.", "error");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="page">
      <div className="card login-gate join-card">
        <span className="gate-emoji">🎬</span>
        <span className="pill pill-sky">수강 등록</span>
        <h2>
          《{course.drama}》 {course.title} · {course.sectionName}
        </h2>
        <p className="muted">{course.description}</p>
        <p className="muted small">
          {course.weekCount}주 과정 · 강의코드 {code}
        </p>
        {enrolled ? (
          <>
            <p>이미 수강 중인 강의예요.</p>
            <button className="btn btn-primary" onClick={() => navigate("course", { id: course.id })}>
              과목 들어가기 →
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              {user ? `${user.name}님, 이 강의를 수강할까요?` : "Google 계정으로 로그인하면 이 강의를 수강할 수 있어요."}
            </p>
            <button className="btn btn-primary" onClick={() => void join()} disabled={pending || joining}>
              {pending ? "로그인 중…" : user ? "수강 등록하기" : "Google로 로그인하고 수강하기"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

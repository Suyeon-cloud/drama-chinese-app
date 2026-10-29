import React, { useState } from "react";
import { COURSE_SEEDS } from "../../content/courses";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { ApiError } from "../lib/api";
import { navigate } from "../router";
import { enrollmentStore } from "../store";
import { useMyCourses } from "../store/hooks";
import type { CourseSummary } from "../store/models";

/** 과목 카드 색: 과목 순서대로 하늘·분홍·민트 */
const TONES = ["sky", "pink", "mint"];
export const courseTone = (courseId: string) => TONES[Math.max(0, COURSE_SEEDS.findIndex((c) => c.id === courseId)) % TONES.length];

/** 수강 중인 드라마 과목 카드 */
const CourseCard: React.FC<{ course: CourseSummary }> = ({ course }) => (
  <button
    className={`card course-card tone-${courseTone(course.id)}`}
    onClick={() => navigate("course", { id: course.id })}
  >
    <span className="course-cover">
      <span className="course-drama">《{course.drama}》</span>
      <span className="course-name">{course.title}</span>
    </span>
    <span className="course-body">
      <span className="course-desc">{course.description}</span>
      <small className="muted">{course.context}</small>
      <span className="course-foot">
        <span className="pill pill-cream">{course.weekCount}주 과정</span>
        <span className="course-go">
          과목 들어가기 <Icon name="arrow" size={16} />
        </span>
      </span>
    </span>
  </button>
);

/** 강의코드 입력 → 수강 등록 (기존 수강 등록 API) */
const CourseCodeForm: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { course, alreadyEnrolled } = await enrollmentStore.enroll(code);
      setCode("");
      toast.show(
        alreadyEnrolled ? `이미 수강 중인 강의예요. 《${course.drama}》` : `《${course.drama}》 ${course.title} 수강 등록을 마쳤어요!`,
        alreadyEnrolled ? "info" : "success",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "수강 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`code-form ${compact ? "" : "card"}`} onSubmit={(e) => void submit(e)}>
      {compact ? null : (
        <div>
          <h3 className="card-title">🎫 강의코드로 과목 추가</h3>
          <p className="muted small">선생님께 받은 6자리 강의코드를 입력하면 바로 ‘내 강의’에 추가돼요.</p>
        </div>
      )}
      <div className="code-row">
        <input
          className="code-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/\s/g, ""));
            setError(null);
          }}
          maxLength={12}
          placeholder="강의코드 6자리"
          aria-label="강의코드"
          aria-invalid={!!error}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>
          {busy ? "확인 중…" : "수강 등록"}
        </button>
      </div>
      {error ? (
        <p className="field-error small" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
};

/** 학습자의 ‘내 강의’: 수강 중인 과목 카드 + 강의코드 등록. 수강하지 않은 과목·기존 자료는 나오지 않는다. */
export const MyCoursesSection: React.FC = () => {
  const { user } = useAuth();
  const courses = useMyCourses(user?.role === "learner" ? user.id : null);

  if (user?.role === "instructor") {
    return (
      <div className="card empty">
        <span>🧑‍🏫</span>
        <p>교수자 계정은 ‘수업 관리’에서 과목별 강의자료를 확인해요.</p>
        <button className="btn btn-soft btn-sm" style={{ marginTop: 12 }} onClick={() => navigate("admin-course")}>
          수업 관리로
        </button>
      </div>
    );
  }
  if (!courses) return null;

  if (courses.length === 0) {
    return (
      <div className="card course-empty">
        <span className="gate-emoji">🎬</span>
        <h3>아직 등록한 강의가 없어요</h3>
        <p className="muted">
          강의코드를 입력하면 중국 드라마로 배우는 중국어 과목이 ‘내 강의’에 추가돼요.
          <br className="br-desktop" />
          선생님께 받은 6자리 코드를 입력해 학습을 시작해 보세요.
        </p>
        <CourseCodeForm compact />
      </div>
    );
  }

  return (
    <>
      <div className="course-grid">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
      <CourseCodeForm />
    </>
  );
};

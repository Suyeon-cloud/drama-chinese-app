import React, { useState } from "react";
import { isValidEmail, normalizeEmail } from "../../auth/roles";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { weekCountLabel } from "../../../content/courseWeeks";
import { formatDateTime } from "../../lib/format";
import { navigate } from "../../router";
import { courseStore, instructorStore } from "../../store";
import { useInstructors, useStaffCourses } from "../../store/hooks";
import type { CourseOverview, InstructorRecord, SectionOverview } from "../../store/models";
import { PageIntro } from "./AdminShared";
import { CourseStatusPill, CourseTabs, JoinLinkBox, SectionStatusPill, teacherLabel, visibleCourses } from "./CourseAdminShared";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** 다음 분반 이름 제안: 01분반, 02분반 … 중 비어 있는 다음 번호 (서버도 같은 규칙) */
const nextSectionName = (course: CourseOverview) => {
  const names = new Set(course.sections.map((s) => s.name));
  let n = 1;
  while (names.has(`${String(n).padStart(2, "0")}분반`)) n++;
  return `${String(n).padStart(2, "0")}분반`;
};

/** 교강사 이름 (이 분반 정보에 이름이 있으면) */
const nameOf = (courses: CourseOverview[], email: string) =>
  courses.flatMap((c) => c.sections.flatMap((s) => s.instructors)).find((t) => t.email === email && t.name)?.name;

/** 교강사 체크 목록 (배정·해제 또는 개설할 분반의 교강사 선택) */
const TeacherChecks: React.FC<{
  instructors: InstructorRecord[];
  checked: (email: string) => boolean;
  onToggle: (email: string) => void;
  disabled?: boolean;
  label: (email: string) => string;
}> = ({ instructors, checked, onToggle, disabled, label }) =>
  instructors.length === 0 ? (
    <p className="muted small">등록된 교강사가 없어요. 아래 교강사 명부에서 이메일을 먼저 등록해 주세요.</p>
  ) : (
    <div className="teacher-checks">
      {instructors.map((i) => (
        <label key={i.email} className="assign-check">
          <input type="checkbox" checked={checked(i.email)} disabled={disabled} onChange={() => onToggle(i.email)} />
          {label(i.email)}
        </label>
      ))}
    </div>
  );

/** 분반 카드: 이름 · 상태 · 강의코드 · 수강생 · 담당 교강사 배정/해제 · 비활성화 */
const SectionAdminCard: React.FC<{
  course: CourseOverview;
  section: SectionOverview;
  instructors: InstructorRecord[];
  label: (email: string) => string;
}> = ({ course, section, instructors, label }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const assigned = new Set(section.instructors.map((t) => t.email));

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(true);
    try {
      await fn();
      toast.show(ok, "success");
      return true;
    } catch (err) {
      toast.show(errorText(err, fail), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleTeacher = (email: string) =>
    void (assigned.has(email)
      ? run(() => courseStore.unassignSection(section.id, email), `${section.name}에서 ${email} 배정을 해제했어요.`, "배정을 해제하지 못했어요.")
      : run(() => courseStore.assignSection(section.id, email), `${section.name}에 ${email}을(를) 배정했어요.`, "배정하지 못했어요."));

  const saveName = async () => {
    const name = renaming?.trim() ?? "";
    if (!name || name === section.name) return setRenaming(null);
    if (await run(() => courseStore.updateSection(section.id, { name }), `분반 이름을 ${name}(으)로 바꿨어요.`, "이름을 바꾸지 못했어요.")) {
      setRenaming(null);
    }
  };

  const nextStatus = section.status === "active" ? "inactive" : "active";

  return (
    <section className={`card section-admin-card ${section.status === "inactive" ? "is-inactive" : ""}`}>
      <div className="section-admin-head">
        {renaming === null ? (
          <h4>
            {section.name}{" "}
            <button className="link-btn" onClick={() => setRenaming(section.name)} disabled={busy}>
              이름 바꾸기
            </button>
          </h4>
        ) : (
          <form
            className="rename-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={40} aria-label="분반 이름" />
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
              저장
            </button>
            <button className="btn btn-soft btn-sm" type="button" onClick={() => setRenaming(null)}>
              취소
            </button>
          </form>
        )}
        <SectionStatusPill status={section.status} />
      </div>
      <div className="section-block">
        <h5>분반 정보</h5>
        <dl className="section-card-stats">
          <div>
            <dt>강의코드</dt>
            <dd className="code-chip">{section.code}</dd>
          </div>
          <div>
            <dt>수강생</dt>
            <dd>{section.enrolledCount}명</dd>
          </div>
        </dl>
        {course.status === "active" ? (
          <JoinLinkBox code={section.code} label={`《${course.drama}》 ${section.name}`} />
        ) : (
          <p className="muted small">신규 수강이 마감된 강의라 참여 링크를 쓰지 않아요.</p>
        )}
        <div className="row-start">
          <button
            className={`btn btn-sm ${nextStatus === "inactive" ? "btn-quiet" : "btn-primary"}`}
            disabled={busy}
            onClick={() =>
              void run(
                () => courseStore.updateSection(section.id, { status: nextStatus }),
                nextStatus === "inactive"
                  ? `${section.name}을 비활성화했어요. 새 수강 등록만 막고 기존 수강·기록은 그대로예요.`
                  : `${section.name}을 다시 운영해요.`,
                "상태를 바꾸지 못했어요.",
              )
            }
          >
            {nextStatus === "inactive" ? "분반 비활성화" : "다시 운영"}
          </button>
          <button
            className="link-btn"
            onClick={() => navigate("admin-progress", { course: course.id, section: section.id })}
          >
            학습 현황 ›
          </button>
        </div>
        <small className="muted">
          {nextStatus === "inactive"
            ? "비활성화는 삭제가 아니에요. 수강생과 학습 기록은 그대로 두고 새 강의코드 등록만 막아요."
            : "비활성 상태예요. 수강생과 학습 기록은 그대로이고 새 강의코드 등록만 막혀 있어요."}
        </small>
      </div>
      <div className="section-block">
        <h5>
          담당 교강사 <span className="muted small">{section.instructors.length}명 · 체크하면 바로 반영돼요</span>
        </h5>
        {section.instructors.length ? (
          <p className="small muted">{section.instructors.map(teacherLabel).join(", ")}</p>
        ) : (
          <p className="small muted">아직 배정되지 않았어요</p>
        )}
        <TeacherChecks
          instructors={instructors}
          checked={(email) => assigned.has(email)}
          onToggle={toggleTeacher}
          disabled={busy}
          label={label}
        />
      </div>
    </section>
  );
};

/** 새 분반 개설: 분반명(제안) + 담당 교강사 → 강의코드는 서버가 자동 생성 */
const NewSectionCard: React.FC<{
  course: CourseOverview;
  instructors: InstructorRecord[];
  label: (email: string) => string;
}> = ({ course, instructors, label }) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [teachers, setTeachers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setName(nextSectionName(course));
    setTeachers([]);
    setError(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await courseStore.createSection(course.id, { name: name.trim(), instructors: teachers });
      toast.show(`《${course.drama}》 ${s.name}을 개설했어요. 강의코드 ${s.code}`, "success");
      setOpen(false);
    } catch (err) {
      setError(errorText(err, "분반을 개설하지 못했어요."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="card section-new-btn" onClick={start}>
        <b>+ 새 분반 개설</b>
        <small className="muted">
          {`강의코드는 자동으로 만들어지고, 이 강의의 ${weekCountLabel(course.weekCount) ?? "주차별"} 학습자료를 함께 써요.`}
        </small>
      </button>
    );
  }

  return (
    <form className="card section-admin-card section-new-form" onSubmit={(e) => void submit(e)}>
      <h4>새 분반 개설 · 《{course.drama}》</h4>
      <label className="field">
        <span>분반명</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: 02분반" />
      </label>
      <div>
        <p className="small section-admin-label">
          <b>담당 교강사</b> <span className="muted">(여러 명 선택 가능, 나중에 바꿀 수 있어요)</span>
        </p>
        <TeacherChecks
          instructors={instructors}
          checked={(email) => teachers.includes(email)}
          onToggle={(email) =>
            setTeachers((t) => (t.includes(email) ? t.filter((x) => x !== email) : [...t, email]))
          }
          label={label}
        />
      </div>
      <p className="muted small">강의코드: 개설하면 자동으로 만들어져요.</p>
      {error ? (
        <p className="field-error small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !name.trim()}>
          {busy ? "개설 중…" : "개설"}
        </button>
        <button className="btn btn-soft btn-sm" type="button" onClick={() => setOpen(false)}>
          취소
        </button>
      </div>
    </form>
  );
};

/**
 * 분반·교강사 관리 (관리자): 교강사 Google 이메일 등록 · 해제, 과목별 분반 개설 · 이름 변경 · 비활성화, 분반 교강사 배정 · 해제.
 * 교강사는 학생과 같은 Google 로그인을 쓰고, 배정된 분반의 수강생과 그 과목 공통 학습자료만 관리한다.
 * 교강사 1명이 여러 분반을, 분반 1개를 여러 교강사가 맡을 수 있다.
 */
export const InstructorsView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const instructors = useInstructors();
  const courses = useStaffCourses(user?.id ?? null);
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!instructors || !courses || !user) return null;
  // 운영 + 비활성 과목 (비활성 과목의 기존 분반에도 교강사를 배정할 수 있다)
  const operating = visibleCourses(courses);
  const active = operating.find((c) => c.id === params.get("course")) ?? operating[0];
  const label = (e: string) => {
    const n = nameOf(operating, e);
    return n ? `${n} (${e})` : e;
  };

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const value = normalizeEmail(email);
    if (!isValidEmail(value)) {
      setError("올바른 이메일 주소를 입력해 주세요.");
      return;
    }
    if (instructors.some((i) => i.email === value)) {
      setError("이미 등록된 교강사예요.");
      return;
    }
    await instructorStore.add(value);
    setEmail("");
    setError(null);
    toast.show(`${value}을(를) 교강사로 등록했어요. 위 분반에서 담당으로 배정해 주세요.`, "success");
  };

  return (
    <div className="page">
      <PageIntro
        title="분반·교강사 관리"
        desc="강의마다 분반을 개설하고 담당 교강사를 배정해요. 학생은 분반 강의코드로 수강 등록하고, 교강사는 담당 분반의 학생만 봐요."
      />

      {active ? (
        <>
          <p className="scope-note info">
            ℹ️ 같은 <b>강의</b>의 <b>분반</b>은 주차별 학습자료를 함께 써요. 분반은 그 강의를 실제로 운영하는 수업 단위이고, 수강생과
            담당 교강사는 분반마다 따로 관리해요.
          </p>
          <CourseTabs
            courses={operating}
            active={active.id}
            onSelect={(id) => navigate("admin-instructors", { course: id })}
          />
          <p className="course-branch">
            <b>
              {active.drama ? `《${active.drama}》 ` : ""}
              {active.title}
            </b>{" "}
            {active.status === "inactive" ? <CourseStatusPill status="inactive" /> : null}
            <span className="muted small">
              공통 학습자료 {active.lessonCount}개 · 분반 {active.sections.length}개 (운영 중{" "}
              {active.sections.filter((s) => s.status === "active").length}개)
            </span>
          </p>
          <div className="section-admin-grid">
            {active.sections.map((s) => (
              <SectionAdminCard key={s.id} course={active} section={s} instructors={instructors} label={label} />
            ))}
            {active.status === "active" ? (
              <NewSectionCard key={active.id} course={active} instructors={instructors} label={label} />
            ) : (
              <div className="card section-new-btn is-disabled" aria-disabled="true">
                <b>새 분반 개설 마감</b>
                <small className="muted">신규 수강이 마감된 강의라 새 분반을 만들 수 없어요. 기존 분반의 교강사 배정은 계속할 수 있어요.</small>
              </div>
            )}
          </div>
        </>
      ) : null}

      <h3 className="section-title">교강사 명부</h3>
      <section className="card">
        <form className="instructor-form" onSubmit={(e) => void add(e)}>
          <label className="field">
            <span>Google 이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="name@gmail.com"
              autoComplete="off"
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!email.trim()}>
            등록
          </button>
        </form>
        {error ? <p className="field-error small">{error}</p> : null}
        {instructors.length ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>교강사</th>
                  <th>담당 분반</th>
                  <th>등록</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {instructors.map((i) => {
                  const mine = operating.flatMap((c) =>
                    c.sections.filter((s) => s.instructors.some((t) => t.email === i.email)).map((s) => `${c.title} · ${s.name}`),
                  );
                  return (
                    <tr key={i.email}>
                      <td>
                        <b>{label(i.email)}</b>
                      </td>
                      <td className="small">{mine.length ? mine.join(", ") : <span className="muted">없음</span>}</td>
                      <td className="small nowrap">
                        {i.source === "env" ? "초기 설정 (.env)" : "교강사 관리"}
                        <small className="muted block">{formatDateTime(i.addedAt)}</small>
                      </td>
                      <td className="nowrap">
                        {i.source === "env" ? (
                          <span className="muted small">해제 불가</span>
                        ) : (
                          <button
                            className="link-btn danger"
                            onClick={() =>
                              void instructorStore
                                .remove(i.email)
                                .then(() => toast.show(`${i.email}의 교강사 등록을 해제했어요.`, "info"))
                            }
                          >
                            등록 해제
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

    </div>
  );
};

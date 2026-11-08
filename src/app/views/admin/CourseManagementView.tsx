import React, { useState } from "react";
import { COURSE_GROUPS, coursesInGroup, type CourseFormValues, type CourseGroup } from "../../../content/courseRules";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { navigate } from "../../router";
import { courseStore } from "../../store";
import { useLessons, useStaffCourses, useWeekMaterials } from "../../store/hooks";
import type { CourseOverview, CoursePatchInput } from "../../store/models";
import { PageIntro } from "./AdminShared";
import { CourseLessonsTable, CourseOverviewCard, CourseTabs, SharedLessonNote } from "./CourseAdminShared";
import { CourseForm, emptyCourseForm } from "./CourseForm";
import { WeekMaterialsPanel } from "./WeekMaterialsPanel";
import { LiveQuizEntry } from "../LiveQuizEditorView";

/** 서버 오류 문구(입력 오류 400·기존 자료 403·주차 축소 불가 409 등)를 그대로 보여 준다. */
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const isGroup = (v: string | null): v is CourseGroup => v === "active" || v === "inactive" || v === "legacy";

/** 과목 카드 아래 관리 동작: 정보 수정 · 비활성화/다시 운영 (확인 후). 기존 자료 과목에는 없다. */
const CourseActions: React.FC<{ course: CourseOverview; minWeekCount: number }> = ({ course, minWeekCount }) => {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const nextStatus = course.status === "active" ? "inactive" : "active";

  const save = async (v: CourseFormValues): Promise<string | null> => {
    const patch: CoursePatchInput = {};
    if (v.title !== course.title) patch.title = v.title;
    if (v.drama !== course.drama) patch.drama = v.drama;
    if (v.context !== course.context) patch.context = v.context;
    if (v.description !== course.description) patch.description = v.description;
    if (v.weekCount !== course.weekCount) patch.weekCount = v.weekCount;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return null;
    }
    try {
      await courseStore.updateCourse(course.id, patch);
      toast.show("강의 정보를 저장했어요. 학습자료·분반·수강 기록은 그대로예요.", "success");
      setEditing(false);
      return null;
    } catch (err) {
      return errorText(err, "강의 정보를 저장하지 못했어요.");
    }
  };

  const changeStatus = async () => {
    setBusy(true);
    try {
      await courseStore.updateCourse(course.id, { status: nextStatus });
      toast.show(
        nextStatus === "inactive"
          ? `《${course.drama || course.title}》을 비활성화했어요. ‘비활성 과목’에서 볼 수 있어요.`
          : `《${course.drama || course.title}》을 다시 운영해요. ‘운영 과목’으로 옮겼어요.`,
        "success",
      );
      setConfirming(false);
      // 상태에 맞는 묶음(탭)으로 이동한다.
      navigate("admin-course", { course: course.id });
    } catch (err) {
      toast.show(errorText(err, "강의 상태를 바꾸지 못했어요."), "error");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <CourseForm
        heading={`강의 정보 수정 · ${course.title}`}
        initial={{ title: course.title, drama: course.drama, context: course.context, description: course.description, weekCount: course.weekCount }}
        submitLabel="저장"
        minWeekCount={minWeekCount}
        onSubmit={save}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <div className="row-start course-actions-row">
        <button className="btn btn-soft btn-sm" onClick={() => setEditing(true)} disabled={busy}>
          ✏️ 정보 수정
        </button>
        <button
          className={`btn btn-sm ${nextStatus === "inactive" ? "btn-quiet" : "btn-primary"}`}
          onClick={() => setConfirming(true)}
          disabled={busy || confirming}
        >
          {nextStatus === "inactive" ? "비활성화" : "다시 운영"}
        </button>
      </div>
      {confirming ? (
        <div className="scope-note course-status-confirm" role="alertdialog" aria-label="강의 상태 변경 확인">
          <p>
            {nextStatus === "inactive"
              ? "이 강의를 비활성화할까요? 신규 수강 등록과 새 분반 개설이 막혀요. 기존 수강생의 학습·진도와 담당 교강사의 학습자료 편집은 그대로 계속돼요."
              : "이 강의를 다시 운영할까요? 운영 중인 분반의 강의코드로 신규 수강 등록이 다시 열려요."}
          </p>
          <div className="row-start">
            <button className="btn btn-primary btn-sm" onClick={() => void changeStatus()} disabled={busy}>
              {nextStatus === "inactive" ? "비활성화" : "다시 운영"}
            </button>
            <button className="btn btn-soft btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
              취소
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};

/**
 * 전체 강의·학습자료 (관리자): 강의 생성 · 정보 수정 · 비활성화와 강의별 주차 학습자료 관리.
 * 묶음: 운영 과목(active) · 비활성 과목(inactive) · 기존 자료(legacy). 기존 자료는 지금처럼 학습자료만 관리한다.
 */
export const CourseManagementView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const courses = useStaffCourses(user?.id ?? null);
  const lessons = useLessons();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const selected = courses?.find((c) => c.id === params.get("course"));
  const groupParam = params.get("group");
  const group: CourseGroup = selected && isGroup(selected.status) ? selected.status : isGroup(groupParam) ? groupParam : "active";
  const list = courses ? coursesInGroup(courses, group) : [];
  const active = selected && list.includes(selected) ? selected : list[0];
  // 주차별 추가 자료 (JSON·Supabase 공통). 주차 수 축소 하한에도 쓴다.
  const materials = useWeekMaterials(active?.id ?? "", true);
  if (!courses || !lessons) return null;

  const groupInfo = COURSE_GROUPS.find((g) => g.id === group)!;
  const materialWeeks = materials.state === "ready" ? materials.list.map((m) => m.week) : [];
  const maxLessonWeek = active
    ? Math.max(0, ...lessons.filter((l) => l.courseId === active.id).map((l) => l.week), ...materialWeeks)
    : 0;

  const create = async (v: CourseFormValues): Promise<string | null> => {
    try {
      const c = await courseStore.createCourse(v);
      toast.show(`《${c.drama || c.title}》 강의를 만들었어요. 분반은 ‘분반·교강사 관리’에서 개설해요.`, "success");
      setCreating(false);
      navigate("admin-course", { course: c.id });
      return null;
    } catch (err) {
      return errorText(err, "강의를 만들지 못했어요.");
    }
  };

  return (
    <div className="page">
      <PageIntro
        title="전체 강의·학습자료"
        desc="강의를 만들고, 강의별 주차 학습자료를 관리해요. 학습자료는 강의의 모든 분반이 함께 써요. 권장 학습 난이도는 실제 대사를 확인한 뒤 HSK 1~6급으로 정해요."
      >
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} disabled={creating}>
          + 새 강의
        </button>
      </PageIntro>

      {creating ? (
        <CourseForm
          heading="새 강의 만들기"
          initial={emptyCourseForm()}
          submitLabel="강의 만들기"
          onSubmit={create}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      <div className="row-start section-filter course-group-filter" role="tablist" aria-label="강의 상태">
        {COURSE_GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={group === g.id}
            className={`pill pill-btn ${group === g.id ? "pill-sky" : "pill-cream"}`}
            onClick={() => navigate("admin-course", { group: g.id })}
          >
            {g.label} {coursesInGroup(courses, g.id).length}
          </button>
        ))}
      </div>

      {!active ? (
        <div className="card empty">
          <span>{group === "inactive" ? "🌙" : "🗂"}</span>
          <p>{groupInfo.empty}</p>
        </div>
      ) : (
        <>
          <CourseTabs courses={list} active={active.id} onSelect={(id) => navigate("admin-course", { course: id })} />

          {active.status === "legacy" ? (
            <p className="scope-note">
              🗂 3강의 개편 전의 학습자료를 보관하는 곳이에요. 학생·교강사 화면에는 나오지 않고, 이 강의코드로는 수강 등록되지
              않아요.
            </p>
          ) : (
            <>
              <CourseOverviewCard course={active} showSections showStatus>
                <button className="link-btn" onClick={() => navigate("admin-instructors", { course: active.id })}>
                  분반·교강사 관리 ›
                </button>
              </CourseOverviewCard>
              {active.status === "inactive" ? (
                <p className="scope-note">
                  🌙 신규 수강 마감 강의예요. 새 수강 등록과 새 분반 개설은 막혀 있고, 기존 수강생의 학습과 담당 교강사의 학습자료
                  편집은 계속돼요.
                </p>
              ) : null}
              <CourseActions key={active.id} course={active} minWeekCount={maxLessonWeek} />
              <SharedLessonNote />
            </>
          )}

          <CourseLessonsTable courseId={active.id} weekCount={active.weekCount} lessons={lessons} />
          <WeekMaterialsPanel key={active.id} courseId={active.id} weekCount={active.weekCount} materials={materials} editable />
          <LiveQuizEntry courseId={active.id} />
        </>
      )}
    </div>
  );
};

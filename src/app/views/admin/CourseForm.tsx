// 관리자 강의 생성·정보 수정 폼. 규칙은 courseRules.ts와 같고, 서버가 최종 확인한다. (과목 id는 입력받지 않는다)
import React, { useState } from "react";
import { COURSE_TEXT_LIMITS, DEFAULT_WEEK_COUNT, courseFormProblem, type CourseFormValues } from "../../../content/courseRules";
import { MAX_WEEK_COUNT, MIN_WEEK_COUNT } from "../../../content/courseWeeks";

export const emptyCourseForm = (): CourseFormValues => ({ title: "", drama: "", context: "", description: "", weekCount: DEFAULT_WEEK_COUNT });

export const CourseForm: React.FC<{
  heading: string;
  initial: CourseFormValues;
  submitLabel: string;
  /** 줄일 수 없는 주차 수 하한 (수정할 때: 학습자료가 있는 가장 큰 주차) */
  minWeekCount?: number;
  /** 바뀐 칸만 보내도록 onSubmit에서 비교한다. 실패하면 오류 문구를 돌려준다. */
  onSubmit: (values: CourseFormValues) => Promise<string | null>;
  onCancel: () => void;
}> = ({ heading, initial, submitLabel, minWeekCount = 0, onSubmit, onCancel }) => {
  const [values, setValues] = useState<CourseFormValues>(initial);
  const [weekText, setWeekText] = useState(String(initial.weekCount));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof CourseFormValues>(key: K, value: CourseFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next = { ...values, weekCount: Number(weekText) };
    const problem = courseFormProblem(next, minWeekCount);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const failed = await onSubmit({
      title: next.title.trim(),
      drama: next.drama.trim(),
      context: next.context.trim(),
      description: next.description.trim(),
      weekCount: next.weekCount,
    });
    setBusy(false);
    if (failed) setError(failed);
  };

  const counter = (field: keyof typeof COURSE_TEXT_LIMITS) => (
    <small className="muted">
      {values[field].trim().length} / {COURSE_TEXT_LIMITS[field]}
    </small>
  );

  return (
    <form className="card course-form" onSubmit={(e) => void submit(e)} aria-label={heading}>
      <h3 className="card-title">{heading}</h3>
      <div className="form-grid">
        <label className="field">
          <span>과목명 *</span>
          <input
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={COURSE_TEXT_LIMITS.title}
            placeholder="예: 校园生活汉语"
            required
          />
          {counter("title")}
        </label>
        <label className="field">
          <span>드라마명</span>
          <input
            value={values.drama}
            onChange={(e) => set("drama", e.target.value)}
            maxLength={COURSE_TEXT_LIMITS.drama}
            placeholder="예: 当我飞奔向你"
          />
          {counter("drama")}
        </label>
        <label className="field span-2">
          <span>학습 맥락</span>
          <input
            value={values.context}
            onChange={(e) => set("context", e.target.value)}
            maxLength={COURSE_TEXT_LIMITS.context}
            placeholder="예: 학교생활과 친구 관계에서 쓰는 실용 중국어"
          />
          {counter("context")}
        </label>
        <label className="field span-2">
          <span>설명</span>
          <textarea
            rows={3}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={COURSE_TEXT_LIMITS.description}
            placeholder="학습자에게 보여 줄 강의 소개"
          />
          {counter("description")}
        </label>
        <label className="field">
          <span>주차 수</span>
          <input
            type="number"
            inputMode="numeric"
            min={Math.max(MIN_WEEK_COUNT, minWeekCount)}
            max={MAX_WEEK_COUNT}
            step={1}
            value={weekText}
            onChange={(e) => {
              setWeekText(e.target.value);
              setError(null);
            }}
          />
          <small className="muted">
            {MIN_WEEK_COUNT}~{MAX_WEEK_COUNT}주
            {minWeekCount > 0 ? ` · 학습자료가 ${minWeekCount}주차까지 있어 ${minWeekCount}주 이상` : ""}
          </small>
        </label>
      </div>
      {error ? (
        <p className="field-error small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
          {busy ? "저장 중…" : submitLabel}
        </button>
        <button className="btn btn-soft btn-sm" type="button" onClick={onCancel} disabled={busy}>
          취소
        </button>
      </div>
    </form>
  );
};

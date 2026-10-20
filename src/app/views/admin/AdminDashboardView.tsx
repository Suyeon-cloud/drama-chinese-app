import React from "react";
import { COURSE_WEEK_COUNT, STATUS_TONE, WEEKS, defaultDirectionForWeek } from "../../../content/course";
import type { Lesson, LessonStatus } from "../../../content/types";
import { navigate, type ViewKey } from "../../router";
import { useAllProgress, useFeedbackDrafts, useLearners, useLessons } from "../../store/hooks";
import { LocalScopeNote, PageIntro } from "./AdminShared";

const SHORTCUTS: { label: string; text: string; to: ViewKey }[] = [
  { label: "학습자 관리", text: "로그인한 학습자 목록", to: "admin-learners" },
  { label: "학습 현황", text: "출석 · 주차 · 재생률 · 퀴즈", to: "admin-progress" },
  { label: "피드백", text: "학습 결과 기반 피드백 작성", to: "admin-feedback" },
];

const STATUS_RANK: Record<LessonStatus, number> = { draft: 0, ready: 1, published: 2 };

/** 주차에서 가장 진행된 강의자료 상태 */
const weekStatus = (lessons: Lesson[], week: number): LessonStatus | null =>
  lessons
    .filter((l) => l.week === week)
    .reduce<LessonStatus | null>(
      (best, l) => (best === null || STATUS_RANK[l.status] > STATUS_RANK[best] ? l.status : best),
      null,
    );

export const AdminDashboardView: React.FC = () => {
  const lessons = useLessons();
  const learners = useLearners();
  const progress = useAllProgress();
  const drafts = useFeedbackDrafts();
  if (!lessons) return null;

  const plannedWeeks = WEEKS.filter((w) => lessons.some((l) => l.week === w)).length;
  const count = (s: LessonStatus) => lessons.filter((l) => l.status === s).length;

  const tiles = [
    { icon: "📅", label: "강의자료가 있는 주차", value: `${plannedWeeks} / ${COURSE_WEEK_COUNT}주`, tone: "sky" },
    { icon: "✅", label: "공개 강의자료", value: `${count("published")}개`, tone: "mint" },
    { icon: "🛠", label: "준비 중 · 준비 완료", value: `${count("draft") + count("ready")}개`, tone: "cream" },
    { icon: "👥", label: "학습자", value: `${learners?.length ?? 0}명`, tone: "lavender" },
    { icon: "🎬", label: "학습 시작 기록", value: `${progress?.filter((p) => p.startedAt).length ?? 0}건`, tone: "sky" },
    { icon: "✉️", label: "피드백 초안", value: `${drafts?.length ?? 0}건`, tone: "pink" },
  ];

  return (
    <div className="page">
      <PageIntro title="교수자 대시보드" desc="15주 수업 구성과 학습자 현황을 한눈에 확인해요.">
        <button className="btn btn-primary btn-sm" onClick={() => navigate("admin-editor")}>
          + 강의자료 만들기
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

      <section className="card">
        <div className="card-head">
          <h3 className="card-title">학기 구성 (15주)</h3>
          <button className="more" onClick={() => navigate("admin-course")}>
            수업 관리 ›
          </button>
        </div>
        <div className="week-strip">
          {WEEKS.map((w) => {
            const s = weekStatus(lessons, w);
            return (
              <button
                key={w}
                className={`week-dot ${s ? `tone-${STATUS_TONE[s]} has` : ""}`}
                onClick={() => navigate("admin-course")}
                title={`${w}주차`}
              >
                <b>{w}</b>
                <small>{defaultDirectionForWeek(w) === "zh-ko" ? "中→韩" : "韩→中"}</small>
              </button>
            );
          })}
        </div>
        <p className="muted small legend">
          <span className="legend-dot tone-mint" /> 공개 <span className="legend-dot tone-sky" /> 준비 완료{" "}
          <span className="legend-dot tone-cream" /> 준비 중 <span className="legend-dot" /> 강의자료 없음
        </p>
      </section>

      <div className="admin-shortcuts">
        {SHORTCUTS.map((s) => (
          <button key={s.to} className="card shortcut" onClick={() => navigate(s.to)}>
            <b>{s.label} →</b>
            <small className="muted">{s.text}</small>
          </button>
        ))}
      </div>
      <LocalScopeNote />
    </div>
  );
};

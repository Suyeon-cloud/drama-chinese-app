import React from "react";
import { youtubeThumbnail } from "../../content";
import { COURSE_PHASES, WEEKS } from "../../content/course";
import { lessonHeading } from "../../content/lessons";
import { getLevel } from "../../content/levels";
import { useAuth } from "../auth/AuthContext";
import { GoogleSignInButton } from "../auth/AuthControls";
import { LOGIN_REQUIRED_MESSAGE, useGuardedNavigate } from "../auth/LoginPrompt";
import { navigate } from "../router";
import { useLessons, useUserProgress } from "../store/hooks";
import { SituationsSection } from "./SituationsView";

type Tab = "weeks" | "situations";

/** 주차별 학습 + 상황별 장면을 한 화면에서 탭으로 오간다. */
export const WeeksView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const query = params.get("q") ?? "";
  // 예전 상황별 장면 링크(#/situations)와 검색은 상황별 탭으로 연다.
  const tab: Tab =
    params.get("tab") === "situations" || window.location.hash.startsWith("#/situations") ? "situations" : "weeks";
  const tabs: [Tab, string, string][] = [
    ["weeks", "📅 주차별 학습", "15주 강의 영상"],
    ["situations", "🎭 상황별 장면", "표현 · 역할극"],
  ];

  return (
    <div className="page">
      <div className="page-intro">
        <h2>주차·상황별 학습</h2>
        <p className="muted">15주 강의로 차근차근 배우고, 상황별 장면으로 표현을 연습해요.</p>
      </div>

      <div className="learn-tabs" role="tablist" aria-label="학습 방식">
        {tabs.map(([key, label, sub]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`learn-tab ${tab === key ? "active" : ""}`}
            onClick={() => navigate("weeks", key === "weeks" ? undefined : { tab: key })}
          >
            <b>{label}</b>
            <small>{sub}</small>
          </button>
        ))}
      </div>

      {tab === "weeks" ? (
        <WeekList />
      ) : user ? (
        <SituationsSection query={query} />
      ) : (
        <div className="card login-gate">
          <span className="gate-emoji">🔒</span>
          <h2>{LOGIN_REQUIRED_MESSAGE}</h2>
          <p className="muted">로그인하면 상황별 장면과 역할극 연습을 이용할 수 있어요.</p>
          <GoogleSignInButton />
        </div>
      )}
    </div>
  );
};

/** 15주차 강의자료 목록. 학습자는 공개된 강의자료만, 관리자는 준비 중인 자료도 미리 본다. */
const WeekList: React.FC = () => {
  const lessons = useLessons();
  const { user } = useAuth();
  const go = useGuardedNavigate();
  const progress = useUserProgress(user?.role === "learner" ? user.id : null);
  if (!lessons) return null;
  const visible = user?.role === "instructor" ? lessons : lessons.filter((l) => l.status === "published");

  return (
    <>
      {COURSE_PHASES.map((phase) => (
        <section key={phase.title} className="week-phase">
          <h3 className="section-title">
            {phase.title} <span className="muted">· {phase.subtitle}</span>
          </h3>
          <div className="week-grid">
            {WEEKS.filter((w) => w >= phase.from && w <= phase.to).map((week) => {
              const items = visible.filter((l) => l.week === week);
              if (items.length === 0) {
                return (
                  <div key={week} className="card week-card empty-week">
                    <span className="week-no">{week}주차</span>
                    <p className="muted small">강의자료 준비 중</p>
                  </div>
                );
              }
              return items.map((lesson) => {
                const p = progress?.find((x) => x.lessonId === lesson.id);
                const level = getLevel(lesson.level);
                return (
                  <button
                    key={lesson.id}
                    className="card week-card"
                    onClick={() => go("lesson", { lesson: lesson.id })}
                  >
                    <span className="week-thumb">
                      {lesson.video.youtubeId ? (
                        // eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion
                        <img src={youtubeThumbnail(lesson.video.youtubeId)} alt="" loading="lazy" />
                      ) : (
                        <span className="thumb-placeholder" aria-hidden>
                          📖
                        </span>
                      )}
                      <span className="week-no on-thumb">{week}주차</span>
                    </span>
                    <span className="row-start">
                      <span className={`pill pill-${level.tone}`}>{level.label}</span>
                      {lesson.status !== "published" ? <span className="pill pill-pink">미리보기 · 비공개</span> : null}
                      {p?.completedAt ? (
                        <span className="pill pill-mint">✅ 완료</span>
                      ) : p?.startedAt ? (
                        <span className="pill pill-sky">학습 중 {Math.round(p.progressRatio * 100)}%</span>
                      ) : null}
                    </span>
                    <b className="week-title">{lessonHeading(lesson)}</b>
                    <small className="muted">{lesson.title}</small>
                    {p ? (
                      <span className="mini-bar" aria-label={`진행률 ${Math.round(p.progressRatio * 100)}%`}>
                        <span style={{ width: `${p.progressRatio * 100}%` }} />
                      </span>
                    ) : null}
                  </button>
                );
              });
            })}
          </div>
        </section>
      ))}
    </>
  );
};

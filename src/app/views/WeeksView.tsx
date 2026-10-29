import React from "react";
import { useAuth } from "../auth/AuthContext";
import { GoogleSignInButton } from "../auth/AuthControls";
import { LOGIN_REQUIRED_MESSAGE } from "../auth/LoginPrompt";
import { navigate } from "../router";
import { MyCoursesSection } from "./MyCoursesView";
import { SituationsSection } from "./SituationsView";

type Tab = "weeks" | "situations";

/** 내 강의(수강 중인 드라마 과목) + 상황별 장면을 한 화면에서 탭으로 오간다. */
export const WeeksView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const { user } = useAuth();
  const query = params.get("q") ?? "";
  // 예전 상황별 장면 링크(#/situations)와 검색은 상황별 탭으로 연다.
  const tab: Tab =
    params.get("tab") === "situations" || window.location.hash.startsWith("#/situations") ? "situations" : "weeks";
  const tabs: [Tab, string, string][] = [
    ["weeks", "📚 내 강의", "드라마별 15주 과정"],
    ["situations", "🎭 상황별 장면", "표현 · 역할극"],
  ];

  return (
    <div className="page">
      <div className="page-intro">
        <h2>내 강의</h2>
        <p className="muted">수강 중인 드라마 과목을 골라 실제 장면과 대사로 중국어를 배워요.</p>
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

      {!user ? (
        <div className="card login-gate">
          <span className="gate-emoji">🔒</span>
          <h2>{LOGIN_REQUIRED_MESSAGE}</h2>
          <p className="muted">
            {tab === "weeks"
              ? "로그인하고 강의코드를 등록하면 드라마 과목을 학습할 수 있어요."
              : "로그인하면 상황별 장면과 역할극 연습을 이용할 수 있어요."}
          </p>
          <GoogleSignInButton />
        </div>
      ) : tab === "weeks" ? (
        <MyCoursesSection />
      ) : (
        <SituationsSection query={query} />
      )}
    </div>
  );
};

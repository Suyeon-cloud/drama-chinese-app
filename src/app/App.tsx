import React, { useEffect, useRef } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { GoogleSignInButton } from "./auth/AuthControls";
import { LoginPromptProvider, LoginRequired } from "./auth/LoginPrompt";
import { MobileNav, Sidebar, Topbar } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { getView, navigate, useRoute } from "./router";
import { learnerStore } from "./store";
import { AdminDashboardView } from "./views/admin/AdminDashboardView";
import { CourseManagementView } from "./views/admin/CourseManagementView";
import { FeedbackView } from "./views/admin/FeedbackView";
import { InstructorsView } from "./views/admin/InstructorsView";
import { LearnersView } from "./views/admin/LearnersView";
import { LessonEditorView } from "./views/admin/LessonEditorView";
import { ProgressView } from "./views/admin/ProgressView";
import { CultureView } from "./views/CultureView";
import { DramaLearningView } from "./views/DramaLearningView";
import { HomeView } from "./views/HomeView";
import { JoinView } from "./views/JoinView";
import { MyLearningView } from "./views/MyLearningView";
import { SituationsView } from "./views/SituationsView";
import { WeeksView } from "./views/WeeksView";

/** 교수자 화면에 학습자/비로그인 상태로 들어왔을 때 */
const AdminGate: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="page">
      <div className="card login-gate">
        <span className="gate-emoji">🧑‍🏫</span>
        <h2>교수자 전용 메뉴</h2>
        {user ? (
          <>
            <p className="muted">
              현재 계정({user.email})은 교수자로 등록되어 있지 않아요. 교수자 등록은 기존 교수자가 ‘교수자
              관리’에서 할 수 있어요.
            </p>
            <button className="btn btn-soft" onClick={() => navigate("home")}>
              홈으로
            </button>
          </>
        ) : (
          <>
            <p className="muted">교수자로 등록된 Google 계정으로 로그인해야 이용할 수 있어요.</p>
            <GoogleSignInButton />
          </>
        )}
      </div>
    </div>
  );
};

const Shell: React.FC = () => {
  const { view, params } = useRoute();
  const { user, ready } = useAuth();
  const userKey = user ? `${user.id}:${user.role}` : null;

  // 학습자가 로그인하면 학습자 목록에 등록(최근 접속 갱신)한다.
  useEffect(() => {
    if (user?.role === "learner") {
      void learnerStore.touch({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        picture: user.picture,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  // 홈에서 교수자 계정으로 로그인하면 교수자 대시보드로 이동한다.
  const prevUserId = useRef(user?.id ?? null);
  useEffect(() => {
    const prev = prevUserId.current;
    prevUserId.current = user?.id ?? null;
    if (!prev && user?.role === "instructor" && view === "home") navigate("admin");
  }, [user, view]);

  const def = getView(view);
  const blocked = def.adminOnly && user?.role !== "instructor";
  const needsLogin = def.requiresLogin && !user;

  return (
    <div className="app">
      <Sidebar active={view} />
      <div className="main">
        <Topbar active={view} />
        <main className="content" key={view + params.toString()}>
          {!ready ? null : blocked ? (
            <AdminGate />
          ) : needsLogin ? (
            <LoginRequired />
          ) : (
            <>
              {view === "home" && <HomeView />}
              {view === "weeks" && <WeeksView />}
              {view === "lesson" && <DramaLearningView params={params} />}
              {view === "situations" && <SituationsView params={params} />}
              {view === "culture" && <CultureView />}
              {view === "mine" && <MyLearningView />}
              {view === "join" && <JoinView params={params} />}
              {view === "admin" && <AdminDashboardView />}
              {view === "admin-course" && <CourseManagementView />}
              {view === "admin-editor" && <LessonEditorView params={params} />}
              {view === "admin-learners" && <LearnersView />}
              {view === "admin-progress" && <ProgressView params={params} />}
              {view === "admin-feedback" && <FeedbackView />}
              {view === "admin-instructors" && <InstructorsView />}
            </>
          )}
        </main>
      </div>
      <MobileNav active={view} />
    </div>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <AuthProvider>
      <LoginPromptProvider>
        <Shell />
      </LoginPromptProvider>
    </AuthProvider>
  </ToastProvider>
);

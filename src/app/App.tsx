import React, { useEffect, useRef } from "react";
import { AdminLoginButton } from "./auth/AdminLogin";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPromptProvider, LoginRequired } from "./auth/LoginPrompt";
import { MemberGate, isBlockedMember } from "./auth/MemberGate";
import { MobileNav, Sidebar, Topbar } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { getView, navigate, useRoute } from "./router";
import { AdminDashboardView } from "./views/admin/AdminDashboardView";
import { CourseManagementView } from "./views/admin/CourseManagementView";
import { FeedbackView } from "./views/admin/FeedbackView";
import { InstructorsView } from "./views/admin/InstructorsView";
import { LearnersView } from "./views/admin/LearnersView";
import { LessonEditorView } from "./views/admin/LessonEditorView";
import { MemberTableModal } from "./views/admin/MemberTableModal";
import { ProgressView } from "./views/admin/ProgressView";
import { CourseView } from "./views/CourseView";
import { CultureView } from "./views/CultureView";
import { DramaLearningView } from "./views/DramaLearningView";
import { HomeView } from "./views/HomeView";
import { JoinView } from "./views/JoinView";
import { MyLearningView } from "./views/MyLearningView";
import { WeeksView } from "./views/WeeksView";

/** 교수자 화면에 학습자/비로그인 상태로 들어왔을 때 */
const AdminGate: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="page">
      <div className="card login-gate">
        <span className="gate-emoji">🧑‍🏫</span>
        <h2>관리자 전용 메뉴</h2>
        {user ? (
          <>
            <p className="muted">
              현재 계정({user.email})은 관리자가 아니에요. 오른쪽 위 ‘관리자’ 아이콘으로 관리자 계정에 로그인해 주세요.
            </p>
            <button className="btn btn-soft" onClick={() => navigate("home")}>
              홈으로
            </button>
          </>
        ) : (
          <>
            <p className="muted">관리자 계정으로 로그인해야 이용할 수 있어요.</p>
            <AdminLoginButton />
          </>
        )}
      </div>
    </div>
  );
};

const Shell: React.FC = () => {
  const { view, params } = useRoute();
  const { user, ready } = useAuth();
  // 홈에서 교수자 계정으로 로그인하면 교수자 대시보드로 이동한다.
  const prevUserId = useRef(user?.id ?? null);
  useEffect(() => {
    const prev = prevUserId.current;
    prevUserId.current = user?.id ?? null;
    if (!prev && user?.role === "instructor" && view === "home") navigate("admin");
  }, [user, view]);
  // 홈에서 승인된 학습자가 Google 로그인하면 ‘내 강의’로 이동한다. (새로고침으로 로그인 상태를 확인한 경우는 그대로 둔다)
  const learnerPrev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const prev = learnerPrev.current;
    learnerPrev.current = user?.id ?? null;
    if (prev === null && user?.role === "learner" && user.member?.status === "approved" && view === "home") {
      navigate("weeks");
    }
  }, [ready, user, view]);

  const def = getView(view);
  const adminOnly =
    (def.adminOnly && user?.role !== "instructor") || (def.adminModeOnly && user?.provider !== "admin");
  const needsLogin = def.requiresLogin && !user;

  // 관리자 승인 전 회원은 화면 전체를 막는다. (MemberGate가 안내 팝업을 띄운다)
  const blocked = isBlockedMember(user);

  return (
    <>
    <div className="app" inert={blocked}>
      <Sidebar active={view} />
      <div className="main">
        <Topbar active={view} />
        <main className="content" key={view + params.toString()}>
          {!ready ? null : adminOnly ? (
            <AdminGate />
          ) : needsLogin ? (
            <LoginRequired />
          ) : (
            <>
              {view === "home" && <HomeView />}
              {(view === "weeks" || view === "situations") && <WeeksView params={params} />}
              {view === "course" && <CourseView params={params} />}
              {view === "lesson" && <DramaLearningView params={params} />}
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
    <MemberGate />
    <MemberTableModal />
    </>
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

import React, { useEffect, useRef } from "react";
import { AdminLoginButton } from "./auth/AdminLogin";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPromptProvider, LoginRequired } from "./auth/LoginPrompt";
import { MemberGate, isBlockedMember } from "./auth/MemberGate";
import { completeSupabaseRedirect } from "./auth/supabaseAuth";
import { MobileNav, Sidebar, Topbar } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { canAccessView, getView, navigate, useRoute, type ViewAccess } from "./router";
import { AdminDashboardView } from "./views/admin/AdminDashboardView";
import { CourseManagementView } from "./views/admin/CourseManagementView";
import { InstructorsView } from "./views/admin/InstructorsView";
import { InstructorCourseView, InstructorHomeView } from "./views/admin/InstructorViews";
import { LearnersView } from "./views/admin/LearnersView";
import { LessonEditorView } from "./views/admin/LessonEditorView";
import { ProgressView } from "./views/admin/ProgressView";
import { CourseView } from "./views/CourseView";
import { CultureView } from "./views/CultureView";
import { DramaLearningView } from "./views/DramaLearningView";
import { HtmlMaterialView } from "./views/HtmlMaterialView";
import { HomeView } from "./views/HomeView";
import { JoinView } from "./views/JoinView";
import { LandingView } from "./views/LandingView";
import { MyLearningView } from "./views/MyLearningView";
import { WeeksView } from "./views/WeeksView";

/** 역할이 맞지 않는 화면(관리자·교수자 전용)에 들어왔을 때 */
const AdminGate: React.FC<{ access: ViewAccess }> = ({ access }) => {
  const { user } = useAuth();
  const title = access === "instructor" ? "교강사 전용 메뉴" : access === "admin" ? "관리자 전용 메뉴" : "교강사·관리자 메뉴";
  return (
    <div className="page">
      <div className="card login-gate">
        <span className="gate-emoji">🧑‍🏫</span>
        <h2>{title}</h2>
        {user ? (
          <>
            <p className="muted">
              {access === "instructor"
                ? "교강사로 등록된 Google 계정으로 로그인해야 이용할 수 있어요."
                : `현재 계정(${user.email || user.name})으로는 볼 수 없는 화면이에요. 관리자는 오른쪽 위 ‘관리자’ 아이콘으로 로그인해 주세요.`}
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
  // Supabase Google 로그인에서 돌아온 경우 ?code 를 세션으로 바꾸고 원래 #/화면으로 돌아간다.
  useEffect(() => {
    void completeSupabaseRedirect();
  }, []);
  // 홈에서 교수자(Google)로 로그인하면 내 담당 강의, 관리자로 로그인하면 전체 운영 관리로 이동한다.
  const prevUserId = useRef(user?.id ?? null);
  useEffect(() => {
    const prev = prevUserId.current;
    prevUserId.current = user?.id ?? null;
    if (!prev && user?.role === "instructor" && view === "home") {
      navigate(user.provider === "admin" ? "admin" : "teach");
    }
  }, [user, view]);

  // 로그인 전 첫 화면은 앱 메뉴 없는 서비스 소개 (로그인 상태를 확인하는 동안에는 비워 둔다)
  if (view === "home" && (!ready || !user)) return ready ? <LandingView /> : null;

  const def = getView(view);
  const denied = !canAccessView(def, user);
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
          {!ready ? null : denied ? (
            <AdminGate access={def.access ?? "staff"} />
          ) : needsLogin ? (
            <LoginRequired />
          ) : (
            <>
              {view === "home" && <HomeView />}
              {(view === "weeks" || view === "situations") && <WeeksView params={params} />}
              {view === "course" && <CourseView params={params} />}
              {view === "lesson" && <DramaLearningView params={params} />}
              {view === "material" && <HtmlMaterialView params={params} />}
              {view === "culture" && <CultureView />}
              {view === "mine" && <MyLearningView />}
              {view === "join" && <JoinView params={params} />}
              {view === "teach" && <InstructorHomeView />}
              {view === "teach-course" && <InstructorCourseView params={params} />}
              {view === "admin" && <AdminDashboardView />}
              {view === "admin-course" && <CourseManagementView params={params} />}
              {view === "admin-editor" && <LessonEditorView params={params} />}
              {view === "admin-learners" && <LearnersView />}
              {view === "admin-progress" && <ProgressView params={params} />}
              {view === "admin-instructors" && <InstructorsView params={params} />}
            </>
          )}
        </main>
      </div>
      <MobileNav active={view} />
    </div>
    <MemberGate />
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

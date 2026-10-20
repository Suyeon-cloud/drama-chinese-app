import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getView, navigate, type ViewKey } from "../router";
import { useAuth } from "./AuthContext";
import { GoogleSignInButton } from "./AuthControls";

export const LOGIN_REQUIRED_MESSAGE = "로그인 후 이용하세요.";

type LoginPromptState = {
  /**
   * 로그인 상태면 true. 아니면 “로그인 후 이용하세요.” 안내를 띄우고 false를 돌려준다.
   * onAuthed는 안내에서 로그인에 성공하면 이어서 실행된다.
   */
  requireLogin: (onAuthed?: () => void) => boolean;
};

const LoginPromptContext = createContext<LoginPromptState | null>(null);

const AUTO_HIDE_MS = 5000;

/**
 * 로그인 안내. 인증 방식과 무관하게 useAuth().signIn()만 호출한다. (현재: Google 로그인)
 */
export const LoginPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signIn, pending } = useAuth();
  const [open, setOpen] = useState(false);
  const afterLogin = useRef<(() => void) | null>(null);

  const requireLogin = useCallback(
    (onAuthed?: () => void) => {
      if (user) return true;
      afterLogin.current = onAuthed ?? null;
      setOpen(true);
      return false;
    },
    [user],
  );

  const close = useCallback(() => {
    setOpen(false);
    afterLogin.current = null;
  }, []);

  useEffect(() => {
    if (!open || pending) return;
    const timer = window.setTimeout(close, AUTO_HIDE_MS);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pending, close]);

  // 다른 곳에서 로그인해도 안내는 닫는다.
  useEffect(() => {
    if (user) setOpen(false);
  }, [user]);

  const login = async () => {
    const next = afterLogin.current;
    if (!(await signIn())) return; // 로그인 실패·취소 시 안내를 유지한다. (오류는 토스트로 표시)
    close();
    next?.();
  };

  return (
    <LoginPromptContext.Provider value={{ requireLogin }}>
      {children}
      {open ? (
        <div className="login-toast" role="alert">
          <span className="login-toast-icon" aria-hidden>
            🔒
          </span>
          <b>{LOGIN_REQUIRED_MESSAGE}</b>
          <button className="btn btn-primary btn-sm" onClick={login} disabled={pending}>
            {pending ? "로그인 중…" : "Google로 로그인"}
          </button>
          <button className="login-toast-close" onClick={close} aria-label="닫기">
            ✕
          </button>
        </div>
      ) : null}
    </LoginPromptContext.Provider>
  );
};

export const useRequireLogin = () => {
  const ctx = useContext(LoginPromptContext);
  if (!ctx) throw new Error("useRequireLogin must be used inside <LoginPromptProvider>");
  return ctx.requireLogin;
};

/** 로그인이 필요한 화면(router의 requiresLogin)이면 안내를 띄우고, 로그인 후 이동한다. */
export const useGuardedNavigate = () => {
  const requireLogin = useRequireLogin();
  return useCallback(
    (view: ViewKey, params?: Record<string, string | number>) => {
      const go = () => navigate(view, params);
      if (!getView(view).requiresLogin || requireLogin(go)) go();
    },
    [requireLogin],
  );
};

/** 로그인하지 않은 채 수업 콘텐츠 주소로 바로 들어왔을 때 표시하는 화면 */
export const LoginRequired: React.FC = () => {
  return (
    <div className="page">
      <div className="card login-gate">
        <span className="gate-emoji">🔒</span>
        <h2>{LOGIN_REQUIRED_MESSAGE}</h2>
        <p className="muted">로그인하면 주차별 수업 영상과 표현·문화 학습, 학습 기록을 이용할 수 있어요.</p>
        <GoogleSignInButton />
      </div>
    </div>
  );
};

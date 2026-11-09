import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import { setApiTokenProvider } from "../lib/api";
import { getAuthBackend, loadRuntimeConfig } from "../lib/runtimeConfig";
import { clearPersonalAiKey } from "../store/aiKey";
import { refreshAllStores } from "../store/remote";
import {
  AUTH_ERROR_MESSAGE,
  AuthError,
  googleAuthService,
  type AuthService,
  type AuthUser,
} from "./authService";
import { gmailService } from "./gmailService";
import { getSupabaseAccessToken, peekSupabaseAccessToken, watchSupabaseSession } from "./supabaseAuth";
import { supabaseAuthService } from "./supabaseAuthService";

type AuthState = {
  /** 로그인 사용자 (역할·회원정보 포함). 로그인 전이면 null */
  user: AuthUser | null;
  /** 서버에서 로그인 상태를 확인했는지 */
  ready: boolean;
  /** Google Client ID 설정 여부 */
  configured: boolean;
  /** 관리자 로그인(ADMIN_ID·ADMIN_PASSWORD) 설정 여부 */
  adminEnabled: boolean;
  pending: boolean;
  /** 성공하면 로그인 사용자, 실패·취소하면 null (안내는 토스트로 표시) */
  signIn: () => Promise<AuthUser | null>;
  /** 관리자 로그인. 실패하면 오류 문구를 돌려준다. */
  adminSignIn: (id: string, password: string) => Promise<{ user: AuthUser | null; error: string | null }>;
  signOut: () => Promise<void>;
  /** 서버에서 내 정보를 다시 읽는다. (회원정보 입력·승인 확인) */
  refresh: () => Promise<AuthUser | null>;
  /** 서버 응답으로 받은 사용자로 바꾼다. */
  setUser: (user: AuthUser | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

const errorText = (err: unknown) => {
  const e = err instanceof AuthError ? err : new AuthError("failed");
  return e.message && e.message !== e.code ? e.message : AUTH_ERROR_MESSAGE[e.code];
};

export const AuthProvider: React.FC<{
  service?: AuthService;
  children: React.ReactNode;
}> = ({ service: fixedService, children }) => {
  const toast = useToast();
  // 서버 설정(AUTH_BACKEND)을 읽은 뒤 정해진다. 기본은 기존 Google 로그인.
  const [service, setService] = useState<AuthService>(fixedService ?? googleAuthService);
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(service.configured);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [pending, setPending] = useState(false);

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
    refreshAllStores();
  }, []);

  // 설정(Client ID·AUTH_BACKEND)과 로그인 상태를 서버에서 읽는다.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const config = await loadRuntimeConfig();
      const supabase = !fixedService && getAuthBackend() === "supabase";
      const active = fixedService ?? (supabase ? supabaseAuthService : googleAuthService);
      // supabase: 서버 API 요청에 Supabase access token을 붙인다. (서버 세션으로 바꾸지 않는다)
      // 메모리의 token을 세션 변화에 맞춰 두어, 화면을 떠날 때의 저장도 token을 다시 받느라 늦어지지 않게 한다.
      if (supabase) watchSupabaseSession();
      setApiTokenProvider(supabase ? getSupabaseAccessToken : null, supabase ? peekSupabaseAccessToken : null);
      const current = await active.getCurrentUser();
      if (!alive) return;
      setService(() => active);
      setConfigured(active.configured);
      setAdminEnabled(config.adminLoginEnabled);
      setUserState(current);
      setReady(true);
      // token이 준비되기 전에 불러온 목록이 있으면 다시 읽는다.
      if (supabase) refreshAllStores();
      const signInError = active.takeSignInError?.();
      if (signInError) toast.show(signInError, "error");
      // GIS 스크립트를 미리 불러와 로그인 버튼 클릭 시 팝업이 바로 열리게 한다.
      active.prepare();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedService]);

  const refresh = useCallback(async () => {
    const u = await service.getCurrentUser();
    setUserState(u);
    return u;
  }, [service]);

  const signIn = useCallback(async () => {
    setPending(true);
    try {
      const u = await service.signInWithGoogle();
      setUser(u);
      toast.show("Google 로그인이 완료되었습니다.", "success");
      return u;
    } catch (err) {
      const cancelled = err instanceof AuthError && err.code === "cancelled";
      toast.show(errorText(err), cancelled ? "info" : "error");
      return null;
    } finally {
      setPending(false);
    }
  }, [service, toast, setUser]);

  const adminSignIn = useCallback(
    async (id: string, password: string) => {
      setPending(true);
      try {
        const u = await service.signInAsAdmin(id, password);
        setUser(u);
        toast.show("관리자로 로그인했어요.", "success");
        return { user: u, error: null };
      } catch (err) {
        return { user: null, error: errorText(err) };
      } finally {
        setPending(false);
      }
    },
    [service, toast, setUser],
  );

  const signOut = useCallback(async () => {
    gmailService.clear(); // Gmail 발송 토큰이 있으면 폐기하고 메모리에서 지운다.
    clearPersonalAiKey(); // 본인 AI API 키(메모리)도 지운다 — 같은 브라우저의 다음 사용자가 쓰지 않게
    await service.signOut();
    setUser(null);
    toast.show("로그아웃되었습니다.", "info");
  }, [service, toast, setUser]);

  const value = useMemo(
    () => ({ user, ready, configured, adminEnabled, pending, signIn, adminSignIn, signOut, refresh, setUser }),
    [user, ready, configured, adminEnabled, pending, signIn, adminSignIn, signOut, refresh, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import { useInstructors } from "../store/hooks";
import {
  AUTH_ERROR_MESSAGE,
  AuthError,
  googleAuthService,
  type AuthIdentity,
  type AuthService,
  type AuthUser,
} from "./authService";
import { gmailService } from "./gmailService";
import { resolveRole } from "./roles";

type AuthState = {
  /** 로그인 사용자 (역할 포함). 로그인 전이면 null */
  user: AuthUser | null;
  /** 교수자 목록을 읽어 역할을 정할 수 있게 되었는지 */
  ready: boolean;
  /** VITE_GOOGLE_CLIENT_ID 설정 여부 */
  configured: boolean;
  pending: boolean;
  /** 성공하면 로그인 사용자, 실패·취소하면 null (안내는 토스트로 표시) */
  signIn: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{
  service?: AuthService;
  children: React.ReactNode;
}> = ({ service = googleAuthService, children }) => {
  const toast = useToast();
  const [identity, setIdentity] = useState<AuthIdentity | null>(() => service.getCurrentUser());
  const [pending, setPending] = useState(false);
  const instructors = useInstructors();
  const instructorEmails = useMemo(() => instructors?.map((i) => i.email) ?? null, [instructors]);

  // GIS 스크립트를 미리 불러와 로그인 버튼 클릭 시 팝업이 바로 열리게 한다.
  useEffect(() => service.prepare(), [service]);

  const withRole = useCallback(
    (id: AuthIdentity): AuthUser => ({ ...id, role: resolveRole(id.email, instructorEmails ?? []) }),
    [instructorEmails],
  );

  const user = useMemo(
    () => (identity && instructorEmails ? withRole(identity) : null),
    [identity, instructorEmails, withRole],
  );

  const signIn = useCallback(async () => {
    setPending(true);
    try {
      const id = await service.signInWithGoogle();
      setIdentity(id);
      toast.show("Google 로그인이 완료되었습니다.", "success");
      return withRole(id);
    } catch (err) {
      const code = err instanceof AuthError ? err.code : "failed";
      toast.show(AUTH_ERROR_MESSAGE[code], code === "cancelled" ? "info" : "error");
      return null;
    } finally {
      setPending(false);
    }
  }, [service, toast, withRole]);

  const signOut = useCallback(async () => {
    gmailService.clear(); // Gmail 발송 토큰이 있으면 폐기하고 메모리에서 지운다.
    await service.signOut();
    setIdentity(null);
    toast.show("로그아웃되었습니다.", "info");
  }, [service, toast]);

  const value = useMemo(
    () => ({
      user,
      ready: instructorEmails !== null,
      configured: service.configured,
      pending,
      signIn,
      signOut,
    }),
    [user, instructorEmails, service.configured, pending, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};

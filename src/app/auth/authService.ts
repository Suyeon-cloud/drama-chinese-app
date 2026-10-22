// 인증 서비스. Google Identity Services(OAuth 2.0 토큰 모델, 팝업)로 access token을 받아 서버에 보내고,
// 서버가 Google에 직접 확인한 뒤 로그인 쿠키를 준다. 관리자는 Google과 별개로 아이디·비밀번호로 로그인한다.
//
// - Client Secret은 사용하지 않는다. (브라우저 앱이므로 Client ID만 사용)
// - access token은 서버에 한 번 보내 확인할 때만 쓰고 저장하지 않는다.

import { api, ApiError } from "../lib/api";
import { getGoogleClientId } from "../lib/runtimeConfig";
import type { SessionUser } from "../store/models";
import { loadGoogleIdentity, type GoogleTokenClient, type GoogleTokenResponse } from "./googleIdentity";

/** 로그인 사용자 (역할·회원정보 포함) */
export type AuthUser = SessionUser;

export type AuthErrorCode =
  | "not-configured"
  | "script-failed"
  | "popup-blocked"
  | "cancelled"
  | "unverified-email"
  | "server"
  | "failed";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export const AUTH_ERROR_MESSAGE: Record<AuthErrorCode, string> = {
  "not-configured":
    "Google 로그인 설정(GOOGLE_CLIENT_ID)이 없어 로그인할 수 없어요. 관리자에게 문의해 주세요.",
  "script-failed": "Google 로그인 서비스를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  "popup-blocked": "로그인 팝업이 차단되었어요. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.",
  cancelled: "Google 로그인이 취소되었어요.",
  "unverified-email": "이메일이 확인된 Google 계정으로만 로그인할 수 있어요.",
  server: "로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  failed: "Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.",
};

export interface AuthService {
  /** Google 로그인에 필요한 설정이 있는지 */
  readonly configured: boolean;
  /** 로그인 버튼을 누르기 전에 미리 준비 (팝업 차단 방지) */
  prepare(): void;
  /** 서버 세션의 현재 사용자 */
  getCurrentUser(): Promise<AuthUser | null>;
  signInWithGoogle(): Promise<AuthUser>;
  signInAsAdmin(id: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
}

const SCOPES = "openid email profile";

type Pending = { resolve: (token: string) => void; reject: (e: AuthError) => void };

const createGoogleAuthService = (): AuthService => {
  let client: GoogleTokenClient | null = null;
  let clientFor = "";
  let pending: Pending | null = null;

  const settle = (fn: (p: Pending) => void) => {
    const p = pending;
    pending = null;
    if (p) fn(p);
  };
  const fail = (code: AuthErrorCode) => settle((p) => p.reject(new AuthError(code)));

  const onToken = (response: GoogleTokenResponse) => {
    if (response.error || !response.access_token) {
      fail(response.error === "access_denied" ? "cancelled" : "failed");
      return;
    }
    const token = response.access_token;
    settle((p) => p.resolve(token));
  };

  const getClient = async (): Promise<GoogleTokenClient> => {
    const clientId = getGoogleClientId();
    if (client && clientFor === clientId) return client;
    const google = await loadGoogleIdentity();
    clientFor = clientId;
    client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: onToken,
      error_callback: (e) =>
        fail(
          e.type === "popup_failed_to_open"
            ? "popup-blocked"
            : e.type === "popup_closed"
              ? "cancelled"
              : "failed",
        ),
    });
    return client;
  };

  const requestToken = () =>
    new Promise<string>((resolve, reject) => {
      fail("cancelled"); // 이전 요청이 남아 있으면 정리
      pending = { resolve, reject };
      const request = (c: GoogleTokenClient) => c.requestAccessToken({ prompt: "select_account" });
      // 클릭 직후 바로 팝업을 열어야 차단되지 않으므로, 준비된 경우 동기적으로 요청한다.
      if (client && clientFor === getGoogleClientId()) request(client);
      else
        getClient()
          .then(request)
          .catch(() => fail("script-failed"));
    });

  const toAuthError = (err: unknown) =>
    err instanceof AuthError
      ? err
      : err instanceof ApiError
        ? new AuthError(err.status === 0 || err.status >= 500 ? "server" : "failed", err.message)
        : new AuthError("failed");

  return {
    get configured() {
      return getGoogleClientId() !== "";
    },
    prepare() {
      if (getGoogleClientId()) void getClient().catch(() => undefined);
    },
    getCurrentUser: async () => {
      try {
        return (await api<{ user: AuthUser | null }>("/auth/me")).user;
      } catch {
        return null;
      }
    },
    async signInWithGoogle() {
      if (!getGoogleClientId()) throw new AuthError("not-configured");
      const accessToken = await requestToken();
      try {
        return (await api<{ user: AuthUser }>("/auth/google", { method: "POST", body: { accessToken } })).user;
      } catch (err) {
        throw toAuthError(err);
      }
    },
    async signInAsAdmin(id, password) {
      try {
        return (await api<{ user: AuthUser }>("/auth/admin", { method: "POST", body: { id, password } })).user;
      } catch (err) {
        throw toAuthError(err);
      }
    },
    async signOut() {
      fail("cancelled");
      await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    },
  };
};

export const googleAuthService: AuthService = createGoogleAuthService();

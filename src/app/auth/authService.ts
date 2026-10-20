// 인증 서비스. Google Identity Services(OAuth 2.0 토큰 모델, 팝업)로 로그인하고
// Google userinfo에서 이름·이메일·프로필 이미지를 받아온다.
//
// - Client Secret은 사용하지 않는다. (브라우저 앱이므로 Client ID만 사용)
// - access token은 메모리에만 잠시 두고 localStorage에 저장하지 않는다.
//   새로고침 후에는 저장해 둔 프로필(이름·이메일·이미지)만으로 로그인 상태를 표시한다.
// - 서버가 없으므로 토큰을 서버에서 검증하지 않는다. 원격 DB/서버 연결 시 서버 검증을 추가한다.

import { normalizeEmail, type UserRole } from "./roles";
import { loadGoogleIdentity, type GoogleTokenClient, type GoogleTokenResponse } from "./googleIdentity";

/** 로그인한 Google 계정 정보 (역할은 AuthContext에서 교수자 목록으로 정한다) */
export type AuthIdentity = {
  /** Google 계정 고유 ID (sub) */
  id: string;
  name: string;
  email: string;
  picture: string | null;
  /** 프로필 이미지가 없을 때 원형 아이콘 배경색 */
  avatarColor: string;
  provider: "google";
};

export type AuthUser = AuthIdentity & { role: UserRole };

export type AuthErrorCode =
  | "not-configured"
  | "script-failed"
  | "popup-blocked"
  | "cancelled"
  | "unverified-email"
  | "failed";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode) {
    super(code);
    this.code = code;
  }
}

export const AUTH_ERROR_MESSAGE: Record<AuthErrorCode, string> = {
  "not-configured":
    "Google 로그인 설정(VITE_GOOGLE_CLIENT_ID)이 없어 로그인할 수 없어요. .env 설정을 확인해 주세요.",
  "script-failed": "Google 로그인 서비스를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  "popup-blocked": "로그인 팝업이 차단되었어요. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.",
  cancelled: "Google 로그인이 취소되었어요.",
  "unverified-email": "이메일이 확인된 Google 계정으로만 로그인할 수 있어요.",
  failed: "Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.",
};

export interface AuthService {
  /** 로그인에 필요한 설정이 있는지 */
  readonly configured: boolean;
  /** 로그인 버튼을 누르기 전에 미리 준비 (팝업 차단 방지) */
  prepare(): void;
  getCurrentUser(): AuthIdentity | null;
  signInWithGoogle(): Promise<AuthIdentity>;
  signOut(): Promise<void>;
}

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
const SCOPES = "openid email profile";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const STORAGE_KEY = "zhuiju.authUser.v1";
const LEGACY_DEMO_KEY = "zhuiju.demoUser";

const AVATAR_COLORS = ["#A9D6F5", "#F6D3DF", "#C9EBDD", "#DCD5F7", "#FBE3B5"];

const avatarColorFor = (email: string) => {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const storage = {
  get(): AuthIdentity | null {
    try {
      window.localStorage.removeItem(LEGACY_DEMO_KEY); // 1차 Demo 세션 정리
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const u = JSON.parse(raw) as Partial<AuthIdentity>;
      if (u.provider !== "google" || !u.id || !u.email) return null;
      return {
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        picture: u.picture ?? null,
        avatarColor: u.avatarColor ?? avatarColorFor(u.email),
        provider: "google",
      };
    } catch {
      return null;
    }
  },
  set(u: AuthIdentity | null) {
    try {
      if (u) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable — session-only login
    }
  },
};

type Pending = { resolve: (u: AuthIdentity) => void; reject: (e: AuthError) => void };

const createGoogleAuthService = (): AuthService => {
  let client: GoogleTokenClient | null = null;
  let pending: Pending | null = null;

  const settle = (fn: (p: Pending) => void) => {
    const p = pending;
    pending = null;
    if (p) fn(p);
  };
  const fail = (code: AuthErrorCode) => settle((p) => p.reject(new AuthError(code)));

  const onToken = async (response: GoogleTokenResponse) => {
    if (response.error || !response.access_token) {
      fail(response.error === "access_denied" ? "cancelled" : "failed");
      return;
    }
    try {
      const res = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${response.access_token}` },
      });
      if (!res.ok) throw new AuthError("failed");
      const info = (await res.json()) as {
        sub?: string;
        name?: string;
        email?: string;
        email_verified?: boolean;
        picture?: string;
      };
      if (!info.sub || !info.email) throw new AuthError("failed");
      if (info.email_verified === false) throw new AuthError("unverified-email");
      const email = normalizeEmail(info.email);
      const identity: AuthIdentity = {
        id: info.sub,
        name: info.name || email,
        email,
        picture: info.picture ?? null,
        avatarColor: avatarColorFor(email),
        provider: "google",
      };
      storage.set(identity);
      settle((p) => p.resolve(identity));
    } catch (err) {
      fail(err instanceof AuthError ? err.code : "failed");
    }
  };

  const getClient = async (): Promise<GoogleTokenClient> => {
    if (client) return client;
    const google = await loadGoogleIdentity();
    client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (r) => void onToken(r),
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

  return {
    configured: CLIENT_ID !== "",
    prepare() {
      if (CLIENT_ID) void getClient().catch(() => undefined);
    },
    getCurrentUser: () => storage.get(),
    signInWithGoogle() {
      if (!CLIENT_ID) return Promise.reject(new AuthError("not-configured"));
      return new Promise<AuthIdentity>((resolve, reject) => {
        fail("cancelled"); // 이전 요청이 남아 있으면 정리
        pending = { resolve, reject };
        const request = (c: GoogleTokenClient) => c.requestAccessToken({ prompt: "select_account" });
        // 클릭 직후 바로 팝업을 열어야 차단되지 않으므로, 준비된 경우 동기적으로 요청한다.
        if (client) request(client);
        else
          getClient()
            .then(request)
            .catch(() => fail("script-failed"));
      });
    },
    async signOut() {
      fail("cancelled");
      storage.set(null);
    },
  };
};

export const googleAuthService: AuthService = createGoogleAuthService();

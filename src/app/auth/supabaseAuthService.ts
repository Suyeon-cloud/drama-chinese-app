// AUTH_BACKEND=supabase일 때의 인증 서비스. 학생·교수자는 Supabase Google 로그인(PKCE) 세션만 쓰고,
// 서버 API에는 그 access token을 Bearer로 보낸다. (서버 로그인 쿠키를 만들지 않는다)
// 관리자는 기존과 같이 아이디·비밀번호로 로그인하고 서버 관리자 세션 쿠키를 쓴다.
import { api, ApiError } from "../lib/api";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { AuthError, type AuthService, type AuthUser } from "./authService";
import {
  completeSupabaseRedirect,
  getSupabaseAccessToken,
  signOutSupabase,
  startSupabaseGoogleSignIn,
  takeSupabaseRedirectError,
} from "./supabaseAuth";

const toAuthError = (err: unknown) =>
  err instanceof AuthError
    ? err
    : err instanceof ApiError
      ? new AuthError(err.status === 0 || err.status >= 500 ? "server" : "failed", err.message)
      : new AuthError("failed", err instanceof Error ? err.message : undefined);

export const supabaseAuthService: AuthService = {
  get configured() {
    return isSupabaseConfigured();
  },
  prepare() {},
  async getCurrentUser() {
    try {
      // Google에서 막 돌아온 경우 ?code 교환이 끝난 뒤에 확인한다.
      await completeSupabaseRedirect();
      if (await getSupabaseAccessToken()) {
        // 프로필 생성·최종 접속·사전 등록 교수자 연결 (인증된 이메일 기준, DB 함수)
        const sync = await getSupabase()!.rpc("sync_my_account");
        if (sync.error) throw sync.error;
      }
      // token이 있으면 Bearer로, 없으면 관리자 쿠키로 확인된다.
      return (await api<{ user: AuthUser | null }>("/auth/me")).user;
    } catch {
      return null;
    }
  },
  async signInWithGoogle() {
    if (!isSupabaseConfigured()) throw new AuthError("not-configured");
    try {
      // 남아 있는 관리자 세션이 있으면 먼저 끝낸다. (관리자 쿠키가 학생·교수자 token보다 우선하므로)
      await api("/auth/logout", { method: "POST" }).catch(() => undefined);
      await startSupabaseGoogleSignIn();
    } catch (err) {
      throw toAuthError(err);
    }
    // 브라우저가 Google 로그인 화면으로 이동한다. 돌아오면 getCurrentUser가 세션을 확인한다.
    return new Promise<AuthUser>(() => undefined);
  },
  async signInAsAdmin(id, password) {
    try {
      await signOutSupabase();
      return (await api<{ user: AuthUser }>("/auth/admin", { method: "POST", body: { id, password } })).user;
    } catch (err) {
      throw toAuthError(err);
    }
  },
  async signOut() {
    await signOutSupabase().catch(() => undefined);
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  },
  takeSignInError: takeSupabaseRedirectError,
};

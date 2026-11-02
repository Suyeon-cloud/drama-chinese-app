// 학생·교수자의 Supabase Google 로그인 (PKCE). 관리자는 이 경로를 쓰지 않고 기존 아이디·비밀번호 로그인을 쓴다.
// Gmail 피드백 발송용 Google 토큰(gmailService)과는 별개다.
//
// 흐름: 로그인 버튼 → Google → Supabase → {앱 주소}/?code=… 로 돌아옴 → supabase-js가 code를 세션으로 바꿈
//       → 주소에서 ?code를 지우고 로그인 전의 #/화면으로 되돌린다.
import type { MemberProfileInput } from "../store/models";
import { getSupabase } from "../lib/supabase";

/** 로그인을 시작한 화면 (#/...). 돌아왔을 때 이 화면으로 복귀하고, 우리가 시작한 로그인인지 확인하는 데도 쓴다. */
const RETURN_KEY = "zhuiju.supabaseAuth.return";
const ERROR_KEY = "zhuiju.supabaseAuth.error";

const storage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const startSupabaseGoogleSignIn = async () => {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase 설정(.env.local)이 없어요.");
  storage()?.setItem(RETURN_KEY, window.location.hash || "#/");
  storage()?.removeItem(ERROR_KEY);
  // 돌아올 주소에는 # 를 넣지 않는다. (Redirect URLs의 http://localhost:5173/** 와 맞는 기본 주소)
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) {
    storage()?.removeItem(RETURN_KEY);
    throw error;
  }
};

/**
 * 앱을 열 때 한 번: 이 앱이 시작한 Supabase 로그인에서 돌아온 경우에만 처리한다.
 * code 교환은 supabase-js(detectSessionInUrl)가 하고, 여기서는 끝나기를 기다린 뒤 주소를 정리한다.
 */
let redirectDone: Promise<void> | null = null;
export const completeSupabaseRedirect = () => (redirectDone ??= finishRedirect());

const finishRedirect = async () => {
  const returnHash = storage()?.getItem(RETURN_KEY);
  const params = new URLSearchParams(window.location.search);
  if (!returnHash || (!params.has("code") && !params.has("error"))) return;
  storage()?.removeItem(RETURN_KEY);
  const supabase = getSupabase();
  if (params.has("error")) {
    storage()?.setItem(ERROR_KEY, params.get("error_description") || params.get("error") || "로그인하지 못했어요.");
  } else if (supabase) {
    const { error } = await supabase.auth.getSession();
    if (error) storage()?.setItem(ERROR_KEY, error.message);
  }
  window.history.replaceState(null, "", `${window.location.pathname}${returnHash}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

/** 돌아오는 과정에서 생긴 오류 (한 번 읽으면 지운다) */
export const takeSupabaseRedirectError = () => {
  const message = storage()?.getItem(ERROR_KEY) ?? null;
  storage()?.removeItem(ERROR_KEY);
  return message;
};

/** 학생 회원정보 입력 완료 (기존 가입 팝업과 같은 항목·검사) */
export const completeSupabaseProfile = async (input: MemberProfileInput) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase 설정(.env.local)이 없어요.");
  const { error } = await supabase.rpc("complete_my_profile", {
    p_name: input.name,
    p_university: input.university,
    p_department: input.department,
    p_grade: input.grade,
    p_student_id: input.studentId,
    p_contact_email: input.email,
    p_phone: input.phone,
  });
  if (error) throw error;
};

export const signOutSupabase = async () => {
  await getSupabase()?.auth.signOut();
};

/** 메모리에 둔 현재 access token (만료 시각과 함께). 세션이 바뀔 때마다 supabase-js 알림으로 갱신한다. */
let tokenCache: { token: string; expiresAt: number } | null = null;
let watching = false;
const remember = (session: { access_token: string; expires_at?: number } | null) => {
  tokenCache = session ? { token: session.access_token, expiresAt: (session.expires_at ?? 0) * 1000 } : null;
};

/** 로그인·token 갱신·로그아웃을 따라가며 메모리의 token을 최신으로 둔다. (한 번만 등록) */
export const watchSupabaseSession = () => {
  const supabase = getSupabase();
  if (!supabase || watching) return;
  watching = true;
  supabase.auth.onAuthStateChange((_event, session) => remember(session));
};

/** 서버 API 요청에 붙일 현재 access token (만료가 가까우면 supabase-js가 갱신한 값) */
export const getSupabaseAccessToken = async () => {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  remember(data.session);
  return data.session?.access_token ?? null;
};

/**
 * 기다리지 않고 바로 쓸 수 있는 token (만료 60초 전까지). 없으면 null — 그때는 getSupabaseAccessToken을 기다린다.
 * 화면을 떠날 때(keepalive)도 token을 다시 받느라 저장 요청이 늦어지지 않게 한다.
 */
export const peekSupabaseAccessToken = () =>
  tokenCache && tokenCache.expiresAt - Date.now() > 60_000 ? tokenCache.token : null;

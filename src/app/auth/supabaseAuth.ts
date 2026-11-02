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

export type SupabaseProfile = {
  id: string;
  name: string;
  university: string;
  department: string;
  grade: string;
  student_id: string;
  contact_email: string;
  phone: string;
  picture: string | null;
  status: "pending" | "approved";
  profile_completed: boolean;
  approved_at: string | null;
};

export type SupabaseAccount = {
  email: string;
  /** 사전 등록된 교수자 이메일과 연결된 계정인지. 학생 승인 상태와는 별개다. */
  isInstructor: boolean;
  profile: SupabaseProfile;
};

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
export const completeSupabaseRedirect = async () => {
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

/** 현재 Supabase 세션의 계정. 세션이 없으면 null */
export const loadSupabaseAccount = async (): Promise<SupabaseAccount | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;
  // 프로필 확인·최종 접속·사전 등록 교수자 연결 (서버 함수가 인증된 이메일로만 연결한다)
  const sync = await supabase.rpc("sync_my_account");
  if (sync.error) throw sync.error;
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return {
    email: user.email ?? "",
    isInstructor: !!(sync.data as { is_instructor?: boolean } | null)?.is_instructor,
    profile: profile as SupabaseProfile,
  };
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

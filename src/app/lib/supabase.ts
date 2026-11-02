// 학생·교강사용 브라우저 Supabase client. 공개 키(anon/publishable)와 로그인 사용자의 JWT로 요청하고, 접근은 RLS가 막는다.
// service-role 키는 브라우저에서 절대 쓰지 않는다. (관리자 작업은 서버 전용 client가 한다)
// AUTH_BACKEND=supabase일 때 학생·교수자 로그인(supabaseAuthService)과 회원정보 저장에 쓴다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

let client: SupabaseClient | null = null;

export const isSupabaseConfigured = () => !!url && !!anonKey;

/** 설정(.env.local의 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY)이 없으면 null */
export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) return null;
  client ??= createClient(url, anonKey, {
    // PKCE: Google 로그인 결과를 주소의 ?code= 로 받는다. 화면 주소는 #/... 를 쓰므로 # 쪽에 토큰을 받지 않는다.
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
};

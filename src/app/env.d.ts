// Vite 환경변수 (.env). 값은 빌드 시 번들에 들어가므로 공개되어도 되는 값만 둔다.
// Client Secret 같은 비밀 값은 VITE_ 변수로 두지 않는다.

interface ImportMetaEnv {
  /** Google OAuth 클라이언트 ID (웹 애플리케이션 유형) */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** 선택: 최초 교수자 Google 이메일 */
  readonly VITE_INITIAL_INSTRUCTOR_EMAIL?: string;
  /** Supabase 프로젝트 주소 (공개 값) */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon(publishable) 키 (공개 값, RLS로 보호). service-role 키를 넣지 않는다. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

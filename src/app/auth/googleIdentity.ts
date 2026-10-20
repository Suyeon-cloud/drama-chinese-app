// Google Identity Services(GIS) 스크립트 로더와 최소 타입 정의 (별도 npm 패키지 없이 사용).

export type GoogleTokenResponse = {
  access_token?: string;
  /** 토큰 유효 시간(초) */
  expires_in?: number | string;
  /** 실제로 허용된 scope (공백 구분) */
  scope?: string;
  error?: string;
  error_description?: string;
};

export type GoogleTokenClient = {
  requestAccessToken(overrides?: { prompt?: string; hint?: string }): void;
};

type GoogleOAuth2 = {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type: string; message?: string }) => void;
    /** 이미 허용한 scope를 함께 포함할지 (증분 권한) */
    include_granted_scopes?: boolean;
    /** 계정 선택 힌트 (이메일) */
    hint?: string;
  }): GoogleTokenClient;
  /** 사용자가 요청한 scope를 모두 허용했는지 (세부 동의 화면에서 일부만 허용할 수 있음) */
  hasGrantedAllScopes(response: GoogleTokenResponse, ...scopes: string[]): boolean;
  revoke(accessToken: string, done?: () => void): void;
};

type GoogleNamespace = { accounts: { oauth2: GoogleOAuth2 } };

declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let loading: Promise<GoogleNamespace> | null = null;

export const loadGoogleIdentity = (): Promise<GoogleNamespace> => {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise<GoogleNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error("Google Identity Services를 초기화하지 못했어요."));
    };
    script.onerror = () => reject(new Error("Google Identity Services를 불러오지 못했어요."));
    document.head.appendChild(script);
  }).catch((err: Error) => {
    loading = null; // 다음 시도에서 다시 불러온다.
    throw err;
  });
  return loading;
};

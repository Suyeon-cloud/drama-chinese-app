// Gmail 실제 발송 (Gmail API users.messages.send).
//
// - 로그인용 토큰 클라이언트(authService)와 분리된 별도 토큰 클라이언트를 쓴다.
//   로그인 scope(openid email profile)는 그대로 두고, 교수자가 ‘Gmail로 보내기’를 누를 때만 gmail.send를 요청한다.
// - access token은 이 모듈의 메모리 변수에만 둔다. localStorage·sessionStorage·피드백 데이터·로그에 남기지 않는다.
// - Client Secret·refresh token은 쓰지 않는다. (브라우저 토큰 모델)
// - 발송 계정(토큰의 Google 계정)이 로그인한 교수자 이메일과 다르면 발송하지 않는다.

import { loadGoogleIdentity, type GoogleTokenClient, type GoogleTokenResponse } from "./googleIdentity";
import { getGoogleClientId } from "../lib/runtimeConfig";
import { normalizeEmail } from "./roles";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
// email: 발송 계정 확인용 (로그인 때 이미 허용한 기본 scope라 추가 동의가 생기지 않는다)
const SCOPES = `email ${GMAIL_SEND_SCOPE}`;
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
/** 만료 직전 토큰은 다시 받는다. */
const EXPIRY_MARGIN_MS = 60_000;

export type GmailErrorCode =
  | "not-configured"
  | "script-failed"
  | "popup-blocked"
  | "cancelled"
  | "denied"
  | "account-mismatch"
  | "invalid-recipient"
  | "invalid-subject"
  | "token-expired"
  | "send-failed"
  | "unknown";

export class GmailError extends Error {
  readonly code: GmailErrorCode;
  constructor(code: GmailErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

export const GMAIL_ERROR_MESSAGE: Record<GmailErrorCode, string> = {
  "not-configured": "Google 설정(GOOGLE_CLIENT_ID)이 없어 Gmail로 보낼 수 없어요.",
  "script-failed": "Google 서비스를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  "popup-blocked": "Gmail 권한 팝업이 차단되었어요. 브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.",
  cancelled: "Gmail 권한 요청이 취소되었어요. 메일은 보내지 않았어요.",
  denied: "Gmail 발송 권한이 허용되지 않았어요. 권한 화면에서 ‘Gmail 메일 보내기’를 허용해야 보낼 수 있어요. 메일은 보내지 않았어요.",
  "account-mismatch":
    "권한을 허용한 Google 계정이 지금 로그인한 교수자 계정과 달라요. 같은 계정을 선택해 다시 시도해 주세요. 메일은 보내지 않았어요.",
  "invalid-recipient": "받는 사람 이메일 형식이 올바르지 않아요. 메일은 보내지 않았어요.",
  "invalid-subject": "제목을 입력해 주세요. 메일은 보내지 않았어요.",
  "token-expired": "Gmail 권한이 만료되었어요. 다시 눌러 권한을 받아 주세요. 메일은 보내지 않았어요.",
  "send-failed": "Gmail이 발송을 거절했어요. 메일은 보내지 않았어요.",
  unknown: "전송 여부를 확인할 수 없습니다. Gmail 보낸편지함을 확인해주세요.",
};

/* ───────── 입력 정리·검증 ───────── */

/** 헤더 주입 방지: CR/LF 제거 + 앞뒤 공백 정리 */
export const stripLineBreaks = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]+$/;
/** 받는 사람 1명의 이메일 형식 확인 */
export const isValidEmail = (s: string) => EMAIL_RE.test(s);

/* ───────── 토큰 (메모리 전용) ───────── */

type GmailAuth = { token: string; expiresAt: number; email: string };

let cached: GmailAuth | null = null;
let client: GoogleTokenClient | null = null;
let pending: { resolve: (r: GoogleTokenResponse) => void; reject: (e: GmailError) => void } | null = null;

const settle = (fn: (p: NonNullable<typeof pending>) => void) => {
  const p = pending;
  pending = null;
  if (p) fn(p);
};

const revokeToken = (token: string) => {
  try {
    window.google?.accounts.oauth2.revoke(token);
  } catch {
    // 폐기 요청 실패는 무시 (메모리에서는 이미 지움)
  }
};

const getClient = async (): Promise<GoogleTokenClient> => {
  if (client) return client;
  const google = await loadGoogleIdentity();
  client = google.accounts.oauth2.initTokenClient({
    client_id: getGoogleClientId(),
    scope: SCOPES,
    include_granted_scopes: true,
    callback: (r) => settle((p) => p.resolve(r)),
    error_callback: (e) =>
      settle((p) =>
        p.reject(
          new GmailError(
            e.type === "popup_failed_to_open" ? "popup-blocked" : e.type === "popup_closed" ? "cancelled" : "denied",
          ),
        ),
      ),
  });
  return client;
};

/** 토큰 응답 → 권한·계정 확인 후 메모리에 보관 */
const acceptToken = async (r: GoogleTokenResponse, expectedEmail: string): Promise<GmailAuth> => {
  if (r.error || !r.access_token) throw new GmailError(r.error === "access_denied" ? "denied" : "denied");
  const token = r.access_token;
  const google = window.google;
  if (google && !google.accounts.oauth2.hasGrantedAllScopes(r, GMAIL_SEND_SCOPE)) {
    revokeToken(token);
    throw new GmailError("denied");
  }
  let email = "";
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) email = normalizeEmail(((await res.json()) as { email?: string }).email ?? "");
  } catch {
    // 아래에서 계정 불일치로 처리
  }
  // 관리자 계정(아이디·비밀번호 로그인)에 발송 이메일이 없으면 고른 Google 계정으로 보낸다.
  if (!email || (expectedEmail && email !== normalizeEmail(expectedEmail))) {
    revokeToken(token);
    throw new GmailError("account-mismatch");
  }
  const seconds = Number(r.expires_in) || 3600;
  cached = { token, email, expiresAt: Date.now() + seconds * 1000 };
  return cached;
};

export const gmailService = {
  get configured() {
    return getGoogleClientId() !== "";
  },

  /** 화면에 들어올 때 미리 준비 (버튼 클릭 시 팝업이 바로 열리도록) */
  prepare() {
    if (getGoogleClientId()) void getClient().catch(() => undefined);
  },

  /**
   * gmail.send 권한 토큰을 얻는다. 버튼 클릭 핸들러에서 ‘동기적으로’ 호출해야 팝업이 차단되지 않는다.
   * 같은 교수자의 유효한 토큰이 메모리에 있으면 그대로 쓴다.
   */
  authorize(expectedEmail: string): Promise<GmailAuth> {
    if (!getGoogleClientId()) return Promise.reject(new GmailError("not-configured"));
    const email = normalizeEmail(expectedEmail);
    if (cached && (!email || cached.email === email) && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return Promise.resolve(cached);
    }
    gmailService.clear();
    const response = new Promise<GoogleTokenResponse>((resolve, reject) => {
      settle((p) => p.reject(new GmailError("cancelled"))); // 이전 요청 정리
      pending = { resolve, reject };
      const request = (c: GoogleTokenClient) => c.requestAccessToken(email ? { prompt: "", hint: email } : { prompt: "select_account" });
      if (client) request(client);
      else
        getClient()
          .then(request)
          .catch(() => settle((p) => p.reject(new GmailError("script-failed"))));
    });
    return response.then((r) => acceptToken(r, email));
  },

  /**
   * 메일 발송. Gmail이 성공 응답과 message id를 돌려준 경우에만 { id }를 반환한다.
   * 결과를 확정할 수 없으면 "unknown", 확실한 실패면 해당 코드로 실패한다.
   */
  async send(auth: GmailAuth, message: { to: string; subject: string; body: string }): Promise<{ id: string }> {
    const to = stripLineBreaks(message.to);
    const subject = stripLineBreaks(message.subject);
    if (!isValidEmail(to)) throw new GmailError("invalid-recipient");
    if (!subject) throw new GmailError("invalid-subject");

    let res: Response;
    try {
      res = await fetch(SEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: buildRawMessage(to, subject, message.body) }),
      });
    } catch {
      // 요청이 Gmail에 도착했는지 알 수 없다.
      throw new GmailError("unknown");
    }
    if (res.ok) {
      try {
        const data = (await res.json()) as { id?: string };
        if (data.id) return { id: data.id };
      } catch {
        // 아래 unknown
      }
      throw new GmailError("unknown");
    }
    if (res.status === 401) {
      gmailService.clear();
      throw new GmailError("token-expired");
    }
    if (res.status === 403) throw new GmailError("denied", await errorDetail(res));
    if (res.status >= 500) throw new GmailError("unknown", `HTTP ${res.status}`);
    throw new GmailError("send-failed", await errorDetail(res));
  },

  /** 로그아웃 시: 토큰이 있으면 폐기하고 메모리에서 지운다. */
  clear() {
    settle((p) => p.reject(new GmailError("cancelled")));
    if (cached) revokeToken(cached.token);
    cached = null;
  },
};

/** Gmail 오류 응답의 사용자용 메시지 (토큰 등 민감정보는 포함되지 않음) */
const errorDetail = async (res: Response) => {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
};

/* ───────── RFC 2822 메시지 (UTF-8) ───────── */

const bytesToBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

const utf8Base64 = (text: string) => bytesToBase64(new TextEncoder().encode(text));

/** 한글 등 비 ASCII 제목은 RFC 2047 encoded-word로 */
const encodeHeader = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${utf8Base64(text)}?=`);

const buildRawMessage = (to: string, subject: string, body: string) => {
  const content = (utf8Base64(body.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g) ?? []).join("\r\n");
  const mime = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    content,
  ].join("\r\n");
  // Gmail API raw: base64url
  return utf8Base64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

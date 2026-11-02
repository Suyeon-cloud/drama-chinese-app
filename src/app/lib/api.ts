// 서버 API(/api/*) 호출 헬퍼. 로그인은 서버가 준 쿠키로 유지된다.

export class ApiError extends Error {
  readonly status: number;
  /** 오류 응답 본문 (예: 학습자료 동시 편집 충돌의 conflict 정보) */
  readonly data: unknown;
  constructor(status: number, message: string, data: unknown = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** 학습자료 저장 409(다른 사람이 먼저 저장)일 때 서버가 알려준 정보 */
export type LessonConflict = { currentVersion: number | null; updatedAt: string | null; updatedByLabel: string | null };
export const lessonConflictOf = (err: unknown): LessonConflict | null => {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const c = (err.data as { conflict?: LessonConflict } | null)?.conflict;
  return c && typeof c === "object" ? c : null;
};

/** AUTH_BACKEND=supabase: 학생·교수자 요청에 붙일 Supabase access token (없으면 쿠키만) */
let tokenProvider: (() => Promise<string | null>) | null = null;
/** 기다리지 않고 바로 쓸 수 있는 token. 있으면 요청을 같은 순간에 보낸다. (화면을 떠날 때의 keepalive 저장) */
let tokenPeek: (() => string | null) | null = null;
export const setApiTokenProvider = (provider: (() => Promise<string | null>) | null, peek: (() => string | null) | null = null) => {
  tokenProvider = provider;
  tokenPeek = peek;
};

export const api = async <T>(
  path: string,
  init: { method?: string; body?: unknown; keepalive?: boolean } = {},
): Promise<T> => {
  let res: Response;
  try {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    // 메모리의 유효한 token이 있으면 기다리지 않는다. (await 없이 아래 fetch까지 바로 실행된다)
    const token = tokenPeek?.() ?? (tokenProvider ? await tokenProvider().catch(() => null) : null);
    if (token) headers.Authorization = `Bearer ${token}`;
    res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      keepalive: init.keepalive,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "요청을 처리하지 못했어요.", data);
  return data as T;
};

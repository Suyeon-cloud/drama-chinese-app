// 로컬 자막 API(/api/youtube/*) 호출. 서버는 `npm run app`(Vite 개발 서버)에서 함께 실행된다.

import type {
  CaptionErrorCode,
  CaptionErrorResponse,
  CaptionInfoResponse,
  CaptionLang,
  CaptionTrackResponse,
} from "./captionTypes";

export type CaptionFailure = { code: CaptionErrorCode; detail?: string };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: CaptionFailure };

const request = async <T extends { ok: true }>(path: string): Promise<ApiResult<T>> => {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Accept: "application/json" } });
  } catch {
    return { ok: false, error: { code: "api-unavailable" } };
  }
  // 정적 빌드처럼 로컬 API가 없으면 JSON이 아닌 응답(HTML/404)이 온다.
  if (!(res.headers.get("Content-Type") ?? "").includes("application/json")) {
    return { ok: false, error: { code: "api-unavailable" } };
  }
  try {
    const body = (await res.json()) as T | CaptionErrorResponse;
    if (body.ok) return { ok: true, data: body as T };
    return { ok: false, error: { code: body.code, detail: body.detail } };
  } catch {
    return { ok: false, error: { code: "api-error" } };
  }
};

export const fetchCaptionInfo = (videoId: string, lang: CaptionLang) =>
  request<CaptionInfoResponse>(
    `/api/youtube/info?v=${encodeURIComponent(videoId)}&lang=${lang}`,
  );

export const fetchCaptionTrack = (videoId: string, lang: CaptionLang, trackId: string) =>
  request<CaptionTrackResponse>(
    `/api/youtube/captions?v=${encodeURIComponent(videoId)}&lang=${lang}&track=${encodeURIComponent(trackId)}`,
  );

export const LANG_NAME: Record<CaptionLang, string> = { zh: "중국어", ko: "한국어" };

/** 실패 안내: 제목(무엇이 안 되었는지) + 이유 */
export const describeCaptionFailure = (
  error: CaptionFailure,
  lang: CaptionLang,
  otherLanguages: string[] = [],
): { title: string; reason: string } => {
  const name = LANG_NAME[lang];
  const reasons: Record<CaptionErrorCode, string> = {
    "invalid-request": "YouTube URL(영상 ID)을 확인해 주세요.",
    "video-unavailable": "영상을 찾을 수 없거나 공개되지 않은(또는 재생이 제한된) 영상이에요.",
    "no-captions":
      "이 영상에는 공개된 자막 트랙이 없어요. 화면에 박혀 있는 자막은 자동으로 가져올 수 없어요.",
    "no-language": `이 영상에는 ${name} 원문 자막 트랙이 없습니다.${
      otherLanguages.length ? ` (있는 자막: ${otherLanguages.join(", ")})` : ""
    } 자동 번역 자막은 원문으로 사용하지 않아요.`,
    "track-not-found": "선택한 자막 트랙을 찾을 수 없어요. ‘영상 확인’을 다시 눌러 주세요.",
    "empty-track": "YouTube가 자막 데이터를 제공하지 않았어요. (YouTube 응답 변경 또는 접근 불가)",
    "youtube-changed": "YouTube 응답 형식이 바뀌었거나 자막 정보에 접근할 수 없어요.",
    network: "YouTube에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.",
    "api-unavailable":
      "로컬 자막 API에 연결하지 못했어요. 터미널에서 `npm run app`으로 실행했는지 확인해 주세요.",
    "api-error": "로컬 자막 API에서 오류가 발생했어요.",
  };
  return {
    title: `이 영상의 ${name} 자막을 자동으로 가져오지 못했습니다.`,
    reason: reasons[error.code],
  };
};

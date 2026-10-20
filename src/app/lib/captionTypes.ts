// 로컬 자막 API(server/)와 브라우저(captionsApi.ts)가 함께 쓰는 응답 형식.
// 타입만 있으므로 서버 코드가 브라우저 번들에 들어가지 않는다.

/** 원문 언어: 1~8주차 중국어, 9~15주차 한국어 */
export type CaptionLang = "zh" | "ko";

/** manual: 업로더가 올린 자막, asr: YouTube 자동 생성 자막 */
export type CaptionKind = "manual" | "asr";

export type CaptionTrackSummary = {
  /** 트랙 식별자 (YouTube vssId 등) */
  id: string;
  languageCode: string;
  /** YouTube에 표시되는 트랙 이름 */
  name: string;
  kind: CaptionKind;
};

export type CaptionVideoInfo = {
  videoId: string;
  title: string;
  author: string;
  lengthSeconds: number | null;
  /** false면 외부 사이트(이 앱) 재생이 제한된 영상 */
  playableInEmbed: boolean | null;
};

export type CaptionInfoResponse = {
  ok: true;
  video: CaptionVideoInfo;
  lang: CaptionLang;
  /** 요청한 원문 언어의 트랙 (우선순위 순). 자동 번역 트랙은 포함하지 않는다. */
  tracks: CaptionTrackSummary[];
  recommendedTrackId: string | null;
  /** 영상에 자막 트랙이 하나라도 있는지 */
  hasAnyCaptions: boolean;
  /** 요청 언어 외에 있는 자막 언어 이름 (안내용) */
  otherLanguages: string[];
};

/** 정규화된 cue — lib/subtitles.ts의 ParsedCue와 같은 형태 */
export type CaptionCue = { start: number; end: number; text: string };

export type CaptionTrackResponse = {
  ok: true;
  track: CaptionTrackSummary;
  cues: CaptionCue[];
};

export type CaptionErrorCode =
  | "invalid-request"
  | "video-unavailable"
  | "no-captions"
  | "no-language"
  | "track-not-found"
  | "empty-track"
  | "youtube-changed"
  | "network"
  | "api-unavailable"
  | "api-error";

export type CaptionErrorResponse = {
  ok: false;
  code: CaptionErrorCode;
  detail?: string;
};

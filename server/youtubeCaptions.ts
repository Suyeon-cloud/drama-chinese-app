// YouTube 영상의 공개 자막 트랙을 찾아 시간·텍스트 cue로 정규화한다. (Vite 개발 서버에서 실행)
//
// - 영상 페이지에 공개적으로 포함된 자막 목록(captionTracks)만 사용한다.
// - 로그인 쿠키, PO token, 다른 클라이언트 위장 등 접근 제한 우회는 하지 않는다.
//   YouTube가 자막 데이터를 주지 않으면 그대로 실패로 처리한다.
// - 자동 번역(tlang) 트랙은 원문이 아니므로 사용하지 않는다.
// - 공식 API가 아니므로 YouTube 페이지 구조가 바뀌면 동작하지 않을 수 있다.

import type {
  CaptionCue,
  CaptionErrorCode,
  CaptionInfoResponse,
  CaptionKind,
  CaptionLang,
  CaptionTrackResponse,
  CaptionTrackSummary,
  CaptionVideoInfo,
} from "../src/app/lib/captionTypes";

export class CaptionError extends Error {
  readonly code: CaptionErrorCode;
  constructor(code: CaptionErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const TIMEOUT_MS = 12000;

export const isVideoId = (id: string) => VIDEO_ID_RE.test(id);
export const isCaptionLang = (lang: string): lang is CaptionLang => lang === "zh" || lang === "ko";

type RawTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  vssId?: string;
  name?: { simpleText?: string; runs?: { text?: string }[] };
};

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string; playableInEmbed?: boolean };
  videoDetails?: { videoId?: string; title?: string; author?: string; lengthSeconds?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: RawTrack[] } };
};

type Track = CaptionTrackSummary & { baseUrl: string };

const fetchText = async (url: string): Promise<{ ok: boolean; status: number; text: string }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept-Language": "ko-KR,ko;q=0.9,zh-CN;q=0.8,en;q=0.6" },
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch {
    throw new CaptionError("network");
  } finally {
    clearTimeout(timer);
  }
};

/** html에서 `marker` 뒤의 JSON 객체 하나를 중괄호 짝을 맞춰 잘라낸다. */
const extractJsonObject = (html: string, marker: string): unknown => {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
};

const loadPlayerResponse = async (videoId: string): Promise<PlayerResponse> => {
  const page = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=ko`);
  if (!page.ok) throw new CaptionError(page.status === 404 ? "video-unavailable" : "youtube-changed");
  const player = extractJsonObject(page.text, "ytInitialPlayerResponse =") as PlayerResponse | null;
  if (!player) throw new CaptionError("youtube-changed", "player response not found");
  const status = player.playabilityStatus?.status;
  if (status && status !== "OK" && !player.captions) {
    throw new CaptionError("video-unavailable", player.playabilityStatus?.reason);
  }
  return player;
};

const trackName = (t: RawTrack) =>
  t.name?.simpleText ?? t.name?.runs?.map((r) => r.text ?? "").join("") ?? t.languageCode ?? "";

const toTracks = (player: PlayerResponse): Track[] =>
  (player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [])
    .filter((t): t is RawTrack & { baseUrl: string; languageCode: string } => !!t.baseUrl && !!t.languageCode)
    .map((t, i) => {
      const kind: CaptionKind = t.kind === "asr" ? "asr" : "manual";
      return {
        id: t.vssId || `${kind}:${t.languageCode}:${i}`,
        languageCode: t.languageCode,
        name: trackName(t),
        kind,
        baseUrl: t.baseUrl,
      };
    });

const matchesLang = (code: string, lang: CaptionLang) =>
  lang === "zh" ? /^zh(-|$)/i.test(code) : /^ko(-|$)/i.test(code);

/** 수동 자막 → 자동 생성 자막. 중국어는 간체 → 번체 순. */
const rank = (t: Track): number => {
  const asr = t.kind === "asr" ? 10 : 0;
  const traditional = /^zh-(hant|tw|hk|mo)/i.test(t.languageCode) ? 1 : 0;
  return asr + traditional;
};

const tracksFor = (tracks: Track[], lang: CaptionLang) =>
  tracks.filter((t) => matchesLang(t.languageCode, lang)).sort((a, b) => rank(a) - rank(b));

const summary = ({ id, languageCode, name, kind }: Track): CaptionTrackSummary => ({
  id,
  languageCode,
  name,
  kind,
});

const videoInfo = (videoId: string, player: PlayerResponse): CaptionVideoInfo => {
  const len = Number(player.videoDetails?.lengthSeconds);
  return {
    videoId,
    title: player.videoDetails?.title ?? "",
    author: player.videoDetails?.author ?? "",
    lengthSeconds: Number.isFinite(len) ? len : null,
    playableInEmbed: player.playabilityStatus?.playableInEmbed ?? null,
  };
};

export const getCaptionInfo = async (videoId: string, lang: CaptionLang): Promise<CaptionInfoResponse> => {
  const player = await loadPlayerResponse(videoId);
  const all = toTracks(player);
  const matched = tracksFor(all, lang);
  const others = all
    .filter((t) => !matchesLang(t.languageCode, lang))
    .map((t) => t.name || t.languageCode);
  return {
    ok: true,
    video: videoInfo(videoId, player),
    lang,
    tracks: matched.map(summary),
    recommendedTrackId: matched[0]?.id ?? null,
    hasAnyCaptions: all.length > 0,
    otherLanguages: others.filter((n, i) => others.indexOf(n) === i),
  };
};

/* ───────── 자막 데이터 → cue ───────── */

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

/** 태그 제거 + 엔티티 해제(이중 인코딩 대비 2회) + 공백 정리 */
const cleanText = (raw: string) =>
  decodeEntities(decodeEntities(raw.replace(/<[^>]+>/g, "")))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * YouTube timedtext XML을 cue로 변환한다.
 * - 기본 형식: <text start="초" dur="초">…</text>
 * - format 3: <p t="ms" d="ms">…</p>
 * 다음 cue와 겹치면 다음 cue 시작에서 자른다. (자동 생성 자막은 겹치는 경우가 많다)
 */
export const parseTimedText = (xml: string): CaptionCue[] => {
  const raw: { start: number; dur: number | null; text: string }[] = [];
  for (const m of xml.matchAll(/<text\b[^>]*\bstart="([\d.]+)"(?:[^>]*\bdur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) {
    raw.push({ start: Number(m[1]), dur: m[2] ? Number(m[2]) : null, text: cleanText(m[3]) });
  }
  if (raw.length === 0) {
    for (const m of xml.matchAll(/<p\b[^>]*\bt="(\d+)"(?:[^>]*\bd="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g)) {
      raw.push({ start: Number(m[1]) / 1000, dur: m[2] ? Number(m[2]) / 1000 : null, text: cleanText(m[3]) });
    }
  }
  const items = raw.filter((r) => r.text && Number.isFinite(r.start)).sort((a, b) => a.start - b.start);
  const cues: CaptionCue[] = [];
  items.forEach((r, i) => {
    const next = items[i + 1]?.start;
    let end = r.dur !== null && r.dur > 0 ? r.start + r.dur : (next ?? r.start + 2);
    if (next !== undefined && end > next) end = next;
    if (end > r.start) cues.push({ start: r.start, end, text: r.text });
  });
  return cues;
};

export const getCaptionTrack = async (
  videoId: string,
  lang: CaptionLang,
  trackId: string,
): Promise<CaptionTrackResponse> => {
  const player = await loadPlayerResponse(videoId);
  const track = tracksFor(toTracks(player), lang).find((t) => t.id === trackId);
  if (!track) throw new CaptionError("track-not-found");

  const url = new URL(track.baseUrl);
  if (url.hostname !== "www.youtube.com" && url.hostname !== "youtube.com") {
    throw new CaptionError("youtube-changed", "unexpected caption host");
  }
  url.searchParams.delete("fmt"); // 기본 XML 형식
  url.searchParams.delete("tlang"); // 자동 번역 사용 안 함
  const res = await fetchText(url.toString());
  if (!res.ok) throw new CaptionError("empty-track", `HTTP ${res.status}`);
  if (!res.text.trim()) throw new CaptionError("empty-track");
  const cues = parseTimedText(res.text);
  if (cues.length === 0) throw new CaptionError("youtube-changed", "no cues parsed");
  return { ok: true, track: summary(track), cues };
};

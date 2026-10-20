// Vite 개발/미리보기 서버에 로컬 자막 API를 붙이는 플러그인.
// `npm run app` 하나로 프런트엔드와 /api/youtube/* 가 함께 실행된다. (정적 빌드 결과물에는 포함되지 않음)
//
//   GET /api/youtube/info?v={videoId}&lang=zh|ko
//   GET /api/youtube/captions?v={videoId}&lang=zh|ko&track={trackId}

import type { Connect, Plugin } from "vite";
import type { CaptionErrorCode, CaptionErrorResponse } from "../src/app/lib/captionTypes";
import { CaptionError, getCaptionInfo, getCaptionTrack, isCaptionLang, isVideoId } from "./youtubeCaptions";

const STATUS: Record<CaptionErrorCode, number> = {
  "invalid-request": 400,
  "video-unavailable": 404,
  "no-captions": 404,
  "no-language": 404,
  "track-not-found": 404,
  "empty-track": 502,
  "youtube-changed": 502,
  network: 504,
  "api-unavailable": 503,
  "api-error": 500,
};

const sendJson = (res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const fail = (res: Parameters<Connect.NextHandleFunction>[1], code: CaptionErrorCode, detail?: string) => {
  const body: CaptionErrorResponse = { ok: false, code, detail };
  sendJson(res, STATUS[code], body);
};

const handler: Connect.NextHandleFunction = (req, res, next) => {
  if (req.method !== "GET") return next();
  const url = new URL(req.url ?? "/", "http://localhost");
  const route = url.pathname.replace(/\/+$/, "");
  if (route !== "/info" && route !== "/captions") return next();

  const videoId = url.searchParams.get("v") ?? "";
  const lang = url.searchParams.get("lang") ?? "";
  if (!isVideoId(videoId) || !isCaptionLang(lang)) return fail(res, "invalid-request");

  const work =
    route === "/info"
      ? getCaptionInfo(videoId, lang)
      : (() => {
          const track = url.searchParams.get("track") ?? "";
          if (!track || track.length > 100) throw new CaptionError("invalid-request");
          return getCaptionTrack(videoId, lang, track);
        })();

  Promise.resolve(work)
    .then((body) => sendJson(res, 200, body))
    .catch((err: unknown) => {
      if (err instanceof CaptionError) fail(res, err.code, err.message);
      else fail(res, "api-error");
    });
};

const safeHandler: Connect.NextHandleFunction = (req, res, next) => {
  try {
    handler(req, res, next);
  } catch (err) {
    if (err instanceof CaptionError) fail(res, err.code, err.message);
    else fail(res, "api-error");
  }
};

export const youtubeCaptionsPlugin = (): Plugin => ({
  name: "zhuiju-youtube-captions",
  configureServer(server) {
    server.middlewares.use("/api/youtube", safeHandler);
  },
  configurePreviewServer(server) {
    server.middlewares.use("/api/youtube", safeHandler);
  },
});

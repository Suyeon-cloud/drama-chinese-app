import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCaptionInfo, type ApiResult, type CaptionFailure } from "../../lib/captionsApi";
import type { CaptionInfoResponse, CaptionLang } from "../../lib/captionTypes";

export type CaptionLookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; info: CaptionInfoResponse }
  | { status: "error"; error: CaptionFailure };

/** 영상 확인: 영상 정보와 원문 언어 자막 트랙 목록. 영상 ID나 원문 언어가 바뀌면 초기화된다. */
export const useCaptionLookup = (videoId: string | null, lang: CaptionLang) => {
  const [state, setState] = useState<CaptionLookupState>({ status: "idle" });
  const key = `${videoId ?? ""}:${lang}`;
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
    setState({ status: "idle" });
  }, [key]);

  const check = useCallback(async (): Promise<ApiResult<CaptionInfoResponse>> => {
    if (!videoId) return { ok: false, error: { code: "invalid-request" } };
    const requestKey = `${videoId}:${lang}`;
    setState({ status: "loading" });
    const result = await fetchCaptionInfo(videoId, lang);
    if (keyRef.current === requestKey) {
      setState(result.ok ? { status: "ready", info: result.data } : { status: "error", error: result.error });
    }
    return result;
  }, [videoId, lang]);

  return { state, check };
};

export type CaptionLookup = ReturnType<typeof useCaptionLookup>;

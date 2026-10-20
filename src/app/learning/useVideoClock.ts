import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// Minimal typings for the YouTube IFrame Player API (no extra @types package needed).
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_PLAYING = 1;

let apiPromise: Promise<YTNamespace> | null = null;

const loadYouTubeApi = (): Promise<YTNamespace> => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube IFrame API를 불러오지 못했어요."));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
};

/** 영상 재생 상태를 추상화한 인터페이스. 학습 overlay는 이 값만 보고 동작한다. */
export type VideoClock = {
  ready: boolean;
  playing: boolean;
  /** seconds */
  time: number;
  error: string | null;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
};

const POLL_MS = 150;

export const useYouTubeClock = (
  hostRef: RefObject<HTMLDivElement | null>,
  videoId: string,
  startAt: number,
): VideoClock => {
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(startAt);
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef(startAt);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let timer: number | undefined;
    const mount = document.createElement("div");
    host.appendChild(mount);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            start: Math.floor(startRef.current),
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            // YouTube 자체 전체화면은 iframe만 전체화면이 되어 학습 오버레이가 사라지므로 끈다.
            // 대신 앱의 학습 전체화면(useFullscreen)을 사용한다.
            fs: 0,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
              timer = window.setInterval(() => {
                const t = playerRef.current?.getCurrentTime();
                if (typeof t === "number") setTime(t);
              }, POLL_MS);
            },
            onStateChange: (e) => setPlaying(e.data === YT_PLAYING),
            onError: (e) =>
              setError(
                e.data === 101 || e.data === 150
                  ? "이 영상은 외부 사이트 재생이 제한되어 있어요."
                  : `영상을 재생할 수 없어요. (code ${e.data})`,
              ),
          },
        });
      })
      .catch((err: Error) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
      mount.remove();
    };
  }, [hostRef, videoId]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const seekTo = useCallback((s: number) => {
    playerRef.current?.seekTo(s, true);
    setTime(s);
  }, []);

  return { ready, playing, time, error, play, pause, seekTo };
};

/**
 * YouTube를 재생할 수 없을 때(임베드 제한, 오프라인 등) 사용하는 시뮬레이션 시계.
 * 영상 없이도 시간 기반 overlay·문화 렌즈·복습 퀴즈 흐름을 확인할 수 있다.
 */
export const useSimulatedClock = (startAt: number, enabled: boolean): VideoClock => {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(startAt);

  useEffect(() => {
    if (!enabled || !playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      setTime((t) => t + (now - last) / 1000);
      last = now;
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, playing]);

  return {
    ready: enabled,
    playing: enabled && playing,
    time,
    error: null,
    play: useCallback(() => setPlaying(true), []),
    pause: useCallback(() => setPlaying(false), []),
    seekTo: useCallback((s: number) => setTime(s), []),
  };
};

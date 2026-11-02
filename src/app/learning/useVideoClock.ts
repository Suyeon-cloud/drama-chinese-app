import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// Minimal typings for the YouTube IFrame Player API (no extra @types package needed).
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
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
  /** 영상 전체 길이(초). 알 수 없으면 0 */
  duration: number;
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
  const [duration, setDuration] = useState(0);
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
                const d = playerRef.current?.getDuration();
                if (typeof d === "number" && d > 0) setDuration(d);
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

  return { ready, playing, time, duration, error, play, pause, seekTo };
};

/** 끝 시각을 넘어선 지 이만큼 안이면 재생이 구간 끝에 닿은 것으로 본다. 더 멀면 사용자가 옮긴 것이다. */
const SEGMENT_OVERSHOOT_SEC = 1.5;
/** 이동 직후 이전 위치가 읽히는 동안에는 판단하지 않는다. */
const SEGMENT_SETTLE_MS = 500;

export type Segment = { start: number; end: number };

/** 구간 재생 중 현재 위치: inside 재생 계속 / end 끝에 닿음 / left 사용자가 다른 곳으로 옮김 */
export const segmentPosition = (time: number, { start, end }: Segment): "inside" | "end" | "left" => {
  if (time >= end) return time < end + SEGMENT_OVERSHOOT_SEC ? "end" : "left";
  return time < start - SEGMENT_OVERSHOOT_SEC ? "left" : "inside";
};

/** 시청 기록에 넣을 구간. 회화 연습 재생·정지·이동(큰 시간 차이)·학습 구간 밖은 null이다. */
export const watchedStep = (
  prev: number | null,
  time: number,
  { playing, practice, startTime, endTime, maxStep }: {
    playing: boolean;
    practice: boolean;
    startTime: number;
    endTime: number;
    maxStep: number;
  },
): [number, number] | null => {
  if (!playing || practice || prev === null) return null;
  const step = time - prev;
  if (step <= 0 || step > maxStep) return null;
  const a = Math.max(startTime, prev);
  const b = Math.min(endTime, time);
  return b > a ? [a, b] : null;
};

/**
 * 회화 연습이 학습 구간 끝을 넘겨 멈춘 상태를 유지할지 판단한다.
 * 연습이 끝난 뒤 구간 안으로 돌아오거나 학생이 직접 다시 재생하면 일반 학습으로 돌아간다.
 */
export const holdsPracticeEnd = (
  held: boolean,
  { practice, playing, time, endTime }: { practice: boolean; playing: boolean; time: number; endTime: number },
) => held && (practice || (!playing && time >= endTime));

/** 학습 구간 끝에 닿아 학습 완료로 처리할 때인지 판단한다. */
export const reachedLessonEnd = ({
  completed,
  ready,
  time,
  endTime,
  practiceHeld,
}: {
  completed: boolean;
  ready: boolean;
  time: number;
  endTime: number;
  practiceHeld: boolean;
}) => !completed && ready && time >= endTime && !practiceHeld;

export type SegmentPlayback = {
  active: boolean;
  /** 회화 연습 재생 중이거나 그 재생이 실제로 멈추는 중. 이 동안의 재생은 시청 기록에서 뺀다. */
  practice: boolean;
  play(start: number, end: number): void;
  stop(): void;
};

/** 영상의 한 구간만 재생하고 끝에서 멈춘다. 사용자가 다른 곳으로 옮기면 그대로 두고 추적만 끝낸다. */
export const useSegmentPlayback = ({ time, playing, seekTo, play: playClock, pause }: VideoClock): SegmentPlayback => {
  const [segment, setSegment] = useState<Segment | null>(null);
  // 멈춤 요청 후 플레이어가 실제로 멈출 때까지 잠깐 더 재생될 수 있다.
  const [stopping, setStopping] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!segment || performance.now() - startedAt.current < SEGMENT_SETTLE_MS) return;
    const at = segmentPosition(time, segment);
    if (at === "end") {
      setStopping(true);
      pause();
    }
    if (at !== "inside") setSegment(null);
  }, [segment, time, pause]);

  useEffect(() => {
    if (stopping && !playing) setStopping(false);
  }, [stopping, playing]);

  const play = useCallback(
    (start: number, end: number) => {
      startedAt.current = performance.now();
      setSegment({ start, end });
      seekTo(start);
      playClock();
    },
    [seekTo, playClock],
  );
  const stop = useCallback(() => {
    setStopping(true);
    pause();
    setSegment(null);
  }, [pause]);

  return { active: segment !== null, practice: segment !== null || stopping, play, stop };
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
    duration: 0,
    error: null,
    play: useCallback(() => setPlaying(true), []),
    pause: useCallback(() => setPlaying(false), []),
    seekTo: useCallback((s: number) => setTime(s), []),
  };
};

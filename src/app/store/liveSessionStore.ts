// 6-B: 실시간 퀴즈 세션 API + 동기화 훅 (Realtime Broadcast 신호 + 폴링 fallback)
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveAction, LiveHostState, LiveHostSummary, LiveStudentState } from "../../content/liveSession";
import { api, ApiError } from "../lib/api";
import { getSupabase } from "../lib/supabase";

const enc = encodeURIComponent;
export const liveSessionStore = {
  start: (setId: string, sectionId: string) => api<LiveHostState>("/live/sessions", { method: "POST", body: { setId, sectionId } }),
  control: (sessionId: string, action: LiveAction, version: number) =>
    api<LiveHostState>(`/live/sessions/${enc(sessionId)}/control`, { method: "POST", body: { action, version } }),
  host: (sessionId: string) => api<LiveHostState>(`/live/sessions/${enc(sessionId)}/host`),
  hostSessions: (courseId: string) => api<LiveHostSummary[]>(`/courses/${enc(courseId)}/live/sessions`),
  join: (code: string) => api<LiveStudentState>("/live/join", { method: "POST", body: { code } }),
  state: (sessionId: string) => api<LiveStudentState>(`/live/sessions/${enc(sessionId)}/state`),
  submit: (sessionId: string, questionIndex: number, choice: number) =>
    api<LiveStudentState>(`/live/sessions/${enc(sessionId)}/answers`, { method: "POST", body: { questionIndex, choice } }),
};

export type LiveSync<T> = {
  state: T | null;
  error: ApiError | null;
  /** 마지막 갱신이 실패했는지 (네트워크 지연 표시용, 이전 상태는 그대로 보여 준다) */
  stale: boolean;
  realtime: boolean;
  refresh: () => Promise<void>;
  setState: (s: T) => void;
};

/**
 * 서버 상태를 계속 맞춘다: Supabase Realtime Broadcast 신호(버전 번호만)를 받으면 즉시, 그 밖에는 주기적으로 다시 읽는다.
 * Realtime이 연결되면 5초, 아니면 2초, 탭이 가려져 있으면 8초 간격. 데이터와 권한 판단은 항상 서버 API.
 */
export const useLiveSync = <T extends { version: number }>(sessionId: string | null, fetcher: (id: string) => Promise<T>): LiveSync<T> => {
  const [state, setStateRaw] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [stale, setStale] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const inflight = useRef(false);
  const realtimeRef = useRef(false);
  realtimeRef.current = realtime;
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const setState = useCallback((s: T) => {
    // 늦게 도착한 옛 응답이 새 상태를 덮지 않게 (버전이 같거나 높을 때만)
    setStateRaw((prev) => (prev && prev.version > s.version ? prev : s));
  }, []);
  const refresh = useCallback(async () => {
    if (!sessionId || inflight.current) return;
    inflight.current = true;
    try {
      setState(await fetchRef.current(sessionId));
      setError(null);
      setStale(false);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) setError(err);
      else setStale(true);
    } finally {
      inflight.current = false;
    }
  }, [sessionId, setState]);

  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    const sb = getSupabase();
    const channel = sb
      ?.channel(`live-quiz-${sessionId}`)
      .on("broadcast", { event: "state" }, () => void refresh())
      .subscribe((status) => setRealtime(status === "SUBSCRIBED"));
    let timer = 0;
    const tick = () => {
      const ms = document.hidden ? 8000 : channel && realtimeRef.current ? 5000 : 2000;
      timer = window.setTimeout(() => {
        void refresh().finally(tick);
      }, ms);
    };
    tick();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel && sb) void sb.removeChannel(channel);
    };
  }, [sessionId, refresh]);

  return { state, error, stale, realtime, refresh, setState };
};

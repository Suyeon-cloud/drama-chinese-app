import { useCallback, useEffect, useRef, useState } from "react";
import {
  isRecordingSupported,
  pickRecordingMimeType,
  recordingErrorKind,
  type RecordingError,
} from "../lib/voiceRecording";

export type VoiceRecorder = {
  supported: boolean;
  status: "idle" | "requesting" | "recording";
  /** 녹음을 요청했거나 녹음 중인 줄 */
  recordingKey: string | null;
  playingKey: string | null;
  error: RecordingError | null;
  has(key: string): boolean;
  /** 마이크를 요청해 녹음을 시작한다. 성공해 끝나면 그 줄의 이전 녹음을 교체한다. */
  start(key: string): Promise<void>;
  /** 녹음을 끝내고 저장한다. */
  stop(): void;
  /** 진행 중인 녹음만 버린다. 완료된 녹음은 남는다. */
  cancel(): void;
  play(key: string): void;
  stopPlayback(): void;
  /** 모든 녹음을 버리고 마이크·재생을 정리한다. */
  clear(): void;
  clearError(): void;
};

/** 줄별 최신 녹음 1개를 브라우저 메모리에만 보관한다. 화면을 떠나면 모두 사라진다. */
export const useVoiceRecorder = (): VoiceRecorder => {
  const [status, setStatus] = useState<VoiceRecorder["status"]>("idle");
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [error, setError] = useState<RecordingError | null>(null);
  const urlsRef = useRef<Record<string, string>>({});
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 취소되면 값이 바뀌어, 늦게 도착한 권한 응답과 녹음 결과를 버린다.
  const attemptRef = useRef(0);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const finish = useCallback(() => {
    recorderRef.current = null;
    releaseMic();
    setStatus("idle");
    setRecordingKey(null);
  }, [releaseMic]);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingKey(null);
  }, []);

  const cancel = useCallback(() => {
    attemptRef.current += 1;
    const recorder = recorderRef.current;
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      // 이미 멈춘 녹음은 그대로 정리한다.
    }
    finish();
  }, [finish]);

  const start = useCallback(
    async (key: string) => {
      if (recorderRef.current) return;
      if (!isRecordingSupported()) return setError("unsupported");
      stopPlayback();
      setError(null);
      const attempt = ++attemptRef.current;
      setStatus("requesting");
      setRecordingKey(key);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (attempt !== attemptRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = () => {
          if (attempt !== attemptRef.current) return;
          cancel();
          setError("failed");
        };
        recorder.onstop = () => {
          if (attempt !== attemptRef.current) return;
          finish();
          const blob = new Blob(chunks, recorder.mimeType ? { type: recorder.mimeType } : undefined);
          if (blob.size === 0) return setError("failed");
          const previous = urlsRef.current[key];
          if (previous) URL.revokeObjectURL(previous);
          urlsRef.current = { ...urlsRef.current, [key]: URL.createObjectURL(blob) };
          setUrls(urlsRef.current);
        };
        recorderRef.current = recorder;
        recorder.start();
        setStatus("recording");
      } catch (err) {
        if (attempt !== attemptRef.current) return;
        finish();
        setError(recordingErrorKind(err));
      }
    },
    [cancel, finish, stopPlayback],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return cancel();
    try {
      recorder.stop(); // 저장과 마이크 해제는 onstop에서 한다.
    } catch {
      cancel();
      setError("failed");
    }
  }, [cancel]);

  const play = useCallback(
    (key: string) => {
      const url = urlsRef.current[key];
      if (!url) return;
      stopPlayback();
      const audio = new Audio(url);
      const done = () => {
        if (audioRef.current === audio) stopPlayback();
      };
      audio.onended = done;
      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        stopPlayback();
        setError("failed");
      };
      audioRef.current = audio;
      setPlayingKey(key);
      audio.play().catch(() => {
        if (audioRef.current !== audio) return; // 직접 멈춘 경우
        stopPlayback();
        setError("failed");
      });
    },
    [stopPlayback],
  );

  const clear = useCallback(() => {
    cancel();
    stopPlayback();
    Object.values(urlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = {};
    setUrls({});
    setError(null);
  }, [cancel, stopPlayback]);

  // 화면 이탈: 마이크를 놓고 녹음을 메모리에서 지운다.
  useEffect(() => {
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("pagehide", clear);
      clear();
    };
  }, [clear]);

  const has = useCallback((key: string) => !!urls[key], [urls]);
  const clearError = useCallback(() => setError(null), []);

  return {
    supported: isRecordingSupported(),
    status,
    recordingKey,
    playingKey,
    error,
    has,
    start,
    stop,
    cancel,
    play,
    stopPlayback,
    clear,
    clearError,
  };
};

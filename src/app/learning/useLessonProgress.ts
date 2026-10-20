import { useCallback, useEffect, useRef, useState } from "react";
import type { Lesson } from "../../content/types";
import { progressStore } from "../store";
import { nowIso } from "../store/localJson";
import type { LessonProgress } from "../store/models";
import { addWatchedRange, emptyProgress, watchedSeconds } from "../store/progressStore";
import type { VideoClock } from "./useVideoClock";

/** 재생 중 시간 차이가 이보다 크면 이동(seek)으로 보고 시청 구간에 넣지 않는다. */
const MAX_STEP_SEC = 1.5;
const FLUSH_MS = 5000;

/**
 * useVideoClock의 재생 시간을 관찰해 학습 기록(출석·재생 구간·최대 위치·완료·퀴즈)을 저장한다.
 * userId가 null이면(로그인 전·관리자 미리보기) 아무것도 기록하지 않는다.
 */
export const useLessonProgress = (
  lesson: Lesson,
  clock: VideoClock,
  userId: string | null,
) => {
  const { startTime, endTime } = lesson.video;
  const ref = useRef<LessonProgress | null>(null);
  const dirty = useRef(false);
  const lastTime = useRef<number | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);

  const flush = useCallback(() => {
    if (!ref.current || !dirty.current) return;
    dirty.current = false;
    const snapshot = ref.current;
    setProgress(snapshot);
    void progressStore.save(snapshot);
  }, []);

  const update = useCallback(
    (patch: (p: LessonProgress) => LessonProgress, immediate = false) => {
      if (!ref.current) return;
      ref.current = { ...patch(ref.current), lastStudiedAt: nowIso() };
      dirty.current = true;
      if (immediate) flush();
    },
    [flush],
  );

  // 기존 기록 불러오기
  useEffect(() => {
    ref.current = null;
    setProgress(null);
    if (!userId) return;
    let alive = true;
    void progressStore.get(userId, lesson.id).then((p) => {
      if (!alive) return;
      ref.current = p ?? emptyProgress(userId, lesson.id, lesson.week);
      setProgress(ref.current);
    });
    return () => {
      alive = false;
    };
  }, [userId, lesson.id, lesson.week]);

  // 실제 재생된 구간만 누적한다. (일시정지·구간 밖·건너뛰기는 제외)
  useEffect(() => {
    const prev = lastTime.current;
    const t = clock.time;
    lastTime.current = t;
    if (!clock.playing || prev === null || !ref.current) return;
    const step = t - prev;
    if (step <= 0 || step > MAX_STEP_SEC) return;
    const a = Math.max(startTime, prev);
    const b = Math.min(endTime, t);
    if (b <= a) return;
    const span = Math.max(1, endTime - startTime);
    update((p) => {
      const watchedRanges = addWatchedRange(p.watchedRanges, a, b);
      return {
        ...p,
        startedAt: p.startedAt ?? nowIso(),
        watchedRanges,
        progressRatio: Math.min(1, watchedSeconds(watchedRanges) / span),
        maxPosition: Math.max(p.maxPosition, b),
      };
    }, !ref.current.startedAt);
  }, [clock.time, clock.playing, startTime, endTime, update]);

  // 주기적으로, 일시정지·화면 이탈 시 저장
  useEffect(() => {
    const id = window.setInterval(flush, FLUSH_MS);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
  useEffect(() => {
    if (!clock.playing) flush();
  }, [clock.playing, flush]);

  const markCompleted = useCallback(
    () => update((p) => (p.completedAt ? p : { ...p, completedAt: nowIso() }), true),
    [update],
  );

  const recordQuiz = useCallback(
    (correct: number, total: number) =>
      update(
        (p) => ({
          ...p,
          quiz: { correct, total, submittedAt: nowIso() },
          quizAttempts: p.quizAttempts + 1,
        }),
        true,
      ),
    [update],
  );

  return { progress, recording: userId !== null, markCompleted, recordQuiz };
};

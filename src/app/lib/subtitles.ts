// SRT(및 WebVTT 형식의 타임코드) 텍스트를 SubtitleCue 구조로 변환한다.
// 다음 단계의 YouTube 자막 가져오기도 결과를 이 구조로 맞춘 뒤 mergeTrack을 사용한다.

import type { Lesson, PlainScript, PlainScriptLine, SubtitleCue } from "../../content/types";

export type CueLang = "zh" | "ko";

export type ParsedCue = { start: number; end: number; text: string };

const TIME_RE =
  /(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

const toSec = (h: string | undefined, m: string, s: string, ms: string) =>
  Number(h ? h.slice(0, -1) : 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;

/** SRT/VTT 텍스트 → cue 목록. 타임코드가 없는 블록은 무시한다. */
export const parseSrt = (text: string): ParsedCue[] => {
  const blocks = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "").split(/\n\s*\n/);
  const cues: ParsedCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => TIME_RE.test(l));
    if (i < 0) continue;
    const m = TIME_RE.exec(lines[i])!;
    const body = lines
      .slice(i + 1)
      .map((l) => l.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .join(" ");
    if (!body) continue;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    if (end > start) cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
};

const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/**
 * 한 언어의 자막 트랙을 기존 cue 목록에 합친다.
 * 시간이 절반 이상 겹치는 기존 cue가 있으면 그 cue의 해당 언어 칸을 채우고, 없으면 새 cue를 만든다.
 */
export const mergeTrack = (
  existing: SubtitleCue[],
  track: ParsedCue[],
  lang: CueLang,
): SubtitleCue[] => {
  const result = existing.map((c) => ({ ...c, [lang]: undefined }));
  for (const t of track) {
    const len = t.end - t.start;
    let best: SubtitleCue | null = null;
    let bestOverlap = 0;
    for (const c of result) {
      const o = overlap(c, t);
      if (o > bestOverlap) {
        best = c;
        bestOverlap = o;
      }
    }
    if (best && bestOverlap >= len / 2 && !best[lang]) best[lang] = t.text;
    else result.push({ start: t.start, end: t.end, [lang]: t.text });
  }
  return result
    .filter((c) => c.zh || c.ko || c.pinyin)
    .sort((a, b) => a.start - b.start);
};

/* ───────── 원문 텍스트(타임코드 없음) ───────── */

/** 줄바꿈 단위 원문 → 문장 목록. 빈 줄 제거·앞뒤 공백 제거, 순서와 내용은 그대로 둔다. */
export const parsePlainText = (text: string): string[] =>
  text
    .replace(/^﻿/, "")
    .split(/\r\n?|\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** 문장별 시간 문제: 앞 문장보다 이르거나 같은 시작 시각이면 "order" */
export const plainSyncIssues = (lines: PlainScriptLine[]): ("order" | null)[] => {
  let prev = -Infinity;
  return lines.map((l) => {
    if (l.start === null) return null;
    const bad = l.start <= prev;
    prev = Math.max(prev, l.start);
    return bad ? "order" : null;
  });
};

/** 모든 문장의 시작 시각이 지정되고 순서가 올바르면 시간 동기화 완료 */
export const isPlainSynced = (plain: PlainScript | null | undefined) =>
  !!plain &&
  plain.lines.length > 0 &&
  plain.lines.every((l) => l.start !== null) &&
  plainSyncIssues(plain.lines).every((i) => i === null);

/**
 * 동기화된 원문 → cue. 끝 시각은 다음 문장의 시작, 마지막 문장은 학습 구간 끝(없으면 시작 + 5초).
 * 동기화가 끝나지 않았으면 빈 배열 (임의 시간을 만들지 않는다).
 */
export const plainToCues = (plain: PlainScript, segmentEnd: number): ParsedCue[] => {
  if (!isPlainSynced(plain)) return [];
  return plain.lines.map((l, i) => {
    const start = l.start!;
    const next = plain.lines[i + 1]?.start ?? null;
    const end = next ?? (segmentEnd > start ? segmentEnd : start + 5);
    return { start, end, text: l.text };
  });
};

/** 원문 확보 / 시간 동기화 상태 (원문 언어 기준) */
export const scriptStatus = (cues: SubtitleCue[], plain: PlainScript | null | undefined, lang: CueLang) => {
  const timedCount = cues.filter((c) => c[lang]?.trim()).length;
  const plainCount = plain && plain.lang === lang ? plain.lines.length : 0;
  return {
    timedCount,
    plainCount,
    /** 원문 확보: 타임코드 자막 또는 원문 텍스트가 1문장 이상 */
    secured: timedCount > 0 || plainCount > 0,
    /** 시간 동기화: 타임코드 자막이 있거나, 원문 텍스트의 시간을 모두 지정 */
    synced: timedCount > 0 || (plainCount > 0 && isPlainSynced(plain)),
  };
};

/** 학습 화면 자막: 저장된 cue + (동기화 완료된) 원문 텍스트 */
export const playbackCues = (lesson: Lesson): SubtitleCue[] => {
  const { plain, cues } = lesson.script;
  if (!plain) return cues;
  const timed = plainToCues(plain, lesson.video.endTime);
  return timed.length ? mergeTrack(cues, timed, plain.lang) : cues;
};

/** seconds → "mm:ss.s" (시간 맞추기용, 0.1초 단위) */
export const formatClock = (sec: number) => {
  const s = Math.round(Math.max(0, sec) * 10) / 10;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

/** "mm:ss" / "h:mm:ss" / 초 → seconds. 잘못된 형식이면 null. */
export const parseClock = (value: string): number | null => {
  const v = value.trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const parts = v.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((sum, p) => sum * 60 + Number(p), 0);
};

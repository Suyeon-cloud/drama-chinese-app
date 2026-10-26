// 영상·음성 파일 → 시간이 맞춰진 자막(cue). 브라우저 안에서 Whisper로 음성을 인식한다. (무료, 서버 불필요)
//
// - YouTube 주소만으로는 소리를 가져올 수 없어(YouTube 정책) 교수자가 파일을 직접 올린다.
// - 파일이 전체 회차라면 학습 구간만 잘라 인식하고, 결과 시간에 구간 시작 시각을 더해 영상 시간과 맞춘다.

import type { CueLang, ParsedCue } from "./subtitles";

export const WHISPER_MODELS = [
  { id: "onnx-community/whisper-base", label: "빠름 (기본 모델, 약 200MB)" },
  { id: "onnx-community/whisper-small", label: "정확 (큰 모델, 약 600MB · 느림)" },
] as const;

export type WhisperRequest = { audio: Float32Array; lang: CueLang; model: string };

export type WhisperResponse =
  | { type: "download"; file: string; loaded: number; total: number }
  | { type: "transcribing"; done: number; total: number }
  | { type: "done"; chunks: { text: string; start: number; end: number | null }[] }
  | { type: "error"; message: string };

export type SttProgress =
  | { stage: "decoding" }
  | { stage: "download"; ratio: number }
  /** done/total: 끝낸 구간 수 / 전체 구간 수, remainingSec: 남은 시간 추정(초, 첫 구간이 끝나기 전에는 null) */
  | { stage: "transcribing"; done: number; total: number; remainingSec: number | null };

const SAMPLE_RATE = 16000;

/** 파일의 소리를 16kHz 모노로 읽는다. range가 있으면 그 구간(초)만 잘라낸다. */
export const decodeAudio = async (file: File, range?: { start: number; end: number | null }) => {
  // OfflineAudioContext는 소리를 내지 않고 디코딩만 하며, 결과를 이 샘플레이트로 바꿔 준다.
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const mono = new Float32Array(buf.length);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buf.numberOfChannels;
  }
  const from = range ? Math.max(0, Math.floor(range.start * SAMPLE_RATE)) : 0;
  const to = range?.end ? Math.min(mono.length, Math.ceil(range.end * SAMPLE_RATE)) : mono.length;
  return { audio: mono.slice(from, to), duration: buf.duration };
};

/** Whisper 결과 조각 → 자막 cue (offset초를 더해 영상 시간에 맞춘다) */
export const chunksToCues = (
  chunks: { text: string; start: number; end: number | null }[],
  offset: number,
): ParsedCue[] =>
  chunks
    .map((c, i) => {
      const start = c.start + offset;
      const nextStart = chunks[i + 1]?.start;
      const end = (c.end ?? (nextStart !== undefined ? nextStart : c.start + 3)) + offset;
      return { start, end: Math.max(end, start + 0.5), text: c.text.trim() };
    })
    .filter((c) => c.text);

export const transcribe = (
  audio: Float32Array,
  lang: CueLang,
  model: string,
  onProgress: (p: SttProgress) => void,
) =>
  new Promise<{ text: string; start: number; end: number | null }[]>((resolve, reject) => {
    const worker = new Worker(new URL("./whisperWorker.ts", import.meta.url), { type: "module" });
    const files = new Map<string, { loaded: number; total: number }>();
    let startedAt = 0;
    worker.onmessage = (e: MessageEvent<WhisperResponse>) => {
      const m = e.data;
      if (m.type === "download") {
        files.set(m.file, { loaded: m.loaded, total: m.total });
        const all = [...files.values()];
        onProgress({
          stage: "download",
          ratio: all.reduce((s, f) => s + f.loaded, 0) / Math.max(1, all.reduce((s, f) => s + f.total, 0)),
        });
      } else if (m.type === "transcribing") {
        if (m.done === 0) startedAt = performance.now();
        const perPart = m.done > 0 ? (performance.now() - startedAt) / 1000 / m.done : null;
        onProgress({
          stage: "transcribing",
          done: m.done,
          total: m.total,
          remainingSec: perPart === null ? null : perPart * (m.total - m.done),
        });
      }
      else {
        worker.terminate();
        if (m.type === "done") resolve(m.chunks);
        else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "음성 인식을 시작하지 못했어요."));
    };
    worker.postMessage({ audio, lang, model } satisfies WhisperRequest, [audio.buffer]);
  });

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const srtTime = (sec: number) => {
  const ms = Math.round(sec * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

/** cue 목록 → SRT 텍스트 (파일로 저장해 두거나 다른 곳에서 다시 쓸 수 있게) */
export const cuesToSrt = (cues: ParsedCue[]) =>
  cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");

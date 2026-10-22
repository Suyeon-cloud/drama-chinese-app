// 음성 인식 Web Worker. 브라우저 안에서 Whisper 모델(Hugging Face transformers.js)을 실행한다.
// 서버·API 키가 필요 없고, 모델은 처음 한 번 내려받은 뒤 브라우저에 캐시된다.

import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { WhisperRequest, WhisperResponse } from "./speechToText";

const post = (msg: WhisperResponse) => (self as unknown as Worker).postMessage(msg);

// pipeline()의 전체 타입은 너무 복잡해 TypeScript가 처리하지 못하므로 음성 인식용으로만 좁혀 쓴다.
const createAsr = pipeline as unknown as (
  task: "automatic-speech-recognition",
  model: string,
  options: object,
) => Promise<AutomaticSpeechRecognitionPipeline>;

let loaded: { model: string; asr: AutomaticSpeechRecognitionPipeline } | null = null;

const load = async (model: string) => {
  if (loaded?.model === model) return loaded.asr;
  const webgpu = "gpu" in navigator;
  const asr = await createAsr("automatic-speech-recognition", model, {
    device: webgpu ? "webgpu" : "wasm",
    dtype: webgpu ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress" && p.total) {
        post({ type: "download", file: p.file ?? "", loaded: p.loaded ?? 0, total: p.total });
      }
    },
  });
  loaded = { model, asr };
  return asr;
};

self.onmessage = async (e: MessageEvent<WhisperRequest>) => {
  const { audio, lang, model } = e.data;
  try {
    const asr = await load(model);
    post({ type: "transcribing" });
    const out = await asr(audio, {
      language: lang === "zh" ? "chinese" : "korean",
      task: "transcribe",
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const result = Array.isArray(out) ? out[0] : out;
    const chunks = (result.chunks ?? []).map((c) => ({
      text: c.text,
      start: c.timestamp[0],
      end: c.timestamp[1],
    }));
    post({ type: "done", chunks });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

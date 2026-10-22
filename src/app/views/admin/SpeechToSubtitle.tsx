import React, { useState } from "react";
import { formatTime } from "../../../content";
import { chunksToCues, cuesToSrt, decodeAudio, transcribe, WHISPER_MODELS, type SttProgress } from "../../lib/speechToText";
import type { CueLang, ParsedCue } from "../../lib/subtitles";

type State =
  | { kind: "idle" }
  | { kind: "working"; progress: SttProgress }
  | { kind: "done"; count: number; cues: ParsedCue[] }
  | { kind: "error"; message: string };

const progressText = (p: SttProgress) =>
  p.stage === "decoding"
    ? "파일에서 소리를 읽는 중…"
    : p.stage === "download"
      ? `음성 인식 모델 내려받는 중… ${Math.round(p.ratio * 100)}% (처음 한 번만)`
      : "음성을 자막으로 바꾸는 중… (영상 길이에 따라 몇 분 걸려요)";

/**
 * 자막이 없는 영상: 영상·음성 파일을 올리면 브라우저 안에서 Whisper로 음성을 인식해 시간이 맞춰진 자막을 만든다.
 * 무료(서버·API 키 없음). 결과는 SRT 업로드와 같은 방식으로 스크립트에 들어가고, SRT 파일로도 내려받을 수 있다.
 */
export const SpeechToSubtitle: React.FC<{
  lang: CueLang;
  langLabel: string;
  segmentStart: number;
  segmentEnd: number | null;
  onCues: (cues: ParsedCue[], fileName: string) => void;
}> = ({ lang, langLabel, segmentStart, segmentEnd, onCues }) => {
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState<string>(WHISPER_MODELS[0].id);
  // 전체 회차 파일이면 학습 구간만, 이미 잘라 둔 클립이면 파일 전체(시작 시각만 더함)
  const [segmentOnly, setSegmentOnly] = useState(true);
  const [state, setState] = useState<State>({ kind: "idle" });
  const hasSegment = segmentEnd !== null && segmentEnd > segmentStart;

  const run = async () => {
    if (!file) return;
    setState({ kind: "working", progress: { stage: "decoding" } });
    try {
      const range = segmentOnly && hasSegment ? { start: segmentStart, end: segmentEnd } : undefined;
      const { audio } = await decodeAudio(file, range);
      if (audio.length === 0) throw new Error("학습 구간에 해당하는 소리가 없어요. 구간과 파일을 확인해 주세요.");
      const chunks = await transcribe(audio, lang, model, (progress) => setState({ kind: "working", progress }));
      // 학습 구간만 잘랐거나 클립 파일이면 결과 시간에 구간 시작 시각을 더해 YouTube 영상 시간에 맞춘다.
      const cues = chunksToCues(chunks, segmentStart);
      if (cues.length === 0) throw new Error("인식된 말소리가 없어요. 언어 선택과 파일을 확인해 주세요.");
      onCues(cues, file.name);
      setState({ kind: "done", count: cues.length, cues });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({
        kind: "error",
        message: /decode|EncodingError|Unable to decode/i.test(message)
          ? "이 파일에서 소리를 읽지 못했어요. mp4·mp3·m4a·wav 파일로 다시 시도해 주세요."
          : /fetch|network/i.test(message)
            ? "음성 인식 모델을 내려받지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요."
            : /memory|allocation/i.test(message)
              ? "메모리가 부족해요. 학습 구간만 잘라 둔 짧은 파일이나 ‘빠름’ 모델로 다시 시도해 주세요."
              : message,
      });
    }
  };

  const downloadSrt = (cues: ParsedCue[]) => {
    const url = URL.createObjectURL(new Blob([cuesToSrt(cues)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(file?.name ?? "subtitles").replace(/\.[^.]+$/, "")}.${lang}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const working = state.kind === "working";

  return (
    <div className="script-import stt">
      <div className="row-start">
        <b className="small">🎙 음성으로 자막 만들기 (무료)</b>
        <span className="pill pill-lavender">{langLabel}</span>
      </div>
      <p className="muted small">
        영상에 자막이 없을 때, 영상(또는 음성) 파일을 올리면 브라우저 안에서 음성을 인식해 시간이 맞춰진 자막을 만들어요.
        YouTube 주소만으로는 소리를 가져올 수 없어서 파일이 필요해요. 크롬을 권장해요.
      </p>
      <div className="stt-row">
        <label className="btn btn-soft btn-sm file-btn">
          {file ? "다른 파일 고르기" : "영상·음성 파일 고르기"}
          <input
            type="file"
            accept="video/*,audio/*"
            disabled={working}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setState({ kind: "idle" });
              e.target.value = "";
            }}
          />
        </label>
        {file ? <small className="muted">{file.name} ({Math.round(file.size / 1024 / 1024)}MB)</small> : null}
      </div>
      <div className="stt-row">
        <label className="field stt-field">
          <span>인식 모델</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} disabled={working}>
            {WHISPER_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {hasSegment ? (
          <fieldset className="field stt-field">
            <span>파일 종류</span>
            <label className="check">
              <input type="radio" checked={segmentOnly} onChange={() => setSegmentOnly(true)} disabled={working} />
              전체 영상 → 학습 구간({formatTime(segmentStart)}–{formatTime(segmentEnd!)})만 변환
            </label>
            <label className="check">
              <input type="radio" checked={!segmentOnly} onChange={() => setSegmentOnly(false)} disabled={working} />
              학습 구간만 잘라 둔 클립 (시작 {formatTime(segmentStart)}에 맞춤)
            </label>
          </fieldset>
        ) : null}
      </div>
      <div className="row-start">
        <button className="btn btn-primary btn-sm" onClick={() => void run()} disabled={!file || working}>
          {working ? "변환 중…" : "음성으로 자막 만들기"}
        </button>
        {state.kind === "working" ? <small className="muted">⏳ {progressText(state.progress)}</small> : null}
        {state.kind === "done" ? (
          <>
            <small className="muted">
              ✅ 자막 {state.count}개를 만들었어요. 아래 표에서 틀린 글자를 고쳐 주세요.
            </small>
            <button className="link-btn" onClick={() => downloadSrt(state.cues)}>
              SRT 파일로 저장
            </button>
          </>
        ) : null}
        {state.kind === "error" ? <small className="field-error">⚠️ {state.message}</small> : null}
      </div>
      <p className="muted small">
        ℹ️ 음성 인식은 이름·동음이의어를 자주 틀려요. 꼭 검수해 주세요. 중국어는 번체로 나올 때가 있어요.
      </p>
    </div>
  );
};

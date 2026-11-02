// 학생 음성 녹음의 브라우저 판정. 녹음은 브라우저 메모리에만 두며 서버로 보내지 않는다.

/** 앞에서부터 지원되는 첫 형식을 쓴다. Chrome·Edge·Firefox는 webm, Safari는 mp4 계열을 지원한다. */
const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** 지원되는 녹음 형식. 하나도 확인되지 않으면 undefined를 돌려 브라우저 기본값으로 녹음한다. */
export const pickRecordingMimeType = (isSupported: (type: string) => boolean): string | undefined =>
  RECORDING_MIME_TYPES.find((type) => isSupported(type));

type RecordingEnv = {
  MediaRecorder?: unknown;
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
};

/** MediaRecorder와 마이크 API가 모두 있어야 녹음할 수 있다. (https가 아닌 주소에서는 마이크 API가 없다) */
export const isRecordingSupported = (env: RecordingEnv = globalThis as RecordingEnv) =>
  typeof env.MediaRecorder === "function" && typeof env.navigator?.mediaDevices?.getUserMedia === "function";

export type RecordingError = "unsupported" | "denied" | "no-mic" | "failed";

export const recordingErrorKind = (err: unknown): RecordingError => {
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-mic";
  return "failed";
};

export const RECORDING_ERROR_TEXT: Record<RecordingError, string> = {
  unsupported: "이 브라우저에서는 음성 녹음을 지원하지 않아요.",
  denied: "마이크 권한이 없어 녹음할 수 없어요. 원음 듣기와 회화 연습은 계속할 수 있어요.",
  "no-mic": "사용할 수 있는 마이크를 찾지 못했어요. 원음 듣기와 회화 연습은 계속할 수 있어요.",
  failed: "녹음하지 못했어요. 원음 듣기와 회화 연습은 계속할 수 있어요.",
};

import React, { useEffect, useMemo, useState } from "react";
import type { LessonDialogue, SubtitleCue } from "../../content/types";
import { dialogueSceneRange, initialDialogueId, lineTurn, resolveDialogueLine } from "../lib/dialogues";
import { RECORDING_ERROR_TEXT } from "../lib/voiceRecording";
import { cuePinyin } from "./SubtitleLayer";
import type { SegmentPlayback } from "./useVideoClock";
import { useVoiceRecorder, type VoiceRecorder } from "./useVoiceRecorder";

/** 학습 화면의 영상으로 대사·장면을 재생하기 위한 연결 */
export type DialoguePlayer = {
  ready: boolean;
  playing: boolean;
  segment: SegmentPlayback;
  /** 구간 재생을 시작한다. 재생 구간 추적은 학습 화면이 맡는다. */
  play: (start: number, end: number, opts?: { showVideo?: boolean }) => void;
};

type Stage = "intro" | "practice" | "done";

/** 재생 상태: 영상이 화면 밖에 있어도 지금 소리가 나는 이유를 알 수 있게 한다. */
const PlayingNote: React.FC<{ player: DialoguePlayer }> = ({ player }) =>
  player.segment.active ? (
    <div className="practice-playing" role="status">
      <span>🔊 영상에서 재생 중</span>
      <button type="button" className="link-btn" onClick={player.segment.stop}>
        멈추기
      </button>
    </div>
  ) : !player.ready ? (
    <p className="muted small">영상이 준비되면 원음을 들을 수 있어요.</p>
  ) : null;

/** 내 역할 줄의 녹음 동작. 녹음은 선택 사항이며 이 영역의 실패가 연습 진행을 막지 않는다. */
const VoiceActions: React.FC<{
  lineId: string;
  recorder: VoiceRecorder;
  onRecord: () => void;
  onListen: () => void;
}> = ({ lineId, recorder, onRecord, onListen }) => {
  const busy = recorder.recordingKey === lineId;
  if (!recorder.supported) return <p className="muted small">{RECORDING_ERROR_TEXT.unsupported}</p>;
  if (busy && recorder.status === "recording") {
    return (
      <div className="practice-voice">
        <span className="practice-rec" role="status">
          ● 녹음 중
        </span>
        <button type="button" className="btn btn-danger btn-sm" onClick={recorder.stop}>
          ■ 녹음 끝내기
        </button>
      </div>
    );
  }
  if (busy) {
    return (
      <div className="practice-voice">
        <button type="button" className="btn btn-soft btn-sm" disabled>
          마이크 준비 중…
        </button>
      </div>
    );
  }
  return (
    <div className="practice-voice">
      {recorder.has(lineId) ? (
        <>
          <button type="button" className="btn btn-soft btn-sm" onClick={recorder.playingKey === lineId ? recorder.stopPlayback : onListen}>
            {recorder.playingKey === lineId ? "■ 정지" : "▶ 내 목소리 듣기"}
          </button>
          <button type="button" className="btn btn-soft btn-sm" onClick={onRecord}>
            ↻ 다시 녹음
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-soft btn-sm" onClick={onRecord}>
          🎙 내 목소리 녹음
        </button>
      )}
    </div>
  );
};

const DialogueRun: React.FC<{
  dialogue: LessonDialogue;
  cues: SubtitleCue[];
  player: DialoguePlayer;
  active: boolean;
  /** 다른 회화 연습이 있을 때만 전달한다. */
  onOther?: () => void;
}> = ({ dialogue, cues, player, active, onOther }) => {
  const [stage, setStage] = useState<Stage>("intro");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [showPinyin, setShowPinyin] = useState(true);
  const [showKo, setShowKo] = useState(true);
  const lines = useMemo(() => dialogue.lines.map((l) => resolveDialogueLine(l, cues)), [dialogue, cues]);
  const scene = dialogueSceneRange(lines);
  const recorder = useVoiceRecorder();
  const { cancel: cancelRecording, stopPlayback: stopVoice } = recorder;

  // 다른 탭으로 가면 진행 중인 녹음을 멈추고 마이크를 놓는다. 완료된 녹음은 남는다.
  useEffect(() => {
    if (active) return;
    cancelRecording();
    stopVoice();
  }, [active, cancelRecording, stopVoice]);
  // 학생이 영상을 직접 재생하면 내 목소리 재생을 멈춰 한 번에 하나만 들리게 한다.
  useEffect(() => {
    if (player.playing) stopVoice();
  }, [player.playing, stopVoice]);

  const stop = () => {
    if (player.segment.active) player.segment.stop();
  };
  /** 줄 이동: 녹음 중이면 저장하고 넘어간다. */
  const go = (next: Stage, nextIndex = 0) => {
    stop();
    stopVoice();
    if (recorder.status !== "idle") recorder.stop();
    recorder.clearError();
    setIndex(nextIndex);
    setStage(next);
  };
  /** 처음부터·역할 변경: 이번 연습의 녹음을 모두 버린다. */
  const restart = (next: Stage) => {
    stop();
    recorder.clear();
    setIndex(0);
    setStage(next);
  };
  const listen = (start: number, end: number, opts?: { showVideo?: boolean }) => {
    stopVoice();
    player.play(start, end, opts);
  };
  const leave = () => {
    stop();
    onOther?.();
  };
  const otherLink = onOther ? (
    <button type="button" className="link-btn" onClick={leave}>
      ← 다른 회화 연습
    </button>
  ) : null;

  if (stage === "intro") {
    return (
      <div className="practice">
        {otherLink}
        <h3 className="practice-title">{dialogue.title}</h3>
        <p className="practice-situation">{dialogue.situation}</p>
        <button
          type="button"
          className="btn btn-soft btn-sm practice-scene"
          disabled={!player.ready || !scene}
          onClick={() => scene && listen(scene.start, scene.end, { showVideo: true })}
        >
          ▶ 이 장면 보기
        </button>
        <PlayingNote player={player} />
        <div className="practice-roles" role="group" aria-label="연습할 역할">
          <b className="small">어떤 역할로 연습할까요?</b>
          {dialogue.roles.map((r) => (
            <button
              key={r.id}
              type="button"
              className={roleId === r.id ? "active" : ""}
              aria-pressed={roleId === r.id}
              onClick={() => setRoleId(r.id)}
            >
              {r.name} 역할
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary" disabled={!roleId} onClick={() => restart("practice")}>
          이 역할로 연습하기
        </button>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="practice practice-done">
        <p className="practice-done-msg">회화 연습을 끝까지 따라왔어요.</p>
        <button type="button" className="btn btn-primary" onClick={() => restart("practice")}>
          같은 역할로 다시
        </button>
        <button type="button" className="btn btn-soft" onClick={() => restart("intro")}>
          역할 바꿔 다시
        </button>
        {onOther ? (
          <button type="button" className="btn btn-soft" onClick={leave}>
            다른 회화 연습
          </button>
        ) : null}
      </div>
    );
  }

  const line = lines[index];
  const mine = lineTurn(line, roleId ?? "") === "mine";
  const speaker = dialogue.roles.find((r) => r.id === line.roleId)?.name;
  const myRole = dialogue.roles.find((r) => r.id === roleId)?.name;
  const pinyin = cuePinyin(line);

  return (
    <div className="practice">
      <div className="practice-bar">
        <span className="practice-me">{myRole} 역할</span>
        <span className="practice-count tabular">
          {index + 1} / {lines.length}
        </span>
        <span className="practice-bar-actions">
          <button type="button" className="link-btn" onClick={() => restart("intro")}>
            역할 바꾸기
          </button>
          <button type="button" className="link-btn" onClick={() => restart("practice")}>
            처음부터
          </button>
        </span>
      </div>
      <div className="practice-switches">
        <label>
          <input type="checkbox" checked={showPinyin} onChange={(e) => setShowPinyin(e.target.checked)} /> 병음 보기
        </label>
        <label>
          <input type="checkbox" checked={showKo} onChange={(e) => setShowKo(e.target.checked)} /> 한국어 뜻 보기
        </label>
      </div>

      <article className={`practice-line ${mine ? "mine" : "other"}`}>
        <span className="practice-turn">{mine ? "내 차례" : "상대방 차례"}</span>
        <small className="practice-speaker">{speaker}</small>
        <p className="practice-zh zh">{line.zh}</p>
        {showPinyin && pinyin ? <p className="practice-py">{pinyin}</p> : null}
        {showKo && line.ko ? <p className="practice-ko">{line.ko}</p> : null}
        <div className="practice-actions">
          <button
            type="button"
            className="btn btn-soft btn-sm"
            disabled={!player.ready || recorder.status !== "idle"}
            onClick={() => listen(line.start, line.end)}
          >
            ▶ 원음 듣기
          </button>
        </div>
        {mine ? (
          <VoiceActions
            lineId={line.id}
            recorder={recorder}
            onRecord={() => {
              // 드라마 원음이 함께 녹음되지 않게 영상을 먼저 멈춘다.
              player.segment.stop();
              void recorder.start(line.id);
            }}
            onListen={() => {
              player.segment.stop();
              recorder.play(line.id);
            }}
          />
        ) : null}
        {recorder.error && recorder.supported ? (
          <p className="practice-voice-error" role="alert">
            {RECORDING_ERROR_TEXT[recorder.error]}
          </p>
        ) : null}
        <div className="practice-actions">
          {index > 0 ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => go("practice", index - 1)}>
              ← 이전
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => (index + 1 < lines.length ? go("practice", index + 1) : go("done"))}
          >
            다음
          </button>
        </div>
      </article>
      <PlayingNote player={player} />
    </div>
  );
};

/** 학습 패널의 회화 연습 탭. 학생에게 보일 수 있는 회화 연습만 전달받는다. */
export const DialoguePractice: React.FC<{
  dialogues: LessonDialogue[];
  cues: SubtitleCue[];
  player: DialoguePlayer;
  /** 회화 연습 탭이 보이는 중인지 */
  active: boolean;
}> = ({ dialogues, cues, player, active }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const currentId = selectedId ?? initialDialogueId(dialogues);
  const current = dialogues.find((d) => d.id === currentId);

  if (current) {
    return (
      <DialogueRun
        key={current.id}
        dialogue={current}
        cues={cues}
        player={player}
        active={active}
        onOther={dialogues.length > 1 ? () => setSelectedId(null) : undefined}
      />
    );
  }
  return (
    <ul className="practice-list">
      {dialogues.map((d) => (
        <li key={d.id}>
          <button type="button" onClick={() => setSelectedId(d.id)}>
            <b>{d.title}</b>
            <span>{d.situation}</span>
            <small className="muted">
              역할 {d.roles.length}명 · 대사 {d.lines.length}줄
            </small>
          </button>
        </li>
      ))}
    </ul>
  );
};

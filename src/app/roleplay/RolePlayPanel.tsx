import React, { useEffect, useState } from "react";
import type { RolePlay } from "../../content/types";
import { Icon } from "../components/Icon";
import {
  canSpeak,
  evaluatePronunciation,
  speak,
  stopSpeaking,
  type PronunciationResult,
} from "./speechService";

type Phase = "idle" | "recording" | "result";

/** 역할극 Demo UI. 음성 출력/평가는 speechService를 통해서만 호출한다. */
export const RolePlayPanel: React.FC<{ rolePlay: RolePlay; onClose: () => void }> = ({
  rolePlay,
  onClose,
}) => {
  const [myRole, setMyRole] = useState(rolePlay.roles[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const aiLine = rolePlay.lines.find((l) => l.speaker !== myRole) ?? rolePlay.lines[0];
  const myLine = rolePlay.lines.find((l) => l.speaker === myRole) ?? rolePlay.lines[1];
  const aiRole = rolePlay.roles.find((r) => r !== myRole) ?? rolePlay.roles[1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopSpeaking();
    };
  }, [onClose]);

  const reset = () => {
    setPhase("idle");
    setResult(null);
  };

  const listen = () => {
    setSpeaking(true);
    const ok = speak(aiLine.zh, () => setSpeaking(false));
    if (!ok) {
      setSpeaking(false);
      setNotice("이 브라우저는 음성 재생을 지원하지 않아요. (Demo)");
    }
  };

  const record = async () => {
    setPhase("recording");
    setResult(await evaluatePronunciation(myLine));
    setPhase("result");
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal roleplay"
        role="dialog"
        aria-label="역할극 연습"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="닫기">
          <Icon name="close" size={18} />
        </button>
        <span className="pill pill-pink">🎭 角色扮演 · 역할극</span>
        <h3 className="rp-title">{rolePlay.title}</h3>
        <div className="rp-situation">
          <small>상황</small>
          <p>{rolePlay.situation}</p>
          {rolePlay.note ? <p className="muted small">{rolePlay.note}</p> : null}
        </div>

        <div className="rp-roles">
          {rolePlay.roles.map((r) => (
            <button
              key={r}
              className={`rp-role ${myRole === r ? "active" : ""}`}
              onClick={() => {
                setMyRole(r);
                reset();
              }}
            >
              {r}로 연습
            </button>
          ))}
        </div>

        <div className="rp-line ai">
          <span className="rp-speaker">AI · {aiRole}</span>
          <p className="rp-zh">{aiLine.zh}</p>
          <p className="rp-py">{aiLine.pinyin}</p>
          <p className="rp-ko">{aiLine.ko}</p>
          <button className="btn btn-soft btn-sm" onClick={listen} disabled={speaking}>
            {speaking ? "🔊 재생 중…" : "🔊 AI 음성 듣기"}
          </button>
          {!canSpeak() || notice ? <small className="muted small">{notice ?? "음성 재생 미지원 브라우저 (Demo)"}</small> : null}
        </div>

        <div className="rp-line me">
          <span className="rp-speaker">나 · {myRole}</span>
          <p className="rp-zh">{myLine.zh}</p>
          <p className="rp-py">{myLine.pinyin}</p>
          <p className="rp-ko">{myLine.ko}</p>
          {phase === "idle" ? (
            <button className="btn btn-primary btn-sm" onClick={record}>
              🎙 말해보기
            </button>
          ) : null}
          {phase === "recording" ? (
            <div className="rp-recording">
              <span className="wave">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              듣고 있어요… (Demo)
            </div>
          ) : null}
        </div>

        {phase === "result" && result ? (
          <div className="rp-feedback">
            <div className="rp-score">⭐ {result.score}점</div>
            <div>
              <b>{result.summary}</b>
              <p>{result.tip}</p>
              {result.demo ? <small className="demo-tag">Demo Feedback</small> : null}
            </div>
          </div>
        ) : null}

        <div className="rp-actions">
          <button
            className="btn btn-soft"
            onClick={() => {
              setMyRole(aiRole);
              reset();
            }}
          >
            🔄 역할 바꾸기
          </button>
          <button className="btn btn-soft" onClick={reset}>
            다시 연습하기
          </button>
        </div>
      </div>
    </div>
  );
};

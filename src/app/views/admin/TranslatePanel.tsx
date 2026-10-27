import React, { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import {
  DraftResultError,
  buildPinyinPrompt,
  buildTranslatePrompt,
  parsePinyinResult,
  parseTranslateResult,
} from "../../lib/aiDraft";
import { ApiError, api } from "../../lib/api";
import type { CueLang } from "../../lib/subtitles";
import type { LearningDirection, SubtitleCue } from "../../../content/types";
import { KeyForm, useAiStatus } from "./AiDraftPanel";

type CueField = CueLang | "pinyin";

/**
 * 자막 한 줄마다 from 칸의 문장으로 to 칸을 채운다. (번역 자막, 병음)
 * 4단계 AI 패널과 같은 방식: 프롬프트를 외부 AI에 붙여 넣고 답을 다시 붙여 넣거나, 연결한 API로 바로 만든다.
 */
const CueFillPanel: React.FC<{
  cues: SubtitleCue[];
  from: CueLang;
  to: CueField;
  /** 패널 제목 앞 그림 문자와 채울 내용 이름 (예: "한국어 번역", "병음") */
  icon: string;
  name: string;
  buildPrompt: (lines: string[]) => string;
  parse: (text: string) => Map<number, string>;
  placeholder: string;
  onApply: (cues: SubtitleCue[]) => void;
}> = ({ cues, from, to, icon, name, buildPrompt, parse, placeholder, onApply }) => {
  const { user } = useAuth();
  const adminMode = user?.provider === "admin";
  const toast = useToast();
  const { status, reload } = useAiStatus();
  const [overwrite, setOverwrite] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 프롬프트를 복사·전송할 때 보낸 줄 (붙여 넣기 전에 표를 고쳐도 번호가 어긋나지 않게) */
  const [sent, setSent] = useState<{ index: number; text: string }[] | null>(null);

  // from 칸에 문장이 있는 자막만 번호를 붙여 보낸다. (번호 → 자막 위치)
  const targets = cues
    .map((c, index) => ({ index, text: (c[from] ?? "").trim(), has: !!c[to]?.trim() }))
    .filter((x) => x.text && (overwrite || !x.has));
  const total = cues.filter((c) => c[from]?.trim()).length;
  const filled = cues.filter((c) => c[from]?.trim() && c[to]?.trim()).length;
  const prompt = buildPrompt(targets.map((t) => t.text));

  const applyText = (text: string) => {
    setError(null);
    try {
      const byNumber = parse(text);
      const lines = sent ?? targets;
      const next = cues.map((c) => ({ ...c }));
      let count = 0;
      lines.forEach((t, i) => {
        if (!next[t.index]) return;
        const value = byNumber.get(i + 1);
        if (value) {
          next[t.index] = { ...next[t.index], [to]: value };
          count += 1;
        }
      });
      onApply(next);
      const missing = lines.length - count;
      toast.show(
        `${name} ${count}줄을 채웠어요.${missing > 0 ? ` (${missing}줄은 결과에 없어서 비워 뒀어요)` : ""} 표에서 확인해 주세요.`,
        missing > 0 ? "error" : "success",
      );
      setResult("");
      setSent(null);
    } catch (err) {
      setError(err instanceof DraftResultError ? err.message : `${name} 결과를 읽지 못했어요.`);
    }
  };

  const copy = async () => {
    try {
      setSent(targets);
      await navigator.clipboard.writeText(prompt);
      toast.show(`${name} 프롬프트를 복사했어요. 생성형 AI에 붙여 넣어 주세요.`, "success");
    } catch {
      setShowPrompt(true);
      toast.show("자동 복사가 막혀 있어요. 아래 칸에서 직접 복사해 주세요.", "error");
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    setSent(targets);
    try {
      const res = await api<{ text: string }>("/ai/draft", { method: "POST", body: { prompt } });
      applyText(res.text);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `${name}을(를) 만들지 못했어요.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-draft">
      <h4>
        {icon} {name} 채우기
      </h4>
      <p className="muted small">
        자막 {total}줄 중 {name} 있음 {filled}줄 · 이번에 채울 줄 <b>{targets.length}</b>줄. 결과는 표의 {name} 칸에
        들어가요. AI 결과이니 꼭 확인해 주세요.
      </p>
      <label className="row-start small">
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        이미 있는 {name}도 다시 만들기
      </label>

      {targets.length === 0 ? (
        <p className="muted small">채울 줄이 없어요. 모든 자막에 {name}이(가) 있어요.</p>
      ) : (
        <>
          <div className="ai-step">
            <b>방법 1 · 외부 AI 사용</b>
            <div className="row-start">
              <button type="button" className="btn btn-soft btn-sm" onClick={() => void copy()}>
                📋 {name} 프롬프트 복사
              </button>
              <button type="button" className="link-btn" onClick={() => setShowPrompt((v) => !v)}>
                {showPrompt ? "프롬프트 숨기기" : "프롬프트 보기"}
              </button>
            </div>
            {showPrompt ? (
              <textarea
                className="ai-prompt"
                readOnly
                rows={8}
                value={prompt}
                onFocus={(e) => {
                  e.target.select();
                  setSent(targets);
                }}
              />
            ) : null}
            <label className="field">
              <span>AI 답 붙여넣기 (JSON)</span>
              <textarea
                rows={4}
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder={placeholder}
                spellCheck={false}
              />
            </label>
            <button type="button" className="btn btn-primary btn-sm" disabled={!result.trim()} onClick={() => applyText(result)}>
              {name} 적용
            </button>
          </div>

          <div className="ai-step">
            <b>방법 2 · 연결한 API로 바로 만들기</b>
            {status?.connected ? (
              <div className="row-start">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void generate()}>
                  {busy ? "만드는 중… (1~2분 걸릴 수 있어요)" : `✨ ${name} 바로 만들기`}
                </button>
                <small className="muted">
                  {status.model} · 키 {status.hint}
                </small>
              </div>
            ) : (
              <>
                <p className="muted small">
                  연결된 API 키가 없어요. {adminMode ? "아래에서 본인 키를 연결해 주세요." : "관리자 모드로 로그인해 키를 연결해 주세요."}
                </p>
                {adminMode ? <KeyForm status={status} onChanged={reload} /> : null}
              </>
            )}
          </div>
        </>
      )}
      {error ? <p className="field-error small">{error}</p> : null}
    </div>
  );
};

/** 원문 자막 → 번역 자막 (중국어 원문은 한국어로, 한국어 원문은 중국어로) */
export const TranslatePanel: React.FC<{
  cues: SubtitleCue[];
  direction: LearningDirection;
  sourceLang: CueLang;
  targetLang: CueLang;
  title: string;
  dramaTitle: string;
  onApply: (cues: SubtitleCue[]) => void;
}> = ({ cues, direction, sourceLang, targetLang, title, dramaTitle, onApply }) => (
  <CueFillPanel
    cues={cues}
    from={sourceLang}
    to={targetLang}
    icon="🌐"
    name={targetLang === "ko" ? "한국어 번역" : "중국어 번역"}
    buildPrompt={(lines) => buildTranslatePrompt({ lines, direction, title, dramaTitle })}
    parse={parseTranslateResult}
    placeholder='{ "translations": [{ "n": 1, "text": "…" }] }'
    onApply={onApply}
  />
);

/** 중국어 자막 → 병음 (원문이든 번역이든 중국어 칸 기준, 소문자) */
export const PinyinPanel: React.FC<{ cues: SubtitleCue[]; onApply: (cues: SubtitleCue[]) => void }> = ({
  cues,
  onApply,
}) => (
  <CueFillPanel
    cues={cues}
    from="zh"
    to="pinyin"
    icon="🔤"
    name="병음"
    buildPrompt={buildPinyinPrompt}
    parse={parsePinyinResult}
    placeholder='{ "pinyin": [{ "n": 1, "text": "wǒmen shì yì jiā rén" }] }'
    onApply={onApply}
  />
);

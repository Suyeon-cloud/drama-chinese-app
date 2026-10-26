import React, { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { DraftResultError, buildTranslatePrompt, parseTranslateResult } from "../../lib/aiDraft";
import { ApiError, api } from "../../lib/api";
import type { CueLang } from "../../lib/subtitles";
import type { LearningDirection, SubtitleCue } from "../../../content/types";
import { KeyForm, useAiStatus } from "./AiDraftPanel";

/**
 * 원문 자막 → 번역 자막 채우기 (중국어 원문은 한국어로, 한국어 원문은 중국어로).
 * 4단계 AI 패널과 같은 방식: 프롬프트를 외부 AI에 붙여 넣고 답을 다시 붙여 넣거나, 연결한 API로 바로 번역한다.
 */
export const TranslatePanel: React.FC<{
  cues: SubtitleCue[];
  direction: LearningDirection;
  sourceLang: CueLang;
  targetLang: CueLang;
  title: string;
  dramaTitle: string;
  onApply: (cues: SubtitleCue[]) => void;
}> = ({ cues, direction, sourceLang, targetLang, title, dramaTitle, onApply }) => {
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

  // 원문이 있는 자막만 번호를 붙여 보낸다. (번호 → 자막 위치)
  const targets = cues
    .map((c, index) => ({ index, text: (c[sourceLang] ?? "").trim(), has: !!c[targetLang]?.trim() }))
    .filter((x) => x.text && (overwrite || !x.has));
  const filled = cues.filter((c) => c[sourceLang]?.trim() && c[targetLang]?.trim()).length;
  const prompt = buildTranslatePrompt({ lines: targets.map((t) => t.text), direction, title, dramaTitle });
  const toName = targetLang === "ko" ? "한국어" : "중국어";

  const applyText = (text: string) => {
    setError(null);
    try {
      const byNumber = parseTranslateResult(text);
      const lines = sent ?? targets;
      const next = cues.map((c) => ({ ...c }));
      let count = 0;
      lines.forEach((t, i) => {
        if (!next[t.index]) return;
        const tr = byNumber.get(i + 1);
        if (tr) {
          next[t.index] = { ...next[t.index], [targetLang]: tr };
          count += 1;
        }
      });
      onApply(next);
      const missing = lines.length - count;
      toast.show(
        `${toName} 번역 ${count}줄을 채웠어요.${missing > 0 ? ` (${missing}줄은 결과에 없어서 비워 뒀어요)` : ""} 표에서 확인해 주세요.`,
        missing > 0 ? "error" : "success",
      );
      setResult("");
      setSent(null);
    } catch (err) {
      setError(err instanceof DraftResultError ? err.message : "번역 결과를 읽지 못했어요.");
    }
  };

  const copy = async () => {
    try {
      setSent(targets);
      await navigator.clipboard.writeText(prompt);
      toast.show("번역 프롬프트를 복사했어요. 생성형 AI에 붙여 넣어 주세요.", "success");
    } catch {
      setShowPrompt(true);
      toast.show("자동 복사가 막혀 있어요. 아래 칸에서 직접 복사해 주세요.", "error");
    }
  };

  const translate = async () => {
    setBusy(true);
    setError(null);
    setSent(targets);
    try {
      const res = await api<{ text: string }>("/ai/draft", { method: "POST", body: { prompt } });
      applyText(res.text);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "번역하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-draft">
      <h4>🌐 {toName} 번역 자막 채우기</h4>
      <p className="muted small">
        원문 {cues.filter((c) => c[sourceLang]?.trim()).length}줄 중 번역 있음 {filled}줄 · 이번에 번역할 줄{" "}
        <b>{targets.length}</b>줄. 결과는 표의 {toName} 번역 칸에 들어가요. AI 번역이니 꼭 확인해 주세요.
      </p>
      <label className="row-start small">
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        이미 있는 번역도 다시 번역하기
      </label>

      {targets.length === 0 ? (
        <p className="muted small">번역할 줄이 없어요. 모든 원문에 번역이 있어요.</p>
      ) : (
        <>
          <div className="ai-step">
            <b>방법 1 · 외부 AI 사용</b>
            <div className="row-start">
              <button type="button" className="btn btn-soft btn-sm" onClick={() => void copy()}>
                📋 번역 프롬프트 복사
              </button>
              <button type="button" className="link-btn" onClick={() => setShowPrompt((v) => !v)}>
                {showPrompt ? "프롬프트 숨기기" : "프롬프트 보기"}
              </button>
            </div>
            {showPrompt ? (
              <textarea className="ai-prompt" readOnly rows={8} value={prompt} onFocus={(e) => {
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
                placeholder='{ "translations": [{ "n": 1, "text": "…" }] }'
                spellCheck={false}
              />
            </label>
            <button type="button" className="btn btn-primary btn-sm" disabled={!result.trim()} onClick={() => applyText(result)}>
              번역 적용
            </button>
          </div>

          <div className="ai-step">
            <b>방법 2 · 연결한 API로 바로 번역</b>
            {status?.connected ? (
              <div className="row-start">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void translate()}>
                  {busy ? "번역 중… (1~2분 걸릴 수 있어요)" : `✨ ${toName}로 바로 번역`}
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

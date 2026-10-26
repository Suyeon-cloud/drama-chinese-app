import React, { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { DraftResultError, buildDraftPrompt, parseDraftResult, type DraftPromptInput } from "../../lib/aiDraft";
import { ApiError, api } from "../../lib/api";
import type { LessonDraft } from "../../../content/types";

export type AiStatus = { connected: boolean; source: "app" | "env" | null; hint: string | null; model: string };

/** 연결된 API 키 상태 (reload: 연결·해제 뒤 다시 읽기) */
export const useAiStatus = () => {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const reload = () =>
    void api<AiStatus>("/ai/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  useEffect(reload, []);
  return { status, reload };
};

/** 관리자 모드: 본인 Anthropic API 키 연결·해제 */
export const KeyForm: React.FC<{ status: AiStatus | null; onChanged: () => void }> = ({ status, onChanged }) => {
  const toast = useToast();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.show(done, "success");
      setKey("");
      onChanged();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "처리하지 못했어요.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="ai-key-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api("/ai/key", { method: "PUT", body: { apiKey: key } }), "API 키를 연결했어요.");
      }}
    >
      <label className="field">
        <span>Anthropic API 키 {status?.source === "app" ? `(연결됨 ${status.hint})` : ""}</span>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !key.trim()}>
          {busy ? "확인 중…" : status?.source === "app" ? "키 바꾸기" : "연결"}
        </button>
        {status?.source === "app" ? (
          <button
            type="button"
            className="link-btn danger"
            disabled={busy}
            onClick={() => void run(() => api("/ai/key", { method: "DELETE" }), "API 키 연결을 해제했어요.")}
          >
            연결 해제
          </button>
        ) : null}
      </div>
      <small className="muted">
        console.anthropic.com에서 만든 본인 키를 넣어요. 키는 서버에만 저장되고 화면에는 끝 4자리만 보여요. 생성할 때마다
        이 키의 계정에 사용량(토큰)만큼 요금이 청구돼요.
      </small>
    </form>
  );
};

/**
 * 생성형 AI로 학습 콘텐츠 채우기.
 * ① 프롬프트를 복사해 외부 AI(ChatGPT·Claude 등)에 붙여 넣고 답을 다시 붙여 넣거나,
 * ② 연결한 API 키로 바로 생성한다. 두 방법 모두 같은 프롬프트·결과 형식을 쓴다.
 */
export const AiDraftPanel: React.FC<
  DraftPromptInput & { hasDraft: boolean; onApply: (draft: LessonDraft) => void }
> = ({ hasDraft, onApply, ...input }) => {
  const { user } = useAuth();
  const adminMode = user?.provider === "admin";
  const toast = useToast();
  const { status, reload: loadStatus } = useAiStatus();
  const [showKey, setShowKey] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<LessonDraft | null>(null);
  const [generating, setGenerating] = useState(false);

  const prompt = buildDraftPrompt(input);

  /** 지금 초안이 있으면 한 번 더 묻고 적용한다. */
  const apply = (draft: LessonDraft) => {
    if (hasDraft) return setPending(draft);
    onApply(draft);
    toast.show("AI 결과로 학습 콘텐츠를 채웠어요. 내용을 검토해 주세요.", "success");
  };

  const applyText = (text: string) => {
    setError(null);
    try {
      apply(parseDraftResult(text, input.level));
    } catch (err) {
      setError(err instanceof DraftResultError ? err.message : "결과를 읽지 못했어요.");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.show("프롬프트를 복사했어요. 생성형 AI에 붙여 넣어 주세요.", "success");
    } catch {
      setShowPrompt(true);
      toast.show("자동 복사가 막혀 있어요. 아래 칸에서 직접 복사해 주세요.", "error");
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api<{ text: string; usage: { input: number; output: number } }>("/ai/draft", {
        method: "POST",
        body: { prompt },
      });
      setResult(res.text);
      toast.show(`생성했어요. (입력 ${res.usage.input.toLocaleString()} · 출력 ${res.usage.output.toLocaleString()} 토큰)`, "success");
      applyText(res.text);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "생성하지 못했어요.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="ai-draft">
      <h4>✨ 생성형 AI로 내용 채우기</h4>
      <p className="muted small">
        표현 뜻·문법 설명·문화렌즈·퀴즈 정답까지 AI가 만들어요. 결과는 아래 편집 칸에 들어가니 꼭 검토한 뒤 공개해 주세요.
      </p>

      <div className="ai-step">
        <b>방법 1 · 외부 AI 사용</b>
        <div className="row-start">
          <button type="button" className="btn btn-soft btn-sm" onClick={() => void copy()}>
            📋 프롬프트 복사
          </button>
          <button type="button" className="link-btn" onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? "프롬프트 숨기기" : "프롬프트 보기"}
          </button>
        </div>
        {showPrompt ? (
          <textarea className="ai-prompt" readOnly rows={8} value={prompt} onFocus={(e) => e.target.select()} />
        ) : null}
        <label className="field">
          <span>AI 답 붙여넣기 (JSON)</span>
          <textarea
            rows={5}
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder='{ "expressions": [ … ], "grammar": [ … ], "lenses": [ … ], "quiz": [ … ] }'
            spellCheck={false}
          />
        </label>
        <button type="button" className="btn btn-primary btn-sm" disabled={!result.trim()} onClick={() => applyText(result)}>
          결과 적용
        </button>
      </div>

      <div className="ai-step">
        <b>방법 2 · 연결한 API로 바로 생성</b>
        {status?.connected ? (
          <div className="row-start">
            <button type="button" className="btn btn-primary btn-sm" disabled={generating} onClick={() => void generate()}>
              {generating ? "생성 중… (1~2분 걸릴 수 있어요)" : "✨ AI로 바로 생성"}
            </button>
            <small className="muted">
              {status.model} · 키 {status.hint}
              {status.source === "env" ? " (서버 환경변수)" : ""}
            </small>
          </div>
        ) : (
          <p className="muted small">
            연결된 API 키가 없어요. {adminMode ? "아래에서 본인 키를 연결해 주세요." : "관리자 모드로 로그인해 키를 연결해 주세요."}
          </p>
        )}
        {adminMode ? (
          showKey || !status?.connected ? (
            <KeyForm status={status} onChanged={loadStatus} />
          ) : (
            <button type="button" className="link-btn" onClick={() => setShowKey(true)}>
              API 키 관리
            </button>
          )
        ) : null}
      </div>

      {error ? <p className="field-error small">{error}</p> : null}
      {pending ? (
        <div className="row-start">
          <span className="small">지금 초안을 AI 결과로 바꿀까요? (입력해 둔 내용은 지워져요)</span>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              onApply(pending);
              setPending(null);
              toast.show("AI 결과로 학습 콘텐츠를 바꿨어요. 내용을 검토해 주세요.", "success");
            }}
          >
            바꾸기
          </button>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setPending(null)}>
            취소
          </button>
        </div>
      ) : null}
    </div>
  );
};

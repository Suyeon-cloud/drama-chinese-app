import React, { useState } from "react";
import { isAnthropicKeyShape } from "../../../content/liveQuiz";
import { useToast } from "../../components/Toast";
import { DraftResultError, buildDraftPrompt, parseDraftResult, type DraftPromptInput } from "../../lib/aiDraft";
import { ApiError, api } from "../../lib/api";
import { clearPersonalAiKey, personalAiKeyHeaders, setPersonalAiKey, usePersonalAiKey } from "../../store/aiKey";
import type { LessonDraft } from "../../../content/types";

/**
 * 본인 Anthropic API 키 입력·바꾸기·지우기 (관리자·교수자 공통, BYOK).
 * 키는 브라우저 메모리(store/aiKey)에만 두고 강의자료 초안·번역·병음·실시간 퀴즈가 함께 쓴다. 서버·DB·브라우저 저장소에 저장하지 않는다.
 */
export const AiKeyField: React.FC = () => {
  const keySet = usePersonalAiKey();
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const valid = isAnthropicKeyShape(input.trim());
  const use = () => {
    if (!valid) return;
    setPersonalAiKey(input);
    setInput("");
    setEditing(false);
  };
  return (
    <div className="ai-key-form">
      {keySet && !editing ? (
        <div className="row-start" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="small">🔑 본인 API 키 입력됨 (새로고침·로그아웃하면 지워져요)</span>
          <button type="button" className="link-btn" onClick={() => setEditing(true)}>
            키 바꾸기
          </button>
          <button type="button" className="link-btn danger" onClick={clearPersonalAiKey}>
            지우기
          </button>
        </div>
      ) : (
        <>
          <label className="field">
            <span>본인 Anthropic API 키</span>
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  use();
                }
              }}
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {input.trim() && !valid ? <small className="field-error">sk-ant- 로 시작하는 Anthropic API 키 형식이 아니에요.</small> : null}
          <div className="row-start">
            <button type="button" className="btn btn-soft btn-sm" disabled={!valid} onClick={use}>
              키 사용
            </button>
            {editing ? (
              <button type="button" className="link-btn" onClick={() => (setEditing(false), setInput(""))}>
                취소
              </button>
            ) : null}
          </div>
        </>
      )}
      <small className="muted">
        console.anthropic.com에서 만든 본인 키를 넣어요. 키는 서버·DB·브라우저 저장소에 저장되지 않고 AI 생성 요청에만 쓰여요.
        생성할 때마다 이 키의 계정에 사용량(토큰)만큼 요금이 청구돼요.
      </small>
    </div>
  );
};

/**
 * 생성형 AI로 학습 콘텐츠 채우기.
 * ① 프롬프트를 복사해 외부 AI(ChatGPT·Claude 등)에 붙여 넣고 답을 다시 붙여 넣거나,
 * ② 본인 API 키(BYOK)로 바로 생성한다. 두 방법 모두 같은 프롬프트·결과 형식을 쓴다.
 */
export const AiDraftPanel: React.FC<
  DraftPromptInput & { hasDraft: boolean; onApply: (draft: LessonDraft) => void }
> = ({ hasDraft, onApply, ...input }) => {
  const toast = useToast();
  const keySet = usePersonalAiKey();
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
        headers: personalAiKeyHeaders(),
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
        <b>방법 2 · 본인 API 키로 바로 생성</b>
        <AiKeyField />
        {keySet ? (
          <div className="row-start">
            <button type="button" className="btn btn-primary btn-sm" disabled={generating} onClick={() => void generate()}>
              {generating ? "생성 중… (1~2분 걸릴 수 있어요)" : "✨ AI로 바로 생성"}
            </button>
          </div>
        ) : (
          <p className="muted small">API 키가 없으면 방법 1(프롬프트 복사 → 외부 AI → JSON 붙여넣기)을 써 주세요.</p>
        )}
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

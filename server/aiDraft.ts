// 연결한 Anthropic API 키로 학습 콘텐츠 초안을 생성한다. 프롬프트는 화면(src/app/lib/aiDraft.ts)에서 만든다.
import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-opus-5-5";

/** 키가 쓸 수 있는지 확인한다. (모델 정보 조회는 토큰을 쓰지 않는다) */
export const checkAnthropicKey = async (apiKey: string) => {
  const client = new Anthropic({ apiKey });
  await client.models.retrieve(AI_MODEL);
};

export const generateDraftText = async (apiKey: string, prompt: string) => {
  const client = new Anthropic({ apiKey });
  const message = await client.beta.messages
    .stream({
      model: AI_MODEL,
      max_tokens: 32000,
      output_config: { effort: "medium" },
      // 안전 분류기가 거절하면 서버가 다른 모델로 한 번 더 시도한다.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new AiDraftError("AI가 이 요청을 처리하지 않았어요. 대본 내용을 확인해 주세요.");
  if (message.stop_reason === "max_tokens") throw new AiDraftError("결과가 너무 길어 중간에 끊겼어요. 대본을 나눠서 다시 시도해 주세요.");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { text, usage: { input: message.usage.input_tokens, output: message.usage.output_tokens } };
};

export class AiDraftError extends Error {}

/** SDK 오류 → 화면에 보여줄 한국어 안내 */
export const aiErrorMessage = (err: unknown) => {
  if (err instanceof AiDraftError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않아요. 키를 다시 연결해 주세요.";
  if (err instanceof Anthropic.PermissionDeniedError) return "이 API 키로는 모델을 쓸 수 없어요. Anthropic 콘솔에서 권한·결제를 확인해 주세요.";
  if (err instanceof Anthropic.RateLimitError) return "요청이 많아 잠시 막혔어요. 잠시 후 다시 시도해 주세요.";
  if (err instanceof Anthropic.BadRequestError) return `요청을 처리하지 못했어요: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Anthropic 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
  if (err instanceof Anthropic.APIError) return `Anthropic 오류(${err.status ?? "?"}): ${err.message}`;
  return "AI 생성 중 오류가 났어요.";
};

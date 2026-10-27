// 생성형 AI로 학습 콘텐츠 채우기: 프롬프트 만들기 + 결과(JSON) 읽기.
// 외부 AI에 프롬프트를 복사해 붙여 넣는 방법과, 연결한 API 키로 바로 생성하는 방법이 같은 프롬프트·형식을 쓴다.

import { lowerPinyin } from "../../content/lessons";
import { getLevel } from "../../content/levels";
import type { DraftLens, DraftNote, DraftQuiz, LearningDirection, LessonDraft } from "../../content/types";
import { createId, nowIso } from "../store/localJson";
import { pickLinesForLevel } from "./draftPick";

export type DraftPromptInput = {
  lines: string[];
  direction: LearningDirection;
  level: string;
  week: number;
  title: string;
  dramaTitle: string;
};

const RESULT_FORMAT = `{
  "expressions": [{ "source": "", "note": "", "pinyin": "" }],
  "grammar": [{ "source": "", "note": "", "pinyin": "" }],
  "lenses": [{ "title": "", "source": "", "text": "" }],
  "quiz": [{ "question": "", "options": ["", "", "", ""], "answer": 0, "explanation": "" }]
}`;

/** 강의 정보·HSK 기준·대본으로 프롬프트를 만든다. */
export const buildDraftPrompt = ({ lines, direction, level, week, title, dramaTitle }: DraftPromptInput) => {
  const def = getLevel(level);
  const plan = def.draft;
  const picked = pickLinesForLevel(lines, plan);
  const zhKo = direction === "zh-ko";
  const script = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
  const suggest = [...picked.expressions, ...picked.grammar].map((l) => `- ${l}`).join("\n");

  return `당신은 드라마로 중국어를 가르치는 한국 대학 수업의 학습 콘텐츠 작성자입니다.
아래 대본으로 학습 콘텐츠를 만들어 주세요.

[강의 정보]
- ${week}주차 · ${title || "(제목 없음)"}${dramaTitle ? ` · 드라마 《${dramaTitle}》` : ""}
- 학습 방향: ${zhKo ? "중국어 → 한국어 (중국어 대사를 보고 뜻을 이해)" : "한국어 → 중국어 (한국어 대사를 중국어로 표현)"}
- 학습 수준: ${def.label} — ${def.definition}

[만들 항목 수]
- 핵심 표현 ${plan.expressions}개, 어휘·문법 ${plan.grammar}개, 문화렌즈 ${plan.lenses}개, 퀴즈 ${plan.quiz}문제

[작성 규칙]
1. "source"(원문 표현)는 반드시 아래 대본의 한 줄을 글자 그대로 복사해 넣으세요. (영상 시간과 자동으로 연결돼요)
2. ${def.label} 학습자에게 맞는 대사를 고르세요. 아래 [추천 대사]는 수준에 맞는 길이의 대사예요. 참고하되 더 알맞은 대사가 있으면 바꿔도 돼요.
3. ${
    zhKo
      ? `핵심 표현의 "note"는 한국어로 뜻과 쓰임을 설명하고, "pinyin"에는 원문 표현의 병음(성조 부호 포함, 문장 첫 글자와 이름까지 모두 소문자)을 넣으세요.`
      : `핵심 표현의 "note"는 이 한국어 대사에 맞는 자연스러운 중국어 표현을 먼저 쓰고 이어서 한국어로 설명하세요. "pinyin"에는 그 중국어 표현의 병음(성조 부호 포함, 문장 첫 글자와 이름까지 모두 소문자)을 넣으세요.`
  }
4. 어휘·문법의 "note"는 문형이나 핵심 어휘를 한국어로 설명하고 짧은 예문을 하나 넣으세요. "pinyin"은 핵심 표현과 같은 규칙이에요.
5. 문화렌즈는 이 장면과 관련된 중국 문화·사회적 맥락을 한국 학습자에게 한국어로 설명하세요. "title"은 짧은 제목, "text"는 3~5문장이에요.
6. 퀴즈는 보기 4개, "answer"는 정답 보기의 번호(0부터 시작), "explanation"은 한국어 해설이에요. 정답 위치는 문제마다 섞어 주세요.
7. 다른 설명 없이 아래 형식의 JSON만 출력하세요.

[출력 형식]
${RESULT_FORMAT}

[추천 대사]
${suggest || "- (없음)"}

[대본]
${script}`;
};

/** 형식이 맞지 않을 때 화면에 보여줄 오류 */
export class DraftResultError extends Error {}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

/** AI 답에서 JSON 부분만 꺼낸다. (```json 코드 블록이나 앞뒤 설명이 붙어 있어도 된다) */
const extractJson = (text: string): unknown => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const body = fenced ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0) throw new DraftResultError("결과에서 JSON을 찾지 못했어요. AI 답을 그대로 붙여 넣어 주세요.");
  if (end <= start) throw new DraftResultError("JSON이 중간에 끊겼어요. AI에게 ‘이어서 끝까지 출력해 줘’라고 한 뒤 전체를 붙여 넣어 주세요.");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new DraftResultError("JSON 형식이 올바르지 않아요. 끝까지 잘리지 않았는지 확인해 주세요.");
  }
};

/** AI 결과(JSON 텍스트) → 학습 콘텐츠 초안 */
export const parseDraftResult = (text: string, level: string): LessonDraft => {
  const data = extractJson(text) as Record<string, unknown>;
  const note = (x: Record<string, unknown>): DraftNote => {
    const pinyin = lowerPinyin(str(x.pinyin));
    return { id: createId("note"), source: str(x.source), note: str(x.note), ...(pinyin ? { pinyin } : {}) };
  };
  const expressions = list(data.expressions).map(note).filter((x) => x.source || x.note);
  const grammar = list(data.grammar).map(note).filter((x) => x.source || x.note);
  const lenses: DraftLens[] = list(data.lenses)
    .map((x) => ({ id: createId("lens"), title: str(x.title), source: str(x.source), text: str(x.text) }))
    .filter((x) => x.title || x.text);
  const quiz: DraftQuiz[] = list(data.quiz)
    .map((x) => {
      const options = Array.isArray(x.options) ? x.options.map(str) : [];
      const answer = typeof x.answer === "number" && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < options.length ? x.answer : null;
      return { id: createId("quiz"), question: str(x.question), options, answer, explanation: str(x.explanation) };
    })
    .filter((x) => x.question && x.options.length >= 2);
  if (!expressions.length && !grammar.length && !lenses.length && !quiz.length) {
    throw new DraftResultError("expressions·grammar·lenses·quiz 중 채워진 항목이 없어요. 출력 형식을 확인해 주세요.");
  }
  const now = nowIso();
  return { expressions, grammar, lenses, quiz, level, createdAt: now, updatedAt: now };
};

/* ───────── 자막 번역 (중국어 원문 → 한국어, 한국어 원문 → 중국어) ───────── */

export type TranslatePromptInput = {
  /** 원문 문장 (번호는 1부터, 이 순서대로 결과를 돌려받는다) */
  lines: string[];
  direction: LearningDirection;
  title: string;
  dramaTitle: string;
};

export const buildTranslatePrompt = ({ lines, direction, title, dramaTitle }: TranslatePromptInput) => {
  const zhKo = direction === "zh-ko";
  const from = zhKo ? "중국어" : "한국어";
  const to = zhKo ? "한국어" : "중국어(간체자)";
  return `당신은 드라마 자막 번역가입니다. 아래 ${from} 자막을 ${to}로 번역해 주세요.
${title || dramaTitle ? `작품: ${dramaTitle ? `《${dramaTitle}》` : ""}${title ? ` · ${title}` : ""}\n` : ""}
[번역 규칙]
1. 번호마다 한 줄씩, 앞뒤 대사의 흐름과 인물 관계(말투·높임)를 살려 자연스러운 구어체 자막으로 번역하세요.
2. 한 줄을 여러 줄로 나누거나 여러 줄을 합치지 마세요. 모든 번호를 빠짐없이 번역하세요.
3. ${zhKo ? "한국 학습자가 뜻을 이해하기 쉽게, 지나친 의역은 피하세요." : "중국 드라마에서 실제로 쓰는 자연스러운 표현을 쓰고, 병음은 넣지 마세요."}
4. 다른 설명 없이 아래 형식의 JSON만 출력하세요.

[출력 형식]
{ "translations": [{ "n": 1, "text": "" }] }

[자막]
${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;
};

/** 번호 붙은 결과 { [key]: [{ n, text }] } → 번호(1부터)별 문장 */
const parseNumbered = (text: string, key: string, label: string): Map<number, string> => {
  const data = extractJson(text) as Record<string, unknown>;
  const out = new Map<number, string>();
  for (const x of list(data[key])) {
    const n = typeof x.n === "number" ? x.n : Number(x.n);
    const t = str(x.text);
    if (Number.isInteger(n) && n > 0 && t) out.set(n, t);
  }
  if (out.size === 0) throw new DraftResultError(`${label} 결과(${key})를 찾지 못했어요. 출력 형식을 확인해 주세요.`);
  return out;
};

/** AI 번역 결과 → 번호(1부터)별 번역문 */
export const parseTranslateResult = (text: string) => parseNumbered(text, "translations", "번역");

/* ───────── 자막 병음 (중국어 자막 한 줄마다) ───────── */

export const buildPinyinPrompt = (lines: string[]) => `당신은 중국어 병음 표기 전문가입니다. 아래 중국어 드라마 자막의 병음을 써 주세요.

[표기 규칙]
1. 성조 부호(ā á ǎ à)로 쓰고, 경성은 부호 없이 쓰세요. 성조 숫자(ma1)는 쓰지 마세요.
2. 모두 소문자로 쓰세요. 문장 첫 글자, 사람 이름, 지명도 대문자로 쓰지 마세요.
3. 단어 단위로 띄어 쓰고(예: wǒmen shì yì jiā rén), 다음자(多音字)와 성조 변화(一·不)는 문맥에 맞게 쓰세요.
4. 문장부호는 빼고, 한자가 아닌 글자(숫자·영어)는 그대로 두세요.
5. 번호마다 한 줄씩, 모든 번호를 빠짐없이 쓰세요.
6. 다른 설명 없이 아래 형식의 JSON만 출력하세요.

[출력 형식]
{ "pinyin": [{ "n": 1, "text": "" }] }

[자막]
${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;

/** AI 병음 결과 → 번호(1부터)별 병음 (소문자로 맞춘다) */
export const parsePinyinResult = (text: string) => {
  const out = parseNumbered(text, "pinyin", "병음");
  for (const [n, t] of out) out.set(n, lowerPinyin(t));
  return out;
};

// 6-A: 실시간 수업용 퀴즈 문제 세트 — 입력 규칙 · 정규화 · 중복 판정 · AI 프롬프트/결과 파싱 (화면과 서버가 함께 쓴다)
//
// - 기존 학습 퀴즈(강의자료 content.quiz·교수자 초안 quiz)·복습 HTML·학습 기록과 별개로 저장한다. 이 모듈은 그것들을 읽기만 한다.
// - 중복: 완전 중복(문장 정규화 + 보기 집합이 같음 — 보기 순서만 바꾼 것 포함)은 저장을 막고,
//   비슷한 문제(문장 유사도·같은 문장에 다른 보기)는 경고만 한다. 최종 판단은 교수자.
// - 외부 AI는 서버(교수자 개인 키 또는 관리자가 허용한 공용 키)나 교수자가 직접 쓰는 외부 AI로만 부른다. 이 모듈은 텍스트만 만든다.

export const LIVE_QUIZ_LIMITS = {
  title: 100,
  questions: 30,
  question: 300,
  option: 120,
  optionsMin: 2,
  optionsMax: 6,
  explanation: 500,
} as const;

export type LiveQuizOrigin = "ai" | "json" | "manual";
export type LiveQuizStatus = "draft" | "ready";
export type LiveQuizQuestion = {
  id: string;
  question: string;
  options: string[];
  /** 0부터 */
  answer: number;
  explanation: string;
  origin: LiveQuizOrigin;
};
export type LiveQuizSet = {
  id: string;
  courseId: string;
  week: number;
  /** 문제를 만든 강의자료 (선택, 지워지면 null) */
  lessonId: string | null;
  title: string;
  status: LiveQuizStatus;
  questions: LiveQuizQuestion[];
  /** 동시 편집 확인용 — 저장할 때 그대로 돌려보낸다 */
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedByLabel?: string | null;
};
/** 저장 입력 (id·버전·시각은 서버가 정한다. 문제 id는 기존 문제면 그대로 보낸다) */
export type LiveQuizSetInput = {
  week: number;
  lessonId?: string | null;
  title: string;
  status?: LiveQuizStatus;
  questions: (Omit<LiveQuizQuestion, "id"> & { id?: string })[];
};

/* ───────── 정규화 · 중복 판정 ───────── */

/** 비교용 문장: 유니코드 정규화(NFKC) → 소문자 → 공백·문장부호·기호 제거 */
export const normalizeQuizText = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");

/** 완전 중복 판정 키: 정규화한 문제 + 정규화한 보기 집합(순서 무시) */
export const quizKey = (q: { question: string; options: string[] }) =>
  `${normalizeQuizText(q.question)}|${[...q.options.map(normalizeQuizText)].sort().join("|")}`;

const bigrams = (s: string) => {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
};
/** 문장 유사도 (문자 2-gram Jaccard, 0~1) */
export const quizSimilarity = (a: string, b: string) => {
  const x = bigrams(normalizeQuizText(a));
  const y = bigrams(normalizeQuizText(b));
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return inter / (x.size + y.size - inter);
};
/**
 * 비슷한 문제 경고 기준 (완전 중복 차단과 별개 — 경고만 한다).
 * "‘你好’의 뜻은?"·"‘谢谢’의 뜻은?"처럼 틀이 같은 문제는 문장 유사도가 0.6을 넘기 쉬워, 문장 유사도만으로는 가를 수 없다.
 * 그래서 두 문제 모두 중국어(한자)가 있으면 그 한자가 대부분 같을 때만(hanOverlap) 경고하고, 그때는 문장 기준을 낮춘다(withHan).
 * 한자가 없는(한쪽만 있는) 문제는 문장 유사도(plain)로 본다.
 */
export const SIMILAR = { hanOverlap: 0.6, withHan: 0.35, plain: 0.4 } as const;

const hanChars = (s: string) => new Set([...normalizeQuizText(s)].filter((ch) => /\p{Script=Han}/u.test(ch)));
/** 비슷한 문제인지 (경고용) */
export const quizSimilar = (a: string, b: string) => {
  const ha = hanChars(a);
  const hb = hanChars(b);
  const sim = quizSimilarity(a, b);
  if (ha.size && hb.size) {
    let inter = 0;
    for (const ch of ha) if (hb.has(ch)) inter++;
    return inter / (ha.size + hb.size - inter) >= SIMILAR.hanOverlap && sim >= SIMILAR.withHan;
  }
  return sim >= SIMILAR.plain;
};

export type QuizRef = { question: string; options: string[]; source: string };
export type DuplicateReport = { exact: string[]; similar: string[] };

/**
 * 문제 하나의 중복 판정. exact: 같은 문제(보기 순서만 다른 것 포함) — 저장 불가 / similar: 비슷한 문제 — 경고만.
 * existing: 비교할 기존 문제 (학습 퀴즈·다른 실시간 세트·같은 세트의 다른 문제)
 */
export const duplicateReport = (q: { question: string; options: string[] }, existing: QuizRef[]): DuplicateReport => {
  const key = quizKey(q);
  const text = normalizeQuizText(q.question);
  const exact: string[] = [];
  const similar: string[] = [];
  for (const e of existing) {
    if (quizKey(e) === key) exact.push(e.source);
    else if (normalizeQuizText(e.question) === text || quizSimilar(q.question, e.question)) similar.push(e.source);
  }
  return { exact, similar };
};

/* ───────── 입력 검사 (서버·화면 공통) ───────── */

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const ORIGINS: readonly LiveQuizOrigin[] = ["ai", "json", "manual"];

const text = (raw: unknown, label: string, max: number, required: boolean): { ok: true; value: string } | Fail => {
  if (raw === undefined || raw === null) return required ? fail(`${label}을(를) 입력해 주세요.`) : { ok: true, value: "" };
  if (typeof raw !== "string") return fail(`${label} 형식이 올바르지 않아요.`);
  const value = raw.trim();
  if (required && !value) return fail(`${label}을(를) 입력해 주세요.`);
  if (value.length > max) return fail(`${label}은(는) ${max}자까지 입력할 수 있어요.`);
  return { ok: true, value };
};

/** 문제 하나 검사 (n: 화면에 보일 문제 번호) */
export const parseLiveQuizQuestion = (raw: unknown, n: number): { ok: true; value: LiveQuizSetInput["questions"][number] } | Fail => {
  const at = `${n}번 문제`;
  if (!isObject(raw)) return fail(`${at} 형식이 올바르지 않아요.`);
  if (raw.id !== undefined && (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id))) return fail(`${at}의 id 형식이 올바르지 않아요.`);
  const question = text(raw.question, `${at} 문장`, LIVE_QUIZ_LIMITS.question, true);
  if (!question.ok) return question;
  if (!Array.isArray(raw.options)) return fail(`${at}의 보기 형식이 올바르지 않아요.`);
  if (raw.options.length < LIVE_QUIZ_LIMITS.optionsMin || raw.options.length > LIVE_QUIZ_LIMITS.optionsMax) {
    return fail(`${at}의 보기는 ${LIVE_QUIZ_LIMITS.optionsMin}~${LIVE_QUIZ_LIMITS.optionsMax}개여야 해요.`);
  }
  const options: string[] = [];
  for (const [i, o] of raw.options.entries()) {
    const r = text(o, `${at} 보기 ${i + 1}`, LIVE_QUIZ_LIMITS.option, true);
    if (!r.ok) return r;
    options.push(r.value);
  }
  if (new Set(options.map(normalizeQuizText)).size !== options.length) return fail(`${at}에 같은 보기가 있어요.`);
  if (typeof raw.answer !== "number" || !Number.isInteger(raw.answer) || raw.answer < 0 || raw.answer >= options.length) {
    return fail(`${at}의 정답을 골라 주세요.`);
  }
  const explanation = text(raw.explanation, `${at} 해설`, LIVE_QUIZ_LIMITS.explanation, false);
  if (!explanation.ok) return explanation;
  const origin = raw.origin === undefined ? "manual" : raw.origin;
  if (!ORIGINS.includes(origin as LiveQuizOrigin)) return fail(`${at}의 출처 형식이 올바르지 않아요.`);
  return {
    ok: true,
    value: {
      ...(raw.id ? { id: raw.id as string } : {}),
      question: question.value,
      options,
      answer: raw.answer,
      explanation: explanation.value,
      origin: origin as LiveQuizOrigin,
    },
  };
};

/** 세트 저장 입력 검사: 주차 범위, 문제 1~30개, 같은 세트 안 완전 중복 금지 */
export const parseLiveQuizSetInput = (body: unknown, weekCount: number): { ok: true; value: LiveQuizSetInput } | Fail => {
  if (!isObject(body)) return fail("문제 세트 형식이 올바르지 않아요.");
  for (const k of ["id", "courseId", "version", "createdAt", "updatedAt", "updatedByLabel"]) {
    if (k in body) return fail("id·과목·버전 등은 서버가 정해요. 보내지 마세요.");
  }
  if (typeof body.week !== "number" || !Number.isInteger(body.week) || body.week < 1 || body.week > weekCount) {
    return fail(`주차는 1~${weekCount}주차 중에서 골라 주세요.`);
  }
  const title = text(body.title, "세트 제목", LIVE_QUIZ_LIMITS.title, true);
  if (!title.ok) return title;
  if (body.lessonId !== undefined && body.lessonId !== null && (typeof body.lessonId !== "string" || !ID_PATTERN.test(body.lessonId))) {
    return fail("강의자료 형식이 올바르지 않아요.");
  }
  const status = body.status === undefined ? "draft" : body.status;
  if (status !== "draft" && status !== "ready") return fail("상태는 작성 중(draft) 또는 준비 완료(ready)만 고를 수 있어요.");
  if (!Array.isArray(body.questions) || body.questions.length < 1) return fail("문제를 1개 이상 넣어 주세요.");
  if (body.questions.length > LIVE_QUIZ_LIMITS.questions) return fail(`한 세트에는 문제를 ${LIVE_QUIZ_LIMITS.questions}개까지 넣을 수 있어요.`);
  const questions: LiveQuizSetInput["questions"] = [];
  for (const [i, q] of body.questions.entries()) {
    const r = parseLiveQuizQuestion(q, i + 1);
    if (!r.ok) return r;
    questions.push(r.value);
  }
  const ids = questions.flatMap((q) => (q.id ? [q.id] : []));
  if (new Set(ids).size !== ids.length) return fail("같은 문제 id가 두 번 들어 있어요.");
  const keys = questions.map(quizKey);
  const dup = keys.findIndex((k, i) => keys.indexOf(k) !== i);
  if (dup >= 0) return fail(`${keys.indexOf(keys[dup]) + 1}번과 ${dup + 1}번 문제가 같아요. (보기 순서만 다른 경우 포함)`);
  return {
    ok: true,
    value: { week: body.week, lessonId: (body.lessonId as string | null | undefined) ?? null, title: title.value, status, questions },
  };
};

/* ───────── AI 프롬프트 · 결과 파싱 ───────── */

export type LiveQuizPromptInput = {
  week: number;
  title: string;
  heading: string;
  /** 장면 대사 (원문 · 뜻) */
  lines: { zh: string; ko: string }[];
  /** 핵심 표현·문법·문화 요약 */
  points: string[];
  /** 만들지 말아야 할 기존 문제 (학습 퀴즈·다른 실시간 세트) */
  avoid: string[];
  count: number;
};

/** 외부 AI에 그대로 붙여 넣을 수 있는 프롬프트 (BYOK·공용 키 경로도 같은 문장을 쓴다) */
export const buildLiveQuizPrompt = (p: LiveQuizPromptInput) => {
  const lines = p.lines.slice(0, 120).map((l, i) => `${i + 1}. ${l.zh}${l.ko ? ` — ${l.ko}` : ""}`).join("\n");
  const points = p.points.slice(0, 40).map((x) => `- ${x}`).join("\n");
  const avoid = p.avoid.slice(0, 60).map((x) => `- ${x}`).join("\n");
  return `당신은 한국 대학생에게 드라마로 중국어를 가르치는 교수자를 돕는 조교입니다.
아래 ${p.week}주차 강의(${p.heading} · ${p.title}) 내용을 바탕으로, 수업 중 학생이 휴대폰으로 바로 답하는 실시간 객관식 퀴즈 ${p.count}문제를 만들어 주세요.

조건
- 한 문제에 보기 4개, 정답 1개. 정답 위치는 골고루 섞어 주세요.
- 문제와 보기는 짧게(휴대폰 한 화면). 해설은 1~2문장 한국어.
- 아래 "기존 문제"와 같은 내용·같은 보기의 문제는 만들지 마세요. 새로운 관점(표현 의미, 상황 이해, 문법, 문화, 빈칸 채우기 등)으로 다양하게.
- 강의 내용에 없는 사실을 지어내지 마세요.

강의 대사
${lines || "(없음)"}

핵심 표현·문법·문화
${points || "(없음)"}

기존 문제 (중복 금지)
${avoid || "(없음)"}

출력: 아래 JSON 하나만 출력하세요. 설명 문장은 붙이지 마세요.
{"questions":[{"question":"문제","options":["보기1","보기2","보기3","보기4"],"answer":0,"explanation":"해설"}]}
answer는 정답 보기의 순서(0부터)입니다.`;
};

export class LiveQuizResultError extends Error {}

/** AI 답(JSON 텍스트, 코드 블록·앞뒤 설명이 붙어 있어도 됨) → 문제 후보. 형식이 틀린 문제는 빼고 그 수를 알려 준다 */
export const parseLiveQuizResult = (text: string, origin: LiveQuizOrigin): { questions: LiveQuizSetInput["questions"]; skipped: number } => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const body = fenced ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0) throw new LiveQuizResultError("결과에서 JSON을 찾지 못했어요. AI 답을 그대로 붙여 넣어 주세요.");
  if (end <= start) throw new LiveQuizResultError("JSON이 중간에 끊겼어요. AI에게 ‘이어서 끝까지 출력해 줘’라고 한 뒤 전체를 붙여 넣어 주세요.");
  let data: unknown;
  try {
    data = JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new LiveQuizResultError("JSON 형식이 올바르지 않아요. 끝까지 잘리지 않았는지 확인해 주세요.");
  }
  const raw = isObject(data) && Array.isArray(data.questions) ? data.questions : [];
  const questions: LiveQuizSetInput["questions"] = [];
  let skipped = 0;
  raw.slice(0, LIVE_QUIZ_LIMITS.questions).forEach((q, i) => {
    const r = parseLiveQuizQuestion(isObject(q) ? { ...q, id: undefined, origin } : q, i + 1);
    if (r.ok) questions.push(r.value);
    else skipped++;
  });
  if (!questions.length) throw new LiveQuizResultError("쓸 수 있는 문제가 없어요. questions 배열 형식(question·options·answer·explanation)을 확인해 주세요.");
  return { questions, skipped: skipped + Math.max(0, raw.length - LIVE_QUIZ_LIMITS.questions) };
};

/** 교수자 개인 키 형식 (서버도 같은 규칙으로 확인한다) */
export const isAnthropicKeyShape = (key: string) => /^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(key);

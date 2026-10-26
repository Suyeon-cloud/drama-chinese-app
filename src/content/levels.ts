/**
 * 학습 수준 체계 — HSK 1~6급 기준. 1~2급은 초급, 3~4급은 중급, 5~6급은 고급으로 함께 표시한다.
 * 수준을 바꾸거나 늘릴 때는 이 목록만 수정한다.
 * 강의자료(Lesson.level)에는 id만 저장된다. 학습 방향(중→한 / 한→중)과는 별개다.
 * 한→중(9~15주차) 강의자료도 학습자가 만들어 내는 중국어 수준으로 등급을 정한다.
 */
export type LevelDef = {
  id: string;
  label: string;
  /** 짧은 요약 (선택 상자 등) */
  description: string;
  /** 수준 정의 — 교수자 편집 화면과 학습 화면에 표시 */
  definition: string;
  /** app.css의 tone-* 클래스 */
  tone: "mint" | "sky" | "lavender" | "pink" | "cream";
  /** 학습 콘텐츠 초안을 만들 때의 기준 */
  draft: DraftPlan;
};

/**
 * 초안 기준. 원문 문장을 글자 수(공백·문장부호 제외)로 짧은 것부터 줄 세운 뒤,
 * window 구간(0 = 가장 짧은 문장, 1 = 가장 긴 문장)에서 고른다. 낮은 급수는 짧은 대사, 높은 급수는 긴 대사.
 * 글자 수 순위로 고르므로 중국어 원문(1~8주차)과 한국어 원문(9~15주차)에 똑같이 쓸 수 있다.
 */
export type DraftPlan = {
  window: [from: number, to: number];
  expressions: number;
  grammar: number;
  lenses: number;
  quiz: number;
};

export const LEVELS: LevelDef[] = [
  {
    id: "hsk1",
    label: "HSK 1급 · 초급",
    description: "어휘 150개 · 인사·자기소개",
    definition: "인사, 자기소개, 숫자·시간처럼 아주 짧고 자주 쓰는 대사를 알아듣는 단계 (어휘 약 150개)",
    tone: "mint",
    draft: { window: [0, 0.35], expressions: 3, grammar: 2, lenses: 1, quiz: 3 },
  },
  {
    id: "hsk2",
    label: "HSK 2급 · 초급",
    description: "어휘 300개 · 짧은 일상 대사",
    definition: "가족·학교·쇼핑처럼 익숙한 장면의 짧고 명확한 대사를 이해하는 단계 (어휘 약 300개)",
    tone: "mint",
    draft: { window: [0.1, 0.45], expressions: 4, grammar: 2, lenses: 1, quiz: 3 },
  },
  {
    id: "hsk3",
    label: "HSK 3급 · 중급",
    description: "어휘 600개 · 일상 대화",
    definition: "생활·학업·직장의 일상 대화를 이해하고 기본 문형으로 상황을 설명하는 단계 (어휘 약 600개)",
    tone: "sky",
    draft: { window: [0.25, 0.6], expressions: 5, grammar: 3, lenses: 1, quiz: 3 },
  },
  {
    id: "hsk4",
    label: "HSK 4급 · 중급",
    description: "어휘 1,200개 · 관용 표현",
    definition: "관용 표현과 말투가 섞인 대화를 이해하고 장면의 상황·맥락과 연결하는 단계 (어휘 약 1,200개)",
    tone: "sky",
    draft: { window: [0.4, 0.75], expressions: 5, grammar: 3, lenses: 1, quiz: 4 },
  },
  {
    id: "hsk5",
    label: "HSK 5급 · 고급",
    description: "어휘 2,500개 · 긴 대사·문화 맥락",
    definition: "긴 대사와 복합적인 표현을 이해하고 문화적 맥락까지 해석하는 단계 (어휘 약 2,500개)",
    tone: "lavender",
    draft: { window: [0.55, 0.9], expressions: 6, grammar: 4, lenses: 2, quiz: 4 },
  },
  {
    id: "hsk6",
    label: "HSK 6급 · 고급",
    description: "어휘 5,000개 이상 · 화용·격식 표현",
    definition: "빠르고 격식 있는 대화, 함축·완곡 표현까지 화용적으로 해석하는 단계 (어휘 5,000개 이상)",
    tone: "lavender",
    draft: { window: [0.65, 1], expressions: 6, grammar: 4, lenses: 2, quiz: 5 },
  },
];

export const DEFAULT_LEVEL_ID = "hsk2";

/** HSK 이전의 초급·중급·고급 id → HSK 등급 (저장된 강의자료를 옮길 때 사용) */
export const LEGACY_LEVEL_IDS: Record<string, string> = {
  beginner: "hsk2",
  intermediate: "hsk4",
  advanced: "hsk5",
};

export const getLevel = (id: string): LevelDef =>
  LEVELS.find((l) => l.id === (LEGACY_LEVEL_IDS[id] ?? id)) ?? {
    id,
    label: "미지정",
    description: "",
    definition: "",
    tone: "cream",
    draft: { window: [0, 1], expressions: 5, grammar: 3, lenses: 1, quiz: 3 },
  };

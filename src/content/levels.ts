/**
 * 학습 수준 체계 (드라마 기반 학습에 맞춘 자체 수준 정의). 수준을 바꾸거나 늘릴 때는 이 목록만 수정한다.
 * 강의자료(Lesson.level)에는 id만 저장된다. 학습 방향(중→한 / 한→중)과는 별개다.
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
};

export const LEVELS: LevelDef[] = [
  {
    id: "beginner",
    label: "초급",
    description: "기초 어휘·짧은 대사 중심",
    definition: "기초 어휘와 짧고 명확한 대사를 중심으로 핵심 의미를 이해하는 단계",
    tone: "mint",
  },
  {
    id: "intermediate",
    label: "중급",
    description: "일상 대화·관용 표현 중심",
    definition: "일상 대화와 관용적 표현을 이해하고 장면의 상황·맥락과 연결하는 단계",
    tone: "sky",
  },
  {
    id: "advanced",
    label: "고급",
    description: "긴 대사·문화 맥락·화용 표현 중심",
    definition: "긴 대사와 복합적인 표현을 이해하고 문화적·화용적 맥락까지 해석하는 단계",
    tone: "lavender",
  },
];

export const DEFAULT_LEVEL_ID = "beginner";

export const getLevel = (id: string): LevelDef =>
  LEVELS.find((l) => l.id === id) ?? {
    id,
    label: "미지정",
    description: "",
    definition: "",
    tone: "cream",
  };

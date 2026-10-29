import type { MotionPropsMap, MotionType } from "../motion/registry";

export type OverlayPosition = "top-left" | "top-right";

export type LearningType =
  | "grammar"
  | "expression"
  | "metaphor"
  | "pragmatic"
  | "similar"
  | "culture";

export type Dialogue = {
  zh: string;
  pinyin?: string;
  ko?: string;
  speaker?: string;
};

type CueBase = {
  id: string;
  /** seconds, original YouTube timeline */
  time: number;
  /** seconds */
  duration: number;
  position: OverlayPosition;
  learningType: LearningType;
  /** 타임라인/목록에 표시할 짧은 제목 */
  title: string;
  dialogue: Dialogue;
};

export type MotionCue = {
  [K in MotionType]: CueBase & {
    kind: "motion";
    motionType: K;
    props: MotionPropsMap[K];
    /** 기본값(registry)을 덮어쓰는 overlay 너비 비율 */
    widthRatio?: number;
  };
}[MotionType];

export type CultureLensCue = CueBase & {
  kind: "culture-lens";
  cultureId: string;
  hint: string;
};

export type LearningCue = MotionCue | CultureLensCue;

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  /** 0-based */
  answer: number;
  explanation: string;
};

export type SummaryItem = {
  zh: string;
  pinyin: string;
  ko: string;
  type: string;
};

/**
 * 자막/스크립트 cue (seconds, original YouTube timeline).
 * 원문(zh)과 번역(ko)을 같은 cue에 담는다. SRT·YouTube 자막도 이 구조로 변환한다.
 */
export type SubtitleCue = {
  start: number;
  end: number;
  ko?: string;
  zh?: string;
  pinyin?: string;
};

export type EpisodeContent = {
  id: string;
  dramaId: string;
  dramaTitle: string;
  episode: string;
  description: string;
  video: {
    youtubeUrl: string;
    youtubeId: string;
    /** seconds */
    startTime: number;
    /** seconds — learning segment ends here */
    endTime: number;
  };
  cues: LearningCue[];
  /** 학습 구간 한국어 번역 자막 (선택) */
  subtitles?: SubtitleCue[];
  summary: SummaryItem[];
  quiz: QuizQuestion[];
};

export type Situation = {
  id: string;
  episodeId: string;
  expression: string;
  pinyin: string;
  meaning: string[];
  situation: string;
  tags: string[];
  /** 장면 다시 보기 seek 위치 (seconds) */
  sceneTime: number;
  rolePlayId: string;
};

export type RolePlayLine = {
  speaker: string;
  zh: string;
  pinyin: string;
  ko: string;
  /** Demo feedback when the learner practices this line */
  demoFeedback: { score: number; summary: string; tip: string };
};

export type RolePlay = {
  id: string;
  title: string;
  situation: string;
  roles: [string, string];
  lines: [RolePlayLine, RolePlayLine];
  note?: string;
};

export type CultureLens = {
  title: string;
  subtitle: string;
  adults: string[];
  children: string[];
  paragraphs: string[];
  caution: string;
};

export type CultureTopic = {
  id: string;
  episodeId: string;
  tags: string[];
  emoji: string;
  title: string;
  dialogue: Dialogue;
  sceneReading: string[];
  relations: { name: string; role: string }[];
  comparison: {
    china: { work: string; text: string };
    korea: { work: string | null; text: string };
    guide: string;
  };
  thinkQuestion: string;
  relatedScenes: { title: string; time: number; text: string }[];
  lens: CultureLens;
};

/* ───────── 15주 수업 · 강의자료 ───────── */

/** 1~8주차: 중국어 → 한국어, 9~15주차: 한국어 → 중국어 */
export type LearningDirection = "zh-ko" | "ko-zh";

/** draft: 준비 중, ready: 준비 완료(비공개), published: 학습자 공개 */
export type LessonStatus = "draft" | "ready" | "published";

/** 자막/스크립트를 어디서 확보했는지 (text: 타임코드 없는 원문 텍스트 직접 입력) */
export type ScriptSource = "bundled" | "manual" | "srt" | "youtube" | "text";

/** 원문 텍스트 한 문장. start는 교수자가 영상을 보며 지정한 시작 시각(초) — 지정 전에는 null */
export type PlainScriptLine = { text: string; start: number | null };

/** 타임코드 없이 붙여넣은 원문 (한 줄 = 한 문장, 입력 순서 유지) */
export type PlainScript = {
  lang: "zh" | "ko";
  lines: PlainScriptLine[];
  /** ISO datetime */
  updatedAt: string;
};

/** 자막 트랙 한 언어(zh/ko)의 출처 */
export type ScriptTrackOrigin = {
  /** speech: 영상·음성 파일을 브라우저에서 음성 인식(Whisper)해 만든 자막, ai: 원문 자막을 생성형 AI로 번역한 자막 */
  provider: "youtube" | "srt" | "speech" | "ai";
  /** YouTube 자막 언어 코드 (예: zh-Hans, ko) */
  languageCode?: string;
  /** YouTube: manual(업로더 자막) / asr(자동 생성 자막) */
  kind?: "manual" | "asr";
  trackName?: string;
  /** SRT 업로드 파일명 (붙여넣기는 null) */
  fileName?: string | null;
  /** ISO datetime — 가져오거나 변환한 시각 */
  fetchedAt: string;
  /** 가져온 뒤 교수자가 문장을 수정했는지 */
  edited?: boolean;
};

export type LessonScript = {
  source: ScriptSource;
  cues: SubtitleCue[];
  /** ISO datetime */
  updatedAt: string | null;
  /** 언어별 자막 출처 (선택 — 이전 저장 데이터에는 없음) */
  origin?: Partial<Record<"zh" | "ko", ScriptTrackOrigin>>;
  /** 타임코드 없는 원문 텍스트 (선택). 원문 언어의 타임코드 자막과 동시에 쓰지 않는다. */
  plain?: PlainScript;
};

/* ───────── 교수자 학습 콘텐츠 초안 (규칙·템플릿 기반, 시간 정보 없음) ───────── */

/**
 * 핵심 표현 / 어휘·문법: 원문 표현 + 교수자 설명.
 * at: 등장 시점(초). 없으면(null/undefined) 관련 원문의 동기화 시각을 자동으로 따른다.
 */
export type DraftNote = {
  id: string;
  source: string;
  note: string;
  at?: number | null;
  /** 중국어 표현의 병음. 교수자가 직접 입력한 값만 저장하고, 비어 있으면 자동 변환값을 보여준다. */
  pinyin?: string;
};

/** source: 관련 원문, at: 등장 시점(초) — DraftNote와 같은 규칙 */
export type DraftLens = { id: string; title: string; source: string; text: string; at?: number | null };

/** answer: 0-based, 교수자가 정하기 전에는 null */
export type DraftQuiz = {
  id: string;
  question: string;
  options: string[];
  answer: number | null;
  explanation: string;
};

export type LessonDraft = {
  expressions: DraftNote[];
  grammar: DraftNote[];
  lenses: DraftLens[];
  quiz: DraftQuiz[];
  /** 초안을 만들 때의 학습 수준 id (수준을 바꾸면 다시 구성하라고 안내한다) */
  level?: string;
  /** ISO datetime */
  createdAt: string;
  updatedAt: string;
};

/** 강의자료에서 생성되는 학습 콘텐츠 (기존 EpisodeContent와 같은 형식 + 교수자 초안) */
export type LessonContent = Pick<EpisodeContent, "cues" | "summary" | "quiz"> & {
  draft?: LessonDraft;
  /** 교수자 문화렌즈 (CultureLensCue.cultureId → 렌즈 내용) */
  lenses?: Record<string, CultureLens>;
};

/**
 * 원본 영상 자막 가리기: 영상 하단의 지정 영역을 불투명하게 덮고 앱 자막을 그 안에 표시한다.
 * top·height는 영상 높이 대비 %, width는 영상 너비 대비 % (가로 중앙 정렬, 없으면 기본값).
 */
export type CaptionMask = { enabled: boolean; top: number; height: number; width?: number };

export type Lesson = {
  id: string;
  /** 속한 과목 (courses.ts). 3과목 개편 전 자료는 LEGACY_COURSE_ID */
  courseId: string;
  /** 1~15 */
  week: number;
  title: string;
  description: string;
  direction: LearningDirection;
  /** levels.ts의 LevelId */
  level: string;
  status: LessonStatus;
  video: EpisodeContent["video"];
  /** 원본 영상 자막 가리기 설정 (선택 — 없으면 끔) */
  captionMask?: CaptionMask;
  /** 작품 정보 (선택) — 특정 드라마에 고정하지 않는다 */
  source?: { dramaTitle: string; episode: string };
  script: LessonScript;
  /** 직접 생성·편집한 학습 콘텐츠 */
  content?: LessonContent;
  /** 원문 기반 학습 콘텐츠 초안 (교수자 편집). 학습 화면의 표현·문화렌즈·퀴즈에 더해진다. */
  draft?: LessonDraft;
  /** 기존 번들 에피소드(episodes/)의 학습 콘텐츠를 재사용할 때 */
  episodeId?: string;
  /** ISO datetime */
  createdAt: string;
  updatedAt: string;
};

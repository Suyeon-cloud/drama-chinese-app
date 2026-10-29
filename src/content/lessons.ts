import { COURSE_LESSONS } from "./courseLessons";
import { LEGACY_COURSE_ID } from "./courses";
import { episodes } from "./index";
import { yijiarenzhimingEp3 } from "./episodes/yijiarenzhiming-ep3";
import { SAVED_LESSONS } from "./savedLessons";
import { WEEKLY_LESSONS } from "./weeklyLessons";
import type {
  CultureLens,
  CultureLensCue,
  DraftNote,
  DraftQuiz,
  EpisodeContent,
  LearningCue,
  Lesson,
  LessonContent,
  MotionCue,
  PlainScript,
  QuizQuestion,
  SubtitleCue,
} from "./types";

const SEED_TIME = "2026-10-11T00:00:00.000Z";

/** 번들 에피소드를 강의자료 예시로 감싼다. 학습 콘텐츠는 episodeId로 재사용한다. */
const lessonFromEpisode = (
  ep: EpisodeContent,
  meta: Pick<Lesson, "id" | "week" | "title" | "direction" | "level" | "status">,
): Lesson => ({
  ...meta,
  courseId: LEGACY_COURSE_ID,
  description: ep.description,
  video: ep.video,
  source: { dramaTitle: ep.dramaTitle, episode: ep.episode },
  script: { source: "bundled", cues: ep.subtitles ?? [], updatedAt: null },
  episodeId: ep.id,
  createdAt: SEED_TIME,
  updatedAt: SEED_TIME,
});

/** 코드에 들어 있는 기본 강의자료 (3과목 개편 전 15주 — 모두 ‘기존 자료’ 과목) */
const BUILT_IN_LESSONS: Lesson[] = [
  // 이전 1주차(전체 회차 120~626초). 새 1주차 클립(lesson-week01)의 대본을 채워 공개하기 전까지 학습자용으로 둔다.
  // 상황별 장면 · 문화 메뉴의 ‘장면 다시 보기’도 이 영상을 쓴다.
  {
    ...lessonFromEpisode(yijiarenzhimingEp3, {
      id: "lesson-yjrzm-ep3",
      week: 1,
      title: "가족의 일상 속 실생활 표현",
      direction: "zh-ko",
      level: "hsk4",
      status: "published",
    }),
    // 영상에 박혀 있는 중국어 자막을 가리는 위치 (실제 영상으로 확인한 값)
    captionMask: { enabled: true, top: 78.5, height: 14, width: 70 },
  },
  ...WEEKLY_LESSONS,
  // 새 3과목 × 15주 기본 정보 (학습 콘텐츠는 SRT를 받은 뒤 채운다)
  ...COURSE_LESSONS,
];

/**
 * 기본 강의자료. 서버 DB에 처음 한 번 들어간다.
 * 웹앱에서 만들어 내보낸 강의자료(savedLessons.ts)가 같은 id의 기본값을 대신하고, 새로 만든 강의자료는 뒤에 붙는다.
 */
export const SEED_LESSONS: Lesson[] = [
  ...BUILT_IN_LESSONS.map((l) => SAVED_LESSONS.find((s) => s.id === l.id) ?? l),
  ...SAVED_LESSONS.filter((s) => !BUILT_IN_LESSONS.some((l) => l.id === s.id)),
];

const EMPTY_CONTENT: LessonContent = { cues: [], summary: [], quiz: [] };

/** 강의자료의 기본 학습 콘텐츠: 직접 작성한 content → 번들 에피소드 → 빈 콘텐츠 순 (초안 제외) */
export const baseLessonContent = (lesson: Lesson): LessonContent => {
  if (lesson.content) return lesson.content;
  const ep = episodes.find((e) => e.id === lesson.episodeId);
  return ep ? { cues: ep.cues, summary: ep.summary, quiz: ep.quiz } : EMPTY_CONTENT;
};

/**
 * 초안 퀴즈 중 학습자에게 보여줄 수 있는 문항만 QuizQuestion으로 바꾼다.
 * 문제·보기 2개 이상(중복 없음)·정답이 모두 정해진 문항만 포함한다.
 */
export const draftQuizToQuestions = (quiz: DraftQuiz[]): QuizQuestion[] =>
  quiz.flatMap((q) => {
    const opts = q.options.map((text, i) => ({ text: text.trim(), i })).filter((o) => o.text);
    const answer = opts.findIndex((o) => o.i === q.answer);
    const distinct = new Set(opts.map((o) => o.text)).size === opts.length;
    if (!q.question.trim() || opts.length < 2 || answer < 0 || !distinct) return [];
    return [
      {
        id: q.id,
        question: q.question.trim(),
        options: opts.map((o) => o.text),
        answer,
        explanation: q.explanation.trim(),
      },
    ];
  });

/* ───────── 원문 타임코드 → 교수자 콘텐츠 등장 시점 ───────── */

export type TimelineLine = { text: string; start: number | null };

/** 원문 문장과 시작 시각: 원문 텍스트가 있으면 그것을, 없으면 원문 언어의 타임코드 자막을 쓴다. */
export const sourceTimeline = (
  cues: SubtitleCue[],
  plain: PlainScript | null | undefined,
  lang: "zh" | "ko",
): TimelineLine[] => {
  if (plain && plain.lang === lang) return plain.lines.map((l) => ({ text: l.text.trim(), start: l.start }));
  return cues.flatMap((c) => (c[lang]?.trim() ? [{ text: c[lang]!.trim(), start: c.start }] : []));
};

/** 관련 원문의 시작 시각: 같은 문장 → (2자 이상이면) 그 표현을 포함한 첫 문장 */
export const matchSourceStart = (timeline: TimelineLine[], source: string): number | null => {
  const s = source.trim();
  if (!s) return null;
  const exact = timeline.find((l) => l.text === s);
  if (exact) return exact.start;
  if (s.length < 2) return null;
  return timeline.find((l) => l.text.includes(s))?.start ?? null;
};

/** 등장 시점: 교수자가 직접 정한 값 → 관련 원문의 동기화 시각 */
export const draftItemTime = (item: { source: string; at?: number | null }, timeline: TimelineLine[]) =>
  typeof item.at === "number" ? item.at : matchSourceStart(timeline, item.source);

/**
 * 핵심 표현·어휘에서 병음을 붙일 중국어:
 * 중국어 → 한국어는 원문 표현, 한국어 → 중국어는 설명 안의 중국어 표현(한자 부분)
 */
export const draftNoteChinese = (note: { source: string; note: string }, direction: Lesson["direction"]) =>
  direction === "zh-ko" ? note.source.trim() : (note.note.match(/\p{Script=Han}+/gu) ?? []).join(" ");

/** 병음은 문장 첫 글자·이름도 대문자로 쓰지 않는다. (성조 부호는 그대로: Jīntiān → jīntiān) */
export const lowerPinyin = (pinyin: string) => pinyin.toLocaleLowerCase("en");

/** 핵심 표현·어휘의 병음: 교수자가 입력한 값 → 자동 변환값 */
export const draftNotePinyin = (
  note: Pick<DraftNote, "source" | "note" | "pinyin">,
  direction: Lesson["direction"],
  toPinyin?: (text: string) => string,
) => lowerPinyin(note.pinyin?.trim() || (toPinyin ? toPinyin(draftNoteChinese(note, direction)) : ""));

const NOTE_SECONDS = 8;
const LENS_SECONDS = 12;

/**
 * 등장 시점이 학습 구간 안에 있는 교수자 초안 → 기존 학습 cue 구조
 * (핵심 표현·어휘·문법은 모션그래픽, 문화렌즈는 Culture Lens). 시간이 없는 항목은 만들지 않는다.
 */
export const draftLearningCues = (
  lesson: Lesson,
  toPinyin?: (text: string) => string,
): { cues: LearningCue[]; lenses: Record<string, CultureLens> } => {
  const { draft } = lesson;
  if (!draft) return { cues: [], lenses: {} };
  const lang = lesson.direction === "zh-ko" ? "zh" : "ko";
  const timeline = sourceTimeline(lesson.script.cues, lesson.script.plain, lang);
  const { startTime, endTime } = lesson.video;
  const inSegment = (t: number | null): t is number =>
    t !== null && t >= startTime && (endTime <= startTime || t < endTime);
  const bilingual = lesson.direction === "zh-ko";

  const notes: MotionCue[] = [
    ...draft.expressions.map((x) => ({ x, type: "expression" as const })),
    ...draft.grammar.map((x) => ({ x, type: "grammar" as const })),
  ].flatMap(({ x, type }) => {
    const text = x.source.trim();
    const time = draftItemTime(x, timeline);
    if (!text || !inSegment(time)) return [];
    const pinyin = draftNotePinyin(x, lesson.direction, toPinyin);
    const cue: MotionCue = {
      id: `draft-${x.id}`,
      kind: "motion",
      motionType: "note",
      learningType: type,
      title: text,
      time,
      duration: NOTE_SECONDS,
      position: "top-left",
      dialogue: { zh: text, pinyin: pinyin || undefined, ko: x.note.trim() || undefined },
      props: {
        label:
          type === "expression"
            ? bilingual
              ? "💬 核心表达 · 핵심 표현"
              : "💬 핵심 표현"
            : bilingual
              ? "📖 词汇·语法 · 어휘·문법"
              : "📖 어휘·문법",
        tone: type === "expression" ? "pink" : "sky",
        text,
        note: x.note.trim(),
        pinyin,
        pinyinAfterNote: !bilingual,
      },
    };
    return [cue];
  });

  const lenses: Record<string, CultureLens> = {};
  const lensCues: CultureLensCue[] = draft.lenses.flatMap((l) => {
    const title = l.title.trim();
    const text = l.text.trim();
    const time = draftItemTime(l, timeline);
    if ((!title && !text) || !inSegment(time)) return [];
    const cultureId = `draft:${l.id}`;
    lenses[cultureId] = {
      title: title || "문화렌즈",
      subtitle: l.source.trim() ? `“${l.source.trim()}”` : "",
      adults: [],
      children: [],
      paragraphs: text.split(/\n+/).filter((p) => p.trim()),
      caution: "",
    };
    return [
      {
        id: `draft-${l.id}`,
        kind: "culture-lens",
        cultureId,
        hint: title || "교수자 문화 설명",
        learningType: "culture",
        title: title || "문화렌즈",
        time,
        duration: LENS_SECONDS,
        position: "top-right",
        dialogue: { zh: l.source.trim() || title || "文化镜头" },
      },
    ];
  });

  return { cues: [...notes, ...lensCues], lenses };
};

/**
 * 학습 화면용 콘텐츠: 기본 콘텐츠 + 교수자 초안.
 * 시간이 있는 초안은 기존 cue 뒤에 더해 시간순으로 정렬하고, 퀴즈는 완성된 문항만 이어 붙인다.
 */
export const resolveLessonContent = (lesson: Lesson, toPinyin?: (text: string) => string): LessonContent => {
  const base = baseLessonContent(lesson);
  if (!lesson.draft) return base;
  const extra = draftLearningCues(lesson, toPinyin);
  return {
    ...base,
    cues: extra.cues.length ? [...base.cues, ...extra.cues].sort((a, b) => a.time - b.time) : base.cues,
    quiz: [...base.quiz, ...draftQuizToQuestions(lesson.draft.quiz)],
    draft: lesson.draft,
    lenses: extra.lenses,
  };
};

export const lessonHeading = (lesson: Lesson) =>
  lesson.source ? `《${lesson.source.dramaTitle}》 ${lesson.source.episode}`.trim() : lesson.title;

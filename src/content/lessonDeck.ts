// 5단계: 주차별 학습자료(Lesson) → 공통 LessonDeck → (1) 교수자 발표 슬라이드 (2) 학생용 복습 HTML
//
// - 외부 AI 호출 없이 기존 학습 데이터(자막 대사·핵심 표현·어휘/문법·문화렌즈·회화 연습·퀴즈·요약)만 다시 배치한다.
// - 순수 함수: 같은 입력이면 항상 같은 결과 (화면·테스트가 함께 쓴다). 원본 Lesson은 바꾸지 않는다.
// - 복습 HTML은 4단계 규칙(materialHtmlProblem)을 통과하는 정적 문서다 — 스크립트 없음, 모든 글자 이스케이프.
// - 6단계(실시간 퀴즈) 연동: 퀴즈 항목은 원본 퀴즈 id를 그대로 갖는다. 발표 슬라이드도 quizId로 가리킨다.
import { cultureTopics } from "./culture";
import { formatTime } from "./index";
import type { CultureLens, Lesson, LessonContent, SubtitleCue } from "./types";

export type DeckLine = { id: string; start: number; end: number; zh: string; pinyin: string; ko: string };
export type DeckPoint = {
  id: string;
  kind: "expression" | "grammar" | "summary";
  /** 표현 원문 */
  text: string;
  pinyin: string;
  /** 뜻·설명 */
  note: string;
  /** 영상 등장 시점 (없으면 null) */
  at: number | null;
};
export type DeckCulture = { id: string; title: string; subtitle: string; paragraphs: string[]; at: number | null };
export type DeckDialogueLine = { role: string; zh: string; pinyin: string; ko: string; start: number; end: number };
export type DeckDialogue = { id: string; title: string; situation: string; lines: DeckDialogueLine[] };
export type DeckQuiz = { id: string; question: string; options: string[]; answer: number; explanation: string };

export type LessonDeck = {
  lessonId: string;
  courseId: string;
  week: number;
  /** 화면 제목 (작품 + 회차, 없으면 학습자료 제목) */
  heading: string;
  title: string;
  description: string;
  direction: Lesson["direction"];
  video: { youtubeId: string; youtubeUrl: string; startTime: number; endTime: number } | null;
  lines: DeckLine[];
  points: DeckPoint[];
  culture: DeckCulture[];
  dialogues: DeckDialogue[];
  quiz: DeckQuiz[];
  /** 원본 학습자료의 마지막 수정 시각 (5-B에서 생성 자료와 비교) */
  sourceUpdatedAt: string;
};

/** 회화 연습: 화면이 학생에게 보이는 회화만 골라 대사를 자막과 맞춘 뒤 넘긴다 (lib/dialogues) */
export type DeckDialogueInput = { id: string; title: string; situation: string; lines: DeckDialogueLine[] };

export type DeckInput = {
  lesson: Lesson;
  /** resolveLessonContent(lesson, toPinyin) 결과 (학생 학습 화면과 같은 합본) */
  content: LessonContent;
  /** playbackCues(lesson) — 학습 화면 자막과 같은 타임라인 */
  cues: SubtitleCue[];
  dialogues?: DeckDialogueInput[];
  /** 중국어 → 병음 (저장된 병음이 없을 때만) */
  pinyinOf?: (zh: string) => string;
};

const clean = (s: string | undefined | null) => (s ?? "").trim();
const lensOf = (cultureId: string, content: LessonContent): CultureLens | undefined =>
  cultureTopics.find((t) => t.id === cultureId)?.lens ?? content.lenses?.[cultureId];

/** Lesson → LessonDeck */
export const buildLessonDeck = ({ lesson, content, cues, dialogues = [], pinyinOf }: DeckInput): LessonDeck => {
  const py = (zh: string, saved?: string) => clean(saved) || (zh && pinyinOf ? clean(pinyinOf(zh)) : "");
  const { startTime, endTime } = lesson.video;
  const hasEnd = endTime > startTime;
  const inSegment = (t: number) => t >= startTime - 0.01 && (!hasEnd || t <= endTime + 0.01);

  const lines: DeckLine[] = cues
    .filter((c) => (clean(c.zh) || clean(c.ko)) && inSegment(c.start))
    .map((c, i) => ({
      id: c.id ?? `line-${i}`,
      start: c.start,
      end: c.end,
      zh: clean(c.zh),
      pinyin: clean(c.zh) ? py(clean(c.zh), c.pinyin) : "",
      ko: clean(c.ko),
    }));

  // 핵심 표현·문법: 기존 모션 cue(번들) + 교수자 초안 (초안에서 온 cue는 초안 쪽에서 한 번만 넣는다)
  const draftAt = new Map(content.cues.filter((c) => c.id.startsWith("draft-")).map((c) => [c.id.slice(6), c.time]));
  const motion: DeckPoint[] = content.cues.flatMap((c) =>
    c.kind === "motion" && !c.id.startsWith("draft-") && clean(c.dialogue.zh || c.dialogue.ko)
      ? [{
          id: c.id,
          kind: c.learningType === "grammar" ? ("grammar" as const) : ("expression" as const),
          text: clean(c.dialogue.zh) || clean(c.dialogue.ko),
          pinyin: clean(c.dialogue.zh) ? py(clean(c.dialogue.zh), c.dialogue.pinyin) : "",
          note: [clean(c.title) !== clean(c.dialogue.zh) ? clean(c.title) : "", clean(c.dialogue.ko)].filter(Boolean).join(" · "),
          at: c.time,
        }]
      : [],
  );
  const draft = content.draft ?? lesson.draft;
  const zhSource = lesson.direction === "zh-ko";
  const draftPoints: DeckPoint[] = [
    ...(draft?.expressions ?? []).map((x) => ({ x, kind: "expression" as const })),
    ...(draft?.grammar ?? []).map((x) => ({ x, kind: "grammar" as const })),
  ].flatMap(({ x, kind }) =>
    clean(x.source)
      ? [{ id: x.id, kind, text: clean(x.source), pinyin: zhSource ? py(clean(x.source), x.pinyin) : clean(x.pinyin), note: clean(x.note), at: draftAt.get(x.id) ?? null }]
      : [],
  );
  const summary: DeckPoint[] = content.summary.flatMap((s, i) =>
    clean(s.zh) || clean(s.ko)
      ? [{ id: `summary-${i}`, kind: "summary" as const, text: clean(s.zh) || clean(s.ko), pinyin: clean(s.zh) ? py(clean(s.zh), s.pinyin) : "", note: clean(s.zh) ? clean(s.ko) : "", at: null }]
      : [],
  );
  const byTime = (a: DeckPoint, b: DeckPoint) => (a.at ?? Infinity) - (b.at ?? Infinity);
  const points = [...[...motion, ...draftPoints].sort(byTime), ...summary];

  // 문화: 기존 문화렌즈 cue(번들·초안 모두 lensOf로) + 시점 없는 초안 렌즈
  const seenLens = new Set<string>();
  const culture: DeckCulture[] = [];
  for (const c of content.cues) {
    if (c.kind !== "culture-lens" || seenLens.has(c.cultureId)) continue;
    const lens = lensOf(c.cultureId, content);
    if (!lens) continue;
    seenLens.add(c.cultureId);
    culture.push({
      id: c.cultureId,
      title: clean(lens.title) || clean(c.hint) || "문화렌즈",
      subtitle: clean(lens.subtitle),
      paragraphs: [...lens.paragraphs, ...(lens.caution ? [lens.caution] : [])].map(clean).filter(Boolean),
      at: c.time,
    });
  }
  for (const l of draft?.lenses ?? []) {
    if (seenLens.has(`draft:${l.id}`) || (!clean(l.title) && !clean(l.text))) continue;
    culture.push({
      id: `draft:${l.id}`,
      title: clean(l.title) || "문화렌즈",
      subtitle: clean(l.source) ? `“${clean(l.source)}”` : "",
      paragraphs: clean(l.text).split(/\n+/).map(clean).filter(Boolean),
      at: null,
    });
  }
  culture.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));

  const quiz: DeckQuiz[] = content.quiz
    .filter((q) => clean(q.question) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)
    .map((q) => ({ id: q.id, question: clean(q.question), options: q.options.map(clean), answer: q.answer, explanation: clean(q.explanation) }));

  return {
    lessonId: lesson.id,
    courseId: lesson.courseId,
    week: lesson.week,
    heading: lesson.source ? `《${clean(lesson.source.dramaTitle)}》 ${clean(lesson.source.episode)}`.trim() : clean(lesson.title),
    title: clean(lesson.title),
    description: clean(lesson.description),
    direction: lesson.direction,
    video: lesson.video.youtubeId
      ? { youtubeId: lesson.video.youtubeId, youtubeUrl: lesson.video.youtubeUrl, startTime, endTime }
      : null,
    lines,
    points,
    culture,
    dialogues: dialogues
      .map((d) => ({ ...d, title: clean(d.title), situation: clean(d.situation), lines: d.lines.filter((l) => clean(l.zh) || clean(l.ko)) }))
      .filter((d) => d.lines.length > 0),
    quiz,
    sourceUpdatedAt: lesson.updatedAt,
  };
};

/* ───────── 발표 슬라이드 ───────── */

export type Slide =
  | { key: string; kind: "title"; section: string }
  | { key: string; kind: "line"; section: string; line: DeckLine; index: number; total: number }
  | { key: string; kind: "point"; section: string; point: DeckPoint }
  | { key: string; kind: "culture"; section: string; culture: DeckCulture }
  | { key: string; kind: "dialogue"; section: string; dialogue: DeckDialogue }
  | { key: string; kind: "quiz"; section: string; quiz: DeckQuiz; index: number; total: number }
  | { key: string; kind: "end"; section: string };

export const SECTION_LABEL = {
  title: "시작",
  line: "장면 대사",
  expression: "핵심 표현",
  grammar: "어휘·문법",
  summary: "정리",
  culture: "문화",
  dialogue: "회화",
  quiz: "퀴즈",
  end: "마무리",
} as const;

/** 발표 순서: 시작 → 장면 대사 → 표현·문법 → 문화 → 회화 → 퀴즈 → 정리 → 마무리 (빈 섹션은 건너뛴다) */
export const deckToSlides = (deck: LessonDeck): Slide[] => {
  const slides: Slide[] = [{ key: "title", kind: "title", section: SECTION_LABEL.title }];
  deck.lines.forEach((line, index) =>
    slides.push({ key: `line:${line.id}:${index}`, kind: "line", section: SECTION_LABEL.line, line, index, total: deck.lines.length }),
  );
  // 핵심 표현 → 어휘·문법 (섹션마다 한 덩어리, 섹션 안은 영상 시점 순서)
  for (const kind of ["expression", "grammar"] as const) {
    for (const point of deck.points.filter((p) => p.kind === kind)) {
      slides.push({ key: `point:${point.id}`, kind: "point", section: SECTION_LABEL[kind], point });
    }
  }
  for (const culture of deck.culture) slides.push({ key: `culture:${culture.id}`, kind: "culture", section: SECTION_LABEL.culture, culture });
  for (const dialogue of deck.dialogues) slides.push({ key: `dialogue:${dialogue.id}`, kind: "dialogue", section: SECTION_LABEL.dialogue, dialogue });
  deck.quiz.forEach((quiz, index) =>
    slides.push({ key: `quiz:${quiz.id}`, kind: "quiz", section: SECTION_LABEL.quiz, quiz, index, total: deck.quiz.length }),
  );
  for (const point of deck.points.filter((p) => p.kind === "summary")) {
    slides.push({ key: `point:${point.id}`, kind: "point", section: SECTION_LABEL.summary, point });
  }
  slides.push({ key: "end", kind: "end", section: SECTION_LABEL.end });
  return slides;
};

export type SectionStart = { section: string; index: number; count: number };
/** 섹션별 첫 슬라이드 (빠른 이동용). 시작·마무리는 빼고, 슬라이드가 없는 섹션은 나오지 않는다 */
export const sectionStarts = (slides: Slide[]): SectionStart[] => {
  const out: SectionStart[] = [];
  slides.forEach((s, index) => {
    if (s.kind === "title" || s.kind === "end") return;
    const last = out[out.length - 1];
    if (last && last.section === s.section) last.count++;
    else out.push({ section: s.section, index, count: 1 });
  });
  return out;
};
/** 지금 슬라이드가 속한 섹션 번호 (없으면 -1) */
export const sectionOf = (starts: SectionStart[], index: number) =>
  starts.findIndex((s) => index >= s.index && index < s.index + s.count);

/** 슬라이드가 가리키는 영상 구간 (없으면 null) */
export const slideRange = (s: Slide): { start: number; end: number | null } | null => {
  if (s.kind === "line") return { start: s.line.start, end: s.line.end };
  if (s.kind === "point" && s.point.at !== null) return { start: s.point.at, end: null };
  if (s.kind === "culture" && s.culture.at !== null) return { start: s.culture.at, end: null };
  if (s.kind === "dialogue" && s.dialogue.lines.length) {
    return { start: s.dialogue.lines[0].start, end: s.dialogue.lines[s.dialogue.lines.length - 1].end };
  }
  return null;
};

/** 영상 시점 → 그 시점의 대사 슬라이드 번호 (자막 따라가기). 없으면 -1 */
export const lineSlideAt = (slides: Slide[], time: number) =>
  slides.findIndex((s) => s.kind === "line" && time >= s.line.start && time < s.line.end);

/* ───────── 슬라이드 이동 (키보드·버튼 공통 상태 전이) ───────── */

export type PresentState = { index: number; revealed: string[] };
export type PresentAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "first" }
  | { type: "last" }
  | { type: "go"; index: number }
  | { type: "reveal"; key: string };

/** 퀴즈 정답은 교수자가 reveal할 때만 열린다 (다음 슬라이드로 넘어가도 자동으로 열리지 않는다) */
export const presentReducer = (count: number) => (s: PresentState, a: PresentAction): PresentState => {
  const clamp = (i: number) => Math.min(Math.max(0, i), Math.max(0, count - 1));
  switch (a.type) {
    case "next":
      return { ...s, index: clamp(s.index + 1) };
    case "prev":
      return { ...s, index: clamp(s.index - 1) };
    case "first":
      return { ...s, index: 0 };
    case "last":
      return { ...s, index: clamp(count - 1) };
    case "go":
      return { ...s, index: clamp(a.index) };
    case "reveal":
      return s.revealed.includes(a.key) ? { ...s, revealed: s.revealed.filter((k) => k !== a.key) } : { ...s, revealed: [...s.revealed, a.key] };
  }
};

/** 키 → 동작. 글자 입력 중(입력칸·선택칸·편집 영역)이면 null — 슬라이드 단축키를 쓰지 않는다 */
export type PresentKey = PresentAction["type"] | "toggle-play" | "play-scene" | "fullscreen" | "pinyin" | "korean" | "follow" | "motion" | "exit" | "section";
export const presentKeyOf = (e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; targetTag?: string; editable?: boolean }): PresentKey | null => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.editable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.targetTag ?? "")) return null;
  switch (e.key) {
    case "ArrowRight":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case " ":
      return "toggle-play";
    case "Enter":
      return "play-scene";
    case "f":
    case "F":
      return "fullscreen";
    case "p":
    case "P":
      return "pinyin";
    case "k":
    case "K":
      return "korean";
    case "s":
    case "S":
      return "follow";
    case "m":
    case "M":
      return "motion";
    case "a":
    case "A":
      return "reveal";
    case "Escape":
      return "exit";
    default:
      // 1~9: 섹션 빠른 이동 (화면 위 섹션 버튼 순서)
      return /^[1-9]$/.test(e.key) ? "section" : null;
  }
};

/* ───────── 학생용 복습 HTML ───────── */

/** 글자 이스케이프. : ( = 도 문자 참조로 바꿔 본문 글자가 4단계 금지 패턴(javascript:·expression(·srcdoc=)으로 오인되지 않게 한다 */
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/:/g, "&#58;")
    .replace(/\(/g, "&#40;")
    .replace(/=/g, "&#61;");
/*
 * 복습 문서 스타일 (웹앱 하늘색 파스텔). 외부 글꼴·이미지 없이 시스템 글꼴만 쓴다 (4단계 CSP: font-src data:).
 * 중국어는 lang="zh-CN" + 중국어 글꼴, 병음은 라틴 글꼴. 본문 최대 폭 760px, 600px 이하 모바일 배치, 인쇄 스타일 포함.
 */
const REVIEW_STYLE = `
:root{--sky-50:#f3f9fe;--sky-100:#e6f3fc;--sky-200:#cde7f9;--sky-500:#4fa8e6;--sky-600:#2f8fd6;--sky-700:#1f74b8;--ink:#1f3550;--ink-2:#4a5d75;--muted:#6b7e93;--line:#e3eef8;
--lav:#eeeafb;--lav-ink:#6a59c9;--lav-line:#d9d2f6;--mint:#e3f6ef;--mint-ink:#23876a;--cream:#fff5df;--cream-ink:#a8701c;--peach:#ffede3;--peach-ink:#b9532a;
--ko:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;--zh:"PingFang SC","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",sans-serif;--pyf:"Segoe UI","Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box}
body{margin:0;padding:0;background:var(--sky-50);color:var(--ink);font-family:var(--ko);font-size:16px;line-height:1.7;word-break:keep-all;overflow-wrap:break-word}
.wrap{max-width:760px;margin:0 auto;padding:0 32px}
[lang="zh-CN"]{font-family:var(--zh);word-break:normal;line-break:strict}
.hz{font-family:var(--zh);font-weight:500;color:var(--sky-700)}
.lead .hz,.q .hz,h3 .hz{font-weight:700}
.py{display:block;font-family:var(--pyf);color:var(--sky-600);font-size:14.5px;line-height:1.5}
.zh{display:block;font-size:19px;line-height:1.55;font-weight:600}
.zh-md{font-size:22px}.zh-lg{font-size:24px}.zh-xl{font-size:30px;line-height:1.35}
.ko{display:block;color:var(--ink-2);font-size:15px}
.muted{color:var(--muted);font-size:14px}
a{color:var(--sky-700)}
.topbar{background:#fff;border-bottom:1px solid var(--line)}
.topbar .wrap{display:flex;justify-content:space-between;align-items:center;min-height:48px;font-size:13px;color:var(--muted)}
.brand{font-weight:700;color:var(--sky-700)}
.brand span{font-weight:400;color:var(--muted);margin-left:6px}
.hero{padding:36px 0 8px}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.tag{font-size:12.5px;padding:3px 10px;border-radius:999px;background:var(--sky-100);color:var(--sky-700);font-weight:600}
.tag.week{background:var(--sky-700);color:#fff}
h1{margin:0;font-size:32px;line-height:1.3;font-weight:800}
h1 .zh{display:inline;font-size:inherit;font-weight:800}
.hero .sub{margin:6px 0 0;color:var(--ink-2);font-size:15px}
.hero .video{margin-top:10px;font-size:14px;color:var(--muted)}
.toc{position:sticky;top:0;z-index:2;background:var(--sky-50);border-bottom:1px solid var(--line);margin:20px 0 8px}
.toc ol{list-style:none;margin:0 auto;padding:10px 32px;max-width:760px;display:flex;flex-wrap:wrap;gap:6px}
.toc a{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;font-size:13.5px;font-weight:600;color:var(--ink-2);padding:6px 12px;border-radius:999px;background:#fff;border:1px solid var(--line)}
.toc a b,.sec-head b{font-family:var(--pyf);font-size:12px;color:var(--sky-600)}
section{padding:28px 0 8px;scroll-margin-top:60px}
.sec-head{display:flex;align-items:baseline;gap:10px;margin:0 0 14px}
.sec-head h2{margin:0;font-size:22px;font-weight:800}
.card{position:relative;background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px 20px 16px 24px;margin:0 0 14px;box-shadow:0 4px 14px rgba(47,143,214,.06);overflow:hidden}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--bar)}
.tone-sky{--bar:var(--sky-500);--chip:var(--sky-100);--chip-ink:var(--sky-700)}
.tone-lav{--bar:#9b8ce6;--chip:var(--lav);--chip-ink:var(--lav-ink)}
.tone-mint{--bar:#4fc29b;--chip:var(--mint);--chip-ink:var(--mint-ink)}
.tone-cream{--bar:#efc15a;--chip:var(--cream);--chip-ink:var(--cream-ink)}
.tone-peach{--bar:#f19b72;--chip:var(--peach);--chip-ink:var(--peach-ink)}
.tone-gray{--bar:var(--sky-200);--chip:var(--sky-50);--chip-ink:var(--ink-2)}
.card header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.num{font-family:var(--pyf);font-weight:800;font-size:13px;color:var(--chip-ink);background:var(--chip);border-radius:8px;padding:2px 8px}
.kind{font-size:12.5px;font-weight:700;color:var(--chip-ink)}
.time{margin-left:auto;font-family:var(--pyf);font-variant-numeric:tabular-nums;font-size:12.5px;font-weight:600;color:var(--sky-700);background:var(--sky-100);border-radius:999px;padding:2px 10px;white-space:nowrap}
.note p{margin:6px 0 0}
.note .lead{font-weight:700}
.example{margin-top:12px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.example::before{content:"예문";display:block;font-size:12px;font-weight:800;color:var(--chip-ink);background:var(--chip);padding:4px 14px}
.example p{margin:0;padding:8px 14px}
.ex-ko{border-top:1px dashed var(--line);color:var(--ink-2);font-size:15px;display:flex;gap:10px}
.ex-ko::before{content:"뜻";flex:none;font-size:12px;font-weight:800;color:var(--chip-ink);background:var(--chip);border-radius:6px;padding:1px 7px;height:fit-content;margin-top:2px}
.desc{margin:0 0 14px;color:var(--ink-2)}
.stats{list-style:none;margin:0 0 14px;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:10px}
.stats li{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px 10px;text-align:center;border-top:4px solid var(--bar)}
.stats b{display:block;font-family:var(--pyf);font-size:28px;line-height:1.1}
.stats span{font-size:13px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:#fff;border:1px dashed var(--sky-200);border-radius:16px;padding:12px 14px;margin-bottom:14px}
.chips-label{font-size:12.5px;font-weight:700;color:var(--muted)}
.chip{text-decoration:none;background:var(--sky-100);border-radius:999px;padding:4px 12px}
.chip .zh{display:inline;font-size:16px;color:var(--sky-700)}
.headword{padding:4px 0 10px;border-bottom:1px dashed var(--line);margin-bottom:6px}
.headword .py{font-size:16px;margin-top:2px}
.pattern{background:var(--lav);border:1px solid var(--lav-line);border-radius:14px;padding:12px 16px;margin-bottom:6px}
.pattern .py{color:var(--lav-ink)}
.cap{display:block;font-size:12px;font-weight:700;color:var(--lav-ink);margin-bottom:2px}
.formula{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:2px 0 12px}
.slot{display:inline-flex;align-items:center;min-height:38px;padding:4px 14px;border-radius:10px;font-weight:700;font-size:15px}
.slot.fixed{background:var(--lav-ink);color:#fff;font-family:var(--zh);font-size:20px}
.slot.var{background:#fff;color:var(--lav-ink);border:2px dashed var(--lav-line)}
.plus{color:var(--muted);font-weight:700}
mark{background:none;color:var(--lav-ink);border-bottom:3px solid var(--lav-line)}
.lens-mark{font-family:var(--zh);font-weight:800;font-size:13px;color:#fff;background:var(--mint-ink);border-radius:8px;padding:2px 8px}
.lens h3{margin:0 0 6px;font-size:20px;line-height:1.4}
.key{background:var(--mint);border-radius:14px;padding:12px 16px;margin:0 0 12px}
.key::before{content:"핵심";display:inline-block;font-size:12px;font-weight:800;color:#fff;background:var(--mint-ink);border-radius:6px;padding:1px 8px;margin-bottom:6px}
.quote{display:inline-block;margin:0;background:#fff;color:var(--mint-ink);border-radius:10px;padding:4px 12px;font-size:15px}
.lens p{margin:8px 0 0}
.detail{list-style:none;margin:0;padding:0;counter-reset:d}
.detail::before{content:"자세히";display:block;font-size:12px;font-weight:800;color:var(--mint-ink);margin-bottom:4px}
.detail li{position:relative;padding:6px 0 6px 30px;border-top:1px dashed var(--line);counter-increment:d}
.detail li:first-child{border-top:0}
.detail li::before{content:counter(d);position:absolute;left:0;top:8px;width:20px;height:20px;border-radius:50%;background:var(--mint);color:var(--mint-ink);font:700 12px/20px var(--pyf);text-align:center}
.detail li.scene{background:var(--mint);border-radius:10px;border-top:0;margin-top:6px;padding:8px 12px 8px 38px}
.detail li.scene::before{left:10px;top:10px;background:var(--mint-ink);color:#fff}
.detail li.scene::after{content:"장면 속 의미";display:block;margin-top:2px;font-size:12px;font-weight:800;color:var(--mint-ink)}
.q{margin:0 0 10px;font-weight:700;font-size:16.5px}
.qnum{font-family:var(--pyf);font-weight:800;color:var(--cream-ink);background:var(--cream);border-radius:8px;padding:1px 8px;margin-right:8px;font-size:13.5px}
.options{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.options li{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:9px 12px;background:var(--sky-50)}
.mark{font-weight:800;color:var(--sky-600);flex:none}
details{margin-top:10px}
summary{cursor:pointer;font-weight:700;color:var(--sky-700);font-size:14.5px;list-style:none;display:inline-block;padding:6px 14px;border-radius:999px;background:var(--sky-100)}
summary::-webkit-details-marker{display:none}
.answer{margin-top:10px;background:var(--mint);border-radius:12px;padding:10px 14px}
.answer p{margin:4px 0}
.answer b{color:var(--mint-ink)}
.dialog h3{margin:0 0 2px;font-size:18px}
.talk{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:10px}
.talk li{display:grid;grid-template-columns:72px 1fr;gap:10px;align-items:start}
.role{font-size:13px;font-weight:700;color:var(--peach-ink);background:var(--peach);border-radius:10px;padding:4px 8px;text-align:center}
.talk li>div{background:var(--sky-50);border-radius:4px 14px 14px 14px;padding:8px 12px}
.script{list-style:none;margin:0;padding:0;background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden}
.script li{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:10px 18px;border-top:1px solid var(--line)}
.script li:first-child{border-top:0}
.script .time{margin:3px 0 0;justify-self:start;background:none;padding:0;color:var(--muted)}
.script .zh{font-size:18px}
.script-toggle>summary{display:block;text-align:center;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin-bottom:10px}
.script-toggle .when-open,.script-toggle[open] .when-closed{display:none}
.script-toggle[open] .when-open{display:inline}
.print-only{display:none}
footer{margin-top:36px;border-top:1px solid var(--line);background:#fff}
footer .wrap{padding:22px 32px 28px;text-align:center;color:var(--muted);font-size:12.5px;line-height:1.8}
footer .name{font-size:13px;color:var(--ink-2)}
footer .name b{color:var(--sky-700)}
@media (max-width:600px){
body{font-size:15.5px}
.wrap,.toc ol{padding-left:16px;padding-right:16px}
footer .wrap{padding:20px 16px 24px}
h1{font-size:26px}.zh-xl{font-size:27px}.zh-lg{font-size:22px}
.card{padding:16px 16px 14px 20px;border-radius:16px}
.stats{grid-template-columns:repeat(3,1fr)}.stats b{font-size:24px}
.script li{grid-template-columns:1fr;gap:2px;padding:10px 14px}.script .time{margin:0}
.talk li{grid-template-columns:1fr;gap:4px}.role{justify-self:start}
.toc ol{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
}
@media print{
body{background:#fff}.toc,.topbar,.script-toggle{display:none}.print-only{display:block}
.card,.script li,.stats li{break-inside:avoid}.sec-head{break-after:avoid}.card{box-shadow:none}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`.replace(/\n/g, "");

export type ReviewOptions = { includeAnswers: boolean };

const REVIEW_HAN_ONLY = /^[\u3400-\u9fff]+$/;
/** 한국어 문장 속 한자 구간 (이스케이프 뒤 문자열에 쓴다 — 문자 참조는 ASCII라 겹치지 않는다) */
const REVIEW_HAN_RUN = /[\u3000-\u303f\uff01-\uff5e]*[\u3400-\u9fff\uf900-\ufaff][\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff01-\uff5e]*/g;
const OPTION_MARK = ["①", "②", "③", "④", "⑤", "⑥"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 한국어(한자 섞임) 글: 이스케이프 + 한자 구간에 중국어 글꼴 */
const hz = (s: string) => esc(s).replace(REVIEW_HAN_RUN, (m) => `<span class="hz" lang="zh-CN">${m}</span>`);
/** 중국어 글: 이스케이프 + 문형 고정 글자 표시 (fixed는 한자만 — 태그가 될 글자가 없다) */
const zhText = (s: string, cls = "zh", fixed: string[] = []) => {
  let h = esc(s);
  for (const tok of fixed) h = h.split(tok).join(`<mark>${tok}</mark>`);
  return `<span class="${cls}" lang="zh-CN">${h}</span>`;
};
const pyText = (s: string) => (s ? `<span class="py" lang="zh-Latn-pinyin">${esc(s)}</span>` : "");

/**
 * 문형 공식: 설명에 따옴표로 적힌 공식만 쓴다 — 'A + 被 + B + 동사'처럼 " + "로 나뉘거나 '又A又B'처럼 한자와 대문자 한 글자가 번갈아 나올 때.
 * 그 밖에는 null (공식을 짐작해 만들지 않고 일반 설명 카드로 보여 준다)
 */
export const reviewFormulaOf = (note: string): { tokens: string[]; plus: boolean } | null => {
  for (const m of note.matchAll(/['‘]([^'‘’]{1,40})['’]/g)) {
    const s = m[1].trim();
    if (/\s\+\s/.test(s)) {
      const tokens = s.split(/\s*\+\s*/).filter(Boolean);
      if (tokens.length >= 2 && tokens.some((x) => REVIEW_HAN_ONLY.test(x))) return { tokens, plus: true };
    }
    if (/^(?:[\u3400-\u9fff]+[A-Z]){2,}$/.test(s)) return { tokens: s.match(/[\u3400-\u9fff]+|[A-Z]/g) ?? [], plus: false };
  }
  return null;
};

const formulaHtml = (f: { tokens: string[]; plus: boolean }) =>
  `<div class="formula" role="img" aria-label="문형 ${esc(f.tokens.join(f.plus ? " + " : ""))}">${f.tokens
    .map(
      (tok, i) =>
        `${i && f.plus ? '<span class="plus" aria-hidden="true">+</span>' : ""}${
          REVIEW_HAN_ONLY.test(tok) ? `<span class="slot fixed" lang="zh-CN">${esc(tok)}</span>` : `<span class="slot var">${esc(tok)}</span>`
        }`,
    )
    .join("")}</div>`;

/** 설명: 첫 문장(굵게) + 나머지. '예문: 中文(뜻)'은 중국어 줄과 뜻 줄로 나눈다(모양이 다르면 그대로). 글자는 바꾸지 않는다 */
const noteHtml = (note: string, fixed: string[] = []) => {
  if (!note) return "";
  const i = note.indexOf("예문:");
  const main = (i >= 0 ? note.slice(0, i) : note).trim();
  const example = i >= 0 ? note.slice(i + 3).trim() : "";
  const m = /^(.+?[.!?。])\s+(.+)$/s.exec(main);
  const body = main ? (m ? `<p class="lead">${hz(m[1])}</p><p>${hz(m[2])}</p>` : `<p class="lead">${hz(main)}</p>`) : "";
  if (!example) return body;
  const ex = /^(.*[\u3400-\u9fff].*?)\s*[（(]([^()（）]+)[)）]\s*$/s.exec(example);
  return (
    body +
    (ex
      ? `<div class="example"><p class="ex-zh">${zhText(ex[1].trim(), "zh", fixed)}</p><p class="ex-ko">${hz(ex[2].trim())}</p></div>`
      : `<div class="example"><p>${hz(example)}</p></div>`)
  );
};

/** 문단을 문장으로 (마침표·물음표·느낌표 뒤 공백) */
const reviewSentences = (p: string) => p.split(/(?<=[.!?。！？])\s+/).filter((s) => s.trim());

/**
 * 복습 문서의 본문 HTML (4단계 materialHtmlDocument가 charset·CSP를 앞에 붙여 완전한 문서로 만든다).
 * 순서: 학습 요약 → 핵심 표현 → 어휘·문법 → 문화렌즈 → 셀프 체크 퀴즈 → 회화 연습 → 전체 대사(접기, 인쇄 시 전체). 빈 섹션은 뺀다.
 */
export const deckToReviewHtml = (deck: LessonDeck, { includeAnswers }: ReviewOptions): string => {
  const expr = deck.points.filter((p) => p.kind === "expression");
  const gram = deck.points.filter((p) => p.kind === "grammar");
  const sum = deck.points.filter((p) => p.kind === "summary");
  const sections: { id: string; label: string; tone: string; html: string }[] = [];
  const add = (id: string, label: string, tone: string, html: string) => {
    if (html) sections.push({ id, label, tone, html });
  };
  // 표현·문법 원문: 중국어 → 한국어 과목만 중국어. 한국어 → 중국어 과목의 원문은 한국어라 한자 구간에만 중국어 글꼴
  const srcText = (text: string, cls = "zh", fixed: string[] = []) =>
    deck.direction === "ko-zh" ? `<span class="${cls}">${hz(text)}</span>` : zhText(text, cls, fixed);
  const time = (sec: number | null | undefined) => (sec === null || sec === undefined ? "" : `<span class="time">▶ ${esc(formatTime(sec))}</span>`);

  // 학습 요약: 숫자 타일 + 이번 주 표현 + 정리 카드
  const stats = (
    [
      ["핵심 표현", expr.length, "sky"],
      ["어휘·문법", gram.length, "lav"],
      ["문화렌즈", deck.culture.length, "mint"],
      ["퀴즈", deck.quiz.length, "cream"],
      ["회화", deck.dialogues.length, "peach"],
      ["장면 대사", deck.lines.length, "gray"],
    ] as const
  ).filter(([, n]) => n > 0);
  add(
    "summary",
    "학습 요약",
    "sky",
    [
      deck.description ? `<p class="desc">${hz(deck.description)}</p>` : "",
      stats.length ? `<ul class="stats">${stats.map(([l, n, c]) => `<li class="tone-${c}"><b>${n}</b><span>${l}</span></li>`).join("")}</ul>` : "",
      expr.length ? `<div class="chips"><span class="chips-label">이번 주 표현</span>${expr.map((p, i) => `<a href="#expr-${i + 1}" class="chip">${srcText(p.text)}</a>`).join("")}</div>` : "",
      sum.map((p) => `<div class="card tone-sky">${srcText(p.text, "zh zh-md")}${pyText(p.pinyin)}<div class="note">${noteHtml(p.note)}</div></div>`).join(""),
    ].join(""),
  );

  add(
    "expressions",
    SECTION_LABEL.expression,
    "sky",
    expr
      .map(
        (p, i) =>
          `<article class="card tone-sky" id="expr-${i + 1}"><header><span class="num">${pad2(i + 1)}</span>${time(p.at)}</header><div class="headword">${srcText(p.text, "zh zh-xl")}${pyText(p.pinyin)}</div><div class="note">${noteHtml(p.note)}</div></article>`,
      )
      .join(""),
  );

  add(
    "grammar",
    SECTION_LABEL.grammar,
    "lav",
    gram
      .map((p, i) => {
        const f = reviewFormulaOf(p.note);
        const fixed = f ? f.tokens.filter((x) => REVIEW_HAN_ONLY.test(x)) : [];
        return `<article class="card tone-lav"><header><span class="num">${pad2(i + 1)}</span><span class="kind">${f ? "문형" : "문법 포인트"}</span>${time(p.at)}</header>${f ? formulaHtml(f) : ""}<div class="pattern">${f ? '<span class="cap">이 장면의 문장</span>' : ""}${srcText(p.text, "zh zh-lg", fixed)}${pyText(p.pinyin)}</div><div class="note">${noteHtml(p.note, fixed)}</div></article>`;
      })
      .join(""),
  );

  // 문화렌즈: 제목·부제(핵심) + 본문. 문장 3개 이상인 한 문단만 번호 목록으로 나누고, 여러 문단·짧은 문단은 그대로 둔다
  add(
    "culture",
    "문화렌즈",
    "mint",
    deck.culture
      .map((c) => {
        const ss = c.paragraphs.length === 1 ? reviewSentences(c.paragraphs[0]) : [];
        const body =
          ss.length >= 3
            ? `<ol class="detail">${ss.map((s) => `<li${/^그래서/.test(s) ? ' class="scene"' : ""}>${hz(s)}</li>`).join(" ")}</ol>`
            : c.paragraphs.map((p) => `<p>${hz(p)}</p>`).join("");
        return `<article class="card lens tone-mint"><header><span class="lens-mark" lang="zh-CN">文化</span>${time(c.at)}</header><div class="key"><h3>${hz(c.title)}</h3>${c.subtitle ? `<p class="quote">${hz(c.subtitle)}</p>` : ""}</div>${body}</article>`;
      })
      .join(""),
  );

  add(
    "quiz",
    "셀프 체크 퀴즈",
    "cream",
    deck.quiz.length
      ? deck.quiz
          .map((q, i) => {
            const answer = includeAnswers
              ? `<details class="answer-toggle"><summary>정답과 해설 보기</summary><div class="answer"><p><b>정답 ${OPTION_MARK[q.answer] ?? q.answer + 1}</b> ${hz(q.options[q.answer] ?? "")}</p>${q.explanation ? `<p>${hz(q.explanation)}</p>` : ""}</div></details>`
              : "";
            return `<article class="card tone-cream"><p class="q"><span class="qnum">Q${i + 1}</span>${hz(q.question)}</p><ol class="options">${q.options.map((o, j) => `<li><span class="mark">${OPTION_MARK[j] ?? j + 1}</span>${hz(o)}</li>`).join("")}</ol>${answer}</article>`;
          })
          .join("") + (includeAnswers ? "" : `<p class="muted">정답은 수업 시간에 함께 확인해요.</p>`)
      : "",
  );

  add(
    "dialogues",
    "회화 연습",
    "peach",
    deck.dialogues
      .map(
        (d) =>
          `<article class="card dialog tone-peach"><h3>${hz(d.title || "회화 연습")}</h3>${d.situation ? `<p class="muted">${hz(d.situation)}</p>` : ""}<ol class="talk">${d.lines
            .map((l) => `<li><span class="role">${hz(l.role)}</span><div>${l.zh ? zhText(l.zh) : ""}${pyText(l.pinyin)}${l.ko ? `<span class="ko">${hz(l.ko)}</span>` : ""}</div></li>`)
            .join("")}</ol></article>`,
      )
      .join(""),
  );

  if (deck.lines.length) {
    const list = `<ol class="script">${deck.lines
      .map((l) => `<li><span class="time">${esc(formatTime(l.start))}</span><div>${l.zh ? zhText(l.zh) : ""}${pyText(l.pinyin)}${l.ko ? `<span class="ko">${hz(l.ko)}</span>` : ""}</div></li>`)
      .join("")}</ol>`;
    // 화면에서는 접어 두고(스크립트 없이 details), 접힌 내용을 인쇄하지 않는 브라우저가 있어 인쇄 전용 사본을 둔다
    add(
      "lines",
      "전체 대사",
      "gray",
      `<details class="script-toggle"><summary><span class="when-closed">전체 대사 ${deck.lines.length}줄 펼쳐보기</span><span class="when-open">전체 대사 접기</span></summary>${list}</details><div class="print-only">${list}</div>`,
    );
  }

  const v = deck.video;
  const span = v ? `${formatTime(v.startTime)}${v.endTime > v.startTime ? `–${formatTime(v.endTime)}` : ""}` : "";
  const out: string[] = [`<head><style>${REVIEW_STYLE}</style></head><body>`];
  out.push(`<div class="topbar"><div class="wrap"><span class="brand">追剧学汉语<span>드라마 기반 중국어 학습</span></span><span>${esc(`${deck.week}주차 복습 자료`)}</span></div></div>`);
  out.push(
    `<div class="wrap hero"><div class="tags"><span class="tag week">${esc(`${deck.week}주차`)}</span><span class="tag">${deck.direction === "ko-zh" ? "한국어 → 중국어" : "중국어 → 한국어"}</span>${span ? `<span class="tag">${esc(`학습 구간 ${span}`)}</span>` : ""}</div>` +
      `<h1>${esc(`${deck.week}주차 복습 · `)}${zhText(deck.heading)}</h1>` +
      (deck.heading !== deck.title ? `<p class="sub">${hz(deck.title)}</p>` : "") +
      (v ? `<p class="video">영상&#58; <a href="${esc(`https://youtu.be/${encodeURIComponent(v.youtubeId)}?t=${Math.floor(v.startTime)}`)}">YouTube에서 장면 보기</a> (인터넷 연결 필요)</p>` : "") +
      `</div>`,
  );
  if (sections.length > 1) {
    out.push(`<nav class="toc" aria-label="목차"><ol>${sections.map((s, i) => `<li><a href="#${s.id}"><b>${pad2(i + 1)}</b>${esc(s.label)}</a></li>`).join("")}</ol></nav>`);
  }
  out.push(`<main class="wrap">`);
  sections.forEach((s, i) => out.push(`<section id="${s.id}" class="tone-${s.tone}"><div class="sec-head"><b>${pad2(i + 1)}</b><h2>${esc(s.label)}</h2></div>${s.html}</section>`));
  if (!sections.length) out.push(`<p class="muted">아직 정리된 학습 내용이 없어요.</p>`);
  out.push(`</main>`);
  out.push(
    `<footer><div class="wrap"><div class="name"><b>追剧学汉语</b> · 드라마 기반 중국어 학습 플랫폼</div><div>© 2026 이수연 · 한국외국어대학교 일반대학원 한중문화학과</div><div>본 웹앱은 중국어 교육 및 학습을 목적으로 제작되었습니다.</div><div>드라마 영상·대사·이미지의 저작권은 각 권리자에게 있습니다.</div></div></footer></body>`,
  );
  return out.join("\n");
};

/** 5-B: 연결된 복습 자료가 원본 강의보다 오래됐는지 (밀리초까지 비교, 어느 쪽 시각이든 모르면 false) */
export const reviewIsStale = (lessonUpdatedAt: string | null | undefined, generatedFrom: string | null | undefined) => {
  const a = Date.parse(lessonUpdatedAt ?? "");
  const b = Date.parse(generatedFrom ?? "");
  return Number.isFinite(a) && Number.isFinite(b) && Math.floor(a) > Math.floor(b);
};

/** 복습 자료 기본 제목 (4단계 제목 100자 제한 안) */
export const reviewTitle = (deck: LessonDeck) => `[복습] ${deck.week}주차 ${deck.heading}`.slice(0, 100);

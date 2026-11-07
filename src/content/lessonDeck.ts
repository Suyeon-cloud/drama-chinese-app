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
export type PresentKey = PresentAction["type"] | "toggle-play" | "play-scene" | "fullscreen" | "pinyin" | "korean" | "follow" | "exit" | "section";
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
const REVIEW_STYLE = [
  "h1{font-size:1.6em;margin:0 0 4px}h2{font-size:1.25em;margin:28px 0 10px;padding-bottom:4px;border-bottom:2px solid #e5e7eb}",
  ".meta{color:#57606a;font-size:.92em}.toc{background:#f6f8fa;border-radius:8px;padding:10px 16px}.toc a{color:#0969da}",
  ".zh{font-size:1.15em}.py{color:#8250df;font-size:.9em}.ko{color:#24292f}.t{color:#6e7781;font-size:.85em;white-space:nowrap}",
  ".card{border:1px solid #d0d7de;border-radius:8px;padding:10px 14px;margin:8px 0}.tag{display:inline-block;font-size:.75em;padding:1px 8px;border-radius:99px;background:#ddf4ff;color:#0550ae;margin-right:6px}",
  ".tag.g{background:#fbefff;color:#8250df}.q{margin:12px 0}.q ol{margin:6px 0 0 0;padding-left:22px}details{margin-top:6px;color:#1a7f37}",
  "table{width:100%}th{background:#f6f8fa;text-align:left}@media print{.toc{display:none}h2{break-after:avoid}.card,.q{break-inside:avoid}}",
].join("");

export type ReviewOptions = { includeAnswers: boolean };

/** 복습 문서의 본문 HTML (4단계 materialHtmlDocument가 charset·CSP를 앞에 붙여 완전한 문서로 만든다) */
export const deckToReviewHtml = (deck: LessonDeck, { includeAnswers }: ReviewOptions): string => {
  const out: string[] = [`<head><style>${REVIEW_STYLE}</style></head><body>`];
  out.push(`<h1>${esc(`${deck.week}주차 복습 · ${deck.heading}`)}</h1>`);
  const meta = [deck.heading !== deck.title ? deck.title : "", deck.video ? `학습 구간 ${formatTime(deck.video.startTime)}${deck.video.endTime > deck.video.startTime ? `–${formatTime(deck.video.endTime)}` : ""}` : ""].filter(Boolean);
  if (meta.length) out.push(`<p class="meta">${esc(meta.join(" · "))}</p>`);
  if (deck.description) out.push(`<p>${esc(deck.description)}</p>`);
  if (deck.video) {
    out.push(`<p class="meta">영상: <a href="${esc(`https://youtu.be/${encodeURIComponent(deck.video.youtubeId)}?t=${Math.floor(deck.video.startTime)}`)}">YouTube에서 장면 보기</a> (인터넷 연결 필요)</p>`);
  }

  const sections: { id: string; label: string; html: string }[] = [];
  if (deck.lines.length) {
    const rows = deck.lines
      .map((l) => `<tr><td class="t">${esc(formatTime(l.start))}</td><td>${l.zh ? `<div class="zh">${esc(l.zh)}</div>` : ""}${l.pinyin ? `<div class="py">${esc(l.pinyin)}</div>` : ""}</td><td class="ko">${esc(l.ko)}</td></tr>`)
      .join("");
    sections.push({ id: "lines", label: "장면 대사", html: `<table><tr><th>시점</th><th>원문</th><th>뜻</th></tr>${rows}</table>` });
  }
  const pointCards = (kind: DeckPoint["kind"]) =>
    deck.points
      .filter((p) => p.kind === kind)
      .map((p) => `<div class="card"><span class="tag${kind === "grammar" ? " g" : ""}">${esc(SECTION_LABEL[kind])}</span><span class="zh">${esc(p.text)}</span>${p.pinyin ? `<div class="py">${esc(p.pinyin)}</div>` : ""}${p.note ? `<div class="ko">${esc(p.note)}</div>` : ""}${p.at !== null ? `<div class="t">영상 ${esc(formatTime(p.at))}</div>` : ""}</div>`)
      .join("");
  const expr = pointCards("expression");
  if (expr) sections.push({ id: "expressions", label: SECTION_LABEL.expression, html: expr });
  const gram = pointCards("grammar");
  if (gram) sections.push({ id: "grammar", label: SECTION_LABEL.grammar, html: gram });
  if (deck.culture.length) {
    sections.push({
      id: "culture",
      label: SECTION_LABEL.culture,
      html: deck.culture
        .map((c) => `<div class="card"><b>${esc(c.title)}</b>${c.subtitle ? ` <span class="meta">${esc(c.subtitle)}</span>` : ""}${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`)
        .join(""),
    });
  }
  if (deck.dialogues.length) {
    sections.push({
      id: "dialogues",
      label: SECTION_LABEL.dialogue,
      html: deck.dialogues
        .map((d) => `<div class="card"><b>${esc(d.title || "회화 연습")}</b>${d.situation ? `<p class="meta">${esc(d.situation)}</p>` : ""}<table>${d.lines.map((l) => `<tr><td class="t">${esc(l.role)}</td><td>${l.zh ? `<div class="zh">${esc(l.zh)}</div>` : ""}${l.pinyin ? `<div class="py">${esc(l.pinyin)}</div>` : ""}</td><td class="ko">${esc(l.ko)}</td></tr>`).join("")}</table></div>`)
        .join(""),
    });
  }
  if (deck.quiz.length) {
    sections.push({
      id: "quiz",
      label: "셀프 체크 퀴즈",
      html:
        deck.quiz
          .map((q, i) => {
            const answer = includeAnswers
              ? `<details><summary>정답 보기</summary><p>정답: ${q.answer + 1}. ${esc(q.options[q.answer])}</p>${q.explanation ? `<p>${esc(q.explanation)}</p>` : ""}</details>`
              : "";
            return `<div class="q"><b>${i + 1}. ${esc(q.question)}</b><ol>${q.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ol>${answer}</div>`;
          })
          .join("") + (includeAnswers ? "" : `<p class="meta">정답은 수업 시간에 함께 확인해요.</p>`),
    });
  }
  const sum = pointCards("summary");
  if (sum) sections.push({ id: "summary", label: SECTION_LABEL.summary, html: sum });

  if (sections.length > 1) {
    out.push(`<nav class="toc"><b>목차</b> · ${sections.map((s) => `<a href="#${s.id}">${esc(s.label)}</a>`).join(" · ")}</nav>`);
  }
  for (const s of sections) out.push(`<h2 id="${s.id}">${esc(s.label)}</h2>${s.html}`);
  if (!sections.length) out.push(`<p class="meta">아직 정리된 학습 내용이 없어요.</p>`);
  out.push(`<p class="meta" style="margin-top:32px">追剧学汉语 · ${esc(deck.week + "주차")} 복습 자료</p></body>`);
  return out.join("\n");
};

/** 복습 자료 기본 제목 (4단계 제목 100자 제한 안) */
export const reviewTitle = (deck: LessonDeck) => `[복습] ${deck.week}주차 ${deck.heading}`.slice(0, 100);

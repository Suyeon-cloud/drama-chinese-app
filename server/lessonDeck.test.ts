// 5단계 LessonDeck — 발표 슬라이드·학생용 복습 HTML (npm test). 기존 학습 데이터(SEED_LESSONS)만 쓴다. 외부 호출·저장 없음.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLessonDeck,
  deckToReviewHtml,
  deckToSlides,
  lineSlideAt,
  presentKeyOf,
  presentReducer,
  reviewTitle,
  slideRange,
  type DeckInput,
} from "../src/content/lessonDeck";
import { MATERIAL_HTML_MAX_BYTES, htmlByteLength, materialHtmlDocument, materialHtmlExternalCount, materialHtmlProblem } from "../src/content/materialHtml";
import { SEED_LESSONS, resolveLessonContent } from "../src/content/lessons";
import type { Lesson } from "../src/content/types";
import { playbackCues } from "../src/app/lib/subtitles";

const fakePinyin = (zh: string) => `py(${zh.length})`;
const input = (lesson: Lesson, extra: Partial<DeckInput> = {}): DeckInput => ({
  lesson,
  content: resolveLessonContent(lesson, fakePinyin),
  cues: playbackCues(lesson),
  pinyinOf: fakePinyin,
  ...extra,
});
const EP3 = SEED_LESSONS.find((l) => l.id === "lesson-yjrzm-ep3")!;
const W1 = SEED_LESSONS.find((l) => l.id === "lesson-week01")!;

test("덱: 학습 구간 안 대사만, 번들 표현·문화·퀴즈·요약을 모두 담고 원본은 바꾸지 않는다", () => {
  const before = JSON.stringify(EP3);
  const deck = buildLessonDeck(input(EP3));
  assert.equal(JSON.stringify(EP3), before, "원본 Lesson 그대로");
  assert.equal(deck.lessonId, EP3.id);
  assert.equal(deck.week, EP3.week);
  assert.ok(deck.video && deck.video.youtubeId === EP3.video.youtubeId);
  assert.ok(deck.lines.length > 0);
  assert.ok(deck.lines.every((l) => l.start >= EP3.video.startTime - 0.01 && l.start <= EP3.video.endTime + 0.01), "학습 구간 안");
  assert.ok(deck.lines.every((l, i, a) => i === 0 || a[i - 1].start <= l.start), "시간 순서");
  assert.ok(deck.lines.filter((l) => l.zh).every((l) => l.pinyin), "중국어 대사에는 병음");
  const content = resolveLessonContent(EP3);
  assert.equal(deck.points.filter((p) => p.kind !== "summary").length, content.cues.filter((c) => c.kind === "motion").length);
  assert.equal(deck.points.filter((p) => p.kind === "summary").length, content.summary.length);
  assert.equal(deck.culture.length, 1);
  assert.ok(deck.culture[0].paragraphs.length > 0);
  assert.deepEqual(deck.quiz.map((q) => q.id), content.quiz.map((q) => q.id), "퀴즈 id 유지 (6단계 연동)");
  assert.equal(deck.sourceUpdatedAt, EP3.updatedAt);
  assert.deepEqual(buildLessonDeck(input(EP3)), deck, "같은 입력 → 같은 덱");
});

test("덱: 교수자 초안은 한 번만(시점 있는 초안 cue와 중복 없음), 정답 없는 초안 퀴즈는 빼고, 회화는 화면이 넘긴 대사로", () => {
  const lesson: Lesson = {
    ...W1,
    draft: {
      ...W1.draft!,
      expressions: [...W1.draft!.expressions, { id: "x-none", source: "没时间", note: "시간이 없다", at: null }, { id: "x-empty", source: "  ", note: "빈 항목" }],
      quiz: [...W1.draft!.quiz, { id: "q-null", question: "정답 미정", options: ["a", "b"], answer: null, explanation: "" }],
    },
  };
  const deck = buildLessonDeck(
    input(lesson, { dialogues: [{ id: "d1", title: "카페에서", situation: "주문", lines: [{ role: "A", zh: "你好", pinyin: "nǐ hǎo", ko: "안녕", start: 1, end: 2 }, { role: "B", zh: " ", pinyin: "", ko: "", start: 2, end: 3 }] }] }),
  );
  const ids = deck.points.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "표현 중복 없음");
  assert.ok(ids.includes("x-none"), "시점 없는 초안도 포함");
  assert.ok(!ids.includes("x-empty"), "빈 초안 제외");
  assert.equal(deck.points.find((p) => p.id === "x-none")!.at, null);
  assert.ok(!deck.quiz.some((q) => q.id === "q-null"), "정답 없는 퀴즈 제외");
  assert.ok(deck.quiz.every((q) => q.answer >= 0 && q.answer < q.options.length));
  assert.deepEqual(deck.dialogues.map((d) => d.lines.length), [1], "빈 대사 줄 제외");
});

test("슬라이드: 순서·구간·자막 따라가기, 퀴즈 정답은 공개할 때만, 키 조작은 입력칸·수정키에서 쓰지 않는다", () => {
  const deck = buildLessonDeck(input(EP3));
  const slides = deckToSlides(deck);
  const kinds = slides.map((s) => s.kind);
  assert.equal(kinds[0], "title");
  assert.equal(kinds[kinds.length - 1], "end");
  const order = ["title", "line", "point", "culture", "quiz", "point", "end"];
  const compact = kinds.filter((k, i) => k !== kinds[i - 1]);
  assert.deepEqual(compact, order);
  assert.equal(slides.filter((s) => s.kind === "line").length, deck.lines.length);
  assert.equal(slides.filter((s) => s.kind === "quiz").length, deck.quiz.length);
  assert.equal(new Set(slides.map((s) => s.key)).size, slides.length, "슬라이드 key 고유");
  const firstLine = slides.findIndex((s) => s.kind === "line");
  const s = slides[firstLine];
  assert.ok(s.kind === "line");
  assert.deepEqual(slideRange(s), { start: s.line.start, end: s.line.end });
  assert.equal(lineSlideAt(slides, s.line.start + 0.01), firstLine);
  assert.equal(lineSlideAt(slides, -5), -1);
  assert.equal(slideRange(slides[0]), null);

  const reduce = presentReducer(slides.length);
  let st = { index: 0, revealed: [] as string[] };
  st = reduce(st, { type: "prev" });
  assert.equal(st.index, 0, "처음에서 이전 = 그대로");
  st = reduce(st, { type: "last" });
  assert.equal(st.index, slides.length - 1);
  st = reduce(st, { type: "next" });
  assert.equal(st.index, slides.length - 1, "끝에서 다음 = 그대로");
  const quizIndex = slides.findIndex((x) => x.kind === "quiz");
  st = reduce(st, { type: "go", index: quizIndex });
  assert.deepEqual(st.revealed, [], "퀴즈 슬라이드로 가도 정답은 닫혀 있다");
  st = reduce(st, { type: "reveal", key: slides[quizIndex].key });
  assert.deepEqual(st.revealed, [slides[quizIndex].key]);
  st = reduce(st, { type: "reveal", key: slides[quizIndex].key });
  assert.deepEqual(st.revealed, [], "다시 누르면 가린다");

  assert.equal(presentKeyOf({ key: "ArrowRight" }), "next");
  assert.equal(presentKeyOf({ key: "PageDown" }), "next");
  assert.equal(presentKeyOf({ key: "PageUp" }), "prev");
  assert.equal(presentKeyOf({ key: " " }), "toggle-play");
  assert.equal(presentKeyOf({ key: "Enter" }), "play-scene");
  assert.equal(presentKeyOf({ key: "a" }), "reveal");
  assert.equal(presentKeyOf({ key: "P" }), "pinyin");
  assert.equal(presentKeyOf({ key: "ArrowRight", targetTag: "INPUT" }), null);
  assert.equal(presentKeyOf({ key: " ", targetTag: "TEXTAREA" }), null);
  assert.equal(presentKeyOf({ key: "a", editable: true }), null);
  assert.equal(presentKeyOf({ key: "f", ctrlKey: true }), null, "브라우저 단축키는 그대로");
  assert.equal(presentKeyOf({ key: "x" }), null);
});

test("복습 HTML: 4단계 검사 통과·외부 리소스 없음·2MB 이하, 정답은 선택할 때만, 학습 데이터의 위험한 글자는 이스케이프", () => {
  for (const lesson of [EP3, W1]) {
    const deck = buildLessonDeck(input(lesson));
    for (const includeAnswers of [false, true]) {
      const html = deckToReviewHtml(deck, { includeAnswers });
      assert.equal(materialHtmlProblem(html), null, `${lesson.id} ${includeAnswers}`);
      assert.equal(materialHtmlExternalCount(html), 0);
      assert.ok(htmlByteLength(materialHtmlDocument(reviewTitle(deck), html)) < MATERIAL_HTML_MAX_BYTES);
      assert.equal(deckToReviewHtml(deck, { includeAnswers }), html, "같은 입력 → 같은 문서");
    }
    const without = deckToReviewHtml(deck, { includeAnswers: false });
    const withAns = deckToReviewHtml(deck, { includeAnswers: true });
    assert.ok(!without.includes("<details>"), "기본: 정답·해설 없음");
    assert.equal([...withAns.matchAll(/<details>/g)].length, deck.quiz.length);
    assert.ok(!without.includes("<p>정답: "), "기본: 정답 문구 없음");
    assert.equal([...withAns.matchAll(/<p>정답: /g)].length, deck.quiz.length);
  }
  // 학습 데이터에 태그·스크립트 같은 글자가 있어도 태그가 되지 않고 4단계 검사도 통과한다
  const evil: Lesson = {
    ...W1,
    title: '<script>alert(1)</script> javascript:alert(1)',
    description: 'expression(x) srcdoc="y" <img src=x onerror=alert(1)>',
    draft: { ...W1.draft!, expressions: [{ id: "e1", source: "<b>你好</b>", note: "onclick=x()", at: null }] },
  };
  const deck = buildLessonDeck(input(evil));
  const html = deckToReviewHtml(deck, { includeAnswers: true });
  assert.equal(materialHtmlProblem(html), null);
  assert.ok(!html.includes("<script") && !html.includes("<img") && !html.includes("<b>你好"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.match(reviewTitle(deck), /^\[복습\] 1주차 /);
  assert.ok(reviewTitle({ ...deck, heading: "가".repeat(200) }).length <= 100);
});

test("섹션 빠른 이동: 데이터가 있는 섹션만, 섹션마다 한 덩어리(표현→문법), 숫자 키 1~9", async () => {
  const { sectionStarts, sectionOf } = await import("../src/content/lessonDeck");
  for (const lesson of [EP3, W1]) {
    const slides = deckToSlides(buildLessonDeck(input(lesson)));
    const starts = sectionStarts(slides);
    const labels = starts.map((s) => s.section);
    assert.equal(new Set(labels).size, labels.length, `${lesson.id}: 섹션이 한 번씩만 (${labels.join(",")})`);
    assert.ok(!labels.includes("시작") && !labels.includes("마무리"));
    assert.equal(starts.reduce((n, s) => n + s.count, 0), slides.length - 2, "시작·마무리 뺀 모든 슬라이드가 어느 섹션엔가 속한다");
    for (const s of starts) {
      assert.equal(slides[s.index].section, s.section);
      assert.equal(sectionOf(starts, s.index), starts.indexOf(s));
      assert.equal(sectionOf(starts, s.index + s.count - 1), starts.indexOf(s));
    }
    assert.equal(sectionOf(starts, 0), -1, "시작 슬라이드는 섹션 밖");
  }
  // 대사·퀴즈가 없는 학습자료: 그 섹션 버튼이 없다
  const empty = buildLessonDeck(input({ ...W1, script: { ...W1.script, cues: [], plain: undefined }, draft: { ...W1.draft!, quiz: [] }, content: undefined }));
  const labels = sectionStarts(deckToSlides({ ...empty, quiz: [] })).map((s) => s.section);
  assert.ok(!labels.includes("장면 대사") && !labels.includes("퀴즈"), labels.join(","));
  assert.equal(presentKeyOf({ key: "3" }), "section");
  assert.equal(presentKeyOf({ key: "0" }), null);
  assert.equal(presentKeyOf({ key: "1", targetTag: "INPUT" }), null);
});

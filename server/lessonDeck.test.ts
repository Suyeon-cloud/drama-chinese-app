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
  reviewFormulaOf,
  reviewTitle,
  slideRange,
  type DeckInput,
  type LessonDeck,
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
    assert.ok(!without.includes('class="answer-toggle"'), "기본: 정답·해설 없음");
    assert.equal([...withAns.matchAll(/<details class="answer-toggle">/g)].length, deck.quiz.length);
    assert.ok(!without.includes("<b>정답 "), "기본: 정답 문구 없음");
    assert.equal([...withAns.matchAll(/<b>정답 /g)].length, deck.quiz.length);
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

/* ───────── 복습 HTML 새 디자인 ───────── */

/** 태그를 빼고 문자 참조를 되돌린 글 (공백·예문 괄호는 비교에서 무시) */
const plainOf = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[\s()（）]+/g, "");
const deckTexts = (d: LessonDeck) =>
  [
    d.title,
    d.description,
    ...d.lines.flatMap((l) => [l.zh, l.pinyin, l.ko]),
    ...d.points.flatMap((p) => [p.text, p.pinyin, ...p.note.split("예문:")]),
    ...d.culture.flatMap((c) => [c.title, c.subtitle, ...c.paragraphs]),
    ...d.dialogues.flatMap((x) => [x.title, x.situation, ...x.lines.flatMap((l) => [l.role, l.zh, l.pinyin, l.ko])]),
    ...d.quiz.flatMap((q) => [q.question, ...q.options, q.explanation]),
  ]
    .map((s) => (s ?? "").replace(/[\s()（）]+/g, ""))
    .filter(Boolean);

test("복습 HTML 새 디자인: 학습 데이터 글자 보존(중국어·병음·한국어·설명·보기·해설), 섹션 순서, 전체 대사 접기 + 인쇄 사본, 머리말·Footer", () => {
  for (const lesson of [EP3, W1]) {
    const deck = buildLessonDeck(input(lesson));
    const html = deckToReviewHtml(deck, { includeAnswers: true });
    const flat = plainOf(html);
    const missing = deckTexts(deck).filter((s) => !flat.includes(s));
    assert.deepEqual(missing, [], `${lesson.id}: 빠진 글자 없음`);
    // 섹션 순서: 요약 → 표현 → 문법 → 문화 → 퀴즈 → 회화 → 전체 대사 (빈 섹션은 없음)
    const order = [...html.matchAll(/<section id="(\w+)"/g)].map((m) => m[1]);
    const want = ["summary", "expressions", "grammar", "culture", "quiz", "dialogues", "lines"];
    assert.deepEqual(order, want.filter((id) => order.includes(id)), `${lesson.id}: ${order}`);
    if (deck.lines.length) {
      assert.match(html, new RegExp(`<details class="script-toggle"><summary><span class="when-closed">전체 대사 ${deck.lines.length}줄 펼쳐보기`));
      assert.equal([...html.matchAll(/<ol class="script">/g)].length, 2, "접기 안 목록 + 인쇄 전용 사본");
      assert.match(html, /\.print-only\{display:none\}/);
      assert.match(html, /@media print\{body\{[^}]*\}[^{}]*\.script-toggle\{display:none\}\.print-only\{display:block\}/);
    }
    // 중국어는 중국어로 표시 (글꼴·줄바꿈)
    assert.ok(html.includes('<span class="zh zh-xl" lang="zh-CN">') || !deck.points.some((p) => p.kind === "expression"));
    assert.match(html, /드라마 영상·대사·이미지의 저작권은 각 권리자에게 있습니다\./);
    assert.ok(!html.includes("교육 목적의 인용"));
    assert.ok(html.includes('<span class="brand">追剧学汉语'));
  }
});

test("복습 HTML 언어 표시: 중국어 → 한국어 과목의 표현은 zh-CN, 한국어 → 중국어 과목의 원문(한국어)은 한자 구간만 zh-CN", () => {
  const deck = buildLessonDeck(input(W1));
  const point = { id: "e", kind: "expression" as const, text: "비가 와요 下雨了", pinyin: "", note: "", at: null };
  const zhko = deckToReviewHtml({ ...deck, direction: "zh-ko", points: [point] }, { includeAnswers: false });
  assert.match(zhko, /<span class="zh zh-xl" lang="zh-CN">비가 와요 下雨了<\/span>/);
  const kozh = deckToReviewHtml({ ...deck, direction: "ko-zh", points: [point] }, { includeAnswers: false });
  assert.match(kozh, /<span class="zh zh-xl">비가 와요 <span class="hz" lang="zh-CN">下雨了<\/span><\/span>/);
});

test("복습 HTML 문형 다이어그램: 설명에 따옴표로 적힌 공식만, 불확실하면 일반 카드", () => {
  assert.deepEqual(reviewFormulaOf("'동사1 + 着 + 동사2'는 '~한 채로 ~하다'라는 뜻"), { tokens: ["동사1", "着", "동사2"], plus: true });
  assert.deepEqual(reviewFormulaOf("'A + 被 + B + 동사'는 피동문"), { tokens: ["A", "被", "B", "동사"], plus: true });
  assert.deepEqual(reviewFormulaOf("'得(děi)'는 ~해야 한다. '동사 + 一下'는 한번 ~해 보다"), { tokens: ["동사", "一下"], plus: true });
  assert.deepEqual(reviewFormulaOf("'又A又B'는 A하기도 하고 B하기도 하다"), { tokens: ["又", "A", "又", "B"], plus: false });
  // 공식 모양이 아니면 만들지 않는다
  for (const note of ["'有没有'처럼 긍정형과 부정형을 이어 붙이면 정반의문문", "'A + B'처럼 한자가 없는 공식", "설명에 따옴표가 없어요", "'走着淋雨'는 '걸으면서 비를 맞다'라는 뜻", ""]) {
    assert.equal(reviewFormulaOf(note), null, note);
  }
  const deck = buildLessonDeck(input(W1));
  const base = { id: "g", kind: "grammar" as const, pinyin: "", at: null };
  const html = deckToReviewHtml(
    {
      ...deck,
      points: [
        { ...base, id: "g1", text: "他笑着说", note: "'동사1 + 着 + 동사2'는 방식을 나타내요. 예문: 他笑着说。(그는 웃으면서 말했어요.)" },
        { ...base, id: "g2", text: "你有没有时间", note: "'有没有'처럼 긍정형과 부정형을 이어 붙여요. 예문: 你有没有时间？(너 시간 있어, 없어?)" },
      ],
    },
    { includeAnswers: false },
  );
  assert.equal([...html.matchAll(/class="formula"/g)].length, 1, "공식이 있는 문항만 다이어그램");
  assert.match(html, /<span class="slot fixed" lang="zh-CN">着<\/span>/);
  assert.match(html, /<span class="zh zh-lg" lang="zh-CN">他笑<mark>着<\/mark>说<\/span>/, "장면 문장의 고정 글자 표시(글자는 그대로)");
  assert.match(html, /<span class="kind">문법 포인트<\/span>/, "공식 없는 문항은 일반 카드");
  assert.equal([...html.matchAll(/class="ex-zh"/g)].length, 2, "예문: 중국어 줄과 뜻 줄");
  assert.match(html, /<p class="ex-ko">그는 웃으면서 말했어요\.<\/p>/);
});

test("복습 HTML 문화렌즈: 긴 한 문단만 문장 목록으로, 여러 문단·짧은 문단은 그대로 / 위험한 글자는 이스케이프", () => {
  const deck = buildLessonDeck(input(W1));
  const long = "첫 문장이에요. 두 번째 문장이에요. 세 번째 문장이에요. 그래서 장면에서 웃음이 나요.";
  const one = deckToReviewHtml({ ...deck, culture: [{ id: "c1", title: "제목", subtitle: "", paragraphs: [long], at: null }] }, { includeAnswers: false });
  assert.equal([...one.matchAll(/<ol class="detail">/g)].length, 1);
  assert.equal([...one.matchAll(/<ol class="detail">[\s\S]*?<\/ol>/g)][0][0].match(/<li/g)!.length, 4);
  assert.match(one, /<li class="scene">그래서 장면에서 웃음이 나요\.<\/li>/);
  const many = deckToReviewHtml({ ...deck, culture: [{ id: "c1", title: "제목", subtitle: "", paragraphs: ["짧은 문단이에요.", long], at: null }] }, { includeAnswers: false });
  assert.ok(!many.includes('<ol class="detail">'), "여러 문단은 문단 그대로");
  const short = deckToReviewHtml({ ...deck, culture: [{ id: "c1", title: "제목", subtitle: "", paragraphs: ["한 문장. 두 문장."], at: null }] }, { includeAnswers: false });
  assert.ok(!short.includes('<ol class="detail">'), "문장이 적으면 문단 그대로");
  const evil = deckToReviewHtml(
    {
      ...deck,
      culture: [{ id: "c1", title: "<img src=x onerror=alert(1)>", subtitle: "javascript:alert(1)", paragraphs: ["<script>x</script>. 둘. 셋. 그래서 넷."], at: null }],
      points: [{ id: "g", kind: "grammar", text: "<b>着</b>", pinyin: "", note: "'动词 + <i>着</i>' 예문: <svg onload=x>(뜻)", at: null }],
    },
    { includeAnswers: true },
  );
  assert.equal(materialHtmlProblem(evil), null);
  // 문서 자체가 쓰는 <b>(번호·정답 표시)는 있지만, 학습 데이터에서 온 태그는 하나도 없다
  assert.ok(!/<img|<script|<svg|<i>|<b>着|<mark><b>/.test(evil.replace(/<style>[\s\S]*?<\/style>/, "")));
  assert.ok(evil.includes("&lt;img src&#61;x onerror&#61;alert&#40;1)&gt;") && evil.includes("&lt;b&gt;"));
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
  assert.equal(presentKeyOf({ key: "m" }), "motion");
  assert.equal(presentKeyOf({ key: "M" }), "motion");
  assert.equal(presentKeyOf({ key: "m", targetTag: "INPUT" }), null);
  assert.equal(presentKeyOf({ key: "0" }), null);
  assert.equal(presentKeyOf({ key: "1", targetTag: "INPUT" }), null);
});

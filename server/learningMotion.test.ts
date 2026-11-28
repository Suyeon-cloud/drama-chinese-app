// 4단계 교육용 모션 데이터 규칙 (npm test): 강의 데이터에 있는 것만 나누고, 없으면 null·정적 표시. 임의 생성 없음.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cultureSteps, grammarPattern, hanziOf, markPhrases, splitNoteExample } from "../src/content/learningMotion";
import { SEED_LESSONS } from "../src/content/lessons";

test("예문 분리: '예문:' 표시가 있을 때만, 설명·예문은 원래 글자 그대로", () => {
  const note = "'万一'는 '만약에'라는 뜻이에요. 예문: 万一下雨了，我们就在家看电影。(혹시 비가 오면 집에서 영화 보자.)";
  const r = splitNoteExample(note);
  assert.equal(r.meaning, "'万一'는 '만약에'라는 뜻이에요.");
  assert.equal(r.example, "万一下雨了，我们就在家看电影。(혹시 비가 오면 집에서 영화 보자.)");
  assert.ok(note.includes(r.meaning) && note.includes(r.example!));
  assert.deepEqual(splitNoteExample("예문이 없는 설명이에요."), { meaning: "예문이 없는 설명이에요.", example: null });
  assert.deepEqual(splitNoteExample("설명 예문: "), { meaning: "설명 예문:", example: null }, "빈 예문은 예문으로 보지 않는다");
});

test("문형 찾기: 설명에 따옴표로 표시된 문형의 고정 부분이 원문에 순서대로 있을 때만, 원문을 그대로 나눈다", () => {
  const p = grammarPattern("如果这么喜欢蛇的话", "'如果…的话'는 '만약 ~라면'이라는 가정 문형이에요.");
  assert.ok(p);
  assert.deepEqual(p.pieces, ["如果", "的话"]);
  assert.deepEqual(p.segments, [
    { text: "如果", fixed: true },
    { text: "这么喜欢蛇", fixed: false },
    { text: "的话", fixed: true },
  ]);
  assert.ok(grammarPattern("也不是没有讨论过", "'不是没有…'는 이중부정이에요."), "앞뒤 채운 말");
  // 표시가 없거나, 원문에 없거나, 순서가 다르면 null
  assert.equal(grammarPattern("我们走吧", "청유를 나타내요."), null);
  assert.equal(grammarPattern("我们走吧", "'如果…的话' 문형"), null);
  assert.equal(grammarPattern("的话如果", "'如果…的话'"), null, "순서가 다르면 아님");
  assert.equal(grammarPattern("如果的话", "'如果…的话'"), null, "채운 말이 없으면 구조를 보여 줄 것이 없다");
  assert.equal(grammarPattern("Hello", "'如果…的话'"), null);
});

test("모든 시드 강의: 문형·예문·강조 결과는 원문·설명을 다시 이어 붙이면 그대로 (새 글자를 만들지 않는다)", () => {
  let patterns = 0;
  for (const lesson of SEED_LESSONS) {
    const draft = lesson.draft;
    if (!draft) continue;
    const phrases = draft.expressions.map((x) => x.source);
    for (const x of [...draft.expressions, ...draft.grammar]) {
      const ex = splitNoteExample(x.note);
      assert.ok(x.note.includes(ex.meaning), `${lesson.id}:${x.id} 설명`);
      if (ex.example) assert.ok(x.note.includes(ex.example), `${lesson.id}:${x.id} 예문`);
      const p = grammarPattern(x.source, x.note);
      if (p) {
        patterns++;
        assert.equal(p.segments.map((s) => s.text).join(""), x.source.trim(), `${lesson.id}:${x.id} 원문 그대로`);
        assert.ok(x.note.includes(p.pattern), "문형은 설명에 있는 글자");
        for (const piece of p.pieces) assert.ok(p.pattern.replace(/\s+/g, "").includes(piece));
      }
    }
    for (const c of lesson.script.cues) {
      if (!c.zh) continue;
      const segs = markPhrases(c.zh, phrases);
      assert.equal(segs.map((s) => s.text).join(""), c.zh);
      for (const s of segs.filter((s) => s.mark)) assert.ok(phrases.some((p) => p.includes(s.text) || s.text === p.trim()), "강조는 표현 원문만");
    }
  }
  assert.ok(patterns >= 1, "시드 데이터에서 문형이 하나 이상 찾아진다");
});

test("강조·획순·문화 단계: 겹치지 않는 긴 표현 우선, 없으면 강조 없음, 한자만 중복 없이, 빈 문단 제거", () => {
  assert.deepEqual(markPhrases("我好不容易才找到", ["好不容易", "容易"]), [
    { text: "我", mark: false },
    { text: "好不容易", mark: true },
    { text: "才找到", mark: false },
  ]);
  assert.deepEqual(markPhrases("你好", ["再见"]), [{ text: "你好", mark: false }]);
  assert.deepEqual(markPhrases("你好", ["a"]), [{ text: "你好", mark: false }], "한자 없는·한 글자 표현은 강조하지 않는다");
  assert.deepEqual(hanziOf("我们我们，ok 一起", 4), ["我", "们", "一", "起"]);
  assert.deepEqual(hanziOf("hello"), []);
  assert.deepEqual(cultureSteps("첫 문단\n\n  \n둘째 문단\n"), ["첫 문단", "둘째 문단"]);
});

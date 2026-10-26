import type { DraftPlan } from "../../content/levels";

/** 목록에서 고르게 count개를 고른다. (순서 유지) */
export const spread = <T>(items: T[], count: number): T[] => {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
};

/** 문장 길이: 공백·문장부호·기호를 뺀 글자 수 (중국어 한자 수, 한국어 음절 수) */
export const lineSize = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, "").length;

type Item = { text: string; index: number; size: number };

/**
 * 학습 수준에 맞는 원문 문장 고르기.
 * 문장을 짧은 것부터 줄 세운 뒤 plan.window 구간에서 핵심 표현·어휘·문법 문장을 고른다.
 * 구간 안 문장이 모자라면 구간을 양쪽으로 넓힌다. 고른 문장은 영상 순서대로 돌려준다.
 */
export const pickLinesForLevel = (lines: string[], plan: DraftPlan) => {
  const seen = new Set<string>();
  const items: Item[] = [];
  lines.forEach((raw, index) => {
    const text = raw.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    items.push({ text, index, size: lineSize(text) });
  });
  const need = plan.expressions + plan.grammar;
  // ‘嗯’, ‘네’ 같은 한 글자 대답은 문장이 넉넉할 때 뺀다.
  const usable = items.filter((x) => x.size >= 2);
  const pool = usable.length >= need ? usable : items;
  const ranked = [...pool].sort((a, b) => a.size - b.size || a.index - b.index);

  let [from, to] = plan.window;
  const slice = () => ranked.slice(Math.floor(from * ranked.length), Math.ceil(to * ranked.length));
  let window = slice();
  while (window.length < need && (from > 0 || to < 1)) {
    from = Math.max(0, from - 0.05);
    to = Math.min(1, to + 0.05);
    window = slice();
  }

  const byTime = [...window].sort((a, b) => a.index - b.index);
  const expressions = spread(byTime, plan.expressions);
  const grammar = spread(
    byTime.filter((x) => !expressions.includes(x)),
    plan.grammar,
  );
  return { expressions: expressions.map((x) => x.text), grammar: grammar.map((x) => x.text) };
};

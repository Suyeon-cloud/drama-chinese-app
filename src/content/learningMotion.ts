// 4단계 교육용 모션그래픽의 데이터 규칙 (화면·테스트 공통, 순수 함수)
// 원칙: 강의 데이터(원문·설명·병음·문화렌즈)에 '있는 것만' 나눠 보여 준다. 문장 성분·화자·수치를 새로 만들지 않는다.
// 규칙에 맞는 데이터가 없으면 null/빈 값을 돌려주고, 화면은 기존 정적 표시를 쓴다.

const HANZI = /\p{Script=Han}/u;
export const hasHanzi = (s: string) => HANZI.test(s);

/** 설명에서 예문 분리: '예문:'(또는 '예:') 뒤를 예문으로. 표시가 없으면 example=null (지어내지 않는다) */
export const splitNoteExample = (note: string): { meaning: string; example: string | null } => {
  const m = /(?:^|[\s.。)])(예문|예)\s*[:：]\s*/u.exec(note);
  if (!m) return { meaning: note.trim(), example: null };
  // 앞의 구분 문자(마침표·괄호)는 설명 쪽에 남긴다
  const lead = /^[.。)]/u.test(m[0]) ? 1 : 0;
  const meaning = note.slice(0, m.index + lead).trim();
  const example = note.slice(m.index + m[0].length).trim();
  return example ? { meaning: meaning || note.trim(), example } : { meaning: note.trim(), example: null };
};

/** 획순으로 보여 줄 한자 (중복 없이 앞에서부터 max개) */
export const hanziOf = (text: string, max = 4) => [...new Set(Array.from(text).filter((c) => HANZI.test(c)))].slice(0, max);

export type PatternSegment = { text: string; fixed: boolean };
export type GrammarPattern = { pattern: string; pieces: string[]; segments: PatternSegment[] };

const QUOTED = /[‘'“"「『]([^’'”"」』\n]{1,30})[’'”"」』]/gu;
const SLOT = /…+|\.{2,}|[~～〜]|（…）|\(…\)/u;

/**
 * 문형 찾기: 설명 속 따옴표로 표시된 중국어 문형(예: '如果…的话', '不是没有…')의 고정 부분이
 * 원문 문장에 순서대로 들어 있을 때만 문형으로 본다. 원문을 [고정 부분 · 채운 말]로 나눈다.
 * 문형 표시가 없거나 원문과 맞지 않으면 null (문장 성분을 추측하지 않는다).
 */
export const grammarPattern = (source: string, note: string): GrammarPattern | null => {
  const sentence = source.trim();
  if (!sentence || !hasHanzi(sentence)) return null;
  for (const m of note.matchAll(QUOTED)) {
    const pattern = m[1].trim();
    if (!hasHanzi(pattern)) continue;
    const pieces = pattern
      .split(new RegExp(SLOT.source, "gu"))
      .map((p) => p.replace(/\s+/g, "").trim())
      .filter((p) => hasHanzi(p));
    if (!pieces.length) continue;
    // 고정 부분이 원문에 순서대로 있는가
    const segments: PatternSegment[] = [];
    let from = 0;
    let ok = true;
    for (const piece of pieces) {
      const at = sentence.indexOf(piece, from);
      if (at < 0) {
        ok = false;
        break;
      }
      if (at > from) segments.push({ text: sentence.slice(from, at), fixed: false });
      segments.push({ text: piece, fixed: true });
      from = at + piece.length;
    }
    if (!ok) continue;
    if (from < sentence.length) segments.push({ text: sentence.slice(from), fixed: false });
    // 문장 전체가 문형 그대로면(채운 말 없음) 구조를 보여 줄 것이 없다
    if (!segments.some((s) => !s.fixed && s.text.trim())) continue;
    return { pattern, pieces, segments };
  }
  return null;
};

export type TextSegment = { text: string; mark: boolean };

/** 대사 속 핵심 표현 강조: 강의의 표현 원문이 대사에 그대로 들어 있을 때만 표시 (긴 표현 우선, 겹치지 않게) */
export const markPhrases = (line: string, phrases: string[]): TextSegment[] => {
  const list = [...new Set(phrases.map((p) => p.trim()).filter((p) => p.length >= 2 && hasHanzi(p)))].sort((a, b) => b.length - a.length);
  const marks: [number, number][] = [];
  for (const p of list) {
    let at = line.indexOf(p);
    while (at >= 0) {
      const end = at + p.length;
      if (!marks.some(([s, e]) => at < e && end > s)) marks.push([at, end]);
      at = line.indexOf(p, end);
    }
  }
  if (!marks.length) return [{ text: line, mark: false }];
  marks.sort((a, b) => a[0] - b[0]);
  const out: TextSegment[] = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s > pos) out.push({ text: line.slice(pos, s), mark: false });
    out.push({ text: line.slice(s, e), mark: true });
    pos = e;
  }
  if (pos < line.length) out.push({ text: line.slice(pos), mark: false });
  return out;
};

/** 문화렌즈 본문을 단계(문단)로 — 빈 줄 제거. 문단이 하나뿐이면 단계 시각화 대신 정적 표시 */
export const cultureSteps = (text: string) =>
  text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

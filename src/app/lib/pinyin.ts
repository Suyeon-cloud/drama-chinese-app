// 한자 → 성조 부호 한어병음 (pinyin-pro, 규칙·사전 기반). 사람이 입력한 병음이 있으면 그것을 먼저 쓰고,
// 없을 때만 이 변환값을 보여준다. 사전이 크므로 필요할 때 한 번만 불러온다(코드 분할).
//
// - 단어 단위로 음절을 붙여 쓰고(例: zěnme), 단어 사이는 띄어 쓴다.
// - 중국어 문장부호는 영문 부호로 바꿔 앞 단어에 붙인다. (대소문자는 pinyin-pro 결과 그대로 — 소문자)
// - 자동 변환은 다음자(多音字)를 틀릴 수 있으므로 핵심 표현은 교수자가 확인·수정할 수 있게 한다.

import { useEffect, useState } from "react";

type PinyinModule = typeof import("pinyin-pro");

let mod: PinyinModule | null = null;
let loading: Promise<PinyinModule> | null = null;
const listeners = new Set<() => void>();
const cache = new Map<string, string>();

const HAN = /\p{Script=Han}/u;
const HAN_RUNS = /\p{Script=Han}+/gu;

export const hasHan = (text: string | undefined | null) => !!text && HAN.test(text);

/** 문장 속 한자 부분만 (한국어 설명 안의 중국어 표현 등) */
export const hanOnly = (text: string) => (text.match(HAN_RUNS) ?? []).join(" ");

export const loadPinyin = (): Promise<PinyinModule> => {
  if (mod) return Promise.resolve(mod);
  loading ??= import("pinyin-pro")
    .then((m) => {
      mod = m;
      listeners.forEach((l) => l());
      return m;
    })
    .catch((err: unknown) => {
      loading = null; // 다음에 다시 시도
      throw err;
    });
  return loading;
};

/** 병음 사전이 준비되면 다시 그리도록 한다. (준비 전에는 자동 병음이 빈 문자열) */
export const usePinyinReady = () => {
  const [ready, setReady] = useState(mod !== null);
  useEffect(() => {
    if (mod) return;
    const onReady = () => setReady(true);
    listeners.add(onReady);
    void loadPinyin().catch(() => undefined);
    return () => {
      listeners.delete(onReady);
    };
  }, []);
  return ready;
};

const PUNCT: Record<string, string> = {
  "，": ",",
  "。": ".",
  "！": "!",
  "？": "?",
  "：": ":",
  "；": ";",
  "、": ",",
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
  "（": "(",
  "）": ")",
  "～": "~",
};
const ATTACH_LEFT = /^[,.!?:;)~…]/;

/** 한자가 포함된 문장 → 성조 부호 병음. 사전 준비 전이거나 한자가 없으면 "" */
export const toPinyin = (text: string | undefined | null): string => {
  const t = (text ?? "").trim();
  if (!mod || !hasHan(t)) return "";
  const hit = cache.get(t);
  if (hit !== undefined) return hit;

  const words = mod.segment(t, { format: mod.OutputFormat.AllArray, toneType: "symbol" });
  let out = "";
  for (const word of words) {
    const isHan = word.some((c) => HAN.test(c.origin));
    const piece = (isHan ? word.map((c) => c.result) : word.map((c) => PUNCT[c.origin] ?? c.origin)).join("").trim();
    if (!piece) continue;
    if (!isHan && ATTACH_LEFT.test(piece)) out += piece;
    else out += (out && !/[("'\s]$/.test(out) ? " " : "") + piece;
  }
  const result = out.replace(/\s+/g, " ").trim();
  cache.set(t, result);
  return result;
};

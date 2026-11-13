// 중국어 표시 도우미: 중국어 글에 lang="zh-CN"을 붙여 중국어 글꼴·줄바꿈으로 보여 준다.
// 한국어 설명·병음은 그대로 두고, 한국어 문장 속 한자 구간에만 중국어 글꼴을 쓴다. (복습 HTML과 같은 규칙)
import React from "react";

export const ZH_LANG = "zh-CN";

/** 중국어 글이면 lang 값, 아니면 undefined (방향에 따라 원문·목표 언어가 바뀌는 자리에서 쓴다) */
export const zhLang = (isChinese: boolean) => (isChinese ? ZH_LANG : undefined);

/** 한자(구두점 포함) 구간 */
const HAN_RUN = /[\u3000-\u303f\uff01-\uff5e]*[\u3400-\u9fff\uf900-\ufaff][\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff01-\uff5e]*/g;

/** 한국어 문장 속 한자 구간에만 lang="zh-CN" (글자는 그대로) */
export const MixedText: React.FC<{ text: string }> = ({ text }) => {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HAN_RUN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <span key={i} className="hz" lang={ZH_LANG}>
        {m[0]}
      </span>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
};

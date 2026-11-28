// 4단계 학습 영역별 교육용 모션그래픽: VocabReveal · StrokeOrder · SentenceBuilder · SpeechBubble · KineticText · CultureInfographic
// - 모두 강의 데이터(원문·병음·설명·문화렌즈·회화 역할)만 쓴다. 규칙(content/learningMotion)에 맞는 데이터가 없으면
//   부르는 쪽이 기존 정적 표시를 쓰거나, 컴포넌트가 단계 없이 그대로 보여 준다.
// - 단계 재생은 MotionStage(재생·일시정지·다시보기·모두 보기·키보드·보일 때 시작), 모션 끄기·움직임 줄이기면 정적.
import React, { useEffect, useRef, useState } from "react";
import { grammarPattern, hanziOf, markPhrases, splitNoteExample, type GrammarPattern } from "../../content/learningMotion";
import { MixedText } from "../components/Zh";
import { MotionStage, announceLearningMotion, enterAnimation, useLearningMotionStart, useMotionEnabled } from "./MotionStage";

/** 학습자 직접 재생의 단계 간격 (ms): 앞 단계를 충분히 읽을 수 있게 글자 수에 따라 늘린다 */
const readingGap = (text: string, min: number, max = 4200) => Math.min(max, Math.max(min, 900 + text.length * 45));

/* ───────── VocabReveal: 한자 → 병음 → 뜻 → 예문 ───────── */
export const VocabReveal: React.FC<{
  source: string;
  pinyin: string;
  note: string;
  /** 원문이 중국어인가 (zh-ko). 아니면 원문은 한국어, 병음·획순은 쓰지 않는다 */
  zhSource: boolean;
  motion: boolean;
  big?: boolean;
  kindLabel?: string;
  /** 학습자 화면: 재생 버튼을 누를 때만 순차 등장 (발표모드는 자동) */
  manual?: boolean;
}> = ({ source, pinyin, note, zhSource, motion, big = false, kindLabel, manual = false }) => {
  const { meaning, example } = splitNoteExample(note);
  const [stroke, setStroke] = useState(false);
  const chars = zhSource ? hanziOf(source) : [];
  const steps: React.ReactNode[] = [
    <div key="h" className="vr-head">
      {kindLabel ? <span className="vr-kind">{kindLabel}</span> : null}
      <b className="vr-hanzi" lang={zhSource ? "zh-CN" : undefined}>
        {source}
      </b>
      {chars.length ? (
        <button type="button" className="vr-stroke-btn" aria-pressed={stroke} onMouseDown={(e) => e.preventDefault()} onClick={() => setStroke((v) => !v)}>
          ✍️ 획순
        </button>
      ) : null}
    </div>,
  ];
  // 단계별 읽을 글자 (직접 재생 간격 계산용): 표현 → 병음 → 의미 → 예문
  const texts = [source];
  if (pinyin) {
    steps.push(<span key="p" className="vr-pinyin" lang="zh-Latn-pinyin">{pinyin}</span>);
    texts.push(pinyin);
  }
  if (meaning) {
    texts.push(meaning);
    steps.push(
      <span key="m" className="vr-meaning">
        <MixedText text={meaning} />
      </span>,
    );
  }
  if (example) {
    texts.push(example);
    steps.push(
      <span key="e" className="vr-example">
        <span className="vr-tag">예문</span> <MixedText text={example} />
      </span>,
    );
  }
  return (
    <div className={`vocab-reveal ${big ? "is-big" : ""}`}>
      <MotionStage
        enabled={motion}
        manual={manual}
        resetKey={source}
        label={`표현 ${source}`}
        kind="rise"
        interval={manual ? (next) => readingGap(texts[next - 1] ?? "", 1300) : big ? 750 : 450}
        steps={steps}
      />
      {stroke && chars.length ? <StrokeOrder chars={chars} /> : null}
    </div>
  );
};

/* ───────── StrokeOrder: hanzi-writer (필요할 때만 불러옴). 데이터 실패 시 글자만 ───────── */
// 글자 획 데이터: hanzi-writer-data(Arphic Public License)를 jsDelivr에서 글자별로 받는다 (버전 고정). 외부 요청은 이 버튼을 눌렀을 때만.
const CHAR_DATA_URL = (c: string) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(c)}.json`;

type StrokeWriter = {
  animateCharacter: (o?: { onComplete?: (r: { canceled: boolean }) => void }) => unknown;
  showCharacter: (o?: { duration?: number }) => unknown;
  pauseAnimation: () => unknown;
};

export const StrokeOrder: React.FC<{ chars: string[]; size?: number }> = ({ chars, size = 96 }) => {
  const motion = useMotionEnabled();
  const hostRefs = useRef<(HTMLDivElement | null)[]>([]);
  const writers = useRef<StrokeWriter[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const charsKey = chars.join("");
  // 획순은 학습자가 직접 여는 학습 모션: 다른 카드 모션과 동시에 움직이지 않고, 학습 화면 영상은 일시정지한다.
  const owner = useRef({});
  const run = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  /** 한 글자씩 차례대로 그린다 (앞 글자를 다 그린 뒤 다음 글자) */
  const drawAll = () => {
    const id = ++run.current;
    window.clearTimeout(timer.current);
    announceLearningMotion(owner.current);
    const step = (i: number) => {
      const w = writers.current[i];
      if (!w || id !== run.current) return;
      void w.animateCharacter({
        onComplete: (r) => {
          if (!r?.canceled && id === run.current) timer.current = window.setTimeout(() => step(i + 1), 500);
        },
      });
    };
    step(0);
  };
  /** 진행 중인 차례 그리기를 끊는다 (다음 글자로 넘어가지 않게) */
  const cancelRun = () => {
    run.current++;
    window.clearTimeout(timer.current);
  };
  const stop = () => {
    cancelRun();
    writers.current.forEach((w) => {
      void w.pauseAnimation();
      void w.showCharacter({ duration: 0 });
    });
  };
  useLearningMotionStart((who) => {
    if (who !== owner.current && writers.current.length) stop();
  });
  useEffect(() => {
    let alive = true;
    setState("loading");
    writers.current = [];
    import("hanzi-writer")
      .then(({ default: HanziWriter }) => {
        if (!alive) return;
        let failed = false;
        chars.forEach((c, i) => {
          const el = hostRefs.current[i];
          if (!el) return;
          el.innerHTML = "";
          const w = HanziWriter.create(el, c, {
            width: size,
            height: size,
            padding: 6,
            showOutline: true,
            showCharacter: !motion,
            strokeColor: "#1f3550",
            outlineColor: "#dbe6f0",
            radicalColor: "#2f8fd6",
            strokeAnimationSpeed: 1,
            delayBetweenStrokes: 280,
            charDataLoader: (char, onLoad, onError) => {
              fetch(CHAR_DATA_URL(char))
                .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
                .then(onLoad, onError);
            },
            onLoadCharDataError: () => {
              failed = true;
              if (alive) setState("failed");
            },
            onLoadCharDataSuccess: () => {
              if (alive && !failed) setState("ready");
            },
          });
          writers.current[i] = w as unknown as StrokeWriter;
        });
        // 한 글자씩 차례대로 (움직임 줄이기면 완성된 글자만 보여 주고, '다시 그리기'를 누를 때만 움직인다)
        if (motion && alive) drawAll();
      })
      .catch(() => alive && setState("failed"));
    return () => {
      alive = false;
      cancelRun();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 글자가 같으면 다시 만들지 않는다 (charsKey)
  }, [charsKey, size, motion]);
  const replay = drawAll;
  return (
    <div className="stroke-order" role="group" aria-label={`획순: ${chars.join(" ")}`}>
      <div className="so-grid">
        {chars.map((c, i) => (
          <div key={c} className="so-cell" style={{ width: size, height: size }}>
            {state === "failed" ? (
              <span className="so-fallback" lang="zh-CN">
                {c}
              </span>
            ) : (
              <div
                ref={(el) => {
                  hostRefs.current[i] = el;
                }}
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>
      {state === "failed" ? (
        <small className="muted">획순 데이터를 불러오지 못해 글자만 보여 줘요.</small>
      ) : (
        <button type="button" className="link-btn" onMouseDown={(e) => e.preventDefault()} onClick={replay} disabled={state !== "ready"}>
          {state === "loading" ? "획순 불러오는 중…" : "↺ 다시 그리기"}
        </button>
      )}
    </div>
  );
};

/* ───────── SentenceBuilder: 문형 틀 → 장면 문장에 채우기 (설명에 표시된 문형이 원문에 있을 때만) ───────── */
/** reveal: 직접 재생에서 '장면 문장' 단계가 보일 때마다 늘어나는 값 (0이면 처음 화면이라 움직이지 않는다). 자동 재생은 undefined */
const Segment: React.FC<{ seg: { text: string; fixed: boolean }; delay: number; motion: boolean; reveal?: number }> = ({ seg, delay, motion, reveal }) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reveal === 0) return;
    if (motion && ref.current && !seg.fixed) enterAnimation(ref.current, delay, "slide");
  }, [motion, delay, seg.fixed, reveal]);
  return (
    <span ref={ref} className={`sb-seg ${seg.fixed ? "is-fixed" : "is-fill"}`}>
      {seg.text}
    </span>
  );
};

export const SentenceBuilder: React.FC<{ pattern: GrammarPattern; note: string; motion: boolean; big?: boolean; manual?: boolean }> = ({
  pattern,
  note,
  motion,
  big = false,
  manual = false,
}) => {
  const { meaning, example } = splitNoteExample(note);
  const slots = pattern.segments.filter((s) => !s.fixed).length;
  // 직접 재생: 문형 틀 → 장면 문장(채운 말이 들어온다) → 구성 요소 → 의미 → 예문, 앞 단계를 읽을 시간만큼 쉰다
  const [reveal, setReveal] = useState(0);
  const texts = [pattern.pattern, pattern.segments.map((s) => s.text).join(""), "", meaning, example ?? ""];
  return (
    <div className={`sentence-builder ${big ? "is-big" : ""}`}>
      <MotionStage
        enabled={motion}
        manual={manual}
        onStep={manual ? (n, from) => void (from < 2 && n >= 2 && setReveal((r) => r + 1)) : undefined}
        resetKey={pattern.pattern + pattern.segments.map((s) => s.text).join("")}
        label="문형 구조"
        interval={manual ? (next) => readingGap(texts[next - 1] ?? "", 1600) : big ? 1100 : 900}
        steps={[
          <div key="t" className="sb-row">
            <span className="sb-label">문형</span>
            <span className="sb-frame" lang="zh-CN">
              {pattern.segments.map((s, i) =>
                s.fixed ? (
                  <span key={i} className="sb-seg is-fixed">
                    {s.text}
                  </span>
                ) : (
                  <span key={i} className="sb-slot" aria-label="빈칸">
                    □
                  </span>
                ),
              )}
            </span>
          </div>,
          <div key="s" className="sb-row">
            <span className="sb-label">장면 문장</span>
            <span className="sb-frame" lang="zh-CN">
              {pattern.segments.map((s, i) => (
                <Segment key={i} seg={s} delay={i * 120} motion={motion} reveal={manual ? reveal : undefined} />
              ))}
            </span>
          </div>,
          <p key="l" className="sb-legend">
            <span className="sb-seg is-fixed">문형 고정 부분</span> <span className="sb-seg is-fill">채운 말 {slots}곳</span>
          </p>,
          meaning ? (
            <span key="m" className="vr-meaning">
              <MixedText text={meaning} />
            </span>
          ) : (
            <span key="m" />
          ),
          ...(example
            ? [
                <span key="e" className="vr-example">
                  <span className="vr-tag">예문</span> <MixedText text={example} />
                </span>,
              ]
            : []),
        ]}
      />
    </div>
  );
};

/** 문법 항목: 문형을 찾으면 SentenceBuilder, 아니면 VocabReveal (기존 원문·병음·설명 순서) */
export const GrammarReveal: React.FC<{
  source: string;
  pinyin: string;
  note: string;
  zhSource: boolean;
  motion: boolean;
  big?: boolean;
  kindLabel?: string;
  manual?: boolean;
}> = (p) => {
  const pattern = p.zhSource ? grammarPattern(p.source, p.note) : null;
  if (!pattern) return <VocabReveal {...p} />;
  return (
    <div className="grammar-reveal">
      <div className="vr-head">
        {p.kindLabel ? <span className="vr-kind">{p.kindLabel}</span> : null}
        <b className="vr-hanzi" lang="zh-CN">
          {p.source}
        </b>
      </div>
      {p.pinyin ? <span className="vr-pinyin">{p.pinyin}</span> : null}
      <SentenceBuilder pattern={pattern} note={p.note} motion={p.motion} big={p.big} manual={p.manual} />
    </div>
  );
};

/* ───────── KineticText · SpeechBubble: 대사 속 핵심 표현 강조 ───────── */
/** 대사에서 강의의 핵심 표현 원문과 똑같은 부분만 형광펜으로 강조한다 (없으면 일반 글자) */
export const KineticText: React.FC<{ text: string; phrases: string[]; motion: boolean; lang?: string; className?: string }> = ({
  text,
  phrases,
  motion,
  lang,
  className = "",
}) => {
  const segs = markPhrases(text, phrases);
  return (
    <span className={`kinetic-text ${motion ? "is-animated" : ""} ${className}`} lang={lang}>
      {segs.map((s, i) =>
        s.mark ? (
          <mark key={i} className="kt-mark" style={{ animationDelay: `${0.15 + i * 0.1}s` }}>
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </span>
  );
};

/** 말풍선: role(회화 역할)이 데이터에 있을 때만 이름표를 단다. side는 역할 순서로 번갈아 */
export const SpeechBubble: React.FC<{ role?: string; side?: "left" | "right"; children: React.ReactNode }> = ({ role, side = "left", children }) => (
  <div className={`speech-bubble is-${side}`}>
    {role ? <span className="sb-role">{role}</span> : null}
    <div className="sb-body">{children}</div>
  </div>
);

/* ───────── CultureInfographic: 장면 원문 → 문단별 단계 ───────── */
export const CultureInfographic: React.FC<{
  title: string;
  quote?: string;
  quoteLang?: string;
  paragraphs: string[];
  motion: boolean;
  big?: boolean;
  /** 학습자 화면: 재생 버튼을 누를 때만 순차 등장 (발표모드는 자동) */
  manual?: boolean;
}> = ({ title, quote, quoteLang, paragraphs, motion, big = false, manual = false }) => (
  <div className={`culture-info ${big ? "is-big" : ""}`}>
    <MotionStage
      enabled={motion}
      manual={manual}
      resetKey={title + paragraphs.length}
      label={`문화렌즈 ${title}`}
      kind="slide"
      interval={manual ? (next) => readingGap([...(quote ? [quote] : []), ...paragraphs][next - 1] ?? "", 1600, 5200) : big ? 1000 : 700}
      as="ol"
      stepClassName="ci-step"
      steps={[
        ...(quote
          ? [
              <div key="q" className="ci-quote">
                <span className="ci-badge">🎬 장면</span>
                <p lang={quoteLang}>“{quote}”</p>
              </div>,
            ]
          : []),
        ...paragraphs.map((p, i) => (
          <div key={i} className="ci-card">
            <span className="ci-num" aria-hidden>
              {i + 1}
            </span>
            <p>
              <MixedText text={p} />
            </p>
          </div>
        )),
      ]}
    />
  </div>
);

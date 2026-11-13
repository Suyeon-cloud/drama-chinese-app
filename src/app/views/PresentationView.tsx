import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { formatTime } from "../../content";
import {
  SECTION_LABEL,
  buildLessonDeck,
  deckToReviewHtml,
  deckToSlides,
  lineSlideAt,
  presentKeyOf,
  presentReducer,
  reviewIsStale,
  reviewTitle,
  sectionOf,
  sectionStarts,
  slideRange,
  type DeckDialogueInput,
  type LessonDeck,
  type Slide,
} from "../../content/lessonDeck";
import { htmlByteLength, materialHtmlProblem, materialShareHash } from "../../content/materialHtml";
import { lessonSubtitlePosition, resolveCaptionMask, resolveLessonContent } from "../../content/lessons";
import type { Lesson, LessonContent, MotionCue } from "../../content/types";
import { useToast } from "../components/Toast";
import { CaptionMaskBox } from "../learning/CaptionMask";
import { MotionOverlayLayer } from "../learning/MotionOverlayLayer";
import { SubtitleLayer } from "../learning/SubtitleLayer";
import { useFullscreen } from "../learning/useFullscreen";
import { useSegmentPlayback, useSimulatedClock, useYouTubeClock, type VideoClock } from "../learning/useVideoClock";
import { ApiError } from "../lib/api";
import { resolveDialogueLine, studentDialogues } from "../lib/dialogues";
import { toPinyin, usePinyinReady } from "../lib/pinyin";
import { playbackCues } from "../lib/subtitles";
import { materialStore } from "../store";
import { useLessons } from "../store/hooks";
import type { WeekMaterial } from "../store/models";
import { HtmlMaterialFrame } from "./HtmlMaterialView";
import { navigate } from "../router";

/**
 * #/present?lesson={id} — 교수자 발표 모드 (5단계).
 * 같은 학습 데이터(LessonDeck)로 슬라이드를 만들고, 학습 화면의 YouTube 플레이어·자막 타임라인을 그대로 써서
 * 영상 재생과 슬라이드 이동을 함께 한다. 학생용 복습 HTML도 같은 덱에서 만들어 4단계 HTML 자료로 등록한다(자동 공개 없음).
 */
export const PresentationView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const lessons = useLessons();
  if (!lessons) return null;
  const lesson = lessons.find((l) => l.id === params.get("lesson"));
  if (!lesson) {
    return (
      <div className="page">
        <div className="card empty">
          <span>🎬</span>
          <p>발표할 강의자료를 찾을 수 없어요.</p>
          <button className="btn btn-soft btn-sm" onClick={() => window.history.back()}>
            돌아가기
          </button>
        </div>
      </div>
    );
  }
  return lesson.video.youtubeId ? <VideoPresenter key={lesson.id} lesson={lesson} /> : <TextPresenter key={lesson.id} lesson={lesson} />;
};

/** 영상이 있는 강의자료: 학습 화면과 같은 YouTube 시계 (재생할 수 없으면 시뮬레이션 시계로 바꿀 수 있다) */
const VideoPresenter: React.FC<{ lesson: Lesson }> = ({ lesson }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const yt = useYouTubeClock(hostRef, lesson.video.youtubeId, lesson.video.startTime);
  const [simMode, setSimMode] = useState(false);
  const sim = useSimulatedClock(lesson.video.startTime, simMode);
  const clock = simMode ? sim : yt;
  return <Presenter lesson={lesson} clock={clock} video={{ hostRef, error: yt.error, simMode, onSim: () => setSimMode(true) }} />;
};

/** 영상 없는(텍스트) 강의자료: 시계 없이 슬라이드만 */
const TextPresenter: React.FC<{ lesson: Lesson }> = ({ lesson }) => {
  const clock = useSimulatedClock(0, false);
  return <Presenter lesson={lesson} clock={clock} video={null} />;
};

type VideoSlot = { hostRef: React.RefObject<HTMLDivElement | null>; error: string | null; simMode: boolean; onSim: () => void };
type Layout = "split" | "slide" | "video";
const LAYOUT_LABEL: Record<Layout, string> = { split: "영상+슬라이드", slide: "슬라이드만", video: "영상 크게" };

/** 학습자료 → 덱 (학생 학습 화면과 같은 합본·자막·회화) */
const useLessonDeck = (lesson: Lesson): { deck: LessonDeck; content: LessonContent } => {
  const pinyinReady = usePinyinReady();
  return useMemo(() => {
    const py = pinyinReady ? toPinyin : undefined;
    const content = resolveLessonContent(lesson, py);
    const cues = playbackCues(lesson);
    const dialogues: DeckDialogueInput[] = studentDialogues(lesson.dialogues, cues).map((d) => ({
      id: d.id,
      title: d.title,
      situation: d.situation,
      lines: d.lines.map((line) => {
        const r = resolveDialogueLine(line, cues);
        return {
          role: d.roles.find((x) => x.id === r.roleId)?.name ?? "",
          zh: r.zh,
          pinyin: r.pinyin || (r.zh && py ? py(r.zh) : ""),
          ko: r.ko ?? "",
          start: r.start,
          end: r.end,
        };
      }),
    }));
    return { deck: buildLessonDeck({ lesson, content, cues, dialogues, pinyinOf: py }), content };
  }, [lesson, pinyinReady]);
};

/** 버튼이 포커스를 가져가지 않게 (Space·Enter가 버튼 클릭과 겹치지 않도록) */
const noFocus = (e: React.MouseEvent) => e.preventDefault();

const Presenter: React.FC<{ lesson: Lesson; clock: VideoClock; video: VideoSlot | null }> = ({ lesson, clock, video }) => {
  const { deck, content } = useLessonDeck(lesson);
  // 모션그래픽: 학습 화면과 같은 MotionCue(번들 + 교수자 초안 cue)와 같은 영상 시계로 MotionOverlayLayer를 그린다
  const motionCues = useMemo(() => content.cues.filter((c): c is MotionCue => c.kind === "motion"), [content]);
  const [showMotion, setShowMotion] = useState(true);
  const slides = useMemo(() => deckToSlides(deck), [deck]);
  const reducer = useMemo(() => presentReducer(slides.length), [slides.length]);
  const [state, dispatch] = useReducer(reducer, { index: 0, revealed: [] });
  const slide = slides[Math.min(state.index, slides.length - 1)];
  const sections = useMemo(() => sectionStarts(slides), [slides]);
  const currentSection = sectionOf(sections, state.index);
  const [showPinyin, setShowPinyin] = useState(true);
  const [showKo, setShowKo] = useState(true);
  // 자막 따라가기는 기본 꺼짐: 교수자가 S·버튼으로 켤 때만 재생 시점에 맞춰 대사 슬라이드로 옮긴다
  const [follow, setFollow] = useState(false);
  const [layout, setLayout] = useState<Layout>(video ? "split" : "slide");
  const [review, setReview] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useFullscreen(stageRef);
  const segment = useSegmentPlayback(clock);
  const cues = useMemo(() => playbackCues(lesson), [lesson]);

  // 슬라이드의 장면 재생: 대사는 그 구간만, 그 밖은 그 시점부터
  const playScene = useCallback(
    (s: Slide) => {
      const range = slideRange(s);
      if (!video || !range) return;
      if (range.end !== null && range.end > range.start) segment.play(range.start, range.end);
      else {
        clock.seekTo(Math.max(0, range.start - 1));
        clock.play();
      }
    },
    [video, segment, clock],
  );
  const togglePlay = useCallback(() => (clock.playing ? clock.pause() : clock.play()), [clock]);

  // 자막 따라가기: 재생 중 새 대사가 시작되면 그 대사 슬라이드로 (그 사이 교수자가 옮긴 슬라이드는 다음 대사까지 유지)
  const lastFollowed = useRef(-1);
  useEffect(() => {
    if (!follow || !clock.playing) return;
    const i = lineSlideAt(slides, clock.time);
    if (i >= 0 && i !== lastFollowed.current) {
      lastFollowed.current = i;
      dispatch({ type: "go", index: i });
    }
  }, [follow, clock.playing, clock.time, slides]);

  // 키보드: 입력칸·선택칸에서는 쓰지 않는다. YouTube iframe이 포커스를 가져가면 발표 화면으로 되돌린다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (review) return;
      const t = e.target as HTMLElement | null;
      const key = presentKeyOf({ key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, targetTag: t?.tagName, editable: !!t?.isContentEditable });
      if (!key) return;
      e.preventDefault();
      if (key === "next" || key === "prev" || key === "first" || key === "last") dispatch({ type: key });
      else if (key === "reveal") {
        if (slide.kind === "quiz") dispatch({ type: "reveal", key: slide.key });
      } else if (key === "toggle-play") {
        if (video) togglePlay();
      } else if (key === "play-scene") playScene(slide);
      else if (key === "fullscreen") void (stage.active ? stage.exit() : stage.enter());
      else if (key === "pinyin") setShowPinyin((x) => !x);
      else if (key === "korean") setShowKo((x) => !x);
      else if (key === "motion") setShowMotion((x) => !x);
      else if (key === "follow") setFollow((x) => !x);
      else if (key === "exit" && stage.active) void stage.exit();
      else if (key === "section") {
        const target = sections[Number(e.key) - 1];
        if (target) dispatch({ type: "go", index: target.index });
      }
    };
    const onBlur = () =>
      window.setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME" && stageRef.current?.contains(document.activeElement)) stageRef.current.focus();
      }, 0);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [review, slide, video, togglePlay, playScene, stage, sections]);

  const range = slideRange(slide);
  // 자막·패널: 학습 화면(DramaLearningView)과 같은 규칙 — 저장된 자막 가리기(captionMask)가 켜져 있으면 그 패널 안에,
  // 원문 줄은 교수자가 확보한 원문(또는 패널이 있을 때)만, 번역 줄은 있을 때만. K는 한국어 줄, P는 병음 줄을 켜고 끈다.
  const resolvedMask = resolveCaptionMask(lesson);
  const mask = resolvedMask?.enabled ? resolvedMask : null;
  const subLang = lesson.direction === "zh-ko" ? "ko" : "zh";
  const sourceLang = lesson.direction === "zh-ko" ? "zh" : "ko";
  const hasSubs = cues.some((c) => c[subLang]);
  const hasSourceSubs = (lesson.script.source !== "bundled" || !!mask) && cues.some((c) => c[sourceLang]);
  const subLangs = ([...(hasSourceSubs ? [sourceLang] : []), ...(hasSubs ? [subLang] : [])] as ("zh" | "ko")[]).filter((l) => l !== "ko" || showKo);
  const subLineCount = subLangs.length + (subLangs.includes("zh") && showPinyin ? 1 : 0);
  const showVideo = !!video && layout !== "slide";
  const showSlide = layout !== "video" || !video;

  return (
    <div className="page present-page">
      <div ref={stageRef} tabIndex={-1} className={`present-stage layout-${showVideo && showSlide ? "split" : showVideo ? "video" : "slide"} ${stage.active ? "is-fullscreen" : ""}`}>
        <div className="present-top">
          <div className="present-title">
            <b>{deck.week}주차 · {deck.heading}</b>
            <span className="muted small"> {slide.section} · {state.index + 1} / {slides.length}</span>
          </div>
          <div className="present-tools">
            {video ? (
              <button className="btn btn-soft btn-sm" onMouseDown={noFocus} onClick={() => setLayout(layout === "split" ? "slide" : layout === "slide" ? "video" : "split")}>
                {LAYOUT_LABEL[layout]}
              </button>
            ) : null}
            <button className={`btn btn-sm ${showPinyin ? "btn-primary" : "btn-soft"}`} onMouseDown={noFocus} onClick={() => setShowPinyin((x) => !x)} title="P">
              병음
            </button>
            <button className={`btn btn-sm ${showKo ? "btn-primary" : "btn-soft"}`} onMouseDown={noFocus} onClick={() => setShowKo((x) => !x)} title="K">
              한국어
            </button>
            {video && motionCues.length > 0 ? (
              <button className={`btn btn-sm ${showMotion ? "btn-primary" : "btn-soft"}`} onMouseDown={noFocus} onClick={() => setShowMotion((x) => !x)} title="M">
                모션
              </button>
            ) : null}
            {video ? (
              <button className={`btn btn-sm ${follow ? "btn-primary" : "btn-soft"}`} onMouseDown={noFocus} onClick={() => setFollow((x) => !x)} title="S">
                자막 따라가기
              </button>
            ) : null}
            {stage.supported ? (
              <button className="btn btn-soft btn-sm" onMouseDown={noFocus} onClick={() => void (stage.active ? stage.exit() : stage.enter())} title="F">
                {stage.active ? "전체 화면 끝" : "전체 화면"}
              </button>
            ) : null}
            <button
              className="btn btn-soft btn-sm"
              onMouseDown={noFocus}
              onClick={() => {
                void stage.exit();
                setReview(true);
              }}
            >
              복습 HTML
            </button>
            <button
              className="btn btn-soft btn-sm"
              onMouseDown={noFocus}
              onClick={() => {
                void stage.exit();
                navigate("live-host", { course: deck.courseId });
              }}
              title="저장한 실시간 퀴즈 문제 세트로 진행"
            >
              실시간 퀴즈
            </button>
            {!stage.active ? (
              <button className="btn btn-quiet btn-sm" onMouseDown={noFocus} onClick={() => window.history.back()}>
                나가기
              </button>
            ) : null}
          </div>
        </div>

        {sections.length > 1 ? (
          <nav className="present-sections" aria-label="섹션 이동">
            {sections.map((s, i) => (
              <button
                key={s.section}
                className={i === currentSection ? "is-active" : ""}
                onMouseDown={noFocus}
                onClick={() => dispatch({ type: "go", index: s.index })}
                title={`${i + 1}`}
              >
                {s.section}
                {s.count > 1 ? <small>{s.count}</small> : null}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="present-main">
          {video ? (
            <div className="present-video" hidden={!showVideo}>
              <div className={`video-frame present-frame ${video.simMode ? "sim" : ""}`}>
                <div ref={video.hostRef} className="yt-host" hidden={video.simMode} />
                {video.simMode ? (
                  <div className="sim-screen">
                    <span>🎬 시뮬레이션 모드</span>
                    <b>{formatTime(clock.time)}</b>
                    <small>영상 없이 시점·자막 연동만 확인해요.</small>
                  </div>
                ) : null}
                {!clock.ready && !video.error && !video.simMode ? <div className="video-loading">영상을 불러오는 중…</div> : null}
                {video.error && !video.simMode ? (
                  <div className="video-error">
                    <b>{video.error}</b>
                    <p>YouTube에서 직접 재생하거나, 시뮬레이션 모드로 슬라이드·자막 연동을 진행할 수 있어요.</p>
                    <div className="row">
                      <a className="btn btn-soft btn-sm" href={lesson.video.youtubeUrl} target="_blank" rel="noreferrer">
                        YouTube에서 보기
                      </a>
                      <button className="btn btn-primary btn-sm" onClick={video.onSim}>
                        시뮬레이션 모드
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="overlay-layer" data-sub-position={lessonSubtitlePosition(lesson)}>
                  {showMotion ? <MotionOverlayLayer cues={motionCues} time={clock.time} playing={clock.playing} /> : null}
                  {mask ? (
                    <CaptionMaskBox mask={mask} lines={subLineCount}>
                      {subLangs.length > 0 ? <SubtitleLayer cues={cues} time={clock.time} langs={subLangs} pinyin={showPinyin} inMask /> : null}
                    </CaptionMaskBox>
                  ) : subLangs.length > 0 ? (
                    <SubtitleLayer cues={cues} time={clock.time} langs={subLangs} pinyin={showPinyin} />
                  ) : null}
                </div>
              </div>
              <div className="present-video-bar">
                <button className="btn btn-primary btn-sm" onMouseDown={noFocus} disabled={!clock.ready} onClick={togglePlay} title="Space">
                  {clock.playing ? "⏸ 일시정지" : "▶ 재생"}
                </button>
                <button className="btn btn-soft btn-sm" onMouseDown={noFocus} disabled={!clock.ready} onClick={() => clock.seekTo(Math.max(0, clock.time - 5))}>
                  −5초
                </button>
                <button className="btn btn-soft btn-sm" onMouseDown={noFocus} disabled={!clock.ready} onClick={() => clock.seekTo(clock.time + 5)}>
                  +5초
                </button>
                <button className="btn btn-soft btn-sm" onMouseDown={noFocus} disabled={!clock.ready || !range} onClick={() => playScene(slide)} title="Enter">
                  ▶ 이 장면
                </button>
                <span className="muted small">
                  {formatTime(clock.time)}
                  {clock.duration > 0 ? ` / ${formatTime(clock.duration)}` : ""}
                </span>
              </div>
            </div>
          ) : null}
          {showSlide ? (
            <div className="present-slide" aria-live="polite">
              <SlideBody slide={slide} deck={deck} showPinyin={showPinyin} showKo={showKo} revealed={state.revealed.includes(slide.key)} />
              {slide.kind === "quiz" ? (
                <button className="btn btn-soft btn-sm present-reveal" onMouseDown={noFocus} onClick={() => dispatch({ type: "reveal", key: slide.key })} title="A">
                  {state.revealed.includes(slide.key) ? "정답 가리기" : "정답·해설 공개"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="present-bottom">
          <button className="btn btn-soft btn-sm" onMouseDown={noFocus} disabled={state.index === 0} onClick={() => dispatch({ type: "prev" })}>
            ← 이전
          </button>
          <div className="present-progress" aria-hidden>
            <span style={{ width: `${((state.index + 1) / slides.length) * 100}%` }} />
          </div>
          <button className="btn btn-primary btn-sm" onMouseDown={noFocus} disabled={state.index >= slides.length - 1} onClick={() => dispatch({ type: "next" })}>
            다음 →
          </button>
        </div>
        <p className="present-keys muted small">
          → PageDown 다음 · ← PageUp 이전 · 1~{Math.min(9, sections.length)} 섹션 · Space 재생/정지 · Enter 이 장면 · A 정답 · P 병음 · K 한국어 · M 모션 · S 자막 따라가기 · F 전체 화면
        </p>
      </div>
      {review ? <ReviewPanel deck={deck} onClose={() => setReview(false)} /> : null}
    </div>
  );
};

const PinyinLine: React.FC<{ show: boolean; text: string }> = ({ show, text }) => (show && text ? <div className="present-py">{text}</div> : null);

/** 슬라이드 한 장 (큰 글씨) */
const SlideBody: React.FC<{ slide: Slide; deck: LessonDeck; showPinyin: boolean; showKo: boolean; revealed: boolean }> = ({ slide, deck, showPinyin, showKo, revealed }) => {
  switch (slide.kind) {
    case "title":
      return (
        <div className="present-card is-title">
          <div className="present-section">{deck.week}주차</div>
          <h1 className="present-h1">{deck.heading}</h1>
          {deck.heading !== deck.title ? <p className="present-sub">{deck.title}</p> : null}
          {deck.description ? <p className="present-sub">{deck.description}</p> : null}
          <p className="muted small">
            장면 대사 {deck.lines.length} · 표현·문법 {deck.points.filter((p) => p.kind !== "summary").length} · 문화 {deck.culture.length} · 퀴즈 {deck.quiz.length}
          </p>
        </div>
      );
    case "line":
      return (
        <div className="present-card">
          <div className="present-section">
            {SECTION_LABEL.line} {slide.index + 1}/{slide.total} · {formatTime(slide.line.start)}
          </div>
          {slide.line.zh ? <div className="present-zh" lang="zh-CN">{slide.line.zh}</div> : null}
          <PinyinLine show={showPinyin} text={slide.line.pinyin} />
          {showKo && slide.line.ko ? <div className="present-ko">{slide.line.ko}</div> : null}
        </div>
      );
    case "point":
      return (
        <div className="present-card">
          <div className="present-section">
            {slide.section}
            {slide.point.at !== null ? ` · ${formatTime(slide.point.at)}` : ""}
          </div>
          <div className="present-zh" lang={deck.direction === "zh-ko" ? "zh-CN" : undefined}>{slide.point.text}</div>
          <PinyinLine show={showPinyin} text={slide.point.pinyin} />
          {showKo && slide.point.note ? <div className="present-ko">{slide.point.note}</div> : null}
        </div>
      );
    case "culture":
      return (
        <div className="present-card">
          <div className="present-section">{SECTION_LABEL.culture}</div>
          <h2 className="present-h2">{slide.culture.title}</h2>
          {slide.culture.subtitle ? <p className="present-sub">{slide.culture.subtitle}</p> : null}
          {slide.culture.paragraphs.map((p, i) => (
            <p key={i} className="present-text">
              {p}
            </p>
          ))}
        </div>
      );
    case "dialogue":
      return (
        <div className="present-card">
          <div className="present-section">{SECTION_LABEL.dialogue}</div>
          <h2 className="present-h2">{slide.dialogue.title || "회화 연습"}</h2>
          {slide.dialogue.situation ? <p className="present-sub">{slide.dialogue.situation}</p> : null}
          <ol className="present-dialogue">
            {slide.dialogue.lines.map((l, i) => (
              <li key={i}>
                {l.role ? <b className="present-role">{l.role}</b> : null}
                <span className="present-text" lang="zh-CN">{l.zh}</span>
                {showPinyin && l.pinyin ? <span className="present-py"> {l.pinyin}</span> : null}
                {showKo && l.ko ? <div className="muted">{l.ko}</div> : null}
              </li>
            ))}
          </ol>
        </div>
      );
    case "quiz":
      return (
        <div className="present-card">
          <div className="present-section">
            {SECTION_LABEL.quiz} {slide.index + 1}/{slide.total}
          </div>
          <h2 className="present-h2">{slide.quiz.question}</h2>
          <ol className="present-options">
            {slide.quiz.options.map((o, i) => (
              <li key={i} className={revealed && i === slide.quiz.answer ? "is-answer" : ""}>
                {o}
                {revealed && i === slide.quiz.answer ? " ✓" : ""}
              </li>
            ))}
          </ol>
          {revealed && slide.quiz.explanation ? <p className="present-text present-explain">{slide.quiz.explanation}</p> : null}
        </div>
      );
    case "end":
      return (
        <div className="present-card is-title">
          <h1 className="present-h1">수고했어요!</h1>
          <p className="present-sub">학생용 복습 자료는 ‘복습 HTML’에서 만들어 주차 자료로 등록할 수 있어요.</p>
        </div>
      );
  }
};

/**
 * 학생용 복습 HTML: 생성 → 미리보기 → 4단계 HTML 자료로 등록 (공개·공유는 주차 자료 화면에서).
 * 5-B: 이 강의에서 만든 복습 자료가 이미 있으면(출처 연결) 새로 등록하지 않고, 교수자가 확인한 뒤 그 자료를 다시 만들어 업데이트한다.
 *      자료 id·공유 링크·공개 상태는 그대로. 원본 강의가 바뀌었으면 표시만 하고 자동으로 다시 만들지 않는다.
 */
const ReviewPanel: React.FC<{ deck: LessonDeck; onClose: () => void }> = ({ deck, onClose }) => {
  const toast = useToast();
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [title, setTitle] = useState(reviewTitle(deck));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<WeekMaterial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [htmlList, setHtmlList] = useState<WeekMaterial[] | null>(null);
  const html = useMemo(() => deckToReviewHtml(deck, { includeAnswers }), [deck, includeAnswers]);
  const problem = materialHtmlProblem(html);
  const reload = useCallback(
    () =>
      materialStore
        .list(deck.courseId)
        .then((list) => setHtmlList(list.filter((m) => m.kind === "html")))
        .catch(() => setHtmlList([])),
    [deck.courseId],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  // 이 강의에서 만든 복습 자료 (출처 연결). 원본이 지워진 자료(lessonId null)는 여기 나오지 않는다.
  const linked = htmlList?.find((m) => m.source?.lessonId === deck.lessonId) ?? null;
  const stale = !!linked && reviewIsStale(deck.sourceUpdatedAt, linked.source?.lessonUpdatedAt);
  // 같은 주차의 '[복습]' 제목 일반 HTML (5-A로 등록한 자료 등) — 자동으로 연결·삭제하지 않고 안내만
  const reviewLike = htmlList?.filter((m) => !m.source && m.week === deck.week && m.title.trim().startsWith("[복습]")) ?? [];

  const register = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const m = await materialStore.createHtml(deck.courseId, {
        week: deck.week,
        title: title.trim(),
        description: `${deck.heading} 학습자료에서 자동 생성한 복습 자료`.slice(0, 500),
        status: "draft",
        html,
        source: { kind: "lesson-review", lessonId: deck.lessonId, lessonUpdatedAt: deck.sourceUpdatedAt },
      });
      setSaved(m);
      toast.show("복습 HTML을 비공개로 등록했어요. 주차별 추가 자료에서 확인한 뒤 공개해 주세요.", "success");
      void reload();
    } catch (err) {
      const existingId = err instanceof ApiError ? (err.data as { existingId?: string } | null)?.existingId : undefined;
      if (existingId) {
        // 다른 교수자가 먼저 등록한 경우 등: 새로 만들지 않고 그 자료를 업데이트하는 흐름으로
        setNotice("이 강의의 복습 자료가 이미 있어요. 아래에서 다시 만들어 업데이트할 수 있어요.");
        void reload();
      } else {
        setError(err instanceof ApiError ? err.message : "복습 HTML을 등록하지 못했어요.");
      }
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (target: WeekMaterial) => {
    const keep =
      target.status === "published"
        ? "‘공개’ 상태가 그대로 유지되어, 저장하는 즉시 학생에게 새 내용이 보여요."
        : "‘비공개’ 상태가 그대로 유지돼요.";
    const ok = window.confirm(
      `‘${target.title}’ 자료를 지금 만든 내용으로 바꿉니다.\n자료 주소(공유 링크)는 바뀌지 않고, ${keep}\n제목·설명·주차는 그대로예요.\n\n계속할까요?`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const m = await materialStore.update(target.id, { html, sourceLessonUpdatedAt: deck.sourceUpdatedAt });
      setSaved(m);
      toast.show(target.status === "published" ? "복습 자료를 업데이트했어요. (공개 유지)" : "복습 자료를 업데이트했어요. (비공개 유지)", "success");
      void reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "복습 자료를 업데이트하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card present-review" aria-label="학생용 복습 HTML 만들기">
      <div className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 className="section-title">📘 학생용 복습 HTML</h2>
        <button className="btn btn-soft btn-sm" onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="muted small">
        발표에 쓴 학습 데이터로 복습 문서를 만들어요. 원본 학습자료를 고쳐도 이미 등록한 HTML은 저절로 바뀌지 않아요. 이 강의의 복습 자료는 하나만
        두고, 필요할 때 다시 만들어 업데이트해요. 공개·공유·다운로드는 주차별 추가 자료에서 해요.
      </p>

      {linked ? (
        <div className="study-note notice" role="status">
          이 강의의 복습 자료가 있어요: <b>{linked.title}</b> ({linked.week}주차 · {linked.status === "published" ? "공개" : "비공개"})
          {stale ? (
            <span className="pill pill-cream" style={{ marginLeft: 6 }}>
              원본이 수정됐어요 · 다시 만들기 권장
            </span>
          ) : (
            <span className="muted"> · 원본과 같은 내용으로 만든 자료예요</span>
          )}
        </div>
      ) : null}

      <div className="form-grid">
        <label className="field span-2">
          <span>자료 제목</span>
          <input
            value={linked ? linked.title : title}
            maxLength={100}
            disabled={busy || !!linked}
            onChange={(e) => setTitle(e.target.value)}
          />
          {linked ? <small className="muted">업데이트할 때 기존 자료의 제목·설명·주차는 그대로 둬요.</small> : null}
        </label>
        <label className="field-check span-2">
          <input type="checkbox" checked={includeAnswers} disabled={busy} onChange={(e) => setIncludeAnswers(e.target.checked)} />
          <span>퀴즈 정답·해설 포함 (기본: 포함하지 않음 — 학생은 문제만 봐요)</span>
        </label>
      </div>
      <p className="muted small">
        {(htmlByteLength(html) / 1024).toFixed(1)}KB · {deck.week}주차 · 퀴즈 {deck.quiz.length}문제 {includeAnswers ? "(정답 포함)" : "(정답 제외)"}
      </p>
      {!linked && reviewLike.length > 0 ? (
        <p className="field-error small" role="status">
          {deck.week}주차에 ‘[복습]’ 제목의 HTML 자료가 {reviewLike.length}개 있어요. 이 자료들은 강의와 연결되지 않은 일반 자료라 자동으로 바꾸거나
          지우지 않아요. 새로 등록하면 연결된 복습 자료가 하나 더 생기니, 필요하면 기존 자료는 주차별 추가 자료에서 정리해 주세요.
        </p>
      ) : null}
      {notice ? (
        <p className="small" role="status">
          {notice}
        </p>
      ) : null}
      {problem ? (
        <p className="field-error small" role="alert">
          {problem}
        </p>
      ) : null}
      {error ? (
        <p className="field-error small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-start">
        {htmlList === null ? (
          <span className="muted small">기존 자료를 확인하는 중…</span>
        ) : linked ? (
          <button className="btn btn-primary btn-sm" disabled={busy || !!problem} onClick={() => void regenerate(linked)}>
            {busy ? "업데이트 중…" : "다시 만들어 업데이트"}
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={busy || !!problem || !title.trim()} onClick={() => void register()}>
            {busy ? "등록 중…" : "주차 자료로 등록 (비공개)"}
          </button>
        )}
        {saved ? (
          <a className="btn btn-soft btn-sm" href={materialShareHash(saved.id)}>
            자료 열기
          </a>
        ) : null}
      </div>
      <HtmlMaterialFrame title={(linked ? linked.title : title) || "복습 자료"} html={html} height="60vh" expandable />
    </section>
  );
};

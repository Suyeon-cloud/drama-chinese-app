import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "../../content";
import { cultureTopics } from "../../content/culture";
import { DIRECTION_LABEL } from "../../content/course";
import { lessonHeading, resolveLessonContent } from "../../content/lessons";
import { getLevel } from "../../content/levels";
import type { CultureLensCue, Lesson, MotionCue } from "../../content/types";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { CaptionMaskBox } from "../learning/CaptionMask";
import { CultureLensLayer } from "../learning/CultureLensLayer";
import { LessonStudyPanel, TYPE_LABEL, type StudyTab } from "../learning/LessonStudyPanel";
import { MotionOverlayLayer } from "../learning/MotionOverlayLayer";
import { QuizCard } from "../learning/QuizCard";
import { SubtitleLayer } from "../learning/SubtitleLayer";
import { useFullscreen } from "../learning/useFullscreen";
import { useLessonProgress } from "../learning/useLessonProgress";
import { useSimulatedClock, useYouTubeClock } from "../learning/useVideoClock";
import { navigate } from "../router";
import { useLessons } from "../store/hooks";
import { isPlainSynced, playbackCues } from "../lib/subtitles";
import { toPinyin, usePinyinReady } from "../lib/pinyin";
import { TextLessonView } from "./TextLessonView";

/** ?lesson=ID → ?ep=에피소드ID(1차 판본 링크) → 공개된 첫 강의자료 */
const pickLesson = (lessons: Lesson[], params: URLSearchParams): Lesson | null => {
  const id = params.get("lesson");
  if (id) return lessons.find((l) => l.id === id) ?? null;
  const ep = params.get("ep");
  const published = lessons.filter((l) => l.status === "published");
  if (ep) return published.find((l) => l.episodeId === ep) ?? null;
  return published[0] ?? null;
};

export const DramaLearningView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const lessons = useLessons();
  const { user } = useAuth();
  if (!lessons) return null;
  const lesson = pickLesson(lessons, params);
  const canPreview = user?.role === "instructor";

  if (!lesson || (lesson.status !== "published" && !canPreview)) {
    return (
      <div className="page">
        <div className="card empty">
          <span>🎬</span>
          <p>{lesson ? "아직 공개되지 않은 강의자료예요." : "강의자료를 찾을 수 없어요."}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-soft btn-sm" onClick={() => navigate("weeks")}>
              내 강의로
            </button>
          </div>
        </div>
      </div>
    );
  }
  // 영상이 아직 없는 주차는 대본·표현·퀴즈로 학습한다.
  if (!lesson.video.youtubeId) return <TextLessonView lesson={lesson} />;
  return <LessonPlayer key={lesson.id} lesson={lesson} params={params} />;
};

const LessonPlayer: React.FC<{ lesson: Lesson; params: URLSearchParams }> = ({ lesson, params }) => {
  const { user } = useAuth();
  // 병음 사전이 준비되면 교수자 표현 모션그래픽에도 자동 병음을 넣는다. (입력한 병음이 있으면 그것을 사용)
  const pinyinReady = usePinyinReady();
  const content = useMemo(
    () => resolveLessonContent(lesson, pinyinReady ? toPinyin : undefined),
    [lesson, pinyinReady],
  );
  // 저장된 자막 + 시간 동기화를 마친 원문 텍스트
  const script = useMemo(() => playbackCues(lesson), [lesson]);
  const seekParam = Number(params.get("t"));
  const initialTime = Number.isFinite(seekParam) && seekParam > 0 ? seekParam : lesson.video.startTime;

  const hostRef = useRef<HTMLDivElement>(null);
  const yt = useYouTubeClock(hostRef, lesson.video.youtubeId, initialTime);
  const [simMode, setSimMode] = useState(false);
  const sim = useSimulatedClock(initialTime, simMode);
  const clock = simMode ? sim : yt;
  // 학습 구간 끝을 비워 둔 강의자료(짧은 클립)는 영상 끝까지 학습한다. 길이를 알기 전에는 끝나지 않는다.
  const hasEnd = lesson.video.endTime > lesson.video.startTime;
  const endTime = hasEnd ? lesson.video.endTime : yt.duration > 0 ? yt.duration - 0.5 : Infinity;
  const video = useMemo(() => ({ ...lesson.video, endTime }), [lesson.video, endTime]);
  const endLabel = Number.isFinite(endTime) ? formatTime(endTime) : "영상 끝";

  // 학습 기록: 학습자 계정 + 실제 영상 재생일 때만
  const recordFor = user?.role === "learner" && !simMode ? user.id : null;
  const { progress, markCompleted, recordQuiz } = useLessonProgress(lesson, clock, recordFor, endTime);

  const [completed, setCompleted] = useState(false);
  const [showSubs, setShowSubs] = useState(true);
  const [tab, setTab] = useState<StudyTab>("script");
  const completionRef = useRef<HTMLDivElement>(null);
  const studyRef = useRef<HTMLDivElement>(null);

  // 중국어 → 한국어: 한국어 번역 자막, 한국어 → 중국어: 중국어 자막
  const subLang = lesson.direction === "zh-ko" ? "ko" : "zh";
  const hasSubs = script.some((c) => c[subLang]);
  // 원본 영상 자막 가리기 (교수자 설정). 켜져 있으면 앱 자막을 가린 영역 안에 표시한다.
  const mask = lesson.captionMask?.enabled ? lesson.captionMask : null;
  // 원문 자막(1~8주차 중국어, 9~15주차 한국어): 교수자가 확보·동기화한 원문만 영상 위에 표시한다.
  // 번들 예시 자료는 영상에 원문 자막이 이미 들어 있어, 영상 자막을 가리지 않으면 표시하지 않는다.
  const sourceLang = lesson.direction === "zh-ko" ? "zh" : "ko";
  const hasSourceSubs = (lesson.script.source !== "bundled" || !!mask) && script.some((c) => c[sourceLang]);
  const [showSource, setShowSource] = useState(true);
  const subLangs = [
    ...(hasSourceSubs && showSource ? [sourceLang] : []),
    ...(hasSubs && showSubs ? [subLang] : []),
  ] as ("zh" | "ko")[];
  // 병음: 중국어 줄이 보일 때만 그 아래에 표시 (중국어를 숨기면 병음도 숨겨짐)
  const [showPinyin, setShowPinyin] = useState(true);
  const zhShown = subLangs.includes("zh");
  const subLineCount = subLangs.length + (zhShown && showPinyin ? 1 : 0);
  // 시간 동기화 전 원문 텍스트는 스크립트 탭에서 시간 없이 보여준다.
  const { plain } = lesson.script;
  const untimed = plain && plain.lang === sourceLang && !isPlainSynced(plain) ? plain.lines.map((l) => l.text) : [];

  const motionCues = useMemo(
    () => content.cues.filter((c): c is MotionCue => c.kind === "motion"),
    [content],
  );
  const lensCues = useMemo(
    () => content.cues.filter((c): c is CultureLensCue => c.kind === "culture-lens"),
    [content],
  );
  const activeLensCue = lensCues.find(
    (c) => clock.time >= c.time && clock.time < c.time + c.duration,
  );
  // 렌즈를 펼친 채 구간이 지나도 같은 렌즈를 유지한다.
  const lastLensCue = useRef<CultureLensCue | undefined>(undefined);
  lastLensCue.current = activeLensCue ?? lastLensCue.current ?? lensCues[0];
  // 기존 문화렌즈(cultureTopics) → 교수자가 만든 문화렌즈 순으로 찾는다.
  const lensId = lastLensCue.current?.cultureId;
  const lens = lensId
    ? (cultureTopics.find((t) => t.id === lensId)?.lens ?? content.lenses?.[lensId])
    : undefined;
  const currentCue = content.cues.find(
    (c) => clock.time >= c.time && clock.time < c.time + c.duration,
  );

  // 학습 전체화면: 영상 + 모션그래픽·자막·문화렌즈 오버레이를 담은 컨테이너 전체를 전체화면으로
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useFullscreen(stageRef);
  const toast = useToast();
  const toggleStage = async () => {
    if (stage.active) return stage.exit();
    if (!stage.supported) {
      toast.show("이 브라우저에서는 학습 전체화면을 사용할 수 없어요.", "error");
      return;
    }
    if (!(await stage.enter())) toast.show("전체화면으로 전환하지 못했어요. 다시 시도해 주세요.", "error");
  };

  // 학습 구간 종료 → 영상 정지 + 학습 완료 기록 + 학습 완료/복습 영역 표시
  useEffect(() => {
    if (!completed && clock.ready && clock.time >= video.endTime) {
      clock.pause();
      setCompleted(true);
      markCompleted();
      void stage.exit(); // 학습 전체화면이면 해제해 요약·퀴즈를 보여준다.
    }
  }, [clock, completed, video.endTime, markCompleted, stage]);

  useEffect(() => {
    if (completed) {
      completionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [completed]);

  const span = Math.max(1, video.endTime - video.startTime);
  const progressRatio = Math.min(1, Math.max(0, (clock.time - video.startTime) / span));

  const { seekTo, play } = clock;
  const jump = useCallback(
    (t: number) => {
      seekTo(t);
      play();
    },
    [seekTo, play],
  );

  const openStudyTab = async (t: StudyTab) => {
    await stage.exit(); // 학습 패널은 전체화면 밖에 있으므로 먼저 해제한다.
    setTab(t);
    studyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const toggle = (on: boolean, flip: () => void, label: string) => (
    <button className={`sub-toggle ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={flip}>
      <span className="sub-toggle-track" aria-hidden>
        <span className="sub-toggle-thumb" />
      </span>
      {label} {on ? "ON" : "OFF"}
    </button>
  );
  const subToggle = (
    <>
      {hasSourceSubs
        ? toggle(showSource, () => setShowSource((v) => !v), `${sourceLang === "zh" ? "중국어" : "한국어"} 원문 자막`)
        : null}
      {hasSubs
        ? toggle(showSubs, () => setShowSubs((v) => !v), `${subLang === "ko" ? "한국어" : "중국어"} 자막`)
        : null}
      {(hasSourceSubs && sourceLang === "zh") || (hasSubs && subLang === "zh")
        ? toggle(showPinyin, () => setShowPinyin((v) => !v), "병음")
        : null}
    </>
  );

  const level = getLevel(lesson.level);

  return (
    <div className="drama-page">
      <div className="drama-layout">
        <section className="card video-card">
          <div className="video-head">
            <div>
              <span className="row-start">
                <span className="pill pill-sky">{lesson.week}주차</span>
                <span className="pill pill-lavender">{DIRECTION_LABEL[lesson.direction]}</span>
                <span className={`pill pill-${level.tone}`} title={level.definition || undefined}>
                  {level.label}
                </span>
                {lesson.status !== "published" ? <span className="pill pill-pink">미리보기 · 비공개</span> : null}
              </span>
              <h2>{lessonHeading(lesson)}</h2>
              {lesson.source ? <p className="muted small">{lesson.title}</p> : null}
              {level.definition ? (
                <p className="level-def">
                  <b>{level.label}</b> {level.definition}
                </p>
              ) : null}
            </div>
            <div className="video-head-meta">
              학습 구간 <b>{formatTime(video.startTime)}</b> – <b>{endLabel}</b>
            </div>
          </div>

          <div className={`learning-stage ${stage.active ? "is-fullscreen" : ""}`} ref={stageRef}>
            <div className={`video-frame ${simMode ? "sim" : ""}`}>
              <div ref={hostRef} className="yt-host" hidden={simMode} />
              {simMode ? (
                <div className="sim-screen">
                  <span>🎬 시뮬레이션 모드</span>
                  <b>{formatTime(clock.time)}</b>
                  <small>영상 없이 학습 overlay 흐름만 미리 볼 수 있어요.</small>
                </div>
              ) : null}
              {!clock.ready && !yt.error && !simMode ? (
                <div className="video-loading">영상을 불러오는 중…</div>
              ) : null}
              {yt.error && !simMode ? (
                <div className="video-error">
                  <b>{yt.error}</b>
                  <p>
                    YouTube에서 직접 보거나, 시뮬레이션 모드로 학습 overlay를 확인해 보세요.
                  </p>
                  <div className="row">
                    <a className="btn btn-soft btn-sm" href={video.youtubeUrl} target="_blank" rel="noreferrer">
                      YouTube에서 보기
                    </a>
                    <button className="btn btn-primary btn-sm" onClick={() => setSimMode(true)}>
                      시뮬레이션 모드
                    </button>
                  </div>
                </div>
              ) : null}

              {/* 학습 overlay — 상단 좌/우에만 배치해 하단 자막·컨트롤을 가리지 않는다 */}
              <div className="overlay-layer">
                <MotionOverlayLayer cues={motionCues} time={clock.time} playing={clock.playing} />
                {/* 자막을 모두 꺼도 가리기 영역은 남겨 영상 자체 자막이 계속 가려지게 한다. */}
                {mask ? (
                  <CaptionMaskBox mask={mask} lines={subLineCount}>
                    {subLangs.length > 0 ? (
                      <SubtitleLayer cues={script} time={clock.time} langs={subLangs} pinyin={showPinyin} inMask />
                    ) : null}
                  </CaptionMaskBox>
                ) : subLangs.length > 0 ? (
                  <SubtitleLayer cues={script} time={clock.time} langs={subLangs} pinyin={showPinyin} />
                ) : null}
                <CultureLensLayer
                  cue={activeLensCue}
                  lens={lens}
                  onMore={() => void openStudyTab("culture")}
                />
              </div>
            </div>

            {stage.active ? (
              <div className="stage-bar">
                <button
                  className="btn btn-soft btn-sm"
                  onClick={() => (clock.playing ? clock.pause() : clock.play())}
                  disabled={!clock.ready}
                >
                  {clock.playing ? "❚❚ 일시정지" : "▶ 재생"}
                </button>
                <span className="time-readout">
                  {formatTime(clock.time)} <small>/ {endLabel}</small>
                </span>
                {subToggle}
                <button className="btn btn-primary btn-sm stage-exit" onClick={() => void stage.exit()}>
                  ✕ 전체화면 종료 <small>(Esc)</small>
                </button>
              </div>
            ) : null}
          </div>

          <div className="video-controls">
            <button className="btn btn-primary" onClick={() => jump(video.startTime)}>
              ▶ {formatTime(video.startTime)}부터 학습 시작
            </button>
            <button
              className="btn btn-soft"
              onClick={() => (clock.playing ? clock.pause() : clock.play())}
              disabled={!clock.ready}
            >
              {clock.playing ? "❚❚ 일시정지" : "▶ 재생"}
            </button>
            <span className="time-readout">
              {formatTime(clock.time)} <small>/ {endLabel}</small>
            </span>
            {subToggle}
            <button
              className="btn btn-soft stage-toggle"
              onClick={() => void toggleStage()}
              title="영상과 모션그래픽·자막·문화렌즈를 함께 전체화면으로 봐요"
            >
              ⛶ 학습 전체화면
            </button>
            {!simMode && !yt.error ? (
              <button className="link-btn" onClick={() => setSimMode(true)}>
                영상이 안 보이나요? 시뮬레이션 모드
              </button>
            ) : null}
          </div>
          <p className="stage-hint">
            ⛶ 전체화면은 ‘학습 전체화면’ 버튼을 이용해 주세요. 모션그래픽·자막·문화렌즈가 영상과 함께 크게 보여요.
          </p>

          <div className="timeline">
            <div className="timeline-track">
              <div className="timeline-fill" style={{ width: `${progressRatio * 100}%` }} />
              {content.cues.map((c) => (
                <button
                  key={c.id}
                  className={`timeline-marker ${c.kind === "culture-lens" ? "lens" : ""} ${
                    clock.time >= c.time ? "passed" : ""
                  }`}
                  style={{ left: `${((c.time - video.startTime) / span) * 100}%` }}
                  onClick={() => jump(Math.max(video.startTime, c.time - 2))}
                  title={`${formatTime(c.time)} ${c.title}`}
                  aria-label={`${formatTime(c.time)} ${c.title}`}
                />
              ))}
            </div>
            <div className="cue-chips">
              {content.cues.map((c) => (
                <button
                  key={c.id}
                  className={`cue-chip ${currentCue?.id === c.id ? "active" : ""}`}
                  onClick={() => jump(Math.max(video.startTime, c.time - 2))}
                >
                  <span>{formatTime(c.time)}</span>
                  {c.title}
                </button>
              ))}
              <button
                className="cue-chip end"
                disabled={!Number.isFinite(video.endTime)}
                onClick={() => jump(video.endTime - 4)}
              >
                <span>{endLabel}</span>🎉 학습 완료
              </button>
            </div>
          </div>

          <p className="record-note">
            {recordFor && progress ? (
              <>
                📈 학습 진행률 <b>{Math.round(progress.progressRatio * 100)}%</b> · 최대 재생 위치{" "}
                <b>{formatTime(progress.maxPosition)}</b>
                {progress.completedAt ? " · ✅ 학습 완료" : ""}
              </>
            ) : user?.role === "instructor" ? (
              "교수자 미리보기 — 학습 기록이 저장되지 않아요."
            ) : simMode && user ? (
              "시뮬레이션 모드에서는 학습 기록이 저장되지 않아요."
            ) : !user ? (
              "로그인하면 영상 재생 진행률과 퀴즈 결과가 학습 기록으로 저장돼요."
            ) : null}
          </p>
        </section>

        <aside className="drama-side" ref={studyRef}>
          <div className="card now-card">
            <h3 className="card-title">지금 이 장면</h3>
            {currentCue ? (
              <>
                <span className="pill pill-lavender">{TYPE_LABEL[currentCue.learningType]}</span>
                <p className="now-zh">{currentCue.dialogue.zh}</p>
                {currentCue.dialogue.pinyin ? (
                  <p className="now-py">{currentCue.dialogue.pinyin}</p>
                ) : null}
                {currentCue.dialogue.ko ? <p className="now-ko">{currentCue.dialogue.ko}</p> : null}
              </>
            ) : (
              <p className="muted">
                영상을 보다가 학습 포인트가 나오면 영상 위에 카드가 잠깐 나타나요. 영상은 멈추지
                않으니 편하게 감상하세요. 🍿
              </p>
            )}
          </div>

          <LessonStudyPanel
            tab={tab}
            onTab={setTab}
            content={content}
            script={script}
            untimed={untimed}
            showPinyin={showPinyin}
            direction={lesson.direction}
            time={clock.time}
            startTime={video.startTime}
            onSeek={jump}
            progress={progress}
            onOpenReview={() => {
              if (completed) completionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              else setCompleted(true);
            }}
          />
        </aside>
      </div>

      {completed ? (
        <section className="completion" ref={completionRef}>
          <div className="card completion-hero">
            <span className="confetti" aria-hidden>
              🎉
            </span>
            <div>
              <h2>오늘의 학습 완료!</h2>
              <p>오늘의 드라마 학습을 완료했어요.</p>
            </div>
            <button className="btn btn-soft" onClick={() => jump(video.startTime)}>
              ↺ 처음부터 다시 보기
            </button>
          </div>
          {content.summary.length > 0 ? (
            <div className="summary-grid">
              {content.summary.map((s) => (
                <div key={s.zh} className="summary-item">
                  <span className="summary-type">{s.type}</span>
                  <b>{s.zh}</b>
                  <small>{s.pinyin}</small>
                  <p>{s.ko}</p>
                </div>
              ))}
            </div>
          ) : null}
          {content.quiz.length > 0 ? (
            <>
              <h3 className="section-title">📝 오늘의 표현을 기억하고 있나요?</h3>
              <QuizCard questions={content.quiz} onFinish={recordFor ? recordQuiz : undefined} />
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

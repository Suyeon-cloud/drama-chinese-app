import React, { useEffect, useRef, useState } from "react";
import { formatTime, youtubeThumbnail } from "../../../content";
import { DIRECTION_LABEL, STATUS_LABEL, WEEKS } from "../../../content/course";
import { LEGACY_COURSE_ID, defaultDirectionFor, isCourseId } from "../../../content/courses";
import { baseLessonContent, sourceTimeline, type TimelineLine } from "../../../content/lessons";
import { useYouTubeClock } from "../../learning/useVideoClock";
import { formatClock } from "../../lib/subtitles";
import { DEFAULT_LEVEL_ID, LEVELS, getLevel } from "../../../content/levels";
import {
  CaptionMaskBox,
  DEFAULT_CAPTION_MASK,
  MASK_HEIGHT_RANGE,
  MASK_TOP_RANGE,
  MASK_WIDTH_RANGE,
  normalizeMask,
} from "../../learning/CaptionMask";
import type {
  CaptionMask,
  LearningDirection,
  Lesson,
  LessonDraft,
  LessonStatus,
  PlainScript,
  SubtitleCue,
} from "../../../content/types";
import { LANG_NAME } from "../../lib/captionsApi";
import { parseClock, scriptStatus } from "../../lib/subtitles";
import { parseYouTubeId, parseYouTubeStart, youtubeWatchUrl } from "../../lib/youtube";
import { navigate } from "../../router";
import { lessonStore } from "../../store";
import { useLessons } from "../../store/hooks";
import { createId, nowIso } from "../../store/localJson";
import { PageIntro } from "./AdminShared";
import { ContentDraftSection } from "./ContentDraftSection";
import { ScriptSection, VideoCheckPanel, sourceLangFor, type ScriptOrigin } from "./ScriptSection";
import { ScriptSyncPanel } from "./ScriptSyncPanel";
import { useCaptionLookup } from "./useCaptionLookup";

type FormState = {
  /** 속한 과목 (이 화면에서는 바꾸지 않는다) */
  courseId: string;
  week: number;
  direction: LearningDirection;
  level: string;
  title: string;
  description: string;
  dramaTitle: string;
  episode: string;
  youtubeUrl: string;
  start: string;
  end: string;
  status: LessonStatus;
  cues: SubtitleCue[];
  scriptSource: Lesson["script"]["source"];
  origin: ScriptOrigin;
  /** 타임코드 없는 원문 텍스트 */
  plain: PlainScript | null;
  /** 학습 콘텐츠 초안 */
  draft: LessonDraft | null;
  /** 원본 영상 자막 가리기 */
  captionMask: CaptionMask;
};

const fromLesson = (l: Lesson): FormState => ({
  courseId: l.courseId,
  week: l.week,
  direction: l.direction,
  level: l.level,
  title: l.title,
  description: l.description,
  dramaTitle: l.source?.dramaTitle ?? "",
  episode: l.source?.episode ?? "",
  youtubeUrl: l.video.youtubeUrl,
  start: formatTime(l.video.startTime),
  end: l.video.endTime > 0 ? formatTime(l.video.endTime) : "",
  status: l.status,
  cues: l.script.cues,
  scriptSource: l.script.source,
  origin: l.script.origin ?? {},
  plain: l.script.plain ?? null,
  draft: l.draft ?? null,
  captionMask: normalizeMask(l.captionMask),
});

const blankForm = (courseId: string, week: number): FormState => ({
  courseId,
  week,
  direction: defaultDirectionFor(courseId, week),
  level: DEFAULT_LEVEL_ID,
  title: "",
  description: "",
  dramaTitle: "",
  episode: "",
  youtubeUrl: "",
  start: "00:00",
  end: "",
  status: "draft",
  cues: [],
  scriptSource: "manual",
  origin: {},
  plain: null,
  draft: null,
  captionMask: DEFAULT_CAPTION_MASK,
});

/**
 * 실제 YouTube 영상 위에서 가리기 영역을 확인한다. 자막 시간 동기화 여부와 무관하게 동작하며,
 * 슬라이더 값(lesson.captionMask)이 바뀌면 재생 중인 영상 위 박스가 바로 따라 움직인다.
 */
const MaskLivePreview: React.FC<{
  youtubeId: string;
  mask: CaptionMask;
  startAt: number;
  timeline: TimelineLine[];
  sampleText: string;
}> = ({ youtubeId, mask, startAt, timeline, sampleText }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const clock = useYouTubeClock(hostRef, youtubeId, startAt);
  // 시간이 있는 원문(SRT·YouTube 자막·동기화된 원문) 중 지금 시점의 문장, 없으면 예시 문구
  const nowLine = [...timeline].reverse().find((l) => l.start !== null && l.start <= clock.time);
  return (
    <div className="mask-live">
      <div className="sync-player">
        <div ref={hostRef} className="yt-host" />
        <div className="overlay-layer">
          <CaptionMaskBox mask={mask}>
            <div className="ko-subtitle in-mask">
              <span>{nowLine?.text || sampleText}</span>
            </div>
          </CaptionMaskBox>
        </div>
        {!clock.ready && !clock.error ? <div className="video-loading">영상을 불러오는 중…</div> : null}
        {clock.error ? (
          <div className="video-error">
            <b>{clock.error}</b>
          </div>
        ) : null}
      </div>
      <div className="row-start">
        <button
          type="button"
          className="btn btn-soft btn-sm"
          disabled={!clock.ready}
          onClick={() => (clock.playing ? clock.pause() : clock.play())}
        >
          {clock.playing ? "❚❚ 일시정지" : "▶ 재생"}
        </button>
        <button type="button" className="link-btn" disabled={!clock.ready} onClick={() => clock.seekTo(startAt)}>
          학습 시작 지점으로
        </button>
        <span className="time-readout tabular">{formatClock(clock.time)}</span>
      </div>
    </div>
  );
};

/** 원본 영상 자막 가리기 설정: 켜기/끄기 + 위치·높이 슬라이더 (실제 영상 미리보기에 바로 반영) */
const CaptionMaskSettings: React.FC<{
  mask: CaptionMask;
  onChange: (mask: CaptionMask) => void;
  youtubeId: string;
  startAt: number;
  timeline: TimelineLine[];
  sampleText: string;
}> = ({ mask, onChange, youtubeId, startAt, timeline, sampleText }) => {
  const set = (patch: Partial<CaptionMask>) => onChange(normalizeMask({ ...mask, ...patch }));
  const { width } = normalizeMask(mask);
  return (
    <div className="mask-settings">
      <label className="mask-toggle">
        <input type="checkbox" checked={mask.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span>
          원본 영상 자막 가리기 <b>{mask.enabled ? "ON" : "OFF"}</b>
        </span>
      </label>
      <small className="muted">
        영상에 박혀 있는 자막을 불투명한 띠로 가리고, 앱의 원문·번역 자막을 그 안에 보여줘요.
      </small>
      {mask.enabled ? (
        <>
          <MaskLivePreview
            key={youtubeId}
            youtubeId={youtubeId}
            mask={mask}
            startAt={startAt}
            timeline={timeline}
            sampleText={sampleText}
          />
          <div className="mask-sliders">
          <label className="range-field">
            <span>
              가리기 위치 <b>{mask.top}%</b>
            </span>
            <input
              type="range"
              min={MASK_TOP_RANGE.min}
              max={Math.min(MASK_TOP_RANGE.max, 100 - mask.height)}
              step={0.5}
              value={mask.top}
              onChange={(e) => set({ top: Number(e.target.value) })}
            />
          </label>
          <label className="range-field">
            <span>
              가리기 높이 <b>{mask.height}%</b>
            </span>
            <input
              type="range"
              min={MASK_HEIGHT_RANGE.min}
              max={MASK_HEIGHT_RANGE.max}
              step={0.5}
              value={mask.height}
              onChange={(e) => set({ height: Number(e.target.value) })}
            />
          </label>
          <label className="range-field">
            <span>
              가리기 너비 <b>{width}%</b>
            </span>
            <input
              type="range"
              min={MASK_WIDTH_RANGE.min}
              max={MASK_WIDTH_RANGE.max}
              step={1}
              value={width}
              onChange={(e) => set({ width: Number(e.target.value) })}
            />
          </label>
          </div>
          <small className="muted">
            영상을 재생하며 박혀 있는 자막이 보이는 장면에서 위치·높이·너비를 맞추면 위 영상의 자막 패널이 바로 바뀌어요.
            원본 자막이 패널 밖으로 보이지 않을 만큼만 가리면 돼요.
            자막 시간 동기화와 상관없이 조정할 수 있어요. 영상 맨 아래 컨트롤 바는 가리지 않도록 조금 여유를 두세요.
          </small>
        </>
      ) : null}
    </div>
  );
};

/** 교수 피드백: 한 번의 학습에 쓰는 영상 구간은 15분 이내 (안내·경고만, 저장은 막지 않음) */
const STUDY_LIMIT_SEC = 15 * 60;

/** 원본 영상 길이 · 학습 구간 · 실제 학습 분량을 구분해서 보여준다. */
const StudySpanSummary: React.FC<{
  videoLength: number | null;
  startSec: number | null;
  endSec: number | null;
}> = ({ videoLength, startSec, endSec }) => {
  const start = startSec ?? 0;
  const span = endSec !== null && endSec > start ? endSec - start : null;
  return (
    <div className="study-span">
      <dl>
        <div>
          <dt>원본 영상 길이</dt>
          <dd className="tabular">{videoLength !== null ? formatTime(videoLength) : "영상 확인 후 표시"}</dd>
        </div>
        <div>
          <dt>학습 구간</dt>
          <dd className="tabular">
            {formatTime(start)} ~ {endSec !== null ? formatTime(endSec) : "끝 시간 입력 필요"}
          </dd>
        </div>
        <div>
          <dt>실제 학습 분량</dt>
          <dd className="tabular">
            {span !== null ? formatTime(span) : "—"}
            {span !== null && span <= STUDY_LIMIT_SEC ? <span className="pill pill-mint">15분 이내</span> : null}
          </dd>
        </div>
      </dl>
      {videoLength !== null && videoLength > STUDY_LIMIT_SEC ? (
        <p className="study-note notice">
          ℹ️ 원본 영상이 15분을 초과합니다. 전체 영상 대신 학습에 필요한 15분 이내의 구간을 지정해 주세요.
        </p>
      ) : null}
      {span !== null && span > STUDY_LIMIT_SEC ? (
        <p className="study-note warn">
          ⚠️ 학습 구간이 15분을 초과합니다. 학습에 필요한 구간을 15분 이내로 조정해 주세요.
        </p>
      ) : null}
    </div>
  );
};

const PIPELINE = [
  "영상 및 학습 구간 설정",
  "원문 스크립트 확보",
  "자막 시간 동기화",
  "학습 콘텐츠 초안 구성",
  "교수자 검토·편집 + 등장 시점 확인",
  "학습자료 저장/게시",
];

export const LessonEditorView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const lessons = useLessons();
  const id = params.get("id");
  if (!lessons) return null;
  const existing = id ? lessons.find((l) => l.id === id) ?? null : null;
  if (id && !existing) {
    return (
      <div className="page">
        <div className="card empty">
          <span>🗂</span>
          <p>강의자료를 찾을 수 없어요.</p>
        </div>
      </div>
    );
  }
  const weekParam = Number(params.get("week"));
  const week = WEEKS.indexOf(weekParam) >= 0 ? weekParam : 1;
  // 새 강의자료의 과목: ?course={courseId} (과목 화면 개편 전에는 기존 자료)
  const courseParam = params.get("course") ?? "";
  const courseId = isCourseId(courseParam) ? courseParam : LEGACY_COURSE_ID;
  return (
    <LessonEditor
      key={existing?.id ?? `new-${courseId}-${week}`}
      existing={existing}
      initialCourseId={courseId}
      initialWeek={week}
      justSaved={params.get("saved") === "1"}
    />
  );
};

const LessonEditor: React.FC<{
  existing: Lesson | null;
  initialCourseId: string;
  initialWeek: number;
  justSaved: boolean;
}> = ({ existing, initialCourseId, initialWeek, justSaved }) => {
  const [form, setForm] = useState<FormState>(() =>
    existing ? fromLesson(existing) : blankForm(initialCourseId, initialWeek),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(justSaved ? "강의자료를 생성했어요." : null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const youtubeId = parseYouTubeId(form.youtubeUrl);
  const startSec = parseClock(form.start);
  const endSec = parseClock(form.end);
  const content = existing ? baseLessonContent(existing) : null;

  // 원문 기준: 중국어 → 한국어는 중국어 원문, 한국어 → 중국어는 한국어 원문
  const sourceLang = sourceLangFor(form.direction);
  const sourceName = LANG_NAME[sourceLang];
  const status = scriptStatus(form.cues, form.plain, sourceLang);
  const sourceSecured = status.secured;
  const plainForSource = form.plain && form.plain.lang === sourceLang ? form.plain : null;
  // 원문 문장 + 동기화된 시작 시각 → 학습 콘텐츠 등장 시점의 기준
  const timeline = sourceTimeline(form.cues, form.plain, sourceLang);
  const lookup = useCaptionLookup(youtubeId, sourceLang);
  const hasContent = !!content && (content.cues.length > 0 || content.quiz.length > 0);
  const pipelineDone = [
    !!youtubeId && endSec !== null,
    sourceSecured,
    sourceSecured && status.synced,
    sourceSecured && (!!form.draft || hasContent),
    sourceSecured && ((!!form.draft && form.draft.updatedAt !== form.draft.createdAt) || hasContent),
    !!existing && existing.status === "published",
  ];
  // ③ 시간 동기화는 나중에 해도 ④ 콘텐츠 제작을 진행할 수 있다.
  const pipelineLater = [false, false, sourceSecured && !status.synced, false, false, false];

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!form.title.trim()) errs.push("강의 제목을 입력해 주세요.");
    if (form.youtubeUrl.trim() && !youtubeId) errs.push("YouTube URL 형식을 확인해 주세요.");
    if (form.start.trim() && startSec === null) errs.push("학습 구간 시작 시간 형식을 확인해 주세요. (예: 02:00)");
    if (form.end.trim() && endSec === null) errs.push("학습 구간 끝 시간 형식을 확인해 주세요. (예: 10:26)");
    if (startSec !== null && endSec !== null && endSec <= startSec) {
      errs.push("학습 구간 끝 시간은 시작 시간보다 뒤여야 해요.");
    }
    if (form.status !== "draft") {
      if (!sourceSecured) {
        errs.push(
          `'${STATUS_LABEL[form.status]}' 상태로 저장하려면 ${sourceName} 원문 스크립트(자막 또는 원문 텍스트)가 1문장 이상 있어야 해요. (‘준비 중’으로는 저장할 수 있어요)`,
        );
      }
      if (!youtubeId) errs.push(`'${STATUS_LABEL[form.status]}' 상태로 저장하려면 YouTube URL이 필요해요.`);
      if (endSec === null) errs.push(`'${STATUS_LABEL[form.status]}' 상태로 저장하려면 학습 구간 끝 시간이 필요해요.`);
    }
    return errs;
  };

  const save = async () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;
    const now = nowIso();
    const lesson: Lesson = {
      ...(existing ?? { id: createId("lesson"), createdAt: now }),
      courseId: form.courseId,
      week: form.week,
      direction: form.direction,
      level: form.level,
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      video: {
        youtubeUrl: youtubeId ? form.youtubeUrl.trim() : "",
        youtubeId: youtubeId ?? "",
        startTime: startSec ?? 0,
        endTime: endSec ?? 0,
      },
      source:
        form.dramaTitle.trim() || form.episode.trim()
          ? {
              dramaTitle: form.dramaTitle.trim(),
              episode: form.episode.trim(),
              // 원본 영상 제목은 이 화면에서 고치지 않으므로 저장된 값을 그대로 둔다.
              ...(existing?.source?.videoTitle ? { videoTitle: existing.source.videoTitle } : {}),
            }
          : undefined,
      script: {
        source: form.scriptSource,
        cues: form.cues,
        updatedAt:
          existing && existing.script.cues === form.cues && (existing.script.plain ?? null) === form.plain
            ? existing.script.updatedAt
            : now,
        origin: Object.keys(form.origin).length ? form.origin : undefined,
        plain: form.plain ?? undefined,
      },
      draft: form.draft ?? undefined,
      captionMask:
        form.captionMask.enabled || existing?.captionMask ? normalizeMask(form.captionMask) : undefined,
      updatedAt: now,
    };
    const saved = await lessonStore.save(lesson);
    setNotice("강의자료를 저장했어요.");
    if (!existing) navigate("admin-editor", { id: saved.id, saved: 1 });
  };

  const remove = async () => {
    if (!existing) return;
    await lessonStore.remove(existing.id);
    navigate("admin-course");
  };

  return (
    <div className="page">
      <PageIntro
        title={existing ? "강의자료 편집" : "강의자료 만들기"}
        desc="YouTube 영상과 자막/스크립트로 주차별 강의자료를 만들어요."
      >
        <button className="btn btn-soft btn-sm" onClick={() => navigate("admin-course")}>
          ← 수업 관리
        </button>
      </PageIntro>

      <ol className="pipeline">
        {PIPELINE.map((p, i) => (
          <li key={p} className={pipelineDone[i] ? "done" : pipelineLater[i] ? "later" : ""}>
            <span className="step">{i + 1}</span>
            {p}
            {pipelineLater[i] ? <small>나중에 해도 돼요</small> : null}
          </li>
        ))}
      </ol>

      <div className="editor-grid">
        <section className="card form-card">
          <h3 className="card-title">기본 정보</h3>
          <div className="form-grid">
            <label className="field">
              <span>주차</span>
              <select
                value={form.week}
                onChange={(e) => {
                  const week = Number(e.target.value);
                  setForm((f) => ({
                    ...f,
                    week,
                    // 방향을 따로 바꾸지 않았다면 주차 기본 방향을 따른다.
                    direction:
                      f.direction === defaultDirectionFor(f.courseId, f.week)
                        ? defaultDirectionFor(f.courseId, week)
                        : f.direction,
                  }));
                }}
              >
                {WEEKS.map((w) => (
                  <option key={w} value={w}>
                    {w}주차
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>학습 수준</span>
              <select value={form.level} onChange={(e) => set("level", e.target.value)}>
                {/* 새 3과목 기본 강의자료는 수준이 아직 정해지지 않았다 (빈 값) */}
                {LEVELS.some((l) => l.id === form.level) ? null : <option value={form.level}>미지정</option>}
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label} — {l.description}
                  </option>
                ))}
              </select>
              {getLevel(form.level).definition ? (
                <small className="level-def">
                  <b>{getLevel(form.level).label}</b> {getLevel(form.level).definition}
                </small>
              ) : null}
            </label>
            <fieldset className="field span-2">
              <span>학습 방향</span>
              <div className="seg">
                {(Object.keys(DIRECTION_LABEL) as LearningDirection[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={form.direction === d ? "active" : ""}
                    aria-pressed={form.direction === d}
                    onClick={() => set("direction", d)}
                  >
                    {DIRECTION_LABEL[d]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="field span-2">
              <span>강의 제목 *</span>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="예: 가족의 일상 속 실생활 표현"
              />
            </label>
            <label className="field span-2">
              <span>설명</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="학습자에게 보여줄 짧은 소개"
              />
            </label>
            <label className="field">
              <span>작품명 (선택)</span>
              <input value={form.dramaTitle} onChange={(e) => set("dramaTitle", e.target.value)} placeholder="예: 以家人之名" />
            </label>
            <label className="field">
              <span>회차 (선택)</span>
              <input value={form.episode} onChange={(e) => set("episode", e.target.value)} placeholder="예: 第3集" />
            </label>
          </div>
        </section>

        <section className="card form-card">
          <h3 className="card-title">
            <span className="step">1</span> 영상 및 학습 구간 설정
          </h3>
          <div className="form-grid">
            <label className="field span-2">
              <span>YouTube URL</span>
              <input
                value={form.youtubeUrl}
                onChange={(e) => {
                  const url = e.target.value;
                  const t = parseYouTubeStart(url);
                  setForm((f) => ({
                    ...f,
                    youtubeUrl: url,
                    start: t !== null && (f.start === "" || f.start === "00:00") ? formatTime(t) : f.start,
                  }));
                }}
                placeholder="https://youtu.be/…"
                inputMode="url"
              />
              <small className={youtubeId || !form.youtubeUrl ? "muted" : "field-error"}>
                {youtubeId ? `영상 ID: ${youtubeId}` : form.youtubeUrl ? "올바른 YouTube URL이 아니에요." : "youtu.be, watch?v=, shorts 링크를 지원해요."}
              </small>
            </label>
            <label className="field">
              <span>학습 구간 시작</span>
              <input value={form.start} onChange={(e) => set("start", e.target.value)} placeholder="02:00" />
            </label>
            <label className="field">
              <span>학습 구간 끝</span>
              <input value={form.end} onChange={(e) => set("end", e.target.value)} placeholder="10:26" />
            </label>
          </div>
          {youtubeId ? (
            <a className="video-preview" href={youtubeWatchUrl(youtubeId)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion */}
              <img src={youtubeThumbnail(youtubeId)} alt="영상 미리보기" loading="lazy" />
              {form.captionMask.enabled ? (
                <div className="overlay-layer">
                  <CaptionMaskBox mask={form.captionMask}>
                    <div className="ko-subtitle in-mask multi">
                      <span>{timeline[0]?.text || `${sourceName} 원문 자막`}</span>
                      <span>번역 자막 위치</span>
                    </div>
                  </CaptionMaskBox>
                </div>
              ) : null}
              <span className="video-preview-link">YouTube에서 열기 ↗</span>
            </a>
          ) : null}
          {youtubeId ? (
            <CaptionMaskSettings
              mask={form.captionMask}
              onChange={(captionMask) => set("captionMask", captionMask)}
              youtubeId={youtubeId}
              startAt={startSec ?? 0}
              timeline={timeline}
              sampleText={timeline[0]?.text || `${sourceName} 원문 자막 위치`}
            />
          ) : null}
          <VideoCheckPanel lookup={lookup} youtubeId={youtubeId} lang={sourceLang} />
          {youtubeId ? (
            <StudySpanSummary
              videoLength={lookup.state.status === "ready" ? lookup.state.info.video.lengthSeconds : null}
              startSec={startSec}
              endSec={endSec}
            />
          ) : null}
        </section>
      </div>

      <ScriptSection
        cues={form.cues}
        origin={form.origin}
        direction={form.direction}
        youtubeId={youtubeId}
        lookup={lookup}
        onChange={(cues, origin, source) =>
          setForm((f) => ({ ...f, cues, origin, scriptSource: source ?? f.scriptSource }))
        }
        plain={form.plain}
        segmentStart={startSec ?? 0}
        segmentEnd={endSec}
        title={form.title}
        dramaTitle={form.dramaTitle}
        onPlainChange={(plain) =>
          setForm((f) => ({
            ...f,
            plain,
            // 원문 텍스트를 지우면 출처 표시도 기존 값으로 되돌린다.
            scriptSource: !plain && f.scriptSource === "text" ? "manual" : f.scriptSource,
          }))
        }
      />

      <ScriptSyncPanel
        plain={plainForSource}
        onPlainChange={(plain) => setForm((f) => ({ ...f, plain }))}
        timedCount={status.timedCount}
        sourceName={sourceName}
        youtubeId={youtubeId}
        segmentStart={startSec ?? 0}
        segmentEnd={endSec}
        mask={form.captionMask.enabled ? form.captionMask : null}
      />

      <ContentDraftSection
        draft={form.draft}
        onChange={(draft) => set("draft", draft)}
        timeline={timeline}
        segmentStart={startSec ?? 0}
        segmentEnd={endSec}
        secured={sourceSecured}
        synced={status.synced}
        direction={form.direction}
        level={form.level}
        week={form.week}
        title={form.title}
        dramaTitle={form.dramaTitle}
        sourceName={sourceName}
        base={hasContent ? content : null}
      />

      <section className="card save-bar">
        <label className="field">
          <span>공개 상태</span>
          <select value={form.status} onChange={(e) => set("status", e.target.value as LessonStatus)}>
            {(Object.keys(STATUS_LABEL) as LessonStatus[]).map((s) => (
              <option key={s} value={s} disabled={s !== "draft" && !sourceSecured}>
                {STATUS_LABEL[s]}
                {s === "published" ? " (학습자에게 보임)" : ""}
                {s !== "draft" && !sourceSecured ? " — 원문 확보 필요" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="save-actions">
          {existing ? (
            confirmDelete ? (
              <span className="row-start">
                <span className="small">정말 삭제할까요?</span>
                <button className="btn btn-sm btn-danger" onClick={remove}>
                  삭제
                </button>
                <button className="btn btn-soft btn-sm" onClick={() => setConfirmDelete(false)}>
                  취소
                </button>
              </span>
            ) : (
              <button className="link-btn danger" onClick={() => setConfirmDelete(true)}>
                강의자료 삭제
              </button>
            )
          ) : null}
          {existing && existing.video.youtubeId ? (
            <button className="btn btn-soft" onClick={() => navigate("lesson", { lesson: existing.id })}>
              학습 화면 미리보기
            </button>
          ) : null}
          <button className="btn btn-primary" onClick={save}>
            {existing ? "저장" : "강의자료 생성"}
          </button>
        </div>
        {errors.length > 0 ? (
          <ul className="form-errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {notice ? <p className="form-notice">✅ {notice}</p> : null}
      </section>
    </div>
  );
};

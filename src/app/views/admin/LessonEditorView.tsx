import React, { useEffect, useRef, useState } from "react";
import { formatTime, youtubeThumbnail } from "../../../content";
import { DIRECTION_LABEL, STATUS_LABEL, WEEKS } from "../../../content/course";
import { LEGACY_COURSE_ID, defaultDirectionFor, isCourseId } from "../../../content/courses";
import {
  baseLessonContent,
  captionMaskToSave,
  resolveCaptionMask,
  sourceTimeline,
  type TimelineLine,
} from "../../../content/lessons";
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
  LessonDialogue,
  LessonDraft,
  LessonStatus,
  PlainScript,
  SubtitleCue,
} from "../../../content/types";
import { LANG_NAME } from "../../lib/captionsApi";
import { lessonPublishProblems, parseClock, scriptStatus } from "../../lib/subtitles";
import { parseYouTubeId, parseYouTubeStart, youtubeWatchUrl } from "../../lib/youtube";
import { useAuth } from "../../auth/AuthContext";
import { ApiError, lessonConflictOf, type LessonConflict } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { navigate, setNavigationGuard } from "../../router";
import { lessonStore } from "../../store";
import { useLessons } from "../../store/hooks";
import { refreshAllStores } from "../../store/remote";
import { createId, nowIso } from "../../store/localJson";
import { PageIntro, StatusBadge } from "./AdminShared";
import { SharedLessonNote } from "./CourseAdminShared";
import { DialogueSection } from "./DialogueSection";
import { EditorSection, EditorSectionsContext } from "./EditorSection";
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
  /** 회화 연습 (없어도 공개할 수 있다) */
  dialogues: LessonDialogue[];
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
  dialogues: l.dialogues ?? [],
  // 학습 화면과 같은 위치를 보여준다.
  captionMask: normalizeMask(resolveCaptionMask(l)),
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
  dialogues: [],
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
  // 슬라이더로 직접 정한 위치·크기는 자막 위치 preset보다 우선한다.
  const setPosition = (patch: Partial<CaptionMask>) => set({ ...patch, custom: true });
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
              onChange={(e) => setPosition({ top: Number(e.target.value) })}
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
              onChange={(e) => setPosition({ height: Number(e.target.value) })}
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
              onChange={(e) => setPosition({ width: Number(e.target.value) })}
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
          <p>학습자료를 찾을 수 없어요.</p>
        </div>
      </div>
    );
  }
  const weekParam = Number(params.get("week"));
  const week = WEEKS.indexOf(weekParam) >= 0 ? weekParam : 1;
  // 새 강의자료의 과목: ?course={courseId} (과목 화면 개편 전에는 기존 자료)
  const courseParam = params.get("course") ?? "";
  const courseId = isCourseId(courseParam) ? courseParam : LEGACY_COURSE_ID;
  // 분반 화면에서 들어왔으면 그 분반으로 돌아간다.
  const backSection = params.get("section");
  return (
    <LessonEditor
      key={existing?.id ?? `new-${courseId}-${week}`}
      existing={existing}
      initialCourseId={courseId}
      initialWeek={week}
      backSection={backSection}
      justSaved={params.get("saved") === "1"}
    />
  );
};

const LessonEditor: React.FC<{
  existing: Lesson | null;
  initialCourseId: string;
  initialWeek: number;
  backSection: string | null;
  justSaved: boolean;
}> = ({ existing, initialCourseId, initialWeek, backSection, justSaved }) => {
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(() =>
    existing ? fromLesson(existing) : blankForm(initialCourseId, initialWeek),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(justSaved ? "학습자료를 생성했어요." : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  // 저장 후 바뀐 내용이 있으면 화면을 벗어나기 전에 확인한다.
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const savedForm = useRef(JSON.stringify(form));
  // 자막 가리기는 preset을 적용한 값을 보여 주므로, 바꾸지 않았을 때 되돌려 저장할 원래 값을 기억한다.
  const maskBase = useRef({ stored: existing?.captionMask, shown: form.captionMask });
  const formRef = useRef(form);
  formRef.current = form;
  // 저장의 기준이 되는 서버 학습자료(version 포함). 처음 연 내용 → 내가 저장한 결과 → ‘최신본 다시 불러오기’로만 바뀐다.
  // 목록이 새로고침되어도 바꾸지 않는다. (다른 사람이 먼저 저장한 내용을 모르고 덮어쓰지 않게)
  const baseRef = useRef<Lesson | null>(existing);
  // 저장 충돌(409): 먼저 저장한 사람 정보. 편집 중인 내용은 지우지 않는다.
  const [conflict, setConflict] = useState<LessonConflict | null>(null);
  const [reloading, setReloading] = useState(false);
  const isDirty = () => JSON.stringify(formRef.current) !== savedForm.current;

  useEffect(() => {
    setNavigationGuard((next) => {
      if (!isDirty()) return false;
      setLeaveTo(next);
      return true;
    });
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      setNavigationGuard(null);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // 제작 단계: 새 단계를 넣을 때는 여기에 항목을 더하고 EditorSection으로 감싼다.
  const steps: { id: string; label: string; done: boolean; later?: boolean }[] = [
    { id: "basic", label: "기본 정보", done: !!form.title.trim() },
    { id: "video", label: "영상", done: pipelineDone[0] },
    { id: "script", label: "원문", done: pipelineDone[1] },
    { id: "sync", label: "시간 동기화", done: pipelineDone[2], later: pipelineLater[2] },
    { id: "content", label: "콘텐츠", done: pipelineDone[3] },
    { id: "review", label: "검토", done: pipelineDone[4] },
    { id: "dialogue", label: "회화 연습", done: form.dialogues.length > 0, later: form.dialogues.length === 0 },
    { id: "publish", label: "공개", done: pipelineDone[5] },
  ];
  // 처음에는 아직 끝나지 않은 첫 단계만 펼친다.
  const [openSteps, setOpenSteps] = useState<Set<string>>(
    () => new Set([steps.find((s) => !s.done && !s.later)?.id ?? "publish"]),
  );
  const [activeStep, setActiveStep] = useState(steps[0].id);
  const stepStatus = (id: string) => {
    const step = steps.find((s) => s.id === id);
    return step?.done ? ("done" as const) : step?.later ? ("later" as const) : undefined;
  };
  const toggleStep = (id: string) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const goToStep = (id: string) => {
    setOpenSteps((prev) => new Set(prev).add(id));
    window.requestAnimationFrame(() =>
      document.getElementById(`editor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  // 지금 화면에 보이는 단계를 위쪽 단계 표시에 나타낸다.
  useEffect(() => {
    const onScroll = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-section]"));
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const current = atBottom ? sections[sections.length - 1] : sections.filter((el) => el.getBoundingClientRect().top <= 220).pop();
      setActiveStep(current?.dataset.section ?? "basic");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    errs.push(
      ...lessonPublishProblems({
        status: form.status,
        direction: form.direction,
        video: { youtubeId: youtubeId ?? "", endTime: endSec ?? 0 },
        script: { cues: form.cues, plain: form.plain ?? undefined },
      }),
    );
    return errs;
  };

  const sectionParam: Record<string, string> = backSection ? { section: backSection } : {};

  const save = async () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return goToStep("publish");
    const now = nowIso();
    const base = baseRef.current;
    const lesson: Lesson = {
      // base.version이 그대로 실려 서버가 편집을 시작한 버전과 비교한다. (Supabase 저장소)
      ...(base ?? { id: createId("lesson"), createdAt: now }),
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
              ...(base?.source?.videoTitle ? { videoTitle: base.source.videoTitle } : {}),
            }
          : undefined,
      script: {
        source: form.scriptSource,
        cues: form.cues,
        updatedAt:
          base && base.script.cues === form.cues && (base.script.plain ?? null) === form.plain
            ? base.script.updatedAt
            : now,
        origin: Object.keys(form.origin).length ? form.origin : undefined,
        plain: form.plain ?? undefined,
      },
      draft: form.draft ?? undefined,
      dialogues: form.dialogues.length ? form.dialogues : undefined,
      captionMask: captionMaskToSave(maskBase.current, form.captionMask),
      updatedAt: now,
    };
    try {
      const saved = await lessonStore.save(lesson);
      baseRef.current = saved;
      setConflict(null);
      savedForm.current = JSON.stringify(form);
      maskBase.current = { stored: lesson.captionMask, shown: form.captionMask };
      setNotice("학습자료를 저장했어요.");
      if (!existing) navigate("admin-editor", { id: saved.id, saved: 1, ...sectionParam });
    } catch (err) {
      // 다른 사람이 먼저 저장한 경우: 편집 내용은 그대로 두고 안내한다. (강제 저장은 없다)
      const c = lessonConflictOf(err);
      if (c) {
        setConflict(c);
        setErrors([]);
        return goToStep("publish");
      }
      // 담당하지 않는 과목 등 서버가 거절한 경우
      setErrors([err instanceof ApiError ? err.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요."]);
      goToStep("publish");
    }
  };

  /** 사용자가 고른 경우에만: 서버의 최신 학습자료로 편집 화면을 바꾼다. (저장하지 않은 편집 내용은 사라진다) */
  const reloadLatest = async () => {
    if (!baseRef.current) return;
    setReloading(true);
    try {
      const latest = await lessonStore.get(baseRef.current.id);
      if (!latest) {
        setErrors(["학습자료를 찾을 수 없어요. 삭제되었을 수 있어요."]);
        return;
      }
      const next = fromLesson(latest);
      baseRef.current = latest;
      maskBase.current = { stored: latest.captionMask, shown: next.captionMask };
      savedForm.current = JSON.stringify(next);
      setForm(next);
      setConflict(null);
      setErrors([]);
      setNotice("최신본을 불러왔어요.");
      refreshAllStores();
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : "최신본을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."]);
    } finally {
      setReloading(false);
    }
  };

  // 목록으로: 관리자는 전체 강의의 그 과목, 교수자는 담당 강의의 주차별 학습자료
  const isAdmin = user?.provider === "admin";
  const backToList = () =>
    isAdmin
      ? navigate("admin-course", { course: form.courseId })
      : navigate("teach-course", { id: form.courseId, tab: "lessons", ...sectionParam });

  const remove = async () => {
    if (!existing) return;
    try {
      await lessonStore.remove(existing.id);
      setNavigationGuard(null);
      backToList();
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : "삭제하지 못했어요."]);
    }
  };

  const youtubePart = youtubeId ? `${formatTime(startSec ?? 0)} – ${endSec !== null ? formatTime(endSec) : "끝 미정"}` : "영상 없음";
  const dirty = JSON.stringify(form) !== savedForm.current;
  const publishProblems = lessonPublishProblems({
    status: "published",
    direction: form.direction,
    video: { youtubeId: youtubeId ?? "", endTime: endSec ?? 0 },
    script: { cues: form.cues, plain: form.plain ?? undefined },
  });

  return (
    <div className="page">
      <PageIntro
        title={existing ? "학습자료 편집" : "학습자료 만들기"}
        desc="YouTube 영상과 자막/스크립트로 주차별 학습자료를 만들어요."
      >
        <button className="btn btn-soft btn-sm" onClick={backToList}>
          ← {isAdmin ? "전체 강의·학습자료" : "주차별 학습자료"}
        </button>
      </PageIntro>

      <SharedLessonNote />

      <div className="editor-toolbar">
        <nav className="editor-steps" aria-label="제작 단계">
          {steps.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${s.done ? "done" : ""} ${activeStep === s.id ? "active" : ""}`}
              aria-current={activeStep === s.id ? "step" : undefined}
              onClick={() => goToStep(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="editor-save">
          <span className={`editor-dirty ${dirty ? "on" : ""}`}>{dirty ? "저장되지 않은 변경사항" : "저장됨"}</span>
          <StatusBadge status={form.status} />
          <button className="btn btn-primary btn-sm" onClick={save}>
            {existing ? "저장" : "학습자료 생성"}
          </button>
        </div>
      </div>

      <EditorSectionsContext.Provider value={{ isOpen: (id) => openSteps.has(id), toggle: toggleStep }}>
        <EditorSection
          id="basic"
          title="기본 정보"
          summary={`${form.week}주차 · ${getLevel(form.level).label} · ${form.title.trim() || "제목 없음"}`}
          status={stepStatus("basic")}
        >
          <div className="form-grid four">
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
              <span>권장 학습 난이도</span>
              <select value={form.level} onChange={(e) => set("level", e.target.value)}>
                <option value="">미지정</option>
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
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
              <span>학습자료 제목 *</span>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="예: 가족의 일상 속 실생활 표현"
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
            <label className="field span-all">
              <span>설명</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="학습자에게 보여줄 짧은 소개"
              />
            </label>
          </div>
          <small className="muted">
            권장 학습 난이도는 대본을 확인한 뒤 정해요. 학생 화면에 ‘권장 수준’으로 보이고, 콘텐츠 개수와는 관계없어요.
          </small>
        </EditorSection>

        <EditorSection id="video" step={1} title="영상 및 학습 구간" summary={youtubePart} status={stepStatus("video")}>
          <div className="video-grid">
            <div>
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
              <VideoCheckPanel lookup={lookup} youtubeId={youtubeId} lang={sourceLang} />
              {youtubeId ? (
                <StudySpanSummary
                  videoLength={lookup.state.status === "ready" ? lookup.state.info.video.lengthSeconds : null}
                  startSec={startSec}
                  endSec={endSec}
                />
              ) : null}
            </div>
            <div>
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
            </div>
          </div>
        </EditorSection>

        <EditorSection
          id="script"
          step={2}
          title={`${sourceName} 원문 스크립트 · 번역 · 병음`}
          summary={status.secured ? `자막 ${status.timedCount || status.plainCount}줄` : "원문 확보 필요"}
          status={stepStatus("script")}
        >
          <ScriptSection
            cues={form.cues}
            hasDialogues={form.dialogues.length > 0}
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
        </EditorSection>

        <EditorSection
          id="sync"
          step={3}
          title="자막 시간 맞추기"
          summary={status.synced ? "동기화 완료" : sourceSecured ? "동기화 필요" : "원문 확보 후 진행"}
          status={stepStatus("sync")}
        >
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
        </EditorSection>

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
          contentStatus={stepStatus("content")}
          reviewStatus={stepStatus("review")}
        />

        <DialogueSection
          cues={form.cues}
          dialogues={form.dialogues}
          youtubeId={youtubeId}
          status={stepStatus("dialogue")}
          onChange={({ cues, dialogues }) => setForm((f) => ({ ...f, cues: cues ?? f.cues, dialogues }))}
        />

        <EditorSection id="publish" step={7} title="저장 · 공개" summary={STATUS_LABEL[form.status]} status={stepStatus("publish")}>
          <div className="publish-panel">
            <p className="publish-state">
              지금 저장된 상태 {existing ? <StatusBadge status={existing.status} /> : <span className="muted">아직 저장 전</span>}
            </p>
            {publishProblems.length === 0 ? (
              <p className="publish-check ok">✓ 공개할 수 있어요. 원문 · YouTube 영상 · 학습 구간 끝 시간이 모두 있어요.</p>
            ) : (
              <div className="publish-check no">
                <b>아직 공개할 수 없어요.</b>
                <ul>
                  {publishProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="save-bar">
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
                {/* 삭제는 관리자만 (서버도 관리자만 허용). 교강사는 ‘준비 중’으로 바꿔 비공개로 둔다. */}
                {existing && isAdmin && !confirmDelete ? (
                  <button className="link-btn danger" onClick={() => setConfirmDelete(true)}>
                    학습자료 삭제
                  </button>
                ) : null}
                {existing && existing.video.youtubeId ? (
                  <button className="btn btn-soft" onClick={() => navigate("lesson", { lesson: existing.id })}>
                    학습 화면 미리보기
                  </button>
                ) : null}
                <button className="btn btn-primary" onClick={save}>
                  {existing ? "저장" : "학습자료 생성"}
                </button>
              </div>
              {existing && isAdmin && confirmDelete ? (
                <div className="delete-confirm" role="alert">
                  <b>이 학습자료를 삭제할까요?</b>
                  <span className="small">
                    학습자료는 강의의 모든 분반이 함께 쓰는 공통 콘텐츠예요. 삭제하면 같은 강의의 모든 교강사와 학생에게서 사라지고
                    되돌릴 수 없어요. 잠시 숨기려면 공개 상태를 ‘준비 중’으로 바꿔 주세요.
                  </span>
                  <label className="field">
                    <span>확인을 위해 ‘삭제’를 입력해 주세요</span>
                    <input value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)} autoComplete="off" />
                  </label>
                  <span className="row-start">
                    <button className="btn btn-sm btn-danger" disabled={deleteWord.trim() !== "삭제"} onClick={remove}>
                      영구 삭제
                    </button>
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => {
                        setConfirmDelete(false);
                        setDeleteWord("");
                      }}
                    >
                      취소
                    </button>
                  </span>
                </div>
              ) : null}
              {conflict ? (
                <div className="form-conflict" role="alert">
                  <p className="form-conflict-title">다른 사용자가 이 강의자료를 먼저 수정했습니다.</p>
                  {conflict.updatedByLabel || conflict.updatedAt ? (
                    <p>
                      {conflict.updatedByLabel ? `${conflict.updatedByLabel}님이` : "다른 사용자가"}
                      {conflict.updatedAt ? ` ${formatDateTime(conflict.updatedAt)}에` : ""} 먼저 저장했습니다.
                    </p>
                  ) : null}
                  <p className="small">
                    지금 화면의 편집 내용은 그대로 남아 있지만, 이 상태로는 저장할 수 없어요. 최신본을 다시 불러오면 저장하지 않은
                    편집 내용은 사라지니 필요한 내용은 먼저 따로 적어 두세요.
                  </p>
                  <button className="btn btn-primary btn-sm" onClick={() => void reloadLatest()} disabled={reloading}>
                    {reloading ? "불러오는 중…" : "최신본 다시 불러오기"}
                  </button>
                </div>
              ) : null}
              {errors.length > 0 ? (
                <ul className="form-errors">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              {notice ? <p className="form-notice">✅ {notice}</p> : null}
            </div>
          </div>
        </EditorSection>
      </EditorSectionsContext.Provider>

      {leaveTo !== null ? (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="leave-title">
            <h3 id="leave-title" className="card-title">
              저장하지 않은 변경 내용이 있어요
            </h3>
            <p className="muted small">이 화면을 나가면 저장하지 않은 내용이 사라져요.</p>
            <div className="row-start" style={{ marginTop: 14 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setLeaveTo(null)}>
                계속 편집
              </button>
              <button
                className="btn btn-soft btn-sm"
                onClick={() => {
                  setNavigationGuard(null);
                  window.location.hash = leaveTo;
                }}
              >
                저장하지 않고 나가기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "../../../content";
import type {
  LearningDirection,
  LessonScript,
  PlainScript,
  ScriptSource,
  SubtitleCue,
} from "../../../content/types";
import {
  LANG_NAME,
  describeCaptionFailure,
  fetchCaptionTrack,
  type CaptionFailure,
} from "../../lib/captionsApi";
import type { CaptionLang, CaptionTrackSummary } from "../../lib/captionTypes";
import { SpeechToSubtitle } from "./SpeechToSubtitle";
import { mergeTrack, parsePlainText, parseSrt, scriptStatus, type CueLang } from "../../lib/subtitles";
import { nowIso } from "../../store/localJson";
import type { CaptionLookup } from "./useCaptionLookup";

export type ScriptOrigin = NonNullable<LessonScript["origin"]>;

/** 학습 방향의 원문 언어: 중국어 → 한국어는 중국어, 한국어 → 중국어는 한국어 */
export const sourceLangFor = (direction: LearningDirection): CaptionLang =>
  direction === "zh-ko" ? "zh" : "ko";

/** 원문 언어 cue 수 — 1개 이상이면 원문 확보 완료 */
export const countSourceCues = (cues: SubtitleCue[], lang: CaptionLang) =>
  cues.filter((c) => c[lang]?.trim()).length;

export const KindBadge: React.FC<{ kind: CaptionTrackSummary["kind"] }> = ({ kind }) =>
  kind === "asr" ? (
    <span className="pill pill-cream">자동 생성 자막 · 정확도 확인 필요</span>
  ) : (
    <span className="pill pill-mint">수동 자막</span>
  );

const formatLength = (sec: number | null) => (sec === null ? "—" : formatTime(sec));

/** 2단계 ‘영상 확인’ 결과: 영상 정보 + 원문 언어 자막 트랙 요약 */
export const VideoCheckPanel: React.FC<{
  lookup: CaptionLookup;
  youtubeId: string | null;
  lang: CaptionLang;
}> = ({ lookup, youtubeId, lang }) => {
  const { state } = lookup;
  return (
    <div className="video-check">
      <button
        type="button"
        className="btn btn-soft btn-sm"
        onClick={() => void lookup.check()}
        disabled={!youtubeId || state.status === "loading"}
      >
        {state.status === "loading" ? "확인 중…" : "🔎 영상 확인"}
      </button>
      {state.status === "ready" ? (
        <div className="video-check-result">
          <b>{state.info.video.title || "(제목 없음)"}</b>
          <small className="muted">
            {state.info.video.author} · 원본 길이 {formatLength(state.info.video.lengthSeconds)}
          </small>
          {state.info.video.playableInEmbed === false ? (
            <small className="field-error">
              ⚠️ 외부 사이트 재생이 제한된 영상이라 학습 화면에서 재생되지 않을 수 있어요.
            </small>
          ) : null}
          <small>
            {LANG_NAME[lang]} 원문 자막:{" "}
            {state.info.tracks.length === 0
              ? "없음"
              : `수동 ${state.info.tracks.filter((t) => t.kind === "manual").length}개 · 자동 생성 ${
                  state.info.tracks.filter((t) => t.kind === "asr").length
                }개`}
          </small>
        </div>
      ) : null}
      {state.status === "error" ? (
        <small className="field-error">{describeCaptionFailure(state.error, lang).reason}</small>
      ) : null}
      {state.status === "idle" && youtubeId ? (
        <small className="muted">영상 정보와 {LANG_NAME[lang]} 자막 트랙을 확인해요.</small>
      ) : null}
    </div>
  );
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; track: CaptionTrackSummary; count: number }
  | { status: "error"; title: string; reason: string };

const PREVIEW_LIMIT = 40;

/**
 * 2단계 원문 자막/스크립트:
 * YouTube 원문 자막 가져오기(수동 → 자동 생성) → 실패 시 SRT 업로드·붙여넣기 → 타임코드별 확인·수정.
 * 타임코드가 있는 결과는 같은 SubtitleCue 구조(mergeTrack)로 들어간다.
 * SRT가 없으면 원문 텍스트를 직접 입력한다(PlainScript, 시간은 3단계에서 지정).
 */
export const ScriptSection: React.FC<{
  cues: SubtitleCue[];
  origin: ScriptOrigin;
  direction: LearningDirection;
  youtubeId: string | null;
  lookup: CaptionLookup;
  /** source를 생략하면 기존 자막 출처(script.source)를 유지한다. (문장 수정 시) */
  onChange: (cues: SubtitleCue[], origin: ScriptOrigin, source?: ScriptSource) => void;
  plain: PlainScript | null;
  onPlainChange: (plain: PlainScript | null) => void;
  /** 학습 구간 (음성으로 자막 만들기에서 구간만 잘라 인식할 때) */
  segmentStart: number;
  segmentEnd: number | null;
}> = ({ cues, origin, direction, youtubeId, lookup, onChange, plain, onPlainChange, segmentStart, segmentEnd }) => {
  const sourceLang = sourceLangFor(direction);
  const targetLang: CaptionLang = sourceLang === "zh" ? "ko" : "zh";
  const sourceName = LANG_NAME[sourceLang];
  const langLabel = (l: CueLang) => `${LANG_NAME[l]} ${l === sourceLang ? "원문" : "번역"}`;

  const [selected, setSelected] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [srtLang, setSrtLang] = useState<CueLang>(sourceLang);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [highlightSrt, setHighlightSrt] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [plainText, setPlainText] = useState("");
  const [plainMessage, setPlainMessage] = useState<string | null>(null);
  const srtRef = useRef<HTMLDivElement>(null);

  // 학습 방향(원문 언어)이 바뀌면 자동 가져오기 상태와 SRT 언어를 원문 기준으로 맞춘다.
  useEffect(() => {
    setSrtLang(sourceLang);
    setFetchState({ status: "idle" });
    setHighlightSrt(false);
  }, [sourceLang]);

  const info = lookup.state.status === "ready" ? lookup.state.info : null;
  useEffect(() => {
    if (info && !info.tracks.some((t) => t.id === selected)) setSelected(info.recommendedTrackId);
  }, [info, selected]);

  const sourceCount = useMemo(() => countSourceCues(cues, sourceLang), [cues, sourceLang]);
  const targetCount = useMemo(() => countSourceCues(cues, targetLang), [cues, targetLang]);
  const status = scriptStatus(cues, plain, sourceLang);
  // 원문 문장 수와 시간이 지정된 문장 수 (타임코드 자막은 모두 시간이 있음)
  const plainSource = plain && plain.lang === sourceLang ? plain : null;
  const sourceTotal = status.timedCount || status.plainCount;
  const sourceTimed =
    status.timedCount > 0 ? status.timedCount : (plainSource?.lines.filter((l) => l.start !== null).length ?? 0);

  /** 원문 텍스트 등록: 같은 위치의 같은 문장은 이미 지정한 시작 시각을 유지한다. */
  const registerPlain = () => {
    const texts = parsePlainText(plainText);
    if (texts.length === 0) {
      setPlainMessage("등록할 문장이 없어요. 한 줄에 한 문장씩 입력해 주세요.");
      return;
    }
    const prev = plain && plain.lang === sourceLang ? plain.lines : [];
    const lines = texts.map((text, i) => ({ text, start: prev[i]?.text === text ? prev[i].start : null }));
    // 원문 언어의 타임코드 자막은 원문 텍스트로 대체한다. (원문은 한 가지 방식만 사용)
    const nextOrigin = { ...origin };
    delete nextOrigin[sourceLang];
    onChange(sourceCount > 0 ? mergeTrack(cues, [], sourceLang) : cues, nextOrigin, "text");
    onPlainChange({ lang: sourceLang, lines, updatedAt: nowIso() });
    setPlainMessage(`${sourceName} 원문 ${lines.length}문장을 등록했어요. 3단계에서 시간을 맞출 수 있어요.`);
    setPlainText("");
  };

  /** trackFound: 원문 트랙은 확인했지만 본문 다운로드에서 실패한 경우 */
  const failWith = (error: CaptionFailure, otherLanguages?: string[], trackFound = false) => {
    const bodyBlocked = trackFound && (error.code === "empty-track" || error.code === "youtube-changed");
    setFetchState({
      status: "error",
      ...(bodyBlocked
        ? {
            title: `${sourceName} 원문 자막 트랙을 확인했습니다.`,
            reason: "다만 YouTube의 자막 접근 정책으로 인해 자막 본문을 자동으로 가져오지 못했습니다.",
          }
        : describeCaptionFailure(error, sourceLang, otherLanguages)),
    });
    // 같은 화면의 SRT 업로드/붙여넣기로 이어지도록 원문 언어로 맞추고 강조한다.
    setSrtLang(sourceLang);
    setHighlightSrt(true);
    window.setTimeout(() => srtRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const importFromYouTube = async () => {
    if (!youtubeId) return;
    setFetchState({ status: "loading" });
    let current = info;
    if (!current) {
      const r = await lookup.check();
      if (!r.ok) return failWith(r.error);
      current = r.data;
    }
    if (current.tracks.length === 0) {
      return failWith(
        { code: current.hasAnyCaptions ? "no-language" : "no-captions" },
        current.otherLanguages,
      );
    }
    const trackId =
      selected && current.tracks.some((t) => t.id === selected) ? selected : current.recommendedTrackId!;
    const r = await fetchCaptionTrack(youtubeId, sourceLang, trackId);
    if (!r.ok) return failWith(r.error, undefined, true);
    const { track, cues: imported } = r.data;
    onChange(
      mergeTrack(cues, imported, sourceLang),
      {
        ...origin,
        [sourceLang]: {
          provider: "youtube",
          languageCode: track.languageCode,
          kind: track.kind,
          trackName: track.name,
          fetchedAt: nowIso(),
        },
      },
      "youtube",
    );
    onPlainChange(null); // 타임코드 원문 자막이 원문 텍스트를 대체한다.
    setHighlightSrt(false);
    setFetchState({ status: "success", track, count: imported.length });
  };

  const convert = (raw: string, fileName: string | null) => {
    const parsed = parseSrt(raw);
    if (parsed.length === 0) {
      setMessage("변환할 자막을 찾지 못했어요. SRT 형식(번호 · 00:00:01,000 --> 00:00:02,000 · 대사)을 확인해 주세요.");
      return;
    }
    onChange(
      mergeTrack(cues, parsed, srtLang),
      { ...origin, [srtLang]: { provider: "srt", fileName, fetchedAt: nowIso() } },
      "srt",
    );
    setMessage(`${langLabel(srtLang)} 자막 ${parsed.length}개를 변환했어요.`);
    if (srtLang === sourceLang) {
      setHighlightSrt(false);
      onPlainChange(null); // 타임코드 원문 자막이 원문 텍스트를 대체한다.
    }
    setText("");
  };

  const editCue = (index: number, lang: CueLang, value: string) => {
    const next = cues.map((c, i) => (i === index ? { ...c, [lang]: value || undefined } : c));
    const o = origin[lang];
    onChange(next, o && !o.edited ? { ...origin, [lang]: { ...o, edited: true } } : origin);
  };

  const sourceOrigin = origin[sourceLang];
  const rows = showAll ? cues : cues.slice(0, PREVIEW_LIMIT);

  return (
    <section className="card">
      <div className="card-head">
        <h3 className="card-title">
          <span className="step">2</span> {sourceName} 원문 스크립트 확보
        </h3>
        <span className="row-start">
          {status.secured ? (
            <span className="pill pill-mint">
              ✅ 원문 확보 완료 · {status.timedCount || status.plainCount}문장
            </span>
          ) : (
            <span className="pill pill-pink">원문 확보 필요</span>
          )}
          {status.secured ? (
            status.synced ? (
              <span className="pill pill-sky">⏱ 시간 동기화 완료</span>
            ) : (
              <span className="pill pill-cream">⏱ 시간 동기화 필요</span>
            )
          ) : null}
        </span>
      </div>
      <p className="muted small">
        {direction === "zh-ko" ? "1~8주차형(중국어 → 한국어)" : "9~15주차형(한국어 → 중국어)"} 강의자료는{" "}
        <b>{sourceName} 원문</b>이 있어야 표현·문화렌즈·퀴즈 제작과 공개를 진행할 수 있어요.
      </p>

      {/* 자동 가져오기 */}
      <div className="caption-auto">
        {!youtubeId ? (
          <p className="muted small">1단계에 YouTube URL을 입력하면 {sourceName} 자막을 자동으로 가져올 수 있어요.</p>
        ) : (
          <>
            {info && info.tracks.length > 0 ? (
              <div className="track-list" role="radiogroup" aria-label={`${sourceName} 자막 트랙`}>
                {info.tracks.map((t) => (
                  <label key={t.id} className={`track-option ${selected === t.id ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="caption-track"
                      checked={selected === t.id}
                      onChange={() => setSelected(t.id)}
                    />
                    <span>
                      <b>{t.name || t.languageCode}</b> <small className="muted">({t.languageCode})</small>
                    </span>
                    <KindBadge kind={t.kind} />
                    {t.id === info.recommendedTrackId ? <small className="muted">추천</small> : null}
                  </label>
                ))}
              </div>
            ) : null}
            <div className="row-start">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void importFromYouTube()}
                disabled={fetchState.status === "loading" || lookup.state.status === "loading"}
              >
                {fetchState.status === "loading" ? "가져오는 중…" : `⤓ ${sourceName} 자막 가져오기`}
              </button>
              <small className="muted">
                수동 자막을 먼저 찾고, 없으면 자동 생성 자막을 사용해요. 자동 번역 자막은 원문으로 쓰지 않아요.
              </small>
            </div>
          </>
        )}

        {fetchState.status === "success" ? (
          <div className="caption-result ok">
            <b>
              {fetchState.track.name || fetchState.track.languageCode} 자막 {fetchState.count}개를 가져왔어요.
            </b>{" "}
            <KindBadge kind={fetchState.track.kind} />
            <p className="small">아래 표에서 타임코드별 문장을 확인하고 필요하면 직접 수정해 주세요.</p>
          </div>
        ) : null}
        {fetchState.status === "error" ? (
          <div className="caption-result fail" role="alert">
            <b>{fetchState.title}</b>
            <p className="small">{fetchState.reason}</p>
            <p className="small">
              👇 아래에서 <b>{sourceName} SRT 파일을 업로드</b>하거나 <b>SRT 내용을 붙여넣어</b> 원문 스크립트를 등록해 주세요.
            </p>
          </div>
        ) : null}
        {sourceOrigin && fetchState.status === "idle" ? (
          <p className="muted small">
            현재 {sourceName} 원문 출처:{" "}
            {sourceOrigin.provider === "youtube"
              ? `YouTube ${sourceOrigin.kind === "asr" ? "자동 생성 자막" : "수동 자막"} (${sourceOrigin.languageCode})`
              : sourceOrigin.provider === "speech"
                ? `음성 인식 (${sourceOrigin.fileName ?? "파일"}) · 검수 필요`
                : `SRT ${sourceOrigin.fileName ? `파일 ${sourceOrigin.fileName}` : "붙여넣기"}`}
            {sourceOrigin.edited ? " · 교수자 수정됨" : ""}
            {sourceOrigin.provider === "youtube" && sourceOrigin.kind === "asr" ? " · 정확도 확인 필요" : ""}
          </p>
        ) : null}
      </div>

      {/* 자막이 없는 영상: 파일의 음성을 인식해 원문 자막 만들기 */}
      <SpeechToSubtitle
        lang={sourceLang}
        langLabel={langLabel(sourceLang)}
        segmentStart={segmentStart}
        segmentEnd={segmentEnd}
        onCues={(parsed, fileName) => {
          onChange(
            mergeTrack(cues, parsed, sourceLang),
            { ...origin, [sourceLang]: { provider: "speech", fileName, fetchedAt: nowIso() } },
            "srt",
          );
          setHighlightSrt(false);
          onPlainChange(null); // 타임코드 원문 자막이 원문 텍스트를 대체한다.
        }}
      />

      {/* SRT 업로드/붙여넣기 (자동 가져오기 실패 시 대체 경로) */}
      <div className={`script-import ${highlightSrt ? "highlight" : ""}`} ref={srtRef}>
        <div className="row-start">
          <b className="small">SRT 업로드 / 붙여넣기</b>
          <div className="seg">
            {([sourceLang, targetLang] as CueLang[]).map((l) => (
              <button
                key={l}
                type="button"
                className={srtLang === l ? "active" : ""}
                aria-pressed={srtLang === l}
                onClick={() => setSrtLang(l)}
              >
                {langLabel(l)}
              </button>
            ))}
          </div>
          <label className="btn btn-soft btn-sm file-btn">
            SRT 파일 업로드
            <input
              type="file"
              accept=".srt,.vtt,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void file.text().then((t) => convert(t, file.name));
              }}
            />
          </label>
        </div>
        <textarea
          className="srt-input"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"1\n00:02:23,900 --> 00:02:25,600\n你怎么穿成这样啊\n\n2\n…"}
        />
        <div className="row-start">
          <button className="btn btn-primary btn-sm" onClick={() => convert(text, null)} disabled={!text.trim()}>
            자막 변환하기
          </button>
          {cues.length > 0 ? (
            <button className="link-btn" onClick={() => onChange([], {}, "manual")}>
              자막 모두 지우기
            </button>
          ) : null}
          {message ? <small className="muted">{message}</small> : null}
        </div>
      </div>

      {/* 원문 텍스트 직접 입력 (타임코드 없음 — 시간은 3단계에서 지정) */}
      <div className="script-import plain-import">
        <div className="row-start">
          <b className="small">원문 텍스트 직접 입력</b>
          <small className="muted">
            SRT가 없을 때 이미 확보한 {sourceName} 원문을 한 줄에 한 문장씩 붙여넣어 주세요. 빈 줄은 빼고 순서대로
            저장해요.
          </small>
        </div>
        <textarea
          className="srt-input"
          rows={5}
          value={plainText}
          onChange={(e) => setPlainText(e.target.value)}
          placeholder={
            sourceLang === "zh"
              ? "你怎么穿成这样啊\n今天我第一天开学\n我准备穿着这身去\n…"
              : "오늘 첫 출근이야\n이렇게 입고 가려고\n…"
          }
        />
        <div className="row-start">
          <button className="btn btn-primary btn-sm" onClick={registerPlain} disabled={!plainText.trim()}>
            {sourceName} 원문 텍스트 등록
          </button>
          {plain ? (
            <>
              <button className="link-btn" onClick={() => setPlainText(plain.lines.map((l) => l.text).join("\n"))}>
                등록된 원문 불러와 고치기
              </button>
              <button
                className="link-btn"
                onClick={() => {
                  onPlainChange(null);
                  setPlainMessage(null);
                }}
              >
                원문 텍스트 지우기
              </button>
            </>
          ) : null}
          {plainMessage ? <small className="muted">{plainMessage}</small> : null}
        </div>
        {plain && plain.lang !== sourceLang ? (
          <small className="field-error">
            저장된 원문 텍스트는 {LANG_NAME[plain.lang]}예요. 현재 학습 방향의 원문 언어({sourceName})와 달라 원문으로
            인정되지 않아요.
          </small>
        ) : null}
        {sourceCount > 0 ? (
          <small className="muted">
            등록하면 현재 {sourceName} 타임코드 자막 대신 이 원문 텍스트를 원문으로 사용해요.
          </small>
        ) : null}
      </div>

      {/* 타임코드별 확인·수정 */}
      <div className="script-preview">
        {/* 원문 텍스트(시간 없음)와 타임코드 자막을 구분해서 보여준다. */}
        <p className="script-stats">
          <span>
            등록된 {sourceName} 원문 <b>{sourceTotal}</b>문장
          </span>
          <span>
            시간 동기화 <b>{sourceTimed}</b> / {sourceTotal}문장
          </span>
          <span>
            {LANG_NAME[targetLang]} 번역 자막 <b>{targetCount}</b>문장
          </span>
        </p>
        {cues.length > 0 ? (
          <p className="muted small">
            아래 표: 타임코드 자막 {cues.length}개 · 칸을 눌러 문장을 직접 수정할 수 있어요.
          </p>
        ) : plainSource ? (
          <p className="muted small">
            원문 텍스트는 시간 정보 없이 저장돼요. 문장 확인·수정과 시간 지정은 3단계 ‘자막 시간 맞추기’에서 할 수 있어요.
          </p>
        ) : null}
        {cues.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>시간</th>
                <th>{langLabel(sourceLang)}</th>
                <th>{langLabel(targetLang)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={`${c.start}-${i}`}>
                  <td className="tabular">
                    {formatTime(c.start)}–{formatTime(c.end)}
                  </td>
                  {([sourceLang, targetLang] as CueLang[]).map((l) => (
                    <td key={l} className={l === "zh" ? "zh" : ""}>
                      <input
                        className="cue-input"
                        value={c[l] ?? ""}
                        onChange={(e) => editCue(i, l, e.target.value)}
                        placeholder="—"
                        aria-label={`${formatTime(c.start)} ${langLabel(l)}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {cues.length > PREVIEW_LIMIT ? (
          <button className="link-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "접기" : `전체 보기 (${cues.length}개)`}
          </button>
        ) : null}
      </div>
    </section>
  );
};

import React, { useEffect, useRef, useState } from "react";
import type { CaptionMask, PlainScript, PlainScriptLine } from "../../../content/types";
import { CaptionMaskBox } from "../../learning/CaptionMask";
import { useYouTubeClock, type VideoClock } from "../../learning/useVideoClock";
import { formatClock, isPlainSynced, parseClock, plainSyncIssues } from "../../lib/subtitles";
import { nowIso } from "../../store/localJson";

/** 시각 직접 수정 ("mm:ss.s"): 입력을 마치면(blur/Enter) 반영한다. 빈 값은 초기화(null). */
export const TimeInput: React.FC<{
  value: number | null;
  onCommit: (v: number | null) => void;
  label: string;
  placeholder?: string;
  /** 잘못된 형식일 때 안내 문구를 함께 표시 */
  showError?: boolean;
}> = ({ value, onCommit, label, placeholder = "미지정", showError = false }) => {
  const shown = value === null ? "" : formatClock(value);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(shown);
    setBad(false);
  }, [shown]);
  const commit = () => {
    if (text.trim() === shown) return;
    if (!text.trim()) return onCommit(null);
    const v = parseClock(text);
    if (v === null) return setBad(true);
    onCommit(Math.round(v * 10) / 10);
  };
  const input = (
    <input
      className={`sync-time ${bad ? "bad" : ""}`}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={bad}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
  if (!showError) return input;
  return (
    <span className="time-field">
      {input}
      {bad ? <small className="field-error">시간 형식을 확인해 주세요. (예: 02:48.3)</small> : null}
    </span>
  );
};

const SyncList: React.FC<{
  lines: PlainScriptLine[];
  current: number;
  onCurrent: (i: number) => void;
  onLine: (i: number, patch: Partial<PlainScriptLine>) => void;
  onAssign: ((i: number) => void) | null;
  clock: VideoClock | null;
  segmentStart: number;
  segmentEnd: number | null;
}> = ({ lines, current, onCurrent, onLine, onAssign, clock, segmentStart, segmentEnd }) => {
  const issues = plainSyncIssues(lines);
  const listRef = useRef<HTMLOListElement>(null);

  // 현재 문장이 목록 안에서 보이도록 목록만 스크롤한다.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.children[current] as HTMLElement | undefined;
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop || el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: el.offsetTop - list.clientHeight / 3, behavior: "smooth" });
    }
  }, [current]);

  return (
    <ol className="sync-list" ref={listRef}>
      {lines.map((l, i) => {
        const outside =
          l.start !== null && (l.start < segmentStart || (segmentEnd !== null && l.start >= segmentEnd));
        return (
          <li
            key={i}
            className={`sync-row ${i === current ? "current" : ""} ${issues[i] ? "bad" : ""}`}
            onFocus={() => onCurrent(i)}
            onClick={() => onCurrent(i)}
          >
            <span className="sync-num">{i + 1}</span>
            <input
              className="cue-input sync-text"
              value={l.text}
              onChange={(e) => onLine(i, { text: e.target.value })}
              aria-label={`${i + 1}번 문장`}
            />
            <TimeInput
              value={l.start}
              onCommit={(start) => onLine(i, { start })}
              label={`${i + 1}번 문장 시작 시각`}
            />
            <span className="sync-actions">
              {onAssign ? (
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  disabled={!clock?.ready}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssign(i);
                  }}
                >
                  ⏱ 현재 재생시간 지정
                </button>
              ) : null}
              {clock && l.start !== null ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    clock.seekTo(l.start!);
                    clock.play();
                  }}
                >
                  ▶ 확인
                </button>
              ) : null}
              <button
                type="button"
                className="link-btn"
                disabled={l.start === null}
                onClick={() => onLine(i, { start: null })}
              >
                초기화
              </button>
            </span>
            {issues[i] === "order" ? (
              <small className="field-error sync-note">⚠️ 앞 문장보다 이르거나 같은 시각이에요. 순서를 확인해 주세요.</small>
            ) : outside ? (
              <small className="muted sync-note">학습 구간 밖의 시각이에요.</small>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
};

/** 영상 플레이어 + 문장 목록. 열었을 때만 YouTube 플레이어를 불러온다. */
const SyncWorkbench: React.FC<{
  youtubeId: string;
  plain: PlainScript;
  current: number;
  onCurrent: (i: number) => void;
  onLine: (i: number, patch: Partial<PlainScriptLine>) => void;
  segmentStart: number;
  segmentEnd: number | null;
  mask: CaptionMask | null;
}> = ({ youtubeId, plain, current, onCurrent, onLine, segmentStart, segmentEnd, mask }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const clock = useYouTubeClock(hostRef, youtubeId, plain.lines[current]?.start ?? segmentStart);
  const n = plain.lines.length;
  const line = plain.lines[current];
  // 가리기 영역 미리보기: 지금 재생 시각에 해당하는(이미 시간을 지정한) 문장
  const nowLine = [...plain.lines].reverse().find((l) => l.start !== null && l.start <= clock.time);

  const assign = (i: number) => {
    onLine(i, { start: Math.round(clock.time * 10) / 10 });
    onCurrent(Math.min(i + 1, n - 1));
  };

  return (
    <div className="sync-bench">
      <div className="sync-stage">
        <div className="sync-player">
          <div ref={hostRef} className="yt-host" />
          {mask ? (
            <div className="overlay-layer">
              <CaptionMaskBox mask={mask}>
                {nowLine ? (
                  <div className="ko-subtitle in-mask">
                    <span>{nowLine.text}</span>
                  </div>
                ) : null}
              </CaptionMaskBox>
            </div>
          ) : null}
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
          <button
            type="button"
            className="btn btn-soft btn-sm"
            disabled={!clock.ready}
            onClick={() => clock.seekTo(Math.max(0, clock.time - 3))}
          >
            ↺ 3초 뒤로
          </button>
          <button
            type="button"
            className="link-btn"
            disabled={!clock.ready}
            onClick={() => clock.seekTo(segmentStart)}
          >
            학습 시작 지점으로
          </button>
          <span className="time-readout tabular">{formatClock(clock.time)}</span>
        </div>
        <div className="sync-current">
          <small className="muted">
            현재 문장 {current + 1} / {n}
          </small>
          <b>{line?.text}</b>
          <div className="row-start">
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={current === 0}
              onClick={() => onCurrent(current - 1)}
            >
              ← 이전 문장
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!clock.ready}
              onClick={() => assign(current)}
            >
              ⏱ 현재 재생시간 지정
            </button>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={current >= n - 1}
              onClick={() => onCurrent(current + 1)}
            >
              다음 문장 →
            </button>
          </div>
          <small className="muted">
            영상을 재생하다가 문장이 시작될 때 버튼을 누르면 그 시각이 저장되고 다음 문장으로 넘어가요.
          </small>
        </div>
      </div>
      <SyncList
        lines={plain.lines}
        current={current}
        onCurrent={onCurrent}
        onLine={onLine}
        onAssign={assign}
        clock={clock}
        segmentStart={segmentStart}
        segmentEnd={segmentEnd}
      />
    </div>
  );
};

/**
 * 3단계 자막 시간 맞추기: 타임코드 없이 등록한 원문 문장에 영상을 보며 시작 시각을 지정한다.
 * 끝 시각은 다음 문장의 시작(마지막 문장은 학습 구간 끝)으로 계산한다.
 */
export const ScriptSyncPanel: React.FC<{
  /** 현재 원문 언어의 원문 텍스트 (없으면 null) */
  plain: PlainScript | null;
  onPlainChange: (plain: PlainScript) => void;
  /** 원문 언어의 타임코드 자막 수 (YouTube/SRT) */
  timedCount: number;
  sourceName: string;
  youtubeId: string | null;
  segmentStart: number;
  segmentEnd: number | null;
  /** 원본 영상 자막 가리기 (켜져 있을 때만) */
  mask: CaptionMask | null;
}> = ({ plain, onPlainChange, timedCount, sourceName, youtubeId, segmentStart, segmentEnd, mask }) => {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const n = plain?.lines.length ?? 0;
  useEffect(() => {
    if (current > 0 && current >= n) setCurrent(Math.max(0, n - 1));
  }, [current, n]);

  const synced = timedCount > 0 || isPlainSynced(plain);
  const assigned = plain?.lines.filter((l) => l.start !== null).length ?? 0;
  const orderErrors = plain ? plainSyncIssues(plain.lines).filter(Boolean).length : 0;

  const onLine = (i: number, patch: Partial<PlainScriptLine>) => {
    if (!plain) return;
    onPlainChange({
      ...plain,
      lines: plain.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)),
      updatedAt: nowIso(),
    });
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3 className="card-title">
          <span className="step">3</span> 자막 시간 맞추기
        </h3>
        {timedCount > 0 || n > 0 ? (
          synced ? (
            <span className="pill pill-mint">⏱ 시간 동기화 완료</span>
          ) : (
            <span className="pill pill-cream">⏱ 시간 동기화 필요</span>
          )
        ) : null}
      </div>
      <p className="muted small">
        원문 문장마다 영상 속 시작 시각을 맞추면 영상 위 자막뿐 아니라, 그 문장과 연결한 핵심 표현·어휘·문법·문화렌즈가
        해당 장면에 맞춰 나타나요.
      </p>

      {timedCount > 0 ? (
        <p className="muted small">
          ✅ 타임코드가 있는 {sourceName} 원문 자막(YouTube/SRT)을 사용 중이라 시간 맞추기가 필요 없어요.
        </p>
      ) : !plain ? (
        <p className="muted small">
          2단계에서 원문 텍스트를 직접 입력하면, 영상을 보며 문장마다 시작 시각을 지정해 영상 위 자막으로 쓸 수 있어요.
        </p>
      ) : (
        <>
          {!synced ? (
            <p className="sync-hint">
              영상 위 동기화 자막과 시점 기반 모션그래픽을 사용하려면 자막 시간 맞추기가 필요합니다.
              <br />
              <small>시간을 맞추지 않아도 4단계 학습 콘텐츠 제작은 지금 바로 진행할 수 있어요.</small>
            </p>
          ) : null}
          <div className="row-start">
            <small>
              시간 지정 <b>{assigned}</b> / {n}문장
              {orderErrors > 0 ? <span className="field-error"> · 순서 오류 {orderErrors}개</span> : null}
            </small>
            {youtubeId ? (
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setOpen((v) => !v)}>
                {open ? "영상 닫기" : "▶ 영상 보며 시간 맞추기"}
              </button>
            ) : (
              <small className="muted">시간을 맞추려면 1단계에 YouTube URL을 입력해 주세요.</small>
            )}
          </div>
          {open && youtubeId ? (
            <SyncWorkbench
              youtubeId={youtubeId}
              plain={plain}
              current={current}
              onCurrent={setCurrent}
              onLine={onLine}
              segmentStart={segmentStart}
              segmentEnd={segmentEnd}
              mask={mask}
            />
          ) : (
            <SyncList
              lines={plain.lines}
              current={current}
              onCurrent={setCurrent}
              onLine={onLine}
              onAssign={null}
              clock={null}
              segmentStart={segmentStart}
              segmentEnd={segmentEnd}
            />
          )}
        </>
      )}
    </section>
  );
};

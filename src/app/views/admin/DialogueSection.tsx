import React, { useEffect, useRef, useState } from "react";
import { formatTime } from "../../../content";
import type { DialogueRole, LessonDialogue, SubtitleCue } from "../../../content/types";
import { useSegmentPlayback, useYouTubeClock } from "../../learning/useVideoClock";
import {
  addDialogueRole,
  assignRolesInTurn,
  createDialogueFromCues,
  dialogueMissingCount,
  dialoguePublishProblems,
  dialogueSourceEmptyCount,
  removeDialogueRole,
  resolveDialogueLine,
} from "../../lib/dialogues";
import { EditorSection } from "./EditorSection";

/** 구간 확인용 재생: 다른 편집 패널과 같은 방식의 영상을 열어 구간 끝에서 멈춘다. */
const RangePlayer: React.FC<{ youtubeId: string; start: number; end: number; onClose: () => void }> = ({
  youtubeId,
  start,
  end,
  onClose,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const clock = useYouTubeClock(hostRef, youtubeId, start);
  const { ready } = clock;
  const segment = useSegmentPlayback(clock);
  const replay = () => segment.play(start, end);
  useEffect(() => {
    if (ready) replay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, start, end]);
  return (
    <div className="dialogue-player">
      <div className="sync-player">
        <div ref={hostRef} className="yt-host" />
        {!ready && !clock.error ? <div className="video-loading">영상을 불러오는 중…</div> : null}
        {clock.error ? (
          <div className="video-error">
            <b>{clock.error}</b>
          </div>
        ) : null}
      </div>
      <div className="row-start">
        <button type="button" className="btn btn-soft btn-sm" disabled={!ready} onClick={replay}>
          ▶ 다시 재생
        </button>
        <small className="muted tabular">
          {formatTime(start)} – {formatTime(end)}
        </small>
        <button type="button" className="link-btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
};

/** 1단계: 기존 자막에서 연속 구간 고르기. 첫 클릭이 시작, 다음 클릭이 끝이고 한 번 더 누르면 새로 고른다. */
const CueRangePicker: React.FC<{
  cues: SubtitleCue[];
  youtubeId: string | null;
  onCreate: (from: number, to: number) => void;
  onCancel: () => void;
}> = ({ cues, youtubeId, onCreate, onCancel }) => {
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const pick = (i: number) => {
    setPlaying(false);
    if (from === null || to !== null) {
      setFrom(i);
      setTo(null);
    } else {
      setFrom(Math.min(from, i));
      setTo(Math.max(from, i));
    }
  };
  const last = to ?? from;
  const inRange = (i: number) => from !== null && last !== null && i >= from && i <= last;
  const count = from !== null && last !== null ? last - from + 1 : 0;

  return (
    <div className="dialogue-panel">
      <b>회화 연습에 쓸 자막 구간 고르기</b>
      <p className="muted small">시작 줄과 끝 줄을 차례로 누르세요. 연속된 구간만 고를 수 있어요.</p>
      <ol className="cue-picker">
        {cues.map((c, i) => (
          <li key={c.id ?? `${c.start}-${i}`}>
            <button type="button" className={inRange(i) ? "selected" : ""} aria-pressed={inRange(i)} onClick={() => pick(i)}>
              <span className="cue-picker-no">{i + 1}</span>
              <span className="cue-picker-time tabular">{formatTime(c.start)}</span>
              <span className="cue-picker-text">{c.zh || <span className="muted">(중국어 없음)</span>}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="small">
        {count > 0 && from !== null && last !== null ? (
          <>
            <b>{count}줄 선택</b> · {from + 1}~{last + 1}번 · {formatTime(cues[from].start)} – {formatTime(cues[last].end)}
          </>
        ) : (
          <span className="muted">아직 고르지 않았어요.</span>
        )}
      </p>
      {playing && youtubeId && from !== null && last !== null ? (
        <RangePlayer
          youtubeId={youtubeId}
          start={cues[from].start}
          end={cues[last].end}
          onClose={() => setPlaying(false)}
        />
      ) : null}
      <div className="row-start">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={from === null || last === null}
          onClick={() => from !== null && last !== null && onCreate(from, last)}
        >
          이 구간으로 만들기
        </button>
        {youtubeId ? (
          <button type="button" className="btn btn-soft btn-sm" disabled={count === 0} onClick={() => setPlaying(true)}>
            ▶ 선택 구간 재생
          </button>
        ) : null}
        <button type="button" className="btn btn-soft btn-sm" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
};

/** 2단계: 제목·상황·역할·줄별 화자·공개 상태 편집 */
const DialogueEditor: React.FC<{
  dialogue: LessonDialogue;
  cues: SubtitleCue[];
  youtubeId: string | null;
  onChange: (dialogue: LessonDialogue) => void;
  onClose: () => void;
}> = ({ dialogue, cues, youtubeId, onChange, onClose }) => {
  const [roleError, setRoleError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const set = (patch: Partial<LessonDialogue>) => onChange({ ...dialogue, ...patch });
  const problems = dialoguePublishProblems(dialogue, cues);
  const lines = dialogue.lines.map((l) => resolveDialogueLine(l, cues));
  const removeRole = (role: DialogueRole) => {
    const next = removeDialogueRole(dialogue, role.id);
    if (!next) return setRoleError(`‘${role.name}’ 역할이 지정된 대사가 있어요. 그 줄의 역할을 먼저 바꿔 주세요.`);
    setRoleError(null);
    onChange(next);
  };

  return (
    <div className="dialogue-panel">
      <div className="form-grid">
        <label className="field">
          <span>제목 *</span>
          <input value={dialogue.title} onChange={(e) => set({ title: e.target.value })} placeholder="회화 연습 제목" />
        </label>
        <label className="field">
          <span>공개 상태</span>
          <select
            value={dialogue.status}
            onChange={(e) => set({ status: e.target.value as LessonDialogue["status"] })}
          >
            <option value="draft">준비 중</option>
            <option value="published" disabled={problems.length > 0 && dialogue.status !== "published"}>
              공개{problems.length > 0 ? " (조건 부족)" : ""}
            </option>
          </select>
        </label>
        <label className="field span-2">
          <span>상황 설명 *</span>
          <textarea rows={2} value={dialogue.situation} onChange={(e) => set({ situation: e.target.value })} />
        </label>
      </div>

      <div>
        <b className="small">역할</b>
        <div className="dialogue-roles">
          {dialogue.roles.map((r) => (
            <span key={r.id} className="dialogue-role">
              <input
                value={r.name}
                aria-label="역할 이름"
                onChange={(e) =>
                  set({ roles: dialogue.roles.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)) })
                }
              />
              <button type="button" className="link-btn danger" onClick={() => removeRole(r)} aria-label={`${r.name} 역할 삭제`}>
                삭제
              </button>
            </span>
          ))}
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onChange(addDialogueRole(dialogue))}>
            + 역할 추가
          </button>
        </div>
        {roleError ? (
          <p className="field-error small" role="alert">
            {roleError}
          </p>
        ) : null}
      </div>

      <div>
        <div className="row-start">
          <b className="small">줄별 화자 ({dialogue.lines.length}줄)</b>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            disabled={dialogue.roles.length === 0}
            title="역할을 순서대로 번갈아 넣어요. 다른 줄은 직접 고쳐 주세요."
            onClick={() => onChange(assignRolesInTurn(dialogue))}
          >
            번갈아 채우기
          </button>
          {youtubeId && lines.length > 0 ? (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPlaying(true)}>
              ▶ 구간 재생
            </button>
          ) : null}
        </div>
        {playing && youtubeId && lines.length > 0 ? (
          <RangePlayer
            youtubeId={youtubeId}
            start={lines[0].start}
            end={lines[lines.length - 1].end}
            onClose={() => setPlaying(false)}
          />
        ) : null}
        <ol className="dialogue-lines">
          {lines.map((l) => (
            <li key={l.id}>
              <div className="dialogue-line-text">
                <small className="muted tabular">{formatTime(l.start)}</small>
                <b>{l.zh}</b>
                {l.ko ? <small className="muted">{l.ko}</small> : null}
                {l.connection === "missing" ? <span className="pill pill-pink">자막 연결 끊김</span> : null}
                {l.sourceEmpty ? <span className="pill pill-cream">자막 원문 확인 필요</span> : null}
              </div>
              <div className="dialogue-line-roles" role="group" aria-label="화자">
                {dialogue.roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={l.roleId === r.id ? "active" : ""}
                    aria-pressed={l.roleId === r.id}
                    onClick={() =>
                      set({
                        lines: dialogue.lines.map((x) =>
                          x.id === l.id ? { ...x, roleId: x.roleId === r.id ? "" : r.id } : x,
                        ),
                      })
                    }
                  >
                    {r.name || "(이름 없음)"}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {problems.length > 0 ? (
        <div className="publish-check no">
          <b>{dialogue.status === "published" ? "공개 조건이 부족해 학생에게 보이지 않아요." : "공개하려면 필요한 것"}</b>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="row-start">
        <button type="button" className="btn btn-soft btn-sm" onClick={onClose}>
          편집 닫기
        </button>
        <small className="muted">내용은 맨 위 ‘저장’을 눌러야 학습자료에 저장돼요.</small>
      </div>
    </div>
  );
};

/** 학습자료 편집의 회화 연습 단계. 선택 단계이며 학습자료 공개 조건과는 관계없다. */
export const DialogueSection: React.FC<{
  cues: SubtitleCue[];
  dialogues: LessonDialogue[];
  youtubeId: string | null;
  status?: "done" | "later";
  /** 자막 식별자 부여와 회화 연습 추가를 한 번에 반영한다. */
  onChange: (next: { cues?: SubtitleCue[]; dialogues: LessonDialogue[] }) => void;
}> = ({ cues, dialogues, youtubeId, status, onChange }) => {
  const [picking, setPicking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const hasCues = cues.some((c) => c.zh?.trim());
  const missing = dialogues.reduce((n, d) => n + dialogueMissingCount(d, cues), 0);
  const summary = dialogues.length
    ? `회화 연습 ${dialogues.length}개${missing ? ` · 연결 끊김 ${missing}줄` : ""}`
    : "선택 단계";

  return (
    <EditorSection id="dialogue" step={6} title="회화 연습" summary={summary} status={status}>
      <p className="muted small">
        이 장면의 실제 대사를 활용해 역할별 말하기 연습을 만들 수 있어요. 회화 연습도 이 강의의 공통 학습자료로 모든 분반에
        동일하게 반영돼요.
      </p>

      {dialogues.length > 0 ? (
        <ul className="dialogue-list">
          {dialogues.map((d) => {
            const broken = dialogueMissingCount(d, cues);
            const sourceEmpty = dialogueSourceEmptyCount(d, cues);
            return (
              <li key={d.id}>
                <div className="dialogue-item">
                  <span className="dialogue-item-main">
                    <b>{d.title || "(제목 없음)"}</b>
                    <small className="muted">
                      역할 {d.roles.length}명 · 대사 {d.lines.length}줄
                    </small>
                  </span>
                  <span className={`pill ${d.status === "published" ? "pill-mint" : "pill-cream"}`}>
                    {d.status === "published" ? "공개" : "준비 중"}
                  </span>
                  {broken ? <span className="pill pill-pink">연결 끊김 {broken}줄</span> : null}
                  {sourceEmpty ? <span className="pill pill-cream">자막 원문 확인 필요 {sourceEmpty}줄</span> : null}
                  {confirmDelete === d.id ? (
                    <span className="row-start">
                      <span className="small">삭제할까요?</span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setConfirmDelete(null);
                          if (editingId === d.id) setEditingId(null);
                          onChange({ dialogues: dialogues.filter((x) => x.id !== d.id) });
                        }}
                      >
                        삭제
                      </button>
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => setConfirmDelete(null)}>
                        취소
                      </button>
                    </span>
                  ) : (
                    <span className="row-start">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setEditingId(editingId === d.id ? null : d.id)}
                      >
                        {editingId === d.id ? "편집 닫기" : "편집"}
                      </button>
                      <button type="button" className="link-btn danger" onClick={() => setConfirmDelete(d.id)}>
                        삭제
                      </button>
                    </span>
                  )}
                </div>
                {editingId === d.id ? (
                  <DialogueEditor
                    dialogue={d}
                    cues={cues}
                    youtubeId={youtubeId}
                    onChange={(next) => onChange({ dialogues: dialogues.map((x) => (x.id === d.id ? next : x)) })}
                    onClose={() => setEditingId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!hasCues ? (
        <p className="scope-note">회화 연습을 만들려면 먼저 타임코드가 포함된 원문 자막을 준비해주세요.</p>
      ) : null}

      {picking ? (
        <CueRangePicker
          cues={cues}
          youtubeId={youtubeId}
          onCancel={() => setPicking(false)}
          onCreate={(from, to) => {
            const created = createDialogueFromCues(cues, from, to);
            onChange({ cues: created.cues, dialogues: [...dialogues, created.dialogue] });
            setPicking(false);
            setEditingId(created.dialogue.id);
          }}
        />
      ) : (
        <div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!hasCues} onClick={() => setPicking(true)}>
            + 회화 연습 추가
          </button>
        </div>
      )}
    </EditorSection>
  );
};

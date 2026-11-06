import React, { useState } from "react";
import { courseWeeks } from "../../../content/courseWeeks";
import {
  MATERIAL_STATUS_LABEL,
  MATERIAL_TEXT_LIMITS,
  MAX_MATERIALS_PER_WEEK,
  materialFormProblem,
  safeHttpsUrl,
  type MaterialFormValues,
} from "../../../content/materialRules";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { materialStore } from "../../store";
import { useWeekMaterials, type MaterialsState } from "../../store/hooks";
import type { WeekMaterial, WeekMaterialStatus } from "../../store/models";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** 자료 링크: https만, 새 탭(opener·referrer 없이). 안전하지 않은 주소면 글자로만 보여 준다. */
export const MaterialLink: React.FC<{ material: Pick<WeekMaterial, "url" | "title">; children?: React.ReactNode }> = ({
  material,
  children,
}) => {
  const href = safeHttpsUrl(material.url);
  if (!href) return <span className="muted">{children ?? material.title}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="material-link">
      {children ?? material.title}
      <span className="sr-only"> (새 탭에서 열림)</span>
    </a>
  );
};

/** 자료 제목: 링크는 새 탭 링크, 파일(3-C 전)은 글자만 */
const MaterialTitle: React.FC<{ m: WeekMaterial }> = ({ m }) =>
  m.kind === "file" ? <span className="material-link is-file">📄 {m.title}</span> : <MaterialLink material={m}>🔗 {m.title}</MaterialLink>;

type FormProps = {
  heading: string;
  weekCount: number;
  initial: MaterialFormValues & { week: number; status: WeekMaterialStatus };
  showStatus: boolean;
  submitLabel: string;
  onSubmit: (v: MaterialFormValues & { week: number; status: WeekMaterialStatus }) => Promise<string | null>;
  onCancel?: () => void;
};

/** 링크 자료 입력 (등록·수정 공통). onSubmit이 오류 문구를 돌려주면 폼에 보여 준다. */
const MaterialForm: React.FC<FormProps> = ({ heading, weekCount, initial, showStatus, submitLabel, onSubmit, onCancel }) => {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem = materialFormProblem(v);
    if (problem) return setError(problem);
    setBusy(true);
    const failed = await onSubmit({ ...v, title: v.title.trim(), description: v.description.trim(), url: v.url.trim() });
    setBusy(false);
    if (failed) setError(failed);
  };
  return (
    <form className="material-form" onSubmit={(e) => void submit(e)} aria-label={heading}>
      <b className="small">{heading}</b>
      <div className="form-grid">
        <label className="field">
          <span>자료 제목 *</span>
          <input
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={MATERIAL_TEXT_LIMITS.title}
            placeholder="예: 3주차 표현 정리 노트"
            required
          />
        </label>
        <label className="field">
          <span>주차</span>
          <select value={v.week} onChange={(e) => set("week", Number(e.target.value))}>
            {courseWeeks(weekCount).map((w) => (
              <option key={w} value={w}>
                {w}주차
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span>링크 주소 (https) *</span>
          <input
            type="url"
            inputMode="url"
            value={v.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://"
            required
          />
          <small className="muted">https://로 시작하는 주소만 등록돼요. 학생 화면에서는 새 탭으로 열려요.</small>
        </label>
        <label className="field span-2">
          <span>설명</span>
          <textarea
            rows={2}
            value={v.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={MATERIAL_TEXT_LIMITS.description}
            placeholder="학생에게 보여 줄 짧은 안내 (선택)"
          />
        </label>
        {showStatus ? (
          <label className="field-check span-2">
            <input type="checkbox" checked={v.status === "published"} onChange={(e) => set("status", e.target.checked ? "published" : "draft")} />
            <span>바로 공개 (체크하지 않으면 비공개로 저장돼 학생에게 보이지 않아요)</span>
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="field-error small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
          {busy ? "저장 중…" : submitLabel}
        </button>
        {onCancel ? (
          <button className="btn btn-soft btn-sm" type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
        ) : null}
      </div>
    </form>
  );
};

const emptyForm = (week: number) => ({ title: "", description: "", url: "", week, status: "draft" as WeekMaterialStatus });

/** 자료 한 줄: 제목·링크·상태와 순서·공개·수정·삭제 */
const MaterialRow: React.FC<{
  m: WeekMaterial;
  index: number;
  count: number;
  weekCount: number;
  editable: boolean;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  run: (work: () => Promise<unknown>, done: string, fallback: string) => Promise<string | null>;
}> = ({ m, index, count, weekCount, editable, busy, onMove, run }) => {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (editing) {
    return (
      <li className="material-row is-editing">
        <MaterialForm
          heading={`자료 수정 · ${m.title}`}
          weekCount={weekCount}
          initial={{ title: m.title, description: m.description, url: m.url, week: m.week, status: m.status }}
          showStatus={false}
          submitLabel="저장"
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            const failed = await run(
              () => materialStore.update(m.id, { title: v.title, description: v.description, url: v.url, week: v.week }),
              v.week !== m.week ? `${v.week}주차로 옮겼어요.` : "자료를 저장했어요.",
              "자료를 저장하지 못했어요.",
            );
            if (!failed) setEditing(false);
            return failed;
          }}
        />
      </li>
    );
  }
  const next: WeekMaterialStatus = m.status === "published" ? "draft" : "published";
  const isFile = m.kind === "file";
  return (
    <li className="material-row">
      <div className="material-main">
        <span className="row-start">
          <MaterialTitle m={m} />
          <span className={`pill ${m.status === "published" ? "pill-mint" : "pill-cream"}`}>{MATERIAL_STATUS_LABEL[m.status]}</span>
        </span>
        <small className="muted">{isFile ? `${m.fileName ?? "파일"} · 파일 열기는 준비 중` : hostOf(m.url)}</small>
        {m.description ? <p className="small">{m.description}</p> : null}
      </div>
      {editable ? (
        <div className="material-actions">
          <button className="btn btn-quiet btn-sm" aria-label={`${m.title} 위로`} disabled={busy || index === 0} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button
            className="btn btn-quiet btn-sm"
            aria-label={`${m.title} 아래로`}
            disabled={busy || index === count - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button
            className="btn btn-soft btn-sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => materialStore.update(m.id, { status: next }),
                next === "published" ? "학생에게 공개했어요." : "비공개로 바꿨어요. 학생에게 보이지 않아요.",
                "공개 상태를 바꾸지 못했어요.",
              )
            }
          >
            {next === "published" ? "공개" : "비공개"}
          </button>
          {isFile ? null : (
            <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => setEditing(true)}>
              수정
            </button>
          )}
          {confirming ? (
            <span className="row-start" role="alertdialog" aria-label="자료 삭제 확인">
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => void run(() => materialStore.remove(m.id), "자료를 삭제했어요.", "자료를 삭제하지 못했어요.")}
              >
                삭제 확인
              </button>
              <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => setConfirming(false)}>
                취소
              </button>
            </span>
          ) : (
            <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setConfirming(true)}>
              삭제
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
};

/**
 * 주차별 추가 자료 (교수자·관리자): 주차를 골라 외부 링크 자료를 등록·수정·삭제·순서 변경·공개 전환한다.
 * 영상 학습자료(주차별 학습자료)와 따로 저장되고, 강의의 모든 분반이 함께 쓴다.
 * editable=false: 목록만 (예: 비활성 분반만 담당 — 서버도 편집을 거부한다)
 */
export const WeekMaterialsPanel: React.FC<{
  courseId: string;
  weekCount: number;
  materials: MaterialsState;
  editable: boolean;
}> = ({ courseId, weekCount, materials, editable }) => {
  const toast = useToast();
  const [week, setWeek] = useState(1);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownWeek = Math.min(Math.max(week, 1), weekCount);

  const run = async (work: () => Promise<unknown>, done: string, fallback: string): Promise<string | null> => {
    setBusy(true);
    try {
      await work();
      toast.show(done, "success");
      return null;
    } catch (err) {
      const msg = errorText(err, fallback);
      toast.show(msg, "error");
      return msg;
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="material-head">
      <h3 className="section-title">📎 주차별 추가 자료</h3>
      <p className="muted small">
        영상 학습자료와 별도로 주차마다 참고 링크를 여러 개 둘 수 있어요. 강의의 모든 분반이 함께 보고, ‘공개’한 자료만 학생에게
        보여요.
      </p>
    </div>
  );

  if (materials.state === "off" || materials.state === "loading") {
    return (
      <section className="card material-panel">
        {header}
        <p className="muted small">불러오는 중…</p>
      </section>
    );
  }
  if (materials.state === "error") {
    return (
      <section className="card material-panel">
        {header}
        <p className="field-error small" role="alert">
          추가 자료를 불러오지 못했어요. ({materials.message})
        </p>
      </section>
    );
  }

  const list = materials.list;
  const inWeek = list.filter((m) => m.week === shownWeek);
  const countOf = (w: number) => list.filter((m) => m.week === w).length;
  const full = inWeek.length >= MAX_MATERIALS_PER_WEEK;

  const move = (index: number, dir: -1 | 1) => {
    const ids = inWeek.map((m) => m.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void run(() => materialStore.reorder(courseId, shownWeek, ids), "순서를 바꿨어요.", "순서를 바꾸지 못했어요.");
  };

  return (
    <section className="card material-panel">
      {header}
      <div className="row-start">
        <label className="field material-week-pick">
          <span>주차</span>
          <select
            value={shownWeek}
            onChange={(e) => {
              setWeek(Number(e.target.value));
              setAdding(false);
            }}
          >
            {courseWeeks(weekCount).map((w) => (
              <option key={w} value={w}>
                {w}주차{countOf(w) ? ` · ${countOf(w)}개` : ""}
              </option>
            ))}
          </select>
        </label>
        {editable && !adding ? (
          <button className="btn btn-primary btn-sm" disabled={busy || full} onClick={() => setAdding(true)}>
            + 링크 자료 추가
          </button>
        ) : null}
      </div>
      {full && editable ? <p className="muted small">한 주차에는 자료를 {MAX_MATERIALS_PER_WEEK}개까지 등록할 수 있어요.</p> : null}
      {!editable ? <p className="scope-note">운영 중인 담당 분반이 있을 때 자료를 편집할 수 있어요. 지금은 목록만 볼 수 있어요.</p> : null}

      {adding ? (
        <MaterialForm
          heading={`${shownWeek}주차에 링크 자료 추가`}
          weekCount={weekCount}
          initial={emptyForm(shownWeek)}
          showStatus
          submitLabel="등록"
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            const failed = await run(
              () => materialStore.create(courseId, v),
              v.status === "published" ? "자료를 등록하고 공개했어요." : "자료를 비공개로 등록했어요.",
              "자료를 등록하지 못했어요.",
            );
            if (!failed) {
              setAdding(false);
              setWeek(v.week);
            }
            return failed;
          }}
        />
      ) : null}

      {inWeek.length === 0 ? (
        <p className="muted small">{shownWeek}주차에 등록한 추가 자료가 없어요.</p>
      ) : (
        <ol className="material-list">
          {inWeek.map((m, i) => (
            <MaterialRow
              key={m.id}
              m={m}
              index={i}
              count={inWeek.length}
              weekCount={weekCount}
              editable={editable}
              busy={busy}
              onMove={(dir) => move(i, dir)}
              run={run}
            />
          ))}
        </ol>
      )}
    </section>
  );
};

/** 학생: 한 주차의 공개 추가 자료 (없으면 아무것도 그리지 않는다) */
export const WeekMaterialList: React.FC<{ items: WeekMaterial[] }> = ({ items }) =>
  items.length === 0 ? null : (
    <ul className="material-student-list" aria-label="추가 자료">
      {items.map((m) => (
        <li key={m.id}>
          <MaterialTitle m={m} />
          {m.description ? <small className="muted"> — {m.description}</small> : null}
        </li>
      ))}
    </ul>
  );

/** 학습 화면: 이번 주차의 공개 추가 자료 (학습자만 불러온다, 없거나 못 불러오면 아무것도 그리지 않는다) */
export const LessonWeekMaterials: React.FC<{ courseId: string; week: number }> = ({ courseId, week }) => {
  const { user } = useAuth();
  const materials = useWeekMaterials(courseId, user?.role === "learner");
  if (materials.state !== "ready") return null;
  const items = materials.list.filter((m) => m.week === week && m.status === "published");
  if (items.length === 0) return null;
  return (
    <section className="card lesson-materials" aria-label={`${week}주차 추가 자료`}>
      <b>📎 {week}주차 추가 자료</b>
      <WeekMaterialList items={items} />
    </section>
  );
};

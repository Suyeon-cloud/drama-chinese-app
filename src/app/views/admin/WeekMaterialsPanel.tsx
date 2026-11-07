import React, { useRef, useState } from "react";
import { courseWeeks } from "../../../content/courseWeeks";
import {
  MATERIAL_FILE_ACCEPT,
  MATERIAL_PREVIEW_MIME_TYPES,
  MATERIAL_STATUS_LABEL,
  MATERIAL_TEXT_LIMITS,
  MAX_MATERIALS_PER_WEEK,
  formatBytes,
  materialFileProblem,
  materialFormProblem,
  safeHttpsUrl,
  type MaterialFormValues,
} from "../../../content/materialRules";
import {
  MATERIAL_HTML_ACCEPT,
  MATERIAL_HTML_MAX_BYTES,
  htmlByteLength,
  materialHtmlExternalCount,
  materialHtmlProblem,
  materialShareHash,
} from "../../../content/materialHtml";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { materialStore } from "../../store";
import { useLessons, useWeekMaterials, type MaterialsState } from "../../store/hooks";
import { reviewIsStale } from "../../../content/lessonDeck";
import type { FileOpenMode } from "../../store/materialStore";
import type { WeekMaterial, WeekMaterialStatus } from "../../store/models";
import { HtmlMaterialFrame, copyShareLink, downloadHtmlMaterial } from "../HtmlMaterialView";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};
const canPreview = (m: Pick<WeekMaterial, "mimeType">) => !!m.mimeType && MATERIAL_PREVIEW_MIME_TYPES.includes(m.mimeType);

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

/**
 * 파일 열기·내려받기: 누를 때마다 서버에 60초짜리 주소를 받는다(서버가 권한을 다시 확인한다).
 * 미리보기는 새 탭(팝업 차단을 피하려고 먼저 빈 탭을 연다), 내려받기는 지금 탭에서 받는다(첨부 파일이라 화면은 그대로).
 */
const openMaterialFile = async (m: WeekMaterial, mode: FileOpenMode): Promise<string | null> => {
  const preview = mode === "preview" && canPreview(m);
  const win = preview ? window.open("", "_blank") : null;
  try {
    const r = await materialStore.fileUrl(m.id, preview ? "preview" : "download");
    const url = new URL(r.url, window.location.href).href;
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.location.assign(url);
    }
    return null;
  } catch (err) {
    win?.close();
    return errorText(err, "파일을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
};

/** 파일 자료의 열기·내려받기 버튼 */
const FileOpenButtons: React.FC<{ m: WeekMaterial }> = ({ m }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const open = async (mode: FileOpenMode) => {
    setBusy(true);
    const failed = await openMaterialFile(m, mode);
    setBusy(false);
    if (failed) toast.show(failed, "error");
  };
  const preview = canPreview(m);
  return (
    <span className="row-start material-file-buttons">
      <button type="button" className="link-btn material-link is-file" disabled={busy} onClick={() => void open(preview ? "preview" : "download")}>
        📄 {m.title}
        <span className="sr-only">{preview ? " (새 탭에서 열기)" : " (내려받기)"}</span>
      </button>
      {preview ? (
        <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void open("download")}>
          내려받기
        </button>
      ) : null}
    </span>
  );
};

/** HTML 학습자료: 앱 안 보기 화면(공유 링크와 같은 주소)과 .html 내려받기 */
const HtmlOpenButtons: React.FC<{ m: WeekMaterial; withDownload?: boolean }> = ({ m, withDownload = true }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <span className="row-start material-file-buttons">
      <a className="material-link is-file" href={materialShareHash(m.id)}>
        📘 {m.title}
      </a>
      {withDownload ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const failed = await downloadHtmlMaterial(m.id, m.title);
            setBusy(false);
            if (failed) toast.show(failed, "error");
          }}
        >
          .html 내려받기
        </button>
      ) : null}
    </span>
  );
};

/** 자료 제목: 링크는 새 탭 링크, 파일은 열기·내려받기 버튼, HTML은 보기·내려받기 */
const MaterialTitle: React.FC<{ m: WeekMaterial; staff?: boolean }> = ({ m, staff = false }) =>
  m.kind === "file" ? (
    <FileOpenButtons m={m} />
  ) : m.kind === "html" ? (
    <HtmlOpenButtons m={m} withDownload={!staff} />
  ) : (
    <MaterialLink material={m}>🔗 {m.title}</MaterialLink>
  );

type FormValues = MaterialFormValues & { week: number; status: WeekMaterialStatus };
type FormProps = {
  heading: string;
  weekCount: number;
  initial: FormValues;
  showStatus: boolean;
  /** false: 파일 자료 정보 수정 (링크 주소 칸 없음) */
  withUrl?: boolean;
  submitLabel: string;
  onSubmit: (v: FormValues) => Promise<string | null>;
  onCancel?: () => void;
};

/** 링크 자료 입력·파일 자료 정보 수정 (onSubmit이 오류 문구를 돌려주면 폼에 보여 준다) */
const MaterialForm: React.FC<FormProps> = ({ heading, weekCount, initial, showStatus, withUrl = true, submitLabel, onSubmit, onCancel }) => {
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
    const problem = materialFormProblem(withUrl ? v : { ...v, url: "https://example.com" });
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
        {withUrl ? (
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
        ) : null}
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

const emptyForm = (week: number): FormValues => ({ title: "", description: "", url: "", week, status: "draft" });
const progressText = (ratio: number | null) => (ratio === null ? "" : ratio >= 1 ? "파일 확인 중…" : `올리는 중 ${Math.round(ratio * 100)}%`);

type HtmlFormValues = { title: string; description: string; week: number; status: WeekMaterialStatus; html: string };

/**
 * HTML 학습자료 등록·수정: 직접 붙여 넣기 또는 .html 파일 불러오기(브라우저에서 글자로만 읽는다) → 안전한 미리보기 → 저장.
 * 화면 검사는 서버와 같은 규칙(materialHtmlProblem). 서버·DB가 한 번 더 확인한다.
 */
const HtmlMaterialForm: React.FC<{
  heading: string;
  weekCount: number;
  initial: HtmlFormValues;
  showStatus: boolean;
  submitLabel: string;
  onSubmit: (v: HtmlFormValues) => Promise<string | null>;
  onCancel: () => void;
}> = ({ heading, weekCount, initial, showStatus, submitLabel, onSubmit, onCancel }) => {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const set = <K extends keyof HtmlFormValues>(key: K, value: HtmlFormValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };
  const bytes = htmlByteLength(v.html);
  const external = materialHtmlExternalCount(v.html);
  const importFile = async (f: File | null) => {
    if (!f) return;
    if (!/\.html?$/i.test(f.name)) return setError(".html 또는 .htm 파일만 불러올 수 있어요.");
    if (f.size > MATERIAL_HTML_MAX_BYTES) return setError(`HTML은 ${MATERIAL_HTML_MAX_BYTES / 1024 / 1024}MB까지 저장할 수 있어요.`);
    const text = await f.text();
    setV((prev) => ({ ...prev, html: text, title: prev.title.trim() ? prev.title : f.name.replace(/\.[^.]+$/, "").slice(0, MATERIAL_TEXT_LIMITS.title) }));
    setError(materialHtmlProblem(text));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem = materialFormProblem({ title: v.title, description: v.description, url: "https://example.com" }) ?? materialHtmlProblem(v.html);
    if (problem) return setError(problem);
    setBusy(true);
    const failed = await onSubmit({ ...v, title: v.title.trim(), description: v.description.trim() });
    setBusy(false);
    if (failed) setError(failed);
  };
  return (
    <form className="material-form" onSubmit={(e) => void submit(e)} aria-label={heading}>
      <b className="small">{heading}</b>
      <div className="form-grid">
        <label className="field">
          <span>자료 제목 *</span>
          <input value={v.title} maxLength={MATERIAL_TEXT_LIMITS.title} disabled={busy} onChange={(e) => set("title", e.target.value)} required />
        </label>
        <label className="field">
          <span>주차</span>
          <select value={v.week} disabled={busy} onChange={(e) => set("week", Number(e.target.value))}>
            {courseWeeks(weekCount).map((w) => (
              <option key={w} value={w}>
                {w}주차
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span>설명</span>
          <textarea rows={2} value={v.description} maxLength={MATERIAL_TEXT_LIMITS.description} disabled={busy} onChange={(e) => set("description", e.target.value)} />
        </label>
        <label className="field span-2">
          <span>.html 파일 불러오기 (선택)</span>
          <input type="file" accept={MATERIAL_HTML_ACCEPT} disabled={busy} onChange={(e) => void importFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="field span-2">
          <span>HTML 내용 *</span>
          <textarea
            rows={10}
            value={v.html}
            disabled={busy}
            spellCheck={false}
            style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 }}
            onChange={(e) => set("html", e.target.value)}
            placeholder="<h1>3과 표현 정리</h1><table>…</table>"
          />
          <small className="muted">
            {(bytes / 1024).toFixed(1)}KB / {MATERIAL_HTML_MAX_BYTES / 1024 / 1024}MB · 스크립트·이벤트 속성(onclick 등)·iframe·form은 저장되지 않아요.
            이미지는 문서 안에 넣은 data: 이미지만 보여요.
          </small>
          {external > 0 ? (
            <small className="field-error" role="status">
              외부 이미지·CSS·글꼴 {external}개는 보안을 위해 표시되지 않아요. 내려받은 파일도 인터넷 없이 같은 모습으로 보여요.
            </small>
          ) : null}
        </label>
        {showStatus ? (
          <label className="field-check span-2">
            <input type="checkbox" checked={v.status === "published"} disabled={busy} onChange={(e) => set("status", e.target.checked ? "published" : "draft")} />
            <span>바로 공개 (체크하지 않으면 비공개로 저장돼 학생에게 보이지 않아요)</span>
          </label>
        ) : null}
      </div>
      {preview && v.html.trim() ? <HtmlMaterialFrame title={v.title || "미리보기"} html={v.html} height="50vh" /> : null}
      {error ? (
        <p className="field-error small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
          {busy ? "저장 중…" : submitLabel}
        </button>
        <button className="btn btn-soft btn-sm" type="button" disabled={busy || !v.html.trim()} onClick={() => setPreview((x) => !x)}>
          {preview ? "미리보기 닫기" : "미리보기"}
        </button>
        <button className="btn btn-soft btn-sm" type="button" onClick={onCancel} disabled={busy}>
          취소
        </button>
      </div>
    </form>
  );
};

/** HTML 자료 수정: 본문을 받아 온 뒤 폼을 연다 */
const HtmlEditForm: React.FC<{
  m: WeekMaterial;
  weekCount: number;
  run: (work: () => Promise<unknown>, done: string, fallback: string) => Promise<string | null>;
  onClose: () => void;
}> = ({ m, weekCount, run, onClose }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    materialStore
      .html(m.id)
      .then((d) => alive && setHtml(d.html))
      .catch((err) => alive && setError(errorText(err, "HTML 내용을 불러오지 못했어요.")));
    return () => {
      alive = false;
    };
  }, [m.id]);
  if (error) {
    return (
      <p className="field-error small" role="alert">
        {error}{" "}
        <button className="btn btn-soft btn-sm" onClick={onClose}>
          닫기
        </button>
      </p>
    );
  }
  if (html === null) return <p className="muted small">HTML 내용을 불러오는 중…</p>;
  return (
    <HtmlMaterialForm
      heading={`HTML 자료 수정 · ${m.title}`}
      weekCount={weekCount}
      initial={{ title: m.title, description: m.description, week: m.week, status: m.status, html }}
      showStatus={false}
      submitLabel="저장"
      onCancel={onClose}
      onSubmit={async (v) => {
        const failed = await run(
          () => materialStore.update(m.id, { title: v.title, description: v.description, week: v.week, html: v.html }),
          v.week !== m.week ? `${v.week}주차로 옮겼어요.` : "HTML 자료를 저장했어요.",
          "HTML 자료를 저장하지 못했어요.",
        );
        if (!failed) onClose();
        return failed;
      }}
    />
  );
};

/** 파일 자료 등록: 파일 고르기 → 업로드(진행률) → 서버 확인 → 자료 생성 */
const FileMaterialForm: React.FC<{
  courseId: string;
  weekCount: number;
  week: number;
  onDone: (week: number) => void;
  onCancel: () => void;
}> = ({ courseId, weekCount, week, onDone, onCancel }) => {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState({ title: "", description: "", week, status: "draft" as WeekMaterialStatus });
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const busy = progress !== null;
  const pick = (f: File | null) => {
    setFile(f);
    setError(f ? materialFileProblem(f) : null);
    if (f && !v.title.trim()) setV((p) => ({ ...p, title: f.name.replace(/\.[^.]+$/, "").slice(0, MATERIAL_TEXT_LIMITS.title) }));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!file) return setError("올릴 파일을 골라 주세요.");
    const problem = materialFileProblem(file) ?? materialFormProblem({ title: v.title, description: v.description, url: "https://example.com" });
    if (problem) return setError(problem);
    setProgress(0);
    try {
      await materialStore.uploadFile(courseId, { ...v, title: v.title.trim(), description: v.description.trim() }, file, setProgress);
      toast.show(v.status === "published" ? "파일 자료를 올리고 공개했어요." : "파일 자료를 비공개로 올렸어요.", "success");
      onDone(v.week);
    } catch (err) {
      setError(errorText(err, "파일 자료를 올리지 못했어요."));
    } finally {
      setProgress(null);
    }
  };
  return (
    <form className="material-form" onSubmit={(e) => void submit(e)} aria-label={`${week}주차에 파일 자료 추가`}>
      <b className="small">{week}주차에 파일 자료 추가</b>
      <div className="form-grid">
        <label className="field span-2">
          <span>파일 * (PDF·DOCX·PPTX·XLSX·HWP·HWPX·JPG·PNG·WEBP·TXT, 20MB까지)</span>
          <input type="file" accept={MATERIAL_FILE_ACCEPT} disabled={busy} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {file ? <small className="muted">{file.name} · {formatBytes(file.size)}</small> : null}
        </label>
        <label className="field">
          <span>자료 제목 *</span>
          <input value={v.title} maxLength={MATERIAL_TEXT_LIMITS.title} disabled={busy} onChange={(e) => setV({ ...v, title: e.target.value })} required />
        </label>
        <label className="field">
          <span>주차</span>
          <select value={v.week} disabled={busy} onChange={(e) => setV({ ...v, week: Number(e.target.value) })}>
            {courseWeeks(weekCount).map((w) => (
              <option key={w} value={w}>
                {w}주차
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span>설명</span>
          <textarea rows={2} value={v.description} maxLength={MATERIAL_TEXT_LIMITS.description} disabled={busy} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </label>
        <label className="field-check span-2">
          <input type="checkbox" checked={v.status === "published"} disabled={busy} onChange={(e) => setV({ ...v, status: e.target.checked ? "published" : "draft" })} />
          <span>바로 공개 (체크하지 않으면 비공개로 저장돼 학생에게 보이지 않아요)</span>
        </label>
      </div>
      <p className="muted small">PDF·이미지는 학생이 바로 열어 보고, 그 밖의 문서는 내려받아요. 학생 개인정보가 담긴 파일은 올리지 마세요.</p>
      {busy ? <p className="small" role="status">{progressText(progress)}</p> : null}
      {error ? (
        <p className="field-error small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !file}>
          {busy ? "올리는 중…" : "올리기"}
        </button>
        <button className="btn btn-soft btn-sm" type="button" onClick={onCancel} disabled={busy}>
          취소
        </button>
      </div>
    </form>
  );
};

/** 자료 한 줄: 제목·상태와 순서·공개·수정·(파일) 교체·삭제 */
const MaterialRow: React.FC<{
  m: WeekMaterial;
  index: number;
  count: number;
  weekCount: number;
  editable: boolean;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  run: (work: () => Promise<unknown>, done: string, fallback: string) => Promise<string | null>;
  /** 5-B: 자동 생성 복습 HTML의 원본 강의 수정 시각 (원본이 없으면 null) */
  sourceLessonUpdatedAt?: string | null;
}> = ({ m, index, count, weekCount, editable, busy, onMove, run, sourceLessonUpdatedAt }) => {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [replacing, setReplacing] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const isFile = m.kind === "file";
  const isHtml = m.kind === "html";
  if (editing && isHtml) {
    return (
      <li className="material-row is-editing">
        <HtmlEditForm m={m} weekCount={weekCount} run={run} onClose={() => setEditing(false)} />
      </li>
    );
  }
  if (editing) {
    return (
      <li className="material-row is-editing">
        <MaterialForm
          heading={`자료 수정 · ${m.title}`}
          weekCount={weekCount}
          initial={{ title: m.title, description: m.description, url: m.url, week: m.week, status: m.status }}
          showStatus={false}
          withUrl={!isFile}
          submitLabel="저장"
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            const failed = await run(
              () =>
                materialStore.update(m.id, {
                  title: v.title,
                  description: v.description,
                  week: v.week,
                  ...(isFile ? {} : { url: v.url }),
                }),
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
  const replace = async (file: File | null) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    const problem = materialFileProblem(file);
    if (problem) return toast.show(problem, "error");
    setReplacing(0);
    try {
      await materialStore.replaceFile(m.id, file, setReplacing);
      toast.show("파일을 바꿨어요.", "success");
    } catch (err) {
      toast.show(errorText(err, "파일을 바꾸지 못했어요."), "error");
    } finally {
      setReplacing(null);
    }
  };
  const next: WeekMaterialStatus = m.status === "published" ? "draft" : "published";
  const locked = busy || replacing !== null;
  return (
    <li className="material-row">
      <div className="material-main">
        <span className="row-start">
          <MaterialTitle m={m} staff />
          <span className={`pill ${m.status === "published" ? "pill-mint" : "pill-cream"}`}>{MATERIAL_STATUS_LABEL[m.status]}</span>
          {m.source ? (
            <span className="pill pill-sky" title="발표 모드에서 강의 데이터로 만든 복습 자료 (다시 만들기는 발표 모드의 ‘복습 HTML’에서)">
              자동 생성 복습
            </span>
          ) : null}
          {m.source && (!m.source.lessonId || sourceLessonUpdatedAt === null) ? <span className="pill pill-cream">원본 강의 없음</span> : null}
          {m.source?.lessonId && reviewIsStale(sourceLessonUpdatedAt, m.source.lessonUpdatedAt) ? (
            <span className="pill pill-cream">원본 수정됨</span>
          ) : null}
        </span>
        <small className="muted">
          {isFile ? `${m.fileName ?? "파일"}${m.sizeBytes ? ` · ${formatBytes(m.sizeBytes)}` : ""}` : isHtml ? "HTML 학습자료" : hostOf(m.url)}
        </small>
        {m.description ? <p className="small">{m.description}</p> : null}
        {replacing !== null ? <p className="small" role="status">{progressText(replacing)}</p> : null}
      </div>
      {editable ? (
        <div className="material-actions">
          <button className="btn btn-quiet btn-sm" aria-label={`${m.title} 위로`} disabled={locked || index === 0} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button className="btn btn-quiet btn-sm" aria-label={`${m.title} 아래로`} disabled={locked || index === count - 1} onClick={() => onMove(1)}>
            ↓
          </button>
          <button
            className="btn btn-soft btn-sm"
            disabled={locked}
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
          <button className="btn btn-soft btn-sm" disabled={locked} onClick={() => setEditing(true)}>
            수정
          </button>
          {isHtml ? (
            <button
              className="btn btn-soft btn-sm"
              disabled={locked}
              title={m.status === "published" ? "로그인한 수강생만 열 수 있어요" : "비공개 자료는 학생이 열 수 없어요"}
              onClick={() => void copyShareLink(m.id, toast)}
            >
              링크 복사
            </button>
          ) : null}
          {isFile ? (
            <>
              <input ref={fileInput} type="file" accept={MATERIAL_FILE_ACCEPT} hidden onChange={(e) => void replace(e.target.files?.[0] ?? null)} />
              <button className="btn btn-soft btn-sm" disabled={locked} onClick={() => fileInput.current?.click()}>
                파일 교체
              </button>
            </>
          ) : null}
          {confirming ? (
            <span className="row-start" role="alertdialog" aria-label="자료 삭제 확인">
              <button
                className="btn btn-primary btn-sm"
                disabled={locked}
                onClick={() => void run(() => materialStore.remove(m.id), "자료를 삭제했어요.", "자료를 삭제하지 못했어요.")}
              >
                삭제 확인
              </button>
              <button className="btn btn-soft btn-sm" disabled={locked} onClick={() => setConfirming(false)}>
                취소
              </button>
            </span>
          ) : (
            <button className="btn btn-quiet btn-sm" disabled={locked} onClick={() => setConfirming(true)}>
              삭제
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
};

/**
 * 주차별 추가 자료 (교수자·관리자): 주차를 골라 링크·파일 자료를 등록·수정·삭제·순서 변경·공개 전환한다.
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
  const lessons = useLessons();
  /** 5-B: 출처 강의의 지금 수정 시각 (강의 목록을 아직 못 받았으면 undefined, 강의가 없으면 null) */
  const sourceTimeOf = (m: WeekMaterial) =>
    !m.source?.lessonId || !lessons ? (m.source && !m.source.lessonId ? null : undefined) : (lessons.find((l) => l.id === m.source!.lessonId)?.updatedAt ?? null);
  const [week, setWeek] = useState(1);
  const [adding, setAdding] = useState<"link" | "file" | "html" | null>(null);
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
        영상 학습자료와 별도로 주차마다 참고 링크·파일(PDF·문서·이미지)·HTML 학습자료를 여러 개 둘 수 있어요. 강의의 모든 분반이 함께 보고,
        ‘공개’한 자료만 학생에게 보여요.
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
              setAdding(null);
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
          <>
            <button className="btn btn-primary btn-sm" disabled={busy || full} onClick={() => setAdding("link")}>
              + 링크 자료 추가
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy || full} onClick={() => setAdding("file")}>
              + 파일 자료 추가
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy || full} onClick={() => setAdding("html")}>
              + HTML 자료 추가
            </button>
          </>
        ) : null}
      </div>
      {full && editable ? <p className="muted small">한 주차에는 자료를 {MAX_MATERIALS_PER_WEEK}개까지 등록할 수 있어요.</p> : null}
      {!editable ? <p className="scope-note">운영 중인 담당 분반이 있을 때 자료를 편집할 수 있어요. 지금은 목록만 볼 수 있어요.</p> : null}

      {adding === "link" ? (
        <MaterialForm
          heading={`${shownWeek}주차에 링크 자료 추가`}
          weekCount={weekCount}
          initial={emptyForm(shownWeek)}
          showStatus
          submitLabel="등록"
          onCancel={() => setAdding(null)}
          onSubmit={async (v) => {
            const failed = await run(
              () => materialStore.create(courseId, v),
              v.status === "published" ? "자료를 등록하고 공개했어요." : "자료를 비공개로 등록했어요.",
              "자료를 등록하지 못했어요.",
            );
            if (!failed) {
              setAdding(null);
              setWeek(v.week);
            }
            return failed;
          }}
        />
      ) : null}
      {adding === "file" ? (
        <FileMaterialForm
          courseId={courseId}
          weekCount={weekCount}
          week={shownWeek}
          onCancel={() => setAdding(null)}
          onDone={(w) => {
            setAdding(null);
            setWeek(w);
          }}
        />
      ) : null}

      {adding === "html" ? (
        <HtmlMaterialForm
          heading={`${shownWeek}주차에 HTML 자료 추가`}
          weekCount={weekCount}
          initial={{ title: "", description: "", week: shownWeek, status: "draft", html: "" }}
          showStatus
          submitLabel="등록"
          onCancel={() => setAdding(null)}
          onSubmit={async (v) => {
            const failed = await run(
              () => materialStore.createHtml(courseId, v),
              v.status === "published" ? "HTML 자료를 등록하고 공개했어요." : "HTML 자료를 비공개로 등록했어요.",
              "HTML 자료를 등록하지 못했어요.",
            );
            if (!failed) {
              setAdding(null);
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
              sourceLessonUpdatedAt={sourceTimeOf(m)}
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

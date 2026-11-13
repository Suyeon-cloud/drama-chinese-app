import React, { useEffect, useMemo, useRef, useState } from "react";
import { materialHtmlDocument, materialHtmlFileName, materialShareHash, srcdocAnchors } from "../../content/materialHtml";
import { useToast } from "../components/Toast";
import { ApiError } from "../lib/api";
import { materialStore } from "../store";
import type { WeekMaterialHtml } from "../store/models";

/**
 * HTML 학습자료를 그리는 틀 (학생 화면·교수자 미리보기·5단계 발표 화면이 함께 쓴다).
 * sandbox="" — 스크립트·같은 출처 권한·팝업·양식·상위 창 이동 모두 없음. 문서 맨 앞의 CSP가 외부 리소스·스크립트를 한 번 더 막는다.
 */
export const HtmlMaterialFrame: React.FC<{
  title: string;
  html: string;
  /** 고정 높이 (fill이면 쓰지 않는다) */
  height?: string;
  /** 화면 높이에 맞춘다 (상단 바·모바일 하단 탭 바를 뺀 높이, dvh + vh 대체값) */
  fill?: boolean;
  /** '크게 보기': 같은 iframe을 앱 안 전체 화면 레이어로 키운다 (다시 불러오지 않아 스크롤 위치가 그대로) */
  expandable?: boolean;
}> = ({ title, html, height = "70vh", fill = false, expandable = false }) => {
  // 목차 등 문서 안 앵커가 앱 주소로 이동하지 않게 (표시용 문서에만 적용)
  const doc = useMemo(() => srcdocAnchors(materialHtmlDocument(title, html)), [title, html]);
  const [full, setFull] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!full) return;
    // 배경 스크롤 잠금 + 닫기 버튼으로 포커스, Esc로 닫기 (iframe 안에 포커스가 있을 때의 Esc는 문서가 받으므로 닫기 버튼을 항상 보인다)
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setFull(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [full]);
  // 닫으면 '크게 보기' 버튼으로 포커스를 돌려준다 (닫은 뒤에야 버튼이 다시 그려진다)
  const wasFull = useRef(false);
  useEffect(() => {
    if (wasFull.current && !full) openRef.current?.focus();
    wasFull.current = full;
  }, [full]);

  return (
    <div
      className={`html-frame-wrap${full ? " is-full" : ""}`}
      role={full ? "dialog" : undefined}
      aria-modal={full || undefined}
      aria-label={full ? `${title} 크게 보기` : undefined}
    >
      {/* 같은 자리(null 포함)를 유지해 iframe이 다시 만들어지지 않게 한다. 앞쪽 덫: Shift+Tab이 레이어 밖으로 나가지 않게 문서로 */}
      {full ? <span className="html-frame-trap" tabIndex={0} onFocus={() => frameRef.current?.focus()} /> : null}
      {expandable ? (
        <div className="html-frame-bar">
          {full ? <b className="html-frame-title">{title}</b> : null}
          {full ? (
            <button ref={closeRef} type="button" className="btn btn-primary btn-sm" onClick={() => setFull(false)}>
              ✕ 닫기
            </button>
          ) : (
            <button ref={openRef} type="button" className="btn btn-soft btn-sm" onClick={() => setFull(true)} aria-haspopup="dialog">
              ⛶ 크게 보기
            </button>
          )}
        </div>
      ) : null}
      {/* eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion */}
      <iframe
        ref={frameRef}
        className={`html-material-frame${fill ? " is-fill" : ""}`}
        title={`${title} (HTML 학습자료)`}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={doc}
        style={fill || full ? undefined : { height }}
      />
      {/* 전체 화면에서 Tab이 레이어 밖(뒤 화면)으로 나가지 않게: 끝에 닿으면 닫기 버튼으로 */}
      {full ? <span className="html-frame-trap" tabIndex={0} onFocus={() => closeRef.current?.focus()} /> : null}
    </div>
  );
};

/** 공유 링크 전체 주소 (앱 안 주소 — 열 때 로그인·수강 권한을 확인한다) */
export const materialShareUrl = (materialId: string) =>
  `${window.location.origin}${window.location.pathname}${materialShareHash(materialId)}`;

/** 링크 복사: 클립보드를 못 쓰면 주소를 보여 준다 */
export const copyShareLink = async (materialId: string, toast: ReturnType<typeof useToast>) => {
  const url = materialShareUrl(materialId);
  try {
    await navigator.clipboard.writeText(url);
    toast.show("공유 링크를 복사했어요. 로그인한 수강생만 열 수 있어요.", "success");
  } catch {
    window.prompt("이 주소를 복사해 공유하세요. (로그인한 수강생만 열 수 있어요)", url);
  }
};

/** .html 내려받기: 서버가 권한을 확인한 문서를 받아 저장한다 (주소에 토큰을 넣지 않는다) */
export const downloadHtmlMaterial = async (materialId: string, title: string): Promise<string | null> => {
  try {
    const blob = await materialStore.htmlFile(materialId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = materialHtmlFileName(title);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.message : "HTML 파일을 내려받지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
};

type State = { s: "loading" } | { s: "ready"; doc: WeekMaterialHtml } | { s: "error"; status: number; message: string };

/** #/material?id=… — 공유 링크로 여는 HTML 학습자료 화면 (로그인 필요, 서버가 수강·공개 여부를 확인한다) */
export const HtmlMaterialView: React.FC<{ params: URLSearchParams }> = ({ params }) => {
  const id = params.get("id") ?? "";
  const toast = useToast();
  const [state, setState] = useState<State>({ s: "loading" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setState({ s: "loading" });
    if (!id) {
      setState({ s: "error", status: 404, message: "" });
      return;
    }
    materialStore
      .html(id)
      .then((doc) => alive && setState({ s: "ready", doc }))
      .catch((err) => alive && setState({ s: "error", status: err instanceof ApiError ? err.status : 0, message: err instanceof Error ? err.message : "" }));
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.s === "loading") return <p className="muted">학습자료를 불러오는 중…</p>;
  if (state.s === "error") {
    return (
      <section className="card">
        <h2 className="section-title">학습자료를 열 수 없어요</h2>
        <p className="small">
          {state.status === 404
            ? "자료가 없거나 볼 수 있는 권한이 없어요. 수강 중인 강의의 공개 자료만 열 수 있어요. 강의코드로 수강 등록을 했는지 확인해 주세요."
            : state.message || "잠시 후 다시 시도해 주세요."}
        </p>
        <a className="btn btn-soft btn-sm" href="#/weeks">
          내 강의로
        </a>
      </section>
    );
  }
  const { doc } = state;
  return (
    <section className="card html-material-view">
      <div className="row-start" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">📘 {doc.title}</h2>
        <span className="row-start">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const failed = await downloadHtmlMaterial(doc.id, doc.title);
              setBusy(false);
              if (failed) toast.show(failed, "error");
            }}
          >
            .html 내려받기
          </button>
          <button className="btn btn-soft btn-sm" onClick={() => void copyShareLink(doc.id, toast)}>
            링크 복사
          </button>
          <button className="btn btn-quiet btn-sm" onClick={() => window.history.back()}>
            뒤로
          </button>
        </span>
      </div>
      <p className="muted small">스크립트와 외부 이미지·글꼴은 보안을 위해 실행·표시되지 않아요. 내려받은 파일은 인터넷 없이도 열 수 있어요.</p>
      <HtmlMaterialFrame title={doc.title} html={doc.html} fill expandable />
    </section>
  );
};

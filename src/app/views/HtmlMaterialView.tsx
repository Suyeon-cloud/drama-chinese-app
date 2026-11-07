import React, { useEffect, useMemo, useState } from "react";
import { materialHtmlDocument, materialHtmlFileName, materialShareHash, srcdocAnchors } from "../../content/materialHtml";
import { useToast } from "../components/Toast";
import { ApiError } from "../lib/api";
import { materialStore } from "../store";
import type { WeekMaterialHtml } from "../store/models";

/**
 * HTML 학습자료를 그리는 틀 (학생 화면·교수자 미리보기·5단계 발표 화면이 함께 쓴다).
 * sandbox="" — 스크립트·같은 출처 권한·팝업·양식·상위 창 이동 모두 없음. 문서 맨 앞의 CSP가 외부 리소스·스크립트를 한 번 더 막는다.
 */
export const HtmlMaterialFrame: React.FC<{ title: string; html: string; height?: string }> = ({ title, html, height = "70vh" }) => {
  // 목차 등 문서 안 앵커가 앱 주소로 이동하지 않게 (표시용 문서에만 적용)
  const doc = useMemo(() => srcdocAnchors(materialHtmlDocument(title, html)), [title, html]);
  return (
    // eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion
    <iframe
      className="html-material-frame"
      title={`${title} (HTML 학습자료)`}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={doc}
      style={{ width: "100%", height, border: "1px solid var(--line, #d0d7de)", borderRadius: 8, background: "#fff" }}
    />
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
      <HtmlMaterialFrame title={doc.title} html={doc.html} height="75vh" />
    </section>
  );
};

import React, { createContext, useContext } from "react";

/** 편집 화면에서 펼쳐진 영역. 여러 영역을 함께 펼칠 수 있다. */
export const EditorSectionsContext = createContext<{ isOpen: (id: string) => boolean; toggle: (id: string) => void }>({
  isOpen: () => true,
  toggle: () => undefined,
});

/**
 * 학습자료 편집의 접고 펼치는 영역. 접혀도 안의 입력·영상 상태는 그대로 유지된다.
 * 새 제작 단계는 이 컴포넌트로 감싸고 LessonEditorView의 EDITOR_STEPS에 추가하면 된다.
 */
export const EditorSection: React.FC<{
  id: string;
  step?: number;
  title: string;
  /** 접힌 상태에서도 보이는 요약 */
  summary?: string;
  status?: "done" | "later";
  children: React.ReactNode;
}> = ({ id, step, title, summary, status, children }) => {
  const { isOpen, toggle } = useContext(EditorSectionsContext);
  const open = isOpen(id);
  return (
    <section id={`editor-${id}`} data-section={id} className={`card editor-section ${open ? "open" : ""}`}>
      <button type="button" className="editor-section-head" aria-expanded={open} onClick={() => toggle(id)}>
        {step ? <span className="step">{step}</span> : null}
        <b>{title}</b>
        {summary ? <span className="editor-section-summary">{summary}</span> : null}
        {status === "done" ? <span className="pill pill-mint">완료</span> : null}
        {status === "later" ? <span className="pill pill-cream">나중에 해도 돼요</span> : null}
        <span className="editor-section-chev" aria-hidden>
          ▾
        </span>
      </button>
      <div className="editor-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
};

/** 영역 안의 작은 묶음 (핵심 표현 5 · 퀴즈 5 등). 처음에는 항목이 없을 때만 펼친다. */
export const EditorGroup: React.FC<{ title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title,
  count,
  defaultOpen = count === 0,
  children,
}) => (
  <details className="editor-group" open={defaultOpen || undefined}>
    <summary>
      {title} {count !== undefined ? <b>{count}</b> : null}
    </summary>
    <div className="editor-group-body">{children}</div>
  </details>
);

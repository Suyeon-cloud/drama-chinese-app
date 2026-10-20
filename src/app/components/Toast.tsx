import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastTone = "success" | "error" | "info";

type Toast = { id: number; message: string; tone: ToastTone };

type ToastState = { show: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastState | null>(null);

const DURATION: Record<ToastTone, number> = { success: 3000, info: 3000, error: 6000 };
const ICON: Record<ToastTone, string> = { success: "✅", info: "💬", error: "⚠️" };

/** 화면 하단의 짧은 안내 메시지 (로그인 완료·오류 등) */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((t) => [...t.filter((x) => x.message !== message), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), DURATION[tone]);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="app-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`app-toast ${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
            <span aria-hidden>{ICON[t.tone]}</span>
            <span>{t.message}</span>
            <button className="app-toast-close" onClick={() => dismiss(t.id)} aria-label="닫기">
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
};

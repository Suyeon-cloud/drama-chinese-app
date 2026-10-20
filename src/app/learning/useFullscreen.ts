import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * 앱의 플레이어 컨테이너(영상 + 학습 오버레이)를 Fullscreen API로 전체화면 전환한다.
 * YouTube iframe만 전체화면이 되면 앱의 오버레이가 보이지 않으므로, 컨테이너 전체를 대상으로 한다.
 * 실제 상태는 fullscreenchange 이벤트로 맞춘다. (Esc로 종료해도 UI가 따라온다)
 */
export const useFullscreen = (ref: RefObject<HTMLElement | null>) => {
  const supported =
    typeof document !== "undefined" &&
    document.fullscreenEnabled === true &&
    typeof HTMLElement.prototype.requestFullscreen === "function";
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const sync = () => setActive(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", sync);
    const el = ref.current;
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      // 전체화면 상태로 화면을 떠나면 전체화면을 해제한다.
      if (el && document.fullscreenElement === el) void document.exitFullscreen().catch(() => undefined);
    };
  }, [ref, supported]);

  /** 성공하면 true. 지원하지 않거나 브라우저가 거부하면 false. */
  const enter = useCallback(async () => {
    const el = ref.current;
    if (!supported || !el) return false;
    try {
      await el.requestFullscreen({ navigationUI: "hide" });
      return true;
    } catch {
      return false;
    }
  }, [ref, supported]);

  const exit = useCallback(async () => {
    if (!supported || !document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      // 이미 종료된 경우 등은 무시
    }
  }, [supported]);

  return { supported, active, enter, exit };
};

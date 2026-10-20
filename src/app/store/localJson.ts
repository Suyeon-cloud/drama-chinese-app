// localStorage JSON 헬퍼. storage를 쓸 수 없는 환경(사생활 보호 모드 등)에서는
// 메모리에만 유지되고 새로고침하면 사라진다.

const memory = new Map<string, string>();

export const readJson = <T>(key: string, fallback: T): T => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = memory.get(key) ?? null;
  }
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeJson = (key: string, value: unknown) => {
  const raw = JSON.stringify(value);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    memory.set(key, raw);
  }
};

/** 저장소 변경 알림 (같은 탭 + 다른 탭의 storage 이벤트) */
export const createEmitter = (key: string) => {
  const listeners = new Set<() => void>();
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) listeners.forEach((l) => l());
  };
  return {
    emit: () => listeners.forEach((l) => l()),
    subscribe: (listener: () => void) => {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
  };
};

export const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const nowIso = () => new Date().toISOString();

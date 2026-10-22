// 서버 저장소 공통: 변경 알림. 저장·삭제하면 같은 탭에서 그 데이터를 보는 화면들이 다시 읽는다.

const all = new Set<() => void>();

export const createRemoteEmitter = () => {
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  all.add(emit);
  return {
    emit,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/** 로그인·로그아웃 후 모든 화면의 데이터를 다시 읽는다. (계정마다 볼 수 있는 데이터가 다르다) */
export const refreshAllStores = () => all.forEach((emit) => emit());

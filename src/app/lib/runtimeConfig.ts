// 배포 환경변수에서 읽는 공개 설정. Google Client ID를 다시 빌드하지 않고 Railway 변수만 바꿔도 반영되게 한다.
import type { PublicConfig } from "../store/models";
import { api } from "./api";

let config: PublicConfig = {
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim(),
  adminLoginEnabled: false,
};

export const loadRuntimeConfig = async (): Promise<PublicConfig> => {
  try {
    const remote = await api<PublicConfig>("/config");
    config = { ...remote, googleClientId: remote.googleClientId || config.googleClientId };
  } catch {
    // 서버에 연결하지 못하면 빌드 시 값만 사용
  }
  return config;
};

export const getGoogleClientId = () => config.googleClientId;
export const isAdminLoginEnabled = () => config.adminLoginEnabled;

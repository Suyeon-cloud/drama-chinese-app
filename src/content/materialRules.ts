// 주차별 보충 학습자료(외부 링크) 입력 규칙 — 화면과 서버(server/weekMaterials.ts)가 함께 쓴다.
//
// - 제목 1~100자(필수), 설명 500자까지. 앞뒤 공백은 지운다.
// - 링크는 https 주소만. 계정 정보(user:pass@)가 든 주소, 호스트가 없는 주소는 받지 않는다.
// - 한 주차에 최대 MAX_MATERIALS_PER_WEEK개.

export const MATERIAL_TEXT_LIMITS = { title: 100, description: 500 } as const;
export const MATERIAL_URL_MAX = 2000;
export const MAX_MATERIALS_PER_WEEK = 20;

export const MATERIAL_STATUS_LABEL = { draft: "비공개", published: "공개" } as const;

/**
 * 파일 자료 (3-C에서 업로드에 사용, DB·Storage 버킷 제한과 같아야 한다 — supabase/migrations/…_phase_3b_week_materials.sql)
 * 확장자 → 허용 MIME. HWP·HWPX는 브라우저마다 보내는 형식이 달라 여러 개를 허용한다.
 */
export const MATERIAL_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const MATERIAL_FILE_TYPES: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  hwp: ["application/x-hwp", "application/haansofthwp", "application/vnd.hancom.hwp"],
  hwpx: ["application/hwp+zip", "application/vnd.hancom.hwpx"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  txt: ["text/plain"],
};
export const MATERIAL_FILE_MIME_TYPES: readonly string[] = [...new Set(Object.values(MATERIAL_FILE_TYPES).flat())];

/**
 * 안전한 https 링크인지 확인하고 정리한 주소를 돌려준다. 아니면 null.
 * (javascript:·data:·http: 등은 모두 null — 화면에서 링크를 만들 때도 이 함수를 한 번 더 거친다)
 */
export const safeHttpsUrl = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > MATERIAL_URL_MAX || /\s/.test(text)) return null;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  // 호스트는 점이 있는 이름 (localhost·사설 이름 제외), 끝의 점은 지운다.
  const host = u.hostname.replace(/\.$/, "");
  if (!host.includes(".") || host.startsWith(".")) return null;
  return u.href.length > MATERIAL_URL_MAX ? null : u.href;
};

export type MaterialFormValues = { title: string; description: string; url: string };

/** 화면 입력 검사 (서버도 같은 규칙으로 다시 확인한다). 문제가 없으면 null */
export const materialFormProblem = (v: MaterialFormValues): string | null => {
  const title = v.title.trim();
  if (!title) return "자료 제목을 입력해 주세요.";
  if (title.length > MATERIAL_TEXT_LIMITS.title) return `자료 제목은 ${MATERIAL_TEXT_LIMITS.title}자까지 입력할 수 있어요.`;
  if (v.description.trim().length > MATERIAL_TEXT_LIMITS.description) {
    return `설명은 ${MATERIAL_TEXT_LIMITS.description}자까지 입력할 수 있어요.`;
  }
  if (!safeHttpsUrl(v.url)) return "https://로 시작하는 올바른 링크 주소를 입력해 주세요.";
  return null;
};

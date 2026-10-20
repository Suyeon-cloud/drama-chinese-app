const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * YouTube URL(또는 영상 ID)에서 11자리 영상 ID를 추출한다.
 * 지원: youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID, /live/ID, ID
 */
export const parseYouTubeId = (input: string): string | null => {
  const raw = input.trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].indexOf(parts[0]) >= 0) id = parts[1] ?? null;
  }
  return id && ID_RE.test(id) ? id : null;
};

/** URL의 t= / start= 파라미터(초)를 읽는다. 없으면 null. */
export const parseYouTubeStart = (input: string): number | null => {
  try {
    const url = new URL(input.trim());
    const t = url.searchParams.get("t") ?? url.searchParams.get("start");
    if (!t) return null;
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
    if (!m) return null;
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  } catch {
    return null;
  }
};

export const youtubeWatchUrl = (id: string) => `https://youtu.be/${id}`;

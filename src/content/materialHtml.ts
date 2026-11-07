// 주차별 보충 자료 — HTML 학습자료 (4단계) 규칙. 화면(미리보기·불러오기)과 서버(저장·내려받기)가 함께 쓴다.
//
// - 본문은 UTF-8 2MB까지. 스크립트·이벤트 속성·위험한 주소·끼워 넣는 요소는 저장하지 않는다(화면·서버·DB가 함께 거부).
// - 보여 줄 때·내려받을 때 모두 materialHtmlDocument로 "완전한 HTML 문서"를 만든다:
//   맨 앞에 charset과 CSP(<meta>)를 두어 스크립트·외부 리소스를 막는다. 원본의 <head> 안쪽은 CSP 뒤에, <body> 안쪽은 body에 넣는다.
// - 앱 안에서는 sandbox iframe(스크립트·같은 출처 권한 없음)으로만 그린다. 앱 주소에서 HTML을 직접 실행하는 응답은 만들지 않는다.
// - 이 단계는 정적 학습자료만 다룬다. 발표 화면(5단계)은 같은 문서·iframe을 다시 쓰고, 실시간 퀴즈(6단계)는 HTML 스크립트로 만들지 않는다.

export const MATERIAL_HTML_MAX_BYTES = 2 * 1024 * 1024;
export const MATERIAL_HTML_ACCEPT = ".html,.htm,text/html";

/** 앱 안 iframe·내려받은 파일 모두에 넣는 CSP: 스크립트·외부 요청 없음, 이미지·글꼴은 문서 안(data:)만, 스타일은 문서 안만 */
export const MATERIAL_HTML_CSP =
  "default-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";

/** UTF-8 바이트 수 */
export const htmlByteLength = (html: string) => new TextEncoder().encode(html).length;

const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /<\s*\/?\s*script\b/i, why: "스크립트(<script>)" },
  { re: /<\s*(iframe|frame|frameset|object|embed|applet|portal|base|form)\b/i, why: "끼워 넣기·양식 요소(<iframe>·<object>·<embed>·<base>·<form> 등)" },
  { re: /<\s*meta\b[^>]*http-equiv/i, why: "<meta http-equiv> (새로고침·이동)" },
  // 태그 안의 on…= 속성 (본문 글자 속 "onclick="는 해당하지 않는다)
  { re: /<[a-z!][^>]*?[\s"'/]on[a-z]+\s*=/i, why: "이벤트 속성(onclick·onerror 등)" },
  { re: /(?:javascript|vbscript|livescript)\s*:/i, why: "javascript: 주소" },
  { re: /\b(?:href|src|action|formaction|xlink:href|data|poster|background)\s*=\s*["']?\s*data:(?!image\/(?:png|jpe?g|gif|webp|svg\+xml)[;,])/i, why: "이미지가 아닌 data: 주소" },
  { re: /\bsrcdoc\s*=/i, why: "srcdoc 속성" },
  { re: /expression\s*\(|-moz-binding|behavior\s*:/i, why: "스크립트 동작이 있는 CSS" },
];

/** 저장할 수 없는 HTML이면 이유를, 괜찮으면 null (서버·화면 같은 규칙. 앱의 sandbox·CSP가 최종 방어선) */
export const materialHtmlProblem = (html: unknown): string | null => {
  if (typeof html !== "string") return "HTML 내용 형식이 올바르지 않아요.";
  if (!html.trim()) return "HTML 내용을 입력하거나 .html 파일을 불러와 주세요.";
  if (htmlByteLength(html) > MATERIAL_HTML_MAX_BYTES) return `HTML은 ${MATERIAL_HTML_MAX_BYTES / 1024 / 1024}MB(UTF-8)까지 저장할 수 있어요.`;
  if (html.includes("\u0000")) return "HTML에 쓸 수 없는 글자가 있어요.";
  const hit = FORBIDDEN.find((f) => f.re.test(html));
  return hit ? `보안을 위해 ${hit.why}는 넣을 수 없어요. 해당 부분을 지운 뒤 다시 저장해 주세요.` : null;
};

/** 표시되지 않을 외부 리소스(외부 이미지·CSS·글꼴 등) 수 — 경고용 (일반 <a href> 링크는 세지 않는다) */
export const materialHtmlExternalCount = (html: string) => {
  const tagRes = html.match(/<\s*(?:img|link|source|video|audio|track|input|image|use)\b[^>]*?\s(?:src|href|srcset|poster|xlink:href)\s*=\s*["']?\s*(?:https?:)?\/\//gi) ?? [];
  const cssRes = html.match(/url\(\s*["']?\s*(?:https?:)?\/\/|@import\b/gi) ?? [];
  return tagRes.length + cssRes.length;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 기본 읽기 스타일 (원본 스타일이 뒤에 오므로 원본이 이긴다) */
const BASE_STYLE =
  "body{margin:0;padding:24px;font-family:system-ui,-apple-system,'Noto Sans KR','Noto Sans SC',sans-serif;line-height:1.6;color:#1f2328;background:#fff;word-break:keep-all;overflow-wrap:anywhere}" +
  "img,video{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}th,td{border:1px solid #d0d7de;padding:6px 10px;vertical-align:top}" +
  "pre{white-space:pre-wrap}";

/**
 * 원본 HTML을 완전한 문서로 감싼다. (원본에 <html>·<head>·<body>가 있어도 없어도 된다)
 * 맨 앞: charset → CSP → viewport·referrer → 제목 → 기본 스타일 → 원본 head 안쪽(charset·CSP 메타는 뺀다) / body: 원본 body 안쪽(속성 유지)
 */
export const materialHtmlDocument = (title: string, html: string) => {
  let src = (html.charCodeAt(0) === 0xfeff ? html.slice(1) : html).replace(/<!doctype[^>]*>/gi, "");
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(src);
  let headInner = headMatch ? headMatch[1] : "";
  if (headMatch) src = src.slice(0, headMatch.index) + src.slice(headMatch.index + headMatch[0].length);
  const bodyMatch = /<body\b([^>]*)>([\s\S]*?)(?:<\/body\s*>|$)/i.exec(src);
  const bodyAttrs = bodyMatch ? bodyMatch[1] : "";
  let bodyInner = bodyMatch ? bodyMatch[2] : src;
  bodyInner = bodyInner.replace(/<\/?(?:html|body)\b[^>]*>/gi, "");
  headInner = headInner
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*charset[^>]*>/gi, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, "");
  return (
    "<!doctype html>\n" +
    '<html lang="ko">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    `<meta http-equiv="Content-Security-Policy" content="${MATERIAL_HTML_CSP}">\n` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="referrer" content="no-referrer">\n' +
    `<title>${escapeHtml(title || "학습자료")}</title>\n` +
    `<style>${BASE_STYLE}</style>\n` +
    `${headInner.trim()}\n` +
    `</head>\n<body${bodyAttrs}>\n${bodyInner.trim()}\n</body>\n</html>\n`
  );
};

/** 내려받기 파일 이름: 제목에서 파일 이름에 못 쓰는 글자를 빼고 .html (한 번만 인코딩하는 것은 응답·화면이 맡는다) */
export const materialHtmlFileName = (title: string) => {
  const base = title
    // eslint-disable-next-line no-control-regex -- 파일 이름에서 제어 문자를 지운다
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 100)
    .trim();
  return `${base || "학습자료"}.html`;
};

/** 공유 링크 (앱 내부 주소 — 열 때 로그인·수강 권한을 확인한다) */
export const materialShareHash = (materialId: string) => `#/material?id=${encodeURIComponent(materialId)}`;

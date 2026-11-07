// 주차별 보충 자료 — 파일 자료 검사 (server-only, JSON·Supabase 공통)
//
// - 저장 경로는 서버가 만든다: "{courseId}/{uuid}.{ext}". 원래 파일 이름은 경로에 쓰지 않고 표시용(file_name)으로만 둔다.
// - 형식은 확장자로 정하고, 올라온 파일의 앞부분(시그니처)과 ZIP 기반 문서의 내부 구조를 확인한다.
// - 한계: 시그니처·구조 검사는 "그 형식처럼 생긴 파일"인지 보는 것이다. 문서 안의 악성 내용(매크로·스크립트·취약점 공격)은 검사하지 않는다.
import { randomUUID } from "node:crypto";
import {
  MATERIAL_FILE_MAX_BYTES,
  MATERIAL_FILE_NAME_MAX,
  MATERIAL_FILE_TYPES,
  MATERIAL_PREVIEW_MIME_TYPES,
  materialFileExt,
} from "../src/content/materialRules";

export const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/;

/** 표시용 파일 이름: 제어 문자·경로 구분자를 지우고 길이를 줄인다. 확장자는 지킨다. 쓸 수 없으면 null */
export const cleanFileName = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  let name = raw.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").trim();
  name = name.replace(/^\.+/, "").trim();
  const ext = materialFileExt(name);
  if (!ext || !MATERIAL_FILE_TYPES[ext]) return null;
  if (name.length > MATERIAL_FILE_NAME_MAX) name = `${name.slice(0, MATERIAL_FILE_NAME_MAX - ext.length - 1)}.${ext}`;
  return name.length > ext.length + 1 ? name : null;
};

/** 확장자로 저장할 MIME을 정한다. 브라우저가 보낸 값이 그 확장자의 허용 목록에 있으면 그 값, 아니면 대표 값 */
export const mimeForFile = (fileName: string, declared: unknown): string | null => {
  const allowed = MATERIAL_FILE_TYPES[materialFileExt(fileName)];
  if (!allowed) return null;
  return typeof declared === "string" && allowed.includes(declared) ? declared : allowed[0];
};

export const isPreviewable = (mime: string) => MATERIAL_PREVIEW_MIME_TYPES.includes(mime);

/** 새 저장 경로 (과목 폴더 + 무작위 이름) */
export const newStorageKey = (courseId: string, fileName: string) => `${courseId}/${randomUUID()}.${materialFileExt(fileName)}`;

/** 그 과목 폴더의 서버가 만든 경로인지 (다른 과목·다른 형식의 경로를 지우거나 등록하지 않게) */
export const isCourseKey = (courseId: string, key: string) => STORAGE_KEY_PATTERN.test(key) && key.startsWith(`${courseId}/`);

/** 파일 업로드 요청 검사: 이름·크기 */
export const parseFileMeta = (
  body: Record<string, unknown>,
): { ok: true; value: { fileName: string; mimeType: string; sizeBytes: number } } | { ok: false; error: string } => {
  const fileName = cleanFileName(body.fileName);
  if (!fileName) return { ok: false, error: `올릴 수 있는 형식은 ${Object.keys(MATERIAL_FILE_TYPES).join(", ").toUpperCase()}예요.` };
  const sizeBytes = body.sizeBytes;
  if (typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MATERIAL_FILE_MAX_BYTES) {
    return { ok: false, error: `파일은 ${MATERIAL_FILE_MAX_BYTES / 1024 / 1024}MB까지 올릴 수 있어요.` };
  }
  return { ok: true, value: { fileName, mimeType: mimeForFile(fileName, body.mimeType)!, sizeBytes } };
};

/* ───────── 내용 검사 ───────── */

export type RangeReader = (start: number, endInclusive: number) => Promise<Buffer>;

const startsWith = (b: Buffer, sig: number[], offset = 0) => sig.every((x, i) => b[offset + i] === x);
const ascii = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString("latin1");

/** ZIP 안의 파일 이름 목록 (끝부분의 중앙 디렉터리를 읽는다). ZIP이 아니거나 읽을 수 없으면 null */
export const zipEntryNames = async (size: number, read: RangeReader): Promise<string[] | null> => {
  const tailLen = Math.min(size, 65_557); // EOCD(22) + 주석 최대 65535
  const tail = await read(size - tailLen, size - 1);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (entries === 0 || entries === 0xffff || cdOffset === 0xffffffff || cdSize > 4 * 1024 * 1024 || cdOffset + cdSize > size) return null;
  const cd = await read(cdOffset, cdOffset + cdSize - 1);
  const names: string[] = [];
  let p = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) return null;
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    names.push(cd.subarray(p + 46, p + 46 + nameLen).toString("utf8"));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
};

/** ZIP 기반 문서의 필수 내부 파일 */
const ZIP_REQUIRED: Record<string, string[]> = {
  docx: ["[Content_Types].xml", "word/document.xml"],
  pptx: ["[Content_Types].xml", "ppt/presentation.xml"],
  xlsx: ["[Content_Types].xml", "xl/workbook.xml"],
  hwpx: ["mimetype", "Contents/content.hpf"],
};
/** 매크로가 들어 있는 OOXML 부분 (이 앱은 .docx/.pptx/.xlsx만 받으므로 있으면 거부) */
const ZIP_FORBIDDEN = /(^|\/)vbaProject\.bin$/i;

/**
 * 올라온 파일이 확장자와 같은 형식처럼 생겼는지 확인한다. 문제가 없으면 null, 있으면 화면용 문구.
 * read: 파일의 일부를 읽는 함수 (로컬 파일·Storage 범위 요청 공통)
 */
export const fileContentProblem = async (fileName: string, size: number, read: RangeReader): Promise<string | null> => {
  const ext = materialFileExt(fileName);
  const bad = `파일 내용이 ${ext.toUpperCase()} 형식이 아니에요.`;
  if (size < 4) return bad;
  const head = await read(0, Math.min(size, 8192) - 1);
  switch (ext) {
    case "pdf":
      return ascii(head, 0, 5) === "%PDF-" ? null : bad;
    case "png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? null : bad;
    case "jpg":
    case "jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]) ? null : bad;
    case "webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP" ? null : bad;
    case "hwp":
      // HWP 5.x: OLE 복합 문서. (HWP 3.0 이하 옛 형식은 받지 않는다)
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) ? null : bad;
    case "txt":
      // 글자 파일: NUL·제어 문자(탭·줄바꿈 제외)가 없어야 한다.
      // eslint-disable-next-line no-control-regex
      return /[\u0000-\u0008\u000b\u000e-\u001a\u001c-\u001f]/.test(head.toString("latin1")) ? bad : null;
    case "docx":
    case "pptx":
    case "xlsx":
    case "hwpx": {
      if (!startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return bad;
      const names = await zipEntryNames(size, read);
      if (!names) return bad;
      if (!ZIP_REQUIRED[ext].every((n) => names.includes(n))) return bad;
      if (names.some((n) => ZIP_FORBIDDEN.test(n))) return "매크로가 들어 있는 문서는 올릴 수 없어요.";
      if (names.some((n) => n.includes("..") || n.startsWith("/"))) return bad;
      if (ext === "hwpx") {
        // 첫 항목 mimetype의 내용이 application/hwp+zip (로컬 헤더 바로 뒤, 압축하지 않음)
        const nameLen = head.readUInt16LE(26);
        const extraLen = head.readUInt16LE(28);
        const first = ascii(head, 30, 30 + nameLen);
        const body = ascii(head, 30 + nameLen + extraLen, 30 + nameLen + extraLen + 19);
        if (first !== "mimetype" || body !== "application/hwp+zip") return bad;
      }
      return null;
    }
    default:
      return bad;
  }
};

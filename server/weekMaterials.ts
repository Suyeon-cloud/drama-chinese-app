// 주차별 보충 학습자료(외부 링크) 입력 검사와 목록 도우미 (JSON 모드 API에서 쓴다)
//
// - 보충 자료는 과목 + 주차에 연결한다. 영상 학습자료(lessons)·학습 기록(progress)과는 따로 저장하고 서로 바꾸지 않는다.
// - 입력 규칙은 src/content/materialRules.ts (화면과 같음).
import { randomBytes } from "node:crypto";
import { MATERIAL_TEXT_LIMITS, MAX_MATERIALS_PER_WEEK, safeHttpsUrl } from "../src/content/materialRules";
import { materialHtmlProblem } from "../src/content/materialHtml";
import type { WeekMaterial, WeekMaterialStatus } from "../src/app/store/models";

export { MAX_MATERIALS_PER_WEEK };

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

export type MaterialCreate = { week: number; title: string; description: string; url: string; status: WeekMaterialStatus };
/** html: HTML 학습자료의 본문 (HTML 자료에서만 바꿀 수 있다). sourceLessonUpdatedAt: 5-B 재생성 (html과 함께) */
export type MaterialPatch = Partial<MaterialCreate> & { html?: string; sourceLessonUpdatedAt?: string };
/** 5-B: 자동 생성 복습 HTML 등록 출처 */
export type MaterialSourceInput = { kind: "lesson-review"; lessonId: string; lessonUpdatedAt: string };

const LESSON_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const readInstant = (raw: unknown): string | null =>
  typeof raw === "string" && raw.length <= 64 && Number.isFinite(Date.parse(raw)) ? raw : null;
/** 두 시각이 같은 순간인지 (밀리초까지 — 화면의 Lesson.updatedAt은 밀리초, DB는 마이크로초) */
export const sameInstant = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && Number.isFinite(Date.parse(a)) && Math.floor(Date.parse(a)) === Math.floor(Date.parse(b));

const TEXT_LABEL = { title: "자료 제목", description: "설명" } as const;

const readText = (raw: unknown, field: keyof typeof MATERIAL_TEXT_LIMITS): { ok: true; value: string } | Fail => {
  if (typeof raw !== "string") return fail(`${TEXT_LABEL[field]} 형식이 올바르지 않아요.`);
  const value = raw.trim();
  if (field === "title" && !value) return fail("자료 제목을 입력해 주세요.");
  if (value.length > MATERIAL_TEXT_LIMITS[field]) return fail(`${TEXT_LABEL[field]}은 ${MATERIAL_TEXT_LIMITS[field]}자까지 입력할 수 있어요.`);
  return { ok: true, value };
};
const readWeek = (raw: unknown, weekCount: number): { ok: true; value: number } | Fail =>
  typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= weekCount
    ? { ok: true, value: raw }
    : fail(`주차는 1~${weekCount}주차 중에서 골라 주세요.`);
const readUrl = (raw: unknown): { ok: true; value: string } | Fail => {
  const url = safeHttpsUrl(raw);
  return url ? { ok: true, value: url } : fail("https://로 시작하는 올바른 링크 주소를 입력해 주세요.");
};
const readStatus = (raw: unknown): { ok: true; value: WeekMaterialStatus } | Fail =>
  raw === "draft" || raw === "published" ? { ok: true, value: raw } : fail("공개 상태는 공개(published) 또는 비공개(draft)만 고를 수 있어요.");

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** 서버가 정하는 칸 (보내면 거부) */
const SERVER_FIELDS = ["id", "courseId", "kind", "position", "createdAt", "updatedAt", "updatedByLabel"];

/** 새 보충 자료: 주차·제목·링크 필수, 설명은 없으면 빈 값, 상태는 없으면 비공개(draft) */
export const parseMaterialCreate = (body: unknown, weekCount: number): { ok: true; value: MaterialCreate } | Fail => {
  if (!isObject(body)) return fail("자료 정보 형식이 올바르지 않아요.");
  if (SERVER_FIELDS.some((f) => f in body)) return fail("id·과목·순서 등은 서버가 정해요. 보내지 마세요.");
  const week = readWeek(body.week, weekCount);
  if (!week.ok) return week;
  const title = readText(body.title ?? "", "title");
  if (!title.ok) return title;
  const description = body.description === undefined || body.description === null ? { ok: true as const, value: "" } : readText(body.description, "description");
  if (!description.ok) return description;
  const url = readUrl(body.url);
  if (!url.ok) return url;
  const status = body.status === undefined ? { ok: true as const, value: "draft" as const } : readStatus(body.status);
  if (!status.ok) return status;
  return { ok: true, value: { week: week.value, title: title.value, description: description.value, url: url.value, status: status.value } };
};

/** 보충 자료 수정: 보낸 칸만. 바꿀 칸이 없으면 오류 */
export const parseMaterialPatch = (body: unknown, weekCount: number): { ok: true; value: MaterialPatch } | Fail => {
  if (!isObject(body)) return fail("자료 정보 형식이 올바르지 않아요.");
  if (SERVER_FIELDS.some((f) => f in body)) return fail("id·과목·순서 등은 서버가 정해요. 보내지 마세요.");
  const out: MaterialPatch = {};
  if (body.week !== undefined) {
    const r = readWeek(body.week, weekCount);
    if (!r.ok) return r;
    out.week = r.value;
  }
  for (const field of ["title", "description"] as const) {
    if (body[field] === undefined) continue;
    const r = readText(body[field], field);
    if (!r.ok) return r;
    out[field] = r.value;
  }
  if (body.url !== undefined) {
    const r = readUrl(body.url);
    if (!r.ok) return r;
    out.url = r.value;
  }
  if (body.status !== undefined) {
    const r = readStatus(body.status);
    if (!r.ok) return r;
    out.status = r.value;
  }
  if (body.html !== undefined) {
    const problem = materialHtmlProblem(body.html);
    if (problem) return fail(problem);
    out.html = body.html as string;
  }
  if (body.sourceLessonUpdatedAt !== undefined) {
    const at = readInstant(body.sourceLessonUpdatedAt);
    if (!at) return fail("원본 강의 수정 시각 형식이 올바르지 않아요.");
    if (out.html === undefined) return fail("복습 HTML을 다시 만들 때는 HTML 내용도 함께 보내 주세요.");
    out.sourceLessonUpdatedAt = at;
  }
  if (Object.keys(out).length === 0) return fail("바꿀 내용이 없어요.");
  return { ok: true, value: out };
};

/** 순서 변경 입력: { week, ids } — ids는 그 주차의 자료 id 전체를 새 순서로 (빠지거나 겹치거나 다른 주차 자료면 오류) */
export const parseMaterialOrder = (
  body: unknown,
  weekCount: number,
  current: WeekMaterial[],
): { ok: true; value: { week: number; ids: string[] } } | Fail => {
  if (!isObject(body)) return fail("순서 정보 형식이 올바르지 않아요.");
  const week = readWeek(body.week, weekCount);
  if (!week.ok) return week;
  const ids = body.ids;
  if (!Array.isArray(ids) || !ids.every((x): x is string => typeof x === "string")) return fail("순서 정보 형식이 올바르지 않아요.");
  const inWeek = current.filter((m) => m.week === week.value).map((m) => m.id);
  const same = ids.length === inWeek.length && new Set(ids).size === ids.length && ids.every((id) => inWeek.includes(id));
  if (!same) return fail("그 주차의 자료 목록이 바뀌었어요. 새로고침한 뒤 다시 정렬해 주세요.");
  return { ok: true, value: { week: week.value, ids } };
};

/** 주차 → 순서 → 만든 시각 → id 순서 */
export const sortMaterials = (list: WeekMaterial[]) =>
  [...list].sort((a, b) => a.week - b.week || a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

export const materialsForCourse = (all: Record<string, WeekMaterial>, courseId: string) =>
  sortMaterials(Object.values(all).filter((m) => m.courseId === courseId));

/** 그 주차 맨 뒤 순서 */
export const nextPosition = (list: WeekMaterial[], week: number) =>
  list.filter((m) => m.week === week).reduce((max, m) => Math.max(max, m.position + 1), 0);

/** 같은 주차 자료의 순서를 0부터 다시 매긴다 (삭제·주차 이동 뒤 빈 번호 정리). 바뀐 자료 수를 돌려준다. */
export const renumberWeek = (list: WeekMaterial[], week: number) => {
  let changed = 0;
  sortMaterials(list.filter((m) => m.week === week)).forEach((m, i) => {
    if (m.position !== i) {
      m.position = i;
      changed++;
    }
  });
  return changed;
};

/** 학생에게 보내는 형태: 공개 자료만, 마지막 수정자 표시는 빼고 */
export const publicMaterial = ({ updatedByLabel: _label, source: _source, ...m }: WeekMaterial): WeekMaterial => m;

/** JSON 모드 저장 형태: 파일 자료는 서버만 아는 저장 경로를, HTML 자료는 본문을 함께 둔다 (목록 응답에는 보내지 않는다) */
export type StoredMaterial = WeekMaterial & { storagePath?: string; html?: string };
/** 응답용: 저장 경로·HTML 본문을 뺀다 (본문은 GET /materials/:id/html 로 권한 확인 뒤에만) */
export const clientMaterial = (m: StoredMaterial): WeekMaterial => {
  const { storagePath: _path, html: _html, ...rest } = m;
  return rest;
};

/** 파일 자료 등록 입력: 주차·제목 필수, 설명·공개 상태 선택 (파일 칸은 parseFileMeta가 따로 본다) */
export const parseMaterialFileInput = (
  body: unknown,
  weekCount: number,
): { ok: true; value: { week: number; title: string; description: string; status: WeekMaterialStatus } } | Fail => {
  if (!isObject(body)) return fail("자료 정보 형식이 올바르지 않아요.");
  if ([...SERVER_FIELDS, "url", "storagePath"].some((f) => f in body)) return fail("id·과목·순서·저장 경로 등은 서버가 정해요. 보내지 마세요.");
  const week = readWeek(body.week, weekCount);
  if (!week.ok) return week;
  const title = readText(body.title ?? "", "title");
  if (!title.ok) return title;
  const description = body.description === undefined || body.description === null ? { ok: true as const, value: "" } : readText(body.description, "description");
  if (!description.ok) return description;
  const status = body.status === undefined ? { ok: true as const, value: "draft" as const } : readStatus(body.status);
  if (!status.ok) return status;
  return { ok: true, value: { week: week.value, title: title.value, description: description.value, status: status.value } };
};

export const newMaterialId = (exists: (id: string) => boolean) => {
  for (let i = 0; i < 20; i++) {
    const id = `material-${randomBytes(6).toString("hex")}`;
    if (!exists(id)) return id;
  }
  throw new Error("자료 id를 만들지 못했어요.");
};

/** HTML 학습자료 등록 입력: 주차·제목·html 필수, 설명·공개 상태 선택 */
export const parseMaterialHtmlCreate = (
  body: unknown,
  weekCount: number,
): { ok: true; value: { week: number; title: string; description: string; status: WeekMaterialStatus; html: string; source?: MaterialSourceInput } } | Fail => {
  if (!isObject(body)) return fail("자료 정보 형식이 올바르지 않아요.");
  const { html, source, ...rest } = body;
  const meta = parseMaterialFileInput(rest, weekCount);
  if (!meta.ok) return meta;
  const problem = materialHtmlProblem(html);
  if (problem) return fail(problem);
  if (source === undefined || source === null) return { ok: true, value: { ...meta.value, html: html as string } };
  // 5-B: 강의에서 자동 생성한 복습 HTML (강의 존재·같은 과목·원본 시각은 서버/DB가 다시 확인)
  if (!isObject(source) || source.kind !== "lesson-review" || typeof source.lessonId !== "string" || !LESSON_ID_PATTERN.test(source.lessonId)) {
    return fail("출처 정보 형식이 올바르지 않아요.");
  }
  const at = readInstant(source.lessonUpdatedAt);
  if (!at) return fail("원본 강의 수정 시각 형식이 올바르지 않아요.");
  return { ok: true, value: { ...meta.value, html: html as string, source: { kind: "lesson-review", lessonId: source.lessonId, lessonUpdatedAt: at } } };
};

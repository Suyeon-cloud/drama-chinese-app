// 관리자 과목 생성·수정 입력 검사와 과목 id 생성 (POST /api/courses, PATCH /api/courses/:id)
//
// - 과목명은 필수(1~60자), 드라마명 60자·학습 맥락 200자·설명 500자까지. 앞뒤 공백은 지운다.
// - 주차 수는 정수 1~30 (DB courses.week_count 제약과 같음), 새 과목은 기본 15주.
// - 상태는 active ↔ inactive만 바꿀 수 있다. legacy(기존 자료)는 만들거나 바꿀 수 없다.
// - 과목 id는 서버가 "course-" + 소문자·숫자 6자로 만든다. 이미 있는 id와 겹치면 다시 만든다.
import { randomInt } from "node:crypto";
import { ALL_COURSE_SEEDS } from "../src/content/courses";
import {
  COURSE_TEXT_LABEL as TEXT_LABEL,
  COURSE_TEXT_LIMITS,
  DEFAULT_WEEK_COUNT,
  WEEK_COUNT_ERROR as WEEK_ERROR,
  type CourseTextField as TextField,
} from "../src/content/courseRules";
import { isValidWeekCount } from "../src/content/courseWeeks";

export { COURSE_TEXT_LIMITS, DEFAULT_WEEK_COUNT };

export type CourseFields = { title: string; drama: string; context: string; description: string; weekCount: number };
export type EditableCourseStatus = "active" | "inactive";
export type CoursePatch = Partial<CourseFields> & { status?: EditableCourseStatus };

type Fail = { ok: false; error: string };
export type CourseCreateResult = { ok: true; value: CourseFields } | Fail;
export type CoursePatchResult = { ok: true; value: CoursePatch } | Fail;

const fail = (error: string): Fail => ({ ok: false, error });

/** 글자 칸 하나: 문자열만, 앞뒤 공백 제거, 길이 제한. 과목명은 비우면 안 된다. */
const readText = (raw: unknown, field: TextField): { ok: true; value: string } | Fail => {
  if (typeof raw !== "string") return fail(`${TEXT_LABEL[field]} 형식이 올바르지 않아요.`);
  const value = raw.trim();
  if (field === "title" && value.length === 0) return fail("과목명을 입력해 주세요.");
  if (value.length > COURSE_TEXT_LIMITS[field]) return fail(`${TEXT_LABEL[field]}은 ${COURSE_TEXT_LIMITS[field]}자까지 입력할 수 있어요.`);
  return { ok: true, value };
};

/** 새 과목 입력. 과목명 외의 글자 칸은 없으면 빈 값, 주차 수는 없으면 15. */
export const parseCourseCreate = (body: unknown): CourseCreateResult => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("과목 정보 형식이 올바르지 않아요.");
  const src = body as Record<string, unknown>;
  if ("id" in src) return fail("과목 id는 서버가 만들어요. id를 보내지 마세요.");
  if ("status" in src && src.status !== "active") return fail("새 과목은 운영 중(active) 상태로만 만들 수 있어요.");
  const out = { title: "", drama: "", context: "", description: "" };
  for (const field of Object.keys(COURSE_TEXT_LIMITS) as TextField[]) {
    if (field !== "title" && (src[field] === undefined || src[field] === null)) continue;
    const r = readText(field === "title" ? src.title ?? "" : src[field], field);
    if (!r.ok) return r;
    out[field] = r.value;
  }
  const weekCount = src.weekCount === undefined || src.weekCount === null ? DEFAULT_WEEK_COUNT : src.weekCount;
  if (!isValidWeekCount(weekCount)) return fail(WEEK_ERROR);
  return { ok: true, value: { ...out, weekCount } };
};

/** 과목 수정 입력: 보낸 칸만 바꾼다. id를 바꾸려 하거나 바꿀 칸이 없으면 오류. */
export const parseCoursePatch = (body: unknown, courseId: string): CoursePatchResult => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("과목 정보 형식이 올바르지 않아요.");
  const src = body as Record<string, unknown>;
  if ("id" in src && src.id !== courseId) return fail("과목 id는 바꿀 수 없어요.");
  const out: CoursePatch = {};
  for (const field of Object.keys(COURSE_TEXT_LIMITS) as TextField[]) {
    if (src[field] === undefined) continue;
    const r = readText(src[field], field);
    if (!r.ok) return r;
    out[field] = r.value;
  }
  if (src.weekCount !== undefined) {
    if (!isValidWeekCount(src.weekCount)) return fail(WEEK_ERROR);
    out.weekCount = src.weekCount;
  }
  if (src.status !== undefined) {
    if (src.status !== "active" && src.status !== "inactive") return fail("과목 상태는 운영 중(active) 또는 비활성(inactive)만 고를 수 있어요.");
    out.status = src.status;
  }
  if (Object.keys(out).length === 0) return fail("바꿀 내용이 없어요.");
  return { ok: true, value: out };
};

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
export const COURSE_ID_PATTERN = /^course-[a-z0-9]{6}$/;

/** 무작위 과목 id 하나 ("course-" + 소문자·숫자 6자) */
export const randomCourseId = (pick: (n: number) => number = randomInt) =>
  `course-${Array.from({ length: 6 }, () => ID_CHARS[pick(ID_CHARS.length)]).join("")}`;

/**
 * 기본(시드) 과목 id는 새 과목에 쓰지 않는다. course-campus·course-legacy처럼 새 id 형식(6자)과 모양이 같은 것도 있어서,
 * DB에 아직 없더라도(초기 데이터 복구 등) 미리 비워 둔다.
 */
export const RESERVED_COURSE_IDS: ReadonlySet<string> = new Set(ALL_COURSE_SEEDS.map((seed) => seed.id));

/** 이미 있는 id·기본 과목 id와 겹치지 않는 과목 id. 여러 번 겹치면(사실상 없음) 오류를 낸다. */
export const newCourseId = (exists: (id: string) => boolean, make: () => string = () => randomCourseId(), tries = 50): string => {
  for (let i = 0; i < tries; i++) {
    const id = make();
    if (!RESERVED_COURSE_IDS.has(id) && !exists(id)) return id;
  }
  throw new Error("과목 id를 만들지 못했어요.");
};

/**
 * 주차 수를 줄일 때 지켜야 하는 최소값: 그 과목 학습자료의 가장 큰 주차와, 그 학습자료 학습 기록의 주차 중 큰 값.
 * (준비 중 자료 포함. 학습자료가 없으면 0)
 */
export const minWeekCountFor = (lessonWeeks: number[], progressWeeks: number[]): number =>
  Math.max(0, ...lessonWeeks.filter(Number.isFinite), ...progressWeeks.filter(Number.isFinite));

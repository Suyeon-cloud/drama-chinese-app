// 3과목 구조: DB 마이그레이션(버전 1 → 2)과 과목별 조회 도우미.
//
// 버전 1(1과목): course 하나 + enrollments["강의코드::userId"], 강의자료에 courseId 없음
// 버전 2(3과목): courses[id] + courseInstructors["courseId::email"] + enrollments["courseId::userId"], 강의자료마다 courseId
//
// 마이그레이션은 아무것도 지우지 않는다.
// - 이전 course → ‘기존 자료’ 과목(LEGACY_COURSE_ID)으로 옮긴다. 강의코드·제목·생성일을 그대로 써서 예전 참여 링크도 계속 동작한다.
// - courseId가 없는 강의자료 → 기존 자료 과목
// - 이전 참여 기록 → 강의코드로 과목을 찾아 courseId를 붙이고 키만 바꾼다.
// - 학습 기록(progress)은 그대로 둔다. 과목은 강의자료의 courseId로 찾는다. (lessonId는 과목이 달라도 겹치지 않는다)
//
// 버전 3(분반): sections[id] + sectionInstructors["sectionId::email"] + enrollments["sectionId::userId"]
// - 운영 과목마다 기본 01분반(section-{과목}-01)을 만들고, 과목 강의코드를 그 분반 강의코드로 잇는다.
// - 운영 과목 수강 등록 → 그 과목의 기본 01분반으로 (sectionId를 붙이고 키만 바꾼다)
// - courseInstructors(교수자–과목) → 기본 01분반 배정으로 복사한다. 원래 데이터는 지우지 않는다.
// - 기존 자료 과목은 분반으로 옮기지 않는다.

import { randomInt } from "node:crypto";
import { ALL_COURSE_SEEDS, LEGACY_COURSE_ID, type CourseSeed } from "../src/content/courses";
import type { Lesson } from "../src/content/types";
import type {
  Course,
  CourseInstructor,
  Enrollment,
  LessonProgress,
  Section,
  SectionInstructor,
} from "../src/app/store/models";

export const DB_VERSION = 3;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const randomCourseCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

/** 수강 등록 키: 분반 등록은 sectionId::userId (기존 자료 과목의 예전 기록만 courseId::userId) */
export const enrollmentKey = (sectionOrCourseId: string, userId: string) => `${sectionOrCourseId}::${userId}`;
export const courseInstructorKey = (courseId: string, email: string) => `${courseId}::${email}`;
export const sectionInstructorKey = (sectionId: string, email: string) => `${sectionId}::${email}`;

/** 과목의 기본 01분반 id (예: course-campus → section-campus-01) */
export const defaultSectionId = (courseId: string) => `section-${courseId.replace(/^course-/, "")}-01`;

/** 분반 번호 이름 (1 → 01분반) */
export const sectionName = (n: number) => `${String(n).padStart(2, "0")}분반`;

/** 마이그레이션이 다루는 부분만 (나머지 필드는 그대로 둔다) */
export type CourseTables = {
  version: number;
  lessons: Record<string, Lesson>;
  courses: Record<string, Course>;
  courseInstructors: Record<string, CourseInstructor>;
  enrollments: Record<string, Enrollment>;
  sections: Record<string, Section>;
  sectionInstructors: Record<string, SectionInstructor>;
};

/** 모든 분반·과목 강의코드와 겹치지 않는 새 강의코드 */
export const uniqueSectionCode = (data: Pick<CourseTables, "courses" | "sections">, newCode = randomCourseCode) => {
  const used = new Set([...Object.values(data.sections).map((s) => s.code), ...Object.values(data.courses).map((c) => c.code)]);
  let code = newCode();
  while (used.has(code)) code = newCode();
  return code;
};

type LegacyCourse = { code?: string; title?: string; createdAt?: string } | null | undefined;

/**
 * DB 데이터를 3과목 구조로 맞춘다. data를 직접 고치고, 바뀐 내용을 사람이 읽을 수 있는 문장으로 돌려준다.
 * 이미 버전 2라도 빠진 기본 과목이 있으면 채운다. (여러 번 실행해도 결과가 같다)
 */
export const migrateCourses = (
  data: CourseTables & { course?: LegacyCourse },
  now: string,
  newCode: () => string = randomCourseCode,
): string[] => {
  const changes: string[] = [];
  data.courses ??= {};
  data.courseInstructors ??= {};
  data.enrollments ??= {};
  data.lessons ??= {};
  data.sections ??= {};
  data.sectionInstructors ??= {};

  const usedCodes = new Set(Object.values(data.courses).map((c) => c.code));
  const uniqueCode = () => {
    let code = newCode();
    while (usedCodes.has(code)) code = newCode();
    usedCodes.add(code);
    return code;
  };
  const create = (seed: CourseSeed, from?: LegacyCourse): Course => {
    const code = from?.code && !usedCodes.has(from.code) ? from.code : uniqueCode();
    usedCodes.add(code);
    return {
      ...seed,
      title: from?.title || seed.title,
      code,
      createdAt: from?.createdAt || now,
      updatedAt: now,
    };
  };

  // 1) 과목: 이전 course는 기존 자료 과목으로 옮기고, 없는 기본 과목을 만든다.
  const legacy = data.course;
  if (!data.courses[LEGACY_COURSE_ID]) {
    data.courses[LEGACY_COURSE_ID] = create(
      ALL_COURSE_SEEDS.find((s) => s.id === LEGACY_COURSE_ID)!,
      legacy,
    );
    changes.push(
      legacy?.code
        ? `이전 수업(강의코드 ${legacy.code})을 기존 자료 과목으로 옮겼어요.`
        : "기존 자료 과목을 만들었어요.",
    );
  }
  if (legacy !== undefined) delete data.course;
  for (const seed of ALL_COURSE_SEEDS) {
    if (data.courses[seed.id]) continue;
    data.courses[seed.id] = create(seed);
    changes.push(`과목 ${seed.title}(${seed.drama})을 만들었어요. 강의코드 ${data.courses[seed.id].code}`);
  }

  // 2) 강의자료: courseId가 없으면 기존 자료
  let lessonCount = 0;
  for (const lesson of Object.values(data.lessons)) {
    if (lesson.courseId) continue;
    lesson.courseId = LEGACY_COURSE_ID;
    lessonCount++;
  }
  if (lessonCount) changes.push(`강의자료 ${lessonCount}개를 기존 자료 과목에 넣었어요.`);

  // 3) 참여 기록: 강의코드로 과목을 찾아 courseId를 붙이고 키를 courseId::userId로 바꾼다.
  const byCode = new Map(Object.values(data.courses).map((c) => [c.code, c.id]));
  let enrollmentCount = 0;
  for (const [key, e] of Object.entries(data.enrollments)) {
    if (e.sectionId || (e.courseId && key === enrollmentKey(e.courseId, e.userId))) continue;
    // 강의코드에 맞는 과목이 없으면(이전 1과목 시절 기록) 기존 자료 과목으로 본다.
    const courseId = e.courseId || byCode.get(e.courseCode) || LEGACY_COURSE_ID;
    const next: Enrollment = { ...e, courseId };
    const nextKey = enrollmentKey(courseId, e.userId);
    const prev = data.enrollments[nextKey];
    delete data.enrollments[key];
    // 같은 학생·과목 기록이 겹치면 먼저 참여한 기록을 남긴다.
    data.enrollments[nextKey] = prev && prev !== e && prev.joinedAt <= next.joinedAt ? prev : next;
    enrollmentCount++;
  }
  if (enrollmentCount) changes.push(`참여 기록 ${enrollmentCount}건에 과목을 연결했어요.`);

  // 4) 분반: 운영 과목마다 기본 01분반 (과목 강의코드를 이어받는다)
  const openCourses = Object.values(data.courses).filter((c) => c.status === "active");
  for (const course of openCourses) {
    const id = defaultSectionId(course.id);
    if (data.sections[id]) continue;
    const taken = Object.values(data.sections).some((s) => s.code === course.code);
    data.sections[id] = {
      id,
      courseId: course.id,
      name: sectionName(1),
      code: taken ? uniqueSectionCode(data, newCode) : course.code,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    changes.push(`${course.title} ${sectionName(1)}을 만들었어요. 강의코드 ${data.sections[id].code}`);
  }

  // 5) 운영 과목 수강 등록 → 기본 01분반 (키: sectionId::userId)
  let sectionEnrollments = 0;
  for (const [key, e] of Object.entries(data.enrollments)) {
    if (e.sectionId || !openCourses.some((c) => c.id === e.courseId)) continue;
    const sectionId = defaultSectionId(e.courseId);
    const nextKey = enrollmentKey(sectionId, e.userId);
    const prev = data.enrollments[nextKey];
    delete data.enrollments[key];
    data.enrollments[nextKey] = prev ?? { ...e, sectionId };
    sectionEnrollments++;
  }
  if (sectionEnrollments) changes.push(`수강 등록 ${sectionEnrollments}건을 기본 01분반으로 옮겼어요.`);

  // 6) 교수자–과목 배정 → 기본 01분반 배정 (courseInstructors는 그대로 둔다)
  let copied = 0;
  for (const ci of Object.values(data.courseInstructors)) {
    if (!openCourses.some((c) => c.id === ci.courseId)) continue;
    const sectionId = defaultSectionId(ci.courseId);
    const key = sectionInstructorKey(sectionId, ci.email);
    if (data.sectionInstructors[key]) continue;
    data.sectionInstructors[key] = { sectionId, email: ci.email, assignedAt: ci.assignedAt, assignedBy: ci.assignedBy };
    copied++;
  }
  if (copied) changes.push(`교수자 과목 배정 ${copied}건을 기본 01분반 배정으로 옮겼어요.`);

  if (data.version !== DB_VERSION) {
    changes.push(`DB 버전 ${data.version} → ${DB_VERSION}`);
    data.version = DB_VERSION;
  }
  return changes;
};

/* ───────── 과목별 조회 ───────── */

/** 강의코드로 과목 찾기 (대소문자·앞뒤 공백 무시) */
export const findCourseByCode = (courses: Record<string, Course>, code: string): Course | null => {
  const c = code.trim().toUpperCase();
  return (c && Object.values(courses).find((x) => x.code === c)) || null;
};

export const lessonsForCourse = (lessons: Record<string, Lesson>, courseId: string): Lesson[] =>
  Object.values(lessons)
    .filter((l) => l.courseId === courseId)
    .sort((a, b) => a.week - b.week);

/** 과목의 학습 기록: 기록의 lessonId → 강의자료의 courseId로 찾는다. */
export const progressForCourse = (
  progress: Record<string, LessonProgress>,
  lessons: Record<string, Lesson>,
  courseId: string,
): LessonProgress[] => Object.values(progress).filter((p) => lessons[p.lessonId]?.courseId === courseId);

export const enrollmentsForCourse = (enrollments: Record<string, Enrollment>, courseId: string): Enrollment[] =>
  Object.values(enrollments).filter((e) => e.courseId === courseId);

export const enrollmentsForUser = (enrollments: Record<string, Enrollment>, userId: string): Enrollment[] =>
  Object.values(enrollments).filter((e) => e.userId === userId);

/* ───────── 분반 ───────── */

/** 분반 강의코드로 분반 찾기 (대소문자·앞뒤 공백 무시) */
export const findSectionByCode = (sections: Record<string, Section>, code: string): Section | null => {
  const c = code.trim().toUpperCase();
  return (c && Object.values(sections).find((s) => s.code === c)) || null;
};

/** 과목의 분반 (분반명 순) */
export const sectionsForCourse = (sections: Record<string, Section>, courseId: string): Section[] =>
  Object.values(sections)
    .filter((s) => s.courseId === courseId)
    .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));

export const enrollmentsForSection = (enrollments: Record<string, Enrollment>, sectionId: string): Enrollment[] =>
  Object.values(enrollments).filter((e) => e.sectionId === sectionId);

/** 교강사가 맡은 분반 id */
export const sectionIdsForInstructor = (links: Record<string, SectionInstructor>, email: string): string[] =>
  Object.values(links)
    .filter((l) => l.email === email)
    .map((l) => l.sectionId);

export const instructorsForSection = (links: Record<string, SectionInstructor>, sectionId: string): string[] =>
  Object.values(links)
    .filter((l) => l.sectionId === sectionId)
    .map((l) => l.email);

/** 과목의 다음 분반 이름 제안 (01분반, 02분반 … 중 비어 있는 다음 번호) */
export const nextSectionName = (sections: Record<string, Section>, courseId: string) => {
  const names = new Set(sectionsForCourse(sections, courseId).map((s) => s.name));
  let n = 1;
  while (names.has(sectionName(n))) n++;
  return sectionName(n);
};

/** 교수자가 맡은 과목 id */
export const courseIdsForInstructor = (links: Record<string, CourseInstructor>, email: string): string[] =>
  Object.values(links)
    .filter((l) => l.email === email)
    .map((l) => l.courseId);

export const instructorsForCourse = (links: Record<string, CourseInstructor>, courseId: string): string[] =>
  Object.values(links)
    .filter((l) => l.courseId === courseId)
    .map((l) => l.email);

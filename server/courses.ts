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

import { randomInt } from "node:crypto";
import { ALL_COURSE_SEEDS, LEGACY_COURSE_ID, type CourseSeed } from "../src/content/courses";
import type { Lesson } from "../src/content/types";
import type { Course, CourseInstructor, Enrollment, LessonProgress } from "../src/app/store/models";

export const DB_VERSION = 2;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const randomCourseCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

export const enrollmentKey = (courseId: string, userId: string) => `${courseId}::${userId}`;
export const courseInstructorKey = (courseId: string, email: string) => `${courseId}::${email}`;

/** 마이그레이션이 다루는 부분만 (나머지 필드는 그대로 둔다) */
export type CourseTables = {
  version: number;
  lessons: Record<string, Lesson>;
  courses: Record<string, Course>;
  courseInstructors: Record<string, CourseInstructor>;
  enrollments: Record<string, Enrollment>;
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
    if (e.courseId && key === enrollmentKey(e.courseId, e.userId)) continue;
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

/** 교수자가 맡은 과목 id */
export const courseIdsForInstructor = (links: Record<string, CourseInstructor>, email: string): string[] =>
  Object.values(links)
    .filter((l) => l.email === email)
    .map((l) => l.courseId);

export const instructorsForCourse = (links: Record<string, CourseInstructor>, courseId: string): string[] =>
  Object.values(links)
    .filter((l) => l.courseId === courseId)
    .map((l) => l.email);

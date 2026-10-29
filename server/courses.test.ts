// 3과목 구조 마이그레이션·조회 테스트 (npm test)
import assert from "node:assert/strict";
import { test } from "node:test";
import { COURSE_SEEDS, LEGACY_COURSE_ID, courseLessonId, defaultDirectionFor } from "../src/content/courses";
import type { Lesson } from "../src/content/types";
import type { Enrollment, LessonProgress } from "../src/app/store/models";
import {
  DB_VERSION,
  courseIdsForInstructor,
  defaultSectionId,
  nextSectionName,
  uniqueSectionCode,
  enrollmentsForUser,
  findCourseByCode,
  lessonsForCourse,
  migrateCourses,
  progressForCourse,
  type CourseTables,
} from "./courses";

const NOW = "2026-10-29T00:00:00.000Z";

const lesson = (id: string, week: number, extra: Partial<Lesson> = {}) =>
  ({ id, week, title: id, status: "draft", script: { source: "srt", cues: [{ start: 0, end: 1, zh: "你好" }] }, ...extra }) as Lesson;

const progress = (userId: string, lessonId: string): LessonProgress => ({
  userId,
  lessonId,
  week: 1,
  startedAt: NOW,
  completedAt: null,
  watchedRanges: [[0, 10]],
  progressRatio: 0.5,
  maxPosition: 10,
  quiz: { correct: 3, total: 4, submittedAt: NOW },
  quizAttempts: 1,
  lastStudiedAt: NOW,
});

/** 버전 1(1과목) DB */
const v1 = () => {
  let n = 0;
  const codes = () => `CODE${++n}`;
  const data = {
    version: 1,
    course: { code: "X2FL6N", title: "드라마로 배우는 중국어 (15주)", createdAt: "2026-10-26T08:27:19.180Z" },
    lessons: {
      "lesson-yjrzm-ep3": lesson("lesson-yjrzm-ep3", 1),
      "lesson-week01": lesson("lesson-week01", 1, { status: "published" }),
      "lesson-week02": lesson("lesson-week02", 2),
    },
    enrollments: {
      "X2FL6N::u1": { courseCode: "X2FL6N", userId: "u1", name: "학생1", email: "a@x.com", joinedAt: NOW },
    } as unknown as Record<string, Enrollment>,
  } as unknown as CourseTables & { course?: { code: string; title: string; createdAt: string } };
  return { data, codes };
};

test("버전 1 → 2: 이전 수업은 기존 자료 과목이 되고 강의코드가 그대로 남는다", () => {
  const { data, codes } = v1();
  const before = JSON.stringify(data.lessons["lesson-week01"].script);
  migrateCourses(data, NOW, codes);

  assert.equal(data.version, DB_VERSION);
  assert.equal("course" in data, false);
  const legacy = data.courses[LEGACY_COURSE_ID];
  assert.equal(legacy.code, "X2FL6N");
  assert.equal(legacy.title, "드라마로 배우는 중국어 (15주)");
  assert.equal(legacy.createdAt, "2026-10-26T08:27:19.180Z");
  assert.equal(legacy.status, "legacy");

  // 새 3과목, 강의코드는 서로 다르다
  for (const seed of COURSE_SEEDS) assert.equal(data.courses[seed.id].status, "active");
  const allCodes = Object.values(data.courses).map((c) => c.code);
  assert.equal(new Set(allCodes).size, allCodes.length);

  // 강의자료는 지워지지 않고 모두 기존 자료 과목, 내용은 그대로
  assert.deepEqual(Object.keys(data.lessons).sort(), ["lesson-week01", "lesson-week02", "lesson-yjrzm-ep3"]);
  for (const l of Object.values(data.lessons)) assert.equal(l.courseId, LEGACY_COURSE_ID);
  assert.equal(JSON.stringify(data.lessons["lesson-week01"].script), before);
  assert.equal(lessonsForCourse(data.lessons, "course-campus").length, 0);

  // 참여 기록은 과목이 붙고 키가 courseId::userId로 바뀐다
  assert.deepEqual(Object.keys(data.enrollments), [`${LEGACY_COURSE_ID}::u1`]);
  assert.equal(data.enrollments[`${LEGACY_COURSE_ID}::u1`].courseId, LEGACY_COURSE_ID);
  assert.equal(data.enrollments[`${LEGACY_COURSE_ID}::u1`].courseCode, "X2FL6N");
});

test("버전 2 → 3: 기본 01분반이 과목 코드를 잇고, 수강 등록·교수자 배정이 01분반으로 옮겨진다", () => {
  const { data, codes } = v1();
  migrateCourses(data, NOW, codes);
  // 버전 2 상태를 흉내 낸다: 분반이 없고, 과목 기준 수강 등록·교수자 배정이 있다.
  const campus = data.courses["course-campus"];
  data.version = 2;
  data.sections = {};
  data.sectionInstructors = {};
  data.enrollments["course-campus::u2"] = {
    courseId: "course-campus",
    courseCode: campus.code,
    userId: "u2",
    name: "학생2",
    email: "b@x.com",
    joinedAt: NOW,
  };
  data.courseInstructors = {
    "course-campus::t@x.com": { courseId: "course-campus", email: "t@x.com", assignedAt: NOW, assignedBy: "admin" },
  };
  const legacyBefore = JSON.stringify(data.enrollments[`${LEGACY_COURSE_ID}::u1`]);

  migrateCourses(data, NOW, codes);
  assert.equal(data.version, DB_VERSION);
  for (const seed of COURSE_SEEDS) {
    const s = data.sections[defaultSectionId(seed.id)];
    assert.equal(s.name, "01분반");
    assert.equal(s.code, data.courses[seed.id].code);
  }
  assert.equal(Object.keys(data.sections).length, COURSE_SEEDS.length);
  // 운영 과목 수강 → 01분반 (키 sectionId::userId), 기존 자료 기록은 그대로
  assert.equal(data.enrollments["course-campus::u2"], undefined);
  const moved = data.enrollments["section-campus-01::u2"];
  assert.equal(moved.sectionId, "section-campus-01");
  assert.equal(moved.courseId, "course-campus");
  assert.equal(moved.joinedAt, NOW);
  assert.equal(JSON.stringify(data.enrollments[`${LEGACY_COURSE_ID}::u1`]), legacyBefore);
  // 교수자–과목 배정 → 01분반 배정 (원래 데이터도 남는다)
  assert.equal(data.sectionInstructors["section-campus-01::t@x.com"].assignedBy, "admin");
  assert.ok(data.courseInstructors["course-campus::t@x.com"]);
  // 강의자료는 그대로 (분반별 복제 없음)
  assert.deepEqual(Object.keys(data.lessons).sort(), ["lesson-week01", "lesson-week02", "lesson-yjrzm-ep3"]);
});

test("새 분반 강의코드는 모든 분반·과목 코드와 겹치지 않는다", () => {
  const { data, codes } = v1();
  migrateCourses(data, NOW, codes);
  // 이미 쓰는 코드를 먼저 내놓는 생성기
  const taken = [data.courses["course-campus"].code, data.courses[LEGACY_COURSE_ID].code];
  let i = 0;
  const code = uniqueSectionCode(data, () => (i < taken.length ? taken[i++] : "FRESH9"));
  assert.equal(code, "FRESH9");
  assert.equal(nextSectionName(data.sections, "course-campus"), "02분반");
});

test("마이그레이션을 다시 실행해도 바뀌는 것이 없다", () => {
  const { data, codes } = v1();
  migrateCourses(data, NOW, codes);
  const once = JSON.stringify(data);
  assert.deepEqual(migrateCourses(data, "2027-01-01T00:00:00.000Z", codes), []);
  assert.equal(JSON.stringify(data), once);
});

test("새 DB에도 기본 과목 4개가 생긴다", () => {
  const data = { version: DB_VERSION, lessons: {}, enrollments: {} } as unknown as CourseTables;
  migrateCourses(data, NOW);
  assert.equal(Object.keys(data.courses).length, COURSE_SEEDS.length + 1);
  for (const c of Object.values(data.courses)) assert.match(c.code, /^[A-Z2-9]{6}$/);
});

test("학생 한 명이 여러 과목을, 과목별 진도는 강의자료의 courseId로 나뉜다", () => {
  const { data, codes } = v1();
  migrateCourses(data, NOW, codes);
  const campus = data.courses["course-campus"];
  const work = data.courses["course-workplace"];
  data.lessons[courseLessonId(campus.id, 1)] = lesson(courseLessonId(campus.id, 1), 1, { courseId: campus.id });
  data.lessons[courseLessonId(work.id, 1)] = lesson(courseLessonId(work.id, 1), 1, { courseId: work.id });
  assert.notEqual(courseLessonId(campus.id, 1), courseLessonId(work.id, 1));

  for (const c of [campus, work]) {
    data.enrollments[`${c.id}::u1`] = { courseId: c.id, courseCode: c.code, userId: "u1", name: "", email: "", joinedAt: NOW };
  }
  assert.deepEqual(
    enrollmentsForUser(data.enrollments, "u1").map((e) => e.courseId).sort(),
    [LEGACY_COURSE_ID, campus.id, work.id].sort(),
  );

  const p = {
    a: progress("u1", courseLessonId(campus.id, 1)),
    b: progress("u1", courseLessonId(work.id, 1)),
    c: progress("u1", "lesson-week01"),
  };
  assert.deepEqual(progressForCourse(p, data.lessons, campus.id), [p.a]);
  assert.deepEqual(progressForCourse(p, data.lessons, work.id), [p.b]);
  assert.deepEqual(progressForCourse(p, data.lessons, LEGACY_COURSE_ID), [p.c]);
});

test("강의코드 찾기와 교수자–과목 배정", () => {
  const { data, codes } = v1();
  migrateCourses(data, NOW, codes);
  const campus = data.courses["course-campus"];
  assert.equal(findCourseByCode(data.courses, ` ${campus.code.toLowerCase()} `)?.id, campus.id);
  assert.equal(findCourseByCode(data.courses, "NOPE00"), null);
  assert.equal(findCourseByCode(data.courses, ""), null);

  data.courseInstructors = {
    "course-campus::t@x.com": { courseId: "course-campus", email: "t@x.com", assignedAt: NOW, assignedBy: null },
    "course-university::t@x.com": { courseId: "course-university", email: "t@x.com", assignedAt: NOW, assignedBy: null },
    "course-campus::t2@x.com": { courseId: "course-campus", email: "t2@x.com", assignedAt: NOW, assignedBy: null },
  };
  assert.deepEqual(courseIdsForInstructor(data.courseInstructors, "t@x.com").sort(), ["course-campus", "course-university"]);
});

test("학습 방향: 새 과목은 1~15주 모두 중국어 원문, 기존 자료는 이전 규칙", () => {
  for (const w of [1, 8, 9, 15]) assert.equal(defaultDirectionFor("course-campus", w), "zh-ko");
  assert.equal(defaultDirectionFor(LEGACY_COURSE_ID, 8), "zh-ko");
  assert.equal(defaultDirectionFor(LEGACY_COURSE_ID, 9), "ko-zh");
});

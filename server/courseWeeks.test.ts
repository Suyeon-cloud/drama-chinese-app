// 과목·주차 화면 계산 검증 (npm test). 8주·20주 과목과 새 과목은 테스트용 데이터만 쓴다. (DB에 만들지 않는다)
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMyStats } from "../src/app/learning/useMyStats";
import type { LessonProgress } from "../src/app/store/models";
import { COURSE_PHASES } from "../src/content/course";
import { COURSE_SEEDS, LEGACY_COURSE_ID } from "../src/content/courses";
import {
  courseToneFor,
  courseWeeks,
  coursePhases,
  dashboardWeekCount,
  editorCourseProblem,
  isValidWeekCount,
  isWeekInCourse,
  resolveEditorCourse,
  sortCourses,
  weekRatio,
} from "../src/content/courseWeeks";
import type { Lesson } from "../src/content/types";

type C = { id: string; weekCount: number; createdAt?: string; status?: string };

/** 서버 /api/courses 응답과 같은 모양의 테스트용 과목 목록 */
const SERVER_COURSES: C[] = [
  { id: "course-legacy", weekCount: 15, createdAt: "2026-01-01T00:00:00Z", status: "legacy" },
  { id: "course-workplace", weekCount: 15, createdAt: "2026-02-01T00:00:00Z", status: "active" },
  { id: "course-campus", weekCount: 15, createdAt: "2026-02-01T00:00:00Z", status: "active" },
  { id: "course-university", weekCount: 15, createdAt: "2026-02-01T00:00:00Z", status: "active" },
];
const NEW_8: C = { id: "course-x7k2p9", weekCount: 8, createdAt: "2026-12-01T00:00:00Z", status: "active" };
const NEW_20: C = { id: "course-b4m8q2", weekCount: 20, createdAt: "2026-11-20T00:00:00Z", status: "active" };

/* ───────── 과목 ID 확인 (학습자료 편집 화면) ───────── */

test("기존 3개 운영 과목 ID는 서버 목록으로 정상 인식된다", () => {
  for (const seed of COURSE_SEEDS) {
    const r = resolveEditorCourse(SERVER_COURSES, seed.id);
    assert.equal(r.state, "ok", seed.id);
    if (r.state === "ok") {
      assert.equal(r.course.id, seed.id);
      assert.deepEqual(r.weeks, Array.from({ length: 15 }, (_, i) => i + 1));
    }
    assert.equal(editorCourseProblem(r, 1), null);
    assert.equal(editorCourseProblem(r, 15), null);
  }
});

test("기존 자료 과목(course-legacy)의 기존 자료 편집은 그대로 된다", () => {
  const r = resolveEditorCourse(SERVER_COURSES, LEGACY_COURSE_ID);
  assert.equal(r.state, "ok");
  assert.equal(editorCourseProblem(r, 9), null);
  // 기존 자료 과목의 주차 구분(1~8 중→한, 9~15 한→중)은 이전과 같다.
  assert.deepEqual(
    coursePhases(LEGACY_COURSE_ID, 15).map(({ title, subtitle, from, to }) => ({ title, subtitle, from, to })),
    COURSE_PHASES.map(({ title, subtitle, from, to }) => ({ title, subtitle, from, to })),
  );
});

test("서버 목록에 있는 새 과목 ID는 시드 목록에 없어도 그 과목으로 처리된다", () => {
  const list = [...SERVER_COURSES, NEW_8];
  const r = resolveEditorCourse(list, NEW_8.id);
  assert.equal(r.state, "ok");
  if (r.state === "ok") assert.equal(r.course.id, NEW_8.id);
  assert.equal(editorCourseProblem(r, 8), null);
});

test("서버 목록에 없는 과목 ID는 저장이 막히고 다른 과목으로 바뀌지 않는다", () => {
  for (const id of ["course-unknown", "course-campus2", "", "COURSE-CAMPUS"]) {
    const r = resolveEditorCourse(SERVER_COURSES, id);
    assert.equal(r.state, "missing", id);
    // course-legacy나 다른 과목으로 대체하지 않는다.
    assert.ok(!("course" in r), id);
    if (r.state === "missing") assert.equal(r.courseId, id);
    const problem = editorCourseProblem(r, 1);
    assert.ok(problem && problem.length > 0, id);
    assert.ok(!problem!.includes(LEGACY_COURSE_ID), id);
  }
});

test("과목 목록을 받기 전에는 저장이 막힌다", () => {
  for (const loading of [null, undefined]) {
    const r = resolveEditorCourse(loading, "course-campus");
    assert.equal(r.state, "loading");
    assert.match(editorCourseProblem(r, 1) ?? "", /불러오는 중/);
  }
  // 목록이 비어 있으면(담당 과목 없음) 없는 과목으로 다룬다.
  assert.equal(resolveEditorCourse([], "course-campus").state, "missing");
});

test("주차 수가 올바르지 않은 과목은 임의의 주차 수로 바꾸지 않고 저장을 막는다", () => {
  for (const weekCount of [0, -1, 31, 7.5, Number.NaN, undefined as unknown as number]) {
    const r = resolveEditorCourse([{ id: "course-bad", weekCount }], "course-bad");
    assert.equal(r.state, "invalidWeeks", String(weekCount));
    assert.ok(editorCourseProblem(r, 1));
    assert.deepEqual(courseWeeks(weekCount), []);
    assert.deepEqual(coursePhases("course-bad", weekCount), []);
  }
});

/* ───────── 주차 수 ───────── */

test("15주·8주·20주 과목은 각각의 주차 수만큼 표시된다", () => {
  for (const n of [15, 8, 20]) {
    assert.deepEqual(courseWeeks(n), Array.from({ length: n }, (_, i) => i + 1));
    const phases = coursePhases("course-any", n);
    assert.equal(phases.length, 1);
    assert.equal(phases[0].from, 1);
    assert.equal(phases[0].to, n);
    assert.equal(phases[0].title, `1~${n}주차`);
  }
  // 운영 과목 15주의 표 제목은 이전과 같다.
  assert.equal(coursePhases("course-campus", 15)[0].title, "1~15주차");
  assert.equal(coursePhases("course-campus", 15)[0].subtitle, "중국어 원문 기반");
  assert.equal(coursePhases("course-one", 1)[0].title, "1주차");
});

test("과목의 주차 범위를 벗어난 주차는 저장이 막힌다", () => {
  const list = [...SERVER_COURSES, NEW_8, NEW_20];
  const cases: [string, number, boolean][] = [
    ["course-campus", 15, true],
    ["course-campus", 16, false],
    [NEW_8.id, 8, true],
    [NEW_8.id, 9, false],
    [NEW_8.id, 15, false],
    [NEW_20.id, 20, true],
    [NEW_20.id, 16, true],
    [NEW_20.id, 21, false],
    [NEW_20.id, 0, false],
    [NEW_20.id, 2.5, false],
  ];
  for (const [id, week, okay] of cases) {
    const r = resolveEditorCourse(list, id);
    assert.equal(editorCourseProblem(r, week) === null, okay, `${id} ${week}`);
  }
  assert.match(editorCourseProblem(resolveEditorCourse(list, NEW_8.id), 9) ?? "", /1~8주차/);
  assert.equal(isWeekInCourse(1, 8), true);
  assert.equal(isWeekInCourse(1, 0), false);
  assert.equal(isValidWeekCount(30), true);
  assert.equal(isValidWeekCount(31), false);
});

test("진도율은 과목의 실제 주차 수로 계산한다", () => {
  assert.equal(weekRatio(3, 15), 3 / 15);
  assert.equal(weekRatio(4, 8), 0.5);
  assert.equal(weekRatio(5, 20), 0.25);
  assert.equal(weekRatio(9, 8), 1);
  // 주차 수가 없으면 NaN·무한대 대신 0
  assert.equal(weekRatio(3, 0), 0);
  assert.equal(weekRatio(3, undefined), 0);
});

const progressOf = (lessonId: string, week: number, done: boolean): LessonProgress => ({
  userId: "u1",
  lessonId,
  week,
  startedAt: "2026-11-01T00:00:00Z",
  completedAt: done ? "2026-11-01T01:00:00Z" : null,
  watchedRanges: [],
  progressRatio: done ? 1 : 0.4,
  maxPosition: 0,
  quiz: null,
  quizAttempts: 0,
  lastStudiedAt: "2026-11-01T01:00:00Z",
});

test("학습자 대시보드의 전체 주차는 수강 과목의 주차 수를 쓴다", () => {
  const progress = [progressOf("l1", 1, true), progressOf("l2", 2, false)];
  // 기존 3과목(15주): 이전과 같은 15
  const s15 = computeMyStats([] as Lesson[], progress, dashboardWeekCount([{ weekCount: 15 }]));
  assert.equal(s15.totalWeeks, 15);
  assert.equal(s15.completedCount, 1);
  assert.equal(computeMyStats([], progress, dashboardWeekCount([{ weekCount: 8 }])).totalWeeks, 8);
  assert.equal(computeMyStats([], progress, dashboardWeekCount([{ weekCount: 15 }, { weekCount: 20 }])).totalWeeks, 20);
  // 수강 과목 정보가 없으면 임의의 15를 쓰지 않는다.
  assert.equal(dashboardWeekCount([]), null);
  assert.equal(dashboardWeekCount(null), null);
  assert.equal(dashboardWeekCount([{ weekCount: 0 }]), null);
  assert.equal(computeMyStats([], progress, null).totalWeeks, null);
});

test("학습자료가 없는 주차도 주차 목록에 남는다 (가짜 학습자료 없이)", () => {
  const lessons = [{ week: 1 }, { week: 3 }];
  const empty = courseWeeks(8).filter((w) => !lessons.some((l) => l.week === w));
  assert.deepEqual(empty, [2, 4, 5, 6, 7, 8]);
});

/* ───────── 과목 정렬·카드 색 ───────── */

test("기존 3과목 순서는 그대로, 새 과목은 그 뒤에 생성일 순이며 누락되지 않는다", () => {
  const list = [NEW_8, ...SERVER_COURSES.filter((c) => c.status === "active"), NEW_20];
  const sorted = sortCourses(list);
  assert.deepEqual(sorted.map((c) => c.id), [...COURSE_SEEDS.map((s) => s.id), NEW_20.id, NEW_8.id]);
  assert.equal(sorted.length, list.length);
  // 원본 배열은 바꾸지 않는다.
  assert.equal(list[0].id, NEW_8.id);
  // 생성일이 같으면 id 순 (안정적)
  const twins = sortCourses([
    { id: "course-zz", weekCount: 15, createdAt: "2026-12-01T00:00:00Z" },
    { id: "course-aa", weekCount: 15, createdAt: "2026-12-01T00:00:00Z" },
  ]);
  assert.deepEqual(twins.map((c) => c.id), ["course-aa", "course-zz"]);
});

test("기존 과목의 카드 색은 그대로, 새 과목은 항상 같은 기본 색을 받는다", () => {
  assert.equal(courseToneFor("course-campus"), "sky");
  assert.equal(courseToneFor("course-university"), "pink");
  assert.equal(courseToneFor("course-workplace"), "mint");
  assert.equal(courseToneFor(LEGACY_COURSE_ID), "sky");
  const tones = ["lavender", "cream", "sky", "pink", "mint"];
  for (const c of [NEW_8, NEW_20]) {
    assert.ok(tones.includes(courseToneFor(c.id)));
    assert.equal(courseToneFor(c.id), courseToneFor(c.id));
  }
});

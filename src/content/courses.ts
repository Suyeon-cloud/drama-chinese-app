// 《追剧学汉语》 플랫폼의 과목 (중국 드라마 1편 = 중국어 과목 1개, 과목마다 1~15주)
//
// - 강의코드(code)·생성일은 서버가 DB에 과목을 처음 만들 때 정한다. (server/migrate.ts)
// - 이전 1과목 시절의 강의자료(以家人之名 1주차, 예시 자료 등)는 지우지 않고 ‘기존 자료’ 과목에 보관한다.
//   기존 자료는 새 3과목의 학습 화면에 나오지 않는다.

import type { Course } from "../app/store/models";
import { COURSE_WEEK_COUNT, defaultDirectionForWeek } from "./course";
import type { LearningDirection } from "./types";

export type CourseSeed = Pick<Course, "id" | "drama" | "title" | "context" | "description" | "weekCount" | "status">;

export const LEGACY_COURSE_ID = "course-legacy";

/** 새 3과목 */
export const COURSE_SEEDS: CourseSeed[] = [
  {
    id: "course-campus",
    drama: "当我飞奔向你",
    title: "校园生活汉语",
    context: "학교생활과 청소년·친구 관계에서 사용하는 실용 중국어",
    description: "《当我飞奔向你》의 장면과 실제 대사로 학교생활 중국어를 배워요.",
    weekCount: COURSE_WEEK_COUNT,
    status: "active",
  },
  {
    id: "course-university",
    drama: "机智的上半场",
    title: "大学生活汉语",
    context: "대학생활, 기숙사, 친구 관계, 발표, 진로 등에서 사용하는 실용 중국어",
    description: "《机智的上半场》의 장면과 실제 대사로 대학생활 중국어를 배워요.",
    weekCount: COURSE_WEEK_COUNT,
    status: "active",
  },
  {
    id: "course-workplace",
    drama: "你也有今天",
    title: "职场生活汉语",
    context: "직장생활, 상사·동료·고객과의 의사소통, 회의, 업무와 갈등 상황 등에서 사용하는 실용 중국어",
    description: "《你也有今天》의 장면과 실제 대사로 직장생활 중국어를 배워요.",
    weekCount: COURSE_WEEK_COUNT,
    status: "active",
  },
];

/** 이전 1과목(드라마로 배우는 중국어 15주)의 강의자료·참여 기록 보관용 */
export const LEGACY_COURSE_SEED: CourseSeed = {
  id: LEGACY_COURSE_ID,
  drama: "",
  title: "드라마로 배우는 중국어 (15주)",
  context: "",
  description: "3과목 개편 전의 강의자료를 보관하는 기존 자료예요. 새 과목 학습 화면에는 나오지 않아요.",
  weekCount: COURSE_WEEK_COUNT,
  status: "legacy",
};

export const ALL_COURSE_SEEDS: CourseSeed[] = [...COURSE_SEEDS, LEGACY_COURSE_SEED];

export const isCourseId = (id: string) => ALL_COURSE_SEEDS.some((c) => c.id === id);

/** 과목별 주차 강의자료 id (예: course-campus-w01). 과목이 달라도 같은 주차 id가 겹치지 않는다. */
export const courseLessonId = (courseId: string, week: number) => `${courseId}-w${String(week).padStart(2, "0")}`;

/**
 * 새 강의자료의 기본 학습 방향.
 * 새 3과목은 1~15주 모두 중국어 원문 기반(중국어 → 한국어), 기존 자료는 이전 규칙(1~8주 중→한, 9~15주 한→중)을 그대로 쓴다.
 */
export const defaultDirectionFor = (courseId: string, week: number): LearningDirection =>
  courseId === LEGACY_COURSE_ID ? defaultDirectionForWeek(week) : "zh-ko";

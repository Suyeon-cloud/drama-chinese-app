// 새 3과목 45개 기본 강의자료 검증 (npm test)
import assert from "node:assert/strict";
import { test } from "node:test";
import { COURSE_LESSONS } from "../src/content/courseLessons";
import { COURSE_SEEDS, LEGACY_COURSE_ID } from "../src/content/courses";
import { SEED_LESSONS } from "../src/content/lessons";
import { SAVED_LESSONS } from "../src/content/savedLessons";

/** 확정 목록의 영상 id (데이터 파일과 따로 적어 서로 대조한다) */
const EXPECTED_VIDEO_IDS: Record<string, string[]> = {
  "course-campus": [
    "d0msPNoywS8", "EXUSxAKaLmI", "Ca3Hym5ASU0", "1TpuMnIGhE4", "yhJZPFkK4ls",
    "WiHQF126-V8", "z50hQlKQVXw", "jMSiaSgsEtY", "AoA-guQvuJ0", "B8Yd507kL9I",
    "i_WSKKHZH2Y", "SQc_xiC91mk", "mu0n09BwhPU", "1qqekOlp_Dk", "SWbbyNKRHnc",
  ],
  "course-university": [
    "mR4xiaNeyfs", "GVmEncNtcac", "rOCggaC38L0", "T82vWnNBA2k", "FinXR50tmHU",
    "sNKLWf15eFU", "Bj3gXUVaVFk", "mcIzM3NnAo8", "NCXrWdP9hjU", "Djg24YNq0WY",
    "QPzuRdcc6Z4", "gcLCGSKsYBc", "M08ALP64muQ", "LB6EERwX9go", "WMDz4an9Zrc",
  ],
  "course-workplace": [
    "5WiXCsy_cGo", "M9AY_hLeLvs", "4QoZAc63524", "pYhtDs-87NE", "3IodkcrIY2g",
    "EI6Qjxfsfm8", "zGxpsAvVxOM", "uHXK1PiXoBg", "LdVMQIGFSQk", "Uq1YkuTHL3g",
    "bTlwzX0XYzA", "pKQ6gsAXdW0", "zzj76T4sMQs", "-7iyU8ZRDaU", "UmuqP7R7KS0",
  ],
};

const LEGACY_IDS = [
  "lesson-yjrzm-ep3",
  ...Array.from({ length: 15 }, (_, i) => `lesson-week${String(i + 1).padStart(2, "0")}`),
];

test("새 강의자료는 정확히 45개, 과목마다 15개이고 주차 1~15가 한 번씩", () => {
  assert.equal(COURSE_LESSONS.length, 45);
  for (const course of COURSE_SEEDS) {
    const list = COURSE_LESSONS.filter((l) => l.courseId === course.id);
    assert.equal(list.length, 15, course.id);
    assert.deepEqual(
      list.map((l) => l.week).sort((a, b) => a - b),
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    for (const l of list) {
      assert.equal(l.id, `${course.id}-w${String(l.week).padStart(2, "0")}`);
      assert.equal(l.source?.dramaTitle, course.drama);
    }
  }
  assert.equal(new Set(COURSE_LESSONS.map((l) => l.id)).size, 45);
});

test("영상 주소가 확정 목록과 같고, 잘못된 5zb-V4n-rEI는 없다", () => {
  for (const [courseId, ids] of Object.entries(EXPECTED_VIDEO_IDS)) {
    ids.forEach((id, i) => {
      const l = COURSE_LESSONS.find((x) => x.courseId === courseId && x.week === i + 1)!;
      assert.equal(l.video.youtubeId, id, `${courseId} ${i + 1}주차`);
      assert.ok(l.video.youtubeUrl.endsWith(id), `${courseId} ${i + 1}주차 URL`);
    });
  }
  const w14 = COURSE_LESSONS.find((l) => l.id === "course-university-w14")!;
  assert.equal(w14.video.youtubeId, "LB6EERwX9go");
  assert.equal(w14.video.youtubeUrl, "https://www.youtube.com/watch?v=LB6EERwX9go");
  assert.ok(!JSON.stringify(COURSE_LESSONS).includes("5zb-V4n-rEI"));
});

test("새 강의자료에는 학습 콘텐츠·자막·HSK 수준이 없고 모두 준비 중", () => {
  for (const l of COURSE_LESSONS) {
    assert.equal(l.status, "draft");
    assert.equal(l.direction, "zh-ko");
    assert.equal(l.level, "");
    assert.ok(l.title.trim(), `${l.id} 학습 주제`);
    assert.ok(l.source?.videoTitle?.trim(), `${l.id} 영상 제목`);
    assert.notEqual(l.title, l.source?.videoTitle);
    assert.equal(l.script.cues.length, 0);
    assert.equal(l.script.plain, undefined);
    assert.equal(l.draft, undefined);
    assert.equal(l.content, undefined);
    assert.equal(l.episodeId, undefined);
    assert.equal(l.description, "");
  }
});

test("기존 자료 16개는 그대로 course-legacy에 있고 새 강의자료와 겹치지 않는다", () => {
  const legacy = SEED_LESSONS.filter((l) => l.courseId === LEGACY_COURSE_ID);
  assert.deepEqual(legacy.map((l) => l.id).sort(), [...LEGACY_IDS].sort());
  // 서버 DB에 들어가는 기존 자료는 내보낸 저장본(savedLessons.ts)과 같다.
  for (const l of legacy) assert.deepEqual(l, SAVED_LESSONS.find((s) => s.id === l.id));
  assert.equal(SEED_LESSONS.length, 16 + 45);
  for (const l of COURSE_LESSONS) assert.ok(!LEGACY_IDS.includes(l.id));

  // 과목 1의 2주차는 기존 2주차와 영상만 같고, 기존 자료를 옮기거나 복사하지 않았다.
  const oldW2 = SEED_LESSONS.find((l) => l.id === "lesson-week02")!;
  const newW2 = SEED_LESSONS.find((l) => l.id === "course-campus-w02")!;
  assert.equal(oldW2.courseId, LEGACY_COURSE_ID);
  assert.equal(oldW2.video.youtubeId, newW2.video.youtubeId);
  assert.ok(oldW2.script.cues.length > 0);
  assert.equal(newW2.script.cues.length, 0);
  assert.equal(newW2.draft, undefined);
});

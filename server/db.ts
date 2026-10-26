// 서버 데이터 저장소: JSON 파일 하나(DATA_DIR/db.json)에 모든 데이터를 저장한다.
//
// - 별도 DB 서버 없이 Railway 한 서비스로 돌아가도록 가장 단순한 방식을 골랐다.
// - Railway에서는 Volume을 /data에 연결하고 DATA_DIR=/data 로 두어야 재배포 후에도 데이터가 남는다.
//   (Volume이 없으면 배포할 때마다 데이터가 초기화된다)
// - 쓰기는 임시 파일에 쓴 뒤 이름을 바꿔(원자적 교체) 파일이 깨지지 않게 한다.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SEED_LESSONS } from "../src/content/lessons";
import { LEGACY_LEVEL_IDS } from "../src/content/levels";
import type { Lesson } from "../src/content/types";
import type {
  CourseInfo,
  Enrollment,
  FeedbackDraft,
  InstructorRecord,
  LearnerProfile,
  LessonProgress,
} from "../src/app/store/models";

export type DbData = {
  version: 1;
  members: Record<string, LearnerProfile>;
  lessons: Record<string, Lesson>;
  /** 이미 한 번 넣은 기본 강의자료 id (관리자가 지운 기본 자료를 다시 넣지 않기 위해) */
  seededLessonIds: string[];
  /** key: userId::lessonId */
  progress: Record<string, LessonProgress>;
  feedback: Record<string, FeedbackDraft>;
  instructors: Record<string, InstructorRecord>;
  course: CourseInfo | null;
  /** key: courseCode::userId */
  enrollments: Record<string, Enrollment>;
  /** 로그인 쿠키 서명 키 (SESSION_SECRET 환경변수가 없을 때 사용) */
  sessionSecret: string;
  /** 관리자가 화면에서 연결한 Anthropic API 키 (AI 학습 콘텐츠 생성). 화면에는 끝 4자리만 보여준다. */
  anthropicApiKey?: string;
};

const emptyDb = (): DbData => ({
  version: 1,
  members: {},
  lessons: {},
  seededLessonIds: [],
  progress: {},
  feedback: {},
  instructors: {},
  course: null,
  enrollments: {},
  sessionSecret: randomBytes(32).toString("hex"),
});

export type Db = {
  data: DbData;
  /** 변경 후 호출 — 파일에 저장한다. */
  save(): void;
  file: string;
};

export const openDb = (dataDir: string): Db => {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "db.json");
  const data: DbData = existsSync(file)
    ? { ...emptyDb(), ...(JSON.parse(readFileSync(file, "utf8")) as Partial<DbData>) }
    : emptyDb();

  const save = () => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  };

  // 기본 강의자료(15주차)를 처음 한 번만 넣는다.
  let changed = !existsSync(file);
  for (const lesson of SEED_LESSONS) {
    if (data.seededLessonIds.includes(lesson.id)) continue;
    data.seededLessonIds.push(lesson.id);
    if (!data.lessons[lesson.id]) data.lessons[lesson.id] = lesson;
    changed = true;
  }
  // 초급·중급·고급으로 저장된 강의자료를 HSK 등급으로 옮긴다.
  for (const lesson of Object.values(data.lessons)) {
    const hsk = LEGACY_LEVEL_IDS[lesson.level];
    if (hsk) {
      lesson.level = hsk;
      changed = true;
    }
  }
  if (changed) save();

  return { data, save, file };
};

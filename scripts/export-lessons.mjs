// 앱에서 만든 강의자료(data/db.json)를 코드(src/content/savedLessons.ts)로 내보낸다.
// 커밋·배포에 강의자료를 함께 넣기 위해서다. 회원·학습 기록·API 키는 내보내지 않는다.
//   npm run export-lessons
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR || "data";
const dbFile = path.join(dataDir, "db.json");
const outFile = path.join("src", "content", "savedLessons.ts");

if (!existsSync(dbFile)) {
  console.error(`${dbFile} 파일이 없어요. 웹앱(npm run app)에서 강의자료를 저장한 뒤 다시 실행해 주세요.`);
  process.exit(1);
}

const db = JSON.parse(readFileSync(dbFile, "utf8"));
const lessons = Object.values(db.lessons ?? {}).sort(
  (a, b) => a.week - b.week || String(a.createdAt).localeCompare(String(b.createdAt)),
);

const header = `// 자동 생성 파일 — 직접 고치지 마세요. 웹앱에서 강의자료를 고친 뒤 \`npm run export-lessons\`로 다시 만듭니다.
// data/db.json의 강의자료 ${lessons.length}개 (${new Date().toISOString()})
// 서버 DB에 처음 들어가는 기본 강의자료(SEED_LESSONS)에서 같은 id의 기본값을 이 내용으로 바꾼다.
import type { Lesson } from "./types";

`;
writeFileSync(outFile, `${header}export const SAVED_LESSONS: Lesson[] = ${JSON.stringify(lessons, null, 2)};\n`);

for (const l of lessons) console.log(`  ${String(l.week).padStart(2)}주차 · ${l.status.padEnd(9)} · ${l.title || "(제목 없음)"}`);
console.log(`\n강의자료 ${lessons.length}개를 ${outFile}에 내보냈어요.`);

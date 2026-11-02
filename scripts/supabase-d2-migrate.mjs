// Phase D2: data/db.json의 학습자료(Lesson) 61개와 회화 연습을 Supabase dev로 옮긴다.
//   npm run supabase:migrate-d2            → 원본 검사 + dry-run (읽기만, 바뀔 내용 출력)
//   npm run supabase:migrate-d2 -- --apply → 실제 반영 후 전수 비교
//   (esbuild로 묶어 실행한다: Lesson ↔ 행 변환은 D3 API와 같은 server/lessonRows.ts)
// - 원본은 로컬 data/db.json 하나. Railway 데이터는 합치지 않는다. service-role은 이 스크립트(서버 쪽)에서만 쓴다.
// - 원본 검사(개수·주차·필드·문자열·대표 W1·회화)가 하나라도 예상과 다르면 아무것도 쓰지 않고 멈춘다.
// - 여러 번 실행해도 결과가 같다: 없는 학습자료만 넣고, 이미 있는 것은 Supabase에서 다시 조립한 값이 원본과 완전히 같은지 확인만 한다.
//   이후 수정된 행(version > 1, 수정자 기록, 내용 차이)은 덮어쓰지 않고 conflict로 보고하며, 그때는 아무것도 쓰지 않는다.
//   원본에 없는 행을 지우는 등 Supabase를 원본에 ‘맞추는’ 삭제는 하지 않는다.
// - 이전은 사용자 편집이 아니므로 version 1, updated_by null, updated_by_label 'migration'(C2 교수자 source='migration'과 같은 표시),
//   created_at·updated_at은 원본 시각 그대로 둔다.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { dialogueRowsOf, lessonFromRows, lessonToRow } from "../server/lessonRows";

const apply = process.argv.includes("--apply");
const dbPath = process.env.D2_DB_PATH || "data/db.json";
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(".env.local에 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요해요.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const MIGRATION_LABEL = "migration";
const fail = (msg) => {
  console.error(`✖ 중단: ${msg}`);
  process.exit(1);
};
const must = async (p, what) => {
  const r = await p;
  if (r.error) fail(`${what}: ${r.error.message}`);
  return r.data;
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/* ───────── 예상 원본 상태 (D 설계·D2 지시 기준) ───────── */

const EXPECT = {
  total: 61,
  perCourse: { "course-campus": 15, "course-university": 15, "course-workplace": 15, "course-legacy": 16 },
  newCourses: ["course-campus", "course-university", "course-workplace"],
  legacyCourse: "course-legacy",
  legacyWeek1: ["lesson-week01", "lesson-yjrzm-ep3"],
  w1: {
    "course-campus-w01": { cues: 143 },
    "course-university-w01": { cues: 134 },
    "course-workplace-w01": { cues: 98 },
  },
  w1Draft: { expressions: 5, grammar: 5, lenses: 1, quiz: 5 },
  dialogue: { lessonId: "course-campus-w01", count: 1, roles: 2, lines: 12 },
};

const LESSON_KEYS = new Set([
  "id", "courseId", "week", "title", "description", "direction", "level", "status", "video", "captionMask",
  "subtitlePosition", "source", "script", "content", "draft", "dialogues", "episodeId", "createdAt", "updatedAt",
]);
const OPTIONAL_OBJECTS = ["captionMask", "source", "content", "draft"];
const VIDEO_KEYS = ["youtubeUrl", "youtubeId", "startTime", "endTime"];
const DIALOGUE_KEYS = new Set(["id", "title", "situation", "roles", "lines", "status"]);
const ROLE_KEYS = new Set(["id", "name"]);
const LINE_KEYS = new Set(["id", "roleId", "cueId", "zh", "pinyin", "ko", "start", "end"]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const isoExact = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;

/* ───────── 원본 검사 ───────── */

const db = JSON.parse(readFileSync(dbPath, "utf8"));
const lessons = Object.values(db.lessons ?? {});
const problems = [];
const bad = (id, msg) => problems.push(`${id}: ${msg}`);

// DB 저장을 방해하는 문자열: NUL, 짝이 없는 surrogate (JSONB·text가 거부하거나 깨뜨린다)
const scanStrings = (v, path, id) => {
  if (typeof v === "string") {
    if (v.includes("\u0000")) bad(id, `${path}에 NUL 문자`);
    if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(v)) bad(id, `${path}에 깨진 문자(surrogate)`);
  } else if (Array.isArray(v)) v.forEach((x, i) => scanStrings(x, `${path}[${i}]`, id));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) { scanStrings(k, `${path}.<key>`, id); scanStrings(x, `${path}.${k}`, id); }
  else if (typeof v === "number" && !Number.isFinite(v)) bad(id, `${path}가 유한한 숫자가 아님`);
};

const remoteCourses = await must(admin.from("courses").select("id,status,week_count"), "courses 조회");
const courseById = new Map(remoteCourses.map((c) => [c.id, c]));

const ids = new Set();
for (const l of lessons) {
  const id = l.id;
  if (typeof id !== "string" || !ID_RE.test(id)) bad(String(id), "id 형식");
  if (ids.has(id)) bad(id, "id 중복");
  ids.add(id);
  if (db.lessons[id] !== l) bad(id, "db.json의 key와 id가 다름");
  for (const k of Object.keys(l)) if (!LESSON_KEYS.has(k)) bad(id, `알 수 없는 필드 ${k} (옮기면 사라짐)`);
  for (const k of ["courseId", "title", "description", "direction", "level", "status"]) if (typeof l[k] !== "string") bad(id, `${k}가 문자열이 아님`);
  const course = courseById.get(l.courseId);
  if (!course) bad(id, `Supabase에 없는 과목 ${l.courseId}`);
  if (!Number.isInteger(l.week) || l.week < 1 || l.week > (course?.week_count ?? 15)) bad(id, `week 값 ${l.week}`);
  if (!["draft", "ready", "published"].includes(l.status)) bad(id, `status 값 ${l.status}`);
  if (!["zh-ko", "ko-zh"].includes(l.direction)) bad(id, `direction 값 ${l.direction}`);
  if (!isObj(l.video) || Object.keys(l.video).some((k) => !VIDEO_KEYS.includes(k))) bad(id, "video 형식");
  else {
    if (typeof l.video.youtubeUrl !== "string" || typeof l.video.youtubeId !== "string") bad(id, "video URL·id가 문자열이 아님");
    if (typeof l.video.startTime !== "number" || typeof l.video.endTime !== "number") bad(id, "video 시간이 숫자가 아님");
  }
  if (!isObj(l.script) || !Array.isArray(l.script.cues)) bad(id, "script 형식");
  // 선택 필드: 없음(absent)만 허용. 명시적 null은 복원하면 ‘없음’이 되어 원본과 달라지므로 미리 알린다.
  for (const k of OPTIONAL_OBJECTS) if (has(l, k) && !isObj(l[k])) bad(id, `${k}가 객체가 아님(${l[k] === null ? "null" : typeof l[k]})`);
  for (const k of ["subtitlePosition", "episodeId"]) if (has(l, k) && typeof l[k] !== "string") bad(id, `${k}가 문자열이 아님`);
  if (has(l, "subtitlePosition") && !["high", "middle", "midLow", "low"].includes(l.subtitlePosition)) bad(id, "subtitlePosition 값");
  if (!isoExact(l.createdAt) || !isoExact(l.updatedAt)) bad(id, "createdAt/updatedAt이 정확한 ISO 시각이 아님");
  if (has(l, "dialogues")) {
    if (!Array.isArray(l.dialogues) || l.dialogues.length === 0) bad(id, "dialogues가 비어 있지 않은 배열이 아님 (복원하면 ‘없음’이 됨)");
    for (const d of l.dialogues ?? []) {
      for (const k of Object.keys(d)) if (!DIALOGUE_KEYS.has(k)) bad(id, `회화 필드 ${k}`);
      if (typeof d.id !== "string" || !ID_RE.test(d.id)) bad(id, "회화 id 형식");
      if (typeof d.title !== "string" || typeof d.situation !== "string") bad(id, "회화 제목·상황이 문자열이 아님");
      if (!["draft", "published"].includes(d.status)) bad(id, "회화 status 값");
      if (!Array.isArray(d.roles) || !Array.isArray(d.lines)) bad(id, "회화 roles/lines 형식");
      const roleIds = new Set();
      for (const r of d.roles ?? []) {
        for (const k of Object.keys(r)) if (!ROLE_KEYS.has(k)) bad(id, `역할 필드 ${k}`);
        if (typeof r.id !== "string" || r.id.length < 1 || r.id.length > 100 || roleIds.has(r.id)) bad(id, "역할 id 형식·중복");
        if (typeof r.name !== "string") bad(id, "역할 이름이 문자열이 아님");
        roleIds.add(r.id);
      }
      const lineIds = new Set();
      for (const x of d.lines ?? []) {
        for (const k of Object.keys(x)) if (!LINE_KEYS.has(k)) bad(id, `대사 필드 ${k}`);
        if (typeof x.id !== "string" || x.id.length < 1 || x.id.length > 100 || lineIds.has(x.id)) bad(id, "대사 id 형식·중복");
        lineIds.add(x.id);
        if (typeof x.roleId !== "string" || typeof x.zh !== "string") bad(id, "대사 roleId·zh가 문자열이 아님");
        for (const k of ["cueId", "pinyin", "ko"]) if (has(x, k) && typeof x[k] !== "string") bad(id, `대사 ${k}가 문자열이 아님`);
        if (typeof x.start !== "number" || typeof x.end !== "number") bad(id, "대사 시간이 숫자가 아님");
      }
    }
  }
  scanStrings(l, "lesson", id);
}
const allDialogueIds = lessons.flatMap((l) => (l.dialogues ?? []).map((d) => d.id));
if (new Set(allDialogueIds).size !== allDialogueIds.length) problems.push("회화 id가 학습자료 사이에서 중복");

// 개수·주차
const byCourse = {};
for (const l of lessons) (byCourse[l.courseId] ??= []).push(l);
const expectations = [];
const expect = (name, ok, detail = "") => {
  expectations.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};
console.log(`== 원본 검사 (${dbPath})`);
expect(`Lesson 총 ${EXPECT.total}개, id 중복 없음`, lessons.length === EXPECT.total && ids.size === EXPECT.total, `${lessons.length}개`);
expect(
  "과목별 15 / 15 / 15 / 16",
  isDeepStrictEqual(Object.fromEntries(Object.entries(byCourse).map(([c, v]) => [c, v.length])), EXPECT.perCourse),
  JSON.stringify(Object.fromEntries(Object.entries(byCourse).map(([c, v]) => [c, v.length]))),
);
for (const c of EXPECT.newCourses) {
  const list = byCourse[c] ?? [];
  const weeks = list.map((l) => l.week).sort((a, b) => a - b);
  const pub = list.filter((l) => l.status === "published");
  expect(
    `${c}: 주차 1~15 각 1개, W1만 published·나머지 14 draft`,
    isDeepStrictEqual(weeks, Array.from({ length: 15 }, (_, i) => i + 1)) && pub.length === 1 && pub[0].week === 1 && list.filter((l) => l.status === "draft").length === 14,
  );
}
const legacyW1 = (byCourse[EXPECT.legacyCourse] ?? []).filter((l) => l.week === 1).map((l) => l.id).sort();
expect("legacy week 1 중복 2개 (의도된 상태)", isDeepStrictEqual(legacyW1, EXPECT.legacyWeek1), legacyW1.join(", "));
expect("모든 courseId가 Supabase courses에 있음, legacy 과목은 status=legacy", lessons.every((l) => courseById.has(l.courseId)) && courseById.get(EXPECT.legacyCourse)?.status === "legacy");
expect("필드·값·시각·문자열 검사 (NUL·깨진 문자·알 수 없는 필드·명시적 null 없음)", problems.length === 0, problems.slice(0, 10).join(" / "));

// 대표 W1
for (const [id, { cues }] of Object.entries(EXPECT.w1)) {
  const l = db.lessons[id];
  const d = l?.draft;
  expect(
    `대표 ${id}: 자막 ${cues}줄, 핵심표현 5·어휘문법 5·문화렌즈 1·퀴즈 5, captionMask·source·video 있음`,
    !!l && l.script.cues.length === cues && !!d &&
      d.expressions?.length === EXPECT.w1Draft.expressions && d.grammar?.length === EXPECT.w1Draft.grammar &&
      d.lenses?.length === EXPECT.w1Draft.lenses && d.quiz?.length === EXPECT.w1Draft.quiz &&
      isObj(l.captionMask) && isObj(l.source) && !!l.video.youtubeId && typeof l.description === "string",
    l ? `cues ${l.script.cues.length}, level '${l.level}', draft.level '${d?.level ?? "(없음)"}'` : "없음",
  );
}

// 회화
const withDialogues = lessons.filter((l) => l.dialogues?.length);
const dl = db.lessons[EXPECT.dialogue.lessonId]?.dialogues?.[0];
const campusCueIds = new Set((db.lessons[EXPECT.dialogue.lessonId]?.script.cues ?? []).filter((c) => c.id).map((c) => c.id));
expect(
  "회화: 전체 1개, Campus W1 소속, published, 역할 2·대사 12",
  withDialogues.length === 1 && withDialogues[0].id === EXPECT.dialogue.lessonId && allDialogueIds.length === EXPECT.dialogue.count &&
    dl?.status === "published" && dl.roles.length === EXPECT.dialogue.roles && dl.lines.length === EXPECT.dialogue.lines,
);
expect(
  "회화 대사: cueId 12개 모두 Campus W1 자막에 있음, roleId는 역할 id 원문, zh·pinyin·ko·시간 있음",
  !!dl && dl.lines.every((x) => typeof x.cueId === "string" && campusCueIds.has(x.cueId)) &&
    dl.lines.every((x) => dl.roles.some((r) => r.id === x.roleId)) &&
    dl.lines.every((x) => typeof x.zh === "string" && typeof x.pinyin === "string" && typeof x.ko === "string" && typeof x.start === "number" && typeof x.end === "number"),
);

if (expectations.some((e) => !e.ok)) fail("원본이 예상과 달라 아무것도 쓰지 않았어요.");

/* ───────── 변환 (Lesson ↔ 행) ───────── */

// D3 API와 같은 변환(server/lessonRows.ts)을 쓴다. 여기서 따로 만들지 않아 둘이 어긋나지 않는다.
const toRow = (l) => lessonToRow(l, { version: 1, updated_by: null, updated_by_label: MIGRATION_LABEL });
const dialogueRows = dialogueRowsOf;
const fromRows = lessonFromRows;

/** 처음 다른 지점 (보고용) */
const firstDiff = (a, b, path = "") => {
  if (isDeepStrictEqual(a, b)) return null;
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!has(a, k) || !has(b, k)) return `${path}.${k} (${has(a, k) ? "복원본에 없음" : "원본에 없음"})`;
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path} 길이 ${a.length}≠${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
  }
  return `${path || "(값)"}`;
};

/* ───────── Supabase 현재 상태 ───────── */

const loadRemote = async () => {
  const rows = await must(admin.from("lessons").select("*").order("id"), "lessons 조회");
  const dRows = await must(admin.from("lesson_dialogues").select("*"), "lesson_dialogues 조회");
  const rRows = await must(admin.from("dialogue_roles").select("*"), "dialogue_roles 조회");
  const lRows = await must(admin.from("dialogue_lines").select("*"), "dialogue_lines 조회");
  return { rows, dRows, rRows, lRows };
};

const classify = (remote) => {
  const byId = new Map(remote.rows.map((r) => [r.id, r]));
  const plan = { insert: [], resumeDialogues: [], unchanged: [], conflict: [], invalid: problems.slice() };
  for (const l of lessons) {
    const row = byId.get(l.id);
    if (!row) {
      // 원본 회화 id가 다른 학습자료에 이미 있으면 덮어쓰지 않는다.
      const taken = (l.dialogues ?? []).filter((d) => remote.dRows.some((x) => x.id === d.id));
      if (taken.length) plan.conflict.push(`${l.id}: 회화 id ${taken.map((d) => d.id).join(",")}가 이미 다른 학습자료에 있음`);
      else plan.insert.push(l);
      continue;
    }
    const importState = row.version === 1 && row.updated_by === null && row.updated_by_label === MIGRATION_LABEL;
    if (!importState) {
      plan.conflict.push(`${l.id}: 이전 이후 수정됨 (version ${row.version}, 수정자 ${row.updated_by_label ?? "-"})`);
      continue;
    }
    const restored = fromRows(row, remote.dRows, remote.rRows, remote.lRows);
    if (isDeepStrictEqual(restored, l)) {
      plan.unchanged.push(l);
      continue;
    }
    // 학습자료 행은 이전 그대로인데 회화만 아직 없는 경우 (이전 중 회화 단계에서 멈춤) → 회화만 이어서 넣는다.
    const { dialogues: _d, ...restWithout } = l;
    const noRemoteDialogues = !remote.dRows.some((x) => x.lesson_id === l.id);
    if (has(l, "dialogues") && noRemoteDialogues && isDeepStrictEqual(restored, restWithout)) plan.resumeDialogues.push(l);
    else plan.conflict.push(`${l.id}: 내용이 원본과 다름 (${firstDiff(restored, l)})`);
  }
  const extra = remote.rows.filter((r) => !db.lessons[r.id]).map((r) => r.id);
  for (const id of extra) plan.conflict.push(`${id}: 원본에 없는 학습자료가 Supabase에 있음 (지우지 않음)`);
  return plan;
};

const report = (plan, title) => {
  console.log(`\n== ${title}`);
  console.log(`insert ${plan.insert.length} | 회화만 이어서 넣기 ${plan.resumeDialogues.length} | unchanged ${plan.unchanged.length} | conflict ${plan.conflict.length} | invalid ${plan.invalid.length}`);
  const dCount = (list) => list.reduce((n, l) => n + (l.dialogues?.length ?? 0), 0);
  console.log(`회화: insert ${dCount([...plan.insert, ...plan.resumeDialogues])} | unchanged ${dCount(plan.unchanged)}`);
  for (const c of plan.conflict) console.log(`  conflict  ${c}`);
  for (const c of plan.invalid) console.log(`  invalid   ${c}`);
};

const before = await loadRemote();
const plan = classify(before);
report(plan, apply ? "적용 전 계획" : "DRY-RUN");
if (plan.conflict.length || plan.invalid.length) fail("conflict 또는 invalid가 있어 아무것도 쓰지 않았어요.");

if (!apply) {
  console.log("\ndry-run이라 아무것도 바꾸지 않았어요. 반영하려면 --apply");
} else {
  if (plan.insert.length) {
    await must(admin.from("lessons").insert(plan.insert.map(toRow)), "lessons 넣기");
    console.log(`lessons ${plan.insert.length}개 넣음`);
  }
  const withD = [...plan.insert, ...plan.resumeDialogues].filter((l) => l.dialogues?.length);
  if (withD.length) {
    const rows = withD.map(dialogueRows);
    await must(admin.from("lesson_dialogues").insert(rows.flatMap((r) => r.dialogues)), "lesson_dialogues 넣기");
    await must(admin.from("dialogue_roles").insert(rows.flatMap((r) => r.roles)), "dialogue_roles 넣기");
    await must(admin.from("dialogue_lines").insert(rows.flatMap((r) => r.lines)), "dialogue_lines 넣기");
    console.log(`회화 ${rows.flatMap((r) => r.dialogues).length}개 · 역할 ${rows.flatMap((r) => r.roles).length} · 대사 ${rows.flatMap((r) => r.lines).length} 넣음`);
  }
  if (!plan.insert.length && !withD.length) console.log("넣을 것이 없어 아무것도 쓰지 않았어요.");
}

/* ───────── 전수 비교 (Supabase에서 다시 조립 → 원본과 1:1) ───────── */

const after = await loadRemote();
if (after.rows.length === 0) process.exit(0); // 아직 이전 전 (dry-run)

console.log("\n== Supabase → Lesson 복원 전수 비교");
const results = [];
const verify = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const restoredById = new Map(after.rows.map((r) => [r.id, fromRows(r, after.dRows, after.rRows, after.lRows)]));
const countBy = (k) => after.rows.reduce((a, r) => ((a[r[k]] = (a[r[k]] ?? 0) + 1), a), {});
verify(
  "row 수: lessons 61 (15/15/15/16), 회화 1·역할 2·대사 12",
  after.rows.length === 61 && isDeepStrictEqual(countBy("course_id"), EXPECT.perCourse) && after.dRows.length === 1 && after.rRows.length === 2 && after.lRows.length === 12,
  `lessons ${after.rows.length} ${JSON.stringify(countBy("course_id"))}, 회화 ${after.dRows.length}/${after.rRows.length}/${after.lRows.length}`,
);
const mismatches = lessons.filter((l) => !isDeepStrictEqual(restoredById.get(l.id), l)).map((l) => `${l.id}: ${firstDiff(restoredById.get(l.id), l)}`);
verify(
  "61개 전수 비교: 모든 칸·video·source·script(cues 전체)·draft·content·captionMask·subtitlePosition·episodeId·시각·회화가 원본과 동일 (배열 순서·문자·숫자·없음/'' 구분 포함, 객체 key 순서만 무시)",
  mismatches.length === 0 && restoredById.size === 61,
  mismatches.slice(0, 5).join(" / "),
);
verify(
  "관리 칸: 전부 version 1, updated_by null, updated_by_label 'migration', 원본 시각 유지",
  after.rows.every((r) => r.version === 1 && r.updated_by === null && r.updated_by_label === MIGRATION_LABEL),
);

// 대표 W1 상세
for (const id of Object.keys(EXPECT.w1)) {
  const o = db.lessons[id];
  const r = restoredById.get(id);
  const oc = o.script.cues;
  const rc = r.script.cues;
  const quizSame = o.draft.quiz.every((q, i) => q.question === r.draft.quiz[i].question && isDeepStrictEqual(q.options, r.draft.quiz[i].options) && q.answer === r.draft.quiz[i].answer);
  verify(
    `${id}: 자막 ${rc.length}줄·첫/마지막 cue, 표현 ${r.draft.expressions.length}·어휘문법 ${r.draft.grammar.length}·렌즈 ${r.draft.lenses.length}·퀴즈 ${r.draft.quiz.length}(문제·보기·정답), HSK·설명·captionMask·video·source`,
    rc.length === oc.length && isDeepStrictEqual(rc[0], oc[0]) && isDeepStrictEqual(rc.at(-1), oc.at(-1)) &&
      isDeepStrictEqual(r.draft, o.draft) && quizSame && r.level === o.level && r.draft.level === o.draft.level &&
      r.description === o.description && isDeepStrictEqual(r.captionMask, o.captionMask) &&
      r.video.startTime === o.video.startTime && r.video.endTime === o.video.endTime && r.video.youtubeId === o.video.youtubeId &&
      isDeepStrictEqual(r.source, o.source) && r.status === "published" && r.week === 1,
    `level '${r.level}', video ${r.video.startTime}–${r.video.endTime}s`,
  );
}

// Campus W1 회화 상세
const od = db.lessons[EXPECT.dialogue.lessonId].dialogues[0];
const rd = restoredById.get(EXPECT.dialogue.lessonId).dialogues?.[0];
verify(
  "Campus W1 회화: id·제목·상황·status",
  !!rd && rd.id === od.id && rd.title === od.title && rd.situation === od.situation && rd.status === od.status,
);
verify("Campus W1 회화: 역할 id·이름·순서", !!rd && isDeepStrictEqual(rd.roles, od.roles));
const lineFieldsSame = !!rd && od.lines.length === rd.lines.length &&
  od.lines.every((x, i) => ["id", "roleId", "cueId", "zh", "pinyin", "ko", "start", "end"].every((k) => rd.lines[i][k] === x[k]));
verify("Campus W1 회화: 대사 12줄의 id·순서·roleId·cueId·zh·pinyin·ko·start·end", lineFieldsSame && isDeepStrictEqual(rd.lines, od.lines));
const restoredCueIds = new Set(restoredById.get(EXPECT.dialogue.lessonId).script.cues.filter((c) => c.id).map((c) => c.id));
const linked = rd ? rd.lines.filter((x) => restoredCueIds.has(x.cueId)).length : 0;
verify(`cueId 연결: 복원된 Campus W1 자막에서 ${linked}/12 발견`, linked === 12);

const failed = results.filter((ok) => !ok).length;
console.log(`\n전수 비교: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

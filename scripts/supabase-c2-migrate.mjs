// Phase C2: data/db.json의 과목·분반·교수자를 Supabase dev로 옮긴다.
//   npm run supabase:migrate-c2            → dry-run (읽기만, 바뀔 내용 출력)
//   npm run supabase:migrate-c2 -- --apply → 실제 반영
// - 원본은 로컬 data/db.json. 실제 값은 코드에 넣지 않고 실행할 때 읽는다. (교수자 이메일은 가려서 출력)
// - service-role은 이 서버 쪽 스크립트에서만 쓴다. (.env.local, git 제외)
// - 여러 번 실행해도 결과가 같다: 없는 행만 넣고, 이미 있는 행은 원본과 같은지 확인만 한다.
// - Supabase에 원본과 다른 행·원본에 없는 행·검사용 임시 행이 있으면 아무것도 바꾸지 않고 멈춘다.
// - 회원·수강·학습자료·진도·피드백은 옮기지 않는다. 교수자를 분반에 배정하지 않는다.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const dbPath = process.env.C2_DB_PATH || "data/db.json";
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(".env.local에 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요해요.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const maskEmail = (e) => e.replace(/^(.).*@(.).*$/, "$1***@$2***");
const normEmail = (e) => String(e ?? "").trim().toLowerCase();
const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const sameTime = (a, b) => new Date(a).getTime() === new Date(b).getTime();
const fail = (msg) => {
  console.error(`✖ 중단: ${msg}`);
  process.exit(1);
};
const must = async (p, what) => {
  const r = await p;
  if (r.error) fail(`${what}: ${r.error.message}`);
  return r.data;
};

/* ───────── 원본 (db.json) ───────── */

const db = JSON.parse(readFileSync(dbPath, "utf8"));
const sourceCourses = Object.values(db.courses ?? {}).map((c) => ({
  id: c.id,
  drama: c.drama ?? "",
  title: c.title ?? "",
  context: c.context ?? "",
  description: c.description ?? "",
  week_count: c.weekCount,
  status: c.status,
  legacy_code: c.code ? String(c.code).trim().toUpperCase() : null,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
}));
const sourceSections = Object.values(db.sections ?? {}).map((s) => ({
  id: s.id,
  course_id: s.courseId,
  name: s.name,
  code: String(s.code).trim().toUpperCase(),
  status: s.status,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
}));
const instructorMap = new Map();
for (const r of Object.values(db.instructors ?? {})) {
  const email = normEmail(r.email);
  if (!instructorMap.has(email)) instructorMap.set(email, { email, added_at: r.addedAt ?? null, from: "db.json" });
}
const envEmail = normEmail(process.env.INITIAL_INSTRUCTOR_EMAIL);
if (envEmail && !instructorMap.has(envEmail)) instructorMap.set(envEmail, { email: envEmail, added_at: null, from: "INITIAL_INSTRUCTOR_EMAIL" });
const sourceInstructors = [...instructorMap.values()];

// 원본 검사
const courseIds = new Set(sourceCourses.map((c) => c.id));
for (const c of sourceCourses) {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(c.id)) fail(`과목 id 형식: ${c.id}`);
  if (!["active", "legacy"].includes(c.status)) fail(`과목 상태: ${c.id}`);
  if (c.legacy_code && !/^[A-Z0-9]{4,12}$/.test(c.legacy_code)) fail(`과목 이전 코드 형식: ${c.id}`);
  if (!Number.isInteger(c.week_count)) fail(`과목 주차 수: ${c.id}`);
}
for (const s of sourceSections) {
  if (!courseIds.has(s.course_id)) fail(`분반의 과목이 원본에 없음: ${s.id}`);
  if (!/^[A-Z0-9]{6}$/.test(s.code)) fail(`분반 강의코드 형식: ${s.id}`);
  if (!["active", "inactive"].includes(s.status)) fail(`분반 상태: ${s.id}`);
  if (sourceCourses.find((c) => c.id === s.course_id)?.status !== "active") fail(`이전(legacy) 과목에 분반이 있음: ${s.id}`);
}
if (new Set(sourceSections.map((s) => s.code)).size !== sourceSections.length) fail("원본 분반 강의코드 중복");
for (const i of sourceInstructors) if (!isEmail(i.email)) fail(`교수자 이메일 형식: ${maskEmail(i.email)}`);

/* ───────── 대상 (Supabase dev) ───────── */

const [dbCourses, dbSections, dbInstructors] = await Promise.all([
  must(admin.from("courses").select("*"), "courses 조회"),
  must(admin.from("sections").select("*"), "sections 조회"),
  must(admin.from("instructors").select("email,user_id,source"), "instructors 조회"),
]);
const counts = {};
for (const t of ["section_instructors", "enrollments"]) {
  const r = await admin.from(t).select("*", { count: "exact", head: true });
  if (r.error) fail(`${t} 조회: ${r.error.message}`);
  counts[t] = r.count;
}

// 검사용 임시 데이터가 남아 있으면 멈춘다.
const leftover = [
  ...dbCourses.filter((c) => /^phase[bc]-/.test(c.id)).map((c) => `course ${c.id}`),
  ...dbSections.filter((s) => /phase[bc]-/.test(s.id)).map((s) => `section ${s.id}`),
  ...dbInstructors.filter((i) => /^phase[bc]-/.test(i.email)).map((i) => `instructor ${maskEmail(i.email)}`),
];
if (leftover.length) fail(`검사용 임시 데이터가 남아 있어요: ${leftover.join(", ")}`);

// 원본에 없는 행, 원본과 다른 행이 있으면 멈춘다. (덮어쓰지 않는다)
const extra = [
  ...dbCourses.filter((c) => !courseIds.has(c.id)).map((c) => `course ${c.id}`),
  ...dbSections.filter((s) => !sourceSections.some((x) => x.id === s.id)).map((s) => `section ${s.id}`),
];
if (extra.length) fail(`원본(db.json)에 없는 행이 Supabase에 있어요: ${extra.join(", ")}`);
const diffs = [];
const courseFields = ["drama", "title", "context", "description", "week_count", "status", "legacy_code"];
for (const c of sourceCourses) {
  const t = dbCourses.find((x) => x.id === c.id);
  if (!t) continue;
  for (const f of courseFields) if (t[f] !== c[f]) diffs.push(`course ${c.id}.${f}`);
  if (!sameTime(t.created_at, c.created_at)) diffs.push(`course ${c.id}.created_at`);
}
for (const s of sourceSections) {
  const t = dbSections.find((x) => x.id === s.id);
  if (!t) {
    const clash = dbSections.find((x) => x.code === s.code);
    if (clash) diffs.push(`section ${s.id}: 강의코드가 다른 분반(${clash.id})에서 이미 쓰임`);
    continue;
  }
  for (const f of ["course_id", "name", "code", "status"]) if (t[f] !== s[f]) diffs.push(`section ${s.id}.${f}`);
  if (!sameTime(t.created_at, s.created_at)) diffs.push(`section ${s.id}.created_at`);
}
if (diffs.length) fail(`Supabase의 기존 행이 원본과 달라요 (덮어쓰지 않음): ${diffs.join(", ")}`);
if (counts.section_instructors !== 0 || counts.enrollments !== 0) {
  fail(`section_instructors ${counts.section_instructors}, enrollments ${counts.enrollments} — C2 전에는 0이어야 해요.`);
}

const newCourses = sourceCourses.filter((c) => !dbCourses.some((x) => x.id === c.id));
const newSections = sourceSections.filter((s) => !dbSections.some((x) => x.id === s.id));
const newInstructors = sourceInstructors.filter((i) => !dbInstructors.some((x) => x.email === i.email));
const keptInstructors = sourceInstructors.filter((i) => dbInstructors.some((x) => x.email === i.email));

// 연결 예고: 이미 로그인한 계정의 이메일과 같은 교수자는 등록 즉시 그 계정에 연결된다.
const { data: usersPage, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (usersErr) fail(`auth 사용자 조회: ${usersErr.message}`);
const confirmedEmails = new Set(usersPage.users.filter((u) => u.email_confirmed_at).map((u) => normEmail(u.email)));
const willLink = newInstructors.filter((i) => confirmedEmails.has(i.email));

console.log(`${apply ? "APPLY" : "DRY-RUN"} — 원본 ${dbPath}`);
console.log(`courses     원본 ${sourceCourses.length} | Supabase ${dbCourses.length} | 새로 넣을 것 ${newCourses.length} (${newCourses.map((c) => c.id).join(", ") || "-"})`);
console.log(`sections    원본 ${sourceSections.length} | Supabase ${dbSections.length} | 새로 넣을 것 ${newSections.length} (${newSections.map((s) => `${s.id}/${s.course_id}/${s.status}`).join(", ") || "-"})`);
console.log(`instructors 원본 ${sourceInstructors.length} (db.json ${sourceInstructors.filter((i) => i.from === "db.json").length}, INITIAL_INSTRUCTOR_EMAIL ${sourceInstructors.filter((i) => i.from !== "db.json").length}) | 이미 있음 ${keptInstructors.length} | 새로 넣을 것 ${newInstructors.length} (${newInstructors.map((i) => maskEmail(i.email)).join(", ") || "-"})`);
console.log(`section_instructors ${counts.section_instructors} (배정하지 않음) | enrollments ${counts.enrollments} (옮기지 않음)`);
if (willLink.length) {
  console.log(`⚠ 이미 로그인한 dev 계정과 이메일이 같은 교수자 ${willLink.length}명: 넣는 즉시 그 계정이 교수자로 연결돼요. (${willLink.map((i) => maskEmail(i.email)).join(", ")})`);
}

if (!apply) {
  console.log("dry-run이라 아무것도 바꾸지 않았어요. 반영하려면 --apply");
  process.exit(0);
}

/* ───────── 반영 (없는 행만 추가) ───────── */

if (newCourses.length) await must(admin.from("courses").insert(newCourses), "courses 추가");
if (newSections.length) await must(admin.from("sections").insert(newSections), "sections 추가");
if (newInstructors.length) {
  await must(
    admin.from("instructors").insert(
      newInstructors.map((i) => ({
        email: i.email,
        source: "migration",
        added_by: `migration:${i.from}`,
        ...(i.added_at ? { added_at: i.added_at } : {}),
      })),
    ),
    "instructors 추가",
  );
}

/* ───────── 검증 ───────── */

const [afterCourses, afterSections, afterInstructors] = await Promise.all([
  must(admin.from("courses").select("*"), "courses 재조회"),
  must(admin.from("sections").select("*"), "sections 재조회"),
  must(admin.from("instructors").select("email,user_id,source"), "instructors 재조회"),
]);
const problems = [];
for (const c of sourceCourses) {
  const t = afterCourses.find((x) => x.id === c.id);
  if (!t) problems.push(`course ${c.id} 없음`);
  else for (const f of courseFields) if (t[f] !== c[f]) problems.push(`course ${c.id}.${f}`);
}
for (const s of sourceSections) {
  const t = afterSections.find((x) => x.id === s.id);
  if (!t) problems.push(`section ${s.id} 없음`);
  else for (const f of ["course_id", "name", "code", "status"]) if (t[f] !== s[f]) problems.push(`section ${s.id}.${f}`);
}
for (const i of sourceInstructors) if (!afterInstructors.some((x) => x.email === i.email)) problems.push(`instructor ${maskEmail(i.email)} 없음`);
console.log(`반영 후: courses ${afterCourses.length}, sections ${afterSections.length}, instructors ${afterInstructors.length} (연결된 계정 ${afterInstructors.filter((i) => i.user_id).length})`);
if (problems.length) fail(`반영 후 원본과 다름: ${problems.join(", ")}`);
console.log("✔ 원본과 일치");

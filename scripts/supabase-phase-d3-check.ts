// Supabase dev 프로젝트에서 Phase D3(AUTH_BACKEND=supabase의 학습자료·회화 API 전환)를 실제 API로 확인한다.
//   npm run supabase:check-d3   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// 임시 폴더의 새 db.json으로 실제 API(createApi, AUTH_BACKEND=supabase)를 띄운다. 학생·교수자는 Supabase access token(Bearer)으로만 요청한다.
// 저장 시험은 모두 이번 검사 태그(phased3-…)가 붙은 테스트 과목·학습자료에서만 한다. 실제 61개 학습자료는 읽기만 하고,
// 검사 전후 행 전체(version·updated_at 포함)가 그대로인지 확인한다.
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import type { Lesson, LessonDialogue } from "../src/content/types";
import type { CourseCurriculum, CourseOverview, LessonProgress, SectionOverview } from "../src/app/store/models";
import { createApi, readApiEnv } from "../server/api";
import { openDb } from "../server/db";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !anonKey || !serviceKey) {
  console.error(".env.local에 Supabase 값 3개가 필요해요.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const sb = createClient(url, serviceKey, opts);
const tag = randomBytes(3).toString("hex");
const PREFIX = `phased3-${tag}-`;
const mail = (who: string) => `${PREFIX}${who}@example.test`;
const courseA = `${PREFIX}a`;
const courseB = `${PREFIX}b`;
const courseL = `${PREFIX}legacy`;
const courses = [courseA, courseB, courseL];
const password = randomBytes(18).toString("base64url");
const SECRET = randomBytes(24).toString("hex");
const ADMIN = { ADMIN_ID: `d3-admin-${tag}`, ADMIN_PASSWORD: randomBytes(18).toString("base64url") };
const createdUsers: string[] = [];
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const must = async <T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) => {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
};

/** 실제 C1~C4 데이터 + 실제 학습자료·회화 행 전체 스냅샷 (이번 검사 태그 행 제외) */
const snapshot = async () => {
  const mine = (v: unknown) => String(v).includes(PREFIX);
  const q = (t: string, order: string) => must(sb.from(t).select("*").order(order));
  const [c, s, si, e, i, p, l, d, r, x] = await Promise.all([
    q("courses", "id"), q("sections", "id"), q("section_instructors", "section_id"), q("enrollments", "id"), q("instructors", "email"),
    must(sb.from("profiles").select("id,status,approved_at,profile_completed,name").order("id")),
    q("lessons", "id"), q("lesson_dialogues", "id"), must(sb.from("dialogue_roles").select("*").order("dialogue_id").order("id")),
    must(sb.from("dialogue_lines").select("*").order("dialogue_id").order("id")),
  ]);
  type R = Record<string, unknown>;
  return JSON.stringify([
    (c as R[]).filter((y) => !mine(y.id)), (s as R[]).filter((y) => !mine(y.course_id)), (si as R[]).filter((y) => !mine(y.instructor_email)),
    (e as R[]).filter((y) => !mine(y.course_id)), (i as R[]).filter((y) => !mine(y.email)), (p as R[]).filter((y) => !createdUsers.includes(String(y.id))),
    (l as R[]).filter((y) => !mine(y.id)), (d as R[]).filter((y) => !mine(y.id)), (r as R[]).filter((y) => !mine(y.dialogue_id)), (x as R[]).filter((y) => !mine(y.dialogue_id)),
  ]);
};
const createUser = async (who: string, name: string) => {
  const { data, error } = await sb.auth.admin.createUser({ email: mail(who), password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new Error(`createUser ${who}: ${error.message}`);
  createdUsers.push(data.user.id);
  return data.user;
};
const signIn = async (who: string) => {
  const client = createClient(url, anonKey, opts);
  const { data, error } = await client.auth.signInWithPassword({ email: mail(who), password });
  if (error || !data.session) throw new Error(`signIn ${who}: ${error?.message}`);
  await client.rpc("sync_my_account");
  return { client, token: data.session.access_token };
};

const dir = mkdtempSync(path.join(tmpdir(), "zhuiju-d3-"));
let base = "";
let close = () => {};
type Auth = { token?: string; cookie?: string };
const call = async <T = unknown>(method: string, p: string, auth: Auth = {}, body?: unknown) => {
  const res = await fetch(base + p, {
    method,
    headers: {
      ...(auth.cookie ? { cookie: auth.cookie } : {}),
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json as T, text };
};
const strip = ({ version: _v, updatedByLabel: _u, ...l }: Lesson) => l;
const idsOf = (ls: Lesson[]) => ls.map((l) => l.id).filter((id) => id.startsWith(PREFIX)).sort().join();

// 원본(로컬 data/db.json, 읽기만): 실제 61개 비교 기준 + 테스트 학습자료의 내용 틀 (Campus W1: 자막·초안·회화)
const source = JSON.parse(readFileSync("data/db.json", "utf8")) as { lessons: Record<string, Lesson> };
const campus = source.lessons["course-campus-w01"];
const testDialogue = (d: LessonDialogue): LessonDialogue => ({
  ...d,
  id: `${PREFIX}${d.id}`,
  roles: d.roles.map((r) => ({ ...r, id: `${PREFIX}${r.id}` })),
  lines: d.lines.map((x) => ({ ...x, id: `${PREFIX}${x.id}`, roleId: `${PREFIX}${x.roleId}` })),
});
const testLesson = (id: string, courseId: string, week: number, status: Lesson["status"], withDialogue = false): Lesson => {
  const { dialogues, version: _v, updatedByLabel: _u, ...rest } = campus;
  return {
    ...rest,
    id: `${PREFIX}${id}`,
    courseId,
    week,
    status,
    title: `D3 ${id}`,
    ...(withDialogue && dialogues ? { dialogues: [...dialogues.map(testDialogue), { ...testDialogue(dialogues[0]), id: `${PREFIX}draft-dialogue`, status: "draft" as const }] } : {}),
  };
};

const before = await snapshot();
try {
  // ── 임시 db.json: supabase 모드가 db.json 학습자료를 읽거나 쓰지 않는지 확인하려고 테스트 과목 A에 db.json 전용 자료를 둔다.
  const db = openDb(dir);
  const bogusId = `${PREFIX}dbjson-only`;
  db.data.lessons[bogusId] = { ...testLesson("dbjson-only", courseA, 9, "published") };
  db.save();
  const dbLessonsBefore = JSON.stringify(db.data.lessons);

  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api", createApi(db, readApiEnv({ ...ADMIN, SESSION_SECRET: SECRET, AUTH_BACKEND: "supabase", SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      close = () => server.close();
      resolve();
    });
  });
  const login = await fetch(`${base}/auth/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }) });
  const admin: Auth = { cookie: (login.headers.get("set-cookie") ?? "").split(";")[0] };

  // ── 준비: 과목 A·B(운영)·L(이전 자료), 분반, 교수자 2(1명만 A 배정), 학생 4
  await must(sb.from("courses").insert([
    { id: courseA, title: "D3 A", drama: "D3", status: "active", legacy_code: null },
    { id: courseB, title: "D3 B", drama: "D3", status: "active", legacy_code: null },
    { id: courseL, title: "D3 legacy", drama: "D3", status: "legacy", legacy_code: null },
  ]));
  for (const t of ["t-assigned", "t-none"]) await call("POST", "/instructors", admin, { email: mail(t) });
  await createUser("t-assigned", "배정 교수");
  await createUser("t-none", "미배정 교수");
  const s1 = await createUser("s-one", "학생 하나");
  const s2 = await createUser("s-two", "학생 둘");
  const sU = await createUser("s-unenrolled", "미수강 학생");
  const sP = await createUser("s-pending", "대기 학생");
  for (const u of [s1, s2, sU, sP]) await must(sb.from("profiles").update({ profile_completed: true, name: u.user_metadata.full_name }).eq("id", u.id));
  for (const u of [s1, s2, sU]) await call("PATCH", `/members/${u.id}`, admin, { status: "approved" });
  const secA = (await call<SectionOverview>("POST", `/courses/${courseA}/sections`, admin, { instructors: [mail("t-assigned")] })).body;
  const secB = (await call<SectionOverview>("POST", `/courses/${courseB}/sections`, admin, {})).body;
  const A1 = testLesson("a-w1", courseA, 1, "published", true);
  const seeds = [A1, testLesson("a-w2", courseA, 2, "draft"), testLesson("a-w3", courseA, 3, "ready"), testLesson("b-w1", courseB, 1, "published"), testLesson("l-w1", courseL, 1, "published")];
  for (const l of seeds) await must(sb.rpc("admin_save_lesson", { p_lesson: l, p_admin_label: "D3 검사" }));
  const T_A = await signIn("t-assigned");
  const T_N = await signIn("t-none");
  const S1 = await signIn("s-one");
  const S2 = await signIn("s-two");
  const SU = await signIn("s-unenrolled");
  const SP = await signIn("s-pending");
  await call("POST", "/enrollments", S1, { courseCode: secA.code });
  await call("POST", "/enrollments", S2, { courseCode: secB.code });

  // ── 보안: token·승인·수강·담당
  const noTok = await call<Lesson[]>("GET", "/lessons");
  const badTok = await call<Lesson[]>("GET", "/lessons", { token: "not-a-jwt" });
  const putNoTok = await call("PUT", `/lessons/${A1.id}`, {}, A1);
  const putBadTok = await call("PUT", `/lessons/${A1.id}`, { token: `${S1.token.slice(0, -4)}AAAA` }, A1);
  check("token 없음·잘못된 token: 학습자료 0건(빈 목록), 저장 401", noTok.body.length === 0 && badTok.body.length === 0 && putNoTok.status === 401 && putBadTok.status === 401);
  const sp = await call<Lesson[]>("GET", "/lessons", SP);
  const su = await call<Lesson[]>("GET", "/lessons", SU);
  check("승인 대기 학생 0 · 승인됐지만 미수강 학생 0", sp.status === 200 && sp.body.length === 0 && su.status === 200 && su.body.length === 0);
  const g1 = await call<Lesson[]>("GET", "/lessons", S1);
  const g2 = await call<Lesson[]>("GET", "/lessons", S2);
  const draftIds = [`${PREFIX}a-w2`, `${PREFIX}a-w3`, `${PREFIX}b-w1`, `${PREFIX}l-w1`, bogusId];
  check(
    "수강 학생: 수강 과목 published만 — 응답 본문에 준비 중·다른 과목·이전 자료·db.json 전용 자료 id 없음",
    idsOf(g1.body) === A1.id && g1.body.every((l) => l.status === "published") && draftIds.every((id) => !g1.text.includes(id)) && idsOf(g2.body) === `${PREFIX}b-w1`,
  );
  const s1A1 = g1.body.find((l) => l.id === A1.id)!;
  check(
    "학생이 받은 Lesson = 저장한 Lesson (video·script·draft·captionMask·source·createdAt, 회화는 published만 / updatedAt은 서버 저장 시각)",
    isDeepStrictEqual(strip(s1A1), { ...A1, updatedAt: s1A1.updatedAt, dialogues: A1.dialogues!.filter((d) => d.status === "published") }) &&
      s1A1.dialogues?.length === 1 && s1A1.createdAt === A1.createdAt && s1A1.updatedAt !== A1.updatedAt,
  );
  const cur1 = await call<CourseCurriculum>("GET", `/courses/${courseA}/curriculum`, S1);
  const cur2 = await call("GET", `/courses/${courseA}/curriculum`, S2);
  check(
    "주차 목록(course_curriculum): 수강 학생은 준비 중 주차도 주차·제목·상태만, 영상 id는 published만 / 다른 과목 404",
    cur1.status === 200 && cur1.body.weeks.map((w) => `${w.week}:${w.status}`).join() === "1:published,2:draft,3:ready" &&
      cur1.body.weeks[0].youtubeId === A1.video.youtubeId && cur1.body.weeks[1].youtubeId === null && !cur1.text.includes('"script"') && cur2.status === 404,
  );
  const tn = await call<Lesson[]>("GET", "/lessons", T_N);
  const tnPut = await call("PUT", `/lessons/${A1.id}`, T_N, s1A1);
  check("미배정 교수자: 학습자료 0 · 저장 403", tn.body.length === 0 && tnPut.status === 403);
  const ta = await call<Lesson[]>("GET", "/lessons", T_A);
  check(
    "배정 교수자: 담당 과목 전체(준비 중·준비 완료 포함), 다른 과목·이전 자료·db.json 전용 자료 제외, 회화 draft 포함",
    idsOf(ta.body) === [A1.id, `${PREFIX}a-w2`, `${PREFIX}a-w3`].sort().join() && ta.body.find((l) => l.id === A1.id)?.dialogues?.length === 2 && !ta.text.includes(bogusId),
  );

  // ── 교수자 저장·동시 편집
  const w2 = ta.body.find((l) => l.id === `${PREFIX}a-w2`)!;
  const save1 = await call<Lesson>("PUT", `/lessons/${w2.id}`, T_A, { ...w2, title: "교수 수정" });
  check(
    "교수자 저장(save_lesson): 200, version 1→2, 마지막 수정자, 응답은 기존 Lesson 형식",
    save1.status === 200 && save1.body.version === 2 && save1.body.updatedByLabel === "배정 교수" && save1.body.title === "교수 수정" && !!save1.body.video && !!save1.body.script,
  );
  const stale = await call<{ error: string; conflict: { currentVersion: number; updatedAt: string; updatedByLabel: string } }>("PUT", `/lessons/${w2.id}`, T_A, { ...w2, title: "늦은 저장" });
  const noVer = await call<{ conflict?: unknown }>("PUT", `/lessons/${w2.id}`, T_A, { ...strip(w2), title: "버전 없음" });
  const afterStale = (await call<Lesson[]>("GET", "/lessons", T_A)).body.find((l) => l.id === w2.id)!;
  check(
    "오래된 version·version 없는 기존 자료 저장 → 409 + conflict{currentVersion·updatedAt·updatedByLabel}, 내용 그대로",
    stale.status === 409 && stale.body.conflict?.currentVersion === 2 && !!stale.body.conflict.updatedAt && stale.body.conflict.updatedByLabel === "배정 교수" &&
      stale.body.error === "다른 사용자가 이 강의자료를 먼저 수정했습니다." && noVer.status === 409 && !!noVer.body.conflict && afterStale.title === "교수 수정" && afterStale.version === 2,
  );
  const w3 = ta.body.find((l) => l.id === `${PREFIX}a-w3`)!;
  const move = await call<Lesson>("PUT", `/lessons/${w3.id}`, T_A, { ...w3, week: 4 });
  const moveDup = await call<{ conflict?: unknown; error: string }>("PUT", `/lessons/${w3.id}`, T_A, { ...move.body, week: 1 });
  const moveStale = await call<{ conflict?: unknown }>("PUT", `/lessons/${w3.id}`, T_A, { ...w3, week: 5 });
  check(
    "주차 이동(같은 PUT 경로): version과 함께 이동, 같은 주차 409(중복 안내, conflict 없음), 오래된 version 이동 409(conflict)",
    move.status === 200 && move.body.week === 4 && move.body.version === 2 && moveDup.status === 409 && !moveDup.body.conflict && /주차/.test(moveDup.body.error) && moveStale.status === 409 && !!moveStale.body.conflict,
  );
  const unpublishable = await call<{ error: string }>("PUT", `/lessons/${move.body.id}`, T_A, { ...move.body, status: "published", video: { ...move.body.video, youtubeId: "", youtubeUrl: "" } });
  const outOfRange = await call<{ error: string }>("PUT", `/lessons/${move.body.id}`, T_A, { ...move.body, week: 16 });
  check("Express 검사 유지: 공개 조건(lessonPublishProblems) 400, 주차 범위 400", unpublishable.status === 400 && !!unpublishable.body.error && outOfRange.status === 400 && /주차/.test(outOfRange.body.error));
  const fresh = await call<Lesson>("PUT", `/lessons/${PREFIX}a-new`, T_A, { ...testLesson("a-new", courseA, 6, "draft") });
  const otherCourse = await call("PUT", `/lessons/${PREFIX}b-w1`, T_A, { ...g2.body[0] });
  const intoB = await call("PUT", `/lessons/${PREFIX}b-new`, T_A, testLesson("b-new", courseB, 7, "draft"));
  const legacy = await call("PUT", `/lessons/${PREFIX}l-w1`, T_A, testLesson("l-w1", courseL, 1, "published"));
  check(
    "새 학습자료 생성 version 1 · 다른 과목 수정·생성 403 · 이전 자료 403",
    fresh.status === 200 && fresh.body.version === 1 && otherCourse.status === 403 && intoB.status === 403 && legacy.status === 403,
  );

  // ── 회화: 순서를 바꿔 저장 → 다시 읽으면 그대로
  const taA1 = (await call<Lesson[]>("GET", "/lessons", T_A)).body.find((l) => l.id === A1.id)!;
  const dlg = taA1.dialogues![0];
  const reordered: LessonDialogue = { ...dlg, roles: [...dlg.roles].reverse(), lines: [...dlg.lines].reverse() };
  const saveDlg = await call<Lesson>("PUT", `/lessons/${A1.id}`, T_A, { ...taA1, dialogues: [taA1.dialogues![1], reordered] });
  const reread = (await call<Lesson[]>("GET", "/lessons", T_A)).body.find((l) => l.id === A1.id)!;
  check(
    "회화 저장·복원: 회화·역할·대사 순서, roleId·cueId·zh·pinyin·ko·시간이 보낸 그대로",
    saveDlg.status === 200 && isDeepStrictEqual(reread.dialogues, [taA1.dialogues![1], reordered]) && isDeepStrictEqual(saveDlg.body.dialogues, reread.dialogues),
  );
  const cueIds = new Set(reread.script.cues.filter((c) => c.id).map((c) => c.id));
  check("회화 cueId가 같은 Lesson 자막과 연결 (12/12)", reordered.lines.length === 12 && reread.dialogues![1].lines.every((x) => cueIds.has(x.cueId)));

  // ── 관리자 분리
  const del1 = await call("DELETE", `/lessons/${A1.id}`, S1);
  const del2 = await call("DELETE", `/lessons/${A1.id}`, T_A);
  const del3 = await call("DELETE", `/lessons/${A1.id}`);
  const stPut = await call("PUT", `/lessons/${A1.id}`, S1, s1A1);
  const stillA1 = (await call<Lesson[]>("GET", "/lessons", admin)).body.some((l) => l.id === A1.id);
  check("학생·교수자 삭제 403, 세션 없는 삭제 401, 학생 저장 403 (자료 그대로)", del1.status === 403 && del2.status === 403 && del3.status === 401 && stPut.status === 403 && stillA1);
  const all = await call<Lesson[]>("GET", "/lessons", admin);
  const lL = all.body.find((l) => l.id === `${PREFIX}l-w1`)!;
  const adminLegacy = await call<Lesson>("PUT", `/lessons/${lL.id}`, admin, { ...lL, title: "관리자 수정" });
  const adminMove = await call("PUT", `/lessons/${lL.id}`, admin, { ...adminLegacy.body, courseId: courseA, week: 8 });
  const adminDel = await call("DELETE", `/lessons/${PREFIX}a-new`, admin);
  const goneNew = !(await call<Lesson[]>("GET", "/lessons", admin)).body.some((l) => l.id === `${PREFIX}a-new`);
  check(
    "관리자(세션): 이전 자료 포함 전체 조회·저장(admin_save_lesson, version 2), 이전 자료→운영 과목 이동 403, hard delete",
    all.status === 200 && !!lL && adminLegacy.status === 200 && adminLegacy.body.version === 2 && !!adminLegacy.body.updatedByLabel && adminLegacy.body.updatedByLabel !== "배정 교수" &&
      adminMove.status === 403 && adminDel.status === 200 && goneNew,
  );

  // ── 강의자료 수 (Supabase 기준)
  const ac = await call<CourseOverview[]>("GET", "/courses", admin);
  const cnt = (id: string) => {
    const c = ac.body.find((x) => x.id === id);
    return c ? `${c.lessonCount}/${c.publishedCount}` : "없음";
  };
  const realLegacyPublished = Object.values(source.lessons).filter((l) => l.courseId === "course-legacy" && l.status === "published").length;
  check(
    `관리자 과목 자료 수: campus 15/1, university 15/1, workplace 15/1, legacy 16/${realLegacyPublished}, 테스트 A 3/1`,
    cnt("course-campus") === "15/1" && cnt("course-university") === "15/1" && cnt("course-workplace") === "15/1" && cnt("course-legacy") === `16/${realLegacyPublished}` && cnt(courseA) === "3/1",
    ["course-campus", "course-university", "course-workplace", "course-legacy", courseA].map(cnt).join(" · "),
  );
  const tc = await call<CourseOverview[]>("GET", "/courses", T_A);
  check("교수자 과목 자료 수: 담당 과목만 Supabase 기준 (A 3/1)", tc.body.length === 1 && tc.body[0].id === courseA && tc.body[0].lessonCount === 3 && tc.body[0].publishedCount === 1);

  // ── 학습 기록 (D4부터 Supabase lesson_progress, save_my_progress가 학습자료 확인)
  const prog = (userId: string, lessonId: string) =>
    ({ userId, lessonId, week: 1, startedAt: new Date().toISOString(), completedAt: null, watchedRanges: [[0, 5]], progressRatio: 0.1, maxPosition: 5, quiz: null, quizAttempts: 0, lastStudiedAt: null }) as LessonProgress;
  const pOk = await call("PUT", "/progress", S1, prog(s1.id, A1.id));
  const pDraft = await call("PUT", "/progress", S1, prog(s1.id, `${PREFIX}a-w2`));
  const pBogus = await call("PUT", "/progress", S1, prog(s1.id, bogusId));
  const tp = await call<LessonProgress[]>("GET", `/progress?course=${courseA}`, T_A);
  check(
    "학습 기록: 수강 과목 published만 기록, 준비 중·db.json 전용 자료 403, 교수자 과목별 조회는 Supabase 과목 기준",
    pOk.status === 200 && pDraft.status === 403 && pBogus.status === 403 && tp.body.length === 1 && tp.body[0].userId === s1.id,
  );

  // ── 실제 61개: 관리자 API로 복원한 Lesson = 원본 db.json (API 경로의 변환이 D2 검증과 같은지)
  const real = all.body.filter((l) => !l.id.startsWith(PREFIX));
  const realSame = Object.values(source.lessons).filter((o) => {
    const r = real.find((l) => l.id === o.id);
    return r && isDeepStrictEqual(strip(r), o);
  }).length;
  const realCampus = real.find((l) => l.id === "course-campus-w01")!;
  const realCues = new Set(realCampus.script.cues.filter((c) => c.id).map((c) => c.id));
  check(
    "실제 61개: 관리자 API 응답을 원본 db.json과 전수 비교 동일, Campus W1 회화 1/2/12 · cueId 12/12, 전부 version 1",
    real.length === 61 && realSame === 61 && realCampus.dialogues?.length === 1 && realCampus.dialogues[0].roles.length === 2 &&
      realCampus.dialogues[0].lines.length === 12 && realCampus.dialogues[0].lines.every((x) => realCues.has(x.cueId)) && real.every((l) => l.version === 1),
    `${realSame}/61`,
  );
  check("supabase 모드는 db.json 학습자료를 읽지도 쓰지도 않음 (db.json 전용 자료 미노출, db.json lessons 그대로)", JSON.stringify(db.data.lessons) === dbLessonsBefore && !all.text.includes(bogusId));
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  close();
  rmSync(dir, { recursive: true, force: true });
  // 학습 기록이 있는 학습자료는 지울 수 없으므로(RESTRICT) 테스트 기록부터 지운다.
  await sb.from("lesson_progress").delete().like("lesson_id", `${PREFIX}%`);
  await sb.from("lessons").delete().in("course_id", courses);
  for (const id of createdUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("enrollments").delete().in("course_id", courses);
  await sb.from("section_instructors").delete().like("instructor_email", `${PREFIX}%`);
  await sb.from("sections").delete().in("course_id", courses);
  await sb.from("courses").delete().in("id", courses);
  await sb.from("instructors").delete().like("email", `${PREFIX}%`);
  const left = await Promise.all([
    sb.from("courses").select("id", { count: "exact", head: true }).in("id", courses),
    sb.from("lessons").select("id", { count: "exact", head: true }).like("id", `${PREFIX}%`),
    sb.from("lesson_dialogues").select("id", { count: "exact", head: true }).like("id", `${PREFIX}%`),
  ]);
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftUsers = users.users.filter((u) => (u.email ?? "").startsWith(PREFIX)).length;
  console.log(`정리: 남은 테스트 과목 ${left[0].count}, 학습자료 ${left[1].count}, 회화 ${left[2].count}, 계정 ${leftUsers}`);
  check("테스트 데이터 모두 정리", left.every((r) => r.count === 0) && leftUsers === 0);
  check("실제 데이터(C1~C4 + 학습자료 61·회화 행 전체, version·updated_at 포함)는 검사 전후 그대로", (await snapshot()) === before);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

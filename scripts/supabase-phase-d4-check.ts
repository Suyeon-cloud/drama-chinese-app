// Supabase dev 프로젝트에서 Phase D4(학습 기록 lesson_progress·legacy_progress·save_my_progress·claim·API 전환)를 확인한다.
//   npm run supabase:check-d4   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// 임시 폴더의 새 db.json으로 실제 API(createApi, AUTH_BACKEND=supabase)를 띄운다. 학생·교수자는 Supabase access token으로만 요청한다.
// 기존 Google 로그인 기록의 연결(Google sub + 이메일)을 확인하려고 테스트 계정에만 Google identity 행을 넣는다(supabase db query).
// 테스트 행은 모두 이번 검사 태그(phased4-…)가 붙은 id·과목·sub이며, 계정을 지우면 identity·학습 기록도 함께 지워진다.
// 실제 학습자료 61개에는 학습 기록을 만들지 않고, 실제 데이터는 검사 전후 그대로인지 확인한다.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import type { Lesson } from "../src/content/types";
import type { CourseStudents, LearnerProfile, LessonProgress, SectionOverview } from "../src/app/store/models";
import { createApi, readApiEnv } from "../server/api";
import { openDb } from "../server/db";
import { applyProgressPlan, planProgressMigration, summarizeProgressPlan } from "../server/progressMigration";
import { progressFromRow } from "../server/progressRows";

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
const PREFIX = `phased4-${tag}-`;
const mail = (who: string) => `${PREFIX}${who}@example.test`;
const sub = (n: string) => `${PREFIX}gsub-${n}`;
const courseA = `${PREFIX}a`;
const courseB = `${PREFIX}b`;
const courses = [courseA, courseB];
const password = randomBytes(18).toString("base64url");
const SECRET = randomBytes(24).toString("hex");
const ADMIN = { ADMIN_ID: `d4-admin-${tag}`, ADMIN_PASSWORD: randomBytes(18).toString("base64url") };
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
type R = Record<string, unknown>;

/** 실제 데이터 스냅샷: C1~C4 + 학습자료·회화 + 학습 기록·보관 기록 (이번 검사 태그 행 제외) */
const snapshot = async () => {
  const mine = (v: unknown) => String(v).includes(PREFIX);
  const q = (t: string, order: string) => must(sb.from(t).select("*").order(order));
  const [c, s, si, e, i, p, l, d, r, x, lp, lg] = await Promise.all([
    q("courses", "id"), q("sections", "id"), q("section_instructors", "section_id"), q("enrollments", "id"), q("instructors", "email"),
    must(sb.from("profiles").select("id,status,approved_at,profile_completed,name").order("id")),
    q("lessons", "id"), q("lesson_dialogues", "id"), must(sb.from("dialogue_roles").select("*").order("dialogue_id").order("id")),
    must(sb.from("dialogue_lines").select("*").order("dialogue_id").order("id")),
    must(sb.from("lesson_progress").select("*").order("user_id").order("lesson_id")),
    must(sb.from("legacy_progress").select("*").order("legacy_user_id").order("lesson_id")),
  ]);
  return JSON.stringify([
    (c as R[]).filter((y) => !mine(y.id)), (s as R[]).filter((y) => !mine(y.course_id)), (si as R[]).filter((y) => !mine(y.instructor_email)),
    (e as R[]).filter((y) => !mine(y.course_id)), (i as R[]).filter((y) => !mine(y.email)), (p as R[]).filter((y) => !createdUsers.includes(String(y.id))),
    (l as R[]).filter((y) => !mine(y.id)), (d as R[]).filter((y) => !mine(y.id)), (r as R[]).filter((y) => !mine(y.dialogue_id)), (x as R[]).filter((y) => !mine(y.dialogue_id)),
    (lp as R[]).filter((y) => !mine(y.lesson_id) && !createdUsers.includes(String(y.user_id))), (lg as R[]).filter((y) => !mine(y.legacy_user_id)),
  ]);
};
const createUser = async (who: string, name: string, email = mail(who)) => {
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new Error(`createUser ${who}: ${error.message}`);
  createdUsers.push(data.user.id);
  return data.user;
};
const signIn = async (email: string) => {
  const client = createClient(url, anonKey, opts);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn: ${error?.message}`);
  return { client, token: data.session.access_token };
};
/** 테스트 계정에만 Google identity 추가 (값은 모두 이번 검사의 uuid·태그 문자열만) */
const addGoogleIdentities = (rows: { userId: string; sub: string; email: string }[]) => {
  const safe = /^[A-Za-z0-9@._-]+$/;
  for (const r of rows) if (![r.userId, r.sub, r.email].every((v) => safe.test(v)) || !r.sub.startsWith(PREFIX)) throw new Error("identity 값 형식");
  const sql =
    "insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at) values " +
    rows.map((r) => `('${r.sub}', '${r.userId}', jsonb_build_object('sub', '${r.sub}', 'email', '${r.email}'), 'google', now(), now(), now())`).join(", ") +
    ";";
  const file = path.join(tmpdir(), `zhuiju-d4-identities-${tag}.sql`);
  writeFileSync(file, sql);
  try {
    execSync(`npx supabase db query --linked --file "${file}"`, { stdio: ["ignore", "pipe", "pipe"], timeout: 150_000 });
  } finally {
    rmSync(file, { force: true });
  }
};

const dir = mkdtempSync(path.join(tmpdir(), "zhuiju-d4-"));
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
  return { status: res.status, body: json as T };
};
const NOW = "2026-10-30T09:15:00.125Z";
const prog = (userId: string, lessonId: string, extra: Partial<LessonProgress> = {}): LessonProgress => ({
  userId,
  lessonId,
  week: 1,
  startedAt: NOW,
  completedAt: null,
  watchedRanges: [[3, 10.5], [12.25, 40]],
  progressRatio: 0.0812,
  maxPosition: 40,
  quiz: null,
  quizAttempts: 0,
  lastStudiedAt: NOW,
  ...extra,
});

const before = await snapshot();
try {
  const db = openDb(dir);
  const dbProgressBefore = JSON.stringify(db.data.progress);
  const app = express();
  app.use(express.json());
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

  // ── 준비: 과목 A(분반 A1·A2)·B, 학습자료, 교수자 2(A1만 배정), 학생 4
  await must(sb.from("courses").insert([
    { id: courseA, title: "D4 A", drama: "D4", status: "active", legacy_code: null },
    { id: courseB, title: "D4 B", drama: "D4", status: "active", legacy_code: null },
  ]));
  const tpl = Object.values(db.data.lessons).find((l) => l.status === "published" && l.courseId !== "course-legacy")!;
  const lesson = (id: string, courseId: string, week: number, status: Lesson["status"]): Lesson => ({ ...tpl, dialogues: undefined, id: `${PREFIX}${id}`, courseId, week, status });
  const A1 = lesson("a-w1", courseA, 1, "published");
  const A2 = lesson("a-w2", courseA, 2, "draft");
  const A3 = lesson("a-w3", courseA, 3, "published");
  const B1 = lesson("b-w1", courseB, 1, "published");
  for (const l of [A1, A2, A3, B1]) await must(sb.rpc("admin_save_lesson", { p_lesson: l, p_admin_label: "D4 검사" }));
  for (const t of ["t-a", "t-none"]) await call("POST", "/instructors", admin, { email: mail(t) });
  await createUser("t-a", "교수 A");
  await createUser("t-none", "미배정 교수");
  const sA = await createUser("s-a", "학생 A");
  const sA2 = await createUser("s-a2", "학생 A2");
  const sB = await createUser("s-b", "학생 B");
  const sP = await createUser("s-pending", "대기 학생");
  for (const u of [sA, sA2, sB, sP]) await must(sb.from("profiles").update({ profile_completed: true, name: u.user_metadata.full_name }).eq("id", u.id));
  for (const u of [sA, sA2, sB]) await call("PATCH", `/members/${u.id}`, admin, { status: "approved" });
  const secA1 = (await call<SectionOverview>("POST", `/courses/${courseA}/sections`, admin, { instructors: [mail("t-a")] })).body;
  const secA2 = (await call<SectionOverview>("POST", `/courses/${courseA}/sections`, admin, { name: "A 둘째" })).body;
  const secB = (await call<SectionOverview>("POST", `/courses/${courseB}/sections`, admin, {})).body;
  const TA = await signIn(mail("t-a"));
  const TN = await signIn(mail("t-none"));
  const SA = await signIn(mail("s-a"));
  const SA2 = await signIn(mail("s-a2"));
  const SB = await signIn(mail("s-b"));
  const SP = await signIn(mail("s-pending"));
  for (const u of [TA, TN, SA, SA2, SB, SP]) await u.client.rpc("sync_my_account");
  await call("POST", "/enrollments", SA, { courseCode: secA1.code });
  await call("POST", "/enrollments", SA2, { courseCode: secA2.code });
  await call("POST", "/enrollments", SB, { courseCode: secB.code });

  // ── 학생 저장 (save_my_progress) · 조회
  const quiz = { correct: 3, total: 5, submittedAt: "2026-10-30T09:20:00.000Z" };
  const pA = prog(sA.id, A1.id, { quiz, quizAttempts: 2, completedAt: "2026-10-30T09:19:00.000Z" });
  const save1 = await call("PUT", "/progress", SA, pA);
  const rowA = await must(sb.from("lesson_progress").select("*").eq("user_id", sA.id).eq("lesson_id", A1.id).single());
  check(
    "학생 저장(save_my_progress): Supabase에 user_id=auth.uid()로 저장, 퀴즈·시청 구간·시각·숫자 그대로 (db.json에는 쓰지 않음)",
    save1.status === 200 && isDeepStrictEqual(progressFromRow(rowA), pA) && JSON.stringify(db.data.progress) === dbProgressBefore,
  );
  const again = await call("PUT", "/progress", SA, { ...pA, maxPosition: 55, watchedRanges: [[3, 55]], progressRatio: 0.12 });
  const rowsA = await must(sb.from("lesson_progress").select("max_position").eq("user_id", sA.id).eq("lesson_id", A1.id));
  check("같은 (학생, 학습자료)에 다시 저장하면 덮어쓰기 (중복 행 없음)", again.status === 200 && rowsA.length === 1 && rowsA[0].max_position === 55);
  const other = await call("PUT", "/progress", SA, prog(sB.id, A1.id));
  const draft = await call("PUT", "/progress", SA, prog(sA.id, A2.id));
  const notMine = await call("PUT", "/progress", SA, prog(sA.id, B1.id));
  const pending = await call("PUT", "/progress", SP, prog(sP.id, A1.id));
  const teach = await call("PUT", "/progress", TA, prog(sA.id, A1.id));
  const noTok = await call("PUT", "/progress", {}, prog(sA.id, A1.id));
  check(
    "저장 거부: 남의 userId 400 · 준비 중 학습자료 403 · 수강하지 않는 과목 403 · 승인 대기 403 · 교수자 403 · token 없음 401",
    other.status === 400 && draft.status === 403 && notMine.status === 403 && pending.status === 403 && teach.status === 403 && noTok.status === 401,
  );
  const rpcOther = await SA.client.rpc("save_my_progress", { p_progress: prog(sB.id, A1.id) });
  const rpcTeach = await TA.client.rpc("save_my_progress", { p_progress: prog(sA.id, A1.id) });
  const dIns = await SA.client.from("lesson_progress").insert({ user_id: sA.id, lesson_id: A3.id, week: 3 });
  const dUpd = await SA.client.from("lesson_progress").update({ max_position: 999 }).eq("user_id", sA.id).select();
  const dDel = await SA.client.from("lesson_progress").delete().eq("user_id", sA.id).select();
  const tUpd = await TA.client.from("lesson_progress").update({ max_position: 999 }).eq("user_id", sA.id).select();
  const stillA = await must(sb.from("lesson_progress").select("max_position").eq("user_id", sA.id).eq("lesson_id", A1.id).single());
  check(
    "RPC·테이블 직접: 남의 기록 22023, 교수자 42501, 학생·교수자 INSERT·UPDATE·DELETE 불가 (기록 그대로)",
    rpcOther.error?.code === "22023" && rpcTeach.error?.code === "42501" && [dIns, dUpd, dDel, tUpd].every((r) => !!r.error) && stillA.max_position === 55,
  );
  await call("PUT", "/progress", SA2, prog(sA2.id, A1.id));
  await call("PUT", "/progress", SB, prog(sB.id, B1.id));
  const gA = await call<LessonProgress[]>("GET", "/progress", SA);
  const gB = await call<LessonProgress[]>("GET", "/progress", SB);
  const directOthers = await must(SA.client.from("lesson_progress").select("user_id").neq("user_id", sA.id));
  check(
    "학생 조회: 본인 기록만 (API·직접 조회 모두, 다른 학생 0)",
    gA.body.length === 1 && gA.body[0].userId === sA.id && isDeepStrictEqual(gA.body[0].quiz, quiz) && gB.body.length === 1 && gB.body[0].userId === sB.id && directOthers.length === 0,
  );

  // ── 교수자 조회 범위
  const tA = await call<LessonProgress[]>("GET", "/progress", TA);
  const tAB = await call<LessonProgress[]>("GET", `/progress?course=${courseB}`, TA);
  const tStudents = await call<CourseStudents>("GET", `/courses/${courseA}/students`, TA);
  const tDirect = await must(TA.client.from("lesson_progress").select("user_id"));
  const tn = await call<LessonProgress[]>("GET", "/progress", TN);
  check(
    "교수자: 운영 중인 담당 분반(A1) 학생 A의 과목 A 기록만 — 같은 과목 다른 분반(A2)·다른 과목(B) 학생 제외, 미배정 교수자 0",
    tA.body.length === 1 && tA.body[0].userId === sA.id && tAB.body.length === 0 && tStudents.body.progress.length === 1 && tStudents.body.progress[0].userId === sA.id &&
      tDirect.length === 1 && tn.body.length === 0,
  );
  const adm = await call<LessonProgress[]>("GET", `/progress?course=${courseA}`, admin);
  const admStudents = await call<CourseStudents>("GET", `/courses/${courseA}/students`, admin);
  check(
    "관리자(service-role): 과목 A 기록 전체(A1·A2 학생), 과목 수강생 화면에도 Supabase 기록",
    adm.body.filter((p) => p.lessonId.startsWith(PREFIX)).length === 2 && admStudents.body.progress.length === 2,
  );

  // ── 분반 비활성 후: 기존 수강 학생은 계속 기록, 교수자 조회는 운영 중 분반만
  await call("PATCH", `/sections/${secA1.id}`, admin, { status: "inactive" });
  const inactiveSave = await call("PUT", "/progress", SA, prog(sA.id, A3.id, { week: 3 }));
  const inactiveRead = await call<LessonProgress[]>("GET", "/progress", SA);
  const tAfter = await call<LessonProgress[]>("GET", "/progress", TA);
  check(
    "분반 비활성 후: 기존 수강 학생은 계속 저장·조회, 교수자는 운영 중 담당 분반 기준이라 0",
    inactiveSave.status === 200 && inactiveRead.body.length === 2 && tAfter.body.length === 0,
  );

  // ── 학습 기록이 있는 학습자료 삭제 차단 (RESTRICT)
  const delBlocked = await call<{ error: string }>("DELETE", `/lessons/${A1.id}`, admin);
  const stillLesson = await must(sb.from("lessons").select("id").eq("id", A1.id));
  const delFree = await call("DELETE", `/lessons/${A2.id}`, admin);
  check(
    "기록 있는 학습자료 관리자 삭제 → 409 “학습 기록이 있는 강의자료는 삭제할 수 없습니다. 준비 중 상태로 변경해주세요.” (자료 그대로) / 기록 없는 자료는 삭제",
    delBlocked.status === 409 && delBlocked.body.error === "학습 기록이 있는 강의자료는 삭제할 수 없습니다. 준비 중 상태로 변경해주세요." && stillLesson.length === 1 && delFree.status === 200,
  );

  // ── 보관 테이블·관리 함수 접근 차단
  const lgSel = await SA.client.from("legacy_progress").select("*");
  const lgIns = await SA.client.from("legacy_progress").insert({ legacy_user_id: `${PREFIX}x`, lesson_id: A1.id, record: {}, reason: "x" });
  const anon = createClient(url, anonKey, opts);
  const lgAnon = await anon.from("legacy_progress").select("*");
  const lpAnon = await anon.from("lesson_progress").select("*");
  const fnIdentity = await SA.client.rpc("legacy_identity_user", { p_legacy_user_id: "x", p_legacy_email: "x" });
  const fnImport = await SA.client.rpc("admin_import_progress", { p_user_id: sA.id, p_progress: prog(sA.id, A3.id) });
  const fnClaim = await SA.client.rpc("claim_legacy_progress", { p_user_id: sA.id });
  check(
    "legacy_progress·관리 함수: 학생·anon 직접 접근 불가 (조회·쓰기·legacy_identity_user·admin_import_progress·claim)",
    !!lgSel.error && !!lgIns.error && !!lgAnon.error && (!!lpAnon.error || lpAnon.data.length === 0) && !!fnIdentity.error && !!fnImport.error && !!fnClaim.error,
  );

  // ── 기존 기록 이전: Google sub + 이메일
  const uMatch = await createUser("u-match", "연결 학생");
  const uMismatch = await createUser("u-mismatch", "이메일 다른 학생");
  const uEmailOnly = await createUser("u-emailonly", "이메일만 같은 학생");
  addGoogleIdentities([
    { userId: uMatch.id, sub: sub("1"), email: mail("u-match") },
    { userId: uMismatch.id, sub: sub("2"), email: mail("u-mismatch") },
  ]);
  const member = (id: string, googleEmail: string) => ({ id, googleEmail }) as LearnerProfile;
  const source = {
    progress: {
      [`${sub("1")}::${A1.id}`]: prog(sub("1"), A1.id, { quiz, quizAttempts: 1 }),
      [`${sub("2")}::${A1.id}`]: prog(sub("2"), A1.id),
      [`${sub("3")}::${A1.id}`]: prog(sub("3"), A1.id),
      [`${sub("4")}::${A1.id}`]: prog(sub("4"), A1.id, { maxPosition: 77 }),
      [`${sub("5")}::${PREFIX}gone`]: prog(sub("5"), `${PREFIX}gone`),
    },
    members: {
      [sub("1")]: member(sub("1"), mail("u-match").toUpperCase()),
      [sub("2")]: member(sub("2"), mail("u-mismatch-old")),
      [sub("3")]: member(sub("3"), mail("u-emailonly")),
      [sub("4")]: member(sub("4"), mail("u-late")),
      [sub("5")]: member(sub("5"), mail("u-match")),
    },
  };
  const plan1 = await planProgressMigration(sb, source);
  const reasonOf = (s: string) => plan1.find((i) => i.source.userId === sub(s));
  const sum1 = summarizeProgressPlan(plan1);
  check(
    "이전 분류: sub+이메일 일치 → mapped / sub만 일치 → email_mismatch / 이메일만 일치 → email_only / 가입 전 → no_account / 학습자료 없음 → lesson_missing",
    reasonOf("1")?.kind === "mapped" && reasonOf("1")?.userId === uMatch.id && reasonOf("2")?.reason === "email_mismatch" && reasonOf("3")?.reason === "email_only" &&
      reasonOf("4")?.reason === "no_account" && reasonOf("5")?.reason === "lesson_missing" && sum1.mapped === 1 && sum1.legacy === 4 && sum1.insert === 5 && sum1.conflict === 0,
    JSON.stringify(sum1),
  );
  const inserted = await applyProgressPlan(sb, plan1);
  const mappedRow = await must(sb.from("lesson_progress").select("*").eq("user_id", uMatch.id).eq("lesson_id", A1.id));
  const legacyRows = await must(sb.from("legacy_progress").select("*").like("legacy_user_id", `${PREFIX}%`).order("legacy_user_id"));
  check(
    "이전 적용: mapped 1건은 연결된 계정의 lesson_progress(원본과 동일), 나머지 4건은 legacy_progress에 원본 그대로",
    inserted === 5 && mappedRow.length === 1 && isDeepStrictEqual(progressFromRow(mappedRow[0] as R), { ...source.progress[`${sub("1")}::${A1.id}`], userId: uMatch.id }) &&
      legacyRows.length === 4 && (legacyRows as R[]).every((r) => isDeepStrictEqual(r.record, source.progress[`${r.legacy_user_id}::${r.lesson_id}`]) && r.claimed_by === null),
  );
  const plan2 = await planProgressMigration(sb, source);
  const sum2 = summarizeProgressPlan(plan2);
  const inserted2 = await applyProgressPlan(sb, plan2);
  const counts2 = [
    (await must(sb.from("lesson_progress").select("user_id").eq("user_id", uMatch.id))).length,
    (await must(sb.from("legacy_progress").select("legacy_user_id").like("legacy_user_id", `${PREFIX}%`))).length,
  ];
  check("이전 재실행: insert 0 · unchanged 5 · 중복 없음", sum2.insert === 0 && sum2.unchanged === 5 && inserted2 === 0 && counts2.join() === "1,4", JSON.stringify(sum2));

  // ── 나중에 가입한 학생의 claim (sync_my_account): 같은 두 조건
  const uLate = await createUser("u-late", "나중 가입 학생");
  addGoogleIdentities([{ userId: uLate.id, sub: sub("4"), email: mail("u-late") }]);
  const LATE = await signIn(mail("u-late"));
  const s1 = await must(LATE.client.rpc("sync_my_account"));
  const s2 = await must(LATE.client.rpc("sync_my_account"));
  const lateRows = await must(sb.from("lesson_progress").select("*").eq("user_id", uLate.id));
  const late4 = await must(sb.from("legacy_progress").select("claimed_by").eq("legacy_user_id", sub("4")).single());
  const MIS = await signIn(mail("u-mismatch"));
  const EO = await signIn(mail("u-emailonly"));
  const sMis = await must(MIS.client.rpc("sync_my_account"));
  const sEo = await must(EO.client.rpc("sync_my_account"));
  const unclaimed = await must(sb.from("legacy_progress").select("legacy_user_id").like("legacy_user_id", `${PREFIX}%`).is("claimed_by", null));
  const misRows = await must(sb.from("lesson_progress").select("user_id").in("user_id", [uMismatch.id, uEmailOnly.id]));
  check(
    "claim: sub+이메일 일치하는 나중 가입자만 1건 연결(원본 그대로), 다시 불러도 0건·중복 없음 / sub만·이메일만 일치하면 claim 0, 보관 그대로",
    (s1 as R).claimed_progress === 1 && (s2 as R).claimed_progress === 0 && lateRows.length === 1 &&
      isDeepStrictEqual(progressFromRow(lateRows[0] as R), { ...source.progress[`${sub("4")}::${A1.id}`], userId: uLate.id }) && late4.claimed_by === uLate.id &&
      (sMis as R).claimed_progress === 0 && (sEo as R).claimed_progress === 0 && misRows.length === 0 && unclaimed.length === 3,
  );
  const plan3 = await planProgressMigration(sb, source);
  const sum3 = summarizeProgressPlan(plan3);
  check("claim 후 이전 재실행: 연결된 기록 unchanged, insert 0 · conflict 0", sum3.insert === 0 && sum3.conflict === 0 && sum3.unchanged === 5, JSON.stringify(sum3));
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  close();
  rmSync(dir, { recursive: true, force: true });
  await sb.from("lesson_progress").delete().like("lesson_id", `${PREFIX}%`);
  await sb.from("legacy_progress").delete().like("legacy_user_id", `${PREFIX}%`);
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
    sb.from("lesson_progress").select("lesson_id", { count: "exact", head: true }).like("lesson_id", `${PREFIX}%`),
    sb.from("legacy_progress").select("lesson_id", { count: "exact", head: true }).like("legacy_user_id", `${PREFIX}%`),
  ]);
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftUsers = users.users.filter((u) => (u.email ?? "").startsWith(PREFIX)).length;
  console.log(`정리: 남은 테스트 과목 ${left[0].count}, 학습자료 ${left[1].count}, 학습 기록 ${left[2].count}, 보관 기록 ${left[3].count}, 계정 ${leftUsers}`);
  check("테스트 데이터 모두 정리 (계정 삭제로 Google identity도 함께 삭제)", left.every((r) => r.count === 0) && leftUsers === 0);
  check("실제 데이터(C1~C4 + 학습자료 61·회화 + 학습 기록·보관 기록)는 검사 전후 그대로", (await snapshot()) === before);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

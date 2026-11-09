// Supabase dev 프로젝트에서 Phase D5(피드백 초안 feedback_drafts 전환 + AI 키 환경변수 전용 정책·/ai 권한)를 확인한다.
//   npm run supabase:check-d5   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// 임시 폴더의 새 db.json으로 실제 API(createApi, AUTH_BACKEND=supabase)를 띄운다. 실제 Gmail 발송·Anthropic 호출은 하지 않는다.
// 키가 있는 경우의 응답은 가짜 키(검사 때만 만든 임의 문자열)를 넣은 두 번째 API로 확인하고, 그 키로 생성 요청은 보내지 않는다.
// 테스트 행은 모두 이번 검사 태그(phased5-…)가 붙은 id·과목이며, 실제 데이터는 검사 전후 그대로인지 확인한다.
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import type { FeedbackDraft, SectionOverview } from "../src/app/store/models";
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
const PREFIX = `phased5-${tag}-`;
const mail = (who: string) => `${PREFIX}${who}@example.test`;
const courseA = `${PREFIX}a`;
const password = randomBytes(18).toString("base64url");
const SECRET = randomBytes(24).toString("hex");
const ADMIN = { ADMIN_ID: `d5-admin-${tag}`, ADMIN_PASSWORD: randomBytes(18).toString("base64url") };
const FAKE_KEY = `sk-ant-d5test-${randomBytes(16).toString("hex")}`;
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

/** 실제 데이터 스냅샷: C1~C4 + 학습자료·회화·기록 + 피드백 초안 (이번 검사 태그 행 제외) */
const snapshot = async () => {
  const mine = (v: unknown) => String(v).includes(PREFIX);
  const q = (t: string, order: string) => must(sb.from(t).select("*").order(order));
  const [c, s, si, e, i, p, l, d, lp, lg, fb] = await Promise.all([
    q("courses", "id"), q("sections", "id"), q("section_instructors", "section_id"), q("enrollments", "id"), q("instructors", "email"),
    must(sb.from("profiles").select("id,status,approved_at,profile_completed,name").order("id")),
    q("lessons", "id"), q("lesson_dialogues", "id"),
    must(sb.from("lesson_progress").select("*").order("user_id").order("lesson_id")),
    must(sb.from("legacy_progress").select("*").order("legacy_user_id").order("lesson_id")),
    q("feedback_drafts", "id"),
  ]);
  return JSON.stringify([
    (c as R[]).filter((y) => !mine(y.id)), (s as R[]).filter((y) => !mine(y.course_id)), (si as R[]).filter((y) => !mine(y.instructor_email)),
    (e as R[]).filter((y) => !mine(y.course_id)), (i as R[]).filter((y) => !mine(y.email)), (p as R[]).filter((y) => !createdUsers.includes(String(y.id))),
    l, d, lp, lg, (fb as R[]).filter((y) => !mine(y.id)),
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

const dir = mkdtempSync(path.join(tmpdir(), "zhuiju-d5-"));
const closers: (() => void)[] = [];
type Auth = { token?: string; cookie?: string };
const serve = async (extraEnv: Record<string, string>) => {
  const db = openDb(dir);
  const app = express();
  app.use(express.json());
  app.use("/api", createApi(db, readApiEnv({ ...ADMIN, SESSION_SECRET: SECRET, AUTH_BACKEND: "supabase", SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey, ...extraEnv })));
  const base = await new Promise<string>((resolve) => {
    const server = app.listen(0, () => {
      closers.push(() => server.close());
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
    });
  });
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
  const login = await fetch(`${base}/auth/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }) });
  return { db, call, admin: { cookie: (login.headers.get("set-cookie") ?? "").split(";")[0] } as Auth };
};

const before = await snapshot();
try {
  // ── 임시 db.json에 db.json 전용 피드백을 둔다: supabase 모드가 읽거나 쓰지 않는지 확인
  const { db, call, admin } = await serve({ ANTHROPIC_API_KEY: "" });
  const bogusId = `${PREFIX}dbjson-only`;
  db.data.feedback[bogusId] = { id: bogusId, learnerId: "x", lessonId: "x", to: "x@example.test", subject: "x", body: "x", status: "draft", channel: null, createdAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T00:00:00.000Z", sentAt: null, externalMessageId: null };
  db.save();
  const dbFeedbackBefore = JSON.stringify(db.data.feedback);

  // ── 준비: 과목 A(운영 분반 1·비활성 분반 담당 교수자용 분반 2), 교수자 3, 학생 2
  await must(sb.from("courses").insert({ id: courseA, title: "D5 A", drama: "D5", status: "active", legacy_code: null }));
  for (const t of ["t-assigned", "t-none", "t-inactive"]) await call("POST", "/instructors", admin, { email: mail(t) });
  await createUser("t-assigned", "배정 교수");
  await createUser("t-none", "미배정 교수");
  await createUser("t-inactive", "비활성 분반 교수");
  const s1 = await createUser("s-one", "학생 하나");
  const sP = await createUser("s-pending", "대기 학생");
  for (const u of [s1, sP]) await must(sb.from("profiles").update({ profile_completed: true, name: u.user_metadata.full_name }).eq("id", u.id));
  await call("PATCH", `/members/${s1.id}`, admin, { status: "approved" });
  await call<SectionOverview>("POST", `/courses/${courseA}/sections`, admin, { instructors: [mail("t-assigned")] });
  const sec2 = (await call<SectionOverview>("POST", `/courses/${courseA}/sections`, admin, { name: "비활성", instructors: [mail("t-inactive")] })).body;
  await call("PATCH", `/sections/${sec2.id}`, admin, { status: "inactive" });
  const TA = await signIn("t-assigned");
  const TN = await signIn("t-none");
  const TI = await signIn("t-inactive");
  const S1 = await signIn("s-one");
  const SP = await signIn("s-pending");

  // ── 피드백 초안: 관리자 세션으로 목록·생성·수정·삭제 (Supabase)
  const id = `${PREFIX}feedback-1`;
  const draft: FeedbackDraft = {
    id, learnerId: s1.id, lessonId: "course-campus-w01", to: "learner@example.test", subject: "[追剧学汉语] 1주차 학습 피드백", body: "안녕하세요.\n\n[교강사 코멘트]\n좋아요!",
    status: "draft", channel: null, createdAt: "2026-10-30T09:00:00.000Z", updatedAt: "2026-10-30T09:00:00.000Z", sentAt: null, externalMessageId: null,
  };
  const created = await call<FeedbackDraft>("PUT", `/feedback/${id}`, admin, draft);
  const list1 = await call<FeedbackDraft[]>("GET", "/feedback", admin);
  check(
    "관리자 피드백 저장(생성): 기존 FeedbackDraft 형식 그대로, createdAt 유지·updatedAt은 서버 시각, 목록에 Supabase 행만 (db.json 전용 초안 없음)",
    created.status === 200 && isDeepStrictEqual({ ...created.body, updatedAt: draft.updatedAt }, draft) && created.body.updatedAt !== draft.updatedAt &&
      list1.body.some((d) => d.id === id) && !list1.body.some((d) => d.id === bogusId),
  );
  const sent = await call<FeedbackDraft>("PUT", `/feedback/${id}`, admin, { ...created.body, status: "sent", channel: "gmail-api", sentAt: "2026-10-30T09:05:00.000Z", externalMessageId: "18c0ffee" });
  const row = await must(sb.from("feedback_drafts").select("*").eq("id", id).single());
  check(
    "관리자 피드백 수정(발송 완료 표시): status·channel·sentAt·externalMessageId 저장, 칸은 초안 내용뿐 (토큰 칸 없음)",
    sent.status === 200 && sent.body.status === "sent" && sent.body.channel === "gmail-api" && sent.body.externalMessageId === "18c0ffee" &&
      Object.keys(row).sort().join() === "body,channel,created_at,external_message_id,id,learner_id,lesson_id,sent_at,status,subject,to_email,updated_at",
  );
  const badId = await call("PUT", `/feedback/${id}`, admin, { ...draft, id: `${PREFIX}other` });
  const badStatus = await call("PUT", `/feedback/${id}`, admin, { ...draft, status: "deleted" });
  check("형식 오류 400: id 불일치·잘못된 status", badId.status === 400 && badStatus.status === 400);
  const noSession = [await call("GET", "/feedback"), await call("PUT", `/feedback/${id}`, {}, draft), await call("DELETE", `/feedback/${id}`)];
  const asUsers = [];
  for (const who of [S1, TA]) asUsers.push(await call("GET", "/feedback", who), await call("PUT", `/feedback/${id}`, who, draft), await call("DELETE", `/feedback/${id}`, who));
  const still = await must(sb.from("feedback_drafts").select("status").eq("id", id).single());
  check("관리자 세션 없음 401 · 학생·교수자 token 403 (목록·저장·삭제), 초안 그대로", noSession.every((r) => r.status === 401) && asUsers.every((r) => r.status === 403) && still.status === "sent");
  const anon = createClient(url, anonKey, opts);
  const direct = [
    await anon.from("feedback_drafts").select("*"), await S1.client.from("feedback_drafts").select("*"), await TA.client.from("feedback_drafts").select("*"),
    await S1.client.from("feedback_drafts").insert({ id: `${PREFIX}x`, learner_id: "x", lesson_id: "x" }), await TA.client.from("feedback_drafts").delete().eq("id", id).select(),
  ];
  check("feedback_drafts 직접 접근: anon·학생·교수자 조회·쓰기·삭제 모두 불가", direct.every((r) => !!r.error));
  const del = await call("DELETE", `/feedback/${id}`, admin);
  const gone = await must(sb.from("feedback_drafts").select("id").eq("id", id));
  check("관리자 피드백 삭제", del.status === 200 && gone.length === 0);
  check("supabase 모드는 db.json 피드백을 읽지도 쓰지도 않음", JSON.stringify(db.data.feedback) === dbFeedbackBefore);

  // ── AI (BYOK): 본인 키 헤더가 없으면 생성하지 않고 프롬프트 복사·JSON 붙여넣기로 안내 (Anthropic 호출 없음)
  const st = (a: Auth) => call<{ model?: string; personalKey?: boolean }>("GET", "/ai/status", a);
  const dr = (a: Auth) => call<{ error: string; manual?: boolean }>("POST", "/ai/draft", a, { prompt: "테스트" });
  const aS = await st(admin);
  const aD = await dr(admin);
  const tS = await st(TA);
  const tD = await dr(TA);
  check(
    "본인 키 없음: 관리자·배정 교수자 상태 200(personalKey), 생성은 400 manual ‘프롬프트 복사’ 안내 (Anthropic 호출 없음)",
    aS.status === 200 && aS.body.personalKey === true && aD.status === 400 && aD.body.manual === true &&
      tS.status === 200 && tS.body.personalKey === true && tD.status === 400 && tD.body.manual === true,
  );
  const denied = [
    ["미배정 교수자", TN, 403], ["비활성 분반만 담당한 교수자", TI, 403], ["승인 학생", S1, 403], ["승인 대기 학생", SP, 403],
    ["token 없음", {}, 401], ["잘못된 token", { token: "not-a-jwt" }, 401],
  ] as const;
  const deniedResults = [];
  for (const [label, who, code] of denied) {
    const [s, d] = [await st(who as Auth), await dr(who as Auth)];
    deniedResults.push(s.status === code && d.status === code && !/키|설정/.test(String((d.body as { error?: string })?.error ?? "").replace("AI 생성은", "")) ? null : label);
  }
  check(
    "권한 먼저: 미배정·비활성 분반 교수자·학생·승인 대기 403, token 없음·잘못된 token 401 (키 설정 여부 안내 없음)",
    deniedResults.every((x) => x === null),
    deniedResults.filter(Boolean).join(", "),
  );
  const putKey = await call<{ error: string }>("PUT", "/ai/key", admin, { apiKey: FAKE_KEY });
  const delKey = await call<{ error: string }>("DELETE", "/ai/key", admin);
  const putKeyTeacher = await call("PUT", "/ai/key", TA, { apiKey: FAKE_KEY });
  check(
    "서버 키 저장 경로 없음(BYOK): PUT·DELETE /ai/key 404(관리자·교수자), db.json에도 저장 안 됨",
    putKey.status === 404 && delKey.status === 404 && putKeyTeacher.status === 404 && !("anthropicApiKey" in db.data),
  );

  // ── AI: 서버 환경변수 ANTHROPIC_API_KEY가 있어도 자동으로 쓰지 않는다 (가짜 키, 생성 요청은 Anthropic까지 가지 않는다)
  const withKey = await serve({ ANTHROPIC_API_KEY: FAKE_KEY });
  const kA = await withKey.call<{ personalKey?: boolean }>("GET", "/ai/status", withKey.admin);
  const kT = await withKey.call<{ personalKey?: boolean }>("GET", "/ai/status", TA);
  const kD = await withKey.call<{ manual?: boolean }>("POST", "/ai/draft", TA, { prompt: "테스트" });
  const kN = await withKey.call("GET", "/ai/status", TN);
  const kS = await withKey.call("GET", "/ai/status", S1);
  check(
    "서버 환경변수 키는 쓰지 않음: 헤더 없는 생성은 400 manual, 상태·응답 어디에도 키 문자열 없음, 미배정 교수자·학생은 403",
    kA.status === 200 && kA.body.personalKey === true && kT.status === 200 && kD.status === 400 && kD.body.manual === true &&
      kN.status === 403 && kS.status === 403 && ![kA, kT, kN, kS, kD].some((r) => r.text.includes(FAKE_KEY) || r.text.includes(FAKE_KEY.slice(-4))),
  );
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  for (const c of closers) c();
  rmSync(dir, { recursive: true, force: true });
  await sb.from("feedback_drafts").delete().like("id", `${PREFIX}%`);
  for (const id of createdUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("enrollments").delete().eq("course_id", courseA);
  await sb.from("section_instructors").delete().like("instructor_email", `${PREFIX}%`);
  await sb.from("sections").delete().eq("course_id", courseA);
  await sb.from("courses").delete().eq("id", courseA);
  await sb.from("instructors").delete().like("email", `${PREFIX}%`);
  const left = await Promise.all([
    sb.from("courses").select("id", { count: "exact", head: true }).eq("id", courseA),
    sb.from("feedback_drafts").select("id", { count: "exact", head: true }).like("id", `${PREFIX}%`),
    sb.from("section_instructors").select("section_id", { count: "exact", head: true }).like("instructor_email", `${PREFIX}%`),
  ]);
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftUsers = users.users.filter((u) => (u.email ?? "").startsWith(PREFIX)).length;
  console.log(`정리: 남은 테스트 과목 ${left[0].count}, 피드백 ${left[1].count}, 분반 배정 ${left[2].count}, 계정 ${leftUsers}`);
  check("테스트 데이터 모두 정리 (계정·과목·분반 배정·피드백)", left.every((r) => r.count === 0) && leftUsers === 0);
  check("실제 데이터(C1~C4 + 학습자료·회화·학습 기록·보관 기록 + 피드백)는 검사 전후 그대로", (await snapshot()) === before);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

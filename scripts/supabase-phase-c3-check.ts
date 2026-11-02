// Supabase dev 프로젝트에서 Phase C3(관리자 API의 Supabase 경로)를 실제 API로 확인한다.
//   npm run supabase:check-c3   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// 임시 폴더의 새 db.json으로 실제 API(createApi, AUTH_BACKEND=supabase)를 띄운다. 관리자 아이디·비밀번호는 이 검사에서만 쓰는 임의 값이다.
// 테스트용 계정(example.test)·과목·분반·교수자를 만들었다가 모두 지운다. 실제 과목·분반·교수자·계정은 검사 전후 그대로인지 확인한다.
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import type { CourseOverview, CourseStudents, Enrollment, InstructorRecord, LearnerProfile, SectionOverview } from "../src/app/store/models";
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
const mail = (who: string) => `phasec3-${tag}-${who}@example.test`;
const courseId = `phasec3-${tag}-a`;
const password = randomBytes(18).toString("base64url");
const SECRET = randomBytes(24).toString("hex");
const ADMIN = { ADMIN_ID: `c3-admin-${tag}`, ADMIN_PASSWORD: randomBytes(18).toString("base64url") };
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

/** 실제 데이터 스냅샷 (이번 검사 태그가 붙은 행은 제외) */
const snapshot = async () => {
  const mine = (v: unknown) => String(v).includes(`phasec3-${tag}-`);
  const [c, s, si, e, i, p] = await Promise.all([
    must(sb.from("courses").select("*").order("id")),
    must(sb.from("sections").select("*").order("id")),
    must(sb.from("section_instructors").select("*").order("section_id")),
    must(sb.from("enrollments").select("*").order("id")),
    must(sb.from("instructors").select("*").order("email")),
    must(sb.from("profiles").select("id,status,approved_at,profile_completed,name").order("id")),
  ]);
  return JSON.stringify([
    (c as { id: string }[]).filter((r) => !mine(r.id)),
    (s as { id: string }[]).filter((r) => !mine(r.id)),
    (si as { instructor_email: string }[]).filter((r) => !mine(r.instructor_email)),
    (e as { section_id: string }[]).filter((r) => !mine(r.section_id)),
    (i as { email: string }[]).filter((r) => !mine(r.email)),
    (p as { id: string }[]).filter((r) => !createdUsers.includes(r.id)),
  ]);
};

const createUser = async (who: string) => {
  const { data, error } = await sb.auth.admin.createUser({ email: mail(who), password, email_confirm: true, user_metadata: { full_name: `C3 ${who}` } });
  if (error) throw new Error(`createUser ${who}: ${error.message}`);
  createdUsers.push(data.user.id);
  return data.user;
};

const dir = mkdtempSync(path.join(tmpdir(), "zhuiju-c3-"));
let base = "";
let close = () => {};
const call = async <T = unknown>(method: string, p: string, cookie?: string, body?: unknown) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
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
const sessionCookie = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};

const before = await snapshot();
try {
  // ── 임시 API 서버 (AUTH_BACKEND=supabase)
  const db = openDb(dir);
  const staffEmail = `phasec3-${tag}-legacy-staff@example.test`;
  db.data.instructors[staffEmail] = { email: staffEmail, source: "local", addedBy: null, addedAt: null };
  const app = express();
  app.use("/api", createApi(db, readApiEnv({ ...ADMIN, SESSION_SECRET: SECRET, AUTH_BACKEND: "supabase", SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      close = () => server.close();
      resolve();
    });
  });
  const login = await fetch(`${base}/auth/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }) });
  const admin = (login.headers.get("set-cookie") ?? "").split(";")[0];
  check("관리자: 기존 아이디·비밀번호 로그인 그대로", login.status === 200 && admin.startsWith("zhuiju_sid="));

  // ── 준비: 테스트 과목, 학생 2명, 교수자 계정 2개 (교수자 등록은 API로)
  await must(sb.from("courses").insert({ id: courseId, title: "C3 테스트 과목", drama: "C3", status: "active", legacy_code: null }));
  const s1 = await createUser("s1");
  const s2 = await createUser("s2");
  const t1 = await createUser("t1");
  const t2 = await createUser("t2");
  await must(sb.from("profiles").update({ profile_completed: true, name: "학생 하나", student_id: "C3-1" }).eq("id", s1.id));
  await must(sb.from("profiles").update({ profile_completed: true, name: "학생 둘", student_id: "C3-2" }).eq("id", s2.id));

  // ── 접근 차단
  const anonRes = await call("GET", "/members");
  const staffRes = await call("GET", "/members", sessionCookie({ k: "google", id: "x", email: staffEmail }));
  const staffSec = await call("POST", `/courses/${courseId}/sections`, sessionCookie({ k: "google", id: "x", email: staffEmail }), {});
  // C4부터 supabase 모드는 이전 Google 쿠키 세션을 받지 않으므로 교강사 쿠키도 미로그인(401)으로 막힌다. (token 교수자 403은 check-c4)
  check("미로그인 401 / 이전 교강사(Google) 쿠키 401: 관리자 API 접근 차단", anonRes.status === 401 && staffRes.status === 401 && staffSec.status === 401);

  // ── 회원 (profiles)
  const list = await call<LearnerProfile[]>("GET", "/members", admin);
  const listed = (id: string) => list.body.find((m) => m.id === id);
  check(
    "회원 목록: Supabase profiles (기존 응답 형태)",
    list.status === 200 && !!listed(s1.id) && listed(s1.id)?.googleEmail === mail("s1") && listed(s1.id)?.status === "pending" && listed(s1.id)?.profileCompleted === true,
  );
  const ok1 = await call<LearnerProfile>("PATCH", `/members/${s1.id}`, admin, { status: "approved", university: "  C3 대학  " });
  const db1 = await must(sb.from("profiles").select("status,approved_at,university").eq("id", s1.id).single());
  check("승인: status=approved, approved_at 기록, 정보 수정", ok1.status === 200 && ok1.body.status === "approved" && !!ok1.body.approvedAt && db1.status === "approved" && !!db1.approved_at && db1.university === "C3 대학");
  const again = await call<LearnerProfile>("PATCH", `/members/${s1.id}`, admin, { status: "approved" });
  check("다시 승인해도 최초 승인 시각 유지", again.body.approvedAt === ok1.body.approvedAt);
  const back = await call<LearnerProfile>("PATCH", `/members/${s1.id}`, admin, { status: "pending" });
  const db1b = await must(sb.from("profiles").select("status,approved_at").eq("id", s1.id).single());
  check("대기로 전환: status=pending, approved_at=null", back.status === 200 && db1b.status === "pending" && db1b.approved_at === null);
  await call("PATCH", `/members/${s1.id}`, admin, { status: "approved" });
  const unknown = await call("PATCH", `/members/00000000-0000-0000-0000-000000000000`, admin, { status: "approved" });
  const badId = await call("PATCH", `/members/not-a-uuid`, admin, { status: "approved" });
  check("없는 회원·잘못된 id는 404", unknown.status === 404 && badId.status === 404);

  // 학생 본인은 승인 칸을 바꿀 수 없다 (관리자 경로에서만)
  const S2 = createClient(url, anonKey, opts);
  await S2.auth.signInWithPassword({ email: mail("s2"), password });
  const self = await S2.from("profiles").update({ status: "approved" }).eq("id", s2.id);
  check("학생 본인의 status 변경은 거부 (관리자 경로에서만 가능)", !!self.error);

  // ── 교수자
  const addT1 = await call("POST", "/instructors", admin, { email: `  ${mail("t1").toUpperCase()} ` });
  const addT2 = await call("POST", "/instructors", admin, { email: mail("t2") });
  const addDup = await call("POST", "/instructors", admin, { email: mail("t1") });
  const badEmail = await call("POST", "/instructors", admin, { email: "not-an-email" });
  const insRows = await must(sb.from("instructors").select("email,user_id,source").like("email", `phasec3-${tag}-%`));
  check(
    "교수자 등록: 이메일 정리·중복은 그대로·잘못된 이메일 거부",
    addT1.status === 200 && addT2.status === 200 && addDup.status === 200 && badEmail.status === 400 && insRows.length === 2 && insRows.every((r) => r.source === "admin"),
  );
  check("교수자 등록 즉시 같은 이메일의 로그인 계정과 연결", insRows.find((r) => r.email === mail("t1"))?.user_id === t1.id && insRows.find((r) => r.email === mail("t2"))?.user_id === t2.id);
  const insList = await call<InstructorRecord[]>("GET", "/instructors", admin);
  check("교수자 목록: 기존 응답 형태", insList.status === 200 && insList.body.some((r) => r.email === mail("t1") && r.source === "local"));
  const members2 = await call<LearnerProfile[]>("GET", "/members", admin);
  check("회원 목록에서 교수자 계정은 제외 (profile은 그대로)", !members2.body.some((m) => m.id === t1.id));
  const patchT = await call("PATCH", `/members/${t1.id}`, admin, { status: "approved" });
  const delT = await call("DELETE", `/members/${t1.id}`, admin);
  const t1Profile = await must(sb.from("profiles").select("status").eq("id", t1.id).single());
  check("교수자 계정은 회원 수정·삭제 거부 (승인 상태 그대로)", patchT.status === 400 && delT.status === 400 && t1Profile.status === "pending");

  // ── 과목·분반
  const courses = await call<CourseOverview[]>("GET", "/courses", admin);
  const real = courses.body.filter((c) => !c.id.startsWith("phasec3-"));
  check(
    "관리자 과목 목록: 실제 4과목(이전 과목 포함)과 3분반",
    courses.status === 200 && real.length === 4 && real.flatMap((c) => c.sections).length === 3 && real.some((c) => c.status === "legacy" && c.sections.length === 0),
  );
  check("과목 목록의 강의자료 수 (D3부터 Supabase lessons 기준)", real.every((c) => typeof c.lessonCount === "number") && real.some((c) => c.lessonCount > 0));
  const sec1 = await call<SectionOverview>("POST", `/courses/${courseId}/sections`, admin, { instructors: [mail("t1"), mail("t2")] });
  const sec2 = await call<SectionOverview>("POST", `/courses/${courseId}/sections`, admin, { name: "C3 둘째", instructors: [mail("t1")] });
  check(
    "분반 생성: 이름·고유 강의코드·교수자 배정 (학습자료 없음)",
    sec1.status === 200 && sec1.body.name === "01분반" && /^[A-Z2-9]{6}$/.test(sec1.body.code) && sec1.body.instructors.length === 2 && sec2.status === 200 && sec2.body.code !== sec1.body.code,
  );
  const badSec = await call("POST", `/courses/${courseId}/sections`, admin, { instructors: [mail("nobody")] });
  const legacySec = await call("POST", `/courses/course-legacy/sections`, admin, {});
  const dupSec = await call("POST", `/courses/${courseId}/sections`, admin, { name: "01분반" });
  check("분반 생성 거부: 미등록 교수자 400 / 이전 과목 404 / 운영 중 이름 중복 409", badSec.status === 400 && legacySec.status === 404 && dupSec.status === 409);
  const ren = await call<SectionOverview>("PATCH", `/sections/${sec2.body.id}`, admin, { name: "C3 둘째(변경)" });
  const off = await call<SectionOverview>("PATCH", `/sections/${sec2.body.id}`, admin, { status: "inactive" });
  const on = await call<SectionOverview>("PATCH", `/sections/${sec2.body.id}`, admin, { status: "active" });
  const emptyName = await call("PATCH", `/sections/${sec2.body.id}`, admin, { name: " " });
  check("분반 이름 변경·비활성·재운영, 빈 이름 거부", ren.body.name === "C3 둘째(변경)" && off.body.status === "inactive" && on.body.status === "active" && emptyName.status === 400);
  const del = await call("DELETE", `/sections/${sec2.body.id}`, admin);
  const still = await must(sb.from("sections").select("id").eq("id", sec2.body.id));
  check("분반 삭제 경로 없음 (분반 그대로)", del.status === 404 && still.length === 1);

  // ── 교수자 배정 (다대다)
  const a1 = await call<{ existed: boolean }>("PUT", `/sections/${sec2.body.id}/instructors/${encodeURIComponent(mail("t2"))}`, admin);
  const a2 = await call<{ existed: boolean }>("PUT", `/sections/${sec2.body.id}/instructors/${encodeURIComponent(mail("t2"))}`, admin);
  const aBad = await call("PUT", `/sections/${sec2.body.id}/instructors/${encodeURIComponent(mail("nobody"))}`, admin);
  const links = await must(sb.from("section_instructors").select("section_id,instructor_email").in("section_id", [sec1.body.id, sec2.body.id]));
  const t1Sections = links.filter((l) => l.instructor_email === mail("t1")).length;
  const sec2Teachers = links.filter((l) => l.section_id === sec2.body.id).length;
  check("배정: 중복은 한 번만(existed), 미등록 교수자 거부", a1.body.existed === false && a2.body.existed === true && aBad.status === 400);
  check("다대다: 한 분반 여러 교수자, 한 교수자 여러 분반", t1Sections === 2 && sec2Teachers === 2);
  const un = await call("DELETE", `/sections/${sec2.body.id}/instructors/${encodeURIComponent(mail("t2"))}`, admin);
  const afterUn = await must(sb.from("section_instructors").select("instructor_email").eq("section_id", sec2.body.id));
  check("배정 해제", un.status === 200 && afterUn.length === 1);

  // ── 수강 현황 (학생이 enroll_with_code로 등록한 기록을 관리자가 조회)
  const S1 = createClient(url, anonKey, opts);
  await S1.auth.signInWithPassword({ email: mail("s1"), password });
  const enr = await S1.rpc("enroll_with_code", { p_code: sec1.body.code, p_confirm: true });
  if (enr.error) throw new Error(`enroll: ${enr.error.message}`);
  const enrollAll = await call<Enrollment[]>("GET", "/enrollments", admin);
  const enrollCourse = await call<Enrollment[]>("GET", `/enrollments?course=${courseId}`, admin);
  check(
    "관리자 수강 현황: 전체·과목별 (기존 응답 형태)",
    enrollAll.status === 200 && enrollCourse.body.length === 1 && enrollCourse.body[0].userId === s1.id && enrollCourse.body[0].name === "학생 하나" && enrollCourse.body[0].sectionId === sec1.body.id,
  );
  const students = await call<CourseStudents>("GET", `/courses/${courseId}/students`, admin);
  check("관리자 과목 수강생: Supabase 수강 기록 + 학습 기록(D4부터 Supabase)", students.status === 200 && students.body.students.length === 1 && students.body.students[0].studentId === "C3-1" && Array.isArray(students.body.progress));
  const coursesAfter = await call<CourseOverview[]>("GET", "/courses", admin);
  check("분반 수강생 수 반영", coursesAfter.body.find((c) => c.id === courseId)?.sections.find((s) => s.id === sec1.body.id)?.enrolledCount === 1);

  // ── 교수자 해제: 계정·profile은 그대로, 배정은 cascade
  const rmT2 = await call("DELETE", `/instructors/${encodeURIComponent(mail("t2"))}`, admin);
  const t2Auth = await sb.auth.admin.getUserById(t2.id);
  const t2Profile = await must(sb.from("profiles").select("id").eq("id", t2.id));
  const t2Links = await must(sb.from("section_instructors").select("section_id").eq("instructor_email", mail("t2")));
  check("교수자 해제: auth 계정·profile 유지, 분반 배정만 삭제", rmT2.status === 200 && !!t2Auth.data.user && t2Profile.length === 1 && t2Links.length === 0);

  // ── 회원 삭제: auth 사용자 삭제 → profile·수강 기록 cascade
  const delS1 = await call("DELETE", `/members/${s1.id}`, admin);
  const s1Auth = await sb.auth.admin.getUserById(s1.id);
  const s1Profile = await must(sb.from("profiles").select("id").eq("id", s1.id));
  const s1Enroll = await must(sb.from("enrollments").select("id").eq("user_id", s1.id));
  check("회원 삭제: auth 사용자 삭제, profile·수강 기록 함께 삭제", delS1.status === 200 && !s1Auth.data.user && s1Profile.length === 0 && s1Enroll.length === 0);
  createdUsers.splice(createdUsers.indexOf(s1.id), 1);
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  close();
  rmSync(dir, { recursive: true, force: true });
  for (const id of createdUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("enrollments").delete().eq("course_id", courseId);
  await sb.from("section_instructors").delete().like("instructor_email", `phasec3-${tag}-%`);
  await sb.from("sections").delete().eq("course_id", courseId);
  await sb.from("courses").delete().eq("id", courseId);
  await sb.from("instructors").delete().like("email", `phasec3-${tag}-%`);
  const left = await Promise.all([
    sb.from("courses").select("id", { count: "exact", head: true }).eq("id", courseId),
    sb.from("sections").select("id", { count: "exact", head: true }).eq("course_id", courseId),
    sb.from("instructors").select("email", { count: "exact", head: true }).like("email", `phasec3-${tag}-%`),
  ]);
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftUsers = users.users.filter((u) => (u.email ?? "").startsWith(`phasec3-${tag}-`)).length;
  console.log(`정리: 남은 테스트 과목 ${left[0].count}, 분반 ${left[1].count}, 교수자 ${left[2].count}, 계정 ${leftUsers}`);
  check("실제 데이터(과목·분반·배정·수강·교수자·profile)는 검사 전후 그대로", (await snapshot()) === before);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

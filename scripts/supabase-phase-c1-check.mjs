// Supabase dev 프로젝트에서 Phase C1(과목·분반·배정·수강 등록·RLS)을 실제로 확인한다.
//   npm run supabase:check-c1   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// 테스트용 계정(example.test)·과목·분반을 만들었다가 끝나면 모두 지운다. 실제 과목·분반·계정은 건드리지 않는다.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error(".env.local에 VITE_SUPABASE_URL(또는 SUPABASE_URL), VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY가 필요해요.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const tag = randomBytes(3).toString("hex");
const mail = (who) => `phasec-${tag}-${who}@example.test`;
const course = (k) => `phasec-${tag}-${k}`;
const password = randomBytes(18).toString("base64url");
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = (n = 6) => Array.from(randomBytes(n), (b) => ALPHA[b % 32]).join("");
const createdUsers = [];
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const must = async (p) => {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

const createUser = async (who) => {
  const { data, error } = await admin.auth.admin.createUser({
    email: mail(who),
    password,
    email_confirm: true,
    user_metadata: { full_name: `C1 ${who}` },
  });
  if (error) throw new Error(`createUser ${who}: ${error.message}`);
  createdUsers.push(data.user.id);
  return data.user;
};
const signIn = async (who) => {
  const c = createClient(url, anonKey, opts);
  const { error } = await c.auth.signInWithPassword({ email: mail(who), password });
  if (error) throw new Error(`signIn ${who}: ${error.message}`);
  return c;
};
const approve = (id, status = "approved") =>
  must(admin.from("profiles").update({ status, profile_completed: true, name: `학생 ${id.slice(0, 4)}`, student_id: "2026" }).eq("id", id));

// 실제 데이터(검사용이 아닌 과목·분반·배정·수강·교수자)가 검사 전후로 그대로인지 확인한다.
const realSnapshot = async () => {
  const notTest = (rows, key) => rows.filter((r) => !String(r[key]).includes(`phasec-${tag}-`));
  const [c, s, si, e, i] = await Promise.all([
    must(admin.from("courses").select("id,status,legacy_code,updated_at")),
    must(admin.from("sections").select("id,course_id,code,status,updated_at")),
    must(admin.from("section_instructors").select("section_id,instructor_email")),
    must(admin.from("enrollments").select("id,section_id")),
    must(admin.from("instructors").select("email,user_id")),
  ]);
  return JSON.stringify([notTest(c, "id"), notTest(s, "id"), notTest(si, "instructor_email"), notTest(e, "section_id"), notTest(i, "email")]);
};
const before = await realSnapshot();

let sections = {};
try {
  // ── 준비: 과목 A·B(운영), L(이전 과목 코드만 있음), 교수자 2명, 학생 4명
  const legacyCode = randomCode(8);
  // 여러 행을 한 번에 넣을 때 빠진 칸은 null이 되므로 모든 행에 같은 칸을 준다.
  await must(
    admin.from("courses").insert([
      { id: course("a"), title: "테스트 과목 A", drama: "드라마 A", status: "active", legacy_code: null },
      { id: course("b"), title: "테스트 과목 B", drama: "드라마 B", status: "active", legacy_code: null },
      { id: course("l"), title: "테스트 이전 과목", drama: "", status: "legacy", legacy_code: legacyCode },
    ]),
  );
  await must(admin.from("instructors").insert([{ email: mail("t1") }, { email: mail("t2") }]));
  const s1 = await createUser("s1");
  const s2 = await createUser("s2");
  const s3 = await createUser("s3");
  const sp = await createUser("pending");
  const t1 = await createUser("t1");
  await createUser("t2");
  for (const u of [s1, s2, s3]) await approve(u.id);
  await approve(sp.id, "pending");

  // ── 관리자 함수(service-role)
  const a1 = await must(admin.rpc("admin_create_section", { p_course_id: course("a"), p_instructor_emails: [mail("t1"), mail("t2")], p_assigned_by: "check-c1" }));
  const a2 = await must(admin.rpc("admin_create_section", { p_course_id: course("a"), p_instructor_emails: [mail("t2")] }));
  const a3 = await must(admin.rpc("admin_create_section", { p_course_id: course("a"), p_name: "테스트 03분반" }));
  const b1 = await must(admin.rpc("admin_create_section", { p_course_id: course("b"), p_instructor_emails: [mail("t1")] }));
  sections = { a1, a2, a3, b1 };
  check("admin_create_section: 이름·id·강의코드 생성", a1.name === "01분반" && a2.name === "02분반" && a1.id === `section-${course("a")}-01` && /^[A-Z2-9]{6}$/.test(a1.code) && new Set([a1.code, a2.code, a3.code, b1.code]).size === 4);
  const dupName = await admin.rpc("admin_create_section", { p_course_id: course("a"), p_name: "01분반" });
  check("admin_create_section: 같은 과목 운영 중 분반 이름 중복 거부", !!dupName.error);
  const legacySection = await admin.rpc("admin_create_section", { p_course_id: course("l") });
  check("admin_create_section: 이전 과목에는 분반 개설 거부", !!legacySection.error);
  const badTeacher = await admin.rpc("admin_create_section", { p_course_id: course("b"), p_instructor_emails: [mail("nobody")] });
  check("admin_create_section: 등록되지 않은 교수자 배정 거부", !!badTeacher.error);

  const anon = createClient(url, anonKey, opts);
  const S1 = await signIn("s1");
  const S2 = await signIn("s2");
  const S3 = await signIn("s3");
  const SP = await signIn("pending");
  const T1 = await signIn("t1");
  const T2 = await signIn("t2");
  for (const c of [S1, S2, S3, SP, T1, T2]) await must(c.rpc("sync_my_account"));

  // ── anon
  let anonBlocked = true;
  for (const t of ["courses", "sections", "section_instructors", "enrollments"]) {
    const r = await anon.from(t).select(t === "sections" ? "id" : "*").limit(1);
    if (!r.error && r.data?.length) anonBlocked = false;
  }
  check("anon: 4개 테이블 접근 불가", anonBlocked);
  const anonEnroll = await anon.rpc("enroll_with_code", { p_code: a1.code });
  check("anon: enroll_with_code 실행 불가", !!anonEnroll.error);

  // ── 승인 여부
  const pend = await SP.rpc("enroll_with_code", { p_code: a1.code });
  check("pending 학생: 코드 미리보기·등록 거부", !!pend.error && /승인/.test(pend.error.message));
  const preview = await S1.rpc("enroll_with_code", { p_code: ` ${a1.code.toLowerCase()} ` });
  check("approved 학생: 미리보기 (대소문자·공백 무시, 등록 안 함)", !preview.error && preview.data?.section?.id === a1.id && preview.data?.enrolled === false && !JSON.stringify(preview.data).includes(a1.code));
  const noRows = await must(admin.from("enrollments").select("id").eq("user_id", s1.id));
  check("미리보기만으로는 수강 기록이 생기지 않음", noRows.length === 0);

  // ── 등록·재등록·중복
  const e1 = await S1.rpc("enroll_with_code", { p_code: a1.code, p_confirm: true });
  check("approved 학생: 등록", !e1.error && e1.data?.enrolled === true && e1.data?.alreadyEnrolled === false);
  const e1b = await S1.rpc("enroll_with_code", { p_code: a1.code, p_confirm: true });
  check("같은 분반 재등록: 기존 등록 그대로 (idempotent)", !e1b.error && e1b.data?.alreadyEnrolled === true && e1b.data?.enrollment?.id === e1.data?.enrollment?.id);
  const dupCourse = await S1.rpc("enroll_with_code", { p_code: a2.code, p_confirm: true });
  check("같은 과목의 다른 운영 중 분반 등록 거부", !!dupCourse.error && /다른 분반/.test(dupCourse.error.message));
  const otherCourse = await S1.rpc("enroll_with_code", { p_code: b1.code, p_confirm: true });
  check("다른 과목은 등록 가능", !otherCourse.error && otherCourse.data?.enrolled === true);

  // ── 동시 요청
  const race = await Promise.all([
    S2.rpc("enroll_with_code", { p_code: a1.code, p_confirm: true }),
    S2.rpc("enroll_with_code", { p_code: a2.code, p_confirm: true }),
    S2.rpc("enroll_with_code", { p_code: a1.code, p_confirm: true }),
    S2.rpc("enroll_with_code", { p_code: a2.code, p_confirm: true }),
  ]);
  const s2CourseA = await must(admin.from("enrollments").select("section_id").eq("user_id", s2.id).eq("course_id", course("a")));
  check("동시 요청: 같은 과목 수강은 1건만 생성", s2CourseA.length === 1 && race.some((r) => !r.error), `성공 ${race.filter((r) => !r.error).length}/4`);
  const raceSame = await Promise.all([1, 2, 3].map(() => S2.rpc("enroll_with_code", { p_code: b1.code, p_confirm: true })));
  const s2CourseB = await must(admin.from("enrollments").select("id").eq("user_id", s2.id).eq("course_id", course("b")));
  check("동시 요청: 같은 분반 반복 등록도 1건", s2CourseB.length === 1 && raceSame.every((r) => !r.error));

  // ── 교수자 등록 거부
  const tEnroll = await T1.rpc("enroll_with_code", { p_code: b1.code, p_confirm: true });
  check("교수자 계정: 수강 등록 거부", !!tEnroll.error && /교수자/.test(tEnroll.error.message));

  // ── 잘못된 코드·비활성·이전 과목 코드
  await S3.rpc("enroll_with_code", { p_code: a3.code, p_confirm: true }).then((r) => {
    if (r.error) throw new Error(`s3 enroll a3: ${r.error.message}`);
  });
  await must(admin.rpc("admin_update_section", { p_section_id: a3.id, p_status: "inactive" }));
  const bad = await S1.rpc("enroll_with_code", { p_code: "ZZZZZZ" });
  const inactive = await S1.rpc("enroll_with_code", { p_code: a3.code });
  const legacy = await S1.rpc("enroll_with_code", { p_code: legacyCode });
  check(
    "없는 코드·비활성 분반·이전 과목 코드: 같은 문구로 거부",
    !!bad.error && !!inactive.error && !!legacy.error && bad.error.message === inactive.error.message && inactive.error.message === legacy.error.message,
  );
  const s3Rows = await S3.from("enrollments").select("section_id");
  check("비활성 분반의 기존 수강 기록 보존", !s3Rows.error && s3Rows.data?.some((r) => r.section_id === a3.id));

  // ── 재활성화 중복 거부
  const s3a1 = await S3.rpc("enroll_with_code", { p_code: a1.code, p_confirm: true });
  check("비활성 분반 수강생은 같은 과목의 운영 중 분반에 새로 등록 가능", !s3a1.error && s3a1.data?.enrolled === true);
  const react = await admin.rpc("admin_update_section", { p_section_id: a3.id, p_status: "active" });
  const a3now = await must(admin.from("sections").select("status").eq("id", a3.id).single());
  check("재활성화 시 같은 과목 중복 수강이 생기면 거부 (상태 유지)", !!react.error && a3now.status === "inactive", react.error?.message ?? "");
  const rename = await admin.rpc("admin_update_section", { p_section_id: a3.id, p_name: "테스트 03분반(이전)" });
  check("admin_update_section: 비활성 분반 이름 변경", !rename.error && rename.data?.name === "테스트 03분반(이전)");

  // ── 학생 조회 범위
  const myEnroll = await S1.from("enrollments").select("user_id,section_id");
  check("학생: 본인 수강 기록만 조회", !myEnroll.error && myEnroll.data?.length === 2 && myEnroll.data.every((r) => r.user_id === s1.id));
  const mySections = await S1.from("sections").select("id,name,status");
  check("학생: 수강 중인 분반만 조회", !mySections.error && mySections.data?.map((r) => r.id).sort().join() === [a1.id, b1.id].sort().join());
  const codeCol = await S1.from("sections").select("code");
  check("학생: 분반 강의코드 칸 조회 불가", !!codeCol.error);
  const mySecFn = await S1.rpc("my_sections");
  check("학생: my_sections()로도 강의코드 받지 못함", !mySecFn.error && mySecFn.data?.length === 0);
  const myCourses = await S1.from("courses").select("id");
  check("학생: 수강 중인 운영 과목만 조회 (이전 과목 제외)", !myCourses.error && myCourses.data?.map((r) => r.id).sort().join() === [course("a"), course("b")].sort().join());
  const s1Teachers = await S1.rpc("section_teacher_names", { p_section_id: a1.id });
  check("학생: 수강 분반 교강사 이름 (이메일 없음)", !s1Teachers.error && s1Teachers.data?.length === 2 && s1Teachers.data.every((r) => r.email === null));
  const s1Other = await S1.rpc("section_teacher_names", { p_section_id: a2.id });
  check("학생: 수강하지 않는 분반 교강사 정보 없음", !s1Other.error && s1Other.data?.length === 0);
  const s1Students = await S1.rpc("section_students", { p_section_id: a1.id });
  check("학생: 분반 수강생 목록 조회 불가", !!s1Students.error);
  const pendingCourses = await SP.from("courses").select("id");
  check("pending 학생: 과목 조회 없음", !pendingCourses.error && pendingCourses.data?.length === 0);

  // ── 교수자 조회 범위 (다대다)
  const t1Sections = await T1.rpc("my_sections");
  check("교수자: 담당 분반과 강의코드 (여러 과목)", !t1Sections.error && t1Sections.data?.map((r) => r.id).sort().join() === [a1.id, b1.id].sort().join() && t1Sections.data.every((r) => /^[A-Z2-9]{6}$/.test(r.code)));
  const t2Sections = await T2.from("sections").select("id");
  check("공동 교수자: 한 분반에 여러 교수자, 다른 담당 분반 포함", !t2Sections.error && t2Sections.data?.map((r) => r.id).sort().join() === [a1.id, a2.id].sort().join());
  const t1Enroll = await T1.from("enrollments").select("section_id,user_id");
  check("교수자: 담당 분반 수강 기록만 조회", !t1Enroll.error && t1Enroll.data?.length > 0 && t1Enroll.data.every((r) => [a1.id, b1.id].includes(r.section_id)));
  const t1Students = await T1.rpc("section_students", { p_section_id: a1.id });
  check("교수자: 담당 분반 수강생 (필요한 칸만)", !t1Students.error && t1Students.data?.some((r) => r.user_id === s1.id) && t1Students.data.every((r) => Object.keys(r).sort().join() === "contact_email,joined_at,name,student_id,user_id"));
  const t1Other = await T1.rpc("section_students", { p_section_id: a2.id });
  check("교수자: 담당하지 않는 분반 수강생 조회 거부", !!t1Other.error);
  const t1Teachers = await T1.rpc("section_teacher_names", { p_section_id: a1.id });
  check("교수자: 담당 분반 공동 교수자 이메일 확인", !t1Teachers.error && t1Teachers.data?.length === 2 && t1Teachers.data.every((r) => !!r.email));
  const t1Links = await T1.from("section_instructors").select("section_id");
  check("교수자: 본인 배정 행만 조회", !t1Links.error && t1Links.data?.length === 2);
  const canManage = await T1.rpc("can_manage_course", { p_course_id: course("a") });
  const cannot = await T1.rpc("can_manage_course", { p_course_id: course("l") });
  check("can_manage_course: 담당 운영 분반이 있는 과목만", canManage.data === true && cannot.data === false);

  // ── 관리자 함수 노출
  const sAdmin = await S1.rpc("admin_create_section", { p_course_id: course("a") });
  const tAdmin = await T1.rpc("admin_update_section", { p_section_id: a1.id, p_status: "inactive" });
  const aAdmin = await anon.rpc("admin_create_section", { p_course_id: course("a") });
  check("관리자 함수: 학생·교수자·anon 실행 불가", !!sAdmin.error && !!tAdmin.error && !!aAdmin.error);
  const sInsert = await S1.from("enrollments").insert({ user_id: s1.id, section_id: a2.id, course_id: course("a"), course_code: a2.code });
  check("학생: enrollments 직접 추가 불가", !!sInsert.error);
  const sUpdate = await S1.from("sections").update({ status: "inactive" }).eq("id", a1.id).select("id");
  check("학생: 분반 수정 불가", !!sUpdate.error || sUpdate.data?.length === 0);
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  const ids = [course("a"), course("b"), course("l")];
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id); // profiles·enrollments cascade
  await admin.from("enrollments").delete().in("course_id", ids);
  await admin.from("section_instructors").delete().like("instructor_email", `phasec-${tag}-%`);
  await admin.from("sections").delete().in("course_id", ids);
  await admin.from("courses").delete().in("id", ids);
  await admin.from("instructors").delete().like("email", `phasec-${tag}-%`);
  const left = await Promise.all([
    admin.from("courses").select("id", { count: "exact", head: true }).in("id", ids),
    admin.from("sections").select("id", { count: "exact", head: true }).in("course_id", ids),
    admin.from("instructors").select("email", { count: "exact", head: true }).like("email", `phasec-${tag}-%`),
  ]);
  console.log(`정리: 테스트 계정 ${createdUsers.length}개, 과목·분반·배정·수강 삭제 (남은 과목 ${left[0].count}, 분반 ${left[1].count}, 교수자 ${left[2].count})`);
  check("실제 데이터(과목·분반·배정·수강·교수자)는 검사 전후 그대로", (await realSnapshot()) === before);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

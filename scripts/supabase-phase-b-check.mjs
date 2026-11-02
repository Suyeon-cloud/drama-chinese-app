// Supabase dev 프로젝트에서 Phase B(profiles·instructors·RLS)를 실제로 확인한다.
//   npm run supabase:check-b   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// 테스트용 계정(example.test 이메일)을 만들었다가 끝나면 지운다. production 프로젝트에서는 실행하지 않는다.
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
const tag = randomBytes(4).toString("hex");
const mail = (who) => `phaseb-${tag}-${who}@example.test`;
const password = randomBytes(18).toString("base64url");
const created = [];
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const createUser = async (who) => {
  const { data, error } = await admin.auth.admin.createUser({
    email: mail(who),
    password,
    email_confirm: true,
    user_metadata: { full_name: `테스트 ${who}`, avatar_url: "https://example.test/a.png" },
  });
  if (error) throw new Error(`createUser ${who}: ${error.message}`);
  created.push(data.user.id);
  return data.user;
};
const signIn = async (who) => {
  const c = createClient(url, anonKey, opts);
  const { error } = await c.auth.signInWithPassword({ email: mail(who), password });
  if (error) throw new Error(`signIn ${who}: ${error.message}`);
  return c;
};

try {
  // 교수자 A는 계정보다 먼저 등록, 교수자 B는 계정이 생긴 뒤 등록
  await admin.from("instructors").insert({ email: mail("teacher-a"), added_by: "phase-b-check" }).throwOnError();
  const student = await createUser("student");
  const other = await createUser("other");
  const teacherA = await createUser("teacher-a");
  const teacherB = await createUser("teacher-b");
  await admin.from("instructors").insert({ email: mail("teacher-b"), added_by: "phase-b-check" }).throwOnError();

  // Schema · trigger
  const { data: profs } = await admin.from("profiles").select("id,name,picture,status,profile_completed").in("id", created);
  check("auth 사용자마다 profiles 자동 생성", profs?.length === 4);
  const sp = profs?.find((p) => p.id === student.id);
  check("새 profile 기본값 (pending, 미완성, Google 이름·https 사진)", sp?.status === "pending" && sp?.profile_completed === false && sp?.name === "테스트 student" && !!sp?.picture);
  const { data: ins } = await admin.from("instructors").select("email,user_id").in("email", [mail("teacher-a"), mail("teacher-b")]);
  check("먼저 등록된 교수자: 첫 로그인(계정 생성) 때 연결", ins?.find((i) => i.email === mail("teacher-a"))?.user_id === teacherA.id);
  check("나중에 등록된 교수자: 등록 즉시 기존 계정과 연결", ins?.find((i) => i.email === mail("teacher-b"))?.user_id === teacherB.id);

  // Student
  const s = await signIn("student");
  const sync = await s.rpc("sync_my_account");
  check("학생 sync_my_account: 교수자 아님", !sync.error && sync.data?.is_instructor === false && sync.data?.status === "pending");
  const own = await s.from("profiles").select("id,status");
  check("학생: 본인 profile만 조회", !own.error && own.data?.length === 1 && own.data[0].id === student.id);
  const upd = await s.from("profiles").update({ university: "테스트대학" }).eq("id", student.id).select("university");
  check("학생: 허용 칸 수정 가능", !upd.error && upd.data?.[0]?.university === "테스트대학");
  for (const [col, val] of [["status", "approved"], ["approved_at", new Date().toISOString()], ["profile_completed", true]]) {
    const r = await s.from("profiles").update({ [col]: val }).eq("id", student.id);
    check(`학생: ${col} 직접 변경 불가`, !!r.error, r.error?.code ?? "변경됨");
  }
  const otherUpd = await s.from("profiles").update({ name: "x" }).eq("id", other.id).select("id");
  check("학생: 다른 사람 profile 수정 불가", !otherUpd.error && otherUpd.data?.length === 0);
  const done = await s.rpc("complete_my_profile", {
    p_name: "학생", p_university: "대학", p_department: "학과", p_grade: "1", p_student_id: "2026", p_contact_email: mail("student"), p_phone: "010",
  });
  check("학생: complete_my_profile로 입력 완료 (status는 그대로)", !done.error && done.data?.profile_completed === true && done.data?.status === "pending");
  const bad = await s.rpc("complete_my_profile", {
    p_name: "", p_university: "대학", p_department: "학과", p_grade: "1", p_student_id: "2026", p_contact_email: "x", p_phone: "010",
  });
  check("학생: 빈 칸·잘못된 이메일은 거부", !!bad.error);
  const insList = await s.from("instructors").select("email");
  check("학생: instructors 목록 조회 불가", !insList.error && insList.data?.length === 0);
  const isI = await s.rpc("is_instructor");
  check("학생: is_instructor() = false", isI.data === false);
  for (const fn of ["link_instructor_account", "ensure_profile"]) {
    const r = await s.rpc(fn, { p_user_id: student.id });
    check(`학생: 내부 함수 ${fn} 호출 불가`, !!r.error, r.error?.code ?? "호출됨");
  }

  // Instructor
  const t = await signIn("teacher-a");
  const tSync = await t.rpc("sync_my_account");
  check("교강사: 학생 승인과 무관하게 교수자", tSync.data?.is_instructor === true && tSync.data?.status === "pending");
  const tList = await t.from("instructors").select("email");
  check("교강사: 본인 instructors 행만 조회", tList.data?.length === 1 && tList.data[0].email === mail("teacher-a"));
  const steal = await t.from("instructors").update({ user_id: teacherA.id }).eq("email", mail("teacher-b")).select("email");
  check("교강사: 다른 교수자 행 탈취 불가", !!steal.error || steal.data?.length === 0);
  const o = await signIn("other");
  const oSync = await o.rpc("sync_my_account");
  check("등록되지 않은 이메일: 교수자 아님", oSync.data?.is_instructor === false);
  const selfAdd = await o.from("instructors").insert({ email: mail("other") });
  check("로그인 사용자가 스스로 교수자 등록 불가", !!selfAdd.error);

  // anon
  const anon = createClient(url, anonKey, opts);
  const ap = await anon.from("profiles").select("id");
  check("anon: profiles 접근 불가", !!ap.error || ap.data?.length === 0);
  const ai = await anon.from("instructors").select("email");
  check("anon: instructors 접근 불가", !!ai.error || ai.data?.length === 0);
  const as = await anon.rpc("sync_my_account");
  check("anon: sync_my_account 호출 불가", !!as.error);
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  await admin.from("instructors").delete().like("email", `phaseb-${tag}-%`);
  for (const id of created) await admin.auth.admin.deleteUser(id);
  console.log(`정리: 테스트 계정 ${created.length}개와 교수자 행 삭제`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

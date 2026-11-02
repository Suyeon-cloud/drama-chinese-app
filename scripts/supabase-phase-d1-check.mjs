// Supabase dev 프로젝트에서 Phase D1(학습자료·회화 연습 schema, RLS, 저장 RPC)을 확인한다.
//   npm run supabase:check-d1   (.env.local의 Supabase 값 사용, 값은 출력하지 않는다)
// 테스트용 계정(example.test)·과목·분반·교수자·학습자료를 만들었다가 모두 지운다.
// 실제 과목·분반·배정·수강·교수자·profile과 실제 학습자료·회화(D2에서 옮긴 61개 등)는 검사 전후 그대로인지 확인한다.
// 테스트 행은 모두 이번 검사 태그(phased1-…)가 붙은 id·과목이며, 정리도 그 행만 지운다.
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";

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
const PREFIX = `phased1-${tag}-`;
const mail = (who) => `${PREFIX}${who}@example.test`;
const courseA = `${PREFIX}a`;
const courseB = `${PREFIX}b`;
const courseL = `${PREFIX}legacy`;
const courses = [courseA, courseB, courseL];
const password = randomBytes(18).toString("base64url");
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
const errCode = (r) => r.error?.code ?? null;

/** 실제 데이터 스냅샷 (이번 검사 태그가 붙은 행·계정은 제외) */
const snapshot = async () => {
  const mine = (v) => String(v).includes(PREFIX);
  const [c, s, si, e, i, p] = await Promise.all([
    must(sb.from("courses").select("*").order("id")),
    must(sb.from("sections").select("*").order("id")),
    must(sb.from("section_instructors").select("*").order("section_id")),
    must(sb.from("enrollments").select("*").order("id")),
    must(sb.from("instructors").select("*").order("email")),
    must(sb.from("profiles").select("id,status,approved_at,profile_completed,name").order("id")),
  ]);
  return JSON.stringify([
    c.filter((r) => !mine(r.id)),
    s.filter((r) => !mine(r.course_id)),
    si.filter((r) => !mine(r.instructor_email)),
    e.filter((r) => !mine(r.course_id)),
    i.filter((r) => !mine(r.email)),
    p.filter((r) => !createdUsers.includes(r.id)),
  ]);
};
/** 실제 학습자료·회화 전체 행 스냅샷 (version·updated_at 포함, 이번 검사 태그 행 제외) */
const lessonSnapshot = async () => {
  const notMine = (v) => !String(v).startsWith(PREFIX);
  const [l, d, r, x] = await Promise.all([
    must(sb.from("lessons").select("*").order("id")),
    must(sb.from("lesson_dialogues").select("*").order("id")),
    must(sb.from("dialogue_roles").select("*").order("dialogue_id").order("id")),
    must(sb.from("dialogue_lines").select("*").order("dialogue_id").order("id")),
  ]);
  const rows = [l.filter((y) => notMine(y.id)), d.filter((y) => notMine(y.id)), r.filter((y) => notMine(y.dialogue_id)), x.filter((y) => notMine(y.dialogue_id))];
  return { json: JSON.stringify(rows), counts: rows.map((t) => t.length).join("/") };
};

const createUser = async (who, name) => {
  const { data, error } = await sb.auth.admin.createUser({ email: mail(who), password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new Error(`createUser ${who}: ${error.message}`);
  createdUsers.push(data.user.id);
  return data.user;
};
const signIn = async (who) => {
  const client = createClient(url, anonKey, opts);
  const { error } = await client.auth.signInWithPassword({ email: mail(who), password });
  if (error) throw new Error(`signIn ${who}: ${error.message}`);
  return client;
};

const NOW = "2026-10-29T10:32:31.297Z";
/** 기존 Lesson 형식 (db.json과 같은 칸) */
const lesson = (id, courseId, week, status, extra = {}) => ({
  id,
  courseId,
  week,
  title: `D1 ${id.slice(PREFIX.length)}`,
  description: "설명",
  direction: "zh-ko",
  level: "hsk3",
  status,
  video: { youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk", youtubeId: "abcdefghijk", startTime: 12.5, endTime: 98.25 },
  source: { dramaTitle: "드라마", episode: "1화", videoTitle: "원본 제목" },
  script: {
    source: "srt",
    cues: [
      { id: "cue-1", start: 12.5, end: 14.75, zh: "你好", ko: "안녕", pinyin: "nǐ hǎo" },
      { start: 15, end: 16.5, zh: "谢谢" },
    ],
    updatedAt: NOW,
    origin: { zh: { provider: "srt", fileName: null, fetchedAt: NOW } },
  },
  draft: { expressions: [{ id: "e1", source: "你好", note: "인사", at: null }], grammar: [], lenses: [], quiz: [{ id: "q1", question: "?", options: ["a", "b"], answer: 1, explanation: "" }], createdAt: NOW, updatedAt: NOW },
  captionMask: { enabled: true, top: 80, height: 12, width: 90 },
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});
/** 회화 연습: 역할 순서(r2가 먼저), 역할 미지정 대사(''), 자막에 없는 cue_id, 병음 없는 대사 포함 */
const dialogue = (id, status) => ({
  id,
  title: "카페에서",
  situation: "주문하는 상황",
  roles: [
    { id: `${id}-r2`, name: "점원" },
    { id: `${id}-r1`, name: "손님" },
  ],
  lines: [
    { id: `${id}-l3`, roleId: `${id}-r1`, cueId: "cue-1", zh: "你好", pinyin: "nǐ hǎo", ko: "안녕", start: 12.5, end: 14.75 },
    { id: `${id}-l1`, roleId: `${id}-r2`, cueId: "cue-missing", zh: "欢迎", ko: "어서 오세요", start: 15, end: 16.5 },
    { id: `${id}-l2`, roleId: "", zh: "谢谢", start: 17.125, end: 18 },
  ],
  status,
});

/** 테이블 행 → 기존 LessonDialogue 형식 (D3 변환과 같은 규칙: null 칸은 필드 없음) */
const readDialogues = async (client, lessonId) => {
  const ds = await must(client.from("lesson_dialogues").select("*").eq("lesson_id", lessonId).order("position"));
  const out = [];
  for (const d of ds) {
    const roles = await must(client.from("dialogue_roles").select("*").eq("dialogue_id", d.id).order("position"));
    const lines = await must(client.from("dialogue_lines").select("*").eq("dialogue_id", d.id).order("position"));
    out.push({
      id: d.id,
      title: d.title,
      situation: d.situation,
      roles: roles.map((r) => ({ id: r.id, name: r.name })),
      lines: lines.map((l) => ({
        id: l.id,
        roleId: l.role_id,
        ...(l.cue_id === null ? {} : { cueId: l.cue_id }),
        zh: l.zh,
        ...(l.pinyin === null ? {} : { pinyin: l.pinyin }),
        ...(l.ko === null ? {} : { ko: l.ko }),
        start: l.start_time,
        end: l.end_time,
      })),
      status: d.status,
    });
  }
  return out;
};
const ids = (rows) => rows.map((r) => r.id).sort().join();

const before = await snapshot();
const lessonsBefore = await lessonSnapshot();
console.log(`실제 학습자료·회화·역할·대사 행: ${lessonsBefore.counts} (검사 대상 아님, 전후 비교만)`);
try {
  // ── 준비: 과목 A·B(운영), L(이전 자료), 교수자 2명(1명만 A 배정), 학생 3명
  await must(sb.from("courses").insert([
    { id: courseA, title: "D1 A", drama: "D1", status: "active", legacy_code: null },
    { id: courseB, title: "D1 B", drama: "D1", status: "active", legacy_code: null },
    { id: courseL, title: "D1 legacy", drama: "D1", status: "legacy", legacy_code: null },
  ]));
  await must(sb.from("instructors").insert([{ email: mail("t-assigned") }, { email: mail("t-none") }]));
  const tA = await createUser("t-assigned", "배정 교수");
  await createUser("t-none", "미배정 교수");
  const s1 = await createUser("s-one", "학생 하나");
  const s2 = await createUser("s-two", "학생 둘");
  const sP = await createUser("s-pending", "대기 학생");
  for (const u of [s1, s2, sP]) await must(sb.from("profiles").update({ profile_completed: true, name: u.user_metadata.full_name }).eq("id", u.id));
  for (const u of [s1, s2]) await must(sb.from("profiles").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", u.id));
  const secA = await must(sb.rpc("admin_create_section", { p_course_id: courseA, p_instructor_emails: [mail("t-assigned")] }));
  const secB = await must(sb.rpc("admin_create_section", { p_course_id: courseB }));
  const S1 = await signIn("s-one");
  const S2 = await signIn("s-two");
  const SP = await signIn("s-pending");
  const TA = await signIn("t-assigned");
  const TN = await signIn("t-none");
  await must(S1.rpc("enroll_with_code", { p_code: secA.code, p_confirm: true }));
  await must(S2.rpc("enroll_with_code", { p_code: secB.code, p_confirm: true }));

  // ── 관리자(service-role) 저장
  const idA1 = `${PREFIX}a-w1`;
  const idA2 = `${PREFIX}a-w2`;
  const idB1 = `${PREFIX}b-w1`;
  const idL1 = `${PREFIX}legacy-w1`;
  const idL1b = `${PREFIX}legacy-w1-dup`;
  const dPub = dialogue(`${PREFIX}dlg-pub`, "published");
  const dDraft = dialogue(`${PREFIX}dlg-draft`, "draft");
  const a1 = await sb.rpc("admin_save_lesson", { p_lesson: lesson(idA1, courseA, 1, "published", { dialogues: [dPub, dDraft] }), p_admin_label: "D1 관리자" });
  check(
    "관리자 저장: 새 학습자료 version 1, created, 관리자 표시",
    !a1.error && a1.data.version === 1 && a1.data.created === true && a1.data.updatedByLabel === "D1 관리자",
    a1.error?.message,
  );
  await must(sb.rpc("admin_save_lesson", { p_lesson: lesson(idA2, courseA, 2, "draft") }));
  await must(sb.rpc("admin_save_lesson", { p_lesson: lesson(idB1, courseB, 1, "published") }));
  const l1 = await sb.rpc("admin_save_lesson", { p_lesson: lesson(idL1, courseL, 1, "published", { episodeId: "yjrzm-ep3" }) });
  const l1b = await sb.rpc("admin_save_lesson", { p_lesson: lesson(idL1b, courseL, 1, "draft") });
  const dupA = await sb.rpc("admin_save_lesson", { p_lesson: lesson(`${PREFIX}a-dup`, courseA, 1, "draft") });
  check("이전 자료 과목은 같은 주차 둘 허용(unique 없음) / 운영 과목은 관리자도 주차 중복 23505", !l1.error && !l1b.error && errCode(dupA) === "23505");
  const allRows = await must(sb.from("lessons").select("id,course_id").in("course_id", courses));
  check("service-role: 이전 자료 포함 전체 조회", allRows.length === 5);
  const rowA1 = await must(sb.from("lessons").select("*").eq("id", idA1).single());
  const src = lesson(idA1, courseA, 1, "published");
  check(
    "칸 저장: video 4칸·JSONB(script·draft·caption_mask·source)·text id·생성 시각 보존",
    rowA1.youtube_url === src.video.youtubeUrl && rowA1.start_time === 12.5 && rowA1.end_time === 98.25 &&
      isDeepStrictEqual(rowA1.script, src.script) && isDeepStrictEqual(rowA1.draft, src.draft) &&
      isDeepStrictEqual(rowA1.caption_mask, src.captionMask) && isDeepStrictEqual(rowA1.source, src.source) &&
      rowA1.content === null && rowA1.subtitle_position === null && new Date(rowA1.created_at).toISOString() === NOW,
  );
  const roundTrip = await readDialogues(sb, idA1);
  check("회화 저장: 회화·역할·대사 순서, cue_id·복사본·시간·역할 미지정('') 그대로 복원", isDeepStrictEqual(roundTrip, [dPub, dDraft]));
  const missingCue = await must(sb.from("dialogue_lines").select("cue_id").eq("id", `${dPub.id}-l1`).single());
  check("cue_id에 FK 없음: 자막에 없는 cue id도 저장", missingCue.cue_id === "cue-missing");
  const legacyMove = await sb.rpc("admin_save_lesson", { p_lesson: lesson(idL1, courseA, 3, "draft"), p_expected_version: 1 });
  check("관리자도 이전 자료 ↔ 운영 과목 이동 불가 (42501)", errCode(legacyMove) === "42501");

  // ── 관리자 전용 함수: anon·authenticated 실행 불가
  const anon = createClient(url, anonKey, opts);
  const anonAdmin = await anon.rpc("admin_save_lesson", { p_lesson: lesson(`${PREFIX}x`, courseA, 5, "draft") });
  const anonSave = await anon.rpc("save_lesson", { p_lesson: lesson(`${PREFIX}x`, courseA, 5, "draft") });
  const userAdmin = await TA.rpc("admin_save_lesson", { p_lesson: lesson(`${PREFIX}x`, courseA, 5, "draft") });
  const userInternal = await TA.rpc("_save_lesson", { p_lesson: lesson(`${PREFIX}x`, courseA, 5, "draft"), p_expected_version: null, p_actor: tA.id, p_actor_label: "x", p_is_admin: true });
  const anonRead = await anon.from("lessons").select("id");
  const xRows = await must(sb.from("lessons").select("id").eq("id", `${PREFIX}x`));
  check(
    "admin_save_lesson·_save_lesson: anon·authenticated 실행 불가, anon은 save_lesson·조회 불가",
    !!anonAdmin.error && !!anonSave.error && !!userAdmin.error && !!userInternal.error && (!!anonRead.error || anonRead.data.length === 0) && xRows.length === 0,
  );

  // ── 교수자
  const tnRead = await must(TN.from("lessons").select("id"));
  const tnSave = await TN.rpc("save_lesson", { p_lesson: lesson(idA2, courseA, 2, "draft"), p_expected_version: 1 });
  check("미배정 교수자: 학습자료 0 · 저장 42501", tnRead.length === 0 && errCode(tnSave) === "42501");
  const taRead = await must(TA.from("lessons").select("id,status"));
  const taDlg = await must(TA.from("lesson_dialogues").select("id"));
  check("배정 교수자: 담당 과목만 (draft 포함), 다른 과목·이전 자료 제외, 회화는 draft 포함", ids(taRead) === [idA1, idA2].sort().join() && ids(taDlg) === [dPub.id, dDraft.id].sort().join());
  const s1v = await TA.rpc("save_lesson", { p_lesson: lesson(idA2, courseA, 2, "draft", { title: "교수 수정" }), p_expected_version: 1 });
  const rowA2 = await must(sb.from("lessons").select("version,updated_by,updated_by_label,title").eq("id", idA2).single());
  check(
    "교수자 저장: version 1→2, updated_by=auth.uid(), 수정자 이름, 응답에 version·updatedAt·updatedByLabel",
    !s1v.error && s1v.data.version === 2 && !!s1v.data.updatedAt && s1v.data.updatedByLabel === "배정 교수" && rowA2.version === 2 && rowA2.updated_by === tA.id && rowA2.title === "교수 수정",
    s1v.error?.message,
  );
  const stale = await TA.rpc("save_lesson", { p_lesson: lesson(idA2, courseA, 2, "draft", { title: "늦은 저장" }), p_expected_version: 1 });
  const noVer = await TA.rpc("save_lesson", { p_lesson: lesson(idA2, courseA, 2, "draft", { title: "버전 없음" }) });
  let detail = null;
  try {
    detail = JSON.parse(stale.error?.details ?? "null");
  } catch {}
  const afterStale = await must(sb.from("lessons").select("version,title").eq("id", idA2).single());
  check(
    "오래된 expectedVersion·없음 → PT409, 내용 그대로, DETAIL에 currentVersion·updatedAt·updatedByLabel",
    errCode(stale) === "PT409" && errCode(noVer) === "PT409" && detail?.currentVersion === 2 && !!detail?.updatedAt && detail?.updatedByLabel === "배정 교수" && afterStale.version === 2 && afterStale.title === "교수 수정",
  );
  const otherCourse = await TA.rpc("save_lesson", { p_lesson: lesson(`${PREFIX}b-new`, courseB, 5, "draft") });
  const moveOut = await TA.rpc("save_lesson", { p_lesson: lesson(idA2, courseB, 6, "draft"), p_expected_version: 2 });
  const editOther = await TA.rpc("save_lesson", { p_lesson: lesson(idB1, courseB, 1, "published"), p_expected_version: 1 });
  const toLegacy = await TA.rpc("save_lesson", { p_lesson: lesson(`${PREFIX}l-new`, courseL, 5, "draft") });
  const editLegacy = await TA.rpc("save_lesson", { p_lesson: lesson(idL1, courseL, 1, "published"), p_expected_version: 1 });
  check(
    "교수자: 다른 과목 생성·수정·옮기기, 이전 자료 생성·수정 모두 42501",
    [otherCourse, moveOut, editOther, toLegacy, editLegacy].every((r) => errCode(r) === "42501"),
  );
  const dupNew = await TA.rpc("save_lesson", { p_lesson: lesson(`${PREFIX}a-new1`, courseA, 1, "draft") });
  const dupMove = await TA.rpc("save_lesson", { p_lesson: lesson(idA2, courseA, 1, "draft"), p_expected_version: 2 });
  const sameSlot = await TA.rpc("save_lesson", { p_lesson: lesson(idA2, courseA, 2, "draft", { title: "같은 자리" }), p_expected_version: 2 });
  const fresh = await TA.rpc("save_lesson", { p_lesson: lesson(`${PREFIX}a-w3`, courseA, 3, "draft") });
  const gone = await TA.rpc("save_lesson", { p_lesson: lesson(`${PREFIX}a-ghost`, courseA, 4, "draft"), p_expected_version: 3 });
  const outOfRange = await TA.rpc("save_lesson", { p_lesson: lesson(`${PREFIX}a-w16`, courseA, 16, "draft") });
  check(
    "주차: 같은 주차 새로 만들기·옮기기 23505, 같은 자리 다시 저장 허용, 새 주차 생성 version 1, 없는 자료 expected → P0002, 범위 밖 22023",
    errCode(dupNew) === "23505" && errCode(dupMove) === "23505" && !sameSlot.error && sameSlot.data.version === 3 &&
      !fresh.error && fresh.data.version === 1 && fresh.data.created === true && errCode(gone) === "P0002" && errCode(outOfRange) === "22023",
  );

  // 회화 교체: 회화 순서를 바꾸고, 역할 순서를 뒤집고, 대사 하나를 지운 뒤 다시 읽기
  const reordered = { ...dPub, roles: [...dPub.roles].reverse(), lines: [dPub.lines[2], dPub.lines[0]] };
  const kept = [dDraft, reordered];
  const swap = await TA.rpc("save_lesson", { p_lesson: lesson(idA1, courseA, 1, "published", { dialogues: kept }), p_expected_version: 1 });
  check("교수자 회화 교체: 바뀐 회화·역할·대사 순서와 삭제가 그대로 반영", !swap.error && isDeepStrictEqual(await readDialogues(sb, idA1), kept), swap.error?.message);

  // 원자성: 회화 저장 중 오류 → 학습자료 변경까지 되돌림
  const beforeAtomic = await must(sb.from("lessons").select("*").eq("id", idA1).single());
  const badLine = { ...reordered, lines: [...reordered.lines, { id: "bad", roleId: "", zh: "x", start: "abc", end: 1 }] };
  const atomic1 = await TA.rpc("save_lesson", { p_lesson: lesson(idA1, courseA, 1, "published", { title: "바뀌면 안 됨", dialogues: [dDraft, badLine] }), p_expected_version: 2 });
  const clash = { ...dialogue(`${PREFIX}dlg-clash`, "draft") };
  await must(sb.rpc("admin_save_lesson", { p_lesson: lesson(`${PREFIX}a-w3`, courseA, 3, "draft", { dialogues: [clash] }), p_expected_version: 1 }));
  const atomic2 = await TA.rpc("save_lesson", { p_lesson: lesson(idA1, courseA, 1, "published", { title: "바뀌면 안 됨", dialogues: [...kept, clash] }), p_expected_version: 2 });
  const afterAtomic = await must(sb.from("lessons").select("*").eq("id", idA1).single());
  const clashOwner = await must(sb.from("lesson_dialogues").select("lesson_id").eq("id", clash.id).single());
  check(
    "원자성: 대사 형식 오류(22023)·다른 자료의 회화 id 충돌(23505) → 학습자료·회화 모두 이전 그대로",
    errCode(atomic1) === "22023" && errCode(atomic2) === "23505" && isDeepStrictEqual(afterAtomic, beforeAtomic) &&
      isDeepStrictEqual(await readDialogues(sb, idA1), kept) && clashOwner.lesson_id === `${PREFIX}a-w3`,
  );
  const taIns = await TA.from("lessons").insert(lesson(`${PREFIX}direct`, courseA, 9, "draft"));
  const taUpd = await TA.from("lessons").update({ title: "직접" }).eq("id", idA2).select();
  const taDel = await TA.from("lessons").delete().eq("id", idA2).select();
  const taDlgDel = await TA.from("lesson_dialogues").delete().eq("lesson_id", idA1).select();
  const taLineUpd = await TA.from("dialogue_lines").update({ zh: "직접" }).eq("dialogue_id", dPub.id).select();
  const stillA2 = await must(sb.from("lessons").select("title").eq("id", idA2).single());
  check(
    "교수자 직접 INSERT·UPDATE·DELETE 불가 (학습자료·회화·대사, 데이터 그대로)",
    [taIns, taUpd, taDel, taDlgDel, taLineUpd].every((r) => !!r.error) && stillA2.title === "같은 자리",
  );

  // ── 학생
  const s1Read = await must(S1.from("lessons").select("id"));
  const s1Dlg = await must(S1.from("lesson_dialogues").select("id"));
  const s1Roles = await must(S1.from("dialogue_roles").select("dialogue_id"));
  const s1Lines = await must(S1.from("dialogue_lines").select("dialogue_id"));
  check("승인·수강 학생: 수강 과목 published만 (draft·다른 과목·이전 자료 제외)", ids(s1Read) === idA1);
  check(
    "학생 회화: published 회화와 그 역할·대사만 (draft 회화 제외)",
    ids(s1Dlg) === dPub.id && s1Roles.length === 2 && s1Lines.length === 2 && [...s1Roles, ...s1Lines].every((r) => r.dialogue_id === dPub.id),
  );
  const s2Read = await must(S2.from("lessons").select("id"));
  const spRead = await must(SP.from("lessons").select("id"));
  check("다른 과목 학생은 그 과목만 / 승인 대기 학생은 0", ids(s2Read) === idB1 && spRead.length === 0);
  const sIns = await S1.from("lessons").insert(lesson(`${PREFIX}student`, courseA, 10, "published"));
  const sUpd = await S1.from("lessons").update({ title: "학생" }).eq("id", idA1).select();
  const sDel = await S1.from("lessons").delete().eq("id", idA1).select();
  const sDlgIns = await S1.from("lesson_dialogues").insert({ id: `${PREFIX}sd`, lesson_id: idA1, position: 5 });
  const sSave = await S1.rpc("save_lesson", { p_lesson: lesson(idA1, courseA, 1, "published"), p_expected_version: 2 });
  check("학생 직접 쓰기·save_lesson 불가", [sIns, sUpd, sDel, sDlgIns].every((r) => !!r.error) && errCode(sSave) === "42501");
  await must(sb.rpc("admin_update_section", { p_section_id: secA.id, p_status: "inactive" }));
  const s1Inactive = await must(S1.from("lessons").select("id"));
  const taInactive = await must(TA.from("lessons").select("id"));
  check("분반 비활성 후: 기존 수강 학생은 계속 published 열람 / 교수자 편집 권한은 운영 중 분반 기준으로 해제", ids(s1Inactive) === idA1 && taInactive.length === 0);

  // ── 관리자 hard delete (service-role): 회화 cascade. 교수자는 위에서 거부됨.
  await must(sb.from("lessons").delete().eq("id", idA1));
  const leftDlg = await must(sb.from("lesson_dialogues").select("id").eq("lesson_id", idA1));
  const leftLines = await must(sb.from("dialogue_lines").select("id").eq("dialogue_id", dPub.id));
  check("관리자 hard delete: 회화·역할·대사 함께 삭제", leftDlg.length === 0 && leftLines.length === 0);
} catch (err) {
  check("검사 중 오류", false, err instanceof Error ? err.message : String(err));
} finally {
  await sb.from("lessons").delete().in("course_id", courses);
  for (const id of createdUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("enrollments").delete().in("course_id", courses);
  await sb.from("section_instructors").delete().like("instructor_email", `${PREFIX}%`);
  await sb.from("sections").delete().in("course_id", courses);
  await sb.from("courses").delete().in("id", courses);
  await sb.from("instructors").delete().like("email", `${PREFIX}%`);
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftUsers = users.users.filter((u) => (u.email ?? "").startsWith(PREFIX)).length;
  const left = await sb.from("courses").select("id", { count: "exact", head: true }).in("id", courses);
  const leftLessons = await sb.from("lessons").select("id", { count: "exact", head: true }).like("id", `${PREFIX}%`);
  const lessonsAfter = await lessonSnapshot();
  console.log(`정리: 남은 테스트 과목 ${left.count}, 계정 ${leftUsers}, 테스트 학습자료 ${leftLessons.count}`);
  check("테스트 데이터 모두 정리", left.count === 0 && leftUsers === 0 && leftLessons.count === 0);
  check(
    "실제 학습자료·회화(행 전체·version·updated_at)는 검사 전후 그대로",
    lessonsAfter.json === lessonsBefore.json,
    lessonsAfter.counts,
  );
  check("실제 데이터(과목·분반·배정·수강·교수자·profile)는 검사 전후 그대로", (await snapshot()) === before);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n결과: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);

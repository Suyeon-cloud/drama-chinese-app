// 6-B: 교수자 주도 실시간 퀴즈 세션 — 상태·전이 규칙·화면 상태 (JSON 모드 서버와 화면이 함께 쓴다. Supabase는 같은 규칙을 DB 함수로)
//
// 상태 전이: waiting|revealed --next--> open --close--> closed --reveal--> revealed / 언제든 end
// 학생 화면 상태에는 정답·해설·보기별 응답 수가 '정답 공개'(revealed)에서만 들어간다. 개별 응답은 누구에게도 보내지 않는다.

export type LivePhase = "waiting" | "open" | "closed" | "revealed";
export type LiveAction = "next" | "close" | "reveal" | "end";
export type LiveSnapshotQuestion = { id: string; question: string; options: string[]; answer: number; explanation: string };

/** JSON 모드 저장 형태 (Supabase는 세 테이블로 나눠 저장) */
export type StoredLiveSession = {
  id: string;
  courseId: string;
  sectionId: string;
  setId: string | null;
  title: string;
  questions: LiveSnapshotQuestion[];
  joinCode: string;
  status: "active" | "ended";
  currentIndex: number | null;
  phase: LivePhase;
  version: number;
  createdByLabel: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  /** userId → 참여 시각 */
  participants: Record<string, string>;
  /** `${questionIndex}:${userId}` → 고른 보기 */
  responses: Record<string, { choice: number; at: string }>;
};

export type LiveHostState = {
  id: string;
  courseId: string;
  sectionId: string;
  setId: string | null;
  title: string;
  joinCode: string;
  status: "active" | "ended";
  phase: LivePhase;
  currentIndex: number | null;
  total: number;
  version: number;
  endedAt: string | null;
  question: LiveSnapshotQuestion | null;
  participants: number;
  /** 현재 문제 보기별 응답 수 */
  counts: number[];
  /** 지금까지 낸 문제별 응답·정답 수 */
  summary: { index: number; responded: number; correct: number }[];
};
export type LiveStudentState = {
  id: string;
  title: string;
  status: "active" | "ended";
  phase: LivePhase;
  currentIndex: number | null;
  total: number;
  version: number;
  question: { question: string; options: string[] } | null;
  myChoice: number | null;
  /** 정답 공개(revealed)에서만 */
  answer: number | null;
  explanation: string | null;
  counts: number[] | null;
};
export type LiveHostSummary = { id: string; sectionId: string; title: string; joinCode: string; phase: LivePhase; currentIndex: number | null; total: number; createdAt: string };

export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const normalizeJoinCode = (raw: unknown) => (typeof raw === "string" ? raw.trim().toUpperCase() : "");
export const isJoinCode = (code: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(code);

/** 다음 상태 (할 수 없으면 오류 문구) */
export const nextLiveState = (
  s: Pick<StoredLiveSession, "status" | "phase" | "currentIndex" | "questions">,
  action: LiveAction,
): { ok: true; phase: LivePhase; currentIndex: number | null; status: "active" | "ended" } | { ok: false; error: string } => {
  if (s.status !== "active") return { ok: false, error: "이미 종료된 세션이에요." };
  const total = s.questions.length;
  if (action === "next" && (s.phase === "waiting" || s.phase === "revealed") && (s.currentIndex ?? -1) + 1 < total) {
    return { ok: true, phase: "open", currentIndex: (s.currentIndex ?? -1) + 1, status: "active" };
  }
  if (action === "close" && s.phase === "open") return { ok: true, phase: "closed", currentIndex: s.currentIndex, status: "active" };
  if (action === "reveal" && s.phase === "closed") return { ok: true, phase: "revealed", currentIndex: s.currentIndex, status: "active" };
  if (action === "end") return { ok: true, phase: s.phase, currentIndex: s.currentIndex, status: "ended" };
  return { ok: false, error: "지금 상태에서는 할 수 없는 동작이에요." };
};

const countsFor = (s: StoredLiveSession, index: number) => {
  const n = s.questions[index]?.options.length ?? 0;
  const out = Array.from({ length: n }, () => 0);
  for (const [key, r] of Object.entries(s.responses)) {
    if (key.startsWith(`${index}:`) && r.choice >= 0 && r.choice < n) out[r.choice]++;
  }
  return out;
};

export const liveHostState = (s: StoredLiveSession): LiveHostState => ({
  id: s.id,
  courseId: s.courseId,
  sectionId: s.sectionId,
  setId: s.setId,
  title: s.title,
  joinCode: s.joinCode,
  status: s.status,
  phase: s.phase,
  currentIndex: s.currentIndex,
  total: s.questions.length,
  version: s.version,
  endedAt: s.endedAt,
  question: s.currentIndex === null ? null : s.questions[s.currentIndex],
  participants: Object.keys(s.participants).length,
  counts: s.currentIndex === null ? [] : countsFor(s, s.currentIndex),
  summary: Array.from({ length: s.currentIndex === null ? 0 : s.currentIndex + 1 }, (_, index) => {
    const c = countsFor(s, index);
    return { index, responded: c.reduce((a, b) => a + b, 0), correct: c[s.questions[index].answer] ?? 0 };
  }),
});

export const liveStudentState = (s: StoredLiveSession, userId: string): LiveStudentState => {
  const q = s.currentIndex === null ? null : s.questions[s.currentIndex];
  const revealed = s.phase === "revealed" && !!q;
  return {
    id: s.id,
    title: s.title,
    status: s.status,
    phase: s.phase,
    currentIndex: s.currentIndex,
    total: s.questions.length,
    version: s.version,
    question: q ? { question: q.question, options: [...q.options] } : null,
    myChoice: s.currentIndex === null ? null : (s.responses[`${s.currentIndex}:${userId}`]?.choice ?? null),
    answer: revealed ? q!.answer : null,
    explanation: revealed ? q!.explanation : null,
    counts: revealed ? countsFor(s, s.currentIndex!) : null,
  };
};

/** 학생 참여 주소 (앱 안 주소 — 열 때 로그인·수강을 확인한다) */
export const liveJoinHash = (code: string) => `#/live?code=${encodeURIComponent(code)}`;

/* ───────── 6-C: 종료된 세션 결과 (교수자 전용) ───────── */
// JSON 모드 서버는 buildLiveResults로, Supabase는 live_session_results() DB 함수로 같은 형태를 만든다.
// 개인정보: 회원정보의 이름·학번만 넣는다. 사용자 id·이메일·전화는 넣지 않는다(행 key는 순번). 결과는 따로 저장하지 않는다.

export type LiveResultQuestion = {
  index: number;
  question: string;
  options: string[];
  answer: number;
  /** 보기별 응답 수 */
  counts: number[];
  responded: number;
  correct: number;
};
export type LiveResultStudent = {
  /** 화면용 순번 key (사용자 id 아님) */
  key: string;
  name: string;
  studentId: string;
  joinedAt: string;
  /** 문항별 고른 보기 (답하지 않았으면 null) */
  choices: (number | null)[];
  answered: number;
  correct: number;
  /** 같은 학번으로 참여한 다른 계정이 있다 */
  duplicate: boolean;
};
export type LiveResults = {
  id: string;
  courseId: string;
  sectionId: string;
  title: string;
  createdAt: string;
  endedAt: string | null;
  total: number;
  participants: number;
  questions: LiveResultQuestion[];
  students: LiveResultStudent[];
  /** 둘 이상의 계정이 쓴 학번 (정규화: 공백 제거·대문자) */
  duplicateStudentIds: string[];
};
export type LiveHistoryItem = {
  id: string;
  sectionId: string;
  title: string;
  status: "active" | "ended";
  total: number;
  participants: number;
  createdAt: string;
  endedAt: string | null;
};

/**
 * 이름·학번 비교에서 지우는 공백: DB 함수와 같은 집합. PostgreSQL의 \s는 로캘(C)에 따라 ASCII 공백만 잡을 수 있어
 * SQL은 아래 집합을 직접 쓰고(LIVE_SPACE_SQL), JS는 \s(유니코드 공백 포함)에 폭 없는 공백만 더한다.
 */
export const LIVE_SPACE_SQL = String.raw`[[:space:]\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]`;
const LIVE_SPACE_RE = /[\s\u200b\u2060\ufeff]/g;

/** 학번 비교용 정규화 (공백 제거·대문자) — DB 함수와 같은 규칙 */
export const normalizeStudentId = (v: string) => v.replace(LIVE_SPACE_RE, "").toUpperCase();

/** JSON 모드: 저장된 세션 + 회원정보(이름·학번)로 결과를 만든다. */
export const buildLiveResults = (
  s: StoredLiveSession,
  profileOf: (userId: string) => { name: string; studentId: string } | null,
): LiveResults => {
  const choiceOf = (index: number, userId: string) => s.responses[`${index}:${userId}`]?.choice ?? null;
  const questions: LiveResultQuestion[] = s.questions.map((q, index) => {
    const counts = countsFor(s, index);
    return {
      index,
      question: q.question,
      options: [...q.options],
      answer: q.answer,
      counts,
      responded: Object.keys(s.responses).filter((k) => k.startsWith(`${index}:`)).length,
      correct: Object.entries(s.responses).filter(([k, r]) => k.startsWith(`${index}:`) && r.choice === q.answer).length,
    };
  });
  const rows = Object.entries(s.participants).map(([userId, joinedAt]) => {
    const p = profileOf(userId);
    const studentId = p?.studentId ?? "";
    return { userId, joinedAt, name: p?.name ?? "", studentId, nsid: normalizeStudentId(studentId) };
  });
  const seen = new Map<string, number>();
  for (const r of rows) if (r.nsid) seen.set(r.nsid, (seen.get(r.nsid) ?? 0) + 1);
  const duplicateStudentIds = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
  // DB 함수와 같은 정렬: 정규화 학번 → 이름 → 참여 시각
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  rows.sort((a, b) => cmp(a.nsid, b.nsid) || cmp(a.name, b.name) || cmp(a.joinedAt, b.joinedAt));
  const students: LiveResultStudent[] = rows.map((r, i) => {
    const choices = s.questions.map((_, index) => choiceOf(index, r.userId));
    return {
      key: `s${i + 1}`,
      name: r.name,
      studentId: r.studentId,
      joinedAt: r.joinedAt,
      choices,
      answered: choices.filter((c) => c !== null).length,
      correct: choices.filter((c, index) => c !== null && c === s.questions[index].answer).length,
      duplicate: !!r.nsid && duplicateStudentIds.includes(r.nsid),
    };
  });
  return {
    id: s.id,
    courseId: s.courseId,
    sectionId: s.sectionId,
    title: s.title,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    total: s.questions.length,
    participants: students.length,
    questions,
    students,
    duplicateStudentIds,
  };
};

/** 화면 표시용 학번 가림: 앞 4자리·끝 2자리만 (짧으면 모두 가림) */
export const maskStudentId = (id: string) => {
  const v = id.trim();
  if (!v) return "";
  if (v.length <= 6) return "*".repeat(v.length);
  return `${v.slice(0, 4)}${"*".repeat(v.length - 6)}${v.slice(-2)}`;
};

/** 결과 CSV (Excel에서 한글이 깨지지 않게 BOM). 셀이 =,+,-,@로 시작하면 수식으로 실행되지 않게 ' 를 붙인다. */
export const liveResultsCsv = (r: LiveResults): string => {
  const cell = (v: string | number) => {
    let t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["이름", "학번", "중복 학번", "응답 수", "정답 수", "총 문항", "점수(%)", ...r.questions.map((q) => `${q.index + 1}번`)];
  const lines = r.students.map((st) => [
    st.name,
    st.studentId,
    st.duplicate ? "예" : "",
    st.answered,
    st.correct,
    r.total,
    r.total ? Math.round((st.correct / r.total) * 100) : 0,
    ...st.choices.map((c, i) => (c === null ? "" : `${c + 1}${c === r.questions[i].answer ? " (O)" : " (X)"}`)),
  ]);
  const summary = [
    [],
    ["문항", "응답 수", "정답 수", "정답률(%)", ...Array.from({ length: Math.max(0, ...r.questions.map((q) => q.options.length)) }, (_, i) => `보기 ${i + 1}`)],
    ...r.questions.map((q) => [`${q.index + 1}번`, q.responded, q.correct, q.responded ? Math.round((q.correct / q.responded) * 100) : 0, ...q.counts]),
  ];
  return "\uFEFF" + [head, ...lines, ...summary].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
};

/* ───────── 6-C 2단계: 참여할 때 실명·학번 직접 입력 → 서버가 회원정보와 대조 ───────── */
// 입력값은 비교에만 쓰고 저장·기록하지 않는다 (개인정보 중복 저장 없음). 틀리면 어느 칸이 틀렸는지 알리지 않는다.

/** 이름 비교용 정규화 (공백 제거·소문자) */
export const normalizePersonName = (v: string) => v.replace(LIVE_SPACE_RE, "").toLowerCase();
export const LIVE_NAME_MAX = 50;
export const LIVE_STUDENT_ID_MAX = 30;
/** 오류 문구 — Supabase 6-D 함수(join_live_session_verified)와 같은 문구 (테스트가 확인한다) */
export const LIVE_JOIN_NOT_FOUND = "참여 코드를 찾을 수 없어요. 코드와 수강 중인 분반을 확인해 주세요.";
export const LIVE_IDENTITY_REQUIRED = "실명과 학번을 입력해 주세요.";
export const LIVE_IDENTITY_INVALID = "실명과 학번을 다시 확인해 주세요.";
export const LIVE_IDENTITY_MISMATCH = "입력한 실명·학번이 회원정보와 일치하지 않아요. 회원정보에 등록한 이름과 학번을 입력해 주세요.";

/** 입력한 이름·학번 형식 확인 (오류 문구, 없으면 null) */
export const liveIdentityInputError = (input: { name?: unknown; studentId?: unknown }): string | null => {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const studentId = typeof input.studentId === "string" ? input.studentId.trim() : "";
  if (!name || !studentId) return LIVE_IDENTITY_REQUIRED;
  if (name.length > LIVE_NAME_MAX || studentId.length > LIVE_STUDENT_ID_MAX) return LIVE_IDENTITY_INVALID;
  return null;
};

/** 회원정보(이름·학번)와 일치하는가. 회원정보에 학번이 없으면 참여할 수 없다(회원정보를 먼저 채운다). */
export const matchesMemberIdentity = (input: { name: string; studentId: string }, member: { name: string; studentId: string }) => {
  const sid = normalizeStudentId(member.studentId);
  const name = normalizePersonName(member.name);
  return !!sid && !!name && normalizeStudentId(input.studentId) === sid && normalizePersonName(input.name) === name;
};

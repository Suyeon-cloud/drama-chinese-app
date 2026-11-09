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

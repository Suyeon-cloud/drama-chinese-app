// 기존 db.json 학습 기록 → Supabase 이전 계획·적용 (server-only, service-role).
// 이전 스크립트(npm run supabase:migrate-d4)와 D4 실검사가 같은 코드를 쓴다.
//
// - 기존 사용자 id는 Google sub. Supabase 계정 연결은 DB 함수 legacy_identity_user(sub, 이메일)가 정한다:
//   Google sub와 인증된 이메일이 모두 같을 때만 연결(mapped). 그 밖에는 legacy_progress에 원본 그대로 보관한다.
// - 이미 있는 행은 원본과 같으면 unchanged, 다르면 conflict. conflict·invalid가 하나라도 있으면 아무것도 쓰지 않는다.
// - 쓰기는 없는 행 넣기뿐이다. (덮어쓰기·삭제 없음)
import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearnerProfile, LessonProgress } from "../src/app/store/models";
import { progressFromRow } from "./progressRows";

type Row = Record<string, unknown>;

export type ProgressSource = { progress?: Record<string, LessonProgress>; members?: Record<string, LearnerProfile> };

export type ProgressPlanItem = {
  key: string;
  source: LessonProgress;
  email: string | null;
  kind: "mapped" | "legacy" | "invalid";
  /** mapped: 연결된 Supabase 사용자 */
  userId?: string;
  /** legacy: 연결하지 못한 이유 / invalid: 형식 문제 */
  reason?: string;
  state: "insert" | "unchanged" | "conflict" | "skip";
  /** mapped인데 이전 실행에서 보관된 행이 있으면 적용할 때 claim 표시 */
  claimLegacy?: boolean;
  detail?: string;
};

const isTime = (v: unknown) => v === null || (typeof v === "string" && !Number.isNaN(Date.parse(v)));
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** 기존 LessonProgress 형식 검사 (옮기면 사라지는 필드·잘못된 값) */
export const progressProblem = (key: string, p: LessonProgress): string | null => {
  const allowed = new Set(["userId", "lessonId", "week", "startedAt", "completedAt", "watchedRanges", "progressRatio", "maxPosition", "quiz", "quizAttempts", "lastStudiedAt"]);
  const extra = Object.keys(p).filter((k) => !allowed.has(k));
  if (extra.length) return `알 수 없는 필드 ${extra.join(",")}`;
  if (typeof p.userId !== "string" || !p.userId || typeof p.lessonId !== "string" || !p.lessonId) return "userId·lessonId";
  if (key !== `${p.userId}::${p.lessonId}`) return "key와 userId::lessonId가 다름";
  if (!Number.isInteger(p.week) || p.week < 1 || p.week > 30) return "week";
  if (!Array.isArray(p.watchedRanges) || !p.watchedRanges.every((r) => Array.isArray(r) && r.length === 2 && isNum(r[0]) && isNum(r[1]))) return "watchedRanges";
  if (!isNum(p.progressRatio) || p.progressRatio < 0 || !isNum(p.maxPosition) || p.maxPosition < 0) return "progressRatio·maxPosition";
  if (!Number.isInteger(p.quizAttempts) || p.quizAttempts < 0) return "quizAttempts";
  if (![p.startedAt, p.completedAt, p.lastStudiedAt].every(isTime)) return "시각";
  for (const t of [p.startedAt, p.completedAt, p.lastStudiedAt]) if (t && new Date(t).toISOString() !== t) return "시각이 정확한 ISO가 아님";
  if (p.quiz !== null) {
    const q = p.quiz;
    if (!q || !Number.isInteger(q.correct) || q.correct < 0 || !Number.isInteger(q.total) || q.total < 0 || typeof q.submittedAt !== "string" || new Date(q.submittedAt).toISOString() !== q.submittedAt) return "quiz";
  }
  return null;
};

export const planProgressMigration = async (sb: SupabaseClient, source: ProgressSource): Promise<ProgressPlanItem[]> => {
  const entries = Object.entries(source.progress ?? {});
  if (entries.length === 0) return [];
  const lessonIds = new Set(((await sb.from("lessons").select("id")).data ?? []).map((l: Row) => String(l.id)));
  const items: ProgressPlanItem[] = [];
  for (const [key, p] of entries) {
    const email = source.members?.[p.userId]?.googleEmail?.trim().toLowerCase() || null;
    const problem = progressProblem(key, p);
    if (problem) {
      items.push({ key, source: p, email, kind: "invalid", reason: problem, state: "skip" });
      continue;
    }
    const legacyRow = (await sb.from("legacy_progress").select("*").eq("legacy_user_id", p.userId).eq("lesson_id", p.lessonId).maybeSingle()).data as Row | null;
    const match = await sb.rpc("legacy_identity_user", { p_legacy_user_id: p.userId, p_legacy_email: email });
    if (match.error) throw new Error(`legacy_identity_user: ${match.error.message}`);
    const m = (match.data as { user_id: string | null; reason: string }[])[0];
    if (m?.reason === "matched" && m.user_id && lessonIds.has(p.lessonId)) {
      const row = (await sb.from("lesson_progress").select("*").eq("user_id", m.user_id).eq("lesson_id", p.lessonId).maybeSingle()).data as Row | null;
      const expected = { ...p, userId: m.user_id };
      const state = !row ? "insert" : isDeepStrictEqual(progressFromRow(row), expected) ? "unchanged" : "conflict";
      items.push({ key, source: p, email, kind: "mapped", userId: m.user_id, state, claimLegacy: !!legacyRow && !legacyRow.claimed_by, detail: state === "conflict" ? "Supabase에 같은 학습자료의 다른 기록이 있음" : undefined });
      continue;
    }
    const reason = !lessonIds.has(p.lessonId) ? "lesson_missing" : (m?.reason ?? "no_account");
    const state = !legacyRow
      ? "insert"
      : isDeepStrictEqual(legacyRow.record, p) && (legacyRow.legacy_email ?? null) === email
        ? "unchanged"
        : "conflict";
    items.push({ key, source: p, email, kind: "legacy", reason, state, detail: state === "conflict" ? "보관된 원본과 다름" : undefined });
  }
  return items;
};

export const summarizeProgressPlan = (items: ProgressPlanItem[]) => ({
  source: items.length,
  mapped: items.filter((i) => i.kind === "mapped").length,
  legacy: items.filter((i) => i.kind === "legacy").length,
  invalid: items.filter((i) => i.kind === "invalid").length,
  conflict: items.filter((i) => i.state === "conflict").length,
  insert: items.filter((i) => i.state === "insert").length,
  unchanged: items.filter((i) => i.state === "unchanged").length,
});

/** 계획대로 없는 행만 넣는다. conflict·invalid가 있으면 아무것도 쓰지 않는다. */
export const applyProgressPlan = async (sb: SupabaseClient, items: ProgressPlanItem[]) => {
  const s = summarizeProgressPlan(items);
  if (s.conflict || s.invalid) throw new Error("conflict 또는 invalid가 있어 아무것도 쓰지 않았어요.");
  let inserted = 0;
  for (const i of items.filter((x) => x.state === "insert")) {
    if (i.kind === "mapped") {
      const r = await sb.rpc("admin_import_progress", { p_user_id: i.userId, p_progress: i.source });
      if (r.error) throw new Error(`admin_import_progress ${i.key}: ${r.error.message}`);
      if (i.claimLegacy) {
        await sb.from("legacy_progress").update({ claimed_by: i.userId, claimed_at: new Date().toISOString() }).eq("legacy_user_id", i.source.userId).eq("lesson_id", i.source.lessonId);
      }
    } else {
      const r = await sb.from("legacy_progress").insert({ legacy_user_id: i.source.userId, lesson_id: i.source.lessonId, legacy_email: i.email, record: i.source, reason: i.reason });
      if (r.error) throw new Error(`legacy_progress ${i.key}: ${r.error.message}`);
    }
    inserted++;
  }
  return inserted;
};

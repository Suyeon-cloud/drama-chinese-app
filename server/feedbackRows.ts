// Supabase feedback_drafts 행 ↔ 기존 FeedbackDraft 객체 변환 (server-only, 하나의 기준).
// 관리자 피드백 API와 기존 초안 이전 도구가 같은 변환을 쓴다. Gmail 발송 토큰은 다루지 않는다.
import type { FeedbackDraft } from "../src/app/store/models";

type Row = Record<string, unknown>;

const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());

export const FEEDBACK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

/** 기존 FeedbackDraft 형식 검사 (저장 전·이전 전) */
export const feedbackProblem = (d: FeedbackDraft): string | null => {
  if (!d || typeof d !== "object") return "형식";
  if (typeof d.id !== "string" || !FEEDBACK_ID_RE.test(d.id)) return "id";
  if (typeof d.learnerId !== "string" || typeof d.lessonId !== "string") return "learnerId·lessonId";
  if (![d.to, d.subject, d.body].every((v) => typeof v === "string")) return "to·subject·body";
  if (!["draft", "approved", "sent"].includes(d.status)) return "status";
  if (d.channel !== null && !["gmail-api", "gmail-compose"].includes(d.channel)) return "channel";
  if (Number.isNaN(Date.parse(d.createdAt))) return "createdAt";
  if (d.sentAt !== null && Number.isNaN(Date.parse(d.sentAt))) return "sentAt";
  if (d.externalMessageId !== null && typeof d.externalMessageId !== "string") return "externalMessageId";
  return null;
};

export const feedbackToRow = (d: FeedbackDraft, updatedAt = d.updatedAt) => ({
  id: d.id,
  learner_id: d.learnerId,
  lesson_id: d.lessonId,
  to_email: d.to,
  subject: d.subject,
  body: d.body,
  status: d.status,
  channel: d.channel,
  created_at: d.createdAt,
  updated_at: updatedAt,
  sent_at: d.sentAt,
  external_message_id: d.externalMessageId,
});

export const feedbackFromRow = (r: Row): FeedbackDraft => ({
  id: String(r.id),
  learnerId: String(r.learner_id),
  lessonId: String(r.lesson_id),
  to: String(r.to_email),
  subject: String(r.subject),
  body: String(r.body),
  status: r.status as FeedbackDraft["status"],
  channel: (r.channel as FeedbackDraft["channel"]) ?? null,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  sentAt: iso(r.sent_at),
  externalMessageId: (r.external_message_id as string | null) ?? null,
});

import React, { useEffect, useState } from "react";
import { formatTime } from "../../../content";
import { useAuth } from "../../auth/AuthContext";
import {
  GMAIL_ERROR_MESSAGE,
  GmailError,
  gmailService,
  isValidEmail,
  stripLineBreaks,
  type GmailErrorCode,
} from "../../auth/gmailService";
import { lessonHeading } from "../../../content/lessons";
import type { Lesson } from "../../../content/types";
import { formatDateTime, formatPercent } from "../../lib/format";
import { feedbackStore } from "../../store";
import { useCourseFeedback } from "../../store/hooks";
import { createId, nowIso } from "../../store/localJson";
import type { CourseStudent, FeedbackDraft, FeedbackStatus, LessonProgress } from "../../store/models";

const STATUS_TEXT: Record<FeedbackStatus, string> = {
  draft: "작성 중",
  approved: "확인 완료",
  sent: "발송 완료",
};

/** 학습 기록으로 피드백 초안의 기본 문안을 만든다. (교강사가 확인·수정 후 발송) */
const draftFromProgress = (student: CourseStudent, lesson: Lesson | undefined, p: LessonProgress): FeedbackDraft => {
  const heading = lesson ? lessonHeading(lesson) : `${p.week}주차 학습자료`;
  const now = nowIso();
  return {
    id: createId("feedback"),
    learnerId: student.userId,
    lessonId: p.lessonId,
    to: student.email,
    subject: `[追剧学汉语] ${p.week}주차 학습 피드백 — ${heading}`,
    body: [
      `${student.name}님, 안녕하세요.`,
      `${p.week}주차 「${heading}」 학습 결과를 안내드립니다.`,
      "",
      `· 영상 학습 진행률: ${formatPercent(p.progressRatio)} (최대 재생 위치 ${formatTime(p.maxPosition)})`,
      `· 학습 완료: ${p.completedAt ? "완료" : "미완료"}`,
      `· 복습 퀴즈: ${p.quiz ? `${p.quiz.total}문제 중 ${p.quiz.correct}문제 정답` : "미응시"}`,
      "",
      "[교강사 코멘트]",
      "",
      "",
      "追剧学汉语",
    ].join("\n"),
    status: "draft",
    channel: null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    externalMessageId: null,
  };
};

/** Gmail 발송 상태 (화면에만 두고 저장하지 않는다) */
type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success"; sentAt: string; to: string }
  | { kind: "error"; code: GmailErrorCode; detail?: string };

/**
 * 수강생 현황에서 고른 학생의 학습 피드백: 주차별 학습 기록 → 초안 작성 → 확인 → 교강사가 직접 Gmail로 보내기.
 * 서버가 운영 중인 담당 분반 수강생의 이 과목 학습자료인지 확인한 뒤에만 초안을 읽고 저장한다.
 */
export const StudentFeedback: React.FC<{
  courseId: string;
  sectionId: string;
  student: CourseStudent;
  /** 이 학생의 이 과목 학습 기록 */
  records: LessonProgress[];
  lessons: Lesson[];
}> = ({ courseId, sectionId, student, records, lessons }) => {
  const { user } = useAuth();
  const allDrafts = useCourseFeedback(courseId, sectionId);
  const [editing, setEditing] = useState<FeedbackDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendState, setSendState] = useState<SendState>({ kind: "idle" });
  const [confirmResend, setConfirmResend] = useState(false);

  // Gmail 권한 팝업이 클릭 즉시 열리도록 미리 준비한다. (권한 요청은 버튼을 눌렀을 때만)
  useEffect(() => {
    if (user?.role === "instructor") gmailService.prepare();
  }, [user?.role]);

  if (!allDrafts) return null;

  const drafts = allDrafts.filter((d) => d.learnerId === student.userId);
  const lessonOf = (id: string) => lessons.find((l) => l.id === id);
  const targets = records.filter((p) => p.startedAt).sort((a, b) => a.week - b.week);
  const sending = sendState.kind === "sending";
  const isInstructor = user?.role === "instructor" && user.provider === "google";
  // 받는 사람: 등록된 학생 이메일 (서버도 저장할 때 이 주소로 고정한다)
  const recipient = student.email;

  const edit = (d: FeedbackDraft) => {
    if (sending) return; // 발송 중에는 다른 피드백으로 바꾸지 않는다.
    setEditing({ ...d, to: recipient });
    setSaved(false);
    setError(null);
    setSendState({ kind: "idle" });
    setConfirmResend(false);
  };
  const save = (draft: FeedbackDraft) => feedbackStore.saveForCourse(courseId, draft);
  const saveDraft = async (status: FeedbackStatus) => {
    if (!editing || sending) return;
    try {
      const result = await save({ ...editing, status });
      setEditing(result);
      setSaved(true);
      setError(null);
    } catch (err) {
      setSaved(false);
      setError(err instanceof Error ? err.message : "피드백을 저장하지 못했어요.");
    }
  };

  /**
   * Gmail로 보내기. 권한 팝업 차단을 피하려고 클릭 직후 동기적으로 권한을 요청한 다음,
   * 현재 내용을 저장하고, Gmail이 message id를 돌려준 경우에만 ‘발송 완료’로 저장한다.
   */
  const sendGmail = (confirmed = false) => {
    if (!editing || sending || !user || !isInstructor) return;
    const to = stripLineBreaks(recipient);
    const subject = stripLineBreaks(editing.subject);
    if (!isValidEmail(to)) return setSendState({ kind: "error", code: "invalid-recipient" });
    if (!subject) return setSendState({ kind: "error", code: "invalid-subject" });
    if (editing.status === "sent" && !confirmed) {
      setConfirmResend(true);
      return;
    }
    setConfirmResend(false);
    setSaved(false);
    setError(null);
    setSendState({ kind: "sending" });

    const authorizing = gmailService.authorize(user.email); // 클릭 직후 (팝업)
    const draft = { ...editing, to, subject };
    void (async () => {
      let current: FeedbackDraft;
      try {
        // 발송 직전 현재 편집 내용을 저장한다. (상태는 그대로 — 전송 성공 전에는 ‘발송 완료’로 바꾸지 않음)
        current = await save(draft);
        setEditing(current);
      } catch (err) {
        setSendState({ kind: "idle" });
        setError(err instanceof Error ? err.message : "피드백을 저장하지 못해 보내지 않았어요.");
        return;
      }
      try {
        const auth = await authorizing;
        const { id } = await gmailService.send(auth, { to: current.to, subject: current.subject, body: current.body });
        current = await save({
          ...current,
          status: "sent",
          channel: "gmail-api",
          sentAt: nowIso(),
          externalMessageId: id,
        });
        setEditing(current);
        setSendState({ kind: "success", sentAt: current.sentAt!, to: current.to });
      } catch (err) {
        const e = err instanceof GmailError ? err : new GmailError("unknown");
        setSendState({ kind: "error", code: e.code, detail: e.message !== e.code ? e.message : undefined });
      }
    })();
  };

  return (
    <section className="card">
      <h3 className="card-title">학습 피드백 · {student.name}</h3>
      <div className="feedback-grid">
        <div>
          <b className="small">피드백할 학습 기록</b>
          {targets.length === 0 ? (
            <p className="muted">아직 학습을 시작한 기록이 없어요.</p>
          ) : (
            <ul className="target-list">
              {targets.map((p) => {
                const lesson = lessonOf(p.lessonId);
                const existing = drafts.find((d) => d.lessonId === p.lessonId);
                return (
                  <li key={p.lessonId}>
                    <div>
                      <b>{p.week}주차</b>
                      <small className="muted">
                        {lesson ? lessonHeading(lesson) : "(삭제된 학습자료)"} · 재생 {formatPercent(p.progressRatio)}
                        {p.completedAt ? " · 완료" : ""}
                        {p.quiz ? ` · 퀴즈 ${p.quiz.correct}/${p.quiz.total}` : ""}
                      </small>
                    </div>
                    <button
                      className="btn btn-soft btn-sm"
                      disabled={sending}
                      onClick={() => edit(existing ?? draftFromProgress(student, lesson, p))}
                    >
                      {existing ? `초안 열기 (${STATUS_TEXT[existing.status]})` : "피드백 작성"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="feedback-editor">
          {!editing ? (
            <p className="muted">왼쪽에서 학습 기록을 고르면 진도·퀴즈 결과가 담긴 초안이 만들어져요.</p>
          ) : (
            <>
              <label className="field">
                <span>받는 사람 (등록된 학생 이메일)</span>
                <input value={recipient || "(등록된 학생 이메일 없음)"} readOnly inputMode="email" />
              </label>
              <label className="field">
                <span>제목</span>
                <input
                  value={editing.subject}
                  disabled={sending}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                />
              </label>
              <label className="field">
                <span>내용</span>
                <textarea
                  rows={12}
                  value={editing.body}
                  disabled={sending}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                />
              </label>
              <div className="row-start">
                <button className="btn btn-soft btn-sm" disabled={sending} onClick={() => void saveDraft("draft")}>
                  초안 저장
                </button>
                <button className="btn btn-primary btn-sm" disabled={sending} onClick={() => void saveDraft("approved")}>
                  확인 완료로 저장
                </button>
                <button
                  className="btn btn-sm btn-gmail"
                  disabled={sending || !isInstructor || !gmailService.configured || !recipient}
                  onClick={() => sendGmail()}
                >
                  {sending ? "보내는 중…" : "✉️ Gmail로 보내기"}
                </button>
              </div>
              <small className="muted">
                버튼을 누르면 처음 한 번 Google 권한 창에서 ‘Gmail 메일 보내기’ 허용을 요청해요. 지금 로그인한 교강사
                계정({user?.email ?? "—"})으로 보내며, 자동으로 보내지 않아요.
              </small>

              {confirmResend ? (
                <div className="send-status warn" role="alert">
                  <b>이미 {formatDateTime(editing.sentAt)}에 발송한 피드백이에요. 다시 보낼까요?</b>
                  <div className="row-start">
                    <button className="btn btn-sm btn-gmail" onClick={() => sendGmail(true)}>
                      다시 보내기
                    </button>
                    <button className="btn btn-soft btn-sm" onClick={() => setConfirmResend(false)}>
                      취소
                    </button>
                  </div>
                </div>
              ) : null}
              {sendState.kind === "sending" ? (
                <div className="send-status pending" role="status">
                  ⏳ Gmail로 보내는 중이에요… 권한 창이 열리면 교강사 계정을 선택해 주세요.
                </div>
              ) : null}
              {sendState.kind === "success" ? (
                <div className="send-status ok" role="status">
                  <b>✅ Gmail로 전송했어요.</b>
                  <span>
                    {sendState.to} · {formatDateTime(sendState.sentAt)}
                  </span>
                </div>
              ) : null}
              {sendState.kind === "error" ? (
                <div className={`send-status ${sendState.code === "unknown" ? "warn" : "fail"}`} role="alert">
                  <b>
                    {sendState.code === "unknown"
                      ? "⚠️ 전송 결과를 확인할 수 없어요"
                      : sendState.code === "denied" || sendState.code === "cancelled"
                        ? "🔒 Gmail 권한이 없어 보내지 못했어요"
                        : "❌ 전송하지 못했어요"}
                  </b>
                  <span>{GMAIL_ERROR_MESSAGE[sendState.code]}</span>
                  {sendState.detail ? <small>({sendState.detail})</small> : null}
                </div>
              ) : null}
              {error ? (
                <p className="field-error small" role="alert">
                  {error}
                </p>
              ) : null}
              {saved ? <p className="form-notice">✅ {STATUS_TEXT[editing.status]} 상태로 저장했어요.</p> : null}
            </>
          )}
        </div>
      </div>

      {drafts.length > 0 ? (
        <div className="data-table">
          <b className="small">저장된 피드백</b>
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>상태</th>
                <th>수정</th>
                <th>발송</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td>{d.subject}</td>
                  <td>{STATUS_TEXT[d.status]}</td>
                  <td className="tabular">{formatDateTime(d.updatedAt)}</td>
                  <td className="tabular">{formatDateTime(d.sentAt)}</td>
                  <td>
                    <button className="link-btn" disabled={sending} onClick={() => edit(d)}>
                      열기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
};

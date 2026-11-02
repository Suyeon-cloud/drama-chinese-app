import React, { useState } from "react";
import { Avatar } from "../../auth/AuthControls";
import { ProfileFields } from "../../auth/MemberGate";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { navigate } from "../../router";
import { learnerStore } from "../../store";
import { useLearners } from "../../store/hooks";
import type { CourseOverview, Enrollment, LearnerProfile, MemberProfileInput } from "../../store/models";

type Filter = "all" | "pending" | "approved";

/** 회원 수정 창 */
const EditMember: React.FC<{ member: LearnerProfile; onClose: () => void }> = ({ member, onClose }) => {
  const toast = useToast();
  const [form, setForm] = useState<MemberProfileInput>({
    name: member.name,
    university: member.university,
    department: member.department,
    grade: member.grade,
    studentId: member.studentId,
    email: member.email,
    phone: member.phone,
  });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await learnerStore.update(member.id, form);
      toast.show("회원정보를 수정했어요.", "success");
      onClose();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "수정하지 못했어요.", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="member-edit card" onSubmit={(e) => void save(e)}>
      <h3 className="card-title">회원정보 수정 · {member.googleEmail}</h3>
      <ProfileFields value={form} onChange={setForm} />
      <div className="row-end">
        <button type="button" className="btn btn-soft btn-sm" onClick={onClose}>
          취소
        </button>
        <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
};

/** 관리자 회원 표: 확인 · 승인 · 수정 · 삭제. 승인 대기 회원을 맨 위에 둔다. */
export const MemberTable: React.FC<{ enrollments: Enrollment[]; courses: CourseOverview[] }> = ({
  enrollments,
  courses,
}) => {
  const members = useLearners();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<LearnerProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // window.confirm은 미리보기 브라우저 등에서 막혀 바로 false가 되므로, 표 안에서 한 번 더 묻는다.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const run = async (id: string, work: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await work();
      toast.show(done, "success");
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "처리하지 못했어요.", "error");
    } finally {
      setBusy(null);
    }
  };

  const list = (members ?? [])
    .filter((m) => filter === "all" || m.status === filter)
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  const pendingCount = (members ?? []).filter((m) => m.status === "pending").length;

  return (
    <section className="card member-panel">
      <div className="card-head">
        <h3 className="card-title">
          회원 {members?.length ?? 0}명 · 승인 대기 <b className="pink-ink">{pendingCount}명</b>
        </h3>
        <div className="tag-bar" role="toolbar" aria-label="회원 필터">
          {(
            [
              ["all", "전체"],
              ["pending", "승인 대기"],
              ["approved", "승인 완료"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} className={`tag ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {editing ? <EditMember member={editing} onClose={() => setEditing(null)} /> : null}

      {!members ? (
        <p className="muted">불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="empty">
          <span>👥</span>
          <p>{members.length === 0 ? "아직 가입한 회원이 없어요. 학습자가 Google로 로그인하면 여기에 표시돼요." : "해당하는 회원이 없어요."}</p>
        </div>
      ) : (
        <div className="data-table member-table">
          <table>
            <thead>
              <tr>
                <th>회원</th>
                <th>대학 · 학과 · 학년</th>
                <th>휴대폰번호</th>
                <th>수강 강의 · 분반</th>
                <th>가입 · 최종 접속</th>
                <th>승인</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const approved = m.status === "approved";
                // 수강 중인 강의 · 분반
                const mine = enrollments.flatMap((e) => {
                  if (e.userId !== m.id || !e.sectionId) return [];
                  const c = courses.find((x) => x.id === e.courseId);
                  const s = c?.sections.find((x) => x.id === e.sectionId);
                  return c && s ? [{ c, s }] : [];
                });
                return (
                  <tr key={m.id} className={approved ? undefined : "is-pending"}>
                    <td>
                      <span className="who">
                        <Avatar name={m.name} color={m.avatarColor} src={m.picture} size={30} />
                        <span>
                          <b>{m.name || "(이름 미입력)"}</b>
                          {m.studentId ? <small className="muted"> · 학번 {m.studentId}</small> : null}
                          <small className="muted block">{m.email || m.googleEmail}</small>
                        </span>
                      </span>
                    </td>
                    <td className="muted">
                      {m.university ? `${m.university} · ${m.department}` : "—"}
                      {m.grade ? ` · ${m.grade}학년` : ""}
                    </td>
                    <td className="tabular">{m.phone || "—"}</td>
                    <td>
                      {mine.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="row-start">
                          {mine.map(({ c, s }) => (
                            <button
                              key={s.id}
                              className="pill pill-sky pill-btn"
                              onClick={() => navigate("admin-progress", { course: c.id, section: s.id, learner: m.id })}
                              title="이 분반의 학습 현황"
                            >
                              {c.title} · {s.name}
                            </button>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="tabular small">
                      {formatDateTime(m.firstSeenAt)}
                      <small className="muted block">{formatDateTime(m.lastSeenAt)}</small>
                    </td>
                    <td>
                      {!m.profileCompleted ? (
                        <span className="pill pill-cream">정보 입력 전</span>
                      ) : approved ? (
                        <span className="row-start">
                          <span className="pill pill-mint">승인</span>
                          <button
                            className="link-btn"
                            disabled={busy === m.id}
                            onClick={() =>
                              void run(m.id, () => learnerStore.update(m.id, { status: "pending" }), `${m.name}님의 승인을 취소했어요.`)
                            }
                          >
                            취소
                          </button>
                        </span>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy === m.id}
                          onClick={() =>
                            void run(m.id, () => learnerStore.update(m.id, { status: "approved" }), `${m.name}님을 승인했어요.`)
                          }
                        >
                          승인
                        </button>
                      )}
                    </td>
                    <td>
                      {confirmDelete === m.id ? (
                        <span className="row-start">
                          <span className="small">학습 기록도 함께 지워져요. 삭제할까요?</span>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={busy === m.id}
                            onClick={() => {
                              setConfirmDelete(null);
                              void run(m.id, () => learnerStore.remove(m.id), "회원을 삭제했어요.");
                            }}
                          >
                            삭제
                          </button>
                          <button className="btn btn-soft btn-sm" onClick={() => setConfirmDelete(null)}>
                            취소
                          </button>
                        </span>
                      ) : (
                        <span className="row-start">
                          <button className="link-btn" onClick={() => setEditing(m)}>
                            수정
                          </button>
                          <button
                            className="link-btn danger"
                            disabled={busy === m.id}
                            title={`${m.name || m.googleEmail} 회원을 삭제해요. 학습 기록도 함께 지워져요.`}
                            onClick={() => setConfirmDelete(m.id)}
                          >
                            삭제
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

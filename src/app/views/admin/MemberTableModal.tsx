import React, { useEffect, useState } from "react";
import { closeMemberPopup, useMemberPopupOpen } from "../../auth/memberPopup";
import { ProfileFields } from "../../auth/MemberGate";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { learnerStore } from "../../store";
import { useLearners } from "../../store/hooks";
import type { LearnerProfile, MemberProfileInput } from "../../store/models";

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

/** 관리자: 팝업 형식의 회원 현황 테이블 (승인 · 수정 · 삭제) */
export const MemberTableModal: React.FC = () => {
  const open = useMemberPopupOpen();
  const { user } = useAuth();
  if (!open || user?.role !== "instructor") return null;
  return <MemberTable />;
};

const MemberTable: React.FC = () => {
  const members = useLearners();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<LearnerProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // window.confirm은 미리보기 브라우저 등에서 막혀 바로 false가 되므로, 표 안에서 한 번 더 묻는다.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMemberPopup();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const list = (members ?? []).filter((m) => filter === "all" || m.status === filter);
  const pendingCount = (members ?? []).filter((m) => m.status === "pending").length;

  return (
    <div className="modal-backdrop" onMouseDown={closeMemberPopup}>
      <div
        className="modal member-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-title"
      >
        <button className="modal-close" onClick={closeMemberPopup} aria-label="닫기">
          ✕
        </button>
        <h2 id="member-title">회원 현황</h2>
        <p className="muted small">
          전체 {members?.length ?? 0}명 · 승인 대기 <b className="pink-ink">{pendingCount}명</b>
        </p>
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

        {editing ? <EditMember member={editing} onClose={() => setEditing(null)} /> : null}

        {!members ? (
          <p className="muted">불러오는 중…</p>
        ) : list.length === 0 ? (
          <div className="card empty">
            <span>👥</span>
            <p>{members.length === 0 ? "아직 가입한 회원이 없어요." : "해당하는 회원이 없어요."}</p>
          </div>
        ) : (
          <div className="data-table member-table">
            <table>
              <thead>
                <tr>
                  <th>성명</th>
                  <th>대학</th>
                  <th>학과</th>
                  <th>학년</th>
                  <th>이메일</th>
                  <th>휴대폰번호</th>
                  <th>가입일</th>
                  <th>최종접속일</th>
                  <th>회원 승인</th>
                  <th>수정</th>
                  <th>삭제</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => {
                  const approved = m.status === "approved";
                  return (
                    <tr key={m.id}>
                      <td>
                        <b>{m.name || "(미입력)"}</b>
                        {m.studentId ? <small className="muted block">학번 {m.studentId}</small> : null}
                      </td>
                      <td>{m.university || "—"}</td>
                      <td>{m.department || "—"}</td>
                      <td>{m.grade || "—"}</td>
                      <td className="muted">{m.email || m.googleEmail}</td>
                      <td className="tabular">{m.phone || "—"}</td>
                      <td className="tabular">{formatDateTime(m.firstSeenAt)}</td>
                      <td className="tabular">{formatDateTime(m.lastSeenAt)}</td>
                      <td>
                        {!m.profileCompleted ? (
                          <span className="pill pill-cream">정보 입력 전</span>
                        ) : (
                          <button
                            className={`btn btn-sm ${approved ? "btn-soft" : "btn-primary"}`}
                            disabled={busy === m.id}
                            title={approved ? "누르면 승인을 취소해요" : undefined}
                            onClick={() =>
                              void run(
                                m.id,
                                () => learnerStore.update(m.id, { status: approved ? "pending" : "approved" }),
                                approved ? `${m.name}님의 승인을 취소했어요.` : `${m.name}님을 승인했어요.`,
                              )
                            }
                          >
                            {approved ? "✅ 승인됨" : "승인"}
                          </button>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-soft btn-sm" onClick={() => setEditing(m)}>
                          수정
                        </button>
                      </td>
                      <td>
                        {confirmDelete === m.id ? (
                          <span className="row-start">
                            <span className="small" title="학습 기록도 함께 지워져요.">
                              삭제할까요?
                            </span>
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
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={busy === m.id}
                            title={`${m.name || m.googleEmail} 회원을 삭제해요. 학습 기록도 함께 지워져요.`}
                            onClick={() => setConfirmDelete(m.id)}
                          >
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

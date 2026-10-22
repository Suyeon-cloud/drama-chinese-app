import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { EMPTY_PROFILE, type MemberProfileInput } from "../store/models";
import { useAuth } from "./AuthContext";
import type { AuthUser } from "./authService";

export const PROFILE_LABELS: Record<keyof MemberProfileInput, string> = {
  name: "성명",
  university: "대학",
  department: "학과",
  grade: "학년",
  studentId: "학번",
  email: "이메일",
  phone: "휴대폰 번호",
};

const PLACEHOLDER: Record<keyof MemberProfileInput, string> = {
  name: "홍길동",
  university: "○○대학교",
  department: "중국어학과",
  grade: "",
  studentId: "20260001",
  email: "name@gmail.com",
  phone: "010-1234-5678",
};

export const GRADES = ["1학년", "2학년", "3학년", "4학년", "대학원", "기타"];

/** 회원정보 입력 칸 (회원 가입 팝업·관리자 수정에서 함께 사용) */
export const ProfileFields: React.FC<{
  value: MemberProfileInput;
  onChange: (v: MemberProfileInput) => void;
}> = ({ value, onChange }) => {
  const set = (k: keyof MemberProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="profile-fields">
      {(Object.keys(PROFILE_LABELS) as (keyof MemberProfileInput)[]).map((k) => (
        <label key={k} className="field">
          <span>{PROFILE_LABELS[k]}</span>
          {k === "grade" ? (
            <select value={value.grade} onChange={set("grade")} required>
              <option value="">선택</option>
              {[...GRADES, ...(value.grade && !GRADES.includes(value.grade) ? [value.grade] : [])].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={k === "email" ? "email" : k === "phone" ? "tel" : "text"}
              value={value[k]}
              onChange={set(k)}
              placeholder={PLACEHOLDER[k]}
              autoComplete={k === "name" ? "name" : k === "email" ? "email" : k === "phone" ? "tel" : "off"}
              maxLength={100}
              required
            />
          )}
        </label>
      ))}
    </div>
  );
};

/** 구글 로그인 직후 회원정보 입력 팝업 (입력을 마쳐야 닫힌다) */
const ProfileModal: React.FC<{ user: AuthUser }> = ({ user }) => {
  const { setUser, signOut } = useAuth();
  const m = user.member!;
  const [form, setForm] = useState<MemberProfileInput>({
    ...EMPTY_PROFILE,
    name: m.name,
    university: m.university,
    department: m.department,
    grade: m.grade,
    studentId: m.studentId,
    email: m.email || m.googleEmail,
    phone: m.phone,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ user: AuthUser | null }>("/me/profile", { method: "PUT", body: form });
      setUser(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop gate-backdrop">
      <form className="modal profile-modal" onSubmit={(e) => void submit(e)} role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <h2 id="profile-title">회원정보 입력</h2>
        <p className="muted small">
          처음 오셨네요! 아래 정보를 입력하면 관리자가 확인한 뒤 승인해 드려요. (Google 계정: {m.googleEmail})
        </p>
        <ProfileFields value={form} onChange={setForm} />
        {error ? <p className="field-error small">{error}</p> : null}
        <div className="row-end">
          <button type="button" className="btn btn-soft" onClick={() => void signOut()}>
            로그아웃
          </button>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "저장 중…" : "가입 신청"}
          </button>
        </div>
      </form>
    </div>
  );
};

const POLL_MS = 15000;

/** 관리자 승인 전: 화면 전체를 덮어 모든 클릭을 막는다. 승인되면 자동으로 풀린다. */
const PendingOverlay: React.FC<{ user: AuthUser }> = ({ user }) => {
  const { refresh, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div className="modal-backdrop gate-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="pending-title">
      <div className="modal pending-modal">
        <span className="gate-emoji" aria-hidden>
          ⏳
        </span>
        <h2 id="pending-title">관리자 승인 대기 중</h2>
        <p>
          <b>{user.name}</b>님의 가입 신청이 접수되었어요.
          <br />
          관리자가 승인하면 모든 메뉴를 이용할 수 있어요.
        </p>
        <p className="muted small">승인 전에는 화면을 누를 수 없어요. 승인되면 이 창은 자동으로 닫혀요.</p>
        <div className="row-center">
          <button
            className="btn btn-primary btn-sm"
            disabled={checking}
            onClick={() => {
              setChecking(true);
              void refresh().finally(() => setChecking(false));
            }}
          >
            {checking ? "확인 중…" : "승인 여부 다시 확인"}
          </button>
          <button className="btn btn-soft btn-sm" onClick={() => void signOut()}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
};

/** 학습자 회원의 가입 단계에 맞는 팝업 (정보 입력 → 승인 대기). 승인된 회원·관리자는 아무것도 표시하지 않는다. */
export const MemberGate: React.FC = () => {
  const { user } = useAuth();
  const m = user?.member;
  if (!user || !m) return null;
  if (!m.profileCompleted) return <ProfileModal user={user} />;
  if (m.status !== "approved") return <PendingOverlay user={user} />;
  return null;
};

/** 승인 전 회원인지 (화면 클릭 차단용) */
export const isBlockedMember = (user: AuthUser | null) =>
  !!user?.member && (!user.member.profileCompleted || user.member.status !== "approved");

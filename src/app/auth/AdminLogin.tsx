import React, { useState } from "react";
import { Icon } from "../components/Icon";
import { navigate } from "../router";
import { useAuth } from "./AuthContext";
import { openMemberPopup } from "./memberPopup";

/** 관리자 로그인 창 — Google 계정과 별개로 아이디·비밀번호로 로그인한다. */
const AdminLoginModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { adminSignIn, adminEnabled, pending } = useAuth();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { user, error: err } = await adminSignIn(id, password);
    if (!user) return setError(err);
    onClose();
    navigate("admin");
    openMemberPopup(); // 로그인하면 회원 현황을 바로 보여준다.
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal admin-login"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-title"
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <span className="admin-login-mark" aria-hidden>
          <Icon name="shield" size={28} />
        </span>
        <h2 id="admin-login-title">관리자 로그인</h2>
        <p className="muted small">관리자 전용 계정으로 로그인해요. (Google 계정과 별개)</p>
        {!adminEnabled ? (
          <p className="scope-note">
            ℹ️ 서버에 관리자 계정이 아직 설정되지 않았어요. 배포 환경변수 <b>ADMIN_ID</b>, <b>ADMIN_PASSWORD</b>를 넣어 주세요.
          </p>
        ) : null}
        <label className="field">
          <span>아이디</span>
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="field-error small">{error}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={pending || !id || !password}>
          {pending ? "로그인 중…" : "관리자로 로그인"}
        </button>
      </form>
    </div>
  );
};

/** 상단의 관리자 아이콘 (Google 로그인 버튼 왼쪽) */
export const AdminLoginButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="admin-icon-btn" onClick={() => setOpen(true)} title="관리자 로그인" aria-label="관리자 로그인">
        <Icon name="shield" size={20} />
        <span>관리자</span>
      </button>
      {open ? <AdminLoginModal onClose={() => setOpen(false)} /> : null}
    </>
  );
};

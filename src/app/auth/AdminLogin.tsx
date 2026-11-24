import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icon";
import { navigate } from "../router";
import { useAuth } from "./AuthContext";

/** 관리자 로그인 창 — Google 계정과 별개로 관리자 비밀번호로 로그인한다. (관리자 계정은 서버가 정한다) */
const AdminLoginModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { adminSignIn, adminEnabled, pending } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { user, error: err } = await adminSignIn(password);
    if (!user) return setError(err);
    onClose();
    navigate("admin");
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
        <p className="muted small">관리자 비밀번호로 로그인해요. (Google 계정과 별개)</p>
        {!adminEnabled ? (
          <p className="scope-note">
            ℹ️ 서버에 관리자 계정이 아직 설정되지 않았어요. 배포 환경변수 <b>ADMIN_ID</b>, <b>ADMIN_PASSWORD</b>를 넣어 주세요.
          </p>
        ) : null}
        {/* 브라우저 비밀번호 저장용 고정 사용자 이름 (실제 관리자 ID가 아니며 서버로 보내지 않는다) */}
        <input type="text" name="username" value="admin" autoComplete="username" readOnly hidden />
        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error ? (
          <p className="field-error small" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={pending || !password}>
          {pending ? "로그인 중…" : "관리자로 로그인"}
        </button>
      </form>
    </div>
  );
};

/** 상단의 관리자 아이콘 (Google 로고 버튼 왼쪽). 글자 없이 아이콘만 — 툴팁·aria-label로 이름을 알린다. */
export const AdminLoginButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="admin-icon-btn header-icon-btn" onClick={() => setOpen(true)} title="관리자 로그인" aria-label="관리자 로그인">
        <Icon name="shield" size={19} />
      </button>
      {/* 상단바의 backdrop-filter 안에서는 position: fixed가 화면이 아닌 상단바 기준이 되어 창이 잘린다. body에 띄운다. */}
      {open ? createPortal(<AdminLoginModal onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
};

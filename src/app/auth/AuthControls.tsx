import React, { useEffect, useRef, useState } from "react";
import { navigate } from "../router";
import { AdminLoginButton } from "./AdminLogin";
import { useAuth } from "./AuthContext";
import { openMemberPopup } from "./memberPopup";
import { ROLE_LABEL } from "./roles";

export const GoogleMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/** 프로필 원형 아이콘. Google 프로필 이미지가 있으면 이미지, 없거나 불러오지 못하면 이름 첫 글자. */
export const Avatar: React.FC<{ name: string; color: string; size?: number; src?: string | null }> = ({
  name,
  color,
  size = 40,
  src,
}) => {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
      aria-hidden
    >
      {src && !broken ? (
        // eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
};

/** Google 로그인 버튼. 어디서 눌러도 같은 useAuth().signIn()을 사용한다. */
export const GoogleSignInButton: React.FC<{ label?: string; onSignedIn?: () => void }> = ({
  label = "Google로 로그인",
  onSignedIn,
}) => {
  const { signIn, pending } = useAuth();
  return (
    <button
      className="google-btn"
      onClick={() => void signIn().then((u) => u && onSignedIn?.())}
      disabled={pending}
    >
      <GoogleMark />
      <span>{pending ? "로그인 중…" : label}</span>
    </button>
  );
};

/** 로그인 버튼 / 로그인 후 프로필. 인증 로직은 AuthContext에 있다. */
export const AuthControls: React.FC = () => {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // 로그인 전: 관리자 아이콘(Google과 별개) + Google 로그인
  if (!user)
    return (
      <div className="auth-buttons">
        <AdminLoginButton />
        <GoogleSignInButton />
      </div>
    );

  return (
    <div className="profile" ref={ref}>
      <button className="profile-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Avatar name={user.name} color={user.avatarColor} src={user.picture} />
        <span className="profile-text">
          <small>{user.provider === "admin" ? "관리자 모드" : "안녕하세요,"}</small>
          <b>{user.name}님! 💙</b>
        </span>
        <span className="chev" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-head">
            <b>{user.name}</b>
            <small>{user.email}</small>
            <span className={`role-tag ${user.role}`}>
              {user.provider === "admin" ? "관리자" : ROLE_LABEL[user.role]}
            </span>
          </div>
          {user.role === "instructor" ? (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                openMemberPopup();
              }}
            >
              회원 현황
            </button>
          ) : (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate("mine");
              }}
            >
              내 대시보드
            </button>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut().then(() => navigate("home"));
            }}
          >
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
};

import React, { useState } from "react";
import { AuthControls } from "../auth/AuthControls";
import { useGuardedNavigate } from "../auth/LoginPrompt";
import { useAuth } from "../auth/AuthContext";
import { MENU_PARENT, getView, menuFor, navigate, type ViewKey } from "../router";
import { Icon, type IconName } from "./Icon";

const VIEW_ICONS: Record<ViewKey, IconName> = {
  home: "home",
  weeks: "play",
  lesson: "play",
  situations: "clapper",
  culture: "book",
  mine: "chart",
  admin: "grid",
  "admin-course": "calendar",
  "admin-editor": "plus",
  "admin-learners": "users",
  "admin-progress": "chart",
  "admin-feedback": "mail",
  "admin-instructors": "shield",
  join: "users",
};

/** 현재 역할의 메뉴와, 활성 표시할 메뉴 key */
const useMenu = (active: ViewKey) => {
  const { user } = useAuth();
  const go = useGuardedNavigate();
  const menu = menuFor(user?.role ?? null);
  return { menu, current: MENU_PARENT[active] ?? active, homeKey: menu[0].key, go };
};

export const Logo: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className={`logo ${compact ? "compact" : ""}`}>
    <span className="logo-mark" aria-hidden>
      <Icon name="play" size={compact ? 22 : 26} />
    </span>
    <span className="logo-text">
      <b>追剧学汉语</b>
      {!compact ? <small>드라마로 배우는 중국어</small> : null}
    </span>
  </div>
);

export const Sidebar: React.FC<{ active: ViewKey }> = ({ active }) => {
  const { menu, current, homeKey, go } = useMenu(active);
  return (
    <aside className="sidebar">
      <button className="sidebar-logo" onClick={() => navigate(homeKey)} aria-label="홈으로">
        <Logo />
      </button>
      <nav className="nav">
        {menu.map((v) => (
          <button
            key={v.key}
            className={`nav-item ${current === v.key ? "active" : ""}`}
            onClick={() => go(v.key)}
            aria-current={current === v.key ? "page" : undefined}
          >
            <span className="nav-icon">
              <Icon name={VIEW_ICONS[v.key]} />
            </span>
            <span className="nav-label">
              <b>{v.ko}</b>
            </span>
          </button>
        ))}
      </nav>
      <div className="sidebar-note">
        <span className="cloud" aria-hidden>
          ☁️
        </span>
        <p>
          <b>追剧学汉语</b>와 함께
          <br />
          즐겁게 배워요! 💙
        </p>
      </div>
    </aside>
  );
};

export const Topbar: React.FC<{ active: ViewKey }> = ({ active }) => {
  const [q, setQ] = useState("");
  const { user } = useAuth();
  const go = useGuardedNavigate();
  const view = getView(active);
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="mobile-logo">
          <Logo compact />
        </span>
        <h1>
          {view.ko}
        </h1>
      </div>
      <form
        className="search"
        hidden={user?.role === "instructor"}
        onSubmit={(e) => {
          e.preventDefault();
          go("situations", q.trim() ? { q: q.trim() } : undefined);
        }}
      >
        <Icon name="search" size={18} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="드라마, 표현, 장면을 검색해 보세요…"
          aria-label="검색"
        />
      </form>
      <AuthControls />
    </header>
  );
};

export const MobileNav: React.FC<{ active: ViewKey }> = ({ active }) => {
  const { menu, current, go } = useMenu(active);
  return (
    <nav className="mobile-nav">
      {menu.map((v) => (
        <button
          key={v.key}
          className={current === v.key ? "active" : ""}
          onClick={() => go(v.key)}
        >
          <Icon name={VIEW_ICONS[v.key]} size={20} />
          <span>{v.ko}</span>
        </button>
      ))}
    </nav>
  );
};

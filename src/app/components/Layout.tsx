import React, { useState } from "react";
import { AuthControls } from "../auth/AuthControls";
import { useGuardedNavigate } from "../auth/LoginPrompt";
import { useAuth } from "../auth/AuthContext";
import { MENU_PARENT, getView, menuFor, navigate, type ViewKey } from "../router";
import { Icon, type IconName } from "./Icon";

const VIEW_ICONS: Record<ViewKey, IconName> = {
  home: "home",
  weeks: "play",
  course: "play",
  lesson: "play",
  material: "book",
  present: "play",
  "live-quiz": "grid",
  "live-host": "grid",
  live: "grid",
  situations: "clapper",
  culture: "book",
  mine: "chart",
  teach: "calendar",
  "teach-course": "calendar",
  admin: "grid",
  "admin-course": "calendar",
  "admin-editor": "plus",
  "admin-learners": "users",
  "admin-progress": "chart",
  "admin-instructors": "shield",
  join: "users",
};

/** 현재 역할의 메뉴와, 활성 표시할 메뉴 key */
const useMenu = (active: ViewKey) => {
  const { user } = useAuth();
  const go = useGuardedNavigate();
  const menu = menuFor(user);
  // 학습자료 편집은 관리자는 ‘전체 강의’, 교수자는 ‘내 담당 강의’ 아래에 있다.
  const parent = MENU_PARENT[active] ?? active;
  const current = menu.some((v) => v.key === parent) ? parent : active === "admin-editor" ? "teach" : parent;
  return { menu, current, homeKey: menu[0].key, go };
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

// 지금 검색은 legacy 상황별 장면(situations.ts)만 찾는다. 공개 Lesson 기반 통합 검색을 만들 때까지 숨긴다.
const SEARCH_ENABLED: boolean = false;

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
        hidden={!SEARCH_ENABLED || user?.role === "instructor"}
        onSubmit={(e) => {
          e.preventDefault();
          go("weeks", q.trim() ? { tab: "situations", q: q.trim() } : { tab: "situations" });
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

/** 하단 메뉴에 바로 보여줄 최대 개수. 넘으면(관리자) 나머지는 ‘더보기’로 묶는다. */
const MOBILE_NAV_LIMIT = 5;

export const MobileNav: React.FC<{ active: ViewKey }> = ({ active }) => {
  const { menu, current, go } = useMenu(active);
  const [moreOpen, setMoreOpen] = useState(false);
  const overflow = menu.length > MOBILE_NAV_LIMIT;
  const primary = overflow ? menu.slice(0, MOBILE_NAV_LIMIT - 1) : menu;
  const more = overflow ? menu.slice(MOBILE_NAV_LIMIT - 1) : [];
  const moreActive = more.some((v) => v.key === current);
  return (
    <nav className="mobile-nav">
      {primary.map((v) => (
        <button
          key={v.key}
          className={current === v.key ? "active" : ""}
          aria-current={current === v.key ? "page" : undefined}
          onClick={() => {
            setMoreOpen(false);
            go(v.key);
          }}
        >
          <Icon name={VIEW_ICONS[v.key]} size={20} />
          <span>{v.ko}</span>
        </button>
      ))}
      {overflow ? (
        <button className={moreActive || moreOpen ? "active" : ""} aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
          <Icon name="grid" size={20} />
          <span>더보기</span>
        </button>
      ) : null}
      {moreOpen ? (
        <div className="mobile-more">
          {more.map((v) => (
            <button
              key={v.key}
              className={current === v.key ? "active" : ""}
              onClick={() => {
                setMoreOpen(false);
                go(v.key);
              }}
            >
              <Icon name={VIEW_ICONS[v.key]} size={18} />
              <span>{v.ko}</span>
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  );
};

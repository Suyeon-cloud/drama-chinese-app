import { useEffect, useState } from "react";
import type { UserRole } from "./auth/roles";

export type ViewKey =
  // 학습자
  | "home"
  | "weeks"
  | "lesson"
  | "situations"
  | "culture"
  | "mine"
  // 학생 참여 링크 #/join/{courseCode}
  | "join"
  // 관리자(교수자)
  | "admin"
  | "admin-course"
  | "admin-editor"
  | "admin-learners"
  | "admin-progress"
  | "admin-feedback"
  | "admin-instructors";

/** requiresLogin: 로그인하지 않으면 “로그인 후 이용하세요.” 안내 (수업·학습 콘텐츠) */
export type ViewDef = { key: ViewKey; ko: string; requiresLogin?: boolean; adminOnly?: boolean };

export const VIEWS: ViewDef[] = [
  { key: "home", ko: "홈" },
  { key: "weeks", ko: "주차별 학습" },
  { key: "lesson", ko: "주차별 학습", requiresLogin: true },
  { key: "situations", ko: "상황별 장면", requiresLogin: true },
  { key: "culture", ko: "한중문화", requiresLogin: true },
  { key: "mine", ko: "나의 학습", requiresLogin: true },
  { key: "join", ko: "수업 참여" },
  { key: "admin", ko: "대시보드", adminOnly: true },
  { key: "admin-course", ko: "수업 관리", adminOnly: true },
  { key: "admin-editor", ko: "강의자료 만들기", adminOnly: true },
  { key: "admin-learners", ko: "학습자 관리", adminOnly: true },
  { key: "admin-progress", ko: "학습 현황", adminOnly: true },
  { key: "admin-feedback", ko: "피드백", adminOnly: true },
  { key: "admin-instructors", ko: "교수자 관리", adminOnly: true },
];

const LEARNER_MENU: ViewKey[] = ["home", "weeks", "situations", "culture", "mine"];
const ADMIN_MENU: ViewKey[] = [
  "admin",
  "admin-course",
  "admin-editor",
  "admin-learners",
  "admin-progress",
  "admin-feedback",
  "admin-instructors",
];

export const getView = (key: ViewKey) => VIEWS.find((v) => v.key === key)!;

/** 역할별 사이드바/모바일 메뉴 */
export const menuFor = (role: UserRole | null): ViewDef[] =>
  (role === "instructor" ? ADMIN_MENU : LEARNER_MENU).map(getView);

/** 메뉴에 없는 화면이 어느 메뉴에 속하는지 (활성 표시용) */
export const MENU_PARENT: Partial<Record<ViewKey, ViewKey>> = { lesson: "weeks" };

/** 1차 판본 링크(#/drama?…) 호환 */
const ALIASES: Record<string, ViewKey> = { drama: "lesson" };

export type Route = { view: ViewKey; params: URLSearchParams };

const parse = (): Route => {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  // 참여 링크: #/join/{courseCode}
  const [head, ...rest] = path.split("/");
  if (head === "join") {
    if (rest.length) params.set("code", decodeURIComponent(rest.join("/")));
    return { view: "join", params };
  }
  const view = ALIASES[path] ?? VIEWS.find((v) => v.key === path)?.key ?? "home";
  return { view, params };
};

export const navigate = (view: ViewKey, params?: Record<string, string | number>) => {
  const qs = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  window.location.hash = `/${view}${qs}`;
};

/** Hash-based routing so the browser back button works without a router dependency. */
export const useRoute = (): Route => {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      document.querySelector(".main")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
};

/** 학생에게 보낼 수업 참여 링크 */
export const joinUrl = (courseCode: string) =>
  `${window.location.origin}${window.location.pathname}#/join/${encodeURIComponent(courseCode)}`;

import { useEffect, useState } from "react";
import type { UserRole } from "./auth/roles";

export type ViewKey =
  // 학습자
  | "home"
  | "weeks"
  // 과목 커리큘럼 #/course?id={courseId}
  | "course"
  | "lesson"
  | "situations"
  | "culture"
  | "mine"
  // 학생 참여 링크 #/join/{courseCode}
  | "join"
  // 교수자(Google): 내 담당 강의, 담당 강의 #/teach-course?id={courseId}&tab=students|lessons
  | "teach"
  | "teach-course"
  // 관리자(아이디·비밀번호) — admin-editor는 교수자도 담당 과목 학습자료 편집에 쓴다
  | "admin"
  | "admin-course"
  | "admin-editor"
  | "admin-learners"
  | "admin-progress"
  | "admin-feedback"
  | "admin-instructors";

/** staff: 교수자·관리자 / admin: 관리자(아이디·비밀번호 로그인)만 / instructor: 교수자(Google)만 */
export type ViewAccess = "staff" | "admin" | "instructor";

/**
 * requiresLogin: 로그인하지 않으면 “로그인 후 이용하세요.” 안내 (수업·학습 콘텐츠)
 * access: 역할별 화면. 화면 접근만 나누고, 실제 데이터 권한은 서버(server/api.ts)가 검사한다.
 */
export type ViewDef = { key: ViewKey; ko: string; requiresLogin?: boolean; access?: ViewAccess };

export const VIEWS: ViewDef[] = [
  { key: "home", ko: "홈" },
  // 내 강의(수강 중인 드라마 과목 + 강의코드 등록)와 상황별 장면 탭
  { key: "weeks", ko: "내 강의" },
  { key: "course", ko: "내 강의", requiresLogin: true },
  { key: "lesson", ko: "주차별 학습", requiresLogin: true },
  // 상황별 장면은 ‘내 강의’ 화면의 탭으로 합쳐졌다. (이전 링크 호환용)
  { key: "situations", ko: "내 강의" },
  { key: "culture", ko: "한중문화", requiresLogin: true },
  { key: "mine", ko: "내 대시보드", requiresLogin: true },
  { key: "join", ko: "수업 참여" },
  { key: "teach", ko: "내 담당 강의", access: "instructor" },
  { key: "teach-course", ko: "내 담당 강의", access: "instructor" },
  { key: "admin", ko: "전체 운영 관리", access: "admin" },
  { key: "admin-learners", ko: "회원 관리", access: "admin" },
  { key: "admin-instructors", ko: "분반·교강사", access: "admin" },
  { key: "admin-course", ko: "전체 학습자료", access: "admin" },
  { key: "admin-editor", ko: "학습자료 편집", access: "staff" },
  { key: "admin-progress", ko: "학습 현황", access: "admin" },
  { key: "admin-feedback", ko: "피드백", access: "admin" },
];

const LEARNER_MENU: ViewKey[] = ["home", "weeks", "culture", "mine"];
const INSTRUCTOR_MENU: ViewKey[] = ["teach"];
const ADMIN_MENU: ViewKey[] = [
  "admin",
  "admin-learners",
  "admin-instructors",
  "admin-course",
  "admin-progress",
  "admin-feedback",
];

export const getView = (key: ViewKey) => VIEWS.find((v) => v.key === key)!;

type RoleUser = { role: UserRole; provider: "google" | "admin" } | null | undefined;

/** 이 사용자가 화면에 들어갈 수 있는지 (로그인 여부는 requiresLogin으로 따로 본다) */
export const canAccessView = (def: ViewDef, user: RoleUser) => {
  if (!def.access) return true;
  if (!user || user.role !== "instructor") return false;
  if (def.access === "admin") return user.provider === "admin";
  if (def.access === "instructor") return user.provider === "google";
  return true;
};

/** 역할별 사이드바/모바일 메뉴: 관리자 → 전체 운영 관리, 교수자 → 내 담당 강의, 그 외 → 학습자 */
export const menuFor = (user: RoleUser): ViewDef[] =>
  (user?.provider === "admin" ? ADMIN_MENU : user?.role === "instructor" ? INSTRUCTOR_MENU : LEARNER_MENU).map(
    getView,
  );

/** 메뉴에 없는 화면이 어느 메뉴에 속하는지 (활성 표시용) */
export const MENU_PARENT: Partial<Record<ViewKey, ViewKey>> = {
  course: "weeks",
  lesson: "weeks",
  situations: "weeks",
  "teach-course": "teach",
  "admin-editor": "admin-course",
};

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

// 역할(교수자/학습자) 판별. 로그인 방식과 분리해 두고, 등록된 교수자 이메일 목록으로만 정한다.
// 사용자가 역할을 직접 고르지 않는다.
//
// 주의: 프런트엔드에서만 하는 판별이라 화면 접근 제어 수준이며 서버 권한 검증이 아니다.
// 원격 DB를 연결할 때 서버 측 권한 검사를 함께 두어야 한다.

export type UserRole = "instructor" | "learner";

export const ROLE_LABEL: Record<UserRole, string> = {
  instructor: "교수자",
  learner: "학습자",
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const resolveRole = (email: string, instructorEmails: string[]): UserRole =>
  instructorEmails.indexOf(normalizeEmail(email)) >= 0 ? "instructor" : "learner";

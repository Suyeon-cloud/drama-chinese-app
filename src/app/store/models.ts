// 학습 기록·회원·피드백 데이터 모델. 브라우저와 서버(server/)가 같은 형태를 사용한다.
import type { UserRole } from "../auth/roles";

export type QuizResult = {
  correct: number;
  total: number;
  /** ISO datetime */
  submittedAt: string;
};

/** 학습자 × 강의자료 1건의 학습 기록 */
export type LessonProgress = {
  userId: string;
  lessonId: string;
  week: number;
  /** 출석/학습 시작: 처음 영상을 재생한 시각 */
  startedAt: string | null;
  /** 학습 구간 끝까지 시청한 시각 */
  completedAt: string | null;
  /** 실제로 재생한 구간 [start, end] (seconds, 겹치지 않게 병합) */
  watchedRanges: [number, number][];
  /** 학습 구간 대비 실제 재생 비율 0~1 */
  progressRatio: number;
  /** 최대 재생 위치 (seconds) */
  maxPosition: number;
  /** 가장 최근 퀴즈 결과 */
  quiz: QuizResult | null;
  /** 퀴즈 응시 횟수 */
  quizAttempts: number;
  lastStudiedAt: string | null;
};

/** 회원 승인 상태: pending(승인 대기) → approved(승인 완료). 승인 전에는 화면을 사용할 수 없다. */
export type MemberStatus = "pending" | "approved";

/** 구글 로그인 후 회원이 직접 입력하는 정보 */
export type MemberProfileInput = {
  /** 성명 */
  name: string;
  /** 대학 */
  university: string;
  /** 학과 */
  department: string;
  /** 학년 */
  grade: string;
  /** 학번 */
  studentId: string;
  /** 연락용 이메일 (기본값: 구글 이메일) */
  email: string;
  /** 휴대폰 번호 */
  phone: string;
};

/** 회원(학습자) — 서버 DB에 저장된다. */
export type LearnerProfile = MemberProfileInput & {
  /** Google 계정 고유 ID (sub) */
  id: string;
  /** 로그인한 Google 계정 이메일 */
  googleEmail: string;
  avatarColor: string;
  /** Google 프로필 이미지 URL */
  picture?: string | null;
  status: MemberStatus;
  /** 회원정보 입력을 마쳤는지 */
  profileCompleted: boolean;
  /** 가입일 (처음 구글 로그인한 시각) */
  firstSeenAt: string;
  /** 최종 접속일 */
  lastSeenAt: string;
  approvedAt: string | null;
};

export const EMPTY_PROFILE: MemberProfileInput = {
  name: "",
  university: "",
  department: "",
  grade: "",
  studentId: "",
  email: "",
  phone: "",
};

/** draft: 작성 중, approved: 관리자 확인 완료, sent: 발송 완료 */
export type FeedbackStatus = "draft" | "approved" | "sent";

/** gmail-api: Gmail API 실제 발송, gmail-compose: Gmail 작성 화면 연결(fallback) */
export type FeedbackChannel = "gmail-api" | "gmail-compose";

/** 학습 결과 기반 피드백 — 향후 Gmail 발송에 그대로 사용한다. */
export type FeedbackDraft = {
  id: string;
  learnerId: string;
  lessonId: string;
  to: string;
  subject: string;
  body: string;
  status: FeedbackStatus;
  channel: FeedbackChannel | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  /** Gmail API 발송 시 message id */
  externalMessageId: string | null;
};

/** env: INITIAL_INSTRUCTOR_EMAIL 환경변수(해제 불가), local: 교수자 관리 화면에서 등록 */
export type InstructorRecord = {
  email: string;
  source: "env" | "local";
  addedBy: string | null;
  addedAt: string | null;
};

/** 한 학기(15주) 수업. 학생은 참여 코드가 담긴 링크(#/join/{code})로 참여한다. */
export type CourseInfo = {
  code: string;
  title: string;
  createdAt: string;
};

export type Enrollment = {
  courseCode: string;
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
};

/** 서버 세션의 로그인 사용자 (GET /api/auth/me). 관리자는 provider "admin", 회원은 "google". */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  picture: string | null;
  avatarColor: string;
  provider: "google" | "admin";
  role: UserRole;
  /** 학습자 회원 정보 (관리자·교수자는 null) */
  member: LearnerProfile | null;
};

/** GET /api/config — 배포 환경변수에서 읽는 공개 설정 */
export type PublicConfig = {
  googleClientId: string;
  /** ADMIN_ID·ADMIN_PASSWORD가 설정되어 관리자 로그인이 가능한지 */
  adminLoginEnabled: boolean;
};

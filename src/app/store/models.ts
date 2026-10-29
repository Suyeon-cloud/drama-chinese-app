// 학습 기록·회원·피드백 데이터 모델. 브라우저와 서버(server/)가 같은 형태를 사용한다.
import type { UserRole } from "../auth/roles";
import type { LessonStatus } from "../../content/types";

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

/** active: 운영 중인 과목, legacy: 3과목 개편 전 자료 보관용 (학습 화면에 나오지 않음) */
export type CourseStatus = "active" | "legacy";

/**
 * 과목 (중국 드라마 1편 = 중국어 과목 1개, 1~15주). 기본 과목은 src/content/courses.ts.
 * 과목마다 강의코드가 따로 있고, 학생은 강의코드(또는 #/join/{code} 링크)로 수강 등록한다.
 */
export type Course = {
  id: string;
  /** 드라마 제목 (예: 当我飞奔向你) */
  drama: string;
  /** 과목명 (예: 校园生活汉语) */
  title: string;
  /** 주요 학습 맥락 */
  context: string;
  description: string;
  /**
   * (이전 구조) 과목 강의코드. 분반 도입 후 수강 등록은 분반(Section) 강의코드로 한다.
   * 운영 과목의 이 코드는 기본 01분반 강의코드로 이어졌고, 호환을 위해 지우지 않는다.
   */
  code: string;
  weekCount: number;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
};

/** 이전 이름 (1과목 시절 GET /api/course 응답) */
export type CourseInfo = Course;

/** 학습자에게 보내는 과목 정보 (강의코드 제외). section: 내가 수강 중인 분반 (교강사 이름은 알려진 경우만) */
export type CourseSummary = Omit<Course, "code"> & {
  section?: { id: string; name: string; instructorNames: string[] };
};

/**
 * 학습자용 커리큘럼 한 주차. 준비 중인 주차도 주차·학습 주제·상태만 보여준다.
 * 학습 콘텐츠(자막·표현·퀴즈 등)는 들어 있지 않다. 공개된 주차만 영상 id(썸네일용)를 준다.
 */
export type CurriculumWeek = {
  lessonId: string;
  week: number;
  /** 학습 주제 */
  title: string;
  status: LessonStatus;
  youtubeId: string | null;
};

/** GET /api/courses/:id/curriculum */
export type CourseCurriculum = { course: CourseSummary; weeks: CurriculumWeek[] };

/** 분반 담당 교강사 (name: 교강사가 Google로 로그인했을 때 받은 이름, 모르면 없음) */
export type SectionTeacher = { email: string; name?: string };

/** 교수자·관리자용 분반 정보 */
export type SectionOverview = Section & { instructors: SectionTeacher[]; enrolledCount: number };

/**
 * 교수자·관리자용 과목 정보 (GET /api/courses).
 * sections: 관리자는 모든 분반, 교수자는 담당 분반만. enrolledCount도 그 분반들의 합이다.
 */
export type CourseOverview = Course & {
  sections: SectionOverview[];
  enrolledCount: number;
  lessonCount: number;
  publishedCount: number;
};

/** 과목 수강생 (GET /api/courses/:id/students) */
export type CourseStudent = {
  userId: string;
  name: string;
  email: string;
  studentId: string;
  joinedAt: string;
  sectionId: string;
  sectionName: string;
};

/** 과목 수강생과 그 과목 강의자료의 학습 기록 */
export type CourseStudents = { students: CourseStudent[]; progress: LessonProgress[] };

/** POST /api/enrollments — alreadyEnrolled: 이미 수강 중이던 과목 (새로 등록하지 않음) */
export type EnrollResult = {
  enrollment: Enrollment;
  course: CourseSummary;
  section: { id: string; name: string };
  alreadyEnrolled: boolean;
};

/** GET /api/courses/lookup — 강의코드로 찾은 과목과 분반 */
export type CourseLookup = CourseSummary & { sectionName: string };

/** active: 운영 중 (강의코드로 등록 가능), inactive: 비활성 (신규 등록만 막고 수강·기록은 보존) */
export type SectionStatus = "active" | "inactive";

/**
 * 분반: 과목(Course) 아래에서 실제 수업이 운영되는 단위. 강의코드·담당 교강사·수강생은 분반에 속한다.
 * 학습자료(Lesson 15주)는 분반마다 복제하지 않고 과목의 것을 함께 쓴다.
 */
export type Section = {
  id: string;
  courseId: string;
  /** 예: 01분반 */
  name: string;
  /** 학생이 입력하는 강의코드 (분반마다 다름) */
  code: string;
  status: SectionStatus;
  createdAt: string;
  updatedAt: string;
};

/** 분반–교강사 배정 (key: sectionId::email). 교강사 1명이 여러 분반을, 분반 1개를 여러 교강사가 맡을 수 있다. */
export type SectionInstructor = {
  sectionId: string;
  email: string;
  assignedAt: string;
  /** 배정한 사람 (관리자 이메일 또는 이름) */
  assignedBy: string | null;
};

/**
 * (이전 구조) 교수자–과목 배정. 분반 도입 후에는 권한에 쓰지 않는다.
 * 데이터는 지우지 않고, 마이그레이션 때 그 과목의 기본 01분반 배정(SectionInstructor)으로 옮긴다.
 */
export type CourseInstructor = {
  courseId: string;
  email: string;
  assignedAt: string;
  /** 배정한 사람 (관리자 이메일 또는 이름) */
  assignedBy: string | null;
};

/**
 * 수강 등록 (학생 × 분반, key: sectionId::userId). 학생은 과목마다 운영 중인 분반 하나를 수강하고,
 * 서로 다른 과목은 동시에 들을 수 있다. courseId는 조회 편의용(분반의 과목)이다.
 * 기존 자료 과목의 예전 기록에는 sectionId가 없다 (key: courseId::userId 그대로).
 */
export type Enrollment = {
  sectionId?: string;
  courseId: string;
  /** 등록할 때 입력한 강의코드 */
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

// 6-A: 실시간 퀴즈 문제 세트 — Supabase RPC 호출 (server-only)
//
// - 관리자: service-role client로 admin_* RPC / 교수자: 사용자 token client로 list·save·delete RPC (권한은 DB 함수가 최종 확인)
// - 테이블 직접 권한은 없다. RPC는 화면 형태(camelCase) JSON을 돌려준다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveQuizSet, LiveQuizSetInput } from "../src/content/liveQuiz";
import type { LiveAction, LiveHostState, LiveHostSummary, LiveStudentState } from "../src/content/liveSession";

type PgError = { code?: string; message: string };

export const liveQuizOps = (client: SupabaseClient, admin: boolean, toError: (e: PgError) => Error, adminLabel = "") => {
  const ok = <T>(r: { data: T | null; error: PgError | null }): T => {
    if (r.error) throw toError(r.error);
    return r.data as T;
  };
  return {
    async list(courseId: string): Promise<LiveQuizSet[]> {
      const data = ok(await client.rpc(admin ? "admin_list_live_quiz_sets" : "list_live_quiz_sets", { p_course_id: courseId }));
      return Array.isArray(data) ? (data as LiveQuizSet[]) : [];
    },
    /** 새 세트(setId=null) 또는 수정(expectedVersion 필수) */
    async save(courseId: string | null, setId: string | null, input: LiveQuizSetInput, expectedVersion: number | null): Promise<LiveQuizSet> {
      const args = { p_course_id: courseId, p_set_id: setId, p_input: input, p_expected_version: expectedVersion };
      return ok(
        await (admin ? client.rpc("admin_save_live_quiz_set", { ...args, p_admin_label: adminLabel }) : client.rpc("save_live_quiz_set", args)),
      ) as LiveQuizSet;
    },
    async remove(setId: string): Promise<{ ok: true }> {
      ok(await client.rpc(admin ? "admin_delete_live_quiz_set" : "delete_live_quiz_set", { p_set_id: setId }));
      return { ok: true };
    },
  };
};

/** 6-B: 실시간 퀴즈 세션 — 교수자·학생 모두 사용자 token client로 RPC (권한·수강·상태는 DB 함수가 최종 확인) */
export const liveSessionOps = (client: SupabaseClient, toError: (e: PgError) => Error) => {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const r = await client.rpc(fn, args);
    if (r.error) throw toError(r.error);
    return r.data as T;
  };
  return {
    start: (setId: string, sectionId: string) => call<LiveHostState>("start_live_session", { p_set_id: setId, p_section_id: sectionId }),
    control: (sessionId: string, action: LiveAction, version: number) =>
      call<LiveHostState>("live_session_control", { p_session_id: sessionId, p_action: action, p_expected_version: version }),
    hostState: (sessionId: string) => call<LiveHostState>("live_session_host_state", { p_session_id: sessionId }),
    hostSessions: (courseId: string) => call<LiveHostSummary[]>("my_live_host_sessions", { p_course_id: courseId }),
    join: (code: string) => call<LiveStudentState>("join_live_session", { p_code: code }),
    studentState: (sessionId: string) => call<LiveStudentState>("live_session_student_state", { p_session_id: sessionId }),
    submit: (sessionId: string, questionIndex: number, choice: number) =>
      call<LiveStudentState>("submit_live_answer", { p_session_id: sessionId, p_question_index: questionIndex, p_choice: choice }),
  };
};

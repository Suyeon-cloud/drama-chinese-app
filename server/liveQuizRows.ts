// 6-A: 실시간 퀴즈 문제 세트 — Supabase RPC 호출 (server-only)
//
// - 관리자: service-role client로 admin_* RPC / 교수자: 사용자 token client로 list·save·delete RPC (권한은 DB 함수가 최종 확인)
// - 테이블 직접 권한은 없다. RPC는 화면 형태(camelCase) JSON을 돌려준다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveQuizSet, LiveQuizSetInput } from "../src/content/liveQuiz";

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

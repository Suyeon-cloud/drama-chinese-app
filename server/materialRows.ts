// 주차별 보충 학습자료 (Supabase week_materials) 행 변환과 RPC 호출 (server-only)
//
// - 관리자: service-role client로 admin_* RPC (기존 자료 과목 포함, 권한 검사는 API의 관리자 세션 확인)
// - 교수자·학생: 사용자 token client로 목록 RPC(list_week_materials)와 교수자 RPC — 테이블 직접 권한은 없다.
//   (권한·주차 범위·개수 한도·학생에게 보낼 행과 열은 DB 함수가 최종 확인)
// - 응답은 JSON 모드 API와 같은 WeekMaterial 형태로 맞춘다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeekMaterial } from "../src/app/store/models";
import type { MaterialCreate, MaterialPatch } from "./weekMaterials";

type Row = Record<string, unknown>;
type PgError = { code?: string; message: string; details?: string | null };

export const MATERIAL_COLUMNS =
  "id,course_id,week,kind,title,description,url,file_name,mime_type,size_bytes,status,position,created_at,updated_at,updated_by_label";

/** week_materials 행 → WeekMaterial. (storage_path는 화면에 보내지 않는다) */
export const materialFromRow = (r: Row): WeekMaterial => ({
  id: String(r.id),
  courseId: String(r.course_id),
  week: Number(r.week),
  kind: r.kind === "file" ? "file" : "link",
  title: String(r.title ?? ""),
  description: String(r.description ?? ""),
  url: String(r.url ?? ""),
  ...(r.kind === "file"
    ? { fileName: String(r.file_name ?? ""), mimeType: String(r.mime_type ?? ""), sizeBytes: Number(r.size_bytes ?? 0) }
    : {}),
  status: r.status === "published" ? "published" : "draft",
  position: Number(r.position ?? 0),
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? ""),
  updatedByLabel: (r.updated_by_label as string | null) ?? null,
});

/** 입력 → RPC p_input (camelCase 칸 이름 그대로, 보낸 칸만) */
export const materialInput = (v: MaterialCreate | MaterialPatch) => {
  const out: Record<string, unknown> = {};
  for (const k of ["week", "title", "description", "url", "status"] as const) if (v[k] !== undefined) out[k] = v[k];
  return out;
};

/**
 * 보충 자료 작업 묶음. admin=true: admin_* RPC(service-role client) / false: 교수자 RPC(사용자 client).
 * toError: 각 client 경로의 오류 변환 (관리자·사용자 경로가 쓰는 기존 변환 함수)
 */
export const materialOps = (client: SupabaseClient, admin: boolean, toError: (e: PgError) => Error, adminLabel = "") => {
  const ok = <T>(r: { data: T | null; error: PgError | null }): NonNullable<T> => {
    if (r.error) throw toError(r.error);
    return (r.data ?? []) as NonNullable<T>;
  };
  return {
    /**
     * 과목 자료 (주차 → 순서).
     * 관리자: service-role로 테이블을 직접 읽는다. 사용자: 테이블 권한이 없어 list_week_materials RPC로만 —
     * 학생은 published만, 마지막 수정자 표시는 교수자에게만 온다. (행·열 모두 DB 함수가 거른다)
     */
    async list(courseId: string): Promise<WeekMaterial[]> {
      const rows = admin
        ? (ok(
            await client.from("week_materials").select(MATERIAL_COLUMNS).eq("course_id", courseId).order("week").order("position").order("created_at"),
          ) as Row[])
        : (ok(await client.rpc("list_week_materials", { p_course_id: courseId })) as Row[]);
      return rows.map(materialFromRow);
    },
    async create(courseId: string, input: MaterialCreate): Promise<WeekMaterial> {
      const args = { p_course_id: courseId, p_material_id: null, p_input: materialInput(input) };
      const row = admin
        ? ok(await client.rpc("admin_save_week_material", { ...args, p_admin_label: adminLabel }))
        : ok(await client.rpc("save_week_material", args));
      return materialFromRow(row as Row);
    },
    async update(materialId: string, patch: MaterialPatch): Promise<WeekMaterial> {
      const args = { p_course_id: null, p_material_id: materialId, p_input: materialInput(patch) };
      const row = admin
        ? ok(await client.rpc("admin_save_week_material", { ...args, p_admin_label: adminLabel }))
        : ok(await client.rpc("save_week_material", args));
      return materialFromRow(row as Row);
    },
    /** 삭제. 지운 행을 돌려준다 (3-C: 파일 자료면 그 storage_path 객체를 서버가 지운다) */
    async remove(materialId: string): Promise<{ ok: true }> {
      ok(await client.rpc(admin ? "admin_delete_week_material" : "delete_week_material", { p_material_id: materialId }));
      return { ok: true };
    },
    async reorder(courseId: string, week: number, ids: string[]): Promise<WeekMaterial[]> {
      const rows = ok(
        await client.rpc(admin ? "admin_reorder_week_materials" : "reorder_week_materials", { p_course_id: courseId, p_week: week, p_ids: ids }),
      ) as Row[];
      return rows.map(materialFromRow);
    },
  };
};

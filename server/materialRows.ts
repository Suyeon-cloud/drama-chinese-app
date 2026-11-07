// 주차별 보충 학습자료 (Supabase week_materials) 행 변환과 RPC 호출 (server-only)
//
// - 관리자: service-role client로 admin_* RPC (기존 자료 과목 포함, 권한 검사는 API의 관리자 세션 확인)
// - 교수자·학생: 사용자 token client로 목록 RPC(list_week_materials)와 교수자 RPC — 테이블 직접 권한은 없다.
//   (권한·주차 범위·개수 한도·학생에게 보낼 행과 열은 DB 함수가 최종 확인)
// - 응답은 JSON 모드 API와 같은 WeekMaterial 형태로 맞춘다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeekMaterial, WeekMaterialHtml, WeekMaterialSource } from "../src/app/store/models";
import type { MaterialCreate, MaterialPatch, MaterialSourceInput } from "./weekMaterials";

type Row = Record<string, unknown>;
type PgError = { code?: string; message: string; details?: string | null };

export const MATERIAL_COLUMNS =
  "id,course_id,week,kind,title,description,url,file_name,mime_type,size_bytes,status,position,created_at,updated_at,updated_by_label";

/** week_materials 행 → WeekMaterial. (storage_path는 화면에 보내지 않는다) */
export const materialFromRow = (r: Row): WeekMaterial => ({
  id: String(r.id),
  courseId: String(r.course_id),
  week: Number(r.week),
  kind: r.kind === "file" ? "file" : r.kind === "html" ? "html" : "link",
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
  ...(r.source_kind === "lesson-review"
    ? { source: { kind: "lesson-review" as const, lessonId: (r.source_lesson_id as string | null) ?? null, lessonUpdatedAt: (r.source_lesson_updated_at as string | null) ?? null } }
    : {}),
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
    async remove(materialId: string): Promise<{ ok: true; courseId: string | null; storagePath: string | null }> {
      const row = ok(await client.rpc(admin ? "admin_delete_week_material" : "delete_week_material", { p_material_id: materialId })) as Row;
      return {
        ok: true,
        courseId: (row?.course_id as string | null) ?? null,
        storagePath: (row?.storage_path as string | null) ?? null,
      };
    },
    /**
     * HTML 학습자료 등록(materialId=null) · 수정. html은 본문(바꿀 때만), input은 주차·제목·설명·공개 상태(보낸 칸만).
     * 관리자: admin_save_week_material_html(service-role) / 교수자: save_week_material_html (can_manage_course는 DB가 확인)
     */
    async saveHtml(
      courseId: string | null,
      materialId: string | null,
      input: MaterialCreate | MaterialPatch,
      html: string | null,
      /** 5-B: 등록 { kind, lessonId, lessonUpdatedAt } / 재생성 { lessonUpdatedAt } */
      source?: MaterialSourceInput | { lessonUpdatedAt: string },
    ): Promise<WeekMaterial> {
      const args = { p_course_id: courseId, p_material_id: materialId, p_input: { ...materialInput(input), ...(source ? { source } : {}) }, p_html: html };
      const row = admin
        ? ok(await client.rpc("admin_save_week_material_html", { ...args, p_admin_label: adminLabel }))
        : ok(await client.rpc("save_week_material_html", args));
      return materialFromRow(row as Row);
    },
    /**
     * HTML 본문 열기. 사용자: week_material_html RPC (편집·담당 교수자는 비공개 포함, 학생은 수강 과목의 published만 — 그 밖은 P0002).
     * 관리자: service-role로 그 행을 읽는다. 없거나 HTML 자료가 아니면 null.
     */
    async readHtml(materialId: string): Promise<WeekMaterialHtml | null> {
      const rows = admin
        ? (ok(await client.from("week_materials").select("id,kind,title,html_body,updated_at").eq("id", materialId).limit(1)) as Row[])
        : (ok(await client.rpc("week_material_html", { p_material_id: materialId })) as Row[]);
      const r = (Array.isArray(rows) ? rows[0] : rows) as Row | undefined;
      if (!r || (admin && r.kind !== "html") || typeof r.html_body !== "string") return null;
      return { id: String(r.id), title: String(r.title ?? ""), html: r.html_body, updatedAt: String(r.updated_at ?? "") };
    },
    /**
     * 5-B: 그 과목 자동 생성 복습 HTML의 출처 (materialId → 출처). 교수자·관리자 화면용.
     * 관리자: service-role로 테이블, 교수자: list_week_material_sources RPC (비공개 포함 열람 권한이 있을 때만).
     * 실패하면(마이그레이션 전·권한 없음) 빈 결과 — 자료 목록 자체는 막지 않는다.
     */
    async sources(courseId: string): Promise<Map<string, WeekMaterialSource>> {
      const out = new Map<string, WeekMaterialSource>();
      const r = admin
        ? await client.from("week_materials").select("id,source_kind,source_lesson_id,source_lesson_updated_at").eq("course_id", courseId).not("source_kind", "is", null)
        : await client.rpc("list_week_material_sources", { p_course_id: courseId });
      if (r.error) {
        console.warn("[material-sources]", r.error.code ?? "", r.error.message);
        return out;
      }
      for (const row of (r.data ?? []) as Row[]) {
        const id = String(row.id ?? row.material_id ?? "");
        if (!id || row.source_kind !== "lesson-review") continue;
        out.set(id, { kind: "lesson-review", lessonId: (row.source_lesson_id as string | null) ?? null, lessonUpdatedAt: (row.source_lesson_updated_at as string | null) ?? null });
      }
      return out;
    },
    async reorder(courseId: string, week: number, ids: string[]): Promise<WeekMaterial[]> {
      const rows = ok(
        await client.rpc(admin ? "admin_reorder_week_materials" : "reorder_week_materials", { p_course_id: courseId, p_week: week, p_ids: ids }),
      ) as Row[];
      return rows.map(materialFromRow);
    },
  };
};

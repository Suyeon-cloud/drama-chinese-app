// 주차별 보충 자료 — 파일 업로드 완료·고아 파일 정리 (server-only, JSON·Supabase 공통 흐름)
//
// 순서 (DB에 깨진 파일 기록이 남지 않게: 파일을 확인한 뒤에만 자료 행을 만든다)
//   1) 업로드 시작: 서버가 권한을 확인하고 업로드 의도(intent: 토큰·과목·경로·크기·형식·올린 사람)를 기록한 뒤 업로드 주소를 준다.
//   2) 브라우저가 저장소에 직접 올린다.
//   3) 완료: 같은 사람인지·만료·중복 처리·권한을 다시 확인 → 의도를 "사용함"으로 표시(한 번만) → 파일 크기·형식·내용 검사
//      → 자료 행 생성(또는 교체) → 교체면 옛 파일 삭제. 어느 단계든 실패하면 올린 파일을 지운다.
//   남을 수 있는 것: 2)에서 끝내지 않은 업로드, 옛 파일 삭제 실패 → 고아 파일. 관리자 정리 API가 찾아 지운다(기본은 미리 보기).
import type { WeekMaterial, WeekMaterialStatus } from "../src/app/store/models";
import { MATERIAL_FILE_MAX_BYTES } from "../src/content/materialRules";
import { fileContentProblem, isCourseKey } from "./materialFiles";
import type { MaterialStorage, StoredObject } from "./materialStorage";
import { AdminDataError } from "./supabaseAdmin";

/** 업로드 주소 유효 시간 (Supabase 서명 업로드 주소가 2시간으로 고정이라 같게 둔다) */
export const UPLOAD_INTENT_MS = 2 * 60 * 60 * 1000;
/** 고아로 볼 최소 나이: 업로드 유효 시간 + 여유 */
export const ORPHAN_MIN_AGE_MS = UPLOAD_INTENT_MS + 60 * 60 * 1000;

export type UploadIntent = {
  token: string;
  courseId: string;
  /** 교체할 자료 (새 자료면 null) */
  materialId: string | null;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** 새 자료의 주차·제목·설명·공개 상태 (교체면 null) */
  input: { week: number; title: string; description: string; status: WeekMaterialStatus } | null;
  /** 같은 사람이 완료하는지 확인용: 관리자 "admin", 그 밖은 사용자 id */
  actorKey: string;
  actorId: string | null;
  actorLabel: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

export interface IntentStore {
  create(intent: UploadIntent): Promise<void>;
  get(token: string): Promise<UploadIntent | null>;
  /** 아직 쓰지 않은 의도를 "사용함"으로 바꾼다. 이미 썼으면 null (동시에 두 번 완료하는 것을 막는다) */
  consume(token: string): Promise<UploadIntent | null>;
  remove(token: string): Promise<void>;
  /** 아직 쓰지 않았고 만료되지 않은 의도의 저장 경로 (정리에서 제외) */
  activeKeys(): Promise<Set<string>>;
  /** 오래된(쓰였거나 만료된) 의도 기록 정리. 지운 개수 */
  purgeOld(): Promise<number>;
}

export interface FileRecords {
  insert(intent: UploadIntent): Promise<WeekMaterial>;
  /** 파일 교체. 옛 저장 경로를 함께 돌려준다 */
  replace(intent: UploadIntent): Promise<{ material: WeekMaterial; oldKey: string | null }>;
  /** 자료 행이 가리키는 모든 저장 경로 */
  referencedKeys(): Promise<Set<string>>;
}

export type UploadDeps = { storage: MaterialStorage; intents: IntentStore; records: FileRecords; log?: (msg: string) => void };

/**
 * 업로드 완료. actorKey: 요청한 사람, allowed: 지금도 그 과목(교체면 그 자료의 과목) 자료를 편집할 수 있는지
 */
export const completeUpload = async (
  deps: UploadDeps,
  token: string,
  actorKey: string,
  allowed: (intent: UploadIntent) => Promise<boolean>,
): Promise<WeekMaterial> => {
  const log = deps.log ?? ((m: string) => console.error(`[material-upload] ${m}`));
  const intent = await deps.intents.get(token);
  if (!intent || intent.actorKey !== actorKey) throw new AdminDataError(404, "업로드를 찾을 수 없어요. 파일을 다시 올려 주세요.");
  if (intent.consumedAt) throw new AdminDataError(409, "이미 처리한 업로드예요.");
  const key = intent.storageKey;
  const discard = async () => {
    await deps.storage.remove([key]).catch((e: unknown) => log(`올린 파일 삭제 실패(고아 정리 대상) ${key}: ${String(e)}`));
  };

  if (Date.parse(intent.expiresAt) < Date.now()) {
    if (await deps.intents.consume(token)) await discard();
    throw new AdminDataError(410, "업로드 시간이 지났어요. 파일을 다시 올려 주세요.");
  }
  if (!(await allowed(intent))) throw new AdminDataError(403, "담당 강의의 자료만 올릴 수 있어요.");
  if (!(await deps.intents.consume(token))) throw new AdminDataError(409, "이미 처리한 업로드예요.");

  const reject = async (status: number, message: string): Promise<never> => {
    await discard();
    throw new AdminDataError(status, message);
  };
  const info = await deps.storage.stat(key);
  if (!info) throw new AdminDataError(400, "올린 파일을 찾을 수 없어요. 파일을 다시 올려 주세요.");
  if (info.size !== intent.sizeBytes) return reject(400, "올린 파일의 크기가 처음 알려 준 크기와 달라요. 다시 올려 주세요.");
  if (info.size < 1 || info.size > MATERIAL_FILE_MAX_BYTES) return reject(400, `파일은 ${MATERIAL_FILE_MAX_BYTES / 1024 / 1024}MB까지 올릴 수 있어요.`);
  if (info.contentType && info.contentType.split(";")[0].trim() !== intent.mimeType) return reject(400, "파일 형식 정보가 처음과 달라요. 다시 올려 주세요.");
  let problem: string | null;
  try {
    problem = await fileContentProblem(intent.fileName, info.size, (s, e) => deps.storage.readRange(key, s, e));
  } catch (e) {
    log(`내용 검사 실패 ${key}: ${String(e)}`);
    problem = "파일 내용을 확인하지 못했어요. 다시 올려 주세요.";
  }
  if (problem) return reject(400, problem);

  try {
    if (intent.materialId) {
      const { material, oldKey } = await deps.records.replace(intent);
      if (oldKey && oldKey !== key && isCourseKey(intent.courseId, oldKey)) {
        await deps.storage.remove([oldKey]).catch((e: unknown) => log(`옛 파일 삭제 실패(고아 정리 대상) ${oldKey}: ${String(e)}`));
      }
      return material;
    }
    return await deps.records.insert(intent);
  } catch (e) {
    await discard();
    throw e;
  }
};

/** 자료 행도, 진행 중인 업로드도 가리키지 않고, 충분히 오래된 저장 객체 */
export const findOrphans = async (deps: UploadDeps, now = Date.now()): Promise<StoredObject[]> => {
  const [objects, referenced, active] = await Promise.all([deps.storage.listAll(), deps.records.referencedKeys(), deps.intents.activeKeys()]);
  return objects.filter((o) => {
    const age = now - Date.parse(o.createdAt);
    return !referenced.has(o.key) && !active.has(o.key) && Number.isFinite(age) && age > ORPHAN_MIN_AGE_MS;
  });
};

/** 고아 파일 정리. confirm이 true일 때만 지운다 (지우기 직전에 다시 확인한다) */
export const cleanupOrphans = async (deps: UploadDeps, confirm: boolean) => {
  const orphans = await findOrphans(deps);
  const summary = (list: StoredObject[]) => list.map((o) => ({ key: o.key, size: o.size, createdAt: o.createdAt }));
  if (!confirm) return { dryRun: true as const, orphans: summary(orphans), deleted: 0, purgedIntents: 0 };
  const again = new Set((await findOrphans(deps)).map((o) => o.key));
  const targets = orphans.filter((o) => again.has(o.key));
  if (targets.length) await deps.storage.remove(targets.map((o) => o.key));
  const purgedIntents = await deps.intents.purgeOld();
  return { dryRun: false as const, orphans: summary(targets), deleted: targets.length, purgedIntents };
};

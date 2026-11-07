// 주차별 보충 자료 — 파일 저장소 (server-only)
//
// 같은 모양의 두 저장소를 둔다. API는 어느 쪽인지 몰라도 된다.
//   - 로컬(JSON 모드·격리 QA): DATA_DIR/uploads/{courseId}/{uuid}.{ext}. 업로드·내려받기는 이 서버의 짧은 토큰 주소로.
//   - Supabase(운영): 비공개 버킷 week-materials. 업로드는 서명된 업로드 주소(2시간 고정), 내려받기는 60초 서명 주소.
// 모든 경로는 서버가 만든 "{courseId}/{uuid}.{ext}" 형식만 다룬다. (형식이 아니면 읽지도 지우지도 않는다)
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, statSync, unlinkSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_KEY_PATTERN } from "./materialFiles";

export const MATERIAL_BUCKET = "week-materials";
export const DOWNLOAD_URL_SECONDS = 60;

export type StoredObject = { key: string; size: number; createdAt: string };
export type ObjectInfo = { size: number; contentType: string | null; createdAt: string | null };

export interface MaterialStorage {
  readonly kind: "local" | "supabase";
  /** 업로드 주소 (브라우저가 PUT으로 올린다) */
  createUpload(key: string, mime: string, token: string): Promise<{ uploadUrl: string; headers: Record<string, string> }>;
  stat(key: string): Promise<ObjectInfo | null>;
  readRange(key: string, start: number, endInclusive: number): Promise<Buffer>;
  /** 짧게 유효한 열기·내려받기 주소. download: 내려받기 파일 이름 (없으면 브라우저에서 열기) */
  signedUrl(key: string, opts: { download: string | null; mime: string }): Promise<string>;
  remove(keys: string[]): Promise<void>;
  /** 저장된 모든 객체 (고아 정리용) */
  listAll(): Promise<StoredObject[]>;
}

const assertKey = (key: string) => {
  if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("잘못된 저장 경로");
};

/* ───────── 로컬 ───────── */

type LocalToken = { k: string; e: number; d: string | null; m: string };

export const createLocalMaterialStorage = (dir: string, secret: string) => {
  const fileOf = (key: string) => {
    assertKey(key);
    return path.join(dir, ...key.split("/"));
  };
  const sign = (payload: string) => createHmac("sha256", `material-file:${secret}`).update(payload).digest("base64url");

  const storage = {
    kind: "local" as const,
    async createUpload(_key: string, mime: string, token: string) {
      return { uploadUrl: `/api/material-uploads/${encodeURIComponent(token)}`, headers: { "Content-Type": mime } };
    },
    /** 업로드 PUT을 받은 서버가 파일을 쓴다 (임시 파일 → 이름 바꾸기) */
    write(key: string, body: Buffer) {
      const file = fileOf(key);
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.part`;
      writeFileSync(tmp, body);
      renameSync(tmp, file);
    },
    async stat(key: string): Promise<ObjectInfo | null> {
      const file = fileOf(key);
      if (!existsSync(file)) return null;
      const s = statSync(file);
      return { size: s.size, contentType: null, createdAt: s.mtime.toISOString() };
    },
    async readRange(key: string, start: number, endInclusive: number) {
      const fd = openSync(fileOf(key), "r");
      try {
        const len = Math.max(0, endInclusive - start + 1);
        const buf = Buffer.alloc(len);
        const n = readSync(fd, buf, 0, len, start);
        return buf.subarray(0, n);
      } finally {
        closeSync(fd);
      }
    },
    async signedUrl(key: string, opts: { download: string | null; mime: string }) {
      assertKey(key);
      const payload = Buffer.from(JSON.stringify({ k: key, e: Date.now() + DOWNLOAD_URL_SECONDS * 1000, d: opts.download, m: opts.mime } satisfies LocalToken)).toString("base64url");
      return `/api/material-files/${payload}.${sign(payload)}`;
    },
    /** 내려받기 토큰 확인 (위조·만료면 null) */
    verify(token: string): (LocalToken & { file: string }) | null {
      const [payload, mac] = token.split(".");
      if (!payload || !mac) return null;
      const want = Buffer.from(sign(payload));
      const got = Buffer.from(mac);
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
      try {
        const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LocalToken;
        if (typeof t.e !== "number" || t.e < Date.now() || !STORAGE_KEY_PATTERN.test(t.k)) return null;
        return { ...t, file: fileOf(t.k) };
      } catch {
        return null;
      }
    },
    async remove(keys: string[]) {
      for (const key of keys) {
        const file = fileOf(key);
        if (existsSync(file)) unlinkSync(file);
      }
    },
    async listAll(): Promise<StoredObject[]> {
      if (!existsSync(dir)) return [];
      const out: StoredObject[] = [];
      for (const course of readdirSync(dir)) {
        const sub = path.join(dir, course);
        if (!statSync(sub).isDirectory()) continue;
        for (const name of readdirSync(sub)) {
          const key = `${course}/${name}`;
          if (!STORAGE_KEY_PATTERN.test(key)) continue;
          const s = statSync(path.join(sub, name));
          out.push({ key, size: s.size, createdAt: s.mtime.toISOString() });
        }
      }
      return out;
    },
  };
  return storage;
};
export type LocalMaterialStorage = ReturnType<typeof createLocalMaterialStorage>;

/* ───────── Supabase Storage ───────── */

export const createSupabaseMaterialStorage = (sb: SupabaseClient): MaterialStorage => {
  const bucket = () => sb.storage.from(MATERIAL_BUCKET);
  const fail = (what: string, e: { message?: string } | null) => new Error(`Storage ${what} 실패: ${e?.message ?? "알 수 없는 오류"}`);
  return {
    kind: "supabase",
    async createUpload(key, mime) {
      assertKey(key);
      const { data, error } = await bucket().createSignedUploadUrl(key);
      if (error || !data) throw fail("업로드 주소", error);
      return { uploadUrl: data.signedUrl, headers: { "Content-Type": mime, "x-upsert": "false" } };
    },
    async stat(key) {
      assertKey(key);
      const { data, error } = await bucket().info(key);
      if (!error && data) return { size: Number(data.size ?? -1), contentType: data.contentType ?? null, createdAt: data.createdAt ?? null };
      // info를 쓸 수 없는 Storage 버전이면 폴더 목록의 메타데이터로 확인한다 (없으면 null — 완료가 실패할 뿐 자료는 만들지 않는다)
      const [folder, name] = key.split("/");
      const { data: list, error: e } = await bucket().list(folder, { search: name, limit: 10 });
      const o = !e ? (list ?? []).find((x) => x.name === name && x.id) : undefined;
      if (!o) return null;
      const meta = (o.metadata ?? {}) as { size?: number; mimetype?: string };
      return { size: Number(meta.size ?? -1), contentType: meta.mimetype ?? null, createdAt: o.created_at ?? null };
    },
    async readRange(key, start, endInclusive) {
      assertKey(key);
      const { data, error } = await bucket().createSignedUrl(key, 60);
      if (error || !data) throw fail("읽기 주소", error);
      const res = await fetch(data.signedUrl, { headers: { Range: `bytes=${start}-${endInclusive}` } });
      if (!res.ok) throw new Error(`Storage 읽기 실패: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // 범위 요청을 무시하고 전체를 보낸 경우(200) 필요한 부분만
      return res.status === 206 ? buf : buf.subarray(start, endInclusive + 1);
    },
    async signedUrl(key, opts) {
      assertKey(key);
      const { data, error } = await bucket().createSignedUrl(key, DOWNLOAD_URL_SECONDS, { download: opts.download ?? false });
      if (error || !data) throw fail("내려받기 주소", error);
      return data.signedUrl;
    },
    async remove(keys) {
      keys.forEach(assertKey);
      if (keys.length === 0) return;
      const { error } = await bucket().remove(keys);
      if (error) throw fail("삭제", error);
    },
    async listAll() {
      const out: StoredObject[] = [];
      const { data: folders, error } = await bucket().list("", { limit: 1000 });
      if (error) throw fail("목록", error);
      for (const f of folders ?? []) {
        if (f.id) continue; // 맨 위의 파일은 서버가 만들지 않는다 (아래 형식 검사에서도 걸러진다)
        for (let offset = 0; ; offset += 1000) {
          const { data, error: e } = await bucket().list(f.name, { limit: 1000, offset });
          if (e) throw fail("목록", e);
          for (const o of data ?? []) {
            const key = `${f.name}/${o.name}`;
            if (o.id && STORAGE_KEY_PATTERN.test(key)) {
              out.push({ key, size: Number((o.metadata as { size?: number } | null)?.size ?? 0), createdAt: o.created_at ?? "" });
            }
          }
          if ((data ?? []).length < 1000) break;
        }
      }
      return out;
    },
  };
};

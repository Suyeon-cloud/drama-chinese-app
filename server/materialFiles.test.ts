// 주차별 보충 자료 — 파일 자료 (npm test). 단위 검사 + JSON 모드 실제 API(임시 폴더) + 공통 완료·정리 흐름(가짜 저장소).
// 실제 data/db.json·Supabase·Storage는 건드리지 않는다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearnerProfile, WeekMaterial } from "../src/app/store/models";
import { MATERIAL_FILE_MAX_BYTES, materialFileProblem } from "../src/content/materialRules";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";
import { cleanFileName, fileContentProblem, isCourseKey, mimeForFile, newStorageKey, parseFileMeta, zipEntryNames } from "./materialFiles";
import { createSupabaseMaterialStorage, withDownloadName, type MaterialStorage, type StoredObject } from "./materialStorage";
import { cleanupOrphans, completeUpload, ORPHAN_MIN_AGE_MS, type UploadDeps, type UploadIntent } from "./materialUploads";
import { AdminDataError } from "./supabaseAdmin";
import { makeZip, SAMPLE_FILES } from "./testZip";

const reader = (buf: Buffer) => async (s: number, e: number) => buf.subarray(s, e + 1);
const check = (name: string, buf: Buffer) => fileContentProblem(name, buf.length, reader(buf));

/* ───────── 1) 파일 이름·형식·경로 (단위) ───────── */

test("파일 이름·형식: 제어 문자·경로 구분자 제거, 허용 확장자만, MIME은 확장자 기준, 경로는 서버 형식", () => {
  assert.equal(cleanFileName("  보고서\u0000.PDF "), "보고서.PDF");
  assert.equal(cleanFileName("../../etc/passwd.pdf"), "_.._etc_passwd.pdf");
  assert.equal(cleanFileName("a.exe"), null);
  assert.equal(cleanFileName("a.html"), null);
  assert.equal(cleanFileName(".pdf"), null);
  assert.equal(cleanFileName(42), null);
  assert.equal(cleanFileName(`${"가".repeat(300)}.docx`)!.length, 200);
  assert.ok(cleanFileName(`${"가".repeat(300)}.docx`)!.endsWith(".docx"));
  assert.equal(mimeForFile("a.hwp", "application/haansofthwp"), "application/haansofthwp");
  assert.equal(mimeForFile("a.hwp", "application/octet-stream"), "application/x-hwp");
  assert.equal(mimeForFile("a.pdf", "text/html"), "application/pdf");
  assert.equal(parseFileMeta({ fileName: "a.pdf", sizeBytes: MATERIAL_FILE_MAX_BYTES + 1 }).ok, false);
  assert.equal(parseFileMeta({ fileName: "a.pdf", sizeBytes: 0 }).ok, false);
  assert.equal(parseFileMeta({ fileName: "a.pdf", sizeBytes: 1.5 }).ok, false);
  assert.equal(materialFileProblem({ name: "a.zip", size: 10 }) !== null, true);
  const key = newStorageKey("course-abc123", "자료.PDF");
  assert.match(key, /^course-abc123\/[0-9a-f-]{36}\.pdf$/);
  assert.ok(isCourseKey("course-abc123", key));
  assert.ok(!isCourseKey("course-other", key));
  assert.ok(!isCourseKey("course-abc123", "course-abc123/../x.pdf"));
  assert.ok(!isCourseKey("course-abc123", "course-abc123/자료.pdf"));
});

test("내용 검사: 형식별 시그니처, ZIP 문서 내부 구조, 매크로 거부, 확장자만 바꾼 파일 거부", async () => {
  for (const [ext, buf] of Object.entries(SAMPLE_FILES)) assert.equal(await check(`a.${ext}`, buf), null, ext);
  assert.equal(await check("a.jpeg", SAMPLE_FILES.jpg), null);
  // 확장자만 바꾼 파일
  assert.notEqual(await check("a.pdf", SAMPLE_FILES.png), null);
  assert.notEqual(await check("a.png", SAMPLE_FILES.pdf), null);
  assert.notEqual(await check("a.docx", SAMPLE_FILES.pdf), null);
  assert.notEqual(await check("a.docx", SAMPLE_FILES.xlsx), null, "다른 OOXML");
  assert.notEqual(await check("a.hwpx", SAMPLE_FILES.docx), null);
  assert.notEqual(await check("a.hwp", SAMPLE_FILES.docx), null);
  assert.notEqual(await check("a.txt", SAMPLE_FILES.png), null, "바이너리는 글자 파일이 아니다");
  assert.notEqual(await check("a.pdf", Buffer.from("abc")), null, "너무 짧음");
  // ZIP 구조
  assert.notEqual(await check("a.docx", makeZip([["[Content_Types].xml", "x"]])), null, "필수 파일 없음");
  assert.equal(
    await check("a.docx", makeZip([["[Content_Types].xml", "x"], ["word/document.xml", "x"], ["word/vbaProject.bin", "x"]])),
    "매크로가 들어 있는 문서는 올릴 수 없어요.",
  );
  assert.notEqual(await check("a.hwpx", makeZip([["mimetype", "application/zip"], ["Contents/content.hpf", "x"]])), null, "hwpx mimetype");
  assert.notEqual(await check("a.hwpx", makeZip([["Contents/content.hpf", "x"], ["mimetype", "application/hwp+zip"]])), null, "mimetype이 첫 항목");
  assert.notEqual(await check("a.docx", SAMPLE_FILES.docx.subarray(0, SAMPLE_FILES.docx.length - 10)), null, "끝이 잘린 ZIP");
  assert.deepEqual(await zipEntryNames(SAMPLE_FILES.pptx.length, reader(SAMPLE_FILES.pptx)), ["[Content_Types].xml", "ppt/presentation.xml"]);
});

/* ───────── 2) 공통 완료·정리 흐름 (가짜 저장소) ───────── */

const fakeDeps = (objects: Map<string, { buf: Buffer; contentType: string | null; createdAt: string }>) => {
  const intents = new Map<string, UploadIntent>();
  const rows = new Map<string, string>(); // materialId → key
  const removed: string[] = [];
  const storage: MaterialStorage = {
    kind: "local",
    async createUpload() {
      return { uploadUrl: "/x", headers: {} };
    },
    async stat(key) {
      const o = objects.get(key);
      return o ? { size: o.buf.length, contentType: o.contentType, createdAt: o.createdAt } : null;
    },
    async readRange(key, s, e) {
      return objects.get(key)!.buf.subarray(s, e + 1);
    },
    async signedUrl() {
      return "/signed";
    },
    async remove(keys) {
      for (const k of keys) {
        removed.push(k);
        objects.delete(k);
      }
    },
    async listAll(): Promise<StoredObject[]> {
      return [...objects.entries()].map(([key, o]) => ({ key, size: o.buf.length, createdAt: o.createdAt }));
    },
  };
  let insertFails = false;
  const deps: UploadDeps = {
    storage,
    log: () => undefined,
    intents: {
      async create(i) {
        intents.set(i.token, i);
      },
      async get(t) {
        return intents.get(t) ?? null;
      },
      async consume(t) {
        const i = intents.get(t);
        if (!i || i.consumedAt) return null;
        i.consumedAt = new Date().toISOString();
        return i;
      },
      async remove(t) {
        intents.delete(t);
      },
      async activeKeys() {
        return new Set([...intents.values()].filter((i) => !i.consumedAt && Date.parse(i.expiresAt) > Date.now()).map((i) => i.storageKey));
      },
      async purgeOld() {
        return 0;
      },
    },
    records: {
      async insert(i) {
        if (insertFails) throw new AdminDataError(409, "한 주차에는 자료를 20개까지 등록할 수 있어요.");
        rows.set(`m-${rows.size}`, i.storageKey);
        return { id: `m-${rows.size - 1}` } as WeekMaterial;
      },
      async replace(i) {
        const old = rows.get(i.materialId!) ?? null;
        rows.set(i.materialId!, i.storageKey);
        return { material: { id: i.materialId } as WeekMaterial, oldKey: old };
      },
      async referencedKeys() {
        return new Set(rows.values());
      },
    },
  };
  return { deps, intents, rows, removed, failInsert: () => (insertFails = true) };
};
const C = "course-abc123";
const intentFor = (key: string, size: number, extra: Partial<UploadIntent> = {}): UploadIntent => ({
  token: `t-${key}`,
  courseId: C,
  materialId: null,
  storageKey: key,
  fileName: "자료.pdf",
  mimeType: "application/pdf",
  sizeBytes: size,
  input: { week: 1, title: "t", description: "", status: "draft" },
  actorKey: "admin",
  actorId: null,
  actorLabel: "관리자",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  consumedAt: null,
  ...extra,
});
const yes = async () => true;

test("완료 흐름: 같은 사람·한 번만·만료·권한 확인, 크기·MIME·내용이 다르면 올린 파일을 지우고 행을 만들지 않는다", async () => {
  const pdf = SAMPLE_FILES.pdf;
  const now = new Date().toISOString();
  const objs = new Map<string, { buf: Buffer; contentType: string | null; createdAt: string }>();
  const f = fakeDeps(objs);
  const ok = newStorageKey(C, "a.pdf");
  objs.set(ok, { buf: pdf, contentType: "application/pdf", createdAt: now });
  await f.deps.intents.create(intentFor(ok, pdf.length));
  await assert.rejects(completeUpload(f.deps, `t-${ok}`, "someone-else", yes), (e: unknown) => e instanceof AdminDataError && e.status === 404);
  await assert.rejects(completeUpload(f.deps, `t-${ok}`, "admin", async () => false), (e: unknown) => e instanceof AdminDataError && e.status === 403);
  assert.equal(f.intents.get(`t-${ok}`)!.consumedAt, null, "권한 거부는 의도를 쓰지 않는다");
  await completeUpload(f.deps, `t-${ok}`, "admin", yes);
  assert.equal([...f.rows.values()][0], ok);
  await assert.rejects(completeUpload(f.deps, `t-${ok}`, "admin", yes), (e: unknown) => e instanceof AdminDataError && e.status === 409, "두 번 완료");

  const cases: [string, Buffer, string | null, number][] = [
    ["size", pdf, "application/pdf", pdf.length + 1],
    ["mime", pdf, "image/png", pdf.length],
    ["content", SAMPLE_FILES.png, "application/pdf", SAMPLE_FILES.png.length],
  ];
  for (const [label, buf, ct, declared] of cases) {
    const key = newStorageKey(C, "a.pdf");
    objs.set(key, { buf, contentType: ct, createdAt: now });
    await f.deps.intents.create(intentFor(key, declared));
    await assert.rejects(completeUpload(f.deps, `t-${key}`, "admin", yes), (e: unknown) => e instanceof AdminDataError && e.status === 400, label);
    assert.ok(!objs.has(key) && f.removed.includes(key), `${label}: 올린 파일 삭제`);
  }
  // 만료: 의도를 쓰고 파일을 지운다
  const exp = newStorageKey(C, "a.pdf");
  objs.set(exp, { buf: pdf, contentType: null, createdAt: now });
  await f.deps.intents.create(intentFor(exp, pdf.length, { expiresAt: new Date(Date.now() - 1000).toISOString() }));
  await assert.rejects(completeUpload(f.deps, `t-${exp}`, "admin", yes), (e: unknown) => e instanceof AdminDataError && e.status === 410);
  assert.ok(!objs.has(exp));
  // 행 만들기 실패(예: 주차당 20개) → 올린 파일 삭제
  const full = newStorageKey(C, "a.pdf");
  objs.set(full, { buf: pdf, contentType: null, createdAt: now });
  await f.deps.intents.create(intentFor(full, pdf.length));
  f.failInsert();
  await assert.rejects(completeUpload(f.deps, `t-${full}`, "admin", yes), (e: unknown) => e instanceof AdminDataError && e.status === 409);
  assert.ok(!objs.has(full));
});

test("교체: 새 파일 확인 뒤 행을 바꾸고 옛 파일만 지운다 (그 과목 경로가 아니면 지우지 않는다)", async () => {
  const pdf = SAMPLE_FILES.pdf;
  const now = new Date().toISOString();
  const objs = new Map<string, { buf: Buffer; contentType: string | null; createdAt: string }>();
  const f = fakeDeps(objs);
  const oldKey = newStorageKey(C, "a.pdf");
  const otherCourseKey = newStorageKey("course-zzz999", "b.pdf");
  objs.set(oldKey, { buf: pdf, contentType: null, createdAt: now });
  objs.set(otherCourseKey, { buf: pdf, contentType: null, createdAt: now });
  f.rows.set("m-1", oldKey);
  f.rows.set("m-2", otherCourseKey);
  const k1 = newStorageKey(C, "a.pdf");
  objs.set(k1, { buf: pdf, contentType: null, createdAt: now });
  await f.deps.intents.create(intentFor(k1, pdf.length, { materialId: "m-1", input: null }));
  await completeUpload(f.deps, `t-${k1}`, "admin", yes);
  assert.equal(f.rows.get("m-1"), k1);
  assert.ok(!objs.has(oldKey) && objs.has(k1));
  // 행이 다른 과목 경로를 가리키던 경우(있어서는 안 되지만) 그 파일은 지우지 않는다
  const k2 = newStorageKey(C, "a.pdf");
  objs.set(k2, { buf: pdf, contentType: null, createdAt: now });
  await f.deps.intents.create(intentFor(k2, pdf.length, { materialId: "m-2", input: null }));
  await completeUpload(f.deps, `t-${k2}`, "admin", yes);
  assert.ok(objs.has(otherCourseKey));
});

test("고아 정리: 기본은 미리 보기, confirm일 때만 삭제 — 자료가 가리키는 파일·진행 중 업로드·최근 파일은 지우지 않는다", async () => {
  const old = new Date(Date.now() - ORPHAN_MIN_AGE_MS - 60_000).toISOString();
  const recent = new Date().toISOString();
  const objs = new Map<string, { buf: Buffer; contentType: string | null; createdAt: string }>();
  const f = fakeDeps(objs);
  const referenced = newStorageKey(C, "a.pdf");
  const orphan = newStorageKey(C, "b.pdf");
  const young = newStorageKey(C, "c.pdf");
  const pending = newStorageKey(C, "d.pdf");
  for (const [k, t] of [[referenced, old], [orphan, old], [young, recent], [pending, old]] as const) objs.set(k, { buf: Buffer.from("x"), contentType: null, createdAt: t });
  f.rows.set("m-1", referenced);
  await f.deps.intents.create(intentFor(pending, 1));
  const dry = await cleanupOrphans(f.deps, false);
  assert.equal(dry.dryRun, true);
  assert.deepEqual(dry.orphans.map((o) => o.key), [orphan]);
  assert.equal(objs.size, 4, "미리 보기는 아무것도 지우지 않는다");
  const real = await cleanupOrphans(f.deps, true);
  assert.equal(real.deleted, 1);
  assert.deepEqual([...objs.keys()].sort(), [referenced, young, pending].sort());
});

test("Supabase 저장소 어댑터: 서명 업로드(덮어쓰기 금지)·60초 서명 주소·내려받기 이름, 서버 형식이 아닌 경로는 거부", async () => {
  const calls: [string, unknown[]][] = [];
  const bucket = new Proxy(
    {},
    {
      get(_t, prop) {
        return async (...args: unknown[]) => {
          calls.push([String(prop), args]);
          if (prop === "createSignedUploadUrl") return { data: { signedUrl: "https://x.supabase.co/upload?token=1", token: "1", path: args[0] }, error: null };
          if (prop === "createSignedUrl") return { data: { signedUrl: "https://x.supabase.co/storage/v1/object/sign/week-materials/k?token=abc.def" }, error: null };
          if (prop === "info") return { data: { size: 10, contentType: "application/pdf", createdAt: "2026-11-07T00:00:00Z" }, error: null };
          return { data: [], error: null };
        };
      },
    },
  );
  const sb = { storage: { from: (b: string) => (assert.equal(b, "week-materials"), bucket) } } as unknown as SupabaseClient;
  const st = createSupabaseMaterialStorage(sb);
  const key = newStorageKey(C, "a.pdf");
  const up = await st.createUpload(key, "application/pdf", "tok");
  assert.equal(up.headers["x-upsert"], "false");
  assert.equal(up.headers["Content-Type"], "application/pdf");
  assert.deepEqual(await st.stat(key), { size: 10, contentType: "application/pdf", createdAt: "2026-11-07T00:00:00Z" });
  // 내려받기 이름은 storage-js에 넘기지 않고(이중 인코딩 버그) 서명 주소에 한 번만 인코딩해 붙인다
  const dl = await st.signedUrl(key, { download: "자료.pdf", mime: "application/pdf" });
  assert.deepEqual(calls.at(-1), ["createSignedUrl", [key, 60]]);
  assert.equal(new URL(dl).searchParams.get("download"), "자료.pdf");
  assert.equal(new URL(dl).searchParams.get("token"), "abc.def");
  const pv = await st.signedUrl(key, { download: null, mime: "application/pdf" });
  assert.deepEqual(calls.at(-1), ["createSignedUrl", [key, 60]]);
  assert.equal(new URL(pv).searchParams.has("download"), false, "미리보기는 내려받기 이름 없음");
  await assert.rejects(st.signedUrl("course-abc123/../../x.pdf", { download: null, mime: "application/pdf" }));
  await assert.rejects(st.remove(["other-bucket-file.pdf"]));
});

test("Supabase 고아 정리 목록: 자료·업로드 기록을 1000행씩 나눠 끝까지 읽는다 (응답 행 수 제한에 잘리지 않게)", async () => {
  const ranges: [string, number, number][] = [];
  const total: Record<string, number> = { week_materials: 2345, week_material_uploads: 1000 };
  const chain = (table: string): unknown => {
    let range: [number, number] = [0, 999];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "not", "is", "gt", "order", "eq"]) q[m] = () => q;
    q.range = (a: number, b: number) => {
      range = [a, b];
      ranges.push([table, a, b]);
      return q;
    };
    q.then = (resolve: (r: unknown) => unknown) => {
      const n = Math.max(0, Math.min(total[table] - range[0], range[1] - range[0] + 1));
      return Promise.resolve(resolve({ data: Array.from({ length: n }, (_, i) => ({ storage_path: `${table}-${range[0] + i}` })), error: null }));
    };
    return q;
  };
  const sb = { from: (t: string) => chain(t), storage: { from: () => ({}) } } as unknown as SupabaseClient;
  const { createSupabaseAdminStore } = await import("./supabaseAdmin");
  const files = createSupabaseAdminStore(sb).materialFiles();
  assert.equal((await files.records.referencedKeys()).size, 2345);
  assert.equal((await files.intents.activeKeys()).size, 1000);
  assert.deepEqual(ranges.filter((r) => r[0] === "week_materials").map((r) => r[1]), [0, 1000, 2000]);
  assert.deepEqual(ranges.filter((r) => r[0] === "week_material_uploads").map((r) => r[1]), [0, 1000], "정확히 1000행이면 한 번 더 확인");
});

test("Supabase stat: info를 쓸 수 없으면 폴더 목록의 메타데이터로 확인하고, 없으면 null", async () => {
  const key = newStorageKey(C, "a.pdf");
  const name = key.split("/")[1];
  const make = (listed: unknown[]) =>
    createSupabaseMaterialStorage({
      storage: {
        from: () => ({
          info: async () => ({ data: null, error: { message: "not supported" } }),
          list: async (folder: string, opts: { search: string }) => {
            assert.equal(folder, C);
            assert.equal(opts.search, name);
            return { data: listed, error: null };
          },
        }),
      },
    } as unknown as SupabaseClient);
  assert.deepEqual(await make([{ name, id: "x", created_at: "2026-11-08T00:00:00Z", metadata: { size: 45, mimetype: "application/pdf" } }]).stat(key), {
    size: 45,
    contentType: "application/pdf",
    createdAt: "2026-11-08T00:00:00Z",
  });
  assert.equal(await make([{ name: `${name}x`, id: "y", metadata: {} }]).stat(key), null, "이름이 정확히 같아야 한다");
  assert.equal(await make([]).stat(key), null);
});
test("내려받기 파일 이름: 한글·중국어·공백·괄호가 한 번만 인코딩된다 (이중 인코딩 %25 없음)", () => {
  const signed = "https://x.supabase.co/storage/v1/object/sign/week-materials/course-a/f.pdf?token=eyJ.abc-_";
  for (const name of ["关于中韩龙虎俗语的对比研究 (1).pdf", "2-1. 한국어 자료 (최종).pdf", "a+b&c=d#e.pdf", "plain.pdf"]) {
    const url = withDownloadName(signed, name);
    const raw = url.slice(url.indexOf("download=") + "download=".length);
    assert.ok(!raw.includes("%25"), `이중 인코딩: ${raw}`);
    assert.equal(decodeURIComponent(raw), name, "한 번 풀면 원래 이름");
    assert.equal(new URL(url).searchParams.get("download"), name);
    assert.equal(new URL(url).searchParams.get("token"), "eyJ.abc-_", "서명 토큰은 그대로");
    assert.ok(!raw.includes(" ") && !raw.includes("+"), "공백은 %20");
  }
  // 이미 download가 붙은 주소도 한 번만
  const twice = withDownloadName(`${signed}&download=old.pdf`, "새 자료.pdf");
  assert.deepEqual(new URL(twice).searchParams.getAll("download"), ["새 자료.pdf"]);
});

/* ───────── 3) JSON 모드 실제 API (임시 폴더) ───────── */

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const T = "t@teach.test";
const OTHER = "o@teach.test";
const COURSE = "course-campus";
let dir = "";
let db: Db;
let base = "";
let origin = "";
let adminCookie = "";
let close = () => {};
let untouched = "";

const sign = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const google = (email: string, id = email) => sign({ k: "google", id, email });
const learner = (id: string) => google(`${id}@learn.test`, id);
const call = async <R = unknown>(method: string, p: string, cookie?: string, body?: unknown) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as R & { error?: string } };
};
type Ticket = { token: string; uploadUrl: string; headers: Record<string, string> };
const put = (ticket: Ticket, buf: Buffer, cookie: string) =>
  fetch(origin + ticket.uploadUrl, { method: "PUT", headers: { ...ticket.headers, cookie }, body: buf });
/** 업로드 시작 → PUT → 완료 */
const upload = async (cookie: string, name: string, buf: Buffer, extra: Record<string, unknown> = {}) => {
  const start = await call<Ticket>("POST", `/courses/${COURSE}/materials/uploads`, cookie, {
    week: 2,
    title: name,
    fileName: name,
    mimeType: "",
    sizeBytes: buf.length,
    ...extra,
  });
  if (start.status !== 201) return { start, done: null };
  const p = await put(start.body, buf, cookie);
  assert.equal(p.status, 200);
  return { start, done: await call<WeekMaterial>("POST", `/material-uploads/${start.body.token}/complete`, cookie, {}) };
};
const uploadsDir = () => path.join(dir, "uploads");
const storedFiles = () => (existsSync(uploadsDir()) ? readdirSync(uploadsDir(), { recursive: true }).filter((f) => String(f).includes(".")) : []);

const member = (id: string): LearnerProfile => ({
  id,
  googleEmail: `${id}@learn.test`,
  name: id,
  university: "u",
  department: "d",
  grade: "1",
  studentId: `S-${id}`,
  email: `${id}@learn.test`,
  phone: "010",
  avatarColor: "#fff",
  status: "approved",
  profileCompleted: true,
  firstSeenAt: "2026-11-07T00:00:00.000Z",
  lastSeenAt: "2026-11-07T00:00:00.000Z",
  approvedAt: "2026-11-07T00:00:00.000Z",
});
const snapshot = () => JSON.stringify({ lessons: db.data.lessons, progress: db.data.progress, enrollments: db.data.enrollments });

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-files-"));
  db = openDb(dir);
  for (const email of [T, OTHER]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  for (const id of ["s1", "s2"]) db.data.members[id] = member(id);
  db.save();
  const app = express();
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET, ...ADMIN })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      base = `${origin}/api`;
      close = () => server.close();
      resolve();
    });
  });
  const login = await fetch(`${base}/auth/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const section = Object.values(db.data.sections).find((s) => s.courseId === COURSE && s.status === "active")!;
  assert.equal((await call("PUT", `/sections/${section.id}/instructors/${encodeURIComponent(T)}`, adminCookie)).status, 200);
  assert.equal((await call("POST", "/enrollments", learner("s1"), { courseCode: section.code })).status, 200);
  untouched = snapshot();
});

after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

test("JSON 업로드 권한: 학생·담당 아닌 교수자·로그인 없음은 시작 못 함, 다른 사람은 PUT·완료 못 함", async () => {
  const body = { week: 1, title: "x", fileName: "a.pdf", sizeBytes: SAMPLE_FILES.pdf.length };
  assert.equal((await call("POST", `/courses/${COURSE}/materials/uploads`, undefined, body)).status, 401);
  assert.equal((await call("POST", `/courses/${COURSE}/materials/uploads`, learner("s1"), body)).status, 403);
  assert.equal((await call("POST", `/courses/${COURSE}/materials/uploads`, google(OTHER), body)).status, 403);
  assert.equal((await call("POST", `/courses/${COURSE}/materials/uploads`, google(T), { ...body, fileName: "a.exe" })).status, 400);
  assert.equal((await call("POST", `/courses/${COURSE}/materials/uploads`, google(T), { ...body, sizeBytes: MATERIAL_FILE_MAX_BYTES + 1 })).status, 400);
  assert.equal((await call("POST", `/courses/${COURSE}/materials/uploads`, google(T), { ...body, storagePath: "x" })).status, 400);
  const start = await call<Ticket>("POST", `/courses/${COURSE}/materials/uploads`, google(T), body);
  assert.equal(start.status, 201);
  assert.match(start.body.uploadUrl, /^\/api\/material-uploads\//);
  assert.equal((await put(start.body, SAMPLE_FILES.pdf, google(OTHER))).status, 404, "다른 사람의 PUT");
  assert.equal((await put(start.body, SAMPLE_FILES.pdf, google(T))).status, 200);
  assert.equal((await call("POST", `/material-uploads/${start.body.token}/complete`, adminCookie, {})).status, 404, "다른 사람의 완료");
  const done = await call<WeekMaterial>("POST", `/material-uploads/${start.body.token}/complete`, google(T), {});
  assert.equal(done.status, 200);
  assert.equal((await call("POST", `/material-uploads/${start.body.token}/complete`, google(T), {})).status, 409, "두 번 완료");
  assert.equal((await call("DELETE", `/materials/${done.body.id}`, google(T))).status, 200);
});

test("JSON 업로드·열기: 검사 통과 뒤에만 자료 생성, 응답에 저장 경로 없음, 학생은 공개 파일만, 주소는 짧은 서명 토큰", async () => {
  const { done } = await upload(google(T), "강의노트.pdf", SAMPLE_FILES.pdf);
  assert.equal(done!.status, 200);
  const m = done!.body;
  assert.equal(m.kind, "file");
  assert.equal(m.fileName, "강의노트.pdf");
  assert.equal(m.mimeType, "application/pdf");
  assert.equal(m.sizeBytes, SAMPLE_FILES.pdf.length);
  assert.equal(m.status, "draft");
  assert.ok(!("storagePath" in m));
  const listed = (await call<WeekMaterial[]>("GET", `/courses/${COURSE}/materials`, google(T))).body;
  assert.ok(listed.every((x) => !("storagePath" in x)));
  assert.equal(storedFiles().length, 1);

  // 비공개: 학생은 목록에도 없고 주소도 못 받는다, 수강하지 않은 학생도
  assert.ok(!(await call<WeekMaterial[]>("GET", `/courses/${COURSE}/materials`, learner("s1"))).body.some((x) => x.id === m.id));
  assert.equal((await call("GET", `/materials/${m.id}/file`, learner("s1"))).status, 404);
  assert.equal((await call("PATCH", `/materials/${m.id}`, google(T), { status: "published" })).status, 200);
  assert.equal((await call("GET", `/materials/${m.id}/file`, learner("s2"))).status, 404, "수강하지 않은 학생");
  assert.equal((await call("GET", `/materials/${m.id}/file`, google(OTHER))).status, 404, "담당 아닌 교수자");

  // 공개 뒤 학생: 미리보기(인라인)·내려받기(첨부) 주소
  const pv = await call<{ url: string; mode: string; expiresIn: number }>("GET", `/materials/${m.id}/file?mode=preview`, learner("s1"));
  assert.equal(pv.status, 200);
  assert.equal(pv.body.mode, "preview");
  assert.equal(pv.body.expiresIn, 60);
  const inline = await fetch(origin + pv.body.url);
  assert.equal(inline.status, 200);
  assert.equal(inline.headers.get("content-disposition"), "inline");
  assert.equal(inline.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await inline.arrayBuffer()), SAMPLE_FILES.pdf);
  const dl = await call<{ url: string; mode: string }>("GET", `/materials/${m.id}/file?mode=download`, learner("s1"));
  const att = await fetch(origin + dl.body.url);
  const disp = att.headers.get("content-disposition") ?? "";
  assert.match(disp, /^attachment; filename\*=UTF-8''/);
  assert.equal(decodeURIComponent(disp.slice(disp.indexOf("''") + 2)), "강의노트.pdf", "JSON 모드: 한 번 풀면 원래 이름");
  // 토큰 위조 → 404
  const [payload] = dl.body.url.replace("/api/material-files/", "").split(".");
  assert.equal((await fetch(`${base}/material-files/${payload}.forged`)).status, 404);

  // 링크 주소를 파일 자료에 넣을 수 없다
  assert.equal((await call("PATCH", `/materials/${m.id}`, google(T), { url: "https://example.com" })).status, 400);
  // 문서는 미리보기를 요청해도 내려받기로
  const doc = await upload(google(T), "양식.docx", SAMPLE_FILES.docx, { status: "published" });
  assert.equal((await call<{ mode: string }>("GET", `/materials/${doc.done!.body.id}/file?mode=preview`, learner("s1"))).body.mode, "download");

  // 정리
  for (const id of [m.id, doc.done!.body.id]) assert.equal((await call("DELETE", `/materials/${id}`, adminCookie)).status, 200);
  assert.equal(storedFiles().length, 0, "자료를 지우면 파일도 지운다");
});

test("JSON 검사 실패: 확장자만 바꾼 파일·크기 불일치·만료는 자료를 만들지 않고 올린 파일을 지운다", async () => {
  const before = Object.keys(db.data.weekMaterials).length;
  const fake = await upload(google(T), "사진.pdf", SAMPLE_FILES.png);
  assert.equal(fake.done!.status, 400);
  const mismatch = await call<Ticket>("POST", `/courses/${COURSE}/materials/uploads`, google(T), { week: 2, title: "x", fileName: "a.pdf", sizeBytes: 999 });
  await put(mismatch.body, SAMPLE_FILES.pdf, google(T));
  assert.equal((await call("POST", `/material-uploads/${mismatch.body.token}/complete`, google(T), {})).status, 400);
  const late = await call<Ticket>("POST", `/courses/${COURSE}/materials/uploads`, google(T), { week: 2, title: "x", fileName: "a.pdf", sizeBytes: SAMPLE_FILES.pdf.length });
  await put(late.body, SAMPLE_FILES.pdf, google(T));
  db.data.materialUploads[late.body.token].expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal((await call("POST", `/material-uploads/${late.body.token}/complete`, google(T), {})).status, 410);
  assert.equal(Object.keys(db.data.weekMaterials).length, before);
  assert.equal(storedFiles().length, 0);
});

test("JSON 교체: 새 파일 확인 뒤 바꾸고 옛 파일을 지운다, 링크 자료·남의 과목은 교체 못 함", async () => {
  const first = await upload(google(T), "v1.pdf", SAMPLE_FILES.pdf);
  const id = first.done!.body.id;
  const oldKey = db.data.weekMaterials[id].storagePath!;
  const start = await call<Ticket>("POST", `/materials/${id}/uploads`, google(T), { fileName: "v2.png", sizeBytes: SAMPLE_FILES.png.length });
  assert.equal(start.status, 201);
  assert.equal((await call("POST", `/materials/${id}/uploads`, google(OTHER), { fileName: "v2.png", sizeBytes: 10 })).status, 404);
  await put(start.body, SAMPLE_FILES.png, google(T));
  const done = await call<WeekMaterial>("POST", `/material-uploads/${start.body.token}/complete`, google(T), {});
  assert.equal(done.status, 200);
  assert.equal(done.body.fileName, "v2.png");
  assert.equal(done.body.mimeType, "image/png");
  assert.ok(!existsSync(path.join(uploadsDir(), ...oldKey.split("/"))), "옛 파일 삭제");
  assert.equal(storedFiles().length, 1);
  const link = await call<WeekMaterial>("POST", `/courses/${COURSE}/materials`, google(T), { week: 3, title: "링크", url: "https://example.com" });
  assert.equal((await call("POST", `/materials/${link.body.id}/uploads`, google(T), { fileName: "a.pdf", sizeBytes: 10 })).status, 404);
  for (const x of [id, link.body.id]) await call("DELETE", `/materials/${x}`, adminCookie);
  assert.equal(storedFiles().length, 0);
});

test("JSON 고아 정리: 관리자만, 기본은 미리 보기, confirm일 때만 오래된 고아 파일 삭제 (자료 파일은 유지)", async () => {
  const kept = await upload(google(T), "keep.pdf", SAMPLE_FILES.pdf);
  const orphanKey = newStorageKey(COURSE, "orphan.pdf");
  const file = path.join(uploadsDir(), ...orphanKey.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, SAMPLE_FILES.pdf);
  const old = new Date(Date.now() - ORPHAN_MIN_AGE_MS - 60_000);
  utimesSync(file, old, old);
  // 형식이 다른 파일(서버가 만들지 않은 이름)은 목록에도 올리지 않는다
  writeFileSync(path.join(path.dirname(file), "notes.txt"), "x");
  assert.equal((await call("POST", "/materials/cleanup", google(T), {})).status, 403);
  const dry = await call<{ dryRun: boolean; orphans: { key: string }[] }>("POST", "/materials/cleanup", adminCookie, {});
  assert.equal(dry.body.dryRun, true);
  assert.deepEqual(dry.body.orphans.map((o) => o.key), [orphanKey]);
  assert.ok(existsSync(file));
  const real = await call<{ deleted: number }>("POST", "/materials/cleanup", adminCookie, { confirm: true });
  assert.equal(real.body.deleted, 1);
  assert.ok(!existsSync(file));
  assert.ok(existsSync(path.join(path.dirname(file), "notes.txt")));
  assert.ok(existsSync(path.join(uploadsDir(), ...db.data.weekMaterials[kept.done!.body.id].storagePath!.split("/"))));
  await call("DELETE", `/materials/${kept.done!.body.id}`, adminCookie);
});

test("파일 자료 작업은 강의자료·학습 기록·수강 등록을 바꾸지 않는다", () => {
  assert.equal(snapshot(), untouched);
});

// Phase 3-C 마이그레이션(파일 자료·Storage 버킷) 정적 검사 (npm test). DB에 연결하지 않는다 — SQL 문장과 구조만 본다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { MATERIAL_FILE_MAX_BYTES, MATERIAL_FILE_MIME_TYPES } from "../src/content/materialRules";
import { STORAGE_KEY_PATTERN } from "./materialFiles";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const C3_FILE = migFiles.find((f) => /_phase_3c_material_files\.sql$/.test(f));
const C3 = C3_FILE ? read(path.join(MIG_DIR, C3_FILE)) : "";
const DOWN = read(path.join("supabase", "rollback", "20261108090000_phase_3c_material_files.down.sql"));
const PRE = read(path.join("supabase", "checks", "20261108090000_phase_3c_pre.sql"));
const POST = read(path.join("supabase", "checks", "20261108090000_phase_3c_post.sql"));
const SMOKE = read(path.join("supabase", "checks", "20261108090000_phase_3c_rollback_smoke.sql"));
const code = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();
const fn = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `함수 없음: ${name}`);
  return src.slice(start, src.indexOf("\n$$;", start) + 4);
};
const top = code(C3);
const NEW_FUNCS = ["_material_file_path_ok", "admin_insert_week_material_file", "admin_replace_week_material_file", "week_material_download"];

test("3-C: 3-B 뒤 마이그레이션(그 뒤는 4단계 HTML만), begin … commit 한 트랜잭션, 사전 확인이 먼저, 추가형", () => {
  assert.ok(C3_FILE);
  const after = migFiles.slice(migFiles.indexOf(C3_FILE!) + 1);
  assert.ok(after.every((f) => /_phase_(4_html_materials|5b_review_sources)\.sql$/.test(f)), after.join(","));
  assert.match(top, /^begin;\n/);
  assert.match(top, /\ncommit;$/);
  assert.equal([...top.matchAll(/^(begin|commit|rollback);$/gm)].length, 2);
  assert.ok(top.indexOf("do $pre$") < top.indexOf("insert into storage.buckets"));
  assert.equal([...top.matchAll(/raise exception '3C_PREFLIGHT:/g)].length, 6);
  for (const bad of [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bdrop\s+column\b/i, /\balter\s+column\b/i, /alter table public\.week_materials\b/i]) {
    assert.doesNotMatch(top, bad);
  }
  // 기존 3-B 함수를 바꾸지 않는다
  for (const name of ["_save_week_material", "list_week_materials", "admin_update_course", "delete_week_material"]) {
    assert.doesNotMatch(top, new RegExp(`create or replace function public\\.${name}\\(`), name);
  }
  // 함수 밖에서 쓰는 곳: 버킷 insert 하나
  const outside = top.replace(/create or replace function[\s\S]*?\n\$\$;/g, "").replace(/do \$pre\$[\s\S]*?\n\$pre\$;/g, "");
  assert.deepEqual([...outside.matchAll(/^\s*(insert into|update|delete from)\s+([\w.]+)/gim)].map((m) => m[2]), ["storage.buckets"]);
});

test("3-C: 버킷은 비공개·20MB·허용 형식이 화면 규칙과 같고, Storage 정책을 만들지 않으며 공개 버킷이면 멈춘다", () => {
  const bucket = /insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)\s+values \(\s*'week-materials', 'week-materials', (\w+), (\d+),\s*array\[([\s\S]*?)\]\s*\)/.exec(top);
  assert.ok(bucket);
  assert.equal(bucket[1], "false");
  assert.equal(Number(bucket[2]), MATERIAL_FILE_MAX_BYTES);
  assert.deepEqual([...bucket[3].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), [...MATERIAL_FILE_MIME_TYPES].sort());
  assert.match(top, /on conflict \(id\) do update\s+set public = false,/);
  assert.doesNotMatch(top, /create policy/i);
  assert.match(top, /where id = 'week-materials' and public\) then\s+raise exception '3C_PREFLIGHT:/);
});

test("3-C: 업로드 기록 테이블 — anon·authenticated 접근 없음(RLS·권한), 경로는 그 과목 폴더의 서버 형식만", () => {
  assert.match(top, /alter table public\.week_material_uploads enable row level security;/);
  assert.match(top, /revoke all on table public\.week_material_uploads from public, anon, authenticated, service_role;/);
  const grants = [...top.matchAll(/grant ([^;]+?) on (?:table )?public\.week_material_uploads\b[^;]*to (\w+);/g)].map((m) => `${m[2]}:${m[1]}`);
  assert.deepEqual(grants, ["service_role:select, insert, update, delete"]);
  // DB 경로 패턴이 서버(STORAGE_KEY_PATTERN)와 같다
  const sqlPattern = /storage_path ~ '(\^\[a-z0-9\][^']+)'/.exec(top)?.[1];
  assert.equal(sqlPattern, STORAGE_KEY_PATTERN.source.replace(/\\\//g, "/"));
  assert.match(top, /split_part\(storage_path, '\/', 1\) = course_id/);
  assert.match(fn(C3, "_material_file_path_ok"), /split_part\(p_path, '\/', 1\) = p_course_id/);
});

test("3-C: 함수 권한 — 파일 행 RPC는 service_role만, 열기 RPC는 authenticated만, 경로 검사 함수는 아무도", () => {
  for (const name of NEW_FUNCS) {
    const m = new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from ([\\w, ]+);`).exec(top);
    assert.ok(m, name);
    assert.deepEqual(m[1].split(/,\s*/).sort(), ["anon", "authenticated", "public", "service_role"], name);
    assert.match(fn(C3, name), /set search_path = ''/, name);
  }
  const grantsOf = (name: string) => [...top.matchAll(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (\\w+);`, "g"))].map((m) => m[1]);
  assert.deepEqual(grantsOf("admin_insert_week_material_file"), ["service_role"]);
  assert.deepEqual(grantsOf("admin_replace_week_material_file"), ["service_role"]);
  assert.deepEqual(grantsOf("week_material_download"), ["authenticated"]);
  assert.deepEqual(grantsOf("_material_file_path_ok"), []);
  for (const name of ["admin_insert_week_material_file", "admin_replace_week_material_file", "week_material_download"]) {
    assert.match(fn(C3, name), /security definer/, name);
  }
});

test("3-C: 파일 행 RPC — 과목 잠금, 그 과목 경로·확장자 일치·같은 경로 중복·주차·개수 검사, 열기는 권한 없으면 '없음'", () => {
  const ins = fn(C3, "admin_insert_week_material_file");
  assert.match(ins, /pg_advisory_xact_lock\(public\.lesson_course_lock_key\(p_course_id\)\)/);
  assert.match(ins, /public\._material_file_path_ok\(p_course_id, p_storage_path\)/);
  assert.match(ins, /lower\(substring\(btrim\(coalesce\(p_file_name, ''\)\) from/);
  assert.match(ins, /where storage_path = p_storage_path\) then\s+raise exception '같은 파일을 쓰는 자료가 이미 있어요\.' using errcode = '23505'/);
  assert.match(ins, />= 20 then/);
  assert.match(ins, /v_week < 1 or v_week > v_course\.week_count/);
  const rep = fn(C3, "admin_replace_week_material_file");
  assert.match(rep, /if v_old\.kind <> 'file' then/);
  assert.match(rep, /public\._material_file_path_ok\(v_old\.course_id, p_storage_path\)/);
  assert.match(rep, /return v_old\.storage_path;/);
  const dl = fn(C3, "week_material_download");
  assert.match(dl, /if auth\.uid\(\) is null then\s+raise exception 'not authenticated' using errcode = '28000'/);
  assert.match(dl, /public\._can_see_all_week_materials\(v\.course_id\)\s+or \(v\.status = 'published' and public\._is_week_material_learner\(v\.course_id\)\)/);
  assert.match(dl, /errcode = 'P0002'/);
});

test("3-C 되돌리기: 파일 자료·업로드 기록·버킷 파일이 하나라도 있으면 중단, 재실행 가능, 자료를 지우는 문장 없음", () => {
  const body = code(DOWN);
  assert.match(body, /^begin;\n/);
  assert.match(body, /\ncommit;$/);
  assert.match(body, /where kind = 'file'\)\$q\$ into v_has;\s+if v_has then\s+raise exception '3C_ROLLBACK:/);
  assert.match(body, /select exists \(select 1 from public\.week_material_uploads\)' into v_has;\s+if v_has then\s+raise exception '3C_ROLLBACK:/);
  assert.match(body, /from storage\.objects where bucket_id = 'week-materials'\) then\s+raise exception '3C_ROLLBACK:/);
  assert.match(body, /if to_regclass\('public\.week_materials'\) is not null then\s+execute 'lock table/);
  for (const name of NEW_FUNCS) assert.match(body, new RegExp(`drop function if exists public\\.${name}\\(`), name);
  assert.match(body, /drop table if exists public\.week_material_uploads;/);
  assert.doesNotMatch(body, /drop table if exists public\.week_materials;/);
  // delete 문은 빈 버킷 삭제 시도 하나 (실패해도 계속)
  assert.deepEqual([...body.matchAll(/\bdelete from ([\w.]+)/gi)].map((m) => m[1]), ["storage.buckets"]);
  assert.match(body, /delete from storage\.buckets where id = 'week-materials';\s+exception when others then/);
});

test("3-C 점검 SQL: 읽기 전용, 지문 9개 테이블, 버킷·권한·정책 확인 / 스모크: 검사 수·최종 raise·역할 복원", () => {
  for (const q of [PRE, POST]) assert.doesNotMatch(code(q), /^\s*(insert|update|delete|create|drop|alter|grant|revoke|truncate|do|begin|commit)\b/im);
  for (const q of [PRE, POST]) assert.equal([...code(q).matchAll(/^(?:select|union all\nselect) '(\w+)', count\(\*\)/gm)].length + 1, 9);
  assert.match(POST, /cardinality\(b\.allowed_mime_types\) as mime_count/);
  assert.match(POST, /user_column_grants/);
  const body = code(SMOKE);
  assert.equal([...body.matchAll(/^do \$smoke\$/gm)].length, 1);
  assert.equal(body.slice(body.lastIndexOf("$smoke$;") + 8).trim(), "");
  const expected = Number(/c_expected constant integer := (\d+)/.exec(body)?.[1]);
  assert.equal([...body.matchAll(/pg_temp\.e2_check\('/g)].length, expected);
  assert.ok(SMOKE.includes(`PASS ${expected} · FAIL 0`));
  assert.doesNotMatch(body, /\b(commit|rollback)\s*;/i);
  assert.doesNotMatch(body, /auth\.users|public\.profiles|storage\.objects|'sub'/);
  assert.match(body, /execute format\('set local role %I', v_before\);\s+if current_user is distinct from v_before then\s+raise exception '역할 복원 실패/);
  assert.match(body, /raise exception using\s+errcode = 'P0001',\s+message = format\(E'FILES SMOKE 결과/);
});

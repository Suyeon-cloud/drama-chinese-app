// Phase 3-B 마이그레이션(week_materials) 정적 검사 (npm test). DB에 연결하지 않는다 — SQL 문장과 구조만 본다.
// 실제 PostgreSQL에서의 동작(권한 거부·RLS·잠금)은 이 테스트로 보장되지 않는다. (…_rollback_smoke.sql·배포 후 확인)
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { MATERIAL_FILE_MAX_BYTES, MATERIAL_FILE_MIME_TYPES, MATERIAL_TEXT_LIMITS, MAX_MATERIALS_PER_WEEK, safeHttpsUrl } from "../src/content/materialRules";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const B3_FILE = migFiles.find((f) => /_phase_3b_week_materials\.sql$/.test(f));
const B3 = B3_FILE ? read(path.join(MIG_DIR, B3_FILE)) : "";
const E1 = read(path.join(MIG_DIR, migFiles.find((f) => /_phase_e1_course_management\.sql$/.test(f))!));
const DOWN = read(path.join("supabase", "rollback", "20261107090000_phase_3b_week_materials.down.sql"));
const PRE = read(path.join("supabase", "checks", "20261107090000_phase_3b_pre.sql"));
const POST = read(path.join("supabase", "checks", "20261107090000_phase_3b_post.sql"));
const SMOKE = read(path.join("supabase", "checks", "20261107090000_phase_3b_rollback_smoke.sql"));

const fn = (src: string, name: string): string => {
  const start = src.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `함수 없음: ${name}`);
  const end = src.indexOf("\n$$;", start);
  return src.slice(start, end + 4);
};
const code = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();
const functionNames = (src: string) => [...src.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);

const AUTH_FUNCTIONS = ["list_week_materials", "save_week_material", "delete_week_material", "reorder_week_materials"];
const ADMIN_FUNCTIONS = ["admin_save_week_material", "admin_delete_week_material", "admin_reorder_week_materials"];
const INTERNAL_FUNCTIONS = [
  "_can_see_all_week_materials",
  "_is_week_material_learner",
  "_material_text",
  "_material_url",
  "_renumber_week_materials",
  "_save_week_material",
  "_delete_week_material",
  "_reorder_week_materials",
  "_material_actor_label",
];
const NEW_FUNCTIONS = [...AUTH_FUNCTIONS, ...ADMIN_FUNCTIONS, ...INTERNAL_FUNCTIONS];

const top = code(B3);
const grantsOf = (name: string) =>
  [...top.matchAll(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (\\w+);`, "g"))].map((m) => m[1]);
const revokedFrom = (name: string) => {
  const m = new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from ([\\w, ]+);`).exec(top);
  assert.ok(m, `revoke 없음: ${name}`);
  return m[1].split(/,\s*/).sort();
};

test("3-B: 마지막 마이그레이션, 파일 전체가 begin … commit 한 트랜잭션, 추가형", () => {
  assert.ok(B3_FILE, "3-B 마이그레이션 파일");
  assert.equal(migFiles[migFiles.length - 1], B3_FILE);
  // 첫 문장이 begin, 마지막 문장이 commit, 그 사이에 다른 begin/commit/rollback 없음
  assert.match(top, /^begin;\n/);
  assert.match(top, /\ncommit;$/);
  assert.equal([...top.matchAll(/^(begin|commit|rollback);$/gm)].length, 2);
  for (const bad of [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bdrop\s+column\b/i, /\balter\s+column\b/i]) assert.doesNotMatch(top, bad);
  assert.deepEqual([...top.matchAll(/alter table ([\w.]+)/g)].map((m) => m[1]), ["public.week_materials"]);
  for (const t of ["lessons", "lesson_progress", "lesson_dialogues", "enrollments", "sections", "profiles", "courses"]) {
    assert.doesNotMatch(top, new RegExp(`^\\s*(insert into|delete from)\\s+public\\.${t}\\b`, "im"), t);
  }
  // 함수 밖에서 행을 쓰는 문장 없음, Storage 변경 없음 (버킷은 3-C)
  const outside = top.replace(/create or replace function[\s\S]*?\n\$\$;/g, "").replace(/do \$pre\$[\s\S]*?\n\$pre\$;/g, "");
  assert.deepEqual([...outside.matchAll(/^\s*(insert into|update|delete from)\s+([\w.]+)/gim)].map((m) => m[2]), []);
  assert.doesNotMatch(top, /\bstorage\.\w+/);
});

test("3-B: 함수 생성과 실행 권한 회수가 같은 트랜잭션 안 — 모든 새 함수는 생성 뒤 commit 전에 public·anon·authenticated·service_role에서 회수", () => {
  assert.deepEqual(functionNames(B3).sort(), [...NEW_FUNCTIONS, "admin_update_course"].sort());
  const commitAt = top.lastIndexOf("commit;");
  for (const name of [...NEW_FUNCTIONS, "admin_update_course"]) {
    assert.deepEqual(revokedFrom(name), ["anon", "authenticated", "public", "service_role"], name);
    const created = top.indexOf(`create or replace function public.${name}(`);
    const revoked = top.search(new RegExp(`revoke all on function public\\.${name}\\(`));
    assert.ok(created < revoked && revoked < commitAt, `${name}: 생성 → 회수 → commit 순서`);
  }
  for (const name of AUTH_FUNCTIONS) assert.deepEqual(grantsOf(name), ["authenticated"], name);
  for (const name of [...ADMIN_FUNCTIONS, "admin_update_course"]) assert.deepEqual(grantsOf(name), ["service_role"], name);
  for (const name of INTERNAL_FUNCTIONS) assert.deepEqual(grantsOf(name), [], name);
  for (const name of [...NEW_FUNCTIONS, "admin_update_course"]) {
    const body = fn(B3, name);
    assert.match(body, /set search_path = ''/, name);
    if (!["_material_text", "_material_url"].includes(name)) assert.match(body, /security definer/, name);
  }
});

test("3-B (P1): 학생이 Supabase API로 테이블을 직접 읽을 수 없다 — anon·authenticated 테이블·열 권한 없음, 정책 없음, RLS 켜짐", () => {
  assert.match(top, /alter table public\.week_materials enable row level security;/);
  assert.match(top, /revoke all on table public\.week_materials from public, anon, authenticated, service_role;/);
  const grants = [...top.matchAll(/grant ([^;]+?) on (?:table )?public\.week_materials\b[^;]*to (\w+);/g)].map((m) => `${m[2]}:${m[1]}`);
  assert.deepEqual(grants, ["service_role:select, insert, update, delete"]);
  // 열 단위 권한(grant select (col, …))도 없다
  assert.doesNotMatch(top, /grant\s+\w+\s*\([^)]*\)\s+on\s+(table\s+)?public\.week_materials/i);
  assert.doesNotMatch(top, /create policy/i);
  assert.match(top, /drop policy if exists week_materials_select_readable on public\.week_materials;/);
  assert.match(top, /drop function if exists public\.can_read_week_material\(text, text\);/);
});

test("3-B (P1): 목록 RPC — 학생은 published만, 수정자 표시는 교수자에게만, 내부 칸(작성자 id·저장 경로·버전)은 누구에게도 안 보낸다", () => {
  const list = fn(B3, "list_week_materials");
  const returns = /returns table \(([\s\S]*?)\)\nlanguage/.exec(list)?.[1] ?? "";
  for (const hidden of ["updated_by uuid", "storage_path", "version"]) assert.ok(!returns.includes(hidden), hidden);
  assert.match(returns, /updated_by_label text/);
  assert.match(list, /if auth\.uid\(\) is null then\s+raise exception 'not authenticated' using errcode = '28000'/);
  assert.match(list, /v_all := public\._can_see_all_week_materials\(p_course_id\);/);
  assert.match(list, /if not v_all and not public\._is_week_material_learner\(p_course_id\) then\s+return;/);
  assert.match(list, /and \(v_all or m\.status = 'published'\)/);
  assert.match(list, /case when v_all then m\.updated_by_label end/);
  // select 목록에 숨길 칸이 없다
  const select = /return query\s+select ([\s\S]*?)\s+from public\.week_materials m/.exec(list)?.[1] ?? "";
  for (const hidden of ["m.updated_by,", "m.updated_by ", "m.storage_path", "m.version"]) assert.ok(!select.includes(hidden), hidden);
  const seeAll = fn(B3, "_can_see_all_week_materials");
  assert.match(seeAll, /public\.can_manage_course\(p_course_id\)/);
  assert.match(seeAll, /my_instructor_section_ids\(false\)/);
  assert.match(fn(B3, "_is_week_material_learner"), /my_enrolled_section_ids\(\)/);
});

test("3-B (P2): 사전 확인 — 의존 함수, 기존 테이블의 열·제약·trigger·정책, 같은 이름 다른 함수가 다르면 멈춘다", () => {
  const pre = /do \$pre\$([\s\S]*?)\n\$pre\$;/.exec(B3)?.[1] ?? "";
  assert.ok(pre, "사전 확인 블록");
  assert.ok(B3.indexOf("do $pre$") < B3.indexOf("create table if not exists public.week_materials"), "테이블 생성 전에 확인");
  for (const dep of ["set_updated_at()", "can_manage_course(text)", "my_instructor_section_ids(boolean)", "my_enrolled_section_ids()", "lesson_course_lock_key(text)", "_course_text(text,text,integer,boolean)", "admin_update_course(text,text,text,text,text,integer,text)"]) {
    assert.ok(pre.includes(`to_regprocedure('public.${dep}')`), dep);
  }
  // 기대 열은 create table의 열과 같은 순서·타입
  const expectedCols = (/v_expected_columns constant text :=\s*([\s\S]*?);/.exec(pre)?.[1] ?? "").replace(/'\s*\|\|\s*'/g, "").replace(/'/g, "").replace(/\s+/g, " ").trim();
  const table = /create table if not exists public\.week_materials \(([\s\S]*?)\n\);/.exec(B3)?.[1] ?? "";
  const cols = [...table.matchAll(/^\s{2}(\w+) (text|integer|bigint|uuid|timestamptz)\b(.*)$/gm)].map((m) => {
    const type = m[2] === "timestamptz" ? "timestamp with time zone" : m[2];
    const notNull = /not null|primary key/.test(m[3]);
    return `${m[1]}:${type}:${notNull ? "NO" : "YES"}`;
  });
  assert.equal(expectedCols, cols.join(","));
  // 기대 제약 이름: 열 check(이름 규칙) + pkey + fkey 2개 + kind_fields
  const checkCols = [...table.matchAll(/^\s{2}(?!constraint\b)(\w+) [^\n]*? check \(/gm)].map((m) => `week_materials_${m[1]}_check`);
  const expectedCons = (/v_expected_constraints constant text :=\s*([\s\S]*?);/.exec(pre)?.[1] ?? "").replace(/'\s*\|\|\s*'/g, "").replace(/'/g, "").replace(/\s+/g, "").split(",");
  const want = [...checkCols, "week_materials_pkey", "week_materials_course_id_fkey", "week_materials_updated_by_fkey", "week_materials_kind_fields"];
  assert.deepEqual([...expectedCons].sort(), [...want].sort());
  assert.deepEqual(expectedCons, [...expectedCons].sort(), "C 정렬 순서로 적어야 한다");
  assert.match(pre, /order by conname collate "C"/);
  assert.match(pre, /is distinct from 'week_materials_set_updated_at'/);
  assert.match(pre, /policyname <> 'week_materials_select_readable'/);
  // 같은 이름 다른 함수: 모든 새 함수 이름과 시그니처를 확인 목록에 넣었다
  for (const name of NEW_FUNCTIONS) {
    assert.ok(pre.includes(`'${name}'`), `이름 목록: ${name}`);
    assert.ok(pre.includes(`to_regprocedure('public.${name}(`), `시그니처: ${name}`);
  }
  assert.equal([...pre.matchAll(/raise exception '3B_PREFLIGHT:/g)].length, 6);
});

/**
 * PostgreSQL 함수 인자·RETURNS TABLE 열 이름에는 col_name_keyword·reserved 키워드를 따옴표 없이 쓸 수 없다.
 * (테이블 열 이름으로는 되는 position 등이 여기서는 구문 오류 42601 — 3-B 첫 적용 때 실제로 난 오류)
 */
const NOT_PARAM_NAMES = new Set(
  (
    "between bigint bit boolean char character coalesce dec decimal exists extract float greatest grouping inout int integer interval " +
    "json json_array json_arrayagg json_exists json_object json_objectagg json_query json_scalar json_serialize json_table json_value " +
    "least merge_action national nchar none normalize nullif numeric out overlay position precision real row setof smallint substring " +
    "time timestamp treat trim values varchar xmlattributes xmlconcat xmlelement xmlexists xmlforest xmlnamespaces xmlparse xmlpi xmlroot " +
    "xmlserialize xmltable all analyse analyze and any array as asc asymmetric both case cast check collate column constraint create " +
    "current_catalog current_date current_role current_time current_timestamp current_user default deferrable desc distinct do else end " +
    "except false fetch for foreign from grant group having in initially intersect into lateral leading limit localtime localtimestamp " +
    "not null offset on only or order placing primary references returning select session_user some symmetric system_user table then " +
    "to trailing true union unique user using variadic when where window with"
  ).split(" "),
);
/** 최상위 쉼표로 나눈다 (괄호 안 쉼표는 무시) */
const splitTop = (s: string) => {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
};

test("모든 마이그레이션: 함수 인자·RETURNS TABLE 열 이름에 따옴표 없는 PostgreSQL 키워드가 없다 (예: position)", () => {
  const bad: string[] = [];
  for (const f of migFiles) {
    const src = code(read(path.join(MIG_DIR, f)));
    for (const m of src.matchAll(/create or replace function public\.(\w+)\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*returns\s+(table\s*\(([\s\S]*?)\)\s*\n\s*language|[^\n]*)/g)) {
      const [, name, args, , table] = m;
      const names = [
        ...splitTop(args).map((a) => a.trim().replace(/^(in|out|inout|variadic)\s+/i, "")),
        ...(table ? splitTop(table).map((a) => a.trim()) : []),
      ]
        .filter(Boolean)
        .map((a) => a.split(/\s+/)[0]);
      for (const n of names) if (!n.startsWith('"') && NOT_PARAM_NAMES.has(n.toLowerCase())) bad.push(`${f}: ${name}(${n})`);
    }
  }
  assert.deepEqual(bad, []);
  // 3-B 목록 함수의 position은 따옴표로 쓴다
  assert.match(fn(B3, "list_week_materials"), /status text, "position" integer,/);
});

test("3-B: 쓰기 RPC — 교수자는 can_manage_course, 과목 잠금, 링크만, 주차·개수·순서 검사", () => {
  const save = fn(B3, "_save_week_material");
  assert.match(save, /if not p_is_admin and not public\.can_manage_course\(v_course_id\)/);
  assert.match(save, /pg_advisory_xact_lock\(public\.lesson_course_lock_key\(v_course_id\)\)/);
  assert.match(save, /p_input ->> 'kind' is distinct from 'link'/);
  assert.match(save, /v_week < 1 or v_week > v_course\.week_count/);
  assert.match(save, new RegExp(`>= ${MAX_MATERIALS_PER_WEEK} then`));
  assert.match(save, new RegExp(`'자료 제목', ${MATERIAL_TEXT_LIMITS.title}, true`));
  assert.match(save, new RegExp(`'설명', ${MATERIAL_TEXT_LIMITS.description}, false`));
  for (const name of ["_delete_week_material", "_reorder_week_materials"]) {
    assert.match(fn(B3, name), /lesson_course_lock_key/, name);
    assert.match(fn(B3, name), /if not p_is_admin and not public\.can_manage_course/, name);
  }
  assert.match(fn(B3, "_reorder_week_materials"), /errcode = '23505'/);
  for (const name of ["save_week_material", "delete_week_material", "reorder_week_materials"]) {
    assert.match(fn(B3, name), /auth\.uid\(\) is null|v_uid is null/, name);
    assert.match(fn(B3, name), /_material_actor_label\(\) is null|v_label is null/, name);
    assert.match(fn(B3, name), /, false\)/, name);
  }
  for (const name of ADMIN_FUNCTIONS) assert.match(fn(B3, name), /, true\)/, name);
});

test("3-B: 링크 주소 규칙이 화면(safeHttpsUrl)과 맞고, 파일 칸 제약이 화면 규칙과 같다", () => {
  const pattern = /url ~ '(\^https:\/\/[^']+)'/.exec(B3)?.[1];
  assert.equal(pattern, "^https://[^\\s/?#@:]+\\.[^\\s/?#@]+");
  assert.ok(fn(B3, "_material_url").includes(pattern!));
  const js = new RegExp(pattern!);
  for (const ok of ["https://example.com/a?b=1#c", "https://docs.google.com/document/d/x/edit", "https://www.youtube.com/watch?v=abc", "https://예시.한국/"]) {
    const url = safeHttpsUrl(ok);
    assert.ok(url && js.test(url) && !/\s/.test(url), `DB 규칙이 거부함: ${url}`);
  }
  assert.equal(Number(/size_bytes between 1 and (\d+)/.exec(top)![1]), MATERIAL_FILE_MAX_BYTES);
  const tableMimes = /mime_type in \(([\s\S]*?)\)\),/.exec(top)?.[1] ?? "";
  assert.deepEqual([...tableMimes.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), [...MATERIAL_FILE_MIME_TYPES].sort());
});

test("3-B: admin_update_course는 E1에서 보충 자료 주차 한 줄만 더했다", () => {
  const before = code(fn(E1, "admin_update_course"));
  const after = code(fn(B3, "admin_update_course"));
  const expected = before.replace(
    "coalesce((select max(p.week) from public.lesson_progress p join public.lessons l on l.id = p.lesson_id where l.course_id = c.id), 0)\n",
    "coalesce((select max(p.week) from public.lesson_progress p join public.lessons l on l.id = p.lesson_id where l.course_id = c.id), 0),\n" +
      "               coalesce((select max(m.week) from public.week_materials m where m.course_id = c.id), 0)\n",
  );
  assert.notEqual(expected, before);
  assert.equal(after, expected);
});

test("3-B 되돌리기 (P2): 자료가 있으면 전체 중단, 테이블이 없어도 재실행 가능, E1 원문으로 복원", () => {
  const body = code(DOWN);
  assert.match(body, /^begin;\n/);
  assert.match(body, /\ncommit;$/);
  // 잠금과 행 검사는 테이블이 있을 때만, 그리고 execute로 (테이블이 없을 때 해석 오류가 나지 않게)
  const guard = /do \$\$([\s\S]*?)\n\$\$;/.exec(body)?.[1] ?? "";
  const ifAt = guard.indexOf("if to_regclass('public.week_materials') is not null then");
  assert.ok(ifAt > 0);
  assert.ok(guard.indexOf("execute 'lock table public.week_materials in access exclusive mode';") > ifAt);
  assert.ok(guard.indexOf("execute 'select exists (select 1 from public.week_materials)' into v_has_rows;") > guard.indexOf("lock table"));
  assert.match(guard, /if v_has_rows then\s+raise exception '3B_ROLLBACK: 보충 자료가 남아 있어/);
  // 테이블 이름을 정적으로 쓰는 곳은 if exists 문장뿐 (테이블이 없으면 해석 단계에서 실패할 문장이 없다)
  const staticRefs = body.split("\n").filter((l) => /public\.week_materials\b/.test(l) && !/execute '|to_regclass\('public\.week_materials'\)|drop table if exists public\.week_materials;/.test(l));
  assert.deepEqual(staticRefs.filter((l) => !/^\s*(drop function if exists|coalesce\(\(select max\(m\.week\))/.test(l)), []);
  // E1 복원에 필요한 함수 확인, 원문 그대로 복원
  assert.match(guard, /to_regprocedure\('public\._course_text\(text,text,integer,boolean\)'\) is null/);
  assert.ok(DOWN.includes(fn(E1, "admin_update_course")), "E1 admin_update_course 원문");
  for (const name of NEW_FUNCTIONS) assert.match(DOWN, new RegExp(`drop function if exists public\\.${name}\\(`), name);
  assert.match(body, /drop table if exists public\.week_materials;/);
  assert.doesNotMatch(body, /drop table if exists public\.(lessons|lesson_progress|courses|sections|enrollments)\b/);
  assert.doesNotMatch(body, /\bdelete from\b/i);
  assert.doesNotMatch(body, /\bstorage\./);
});

test("3-B 점검 SQL: 사전 점검에 충돌·권한 검사, 사후 점검은 직접 권한·정책이 없어야 함을 확인", () => {
  for (const q of [PRE, POST]) assert.doesNotMatch(code(q), /^\s*(insert|update|delete|create|drop|alter|grant|revoke|truncate)\b/im);
  assert.match(PRE, /information_schema\.columns where table_schema = 'public' and table_name = 'week_materials'/);
  assert.match(PRE, /from pg_constraint where conrelid = to_regclass\('public\.week_materials'\)/);
  assert.match(PRE, /information_schema\.column_privileges/);
  assert.match(PRE, /'can_read_week_material'/);
  assert.match(POST, /information_schema\.column_privileges/);
  assert.match(POST, /RLS 정책: 없어야 한다 \(0행\)/);
  assert.match(POST, /'list_week_materials'/);
});

test("3-B 스모크: do 블록 하나, 검사 수 상수 = 실제 검사 수, 마지막에 항상 raise, 사용자 데이터를 만들지 않는다", () => {
  const body = code(SMOKE);
  assert.equal([...body.matchAll(/^do \$smoke\$/gm)].length, 1);
  assert.equal(body.slice(body.lastIndexOf("$smoke$;") + 8).trim(), "");
  const expected = Number(/c_expected constant integer := (\d+)/.exec(body)?.[1]);
  assert.equal(expected, 26);
  assert.equal([...body.matchAll(/pg_temp\.e2_check\('/g)].length, expected);
  assert.ok(SMOKE.includes(`PASS ${expected} · FAIL 0`), "머리말의 검사 수");
  assert.doesNotMatch(body, /\b(commit|rollback)\s*;/i);
  assert.match(body, /raise exception using\s+errcode = 'P0001',\s+message = format\(E'MATERIALS SMOKE 결과/);
  assert.doesNotMatch(body, /auth\.users|public\.profiles/);
  assert.doesNotMatch(body, /'sub'/);
  // week_materials가 없어도 안전 확인까지 도달하도록 행 타입 대신 record
  assert.doesNotMatch(body, /\bpublic\.week_materials;/);
  assert.match(body, /^\s+m1 record;$/m);
  assert.match(body, /^\s+m2 record;$/m);
});

test("3-B 스모크: 역할 전환 실패·current_user·auth.uid()를 따로 확인하고, 원래 역할을 명시적으로 복원·확인한다", () => {
  const tryAs = /create function pg_temp\.e2_try_as[\s\S]*?\n  \$f\$;/.exec(SMOKE)?.[0] ?? "";
  assert.ok(tryAs, "e2_try_as");
  // 전환 단계는 검사 문장과 다른 블록 — 실패하면 'SETUP:'으로 (42501로 오인하지 않음)
  assert.match(tryAs, /execute format\('set local role %I', p_role\);\s+exception when others then\s+return 'SETUP:역할 전환 실패/);
  assert.match(tryAs, /if current_user is distinct from p_role then\s+v_out := 'SETUP:/);
  assert.match(tryAs, /v_uid := auth\.uid\(\);\s+if v_uid is not null then\s+v_out := 'SETUP:/);
  // auth.uid()가 참조하는 설정을 모두 비운다
  for (const key of ["request.jwt.claims", "request.jwt.claim.sub", "request.jwt.claim.role"]) {
    assert.ok(tryAs.includes(`set_config('${key}', '', true)`), key);
  }
  // 검사 문장은 전환·확인이 성공했을 때만, 끝나면 원래 역할로 명시적 복원 + 확인(실패하면 오류 → ABORT)
  assert.match(tryAs, /if v_out is null then\s+begin\s+execute p_sql into v_out;/);
  assert.match(tryAs, /execute format\('set local role %I', v_before\);\s+if current_user is distinct from v_before then\s+raise exception '역할 복원 실패/);
  assert.doesNotMatch(tryAs, /reset role/);
  // 'SETUP:' 결과는 어떤 기대값(OK:…·ERR:…)과도 맞지 않는다
  const wants = [...SMOKE.matchAll(/pg_temp\.e2_try_as\([^;]*?\),\s*'([^']+)'\);/g)].map((m) => m[1]);
  assert.equal(wants.length, 9);
  assert.ok(wants.every((w) => /^(OK|ERR):/.test(w)), wants.join(" | "));
  assert.ok(SMOKE.includes("pg_temp.e2_check('역할 복원: 역할 검사 뒤 current_user가 실행 시작 때 역할',\n      current_user::text, v_role_before);".replace(/\n/g, SMOKE.includes("\r\n") ? "\r\n" : "\n")) || /역할 복원[^;]*current_user::text, v_role_before\)/.test(SMOKE));
  for (const label of ["anon 전환: current_user = anon, auth.uid() NULL", "교수자 저장 RPC 28000", "목록 RPC 28000", "내부 함수 실행 거부(42501)", "관리자 RPC 실행 거부(42501)"]) {
    assert.ok(SMOKE.includes(label), label);
  }
});

test("3-B 스모크: 이동·삭제는 RPC 문장과 상태 조회 문장을 나누고, 배포된 함수·trigger의 외부 호출을 실행 전에 확인한다", () => {
  const body = code(SMOKE);
  // 이동: RPC 결과를 v_got에 받은 뒤 다른 문장에서 테이블을 다시 읽는다
  assert.match(body, /v_got := pg_temp\.e2_try\(format\(\$q\$select \(x\.week = 4 and x\.position = 0\)::text from public\.admin_save_week_material\(null, %L, '\{"week":4\}'::jsonb\) x\$q\$, m1\.id\)\);/);
  assert.match(body, /v_got\s+\|\| '\/' \|\| coalesce\(\(select week \|\| ':' \|\| position from public\.week_materials where id = m1\.id\), 'NULL'\)/);
  assert.match(body, /'OK:true\/4:0\/0'/);
  assert.doesNotMatch(body, /admin_save_week_material\(null, %L, '\{"week":4\}'::jsonb\) x\$q\$, m2\.id/);
  assert.match(body, /v_got := pg_temp\.e2_try\(format\(\$q\$select \(public\.admin_delete_week_material\(%L\)\)\.id\$q\$, m1\.id\)\);/);
  // 안전 확인: 호출하는 배포 함수 목록 + trigger, 외부 호출·NOTIFY·large object·COPY PROGRAM 패턴, 함수 누락 시 중단, 시퀀스 정보
  for (const sig of ["admin_save_week_material(text,text,jsonb,text)", "_save_week_material(text,text,jsonb,uuid,text,boolean)", "admin_update_course(text,text,text,text,text,integer,text)", "can_manage_course(text)", "set_updated_at()"]) {
    assert.ok(SMOKE.includes(`'public.${sig}'`), sig);
  }
  assert.match(body, /\\mpg_notify\\M/);
  assert.match(body, /\\mdblink/);
  assert.match(body, /lo_\(import\|export\|create\|unlink\)/);
  assert.match(body, /MATERIALS_SMOKE_ABORT: 검사할 함수가 없어요/);
  assert.match(body, /INFO  시퀀스 사용 열: /);
  // 시퀀스: 열 기본값·identity + 함수·trigger 정의의 nextval — 외부 호출 검사와 같은 목록(v_called)을 쓴다
  assert.match(body, /INFO  시퀀스 사용 함수: /);
  assert.match(body, /select to_regprocedure\(k\)::oid as oid from unnest\(v_called\) k/);
  assert.match(body, /where pg_get_functiondef\(p\.oid\) ~\* '\\mnextval\\s\*\\\('/);
  assert.match(body, /with called\(sig\) as \(\s+select unnest\(v_called\)\s+\)/);
  assert.match(body, /if exists \(select 1 from unnest\(v_called\) s where to_regprocedure\(s\) is null\) then/);
  assert.equal([...(/v_called constant text\[\] := array\[([\s\S]*?)\];/.exec(body)?.[1] ?? "").matchAll(/'public\.[^']+'/g)].length, 23);
  // 머리말이 실제 검사 범위와 같다 (열 + 함수 두 줄, 동적 SQL 한계)
  assert.match(SMOKE, /'INFO  시퀀스 사용 열': courses·week_materials 열 기본값의 nextval, identity 열/);
  assert.match(SMOKE, /'INFO  시퀀스 사용 함수': 위 외부 호출 검사와 같은 함수·trigger 목록 중 정의에 nextval이 있는 것/);
  assert.doesNotMatch(SMOKE, /열 기본값과 위 함수에 nextval이 있는지 INFO 줄로/);
  assert.ok(body.indexOf("MATERIALS_SMOKE_ABORT") < body.indexOf("create function pg_temp.e2_try("), "안전 확인은 쓰기 전에");
  // 머리말: 테이블 수준 잠금 설명, 배포 후 계정 테스트 구분
  assert.match(SMOKE, /테이블 수준 ROW EXCLUSIVE/);
  assert.match(SMOKE, /이 파일이 검사하지 않는 것 → 배포 후 실제 계정으로 확인/);
});

test("3-B 스모크 전후 비교 SQL: 읽기 전용, week_materials 포함 9개 테이블", () => {
  const cmp = code(read(path.join("supabase", "checks", "20261107090000_phase_3b_smoke_compare.sql")));
  assert.doesNotMatch(cmp, /^\s*(insert|update|delete|create|drop|alter|grant|revoke|truncate|do|begin|commit|set|lock)\b/im);
  const tables = [...cmp.matchAll(/^(?:select|union all\nselect) '(\w+)'/gm)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ["courses", "enrollments", "feedback_drafts", "lesson_dialogues", "lesson_progress", "lessons", "section_instructors", "sections", "week_materials"]);
});
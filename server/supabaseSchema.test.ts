// Supabase migration 파일 정적 검사 (npm test). 실제 DB 동작은 scripts/supabase-phase-b-check.mjs로 dev 프로젝트에서 확인한다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const dir = path.join("supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = files.map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
const code = sql.replace(/--[^\n]*/g, ""); // 주석 제외

test("Phase B migration: profiles·instructors 테이블과 RLS", () => {
  assert.ok(files.some((f) => /_phase_b_profiles_instructors\.sql$/.test(f)));
  for (const t of ["profiles", "instructors"]) {
    assert.match(code, new RegExp(`create table if not exists public\\.${t}\\b`));
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(code, new RegExp(`revoke all on table public\\.${t} from anon, authenticated`));
  }
  assert.match(code, /references auth\.users \(id\) on delete cascade/);
});

test("Phase B migration: 본인이 고칠 수 있는 칸에 승인·표시용 값이 없다", () => {
  const grant = /grant update \(([^)]*)\) on table public\.profiles to authenticated/.exec(code);
  assert.ok(grant);
  const cols = grant[1].split(",").map((c) => c.trim());
  assert.deepEqual(cols, ["name", "university", "department", "grade", "student_id", "contact_email", "phone"]);
  for (const c of ["status", "approved_at", "profile_completed", "id", "picture", "avatar_color", "first_seen_at"]) {
    assert.ok(!cols.includes(c), c);
  }
  // 테이블 전체 update·insert·delete는 로그인 사용자에게 주지 않는다.
  assert.doesNotMatch(code, /grant (all|insert|delete|update) on table public\.(profiles|instructors) to (anon|authenticated)/);
});

test("Phase B migration: SECURITY DEFINER 함수는 search_path를 고정하고 내부 함수는 직접 부를 수 없다", () => {
  const fns = [...code.matchAll(/create or replace function (public\.\w+)\(([\s\S]*?)\n\$\$;/g)];
  assert.ok(fns.length >= 7);
  for (const [, name, body] of fns) {
    if (/security definer/.test(body)) assert.match(body, /set search_path = ''/, name);
  }
  for (const internal of ["ensure_profile(uuid)", "link_instructor_account(uuid)", "handle_new_auth_user()"]) {
    assert.match(code, new RegExp(`revoke all on function public\\.${internal.replace(/[()]/g, "\\$&")} from public, anon, authenticated`));
    assert.doesNotMatch(code, new RegExp(`grant execute on function public\\.${internal.replace(/[()]/g, "\\$&")}`));
  }
  // 로그인 사용자용 함수는 인자로 사용자 id를 받지 않는다.
  assert.match(code, /create or replace function public\.sync_my_account\(\)/);
  assert.doesNotMatch(code, /grant execute on function [^;]+ to anon/);
});

test("Phase B migration: 교강사 연결은 인증된 이메일만, 이미 연결된 행은 바꾸지 않는다", () => {
  assert.match(code, /email_confirmed_at is not null/);
  assert.match(code, /where email = v_email and user_id is null/);
  // 이메일 인증이 끝나는 순간(UPDATE)에도 같은 연결 함수를 다시 부른다.
  assert.match(code, /after update of email_confirmed_at on auth\.users/);
  assert.match(code, /when \(old\.email_confirmed_at is null and new\.email_confirmed_at is not null\)/);
  assert.match(code, /revoke all on function public\.handle_auth_email_confirmed\(\) from public, anon, authenticated/);
});

test("Phase C1 migration: 과목·분반·배정·수강 테이블과 RLS", () => {
  assert.ok(files.some((f) => /_phase_c1_courses_sections_enrollments\.sql$/.test(f)));
  for (const t of ["courses", "sections", "section_instructors", "enrollments"]) {
    assert.match(code, new RegExp(`create table if not exists public\\.${t}\\b`));
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(code, new RegExp(`revoke all on table public\\.${t} from anon, authenticated`));
    assert.doesNotMatch(code, new RegExp(`grant (all|insert|update|delete)[^;]* on table public\\.${t} to (anon|authenticated)`));
  }
  // 분반은 지우지 않는다(FK restrict), 수강은 (분반, 과목) 쌍이 실제와 맞아야 한다.
  assert.match(code, /course_id text not null references public\.courses \(id\) on delete restrict/);
  assert.match(code, /foreign key \(section_id, course_id\) references public\.sections \(id, course_id\) on delete restrict/);
  assert.match(code, /unique \(section_id, user_id\)/);
  assert.match(code, /create unique index if not exists sections_active_name_uidx on public\.sections \(course_id, name\) where status = 'active'/);
});

test("Phase C1 migration: 학생에게 강의코드 칸을 열지 않고, 수강 등록은 RPC로만", () => {
  const grant = /grant select \(([^)]*)\) on table public\.sections to authenticated/.exec(code);
  assert.ok(grant);
  assert.ok(!grant[1].split(",").map((c) => c.trim()).includes("code"));
  assert.doesNotMatch(code, /grant select on table public\.sections to authenticated/);
  assert.doesNotMatch(code, /create policy [^;]* on public\.enrollments\s+for (insert|update|delete|all)/);
  assert.match(code, /grant execute on function public\.enroll_with_code\(text, boolean\) to authenticated/);
});

test("Phase C1 migration: 같은 과목 중복 수강은 잠금과 trigger로, 재활성화 때도 검사한다", () => {
  assert.match(code, /before insert on public\.enrollments/);
  assert.match(code, /pg_advisory_xact_lock\(public\.enrollment_lock_key\(new\.user_id, new\.course_id\)\)/);
  assert.match(code, /pg_advisory_xact_lock\(public\.enrollment_lock_key\(v_uid, c\.id\)\)/);
  assert.match(code, /pg_advisory_xact_lock\(public\.enrollment_lock_key\(r\.user_id, s\.course_id\)\)/);
});

test("Phase C1 migration: 관리자 함수는 service_role만 실행할 수 있다", () => {
  for (const fn of ["admin_create_section\\(text, text, text\\[\\], text\\)", "admin_update_section\\(text, text, text\\)"]) {
    assert.match(code, new RegExp(`revoke all on function public\\.${fn} from public, anon, authenticated`));
    assert.match(code, new RegExp(`grant execute on function public\\.${fn} to service_role`));
    assert.doesNotMatch(code, new RegExp(`grant execute on function public\\.${fn} to (anon|authenticated)`));
  }
});

test("Supabase 파일에 실제 이메일·비밀 값이 없다", () => {
  assert.doesNotMatch(code, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{20,}|sk-ant-|service_role_key\s*=|GOCSPX-/i);
  const client = readFileSync(path.join("src", "app", "lib", "supabase.ts"), "utf8");
  assert.doesNotMatch(client.replace(/\/\/[^\n]*/g, ""), /SERVICE_ROLE|service_role/);
});

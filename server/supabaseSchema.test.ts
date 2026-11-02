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

test("Supabase 파일에 실제 이메일·비밀 값이 없다", () => {
  assert.doesNotMatch(code, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{20,}|sk-ant-|service_role_key\s*=|GOCSPX-/i);
  const client = readFileSync(path.join("src", "app", "lib", "supabase.ts"), "utf8");
  assert.doesNotMatch(client.replace(/\/\/[^\n]*/g, ""), /SERVICE_ROLE|service_role/);
});

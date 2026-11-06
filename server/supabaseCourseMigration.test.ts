// Phase E1 마이그레이션(과목 inactive·과목 생성/수정 RPC) 정적 검사 (npm test). DB에 연결하지 않는다.
// - 바꾼 함수는 원래 정의와 비교해 의도한 줄만 달라졌는지 확인한다.
// - 되돌리기 SQL의 함수 본문이 원래 마이그레이션과 같은지 확인한다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { COURSE_TEXT_LIMITS, DEFAULT_WEEK_COUNT } from "../src/content/courseRules";
import { MAX_WEEK_COUNT, MIN_WEEK_COUNT } from "../src/content/courseWeeks";
import { ALL_COURSE_SEEDS } from "../src/content/courses";

const MIG_DIR = path.join("supabase", "migrations");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const E1_FILE = migFiles.find((f) => /_phase_e1_course_management\.sql$/.test(f));
const E1 = E1_FILE ? read(path.join(MIG_DIR, E1_FILE)) : "";
const C1 = read(path.join(MIG_DIR, "20261102104726_phase_c1_courses_sections_enrollments.sql"));
const D1 = read(path.join(MIG_DIR, "20261102134944_phase_d1_lessons_dialogues.sql"));
const D4 = read(path.join(MIG_DIR, "20261102145445_phase_d4_lesson_progress.sql"));
const DOWN = read(path.join("supabase", "rollback", "20261106120000_phase_e1_course_management.down.sql"));

/** 파일에서 함수 정의 하나 (create or replace function public.name( … $$;) */
const fn = (src: string, name: string): string => {
  const start = src.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `함수 없음: ${name}`);
  const end = src.indexOf("\n$$;", start);
  return src.slice(start, end + 4);
};
/** 주석 줄을 빼고 비교 (설명 문구만 바뀐 것은 차이로 보지 않는다) */
const code = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n")
    .trim();
/** 원래 본문에 기대한 바꿈을 적용하면 새 본문과 같아야 한다. */
const expectOnly = (before: string, after: string, edits: [string | RegExp, string][]) => {
  let s = code(before);
  for (const [from, to] of edits) {
    const next = s.replace(from, to);
    assert.notEqual(next, s, `바꿀 부분이 원래 정의에 없음: ${String(from)}`);
    s = next;
  }
  assert.equal(code(after), s);
};

test("Phase E1: 마지막 마이그레이션이고 추가형이다 (테이블·행을 지우거나 고치지 않는다)", () => {
  assert.ok(E1_FILE, "Phase E1 마이그레이션 파일");
  // E1은 D단계 뒤에 온다. (그 뒤에 3-B 등 다음 단계 마이그레이션이 이어질 수 있다)
  const lastD = Math.max(...migFiles.map((f, i) => (/_phase_d\d/.test(f) ? i : -1)));
  assert.ok(migFiles.indexOf(E1_FILE!) > lastD);
  const top = code(E1);
  assert.doesNotMatch(top, /\bdrop\s+table\b/i);
  assert.doesNotMatch(top, /\btruncate\b/i);
  assert.doesNotMatch(top, /\bdrop\s+column\b/i);
  assert.doesNotMatch(top, /\balter\s+column\b/i);
  // 함수 밖에서 기존 행을 바꾸는 문장이 없다. (함수 정의를 빼고 남은 부분)
  const outside = top.replace(/create or replace function[\s\S]*?\n\$\$;/g, "").replace(/do \$\$[\s\S]*?\n\$\$;/g, "");
  assert.doesNotMatch(outside, /\b(update|delete\s+from|insert\s+into)\b/i);
  // 함수 안의 delete는 _save_lesson의 기존 회화 교체 한 곳뿐
  assert.deepEqual([...top.matchAll(/delete\s+from\s+([\w.]+)/gi)].map((m) => m[1]), ["public.lesson_dialogues"]);
});

test("Phase E1: courses.status 제약에 inactive를 더하고, 이름이 다른 기존 제약도 찾아 바꾼다", () => {
  assert.match(E1, /pg_get_constraintdef\(con\.oid\) ~ '\\mstatus\\M'/);
  assert.match(E1, /execute format\('alter table public\.courses drop constraint %I', r\.conname\)/);
  assert.match(E1, /add constraint courses_status_check check \(status in \('active', 'inactive', 'legacy'\)\)/);
  // C1의 원래 제약은 그대로 (이전 파일은 고치지 않는다)
  assert.match(C1, /check \(status in \('active', 'legacy'\)\)/);
});

test("Phase E1: 기존 수강생·담당 교수자 helper는 운영+비활성 과목, 바뀐 곳은 그 줄뿐", () => {
  expectOnly(fn(C1, "my_instructor_section_ids"), fn(E1, "my_instructor_section_ids"), [
    ["and c.status = 'active'", "and c.status in ('active', 'inactive')"],
  ]);
  expectOnly(fn(C1, "my_enrolled_section_ids"), fn(E1, "my_enrolled_section_ids"), [
    ["and c.status = 'active'", "and c.status in ('active', 'inactive')"],
  ]);
  expectOnly(fn(D4, "save_my_progress"), fn(E1, "save_my_progress"), [
    ["and c.status = 'active'", "and c.status in ('active', 'inactive')"],
  ]);
  assert.match(E1, /drop policy if exists courses_select_mine on public\.courses;/);
  assert.match(E1, /using \(status in \('active', 'inactive'\) and id in \(select public\.my_course_ids\(\)\)\)/);
});

test("Phase E1: 신규 수강·새 분반은 운영(active) 과목만 — enroll_with_code·admin_create_section은 그대로, 등록 trigger도 과목 상태 확인", () => {
  assert.doesNotMatch(E1, /function public\.enroll_with_code\(/);
  assert.doesNotMatch(E1, /function public\.admin_create_section\(/);
  assert.match(fn(C1, "enroll_with_code"), /from public\.courses where id = s\.course_id and status = 'active'/);
  assert.match(fn(C1, "admin_create_section"), /c\.status <> 'active'/);
  expectOnly(fn(C1, "enrollments_guard"), fn(E1, "enrollments_guard"), [
    [
      "if not exists (select 1 from public.sections s where s.id = new.section_id and s.status = 'active') then",
      `if not exists (
    select 1
      from public.sections s
      join public.courses c on c.id = s.course_id
     where s.id = new.section_id
       and s.status = 'active'
       and c.status = 'active'
  ) then`,
    ],
  ]);
});

test("Phase E1: _save_lesson — legacy ↔ 그 밖 이동만 금지, 교수자 새 자료는 legacy만 금지, 주차 중복은 legacy 외 전부, 잠금 뒤 과목 다시 읽기", () => {
  expectOnly(fn(D1, "_save_lesson"), fn(E1, "_save_lesson"), [
    [
      "  end if;\n  select * into v_old from public.lessons where id = v_id for update;",
      "  end if;\n  select * into v_course from public.courses where id = v_course_id;\n  select * into v_old from public.lessons where id = v_id for update;",
    ],
    ["if v_old_course.status <> v_course.status then", "if (v_old_course.status = 'legacy') <> (v_course.status = 'legacy') then"],
    ["elsif v_course.status <> 'active' and not p_is_admin then", "elsif v_course.status = 'legacy' and not p_is_admin then"],
    ["if v_course.status = 'active'\n", "if v_course.status <> 'legacy'\n"],
  ]);
});

test("Phase E1: 과목 생성·수정 RPC — service_role만, search_path 고정, 입력 규칙은 화면·Express와 같다", () => {
  for (const sig of ["admin_create_course(text, text, text, text, integer)", "admin_update_course(text, text, text, text, text, integer, text)"]) {
    const s = sig.replace(/[()]/g, "\\$&");
    assert.match(E1, new RegExp(`revoke all on function public\\.${s} from public, anon, authenticated;`));
    assert.match(E1, new RegExp(`grant execute on function public\\.${s} to service_role;`));
    assert.doesNotMatch(E1, new RegExp(`grant execute on function public\\.${s} to (anon|authenticated)`));
  }
  assert.match(E1, /revoke all on function public\._course_text\(text, text, integer, boolean\) from public, anon, authenticated;/);
  assert.doesNotMatch(E1, /grant [^;]+ to anon/);
  // SECURITY DEFINER 함수는 모두 search_path를 비운다.
  for (const m of E1.matchAll(/create or replace function (public\.\w+)\(([\s\S]*?)\n\$\$;/g)) {
    if (/security definer/.test(m[0])) assert.match(m[0], /set search_path = ''/, m[1]);
  }

  const create = fn(E1, "admin_create_course");
  assert.match(create, new RegExp(`_course_text\\(p_title, '과목명', ${COURSE_TEXT_LIMITS.title}, true\\)`));
  assert.match(create, new RegExp(`_course_text\\(p_drama, '드라마명', ${COURSE_TEXT_LIMITS.drama}, false\\)`));
  assert.match(create, new RegExp(`_course_text\\(p_context, '학습 맥락', ${COURSE_TEXT_LIMITS.context}, false\\)`));
  assert.match(create, new RegExp(`_course_text\\(p_description, '설명', ${COURSE_TEXT_LIMITS.description}, false\\)`));
  assert.match(create, new RegExp(`p_week_count integer default ${DEFAULT_WEEK_COUNT}`));
  assert.match(create, new RegExp(`v_week < ${MIN_WEEK_COUNT} or v_week > ${MAX_WEEK_COUNT}`));
  // id: course- + 소문자·숫자 6자, 기본 과목 id 제외, 겹치면 다시 (on conflict do nothing → 다음 시도)
  assert.match(create, /v_alphabet text := 'abcdefghijklmnopqrstuvwxyz0123456789'/);
  assert.match(create, /for i in 0\.\.5 loop/);
  assert.match(create, /% 36/);
  for (const seed of ALL_COURSE_SEEDS) assert.ok(create.includes(`'${seed.id}'`), seed.id);
  assert.match(create, /on conflict \(id\) do nothing\s+returning \* into c;\s+exit when found;/);
  assert.match(create, /'active', null\)/);
  assert.doesNotMatch(create, /insert into public\.(sections|lessons)/);

  const update = fn(E1, "admin_update_course");
  assert.match(update, /if c\.status = 'legacy' then\s+raise exception '기존 자료 과목은 바꿀 수 없어요\.' using errcode = '42501'/);
  assert.match(update, /p_status not in \('active', 'inactive'\)/);
  assert.match(update, /pg_advisory_xact_lock\(public\.lesson_course_lock_key\(p_course_id\)\)/);
  assert.match(update, /max\(l\.week\) from public\.lessons l where l\.course_id = c\.id/);
  assert.match(update, /max\(p\.week\) from public\.lesson_progress p join public\.lessons l on l\.id = p\.lesson_id where l\.course_id = c\.id/);
  assert.match(update, /using errcode = '23514'/);
  assert.doesNotMatch(update, /set\s+id\s*=/);
  assert.doesNotMatch(update, /legacy_code\s*=/);
});

test("Phase E1 되돌리기: 원래 함수·정책 본문을 그대로 되살리고, inactive 과목이 있으면 멈춘다", () => {
  for (const [src, name] of [
    [C1, "my_instructor_section_ids"],
    [C1, "my_enrolled_section_ids"],
    [C1, "enrollments_guard"],
    [D1, "_save_lesson"],
    [D4, "save_my_progress"],
  ] as const) {
    assert.equal(fn(DOWN, name), fn(src, name), name);
  }
  assert.match(DOWN, /using \(status = 'active' and id in \(select public\.my_course_ids\(\)\)\);/);
  assert.match(DOWN, /if exists \(select 1 from public\.courses where status = 'inactive'\) then\s+raise exception/);
  assert.match(DOWN, /add constraint courses_status_check check \(status in \('active', 'legacy'\)\)/);
  for (const f of ["admin_update_course", "admin_create_course", "_course_text"]) assert.match(DOWN, new RegExp(`drop function if exists public\\.${f}\\(`));
  assert.match(DOWN, /^begin;$/m);
  assert.match(DOWN, /^commit;$/m);
  // CLI가 자동 적용하지 않는 위치
  assert.ok(!migFiles.some((f) => f.includes(".down.")));
});

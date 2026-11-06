-- Phase E2: E1 관리자 과목 관리 기능 실제 동작 검사 (롤백 전용 스모크, 관리자 경로만)
--
-- ▶ 실행 방법: 이 파일 "전체"를 SQL Editor에 붙여 넣고 한 번에 실행한다. (일부만 선택해 실행하지 않는다)
--   파일에는 do 블록 하나만 있다. 블록의 마지막 문장이 항상 오류(raise exception)를 내므로,
--   검사 결과와 관계없이 블록 안에서 만든 모든 행과 임시 함수가 통째로 취소된다.
--   예상하지 못한 오류가 나도 마찬가지다. (do 블록은 한 트랜잭션이고, 오류로 끝나면 커밋되지 않는다)
--   → 결과는 "오류" 화면에 나온다. 첫 줄이 'E2 SMOKE 결과: 성공'일 때만 검증 성공이다. (PASS 20 · FAIL 0, 누락·중단 없음)
--     'E2 SMOKE 결과: 실패 (…)'이면 괄호 안 개수와 아래 FAIL·ABORT 줄을 본다. 어느 경우든 변경은 남지 않는다.
--   → 'E2_SMOKE_ABORT'로 시작하면 안전 확인에서 멈춘 것이다. (아무것도 쓰지 않았다)
--
-- ▶ 쓰는 것 / 쓰지 않는 것
--   - 사용자: auth.users·profiles·instructors에 아무것도 만들지 않는다. 실제 사용자 UUID도 쓰지 않는다.
--   - 새로 만드는 행 (모두 롤백): 검사 과목 2개(admin_create_course), legacy 검사 과목 1개(직접 insert),
--     분반 2개(admin_create_section, 교수자 배정 없음), 학습자료 4개(admin_save_lesson)
--   - 기존 행: 읽기만 한다 (강의코드·과목 id 중복 확인 등). 기존 과목·분반·학습자료·수강·진도 행은 바꾸거나 잠그지 않는다.
--
-- ▶ 검사 항목 (관리자 RPC, 20개)
--   생성: 입력 검사 2 · 생성 결과 1 · 분반/학습자료 없음 1
--   수정: legacy 거부 · 바꿀 칸 없음 · status=legacy 거부 · 없는 과목 · 제목/주차 수정 · 주차 축소 거부 · 축소 실패 후 유지 (7)
--   비활성: 전환 · 새 분반 거부 · 기존 분반 유지 · 관리자 새 학습자료 · 주차 중복 거부 · 운영↔비활성 이동 허용 · legacy 이동 거부 (7)
--   복귀: active 전환 · 새 분반 다시 가능 (2)
--
-- ▶ 제외 (사용자 신분이 필요해 이 파일로는 검사하지 않음)
--   학생: 강의코드 수강 등록·미리보기 거부, enrollments trigger의 직접 등록 거부, 비활성 과목 조회(RLS)·커리큘럼·진도 저장
--   교수자: 비활성 과목 학습자료 조회·수정·새 학습자료(save_lesson), 기존 분반 배정
--   → 정적 테스트(supabaseCourseMigration.test.ts)와 JSON 모드 격리 QA, 배포 후 실제 학생·교수자 화면 확인으로 대신한다.
--
-- ▶ 실행 전 확인
--   - 처음에 E1 함수가 있는지, 이 블록이 쓰는 테이블에 외부로 나가는 trigger(HTTP·Webhook·dblink·C 함수)가 없는지 확인하고,
--     하나라도 걸리면 아무것도 쓰지 않고 멈춘다.
--   - 외부 호출 trigger 검사의 한계 (탐지하지 못하는 경우):
--       · 간접 호출: trigger 함수가 부르는 다른 함수 안의 HTTP·dblink 호출은 보지 않는다. (trigger 함수 본문의 글자만 본다)
--       · 동적 SQL: execute 문자열을 조합해 만드는 호출은 글자 검사로 찾지 못할 수 있다.
--       · trigger가 아닌 경로: 이벤트 trigger, pg_cron 작업, 확장 기능의 hook·감사 로그(pgaudit 등)는 검사하지 않는다.
--     참고로 Database Webhook(pg_net)은 요청을 표에 쌓았다가 커밋 후 보내므로 롤백되면 나가지 않고,
--     Realtime·NOTIFY도 커밋된 변경만 전달한다. 이 프로젝트 마이그레이션의 trigger는 모두 DB 안에서만 동작한다.
--   - 실행하는 몇 초 동안 새 과목 행과 그 과목 잠금 키(advisory lock)만 잡는다. 사용자가 적은 시간에 실행한다.
--   - Supabase SQL Editor가 "쓰기 작업" 확인 창을 띄울 수 있다. 붙여 넣은 내용이 이 파일과 같은지 보고 진행한다.
--   - 실행 후: 결과 첫 줄의 PASS/FAIL 개수를 확인한다. 원하면 …_post.sql [1]로 데이터 지문이 그대로인지 다시 본다.

do $smoke$
declare
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_legacy_id text;
  c public.courses;
  c2 public.courses;
  s1 public.sections;
  s2 public.sections;
  l1 text;
  l2 text;
  l3 text;
  l4 text;
  r record;
  lines text[] := '{}';
  c_expected constant integer := 20;  -- 검사 항목 수 (e2_check 호출 수와 같아야 한다)
  v_pass integer;
  v_fail integer;
  v_abort integer;
  v_null integer;
  v_verdict text;
begin
  v_legacy_id := 'e2smoke-legacy-' || v_tag;
  l1 := 'e2smoke-' || v_tag || '-w1';
  l2 := 'e2smoke-' || v_tag || '-w3';
  l3 := 'e2smoke-' || v_tag || '-w4';
  l4 := 'e2smoke-' || v_tag || '-dup';

  /* ───────── 0) 안전 확인 (쓰기 전) ───────── */

  if to_regprocedure('public.admin_create_course(text,text,text,text,integer)') is null
     or to_regprocedure('public.admin_update_course(text,text,text,text,text,integer,text)') is null then
    raise exception 'E2_SMOKE_ABORT: E1 마이그레이션이 적용되지 않았어요. (admin_create_course / admin_update_course 없음)';
  end if;

  -- 이 블록이 쓰는 테이블에 외부 호출(HTTP·Webhook·dblink) 또는 내용을 확인할 수 없는 trigger가 있으면 멈춘다.
  for r in
    select n.nspname || '.' || cl.relname as tbl, t.tgname, pn.nspname || '.' || p.proname as fn
      from pg_trigger t
      join pg_class cl on cl.oid = t.tgrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace pn on pn.oid = p.pronamespace
     where not t.tgisinternal
       and (n.nspname, cl.relname) in (values
             ('public', 'courses'), ('public', 'sections'), ('public', 'section_instructors'),
             ('public', 'lessons'), ('public', 'lesson_dialogues'), ('public', 'dialogue_roles'), ('public', 'dialogue_lines'))
       and (
         pn.nspname in ('net', 'supabase_functions')
         or (p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
             and p.prolang <> (select oid from pg_language where lanname = 'sql'))
         or pg_get_functiondef(p.oid) ~* '(\mnet\.http_|supabase_functions\.|\mhttp_(get|post|put|patch|delete|request)\M|\mdblink)'
       )
  loop
    raise exception 'E2_SMOKE_ABORT: 외부 호출 가능성이 있는 trigger가 있어 실행하지 않았어요. (% · % · %)', r.tbl, r.tgname, r.fn;
  end loop;

  /* ───────── 임시 도우미 (pg_temp, 블록과 함께 롤백) ───────── */

  -- SQL 한 줄 실행 → 'OK:<첫 칸>' 또는 'ERR:<sqlstate>:<문구>'. 오류가 나면 그 한 줄의 변경만 하위 트랜잭션으로 취소된다.
  create function pg_temp.e2_try(p_sql text)
  returns text
  language plpgsql
  as $f$
  declare
    v_out text;
  begin
    execute p_sql into v_out;
    return 'OK:' || coalesce(v_out, 'null');
  exception when others then
    return 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  $f$;

  -- 결과 한 줄. 결과·기대값이 NULL이면 FAIL (NULL LIKE …는 NULL이라 PASS로 보지 않는다). 줄 자체는 NULL이 되지 않는다.
  create function pg_temp.e2_check(p_label text, p_got text, p_want text)
  returns text
  language sql
  as $f$
    select case when p_got is not null and p_want is not null and p_got like p_want then 'PASS  ' else 'FAIL  ' end
           || coalesce(p_label, '(이름 없음)') || '  [' || coalesce(left(p_got, 140), 'NULL') || ']';
  $f$;

  -- 검사용 학습자료 JSON (관리자 저장 형식)
  create function pg_temp.e2_lesson(p_id text, p_course text, p_week integer, p_status text)
  returns jsonb
  language sql
  as $f$
    select jsonb_build_object(
      'id', p_id, 'courseId', p_course, 'week', p_week, 'title', 'E2 검사 ' || p_week || '주차',
      'direction', 'zh-ko', 'status', p_status,
      'video', jsonb_build_object('youtubeUrl', '', 'youtubeId', '', 'startTime', 0, 'endTime', 10),
      'script', '{}'::jsonb);
  $f$;

  /* ───────── 본 검사 ───────── */
  -- 예상 밖 오류는 ABORT 줄로 남긴다. 이 하위 블록의 변경은 그 자리에서 취소되고, 끝의 raise가 나머지 전부를 취소한다.

  begin
    /* 1) 생성 */
    lines := lines || pg_temp.e2_check('생성: 과목명 빈 값 거부',
      pg_temp.e2_try($q$select (public.admin_create_course('   ')).id$q$), 'ERR:P0001%');
    lines := lines || pg_temp.e2_check('생성: 주차 31 거부',
      pg_temp.e2_try($q$select (public.admin_create_course('E2', '', '', '', 31)).id$q$), 'ERR:P0001%');

    select * into c from public.admin_create_course('  E2 검사 과목 ' || v_tag || '  ', '', '맥락', '', 4);
    lines := lines || pg_temp.e2_check('생성: id 형식·active·주차 4·legacy_code 없음·앞뒤 공백 제거',
      case when c.id ~ '^course-[a-z0-9]{6}$' and c.status = 'active' and c.week_count = 4 and c.legacy_code is null
                and c.title = 'E2 검사 과목 ' || v_tag
           then 'OK' else 'BAD:' || c::text end, 'OK');
    lines := lines || pg_temp.e2_check('생성: 분반·학습자료는 만들지 않음',
      (select 'OK:' || count(*) from public.sections where course_id = c.id)
        || '/' || (select count(*) from public.lessons where course_id = c.id), 'OK:0/0');

    -- 이동 검사용: 두 번째 운영 과목, legacy 과목 (모두 새 행)
    select * into c2 from public.admin_create_course('E2 검사 과목2 ' || v_tag);
    insert into public.courses (id, title, status, week_count) values (v_legacy_id, 'E2 검사 legacy', 'legacy', 15);

    /* 2) 수정 */
    lines := lines || pg_temp.e2_check('수정: legacy 과목 거부(42501)',
      pg_temp.e2_try(format($q$select (public.admin_update_course(%L, p_title => 'x')).id$q$, v_legacy_id)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('수정: 바꿀 칸 없음 거부',
      pg_temp.e2_try(format($q$select (public.admin_update_course(%L)).id$q$, c.id)), 'ERR:P0001%');
    lines := lines || pg_temp.e2_check('수정: status=legacy 거부',
      pg_temp.e2_try(format($q$select (public.admin_update_course(%L, p_status => 'legacy')).id$q$, c.id)), 'ERR:P0001%');
    -- 'course-e2-none': 서버가 만드는 id(course- + 6자, 하이픈 없음)와 겹칠 수 없는 값
    lines := lines || pg_temp.e2_check('수정: 없는 과목 404(P0002)',
      pg_temp.e2_try($q$select (public.admin_update_course('course-e2-none', p_title => 'x')).id$q$), 'ERR:P0002%');
    lines := lines || pg_temp.e2_check('수정: 제목·주차 6',
      pg_temp.e2_try(format($q$select (u.title = 'E2 수정됨' and u.week_count = 6)::text from public.admin_update_course(%L, p_title => ' E2 수정됨 ', p_week_count => 6) u$q$, c.id)),
      'OK:true');

    -- 분반 2개(운영 중일 때, 교수자 배정 없음), 학습자료 2개(1주차 공개, 3주차 준비 중)
    select * into s1 from public.admin_create_section(c.id, null, '{}'::text[], 'e2-smoke');
    select * into s2 from public.admin_create_section(c.id, null, '{}'::text[], 'e2-smoke');
    perform public.admin_save_lesson(pg_temp.e2_lesson(l1, c.id, 1, 'published'), null, 'e2-smoke');
    perform public.admin_save_lesson(pg_temp.e2_lesson(l2, c.id, 3, 'draft'), null, 'e2-smoke');

    lines := lines || pg_temp.e2_check('수정: 주차 2로 축소 거부(23514, 3주차 학습자료 있음)',
      pg_temp.e2_try(format($q$select (public.admin_update_course(%L, p_week_count => 2)).id$q$, c.id)), 'ERR:23514%');
    lines := lines || pg_temp.e2_check('수정: 축소 실패 후 주차 6 유지',
      (select 'OK:' || week_count from public.courses where id = c.id), 'OK:6');

    /* 3) 비활성 */
    lines := lines || pg_temp.e2_check('비활성: inactive로 변경',
      pg_temp.e2_try(format($q$select (public.admin_update_course(%L, p_status => 'inactive')).status$q$, c.id)), 'OK:inactive');
    lines := lines || pg_temp.e2_check('비활성: 새 분반 거부',
      pg_temp.e2_try(format($q$select (public.admin_create_section(%L)).id$q$, c.id)), 'ERR:P0002%');
    lines := lines || pg_temp.e2_check('비활성: 기존 분반 2개 그대로 운영 중',
      (select 'OK:' || count(*) from public.sections where course_id = c.id and status = 'active'), 'OK:2');
    lines := lines || pg_temp.e2_check('비활성: 관리자 새 학습자료 저장',
      pg_temp.e2_try(format($q$select (public.admin_save_lesson(%L::jsonb, null, 'e2-smoke')) ->> 'created'$q$,
        pg_temp.e2_lesson(l3, c.id, 4, 'draft'))), 'OK:true');
    lines := lines || pg_temp.e2_check('비활성: 같은 주차 중복 거부(23505)',
      pg_temp.e2_try(format($q$select (public.admin_save_lesson(%L::jsonb, null, 'e2-smoke')) ->> 'created'$q$,
        pg_temp.e2_lesson(l4, c.id, 1, 'draft'))), 'ERR:23505%');
    lines := lines || pg_temp.e2_check('이동: 비활성 → 운영 과목 허용',
      pg_temp.e2_try(format($q$select (public.admin_save_lesson(%L::jsonb, 1, 'e2-smoke')) ->> 'courseId'$q$,
        pg_temp.e2_lesson(l3, c2.id, 4, 'draft'))), 'OK:' || c2.id);
    lines := lines || pg_temp.e2_check('이동: 비활성 → legacy 거부(42501)',
      pg_temp.e2_try(format($q$select (public.admin_save_lesson(%L::jsonb, 1, 'e2-smoke')) ->> 'courseId'$q$,
        pg_temp.e2_lesson(l1, v_legacy_id, 1, 'published'))), 'ERR:42501%');

    /* 4) 다시 운영 */
    lines := lines || pg_temp.e2_check('복귀: active로 변경',
      pg_temp.e2_try(format($q$select (public.admin_update_course(%L, p_status => 'active')).status$q$, c.id)), 'OK:active');
    lines := lines || pg_temp.e2_check('복귀: 새 분반 다시 가능',
      pg_temp.e2_try(format($q$select ((public.admin_create_section(%L)).course_id = %L)::text$q$, c.id, c.id)), 'OK:true');
  exception when others then
    lines := lines || ('ABORT 예상 밖 오류로 중단 [' || sqlstate || ': ' || left(sqlerrm, 200) || ']');
  end;

  /* ───────── 결과 + 항상 롤백 ───────── */

  -- PASS·FAIL 줄만 검사 결과로 센다. ABORT 줄과 NULL 줄(있어서는 안 됨)은 따로 센다.
  select count(*) filter (where l like 'PASS%'),
         count(*) filter (where l like 'FAIL%'),
         count(*) filter (where l like 'ABORT%'),
         count(*) filter (where l is null)
    into v_pass, v_fail, v_abort, v_null
    from unnest(lines) as l;

  -- 성공: 검사 20개가 모두 실행되어 PASS 20 · FAIL 0, 중단·NULL 없음. 하나라도 다르면 실패다.
  v_verdict := case
    when v_pass = c_expected and v_fail = 0 and v_abort = 0 and v_null = 0 then '성공'
    else format('실패 (PASS %s/%s · FAIL %s · 누락 %s · 중단 %s · NULL %s)',
                v_pass, c_expected, v_fail, greatest(c_expected - v_pass - v_fail, 0), v_abort, v_null)
  end;

  -- 이 raise가 블록 전체(검사 과목·분반·학습자료·임시 함수)를 취소한다. 지우지 말 것.
  raise exception using
    errcode = 'P0001',
    message = format(E'E2 SMOKE 결과: %s — 모든 변경은 롤백됨\n(성공 기준: PASS %s · FAIL 0)\n%s',
                     v_verdict, c_expected, array_to_string(lines, E'\n', 'NULL'));
end;
$smoke$;

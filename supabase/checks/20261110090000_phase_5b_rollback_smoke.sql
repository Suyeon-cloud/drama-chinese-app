-- Phase 5-B: 복습 HTML 출처 연결·중복 방지·재생성 실제 동작 검사 (롤백 전용 스모크)
--
-- ▶ 실행: 5-B 마이그레이션 적용 후, 이 파일 "전체"를 SQL Editor에서 한 번에 실행한다.
--   do 블록 하나뿐이고, 마지막 문장이 항상 오류(raise exception)를 내서 블록 안의 모든 변경이 취소된다.
--   → 첫 줄이 'REVIEW SOURCE SMOKE 결과: 성공'일 때만 성공 (PASS 21 · FAIL 0). 실행 전후 …_phase_5b_pre.sql [1]로 비교한다.
-- ▶ 쓰는 것 (모두 롤백): 검사 과목 2개, 검사 강의(lessons) 2개, 그 과목의 HTML·링크 자료 행. Storage에는 아무것도 쓰지 않는다.
-- ▶ 검사하지 않는 것 → 배포 후 실제 계정으로: 교수자 출처 조회·재생성 권한(can_manage_course), 화면의 중복 안내·재생성 확인 창
-- ▶ 시작할 때 쓰는 테이블의 trigger와 호출 함수 정의에 외부 호출이 있으면 아무것도 쓰지 않고 멈춘다. (동적 SQL·이벤트 trigger는 탐지 못함)

do $smoke$
declare
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_role_before text := current_user;
  v_called constant text[] := array[
    'public.admin_save_week_material_html(text,text,jsonb,text,text)',
    'public._save_week_material_html(text,text,jsonb,text,uuid,text,boolean)',
    'public.list_week_material_sources(text)',
    'public._material_html_ok(text)',
    'public._material_text(jsonb,text,integer,boolean)',
    'public._can_see_all_week_materials(text)',
    'public.can_manage_course(text)',
    'public.lesson_course_lock_key(text)',
    'public.admin_create_course(text,text,text,text,integer)',
    'public._course_text(text,text,integer,boolean)',
    'public.admin_save_week_material(text,text,jsonb,text)',
    'public._save_week_material(text,text,jsonb,uuid,text,boolean)',
    'public._renumber_week_materials(text,integer)',
    'public.set_updated_at()'
  ];
  c public.courses;
  c2 public.courses;
  l1 public.lessons;
  l2 public.lessons;
  h1 public.week_materials;
  h2 public.week_materials;
  r record;
  v_link_id text;
  v_got text;
  lines text[] := '{}';
  c_expected constant integer := 21;
  v_pass integer;
  v_fail integer;
  v_abort integer;
  v_null integer;
  v_verdict text;
begin
  /* ───────── 0) 안전 확인 (쓰기 전) ───────── */

  if exists (select 1 from unnest(v_called) s where to_regprocedure(s) is null)
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'week_materials' and column_name = 'source_kind') then
    raise exception 'REVIEW_SOURCE_SMOKE_ABORT: 5-B 마이그레이션 또는 검사할 함수가 없어요.';
  end if;
  for r in
    select pn.nspname || '.' || p.proname as fn
      from (
        select to_regprocedure(s)::oid as oid from unnest(v_called) s
        union
        select t.tgfoid from pg_trigger t
         where not t.tgisinternal
           and t.tgrelid in ('public.courses'::regclass, 'public.week_materials'::regclass, 'public.lessons'::regclass, 'public.lesson_dialogues'::regclass)
      ) x
      join pg_proc p on p.oid = x.oid
      join pg_namespace pn on pn.oid = p.pronamespace
     where pn.nspname in ('net', 'supabase_functions')
        or (p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
            and p.prolang <> (select oid from pg_language where lanname = 'sql'))
        or pg_get_functiondef(p.oid) ~* '(\mnet\.|supabase_functions\.|\mhttp_(get|post|put|patch|delete|request)\M|\mdblink|\mpg_notify\M|\mnotify\s|\mlo_(import|export|create|unlink)\M|copy\s[\s\S]*\sprogram\M)'
  loop
    raise exception 'REVIEW_SOURCE_SMOKE_ABORT: 외부 영향 가능성이 있는 함수가 있어 실행하지 않았어요. (%)', r.fn;
  end loop;

  /* ───────── 임시 도우미 (pg_temp, 블록과 함께 롤백) ───────── */

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

  -- 역할만 바꿔 실행 (로그인 정보 없음). 전환 실패·current_user·auth.uid() 이상은 'SETUP:', 끝나면 원래 역할로 복원·확인
  create function pg_temp.e2_try_as(p_role text, p_sql text)
  returns text
  language plpgsql
  as $f$
  declare
    v_before text := current_user;
    v_out text;
  begin
    if p_role not in ('anon', 'authenticated') then
      return 'SETUP:허용하지 않는 역할 ' || coalesce(p_role, 'NULL');
    end if;
    begin
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
      perform set_config('request.jwt.claim.role', '', true);
      execute format('set local role %I', p_role);
    exception when others then
      return 'SETUP:역할 전환 실패 ' || sqlstate || ':' || sqlerrm;
    end;
    begin
      if current_user is distinct from p_role then
        v_out := 'SETUP:역할 전환 뒤 current_user=' || current_user;
      elsif auth.uid() is not null then
        v_out := 'SETUP:로그인 정보가 남아 있음';
      end if;
    exception when others then
      v_out := 'SETUP:전환 확인 실패 ' || sqlstate || ':' || sqlerrm;
    end;
    if v_out is null then
      begin
        execute p_sql into v_out;
        v_out := 'OK:' || coalesce(v_out, 'null');
      exception when others then
        v_out := 'ERR:' || sqlstate || ':' || sqlerrm;
      end;
    end if;
    execute format('set local role %I', v_before);
    if current_user is distinct from v_before then
      raise exception '역할 복원 실패 (current_user=%, 기대=%)', current_user, v_before;
    end if;
    return v_out;
  end;
  $f$;

  create function pg_temp.e2_check(p_label text, p_got text, p_want text)
  returns text
  language sql
  as $f$
    select case when p_got is not null and p_want is not null and p_got like p_want then 'PASS  ' else 'FAIL  ' end
           || coalesce(p_label, '(이름 없음)') || '  [' || coalesce(left(p_got, 140), 'NULL') || ']';
  $f$;

  /* ───────── 본 검사 ───────── */

  begin
    select * into c from public.admin_create_course('복습 출처 검사 과목 ' || v_tag, '', '', '', 4);
    select * into c2 from public.admin_create_course('다른 과목 ' || v_tag, '', '', '', 4);
    insert into public.lessons (id, course_id, week, direction, script, updated_at)
      values ('smoke-l1-' || v_tag, c.id, 1, 'zh-ko', '{}'::jsonb, now() - interval '1 hour') returning * into l1;
    insert into public.lessons (id, course_id, week, direction, script, updated_at)
      values ('smoke-l2-' || v_tag, c2.id, 1, 'zh-ko', '{}'::jsonb, now() - interval '1 hour') returning * into l2;

    /* 출처와 함께 등록 */
    select * into h1 from public.admin_save_week_material_html(c.id, null,
      jsonb_build_object('week', 1, 'title', '[복습] 1주차', 'source', jsonb_build_object('kind', 'lesson-review', 'lessonId', l1.id, 'lessonUpdatedAt', l1.updated_at::text)),
      '<h1>복습</h1>', 'e2-smoke');
    lines := lines || pg_temp.e2_check('등록: 출처(lesson-review·강의 id·원본 시각) 기록, 비공개',
      case when h1.source_kind = 'lesson-review' and h1.source_lesson_id = l1.id and h1.source_lesson_updated_at = l1.updated_at
                and h1.status = 'draft' and h1.kind = 'html' then 'OK' else 'BAD:' || left(h1::text, 120) end, 'OK');
    lines := lines || pg_temp.e2_check('등록: 같은 강의로 두 번째 복습 자료 거부(23505)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, jsonb_build_object('week', 2, 'title', 'x', 'source', jsonb_build_object('kind', 'lesson-review', 'lessonId', %L, 'lessonUpdatedAt', %L)), '<p>a</p>')).id$q$,
        c.id, l1.id, l1.updated_at::text)), 'ERR:23505%');
    lines := lines || pg_temp.e2_check('등록: 다른 과목의 강의를 출처로 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, jsonb_build_object('week', 2, 'title', 'x', 'source', jsonb_build_object('kind', 'lesson-review', 'lessonId', %L, 'lessonUpdatedAt', %L)), '<p>a</p>')).id$q$,
        c.id, l2.id, l2.updated_at::text)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 원본 수정 시각이 다르면 거부(40001)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, jsonb_build_object('week', 2, 'title', 'x', 'source', jsonb_build_object('kind', 'lesson-review', 'lessonId', %L, 'lessonUpdatedAt', '2000-01-01T00:00:00Z')), '<p>a</p>')).id$q$,
        c2.id, l2.id)), 'ERR:40001%');
    lines := lines || pg_temp.e2_check('등록: 출처 형식 오류 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":2,"title":"x","source":"lesson"}'::jsonb, '<p>a</p>')).id$q$, c.id)), 'ERR:22023%');

    /* 일반 HTML: 출처 없이 독립 */
    select * into h2 from public.admin_save_week_material_html(c.id, null, '{"week":1,"title":"[복습] 직접 만든 자료"}'::jsonb, '<p>manual</p>', 'e2-smoke');
    lines := lines || pg_temp.e2_check('일반 HTML: 출처 없이 등록 (같은 주차·비슷한 제목이어도 막지 않음)',
      case when h2.source_kind is null and h2.source_lesson_id is null and h2.source_lesson_updated_at is null then 'OK' else 'BAD' end, 'OK');
    lines := lines || pg_temp.e2_check('일반 HTML: 출처 붙이기(재생성) 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, jsonb_build_object('source', jsonb_build_object('lessonUpdatedAt', %L)), '<p>b</p>')).id$q$, h2.id, l1.updated_at::text)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('일반 HTML: 4단계처럼 본문만 수정',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, '{}'::jsonb, '<p>manual v2</p>')).html_body$q$, h2.id)), 'OK:<p>manual v2</p>');

    /* 재생성: 공개 상태·id 유지, 원본 시각 갱신 */
    perform public.admin_save_week_material(null, h1.id, '{"status":"published"}'::jsonb, 'e2-smoke');
    update public.lessons set updated_at = now() where id = l1.id returning * into l1;
    lines := lines || pg_temp.e2_check('재생성: 원본 시각이 옛 값이면 거부(40001)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, jsonb_build_object('source', jsonb_build_object('lessonUpdatedAt', %L)), '<p>v2</p>')).id$q$,
        h1.id, h1.source_lesson_updated_at::text)), 'ERR:40001%');
    lines := lines || pg_temp.e2_check('재생성: 다른 강의로 바꾸기 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, jsonb_build_object('source', jsonb_build_object('lessonId', %L, 'lessonUpdatedAt', %L)), '<p>v2</p>')).id$q$,
        h1.id, l2.id, l1.updated_at::text)), 'ERR:22023%');
    v_got := pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, jsonb_build_object('source', jsonb_build_object('lessonUpdatedAt', %L)), '<p>v2</p>', 'e2-smoke')).id$q$,
      h1.id, l1.updated_at::text));
    lines := lines || pg_temp.e2_check('재생성: 같은 id·공개 유지·본문 교체·원본 시각 갱신',
      v_got || '/' || coalesce((select status || ':' || html_body || ':' || (source_lesson_updated_at = l1.updated_at)::text from public.week_materials where id = h1.id), 'NULL'),
      'OK:' || h1.id || '/published:<p>v2</p>:true');

    /* 제약·고유 인덱스 (RPC를 거치지 않은 쓰기도 막힌다) */
    select (public.admin_save_week_material(c.id, null, '{"week":3,"title":"링크","url":"https://example.com"}'::jsonb, 'e2-smoke')).id into v_link_id;
    lines := lines || pg_temp.e2_check('제약: 링크 자료에 출처 거부(23514)',
      pg_temp.e2_try(format($q$update public.week_materials set source_kind = 'lesson-review', source_lesson_updated_at = now() where id = %L returning id$q$, v_link_id)), 'ERR:23514%');
    lines := lines || pg_temp.e2_check('제약: 출처 종류만 있고 원본 시각 없음 거부(23514)',
      pg_temp.e2_try(format($q$update public.week_materials set source_kind = 'lesson-review' where id = %L returning id$q$, h2.id)), 'ERR:23514%');
    lines := lines || pg_temp.e2_check('고유 인덱스: 같은 강의 출처를 직접 써도 거부(23505)',
      pg_temp.e2_try(format($q$update public.week_materials set source_kind = 'lesson-review', source_lesson_id = %L, source_lesson_updated_at = now() where id = %L returning id$q$, l1.id, h2.id)), 'ERR:23505%');

    /* 원본 강의 삭제: 자료는 보존, 연결만 끊김, 재생성은 안내와 함께 거부 */
    delete from public.lessons where id = l1.id;
    lines := lines || pg_temp.e2_check('강의 삭제: 복습 자료 보존·공개 유지·강의 id만 NULL',
      coalesce((select status || ':' || source_kind || ':' || coalesce(source_lesson_id, 'NULL') from public.week_materials where id = h1.id), 'GONE'),
      'published:lesson-review:NULL');
    lines := lines || pg_temp.e2_check('강의 삭제 뒤 재생성 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, jsonb_build_object('source', jsonb_build_object('lessonUpdatedAt', %L)), '<p>v3</p>')).id$q$, h1.id, now()::text)), 'ERR:22023%');

    /* 역할 권한 */
    lines := lines || pg_temp.e2_check('authenticated 전환: current_user = authenticated, auth.uid() NULL',
      pg_temp.e2_try_as('authenticated', $q$select current_user::text || '/' || coalesce(auth.uid()::text, 'null')$q$), 'OK:authenticated/null');
    lines := lines || pg_temp.e2_check('authenticated(로그인 정보 없음): 출처 조회 RPC 28000',
      pg_temp.e2_try_as('authenticated', format($q$select count(*)::text from public.list_week_material_sources(%L)$q$, c.id)), 'ERR:28000%');
    lines := lines || pg_temp.e2_check('anon: 출처 조회 RPC 실행 거부(42501)',
      pg_temp.e2_try_as('anon', format($q$select count(*)::text from public.list_week_material_sources(%L)$q$, c.id)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: 출처 칸 직접 조회 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select source_lesson_id from public.week_materials where id = %L$q$, h1.id)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('역할 복원: 역할 검사 뒤 current_user가 실행 시작 때 역할',
      current_user::text, v_role_before);
  exception when others then
    lines := lines || ('ABORT 예상 밖 오류로 중단 [' || sqlstate || ': ' || left(sqlerrm, 200) || ']');
  end;

  /* ───────── 결과 + 항상 롤백 ───────── */

  select count(*) filter (where l like 'PASS%'),
         count(*) filter (where l like 'FAIL%'),
         count(*) filter (where l like 'ABORT%'),
         count(*) filter (where l is null)
    into v_pass, v_fail, v_abort, v_null
    from unnest(lines) as l;

  v_verdict := case
    when v_pass = c_expected and v_fail = 0 and v_abort = 0 and v_null = 0 then '성공'
    else format('실패 (PASS %s/%s · FAIL %s · 누락 %s · 중단 %s · NULL %s)',
                v_pass, c_expected, v_fail, greatest(c_expected - v_pass - v_fail, 0), v_abort, v_null)
  end;

  -- 이 raise가 블록 전체(검사 과목·자료·임시 함수·역할 설정)를 취소한다. 지우지 말 것.
  raise exception using
    errcode = 'P0001',
    message = format(E'REVIEW SOURCE SMOKE 결과: %s — 모든 변경은 롤백됨\n(성공 기준: PASS %s · FAIL 0)\n%s',
                     v_verdict, c_expected, array_to_string(lines, E'\n', 'NULL'));
end;
$smoke$;

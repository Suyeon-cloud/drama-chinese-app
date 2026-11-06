-- Phase 3-B: 보충 자료 관리자 RPC·역할 권한 실제 동작 검사 (롤백 전용 스모크)
--
-- ▶ 실행 방법: 3-B 마이그레이션 적용 후, 이 파일 "전체"를 SQL Editor에 붙여 넣고 한 번에 실행한다.
--   do 블록 하나뿐이고, 마지막 문장이 항상 오류(raise exception)를 내서 블록 안의 모든 변경이 취소된다.
--   → 첫 줄이 'MATERIALS SMOKE 결과: 성공'일 때만 검증 성공이다. (PASS 26 · FAIL 0, 누락·중단 없음)
--   → 실행 전후 비교: …_phase_3b_smoke_compare.sql을 스모크 직전·직후에 한 번씩 실행해 두 결과가 같은지 본다.
--
-- ▶ 쓰는 것 (모두 롤백): 검사 과목 1개(admin_create_course), legacy 검사 과목 1개(직접 insert),
--   그 두 과목의 보충 자료(admin_save/delete/reorder_week_material(s)), pg_temp 임시 함수 3개.
--   사용자(auth.users·profiles)는 만들지 않는다. 기존 행은 읽기만 한다.
--
-- ▶ 검사 범위 (26개)
--   관리자 RPC 16개: 등록·입력 검사·순서·수정·이동·주차 수 축소 거부·삭제·legacy·주차당 20개
--   역할 권한 10개: 역할만 anon·authenticated로 바꾸고(로그인 정보 없음) 실제 DB 권한을 본다.
--     - 전환 확인: current_user가 그 역할이고 auth.uid()가 NULL인지 (2개)
--     - 거부 확인: 테이블 직접 조회(anon·authenticated), 관리자 RPC, 내부 함수, anon의 목록 RPC → 42501 (5개)
--     - 로그인 정보 없음: authenticated의 목록 RPC·교수자 저장 RPC → 28000 (2개)
--     - 복원 확인: 역할 검사 뒤 current_user가 실행 시작 때 역할로 돌아왔는지 (1개)
--   역할 전환 자체가 실패하거나 current_user·auth.uid()가 예상과 다르면 'SETUP:'으로 시작하는 결과가 되어 FAIL이 된다.
--   (전환 실패의 권한 오류를 '거부 확인'의 42501로 오인하지 않는다)
--
-- ▶ 이 파일이 검사하지 않는 것 → 배포 후 실제 계정으로 확인
--   교수자: 담당 과목 자료 등록·수정·삭제·정렬 성공, 다른 과목 자료 수정·삭제·정렬 거부(can_manage_course), 비활성 과목 편집 유지
--   학생: 수강 과목의 published 자료만 보이고 비공개 자료·수정자 표시가 안 보임, 수강하지 않은 과목은 빈 목록
--
-- ▶ 운영 환경 부작용
--   - 시작할 때 다음을 확인하고, 하나라도 걸리면 아무것도 쓰지 않고 MATERIALS_SMOKE_ABORT로 멈춘다.
--       · courses·week_materials의 trigger와, 이 블록이 호출하는 배포된 함수(간접 호출 함수 포함, v_called 목록)의 정의에
--         외부 호출(HTTP·Webhook·dblink)·NOTIFY·large object·COPY PROGRAM이 있는지
--   - 시퀀스(정보만, 검사 수에 들어가지 않음): INFO 줄 두 개로 알려 준다. (롤백돼도 번호는 되돌아가지 않으므로)
--       · 'INFO  시퀀스 사용 열': courses·week_materials 열 기본값의 nextval, identity 열
--       · 'INFO  시퀀스 사용 함수': 위 외부 호출 검사와 같은 함수·trigger 목록 중 정의에 nextval이 있는 것
--     둘 다 '없음'이 예상 값이다. (함수 안의 동적 SQL로 만든 nextval은 글자 검사로 찾지 못할 수 있다)
--   - 잠금: courses·week_materials에 테이블 수준 ROW EXCLUSIVE(일반 insert/update/delete와 같은 수준) 잠금이 실행 동안 잡힌다.
--     일반 조회·수정은 막지 않지만, 그 사이 같은 테이블의 DDL·LOCK TABLE·인덱스 생성은 끝날 때까지 기다린다.
--     행 잠금·advisory 잠금은 새로 만든 검사 과목과 그 자료에만 걸린다. 사용자가 적은 시간에 실행한다.
--   - 검사 trigger 범위 밖(간접 호출의 동적 SQL, 이벤트 trigger, pg_cron, 확장 hook)은 탐지하지 못한다.

do $smoke$
declare
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_legacy_id text;
  v_role_before text := current_user;
  -- 이 블록이 부르는 배포된 함수와 그 함수들이 부르는 함수 (외부 호출·시퀀스 검사 대상)
  v_called constant text[] := array[
    'public.admin_create_course(text,text,text,text,integer)',
    'public.admin_update_course(text,text,text,text,text,integer,text)',
    'public._course_text(text,text,integer,boolean)',
    'public.admin_save_week_material(text,text,jsonb,text)',
    'public.admin_delete_week_material(text)',
    'public.admin_reorder_week_materials(text,integer,text[])',
    'public._save_week_material(text,text,jsonb,uuid,text,boolean)',
    'public._delete_week_material(text,boolean)',
    'public._reorder_week_materials(text,integer,text[],boolean)',
    'public._renumber_week_materials(text,integer)',
    'public._material_text(jsonb,text,integer,boolean)',
    'public._material_url(jsonb)',
    'public.list_week_materials(text)',
    'public._can_see_all_week_materials(text)',
    'public._is_week_material_learner(text)',
    'public.save_week_material(text,text,jsonb)',
    'public._material_actor_label()',
    'public.can_manage_course(text)',
    'public.my_instructor_section_ids(boolean)',
    'public.my_enrolled_section_ids()',
    'public.is_approved_student()',
    'public.lesson_course_lock_key(text)',
    'public.set_updated_at()'
  ];
  c public.courses;
  -- week_materials가 없을 때도 안전 확인까지 도달하도록 행 타입 대신 record로 둔다
  m1 record;
  m2 record;
  r record;
  i integer;
  v_got text;
  v_seq text;
  v_seq_fn text;
  lines text[] := '{}';
  c_expected constant integer := 26;
  v_pass integer;
  v_fail integer;
  v_abort integer;
  v_null integer;
  v_verdict text;
begin
  v_legacy_id := 'e2smoke-legacy-' || v_tag;

  /* ───────── 0) 안전 확인 (쓰기 전) ───────── */

  if to_regclass('public.week_materials') is null or to_regprocedure('public.admin_save_week_material(text,text,jsonb,text)') is null then
    raise exception 'MATERIALS_SMOKE_ABORT: 3-B 마이그레이션이 적용되지 않았어요.';
  end if;

  -- (a) 쓰는 테이블의 trigger + (b) 이 블록이 부르는 배포된 함수와 그 함수들이 부르는 함수
  for r in
    with called(sig) as (
      select unnest(v_called)
    ),
    fns as (
      select 'function' as src, p.oid
        from called k join pg_proc p on p.oid = to_regprocedure(k.sig)
      union
      select 'trigger', t.tgfoid
        from pg_trigger t
        join pg_class cl on cl.oid = t.tgrelid
        join pg_namespace n on n.oid = cl.relnamespace
       where not t.tgisinternal
         and (n.nspname, cl.relname) in (values ('public', 'courses'), ('public', 'week_materials'))
    )
    select f.src, pn.nspname || '.' || p.proname as fn
      from fns f
      join pg_proc p on p.oid = f.oid
      join pg_namespace pn on pn.oid = p.pronamespace
     where pn.nspname in ('net', 'supabase_functions')
        or (p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
            and p.prolang <> (select oid from pg_language where lanname = 'sql'))
        or pg_get_functiondef(p.oid) ~* '(\mnet\.|supabase_functions\.|\mhttp_(get|post|put|patch|delete|request)\M|\mdblink|\mpg_notify\M|\mnotify\s|\mlo_(import|export|create|unlink)\M|copy\s[\s\S]*\sprogram\M)'
  loop
    raise exception 'MATERIALS_SMOKE_ABORT: 외부 영향 가능성이 있는 % 함수가 있어 실행하지 않았어요. (%)', r.src, r.fn;
  end loop;
  -- 호출 목록의 함수가 하나라도 없으면 멈춘다 (배포된 정의를 검사하지 못하므로)
  if exists (select 1 from unnest(v_called) s where to_regprocedure(s) is null) then
    raise exception 'MATERIALS_SMOKE_ABORT: 검사할 함수가 없어요. (3-B·E1 적용 상태를 확인하세요: %)',
      (select string_agg(s, ', ') from unnest(v_called) s where to_regprocedure(s) is null);
  end if;

  -- 시퀀스 사용 여부 (정보만): courses·week_materials 열 기본값의 nextval, identity 열
  select string_agg(format('%s.%s', cl.relname, a.attname), ', ') into v_seq
    from pg_attribute a
    join pg_class cl on cl.oid = a.attrelid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where cl.oid in ('public.courses'::regclass, 'public.week_materials'::regclass)
     and a.attnum > 0 and not a.attisdropped
     and (a.attidentity <> '' or pg_get_expr(d.adbin, d.adrelid) ~* 'nextval');
  lines := lines || ('INFO  시퀀스 사용 열: ' || coalesce(v_seq, '없음'));
  -- 시퀀스 사용 여부 (정보만): 위와 같은 함수·trigger 목록 중 정의에 nextval이 있는 것
  select string_agg(distinct pn.nspname || '.' || p.proname, ', ') into v_seq_fn
    from (
      select to_regprocedure(k)::oid as oid from unnest(v_called) k
      union
      select t.tgfoid
        from pg_trigger t
       where not t.tgisinternal and t.tgrelid in ('public.courses'::regclass, 'public.week_materials'::regclass)
    ) f
    join pg_proc p on p.oid = f.oid
    join pg_namespace pn on pn.oid = p.pronamespace
   where pg_get_functiondef(p.oid) ~* '\mnextval\s*\(';
  lines := lines || ('INFO  시퀀스 사용 함수: ' || coalesce(v_seq_fn, '없음'));

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

  /*
   * 역할만 바꿔 한 문장을 실행한다 (로그인 정보 없음).
   * 1) 로그인 정보 설정을 비우고 역할 전환 — 실패하면 'SETUP:…' (검사 문장의 오류로 섞지 않는다)
   * 2) current_user = 그 역할, auth.uid() IS NULL 확인 — 아니면 'SETUP:…'
   * 3) 검사 문장 실행 → 'OK:…' 또는 'ERR:코드:…'
   * 4) 원래 역할로 명시적으로 되돌리고 확인 — 실패하면 오류를 던져 ABORT가 되게 한다
   */
  create function pg_temp.e2_try_as(p_role text, p_sql text)
  returns text
  language plpgsql
  as $f$
  declare
    v_before text := current_user;
    v_out text;
    v_uid uuid;
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
      else
        v_uid := auth.uid();
        if v_uid is not null then
          v_out := 'SETUP:로그인 정보가 남아 있음 (auth.uid() 값 있음)';
        end if;
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
    select * into c from public.admin_create_course('자료 검사 과목 ' || v_tag, '', '', '', 4);
    insert into public.courses (id, title, status, week_count) values (v_legacy_id, '자료 검사 legacy', 'legacy', 15);

    /* 등록 */
    select * into m1 from public.admin_save_week_material(c.id, null,
      jsonb_build_object('week', 2, 'title', '  자료 A  ', 'url', 'https://example.com/a'), 'e2-smoke');
    lines := lines || pg_temp.e2_check('등록: id 형식·link·비공개·순서 0·제목 공백 제거',
      case when m1.id ~ '^material-[a-z0-9]{12}$' and m1.kind = 'link' and m1.status = 'draft' and m1.position = 0
                and m1.title = '자료 A' and m1.version = 1 and m1.updated_by_label = 'e2-smoke'
           then 'OK' else 'BAD:' || m1::text end, 'OK');
    lines := lines || pg_temp.e2_check('등록: http 주소 거부',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material(%L, null, '{"week":2,"title":"x","url":"http://example.com"}'::jsonb)).id$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: javascript: 거부',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material(%L, null, '{"week":2,"title":"x","url":"javascript:alert(1)"}'::jsonb)).id$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 과목 주차(4) 밖 거부',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material(%L, null, '{"week":5,"title":"x","url":"https://example.com"}'::jsonb)).id$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: file 종류 거부(3-C 전)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material(%L, null, '{"week":2,"title":"x","url":"https://example.com","kind":"file"}'::jsonb)).id$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 없는 과목 P0002',
      pg_temp.e2_try($q$select (public.admin_save_week_material('course-e2-none', null, '{"week":1,"title":"x","url":"https://example.com"}'::jsonb)).id$q$), 'ERR:P0002%');

    select * into m2 from public.admin_save_week_material(c.id, null,
      jsonb_build_object('week', 2, 'title', '자료 B', 'url', 'https://example.org/b', 'status', 'published'), 'e2-smoke');
    lines := lines || pg_temp.e2_check('등록: 같은 주차 두 번째는 순서 1·공개',
      case when m2.position = 1 and m2.status = 'published' then 'OK' else 'BAD:' || m2::text end, 'OK');

    /* 순서 */
    lines := lines || pg_temp.e2_check('순서: B, A로 바꾸기',
      pg_temp.e2_try(format($q$select string_agg(x.title || '@' || x.position, ',' order by x.position) from public.admin_reorder_week_materials(%L, 2, array[%L, %L]) x$q$, c.id, m2.id, m1.id)),
      'OK:자료 B@0,자료 A@1');
    lines := lines || pg_temp.e2_check('순서: 목록이 다르면 거부(23505)',
      pg_temp.e2_try(format($q$select count(*)::text from public.admin_reorder_week_materials(%L, 2, array[%L])$q$, c.id, m1.id)), 'ERR:23505%');

    /* 수정·이동 */
    lines := lines || pg_temp.e2_check('수정: 제목·공개 → 버전 2',
      pg_temp.e2_try(format($q$select (x.title = '자료 A2' and x.status = 'published' and x.version = 2)::text from public.admin_save_week_material(null, %L, '{"title":" 자료 A2 ","status":"published"}'::jsonb) x$q$, m1.id)),
      'OK:true');
    -- 이동 RPC와 이동 뒤 테이블 상태는 다른 문장으로 본다. (같은 문장의 하위 조회는 문장 시작 시점을 보므로)
    v_got := pg_temp.e2_try(format($q$select (x.week = 4 and x.position = 0)::text from public.admin_save_week_material(null, %L, '{"week":4}'::jsonb) x$q$, m1.id));
    lines := lines || pg_temp.e2_check('이동: 4주차로 옮기면 그 주차 맨 뒤, 2주차 순서 다시 매김',
      v_got
        || '/' || coalesce((select week || ':' || position from public.week_materials where id = m1.id), 'NULL')
        || '/' || coalesce((select position::text from public.week_materials where id = m2.id), 'NULL'),
      'OK:true/4:0/0');
    lines := lines || pg_temp.e2_check('수정: 바꿀 칸 없음 거부',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material(null, %L, '{}'::jsonb)).id$q$, m1.id)), 'ERR:22023%');

    /* 주차 수 축소: 학습자료는 없고 4주차 보충 자료만 있다 */
    lines := lines || pg_temp.e2_check('과목 주차 축소: 보충 자료 4주차 → 3주로 줄이기 거부(23514)',
      pg_temp.e2_try(format($q$select (public.admin_update_course(%L, p_week_count => 3)).id$q$, c.id)), 'ERR:23514%');

    /* 삭제 — 삭제 결과와 남은 행은 따로 본다 */
    v_got := pg_temp.e2_try(format($q$select (public.admin_delete_week_material(%L)).id$q$, m1.id));
    lines := lines || pg_temp.e2_check('삭제: 지운 행 반환 후 목록에서 사라짐',
      v_got || case when exists (select 1 from public.week_materials where id = m1.id) then '/남아 있음' else '/없음' end,
      'OK:' || m1.id || '/없음');

    /* legacy: 관리자는 가능 */
    lines := lines || pg_temp.e2_check('legacy 과목: 관리자 등록 가능',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material(%L, null, '{"week":1,"title":"L","url":"https://example.com/l"}'::jsonb)).course_id$q$, v_legacy_id)),
      'OK:' || v_legacy_id);

    /* 역할 권한: 전환 확인 → 거부 확인 → 로그인 정보 없음 → 복원 확인 */
    lines := lines || pg_temp.e2_check('anon 전환: current_user = anon, auth.uid() NULL',
      pg_temp.e2_try_as('anon', $q$select current_user::text || '/' || coalesce(auth.uid()::text, 'null')$q$), 'OK:anon/null');
    lines := lines || pg_temp.e2_check('authenticated 전환: current_user = authenticated, auth.uid() NULL',
      pg_temp.e2_try_as('authenticated', $q$select current_user::text || '/' || coalesce(auth.uid()::text, 'null')$q$), 'OK:authenticated/null');
    lines := lines || pg_temp.e2_check('anon: week_materials 직접 조회 거부(42501)',
      pg_temp.e2_try_as('anon', $q$select count(*)::text from public.week_materials$q$), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: week_materials 직접 조회 거부(42501)',
      pg_temp.e2_try_as('authenticated', $q$select count(*)::text from public.week_materials$q$), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: 관리자 RPC 실행 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select (public.admin_save_week_material(%L, null, '{"week":1,"title":"x","url":"https://example.com"}'::jsonb)).id$q$, c.id)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: 내부 함수 실행 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select (public._save_week_material(%L, null, '{}'::jsonb, null, 'x', true)).id$q$, c.id)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('anon: 목록 RPC 실행 거부(42501)',
      pg_temp.e2_try_as('anon', format($q$select count(*)::text from public.list_week_materials(%L)$q$, c.id)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated(로그인 정보 없음): 목록 RPC 28000',
      pg_temp.e2_try_as('authenticated', format($q$select count(*)::text from public.list_week_materials(%L)$q$, c.id)), 'ERR:28000%');
    lines := lines || pg_temp.e2_check('authenticated(로그인 정보 없음): 교수자 저장 RPC 28000',
      pg_temp.e2_try_as('authenticated', format($q$select (public.save_week_material(%L, null, '{"week":1,"title":"x","url":"https://example.com"}'::jsonb)).id$q$, c.id)), 'ERR:28000%');
    lines := lines || pg_temp.e2_check('역할 복원: 역할 검사 뒤 current_user가 실행 시작 때 역할',
      current_user::text, v_role_before);

    /* 주차당 20개 */
    for i in 1..19 loop
      perform public.admin_save_week_material(c.id, null, jsonb_build_object('week', 3, 'title', 'n' || i, 'url', 'https://example.com/n'), 'e2-smoke');
    end loop;
    perform public.admin_save_week_material(c.id, null, jsonb_build_object('week', 3, 'title', 'n20', 'url', 'https://example.com/n'), 'e2-smoke');
    lines := lines || pg_temp.e2_check('한 주차 21번째 거부(23505)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material(%L, null, '{"week":3,"title":"n21","url":"https://example.com/n"}'::jsonb)).id$q$, c.id)), 'ERR:23505%');
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
    message = format(E'MATERIALS SMOKE 결과: %s — 모든 변경은 롤백됨\n(성공 기준: PASS %s · FAIL 0)\n%s',
                     v_verdict, c_expected, array_to_string(lines, E'\n', 'NULL'));
end;
$smoke$;

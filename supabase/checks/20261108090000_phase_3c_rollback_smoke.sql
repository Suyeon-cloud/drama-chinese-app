-- Phase 3-C: 파일 자료 RPC·권한 실제 동작 검사 (롤백 전용 스모크)
--
-- ▶ 실행: 3-C 마이그레이션 적용 후, 이 파일 "전체"를 SQL Editor에서 한 번에 실행한다.
--   do 블록 하나뿐이고, 마지막 문장이 항상 오류(raise exception)를 내서 블록 안의 모든 변경이 취소된다.
--   → 첫 줄이 'FILES SMOKE 결과: 성공'일 때만 성공 (PASS 16 · FAIL 0). 실행 전후 …_phase_3c_pre.sql [1]로 비교한다.
-- ▶ 쓰는 것 (모두 롤백): 검사 과목 1개, 그 과목의 파일·링크 자료 행. 업로드 기록은 제약 위반으로 거부되는 시도만 한다.
--   Storage에는 아무것도 쓰지 않는다. (파일 행의 저장 경로는 가짜 경로 — SQL에서는 Storage API를 부를 수 없다)
-- ▶ 검사하지 않는 것 → 배포 후 실제 계정으로: 실제 업로드·내려받기, 교수자 업로드 권한, 학생의 비공개·다른 과목 파일 차단
-- ▶ 시작할 때 쓰는 테이블의 trigger와 호출 함수 정의에 외부 호출이 있으면 아무것도 쓰지 않고 멈춘다. (동적 SQL·이벤트 trigger는 탐지 못함)

do $smoke$
declare
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_role_before text := current_user;
  v_called constant text[] := array[
    'public.admin_insert_week_material_file(text,jsonb,text,text,text,bigint,uuid,text)',
    'public.admin_replace_week_material_file(text,text,text,text,bigint,uuid,text)',
    'public.week_material_download(text)',
    'public._material_file_path_ok(text,text)',
    'public._material_text(jsonb,text,integer,boolean)',
    'public._can_see_all_week_materials(text)',
    'public._is_week_material_learner(text)',
    'public.can_manage_course(text)',
    'public.my_instructor_section_ids(boolean)',
    'public.my_enrolled_section_ids()',
    'public.is_approved_student()',
    'public.lesson_course_lock_key(text)',
    'public.admin_create_course(text,text,text,text,integer)',
    'public._course_text(text,text,integer,boolean)',
    'public.admin_save_week_material(text,text,jsonb,text)',
    'public._save_week_material(text,text,jsonb,uuid,text,boolean)',
    'public.set_updated_at()'
  ];
  c public.courses;
  f1 record;
  r record;
  v_path1 text;
  v_path2 text;
  v_link_id text;
  v_got text;
  lines text[] := '{}';
  c_expected constant integer := 16;
  v_pass integer;
  v_fail integer;
  v_abort integer;
  v_null integer;
  v_verdict text;
begin
  /* ───────── 0) 안전 확인 (쓰기 전) ───────── */

  if to_regclass('public.week_material_uploads') is null or exists (select 1 from unnest(v_called) s where to_regprocedure(s) is null) then
    raise exception 'FILES_SMOKE_ABORT: 3-C 마이그레이션 또는 검사할 함수가 없어요.';
  end if;
  for r in
    select pn.nspname || '.' || p.proname as fn
      from (
        select to_regprocedure(s)::oid as oid from unnest(v_called) s
        union
        select t.tgfoid from pg_trigger t
         where not t.tgisinternal
           and t.tgrelid in ('public.courses'::regclass, 'public.week_materials'::regclass, 'public.week_material_uploads'::regclass)
      ) x
      join pg_proc p on p.oid = x.oid
      join pg_namespace pn on pn.oid = p.pronamespace
     where pn.nspname in ('net', 'supabase_functions')
        or (p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
            and p.prolang <> (select oid from pg_language where lanname = 'sql'))
        or pg_get_functiondef(p.oid) ~* '(\mnet\.|supabase_functions\.|\mhttp_(get|post|put|patch|delete|request)\M|\mdblink|\mpg_notify\M|\mnotify\s|\mlo_(import|export|create|unlink)\M|copy\s[\s\S]*\sprogram\M)'
  loop
    raise exception 'FILES_SMOKE_ABORT: 외부 영향 가능성이 있는 함수가 있어 실행하지 않았어요. (%)', r.fn;
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
    select * into c from public.admin_create_course('파일 검사 과목 ' || v_tag, '', '', '', 4);
    v_path1 := c.id || '/' || gen_random_uuid()::text || '.pdf';
    v_path2 := c.id || '/' || gen_random_uuid()::text || '.pdf';

    /* 파일 행 등록 (service_role RPC — 서버가 파일 검사 뒤 부르는 경로) */
    select * into f1 from public.admin_insert_week_material_file(c.id, '{"week":2,"title":"  파일 A  "}'::jsonb, v_path1, '자료.pdf', 'application/pdf', 1234, null, 'e2-smoke');
    lines := lines || pg_temp.e2_check('등록: file·비공개·순서 0·경로·크기·제목 공백 제거',
      case when f1.kind = 'file' and f1.status = 'draft' and f1.position = 0 and f1.storage_path = v_path1 and f1.url is null
                and f1.size_bytes = 1234 and f1.mime_type = 'application/pdf' and f1.title = '파일 A' and f1.updated_by_label = 'e2-smoke'
           then 'OK' else 'BAD:' || f1::text end, 'OK');
    lines := lines || pg_temp.e2_check('등록: 다른 과목 폴더 경로 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_insert_week_material_file(%L, '{"week":1,"title":"x"}'::jsonb, %L, 'a.pdf', 'application/pdf', 10)).id$q$,
        c.id, 'course-other/' || gen_random_uuid()::text || '.pdf')), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 서버 형식이 아닌 경로 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_insert_week_material_file(%L, '{"week":1,"title":"x"}'::jsonb, %L, 'a.pdf', 'application/pdf', 10)).id$q$,
        c.id, c.id || '/../secret.pdf')), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 파일 이름과 경로의 확장자가 다르면 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_insert_week_material_file(%L, '{"week":1,"title":"x"}'::jsonb, %L, 'a.png', 'image/png', 10)).id$q$,
        c.id, c.id || '/' || gen_random_uuid()::text || '.pdf')), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 같은 경로를 쓰는 자료가 있으면 거부(23505)',
      pg_temp.e2_try(format($q$select (public.admin_insert_week_material_file(%L, '{"week":1,"title":"x"}'::jsonb, %L, 'b.pdf', 'application/pdf', 10)).id$q$,
        c.id, v_path1)), 'ERR:23505%');
    lines := lines || pg_temp.e2_check('등록: 과목 주차(4) 밖 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_insert_week_material_file(%L, '{"week":5,"title":"x"}'::jsonb, %L, 'b.pdf', 'application/pdf', 10)).id$q$,
        c.id, c.id || '/' || gen_random_uuid()::text || '.pdf')), 'ERR:22023%');

    /* 파일 교체: RPC 결과와 테이블 상태는 다른 문장으로 본다 */
    v_got := pg_temp.e2_try(format($q$select public.admin_replace_week_material_file(%L, %L, '새 자료.pdf', 'application/pdf', 4321, null, 'e2-smoke')$q$, f1.id, v_path2));
    lines := lines || pg_temp.e2_check('교체: 옛 경로 반환, 새 경로·이름·크기·버전 2',
      v_got || '/' || coalesce((select storage_path || ':' || file_name || ':' || size_bytes || ':' || version from public.week_materials where id = f1.id), 'NULL'),
      'OK:' || v_path1 || '/' || v_path2 || ':새 자료.pdf:4321:2');
    select (public.admin_save_week_material(c.id, null, '{"week":1,"title":"링크","url":"https://example.com"}'::jsonb, 'e2-smoke')).id into v_link_id;
    lines := lines || pg_temp.e2_check('교체: 링크 자료는 거부(22023)',
      pg_temp.e2_try(format($q$select public.admin_replace_week_material_file(%L, %L, 'c.pdf', 'application/pdf', 10)$q$, v_link_id, c.id || '/' || gen_random_uuid()::text || '.pdf')),
      'ERR:22023%');

    /* 업로드 기록 테이블 제약: 그 과목 폴더가 아닌 경로는 거부 */
    lines := lines || pg_temp.e2_check('업로드 기록: 다른 과목 폴더 경로 거부(23514)',
      pg_temp.e2_try(format($q$insert into public.week_material_uploads (token, course_id, storage_path, file_name, mime_type, size_bytes, input, actor_key, expires_at)
                               values (gen_random_uuid(), %L, %L, 'a.pdf', 'application/pdf', 10, '{}'::jsonb, 'admin', now() + interval '1 hour') returning token::text$q$,
        c.id, 'course-other/' || gen_random_uuid()::text || '.pdf')), 'ERR:23514%');

    /* 역할 권한 */
    lines := lines || pg_temp.e2_check('authenticated 전환: current_user = authenticated, auth.uid() NULL',
      pg_temp.e2_try_as('authenticated', $q$select current_user::text || '/' || coalesce(auth.uid()::text, 'null')$q$), 'OK:authenticated/null');
    lines := lines || pg_temp.e2_check('authenticated: 파일 등록 RPC 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select (public.admin_insert_week_material_file(%L, '{"week":1,"title":"x"}'::jsonb, %L, 'a.pdf', 'application/pdf', 10)).id$q$,
        c.id, c.id || '/' || gen_random_uuid()::text || '.pdf')), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: 파일 교체 RPC 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select public.admin_replace_week_material_file(%L, %L, 'a.pdf', 'application/pdf', 10)$q$,
        f1.id, c.id || '/' || gen_random_uuid()::text || '.pdf')), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: 업로드 기록 직접 조회 거부(42501)',
      pg_temp.e2_try_as('authenticated', $q$select count(*)::text from public.week_material_uploads$q$), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated(로그인 정보 없음): 파일 열기 RPC 28000',
      pg_temp.e2_try_as('authenticated', format($q$select count(*)::text from public.week_material_download(%L)$q$, f1.id)), 'ERR:28000%');
    lines := lines || pg_temp.e2_check('anon: 파일 열기 RPC 실행 거부(42501)',
      pg_temp.e2_try_as('anon', format($q$select count(*)::text from public.week_material_download(%L)$q$, f1.id)), 'ERR:42501%');
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
    message = format(E'FILES SMOKE 결과: %s — 모든 변경은 롤백됨\n(성공 기준: PASS %s · FAIL 0)\n%s',
                     v_verdict, c_expected, array_to_string(lines, E'\n', 'NULL'));
end;
$smoke$;

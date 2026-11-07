-- Phase 4: HTML 학습자료 RPC·제약·권한 실제 동작 검사 (롤백 전용 스모크)
--
-- ▶ 실행: 4단계 마이그레이션 적용 후, 이 파일 "전체"를 SQL Editor에서 한 번에 실행한다.
--   do 블록 하나뿐이고, 마지막 문장이 항상 오류(raise exception)를 내서 블록 안의 모든 변경이 취소된다.
--   → 첫 줄이 'HTML SMOKE 결과: 성공'일 때만 성공 (PASS 24 · FAIL 0). 실행 전후 …_phase_4_pre.sql [1]로 비교한다.
-- ▶ 쓰는 것 (모두 롤백): 검사 과목 1개, 그 과목의 HTML·링크 자료 행. Storage에는 아무것도 쓰지 않는다.
-- ▶ 검사하지 않는 것 → 배포 후 실제 계정으로: 교수자 저장 권한(can_manage_course), 학생의 비공개·다른 과목 HTML 차단,
--   앱 화면의 sandbox iframe·CSP, .html 내려받기
-- ▶ 시작할 때 쓰는 테이블의 trigger와 호출 함수 정의에 외부 호출이 있으면 아무것도 쓰지 않고 멈춘다. (동적 SQL·이벤트 trigger는 탐지 못함)

do $smoke$
declare
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_role_before text := current_user;
  v_called constant text[] := array[
    'public.admin_save_week_material_html(text,text,jsonb,text,text)',
    'public.save_week_material_html(text,text,jsonb,text)',
    'public._save_week_material_html(text,text,jsonb,text,uuid,text,boolean)',
    'public.week_material_html(text)',
    'public._material_html_ok(text)',
    'public._material_text(jsonb,text,integer,boolean)',
    'public._material_actor_label()',
    'public._can_see_all_week_materials(text)',
    'public._is_week_material_learner(text)',
    'public.can_manage_course(text)',
    'public.lesson_course_lock_key(text)',
    'public.admin_create_course(text,text,text,text,integer)',
    'public._course_text(text,text,integer,boolean)',
    'public.admin_save_week_material(text,text,jsonb,text)',
    'public._save_week_material(text,text,jsonb,uuid,text,boolean)',
    'public.admin_reorder_week_materials(text,integer,text[])',
    'public._reorder_week_materials(text,integer,text[],boolean)',
    'public.admin_delete_week_material(text)',
    'public._delete_week_material(text,boolean)',
    'public._renumber_week_materials(text,integer)',
    'public.set_updated_at()'
  ];
  c public.courses;
  h1 public.week_materials;
  r record;
  v_link_id text;
  v_got text;
  i integer;
  lines text[] := '{}';
  c_expected constant integer := 24;
  v_pass integer;
  v_fail integer;
  v_abort integer;
  v_null integer;
  v_verdict text;
begin
  /* ───────── 0) 안전 확인 (쓰기 전) ───────── */

  if exists (select 1 from unnest(v_called) s where to_regprocedure(s) is null) then
    raise exception 'HTML_SMOKE_ABORT: 4단계 마이그레이션 또는 검사할 함수가 없어요.';
  end if;
  for r in
    select pn.nspname || '.' || p.proname as fn
      from (
        select to_regprocedure(s)::oid as oid from unnest(v_called) s
        union
        select t.tgfoid from pg_trigger t
         where not t.tgisinternal
           and t.tgrelid in ('public.courses'::regclass, 'public.week_materials'::regclass)
      ) x
      join pg_proc p on p.oid = x.oid
      join pg_namespace pn on pn.oid = p.pronamespace
     where pn.nspname in ('net', 'supabase_functions')
        or (p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
            and p.prolang <> (select oid from pg_language where lanname = 'sql'))
        or pg_get_functiondef(p.oid) ~* '(\mnet\.|supabase_functions\.|\mhttp_(get|post|put|patch|delete|request)\M|\mdblink|\mpg_notify\M|\mnotify\s|\mlo_(import|export|create|unlink)\M|copy\s[\s\S]*\sprogram\M)'
  loop
    raise exception 'HTML_SMOKE_ABORT: 외부 영향 가능성이 있는 함수가 있어 실행하지 않았어요. (%)', r.fn;
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
    select * into c from public.admin_create_course('HTML 검사 과목 ' || v_tag, '', '', '', 4);

    /* 등록 (service_role RPC) */
    select * into h1 from public.admin_save_week_material_html(c.id, null, '{"week":2,"title":"  HTML A  "}'::jsonb,
      '<h1>표</h1><table><tr><td>你好</td></tr></table><img src="data:image/png;base64,AAAA">', 'e2-smoke');
    lines := lines || pg_temp.e2_check('등록: html·비공개·순서 0·본문·주소 없음·제목 공백 제거',
      case when h1.kind = 'html' and h1.status = 'draft' and h1.position = 0 and h1.url is null and h1.storage_path is null
                and h1.html_body like '<h1>표</h1>%' and h1.title = 'HTML A' and h1.updated_by_label = 'e2-smoke'
           then 'OK' else 'BAD:' || left(h1::text, 120) end, 'OK');
    lines := lines || pg_temp.e2_check('등록: <script> 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":1,"title":"x"}'::jsonb, '<p>a</p><SCRIPT>alert(1)</SCRIPT>')).id$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 이벤트 속성(onerror) 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":1,"title":"x"}'::jsonb, '<img src=x onerror=alert(1)>')).id$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: javascript: 주소·<iframe> 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":1,"title":"x"}'::jsonb, '<a href="javascript:x">a</a>')).id$q$, c.id))
      || '/' || pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":1,"title":"x"}'::jsonb, '<iframe src="https://a.b"></iframe>')).id$q$, c.id)),
      'ERR:22023%/ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 2MB(UTF-8) 초과 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":1,"title":"x"}'::jsonb, repeat('가', 699051))).id$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 과목 주차(4) 밖 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":5,"title":"x"}'::jsonb, '<p>a</p>')).id$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('등록: 입력에 url·kind 칸 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":1,"title":"x","url":"https://a.b"}'::jsonb, '<p>a</p>')).id$q$, c.id))
      || '/' || pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":1,"title":"x","kind":"link"}'::jsonb, '<p>a</p>')).id$q$, c.id)),
      'ERR:22023%/ERR:22023%');

    /* 수정: RPC 결과와 테이블 상태는 다른 문장으로 본다 */
    v_got := pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, '{"title":"HTML B","week":3}'::jsonb, '<p>v2</p>', 'e2-smoke')).id$q$, h1.id));
    lines := lines || pg_temp.e2_check('수정: 본문·제목·주차 이동(3주차 0번), 버전 증가',
      v_got || '/' || coalesce((select html_body || ':' || title || ':' || week || ':' || position || ':' || (version > 1)::text from public.week_materials where id = h1.id), 'NULL'),
      'OK:' || h1.id || '/<p>v2</p>:HTML B:3:0:true');
    lines := lines || pg_temp.e2_check('수정: 본문 없이(null) 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, '{"title":"x"}'::jsonb, null)).id$q$, h1.id)), 'ERR:22023%');
    select (public.admin_save_week_material(c.id, null, '{"week":3,"title":"링크","url":"https://example.com"}'::jsonb, 'e2-smoke')).id into v_link_id;
    lines := lines || pg_temp.e2_check('수정: 링크 자료에 HTML 본문 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(null, %L, '{}'::jsonb, '<p>a</p>')).id$q$, v_link_id)), 'ERR:22023%');
    v_got := pg_temp.e2_try(format($q$select (public.admin_save_week_material(null, %L, '{"status":"published"}'::jsonb, 'e2-smoke')).status$q$, h1.id));
    lines := lines || pg_temp.e2_check('3-B 저장 RPC로 공개 전환, 본문은 그대로',
      v_got || '/' || coalesce((select html_body from public.week_materials where id = h1.id), 'NULL'), 'OK:published/<p>v2</p>');
    lines := lines || pg_temp.e2_check('3-B 저장 RPC: HTML 자료에 url 거부(22023)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material(null, %L, '{"url":"https://a.b"}'::jsonb)).id$q$, h1.id)), 'ERR:22023%');

    /* 같은 주차 정렬: HTML·링크 함께 */
    v_got := pg_temp.e2_try(format($q$select string_agg(id, ',' order by position) from public.admin_reorder_week_materials(%L, 3, array[%L, %L])$q$, c.id, v_link_id, h1.id));
    lines := lines || pg_temp.e2_check('정렬: 같은 주차의 링크·HTML 순서 바꾸기', v_got, 'OK:' || v_link_id || ',' || h1.id);

    /* 제약 */
    lines := lines || pg_temp.e2_check('제약: 본문 없는 html 행 거부(23514)',
      pg_temp.e2_try(format($q$insert into public.week_materials (id, course_id, week, kind, title) values ('material-x' || %L, %L, 1, 'html', 'x') returning id$q$, v_tag, c.id)),
      'ERR:23514%');
    lines := lines || pg_temp.e2_check('제약: 링크 행에 html_body 거부(23514)',
      pg_temp.e2_try(format($q$update public.week_materials set html_body = '<p>a</p>' where id = %L returning id$q$, v_link_id)), 'ERR:23514%');

    /* 주차당 20개는 종류를 합쳐 센다 */
    for i in 1..20 loop
      perform public.admin_save_week_material(c.id, null, jsonb_build_object('week', 4, 'title', 'L' || i, 'url', 'https://example.com/' || i), 'e2-smoke');
    end loop;
    lines := lines || pg_temp.e2_check('개수: 링크로 찬 주차에 HTML 등록 거부(23505)',
      pg_temp.e2_try(format($q$select (public.admin_save_week_material_html(%L, null, '{"week":4,"title":"x"}'::jsonb, '<p>a</p>')).id$q$, c.id)), 'ERR:23505%');

    /* 삭제: 3-B RPC, 저장 경로 없음 */
    v_got := pg_temp.e2_try(format($q$select coalesce((public.admin_delete_week_material(%L)).storage_path, 'no-path')$q$, h1.id));
    lines := lines || pg_temp.e2_check('삭제: 3-B 삭제 RPC, 저장 경로 없음·행 없음',
      v_got || '/' || (select count(*) from public.week_materials where id = h1.id)::text, 'OK:no-path/0');
    select * into h1 from public.admin_save_week_material_html(c.id, null, '{"week":1,"title":"권한 검사","status":"published"}'::jsonb, '<p>a</p>', 'e2-smoke');

    /* 역할 권한 */
    lines := lines || pg_temp.e2_check('authenticated 전환: current_user = authenticated, auth.uid() NULL',
      pg_temp.e2_try_as('authenticated', $q$select current_user::text || '/' || coalesce(auth.uid()::text, 'null')$q$), 'OK:authenticated/null');
    lines := lines || pg_temp.e2_check('authenticated: 관리자 HTML 저장 RPC 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select (public.admin_save_week_material_html(%L, null, '{"week":1,"title":"x"}'::jsonb, '<p>a</p>')).id$q$, c.id)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated(로그인 정보 없음): 교수자 HTML 저장 RPC 28000',
      pg_temp.e2_try_as('authenticated', format($q$select (public.save_week_material_html(%L, null, '{"week":1,"title":"x"}'::jsonb, '<p>a</p>')).id$q$, c.id)), 'ERR:28000%');
    lines := lines || pg_temp.e2_check('authenticated(로그인 정보 없음): HTML 열기 RPC 28000',
      pg_temp.e2_try_as('authenticated', format($q$select count(*)::text from public.week_material_html(%L)$q$, h1.id)), 'ERR:28000%');
    lines := lines || pg_temp.e2_check('authenticated: html_body 직접 조회 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select html_body from public.week_materials where id = %L$q$, h1.id)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('anon: HTML 열기·교수자 저장 RPC 실행 거부(42501)',
      pg_temp.e2_try_as('anon', format($q$select count(*)::text from public.week_material_html(%L)$q$, h1.id))
      || '/' || pg_temp.e2_try_as('anon', format($q$select (public.save_week_material_html(%L, null, '{"week":1,"title":"x"}'::jsonb, '<p>a</p>')).id$q$, c.id)),
      'ERR:42501%/ERR:42501%');
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
    message = format(E'HTML SMOKE 결과: %s — 모든 변경은 롤백됨\n(성공 기준: PASS %s · FAIL 0)\n%s',
                     v_verdict, c_expected, array_to_string(lines, E'\n', 'NULL'));
end;
$smoke$;

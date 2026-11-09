-- Phase 6-B: 실시간 퀴즈 세션 제약·정답 비공개·권한 실제 동작 검사 (롤백 전용 스모크)
--
-- ▶ 실행: 6-B 마이그레이션 적용 후, 이 파일 "전체"를 SQL Editor에서 한 번에 실행한다.
--   do 블록 하나뿐이고, 마지막 문장이 항상 오류(raise exception)를 내서 블록 안의 모든 변경이 취소된다.
--   → 첫 줄이 'LIVE SESSION SMOKE 결과: 성공'일 때만 성공 (PASS 22 · FAIL 0). 실행 전후 …_phase_6b_pre.sql [1]로 비교한다.
-- ▶ 쓰는 것 (모두 롤백): 검사 과목 1개, 검사 분반 2개, 문제 세트 2개, 세션 행. auth.users·Storage에는 쓰지 않는다.
--   무작위 uuid를 auth.uid()로 설정해 '담당 아닌 사용자·수강하지 않은 사용자'를 흉내 낸다 (실제 계정 아님, 권한 검사에서 막혀 아무것도 쓰지 않음).
-- ▶ 검사하지 않는 것 → 실제 계정으로: 담당 교수자의 시작·출제·마감·정답 공개·종료 전이, 수강생 참여·제출·중복 제출 409
--   (실제 auth 사용자가 필요한 경로. 같은 전이 규칙은 자동 테스트(JSON 모드)로 검사한다)
-- ▶ 사전 확인은 빠진 함수·테이블 이름을 메시지에 넣는다. trigger·호출 함수에 외부 호출이 있으면 아무것도 쓰지 않고 멈춘다.

do $smoke$
declare
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_role_before text := current_user;
  v_called constant text[] := array[
    'public.start_live_session(text,text)',
    'public.live_session_control(text,text,integer)',
    'public.live_session_host_state(text)',
    'public.my_live_host_sessions(text)',
    'public.join_live_session(text)',
    'public.live_session_student_state(text)',
    'public.submit_live_answer(text,integer,integer)',
    'public._live_join_code()',
    'public._live_can_host(text)',
    'public._live_host_json(text)',
    'public._live_student_json(text,uuid)',
    'public.admin_save_live_quiz_set(text,text,jsonb,integer,text)',
    'public.admin_delete_live_quiz_set(text)',
    'public._save_live_quiz_set(text,text,jsonb,integer,uuid,text,boolean)',
    'public._delete_live_quiz_set(text,boolean)',
    'public._live_quiz_sets_json(text)',
    'public._live_quiz_norm(text)',
    'public.my_instructor_section_ids(boolean)',
    'public.my_enrolled_section_ids()',
    'public.can_manage_course(text)',
    'public._material_actor_label()',
    'public.lesson_course_lock_key(text)',
    'public.admin_create_course(text,text,text,text,integer)',
    'public._course_text(text,text,integer,boolean)',
    'public.set_updated_at()'
  ];
  v_missing text;
  c public.courses;
  v_sec_a text;
  v_sec_b text;
  v_set jsonb;
  v_questions jsonb;
  v_code text;
  v_s1 text;
  v_s2 text;
  v_json jsonb;
  v_uid uuid;
  r record;
  v_got text;
  lines text[] := '{}';
  c_expected constant integer := 22;
  v_pass integer;
  v_fail integer;
  v_abort integer;
  v_null integer;
  v_verdict text;
begin
  /* ───────── 0) 안전 확인 (쓰기 전) ───────── */

  select string_agg(s, ', ') into v_missing from unnest(v_called) s where to_regprocedure(s) is null;
  if to_regclass('public.live_quiz_sessions') is null then v_missing := concat_ws(', ', v_missing, 'public.live_quiz_sessions'); end if;
  if to_regclass('public.live_quiz_participants') is null then v_missing := concat_ws(', ', v_missing, 'public.live_quiz_participants'); end if;
  if to_regclass('public.live_quiz_responses') is null then v_missing := concat_ws(', ', v_missing, 'public.live_quiz_responses'); end if;
  if v_missing is not null then
    raise exception 'LIVE_SESSION_SMOKE_ABORT: 없음 — %', v_missing;
  end if;
  for r in
    select pn.nspname || '.' || p.proname as fn
      from (
        select to_regprocedure(s)::oid as oid from unnest(v_called) s
        union
        select t.tgfoid from pg_trigger t
         where not t.tgisinternal
           and t.tgrelid in ('public.courses'::regclass, 'public.week_materials'::regclass, 'public.lessons'::regclass, 'public.lesson_dialogues'::regclass, 'public.live_quiz_sets'::regclass, 'public.live_quiz_questions'::regclass, 'public.live_quiz_sessions'::regclass, 'public.sections'::regclass)
      ) x
      join pg_proc p on p.oid = x.oid
      join pg_namespace pn on pn.oid = p.pronamespace
     where pn.nspname in ('net', 'supabase_functions')
        or (p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
            and p.prolang <> (select oid from pg_language where lanname = 'sql'))
        or pg_get_functiondef(p.oid) ~* '(\mnet\.|supabase_functions\.|\mhttp_(get|post|put|patch|delete|request)\M|\mdblink|\mpg_notify\M|\mnotify\s|\mlo_(import|export|create|unlink)\M|copy\s[\s\S]*\sprogram\M)'
  loop
    raise exception 'LIVE_SESSION_SMOKE_ABORT: 외부 영향 가능성이 있는 함수가 있어 실행하지 않았어요. (%)', r.fn;
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

  -- 무작위 사용자(실제 계정이 아님)로 실행: auth.uid()만 그 값이 되고, 권한·수강 검사에서 막혀 아무것도 쓰지 않는다
  create function pg_temp.e2_try_uid(p_uid uuid, p_sql text)
  returns text
  language plpgsql
  as $f$
  declare
    v_before text := current_user;
    v_out text;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    execute 'set local role authenticated';
    begin
      if auth.uid() is distinct from p_uid then
        v_out := 'SETUP:auth.uid() 설정 실패';
      else
        execute p_sql into v_out;
        v_out := 'OK:' || coalesce(v_out, 'null');
      end if;
    exception when others then
      v_out := 'ERR:' || sqlstate || ':' || sqlerrm;
    end;
    execute format('set local role %I', v_before);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    if current_user is distinct from v_before then
      raise exception '역할 복원 실패 (current_user=%, 기대=%)', current_user, v_before;
    end if;
    return v_out;
  end;
  $f$;

  begin
    select * into c from public.admin_create_course('실시간 세션 검사 과목 ' || v_tag, '', '', '', 4);
    insert into public.sections (id, course_id, name, code) values ('smoke-sa-' || v_tag, c.id, '검사 A', upper(substr(md5(v_tag || 'a'), 1, 6))) returning id into v_sec_a;
    insert into public.sections (id, course_id, name, code) values ('smoke-sb-' || v_tag, c.id, '검사 B', upper(substr(md5(v_tag || 'b'), 1, 6))) returning id into v_sec_b;
    v_set := public.admin_save_live_quiz_set(c.id, null, jsonb_build_object('week', 1, 'title', '세션 검사', 'status', 'ready', 'questions', jsonb_build_array(
      jsonb_build_object('question', 'Q1', 'options', jsonb_build_array('a', 'b', 'c', 'd'), 'answer', 2, 'explanation', '해설1'),
      jsonb_build_object('question', 'Q2', 'options', jsonb_build_array('x', 'y'), 'answer', 0))), null, 'e2-smoke');
    v_questions := (select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options, 'answer', q.answer, 'explanation', q.explanation) order by q.position)
                      from public.live_quiz_questions q where q.set_id = v_set ->> 'id');

    /* 참여 코드 · 세션 행 제약 */
    v_code := public._live_join_code();
    lines := lines || pg_temp.e2_check('참여 코드: 6자리, 0·O·1·I 없음', (v_code ~ '^[A-HJ-NP-Z2-9]{6}$')::text, 'true');
    insert into public.live_quiz_sessions (id, course_id, section_id, set_id, title, questions, join_code)
    values ('lqs-' || substr(md5(v_tag || 's1'), 1, 12), c.id, v_sec_a, v_set ->> 'id', '세션 검사', v_questions, v_code)
    returning id into v_s1;
    lines := lines || pg_temp.e2_check('세션: 대기(waiting)·현재 문제 없음·버전 1로 시작',
      (select phase || ':' || coalesce(current_index::text, 'null') || ':' || state_version from public.live_quiz_sessions where id = v_s1), 'waiting:null:1');
    lines := lines || pg_temp.e2_check('제약: 응답 접수(open)인데 현재 문제 없음 거부(23514)',
      pg_temp.e2_try(format($q$update public.live_quiz_sessions set phase = 'open' where id = %L returning id$q$, v_s1)), 'ERR:23514%');
    lines := lines || pg_temp.e2_check('제약: 문제 수 밖의 현재 문제 거부(23514)',
      pg_temp.e2_try(format($q$update public.live_quiz_sessions set phase = 'open', current_index = 2 where id = %L returning id$q$, v_s1)), 'ERR:23514%');
    lines := lines || pg_temp.e2_check('제약: 같은 분반에 진행 중 세션 2개 거부(23505)',
      pg_temp.e2_try(format($q$insert into public.live_quiz_sessions (id, course_id, section_id, title, questions, join_code) values (%L, %L, %L, 't', %L::jsonb, 'ZZZZZ2') returning id$q$,
        'lqs-' || substr(md5(v_tag || 's2'), 1, 12), c.id, v_sec_a, v_questions::text)), 'ERR:23505%');
    lines := lines || pg_temp.e2_check('제약: 진행 중 세션끼리 같은 참여 코드 거부(23505)',
      pg_temp.e2_try(format($q$insert into public.live_quiz_sessions (id, course_id, section_id, title, questions, join_code) values (%L, %L, %L, 't', %L::jsonb, %L) returning id$q$,
        'lqs-' || substr(md5(v_tag || 's3'), 1, 12), c.id, v_sec_b, v_questions::text, v_code)), 'ERR:23505%');

    /* 화면 상태 JSON: 학생에게는 정답 공개 전 정답·해설·응답 수 없음 */
    update public.live_quiz_sessions set current_index = 0, phase = 'open' where id = v_s1;
    v_json := public._live_student_json(v_s1, null);
    lines := lines || pg_temp.e2_check('학생 상태(응답 접수): 문제·보기만, 정답·해설·응답 수 없음',
      case when v_json -> 'question' ->> 'question' = 'Q1' and jsonb_array_length(v_json -> 'question' -> 'options') = 4
                and v_json -> 'answer' = 'null'::jsonb and v_json -> 'explanation' = 'null'::jsonb and v_json -> 'counts' = 'null'::jsonb
                and not (v_json -> 'question' ? 'answer') and v_json::text not like '%해설1%' then 'OK' else 'BAD:' || left(v_json::text, 140) end, 'OK');
    update public.live_quiz_sessions set phase = 'closed' where id = v_s1;
    v_json := public._live_student_json(v_s1, null);
    lines := lines || pg_temp.e2_check('학생 상태(응답 마감): 아직 정답·해설 없음',
      case when v_json -> 'answer' = 'null'::jsonb and v_json::text not like '%해설1%' then 'OK' else 'BAD' end, 'OK');
    update public.live_quiz_sessions set phase = 'revealed' where id = v_s1;
    v_json := public._live_student_json(v_s1, null);
    lines := lines || pg_temp.e2_check('학생 상태(정답 공개): 정답·해설·보기별 응답 수',
      (v_json ->> 'answer') || ':' || (v_json ->> 'explanation') || ':' || (v_json -> 'counts')::text, '2:해설1:[0, 0, 0, 0]');
    v_json := public._live_host_json(v_s1);
    lines := lines || pg_temp.e2_check('교수자 상태: 정답 포함 문제·참여 0·보기별 응답 수·문제별 요약, 개별 응답 없음',
      case when (v_json -> 'question' ->> 'answer') = '2' and (v_json ->> 'participants') = '0' and jsonb_array_length(v_json -> 'counts') = 4
                and jsonb_array_length(v_json -> 'summary') = 1 and v_json::text not like '%user_id%' then 'OK' else 'BAD:' || left(v_json::text, 140) end, 'OK');

    /* 세트를 지워도 세션 기록(스냅샷)은 남는다 */
    perform public.admin_delete_live_quiz_set(v_set ->> 'id');
    lines := lines || pg_temp.e2_check('세트 삭제: 세션은 남고 set_id만 NULL, 문제 스냅샷 유지',
      (select coalesce(set_id, 'NULL') || ':' || jsonb_array_length(questions) from public.live_quiz_sessions where id = v_s1), 'NULL:2');

    /* 종료하면 같은 분반에서 새 세션 가능 */
    update public.live_quiz_sessions set status = 'ended', ended_at = now() where id = v_s1;
    lines := lines || pg_temp.e2_check('종료 뒤 같은 분반·같은 코드로 새 세션 허용',
      pg_temp.e2_try(format($q$insert into public.live_quiz_sessions (id, course_id, section_id, title, questions, join_code) values (%L, %L, %L, 't', %L::jsonb, %L) returning 'ok'$q$,
        'lqs-' || substr(md5(v_tag || 's4'), 1, 12), c.id, v_sec_a, v_questions::text, v_code)), 'OK:ok');
    v_s2 := 'lqs-' || substr(md5(v_tag || 's4'), 1, 12);

    /* 무작위 사용자(담당 교수자·수강생이 아님): 권한·수강 검사에서 거부, 아무것도 쓰지 않음 */
    v_uid := gen_random_uuid();
    v_set := public.admin_save_live_quiz_set(c.id, null, jsonb_build_object('week', 1, 'title', '시작 검사', 'status', 'ready', 'questions', jsonb_build_array(
      jsonb_build_object('question', 'S1', 'options', jsonb_build_array('a', 'b'), 'answer', 0))), null, 'e2-smoke');
    lines := lines || pg_temp.e2_check('담당 아닌 사용자: 세션 시작 거부(42501)',
      pg_temp.e2_try_uid(v_uid, format($q$select public.start_live_session(%L, %L)::text$q$, v_set ->> 'id', v_sec_b)), 'ERR:42501%');
    lines := lines || pg_temp.e2_check('담당 아닌 사용자: 진행 제어·교수자 상태 거부(P0002)',
      pg_temp.e2_try_uid(v_uid, format($q$select public.live_session_control(%L, 'next', 1)::text$q$, v_s2))
      || '/' || pg_temp.e2_try_uid(v_uid, format($q$select public.live_session_host_state(%L)::text$q$, v_s2)),
      'ERR:P0002%/ERR:P0002%');
    lines := lines || pg_temp.e2_check('담당 아닌 사용자: 진행 중 세션 목록 비어 있음',
      pg_temp.e2_try_uid(v_uid, format($q$select public.my_live_host_sessions(%L)::text$q$, c.id)), 'OK:[]');
    lines := lines || pg_temp.e2_check('수강하지 않은 사용자: 올바른 코드로도 참여·상태·제출 거부(P0002)',
      pg_temp.e2_try_uid(v_uid, format($q$select public.join_live_session(%L)::text$q$, lower(v_code)))
      || '/' || pg_temp.e2_try_uid(v_uid, format($q$select public.live_session_student_state(%L)::text$q$, v_s2))
      || '/' || pg_temp.e2_try_uid(v_uid, format($q$select public.submit_live_answer(%L, 0, 0)::text$q$, v_s2)),
      'ERR:P0002%/ERR:P0002%/ERR:P0002%');
    lines := lines || pg_temp.e2_check('거부된 요청은 참여·응답 기록을 남기지 않음',
      ((select count(*) from public.live_quiz_participants where user_id = v_uid) + (select count(*) from public.live_quiz_responses where user_id = v_uid))::text, '0');

    /* 역할 권한 */
    lines := lines || pg_temp.e2_check('authenticated(로그인 정보 없음): 교수자·학생 RPC 7개 모두 28000',
      pg_temp.e2_try_as('authenticated', format($q$select public.start_live_session(%L, %L)::text$q$, v_set ->> 'id', v_sec_b))
      || '/' || pg_temp.e2_try_as('authenticated', format($q$select public.live_session_control(%L, 'end', 1)::text$q$, v_s2))
      || '/' || pg_temp.e2_try_as('authenticated', format($q$select public.live_session_host_state(%L)::text$q$, v_s2))
      || '/' || pg_temp.e2_try_as('authenticated', format($q$select public.my_live_host_sessions(%L)::text$q$, c.id))
      || '/' || pg_temp.e2_try_as('authenticated', format($q$select public.join_live_session(%L)::text$q$, v_code))
      || '/' || pg_temp.e2_try_as('authenticated', format($q$select public.live_session_student_state(%L)::text$q$, v_s2))
      || '/' || pg_temp.e2_try_as('authenticated', format($q$select public.submit_live_answer(%L, 0, 0)::text$q$, v_s2)),
      'ERR:28000%/ERR:28000%/ERR:28000%/ERR:28000%/ERR:28000%/ERR:28000%/ERR:28000%');
    lines := lines || pg_temp.e2_check('anon: 참여·시작 RPC 실행 거부(42501)',
      pg_temp.e2_try_as('anon', format($q$select public.join_live_session(%L)::text$q$, v_code))
      || '/' || pg_temp.e2_try_as('anon', format($q$select public.start_live_session(%L, %L)::text$q$, v_set ->> 'id', v_sec_b)),
      'ERR:42501%/ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: 세션·참여·응답 테이블 직접 조회 거부(42501)',
      pg_temp.e2_try_as('authenticated', $q$select count(*)::text from public.live_quiz_sessions$q$)
      || '/' || pg_temp.e2_try_as('authenticated', $q$select count(*)::text from public.live_quiz_participants$q$)
      || '/' || pg_temp.e2_try_as('authenticated', $q$select count(*)::text from public.live_quiz_responses$q$),
      'ERR:42501%/ERR:42501%/ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: 내부 함수(정답 포함 상태·코드 생성) 실행 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select public._live_host_json(%L)::text$q$, v_s2))
      || '/' || pg_temp.e2_try_as('authenticated', $q$select public._live_join_code()$q$),
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
    message = format(E'LIVE SESSION SMOKE 결과: %s — 모든 변경은 롤백됨\n(성공 기준: PASS %s · FAIL 0)\n%s',
                     v_verdict, c_expected, array_to_string(lines, E'\n', 'NULL'));
end;
$smoke$;

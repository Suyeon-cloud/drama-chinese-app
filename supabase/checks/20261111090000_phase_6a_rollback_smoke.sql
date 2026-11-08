-- Phase 6-A: 실시간 퀴즈 문제 세트 RPC·제약·권한 실제 동작 검사 (롤백 전용 스모크)
--
-- ▶ 실행: 6-A 마이그레이션 적용 후, 이 파일 "전체"를 SQL Editor에서 한 번에 실행한다.
--   do 블록 하나뿐이고, 마지막 문장이 항상 오류(raise exception)를 내서 블록 안의 모든 변경이 취소된다.
--   → 첫 줄이 'LIVE QUIZ SMOKE 결과: 성공'일 때만 성공 (PASS 21 · FAIL 0). 실행 전후 …_phase_6a_pre.sql [1]로 비교한다.
-- ▶ 쓰는 것 (모두 롤백): 검사 과목 2개, 검사 강의 2개, 그 과목의 실시간 퀴즈 세트·문제. Storage·auth.users에는 쓰지 않는다.
-- ▶ 검사하지 않는 것 → 배포 후 실제 계정으로: 교수자 저장 권한(can_manage_course), 화면의 중복 경고·AI 생성
-- ▶ 시작할 때 쓰는 테이블의 trigger와 호출 함수 정의에 외부 호출이 있으면 아무것도 쓰지 않고 멈춘다.
--   사전 확인은 빠진 함수·테이블 이름을 메시지에 넣는다.

do $smoke$
declare
  v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_role_before text := current_user;
  v_called constant text[] := array[
    'public.admin_save_live_quiz_set(text,text,jsonb,integer,text)',
    'public.admin_delete_live_quiz_set(text)',
    'public.list_live_quiz_sets(text)',
    'public.save_live_quiz_set(text,text,jsonb,integer)',
    'public.delete_live_quiz_set(text)',
    'public._save_live_quiz_set(text,text,jsonb,integer,uuid,text,boolean)',
    'public._delete_live_quiz_set(text,boolean)',
    'public._live_quiz_sets_json(text)',
    'public._live_quiz_norm(text)',
    'public._can_see_all_week_materials(text)',
    'public._material_actor_label()',
    'public.can_manage_course(text)',
    'public.lesson_course_lock_key(text)',
    'public.admin_create_course(text,text,text,text,integer)',
    'public._course_text(text,text,integer,boolean)',
    'public.set_updated_at()'
  ];
  v_missing text;
  c public.courses;
  c2 public.courses;
  l1 public.lessons;
  l2 public.lessons;
  v_set jsonb;
  v_q1 text;
  r record;
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

  select string_agg(s, ', ') into v_missing from unnest(v_called) s where to_regprocedure(s) is null;
  if to_regclass('public.live_quiz_sets') is null then v_missing := concat_ws(', ', v_missing, 'public.live_quiz_sets'); end if;
  if to_regclass('public.live_quiz_questions') is null then v_missing := concat_ws(', ', v_missing, 'public.live_quiz_questions'); end if;
  if v_missing is not null then
    raise exception 'LIVE_QUIZ_SMOKE_ABORT: 없음 — %', v_missing;
  end if;
  for r in
    select pn.nspname || '.' || p.proname as fn
      from (
        select to_regprocedure(s)::oid as oid from unnest(v_called) s
        union
        select t.tgfoid from pg_trigger t
         where not t.tgisinternal
           and t.tgrelid in ('public.courses'::regclass, 'public.week_materials'::regclass, 'public.lessons'::regclass, 'public.lesson_dialogues'::regclass, 'public.live_quiz_sets'::regclass, 'public.live_quiz_questions'::regclass)
      ) x
      join pg_proc p on p.oid = x.oid
      join pg_namespace pn on pn.oid = p.pronamespace
     where pn.nspname in ('net', 'supabase_functions')
        or (p.prolang <> (select oid from pg_language where lanname = 'plpgsql')
            and p.prolang <> (select oid from pg_language where lanname = 'sql'))
        or pg_get_functiondef(p.oid) ~* '(\mnet\.|supabase_functions\.|\mhttp_(get|post|put|patch|delete|request)\M|\mdblink|\mpg_notify\M|\mnotify\s|\mlo_(import|export|create|unlink)\M|copy\s[\s\S]*\sprogram\M)'
  loop
    raise exception 'LIVE_QUIZ_SMOKE_ABORT: 외부 영향 가능성이 있는 함수가 있어 실행하지 않았어요. (%)', r.fn;
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
    select * into c from public.admin_create_course('실시간 퀴즈 검사 과목 ' || v_tag, '', '', '', 4);
    select * into c2 from public.admin_create_course('다른 과목 ' || v_tag, '', '', '', 4);
    insert into public.lessons (id, course_id, week, direction, script) values ('smoke-lq1-' || v_tag, c.id, 1, 'zh-ko', '{}'::jsonb) returning * into l1;
    insert into public.lessons (id, course_id, week, direction, script) values ('smoke-lq2-' || v_tag, c2.id, 1, 'zh-ko', '{}'::jsonb) returning * into l2;

    /* 등록 */
    v_set := public.admin_save_live_quiz_set(c.id, null, jsonb_build_object(
      'week', 1, 'lessonId', l1.id, 'title', '  1주차 실시간  ',
      'questions', jsonb_build_array(
        jsonb_build_object('question', '你好的意思是?', 'options', jsonb_build_array('안녕', '감사', '미안', '잘가'), 'answer', 0, 'explanation', '인사', 'origin', 'ai'),
        jsonb_build_object('question', '谢谢的意思是?', 'options', jsonb_build_array('안녕', '감사'), 'answer', 1))), null, 'e2-smoke');
    lines := lines || pg_temp.e2_check('등록: 버전 1·작성 중·제목 공백 제거·문제 2개·강의 연결·출처',
      case when (v_set ->> 'version') = '1' and v_set ->> 'status' = 'draft' and v_set ->> 'title' = '1주차 실시간'
                and jsonb_array_length(v_set -> 'questions') = 2 and v_set ->> 'lessonId' = l1.id
                and v_set -> 'questions' -> 0 ->> 'origin' = 'ai' and v_set -> 'questions' -> 1 ->> 'origin' = 'manual'
                and (v_set -> 'questions' -> 0 ->> 'id') ~ '^lq-' then 'OK' else 'BAD:' || left(v_set::text, 120) end, 'OK');
    v_q1 := v_set -> 'questions' -> 0 ->> 'id';
    lines := lines || pg_temp.e2_check('정규화: 전각·문장부호·공백·대소문자 무시',
      (public._live_quiz_norm('你好，世界！ ＡＢＣ') = public._live_quiz_norm('你好世界abc'))::text, 'true');

    /* 중복 */
    lines := lines || pg_temp.e2_check('중복: 같은 세트 안 보기 순서만 바꾼 문제 거부(23505)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(%L, null, jsonb_build_object('week', 1, 'title', 'x', 'questions', jsonb_build_array(
        jsonb_build_object('question', 'A?', 'options', jsonb_build_array('1', '2'), 'answer', 0),
        jsonb_build_object('question', 'A？', 'options', jsonb_build_array('2', '1'), 'answer', 1))), null)::text$q$, c.id)), 'ERR:23505%');
    lines := lines || pg_temp.e2_check('중복: 같은 과목 다른 세트의 같은 문제(보기 순서·문장부호 차이) 거부(23505)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(%L, null, jsonb_build_object('week', 2, 'title', 'y', 'questions', jsonb_build_array(
        jsonb_build_object('question', '你好的意思是？ ', 'options', jsonb_build_array('잘가', '미안', '감사', '안녕'), 'answer', 3))), null)::text$q$, c.id)), 'ERR:23505%');
    lines := lines || pg_temp.e2_check('중복: 다른 과목에는 같은 문제 허용',
      pg_temp.e2_try(format($q$select (public.admin_save_live_quiz_set(%L, null, jsonb_build_object('week', 1, 'title', 'z', 'questions', jsonb_build_array(
        jsonb_build_object('question', '你好的意思是?', 'options', jsonb_build_array('안녕', '감사', '미안', '잘가'), 'answer', 0))), null) ->> 'courseId')$q$, c2.id)),
      'OK:' || c2.id);

    /* 입력 검사 */
    lines := lines || pg_temp.e2_check('검사: 보기 1개 거부(22023)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(%L, null, '{"week":1,"title":"x","questions":[{"question":"q","options":["a"],"answer":0}]}'::jsonb, null)::text$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('검사: 같은 보기(정규화 후) 거부(22023)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(%L, null, '{"week":1,"title":"x","questions":[{"question":"q","options":["a b","AB"],"answer":0}]}'::jsonb, null)::text$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('검사: 정답이 보기 범위 밖이면 거부(22023)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(%L, null, '{"week":1,"title":"x","questions":[{"question":"q","options":["a","b"],"answer":2}]}'::jsonb, null)::text$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('검사: 과목 주차(4) 밖 거부(22023)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(%L, null, '{"week":5,"title":"x","questions":[{"question":"q","options":["a","b"],"answer":0}]}'::jsonb, null)::text$q$, c.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('검사: 다른 과목의 강의자료 연결 거부(22023)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(%L, null, jsonb_build_object('week', 1, 'title', 'x', 'lessonId', %L, 'questions', '[{"question":"q","options":["a","b"],"answer":0}]'::jsonb), null)::text$q$, c.id, l2.id)), 'ERR:22023%');
    lines := lines || pg_temp.e2_check('검사: 서버가 정하는 칸(id·version) 거부(22023)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(%L, null, '{"id":"x","week":1,"title":"x","questions":[{"question":"q","options":["a","b"],"answer":0}]}'::jsonb, null)::text$q$, c.id)), 'ERR:22023%');

    /* 수정: 기존 문제 id 유지, 지운 문제 제거, 새 문제 새 id, 버전 증가 / 옛 버전 거부 */
    v_got := pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(null, %L, jsonb_build_object('week', 2, 'title', '수정', 'status', 'ready', 'questions', jsonb_build_array(
        jsonb_build_object('id', %L, 'question', '你好的意思是?', 'options', jsonb_build_array('안녕', '감사', '미안', '잘가'), 'answer', 0),
        jsonb_build_object('id', 'lq-notmine123', 'question', '再见的意思是?', 'options', jsonb_build_array('잘가', '안녕'), 'answer', 0))), 1, 'e2-smoke') ->> 'version'$q$, v_set ->> 'id', v_q1));
    lines := lines || pg_temp.e2_check('수정: 버전 2·준비 완료·기존 문제 id 유지·남의 id는 새 id·지운 문제 없음',
      v_got || '/' || coalesce((select string_agg(case when q.id = v_q1 then 'kept' when q.id = 'lq-notmine123' then 'BAD' else 'new' end, ',' order by q.position)
                                  from public.live_quiz_questions q where q.set_id = v_set ->> 'id'), 'NULL')
            || '/' || coalesce((select status from public.live_quiz_sets where id = v_set ->> 'id'), 'NULL'),
      'OK:2/kept,new/ready');
    lines := lines || pg_temp.e2_check('수정: 옛 버전으로 저장하면 거부(40001)',
      pg_temp.e2_try(format($q$select public.admin_save_live_quiz_set(null, %L, '{"week":1,"title":"x","questions":[{"question":"q9","options":["a","b"],"answer":0}]}'::jsonb, 1)::text$q$, v_set ->> 'id')), 'ERR:40001%');

    /* 강의자료 삭제: 세트는 남고 연결만 끊김 / 세트 삭제: 문제도 함께 */
    delete from public.lessons where id = l1.id;
    lines := lines || pg_temp.e2_check('강의자료 삭제: 세트·문제 보존, 강의 연결만 NULL',
      coalesce((select coalesce(lesson_id, 'NULL') || ':' || (select count(*) from public.live_quiz_questions q where q.set_id = s.id)
                  from public.live_quiz_sets s where s.id = v_set ->> 'id'), 'GONE'), 'NULL:2');
    v_got := pg_temp.e2_try(format($q$select public.admin_delete_live_quiz_set(%L)$q$, v_set ->> 'id'));
    lines := lines || pg_temp.e2_check('삭제: 과목 id 반환, 세트·문제 모두 삭제',
      v_got || '/' || (select count(*) from public.live_quiz_questions q where q.set_id = v_set ->> 'id')::text, 'OK:' || c.id || '/0');

    /* 역할 권한 */
    lines := lines || pg_temp.e2_check('authenticated 전환: current_user = authenticated, auth.uid() NULL',
      pg_temp.e2_try_as('authenticated', $q$select current_user::text || '/' || coalesce(auth.uid()::text, 'null')$q$), 'OK:authenticated/null');
    lines := lines || pg_temp.e2_check('authenticated(로그인 정보 없음): 목록·저장·삭제 RPC 28000',
      pg_temp.e2_try_as('authenticated', format($q$select public.list_live_quiz_sets(%L)::text$q$, c.id))
      || '/' || pg_temp.e2_try_as('authenticated', format($q$select public.save_live_quiz_set(%L, null, '{}'::jsonb, null)::text$q$, c.id))
      || '/' || pg_temp.e2_try_as('authenticated', $q$select public.delete_live_quiz_set('livequiz-none00')$q$),
      'ERR:28000%/ERR:28000%/ERR:28000%');
    lines := lines || pg_temp.e2_check('authenticated: 관리자 저장 RPC·내부 함수 실행 거부(42501)',
      pg_temp.e2_try_as('authenticated', format($q$select public.admin_save_live_quiz_set(%L, null, '{}'::jsonb, null)::text$q$, c.id))
      || '/' || pg_temp.e2_try_as('authenticated', $q$select public._live_quiz_norm('a')$q$),
      'ERR:42501%/ERR:42501%');
    lines := lines || pg_temp.e2_check('authenticated: 테이블 직접 조회 거부(42501)',
      pg_temp.e2_try_as('authenticated', $q$select count(*)::text from public.live_quiz_sets$q$)
      || '/' || pg_temp.e2_try_as('authenticated', $q$select count(*)::text from public.live_quiz_questions$q$),
      'ERR:42501%/ERR:42501%');
    lines := lines || pg_temp.e2_check('anon: 목록 RPC 실행 거부(42501)',
      pg_temp.e2_try_as('anon', format($q$select public.list_live_quiz_sets(%L)::text$q$, c.id)), 'ERR:42501%');
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
    message = format(E'LIVE QUIZ SMOKE 결과: %s — 모든 변경은 롤백됨\n(성공 기준: PASS %s · FAIL 0)\n%s',
                     v_verdict, c_expected, array_to_string(lines, E'\n', 'NULL'));
end;
$smoke$;

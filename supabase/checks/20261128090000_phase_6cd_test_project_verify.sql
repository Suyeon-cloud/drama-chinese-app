-- Phase 6-C·6-D·6-D2 동작 검증 — ★ 별도 무료 테스트 프로젝트 전용 (운영 프로젝트에서 실행하지 않는다)
--
-- ▶ 하는 일: 한 트랜잭션 안에서 테스트 사용자(auth.users)·과목·분반·수강·세션을 만들고, 사용자 역할(authenticated/anon)과
--    로그인 정보(request.jwt.claims)를 바꿔 가며 6-C 결과 조회·6-D 본인 확인 참여·권한·우회 차단을 실제로 실행해 본다.
-- ▶ 남는 것 없음: 마지막에 일부러 오류를 내서(결과 보고) 트랜잭션 전체가 취소된다. 맨 끝 rollback도 둔다.
--    결과는 SQL Editor의 오류 메시지 'VERIFY_6CD_REPORT: …'에 PASS/FAIL 목록으로 보인다.
-- ▶ 6-D2 적용 전·후 모두 실행할 수 있다: 기존 join_live_session 직접 호출은 6-D2 전이면 '허용(이전 버전 호환)', 뒤면 '거부'를 기대한다.
-- ▶ 전제: 테스트 프로젝트에 supabase/migrations의 모든 파일을 순서대로 적용한 상태 (6-D2는 선택).

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $verify$
declare
  T  uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; -- 담당 교수자
  O  uuid := 'aaaaaaaa-0000-4000-8000-000000000002'; -- 다른 분반 교수자
  S1 uuid := 'aaaaaaaa-0000-4000-8000-000000000003'; -- 수강생 (학번 2024000001)
  S2 uuid := 'aaaaaaaa-0000-4000-8000-000000000004'; -- 수강생 (같은 학번 — 중복 표시 확인)
  S3 uuid := 'aaaaaaaa-0000-4000-8000-000000000005'; -- 다른 분반 수강생
  v_sess text := 'lqs-zzverify0001';
  v_code text := 'VZVZVZ';
  v_report text := '';
  v_fail int := 0;
  v_state text;
  v_json jsonb;
  v_legacy_open boolean := has_function_privilege('authenticated', 'public.join_live_session(text)', 'EXECUTE');
begin
  /* ───── 0) 테스트 데이터 (모두 이 트랜잭션 안에서만 존재) ───── */
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    from (values (T, 'verify-t@example.test'), (O, 'verify-o@example.test'), (S1, 'verify-s1@example.test'),
                 (S2, 'verify-s2@example.test'), (S3, 'verify-s3@example.test')) as u(id, email);
  insert into public.profiles (id, name, student_id, status, profile_completed)
  values (S1, '김하나', '2024000001', 'approved', true),
         (S2, '이둘', '2024 000001', 'approved', true),
         (S3, '박셋', '2024000003', 'approved', true)
  on conflict (id) do update set name = excluded.name, student_id = excluded.student_id, status = excluded.status, profile_completed = excluded.profile_completed;
  insert into public.instructors (email, user_id, source) values ('verify-t@example.test', T, 'admin'), ('verify-o@example.test', O, 'admin')
  on conflict (email) do update set user_id = excluded.user_id;
  insert into public.courses (id, drama, title, week_count, status) values ('zz-verify-6cd', '测试', '6CD 검증', 15, 'active');
  insert into public.sections (id, course_id, name, code, status) values
    ('zz-verify-6cd-a', 'zz-verify-6cd', '검증 A', 'ZV6CDA', 'active'),
    ('zz-verify-6cd-b', 'zz-verify-6cd', '검증 B', 'ZV6CDB', 'active');
  insert into public.section_instructors (section_id, instructor_email) values
    ('zz-verify-6cd-a', 'verify-t@example.test'), ('zz-verify-6cd-b', 'verify-o@example.test');
  insert into public.enrollments (user_id, section_id, course_id, course_code) values
    (S1, 'zz-verify-6cd-a', 'zz-verify-6cd', 'ZV6CDA'), (S2, 'zz-verify-6cd-a', 'zz-verify-6cd', 'ZV6CDA'),
    (S3, 'zz-verify-6cd-b', 'zz-verify-6cd', 'ZV6CDB');
  insert into public.live_quiz_sessions (id, course_id, section_id, title, questions, join_code, status, current_index, phase)
  values (v_sess, 'zz-verify-6cd', 'zz-verify-6cd-a', '6CD 검증 세션',
          '[{"id":"q1","question":"Q1","options":["A","B"],"answer":0,"explanation":""},{"id":"q2","question":"Q2","options":["A","B","C"],"answer":2,"explanation":""}]'::jsonb,
          v_code, 'active', 0, 'open');

  /* ───── 1) 6-D 본인 확인 참여 (학생 S1) ───── */
  perform set_config('request.jwt.claims', json_build_object('sub', S1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', S1::text, true);
  execute 'set local role authenticated';
  begin perform public.join_live_session_verified(v_code, '', ''); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6D 빈 입력 거부 (22023) → %s', case when v_state = '22023' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> '22023')::int;
  begin perform public.join_live_session_verified(v_code, '다른사람', '2024000001'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6D 이름 불일치 거부 (22023) → %s', case when v_state = '22023' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> '22023')::int;
  begin perform public.join_live_session_verified('ZZZZZZ', '김하나', '2024000001'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6D 없는 코드 (P0002) → %s', case when v_state = 'P0002' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'P0002')::int;
  -- 전각 공백·줄바꿈 없는 공백이 섞여도 같은 사람
  begin perform public.join_live_session_verified(lower(v_code), '김' || chr(12288) || '하나', '2024' || chr(160) || '000001'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6D 특수 공백 섞인 실명·학번 참여 → %s', case when v_state = 'ok' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'ok')::int;
  begin perform public._live_identity_matches('김하나', '2024000001'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 내부 함수 직접 호출 거부 (42501) → %s', case when v_state = '42501' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> '42501')::int;
  -- 우회 경로: 기존 참여 함수 직접 호출 (6-D2 전: 허용 / 후: 거부)
  begin perform public.join_live_session(v_code); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 기존 join_live_session 직접 호출 (%s 기대) → %s',
    case when (v_legacy_open and v_state = 'ok') or (not v_legacy_open and v_state = '42501') then 'PASS' else 'FAIL' end,
    case when v_legacy_open then '6-D2 전: 허용' else '6-D2 후: 거부 42501' end, v_state);
  v_fail := v_fail + (not ((v_legacy_open and v_state = 'ok') or (not v_legacy_open and v_state = '42501')))::int;
  -- 응답 1회 + 중복 응답 거부 (기존 6-B 규칙 유지)
  begin perform public.submit_live_answer(v_sess, 0, 0); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6B 응답 제출 → %s', case when v_state = 'ok' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'ok')::int;
  begin perform public.submit_live_answer(v_sess, 0, 1); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6B 중복 응답 거부 → %s', case when v_state <> 'ok' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state = 'ok')::int;
  -- 결과는 학생이 볼 수 없다
  begin perform public.live_session_results(v_sess); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6C 학생 결과 조회 거부 (P0002) → %s', case when v_state = 'P0002' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'P0002')::int;
  execute 'reset role';

  /* 학생 S2 (같은 학번, 자기 실명) · S3 (다른 분반 — 참여 불가) */
  perform set_config('request.jwt.claims', json_build_object('sub', S2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', S2::text, true);
  execute 'set local role authenticated';
  begin perform public.join_live_session_verified(v_code, '이둘', '2024000001'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6D 두 번째 학생 참여 → %s', case when v_state = 'ok' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'ok')::int;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', S3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', S3::text, true);
  execute 'set local role authenticated';
  begin perform public.join_live_session_verified(v_code, '박셋', '2024000003'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6D 다른 분반 학생 거부 (P0002) → %s', case when v_state = 'P0002' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'P0002')::int;
  execute 'reset role';

  /* ───── 2) 6-C 결과 조회 (교수자) ───── */
  perform set_config('request.jwt.claims', json_build_object('sub', T, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', T::text, true);
  execute 'set local role authenticated';
  begin perform public.join_live_session_verified(v_code, 'x', '1'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6D 교수자 학생 참여 거부 (P0002) → %s', case when v_state = 'P0002' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'P0002')::int;
  begin perform public.live_session_results(v_sess); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6C 종료 전 결과 거부 (22023) → %s', case when v_state = '22023' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> '22023')::int;
  execute 'reset role';
  update public.live_quiz_sessions set status = 'ended', ended_at = now() where id = v_sess;
  execute 'set local role authenticated';
  begin v_json := public.live_session_results(v_sess); v_state := 'ok'; exception when others then v_state := sqlstate; v_json := null; end;
  v_report := v_report || format(E'\n%s 6C 담당 교수자 결과 조회 → %s', case when v_state = 'ok' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'ok')::int;
  if v_json is not null then
    v_report := v_report || format(E'\n%s 6C 참여 2명·1번 정답 1·보기 분포 [1,0] → %s · %s · %s',
      case when (v_json->>'participants')::int = 2 and (v_json->'questions'->0->>'correct')::int = 1 and v_json->'questions'->0->'counts' = '[1,0]'::jsonb then 'PASS' else 'FAIL' end,
      v_json->>'participants', v_json->'questions'->0->>'correct', v_json->'questions'->0->'counts');
    v_fail := v_fail + (not ((v_json->>'participants')::int = 2 and (v_json->'questions'->0->>'correct')::int = 1 and v_json->'questions'->0->'counts' = '[1,0]'::jsonb))::int;
    v_report := v_report || format(E'\n%s 6C 중복 학번 표시 (공백 다른 같은 학번) → %s',
      case when v_json->'duplicateStudentIds' = '["2024000001"]'::jsonb then 'PASS' else 'FAIL' end, v_json->'duplicateStudentIds');
    v_fail := v_fail + (v_json->'duplicateStudentIds' <> '["2024000001"]'::jsonb)::int;
    v_report := v_report || format(E'\n%s 6C 결과에 사용자 id·이메일 없음',
      case when position(S1::text in v_json::text) = 0 and position('@example.test' in v_json::text) = 0 then 'PASS' else 'FAIL' end);
    v_fail := v_fail + (position(S1::text in v_json::text) > 0 or position('@example.test' in v_json::text) > 0)::int;
  end if;
  begin v_json := public.my_live_session_history('zz-verify-6cd'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6C 지난 세션 목록 (담당) → %s', case when v_state = 'ok' and jsonb_array_length(v_json) = 1 then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (not (v_state = 'ok' and jsonb_array_length(v_json) = 1))::int;
  execute 'reset role';

  /* 다른 분반 교수자 O */
  perform set_config('request.jwt.claims', json_build_object('sub', O, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', O::text, true);
  execute 'set local role authenticated';
  begin perform public.live_session_results(v_sess); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6C 다른 분반 교수자 거부 (P0002) → %s', case when v_state = 'P0002' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> 'P0002')::int;
  begin v_json := public.my_live_session_history('zz-verify-6cd'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s 6C 다른 분반 교수자 목록 비어 있음 → %s', case when v_state = 'ok' and jsonb_array_length(v_json) = 0 then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (not (v_state = 'ok' and jsonb_array_length(v_json) = 0))::int;
  execute 'reset role';

  /* 비로그인 (anon) */
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin perform public.live_session_results(v_sess); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s anon 결과 조회 거부 (42501) → %s', case when v_state = '42501' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> '42501')::int;
  begin perform public.join_live_session_verified(v_code, '김하나', '2024000001'); v_state := 'ok'; exception when others then v_state := sqlstate; end;
  v_report := v_report || format(E'\n%s anon 참여 거부 (42501) → %s', case when v_state = '42501' then 'PASS' else 'FAIL' end, v_state);
  v_fail := v_fail + (v_state <> '42501')::int;
  execute 'reset role';

  /* 입력한 실명·학번은 어디에도 저장되지 않는다 (참여 행은 세션·사용자·시각뿐) */
  v_report := v_report || format(E'\n%s 참여 행 열 = session_id,user_id,joined_at',
    case when (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
                where table_schema = 'public' and table_name = 'live_quiz_participants') = 'session_id,user_id,joined_at' then 'PASS' else 'FAIL' end);

  -- 보고 + 트랜잭션 취소 (이 오류 때문에 위의 모든 변경이 사라진다)
  raise exception 'VERIFY_6CD_REPORT: FAIL %건 (6-D2 %s)%', v_fail, case when v_legacy_open then '적용 전' else '적용 후' end, v_report;
end;
$verify$;

rollback;

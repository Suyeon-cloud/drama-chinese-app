-- Phase 6-B 적용 후 점검 (읽기 전용). 블록마다 따로 실행한다.

-- [1] 데이터 개수와 지문 (9개 테이블): …_pre.sql [1]과 모든 행이 같아야 한다. (6-B는 기존 행을 바꾸지 않는다)
select 'courses' as t, count(*) as n, md5(coalesce(string_agg(id || ':' || status || ':' || week_count || ':' || updated_at, ',' order by id), '')) as fp from public.courses
union all
select 'sections', count(*), md5(coalesce(string_agg(id || ':' || course_id || ':' || status || ':' || code, ',' order by id), '')) from public.sections
union all
select 'section_instructors', count(*), md5(coalesce(string_agg(section_id || ':' || instructor_email, ',' order by section_id, instructor_email), '')) from public.section_instructors
union all
select 'enrollments', count(*), md5(coalesce(string_agg(id::text || ':' || section_id || ':' || course_id, ',' order by id), '')) from public.enrollments
union all
select 'lessons', count(*), md5(coalesce(string_agg(id || ':' || course_id || ':' || week || ':' || status || ':' || version || ':' || updated_at, ',' order by id), '')) from public.lessons
union all
select 'lesson_dialogues', count(*), md5(coalesce(string_agg(id || ':' || lesson_id || ':' || position, ',' order by id), '')) from public.lesson_dialogues
union all
select 'lesson_progress', count(*), md5(coalesce(string_agg(user_id::text || ':' || lesson_id || ':' || updated_at, ',' order by user_id, lesson_id), '')) from public.lesson_progress
union all
select 'feedback_drafts', count(*), md5(coalesce(string_agg(id || ':' || updated_at, ',' order by id), '')) from public.feedback_drafts
union all
select 'week_materials', count(*), md5(coalesce(string_agg(id || ':' || course_id || ':' || week || ':' || status || ':' || position || ':' || version || ':' || updated_at, ',' order by id), '')) from public.week_materials
order by t;

-- [2] 6-A 문제 세트 지문: …_pre.sql [2]와 같아야 한다 (6-B는 세트·문제를 바꾸지 않는다)
select 'live_quiz_sets' as t, count(*) as n, md5(coalesce(string_agg(id || ':' || course_id || ':' || status || ':' || version || ':' || updated_at, ',' order by id), '')) as fp from public.live_quiz_sets
union all
select 'live_quiz_questions', count(*), md5(coalesce(string_agg(id || ':' || set_id || ':' || position || ':' || norm_key, ',' order by id), '')) from public.live_quiz_questions
order by t;

-- [3] 새 테이블: RLS 켜짐, 행 0개, 정책 0개, 테이블 권한은 service_role만, anon·authenticated 열 권한 0개 (3행)
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       (select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon', 'authenticated', 'service_role')) as table_grants,
       (select count(*) from information_schema.column_privileges cp
         where cp.table_schema = 'public' and cp.table_name = c.relname and cp.grantee in ('anon', 'authenticated')) as user_column_grants
  from pg_class c
 where c.oid in ('public.live_quiz_sessions'::regclass, 'public.live_quiz_participants'::regclass, 'public.live_quiz_responses'::regclass)
 order by c.relname;
-- 기대: 세 행 모두 true · 0 · service_role:DELETE, service_role:INSERT, service_role:SELECT, service_role:UPDATE · 0
select (select count(*) from public.live_quiz_sessions) as sessions, (select count(*) from public.live_quiz_participants) as participants,
       (select count(*) from public.live_quiz_responses) as responses;
-- 기대: 0 · 0 · 0

-- [4] 제약·인덱스: 분반당 진행 중 1개, 진행 중 코드 고유, 응답 기본 키 (session_id, question_index, user_id)
select indexname, indexdef from pg_indexes
 where schemaname = 'public' and indexname in ('live_quiz_sessions_active_section_uniq', 'live_quiz_sessions_active_code_uniq', 'live_quiz_responses_pkey')
 order by indexname;

-- [5] 함수 권한·보안 설정 (11행)
select p.proname, p.prosecdef as security_definer, array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('_live_join_code', '_live_can_host', '_live_host_json', '_live_student_json',
                          'start_live_session', 'live_session_control', 'live_session_host_state', 'my_live_host_sessions',
                          'join_live_session', 'live_session_student_state', 'submit_live_answer')
 order by p.proname;
-- 기대: anon_exec 모두 f, config 모두 search_path=""
--       start/control/host_state/my_live_host_sessions/join/student_state/submit → auth t, service f
--       _로 시작하는 4개 → auth f, service f

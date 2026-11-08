-- Phase 6-A 적용 후 점검 (읽기 전용). 블록마다 따로 실행한다.

-- [1] 데이터 개수와 지문 (9개 테이블): …_pre.sql [1]과 모든 행이 같아야 한다. (6-A는 기존 행을 바꾸지 않는다)
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

-- [2] 새 테이블: RLS 켜짐, 행 0개, 정책 0개, 테이블 권한은 service_role만, anon·authenticated 열 권한 0개 (2행)
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       (select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon', 'authenticated', 'service_role')) as table_grants,
       (select count(*) from information_schema.column_privileges cp
         where cp.table_schema = 'public' and cp.table_name = c.relname and cp.grantee in ('anon', 'authenticated')) as user_column_grants
  from pg_class c
 where c.oid in ('public.live_quiz_sets'::regclass, 'public.live_quiz_questions'::regclass)
 order by c.relname;
-- 기대: 두 행 모두 true · 0 · service_role:DELETE, service_role:INSERT, service_role:SELECT, service_role:UPDATE · 0
select (select count(*) from public.live_quiz_sets) as sets, (select count(*) from public.live_quiz_questions) as questions;
-- 기대: 0 · 0

-- [3] 제약·인덱스: 완전 중복 고유 인덱스 (course_id, norm_key), 강의자료 외래 키 ON DELETE SET NULL, 세트 삭제 시 문제 CASCADE
select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid in ('public.live_quiz_sets'::regclass, 'public.live_quiz_questions'::regclass) and contype = 'f'
union all
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'live_quiz_questions_course_norm_uniq'
order by 1, 2;

-- [4] 함수 권한·보안 설정 (10행)
select p.proname, p.prosecdef as security_definer, array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('_live_quiz_norm', '_live_quiz_sets_json', '_save_live_quiz_set', '_delete_live_quiz_set',
                     'list_live_quiz_sets', 'save_live_quiz_set', 'delete_live_quiz_set',
                     'admin_list_live_quiz_sets', 'admin_save_live_quiz_set', 'admin_delete_live_quiz_set')
 order by p.proname;
-- 기대: anon_exec 모두 f, config 모두 search_path=""
--       list/save/delete_live_quiz_set → auth t, service f / admin_* → auth f, service t / _로 시작 → auth f, service f

-- [5] 기존 학습 퀴즈·자료 테이블은 그대로: week_materials·lessons 칸 수가 pre와 같아야 한다
select table_name, count(*) as columns
  from information_schema.columns
 where table_schema = 'public' and table_name in ('lessons', 'week_materials', 'lesson_progress')
 group by table_name order by table_name;

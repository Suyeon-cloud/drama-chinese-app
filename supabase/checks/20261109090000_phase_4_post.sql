-- Phase 4 적용 후 점검 (읽기 전용). 블록마다 따로 실행한다.

-- [1] 데이터 개수와 지문 (9개 테이블): …_pre.sql [1]과 모든 행이 같아야 한다. (4단계는 기존 행을 바꾸지 않는다)
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

-- [2] 종류별 자료 수: …_pre.sql [2]와 같아야 한다 (html 0)
select kind, count(*) as n from public.week_materials group by kind order by kind;

-- [3] 칸·제약 (4행)
--   html_body: text, NULL 허용 / week_materials_html_body_size: octet_length(html_body) 1~2097152
--   week_materials_kind_check: 'link','file','html' / week_materials_kind_fields: link·file·html 세 경우 (link·file은 html_body IS NULL)
select 'column' as what, column_name || ':' || data_type || ':' || is_nullable as def
  from information_schema.columns where table_schema = 'public' and table_name = 'week_materials' and column_name = 'html_body'
union all
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.week_materials'::regclass
   and conname in ('week_materials_html_body_size', 'week_materials_kind_check', 'week_materials_kind_fields')
order by 1;

-- [4] 테이블 권한은 그대로: RLS 켜짐, 정책 0개, anon·authenticated 테이블·열 권한 0개
select c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'week_materials') as policies,
       (select count(*) from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'week_materials' and grantee in ('anon', 'authenticated')) as user_table_grants,
       (select count(*) from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'week_materials' and grantee in ('anon', 'authenticated')) as user_column_grants
  from pg_class c where c.oid = 'public.week_materials'::regclass;
-- 기대: true · 0 · 0 · 0

-- [5] 함수 권한·보안 설정 (5행)
select p.proname, p.prosecdef as security_definer, array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('save_week_material_html', 'admin_save_week_material_html', '_save_week_material_html', 'week_material_html', '_material_html_ok')
 order by p.proname;
-- 기대: anon_exec 모두 f, config 모두 search_path=""
--       save_week_material_html · week_material_html → definer t, auth t, service f
--       admin_save_week_material_html → definer t, auth f, service t
--       _save_week_material_html → definer t, auth f, service f / _material_html_ok → definer f, auth f, service f

-- [6] 목록 RPC는 본문을 보내지 않는다: html_body 열 없음 (결과 false)
select pg_get_function_result('public.list_week_materials(text)'::regprocedure) like '%html_body%' as list_returns_html;

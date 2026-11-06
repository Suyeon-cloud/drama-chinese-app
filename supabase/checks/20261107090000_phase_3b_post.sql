-- Phase 3-B 적용 후 점검 (읽기 전용). SQL Editor에서 블록마다 따로 실행한다.

-- [1] 데이터 개수와 지문: 적용 전(…_pre.sql [1])과 모든 행이 같아야 한다.
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
order by t;

-- [2] 테이블: 존재, RLS 켜짐, 행 0개
select c.relname, c.relrowsecurity as rls_enabled, (select count(*) from public.week_materials) as row_count
  from pg_class c
 where c.oid = 'public.week_materials'::regclass;

-- [3] 테이블·열 권한: anon·authenticated는 테이블·열 모두 없음 · service_role만 SELECT/INSERT/UPDATE/DELETE
select 'table' as level, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'week_materials' and grantee in ('anon', 'authenticated', 'service_role')
 group by grantee
union all
select 'column', grantee, string_agg(column_name || ':' || privilege_type, ', ' order by column_name)
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'week_materials' and grantee in ('anon', 'authenticated')
 group by grantee
 order by 1, 2;
-- 기대: table / service_role / DELETE, INSERT, SELECT, UPDATE — 한 행만 (anon·authenticated 행 없음)

-- [4] RLS 정책: 없어야 한다 (0행). anon·authenticated는 테이블을 직접 읽지 못하고 list_week_materials RPC로만 본다.
select policyname, cmd, roles, qual from pg_policies where schemaname = 'public' and tablename = 'week_materials';

-- [5] 함수 권한·보안 설정
select p.proname,
       p.prosecdef as security_definer,
       array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('list_week_materials', '_can_see_all_week_materials', '_is_week_material_learner', 'save_week_material', 'delete_week_material',
                     'reorder_week_materials', 'admin_save_week_material', 'admin_delete_week_material', 'admin_reorder_week_materials',
                     '_save_week_material', '_delete_week_material', '_reorder_week_materials', '_renumber_week_materials',
                     '_material_text', '_material_url', '_material_actor_label', 'admin_update_course', 'can_read_week_material')
 order by p.proname;
-- 기대: anon_exec는 모두 f, can_read_week_material 행은 없어야 한다 (이전 초안 함수 — 마이그레이션이 지운다)
--       list_week_materials · save_/delete_/reorder_week_material(s) → auth t, service f
--       admin_* (admin_update_course 포함) → auth f, service t
--       _로 시작하는 내부 함수 → auth f, service f
--       _material_text·_material_url 외에는 security_definer = t, 모두 config에 search_path=""

-- [6] admin_update_course가 보충 자료 주차를 반영하는지 (true), 지문은 적용 전([4])과 달라야 한다.
select md5(pg_get_functiondef(p.oid)) as def_md5,
       position('public.week_materials m where m.course_id = c.id' in pg_get_functiondef(p.oid)) > 0 as has_week_materials
  from pg_proc p
 where p.oid = 'public.admin_update_course(text,text,text,text,text,integer,text)'::regprocedure;

-- [7] Storage는 바뀌지 않아야 한다. (버킷은 3-C에서 만든다: bucket_rows = 0)
select count(*) as bucket_rows from storage.buckets where id = 'week-materials';

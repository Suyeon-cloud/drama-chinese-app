-- Phase 3-C 적용 후 점검 (읽기 전용). 블록마다 따로 실행한다.

-- [1] 데이터 개수와 지문: 적용 전(…_pre.sql [1])과 9행 모두 같아야 한다. (pre [1]과 같은 쿼리)
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

-- [2] 버킷: public = false, file_size_limit = 20971520, mime_count = 13, objects = 0, bucket_policies = 0
select b.id, b.public, b.file_size_limit, cardinality(b.allowed_mime_types) as mime_count,
       (select count(*) from storage.objects o where o.bucket_id = b.id) as objects,
       (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and (coalesce(qual, '') like '%week-materials%' or coalesce(with_check, '') like '%week-materials%')) as bucket_policies
  from storage.buckets b where b.id = 'week-materials';

-- [3] 업로드 기록 테이블: RLS 켜짐, 행 0개, 정책 0개, 권한은 service_role만 (테이블·열)
select c.relrowsecurity as rls_enabled,
       (select count(*) from public.week_material_uploads) as row_count,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'week_material_uploads') as policies,
       (select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
          from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'week_material_uploads' and grantee in ('anon', 'authenticated', 'service_role')) as table_grants,
       (select count(*) from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'week_material_uploads' and grantee in ('anon', 'authenticated')) as user_column_grants
  from pg_class c where c.oid = 'public.week_material_uploads'::regclass;
-- 기대: true · 0 · 0 · service_role:DELETE, service_role:INSERT, service_role:SELECT, service_role:UPDATE · 0

-- [4] 함수 권한·보안 설정 (4행)
select p.proname, p.prosecdef as security_definer, array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('admin_insert_week_material_file', 'admin_replace_week_material_file', 'week_material_download', '_material_file_path_ok')
 order by p.proname;
-- 기대: anon_exec 모두 f, config 모두 search_path=""
--       admin_insert/replace_week_material_file → definer t, auth f, service t
--       week_material_download → definer t, auth t, service f
--       _material_file_path_ok → definer f, auth f, service f

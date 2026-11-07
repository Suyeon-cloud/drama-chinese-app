-- Phase 3-C 적용 전 점검 (읽기 전용). 블록마다 따로 실행하고 결과를 저장한다.

-- [1] 데이터 개수와 지문 (9개 테이블): 적용 후 …_post.sql [1]과 모든 행이 같아야 한다.
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

-- [2] 새 객체가 아직 없어야 한다: uploads_table = NULL, bucket_rows = 0, new_functions = 0, bucket_policies = 0, file_rows = 0
select to_regclass('public.week_material_uploads')::text as uploads_table,
       (select count(*) from storage.buckets where id = 'week-materials') as bucket_rows,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('admin_insert_week_material_file', 'admin_replace_week_material_file', 'week_material_download', '_material_file_path_ok')) as new_functions,
       (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and (coalesce(qual, '') like '%week-materials%' or coalesce(with_check, '') like '%week-materials%')) as bucket_policies,
       (select count(*) from public.week_materials where kind = 'file') as file_rows;

-- [3] 의존 객체 (모두 true)
select to_regclass('public.week_materials') is not null as week_materials,
       to_regprocedure('public._can_see_all_week_materials(text)') is not null as can_see_all,
       to_regprocedure('public._is_week_material_learner(text)') is not null as is_learner,
       to_regprocedure('public._material_text(jsonb,text,integer,boolean)') is not null as material_text,
       to_regprocedure('public.lesson_course_lock_key(text)') is not null as lock_key;

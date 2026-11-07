-- Phase 4 적용 전 점검 (읽기 전용). 블록마다 따로 실행하고 결과를 저장한다.

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

-- [2] 종류별 자료 수 (적용 후 …_post.sql [2]와 같아야 한다 — html은 0)
select kind, count(*) as n from public.week_materials group by kind order by kind;

-- [3] 새 객체가 아직 없어야 한다: html_body_column = 0, new_functions = 0, policies = 0
select (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'week_materials' and column_name = 'html_body') as html_body_column,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('save_week_material_html', 'admin_save_week_material_html', '_save_week_material_html', 'week_material_html', '_material_html_ok')) as new_functions,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'week_materials') as policies;

-- [4] 바꿀 제약 (2행): week_materials_kind_check = kind IN ('link','file'), week_materials_kind_fields = link·file 두 경우
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.week_materials'::regclass and conname in ('week_materials_kind_check', 'week_materials_kind_fields')
 order by conname;

-- [5] 의존 객체 (모두 true)
select to_regprocedure('public._save_week_material(text,text,jsonb,uuid,text,boolean)') is not null as save_fn,
       to_regprocedure('public._can_see_all_week_materials(text)') is not null as can_see_all,
       to_regprocedure('public._is_week_material_learner(text)') is not null as is_learner,
       to_regprocedure('public._material_text(jsonb,text,integer,boolean)') is not null as material_text,
       to_regprocedure('public._material_actor_label()') is not null as actor_label,
       to_regprocedure('public.can_manage_course(text)') is not null as can_manage,
       to_regprocedure('public.lesson_course_lock_key(text)') is not null as lock_key,
       to_regprocedure('public.week_material_download(text)') is not null as phase_3c;

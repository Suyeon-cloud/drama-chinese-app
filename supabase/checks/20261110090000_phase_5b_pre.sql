-- Phase 5-B 적용 전 점검 (읽기 전용). 블록마다 따로 실행하고 결과를 저장한다.

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

-- [2] 종류별 자료 수 (적용 후 …_post.sql [2]와 같아야 한다)
select kind, count(*) as n from public.week_materials group by kind order by kind;

-- [3] 새 객체가 아직 없어야 한다: source_columns = 0, sources_function = 0, review_index = 0
select (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'week_materials'
            and column_name in ('source_kind', 'source_lesson_id', 'source_lesson_updated_at')) as source_columns,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'list_week_material_sources') as sources_function,
       (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'week_materials_review_source_uniq') as review_index;

-- [4] (참고) 5-A로 등록한 '[복습]' 제목의 HTML 자료 — 5-B는 이 자료들을 자동으로 연결·삭제하지 않는다
select course_id, week, count(*) as review_like_html
  from public.week_materials
 where kind = 'html' and title like '[복습]%'
 group by course_id, week
 order by course_id, week;

-- [5] 의존 객체·형식 (모두 true)
select to_regprocedure('public._save_week_material_html(text,text,jsonb,text,uuid,text,boolean)') is not null as html_save_fn,
       to_regprocedure('public._save_week_material(text,text,jsonb,uuid,text,boolean)') is not null as save_fn,
       to_regprocedure('public._can_see_all_week_materials(text)') is not null as can_see_all,
       (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'lessons' and column_name = 'updated_at')
         = 'timestamp with time zone' as lessons_updated_at,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'week_materials') = 0 as no_policies;

-- Phase 6-A 적용 전 점검 (읽기 전용). 블록마다 따로 실행하고 결과를 저장한다.

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

-- [2] 새 객체가 아직 없어야 한다: sets_table = NULL, questions_table = NULL, new_functions = 0
select to_regclass('public.live_quiz_sets')::text as sets_table,
       to_regclass('public.live_quiz_questions')::text as questions_table,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('_live_quiz_norm', '_live_quiz_sets_json', '_save_live_quiz_set', '_delete_live_quiz_set',
                          'list_live_quiz_sets', 'save_live_quiz_set', 'delete_live_quiz_set',
                          'admin_list_live_quiz_sets', 'admin_save_live_quiz_set', 'admin_delete_live_quiz_set')) as new_functions;

-- [3] 의존 객체·기능 (모두 true): normalize(NFKC)는 UTF8 DB에서 동작해야 한다
select to_regprocedure('public.can_manage_course(text)') is not null as can_manage,
       to_regprocedure('public._can_see_all_week_materials(text)') is not null as can_see_all,
       to_regprocedure('public._material_actor_label()') is not null as actor_label,
       to_regprocedure('public.lesson_course_lock_key(text)') is not null as lock_key,
       to_regprocedure('public.set_updated_at()') is not null as set_updated_at,
       pg_encoding_to_char(encoding) = 'UTF8' as utf8_db,
       normalize('ＡＢＣ', NFKC) = 'ABC' as nfkc_ok
  from pg_database where datname = current_database();

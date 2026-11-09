-- Phase 6-B 적용 전 점검 (읽기 전용). 블록마다 따로 실행하고 결과를 저장한다.

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

-- [2] 6-A 문제 세트 지문: 적용 후 …_post.sql [2]와 같아야 한다 (6-B는 세트·문제를 바꾸지 않는다)
select 'live_quiz_sets' as t, count(*) as n, md5(coalesce(string_agg(id || ':' || course_id || ':' || status || ':' || version || ':' || updated_at, ',' order by id), '')) as fp from public.live_quiz_sets
union all
select 'live_quiz_questions', count(*), md5(coalesce(string_agg(id || ':' || set_id || ':' || position || ':' || norm_key, ',' order by id), '')) from public.live_quiz_questions
order by t;

-- [3] 새 객체가 아직 없어야 한다: sessions = NULL, participants = NULL, responses = NULL, new_functions = 0
select to_regclass('public.live_quiz_sessions')::text as sessions,
       to_regclass('public.live_quiz_participants')::text as participants,
       to_regclass('public.live_quiz_responses')::text as responses,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('_live_join_code', '_live_can_host', '_live_host_json', '_live_student_json',
                          'start_live_session', 'live_session_control', 'live_session_host_state', 'my_live_host_sessions',
                          'join_live_session', 'live_session_student_state', 'submit_live_answer')) as new_functions;

-- [4] 의존 객체 (모두 true)
select to_regclass('public.live_quiz_sets') is not null as live_quiz_sets,
       to_regprocedure('public.my_instructor_section_ids(boolean)') is not null as instructor_sections,
       to_regprocedure('public.my_enrolled_section_ids()') is not null as enrolled_sections,
       to_regprocedure('public.can_manage_course(text)') is not null as can_manage,
       to_regprocedure('public._material_actor_label()') is not null as actor_label,
       to_regprocedure('public.lesson_course_lock_key(text)') is not null as lock_key;

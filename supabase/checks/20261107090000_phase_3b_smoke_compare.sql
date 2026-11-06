-- Phase 3-B 스모크 실행 전후 비교 (읽기 전용 — 데이터를 바꾸지 않는다)
--
-- ▶ 사용법: 롤백 스모크(…_phase_3b_rollback_smoke.sql) 바로 전에 한 번, 바로 뒤에 한 번 이 쿼리를 실행해 결과를 저장하고 비교한다.
--   두 결과의 9행이 모두 같으면(n·fp) 스모크가 남긴 변경이 없다는 뜻이다.
--   week_materials에 이미 정상 자료가 있어도 쓸 수 있다. (0개라고 가정하지 않고 전후 값이 같은지만 본다)
-- ▶ 주의: 스모크 전후 사이에 실제 사용자가 학습하거나 자료를 저장하면 그 테이블 값이 달라질 수 있다. 사용자가 적은 시간에 연달아 실행한다.
-- ▶ 개인정보 칸은 읽지 않는다. 지문(md5)은 id·상태·주차·순서·버전·수정 시각만으로 만든다.

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

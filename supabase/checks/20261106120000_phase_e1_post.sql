-- Phase E1 적용 후 점검. [1]~[6]은 읽기 전용. [7]은 선택 — 끝에서 rollback하므로 아무것도 남지 않는다.

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

-- [2] status 제약: courses_status_check 하나, ('active', 'inactive', 'legacy')
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.courses'::regclass and contype = 'c'
 order by conname;

-- [3] 함수 권한·보안 설정: admin_* · _course_text는 anon·authenticated 실행 불가 / helper·save_my_progress는 authenticated만
select p.proname,
       p.prosecdef as security_definer,
       array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('admin_create_course', 'admin_update_course', '_course_text',
                     'my_instructor_section_ids', 'my_enrolled_section_ids', 'save_my_progress', '_save_lesson', 'enrollments_guard')
 order by p.proname;
-- 기대: admin_create_course·admin_update_course → anon f, auth f, service t
--       _course_text → anon f, auth f
--       my_*_section_ids·save_my_progress → anon f, auth t
--       _save_lesson·enrollments_guard → anon f, auth f
--       security definer 함수의 config에 search_path="" (또는 search_path=)

-- [4] 바뀐 함수 지문: 적용 전([5])과 달라야 한다.
select p.proname, md5(pg_get_functiondef(p.oid)) as def_md5
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('my_instructor_section_ids', 'my_enrolled_section_ids', 'save_my_progress', '_save_lesson', 'enrollments_guard')
 order by p.proname;

-- [5] courses 읽기 정책: status in ('active','inactive') … my_course_ids()
select policyname, qual from pg_policies where schemaname = 'public' and tablename = 'courses';

-- [6] 신규 차단 함수는 그대로 active만 (정의에 status = 'active'가 남아 있어야 한다)
select proname,
       position('status = ''active''' in pg_get_functiondef(oid)) > 0 as still_active_only
  from pg_proc
 where pronamespace = 'public'::regnamespace and proname in ('enroll_with_code', 'admin_create_section');

-- [7] (선택) RPC 동작 확인 — 한 트랜잭션 안에서 실행하고 rollback한다. 이 블록만 따로 선택해 실행할 것.
-- begin;
--   select id, status, week_count, legacy_code from public.admin_create_course('적용 확인용 과목', '', '', '', 8);
--   -- 위 결과의 id로: 상태 변경·주차 수정이 되는지
--   -- select id, status, week_count from public.admin_update_course('<위 id>', null, null, null, null, 10, 'inactive');
--   -- 기존 자료 과목은 거부(42501)되는지 — 오류가 나면 정상이고, 트랜잭션은 rollback으로 끝낸다
--   -- select public.admin_update_course('course-legacy', '바꾸기');
-- rollback;

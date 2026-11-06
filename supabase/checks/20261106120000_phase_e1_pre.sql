-- Phase E1 적용 전 점검 (읽기 전용 — 데이터를 바꾸지 않는다)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 실행. 결과를 그대로 저장해 두고 적용 후 점검(…_post.sql)과 비교한다.
-- 개인정보 칸은 읽지 않는다. 지문(md5)은 id·version·수정 시각만으로 만든다.

-- [1] 데이터 개수와 지문: 적용 후 값과 같아야 한다.
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

-- [2] 과목 상태: inactive가 없어야 한다. (active 3 · legacy 1 예상)
select status, count(*) from public.courses group by status order by status;

-- [3] courses의 check 제약: status 제약이 하나이고 ('active', 'legacy')여야 한다.
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.courses'::regclass and contype = 'c'
 order by conname;

-- [4] 새 RPC가 아직 없어야 한다. (0행)
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('admin_create_course', 'admin_update_course', '_course_text');

-- [5] 바뀔 함수의 현재 정의 지문 (적용 후 달라져야 정상) + 실행 권한
select p.proname,
       md5(pg_get_functiondef(p.oid)) as def_md5,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('my_instructor_section_ids', 'my_enrolled_section_ids', 'save_my_progress', '_save_lesson', 'enrollments_guard')
 order by p.proname;

-- [6] courses 읽기 정책 (적용 후 status in ('active','inactive')로 바뀐다)
select policyname, qual from pg_policies where schemaname = 'public' and tablename = 'courses';

-- [7] 마이그레이션 기록 (CLI로 적용한 마지막 버전 확인용, 없으면 오류가 나도 무시)
select version, name from supabase_migrations.schema_migrations order by version desc limit 3;

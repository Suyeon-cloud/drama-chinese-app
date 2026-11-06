-- Phase 3-B 적용 전 점검 (읽기 전용 — 데이터를 바꾸지 않는다)
-- SQL Editor에서 [1]~[6]을 블록마다 따로 실행하고 결과를 저장해 둔다. (적용 후 …_post.sql과 비교)
-- 개인정보 칸은 읽지 않는다. 지문(md5)은 id·상태·주차·버전·수정 시각만으로 만든다.

-- 실행 순서: [1]~[6] (모두 읽기 전용). [2]·[3]·[6]이 기대와 다르면 마이그레이션을 실행하지 말고 결과를 확인한다.

-- [1] 데이터 개수와 지문: 적용 후 값과 모든 행이 같아야 한다. (E1 점검 [1]과 같은 쿼리)
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

-- [2] 새 테이블·버킷이 아직 없어야 한다. (week_materials_table = null, bucket_rows = 0)
select to_regclass('public.week_materials')::text as week_materials_table,
       (select count(*) from storage.buckets where id = 'week-materials') as bucket_rows;

-- [3] 새 함수(또는 같은 이름의 다른 함수)가 아직 없어야 한다. (0행) — 있으면 [6]을 보고 마이그레이션의 사전 확인이 통과할지 판단한다
select p.oid::regprocedure::text as signature, p.prosecdef as security_definer
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('list_week_materials', '_can_see_all_week_materials', '_is_week_material_learner', 'save_week_material', 'delete_week_material', 'reorder_week_materials',
                   'admin_save_week_material', 'admin_delete_week_material', 'admin_reorder_week_materials',
                   '_save_week_material', '_delete_week_material', '_reorder_week_materials', '_renumber_week_materials',
                   '_material_text', '_material_url', '_material_actor_label', 'can_read_week_material');

-- [4] admin_update_course: 현재(E1) 정의 지문과 권한. 적용 후 지문이 달라지고 정의에 week_materials가 들어가야 한다.
select md5(pg_get_functiondef(p.oid)) as def_md5,
       position('week_materials' in pg_get_functiondef(p.oid)) > 0 as has_week_materials,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
  from pg_proc p
 where p.oid = 'public.admin_update_course(text,text,text,text,text,integer,text)'::regprocedure;

-- [5] 마이그레이션에 쓰는 기존 함수가 있는지 (모두 true여야 한다)
select to_regprocedure('public.set_updated_at()') is not null as set_updated_at,
       to_regprocedure('public.can_manage_course(text)') is not null as can_manage_course,
       to_regprocedure('public.my_instructor_section_ids(boolean)') is not null as my_instructor_section_ids,
       to_regprocedure('public.my_enrolled_section_ids()') is not null as my_enrolled_section_ids,
       to_regprocedure('public.lesson_course_lock_key(text)') is not null as lesson_course_lock_key,
       to_regprocedure('public._course_text(text,text,integer,boolean)') is not null as course_text;

-- [6] 이름 충돌·권한 점검: 이미 week_materials가 있을 때(재적용) 구조·정책·권한이 마이그레이션의 기대와 같은지 본다. 테이블이 없으면 모두 0행.
--     마이그레이션 [0] 사전 확인도 열·제약·trigger·정책·함수 시그니처를 다시 검사하고, 다르면 아무것도 바꾸지 않고 멈춘다.
-- [6-1] 열 (기대 18개: id … updated_at)
select ordinal_position, column_name, data_type, is_nullable
  from information_schema.columns where table_schema = 'public' and table_name = 'week_materials'
 order by ordinal_position;
-- [6-2] 제약 (기대 17개: week_materials_pkey, _course_id_fkey, _updated_by_fkey, 열별 _check, week_materials_kind_fields)
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint where conrelid = to_regclass('public.week_materials')
 order by conname collate "C";
-- [6-3] trigger (기대: week_materials_set_updated_at 하나) · 정책 (기대: 없음 — 이전 초안의 week_materials_select_readable은 마이그레이션이 지운다)
select 'trigger' as kind, tgname as name from pg_trigger where tgrelid = to_regclass('public.week_materials') and not tgisinternal
union all
select 'policy', policyname from pg_policies where schemaname = 'public' and tablename = 'week_materials';
-- [6-4] 테이블·열 권한 (적용 후 기대: service_role의 SELECT/INSERT/UPDATE/DELETE만, anon·authenticated는 테이블·열 모두 없음)
select 'table' as level, grantee, privilege_type, null as column_name
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'week_materials'
union all
select 'column', grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'week_materials' and grantee in ('anon', 'authenticated')
 order by 1, 2, 3, 4;

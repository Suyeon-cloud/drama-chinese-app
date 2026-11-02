-- Phase D3: 과목 주차 목록(커리큘럼) 조회 함수
--
-- 학생은 RLS로 published 학습자료만 읽을 수 있다. 그런데 기존 화면은 15주 목록에서 준비 중인 주차도
-- ‘준비 중’으로 보여 준다. (주차·제목·상태만, 학습 콘텐츠 없음) 그 목록만 이 함수로 받는다.
-- - 학생: 승인 + 그 과목(운영 과목)의 수강 기록 (분반이 비활성이 되어도 기존 수강은 유지)
-- - 교수자: 그 과목의 분반을 담당 (비활성 분반 포함 — 수강생 학습 기록을 계속 보기 위해, 운영 과목만)
-- - 이전 자료 과목·그 밖의 과목은 빈 결과. youtube_id는 published 주차만 준다.
-- - 학습 기록이 어느 과목의 것인지(lesson → course) 찾을 때도 이 함수를 쓴다.

create or replace function public.course_curriculum(p_course_id text)
returns table (lesson_id text, week integer, title text, status text, youtube_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.week, l.title, l.status,
         case when l.status = 'published' then nullif(l.youtube_id, '') end
    from public.lessons l
   where l.course_id = p_course_id
     and (
       p_course_id in (
         select s.course_id from public.sections s where s.id in (select public.my_instructor_section_ids(false))
       )
       or p_course_id in (
         select s.course_id from public.sections s where s.id in (select public.my_enrolled_section_ids())
       )
     )
   order by l.week, l.created_at;
$$;

revoke all on function public.course_curriculum(text) from public, anon;
grant execute on function public.course_curriculum(text) to authenticated;

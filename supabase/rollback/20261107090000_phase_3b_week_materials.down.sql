-- Phase 3-B 되돌리기 (20261107090000_phase_3b_week_materials.sql)
--
-- ▶ 자료 보호: week_materials가 있으면 먼저 잠근 뒤(다른 세션의 새 자료 저장을 막고) 행이 하나라도 있으면 전체를 취소한다.
--   자료를 지우는 문장(delete)은 없다. 자료를 정리할지는 사람이 정한다 — 필요하면 화면에서 먼저 삭제한다.
-- ▶ 하는 일: 3-B RPC·trigger·week_materials 테이블 제거, admin_update_course를 E1 정의로 되돌림 (원문 그대로)
-- ▶ 하지 않는 일: 기존 테이블(lessons·lesson_progress·courses 등) 변경 없음, Storage 변경 없음 (3-B는 버킷을 만들지 않음)
-- ▶ 재실행: 테이블·함수가 이미 없어도 된다. (존재 확인 후에만 잠금·행 검사·정책/trigger 제거, 나머지는 if exists)
-- ▶ 파일 전체가 begin … commit 한 트랜잭션이다. 중간에 멈추면 아무것도 바뀌지 않는다.

begin;

do $$
declare
  v_has_rows boolean;
begin
  -- E1 함수 복원에 필요한 기존 함수 (D1·E1)
  if to_regprocedure('public._course_text(text,text,integer,boolean)') is null
     or to_regprocedure('public.lesson_course_lock_key(text)') is null then
    raise exception '3B_ROLLBACK: admin_update_course를 E1 정의로 되돌리는 데 필요한 함수(_course_text·lesson_course_lock_key)가 없어요.';
  end if;
  if to_regclass('public.week_materials') is not null then
    -- 확인과 삭제 사이에 다른 세션이 자료를 넣지 못하게, 이 트랜잭션이 끝날 때까지 잠근다.
    -- (테이블이 없을 때 해석 오류가 나지 않도록 execute로 실행한다)
    execute 'lock table public.week_materials in access exclusive mode';
    execute 'select exists (select 1 from public.week_materials)' into v_has_rows;
    if v_has_rows then
      raise exception '3B_ROLLBACK: 보충 자료가 남아 있어 되돌리지 않았어요. (먼저 자료를 정리하세요)';
    end if;
  end if;
end;
$$;

drop function if exists public.admin_reorder_week_materials(text, integer, text[]);
drop function if exists public.admin_delete_week_material(text);
drop function if exists public.admin_save_week_material(text, text, jsonb, text);
drop function if exists public.reorder_week_materials(text, integer, text[]);
drop function if exists public.delete_week_material(text);
drop function if exists public.save_week_material(text, text, jsonb);
drop function if exists public._material_actor_label();
drop function if exists public._reorder_week_materials(text, integer, text[], boolean);
drop function if exists public._delete_week_material(text, boolean);
drop function if exists public._save_week_material(text, text, jsonb, uuid, text, boolean);
drop function if exists public._renumber_week_materials(text, integer);
drop function if exists public._material_url(jsonb);
drop function if exists public._material_text(jsonb, text, integer, boolean);
drop function if exists public.list_week_materials(text);

do $$
begin
  if to_regclass('public.week_materials') is not null then
    execute 'drop policy if exists week_materials_select_readable on public.week_materials';
    execute 'drop trigger if exists week_materials_set_updated_at on public.week_materials';
  end if;
end;
$$;
drop table if exists public.week_materials;
drop function if exists public._is_week_material_learner(text);
drop function if exists public._can_see_all_week_materials(text);
-- 이전 초안의 읽기 함수 (있으면)
drop function if exists public.can_read_week_material(text, text);

/* admin_update_course: E1 정의 (20261106120000_phase_e1_course_management.sql 원문) */

/*
 * 과목 수정: null이 아닌 칸만 바꾼다. id는 바꿀 수 없고, 기존 자료(legacy) 과목은 바꾸지 않는다.
 * 상태는 active ↔ inactive만. 주차 수는 그 과목 학습자료(준비 중 포함)·학습 기록의 가장 큰 주차보다 작게 줄일 수 없다.
 * 오류: P0002 없는 과목 / 42501 기존 자료 과목 / P0001 입력 오류 / 23514 주차 축소 불가
 */
create or replace function public.admin_update_course(
  p_course_id text,
  p_title text default null,
  p_drama text default null,
  p_context text default null,
  p_description text default null,
  p_week_count integer default null,
  p_status text default null
)
returns public.courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.courses;
  v_min integer;
begin
  if p_title is null and p_drama is null and p_context is null and p_description is null
     and p_week_count is null and p_status is null then
    raise exception '바꿀 내용이 없어요.' using errcode = 'P0001';
  end if;
  -- 학습자료 저장(_save_lesson)과 같은 과목 잠금: 주차 수 검사와 새 학습자료 저장이 겹치지 않게
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(p_course_id));
  select * into c from public.courses where id = p_course_id for update;
  if not found then
    raise exception '과목을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if c.status = 'legacy' then
    raise exception '기존 자료 과목은 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('active', 'inactive') then
    raise exception '과목 상태는 운영 중(active) 또는 비활성(inactive)만 고를 수 있어요.' using errcode = 'P0001';
  end if;
  if p_week_count is not null then
    if p_week_count < 1 or p_week_count > 30 then
      raise exception '주차 수는 1~30 사이의 정수로 입력해 주세요.' using errcode = 'P0001';
    end if;
    if p_week_count < c.week_count then
      select greatest(
               coalesce((select max(l.week) from public.lessons l where l.course_id = c.id), 0),
               coalesce((select max(p.week) from public.lesson_progress p join public.lessons l on l.id = p.lesson_id where l.course_id = c.id), 0)
             )
        into v_min;
      if p_week_count < v_min then
        raise exception '%주차까지 학습자료나 학습 기록이 있어 %주보다 적게 줄일 수 없어요.', v_min, v_min using errcode = '23514';
      end if;
    end if;
  end if;

  update public.courses
     set title = case when p_title is null then title else public._course_text(p_title, '과목명', 60, true) end,
         drama = case when p_drama is null then drama else public._course_text(p_drama, '드라마명', 60, false) end,
         context = case when p_context is null then context else public._course_text(p_context, '학습 맥락', 200, false) end,
         description = case when p_description is null then description else public._course_text(p_description, '설명', 500, false) end,
         week_count = coalesce(p_week_count, week_count),
         status = coalesce(p_status, status)
   where id = c.id
  returning * into c;
  return c;
end;
$$;

revoke all on function public.admin_update_course(text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_update_course(text, text, text, text, text, integer, text) to service_role;

commit;

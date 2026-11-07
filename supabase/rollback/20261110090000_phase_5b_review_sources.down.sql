-- Phase 5-B 되돌리기 (20261110090000_phase_5b_review_sources.sql)
--
-- ▶ 자료 보호: 출처가 연결된 복습 HTML이 하나라도 있으면 전체를 취소한다. 자료를 지우거나 바꾸는 문장은 없다.
--   (되돌려야 하면 화면에서 자동 생성 복습 자료를 먼저 정리할지 사람이 정한다)
-- ▶ 하는 일: 출처 조회 함수 제거, HTML 저장 함수를 4단계 원문으로 복원, 고유 인덱스·제약·외래 키·출처 칸 제거
-- ▶ 하지 않는 일: HTML 본문·다른 자료·다른 테이블 변경 없음
-- ▶ 재실행: 5-B 객체가 이미 없어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

do $$
declare
  v_has boolean;
begin
  if to_regclass('public.week_materials') is null then
    raise exception '5B_ROLLBACK: week_materials가 없어요.';
  end if;
  execute 'lock table public.week_materials in share row exclusive mode';
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'week_materials' and column_name = 'source_kind') then
    execute 'select exists (select 1 from public.week_materials where source_kind is not null)' into v_has;
    if v_has then
      raise exception '5B_ROLLBACK: 출처가 연결된 복습 HTML이 있어 되돌리지 않았어요. (먼저 화면에서 정리하세요)';
    end if;
  end if;
end;
$$;

drop function if exists public.list_week_material_sources(text);

-- 4단계 원문으로 복원 (supabase/migrations/20261109090000_phase_4_html_materials.sql 그대로)
create or replace function public._save_week_material_html(
  p_course_id text,
  p_material_id text,
  p_input jsonb,
  p_html text,
  p_actor uuid,
  p_actor_label text,
  p_is_admin boolean
)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses;
  v_course_id text;
  v_old public.week_materials;
  v_week integer;
  v_status text;
  v_saved public.week_materials;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception '자료 정보 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_input ?| array['id', 'courseId', 'kind', 'position', 'url', 'storagePath', 'fileName', 'mimeType', 'sizeBytes', 'html'] then
    raise exception 'id·과목·종류·순서·링크·파일 칸은 서버가 정해요.' using errcode = '22023';
  end if;
  if p_html is null then
    raise exception 'HTML 내용을 입력해 주세요.' using errcode = '22023';
  end if;
  if octet_length(p_html) > 2097152 then
    raise exception 'HTML은 2MB(UTF-8)까지 저장할 수 있어요.' using errcode = '22023';
  end if;
  if not public._material_html_ok(p_html) then
    raise exception '보안을 위해 스크립트·이벤트 속성·끼워 넣기 요소 등은 넣을 수 없어요.' using errcode = '22023';
  end if;

  if p_material_id is null then
    v_course_id := p_course_id;
    if v_course_id is null then
      raise exception '강의를 찾을 수 없어요.' using errcode = 'P0002';
    end if;
    perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id));
    select * into v_course from public.courses where id = v_course_id;
    if not found then
      raise exception '강의를 찾을 수 없어요.' using errcode = 'P0002';
    end if;
    if not p_is_admin and not public.can_manage_course(v_course_id) then
      raise exception '담당 강의의 자료만 저장할 수 있어요.' using errcode = '42501';
    end if;
    if not (p_input ? 'week' and p_input ? 'title') then
      raise exception '주차·자료 제목을 입력해 주세요.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_input -> 'week') is distinct from 'number' or (p_input ->> 'week') !~ '^[0-9]{1,2}$' then
      raise exception '주차는 정수로 입력해 주세요.' using errcode = '22023';
    end if;
    v_week := (p_input ->> 'week')::integer;
    if v_week < 1 or v_week > v_course.week_count then
      raise exception '주차는 1~%주차 중에서 골라 주세요.', v_course.week_count using errcode = '22023';
    end if;
    v_status := coalesce(p_input ->> 'status', 'draft');
    if v_status not in ('draft', 'published') then
      raise exception '공개 상태는 공개(published) 또는 비공개(draft)만 고를 수 있어요.' using errcode = '22023';
    end if;
    if (select count(*) from public.week_materials where course_id = v_course_id and week = v_week) >= 20 then
      raise exception '한 주차에는 자료를 20개까지 등록할 수 있어요.' using errcode = '23505';
    end if;
    insert into public.week_materials (
      id, course_id, week, kind, title, description, url, html_body, status, position, version, updated_by, updated_by_label
    ) values (
      'material-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      v_course_id, v_week, 'html',
      public._material_text(p_input -> 'title', '자료 제목', 100, true),
      public._material_text(p_input -> 'description', '설명', 500, false),
      null, p_html, v_status,
      coalesce((select max(m.position) + 1 from public.week_materials m where m.course_id = v_course_id and m.week = v_week), 0),
      1, p_actor, p_actor_label
    )
    returning * into v_saved;
    return v_saved;
  end if;

  select course_id into v_course_id from public.week_materials where id = p_material_id;
  if not found then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id));
  if not p_is_admin and not public.can_manage_course(v_course_id) then
    raise exception '담당 강의의 자료만 저장할 수 있어요.' using errcode = '42501';
  end if;
  select * into v_old from public.week_materials where id = p_material_id for update;
  if not found then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if v_old.kind <> 'html' then
    raise exception 'HTML 자료만 HTML 내용을 바꿀 수 있어요.' using errcode = '22023';
  end if;
  -- 주차·제목·설명·공개는 기존 저장 함수가 검사·이동·순서 정리까지 한다 (같은 트랜잭션)
  if p_input ?| array['week', 'title', 'description', 'status'] then
    perform public._save_week_material(null, p_material_id, p_input, p_actor, p_actor_label, p_is_admin);
  end if;
  update public.week_materials
     set html_body = p_html,
         version = version + 1,
         updated_by = p_actor,
         updated_by_label = p_actor_label
   where id = p_material_id
  returning * into v_saved;
  return v_saved;
end;
$$;

revoke all on function public._save_week_material_html(text, text, jsonb, text, uuid, text, boolean) from public, anon, authenticated, service_role;

drop index if exists public.week_materials_review_source_uniq;
alter table public.week_materials drop constraint if exists week_materials_source_fields;
alter table public.week_materials drop constraint if exists week_materials_source_lesson_id_fkey;
alter table public.week_materials drop column if exists source_lesson_updated_at;
alter table public.week_materials drop column if exists source_lesson_id;
alter table public.week_materials drop column if exists source_kind;

commit;

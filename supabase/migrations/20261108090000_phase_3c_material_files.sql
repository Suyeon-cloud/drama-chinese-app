-- Phase 3-C: 주차별 보충 자료 — 파일 자료 (비공개 Storage 버킷 + 업로드 의도 + 파일 행 RPC)
--
-- 추가형 마이그레이션이다. 기존 테이블·행(week_materials 포함)은 바꾸거나 지우지 않는다. 기존 3-B 함수도 바꾸지 않는다.
--   1) Storage 비공개 버킷 week-materials (20MB, 허용 형식 13개). storage.objects 정책은 만들지 않는다 → service_role만 접근.
--   2) week_material_uploads: 서버가 업로드 주소를 줄 때 남기는 기록 (토큰·과목·저장 경로·크기·형식·올린 사람·만료·사용 여부).
--      anon·authenticated는 접근 불가, 서버(service_role)만.
--   3) 파일 행 RPC (service_role 전용): admin_insert_week_material_file · admin_replace_week_material_file
--      서버가 권한(교수자는 can_manage_course)과 파일(크기·형식·내용)을 확인한 뒤에만 부른다. 저장 경로는 그 과목 폴더의 서버 형식만.
--   4) week_material_download (authenticated): 그 사람이 열 수 있는 파일의 저장 경로만 돌려준다.
--      편집·담당 교수자는 비공개 포함, 학생은 수강 중인 과목의 published만. 그 밖은 "없음"(P0002).
--   파일 메타데이터 수정·공개 전환·정렬·삭제는 3-B RPC를 그대로 쓴다. (삭제 RPC가 돌려주는 storage_path로 서버가 파일을 지운다)
--
-- 트랜잭션: 파일 전체가 begin … commit 한 트랜잭션이다. 중간에 실패하면 전부 취소된다.
-- 재실행: [0] 사전 확인이 이미 있는 객체가 이 파일이 만드는 구조와 같은지 본다. 다르면 아무것도 바꾸지 않고 멈춘다.

begin;

/* ───────── 0) 사전 확인 ───────── */

do $pre$
declare
  v_expected_columns constant text :=
    'token:uuid:NO,course_id:text:NO,material_id:text:YES,storage_path:text:NO,file_name:text:NO,mime_type:text:NO,'
    || 'size_bytes:bigint:NO,input:jsonb:YES,actor_key:text:NO,actor_id:uuid:YES,actor_label:text:NO,'
    || 'created_at:timestamp with time zone:NO,expires_at:timestamp with time zone:NO,consumed_at:timestamp with time zone:YES';
  v_actual text;
begin
  -- 이 파일이 쓰는 기존 객체 (3-B·D1)
  if to_regclass('public.week_materials') is null
     or to_regprocedure('public._can_see_all_week_materials(text)') is null
     or to_regprocedure('public._is_week_material_learner(text)') is null
     or to_regprocedure('public._material_text(jsonb,text,integer,boolean)') is null
     or to_regprocedure('public.lesson_course_lock_key(text)') is null then
    raise exception '3C_PREFLIGHT: 3-B 객체(week_materials·목록 권한 함수)가 없어요.';
  end if;

  -- 업로드 기록 테이블이 이미 있으면 열이 같아야 한다
  if to_regclass('public.week_material_uploads') is not null then
    select string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' order by ordinal_position) into v_actual
      from information_schema.columns where table_schema = 'public' and table_name = 'week_material_uploads';
    if v_actual is distinct from v_expected_columns then
      raise exception '3C_PREFLIGHT: 이미 있는 week_material_uploads의 열이 예상과 달라요. (%)', v_actual;
    end if;
    select string_agg(policyname, ',') into v_actual from pg_policies where schemaname = 'public' and tablename = 'week_material_uploads';
    if v_actual is not null then
      raise exception '3C_PREFLIGHT: week_material_uploads에 예상하지 않은 RLS 정책이 있어요. (%)', v_actual;
    end if;
  end if;

  -- 같은 이름의 다른 함수(오버로드)가 있으면 멈춘다
  select string_agg(p.oid::regprocedure::text, ', ') into v_actual
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('admin_insert_week_material_file', 'admin_replace_week_material_file', 'week_material_download', '_material_file_path_ok')
     and p.oid <> all (array_remove(array[
       to_regprocedure('public.admin_insert_week_material_file(text,jsonb,text,text,text,bigint,uuid,text)'),
       to_regprocedure('public.admin_replace_week_material_file(text,text,text,text,bigint,uuid,text)'),
       to_regprocedure('public.week_material_download(text)'),
       to_regprocedure('public._material_file_path_ok(text,text)')
     ]::oid[], null));
  if v_actual is not null then
    raise exception '3C_PREFLIGHT: 같은 이름의 다른 함수가 있어요. (%)', v_actual;
  end if;

  -- 버킷이 이미 있으면 비공개여야 한다 (공개 버킷을 그대로 쓰지 않는다)
  if exists (select 1 from storage.buckets where id = 'week-materials' and public) then
    raise exception '3C_PREFLIGHT: week-materials 버킷이 공개로 되어 있어요. 확인 전에는 진행하지 않아요.';
  end if;
  -- 이 버킷을 여는 storage.objects 정책이 있으면 멈춘다
  select string_agg(policyname, ',') into v_actual
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') like '%week-materials%' or coalesce(with_check, '') like '%week-materials%');
  if v_actual is not null then
    raise exception '3C_PREFLIGHT: week-materials 버킷을 여는 Storage 정책이 있어요. (%)', v_actual;
  end if;
end;
$pre$;

/* ───────── 1) Storage 비공개 버킷 ───────── */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'week-materials', 'week-materials', false, 20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp',
    'application/hwp+zip', 'application/vnd.hancom.hwpx',
    'image/jpeg', 'image/png', 'image/webp', 'text/plain'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* ───────── 2) 업로드 기록 ───────── */

create table if not exists public.week_material_uploads (
  token uuid primary key,
  course_id text not null references public.courses (id) on delete restrict,
  -- 파일 교체면 그 자료 (자료가 지워지면 기록도 지운다)
  material_id text references public.week_materials (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp',
    'application/hwp+zip', 'application/vnd.hancom.hwpx',
    'image/jpeg', 'image/png', 'image/webp', 'text/plain')),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  -- 새 자료의 주차·제목·설명·공개 상태 (교체면 null)
  input jsonb check (input is null or jsonb_typeof(input) = 'object'),
  actor_key text not null check (char_length(actor_key) between 1 and 100),
  actor_id uuid,
  actor_label text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint week_material_uploads_path_in_course check (
    storage_path ~ '^[a-z0-9][a-z0-9-]{1,63}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$'
    and split_part(storage_path, '/', 1) = course_id
  ),
  constraint week_material_uploads_new_or_replace check ((material_id is null) = (input is not null))
);

create index if not exists week_material_uploads_expires_idx on public.week_material_uploads (expires_at);

alter table public.week_material_uploads enable row level security;
revoke all on table public.week_material_uploads from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.week_material_uploads to service_role;

/* ───────── 3) 파일 행 RPC ───────── */

-- 저장 경로가 그 과목 폴더의 서버 형식("{courseId}/{uuid}.{ext}")인지
create or replace function public._material_file_path_ok(p_course_id text, p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_path ~ '^[a-z0-9][a-z0-9-]{1,63}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$'
      and split_part(p_path, '/', 1) = p_course_id,
    false);
$$;

/*
 * 새 파일 자료 (service_role 전용 — 서버가 권한·파일 검사를 마친 뒤 부른다).
 * p_input: { week, title, description?, status? } · 저장 경로는 그 과목 폴더, 확장자는 파일 이름과 같아야 한다.
 * 오류: P0002 과목 없음 / 22023 입력·경로 오류 / 23505 주차당 20개 초과·같은 경로의 자료가 이미 있음
 */
create or replace function public.admin_insert_week_material_file(
  p_course_id text,
  p_input jsonb,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_actor uuid default null,
  p_actor_label text default null
)
returns public.week_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses;
  v_week integer;
  v_status text;
  v_saved public.week_materials;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception '자료 정보 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(p_course_id));
  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception '강의를 찾을 수 없어요.' using errcode = 'P0002';
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
  if not public._material_file_path_ok(p_course_id, p_storage_path)
     or lower(substring(btrim(coalesce(p_file_name, '')) from '\.([A-Za-z0-9]{1,8})$')) is distinct from substring(p_storage_path from '\.([a-z0-9]{1,8})$') then
    raise exception '파일 저장 경로가 올바르지 않아요.' using errcode = '22023';
  end if;
  if exists (select 1 from public.week_materials where storage_path = p_storage_path) then
    raise exception '같은 파일을 쓰는 자료가 이미 있어요.' using errcode = '23505';
  end if;
  if (select count(*) from public.week_materials where course_id = p_course_id and week = v_week) >= 20 then
    raise exception '한 주차에는 자료를 20개까지 등록할 수 있어요.' using errcode = '23505';
  end if;

  insert into public.week_materials (
    id, course_id, week, kind, title, description, url, storage_path, file_name, mime_type, size_bytes,
    status, position, version, updated_by, updated_by_label
  ) values (
    'material-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    p_course_id, v_week, 'file',
    public._material_text(p_input -> 'title', '자료 제목', 100, true),
    public._material_text(p_input -> 'description', '설명', 500, false),
    null, p_storage_path, btrim(p_file_name), p_mime_type, p_size_bytes,
    v_status,
    coalesce((select max(position) + 1 from public.week_materials where course_id = p_course_id and week = v_week), 0),
    1, p_actor, coalesce(nullif(btrim(p_actor_label), ''), '관리자')
  )
  returning * into v_saved;
  return v_saved;
end;
$$;

/*
 * 파일 자료의 파일 교체 (service_role 전용). 옛 저장 경로를 돌려준다 — 서버가 새 파일을 확인한 뒤 부르고, 끝나면 옛 파일을 지운다.
 * 오류: P0002 자료 없음 / 22023 파일 자료가 아님·경로 오류 / 23505 같은 경로의 자료가 이미 있음
 */
create or replace function public.admin_replace_week_material_file(
  p_material_id text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_actor uuid default null,
  p_actor_label text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id text;
  v_old public.week_materials;
begin
  select course_id into v_course_id from public.week_materials where id = p_material_id;
  if not found then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id));
  select * into v_old from public.week_materials where id = p_material_id for update;
  if not found then
    raise exception '자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if v_old.kind <> 'file' then
    raise exception '파일 자료만 파일을 바꿀 수 있어요.' using errcode = '22023';
  end if;
  if not public._material_file_path_ok(v_old.course_id, p_storage_path)
     or lower(substring(btrim(coalesce(p_file_name, '')) from '\.([A-Za-z0-9]{1,8})$')) is distinct from substring(p_storage_path from '\.([a-z0-9]{1,8})$') then
    raise exception '파일 저장 경로가 올바르지 않아요.' using errcode = '22023';
  end if;
  if exists (select 1 from public.week_materials where storage_path = p_storage_path and id <> v_old.id) then
    raise exception '같은 파일을 쓰는 자료가 이미 있어요.' using errcode = '23505';
  end if;
  update public.week_materials
     set storage_path = p_storage_path,
         file_name = btrim(p_file_name),
         mime_type = p_mime_type,
         size_bytes = p_size_bytes,
         version = version + 1,
         updated_by = p_actor,
         updated_by_label = coalesce(nullif(btrim(p_actor_label), ''), '관리자')
   where id = v_old.id;
  return v_old.storage_path;
end;
$$;

/*
 * 파일 열기 (로그인 사용자). 열 수 있으면 저장 경로·파일 이름·형식을 돌려주고, 서버가 그 경로로 60초 서명 주소를 만든다.
 * 편집·담당 교수자(_can_see_all_week_materials): 비공개 포함 / 수강 학생: published만 / 그 밖·없는 자료·링크 자료: P0002
 */
create or replace function public.week_material_download(p_material_id text)
returns table (storage_path text, file_name text, mime_type text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.week_materials;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v from public.week_materials m where m.id = p_material_id;
  if not found or v.kind <> 'file' or v.storage_path is null
     or not (public._can_see_all_week_materials(v.course_id)
             or (v.status = 'published' and public._is_week_material_learner(v.course_id))) then
    raise exception '파일을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  return query select v.storage_path, v.file_name, v.mime_type;
end;
$$;

/* ───────── 권한 ───────── */

revoke all on function public._material_file_path_ok(text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_insert_week_material_file(text, jsonb, text, text, text, bigint, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_replace_week_material_file(text, text, text, text, bigint, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.week_material_download(text) from public, anon, authenticated, service_role;

grant execute on function public.admin_insert_week_material_file(text, jsonb, text, text, text, bigint, uuid, text) to service_role;
grant execute on function public.admin_replace_week_material_file(text, text, text, text, bigint, uuid, text) to service_role;
grant execute on function public.week_material_download(text) to authenticated;

commit;

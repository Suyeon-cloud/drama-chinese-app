-- Phase B: 회원 프로필(profiles)과 교수자 등록(instructors)
--
-- - 학생·교강사 모두 Google(Supabase Auth)로 로그인하면 profiles 행이 하나씩 생긴다.
--   profile이 있다고 학생이라는 뜻은 아니다. 교강사 여부는 instructors 연결(user_id)로만 판정한다.
-- - 학생 승인(status)·승인 시각은 관리자 서버(service-role)만 바꾼다. 로그인 사용자는 허용된 회원정보 칸만 고친다.
-- - 관리자는 Supabase Auth 사용자가 아니므로 이 파일의 RLS에는 관리자 분기가 없다. (관리자 작업은 서버의 service-role)
-- - 실제 교강사 이메일은 여기에 넣지 않는다. 교수자 등록은 관리자 기능에서 한다.
-- - 같은 파일을 다시 실행해도 결과가 같도록 if not exists / or replace / drop if exists를 쓴다.

/* ───────── 테이블 ───────── */

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- 회원이 직접 입력하는 정보 (기존 LearnerProfile과 같은 항목)
  name text not null default '',
  university text not null default '',
  department text not null default '',
  grade text not null default '',
  student_id text not null default '',
  contact_email text not null default '',
  phone text not null default '',
  -- 화면 표시용 (로그인 계정 정보의 기준은 auth.users)
  avatar_color text not null default '#A9D6F5',
  picture text,
  -- 학생 승인 (교강사에게는 쓰지 않는다)
  status text not null default 'pending' check (status in ('pending', 'approved')),
  profile_completed boolean not null default false,
  approved_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status);

create table if not exists public.instructors (
  -- 관리자가 미리 등록하는 교강사 Google 이메일 (소문자)
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  -- 그 이메일로 로그인해 확인된 계정. 한 계정은 교수자 행 하나에만 연결된다.
  user_id uuid unique references auth.users (id) on delete set null,
  display_name text,
  source text not null default 'admin' check (source in ('admin', 'migration')),
  -- 등록한 관리자 표시 (관리자는 auth 사용자가 아니어서 FK가 아닌 글자로 둔다)
  added_by text,
  added_at timestamptz not null default now(),
  linked_at timestamptz
);

/* ───────── 공통 ───────── */

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

/* ───────── 프로필 만들기 ───────── */

-- auth 사용자 → profiles 1행. Google이 준 이름·사진은 표시용으로만 쓴다. (권한 판단에 쓰지 않음)
-- 사용하는 metadata: full_name → name, avatar_url → picture (https 주소만)
create or replace function public.ensure_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_name text;
  v_picture text;
  v_colors text[] := array['#A9D6F5', '#F6D3DF', '#C9EBDD', '#DCD5F7', '#FBE3B5'];
begin
  select id, email, raw_user_meta_data into u from auth.users where id = p_user_id;
  if not found then
    return;
  end if;
  v_name := left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), 100);
  v_picture := coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture');
  if v_picture is null or v_picture !~ '^https://' or length(v_picture) > 500 then
    v_picture := null;
  end if;
  insert into public.profiles (id, name, contact_email, picture, avatar_color)
  values (
    u.id,
    v_name,
    lower(coalesce(u.email, '')),
    v_picture,
    v_colors[1 + abs(hashtext(lower(coalesce(u.email, u.id::text)))) % array_length(v_colors, 1)]
  )
  on conflict (id) do nothing;
end;
$$;

/* ───────── 교강사 계정 연결 ───────── */

-- 인증된 이메일(auth.users.email_confirmed_at)이 등록된 교수자 이메일과 같을 때만 연결한다.
-- 이미 다른 계정에 연결된 행은 바꾸지 않는다. 반환값: 이 계정이 교수자인지
create or replace function public.link_instructor_account(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name text;
begin
  select lower(email), left(btrim(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', '')), 100)
    into v_email, v_name
    from auth.users
   where id = p_user_id and email_confirmed_at is not null and email is not null;
  if v_email is not null and not exists (select 1 from public.instructors where user_id = p_user_id) then
    update public.instructors
       set user_id = p_user_id,
           linked_at = now(),
           display_name = coalesce(nullif(display_name, ''), nullif(v_name, ''))
     where email = v_email and user_id is null;
  end if;
  return exists (select 1 from public.instructors where user_id = p_user_id);
end;
$$;

-- 새 auth 사용자: 프로필 만들기 + (등록된 교수자면) 연결.
-- 여기서 오류가 나도 로그인 자체는 막지 않는다. 빠진 처리는 로그인 후 sync_my_account()가 다시 한다.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.ensure_profile(new.id);
    perform public.link_instructor_account(new.id);
  exception when others then
    raise warning 'handle_new_auth_user(%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 관리자가 교수자를 등록할 때 그 이메일로 이미 로그인한 계정이 있으면 바로 연결한다.
create or replace function public.instructors_link_existing_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.user_id is null then
    select u.id into v_user
      from auth.users u
     where lower(u.email) = new.email
       and u.email_confirmed_at is not null
       and not exists (select 1 from public.instructors i where i.user_id = u.id and i.email <> new.email)
     order by u.created_at
     limit 1;
    if v_user is not null then
      new.user_id := v_user;
      new.linked_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists instructors_link_existing_user on public.instructors;
create trigger instructors_link_existing_user
  before insert or update of email on public.instructors
  for each row execute function public.instructors_link_existing_user();

/* ───────── 로그인 사용자가 부르는 함수 ───────── */

-- 로그인 직후 호출: 프로필 확인·최종 접속 시각·교수자 연결. 인자를 받지 않아 다른 사람의 계정을 다룰 수 없다.
create or replace function public.sync_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_instructor boolean;
  p public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform public.ensure_profile(v_uid);
  update public.profiles set last_seen_at = now() where id = v_uid returning * into p;
  v_instructor := public.link_instructor_account(v_uid);
  return jsonb_build_object(
    'is_instructor', v_instructor,
    'status', p.status,
    'profile_completed', p.profile_completed
  );
end;
$$;

-- 회원정보 입력 완료 (기존 서버의 PUT /me/profile과 같은 검사: 모두 필수, 100자, 연락 이메일 형식)
create or replace function public.complete_my_profile(
  p_name text,
  p_university text,
  p_department text,
  p_grade text,
  p_student_id text,
  p_contact_email text,
  p_phone text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_fields text[] := array[p_name, p_university, p_department, p_grade, p_student_id, p_contact_email, p_phone];
  v_email text := lower(left(btrim(coalesce(p_contact_email, '')), 100));
  p public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from unnest(v_fields) f where left(btrim(coalesce(f, '')), 100) = '') then
    raise exception '모든 항목을 입력해 주세요.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '연락용 이메일 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  perform public.ensure_profile(v_uid);
  update public.profiles
     set name = left(btrim(p_name), 100),
         university = left(btrim(p_university), 100),
         department = left(btrim(p_department), 100),
         grade = left(btrim(p_grade), 100),
         student_id = left(btrim(p_student_id), 100),
         contact_email = v_email,
         phone = left(btrim(p_phone), 100),
         profile_completed = true
   where id = v_uid
  returning * into p;
  return p;
end;
$$;

-- 교수자 여부 (이후 단계의 권한 판정에도 쓴다). 본인 행만 보이는 instructors RLS 아래에서 동작한다.
create or replace function public.is_instructor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.instructors where user_id = (select auth.uid()));
$$;

/* ───────── 권한 ───────── */

alter table public.profiles enable row level security;
alter table public.instructors enable row level security;

-- Supabase 기본 권한(anon·authenticated 전체 허용)을 거두고 필요한 것만 다시 준다.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.instructors from anon, authenticated;
grant select on table public.profiles to authenticated;
-- 본인이 직접 고칠 수 있는 칸. status·approved_at·profile_completed·표시용 값·시각은 고칠 수 없다.
grant update (name, university, department, grade, student_id, contact_email, phone) on table public.profiles to authenticated;
grant select on table public.instructors to authenticated;
grant all on table public.profiles to service_role;
grant all on table public.instructors to service_role;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists instructors_select_own on public.instructors;
create policy instructors_select_own on public.instructors
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 함수: 내부용은 아무도 직접 부르지 못하게, 로그인 사용자용은 authenticated만
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.ensure_profile(uuid) from public, anon, authenticated;
revoke all on function public.link_instructor_account(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.instructors_link_existing_user() from public, anon, authenticated;
revoke all on function public.sync_my_account() from public, anon;
revoke all on function public.complete_my_profile(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.is_instructor() from public, anon;
grant execute on function public.sync_my_account() to authenticated;
grant execute on function public.complete_my_profile(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.is_instructor() to authenticated;

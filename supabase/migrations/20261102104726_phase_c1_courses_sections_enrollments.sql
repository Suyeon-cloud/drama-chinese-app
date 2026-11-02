-- Phase C1: 과목(courses)·분반(sections)·분반 담당 교강사(section_instructors)·수강 등록(enrollments)
--
-- - 과목은 15주 학습자료를 함께 쓰는 단위, 분반은 실제 수업 단위다. 분반을 만들어도 학습자료는 복제하지 않는다.
-- - 분반마다 강의코드가 다르다. 과목의 이전 강의코드(legacy_code)는 보존만 하고 수강 등록에 쓰지 않는다.
-- - 분반은 지우지 않고 inactive로 바꾼다. (수강·배정 기록이 있는 분반은 FK가 삭제를 막는다)
-- - 수강 등록은 승인된 학생이 enroll_with_code()로만 한다. 같은 과목의 운영 중 분반은 하나만 수강한다.
-- - 관리자는 Supabase Auth 사용자가 아니다. 관리자 작업은 서버의 service-role이 admin_* 함수와 테이블로 한다.
-- - 실제 과목·분반·교수자 데이터는 여기에 넣지 않는다. (C2 이전 스크립트)

/* ───────── 테이블 ───────── */

create table if not exists public.courses (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  drama text not null default '',
  title text not null default '',
  context text not null default '',
  description text not null default '',
  week_count integer not null default 15 check (week_count between 1 and 30),
  -- active: 운영 과목 / legacy: 이전 자료 보관용 (학생·교수자에게 보이지 않음)
  status text not null default 'active' check (status in ('active', 'legacy')),
  -- 이전 구조의 과목 강의코드. 수강 등록에는 쓰지 않는다.
  legacy_code text unique check (legacy_code is null or legacy_code ~ '^[A-Z0-9]{4,12}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sections (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  course_id text not null references public.courses (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- 학생이 입력하는 강의코드 (대문자 6자, 분반마다 다름)
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 수강 등록의 (분반, 과목) 쌍이 실제와 맞는지 FK로 확인하기 위한 키
  unique (id, course_id)
);

create index if not exists sections_course_idx on public.sections (course_id);
-- 같은 과목 안에 같은 이름의 운영 중 분반은 하나만
create unique index if not exists sections_active_name_uidx on public.sections (course_id, name) where status = 'active';

create table if not exists public.section_instructors (
  section_id text not null references public.sections (id) on delete restrict,
  -- 교수자 등록 이메일로 배정한다. (교강사가 로그인하기 전에도 배정할 수 있다)
  instructor_email text not null references public.instructors (email) on update cascade on delete cascade,
  assigned_at timestamptz not null default now(),
  -- 배정한 관리자 표시 (관리자는 auth 사용자가 아니어서 글자로 둔다)
  assigned_by text,
  primary key (section_id, instructor_email)
);

create index if not exists section_instructors_email_idx on public.section_instructors (instructor_email);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  section_id text not null,
  course_id text not null,
  -- 등록할 때 입력한 강의코드
  course_code text not null,
  joined_at timestamptz not null default now(),
  foreign key (section_id, course_id) references public.sections (id, course_id) on delete restrict,
  unique (section_id, user_id)
);

create index if not exists enrollments_user_course_idx on public.enrollments (user_id, course_id);
create index if not exists enrollments_section_idx on public.enrollments (section_id);

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

drop trigger if exists sections_set_updated_at on public.sections;
create trigger sections_set_updated_at
  before update on public.sections
  for each row execute function public.set_updated_at();

/* ───────── 권한 판정 helper (현재 로그인 사용자 기준, 인자로 다른 사용자를 받지 않는다) ───────── */

-- 회원정보 입력을 마치고 관리자 승인을 받은 학생인지
create or replace function public.is_approved_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.status = 'approved' and p.profile_completed
  );
$$;

-- 내가 담당하는 분반 (운영 과목만). p_active_only: 운영 중인 분반만 (학습자료 편집 권한)
create or replace function public.my_instructor_section_ids(p_active_only boolean default false)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
    from public.sections s
    join public.section_instructors si on si.section_id = s.id
    join public.instructors i on i.email = si.instructor_email
    join public.courses c on c.id = s.course_id
   where i.user_id = (select auth.uid())
     and c.status = 'active'
     and (not p_active_only or s.status = 'active');
$$;

-- 내가 수강 중인 분반 (승인된 학생, 운영 과목만). 분반이 비활성화돼도 기존 수강은 유지된다.
create or replace function public.my_enrolled_section_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select e.section_id
    from public.enrollments e
    join public.courses c on c.id = e.course_id
   where e.user_id = (select auth.uid())
     and c.status = 'active'
     and public.is_approved_student();
$$;

-- 내가 볼 수 있는 과목: 담당 분반의 과목 + 수강 중인 과목 (운영 과목만)
create or replace function public.my_course_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select s.course_id from public.sections s where s.id in (select public.my_instructor_section_ids(false))
  union
  select s.course_id from public.sections s where s.id in (select public.my_enrolled_section_ids());
$$;

-- 과목 공통 학습자료 편집 권한 (이후 Lesson 단계에서 사용): 그 과목의 운영 중 분반 하나 이상을 담당
create or replace function public.can_manage_course(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sections s
     where s.course_id = p_course_id
       and s.id in (select public.my_instructor_section_ids(true))
  );
$$;

/* ───────── 같은 과목 중복 수강 방지 ───────── */

-- 학생·과목 단위 잠금 키. 등록과 분반 재활성화가 같은 키로 순서대로 처리된다.
create or replace function public.enrollment_lock_key(p_user_id uuid, p_course_id text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended(p_user_id::text || ':' || p_course_id, 0);
$$;

-- 모든 등록(RPC·서버)에 적용: 운영 중인 분반만, 같은 과목의 다른 운영 중 분반 수강 중이면 거부
create or replace function public.enrollments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(public.enrollment_lock_key(new.user_id, new.course_id));
  if not exists (select 1 from public.sections s where s.id = new.section_id and s.status = 'active') then
    raise exception '운영 중인 분반에만 새로 등록할 수 있어요.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from public.enrollments e
      join public.sections s on s.id = e.section_id
     where e.user_id = new.user_id
       and e.course_id = new.course_id
       and e.section_id <> new.section_id
       and s.status = 'active'
  ) then
    raise exception '이미 이 과목의 다른 분반을 수강 중이에요.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists enrollments_guard on public.enrollments;
create trigger enrollments_guard
  before insert on public.enrollments
  for each row execute function public.enrollments_guard();

/* ───────── 학생: 강의코드로 수강 등록 ───────── */

-- p_confirm = false: 과목·분반 미리 보기만 / true: 등록. 승인된 학생만 쓸 수 있다.
-- 없는 코드·비활성 분반·이전 과목 코드는 같은 문구로 거부해 존재 여부를 알려주지 않는다.
create or replace function public.enroll_with_code(p_code text, p_confirm boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  s public.sections;
  c public.courses;
  e public.enrollments;
  v_already boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.instructors i where i.user_id = v_uid) then
    raise exception '교수자 계정은 수강 등록하지 않아도 돼요.' using errcode = '42501';
  end if;
  if not public.is_approved_student() then
    raise exception '관리자 승인 후 수강 등록할 수 있어요.' using errcode = '42501';
  end if;

  select * into s from public.sections where code = v_code and status = 'active';
  if found then
    select * into c from public.courses where id = s.course_id and status = 'active';
  end if;
  if s.id is null or c.id is null then
    raise exception '강의코드를 다시 확인해 주세요. 일치하는 강의가 없어요.' using errcode = 'P0002';
  end if;

  if p_confirm then
    perform pg_advisory_xact_lock(public.enrollment_lock_key(v_uid, c.id));
    select * into e from public.enrollments where section_id = s.id and user_id = v_uid;
    if found then
      v_already := true;
    else
      insert into public.enrollments (user_id, section_id, course_id, course_code)
      values (v_uid, s.id, c.id, s.code)
      returning * into e;
    end if;
  end if;

  return jsonb_build_object(
    'course', jsonb_build_object(
      'id', c.id, 'drama', c.drama, 'title', c.title, 'context', c.context,
      'description', c.description, 'weekCount', c.week_count
    ),
    'section', jsonb_build_object('id', s.id, 'name', s.name),
    'enrolled', p_confirm,
    'alreadyEnrolled', v_already,
    'enrollment', case when p_confirm then jsonb_build_object(
      'id', e.id, 'sectionId', e.section_id, 'courseId', e.course_id, 'joinedAt', e.joined_at
    ) end
  );
end;
$$;

/* ───────── 교수자·학생 화면용 조회 ───────── */

-- 교수자: 담당 분반 (강의코드 포함). 학생에게는 강의코드 칸을 열지 않으므로 이 함수로만 받는다.
create or replace function public.my_sections()
returns setof public.sections
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.sections s
   where s.id in (select public.my_instructor_section_ids(false))
   order by s.course_id, s.name;
$$;

-- 분반 담당 교강사 이름. 그 분반 수강생·담당 교강사만 볼 수 있고, 이메일은 담당 교강사에게만 준다.
create or replace function public.section_teacher_names(p_section_id text)
returns table (name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teacher boolean := p_section_id in (select public.my_instructor_section_ids(false));
begin
  if not v_teacher and p_section_id not in (select public.my_enrolled_section_ids()) then
    return;
  end if;
  return query
    select coalesce(nullif(i.display_name, ''), nullif(p.name, '')) as name,
           case when v_teacher then i.email end as email
      from public.section_instructors si
      join public.instructors i on i.email = si.instructor_email
      left join public.profiles p on p.id = i.user_id
     where si.section_id = p_section_id
     order by i.email;
end;
$$;

-- 담당 교강사: 분반 수강생 (필요한 칸만). 담당하지 않는 분반은 거부한다.
create or replace function public.section_students(p_section_id text)
returns table (user_id uuid, name text, student_id text, contact_email text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_section_id not in (select public.my_instructor_section_ids(false)) then
    raise exception '담당 분반이 아니에요.' using errcode = '42501';
  end if;
  return query
    select e.user_id, p.name, p.student_id, p.contact_email, e.joined_at
      from public.enrollments e
      join public.profiles p on p.id = e.user_id
     where e.section_id = p_section_id
     order by p.name, e.joined_at;
end;
$$;

/* ───────── 관리자(service-role 전용) ───────── */

-- 분반 개설: 이름(없으면 다음 번호), 모든 분반·이전 과목 코드와 겹치지 않는 강의코드, 담당 교강사 배정
create or replace function public.admin_create_section(
  p_course_id text,
  p_name text default null,
  p_instructor_emails text[] default '{}',
  p_assigned_by text default null
)
returns public.sections
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.courses;
  s public.sections;
  v_name text := btrim(coalesce(p_name, ''));
  v_n integer := 1;
  v_slug text;
  v_id text;
  v_code text;
  v_bytes bytea;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_email text;
  i integer;
begin
  select * into c from public.courses where id = p_course_id;
  if not found or c.status <> 'active' then
    raise exception '운영 중인 과목에만 분반을 만들 수 있어요.' using errcode = 'P0002';
  end if;
  if v_name = '' then
    while exists (select 1 from public.sections where course_id = c.id and name = lpad(v_n::text, 2, '0') || '분반') loop
      v_n := v_n + 1;
    end loop;
    v_name := lpad(v_n::text, 2, '0') || '분반';
  end if;
  if exists (select 1 from public.sections where course_id = c.id and status = 'active' and name = v_name) then
    raise exception '이미 운영 중인 %이 있어요.', v_name using errcode = '23505';
  end if;
  foreach v_email in array coalesce(p_instructor_emails, '{}') loop
    if not exists (select 1 from public.instructors where email = lower(btrim(v_email))) then
      raise exception '교수자로 등록된 이메일만 배정할 수 있어요.' using errcode = 'P0001';
    end if;
  end loop;

  v_slug := regexp_replace(c.id, '^course-', '');
  v_n := 1;
  loop
    v_id := 'section-' || v_slug || '-' || lpad(v_n::text, 2, '0');
    exit when not exists (select 1 from public.sections where id = v_id);
    v_n := v_n + 1;
  end loop;
  -- gen_random_uuid()의 앞 6바이트는 무작위 값이다. 32자 알파벳이라 치우침이 없다.
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, i) % 32, 1);
    end loop;
    exit when not exists (select 1 from public.sections where code = v_code)
      and not exists (select 1 from public.courses where legacy_code = v_code);
  end loop;

  insert into public.sections (id, course_id, name, code, status)
  values (v_id, c.id, v_name, v_code, 'active')
  returning * into s;
  foreach v_email in array coalesce(p_instructor_emails, '{}') loop
    insert into public.section_instructors (section_id, instructor_email, assigned_by)
    values (s.id, lower(btrim(v_email)), p_assigned_by)
    on conflict do nothing;
  end loop;
  return s;
end;
$$;

-- 분반 이름 변경·운영/비활성 전환. 다시 운영으로 바꿀 때 같은 과목의 다른 운영 중 분반에도
-- 수강 중인 학생이 생기면 거부한다. (DETAIL에 해당 학생 id 목록)
create or replace function public.admin_update_section(
  p_section_id text,
  p_name text default null,
  p_status text default null
)
returns public.sections
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sections;
  v_name text;
  v_status text;
  v_conflicts uuid[];
  r record;
begin
  select * into s from public.sections where id = p_section_id for update;
  if not found then
    raise exception '분반을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if p_name is not null and btrim(p_name) = '' then
    raise exception '분반 이름을 입력해 주세요.' using errcode = 'P0001';
  end if;
  v_name := coalesce(btrim(p_name), s.name);
  v_status := coalesce(p_status, s.status);
  if v_status not in ('active', 'inactive') then
    raise exception '분반 상태는 active 또는 inactive예요.' using errcode = 'P0001';
  end if;

  if v_status = 'active' then
    if exists (select 1 from public.sections where course_id = s.course_id and status = 'active' and name = v_name and id <> s.id) then
      raise exception '이미 운영 중인 %이 있어요.', v_name using errcode = '23505';
    end if;
    if s.status <> 'active' then
      for r in select e.user_id from public.enrollments e where e.section_id = s.id order by e.user_id loop
        perform pg_advisory_xact_lock(public.enrollment_lock_key(r.user_id, s.course_id));
      end loop;
      select array_agg(e.user_id order by e.user_id) into v_conflicts
        from public.enrollments e
       where e.section_id = s.id
         and exists (
           select 1
             from public.enrollments o
             join public.sections os on os.id = o.section_id
            where o.user_id = e.user_id
              and o.course_id = e.course_id
              and o.section_id <> e.section_id
              and os.status = 'active'
         );
      if v_conflicts is not null then
        raise exception '같은 과목의 다른 운영 중 분반에도 수강 중인 학생이 %명 있어 다시 운영할 수 없어요.', cardinality(v_conflicts)
          using errcode = '23505', detail = array_to_json(v_conflicts)::text;
      end if;
    end if;
  end if;

  update public.sections set name = v_name, status = v_status where id = s.id returning * into s;
  return s;
end;
$$;

/* ───────── 권한 ───────── */

alter table public.courses enable row level security;
alter table public.sections enable row level security;
alter table public.section_instructors enable row level security;
alter table public.enrollments enable row level security;

revoke all on table public.courses from anon, authenticated;
revoke all on table public.sections from anon, authenticated;
revoke all on table public.section_instructors from anon, authenticated;
revoke all on table public.enrollments from anon, authenticated;

grant select on table public.courses to authenticated;
-- 강의코드(code)는 빼고 연다. 교수자는 my_sections()로 받는다.
grant select (id, course_id, name, status, created_at, updated_at) on table public.sections to authenticated;
grant select on table public.section_instructors to authenticated;
grant select on table public.enrollments to authenticated;

grant all on table public.courses to service_role;
grant all on table public.sections to service_role;
grant all on table public.section_instructors to service_role;
grant all on table public.enrollments to service_role;

drop policy if exists courses_select_mine on public.courses;
create policy courses_select_mine on public.courses
  for select to authenticated
  using (status = 'active' and id in (select public.my_course_ids()));

drop policy if exists sections_select_mine on public.sections;
create policy sections_select_mine on public.sections
  for select to authenticated
  using (
    id in (select public.my_instructor_section_ids(false))
    or id in (select public.my_enrolled_section_ids())
  );

drop policy if exists section_instructors_select_own on public.section_instructors;
create policy section_instructors_select_own on public.section_instructors
  for select to authenticated
  using (instructor_email in (select i.email from public.instructors i where i.user_id = (select auth.uid())));

drop policy if exists enrollments_select_mine on public.enrollments;
create policy enrollments_select_mine on public.enrollments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or section_id in (select public.my_instructor_section_ids(false))
  );

-- 함수: 내부용은 직접 부를 수 없게, 정책·화면용은 authenticated만, 관리자용은 service_role만
revoke all on function public.is_approved_student() from public, anon;
revoke all on function public.my_instructor_section_ids(boolean) from public, anon;
revoke all on function public.my_enrolled_section_ids() from public, anon;
revoke all on function public.my_course_ids() from public, anon;
revoke all on function public.can_manage_course(text) from public, anon;
revoke all on function public.enrollment_lock_key(uuid, text) from public, anon, authenticated;
revoke all on function public.enrollments_guard() from public, anon, authenticated;
revoke all on function public.enroll_with_code(text, boolean) from public, anon;
revoke all on function public.my_sections() from public, anon;
revoke all on function public.section_teacher_names(text) from public, anon;
revoke all on function public.section_students(text) from public, anon;
revoke all on function public.admin_create_section(text, text, text[], text) from public, anon, authenticated;
revoke all on function public.admin_update_section(text, text, text) from public, anon, authenticated;

grant execute on function public.is_approved_student() to authenticated;
grant execute on function public.my_instructor_section_ids(boolean) to authenticated;
grant execute on function public.my_enrolled_section_ids() to authenticated;
grant execute on function public.my_course_ids() to authenticated;
grant execute on function public.can_manage_course(text) to authenticated;
grant execute on function public.enroll_with_code(text, boolean) to authenticated;
grant execute on function public.my_sections() to authenticated;
grant execute on function public.section_teacher_names(text) to authenticated;
grant execute on function public.section_students(text) to authenticated;
grant execute on function public.admin_create_section(text, text, text[], text) to service_role;
grant execute on function public.admin_update_section(text, text, text) to service_role;

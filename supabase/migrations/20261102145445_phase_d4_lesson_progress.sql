-- Phase D4: 학습 기록(lesson_progress)·연결 못 한 기존 기록 보관(legacy_progress)·저장 RPC·기존 기록 claim
--
-- - 학습 기록은 (학생, 학습자료) 하나. 분반은 저장하지 않는다. (학생의 분반·과목은 enrollments로 판단)
-- - 학생은 본인 기록만 읽고 save_my_progress()로만 쓴다. (승인 + 수강 과목(운영) + published 학습자료)
--   분반이 나중에 비활성이 되어도 기존 수강 학생은 계속 기록한다. (my_enrolled_section_ids와 같은 정책)
-- - 교수자는 읽기만: 운영 중인 담당 분반의 수강생 × 그 과목 학습자료의 기록. 수정할 수 없다.
-- - 관리자는 서버의 service-role로 전체를 본다.
-- - 학습 기록이 있는 학습자료는 관리자도 지울 수 없다. (lesson_id → lessons ON DELETE RESTRICT)
-- - 기존 Google 로그인 기록(사용자 id = Google sub)은 Google sub와 이메일이 모두 일치하는 Supabase 계정에만 연결한다.
--   확실하지 않은 기록은 legacy_progress에 원본 그대로 두고, 그 학생이 나중에 가입하면 sync_my_account()가 같은 조건으로 claim한다.

/* ───────── 테이블 ───────── */

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null references public.lessons (id) on delete restrict,
  week integer not null check (week between 1 and 30),
  -- 출석/학습 시작 (처음 재생한 시각)
  started_at timestamptz,
  -- 학습 구간 끝까지 시청한 시각
  completed_at timestamptz,
  -- 실제로 재생한 구간 [[start, end], …] (초)
  watched_ranges jsonb not null default '[]'::jsonb check (jsonb_typeof(watched_ranges) = 'array'),
  progress_ratio double precision not null default 0 check (progress_ratio >= 0),
  max_position double precision not null default 0 check (max_position >= 0),
  -- 가장 최근 퀴즈 결과 (응시 전에는 셋 다 null)
  quiz_correct integer check (quiz_correct >= 0),
  quiz_total integer check (quiz_total >= 0),
  quiz_submitted_at timestamptz,
  quiz_attempts integer not null default 0 check (quiz_attempts >= 0),
  last_studied_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  check ((quiz_correct is null) = (quiz_total is null) and (quiz_total is null) = (quiz_submitted_at is null))
);

create index if not exists lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

-- 연결하지 못한 기존 학습 기록 (service-role 전용). 원본(record)을 그대로 두고 추측해서 연결하지 않는다.
create table if not exists public.legacy_progress (
  -- 기존 db.json의 사용자 id (Google sub)
  legacy_user_id text not null check (char_length(legacy_user_id) between 1 and 255),
  lesson_id text not null check (char_length(lesson_id) between 1 and 100),
  -- 기존 회원의 Google 이메일 (members[legacy_user_id].googleEmail, 없으면 null)
  legacy_email text,
  -- 기존 LessonProgress 원본
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  -- 연결하지 못한 이유: no_account · email_mismatch · email_only · no_email · lesson_missing
  reason text not null,
  imported_at timestamptz not null default now(),
  -- 같은 Google sub·이메일의 계정이 가입해 연결된 경우
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  primary key (legacy_user_id, lesson_id)
);

/* ───────── 기록 저장 (공통) ───────── */

-- JSON 시각 (null·없음은 null, 문자열은 시각이어야 한다)
create or replace function public._progress_time(p_value jsonb, p_field text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' then
    raise exception '학습 기록의 % 형식이 올바르지 않아요.', p_field using errcode = '22023';
  end if;
  return (p_value #>> '{}')::timestamptz;
exception
  when invalid_datetime_format or datetime_field_overflow then
    raise exception '학습 기록의 % 시각이 올바르지 않아요.', p_field using errcode = '22023';
end;
$$;

-- JSON 0 이상의 정수
create or replace function public._progress_count(p_value jsonb, p_field text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]{1,9}$' then
    raise exception '학습 기록의 % 값이 올바르지 않아요.', p_field using errcode = '22023';
  end if;
  return (p_value #>> '{}')::integer;
end;
$$;

/*
 * 학습 기록 1건 저장 (기존 LessonProgress JSON 전체). 사용자는 인자로 받고 JSON의 userId는 쓰지 않는다.
 * p_overwrite: 이미 있으면 덮어쓸지 (학생 저장: true / 기존 기록 이전·claim: false — 이미 있는 기록은 그대로 둔다)
 * 반환: 쓰였는지
 */
create or replace function public._save_progress(p_user uuid, p_progress jsonb, p_overwrite boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson text;
  v_ranges jsonb;
  v_quiz jsonb;
  r jsonb;
  v_rows integer;
begin
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' then
    raise exception '학습 기록 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  v_lesson := public._lesson_text(p_progress -> 'lessonId', 'lessonId');
  if v_lesson is null or not exists (select 1 from public.lessons where id = v_lesson) then
    raise exception '학습자료를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  v_ranges := coalesce(p_progress -> 'watchedRanges', '[]'::jsonb);
  if jsonb_typeof(v_ranges) <> 'array' then
    raise exception '학습 기록의 watchedRanges 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  for r in select value from jsonb_array_elements(v_ranges) loop
    if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> 2
       or jsonb_typeof(r -> 0) <> 'number' or jsonb_typeof(r -> 1) <> 'number' then
      raise exception '학습 기록의 watchedRanges 형식이 올바르지 않아요.' using errcode = '22023';
    end if;
  end loop;
  v_quiz := p_progress -> 'quiz';
  if v_quiz is not null and jsonb_typeof(v_quiz) not in ('object', 'null') then
    raise exception '학습 기록의 quiz 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_quiz) is distinct from 'object' then
    v_quiz := null;
  end if;

  insert into public.lesson_progress (
    user_id, lesson_id, week, started_at, completed_at, watched_ranges, progress_ratio, max_position,
    quiz_correct, quiz_total, quiz_submitted_at, quiz_attempts, last_studied_at, updated_at
  ) values (
    p_user, v_lesson,
    public._progress_count(p_progress -> 'week', 'week'),
    public._progress_time(p_progress -> 'startedAt', 'startedAt'),
    public._progress_time(p_progress -> 'completedAt', 'completedAt'),
    v_ranges,
    public._lesson_number(p_progress -> 'progressRatio', 'progressRatio'),
    public._lesson_number(p_progress -> 'maxPosition', 'maxPosition'),
    case when v_quiz is null then null else public._progress_count(v_quiz -> 'correct', 'quiz.correct') end,
    case when v_quiz is null then null else public._progress_count(v_quiz -> 'total', 'quiz.total') end,
    case when v_quiz is null then null else coalesce(public._progress_time(v_quiz -> 'submittedAt', 'quiz.submittedAt'), now()) end,
    coalesce(public._progress_count(coalesce(p_progress -> 'quizAttempts', '0'::jsonb), 'quizAttempts'), 0),
    public._progress_time(p_progress -> 'lastStudiedAt', 'lastStudiedAt'),
    now()
  )
  on conflict (user_id, lesson_id) do update set
    week = excluded.week,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    watched_ranges = excluded.watched_ranges,
    progress_ratio = excluded.progress_ratio,
    max_position = excluded.max_position,
    quiz_correct = excluded.quiz_correct,
    quiz_total = excluded.quiz_total,
    quiz_submitted_at = excluded.quiz_submitted_at,
    quiz_attempts = excluded.quiz_attempts,
    last_studied_at = excluded.last_studied_at,
    updated_at = excluded.updated_at
  where p_overwrite;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- 학생 저장 (본인만). 기존 서버 PUT /progress와 같은 조건: 승인된 학습자, 수강 과목(운영)의 published 학습자료
create or replace function public.save_my_progress(p_progress jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lesson text := p_progress ->> 'lessonId';
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.instructors i where i.user_id = v_uid) or not public.is_approved_student() then
    raise exception '승인된 학습자만 기록돼요.' using errcode = '42501';
  end if;
  -- 다른 사람의 기록으로 보낸 경우 (사용자는 언제나 auth.uid())
  if p_progress ? 'userId' and (p_progress ->> 'userId') is distinct from v_uid::text then
    raise exception '학습 기록 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.lessons l
      join public.courses c on c.id = l.course_id
     where l.id = v_lesson
       and l.status = 'published'
       and c.status = 'active'
       and exists (
         select 1 from public.sections s
          where s.course_id = l.course_id
            and s.id in (select public.my_enrolled_section_ids())
       )
  ) then
    raise exception '수강 중인 강의의 학습만 기록돼요.' using errcode = '42501';
  end if;
  perform public._save_progress(v_uid, p_progress, true);
  return jsonb_build_object('lessonId', v_lesson, 'ok', true);
end;
$$;

-- 학습 기록을 읽을 수 있는지: 본인 / 운영 중인 담당 분반 수강생의 그 과목 학습자료 기록 (교수자)
create or replace function public.can_read_progress(p_user_id uuid, p_lesson_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
      or exists (
        select 1
          from public.lessons l
          join public.enrollments e on e.course_id = l.course_id
         where l.id = p_lesson_id
           and e.user_id = p_user_id
           and e.section_id in (select public.my_instructor_section_ids(true))
      );
$$;

/* ───────── 기존 Google 로그인 기록 연결 ───────── */

/*
 * 기존 사용자(Google sub + 이메일)에 해당하는 Supabase 계정. 둘 다 맞을 때만 user_id를 준다.
 * reason: matched · email_mismatch(sub만 같음) · email_only(이메일만 같음) · no_email(원본 이메일 없음) · no_account
 * 이메일은 인증된 auth.users.email과 비교한다. (대소문자·앞뒤 공백 무시)
 */
create or replace function public.legacy_identity_user(p_legacy_user_id text, p_legacy_email text)
returns table (user_id uuid, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_legacy_email, '')));
  v_user uuid;
  v_user_email text;
  v_confirmed boolean;
begin
  select i.user_id, lower(u.email), u.email_confirmed_at is not null
    into v_user, v_user_email, v_confirmed
    from auth.identities i
    join auth.users u on u.id = i.user_id
   where i.provider = 'google' and i.provider_id = p_legacy_user_id
   limit 1;
  if v_user is not null then
    if v_email = '' then
      return query select null::uuid, 'no_email'::text;
    elsif v_confirmed and v_user_email = v_email then
      return query select v_user, 'matched'::text;
    else
      return query select null::uuid, 'email_mismatch'::text;
    end if;
    return;
  end if;
  if v_email <> '' and exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return query select null::uuid, 'email_only'::text;
  else
    return query select null::uuid, case when v_email = '' then 'no_email' else 'no_account' end;
  end if;
end;
$$;

-- 기존 기록 이전 (service-role 전용, 이전 스크립트): 이미 있는 기록은 덮어쓰지 않는다.
create or replace function public.admin_import_progress(p_user_id uuid, p_progress jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._save_progress(p_user_id, p_progress, false);
end;
$$;

/*
 * 로그인한 사용자의 보관 기록 claim: 그 계정의 Google sub와 같은 legacy_user_id이고, legacy_identity_user가 matched로
 * 이 사용자를 돌려주는 기록만. 이미 같은 학습자료 기록이 있으면 덮어쓰지 않고 보관 상태로 둔다. 여러 번 불러도 같다.
 */
create or replace function public.claim_legacy_progress(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  lp public.legacy_progress;
  v_match uuid;
  v_claimed integer := 0;
begin
  for lp in
    select * from public.legacy_progress l
     where l.claimed_by is null
       and l.legacy_user_id in (select i.provider_id from auth.identities i where i.user_id = p_user_id and i.provider = 'google')
     order by l.legacy_user_id, l.lesson_id
     for update
  loop
    v_match := null;
    select m.user_id into v_match from public.legacy_identity_user(lp.legacy_user_id, lp.legacy_email) m where m.reason = 'matched';
    continue when v_match is distinct from p_user_id;
    continue when not exists (select 1 from public.lessons where id = lp.lesson_id);
    if public._save_progress(p_user_id, lp.record || jsonb_build_object('lessonId', lp.lesson_id), false) then
      update public.legacy_progress set claimed_by = p_user_id, claimed_at = now()
       where legacy_user_id = lp.legacy_user_id and lesson_id = lp.lesson_id;
      v_claimed := v_claimed + 1;
    end if;
  end loop;
  return v_claimed;
end;
$$;

-- 로그인 후 동기화: 기존 동작 + 보관 기록 claim. claim이 실패해도 로그인은 막지 않는다.
create or replace function public.sync_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_instructor boolean;
  v_claimed integer := 0;
  p public.profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform public.ensure_profile(v_uid);
  update public.profiles set last_seen_at = now() where id = v_uid returning * into p;
  v_instructor := public.link_instructor_account(v_uid);
  begin
    v_claimed := public.claim_legacy_progress(v_uid);
  exception when others then
    v_claimed := 0;
  end;
  return jsonb_build_object(
    'is_instructor', v_instructor,
    'status', p.status,
    'profile_completed', p.profile_completed,
    'claimed_progress', v_claimed
  );
end;
$$;

/* ───────── 권한 ───────── */

alter table public.lesson_progress enable row level security;
alter table public.legacy_progress enable row level security;

revoke all on table public.lesson_progress from anon, authenticated;
revoke all on table public.legacy_progress from anon, authenticated;

-- 학생·교수자는 읽기만 (쓰기는 save_my_progress). 보관 기록은 service-role만.
grant select on table public.lesson_progress to authenticated;
grant all on table public.lesson_progress to service_role;
grant all on table public.legacy_progress to service_role;

drop policy if exists lesson_progress_select_readable on public.lesson_progress;
create policy lesson_progress_select_readable on public.lesson_progress
  for select to authenticated
  using (public.can_read_progress(user_id, lesson_id));

revoke all on function public._progress_time(jsonb, text) from public, anon, authenticated;
revoke all on function public._progress_count(jsonb, text) from public, anon, authenticated;
revoke all on function public._save_progress(uuid, jsonb, boolean) from public, anon, authenticated, service_role;
revoke all on function public.save_my_progress(jsonb) from public, anon;
revoke all on function public.can_read_progress(uuid, text) from public, anon;
revoke all on function public.legacy_identity_user(text, text) from public, anon, authenticated;
revoke all on function public.admin_import_progress(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_legacy_progress(uuid) from public, anon, authenticated, service_role;
revoke all on function public.sync_my_account() from public, anon;

grant execute on function public.save_my_progress(jsonb) to authenticated;
grant execute on function public.can_read_progress(uuid, text) to authenticated;
grant execute on function public.legacy_identity_user(text, text) to service_role;
grant execute on function public.admin_import_progress(uuid, jsonb) to service_role;
grant execute on function public.sync_my_account() to authenticated;

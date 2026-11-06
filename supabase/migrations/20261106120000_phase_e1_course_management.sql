-- Phase E1: 과목 상태 inactive + 관리자 과목 생성·수정 RPC (JSON 모드 정책과 같게)
--
-- 과목 상태
--   active   : 신규 수강·새 분반 가능, 기존 수강생 학습, 교수자 편집
--   inactive : 신규 수강·새 분반 금지. 기존 수강생 학습·진도 저장, 담당 교수자 편집·새 학습자료, 기존 분반 교수자 배정은 계속
--   legacy   : 이전 자료 보관 (지금과 같음 — 학생·교수자에게 보이지 않고 관리자만)
--
-- 이 파일은 추가형이다. 테이블·행·id를 지우거나 바꾸지 않는다. 기존 데이터에 inactive 과목은 없으므로 적용 직후 동작은 지금과 같다.
--   1) courses.status 제약에 inactive 추가
--   2) 학습을 계속 허용하는 helper·정책·저장 함수: c.status = 'active' → in ('active', 'inactive')
--        my_instructor_section_ids, my_enrolled_section_ids, courses_select_mine, save_my_progress
--      (can_manage_course·can_read_lesson·can_read_dialogue·can_read_progress·course_curriculum·section_* 함수는 위 helper를 따른다)
--   3) _save_lesson: 이동 규칙을 legacy 여부로 (active ↔ inactive 이동 허용, legacy ↔ 그 밖 금지),
--      교수자의 새 학습자료는 legacy만 금지, 주차 중복 검사는 legacy가 아닌 모든 과목, 과목 행을 잠근 뒤 다시 읽어 주차 수 변경과 겹치지 않게
--   4) enrollments_guard: 운영 중 분반 + 운영 중(active) 과목에만 새 등록 (enroll_with_code와 같은 조건을 trigger에서도)
--   5) admin_create_course / admin_update_course (service_role 전용)
-- 그대로 두는 것 (active만 = 신규 차단): enroll_with_code, admin_create_section
-- 기존 분반 교수자 배정은 service-role이 section_instructors에 직접 쓴다. (DB에 과목 상태 제한 없음 — 서버 검사만 바꾸면 된다)

/* ───────── 1) 과목 상태 제약 ───────── */

-- C1의 열 제약(check (status in ('active', 'legacy')))은 이름을 정하지 않아 이름이 환경마다 다를 수 있다.
-- status만 보는 courses의 check 제약을 찾아 지우고, 이름을 정해 다시 만든다.
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.courses'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ~ '\mstatus\M'
       and pg_get_constraintdef(con.oid) !~ '\m(week_count|legacy_code|id)\M'
  loop
    execute format('alter table public.courses drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.courses
  add constraint courses_status_check check (status in ('active', 'inactive', 'legacy'));

/* ───────── 2) 학습을 계속 허용하는 helper·정책 ───────── */

-- 내가 담당하는 분반 (운영·비활성 과목). p_active_only: 운영 중인 분반만 (학습자료 편집 권한)
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
     and c.status in ('active', 'inactive')
     and (not p_active_only or s.status = 'active');
$$;

-- 내가 수강 중인 분반 (승인된 학생, 운영·비활성 과목). 분반·과목이 비활성화돼도 기존 수강은 유지된다.
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
     and c.status in ('active', 'inactive')
     and public.is_approved_student();
$$;

drop policy if exists courses_select_mine on public.courses;
create policy courses_select_mine on public.courses
  for select to authenticated
  using (status in ('active', 'inactive') and id in (select public.my_course_ids()));

-- 학생 진도 저장: 운영·비활성 과목의 published 학습자료 (기존 수강생은 비활성 과목에서도 계속 기록)
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
       and c.status in ('active', 'inactive')
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

/* ───────── 3) 학습자료 저장 (_save_lesson) ───────── */

create or replace function public._save_lesson(
  p_lesson jsonb,
  p_expected_version integer,
  p_actor uuid,
  p_actor_label text,
  p_is_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
  v_course_id text;
  v_week integer;
  v_video jsonb;
  v_dialogues jsonb;
  v_course public.courses;
  v_old public.lessons;
  v_old_course public.courses;
  v_exists boolean;
  v_saved public.lessons;
  v_now timestamptz := now();
  v_created_at timestamptz;
  d jsonb;
  d_pos bigint;
  r jsonb;
  r_pos bigint;
  l jsonb;
  l_pos bigint;
begin
  if p_lesson is null or jsonb_typeof(p_lesson) <> 'object' then
    raise exception '학습자료 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  v_id := public._lesson_text(p_lesson -> 'id', 'id');
  if v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$' then
    raise exception '학습자료 id 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  v_course_id := public._lesson_text(p_lesson -> 'courseId', 'courseId');
  if jsonb_typeof(p_lesson -> 'week') is distinct from 'number' or (p_lesson ->> 'week') !~ '^[0-9]{1,2}$' then
    raise exception '주차는 정수로 입력해 주세요.' using errcode = '22023';
  end if;
  v_week := (p_lesson ->> 'week')::integer;
  v_video := p_lesson -> 'video';
  if jsonb_typeof(v_video) is distinct from 'object' then
    raise exception '학습자료의 video 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lesson -> 'script') is distinct from 'object' then
    raise exception '학습자료의 script 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  v_dialogues := p_lesson -> 'dialogues';
  if v_dialogues is not null and jsonb_typeof(v_dialogues) not in ('array', 'null') then
    raise exception '회화 연습 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  select * into v_course from public.courses where id = v_course_id;
  if not found then
    raise exception '없는 과목이에요.' using errcode = 'P0002';
  end if;

  -- 원래 과목과 옮길 과목을 모두 잠근다. (같은 순서로 잠가 교착을 피한다)
  select * into v_old from public.lessons where id = v_id;
  if found and v_old.course_id <> v_course_id then
    perform pg_advisory_xact_lock(public.lesson_course_lock_key(least(v_old.course_id, v_course_id)));
    perform pg_advisory_xact_lock(public.lesson_course_lock_key(greatest(v_old.course_id, v_course_id)));
  else
    perform pg_advisory_xact_lock(public.lesson_course_lock_key(v_course_id));
  end if;
  -- 잠금 뒤 과목을 다시 읽는다. (admin_update_course가 같은 잠금 안에서 주차 수를 바꾼다)
  select * into v_course from public.courses where id = v_course_id;
  select * into v_old from public.lessons where id = v_id for update;
  v_exists := found;

  -- 권한: 교수자는 원래 과목과 옮길 과목 모두 담당(운영 중 분반)해야 한다. 이전 자료 과목은 담당할 수 없다.
  if not p_is_admin then
    if not public.can_manage_course(v_course_id) or (v_exists and not public.can_manage_course(v_old.course_id)) then
      raise exception '담당 강의의 학습자료만 저장할 수 있어요.' using errcode = '42501';
    end if;
  end if;
  -- 이전 자료(legacy) 과목과 그 밖의 과목(운영·비활성) 사이 이동 금지 (관리자 포함). 운영 ↔ 비활성 이동은 된다.
  if v_exists then
    select * into v_old_course from public.courses where id = v_old.course_id;
    if (v_old_course.status = 'legacy') <> (v_course.status = 'legacy') then
      raise exception '이전 자료 과목과 운영 과목 사이에서는 학습자료를 옮길 수 없어요.' using errcode = '42501';
    end if;
  elsif v_course.status = 'legacy' and not p_is_admin then
    raise exception '담당 강의의 학습자료만 저장할 수 있어요.' using errcode = '42501';
  end if;

  -- 동시 편집 확인
  if v_exists then
    if p_expected_version is null or p_expected_version <> v_old.version then
      raise exception '다른 사용자가 먼저 저장했어요. 최신본을 다시 불러와 주세요.'
        using errcode = 'PT409',
              detail = jsonb_build_object(
                'currentVersion', v_old.version,
                'updatedAt', v_old.updated_at,
                'updatedByLabel', v_old.updated_by_label
              )::text;
    end if;
  elsif coalesce(p_expected_version, 0) <> 0 then
    raise exception '학습자료를 찾을 수 없어요. 삭제되었을 수 있어요.' using errcode = 'P0002';
  end if;

  -- 주차: 과목의 주차 범위, legacy가 아닌 과목은 같은 주차에 학습자료 하나만 (이미 그 자리에 있던 자료를 그대로 저장하는 것은 허용)
  if v_week < 1 or v_week > v_course.week_count then
    raise exception '주차는 1~%주차 중에서 골라 주세요.', v_course.week_count using errcode = '22023';
  end if;
  if v_course.status <> 'legacy'
     and exists (select 1 from public.lessons x where x.course_id = v_course_id and x.week = v_week and x.id <> v_id)
     and not (v_exists and v_old.course_id = v_course_id and v_old.week = v_week) then
    raise exception '%주차에는 이미 학습자료가 있어요. 다른 주차를 골라 주세요.', v_week using errcode = '23505';
  end if;

  v_created_at := case when v_exists then v_old.created_at else v_now end;
  if not v_exists and jsonb_typeof(p_lesson -> 'createdAt') = 'string' then
    begin
      v_created_at := (p_lesson ->> 'createdAt')::timestamptz;
    exception when others then
      v_created_at := v_now;
    end;
  end if;

  insert into public.lessons (
    id, course_id, week, title, description, direction, level, status,
    youtube_url, youtube_id, start_time, end_time, subtitle_position, episode_id,
    script, draft, content, caption_mask, source,
    version, updated_by, updated_by_label, created_at, updated_at
  ) values (
    v_id, v_course_id, v_week,
    coalesce(public._lesson_text(p_lesson -> 'title', 'title'), ''),
    coalesce(public._lesson_text(p_lesson -> 'description', 'description'), ''),
    public._lesson_text(p_lesson -> 'direction', 'direction'),
    coalesce(public._lesson_text(p_lesson -> 'level', 'level'), ''),
    coalesce(public._lesson_text(p_lesson -> 'status', 'status'), 'draft'),
    coalesce(public._lesson_text(v_video -> 'youtubeUrl', 'video.youtubeUrl'), ''),
    coalesce(public._lesson_text(v_video -> 'youtubeId', 'video.youtubeId'), ''),
    public._lesson_number(v_video -> 'startTime', 'video.startTime'),
    public._lesson_number(v_video -> 'endTime', 'video.endTime'),
    public._lesson_text(p_lesson -> 'subtitlePosition', 'subtitlePosition'),
    public._lesson_text(p_lesson -> 'episodeId', 'episodeId'),
    p_lesson -> 'script',
    public._lesson_object(p_lesson -> 'draft', 'draft'),
    public._lesson_object(p_lesson -> 'content', 'content'),
    public._lesson_object(p_lesson -> 'captionMask', 'captionMask'),
    public._lesson_object(p_lesson -> 'source', 'source'),
    case when v_exists then v_old.version + 1 else 1 end,
    p_actor, p_actor_label, v_created_at, v_now
  )
  on conflict (id) do update set
    course_id = excluded.course_id,
    week = excluded.week,
    title = excluded.title,
    description = excluded.description,
    direction = excluded.direction,
    level = excluded.level,
    status = excluded.status,
    youtube_url = excluded.youtube_url,
    youtube_id = excluded.youtube_id,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    subtitle_position = excluded.subtitle_position,
    episode_id = excluded.episode_id,
    script = excluded.script,
    draft = excluded.draft,
    content = excluded.content,
    caption_mask = excluded.caption_mask,
    source = excluded.source,
    version = excluded.version,
    updated_by = excluded.updated_by,
    updated_by_label = excluded.updated_by_label,
    updated_at = excluded.updated_at
  returning * into v_saved;

  -- 회화 연습: 이 학습자료의 회화 전체를 보낸 내용으로 바꾼다. (dialogues가 없거나 null이면 회화 없음)
  delete from public.lesson_dialogues where lesson_id = v_id;
  if jsonb_typeof(v_dialogues) = 'array' then
    for d, d_pos in select value, ordinality - 1 from jsonb_array_elements(v_dialogues) with ordinality loop
      if jsonb_typeof(d) <> 'object'
         or jsonb_typeof(d -> 'roles') is distinct from 'array'
         or jsonb_typeof(d -> 'lines') is distinct from 'array' then
        raise exception '회화 연습 형식이 올바르지 않아요.' using errcode = '22023';
      end if;
      insert into public.lesson_dialogues (id, lesson_id, position, title, situation, status)
      values (
        public._lesson_text(d -> 'id', 'dialogues.id'), v_id, d_pos,
        coalesce(public._lesson_text(d -> 'title', 'dialogues.title'), ''),
        coalesce(public._lesson_text(d -> 'situation', 'dialogues.situation'), ''),
        coalesce(public._lesson_text(d -> 'status', 'dialogues.status'), 'draft')
      );
      for r, r_pos in select value, ordinality - 1 from jsonb_array_elements(d -> 'roles') with ordinality loop
        insert into public.dialogue_roles (dialogue_id, id, position, name)
        values (
          d ->> 'id', public._lesson_text(r -> 'id', 'roles.id'), r_pos,
          coalesce(public._lesson_text(r -> 'name', 'roles.name'), '')
        );
      end loop;
      for l, l_pos in select value, ordinality - 1 from jsonb_array_elements(d -> 'lines') with ordinality loop
        insert into public.dialogue_lines (dialogue_id, id, position, role_id, cue_id, zh, pinyin, ko, start_time, end_time)
        values (
          d ->> 'id', public._lesson_text(l -> 'id', 'lines.id'), l_pos,
          coalesce(public._lesson_text(l -> 'roleId', 'lines.roleId'), ''),
          public._lesson_text(l -> 'cueId', 'lines.cueId'),
          coalesce(public._lesson_text(l -> 'zh', 'lines.zh'), ''),
          public._lesson_text(l -> 'pinyin', 'lines.pinyin'),
          public._lesson_text(l -> 'ko', 'lines.ko'),
          public._lesson_number(l -> 'start', 'lines.start'),
          public._lesson_number(l -> 'end', 'lines.end')
        );
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_saved.id,
    'courseId', v_saved.course_id,
    'week', v_saved.week,
    'version', v_saved.version,
    'updatedAt', v_saved.updated_at,
    'updatedByLabel', v_saved.updated_by_label,
    'created', not v_exists
  );
end;
$$;

/* ───────── 4) 새 수강 등록 trigger: 운영 중 분반 + 운영 중 과목 ───────── */

create or replace function public.enrollments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(public.enrollment_lock_key(new.user_id, new.course_id));
  if not exists (
    select 1
      from public.sections s
      join public.courses c on c.id = s.course_id
     where s.id = new.section_id
       and s.status = 'active'
       and c.status = 'active'
  ) then
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

/* ───────── 5) 관리자 과목 생성·수정 (service_role 전용) ───────── */

-- 과목 입력 검사 (글자 칸: 앞뒤 공백 제거 후 길이). 화면·Express(server/courseInput.ts)와 같은 규칙.
create or replace function public._course_text(p_value text, p_label text, p_max integer, p_required boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_value, ''));
begin
  if p_required and v = '' then
    raise exception '%을 입력해 주세요.', p_label using errcode = 'P0001';
  end if;
  if char_length(v) > p_max then
    raise exception '%은 %자까지 입력할 수 있어요.', p_label, p_max using errcode = 'P0001';
  end if;
  return v;
end;
$$;

/*
 * 새 과목: id는 'course-' + 소문자·숫자 6자 (무작위, 겹치면 다시). 기본 과목 id는 쓰지 않는다.
 * 운영 중(active)으로 만들고 분반·학습자료는 만들지 않는다. legacy_code는 비운다. (수강 등록은 분반 강의코드로)
 */
create or replace function public.admin_create_course(
  p_title text,
  p_drama text default '',
  p_context text default '',
  p_description text default '',
  p_week_count integer default 15
)
returns public.courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := public._course_text(p_title, '과목명', 60, true);
  v_drama text := public._course_text(p_drama, '드라마명', 60, false);
  v_context text := public._course_text(p_context, '학습 맥락', 200, false);
  v_description text := public._course_text(p_description, '설명', 500, false);
  v_week integer := coalesce(p_week_count, 15);
  v_alphabet text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_bytes bytea;
  v_id text;
  c public.courses;
  i integer;
  n integer := 0;
begin
  if v_week < 1 or v_week > 30 then
    raise exception '주차 수는 1~30 사이의 정수로 입력해 주세요.' using errcode = 'P0001';
  end if;
  loop
    n := n + 1;
    if n > 50 then
      raise exception '과목 id를 만들지 못했어요. 다시 시도해 주세요.' using errcode = 'P0001';
    end if;
    -- gen_random_uuid()의 앞 6바이트(무작위)로 36자 중 하나씩 고른다.
    v_bytes := uuid_send(gen_random_uuid());
    v_id := 'course-';
    for i in 0..5 loop
      v_id := v_id || substr(v_alphabet, 1 + get_byte(v_bytes, i) % 36, 1);
    end loop;
    continue when v_id in ('course-campus', 'course-university', 'course-workplace', 'course-legacy');
    insert into public.courses (id, drama, title, context, description, week_count, status, legacy_code)
    values (v_id, v_drama, v_title, v_context, v_description, v_week, 'active', null)
    on conflict (id) do nothing
    returning * into c;
    exit when found;
  end loop;
  return c;
end;
$$;

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

/* ───────── 권한 ───────── */

-- create or replace는 기존 권한을 유지하지만, 바꾼 함수의 권한을 다시 분명히 해 둔다.
revoke all on function public.my_instructor_section_ids(boolean) from public, anon;
revoke all on function public.my_enrolled_section_ids() from public, anon;
revoke all on function public.save_my_progress(jsonb) from public, anon;
revoke all on function public._save_lesson(jsonb, integer, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.enrollments_guard() from public, anon, authenticated;
revoke all on function public._course_text(text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_create_course(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_update_course(text, text, text, text, text, integer, text) from public, anon, authenticated;

grant execute on function public.my_instructor_section_ids(boolean) to authenticated;
grant execute on function public.my_enrolled_section_ids() to authenticated;
grant execute on function public.save_my_progress(jsonb) to authenticated;
grant execute on function public.admin_create_course(text, text, text, text, integer) to service_role;
grant execute on function public.admin_update_course(text, text, text, text, text, integer, text) to service_role;

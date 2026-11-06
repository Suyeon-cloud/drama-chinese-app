-- Phase E1 되돌리기 (20261106120000_phase_e1_course_management.sql 적용 전 상태로)
--
-- 이 파일은 supabase/migrations 밖에 있어 CLI가 자동으로 적용하지 않는다. 필요할 때만 사람이 확인하고 실행한다.
-- 아래 함수·정책 본문은 원래 마이그레이션(C1·D1·D4) 파일에서 그대로 복사했다. (server/supabaseSchema.test.ts가 같은지 확인)
--
-- 먼저 확인할 것:
--   1) inactive 과목이 없어야 한다. (있으면 상태 제약을 되돌릴 수 없다)
--        select id, title from public.courses where status = 'inactive';
--      → 있으면 active로 바꾸거나(신규 수강이 다시 열림) legacy로 바꿀지(학생·교수자에게서 숨겨짐) 먼저 정한다.
--   2) admin_create_course로 만든 과목·분반·학습자료·수강·진도는 지우지 않는다. (되돌린 뒤에도 active 과목으로 남는다)
--   3) 서버가 admin_create_course / admin_update_course를 부르지 않는 버전인지 (함수를 지우므로)

begin;

do $$
begin
  if exists (select 1 from public.courses where status = 'inactive') then
    raise exception 'inactive 과목이 있어 되돌릴 수 없어요. 먼저 상태를 정리해 주세요.';
  end if;
end;
$$;

drop function if exists public.admin_update_course(text, text, text, text, text, integer, text);
drop function if exists public.admin_create_course(text, text, text, text, integer);
drop function if exists public._course_text(text, text, integer, boolean);

alter table public.courses drop constraint if exists courses_status_check;
alter table public.courses add constraint courses_status_check check (status in ('active', 'legacy'));

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

drop policy if exists courses_select_mine on public.courses;
create policy courses_select_mine on public.courses
  for select to authenticated
  using (status = 'active' and id in (select public.my_course_ids()));

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
  select * into v_old from public.lessons where id = v_id for update;
  v_exists := found;

  -- 권한: 교수자는 원래 과목과 옮길 과목 모두 담당(운영 중 분반)해야 한다. 이전 자료 과목은 담당할 수 없다.
  if not p_is_admin then
    if not public.can_manage_course(v_course_id) or (v_exists and not public.can_manage_course(v_old.course_id)) then
      raise exception '담당 강의의 학습자료만 저장할 수 있어요.' using errcode = '42501';
    end if;
  end if;
  -- 이전 자료 과목과 운영 과목 사이 이동 금지 (관리자 포함)
  if v_exists then
    select * into v_old_course from public.courses where id = v_old.course_id;
    if v_old_course.status <> v_course.status then
      raise exception '이전 자료 과목과 운영 과목 사이에서는 학습자료를 옮길 수 없어요.' using errcode = '42501';
    end if;
  elsif v_course.status <> 'active' and not p_is_admin then
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

  -- 주차: 과목의 주차 범위, 운영 과목은 같은 주차에 학습자료 하나만 (이미 그 자리에 있던 자료를 그대로 저장하는 것은 허용)
  if v_week < 1 or v_week > v_course.week_count then
    raise exception '주차는 1~%주차 중에서 골라 주세요.', v_course.week_count using errcode = '22023';
  end if;
  if v_course.status = 'active'
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

revoke all on function public.my_instructor_section_ids(boolean) from public, anon;
revoke all on function public.my_enrolled_section_ids() from public, anon;
revoke all on function public.enrollments_guard() from public, anon, authenticated;
revoke all on function public._save_lesson(jsonb, integer, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.save_my_progress(jsonb) from public, anon;
grant execute on function public.my_instructor_section_ids(boolean) to authenticated;
grant execute on function public.my_enrolled_section_ids() to authenticated;
grant execute on function public.save_my_progress(jsonb) to authenticated;

commit;

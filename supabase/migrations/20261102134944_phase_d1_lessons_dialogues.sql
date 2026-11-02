-- Phase D1: 학습자료(lessons)·회화 연습(lesson_dialogues·dialogue_roles·dialogue_lines) schema와 권한
--
-- - 학습자료는 과목(course) 공통이다. 분반마다 복제하지 않고, 한 과목의 자료를 고치면 그 과목의 모든 분반에 반영된다.
-- - 메타데이터는 칸(column), 구조가 복잡한 콘텐츠(script·draft·content·caption_mask·source)는 JSONB로 원본 그대로 둔다.
-- - 회화 연습은 Lesson에 속하고 순서(position)를 명시해 저장한다. 대사의 cue_id는 Lesson.script(JSONB)의 자막 id를 가리키며 FK를 걸지 않는다.
--   cue_id가 가리키는 자막이 없어져도 대사의 복사본(zh·pinyin·ko·start·end)으로 보여준다.
-- - 학생·교수자는 직접 INSERT/UPDATE/DELETE할 수 없다. 교수자 저장은 save_lesson(), 관리자 저장은 admin_save_lesson()(service-role)만.
-- - 동시 편집은 version으로 막는다. (expected version이 다르면 PT409)
-- - 공개 조건 검사(lessonPublishProblems)는 Express의 TypeScript 코드가 계속 맡는다. 여기서 따로 복제하지 않는다.
-- - (course_id, week)에 unique를 걸지 않는다. 이전 자료 과목(legacy)에 같은 주차가 이미 둘 있다. 운영 과목의 주차 중복은 저장 함수가 막는다.
-- - 실제 61개 학습자료·회화 연습 데이터는 여기에 넣지 않는다. (D2 이전 스크립트)

/* ───────── 테이블 ───────── */

create table if not exists public.lessons (
  -- 기존 id 그대로 (예: course-campus-w01, lesson-week01, lesson-<시각>-<무작위>)
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'),
  course_id text not null references public.courses (id) on delete restrict,
  week integer not null check (week between 1 and 30),
  title text not null default '',
  description text not null default '',
  direction text not null check (direction in ('zh-ko', 'ko-zh')),
  -- levels.ts의 LevelId. 정하지 않았으면 ''
  level text not null default '',
  -- draft: 준비 중, ready: 준비 완료(비공개), published: 학습자 공개
  status text not null default 'draft' check (status in ('draft', 'ready', 'published')),
  -- Lesson.video
  youtube_url text not null default '',
  youtube_id text not null default '',
  start_time double precision not null default 0,
  end_time double precision not null default 0,
  -- 앱 학습 자막의 세로 위치 (없으면 기본 위치)
  subtitle_position text check (subtitle_position in ('high', 'middle', 'midLow', 'low')),
  -- 번들 에피소드(episodes/)의 학습 콘텐츠를 재사용하는 이전 자료
  episode_id text,
  -- 자막·원문 (cues·origin·plain 등). 회화 연습의 cue_id가 이 안의 자막 id를 가리킨다.
  script jsonb not null check (jsonb_typeof(script) = 'object'),
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  content jsonb check (content is null or jsonb_typeof(content) = 'object'),
  caption_mask jsonb check (caption_mask is null or jsonb_typeof(caption_mask) = 'object'),
  source jsonb check (source is null or jsonb_typeof(source) = 'object'),
  -- 동시 편집 확인용. 저장할 때마다 1씩 오른다.
  version integer not null default 1 check (version >= 1),
  -- 마지막으로 저장한 교수자 (관리자는 auth 사용자가 아니어서 null, 표시는 updated_by_label)
  updated_by uuid references auth.users (id) on delete set null,
  updated_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lessons_course_week_idx on public.lessons (course_id, week);

create table if not exists public.lesson_dialogues (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'),
  lesson_id text not null references public.lessons (id) on delete cascade,
  -- Lesson.dialogues 배열 안의 순서 (0부터)
  position integer not null check (position >= 0),
  title text not null default '',
  situation text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  unique (lesson_id, position)
);

create table if not exists public.dialogue_roles (
  dialogue_id text not null references public.lesson_dialogues (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  position integer not null check (position >= 0),
  name text not null default '',
  primary key (dialogue_id, id),
  unique (dialogue_id, position)
);

create table if not exists public.dialogue_lines (
  dialogue_id text not null references public.lesson_dialogues (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  position integer not null check (position >= 0),
  -- 이 회화의 dialogue_roles.id. 역할을 정하지 않은 대사는 ''. 화면은 없는 역할을 ‘미지정’으로 보여 주므로 FK 대신 값을 그대로 보존한다.
  role_id text not null default '',
  -- Lesson.script의 자막 id (FK 없음). 아래 칸들은 연결이 끊겼을 때 쓰는 복사본이다.
  cue_id text,
  zh text not null default '',
  pinyin text,
  ko text,
  start_time double precision not null default 0,
  end_time double precision not null default 0,
  primary key (dialogue_id, id),
  unique (dialogue_id, position)
);

/* ───────── 읽기 권한 helper ───────── */

-- 학습자료를 읽을 수 있는지 (현재 로그인 사용자 기준)
--   교수자: 그 과목의 운영 중 분반을 담당 (draft 포함, 운영 과목만)
--   학생: 승인 + 그 과목(운영 과목)의 수강 기록 + published. 분반이 나중에 비활성이 되어도 기존 수강은 유지된다.
create or replace function public.can_read_lesson(p_course_id text, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_course(p_course_id)
      or (
        p_status = 'published'
        and exists (
          select 1 from public.sections s
           where s.course_id = p_course_id
             and s.id in (select public.my_enrolled_section_ids())
        )
      );
$$;

-- 회화 연습을 읽을 수 있는지: 학습자료를 읽을 수 있고, 학생이면 published 회화만
create or replace function public.can_read_dialogue(p_lesson_id text, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
     where l.id = p_lesson_id
       and (
         public.can_manage_course(l.course_id)
         or (p_status = 'published' and public.can_read_lesson(l.course_id, l.status))
       )
  );
$$;

/* ───────── 저장 (교수자 RPC · 관리자 service-role 공통) ───────── */

-- JSON 값 정리: 객체만 받고 null·없음은 null
create or replace function public._lesson_object(p_value jsonb, p_field text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'object' then
    raise exception '학습자료의 % 형식이 올바르지 않아요.', p_field using errcode = '22023';
  end if;
  return p_value;
end;
$$;

-- JSON 숫자 (없으면 p_default)
create or replace function public._lesson_number(p_value jsonb, p_field text, p_default double precision default 0)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_default;
  end if;
  if jsonb_typeof(p_value) <> 'number' then
    raise exception '학습자료의 % 값은 숫자여야 해요.', p_field using errcode = '22023';
  end if;
  return (p_value #>> '{}')::double precision;
end;
$$;

-- JSON 문자열 (없으면 null)
create or replace function public._lesson_text(p_value jsonb, p_field text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' then
    raise exception '학습자료의 % 값은 문자열이어야 해요.', p_field using errcode = '22023';
  end if;
  return p_value #>> '{}';
end;
$$;

-- 과목 단위 저장 잠금 키 (주차 중복 검사가 순서대로 처리되게)
create or replace function public.lesson_course_lock_key(p_course_id text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended('lesson-course:' || p_course_id, 0);
$$;

/*
 * 학습자료 1건 저장 (Lesson JSON 전체). 학습자료 행과 회화 연습 전체를 한 트랜잭션에서 바꾼다.
 * 어느 단계에서든 오류가 나면 전체가 되돌려진다. (회화 연습 저장 실패 → 학습자료 변경도 취소)
 *
 * p_lesson: 기존 Lesson 형식 (courseId, week, video{…}, script, draft, dialogues[…] …). version·updatedAt 등 서버 칸은 무시한다.
 * p_expected_version: 편집을 시작할 때 받은 version. 새 학습자료는 null(또는 0).
 * 반환: { id, courseId, week, version, updatedAt, updatedByLabel, created }
 * 오류: 28000 로그인 필요 / 42501 권한 없음 / P0002 과목·학습자료 없음 / 23505 주차 중복
 *       22023 형식 오류 / PT409 다른 사람이 먼저 저장 (DETAIL: {currentVersion, updatedAt, updatedByLabel})
 */
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

-- 교수자 저장 (로그인한 교수자, 담당 운영 과목만)
create or replace function public.save_lesson(p_lesson jsonb, p_expected_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select coalesce(nullif(btrim(i.display_name), ''), nullif(btrim(p.name), ''), i.email) into v_label
    from public.instructors i
    left join public.profiles p on p.id = i.user_id
   where i.user_id = v_uid
   order by i.email
   limit 1;
  if v_label is null then
    raise exception '교수자만 학습자료를 저장할 수 있어요.' using errcode = '42501';
  end if;
  return public._save_lesson(p_lesson, p_expected_version, v_uid, v_label, false);
end;
$$;

-- 관리자 저장 (service-role 전용, 이전 자료 과목 포함)
create or replace function public.admin_save_lesson(
  p_lesson jsonb,
  p_expected_version integer default null,
  p_admin_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._save_lesson(
    p_lesson, p_expected_version, null, coalesce(nullif(btrim(p_admin_label), ''), '관리자'), true
  );
end;
$$;

/* ───────── 권한 ───────── */

alter table public.lessons enable row level security;
alter table public.lesson_dialogues enable row level security;
alter table public.dialogue_roles enable row level security;
alter table public.dialogue_lines enable row level security;

revoke all on table public.lessons from anon, authenticated;
revoke all on table public.lesson_dialogues from anon, authenticated;
revoke all on table public.dialogue_roles from anon, authenticated;
revoke all on table public.dialogue_lines from anon, authenticated;

-- 학생·교수자는 읽기만 (쓰기는 save_lesson). 삭제는 관리자(service-role)만.
grant select on table public.lessons to authenticated;
grant select on table public.lesson_dialogues to authenticated;
grant select on table public.dialogue_roles to authenticated;
grant select on table public.dialogue_lines to authenticated;

grant all on table public.lessons to service_role;
grant all on table public.lesson_dialogues to service_role;
grant all on table public.dialogue_roles to service_role;
grant all on table public.dialogue_lines to service_role;

drop policy if exists lessons_select_readable on public.lessons;
create policy lessons_select_readable on public.lessons
  for select to authenticated
  using (public.can_read_lesson(course_id, status));

drop policy if exists lesson_dialogues_select_readable on public.lesson_dialogues;
create policy lesson_dialogues_select_readable on public.lesson_dialogues
  for select to authenticated
  using (public.can_read_dialogue(lesson_id, status));

-- 역할·대사는 읽을 수 있는 회화의 것만 (lesson_dialogues의 RLS를 따른다)
drop policy if exists dialogue_roles_select_readable on public.dialogue_roles;
create policy dialogue_roles_select_readable on public.dialogue_roles
  for select to authenticated
  using (dialogue_id in (select d.id from public.lesson_dialogues d));

drop policy if exists dialogue_lines_select_readable on public.dialogue_lines;
create policy dialogue_lines_select_readable on public.dialogue_lines
  for select to authenticated
  using (dialogue_id in (select d.id from public.lesson_dialogues d));

-- 함수: 정책용 helper는 authenticated, 교수자 저장은 authenticated, 내부 함수는 직접 부를 수 없게, 관리자 저장은 service_role만
revoke all on function public.can_read_lesson(text, text) from public, anon;
revoke all on function public.can_read_dialogue(text, text) from public, anon;
revoke all on function public._lesson_object(jsonb, text) from public, anon, authenticated;
revoke all on function public._lesson_number(jsonb, text, double precision) from public, anon, authenticated;
revoke all on function public._lesson_text(jsonb, text) from public, anon, authenticated;
revoke all on function public.lesson_course_lock_key(text) from public, anon, authenticated;
revoke all on function public._save_lesson(jsonb, integer, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.save_lesson(jsonb, integer) from public, anon;
revoke all on function public.admin_save_lesson(jsonb, integer, text) from public, anon, authenticated;

grant execute on function public.can_read_lesson(text, text) to authenticated;
grant execute on function public.can_read_dialogue(text, text) to authenticated;
grant execute on function public.save_lesson(jsonb, integer) to authenticated;
grant execute on function public.admin_save_lesson(jsonb, integer, text) to service_role;

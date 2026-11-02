// Supabase lessons·회화 행 ↔ 기존 Lesson 객체 변환 (server-only, 하나의 기준).
// D2 이전 스크립트의 전수 비교와 D3 API가 같은 변환을 써서 둘이 어긋나지 않게 한다.
//
// - null 칸은 ‘필드 없음’으로 복원하고, ''는 그대로 둔다. (원본 db.json의 선택 필드 규칙)
// - 회화·역할·대사는 position 순서로 다시 배열한다. dialogue_lines.role_id는 원본 text 그대로다.
// - version·updatedByLabel은 Supabase 관리 칸이라 withLessonMeta로만 붙인다. (원본 비교에서는 빼고 본다)
import type { DialogueLine, Lesson, LessonDialogue } from "../src/content/types";

type Row = Record<string, unknown>;

export type LessonRowMeta = { version: number; updated_by: string | null; updated_by_label: string | null };

/** Lesson → lessons 행 (D2 이전용: 원본 시각 그대로) */
export const lessonToRow = (l: Lesson, meta: LessonRowMeta) => ({
  id: l.id,
  course_id: l.courseId,
  week: l.week,
  title: l.title,
  description: l.description,
  direction: l.direction,
  level: l.level,
  status: l.status,
  youtube_url: l.video.youtubeUrl,
  youtube_id: l.video.youtubeId,
  start_time: l.video.startTime,
  end_time: l.video.endTime,
  subtitle_position: l.subtitlePosition ?? null,
  episode_id: l.episodeId ?? null,
  script: l.script,
  draft: l.draft ?? null,
  content: l.content ?? null,
  caption_mask: l.captionMask ?? null,
  source: l.source ?? null,
  ...meta,
  created_at: l.createdAt,
  updated_at: l.updatedAt,
});

/** Lesson.dialogues → lesson_dialogues·dialogue_roles·dialogue_lines 행 */
export const dialogueRowsOf = (l: Lesson) => {
  const out = { dialogues: [] as Row[], roles: [] as Row[], lines: [] as Row[] };
  (l.dialogues ?? []).forEach((d, dPos) => {
    out.dialogues.push({ id: d.id, lesson_id: l.id, position: dPos, title: d.title, situation: d.situation, status: d.status });
    d.roles.forEach((r, rPos) => out.roles.push({ dialogue_id: d.id, id: r.id, position: rPos, name: r.name }));
    d.lines.forEach((x, lPos) =>
      out.lines.push({
        dialogue_id: d.id,
        id: x.id,
        position: lPos,
        role_id: x.roleId,
        cue_id: x.cueId ?? null,
        zh: x.zh,
        pinyin: x.pinyin ?? null,
        ko: x.ko ?? null,
        start_time: x.start,
        end_time: x.end,
      }),
    );
  });
  return out;
};

const byPosition = (a: Row, b: Row) => Number(a.position) - Number(b.position);
const opt = <K extends string>(key: K, v: unknown) => (v === null || v === undefined ? {} : ({ [key]: v } as Record<K, unknown>));

/** lessons 행 + 회화 행들 → 기존 Lesson 객체 (관리 칸 제외) */
export const lessonFromRows = (row: Row, dRows: Row[], rRows: Row[], lRows: Row[]): Lesson => {
  const dialogues: LessonDialogue[] = dRows
    .filter((d) => d.lesson_id === row.id)
    .sort(byPosition)
    .map((d) => ({
      id: String(d.id),
      title: String(d.title),
      situation: String(d.situation),
      roles: rRows
        .filter((r) => r.dialogue_id === d.id)
        .sort(byPosition)
        .map((r) => ({ id: String(r.id), name: String(r.name) })),
      lines: lRows
        .filter((x) => x.dialogue_id === d.id)
        .sort(byPosition)
        .map(
          (x) =>
            ({
              id: String(x.id),
              roleId: String(x.role_id),
              ...opt("cueId", x.cue_id),
              zh: String(x.zh),
              ...opt("pinyin", x.pinyin),
              ...opt("ko", x.ko),
              start: Number(x.start_time),
              end: Number(x.end_time),
            }) as DialogueLine,
        ),
      status: d.status === "published" ? "published" : "draft",
    }));
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    week: Number(row.week),
    title: String(row.title),
    description: String(row.description),
    direction: row.direction as Lesson["direction"],
    level: String(row.level),
    status: row.status as Lesson["status"],
    video: {
      youtubeUrl: String(row.youtube_url),
      youtubeId: String(row.youtube_id),
      startTime: Number(row.start_time),
      endTime: Number(row.end_time),
    },
    ...opt("captionMask", row.caption_mask),
    ...opt("subtitlePosition", row.subtitle_position),
    ...opt("source", row.source),
    script: row.script as Lesson["script"],
    ...opt("content", row.content),
    ...opt("draft", row.draft),
    ...(dialogues.length ? { dialogues } : {}),
    ...opt("episodeId", row.episode_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  } as Lesson;
};

/** 화면에 내려줄 Lesson: 동시 편집 확인용 version과 마지막 수정자 표시를 붙인다. */
export const withLessonMeta = (lesson: Lesson, row: Row): Lesson => ({
  ...lesson,
  version: Number(row.version),
  updatedByLabel: (row.updated_by_label as string | null) ?? null,
});

/** PostgREST 중첩 조회 결과 (lessons + lesson_dialogues(dialogue_roles, dialogue_lines)) */
export const LESSON_SELECT = "*, lesson_dialogues(*, dialogue_roles(*), dialogue_lines(*))";

export const lessonsFromEmbedded = (rows: Row[]): Lesson[] =>
  rows.map((r) => {
    const { lesson_dialogues, ...row } = r;
    const ds = (lesson_dialogues as Row[] | null) ?? [];
    const roles = ds.flatMap((d) => (d.dialogue_roles as Row[] | null) ?? []);
    const lines = ds.flatMap((d) => (d.dialogue_lines as Row[] | null) ?? []);
    return withLessonMeta(lessonFromRows(row, ds, roles, lines), row);
  });

/** save_lesson·admin_save_lesson의 PT409 DETAIL → 화면용 충돌 정보 */
export const lessonConflictFrom = (details: string | undefined | null) => {
  try {
    const d = JSON.parse(details ?? "null") as { currentVersion?: number; updatedAt?: string; updatedByLabel?: string | null } | null;
    return d ? { currentVersion: d.currentVersion ?? null, updatedAt: d.updatedAt ?? null, updatedByLabel: d.updatedByLabel ?? null } : null;
  } catch {
    return null;
  }
};

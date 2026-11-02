// 회화 연습 대사와 자막(cue)의 연결. 자막이 있으면 자막의 최신 값을, 없으면 대사에 저장된 복사본을 쓴다.
import type { DialogueLine, LessonDialogue, SubtitleCue } from "../../content/types";
import { createId } from "../store/localJson";
import { ensureCueIds } from "./subtitles";

export type ResolvedDialogueLine = DialogueLine & {
  /** linked: 자막과 연결됨 / missing: 자막을 찾을 수 없어 복사본을 표시 */
  connection: "linked" | "missing";
  /** 연결은 되어 있지만 자막의 중국어 원문이 비어 복사본을 표시하는 중 (교강사 확인용) */
  sourceEmpty: boolean;
};

/** 표시할 대사 값. 위치(index)가 아니라 cueId로 찾으므로 자막 순서가 바뀌어도 같은 cue를 가리킨다. */
export const resolveDialogueLine = (line: DialogueLine, cues: SubtitleCue[]): ResolvedDialogueLine => {
  const cue = line.cueId ? cues.find((c) => c.id === line.cueId) : undefined;
  if (!cue) return { ...line, connection: "missing", sourceEmpty: false };
  return {
    ...line,
    zh: cue.zh?.trim() ? cue.zh : line.zh,
    pinyin: cue.pinyin || line.pinyin,
    ko: cue.ko || line.ko,
    start: cue.start,
    end: cue.end,
    connection: "linked",
    sourceEmpty: !cue.zh?.trim(),
  };
};

/**
 * 연속된 자막 구간(from~to)으로 준비 중인 회화 연습을 만든다. 고른 cue에만 식별자를 부여하고,
 * 대사에는 지금 자막 값을 복사본으로 남긴다. 화자는 교강사가 정하도록 비워 둔다.
 */
export const createDialogueFromCues = (cues: SubtitleCue[], from: number, to: number) => {
  const indexes = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const withIds = ensureCueIds(cues, indexes);
  const dialogue: LessonDialogue = {
    id: createId("dialogue"),
    title: "",
    situation: "",
    roles: [
      { id: createId("role"), name: "역할 1" },
      { id: createId("role"), name: "역할 2" },
    ],
    lines: indexes.map((i) => {
      const c = withIds[i];
      return {
        id: createId("line"),
        roleId: "",
        cueId: c.id,
        zh: c.zh ?? "",
        ...(c.pinyin ? { pinyin: c.pinyin } : {}),
        ...(c.ko ? { ko: c.ko } : {}),
        start: c.start,
        end: c.end,
      };
    }),
    status: "draft",
  };
  return { cues: withIds, dialogue };
};

export const addDialogueRole = (dialogue: LessonDialogue): LessonDialogue => ({
  ...dialogue,
  roles: [...dialogue.roles, { id: createId("role"), name: `역할 ${dialogue.roles.length + 1}` }],
});

/** 역할 삭제. 그 역할이 지정된 대사가 있으면 조용히 바꾸지 않고 null을 돌려준다. */
export const removeDialogueRole = (dialogue: LessonDialogue, roleId: string): LessonDialogue | null =>
  dialogue.lines.some((l) => l.roleId === roleId)
    ? null
    : { ...dialogue, roles: dialogue.roles.filter((r) => r.id !== roleId) };

/** 번갈아 채우기: 역할을 순서대로 돌아가며 줄에 지정한다. */
export const assignRolesInTurn = (dialogue: LessonDialogue): LessonDialogue =>
  dialogue.roles.length === 0
    ? dialogue
    : {
        ...dialogue,
        lines: dialogue.lines.map((l, i) => ({ ...l, roleId: dialogue.roles[i % dialogue.roles.length].id })),
      };

/** 공개할 수 없는 이유. 준비 중에는 미완성이어도 된다. 학습자료 전체의 공개 조건과는 별개다. */
export const dialoguePublishProblems = (dialogue: LessonDialogue, cues: SubtitleCue[]): string[] => {
  const problems: string[] = [];
  if (!dialogue.title.trim()) problems.push("제목을 입력해 주세요.");
  if (!dialogue.situation.trim()) problems.push("상황 설명을 입력해 주세요.");
  if (dialogue.roles.length < 2) problems.push("역할이 2명 이상 있어야 해요.");
  if (dialogue.lines.length < 2) problems.push("대사가 2줄 이상 있어야 해요.");
  const roleIds = new Set(dialogue.roles.map((r) => r.id));
  const unassigned = dialogue.lines.filter((l) => !roleIds.has(l.roleId)).length;
  if (unassigned > 0) problems.push(`화자가 지정되지 않은 대사가 ${unassigned}줄 있어요.`);
  // 학생에게 실제로 표시될 값으로 판단한다. (현재 자막 → 복사본 순)
  if (dialogue.lines.some((l) => !resolveDialogueLine(l, cues).zh?.trim())) problems.push("중국어 대사가 비어 있는 줄이 있어요.");
  return problems;
};

/** 자막을 찾을 수 없는 대사 수 */
export const dialogueMissingCount = (dialogue: LessonDialogue, cues: SubtitleCue[]) =>
  dialogue.lines.filter((l) => resolveDialogueLine(l, cues).connection === "missing").length;

/** 자막 원문이 비어 확인이 필요한 대사 수 */
export const dialogueSourceEmptyCount = (dialogue: LessonDialogue, cues: SubtitleCue[]) =>
  dialogue.lines.filter((l) => resolveDialogueLine(l, cues).sourceEmpty).length;

/** 학생에게 보여줄 수 있는 회화 연습: 공개 상태이고 공개 조건도 채운 것 */
export const isDialogueStudentVisible = (dialogue: LessonDialogue, cues: SubtitleCue[]) =>
  dialogue.status === "published" && dialoguePublishProblems(dialogue, cues).length === 0;

export const studentDialogues = (dialogues: LessonDialogue[] | undefined, cues: SubtitleCue[]) =>
  (dialogues ?? []).filter((d) => isDialogueStudentVisible(d, cues));

/** 처음 열 회화 연습: 하나뿐이면 바로 열고, 여럿이면 고르게 한다. */
export const initialDialogueId = (dialogues: LessonDialogue[]) => (dialogues.length === 1 ? dialogues[0].id : null);

export const lineTurn = (line: Pick<DialogueLine, "roleId">, roleId: string): "mine" | "other" =>
  line.roleId === roleId ? "mine" : "other";

/** 장면 보기 구간: 첫 줄의 시작 ~ 마지막 줄의 끝 */
export const dialogueSceneRange = (lines: Pick<DialogueLine, "start" | "end">[]) =>
  lines.length ? { start: lines[0].start, end: lines[lines.length - 1].end } : null;

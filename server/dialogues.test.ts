// 회화 연습 데이터와 자막 cue 식별자 검증 (npm test)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDialogueRole,
  assignRolesInTurn,
  createDialogueFromCues,
  dialogueMissingCount,
  dialoguePublishProblems,
  dialogueSceneRange,
  dialogueSourceEmptyCount,
  initialDialogueId,
  isDialogueStudentVisible,
  lineTurn,
  removeDialogueRole,
  resolveDialogueLine,
  studentDialogues,
} from "../src/app/lib/dialogues";
import {
  createCueId,
  ensureCueIds,
  fillCueField,
  lessonPublishProblems,
  mergeTrack,
  parseSrt,
  playbackCues,
  retimeCue,
  scriptStatus,
  updateCue,
} from "../src/app/lib/subtitles";
import { holdsPracticeEnd, reachedLessonEnd, segmentPosition, watchedStep } from "../src/app/learning/useVideoClock";
import { isRecordingSupported, pickRecordingMimeType, recordingErrorKind } from "../src/app/lib/voiceRecording";
import { SEED_LESSONS, captionMaskToSave, resolveCaptionMask, resolveLessonContent } from "../src/content/lessons";
import type { DialogueLine, SubtitleCue } from "../src/content/types";

const cue = (id: string | undefined, start: number, zh: string, ko?: string): SubtitleCue => ({
  ...(id ? { id } : {}),
  start,
  end: start + 1,
  zh,
  ...(ko ? { ko } : {}),
});

const line = (over: Partial<DialogueLine> = {}): DialogueLine => ({
  id: "l1",
  roleId: "r1",
  cueId: "cue-a",
  zh: "你好",
  pinyin: "nǐ hǎo",
  ko: "안녕",
  start: 1,
  end: 2,
  ...over,
});

const srt = "1\n00:00:01,000 --> 00:00:02,000\n新的\n\n2\n00:00:05,000 --> 00:00:06,000\n字幕\n";

test("A. 식별자 없는 기존 cue도 그대로 처리된다", () => {
  const cues = [cue(undefined, 1, "一"), cue(undefined, 2, "二")];
  assert.equal(scriptStatus(cues, null, "zh").timedCount, 2);
  assert.deepEqual(updateCue(cues, 0, { zh: "三" })[0], { start: 1, end: 2, zh: "三" });
  assert.deepEqual(mergeTrack(cues, [], "ko"), cues.map((c) => ({ ...c, ko: undefined })));
  assert.equal(resolveDialogueLine(line({ cueId: undefined }), cues).connection, "missing");
});

test("B. 새 cue 식별자는 서로 겹치지 않는다", () => {
  const ids = Array.from({ length: 2000 }, () => createCueId());
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("cue-")));
});

test("기존 cue에는 지정한 줄에만 식별자를 부여하고, 있는 값은 바꾸지 않는다", () => {
  const cues = [cue(undefined, 1, "一"), cue("cue-keep", 2, "二"), cue(undefined, 3, "三")];
  const next = ensureCueIds(cues, [1, 2, 99]);
  assert.equal(next[0].id, undefined);
  assert.equal(next[1].id, "cue-keep");
  assert.ok(next[2].id);
  assert.equal(cues[2].id, undefined); // 원본은 그대로
  // 부여할 것이 없으면 같은 배열 (저장할 변경으로 잡히지 않는다)
  assert.equal(ensureCueIds(next, [1, 2]), next);
});

test("표시 경로에서는 식별자를 만들지 않는다", () => {
  const lesson = SEED_LESSONS.find((l) => l.id === "course-university-w01")!;
  const plainSynced = {
    ...lesson,
    script: { ...lesson.script, plain: { lang: "zh" as const, lines: [{ text: "一", start: 1 }], updatedAt: "2026-11-02T00:00:00.000Z" } },
  };
  assert.ok(playbackCues(lesson).every((c) => !c.id));
  assert.ok(playbackCues(plainSynced).every((c) => !c.id));
  assert.ok(lesson.script.cues.every((c) => !c.id)); // 회화 연습이 없는 자막에는 식별자를 미리 넣지 않았다.
});

test("C. 내용·시간을 고쳐도 식별자가 유지된다", () => {
  const cues = [cue("cue-a", 1, "一", "하나")];
  for (const patch of [{ zh: "二" }, { ko: "둘" }, { pinyin: "èr" }, { start: 0.5 }, { end: 9 }]) {
    assert.equal(updateCue(cues, 0, patch)[0].id, "cue-a");
  }
  assert.equal(retimeCue(cues, 0, "start", 0.5)[0].id, "cue-a");
  assert.equal(retimeCue(cues, 0, "end", 9)[0].id, "cue-a");
});

test("D. 시간을 고쳐 순서가 바뀌면 식별자가 cue와 함께 움직인다", () => {
  const cues = [cue("cue-a", 1, "一"), cue("cue-b", 2, "二"), cue("cue-c", 3, "三")];
  const next = retimeCue(cues, 0, "start", 5);
  assert.deepEqual(next.map((c) => c.id), ["cue-b", "cue-c", "cue-a"]);
  assert.equal(next[2].zh, "一");
  assert.equal(resolveDialogueLine(line(), next).zh, "一");
  assert.equal(resolveDialogueLine(line(), next).start, 5);
});

test("E. 번역·병음을 채워도 식별자가 유지된다", () => {
  const cues = [cue("cue-a", 1, "一"), cue(undefined, 2, "二")];
  const ko = fillCueField(cues, [{ index: 0 }, { index: 1 }], "ko", new Map([[1, "하나"], [2, "둘"]]));
  assert.equal(ko.count, 2);
  assert.equal(ko.cues[0].id, "cue-a");
  assert.equal(ko.cues[0].ko, "하나");
  assert.equal(ko.cues[1].id, undefined);
  const py = fillCueField(ko.cues, [{ index: 0 }], "pinyin", new Map([[1, "yī"]]));
  assert.equal(py.cues[0].id, "cue-a");
  assert.equal(py.cues[0].pinyin, "yī");
});

test("F. 연결된 대사는 복사본이 아니라 현재 자막 값을 보여준다", () => {
  const current: SubtitleCue = { id: "cue-a", start: 3, end: 4, zh: "你好呀", ko: "안녕하세요", pinyin: "nǐ hǎo ya" };
  const r = resolveDialogueLine(line(), [current]);
  assert.equal(r.connection, "linked");
  assert.deepEqual([r.zh, r.ko, r.pinyin, r.start, r.end], ["你好呀", "안녕하세요", "nǐ hǎo ya", 3, 4]);
  // 자막에 비어 있는 값은 복사본으로 채운다.
  assert.equal(resolveDialogueLine(line(), [{ id: "cue-a", start: 3, end: 4, zh: "你好呀" }]).ko, "안녕");
});

test("G. 자막이 삭제되면 대사는 남고 복사본과 연결 끊김 상태를 돌려준다", () => {
  const source = line();
  const r = resolveDialogueLine(source, [cue("cue-other", 9, "别的")]);
  assert.equal(r.connection, "missing");
  assert.deepEqual([r.id, r.roleId, r.cueId, r.zh, r.pinyin, r.ko, r.start, r.end], [
    "l1", "r1", "cue-a", "你好", "nǐ hǎo", "안녕", 1, 2,
  ]);
});

test("H. 새 SRT로 자막을 바꾸면 이전 참조는 연결 끊김이 될 수 있다", () => {
  const cues = [cue("cue-a", 1, "旧的")];
  const next = mergeTrack(cues, parseSrt(srt), "zh");
  // 같은 언어 원문만 있던 cue는 새 자막으로 교체되며, 시간이 겹친 cue는 mergeTrack 규칙대로 합쳐진다.
  assert.equal(next.length, 2);
  const elsewhere = line({ cueId: "cue-gone" });
  assert.equal(resolveDialogueLine(elsewhere, next).connection, "missing");
  assert.equal(next[1].id, undefined);

  // 시간이 겹치지 않으면 예전 cue는 사라지고 참조가 끊긴다.
  const moved = mergeTrack([cue("cue-a", 50, "旧的")], parseSrt(srt), "zh");
  assert.equal(moved.some((c) => c.id === "cue-a"), false);
  assert.equal(resolveDialogueLine(line(), moved).connection, "missing");
});

test("I. dialogues가 없는 강의자료는 기존과 똑같이 동작한다", () => {
  const lesson = SEED_LESSONS.find((l) => l.id === "course-university-w01")!;
  assert.equal(lesson.dialogues, undefined);
  assert.deepEqual(lessonPublishProblems(lesson), []);
  const withDialogue = { ...lesson, dialogues: [] };
  assert.deepEqual(resolveLessonContent(withDialogue), resolveLessonContent(lesson));
  assert.deepEqual(lessonPublishProblems(withDialogue), []);
  assert.deepEqual(playbackCues(withDialogue), playbackCues(lesson));
  assert.deepEqual(SEED_LESSONS.filter((l) => "dialogues" in l).map((l) => l.id), ["course-campus-w01"]);
});

const threeCues = () => [
  cue(undefined, 1, "一", "하나"),
  { ...cue(undefined, 2, "二", "둘"), pinyin: "èr" },
  cue(undefined, 3, "三"),
  cue(undefined, 4, "四"),
];

test("회화 연습 생성: 고른 구간의 cue에만 식별자를 부여하고 복사본을 남긴다", () => {
  const cues = threeCues();
  const { cues: next, dialogue } = createDialogueFromCues(cues, 1, 2);
  assert.deepEqual(next.map((c) => !!c.id), [false, true, true, false]);
  assert.ok(cues.every((c) => !c.id)); // 원본은 그대로
  assert.deepEqual(dialogue.lines.map((l) => l.cueId), [next[1].id, next[2].id]);
  const first = dialogue.lines[0];
  assert.deepEqual([first.zh, first.pinyin, first.ko, first.start, first.end], ["二", "èr", "둘", 2, 3]);
  assert.equal("pinyin" in dialogue.lines[1], false);
  assert.equal(dialogue.status, "draft");
  assert.ok(dialogue.lines.every((l) => l.roleId === "")); // 화자를 추측하지 않는다.

  // 자막을 고치면 복사본은 그대로이고, 표시는 최신 값을 따른다.
  const edited = updateCue(next, 1, { zh: "二二" });
  assert.equal(first.zh, "二");
  assert.equal(resolveDialogueLine(first, edited).zh, "二二");
  // 자막을 지우면 복사본으로 돌아가고, 되돌리면 다시 연결된다.
  const removed = next.filter((_, i) => i !== 1);
  assert.equal(resolveDialogueLine(first, removed).connection, "missing");
  assert.equal(resolveDialogueLine(first, removed).zh, "二");
  assert.equal(dialogueMissingCount(dialogue, removed), 1);
  assert.equal(dialogueMissingCount(dialogue, next), 0);
  assert.equal(resolveDialogueLine(first, next).connection, "linked");
});

test("회화 연습 공개 조건: 준비 중은 미완성 허용, 공개에는 제목·상황·역할 2명·2줄·화자 지정 필요", () => {
  const { dialogue } = createDialogueFromCues(threeCues(), 0, 1);
  // 새 회화 연습은 미완성 상태로 만들어진다.
  assert.equal(dialogue.status, "draft");
  assert.deepEqual(dialoguePublishProblems(dialogue, []).length, 3);

  const named = { ...dialogue, title: "제목", situation: "상황" };
  assert.equal(dialoguePublishProblems(named, []).length, 1);
  const ready = assignRolesInTurn(named);
  assert.deepEqual(dialoguePublishProblems(ready, []), []);

  assert.equal(dialoguePublishProblems({ ...ready, title: " " }, []).length, 1);
  assert.equal(dialoguePublishProblems({ ...ready, situation: "" }, []).length, 1);
  assert.equal(dialoguePublishProblems({ ...ready, lines: ready.lines.slice(0, 1) }, []).length, 1);
  // 없는 역할을 가리키는 줄은 미지정으로 본다.
  const ghost = { ...ready, lines: [{ ...ready.lines[0], roleId: "role-gone" }, ready.lines[1]] };
  assert.equal(dialoguePublishProblems(ghost, []).length, 1);
  assert.ok(dialoguePublishProblems({ ...ready, roles: ready.roles.slice(0, 1) }, []).length >= 1);
});

test("역할: 추가·번갈아 지정·지정된 역할은 삭제 불가", () => {
  const { dialogue } = createDialogueFromCues(threeCues(), 0, 3);
  const three = addDialogueRole(dialogue);
  assert.equal(three.roles.length, 3);
  assert.equal(new Set(three.roles.map((r) => r.id)).size, 3);

  const turns = assignRolesInTurn(dialogue);
  const [a, b] = dialogue.roles.map((r) => r.id);
  assert.deepEqual(turns.lines.map((l) => l.roleId), [a, b, a, b]);

  assert.equal(removeDialogueRole(turns, a), null); // 지정된 역할은 지우지 않는다.
  const free = removeDialogueRole(three, three.roles[2].id);
  assert.equal(free?.roles.length, 2);
  assert.equal(assignRolesInTurn({ ...dialogue, roles: [] }).lines[0].roleId, "");
});

test("회화 연습이 미완성이어도 학습자료 공개 조건에는 영향이 없다", () => {
  const lesson = SEED_LESSONS.find((l) => l.id === "course-campus-w01")!;
  const { dialogue } = createDialogueFromCues(lesson.script.cues, 0, 1);
  const withDraft = { ...lesson, dialogues: [dialogue] };
  assert.deepEqual(lessonPublishProblems(withDraft), []);
  assert.deepEqual(resolveLessonContent(withDraft), resolveLessonContent(lesson));
  assert.deepEqual(playbackCues({ ...withDraft, script: lesson.script }), playbackCues(lesson));
  // 저장 후 다시 읽어도 내용과 연결이 그대로다.
  const reloaded = JSON.parse(JSON.stringify(createDialogueFromCues(threeCues(), 0, 1)));
  assert.equal(resolveDialogueLine(reloaded.dialogue.lines[0], reloaded.cues).connection, "linked");
  assert.deepEqual(dialoguePublishProblems(reloaded.dialogue, []).length, 3);
  assert.ok(dialoguePublishProblems(dialogue, []).length > 0);
});

const readyDialogue = () => {
  const { cues, dialogue } = createDialogueFromCues(threeCues(), 0, 1);
  return { cues, dialogue: { ...assignRolesInTurn(dialogue), title: "제목", situation: "상황", status: "published" as const } };
};

test("학생 노출: 공개이고 조건을 채운 회화 연습만 보인다", () => {
  const { dialogue } = readyDialogue();
  assert.equal(isDialogueStudentVisible(dialogue, []), true);
  assert.equal(isDialogueStudentVisible({ ...dialogue, status: "draft" }, []), false);
  assert.equal(isDialogueStudentVisible({ ...dialogue, title: "" }, []), false);
  const noRole = { ...dialogue, lines: dialogue.lines.map((l) => ({ ...l, roleId: "" })) };
  assert.equal(isDialogueStudentVisible(noRole, []), false);
  assert.deepEqual(studentDialogues([{ ...dialogue, status: "draft" }, noRole, dialogue], []), [dialogue]);
});

test("탭·선택 판단: 0개면 탭 없음, 1개면 바로 열고 여러 개면 고르게 한다", () => {
  const { dialogue } = readyDialogue();
  assert.deepEqual(studentDialogues(undefined, []), []);
  assert.deepEqual(studentDialogues([], []), []);
  assert.equal(initialDialogueId([]), null);
  assert.equal(initialDialogueId([dialogue]), dialogue.id);
  assert.equal(initialDialogueId([dialogue, { ...dialogue, id: "other" }]), null);
});

test("현재 자막 원문이 비면 연결은 유지하고 복사본을 보여준다", () => {
  const { cues, dialogue } = readyDialogue();
  const first = dialogue.lines[0];
  assert.equal(resolveDialogueLine(first, cues).sourceEmpty, false);
  for (const zh of [undefined, "", "  "]) {
    const emptied = updateCue(cues, 0, { zh });
    const r = resolveDialogueLine(first, emptied);
    assert.equal(r.connection, "linked");
    assert.equal(r.sourceEmpty, true);
    assert.equal(r.zh, "一");
    assert.equal(dialogueSourceEmptyCount(dialogue, emptied), 1);
    assert.equal(dialogueMissingCount(dialogue, emptied), 0);
  }
  // 자막이 실제로 사라진 경우만 missing이다.
  const removed = resolveDialogueLine(first, cues.slice(1));
  assert.equal(removed.connection, "missing");
  assert.equal(removed.sourceEmpty, false);
  assert.equal(removed.zh, "一");
  // SRT를 다시 적용해 원문 칸이 비어도 같다.
  const merged = mergeTrack(cues, [], "zh");
  assert.equal(resolveDialogueLine(first, merged).connection, "linked");
  assert.equal(resolveDialogueLine(first, merged).zh, "一");
});

test("차례 구분·장면 구간은 현재 자막 값을 따른다", () => {
  const { cues, dialogue } = readyDialogue();
  const [a, b] = dialogue.roles.map((r) => r.id);
  assert.equal(lineTurn(dialogue.lines[0], a), "mine");
  assert.equal(lineTurn(dialogue.lines[0], b), "other");
  const retimed = updateCue(cues, 1, { end: 9 });
  assert.deepEqual(dialogueSceneRange(dialogue.lines.map((l) => resolveDialogueLine(l, retimed))), { start: 1, end: 9 });
  assert.equal(dialogueSceneRange([]), null);
});

test("구간 재생 위치: 끝에 닿으면 멈추고 멀리 옮기면 추적만 끝낸다", () => {
  const seg = { start: 10, end: 12 };
  assert.equal(segmentPosition(10, seg), "inside");
  assert.equal(segmentPosition(11.9, seg), "inside");
  assert.equal(segmentPosition(12, seg), "end");
  assert.equal(segmentPosition(13, seg), "end");
  assert.equal(segmentPosition(40, seg), "left");
  assert.equal(segmentPosition(2, seg), "left");
});

test("빈 중국어 대사: 학생에게 표시될 값이 없을 때만 공개할 수 없다", () => {
  const { cues, dialogue } = readyDialogue();
  const EMPTY = "중국어 대사가 비어 있는 줄이 있어요.";
  assert.deepEqual(dialoguePublishProblems(dialogue, cues), []);
  // 현재 자막이 비어도 복사본이 있으면 공개할 수 있다.
  assert.deepEqual(dialoguePublishProblems(dialogue, updateCue(cues, 0, { zh: "" })), []);
  // 자막이 사라져도 복사본이 있으면 공개할 수 있다.
  assert.deepEqual(dialoguePublishProblems(dialogue, cues.slice(1)), []);
  // 복사본이 비어도 현재 자막이 있으면 공개할 수 있다.
  const noSnapshot = { ...dialogue, lines: dialogue.lines.map((l, i) => (i === 0 ? { ...l, zh: "" } : l)) };
  assert.deepEqual(dialoguePublishProblems(noSnapshot, cues), []);
  // 둘 다 없으면 공개할 수 없고 학생에게도 보이지 않는다.
  for (const current of [updateCue(cues, 0, { zh: " " }), cues.slice(1)]) {
    assert.deepEqual(dialoguePublishProblems(noSnapshot, current), [EMPTY]);
    assert.equal(isDialogueStudentVisible(noSnapshot, current), false);
    assert.deepEqual(studentDialogues([noSnapshot], current), []);
  }
  assert.equal(isDialogueStudentVisible(noSnapshot, cues), true);
  // 학습자료 전체의 공개 조건과는 별개다.
  const lesson = SEED_LESSONS.find((l) => l.id === "course-campus-w01")!;
  const withEmpty = { ...lesson, dialogues: [noSnapshot] };
  assert.deepEqual(lessonPublishProblems(withEmpty), []);
});

test("녹음 형식: 지원되는 첫 형식을 고르고 없으면 브라우저 기본값을 쓴다", () => {
  const only = (...types: string[]) => (t: string) => types.includes(t);
  assert.equal(pickRecordingMimeType(only("audio/webm;codecs=opus", "audio/webm", "audio/mp4")), "audio/webm;codecs=opus");
  assert.equal(pickRecordingMimeType(only("audio/mp4")), "audio/mp4");
  assert.equal(pickRecordingMimeType(only("audio/ogg;codecs=opus")), "audio/ogg;codecs=opus");
  assert.equal(pickRecordingMimeType(() => false), undefined);
});

test("녹음 지원 판정과 오류 구분", () => {
  const getUserMedia = () => undefined;
  const MediaRecorder = function () {};
  const navigator = { mediaDevices: { getUserMedia } };
  assert.equal(isRecordingSupported({ MediaRecorder, navigator }), true);
  assert.equal(isRecordingSupported({ navigator }), false);
  assert.equal(isRecordingSupported({ MediaRecorder, navigator: {} }), false);
  assert.equal(isRecordingSupported({ MediaRecorder }), false);
  assert.equal(recordingErrorKind({ name: "NotAllowedError" }), "denied");
  assert.equal(recordingErrorKind({ name: "NotFoundError" }), "no-mic");
  assert.equal(recordingErrorKind(new Error("x")), "failed");
  assert.equal(recordingErrorKind(null), "failed");
});

test("시청 기록: 회화 연습 재생은 빼고 끝나면 바로 일반 기록으로 돌아간다", () => {
  const base = { playing: true, practice: false, startTime: 3, endTime: 100, maxStep: 1.5 };
  assert.deepEqual(watchedStep(10, 10.2, base), [10, 10.2]);
  assert.equal(watchedStep(10, 10.2, { ...base, practice: true }), null);
  assert.deepEqual(watchedStep(10.2, 10.4, base), [10.2, 10.4]); // 연습 직후 복구
  assert.equal(watchedStep(10, 10.2, { ...base, playing: false }), null);
  assert.equal(watchedStep(null, 10, base), null);
  assert.equal(watchedStep(10, 50, base), null); // 이동
  assert.deepEqual(watchedStep(99.9, 100.1, base), [99.9, 100]);
  assert.equal(watchedStep(100, 100.2, base), null);
});

test("학습 완료: 일반 재생은 구간 끝에서 완료, 회화 연습은 완료되지 않는다", () => {
  const end = { completed: false, ready: true, time: 100, endTime: 100, practiceHeld: false };
  assert.equal(reachedLessonEnd(end), true);
  assert.equal(reachedLessonEnd({ ...end, time: 99 }), false);
  assert.equal(reachedLessonEnd({ ...end, completed: true }), false);
  assert.equal(reachedLessonEnd({ ...end, practiceHeld: true }), false);

  const state = { practice: true, playing: true, time: 100, endTime: 100 };
  assert.equal(holdsPracticeEnd(false, state), false);
  assert.equal(holdsPracticeEnd(true, { ...state, time: 90 }), true); // 끝에 닿기 전 재생 중
  assert.equal(holdsPracticeEnd(true, state), true);
  assert.equal(holdsPracticeEnd(true, { ...state, practice: false, playing: false }), true); // 멈춰 있음
  assert.equal(holdsPracticeEnd(true, { ...state, practice: false, playing: true }), false); // 직접 다시 재생
  assert.equal(holdsPracticeEnd(true, { ...state, practice: false, playing: false, time: 90 }), false); // 구간 안으로 복귀
});

test("대표 W1: 첫 회화 연습이 공개 가능하고 선택한 자막에만 식별자가 있다", () => {
  const lesson = SEED_LESSONS.find((l) => l.id === "course-campus-w01")!;
  const { cues } = lesson.script;
  const [dialogue] = lesson.dialogues!;
  assert.equal(lesson.dialogues!.length, 1);
  assert.equal(dialogue.status, "published");
  assert.equal(dialogue.roles.length, 2);
  assert.equal(dialogue.lines.length, 12);
  assert.deepEqual(studentDialogues(lesson.dialogues, cues), [dialogue]);
  assert.equal(cues.length, 143);
  assert.deepEqual(cues.flatMap((c, i) => (c.id ? [i] : [])), Array.from({ length: 12 }, (_, i) => 53 + i));
  assert.deepEqual(dialogue.lines.map((l) => l.cueId), cues.slice(53, 65).map((c) => c.id));
  assert.equal(dialogueMissingCount(dialogue, cues), 0);
  assert.equal(dialogueSourceEmptyCount(dialogue, cues), 0);
  // 복사본은 저장 시점의 자막과 같다.
  dialogue.lines.forEach((l, i) => {
    const c = cues[53 + i];
    assert.deepEqual([l.zh, l.pinyin, l.ko, l.start, l.end], [c.zh, c.pinyin, c.ko, c.start, c.end]);
  });
  // 회화 연습은 W1 하나에만 있다.
  assert.equal(SEED_LESSONS.filter((l) => l.dialogues?.length).length, 1);
  assert.equal(SEED_LESSONS.filter((l) => l.script.cues.some((c) => c.id)).length, 1);
});

test("자막 가리기: 편집 화면에서 바꾸지 않고 저장하면 원래 저장값을 그대로 둔다", () => {
  const lesson = SEED_LESSONS.find((l) => l.id === "course-campus-w01")!;
  const stored = { enabled: true, top: 78, height: 12, width: 70 };
  // 화면에는 자막 위치 preset(low)이 적용된 값이 보인다.
  const shown = { ...resolveCaptionMask({ ...lesson, captionMask: stored })! };
  assert.deepEqual(shown, { enabled: true, top: 85, height: 12, width: 66 });
  const base = { stored, shown };
  // Case 1: 바꾸지 않음 → 원래 값
  assert.equal(captionMaskToSave(base, { ...shown }), stored);
  // 켰다 끄고 다시 켜서 같은 값이면 바꾸지 않은 것으로 본다.
  assert.equal(captionMaskToSave(base, { ...shown, enabled: true }), stored);
  // Case 2: 직접 바꿈 → 새 값 (슬라이더는 custom을 붙인다)
  const moved = { ...shown, top: 80, custom: true };
  assert.deepEqual(captionMaskToSave(base, moved), moved);
  const off = { ...shown, enabled: false };
  assert.deepEqual(captionMaskToSave(base, off), off);
  // 저장값이 없던 강의자료: 바꾸지 않으면 계속 없음, 켜면 저장
  const fresh = { stored: undefined, shown: { enabled: false, top: 78, height: 12, width: 70 } };
  assert.equal(captionMaskToSave(fresh, fresh.shown), undefined);
  assert.equal(captionMaskToSave(fresh, { ...fresh.shown, top: 60 }), undefined); // 꺼진 채 위치만 바뀐 경우는 기존처럼 저장하지 않음
  assert.deepEqual(captionMaskToSave(fresh, { ...fresh.shown, enabled: true }), { ...fresh.shown, enabled: true });
});

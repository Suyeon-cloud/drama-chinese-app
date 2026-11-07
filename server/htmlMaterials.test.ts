// 주차별 보충 자료 — HTML 학습자료 (4단계, npm test). 규칙 단위 검사 + JSON 모드 실제 API(임시 폴더).
// 실제 data/db.json·Supabase는 건드리지 않는다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import type { LearnerProfile, WeekMaterial, WeekMaterialHtml } from "../src/app/store/models";
import {
  MATERIAL_HTML_CSP,
  MATERIAL_HTML_MAX_BYTES,
  htmlByteLength,
  materialHtmlDocument,
  materialHtmlExternalCount,
  materialHtmlFileName,
  materialHtmlProblem,
  materialShareHash,
  srcdocAnchors,
} from "../src/content/materialHtml";
import { buildLessonDeck, deckToReviewHtml, reviewTitle } from "../src/content/lessonDeck";
import { SEED_LESSONS, resolveLessonContent } from "../src/content/lessons";
import { playbackCues } from "../src/app/lib/subtitles";
import { createApi, readApiEnv } from "./api";
import { openDb, type Db } from "./db";
import { SAMPLE_FILES } from "./testZip";

/* ───────── 1) 규칙 (단위) ───────── */

test("HTML 검사: 스크립트·이벤트 속성·위험한 주소·끼워 넣기 요소는 거부, 표·내장 이미지·스타일·본문 글자 속 예시는 허용", () => {
  const okHtml = [
    "<h1>第三课</h1><table><tr><th>표현</th><td>你好</td></tr></table>",
    '<style>td{color:red}</style><p style="font-size:20px">글자</p><img src="data:image/png;base64,iVBORw0KGgo=" alt="그림">',
    "<pre>button.onclick = go; // 예시 코드</pre><p>onload=라는 글자는 본문이라 괜찮다</p>",
    '<a href="https://example.com/a">외부 링크</a>',
    "<!doctype html><html><head><title>t</title></head><body><p>a</p></body></html>",
  ];
  for (const h of okHtml) assert.equal(materialHtmlProblem(h), null, h);
  const bad = [
    "<script>alert(1)</script>",
    "<SCRIPT src=x></SCRIPT>",
    "< script>x</script>",
    "<img src=x onerror=alert(1)>",
    '<div ONCLICK="x()">a</div>',
    '<svg/onload=alert(1)>',
    '<a href="javascript:alert(1)">a</a>',
    '<a href=" JaVaScRiPt :alert(1)">a</a>',
    '<iframe src="https://example.com"></iframe>',
    "<object data=x></object>",
    "<embed src=x>",
    '<base href="https://evil.example/">',
    '<form action="https://evil.example"><input></form>',
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    '<a href="data:text/html,<b>x</b>">a</a>',
    '<p style="width:expression(alert(1))">a</p>',
    '<div srcdoc="x"></div>',
  ];
  for (const h of bad) assert.notEqual(materialHtmlProblem(h), null, h);
  assert.notEqual(materialHtmlProblem(""), null);
  assert.notEqual(materialHtmlProblem("   "), null);
  assert.notEqual(materialHtmlProblem(42), null);
  // 크기: UTF-8 바이트 기준 (한글 1자 = 3바이트)
  const limit = "가".repeat(Math.floor(MATERIAL_HTML_MAX_BYTES / 3));
  assert.equal(htmlByteLength(limit) <= MATERIAL_HTML_MAX_BYTES, true);
  assert.equal(materialHtmlProblem(limit), null);
  assert.match(materialHtmlProblem(`${limit}가`) ?? "", /2MB/);
  // 외부 리소스 경고 수 (일반 링크는 세지 않는다)
  assert.equal(materialHtmlExternalCount('<img src="https://a.b/x.png"><link href="//c.d/s.css" rel="stylesheet"><a href="https://e.f">x</a><style>@import "x.css"; p{background:url(https://g.h/i.png)}</style>'), 4);
  assert.equal(materialHtmlExternalCount('<img src="data:image/png;base64,AA">'), 0);
});

test("HTML 문서: 맨 앞에 charset·CSP, 원본 head는 CSP 뒤·body는 body 안, 제목 이스케이프, 파일 이름·공유 주소", () => {
  const doc = materialHtmlDocument('표현 <정리> & "1"', '<!DOCTYPE html><html lang="zh"><head><meta charset="gbk"><title>원래</title><style>p{color:red}</style></head><body class="x"><p>你好</p></body></html>');
  assert.ok(doc.startsWith("<!doctype html>\n"));
  const head = doc.slice(0, doc.indexOf("</head>"));
  assert.ok(head.indexOf('<meta charset="utf-8">') < head.indexOf("Content-Security-Policy"));
  assert.ok(head.indexOf("Content-Security-Policy") < head.indexOf("p{color:red}"), "CSP가 원본 스타일보다 먼저");
  assert.ok(head.includes(`content="${MATERIAL_HTML_CSP}"`));
  assert.match(MATERIAL_HTML_CSP, /default-src 'none'/);
  assert.doesNotMatch(MATERIAL_HTML_CSP, /script-src|unsafe-eval|https?:/);
  assert.ok(!doc.includes('charset="gbk"'), "원본 charset 메타는 뺀다");
  assert.ok(!doc.includes("<title>원래</title>"));
  assert.ok(doc.includes("<title>표현 &lt;정리&gt; &amp; &quot;1&quot;</title>"));
  assert.equal([...doc.matchAll(/<html\b/g)].length, 1);
  assert.equal([...doc.matchAll(/<head\b/g)].length, 1);
  assert.equal([...doc.matchAll(/<body\b/g)].length, 1);
  assert.ok(doc.includes('<body class="x">\n<p>你好</p>\n</body>'));
  // head·body 없는 조각
  const frag = materialHtmlDocument("조각", "<p>a</p><style>b{}</style>");
  assert.ok(frag.includes("<body>\n<p>a</p><style>b{}</style>\n</body>"));
  assert.equal(materialHtmlFileName('3과: 표현/정리 "최종" (1)'), "3과 표현 정리 최종 (1).html");
  assert.equal(materialHtmlFileName("关于中韩龙虎俗语的对比研究 (1)"), "关于中韩龙虎俗语的对比研究 (1).html");
  assert.equal(materialHtmlFileName("..."), "학습자료.html");
  assert.equal(materialShareHash("material-abc123"), "#/material?id=material-abc123");
});

test("srcDoc 앵커: 태그 안 href=#…만 about:srcdoc#…로 (따옴표 유무·대소문자·공백), 외부 링크·본문 글자·data-href·다운로드 문서는 그대로", () => {
  assert.equal(srcdocAnchors('<a href="#lines">대사</a>'), '<a href="about:srcdoc#lines">대사</a>');
  assert.equal(srcdocAnchors("<a href='#quiz'>퀴즈</a>"), "<a href='about:srcdoc#quiz'>퀴즈</a>");
  assert.equal(srcdocAnchors("<a href=#top>위로</a>"), "<a href=about:srcdoc#top>위로</a>");
  assert.equal(srcdocAnchors('<A class="x" HREF = "#a">A</A>'), '<A class="x" HREF = "about:srcdoc#a">A</A>');
  assert.equal(srcdocAnchors('<a\nhref="#n">줄바꿈</a>'), '<a\nhref="about:srcdoc#n">줄바꿈</a>');
  // 그대로 두는 것
  for (const keep of [
    '<a href="https://example.com/#frag">외부</a>',
    '<a href="page.html#x">상대 경로</a>',
    '<a href="about:srcdoc#done">이미 바뀐 것</a>',
    '<div data-href="#x">data 속성</div>',
    '<p>본문에 href="#x" 라는 글자가 있어도</p>',
    "<pre>&lt;a href=\"#x\"&gt;예시&lt;/a&gt;</pre>",
    '<h2 id="lines">장면 대사</h2>',
  ]) {
    const out = srcdocAnchors(keep);
    if (keep.startsWith("<p>")) assert.equal(out, keep, "본문 글자");
    else assert.equal(out, keep, keep);
  }
  // 복습 HTML 목차: 표시용만 바뀌고 다운로드 문서(materialHtmlDocument)는 그대로
  const page = '<nav class="toc"><a href="#lines">장면 대사</a> · <a href="#quiz">퀴즈</a></nav><h2 id="lines">장면 대사</h2><h2 id="quiz">퀴즈</h2>';
  const download = materialHtmlDocument("복습", page);
  assert.ok(download.includes('href="#lines"') && !download.includes("about:srcdoc"), "다운로드 문서는 #… 그대로");
  const shown = srcdocAnchors(download);
  assert.ok(shown.includes('href="about:srcdoc#lines"') && shown.includes('href="about:srcdoc#quiz"'));
  assert.ok(shown.includes('<h2 id="lines">'), "대상 id는 그대로");
  assert.equal(shown.replace(/about:srcdoc#/g, "#"), download, "바뀐 곳은 앵커 href뿐");
  assert.equal(materialHtmlProblem(srcdocAnchors(page)), null, "바꾼 본문도 4단계 검사 통과 (about:srcdoc#은 금지 주소가 아님)");
});

/* ───────── 2) JSON 모드 실제 API (임시 폴더) ───────── */

const SECRET = "test-session-secret";
const ADMIN = { ADMIN_ID: "test-admin", ADMIN_PASSWORD: "test-only-password" };
const T = "t@teach.test";
const OTHER = "o@teach.test";
const COURSE = "course-campus";
let dir = "";
let db: Db;
let base = "";
let origin = "";
let adminCookie = "";
let close = () => {};
let untouched = "";

const sign = (session: object) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 3600_000 })).toString("base64url");
  return `zhuiju_sid=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};
const google = (email: string, id = email) => sign({ k: "google", id, email });
const learner = (id: string) => google(`${id}@learn.test`, id);
const call = async <R = unknown>(method: string, p: string, cookie?: string, body?: unknown) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as R & { error?: string } };
};
const createHtml = (cookie: string, body: Record<string, unknown>) => call<WeekMaterial>("POST", `/courses/${COURSE}/materials/html`, cookie, body);
const member = (id: string): LearnerProfile => ({
  id,
  googleEmail: `${id}@learn.test`,
  name: id,
  university: "u",
  department: "d",
  grade: "1",
  studentId: `S-${id}`,
  email: `${id}@learn.test`,
  phone: "010",
  avatarColor: "#fff",
  status: "approved",
  profileCompleted: true,
  firstSeenAt: "2026-11-07T00:00:00.000Z",
  lastSeenAt: "2026-11-07T00:00:00.000Z",
  approvedAt: "2026-11-07T00:00:00.000Z",
});
const snapshot = () => JSON.stringify({ lessons: db.data.lessons, progress: db.data.progress, enrollments: db.data.enrollments });

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "zhuiju-html-"));
  db = openDb(dir);
  for (const email of [T, OTHER]) db.data.instructors[email] = { email, source: "local", addedBy: null, addedAt: null };
  for (const id of ["s1", "s2"]) db.data.members[id] = member(id);
  db.save();
  const app = express();
  app.use("/api", createApi(db, readApiEnv({ SESSION_SECRET: SECRET, ...ADMIN })));
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      base = `${origin}/api`;
      close = () => server.close();
      resolve();
    });
  });
  const login = await fetch(`${base}/auth/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: ADMIN.ADMIN_ID, password: ADMIN.ADMIN_PASSWORD }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const section = Object.values(db.data.sections).find((s) => s.courseId === COURSE && s.status === "active")!;
  assert.equal((await call("PUT", `/sections/${section.id}/instructors/${encodeURIComponent(T)}`, adminCookie)).status, 200);
  assert.equal((await call("POST", "/enrollments", learner("s1"), { courseCode: section.code })).status, 200);
  untouched = snapshot();
});

after(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

const PAGE = '<html><head><style>td{border:1px solid}</style></head><body><h1>第三课</h1><table><tr><td>你好</td></tr></table><img src="data:image/png;base64,iVBORw0KGgo="></body></html>';

test("HTML 등록 권한: 로그인 필요, 학생·담당 아닌 교수자 불가, 금지 요소·2MB 초과·서버 칸은 거부", async () => {
  const body = { week: 1, title: "x", html: "<p>a</p>" };
  assert.equal((await createHtml(undefined as unknown as string, body)).status, 401);
  assert.equal((await createHtml(learner("s1"), body)).status, 403);
  assert.equal((await createHtml(google(OTHER), body)).status, 403);
  assert.equal((await createHtml(google(T), { ...body, html: "<p onclick=x()>a</p>" })).status, 400);
  assert.equal((await createHtml(google(T), { ...body, html: "<script>1</script>" })).status, 400);
  assert.equal((await createHtml(google(T), { ...body, html: "가".repeat(Math.floor(MATERIAL_HTML_MAX_BYTES / 3) + 1) })).status, 400);
  assert.equal((await createHtml(google(T), { ...body, html: "" })).status, 400);
  assert.equal((await createHtml(google(T), { ...body, url: "https://example.com" })).status, 400);
  assert.equal((await createHtml(google(T), { ...body, kind: "link" })).status, 400);
  assert.equal((await createHtml(google(T), { ...body, week: 99 })).status, 400);
  assert.equal(Object.values(db.data.weekMaterials).length, 0);
});

test("HTML 열람·내려받기: 학생은 수강 과목의 공개 자료만, 응답 헤더·파일 이름·완전한 문서, 목록에는 본문 없음", async () => {
  const created = await createHtml(google(T), { week: 2, title: "关于中韩龙虎俗语 (1)", html: PAGE });
  assert.equal(created.status, 201);
  const m = created.body;
  assert.equal(m.kind, "html");
  assert.equal(m.status, "draft");
  assert.equal(m.url, "");
  assert.ok(!("html" in m));
  const listed = (await call<WeekMaterial[]>("GET", `/courses/${COURSE}/materials`, google(T))).body;
  assert.ok(listed.some((x) => x.id === m.id) && listed.every((x) => !("html" in x)), "목록에는 본문 없음");

  // 비공개: 교수자·관리자만, 학생·담당 아닌 교수자·로그인 없음은 열람·내려받기 모두 불가
  assert.equal((await call<WeekMaterialHtml>("GET", `/materials/${m.id}/html`, google(T))).body.html, PAGE);
  assert.equal((await call("GET", `/materials/${m.id}/html`, adminCookie)).status, 200);
  for (const cookie of [learner("s1"), learner("s2"), google(OTHER)]) {
    assert.equal((await call("GET", `/materials/${m.id}/html`, cookie)).status, 404);
    assert.equal((await call("GET", `/materials/${m.id}/html?mode=download`, cookie)).status, 404);
  }
  assert.equal((await fetch(`${base}/materials/${m.id}/html?mode=download`)).status, 401);

  // 공개 뒤: 수강생만
  assert.equal((await call("PATCH", `/materials/${m.id}`, google(T), { status: "published" })).status, 200);
  const view = await fetch(`${base}/materials/${m.id}/html`, { headers: { cookie: learner("s1") } });
  assert.equal(view.status, 200);
  assert.equal(view.headers.get("cache-control"), "no-store");
  assert.equal(((await view.json()) as WeekMaterialHtml).html, PAGE);
  assert.equal((await call("GET", `/materials/${m.id}/html`, learner("s2"))).status, 404, "수강하지 않은 학생");
  assert.equal((await call("GET", `/materials/${m.id}/html?mode=download`, google(OTHER))).status, 404, "담당 아닌 교수자");

  const dl = await fetch(`${base}/materials/${m.id}/html?mode=download`, { headers: { cookie: learner("s1") } });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(dl.headers.get("x-content-type-options"), "nosniff");
  assert.equal(dl.headers.get("cache-control"), "no-store");
  assert.equal(dl.headers.get("referrer-policy"), "no-referrer");
  assert.match(dl.headers.get("content-security-policy") ?? "", /^sandbox; default-src 'none'/);
  const disp = dl.headers.get("content-disposition") ?? "";
  assert.match(disp, /^attachment; filename="material\.html"; filename\*=UTF-8''/);
  const raw = disp.slice(disp.indexOf("''") + 2);
  assert.ok(!raw.includes("%25"), `이중 인코딩: ${raw}`);
  assert.ok(!/[ ()'*]/.test(raw), `인코딩되지 않은 글자: ${raw}`);
  assert.equal(decodeURIComponent(raw), "关于中韩龙虎俗语 (1).html", "한 번 풀면 원래 이름");
  const text = await dl.text();
  assert.equal(text, materialHtmlDocument("关于中韩龙虎俗语 (1)", PAGE));
  assert.ok(text.indexOf("Content-Security-Policy") < text.indexOf("td{border"), "CSP가 원본보다 먼저");
  assert.ok(text.includes("data:image/png;base64,iVBORw0KGgo="), "내장 이미지 유지");

  // 링크·파일 자료는 HTML 경로로 열 수 없다
  const link = await call<WeekMaterial>("POST", `/courses/${COURSE}/materials`, google(T), { week: 2, title: "링크", url: "https://example.com", status: "published" });
  assert.equal((await call("GET", `/materials/${link.body.id}/html`, google(T))).status, 404);
  assert.equal((await call("GET", "/materials/material-nope00/html", google(T))).status, 404);
  for (const id of [m.id, link.body.id]) assert.equal((await call("DELETE", `/materials/${id}`, google(T))).status, 200);
});

test("HTML 수정: 본문·제목·주차는 담당 교수자만, 금지 요소 거부, 링크에 본문·HTML에 주소 거부, 학생은 수정·삭제 불가", async () => {
  const m = (await createHtml(google(T), { week: 1, title: "v1", html: "<p>v1</p>", status: "published" })).body;
  assert.equal((await call("PATCH", `/materials/${m.id}`, learner("s1"), { html: "<p>x</p>" })).status, 404);
  assert.equal((await call("PATCH", `/materials/${m.id}`, google(OTHER), { html: "<p>x</p>" })).status, 404);
  assert.equal((await call("DELETE", `/materials/${m.id}`, learner("s1"))).status, 404);
  assert.equal((await call("PATCH", `/materials/${m.id}`, google(T), { html: "<p>x</p><iframe></iframe>" })).status, 400);
  assert.equal((await call("PATCH", `/materials/${m.id}`, google(T), { url: "https://example.com" })).status, 400);
  const saved = await call<WeekMaterial>("PATCH", `/materials/${m.id}`, google(T), { title: "v2", week: 3, html: "<p>v2</p>" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.title, "v2");
  assert.equal(saved.body.week, 3);
  assert.ok(!("html" in saved.body));
  assert.equal((await call<WeekMaterialHtml>("GET", `/materials/${m.id}/html`, learner("s1"))).body.html, "<p>v2</p>");
  const link = await call<WeekMaterial>("POST", `/courses/${COURSE}/materials`, google(T), { week: 3, title: "링크", url: "https://example.com" });
  assert.equal((await call("PATCH", `/materials/${link.body.id}`, google(T), { html: "<p>a</p>" })).status, 400);
  for (const id of [m.id, link.body.id]) assert.equal((await call("DELETE", `/materials/${id}`, adminCookie)).status, 200);
});

test("한 주차에 링크·파일·HTML 함께: 순서 바꾸기, 학생은 공개 자료만 순서대로, 20개는 종류를 합쳐 센다", async () => {
  const W = 4;
  const link = (await call<WeekMaterial>("POST", `/courses/${COURSE}/materials`, google(T), { week: W, title: "링크", url: "https://example.com", status: "published" })).body;
  const start = await call<{ token: string; uploadUrl: string; headers: Record<string, string> }>("POST", `/courses/${COURSE}/materials/uploads`, google(T), {
    week: W,
    title: "파일",
    fileName: "a.pdf",
    sizeBytes: SAMPLE_FILES.pdf.length,
    status: "published",
  });
  await fetch(origin + start.body.uploadUrl, { method: "PUT", headers: { ...start.body.headers, cookie: google(T) }, body: SAMPLE_FILES.pdf });
  const file = (await call<WeekMaterial>("POST", `/material-uploads/${start.body.token}/complete`, google(T), {})).body;
  const html = (await createHtml(google(T), { week: W, title: "HTML", html: "<p>a</p>", status: "published" })).body;
  const draft = (await createHtml(google(T), { week: W, title: "비공개 HTML", html: "<p>b</p>" })).body;
  const order = [html.id, draft.id, file.id, link.id];
  assert.equal((await call("PUT", `/courses/${COURSE}/materials/order`, google(T), { week: W, ids: order })).status, 200);
  const seen = (await call<WeekMaterial[]>("GET", `/courses/${COURSE}/materials?week=${W}`, learner("s1"))).body;
  assert.deepEqual(seen.map((x) => x.kind), ["html", "file", "link"]);
  assert.deepEqual(seen.map((x) => x.id), [html.id, file.id, link.id]);
  // 20개 채우기 → HTML 등록 거부
  const extra: string[] = [];
  for (let i = 0; i < 16; i++) extra.push((await call<WeekMaterial>("POST", `/courses/${COURSE}/materials`, google(T), { week: W, title: `L${i}`, url: `https://example.com/${i}` })).body.id);
  assert.equal(Object.values(db.data.weekMaterials).filter((x) => x.week === W).length, 20);
  assert.equal((await createHtml(google(T), { week: W, title: "21", html: "<p>a</p>" })).status, 409);
  // 주차 수 축소도 HTML 자료 주차를 지킨다
  assert.equal((await call("PATCH", `/courses/${COURSE}`, adminCookie, { weekCount: W - 1 })).status, 409);
  for (const id of [...order, ...extra]) assert.equal((await call("DELETE", `/materials/${id}`, adminCookie)).status, 200);
});

test("비활성 과목: 담당 교수자 HTML 등록·수강생 공개 HTML 열람 유지", async () => {
  assert.equal((await call("PATCH", `/courses/${COURSE}`, adminCookie, { status: "inactive" })).status, 200);
  try {
    const m = await createHtml(google(T), { week: 1, title: "비활성", html: "<p>a</p>", status: "published" });
    assert.equal(m.status, 201);
    assert.equal((await call("GET", `/materials/${m.body.id}/html?mode=download`, learner("s1"))).status, 200);
    assert.equal((await call("DELETE", `/materials/${m.body.id}`, google(T))).status, 200);
  } finally {
    assert.equal((await call("PATCH", `/courses/${COURSE}`, adminCookie, { status: "active" })).status, 200);
  }
});

test("5단계 재사용: 학습 데이터로 만든 복습 HTML을 4단계 API 그대로 비공개 등록·수정, 학생은 공개 전에는 못 연다", async () => {
  const lesson = { ...SEED_LESSONS.find((l) => l.id === "lesson-yjrzm-ep3")!, courseId: COURSE, week: 2 };
  const deck = buildLessonDeck({ lesson, content: resolveLessonContent(lesson), cues: playbackCues(lesson) });
  const created = await createHtml(google(T), { week: deck.week, title: reviewTitle(deck), html: deckToReviewHtml(deck, { includeAnswers: false }), status: "draft" });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "draft", "자동 공개하지 않는다");
  assert.equal((await call("GET", `/materials/${created.body.id}/html`, learner("s1"))).status, 404);
  const again = await call("PATCH", `/materials/${created.body.id}`, google(T), { html: deckToReviewHtml(deck, { includeAnswers: true }) });
  assert.equal(again.status, 200, "다시 생성한 문서로 수정");
  assert.equal((await call("DELETE", `/materials/${created.body.id}`, google(T))).status, 200);
});

/* ───────── 3) 5-B: 복습 HTML 출처 연결·중복 방지·재생성 (JSON 모드) ───────── */

test("5-B 등록: 같은 과목 강의·원본 시각 확인, 강의당 하나(409 + 권한 있는 경우만 existingId), 학생 응답에는 출처 없음", async () => {
  // 이 테스트 전용 강의 (끝에서 지워 다른 테스트의 강의자료 스냅샷에 영향을 주지 않는다)
  const seed = Object.values(db.data.lessons).find((l) => l.courseId === COURSE)!;
  const lessonId = "lesson-5b-a";
  db.data.lessons[lessonId] = { ...seed, id: lessonId, week: 3, updatedAt: "2026-11-07T01:02:03.456Z" };
  const otherCourse = Object.values(db.data.lessons).find((l) => l.courseId !== COURSE)!;
  const src = (over: Record<string, unknown> = {}) => ({ kind: "lesson-review", lessonId, lessonUpdatedAt: "2026-11-07T01:02:03.456Z", ...over });
  const body = (over: Record<string, unknown> = {}) => ({ week: 3, title: "[복습] 3주차", html: "<p>v1</p>", source: src(), ...over });
  try {
    // 입력·출처 검사
    assert.equal((await createHtml(google(T), body({ source: { kind: "other", lessonId } }))).status, 400);
    assert.equal((await createHtml(google(T), body({ source: src({ lessonId: "../x" }) }))).status, 400);
    assert.equal((await createHtml(google(T), body({ source: src({ lessonUpdatedAt: "not-a-date" }) }))).status, 400);
    assert.equal((await createHtml(google(T), body({ source: src({ lessonId: otherCourse.id, lessonUpdatedAt: otherCourse.updatedAt }) }))).status, 400, "다른 과목 강의");
    assert.equal((await createHtml(google(T), body({ source: src({ lessonId: "lesson-nope" }) }))).status, 400, "없는 강의");
    const stale = await createHtml(google(T), body({ source: src({ lessonUpdatedAt: "2026-11-01T00:00:00.000Z" }) }));
    assert.equal(stale.status, 409, "원본이 그사이 수정됨");
    assert.match(stale.body.error ?? "", /원본 강의가 그사이 수정/);
    assert.equal((await createHtml(learner("s1"), body())).status, 403);
    assert.equal(Object.values(db.data.weekMaterials).filter((m) => m.source).length, 0, "실패한 요청은 자료를 만들지 않는다");

    // 정상 등록: 출처는 서버의 강의 시각으로 기록, 비공개
    const created = await createHtml(google(T), body());
    assert.equal(created.status, 201);
    assert.equal(created.body.status, "draft");
    assert.deepEqual(created.body.source, { kind: "lesson-review", lessonId, lessonUpdatedAt: "2026-11-07T01:02:03.456Z" });
    const id = created.body.id;

    // 중복: 담당 교수자는 existingId를 받고, 권한 없는 사람은 그 전에 403 (id 노출 없음)
    const dup = await createHtml(google(T), body({ week: 4, title: "다른 제목" }));
    assert.equal(dup.status, 409);
    assert.equal((dup.body as { existingId?: string }).existingId, id);
    const denied = await createHtml(google(OTHER), body());
    assert.equal(denied.status, 403);
    assert.ok(!("existingId" in denied.body));
    assert.equal(Object.values(db.data.weekMaterials).filter((m) => m.source?.lessonId === lessonId).length, 1, "강의당 하나");

    // 일반 HTML: 같은 주차·'[복습]' 제목이어도 독립적으로 등록, 출처를 붙일 수 없다
    const manual = await createHtml(google(T), { week: 3, title: "[복습] 직접 만든 자료", html: "<p>manual</p>" });
    assert.equal(manual.status, 201);
    assert.equal(manual.body.source, undefined);
    assert.equal((await call("PATCH", `/materials/${manual.body.id}`, google(T), { html: "<p>x</p>", sourceLessonUpdatedAt: "2026-11-07T01:02:03.456Z" })).status, 400);
    assert.equal((await call<WeekMaterial>("PATCH", `/materials/${manual.body.id}`, google(T), { html: "<p>manual v2</p>" })).status, 200, "일반 HTML 수정은 4단계 그대로");

    // 목록: 교수자에게는 출처, 학생에게는 없음
    assert.equal((await call("PATCH", `/materials/${id}`, google(T), { status: "published" })).status, 200);
    const staffList = (await call<WeekMaterial[]>("GET", `/courses/${COURSE}/materials?week=3`, google(T))).body;
    assert.equal(staffList.find((m) => m.id === id)?.source?.lessonId, lessonId);
    const studentList = (await call<WeekMaterial[]>("GET", `/courses/${COURSE}/materials?week=3`, learner("s1"))).body;
    assert.ok(studentList.some((m) => m.id === id) && studentList.every((m) => !("source" in m)), "학생 응답에 출처 없음");
    for (const x of [id, manual.body.id]) assert.equal((await call("DELETE", `/materials/${x}`, google(T))).status, 200);
  } finally {
    delete db.data.lessons[lessonId];
  }
});

test("5-B 재생성: 교수자 확인 뒤 같은 id·공유 링크·공개 상태 유지, 원본 시각 확인·갱신, 원본 강의 삭제 뒤에는 자료 보존·재생성 거부", async () => {
  const seed = Object.values(db.data.lessons).find((l) => l.courseId === COURSE)!;
  const lessonId = "lesson-5b-b";
  db.data.lessons[lessonId] = { ...seed, id: lessonId, week: 4, updatedAt: "2026-11-07T00:00:00.000Z" };
  try {
    const created = await createHtml(google(T), {
      week: 4,
      title: "[복습] 4주차",
      html: "<p>v1</p>",
      status: "published",
      source: { kind: "lesson-review", lessonId, lessonUpdatedAt: "2026-11-07T00:00:00.000Z" },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;
    // 원본 강의 수정 → 옛 시각으로는 재생성 거부, html 없이 시각만도 거부
    db.data.lessons[lessonId].updatedAt = "2026-11-08T09:30:00.123Z";
    assert.equal((await call("PATCH", `/materials/${id}`, google(T), { html: "<p>v2</p>", sourceLessonUpdatedAt: "2026-11-07T00:00:00.000Z" })).status, 409);
    assert.equal((await call("PATCH", `/materials/${id}`, google(T), { sourceLessonUpdatedAt: "2026-11-08T09:30:00.123Z" })).status, 400);
    assert.equal((await call("PATCH", `/materials/${id}`, learner("s1"), { html: "<p>x</p>", sourceLessonUpdatedAt: "2026-11-08T09:30:00.123Z" })).status, 404);
    assert.equal((await call("PATCH", `/materials/${id}`, google(OTHER), { html: "<p>x</p>", sourceLessonUpdatedAt: "2026-11-08T09:30:00.123Z" })).status, 404);
    const regen = await call<WeekMaterial>("PATCH", `/materials/${id}`, google(T), { html: "<p>v2</p>", sourceLessonUpdatedAt: "2026-11-08T09:30:00.123Z" });
    assert.equal(regen.status, 200);
    assert.equal(regen.body.id, id, "같은 자료 id (공유 링크 유지)");
    assert.equal(regen.body.status, "published", "공개 상태 유지");
    assert.equal(regen.body.title, "[복습] 4주차");
    assert.deepEqual(regen.body.source, { kind: "lesson-review", lessonId, lessonUpdatedAt: "2026-11-08T09:30:00.123Z" });
    assert.equal((await call<WeekMaterialHtml>("GET", `/materials/${id}/html`, learner("s1"))).body.html, "<p>v2</p>", "학생은 같은 주소로 새 내용");

    // 원본 강의 삭제: 자료·공개 상태는 그대로, 출처의 강의 연결만 끊김, 재생성은 안내와 함께 거부
    assert.equal((await call("DELETE", `/lessons/${lessonId}`, adminCookie)).status, 200);
    assert.ok(!db.data.lessons[lessonId]);
    const kept = db.data.weekMaterials[id];
    assert.equal(kept.status, "published");
    assert.deepEqual(kept.source, { kind: "lesson-review", lessonId: null, lessonUpdatedAt: "2026-11-08T09:30:00.123Z" });
    const after = await call("PATCH", `/materials/${id}`, google(T), { html: "<p>v3</p>", sourceLessonUpdatedAt: "2026-11-08T09:30:00.123Z" });
    assert.equal(after.status, 400);
    assert.match(after.body.error ?? "", /원본 강의가 삭제/);
    assert.equal((await call("GET", `/materials/${id}/html?mode=download`, learner("s1"))).status, 200, "학생 열람·다운로드 유지");
    assert.equal((await call("PATCH", `/materials/${id}`, google(T), { title: "제목만 수정" })).status, 200, "원본이 없어도 일반 수정은 가능");
    assert.equal((await call("DELETE", `/materials/${id}`, google(T))).status, 200);
  } finally {
    delete db.data.lessons[lessonId];
  }
});

test("HTML 자료 작업은 강의자료·학습 기록·수강 등록을 바꾸지 않는다", () => {
  assert.equal(snapshot(), untouched);
});

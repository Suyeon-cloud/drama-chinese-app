// Phase D5: data/db.json의 피드백 초안(feedback)을 Supabase feedback_drafts로 옮긴다.
//   npm run supabase:migrate-d5            → dry-run (읽기만)
//   npm run supabase:migrate-d5 -- --apply → 없는 행만 넣기
// - 원본은 로컬 data/db.json 하나 (D5_DB_PATH로 바꿀 수 있다 — 검사용). service-role은 이 스크립트에서만 쓴다.
// - 이미 있는 행은 원본과 같으면 unchanged, 다르면 conflict. conflict·invalid가 있으면 아무것도 쓰지 않는다. 덮어쓰기·삭제 없음.
// - 받는 사람·제목·본문은 출력하지 않는다.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { feedbackFromRow, feedbackProblem, feedbackToRow } from "../server/feedbackRows";

const apply = process.argv.includes("--apply");
const dbPath = process.env.D5_DB_PATH || "data/db.json";
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(".env.local에 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요해요.");
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const db = JSON.parse(readFileSync(dbPath, "utf8"));

/** 원본 ISO 시각은 같은 순간이면 같다고 본다 (timestamptz는 표기만 바뀐다) */
const canonical = (d) => ({ ...d, createdAt: new Date(d.createdAt).toISOString(), updatedAt: new Date(d.updatedAt).toISOString(), sentAt: d.sentAt && new Date(d.sentAt).toISOString() });

const plan = async () => {
  const items = [];
  for (const [key, d] of Object.entries(db.feedback ?? {})) {
    const problem = feedbackProblem(d) ?? (key !== d.id ? "key와 id가 다름" : null);
    if (problem) {
      items.push({ d, state: "invalid", why: problem });
      continue;
    }
    const { data, error } = await sb.from("feedback_drafts").select("*").eq("id", d.id).maybeSingle();
    if (error) throw new Error(error.message);
    items.push({ d, state: !data ? "insert" : isDeepStrictEqual(feedbackFromRow(data), canonical(d)) ? "unchanged" : "conflict" });
  }
  return items;
};
const show = (items, title) => {
  const n = (s) => items.filter((i) => i.state === s).length;
  console.log(`\n== ${title} (${dbPath})`);
  console.log(`source ${items.length} | insert ${n("insert")} | unchanged ${n("unchanged")} | conflict ${n("conflict")} | invalid ${n("invalid")}`);
  for (const i of items.filter((x) => x.state === "conflict" || x.state === "invalid")) console.log(`  ${i.state}  ${i.d?.id ?? "?"}${i.why ? ` — ${i.why}` : ""}`);
  return { conflict: n("conflict"), invalid: n("invalid") };
};

const items = await plan();
const s = show(items, apply ? "적용 전 계획" : "DRY-RUN");
if (s.conflict || s.invalid) {
  console.error("✖ 중단: conflict 또는 invalid가 있어 아무것도 쓰지 않았어요.");
  process.exit(1);
}
if (!apply) {
  console.log("dry-run이라 아무것도 바꾸지 않았어요. 반영하려면 --apply");
} else {
  const rows = items.filter((i) => i.state === "insert").map((i) => feedbackToRow(i.d));
  if (rows.length) {
    const { error } = await sb.from("feedback_drafts").insert(rows);
    if (error) {
      console.error(`✖ 넣기 실패: ${error.message}`);
      process.exit(1);
    }
  }
  console.log(`넣음: ${rows.length}`);
  show(await plan(), "적용 후 다시 확인");
}

// Phase D4: data/db.json의 기존 학습 기록(progress)을 Supabase로 옮긴다.
//   npm run supabase:migrate-d4            → dry-run (읽기만, 분류 결과 출력)
//   npm run supabase:migrate-d4 -- --apply → 없는 행만 넣기
// - 원본은 로컬 data/db.json 하나 (D4_DB_PATH로 바꿀 수 있다 — 검사용). service-role은 이 스크립트에서만 쓴다.
// - Google sub와 이메일이 모두 일치하는 Supabase 계정에만 연결(mapped), 나머지는 legacy_progress에 원본 그대로 보관한다.
// - conflict·invalid가 하나라도 있으면 아무것도 쓰지 않는다. 이메일·사용자 id는 출력하지 않는다.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { applyProgressPlan, planProgressMigration, summarizeProgressPlan } from "../server/progressMigration";

const apply = process.argv.includes("--apply");
const dbPath = process.env.D4_DB_PATH || "data/db.json";
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(".env.local에 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요해요.");
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const db = JSON.parse(readFileSync(dbPath, "utf8"));

const show = (items, title) => {
  const s = summarizeProgressPlan(items);
  console.log(`\n== ${title} (${dbPath})`);
  console.log(`source ${s.source} | mapped ${s.mapped} | legacy(보관) ${s.legacy} | invalid ${s.invalid} | conflict ${s.conflict} | insert ${s.insert} | unchanged ${s.unchanged}`);
  const reasons = items.filter((i) => i.kind === "legacy").reduce((a, i) => ((a[i.reason] = (a[i.reason] ?? 0) + 1), a), {});
  if (Object.keys(reasons).length) console.log(`보관 이유: ${JSON.stringify(reasons)}`);
  for (const i of items.filter((x) => x.state === "conflict" || x.kind === "invalid")) console.log(`  ${i.kind === "invalid" ? "invalid" : "conflict"}  기록 ${i.source.lessonId} — ${i.reason ?? i.detail}`);
  return s;
};

const plan = await planProgressMigration(sb, db);
const s = show(plan, apply ? "적용 전 계획" : "DRY-RUN");
if (s.conflict || s.invalid) {
  console.error("✖ 중단: conflict 또는 invalid가 있어 아무것도 쓰지 않았어요.");
  process.exit(1);
}
if (!apply) {
  console.log("dry-run이라 아무것도 바꾸지 않았어요. 반영하려면 --apply");
} else {
  const inserted = await applyProgressPlan(sb, plan);
  console.log(`넣음: ${inserted}`);
  show(await planProgressMigration(sb, db), "적용 후 다시 확인");
}

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const INPUT_FILE = "c:/Users/Maylson/Desktop/lectures-old-system.json";
const REPORT_FILE = "generated_schedules/repair_legacy_imported_lesson_texts_report.json";

function loadEnv() {
  const raw = fs.readFileSync(".env", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function maybeFixMojibake(value) {
  if (typeof value !== "string") return value;
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    if (!/[ÃÂâ€™â€œâ€â€“â€”]/.test(current)) break;
    const converted = Buffer.from(current, "latin1").toString("utf8");
    if (converted === current) break;
    current = converted;
  }
  return current.replace(/\uFFFD/g, "");
}

function cleanText(value) {
  const fixed = maybeFixMojibake(value);
  if (typeof fixed !== "string") return null;
  const trimmed = fixed.trim();
  return trimmed ? trimmed : null;
}

function lessonIdFromTitle(title) {
  const match = String(title || "").match(/#(\d+)\s*$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  loadEnv();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const sourceRows = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  const sourceByLectureId = new Map(sourceRows.map((row) => [Number(row.lectureid), row]));

  const { data: importedPlans, error: plansError } = await supabase
    .from("lesson_plans")
    .select("id,title,content,objective,methodology,resources,classroom_activities,home_activities,reviewer_comment")
    .ilike("title", "Importação legado #%");

  if (plansError) throw plansError;

  const stats = {
    totalImportedPlansFound: importedPlans?.length ?? 0,
    sourceRowsFound: 0,
    updatedPlans: 0,
    unchangedPlans: 0,
    sourceMissing: 0,
  };

  const changed = [];
  const missing = [];

  for (const plan of importedPlans || []) {
    const lectureid = lessonIdFromTitle(plan.title);
    if (!lectureid) {
      stats.sourceMissing += 1;
      missing.push({ lesson_plan_id: plan.id, title: plan.title, reason: "invalid_title_pattern" });
      continue;
    }

    const row = sourceByLectureId.get(lectureid);
    if (!row) {
      stats.sourceMissing += 1;
      missing.push({ lesson_plan_id: plan.id, title: plan.title, lectureid, reason: "lectureid_not_found_in_source" });
      continue;
    }
    stats.sourceRowsFound += 1;

    const payload = {
      content: cleanText(row.conteudo),
      objective: cleanText(row.objetivo),
      methodology: cleanText(row.metodologia),
      resources: cleanText(row.recursos),
      classroom_activities: cleanText(row.ativ_em_sala),
      home_activities: cleanText(row.ativ_em_casa),
      reviewer_comment: cleanText(row.notasRevisor),
    };

    const hasDiff =
      (plan.content ?? null) !== payload.content ||
      (plan.objective ?? null) !== payload.objective ||
      (plan.methodology ?? null) !== payload.methodology ||
      (plan.resources ?? null) !== payload.resources ||
      (plan.classroom_activities ?? null) !== payload.classroom_activities ||
      (plan.home_activities ?? null) !== payload.home_activities ||
      (plan.reviewer_comment ?? null) !== payload.reviewer_comment;

    if (!hasDiff) {
      stats.unchangedPlans += 1;
      continue;
    }

    const { error: updateError } = await supabase.from("lesson_plans").update(payload).eq("id", plan.id);
    if (updateError) throw updateError;

    stats.updatedPlans += 1;
    changed.push({
      lesson_plan_id: plan.id,
      title: plan.title,
      lectureid,
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    input_file: INPUT_FILE,
    stats,
    changed_preview: changed.slice(0, 100),
    missing_preview: missing.slice(0, 100),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("Correção finalizada.");
  console.log(stats);
  console.log(`Relatório: ${REPORT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

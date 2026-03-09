import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const INPUT_FILE = "generated_schedules/relacao_alunos_clean.json";

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

function norm(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildGuardianKey(name, email, phone) {
  const e = cleanEmail(email);
  const p = cleanPhone(phone);
  if (e && validEmail(e)) return `email:${e}`;
  if (name && p) return `name_phone:${norm(name)}|${p}`;
  if (name) return `name:${norm(name)}`;
  return null;
}

async function main() {
  loadEnv();
  const source = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  const rows = source.rows ?? [];
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: schools, error: schoolsError } = await supabase.from("schools").select("id,name,is_active").eq("is_active", true);
  if (schoolsError) throw schoolsError;
  const school = (schools || []).find((s) => norm(s.name).includes("colegiomirante")) ?? schools?.[0];
  if (!school) throw new Error("Escola ativa não encontrada.");

  const { data: guardians, error: guardiansError } = await supabase
    .from("guardians")
    .select("id,full_name,email,phone,school_id")
    .eq("school_id", school.id);
  if (guardiansError) throw guardiansError;

  const guardianByKey = new Map();
  for (const g of guardians || []) {
    const key = buildGuardianKey(g.full_name, g.email, g.phone);
    if (key && !guardianByKey.has(key)) guardianByKey.set(key, g);
  }

  const desiredPhoneByKey = new Map();
  for (const row of rows) {
    for (const rel of [
      { name: row.mae_nome, email: row.mae_email, phone: row.mae_tel },
      { name: row.pai_nome, email: row.pai_email, phone: row.pai_tel },
    ]) {
      const key = buildGuardianKey(rel.name, rel.email, rel.phone);
      const phone = cleanPhone(rel.phone);
      if (!key || !phone) continue;
      const current = desiredPhoneByKey.get(key) || "";
      if (!current || phone.length > current.length) {
        desiredPhoneByKey.set(key, phone);
      }
    }
  }

  let updated = 0;
  let skippedNoGuardian = 0;
  let skippedAlreadyHasPhone = 0;
  let skippedNoPhoneInSheet = 0;
  const errors = [];

  for (const [key, desiredPhone] of desiredPhoneByKey.entries()) {
    const guardian = guardianByKey.get(key);
    if (!guardian) {
      skippedNoGuardian += 1;
      continue;
    }
    const currentPhone = cleanPhone(guardian.phone);
    if (!desiredPhone) {
      skippedNoPhoneInSheet += 1;
      continue;
    }
    if (currentPhone) {
      skippedAlreadyHasPhone += 1;
      continue;
    }

    const { error } = await supabase
      .from("guardians")
      .update({ phone: desiredPhone })
      .eq("id", guardian.id)
      .eq("school_id", school.id);

    if (error) {
      errors.push({ guardian_id: guardian.id, key, error: error.message });
    } else {
      updated += 1;
    }
  }

  const report = {
    school: school.name,
    updated,
    skippedNoGuardian,
    skippedAlreadyHasPhone,
    skippedNoPhoneInSheet,
    errorCount: errors.length,
    errors: errors.slice(0, 80),
  };
  fs.writeFileSync("generated_schedules/backfill_guardian_phones_report.json", JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


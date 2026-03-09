import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

function digitsOnly(v) {
  return String(v || "").replace(/\D+/g, "");
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: schools, error: schoolsError } = await supabase.from("schools").select("id,name,is_active").eq("is_active", true);
  if (schoolsError) throw schoolsError;
  const school = (schools || []).find((s) => norm(s.name).includes("colegiomirante")) || (schools || [])[0];
  if (!school) throw new Error("Escola ativa não encontrada.");

  const [profilesRes, guardiansRes, teachersRes] = await Promise.all([
    supabase.from("user_profiles").select("id,phone"),
    supabase.from("guardians").select("user_id,phone").eq("school_id", school.id).not("user_id", "is", null),
    supabase.from("teachers").select("user_id,phone").eq("school_id", school.id).not("user_id", "is", null),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (guardiansRes.error) throw guardiansRes.error;
  if (teachersRes.error) throw teachersRes.error;

  const profiles = profilesRes.data || [];
  const guardians = guardiansRes.data || [];
  const teachers = teachersRes.data || [];

  const bestPhoneByUser = new Map();
  for (const row of [...guardians, ...teachers]) {
    const userId = row.user_id;
    const phone = digitsOnly(row.phone);
    if (!userId || !phone) continue;
    const prev = bestPhoneByUser.get(userId);
    if (!prev || phone.length > prev.length) bestPhoneByUser.set(userId, phone);
  }

  let updated = 0;
  let skippedHasPhone = 0;
  let skippedNoSource = 0;
  const errors = [];

  for (const profile of profiles) {
    const current = digitsOnly(profile.phone);
    if (current) {
      skippedHasPhone += 1;
      continue;
    }
    const candidate = bestPhoneByUser.get(profile.id);
    if (!candidate) {
      skippedNoSource += 1;
      continue;
    }

    const { error } = await supabase.from("user_profiles").update({ phone: candidate }).eq("id", profile.id);
    if (error) errors.push({ id: profile.id, error: error.message });
    else updated += 1;
  }

  const { data: profilesAfter, error: profilesAfterError } = await supabase.from("user_profiles").select("id,phone");
  if (profilesAfterError) throw profilesAfterError;

  const profilePhoneMap = new Map((profilesAfter || []).map((p) => [p.id, digitsOnly(p.phone)]));
  const linkedGuardianUserIds = [...new Set(guardians.map((g) => g.user_id).filter(Boolean))];
  const linkedProfilesWithPhone = linkedGuardianUserIds.filter((id) => Boolean(profilePhoneMap.get(id))).length;

  const report = {
    generated_at: new Date().toISOString(),
    school_id: school.id,
    school_name: school.name,
    totals: {
      profiles: profiles.length,
      guardians_with_user: guardians.length,
      teachers_with_user: teachers.length,
      candidate_users_with_phone: bestPhoneByUser.size,
    },
    result: {
      updated,
      skipped_has_phone: skippedHasPhone,
      skipped_no_source: skippedNoSource,
      errors_count: errors.length,
    },
    validation: {
      guardians_linked_count: linkedGuardianUserIds.length,
      linked_profiles_with_phone: linkedProfilesWithPhone,
    },
    errors,
  };

  fs.mkdirSync("generated_schedules", { recursive: true });
  fs.writeFileSync("generated_schedules/backfill_user_profiles_phone_report.json", JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

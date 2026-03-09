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

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function buildGuardianKey(name, email, phone) {
  const e = cleanEmail(email);
  const p = cleanPhone(phone);
  if (e && validEmail(e)) return `email:${e}`;
  if (name && p) return `name_phone:${norm(name)}|${p}`;
  if (name) return `name:${norm(name)}`;
  return null;
}

function firstNamePassword(fullName) {
  const first = String(fullName || "")
    .trim()
    .split(/\s+/)[0]
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
  return `${first || "responsavel"}2024`;
}

async function listAllAuthUsers(admin) {
  const users = [];
  const perPage = 1000;
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const chunk = data?.users ?? [];
    users.push(...chunk);
    if (chunk.length < perPage) break;
    page += 1;
  }
  return users;
}

async function main() {
  loadEnv();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const source = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  const sourceRows = source.rows ?? [];

  const { data: schools, error: schoolsError } = await supabase.from("schools").select("id,name,is_active").eq("is_active", true);
  if (schoolsError) throw schoolsError;
  const school = (schools || []).find((item) => norm(item.name).includes("colegiomirante")) ?? schools?.[0];
  if (!school) throw new Error("Escola ativa não encontrada.");

  const [classesR, studentsR, guardiansR, linksR, rolesR, authUsers] = await Promise.all([
    supabase.from("classes").select("id,name,school_year_id").eq("school_id", school.id),
    supabase.from("students").select("id,full_name,school_id").eq("school_id", school.id),
    supabase.from("guardians").select("id,full_name,email,phone,user_id,school_id").eq("school_id", school.id),
    supabase.from("student_guardians").select("id,student_id,guardian_id,relationship").eq("school_id", school.id),
    supabase.from("user_school_roles").select("user_id,role,is_active").eq("school_id", school.id),
    listAllAuthUsers(supabase),
  ]);
  for (const r of [classesR, studentsR, guardiansR, linksR, rolesR]) {
    if (r.error) throw r.error;
  }

  const classes = classesR.data || [];
  const students = studentsR.data || [];
  const guardians = guardiansR.data || [];
  const links = linksR.data || [];

  const classByNorm = new Map(classes.map((c) => [norm(c.name), c]));
  const studentByNorm = new Map(students.map((s) => [norm(s.full_name), s]));
  const authByEmail = new Map(authUsers.map((u) => [cleanEmail(u.email), u]));
  const roleUpsertedUsers = new Set();

  const stats = {
    school: school.name,
    duplicateGuardianGroups: 0,
    mergedGuardians: 0,
    linksMovedToCanonical: 0,
    desiredLinksInserted: 0,
    guardiansCreatedFromSource: 0,
    guardianUsersCreated: 0,
    guardianUsersLinked: 0,
    parentRolesUpserted: 0,
    errors: [],
  };

  const linkCountByGuardian = new Map();
  for (const link of links) {
    linkCountByGuardian.set(link.guardian_id, (linkCountByGuardian.get(link.guardian_id) || 0) + 1);
  }

  const guardiansByKey = new Map();
  for (const g of guardians) {
    const key = buildGuardianKey(g.full_name, g.email, g.phone);
    if (!key) continue;
    const arr = guardiansByKey.get(key) || [];
    arr.push(g);
    guardiansByKey.set(key, arr);
  }

  const canonicalByKey = new Map();
  for (const [key, group] of guardiansByKey.entries()) {
    if (group.length > 1) stats.duplicateGuardianGroups += 1;
    const sorted = [...group].sort((a, b) => {
      const aHasUser = a.user_id ? 1 : 0;
      const bHasUser = b.user_id ? 1 : 0;
      if (aHasUser !== bHasUser) return bHasUser - aHasUser;
      const aLinks = linkCountByGuardian.get(a.id) || 0;
      const bLinks = linkCountByGuardian.get(b.id) || 0;
      if (aLinks !== bLinks) return bLinks - aLinks;
      return a.id.localeCompare(b.id);
    });
    const keeper = sorted[0];
    canonicalByKey.set(key, keeper);

    for (const dup of sorted.slice(1)) {
      const dupLinks = links.filter((l) => l.guardian_id === dup.id);
      for (const l of dupLinks) {
        const { error: upsertErr } = await supabase.from("student_guardians").upsert(
          {
            school_id: school.id,
            student_id: l.student_id,
            guardian_id: keeper.id,
            relationship: l.relationship || "RESPONSAVEL",
            is_financial_responsible: false,
          },
          { onConflict: "student_id,guardian_id" },
        );
        if (!upsertErr) stats.linksMovedToCanonical += 1;
      }

      const { error: delLinksErr } = await supabase.from("student_guardians").delete().eq("school_id", school.id).eq("guardian_id", dup.id);
      if (delLinksErr) {
        stats.errors.push({ type: "delete_dup_links_error", guardian_id: dup.id, error: delLinksErr.message });
        continue;
      }

      const keeperNeedsUser = !keeper.user_id && dup.user_id;
      if (keeperNeedsUser) {
        const { error: keeperUserErr } = await supabase.from("guardians").update({ user_id: dup.user_id }).eq("id", keeper.id).eq("school_id", school.id);
        if (!keeperUserErr) keeper.user_id = dup.user_id;
      }

      const { error: delGuardianErr } = await supabase.from("guardians").delete().eq("id", dup.id).eq("school_id", school.id);
      if (delGuardianErr) {
        stats.errors.push({ type: "delete_dup_guardian_error", guardian_id: dup.id, error: delGuardianErr.message });
      } else {
        stats.mergedGuardians += 1;
      }
    }
  }

  const { data: guardiansAfterMerge, error: guardiansAfterMergeError } = await supabase
    .from("guardians")
    .select("id,full_name,email,phone,user_id,school_id")
    .eq("school_id", school.id);
  if (guardiansAfterMergeError) throw guardiansAfterMergeError;

  const guardianByKey = new Map();
  for (const g of guardiansAfterMerge || []) {
    const key = buildGuardianKey(g.full_name, g.email, g.phone);
    if (key && !guardianByKey.has(key)) guardianByKey.set(key, g);
  }

  const { data: linksAfterMerge, error: linksAfterMergeError } = await supabase
    .from("student_guardians")
    .select("student_id,guardian_id")
    .eq("school_id", school.id);
  if (linksAfterMergeError) throw linksAfterMergeError;
  const linkSet = new Set((linksAfterMerge || []).map((l) => `${l.student_id}|${l.guardian_id}`));

  for (const row of sourceRows) {
    const classObj = classByNorm.get(norm(row.turma));
    if (!classObj) continue;
    const student = studentByNorm.get(norm(row.aluno));
    if (!student) continue;

    const rels = [
      { relationship: "MAE", name: row.mae_nome, email: row.mae_email, phone: row.mae_tel },
      { relationship: "PAI", name: row.pai_nome, email: row.pai_email, phone: row.pai_tel },
    ];

    for (const rel of rels) {
      const name = String(rel.name || "").trim();
      const email = cleanEmail(rel.email || "");
      const phone = cleanPhone(rel.phone || "");
      const key = buildGuardianKey(name, email, phone);
      if (!key) continue;

      let guardian = guardianByKey.get(key);
      if (!guardian) {
        const fallbackName = name || (email ? email.split("@")[0] : `Responsável ${row.aluno}`);
        const { data, error } = await supabase
          .from("guardians")
          .insert({
            school_id: school.id,
            full_name: fallbackName,
            email: validEmail(email) ? email : null,
            phone: phone || null,
          })
          .select("id,full_name,email,phone,user_id,school_id")
          .single();
        if (error) {
          stats.errors.push({ type: "guardian_create_error", row, error: error.message });
          continue;
        }
        guardian = data;
        guardianByKey.set(key, guardian);
        stats.guardiansCreatedFromSource += 1;
      }

      if (validEmail(email)) {
        let user = authByEmail.get(email) || null;
        if (!user) {
          const { data: created, error: createErr } = await supabase.auth.admin.createUser({
            email,
            password: firstNamePassword(guardian.full_name),
            email_confirm: true,
            user_metadata: { full_name: guardian.full_name },
          });
          if (createErr) {
            stats.errors.push({ type: "guardian_auth_create_error", row, error: createErr.message });
          } else {
            user = created.user;
            authByEmail.set(email, user);
            stats.guardianUsersCreated += 1;
          }
        }

        if (user && !guardian.user_id) {
          const { data: conflict } = await supabase
            .from("guardians")
            .select("id")
            .eq("school_id", school.id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (conflict?.id && conflict.id !== guardian.id) {
            guardian = (guardiansAfterMerge || []).find((g) => g.id === conflict.id) || guardian;
            guardianByKey.set(key, guardian);
          } else {
            const { error: linkUserErr } = await supabase
              .from("guardians")
              .update({ user_id: user.id })
              .eq("id", guardian.id)
              .eq("school_id", school.id);
            if (!linkUserErr) {
              guardian.user_id = user.id;
              stats.guardianUsersLinked += 1;
            } else {
              stats.errors.push({ type: "guardian_user_link_error", row, error: linkUserErr.message });
            }
          }
        }

        if (user && !roleUpsertedUsers.has(user.id)) {
          const { error: roleErr } = await supabase.from("user_school_roles").upsert(
            {
              user_id: user.id,
              school_id: school.id,
              role: "PAI",
              is_active: true,
            },
            { onConflict: "user_id,school_id,role" },
          );
          if (!roleErr) {
            roleUpsertedUsers.add(user.id);
            stats.parentRolesUpserted += 1;
          } else {
            stats.errors.push({ type: "guardian_role_error", row, error: roleErr.message });
          }
        }
      }

      const linkKey = `${student.id}|${guardian.id}`;
      if (!linkSet.has(linkKey)) {
        const { error: linkErr } = await supabase.from("student_guardians").insert({
          school_id: school.id,
          student_id: student.id,
          guardian_id: guardian.id,
          relationship: rel.relationship,
          is_financial_responsible: false,
        });
        if (!linkErr) {
          linkSet.add(linkKey);
          stats.desiredLinksInserted += 1;
        } else {
          stats.errors.push({ type: "student_guardian_insert_error", row, error: linkErr.message });
        }
      }
    }
  }

  const summary = {
    ...stats,
    errorCount: stats.errors.length,
    errorExamples: stats.errors.slice(0, 80),
  };
  fs.writeFileSync("generated_schedules/reconcile_guardians_from_relacao_report.json", JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


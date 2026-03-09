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

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
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

function nonEmpty(value) {
  const v = String(value || "").trim();
  return v ? v : null;
}

function buildGuardianKey(name, email, phone) {
  if (email && validEmail(email)) return `email:${cleanEmail(email)}`;
  if (name && phone) return `name_phone:${norm(name)}|${digitsOnly(phone)}`;
  if (name) return `name:${norm(name)}`;
  return null;
}

function generateRegistrationCode(name, usedCodes) {
  const base = `ALU-${norm(name).slice(0, 18).toUpperCase() || "SEMNOME"}`;
  let code = base;
  let idx = 1;
  while (usedCodes.has(code)) {
    idx += 1;
    code = `${base}-${idx}`;
  }
  usedCodes.add(code);
  return code;
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

  const parsed = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  const sourceRows = parsed.rows ?? [];
  if (!sourceRows.length) throw new Error("Arquivo de entrada sem linhas.");

  const { data: schools, error: schoolsError } = await supabase.from("schools").select("id,name,is_active").eq("is_active", true);
  if (schoolsError) throw schoolsError;
  const school = (schools || []).find((item) => norm(item.name).includes("colegiomirante")) ?? schools?.[0];
  if (!school) throw new Error("Escola ativa não encontrada.");

  const [classesR, studentsR, guardiansR, linksR, enrollmentsR, rolesR, authUsers] = await Promise.all([
    supabase.from("classes").select("id,name,stage,school_year_id").eq("school_id", school.id),
    supabase.from("students").select("id,full_name,registration_code,stage,school_id").eq("school_id", school.id),
    supabase.from("guardians").select("id,full_name,email,phone,user_id,school_id").eq("school_id", school.id),
    supabase.from("student_guardians").select("student_id,guardian_id,relationship").eq("school_id", school.id),
    supabase.from("enrollments").select("student_id,class_id,school_year_id").eq("school_id", school.id),
    supabase.from("user_school_roles").select("user_id,role,is_active").eq("school_id", school.id),
    listAllAuthUsers(supabase),
  ]);
  for (const r of [classesR, studentsR, guardiansR, linksR, enrollmentsR, rolesR]) {
    if (r.error) throw r.error;
  }

  const createdBy = (rolesR.data || []).find((r) => r.role === "DIRECAO" && r.is_active)?.user_id ?? (rolesR.data || [])[0]?.user_id;
  if (!createdBy) throw new Error("Não encontrei usuário para created_by.");

  const classes = classesR.data || [];
  const students = studentsR.data || [];
  const guardians = guardiansR.data || [];
  const links = linksR.data || [];
  const enrollments = enrollmentsR.data || [];

  const classByNorm = new Map(classes.map((item) => [norm(item.name), item]));
  const studentByNameNorm = new Map(students.map((item) => [norm(item.full_name), item]));
  const usedRegistrationCodes = new Set(students.map((item) => item.registration_code));

  const guardianByKey = new Map();
  for (const g of guardians) {
    const emailKey = buildGuardianKey(g.full_name, g.email, g.phone);
    if (emailKey && !guardianByKey.has(emailKey)) guardianByKey.set(emailKey, g);
  }
  const authByEmail = new Map(authUsers.map((u) => [cleanEmail(u.email), u]));
  const existingLinks = new Set(links.map((l) => `${l.student_id}|${l.guardian_id}`));
  const existingEnrollments = new Set(enrollments.map((e) => `${e.student_id}|${e.class_id}|${e.school_year_id}`));
  const roleUpsertedUsers = new Set();

  const stats = {
    school: school.name,
    school_id: school.id,
    rows: sourceRows.length,
    createdStudents: 0,
    reusedStudents: 0,
    createdEnrollments: 0,
    createdGuardians: 0,
    reusedGuardians: 0,
    createdGuardianUsers: 0,
    reusedGuardianUsers: 0,
    linkedGuardianUsers: 0,
    createdGuardianRoles: 0,
    createdStudentGuardianLinks: 0,
    skippedRowsNoClass: 0,
    skippedRowsNoStudentName: 0,
    skippedGuardiansNoData: 0,
    errors: [],
  };

  for (const row of sourceRows) {
    const classObj = classByNorm.get(norm(row.turma));
    if (!classObj) {
      stats.skippedRowsNoClass += 1;
      stats.errors.push({ type: "class_not_found", row });
      continue;
    }
    const studentName = String(row.aluno || "").trim();
    if (!studentName) {
      stats.skippedRowsNoStudentName += 1;
      continue;
    }

    let student = studentByNameNorm.get(norm(studentName));
    if (!student) {
      const registrationCode = generateRegistrationCode(studentName, usedRegistrationCodes);
      const { data, error } = await supabase
        .from("students")
        .insert({
          school_id: school.id,
          registration_code: registrationCode,
          full_name: studentName,
          stage: classObj.stage,
          status: "ATIVO",
        })
        .select("id,full_name,registration_code,stage,school_id")
        .single();
      if (error) {
        stats.errors.push({ type: "student_insert_error", row, error: error.message });
        continue;
      }
      student = data;
      studentByNameNorm.set(norm(student.full_name), student);
      stats.createdStudents += 1;
    } else {
      stats.reusedStudents += 1;
    }

    const enrollmentKey = `${student.id}|${classObj.id}|${classObj.school_year_id}`;
    if (!existingEnrollments.has(enrollmentKey)) {
      const { error: enrollmentError } = await supabase.from("enrollments").insert({
        school_id: school.id,
        student_id: student.id,
        class_id: classObj.id,
        school_year_id: classObj.school_year_id,
        status: "ATIVA",
        enrolled_at: new Date().toISOString().slice(0, 10),
      });
      if (!enrollmentError) {
        stats.createdEnrollments += 1;
        existingEnrollments.add(enrollmentKey);
      } else {
        stats.errors.push({ type: "enrollment_error", row, error: enrollmentError.message });
      }
    }

    const guardianEntries = [
      {
        relationship: "MAE",
        full_name: String(row.mae_nome || "").trim(),
        email: cleanEmail(row.mae_email || ""),
        phone: digitsOnly(row.mae_tel || ""),
      },
      {
        relationship: "PAI",
        full_name: String(row.pai_nome || "").trim(),
        email: cleanEmail(row.pai_email || ""),
        phone: digitsOnly(row.pai_tel || ""),
      },
    ];

    for (const gRow of guardianEntries) {
      const hasAnyData = Boolean(gRow.full_name || gRow.email || gRow.phone);
      if (!hasAnyData) {
        stats.skippedGuardiansNoData += 1;
        continue;
      }

      const guardianName = gRow.full_name || (gRow.email ? gRow.email.split("@")[0] : `Responsável ${studentName}`);
      const guardianKey = buildGuardianKey(guardianName, gRow.email, gRow.phone);
      if (!guardianKey) {
        stats.skippedGuardiansNoData += 1;
        continue;
      }

      let guardian = guardianByKey.get(guardianKey);
      if (!guardian) {
        const { data, error } = await supabase
          .from("guardians")
          .insert({
            school_id: school.id,
            full_name: guardianName,
            email: validEmail(gRow.email) ? gRow.email : null,
            phone: nonEmpty(gRow.phone),
          })
          .select("id,full_name,email,phone,user_id,school_id")
          .single();
        if (error) {
          stats.errors.push({ type: "guardian_insert_error", row, guardian: gRow, error: error.message });
          continue;
        }
        guardian = data;
        guardianByKey.set(guardianKey, guardian);
        stats.createdGuardians += 1;
      } else {
        stats.reusedGuardians += 1;
      }

      if (validEmail(gRow.email)) {
        const email = gRow.email;
        let user = authByEmail.get(email) ?? null;
        if (!user) {
          const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
            email,
            password: firstNamePassword(guardianName),
            email_confirm: true,
            user_metadata: { full_name: guardianName },
          });
          if (createUserError) {
            stats.errors.push({ type: "guardian_user_create_error", row, guardian: gRow, error: createUserError.message });
          } else {
            user = created.user;
            authByEmail.set(email, user);
            stats.createdGuardianUsers += 1;
          }
        } else {
          stats.reusedGuardianUsers += 1;
        }

        if (user && !guardian.user_id) {
          const { error: guardianUserLinkError } = await supabase
            .from("guardians")
            .update({ user_id: user.id })
            .eq("id", guardian.id)
            .eq("school_id", school.id);
          if (!guardianUserLinkError) {
            guardian.user_id = user.id;
            stats.linkedGuardianUsers += 1;
          } else {
            stats.errors.push({ type: "guardian_user_link_error", row, guardian: gRow, error: guardianUserLinkError.message });
          }
        }

        if (user && !roleUpsertedUsers.has(user.id)) {
          const { error: roleError } = await supabase.from("user_school_roles").upsert(
            {
              user_id: user.id,
              school_id: school.id,
              role: "PAI",
              is_active: true,
            },
            { onConflict: "user_id,school_id,role" },
          );
          if (!roleError) {
            stats.createdGuardianRoles += 1;
            roleUpsertedUsers.add(user.id);
          } else {
            stats.errors.push({ type: "guardian_role_error", row, guardian: gRow, error: roleError.message });
          }
        }
      }

      const linkKey = `${student.id}|${guardian.id}`;
      if (!existingLinks.has(linkKey)) {
        const { error: linkError } = await supabase.from("student_guardians").insert({
          school_id: school.id,
          student_id: student.id,
          guardian_id: guardian.id,
          relationship: gRow.relationship,
          is_financial_responsible: false,
        });
        if (!linkError) {
          existingLinks.add(linkKey);
          stats.createdStudentGuardianLinks += 1;
        } else {
          stats.errors.push({ type: "student_guardian_link_error", row, guardian: gRow, error: linkError.message });
        }
      }
    }
  }

  const summary = {
    ...stats,
    errorCount: stats.errors.length,
    errorExamples: stats.errors.slice(0, 60),
  };

  fs.writeFileSync("generated_schedules/import_relacao_alunos_report.json", JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

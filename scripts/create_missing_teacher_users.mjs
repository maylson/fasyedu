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

function sanitizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function firstNamePassword(fullName) {
  const first = String(fullName || "")
    .trim()
    .split(/\s+/)[0]
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
  return `${first || "professor"}2024`;
}

async function listAllAuthUsers(admin) {
  const users = [];
  let page = 1;
  const perPage = 1000;
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

  const { data: schools, error: schoolError } = await supabase.from("schools").select("id,name,is_active").eq("is_active", true);
  if (schoolError) throw schoolError;
  const school = (schools || []).find((s) => norm(s.name).includes("colegiomirante")) || (schools || [])[0];
  if (!school) throw new Error("Escola ativa não encontrada.");

  const { data: teachers, error: teachersError } = await supabase
    .from("teachers")
    .select("id,school_id,full_name,email,user_id")
    .eq("school_id", school.id)
    .order("full_name");
  if (teachersError) throw teachersError;

  const pending = (teachers || []).filter((t) => !t.user_id);
  const authUsers = await listAllAuthUsers(supabase);
  const authByEmail = new Map(authUsers.map((u) => [sanitizeEmail(u.email), u]));

  const report = {
    school: school.name,
    school_id: school.id,
    pending: pending.length,
    created: 0,
    reused: 0,
    linked: 0,
    failed: 0,
    items: [],
  };

  for (const teacher of pending) {
    const email = sanitizeEmail(teacher.email);
    const password = firstNamePassword(teacher.full_name);
    if (!email) {
      report.failed += 1;
      report.items.push({
        teacher_id: teacher.id,
        full_name: teacher.full_name,
        email: teacher.email,
        status: "failed_no_email",
      });
      continue;
    }

    let user = authByEmail.get(email) || null;
    let status = "reused_existing_auth";

    if (!user) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: teacher.full_name },
      });
      if (createError) {
        report.failed += 1;
        report.items.push({
          teacher_id: teacher.id,
          full_name: teacher.full_name,
          email,
          password,
          status: "failed_create_auth",
          error: createError.message,
        });
        continue;
      }
      user = created.user;
      authByEmail.set(email, user);
      report.created += 1;
      status = "created_auth";
    } else {
      report.reused += 1;
    }

    const { error: linkTeacherError } = await supabase
      .from("teachers")
      .update({ user_id: user.id })
      .eq("id", teacher.id)
      .eq("school_id", school.id);

    if (linkTeacherError) {
      report.failed += 1;
      report.items.push({
        teacher_id: teacher.id,
        full_name: teacher.full_name,
        email,
        password,
        user_id: user.id,
        status: "failed_link_teacher",
        error: linkTeacherError.message,
      });
      continue;
    }

    const { error: roleError } = await supabase.from("user_school_roles").upsert(
      {
        user_id: user.id,
        school_id: school.id,
        role: "PROFESSOR",
        is_active: true,
      },
      { onConflict: "user_id,school_id,role" },
    );

    if (roleError) {
      report.failed += 1;
      report.items.push({
        teacher_id: teacher.id,
        full_name: teacher.full_name,
        email,
        password,
        user_id: user.id,
        status: "failed_role_upsert",
        error: roleError.message,
      });
      continue;
    }

    report.linked += 1;
    report.items.push({
      teacher_id: teacher.id,
      full_name: teacher.full_name,
      email,
      password,
      user_id: user.id,
      status,
    });
  }

  fs.writeFileSync("generated_schedules/create_missing_teacher_users_report.json", JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


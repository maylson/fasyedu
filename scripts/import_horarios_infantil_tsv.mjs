import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const INPUT_FILE = "generated_schedules/horarios_infantil_consolidado.tsv";

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

function parseTsv(path) {
  const raw = fs.readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function dayToNumber(day) {
  const d = norm(day);
  if (d.startsWith("segunda")) return 1;
  if (d.startsWith("terca")) return 2;
  if (d.startsWith("quarta")) return 3;
  if (d.startsWith("quinta")) return 4;
  if (d.startsWith("sexta")) return 5;
  if (d.startsWith("sabado")) return 6;
  if (d.startsWith("domingo")) return 7;
  return null;
}

function pickSchool(schools) {
  const byMirante = schools.find((s) => norm(s.name).includes("colegiomirante"));
  return byMirante || schools[0] || null;
}

function pickDirectionRole(roles) {
  return roles.find((r) => r.role === "DIRECAO" && r.is_active) || roles[0] || null;
}

function bestTeacherMatch(name, teachersByNorm, teachers) {
  const key = norm(name);
  if (!key) return null;
  if (teachersByNorm.has(key)) return teachersByNorm.get(key);

  const starts = teachers.find((t) => norm(t.full_name).startsWith(key));
  if (starts) return starts;

  const tokens = key.match(/[a-z0-9]+/g) || [];
  const partial = teachers.find((t) => {
    const nt = norm(t.full_name);
    return tokens.every((tk) => nt.includes(tk));
  });
  return partial || null;
}

function normalizeSubjectName(raw) {
  const n = norm(raw);
  if (n === "lva" || n === "lvaa") return "Leitura em Voz Alta";
  return raw;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  loadEnv();

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const tsvRows = parseTsv(INPUT_FILE);
  if (!tsvRows.length) throw new Error(`Arquivo vazio: ${INPUT_FILE}`);

  const schoolsR = await supabase.from("schools").select("id,name,is_active").eq("is_active", true);
  if (schoolsR.error) throw schoolsR.error;
  const school = pickSchool(schoolsR.data || []);
  if (!school) throw new Error("Nenhuma escola ativa encontrada.");

  const [classesR, teachersR, subjectsR, classSubjectsR, rolesR] = await Promise.all([
    supabase.from("classes").select("id,name,school_id").eq("school_id", school.id),
    supabase.from("teachers").select("id,full_name,school_id").eq("school_id", school.id),
    supabase.from("subjects").select("id,name,school_id").eq("school_id", school.id),
    supabase.from("class_subjects").select("id,class_id,subject_id,school_id").eq("school_id", school.id),
    supabase.from("user_school_roles").select("user_id,role,is_active").eq("school_id", school.id),
  ]);
  for (const r of [classesR, teachersR, subjectsR, classSubjectsR, rolesR]) {
    if (r.error) throw r.error;
  }

  const createdBy = pickDirectionRole(rolesR.data || [])?.user_id;
  if (!createdBy) throw new Error("Não encontrei usuário DIREÇÃO ativo para created_by.");

  const classes = classesR.data || [];
  const teachers = teachersR.data || [];
  const subjects = subjectsR.data || [];
  const classSubjects = classSubjectsR.data || [];

  const classByNorm = new Map(classes.map((c) => [norm(c.name), c]));
  const teachersByNorm = new Map(teachers.map((t) => [norm(t.full_name), t]));
  const subjectByNorm = new Map(subjects.map((s) => [norm(s.name), s]));

  const classSubjectByClassAndSubject = new Map();
  for (const cs of classSubjects) {
    classSubjectByClassAndSubject.set(`${cs.class_id}|${cs.subject_id}`, cs);
  }

  async function ensureTeacher(name) {
    const key = norm(name);
    if (!key) return null;
    const found = bestTeacherMatch(name, teachersByNorm, teachers);
    if (found) return found;
    const { data, error } = await supabase
      .from("teachers")
      .insert({
        school_id: school.id,
        full_name: name.trim(),
      })
      .select("id,full_name,school_id")
      .single();
    if (error) throw error;
    teachers.push(data);
    teachersByNorm.set(norm(data.full_name), data);
    return data;
  }

  async function ensureClassSubject(classId, subjectId) {
    const key = `${classId}|${subjectId}`;
    if (classSubjectByClassAndSubject.has(key)) return classSubjectByClassAndSubject.get(key);
    const { data, error } = await supabase
      .from("class_subjects")
      .insert({
        school_id: school.id,
        class_id: classId,
        subject_id: subjectId,
      })
      .select("id,class_id,subject_id,school_id")
      .single();
    if (error) throw error;
    classSubjectByClassAndSubject.set(key, data);
    return data;
  }

  const seenSlot = new Set();
  const payload = [];

  const stats = {
    totalRows: tsvRows.length,
    prepared: 0,
    skippedDuplicateSlotInFile: 0,
    unresolvedClass: 0,
    unresolvedDay: 0,
    unresolvedSubject: 0,
    unresolvedTeacher: 0,
  };

  const unresolved = [];

  for (const row of tsvRows) {
    const type = (row.Tipo || "").toUpperCase() === "INTERVALO" ? "INTERVALO" : "AULA";
    const classObj = classByNorm.get(norm(row.classname));
    if (!classObj) {
      stats.unresolvedClass += 1;
      unresolved.push({ reason: "class", row });
      continue;
    }

    const day = dayToNumber(row.DiaSemana);
    if (!day) {
      stats.unresolvedDay += 1;
      unresolved.push({ reason: "day", row });
      continue;
    }

    const startsAt = `${(row.hora_inicio || "").slice(0, 5)}:00`;
    const endsAt = `${(row.hora_fim || "").slice(0, 5)}:00`;
    const slotKey = `${classObj.id}|${day}|${startsAt}`;
    if (seenSlot.has(slotKey)) {
      stats.skippedDuplicateSlotInFile += 1;
      continue;
    }

    if (type === "INTERVALO") {
      payload.push({
        school_id: school.id,
        class_id: classObj.id,
        class_subject_id: null,
        teacher_id: null,
        entry_type: "INTERVALO",
        title: row.component || "Intervalo",
        day_of_week: day,
        starts_at: startsAt,
        ends_at: endsAt,
        created_by: createdBy,
      });
      seenSlot.add(slotKey);
      stats.prepared += 1;
      continue;
    }

    const normalizedSubjectName = normalizeSubjectName(row.component);
    const subject = subjectByNorm.get(norm(normalizedSubjectName));
    if (!subject) {
      stats.unresolvedSubject += 1;
      unresolved.push({ reason: "subject", row });
      continue;
    }
    const classSubject = await ensureClassSubject(classObj.id, subject.id);

    const teacher = await ensureTeacher(row.teachername || "");
    if (!teacher) {
      stats.unresolvedTeacher += 1;
      unresolved.push({ reason: "teacher", row });
      continue;
    }

    payload.push({
      school_id: school.id,
      class_id: classObj.id,
      class_subject_id: classSubject.id,
      teacher_id: teacher.id,
      entry_type: "AULA",
      title: null,
      day_of_week: day,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: createdBy,
    });
    seenSlot.add(slotKey);
    stats.prepared += 1;
  }

  let upserted = 0;
  for (const part of chunk(payload, 200)) {
    const { error, data } = await supabase
      .from("class_schedules")
      .upsert(part, { onConflict: "class_id,day_of_week,starts_at" })
      .select("id");
    if (error) throw error;
    upserted += (data || []).length;
  }

  const report = {
    school: school.name,
    school_id: school.id,
    ...stats,
    upserted,
    unresolvedExamples: unresolved.slice(0, 30),
  };

  fs.writeFileSync("generated_schedules/import_horarios_infantil_report.json", JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

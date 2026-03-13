import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const OUTPUT_DIR = "generated_schedules";

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

function parseArgs(argv) {
  const out = {
    input: "c:/Users/Maylson/Desktop/lectures-old-system2.json",
    schoolId: "d8f6b9cc-cfdd-43a6-b279-1e1f8ff8573c",
    apply: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input") out.input = argv[++i];
    else if (token === "--school-id") out.schoolId = argv[++i];
    else if (token === "--apply") out.apply = true;
  }
  return out;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function classKey(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normLoose(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseTime(value) {
  const m = String(value || "").trim().match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

function isoWeekday(dateIso) {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function mapStatus(value) {
  const key = normLoose(value);
  if (key.includes("aprov")) return "APPROVED";
  if (key.includes("rejeit")) return "REJECTED";
  if (key.includes("revis")) return "HUMAN_REVIEW";
  if (key.includes("rascunho")) return "DRAFT";
  return "DRAFT";
}

function pickSchedule(candidates, row) {
  const subjectNorm = normLoose(row.component);
  const teacherNorm = normLoose(row.professor);

  const strict = candidates.filter(
    (c) => normLoose(c.subject_name) === subjectNorm && normLoose(c.teacher_name) === teacherNorm,
  );
  if (strict.length === 1) return { item: strict[0], reason: "subject_teacher_exact" };
  if (strict.length > 1) return { item: null, reason: "ambiguous_subject_teacher" };

  const subjectOnly = candidates.filter((c) => normLoose(c.subject_name) === subjectNorm);
  if (subjectOnly.length > 0) return { item: null, reason: "teacher_mismatch_for_subject" };

  const teacherOnly = candidates.filter((c) => normLoose(c.teacher_name) === teacherNorm);
  if (teacherOnly.length > 0) return { item: null, reason: "subject_mismatch_for_teacher" };

  return { item: null, reason: "no_exact_subject_teacher_match" };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchAll(fromBuilder, pageSize = 1000) {
  let offset = 0;
  const out = [];
  while (true) {
    const { data, error } = await fromBuilder.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function main() {
  loadEnv();
  ensureDir(OUTPUT_DIR);
  const args = parseArgs(process.argv);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const rows = JSON.parse(fs.readFileSync(args.input, "utf8"));
  if (!Array.isArray(rows)) throw new Error("Arquivo de entrada inválido.");

  const [classes, schedulesRaw, teachers, roles, schoolR] = await Promise.all([
    fetchAll(supabase.from("classes").select("id,name,school_id").eq("school_id", args.schoolId)),
    fetchAll(
      supabase
        .from("class_schedules")
        .select("id,class_id,day_of_week,starts_at,class_subject_id,teacher_id,entry_type,teachers(full_name),class_subjects(subjects(name))")
        .eq("school_id", args.schoolId)
        .eq("entry_type", "AULA"),
    ),
    fetchAll(supabase.from("teachers").select("id,full_name,user_id").eq("school_id", args.schoolId)),
    fetchAll(supabase.from("user_school_roles").select("user_id,role,is_active").eq("school_id", args.schoolId).eq("is_active", true)),
    supabase.from("schools").select("id,name").eq("id", args.schoolId).maybeSingle(),
  ]);
  if (schoolR.error) throw schoolR.error;

  const fallbackCreatedBy =
    roles.find((r) => r.role === "SUPPORT")?.user_id ||
    roles.find((r) => r.role === "DIRECAO")?.user_id ||
    roles[0]?.user_id;
  if (!fallbackCreatedBy) throw new Error("Sem usuário para created_by.");

  const classesByKey = new Map();
  for (const c of classes) {
    const key = classKey(c.name);
    const current = classesByKey.get(key) || [];
    current.push(c);
    classesByKey.set(key, current);
  }

  const teacherByNorm = new Map(teachers.map((t) => [normLoose(t.full_name), t]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  const schedulesBySlot = new Map();
  for (const s of schedulesRaw) {
    const teacherName = Array.isArray(s.teachers) ? s.teachers[0]?.full_name ?? null : s.teachers?.full_name ?? null;
    const nestedClassSubjects = Array.isArray(s.class_subjects) ? s.class_subjects[0] : s.class_subjects;
    const nestedSubjects = Array.isArray(nestedClassSubjects?.subjects) ? nestedClassSubjects.subjects[0] : nestedClassSubjects?.subjects;
    const subjectName = nestedSubjects?.name ?? null;
    const starts = String(s.starts_at || "").slice(0, 5);
    const key = `${s.class_id}|${s.day_of_week}|${starts}`;
    const list = schedulesBySlot.get(key) || [];
    list.push({
      id: s.id,
      class_id: s.class_id,
      class_subject_id: s.class_subject_id,
      teacher_id: s.teacher_id,
      teacher_name: teacherName,
      subject_name: subjectName,
    });
    schedulesBySlot.set(key, list);
  }

  const stats = {
    source_rows: rows.length,
    prepared: 0,
    inserted: 0,
    skipped_existing: 0,
    unresolved_class: 0,
    unresolved_date: 0,
    unresolved_time: 0,
    unresolved_schedule: 0,
    unresolved_ambiguous: 0,
  };

  const unresolved = [];
  const payload = [];

  for (const row of rows) {
    const cKey = classKey(row.turma);
    const classCandidates = classesByKey.get(cKey) || [];
    if (!classCandidates.length) {
      stats.unresolved_class += 1;
      unresolved.push({ lectureid: row.lectureid, reason: "class_not_found", turma: row.turma });
      continue;
    }

    const lessonDate = String(row.data_aula || "").trim();
    const dayOfWeek = isoWeekday(lessonDate);
    if (!lessonDate || !dayOfWeek) {
      stats.unresolved_date += 1;
      unresolved.push({ lectureid: row.lectureid, reason: "invalid_date", turma: row.turma, data_aula: row.data_aula });
      continue;
    }

    const startsAt = parseTime(row.horario);
    if (!startsAt) {
      stats.unresolved_time += 1;
      unresolved.push({ lectureid: row.lectureid, reason: "invalid_time", turma: row.turma, horario: row.horario });
      continue;
    }

    let candidates = [];
    for (const c of classCandidates) {
      const slotKey = `${c.id}|${dayOfWeek}|${startsAt}`;
      const slotCandidates = schedulesBySlot.get(slotKey) || [];
      if (slotCandidates.length > 0) {
        candidates = slotCandidates;
        break;
      }
    }

    if (!candidates.length) {
      stats.unresolved_schedule += 1;
      unresolved.push({
        lectureid: row.lectureid,
        reason: "schedule_not_found",
        turma: row.turma,
        professor: row.professor,
        componente: row.component,
        data_aula: row.data_aula,
        horario: row.horario,
      });
      continue;
    }

    const picked = pickSchedule(candidates, row);
    if (!picked.item) {
      stats.unresolved_ambiguous += 1;
      unresolved.push({
        lectureid: row.lectureid,
        reason: picked.reason,
        turma: row.turma,
        professor: row.professor,
        componente: row.component,
        data_aula: row.data_aula,
        horario: row.horario,
        candidates: candidates.map((c) => ({
          schedule_id: c.id,
          subject: c.subject_name,
          teacher: c.teacher_name,
        })),
      });
      continue;
    }

    const rowTeacher = teacherByNorm.get(normLoose(row.professor));
    const scheduleTeacher = teacherById.get(picked.item.teacher_id);
    const createdBy = rowTeacher?.user_id || scheduleTeacher?.user_id || fallbackCreatedBy;

    payload.push({
      school_id: args.schoolId,
      class_subject_id: picked.item.class_subject_id,
      class_schedule_id: picked.item.id,
      lesson_date: lessonDate,
      planned_date: lessonDate,
      title: `Importação legado2 #${row.lectureid}`,
      content: row.conteudo ?? null,
      objective: row.objetivo ?? null,
      methodology: row.metodologia ?? null,
      pillars: [
        Number(row.pilarFisico) === 1 ? "Físico" : null,
        Number(row.pilarSocioafetivo) === 1 ? "Socioafetivo" : null,
        Number(row.pilarVolitivo) === 1 ? "Volitivo" : null,
        Number(row.pilarCognitivo) === 1 ? "Cognitivo" : null,
        Number(row.pilarTranscendental) === 1 ? "Transcendental" : null,
      ]
        .filter(Boolean)
        .join(", ") || null,
      resources: row.recursos ?? null,
      classroom_activities: row.ativ_em_sala ?? null,
      home_activities: row.ativ_em_casa ?? null,
      reviewer_comment: row.notasRevisor ?? null,
      status: mapStatus(row.status),
      created_by: createdBy,
      ai_feedback: null,
      analyzed_at: null,
      ai_last_response_id: null,
    });
    stats.prepared += 1;
  }

  if (args.apply && payload.length) {
    const { data: existingRows, error: existingError } = await supabase
      .from("lesson_plans")
      .select("class_schedule_id,lesson_date")
      .eq("school_id", args.schoolId)
      .not("class_schedule_id", "is", null)
      .not("lesson_date", "is", null);
    if (existingError) throw existingError;

    const existing = new Set((existingRows || []).map((r) => `${r.class_schedule_id}|${r.lesson_date}`));
    const onlyNew = payload.filter((p) => {
      const key = `${p.class_schedule_id}|${p.lesson_date}`;
      if (existing.has(key)) {
        stats.skipped_existing += 1;
        return false;
      }
      existing.add(key);
      return true;
    });

    for (const part of chunk(onlyNew, 200)) {
      const { data, error } = await supabase.from("lesson_plans").insert(part).select("id");
      if (error) throw error;
      stats.inserted += data?.length ?? part.length;
    }
  }

  const baseName = "legacy2_import_strict";
  const reportFile = path.join(OUTPUT_DIR, `${baseName}_report.json`);
  const unresolvedFile = path.join(OUTPUT_DIR, `${baseName}_unresolved.json`);
  const previewFile = path.join(OUTPUT_DIR, `${baseName}_preview.json`);

  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        apply: args.apply,
        input_file: args.input,
        school: schoolR.data,
        stats,
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(unresolvedFile, JSON.stringify(unresolved, null, 2), "utf8");
  fs.writeFileSync(
    previewFile,
    JSON.stringify(
      {
        preview_count: Math.min(payload.length, 50),
        preview_rows: payload.slice(0, 50),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Escola: ${schoolR.data?.name} (${args.schoolId})`);
  console.log(`Linhas de origem: ${stats.source_rows}`);
  console.log(`Preparadas: ${stats.prepared}`);
  console.log(`Inseridas: ${stats.inserted}`);
  console.log(`Pendências: ${unresolved.length}`);
  console.log(`Relatório: ${reportFile}`);
  console.log(`Pendências detalhadas: ${unresolvedFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

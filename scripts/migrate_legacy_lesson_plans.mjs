import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_INPUT = "c:/Users/Maylson/Desktop/lectures-old-system.json";
const OUTPUT_DIR = "generated_schedules";
const REPORT_FILE = path.join(OUTPUT_DIR, "migrate_legacy_lesson_plans_report.json");
const UNRESOLVED_FILE = path.join(OUTPUT_DIR, "migrate_legacy_lesson_plans_unresolved.json");
const PREVIEW_FILE = path.join(OUTPUT_DIR, "migrate_legacy_lesson_plans_preview.json");

const STATUS_MAP = new Map([
  ["aprovado", "APPROVED"],
  ["rejeitado", "REJECTED"],
  ["rascunho", "DRAFT"],
  ["revisao", "HUMAN_REVIEW"],
  ["revisaohumana", "HUMAN_REVIEW"],
]);

const SUBJECT_ALIASES = new Map([
  ["lingport", "linguaportuguesa"],
  ["portugues", "linguaportuguesa"],
  ["linguaportuguesa", "linguaportuguesa"],
  ["cienfis", "fisica"],
  ["cienfisica", "fisica"],
  ["fisica", "fisica"],
  ["cienbiolog", "biologia"],
  ["cienbiologia", "biologia"],
  ["biologia", "biologia"],
  ["cienquim", "quimica"],
  ["quimica", "quimica"],
  ["lva", "leituraemvozalta"],
  ["leituraemvozalta", "leituraemvozalta"],
]);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    schoolId: null,
    apply: false,
    fromDate: "2026-01-01",
    limit: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--input") {
      args.input = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--school-id") {
      args.schoolId = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--from-date") {
      args.fromDate = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--limit") {
      const parsed = Number(argv[i + 1]);
      args.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      i += 1;
      continue;
    }
  }

  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadEnv() {
  const envPath = ".env";
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
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
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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

function hhmm(value) {
  const str = String(value || "").trim();
  const m = str.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

function isoWeekday(dateIso) {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function canonicalSubjectKey(value) {
  const n = norm(maybeFixMojibake(value));
  if (SUBJECT_ALIASES.has(n)) return SUBJECT_ALIASES.get(n);
  if (n.includes("linguaportuguesa")) return "linguaportuguesa";
  if (n.includes("ingles")) return "ingles";
  if (n.includes("matematica")) return "matematica";
  if (n.includes("historia")) return "historia";
  if (n.includes("geografia")) return "geografia";
  if (n.includes("ciencias")) return "ciencias";
  if (n.includes("ensinoreligioso")) return "ensinoreligioso";
  return n;
}

function subjectMatches(legacySubject, candidateSubject) {
  const legacy = canonicalSubjectKey(legacySubject);
  const candidate = canonicalSubjectKey(candidateSubject);
  if (!legacy || !candidate) return false;
  if (legacy === candidate) return true;
  if (legacy.includes(candidate) || candidate.includes(legacy)) return true;
  return false;
}

function mapLegacyStatus(statusLabel) {
  const key = norm(maybeFixMojibake(statusLabel));
  if (STATUS_MAP.has(key)) return STATUS_MAP.get(key);
  if (key.includes("aprov")) return "APPROVED";
  if (key.includes("rejeit")) return "REJECTED";
  if (key.includes("rascunho")) return "DRAFT";
  if (key.includes("revis")) return "HUMAN_REVIEW";
  return "DRAFT";
}

function isDeletedFlag(value) {
  const key = norm(maybeFixMojibake(value));
  return key === "sim";
}

function pillarsToText(row) {
  const labels = [];
  if (Number(row.pilarFisico) === 1) labels.push("Físico");
  if (Number(row.pilarSocioafetivo) === 1) labels.push("Socioafetivo");
  if (Number(row.pilarVolitivo) === 1) labels.push("Volitivo");
  if (Number(row.pilarCognitivo) === 1) labels.push("Cognitivo");
  if (Number(row.pilarTranscendental) === 1) labels.push("Transcendental");
  return labels.length ? labels.join(", ") : null;
}

function chooseSchedule(candidates, row) {
  if (candidates.length === 1) return { chosen: candidates[0], reason: "single_candidate" };

  const teacherNorm = norm(maybeFixMojibake(row.professor));
  const subjectRaw = maybeFixMojibake(row.component);

  let best = null;
  let second = null;

  for (const candidate of candidates) {
    let score = 0;
    const candidateTeacherNorm = norm(candidate.teacher_name || "");
    const candidateSubject = candidate.subject_name || "";

    if (teacherNorm && candidateTeacherNorm === teacherNorm) score += 12;
    else if (teacherNorm && candidateTeacherNorm && (candidateTeacherNorm.includes(teacherNorm) || teacherNorm.includes(candidateTeacherNorm))) score += 8;

    if (subjectRaw && subjectMatches(subjectRaw, candidateSubject)) score += 10;
    if (subjectRaw && norm(subjectRaw) && candidateSubject && norm(candidateSubject).includes(norm(subjectRaw))) score += 2;

    const scored = { candidate, score };
    if (!best || scored.score > best.score) {
      second = best;
      best = scored;
    } else if (!second || scored.score > second.score) {
      second = scored;
    }
  }

  if (!best || best.score <= 0) return { chosen: null, reason: "no_match_score" };
  if (second && second.score === best.score) return { chosen: null, reason: "ambiguous_match" };
  return { chosen: best.candidate, reason: "scored_match" };
}

async function listAllAuthUsers(admin) {
  const users = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const current = data?.users ?? [];
    users.push(...current);
    if (current.length < perPage) break;
    page += 1;
  }
  return users;
}

function chunk(arr, size) {
  const output = [];
  for (let i = 0; i < arr.length; i += size) output.push(arr.slice(i, i + size));
  return output;
}

async function main() {
  loadEnv();
  ensureDir(OUTPUT_DIR);

  const args = parseArgs(process.argv);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const rawInput = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const sourceRows = Array.isArray(rawInput) ? rawInput : [];
  const filteredByDate = sourceRows.filter((row) => String(row.data_aula || "") >= args.fromDate);
  const rows = args.limit ? filteredByDate.slice(0, args.limit) : filteredByDate;

  const schoolsResult = await supabase.from("schools").select("id,name,is_active").eq("is_active", true);
  if (schoolsResult.error) throw schoolsResult.error;
  const schools = schoolsResult.data || [];
  const school =
    (args.schoolId ? schools.find((s) => s.id === args.schoolId) : null) ||
    schools.find((s) => norm(s.name).includes("colegiomirante")) ||
    schools[0];
  if (!school) throw new Error("Nenhuma escola ativa encontrada.");

  const [classesR, schedulesR, teachersR, rolesR, authUsers] = await Promise.all([
    supabase.from("classes").select("id,name,school_id").eq("school_id", school.id),
    supabase
      .from("class_schedules")
      .select("id,class_id,day_of_week,starts_at,entry_type,class_subject_id,teacher_id,teachers(full_name),class_subjects(subjects(name))")
      .eq("school_id", school.id)
      .eq("entry_type", "AULA"),
    supabase.from("teachers").select("id,full_name,user_id").eq("school_id", school.id),
    supabase.from("user_school_roles").select("user_id,role,is_active").eq("school_id", school.id).eq("is_active", true),
    listAllAuthUsers(supabase),
  ]);

  for (const result of [classesR, schedulesR, teachersR, rolesR]) {
    if (result.error) throw result.error;
  }

  const classes = classesR.data || [];
  const schedulesRaw = schedulesR.data || [];
  const teachers = teachersR.data || [];
  const roles = rolesR.data || [];

  const classesByNorm = new Map();
  for (const item of classes) {
    const key = norm(item.name);
    const current = classesByNorm.get(key) || [];
    current.push(item);
    classesByNorm.set(key, current);
  }
  const teacherByNorm = new Map(teachers.map((item) => [norm(item.full_name), item]));
  const teacherById = new Map(teachers.map((item) => [item.id, item]));

  const fallbackRoleOrder = ["SUPPORT", "DIRECAO", "COORDENACAO", "SECRETARIA", "PROFESSOR", "PAI", "ALUNO"];
  let fallbackCreatedBy = null;
  for (const role of fallbackRoleOrder) {
    const match = roles.find((item) => item.role === role);
    if (match) {
      fallbackCreatedBy = match.user_id;
      break;
    }
  }
  if (!fallbackCreatedBy) {
    fallbackCreatedBy = authUsers?.[0]?.id ?? null;
  }
  if (!fallbackCreatedBy) {
    throw new Error("Não foi possível determinar created_by para os planejamentos importados.");
  }

  const scheduleIndex = new Map();
  for (const raw of schedulesRaw) {
    const teacherName = Array.isArray(raw.teachers) ? raw.teachers[0]?.full_name ?? null : raw.teachers?.full_name ?? null;
    const nestedClassSubjects = Array.isArray(raw.class_subjects) ? raw.class_subjects[0] : raw.class_subjects;
    const nestedSubjects = Array.isArray(nestedClassSubjects?.subjects) ? nestedClassSubjects.subjects[0] : nestedClassSubjects?.subjects;
    const subjectName = nestedSubjects?.name ?? null;
    const starts = String(raw.starts_at || "").slice(0, 5);
    const key = `${raw.class_id}|${raw.day_of_week}|${starts}`;
    const meta = {
      id: raw.id,
      class_id: raw.class_id,
      class_subject_id: raw.class_subject_id,
      teacher_id: raw.teacher_id,
      teacher_name: teacherName,
      subject_name: subjectName,
    };
    if (!scheduleIndex.has(key)) scheduleIndex.set(key, []);
    scheduleIndex.get(key).push(meta);
  }

  const stats = {
    totalRowsInFile: sourceRows.length,
    rowsAfterDateFilter: filteredByDate.length,
    rowsConsidered: rows.length,
    skippedDeleted: 0,
    unresolvedClass: 0,
    unresolvedDate: 0,
    unresolvedTime: 0,
    unresolvedSchedule: 0,
    unresolvedAmbiguousSchedule: 0,
    prepared: 0,
    skippedAlreadyExists: 0,
    appliedUpserts: 0,
  };

  const unresolved = [];
  const payload = [];

  for (const row of rows) {
    if (isDeletedFlag(row.Deletado)) {
      stats.skippedDeleted += 1;
      continue;
    }

    const turma = cleanText(row.turma);
    const classCandidates = classesByNorm.get(norm(turma)) || [];
    if (!classCandidates.length) {
      stats.unresolvedClass += 1;
      unresolved.push({
        lectureid: row.lectureid,
        reason: "class_not_found",
        turma: turma,
      });
      continue;
    }

    const lessonDate = String(row.data_aula || "").trim();
    const dayOfWeek = isoWeekday(lessonDate);
    if (!lessonDate || !dayOfWeek) {
      stats.unresolvedDate += 1;
      unresolved.push({
        lectureid: row.lectureid,
        reason: "invalid_date",
        turma,
        data_aula: row.data_aula,
      });
      continue;
    }

    const startsAt = hhmm(row.horario);
    if (!startsAt) {
      stats.unresolvedTime += 1;
      unresolved.push({
        lectureid: row.lectureid,
        reason: "invalid_time",
        turma,
        horario: row.horario,
      });
      continue;
    }

    let classObj = null;
    let candidates = [];
    for (const candidateClass of classCandidates) {
      const slotKeyCandidate = `${candidateClass.id}|${dayOfWeek}|${startsAt}`;
      const scheduleCandidates = scheduleIndex.get(slotKeyCandidate) || [];
      if (scheduleCandidates.length > 0) {
        classObj = candidateClass;
        candidates = scheduleCandidates;
        break;
      }
    }

    if (!classObj) {
      classObj = classCandidates[0];
      const fallbackSlotKey = `${classObj.id}|${dayOfWeek}|${startsAt}`;
      candidates = scheduleIndex.get(fallbackSlotKey) || [];
    }

    if (!candidates.length) {
      stats.unresolvedSchedule += 1;
      unresolved.push({
        lectureid: row.lectureid,
        reason: "schedule_not_found",
        turma,
        data_aula: lessonDate,
        horario: startsAt,
        professor: cleanText(row.professor),
        component: cleanText(row.component),
      });
      continue;
    }

    const { chosen, reason } = chooseSchedule(candidates, row);
    if (!chosen) {
      if (reason === "ambiguous_match") stats.unresolvedAmbiguousSchedule += 1;
      else stats.unresolvedSchedule += 1;
      unresolved.push({
        lectureid: row.lectureid,
        reason,
        turma,
        data_aula: lessonDate,
        horario: startsAt,
        professor: cleanText(row.professor),
        component: cleanText(row.component),
        candidates: candidates.map((c) => ({
          schedule_id: c.id,
          teacher: c.teacher_name,
          subject: c.subject_name,
        })),
      });
      continue;
    }

    const rowTeacher = teacherByNorm.get(norm(cleanText(row.professor)));
    const scheduleTeacher = teacherById.get(chosen.teacher_id);
    const createdBy = rowTeacher?.user_id || scheduleTeacher?.user_id || fallbackCreatedBy;

    payload.push({
      school_id: school.id,
      class_subject_id: chosen.class_subject_id,
      class_schedule_id: chosen.id,
      lesson_date: lessonDate,
      planned_date: lessonDate,
      title: `Importação legado #${row.lectureid}`,
      content: cleanText(row.conteudo),
      objective: cleanText(row.objetivo),
      methodology: cleanText(row.metodologia),
      pillars: pillarsToText(row),
      resources: cleanText(row.recursos),
      classroom_activities: cleanText(row.ativ_em_sala),
      home_activities: cleanText(row.ativ_em_casa),
      reviewer_comment: cleanText(row.notasRevisor),
      status: mapLegacyStatus(row.status),
      created_by: createdBy,
      ai_feedback: null,
      analyzed_at: null,
      ai_last_response_id: null,
    });
    stats.prepared += 1;
  }

  if (args.apply && payload.length) {
    const { data: existingPlans, error: existingError } = await supabase
      .from("lesson_plans")
      .select("class_schedule_id, lesson_date")
      .eq("school_id", school.id)
      .not("class_schedule_id", "is", null)
      .not("lesson_date", "is", null);
    if (existingError) throw existingError;

    const existingKeys = new Set(
      (existingPlans || []).map((item) => `${item.class_schedule_id}|${item.lesson_date}`),
    );

    const onlyNew = payload.filter((item) => {
      const key = `${item.class_schedule_id}|${item.lesson_date}`;
      if (existingKeys.has(key)) {
        stats.skippedAlreadyExists += 1;
        return false;
      }
      existingKeys.add(key);
      return true;
    });

    for (const part of chunk(onlyNew, 200)) {
      const { error, data } = await supabase.from("lesson_plans").insert(part).select("id");
      if (error) throw error;
      stats.appliedUpserts += data?.length ?? part.length;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    apply: args.apply,
    input_file: args.input,
    school: { id: school.id, name: school.name },
    stats,
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(UNRESOLVED_FILE, JSON.stringify(unresolved, null, 2), "utf8");
  fs.writeFileSync(
    PREVIEW_FILE,
    JSON.stringify(
      {
        preview_count: Math.min(payload.length, 30),
        preview: payload.slice(0, 30),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Escola alvo: ${school.name} (${school.id})`);
  console.log(`Linhas no arquivo: ${stats.totalRowsInFile}`);
  console.log(`Linhas consideradas: ${stats.rowsConsidered}`);
  console.log(`Preparadas para migração: ${stats.prepared}`);
  console.log(`Pendências: ${unresolved.length}`);
  console.log(`Aplicado no banco: ${stats.appliedUpserts}`);
  console.log(`Relatório: ${REPORT_FILE}`);
  console.log(`Pendências detalhadas: ${UNRESOLVED_FILE}`);
  console.log(`Prévia do payload: ${PREVIEW_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const OUTPUT_DIR = "generated_schedules";
const DEFAULT_INPUT = "c:/Users/Maylson/Desktop/lectures-old-system3.json";
const DEFAULT_SCHOOL_ID = "d8f6b9cc-cfdd-43a6-b279-1e1f8ff8573c";
const DEFAULT_BATCH_ID = `LEGACY3_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;

const IGNORE_LECTURE_IDS = new Set([
  39129, 39092, 39091, 39089, 39088, 38702, 38689,
  39271, 39226, 39223, 39136, 39131, 38929, 38915, 38914, 38913, 38912, 38862, 38861, 38860, 38749, 38703, 38687, 38618,
]);

const LECTURE_OVERRIDES = new Map([
  [38946, { horario: "08:40" }],
  [38686, { horario: "09:15" }],
  [38649, { data_aula: "2026-03-05" }],
  [38596, { horario: "09:20" }],
  [38595, { horario: "09:20" }],
  [38594, { horario: "09:20" }],
  [38593, { horario: "09:20" }],
  [38592, { horario: "09:20" }],
  [38591, { horario: "07:50" }],
  [38590, { horario: "07:50" }],
  [38589, { horario: "07:50" }],
  [38588, { horario: "07:50" }],
  [38587, { horario: "07:50" }],
  [38503, { horario: "09:00" }],
]);

const TEACHER_ALIASES = new Map([
  ["rafaellaandrade", "rafaella"],
  ["silvianiamarruaz", "annemarruaz"],
  ["silvaniamarruaz", "annemarruaz"],
  ["kaleblopes", "kalleblopes"],
]);

const CLASS_ALIASES = new Map([
  ["baudomigueli", "baudomigueli"], // Bau do Miguel I -> Baú do Miguel I
]);

const SUBJECT_ALIASES = new Map([
  ["intensivodealfabetizacaoleituraemvozalta", "intensivoalfabetizacaoleituraemvozalta"],
  ["parqueintensivodealfabetizacao", "parqueintensivoalfabetizacao"],
  ["lv a", "leituraemvozalta"],
  ["lva", "leituraemvozalta"],
  ["letraseliteratura", "letramentoliterario"],
]);

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
  const args = {
    input: DEFAULT_INPUT,
    schoolId: DEFAULT_SCHOOL_ID,
    batchId: DEFAULT_BATCH_ID,
    apply: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input") args.input = argv[++i];
    else if (token === "--school-id") args.schoolId = argv[++i];
    else if (token === "--batch-id") args.batchId = argv[++i];
    else if (token === "--apply") args.apply = true;
  }
  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function classKey(value) {
  const base = String(value || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return normalizeText(base);
}

function canonicalTeacher(value) {
  const key = normalizeText(value);
  return TEACHER_ALIASES.get(key) || key;
}

function canonicalSubject(value) {
  const key = normalizeText(value);
  return SUBJECT_ALIASES.get(key) || key;
}

function canonicalClass(value) {
  const key = classKey(value);
  return CLASS_ALIASES.get(key) || key;
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
  const key = normalizeText(value);
  if (key.includes("aprov")) return "APPROVED";
  if (key.includes("rejeit")) return "REJECTED";
  if (key.includes("revis")) return "HUMAN_REVIEW";
  if (key.includes("rascunho")) return "DRAFT";
  return "DRAFT";
}

function subjectCompatible(row, candidateSubject, className) {
  const rowSubject = canonicalSubject(row.component);
  const candSubject = canonicalSubject(candidateSubject);
  if (rowSubject === candSubject) return true;

  // Regra especial: Baú do Nico I
  const classNorm = canonicalClass(className);
  if (classNorm === "baudonicoi") {
    if (rowSubject === "psicomotricidade" && candSubject === "psicomotricidadeoracao") return true;
    if (rowSubject === "psicomotricidadeoracao" && candSubject === "psicomotricidade") return true;
  }

  // Psicomotricidade pode substituir outras disciplinas
  const rowHasPsycho = rowSubject.includes("psicomotricidade");
  const candHasPsycho = candSubject.includes("psicomotricidade");
  if (rowHasPsycho || candHasPsycho) return true;

  return false;
}

function chooseScheduleStrict(candidates, row, className) {
  const tNorm = canonicalTeacher(row.professor);
  const strict = candidates.filter(
    (c) => canonicalTeacher(c.teacher_name) === tNorm && subjectCompatible(row, c.subject_name || "", className),
  );
  if (strict.length === 1) return { item: strict[0], reason: "teacher_subject_match" };
  if (strict.length > 1) return { item: null, reason: "ambiguous_teacher_subject" };

  const teacherOnly = candidates.filter((c) => canonicalTeacher(c.teacher_name) === tNorm);
  if (teacherOnly.length === 1) return { item: teacherOnly[0], reason: "teacher_only_match_with_subject_override" };
  if (teacherOnly.length > 1) return { item: null, reason: "ambiguous_teacher_only" };

  return { item: null, reason: "no_teacher_match" };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function timeToMinutes(hhmm) {
  const m = String(hhmm || "").match(/^(\d{2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function weekdayDistance(a, b) {
  const diff = Math.abs(Number(a) - Number(b));
  return Math.min(diff, 7 - diff);
}

function pickClosestByDayAndTime(candidates, targetDay, targetStartsAt) {
  if (!candidates.length) return null;
  const targetMinutes = timeToMinutes(targetStartsAt);
  const sorted = [...candidates].sort((x, y) => {
    const xDay = weekdayDistance(x.day_of_week, targetDay);
    const yDay = weekdayDistance(y.day_of_week, targetDay);
    if (xDay !== yDay) return xDay - yDay;
    const xTime = Math.abs(timeToMinutes(x.starts_at) - targetMinutes);
    const yTime = Math.abs(timeToMinutes(y.starts_at) - targetMinutes);
    if (xTime !== yTime) return xTime - yTime;
    return String(x.id).localeCompare(String(y.id));
  });
  return sorted[0];
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

  const sourceRows = JSON.parse(fs.readFileSync(args.input, "utf8"));
  if (!Array.isArray(sourceRows)) throw new Error("Entrada inválida.");

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
  if (!fallbackCreatedBy) throw new Error("Sem created_by disponível.");

  const classesByKey = new Map();
  for (const c of classes) {
    const key = canonicalClass(c.name);
    const current = classesByKey.get(key) || [];
    current.push(c);
    classesByKey.set(key, current);
  }

  const teacherByNorm = new Map(teachers.map((t) => [canonicalTeacher(t.full_name), t]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  const schedulesBySlot = new Map();
  const schedulesByClassDay = new Map();
  const schedulesByClass = new Map();
  for (const s of schedulesRaw) {
    const teacherName = Array.isArray(s.teachers) ? s.teachers[0]?.full_name ?? null : s.teachers?.full_name ?? null;
    const nestedClassSubjects = Array.isArray(s.class_subjects) ? s.class_subjects[0] : s.class_subjects;
    const nestedSubjects = Array.isArray(nestedClassSubjects?.subjects) ? nestedClassSubjects.subjects[0] : nestedClassSubjects?.subjects;
    const subjectName = nestedSubjects?.name ?? null;
    const starts = String(s.starts_at || "").slice(0, 5);
    const key = `${s.class_id}|${s.day_of_week}|${starts}`;
    const current = schedulesBySlot.get(key) || [];
    const scheduleRow = {
      id: s.id,
      class_id: s.class_id,
      day_of_week: s.day_of_week,
      starts_at: starts,
      class_subject_id: s.class_subject_id,
      teacher_id: s.teacher_id,
      teacher_name: teacherName,
      subject_name: subjectName,
    };
    current.push(scheduleRow);
    schedulesBySlot.set(key, current);

    const classDayKey = `${s.class_id}|${s.day_of_week}`;
    const classDayRows = schedulesByClassDay.get(classDayKey) || [];
    classDayRows.push(scheduleRow);
    schedulesByClassDay.set(classDayKey, classDayRows);

    const classRows = schedulesByClass.get(s.class_id) || [];
    classRows.push(scheduleRow);
    schedulesByClass.set(s.class_id, classRows);
  }

  const stats = {
    source_rows: sourceRows.length,
    ignored_by_list: 0,
    ignored_suspected_ana_paula_2b: 0,
    prepared: 0,
    inserted: 0,
    skipped_existing: 0,
    unresolved_class: 0,
    unresolved_date: 0,
    unresolved_time: 0,
    unresolved_schedule: 0,
    unresolved_ambiguous: 0,
    matched_by_ana_paula_fallback: 0,
    matched_by_leticia_fallback: 0,
  };

  const unresolved = [];
  const payload = [];

  for (const row of sourceRows) {
    const lectureid = Number(row.lectureid);
    const override = LECTURE_OVERRIDES.get(lectureid) || null;
    const effectiveDate = String(override?.data_aula ?? row.data_aula ?? "").trim();
    const effectiveTime = String(override?.horario ?? row.horario ?? "").trim();

    if (IGNORE_LECTURE_IDS.has(lectureid)) {
      stats.ignored_by_list += 1;
      continue;
    }

    if (canonicalTeacher(row.professor) === canonicalTeacher("Ana Paula Leal") && canonicalClass(row.turma) === canonicalClass("2º Ano B")) {
      stats.ignored_suspected_ana_paula_2b += 1;
      continue;
    }

    const classCandidates = classesByKey.get(canonicalClass(row.turma)) || [];
    if (!classCandidates.length) {
      stats.unresolved_class += 1;
      unresolved.push({ lectureid, reason: "class_not_found", turma: row.turma, professor: row.professor, componente: row.component });
      continue;
    }

    const lessonDate = effectiveDate;
    const dayOfWeek = isoWeekday(lessonDate);
    if (!lessonDate || !dayOfWeek) {
      stats.unresolved_date += 1;
      unresolved.push({ lectureid, reason: "invalid_date", turma: row.turma, data_aula: effectiveDate });
      continue;
    }

    const startsAt = parseTime(effectiveTime);
    if (!startsAt) {
      stats.unresolved_time += 1;
      unresolved.push({ lectureid, reason: "invalid_time", turma: row.turma, horario: effectiveTime });
      continue;
    }

    let slotCandidates = [];
    let matchedClass = classCandidates[0];
    for (const c of classCandidates) {
      const slotKey = `${c.id}|${dayOfWeek}|${startsAt}`;
      const current = schedulesBySlot.get(slotKey) || [];
      if (current.length > 0) {
        slotCandidates = current;
        matchedClass = c;
        break;
      }
    }

    if (!slotCandidates.length) {
      // Regra especial solicitada: para Ana Paula Jacó, se não existir o horário exato,
      // tenta encaixar em outro horário no mesmo dia mantendo turma+professora+disciplina.
      if (canonicalTeacher(row.professor) === canonicalTeacher("Ana Paula Jacó")) {
        let fallbackCandidates = [];
        let fallbackClass = classCandidates[0];
        for (const c of classCandidates) {
          const classDayKey = `${c.id}|${dayOfWeek}`;
          const sameDayRows = schedulesByClassDay.get(classDayKey) || [];
          if (sameDayRows.length > 0) {
            fallbackCandidates = sameDayRows;
            fallbackClass = c;
            break;
          }
        }
        if (fallbackCandidates.length > 0) {
          const fallbackPicked = chooseScheduleStrict(fallbackCandidates, row, fallbackClass.name);
          if (fallbackPicked.item) {
            slotCandidates = [fallbackPicked.item];
            matchedClass = fallbackClass;
            stats.matched_by_ana_paula_fallback += 1;
          }
        }
      }
    }

    if (!slotCandidates.length) {
      // Regra especial solicitada: Letícia Alves em Baú do Miguel III.
      // 1) tenta outro horário no mesmo dia;
      // 2) se não houver previsão no dia, tenta em qualquer dia da semana.
      if (
        canonicalTeacher(row.professor) === canonicalTeacher("Letícia Alves") &&
        canonicalClass(row.turma) === canonicalClass("Baú do Miguel III")
      ) {
        let selectedClass = classCandidates[0];
        let sameDayMatches = [];
        for (const c of classCandidates) {
          const classDayKey = `${c.id}|${dayOfWeek}`;
          const dayRows = schedulesByClassDay.get(classDayKey) || [];
          const compatible = dayRows.filter(
            (r) =>
              canonicalTeacher(r.teacher_name) === canonicalTeacher(row.professor) &&
              subjectCompatible(row, r.subject_name || "", c.name),
          );
          if (compatible.length) {
            selectedClass = c;
            sameDayMatches = compatible;
            break;
          }
        }

        if (sameDayMatches.length) {
          const picked = pickClosestByDayAndTime(sameDayMatches, dayOfWeek, startsAt);
          if (picked) {
            slotCandidates = [picked];
            matchedClass = selectedClass;
            stats.matched_by_leticia_fallback += 1;
          }
        } else {
          let weekMatches = [];
          for (const c of classCandidates) {
            const classRows = schedulesByClass.get(c.id) || [];
            const compatible = classRows.filter(
              (r) =>
                canonicalTeacher(r.teacher_name) === canonicalTeacher(row.professor) &&
                subjectCompatible(row, r.subject_name || "", c.name),
            );
            if (compatible.length) {
              selectedClass = c;
              weekMatches = compatible;
              break;
            }
          }
          const picked = pickClosestByDayAndTime(weekMatches, dayOfWeek, startsAt);
          if (picked) {
            slotCandidates = [picked];
            matchedClass = selectedClass;
            stats.matched_by_leticia_fallback += 1;
          }
        }
      }
    }

    if (!slotCandidates.length) {
      stats.unresolved_schedule += 1;
      unresolved.push({
        lectureid,
        reason: "schedule_not_found",
        turma: row.turma,
        professor: row.professor,
        componente: row.component,
        data_aula: lessonDate,
        horario: startsAt,
      });
      continue;
    }

    const picked = chooseScheduleStrict(slotCandidates, row, matchedClass.name);
    let selected = picked;
    if (!selected.item && canonicalTeacher(row.professor) === canonicalTeacher("Ana Paula Jacó")) {
      const classDayKey = `${matchedClass.id}|${dayOfWeek}`;
      const sameClassDayCandidates = schedulesByClassDay.get(classDayKey) || [];
      const fallbackPicked = chooseScheduleStrict(sameClassDayCandidates, row, matchedClass.name);
      if (fallbackPicked.item) {
        selected = fallbackPicked;
        stats.matched_by_ana_paula_fallback += 1;
      }
    }

    if (!selected.item) {
      stats.unresolved_ambiguous += 1;
      unresolved.push({
        lectureid,
        reason: selected.reason,
        turma: row.turma,
        professor: row.professor,
        componente: row.component,
        data_aula: lessonDate,
        horario: startsAt,
        candidates: slotCandidates.map((c) => ({
          schedule_id: c.id,
          subject: c.subject_name,
          teacher: c.teacher_name,
        })),
      });
      continue;
    }

    const rowTeacher = teacherByNorm.get(canonicalTeacher(row.professor));
    const scheduleTeacher = teacherById.get(selected.item.teacher_id);
    const createdBy = rowTeacher?.user_id || scheduleTeacher?.user_id || fallbackCreatedBy;

    payload.push({
      school_id: args.schoolId,
      class_subject_id: selected.item.class_subject_id,
      class_schedule_id: selected.item.id,
      lesson_date: lessonDate,
      planned_date: lessonDate,
      title: `Importação legado3 [${args.batchId}] #${lectureid}`,
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
    const toInsert = payload.filter((p) => {
      const key = `${p.class_schedule_id}|${p.lesson_date}`;
      if (existing.has(key)) {
        stats.skipped_existing += 1;
        return false;
      }
      existing.add(key);
      return true;
    });

    for (const part of chunk(toInsert, 200)) {
      const { data, error } = await supabase.from("lesson_plans").insert(part).select("id");
      if (error) throw error;
      stats.inserted += data?.length ?? part.length;
    }
  }

  const prefix = `legacy3_with_overrides_${args.batchId}`;
  const reportFile = path.join(OUTPUT_DIR, `${prefix}_report.json`);
  const unresolvedFile = path.join(OUTPUT_DIR, `${prefix}_unresolved.json`);
  const previewFile = path.join(OUTPUT_DIR, `${prefix}_preview.json`);

  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        apply: args.apply,
        input_file: args.input,
        batch_id: args.batchId,
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
        preview_count: Math.min(payload.length, 60),
        preview_rows: payload.slice(0, 60),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Batch: ${args.batchId}`);
  console.log(`Fonte: ${stats.source_rows}`);
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

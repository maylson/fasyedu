import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SCHOOL_ID = "d8f6b9cc-cfdd-43a6-b279-1e1f8ff8573c";
const INPUT_FILE = "tmp_schedule_all_from_planilha.json";
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

function norm(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function classAlias(label) {
  const n = norm(label);
  const map = new Map([
    ["7ano", "7anoa"],
    ["8ano", "8anoa"],
    ["9ano", "9anoa"],
    ["1seriemedio", "1ema"],
    ["2seriemedio", "2ema"],
    ["3seriemedio", "3ema"],
  ]);
  return map.get(n) || n;
}

function stageLabel(stage) {
  switch (stage) {
    case "FUNDAMENTAL_1":
      return "fundamental1";
    case "FUNDAMENTAL_2":
      return "fundamental2";
    case "ENSINO_MEDIO":
      return "medio";
    case "EDUCACAO_INFANTIL":
      return "infantil";
    case "CURSO_LIVRE":
      return "curso_livre";
    default:
      return "geral";
  }
}

function slugClassName(name) {
  const n = norm(name);
  return n
    .replace(/ano([a-z])$/, "ano$1")
    .replace(/em([a-z])$/, "em$1");
}

function canonicalSubject(raw) {
  const n = norm(raw);
  if (n === "portugues" || n === "lingport") return "Língua Portuguesa";
  if (n === "matematica") return "Matemática";
  if (n === "historia") return "História";
  if (n === "geografia") return "Geografia";
  if (n === "ciencias") return "Ciências";
  if (n === "ingles") return "Inglês";
  if (n === "arte") return "Arte";
  if (n.startsWith("ensrelig")) return "Ensino Religioso";
  if (n.startsWith("letcientemat")) return "Letramento Científico e Matemático";
  if (n.startsWith("letliterario")) return "Letramento Literário";
  if (n.startsWith("gcoloqaudmuspsicom") || n.startsWith("gcoloqaudmusical")) {
    return "Grupo Coloquial / Audição Musical / Psicomotricidade";
  }
  if (n === "grupocoloquial") return "Grupo Coloquial";
  if (n.startsWith("parqueintensalfab")) return "Parque / Intensivo Alfabetização";
  if (n.startsWith("intensalfablva")) return "Intensivo Alfabetização / Leitura em Voz Alta";
  if (n.startsWith("musica")) return "Música";
  if (n.startsWith("virtudes")) return "Virtudes";
  if (n.startsWith("cienquim")) return "Química";
  if (n.startsWith("cienbiolog")) return "Biologia";
  if (n.startsWith("cienfis")) return "Física";
  if (n.startsWith("quimica")) return "Química";
  if (n.startsWith("biologia")) return "Biologia";
  if (n.startsWith("fisica")) return "Física";
  if (n.startsWith("sociologia")) return "Sociologia";
  if (n.startsWith("filosofia")) return "Filosofia";
  if (n.startsWith("literatura")) return "Literatura";
  if (n.startsWith("redacao")) return "Redação";
  if (n.startsWith("tcc")) return "TCC";
  if (n.startsWith("educacaofisica") || n.startsWith("edfisica")) return "Educação Física";
  return raw;
}

const regenteByClassNorm = new Map([
  ["1anoa", "Luciana Cavalcante"],
  ["1anob", "Keila Brito"],
  ["1anoc", "Anne Marruaz"],
  ["2anoa", "Ana Paula Leal"],
  ["2anob", "Juliana Santana dos Santos"],
  ["2anoc", "Ana Cristina Maciel"],
  ["3anoa", "Aila Toscano"],
  ["3anob", "Samya Amim"],
  ["4anoa", "Tandara Soares"],
  ["4anob", "Nayara Marques"],
  ["5anoa", "Rilda Leal"],
  ["5anob", "Isadora Magno"],
]);

const teacherAlias = new Map([
  ["gabriel", "Gabriel Santos"],
  ["gabrielle", "Gabrielle Ribeiro"],
  ["beatriz", "Beatriz Farias"],
  ["monica", "Mônica Monteiro"],
  ["kalleb", "Kalleb Lopes"],
  ["rafaella", "Rafaella"],
  ["debora", "Déborah"],
  ["deborah", "Déborah"],
  ["sammy", "Rafael Sammy"],
  ["rainedy", "Rainedy Iunes"],
  ["nunes", "Marcelo Nunes"],
  ["mauricio", "Francisco Maurício"],
  ["marcal", "Marcos Marçal"],
  ["fernanda", "Fernanda Calandrin e"],
  ["ericson", "Ericson Ferreira"],
  ["wendel", "Wendel Correa"],
  ["gleidson", "Gleidson Marques"],
  ["arthur", "Arthur Oliveira"],
  ["enrique", "Enrique Capelo"],
  ["eliane", "Eliane Carvalho"],
  ["iago", "Iago Aquino"],
  ["luciano", "Luciano Cunha"],
  ["macedo", "Jorge Macedo"],
  ["heluza", "Heluza Sato"],
  ["marco", "Marco Andrade"],
  ["raquel", "Raquel Correa"],
  ["cadu", "Carlos Eduardo"],
  ["carol", "Carolina Reis"],
  ["everton", "Everton Pereira"],
  ["anderson", "Anderson Pinheiro"],
  ["henrique", "Henrique Morais"],
]);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  loadEnv();
  ensureDir(OUTPUT_DIR);

  const input = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  const records = input.registros || [];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const [classesR, teachersR, subjectsR, classSubjectsR, rolesR] = await Promise.all([
    supabase.from("classes").select("id,name,stage").eq("school_id", SCHOOL_ID),
    supabase.from("teachers").select("id,full_name,email").eq("school_id", SCHOOL_ID),
    supabase.from("subjects").select("id,name,stage").eq("school_id", SCHOOL_ID),
    supabase.from("class_subjects").select("id,class_id,subject_id").eq("school_id", SCHOOL_ID),
    supabase
      .from("user_school_roles")
      .select("user_id")
      .eq("school_id", SCHOOL_ID)
      .eq("role", "DIRECAO")
      .eq("is_active", true)
      .limit(1),
  ]);
  for (const r of [classesR, teachersR, subjectsR, classSubjectsR, rolesR]) {
    if (r.error) throw r.error;
  }
  const createdBy = rolesR.data?.[0]?.user_id;
  if (!createdBy) throw new Error("Usuário DIRECAO ativo não encontrado para created_by");

  const classesByNorm = new Map(classesR.data.map((c) => [norm(c.name), c]));
  const teachers = [...teachersR.data];
  const teacherByNorm = new Map(teachers.map((t) => [norm(t.full_name), t]));
  const subjects = [...subjectsR.data];
  const subjectByNorm = new Map(subjects.map((s) => [norm(s.name), s]));

  const classSubjectByKey = new Map();
  for (const cs of classSubjectsR.data) {
    classSubjectByKey.set(`${cs.class_id}|${cs.subject_id}`, cs);
  }

  async function ensureTeacher(name) {
    const n = norm(name);
    if (teacherByNorm.has(n)) return teacherByNorm.get(n);
    const { data, error } = await supabase
      .from("teachers")
      .insert({ school_id: SCHOOL_ID, full_name: name })
      .select("id,full_name,email")
      .single();
    if (error) throw error;
    teachers.push(data);
    teacherByNorm.set(n, data);
    return data;
  }

  async function ensureClassSubject(classId, subjectId) {
    const key = `${classId}|${subjectId}`;
    if (classSubjectByKey.has(key)) return classSubjectByKey.get(key);
    const { data, error } = await supabase
      .from("class_subjects")
      .insert({ school_id: SCHOOL_ID, class_id: classId, subject_id: subjectId })
      .select("id,class_id,subject_id")
      .single();
    if (error) throw error;
    classSubjectByKey.set(key, data);
    return data;
  }

  function resolveTeacher(entry, classNorm) {
    if (entry.tipo === "INTERVALO") return null;
    if (!entry.professor_hint) {
      const regente = regenteByClassNorm.get(classNorm);
      if (!regente) return null;
      return teacherByNorm.get(norm(regente)) || null;
    }

    const parts = entry.professor_hint
      .split(/[\/,+;]/)
      .map((p) => p.replace(/pec[-\s]*/gi, "").trim())
      .filter(Boolean);
    for (const p of parts) {
      const n = norm(p);
      const aliasName = teacherAlias.get(n);
      if (aliasName) {
        const aliased = teacherByNorm.get(norm(aliasName));
        if (aliased) return aliased;
      }
      if (teacherByNorm.has(n)) return teacherByNorm.get(n);
      const partial = teachers.find((t) => {
        const nf = norm(t.full_name);
        return nf.includes(n) || norm(t.full_name.split(" ")[0]) === n;
      });
      if (partial) return partial;
    }
    return null;
  }

  function resolveSubjectForClass(entry, classObj, classSubjects) {
    if (entry.tipo === "INTERVALO") return null;
    const desired = canonicalSubject(entry.disciplina_raw);
    const desiredNorm = norm(desired);

    const byClass = classSubjects.find((s) => norm(s.name) === desiredNorm);
    if (byClass) return byClass;

    const fallbackClass = classSubjects.find((s) => {
      const sn = norm(s.name);
      return sn.includes(desiredNorm) || desiredNorm.includes(sn);
    });
    if (fallbackClass) return fallbackClass;

    const schoolSubject = subjectByNorm.get(desiredNorm);
    if (schoolSubject) return schoolSubject;

    // Last fallback: loose match on school subjects.
    return (
      subjects.find((s) => {
        const sn = norm(s.name);
        return sn.includes(desiredNorm) || desiredNorm.includes(sn);
      }) || null
    );
  }

  // Group entries by class label from spreadsheet
  const grouped = new Map();
  for (const entry of records) {
    const classNorm = classAlias(entry.class_label);
    if (!grouped.has(classNorm)) grouped.set(classNorm, []);
    grouped.get(classNorm).push(entry);
  }

  const report = [];
  const totalSchedulesToInsert = [];

  for (const [classNorm, entries] of grouped.entries()) {
    const classObj = classesByNorm.get(classNorm);
    if (!classObj) {
      report.push({
        classNorm,
        status: "CLASS_NOT_FOUND",
        generatedFile: null,
        total: entries.length,
        unresolvedSubjects: entries.length,
        unresolvedTeachers: entries.length,
      });
      continue;
    }

    const classSubjects = classSubjectsR.data
      .filter((cs) => cs.class_id === classObj.id)
      .map((cs) => subjects.find((s) => s.id === cs.subject_id))
      .filter(Boolean);

    const jsonRows = [];
    const schedules = [];
    let unresolvedSubjects = 0;
    let unresolvedTeachers = 0;

    for (const entry of entries.sort((a, b) => {
      const byDay = Number(a.dia_ordem) - Number(b.dia_ordem);
      if (byDay !== 0) return byDay;
      return String(a.hora_inicio).localeCompare(String(b.hora_inicio), "pt-BR");
    })) {
      let teacher = resolveTeacher(entry, classNorm);
      if (!teacher && entry.tipo === "AULA" && !entry.professor_hint) {
        const regente = regenteByClassNorm.get(classNorm);
        if (regente) teacher = await ensureTeacher(regente);
      }

      const resolvedSubject = resolveSubjectForClass(entry, classObj, classSubjects);
      if (entry.tipo === "AULA" && !resolvedSubject) unresolvedSubjects += 1;
      if (entry.tipo === "AULA" && !teacher) unresolvedTeachers += 1;

      let classSubjectId = null;
      if (entry.tipo === "AULA" && resolvedSubject) {
        const cs = await ensureClassSubject(classObj.id, resolvedSubject.id);
        classSubjectId = cs.id;
      }

      jsonRows.push({
        dia_semana: entry.dia_semana,
        dia_ordem: entry.dia_ordem,
        hora_inicio: entry.hora_inicio,
        hora_fim: entry.hora_fim,
        tipo: entry.tipo,
        conteudo_raw: entry.conteudo_raw,
        disciplina_raw: entry.disciplina_raw,
        disciplina_supabase: resolvedSubject ? resolvedSubject.name : null,
        disciplina_supabase_id: resolvedSubject ? resolvedSubject.id : null,
        professor_hint: entry.professor_hint,
        professor_supabase: teacher ? teacher.full_name : null,
        professor_supabase_id: teacher ? teacher.id : null,
        linha_planilha: entry.linha_planilha,
      });

      if (entry.tipo === "INTERVALO") {
        schedules.push({
          school_id: SCHOOL_ID,
          class_id: classObj.id,
          class_subject_id: null,
          teacher_id: null,
          entry_type: "INTERVALO",
          title: "Intervalo",
          day_of_week: Number(entry.dia_ordem),
          starts_at: `${entry.hora_inicio}:00`,
          ends_at: `${entry.hora_fim}:00`,
          created_by: createdBy,
        });
      } else if (resolvedSubject && teacher) {
        schedules.push({
          school_id: SCHOOL_ID,
          class_id: classObj.id,
          class_subject_id: classSubjectId,
          teacher_id: teacher.id,
          entry_type: "AULA",
          title: null,
          day_of_week: Number(entry.dia_ordem),
          starts_at: `${entry.hora_inicio}:00`,
          ends_at: `${entry.hora_fim}:00`,
          created_by: createdBy,
        });
      }
    }

    // Deduplicate by unique slot.
    const dedup = new Map();
    for (const row of schedules) {
      dedup.set(`${row.class_id}|${row.day_of_week}|${row.starts_at}`, row);
    }
    const finalSchedules = [...dedup.values()];
    totalSchedulesToInsert.push({ classId: classObj.id, rows: finalSchedules });

    const outJson = {
      fonte: path.basename(input.fonte || "Horário_de_aulas_2026.xlsx"),
      turma: classObj.name,
      etapa: stageLabel(classObj.stage),
      total_registros: jsonRows.length,
      disciplinas_nao_resolvidas: unresolvedSubjects,
      professores_nao_resolvidos: unresolvedTeachers,
      horarios: jsonRows,
    };

    const filename = `horario_${slugClassName(classObj.name)}_${stageLabel(classObj.stage)}_normalizado.json`;
    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(outJson, null, 2), "utf8");

    report.push({
      className: classObj.name,
      file: filePath,
      total: jsonRows.length,
      unresolvedSubjects,
      unresolvedTeachers,
      importableRows: finalSchedules.length,
    });
  }

  // Import class by class without duplication:
  // use upsert on the unique slot (class_id, day_of_week, starts_at).
  for (const batch of totalSchedulesToInsert) {
    const { classId, rows } = batch;
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const ins = await supabase
        .from("class_schedules")
        .upsert(chunk, { onConflict: "class_id,day_of_week,starts_at" });
      if (ins.error) throw ins.error;
    }
  }

  const unresolvedClasses = report.filter(
    (r) => (r.unresolvedSubjects || 0) > 0 || (r.unresolvedTeachers || 0) > 0,
  ).length;

  const totalFiles = report.filter((r) => r.file).length;
  const importedRows = report.reduce((acc, r) => acc + (r.importableRows || 0), 0);

  const summary = {
    outputDir: OUTPUT_DIR,
    classesProcessed: report.length,
    filesGenerated: totalFiles,
    unresolvedClasses,
    importedRows,
    report,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "_import_summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

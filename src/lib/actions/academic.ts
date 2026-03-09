"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/constants";

const SCHOOL_MANAGEMENT_ROLES: UserRole[] = ["DIRECAO", "COORDENACAO", "SECRETARIA"];
const ACADEMIC_ROLES: UserRole[] = ["DIRECAO", "COORDENACAO", "PROFESSOR"];
const REVIEW_ROLES: UserRole[] = ["DIRECAO", "COORDENACAO"];
const SCHEDULE_MANAGEMENT_ROLES: UserRole[] = ["DIRECAO", "COORDENACAO"];

type LessonPlanStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "HUMAN_REVIEW";

type ActionContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  schoolId: string;
  userId: string;
  roles: UserRole[];
};

const EVENT_ATTACHMENTS_BUCKET = "event-attachments";
const ANNOUNCEMENT_ATTACHMENTS_BUCKET = "announcement-attachments";

function hasAnyRole(userRoles: UserRole[], allowedRoles: UserRole[]) {
  return userRoles.some((role) => allowedRoles.includes(role));
}

async function ensureEventAttachmentsBucket() {
  const admin = createAdminClient();
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === EVENT_ATTACHMENTS_BUCKET);
  if (!exists) {
    await admin.storage.createBucket(EVENT_ATTACHMENTS_BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024 });
  }
  return admin;
}

async function ensureAnnouncementAttachmentsBucket() {
  const admin = createAdminClient();
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === ANNOUNCEMENT_ATTACHMENTS_BUCKET);
  if (!exists) {
    await admin.storage.createBucket(ANNOUNCEMENT_ATTACHMENTS_BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024 });
  }
  return admin;
}

function normalizeEventDateInput(input: string) {
  const raw = input.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T08:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readEventTargeting(formData: FormData) {
  const targetStages = formData
    .getAll("target_stages")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const targetSeries = formData
    .getAll("target_series")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const targetClassIds = formData
    .getAll("target_class_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  return {
    targetStages: Array.from(new Set(targetStages)),
    targetSeries: Array.from(new Set(targetSeries)),
    targetClassIds: Array.from(new Set(targetClassIds)),
  };
}

async function uploadEventAttachment(
  schoolId: string,
  file: File | null,
  currentPath?: string | null,
): Promise<{
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
}> {
  if (!(file instanceof File) || file.size === 0) {
    return {
      attachment_path: currentPath ?? null,
      attachment_name: null,
      attachment_mime: null,
      attachment_size: null,
    };
  }

  const admin = await ensureEventAttachmentsBucket();
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const filePath = `${schoolId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(EVENT_ATTACHMENTS_BUCKET)
    .upload(filePath, bytes, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  if (currentPath) {
    await admin.storage.from(EVENT_ATTACHMENTS_BUCKET).remove([currentPath]);
  }

  return {
    attachment_path: filePath,
    attachment_name: file.name,
    attachment_mime: file.type || null,
    attachment_size: file.size,
  };
}

async function uploadAnnouncementAttachment(
  schoolId: string,
  file: File | null,
): Promise<{
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
}> {
  if (!(file instanceof File) || file.size === 0) {
    return {
      attachment_path: null,
      attachment_name: null,
      attachment_mime: null,
      attachment_size: null,
    };
  }

  const admin = await ensureAnnouncementAttachmentsBucket();
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const filePath = `${schoolId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(ANNOUNCEMENT_ATTACHMENTS_BUCKET)
    .upload(filePath, bytes, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return {
    attachment_path: filePath,
    attachment_name: file.name,
    attachment_mime: file.type || null,
    attachment_size: file.size,
  };
}

async function removeAnnouncementAttachment(path: string | null) {
  if (!path) return;
  const admin = await ensureAnnouncementAttachmentsBucket();
  await admin.storage.from(ANNOUNCEMENT_ATTACHMENTS_BUCKET).remove([path]);
}

async function getBaseContext(): Promise<ActionContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("UsuÃ¡rio nÃ£o autenticado.");
  }

  const { data: memberships, error } = await supabase
    .from("user_school_roles")
    .select("school_id, role")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  const cookieStore = await cookies();
  const activeSchoolCookie = cookieStore.get("active_school_id")?.value;
  const activeMembership = memberships.find((item) => item.school_id === activeSchoolCookie) ?? memberships[0];

  if (!activeMembership) {
    throw new Error("Nenhuma escola ativa disponÃ­vel.");
  }

  const roles = memberships
    .filter((item) => item.school_id === activeMembership.school_id)
    .map((item) => item.role as UserRole);

  return { supabase, schoolId: activeMembership.school_id, userId: user.id, roles };
}

async function getSchoolManagementContext() {
  const context = await getBaseContext();
  if (!hasAnyRole(context.roles, SCHOOL_MANAGEMENT_ROLES)) {
    throw new Error("Seu perfil nÃ£o possui permissÃ£o para cadastrar dados.");
  }
  return context;
}

async function getAcademicContext() {
  const context = await getBaseContext();
  if (!hasAnyRole(context.roles, ACADEMIC_ROLES)) {
    throw new Error("Seu perfil nÃ£o possui permissÃ£o acadÃªmica.");
  }
  return context;
}

async function getScheduleManagementContext() {
  const context = await getBaseContext();
  if (!hasAnyRole(context.roles, SCHEDULE_MANAGEMENT_ROLES)) {
    throw new Error("Somente Direção e Coordenação podem editar horários.");
  }
  return context;
}

export async function createStudentAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const registrationCode = String(formData.get("registration_code") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const stage = String(formData.get("stage") ?? "FUNDAMENTAL_1").trim();
  const birthDateRaw = String(formData.get("birth_date") ?? "").trim();

  if (!registrationCode || !fullName || !stage) {
    throw new Error("Preencha os campos obrigatÃ³rios do aluno.");
  }

  const { error } = await supabase.from("students").insert({
    school_id: schoolId,
    registration_code: registrationCode,
    full_name: fullName,
    stage,
    birth_date: birthDateRaw || null,
    status: "ATIVO",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/alunos");
  revalidatePath("/dashboard");
}

export async function createSubjectAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const stage = String(formData.get("stage") ?? "FUNDAMENTAL_1").trim();
  const workload = Number(formData.get("weekly_workload") ?? 0);

  if (!name || !stage) {
    throw new Error("Preencha os campos obrigatÃ³rios da disciplina.");
  }

  const { error } = await supabase.from("subjects").insert({
    school_id: schoolId,
    name,
    code: code || null,
    stage,
    weekly_workload: Number.isFinite(workload) && workload > 0 ? workload : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/disciplinas");
}

export async function createClassDisciplineAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();

  const classId = String(formData.get("class_id") ?? "").trim();
  const disciplineName = String(formData.get("discipline_name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!classId || !disciplineName) {
    throw new Error("Selecione a turma e informe o nome da disciplina.");
  }

  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("stage")
    .eq("id", classId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (classError || !classData) {
    throw new Error("Turma invÃ¡lida para vincular disciplina.");
  }

  let subjectId: string | null = null;

  const { data: existingSubject } = await supabase
    .from("subjects")
    .select("id")
    .eq("school_id", schoolId)
    .eq("name", disciplineName)
    .maybeSingle();

  if (existingSubject?.id) {
    subjectId = existingSubject.id;
  } else {
    const { data: createdSubject, error: subjectCreateError } = await supabase
      .from("subjects")
      .insert({
        school_id: schoolId,
        name: disciplineName,
        code: code || null,
        stage: classData.stage,
      })
      .select("id")
      .single();

    if (subjectCreateError || !createdSubject?.id) {
      throw new Error(subjectCreateError?.message ?? "NÃ£o foi possÃ­vel criar a disciplina.");
    }
    subjectId = createdSubject.id;
  }

  const { error: linkError } = await supabase.from("class_subjects").insert({
    school_id: schoolId,
    class_id: classId,
    subject_id: subjectId,
  });

  if (linkError) {
    throw new Error(linkError.message);
  }

  revalidatePath("/disciplinas");
  revalidatePath("/turmas");
  revalidatePath("/horarios");
}

export async function duplicateClassDisciplineAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const sourceLinkId = String(formData.get("source_link_id") ?? "").trim();
  const targetClassIds = formData
    .getAll("target_class_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!sourceLinkId) {
    throw new Error("Disciplina de origem invÃ¡lida para duplicaÃ§Ã£o.");
  }

  if (targetClassIds.length === 0) {
    throw new Error("Selecione ao menos uma turma de destino.");
  }

  const { data: sourceLink, error: sourceError } = await supabase
    .from("class_subjects")
    .select("class_id, subject_id")
    .eq("id", sourceLinkId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (sourceError || !sourceLink) {
    throw new Error("NÃ£o foi possÃ­vel localizar a disciplina de origem.");
  }

  const distinctTargets = Array.from(new Set(targetClassIds)).filter((classId) => classId !== sourceLink.class_id);

  if (distinctTargets.length === 0) {
    throw new Error("Selecione turmas de destino diferentes da turma de origem.");
  }

  const payload = distinctTargets.map((classId) => ({
    school_id: schoolId,
    class_id: classId,
    subject_id: sourceLink.subject_id,
  }));

  const { error } = await supabase.from("class_subjects").upsert(payload, {
    onConflict: "class_id,subject_id",
    ignoreDuplicates: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/disciplinas");
  revalidatePath("/horarios");
  redirect(`/disciplinas?success=${encodeURIComponent("Disciplina duplicada para as turmas selecionadas.")}`);
}

export async function updateClassDisciplineAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const linkId = String(formData.get("link_id") ?? "").trim();
  const classId = String(formData.get("class_id") ?? "").trim();
  const disciplineName = String(formData.get("discipline_name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!linkId || !classId || !disciplineName) {
    throw new Error("Dados obrigatÃ³rios para ediÃ§Ã£o da disciplina nÃ£o informados.");
  }

  const { data: sourceLink, error: sourceError } = await supabase
    .from("class_subjects")
    .select("id")
    .eq("id", linkId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (sourceError || !sourceLink) {
    throw new Error("Disciplina da turma nÃ£o encontrada para ediÃ§Ã£o.");
  }

  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("stage")
    .eq("id", classId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (classError || !classData) {
    throw new Error("Turma vinculada nÃ£o encontrada.");
  }

  let targetSubjectId: string;
  const { data: existingSubject } = await supabase
    .from("subjects")
    .select("id")
    .eq("school_id", schoolId)
    .eq("name", disciplineName)
    .maybeSingle();

  if (existingSubject?.id) {
    targetSubjectId = existingSubject.id;
  } else {
    const { data: createdSubject, error: createSubjectError } = await supabase
      .from("subjects")
      .insert({
        school_id: schoolId,
        name: disciplineName,
        code: code || null,
        stage: classData.stage,
      })
      .select("id")
      .single();

    if (createSubjectError || !createdSubject?.id) {
      throw new Error(createSubjectError?.message ?? "NÃ£o foi possÃ­vel criar a disciplina para atualizaÃ§Ã£o.");
    }

    targetSubjectId = createdSubject.id;
  }

  const { data: existingLink } = await supabase
    .from("class_subjects")
    .select("id")
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("subject_id", targetSubjectId)
    .neq("id", linkId)
    .maybeSingle();

  if (existingLink?.id) {
    redirect(`/disciplinas?error=${encodeURIComponent("Esta disciplina jÃ¡ estÃ¡ vinculada a esta turma.")}`);
  }

  const { error: updateError } = await supabase
    .from("class_subjects")
    .update({ class_id: classId, subject_id: targetSubjectId })
    .eq("id", linkId)
    .eq("school_id", schoolId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/disciplinas");
  revalidatePath("/horarios");
  revalidatePath("/planejamento");
  redirect(`/disciplinas?success=${encodeURIComponent("Disciplina atualizada com sucesso.")}`);
}

export async function deleteClassDisciplineAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const linkId = String(formData.get("link_id") ?? "").trim();

  if (!linkId) {
    throw new Error("Disciplina da turma invÃ¡lida para exclusÃ£o.");
  }

  const { error } = await supabase.from("class_subjects").delete().eq("id", linkId).eq("school_id", schoolId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/disciplinas");
  revalidatePath("/horarios");
  revalidatePath("/planejamento");
  redirect(`/disciplinas?success=${encodeURIComponent("Disciplina removida da turma com sucesso.")}`);
}

export async function createClassAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const name = String(formData.get("name") ?? "").trim();
  const stage = String(formData.get("stage") ?? "FUNDAMENTAL_1").trim();
  const series = String(formData.get("series") ?? "").trim();
  const shift = String(formData.get("shift") ?? "").trim();
  const vacancies = Number(formData.get("vacancies") ?? 0);

  if (!name || !stage || !shift) {
    throw new Error("Preencha os campos obrigatÃ³rios da turma.");
  }
  if (stage !== "CURSO_LIVRE" && !series) {
    throw new Error("Selecione a série da turma.");
  }

  const { data: schoolYear } = await supabase
    .from("school_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .maybeSingle();

  if (!schoolYear) {
    throw new Error("NÃ£o existe ano letivo ativo. Cadastre e ative um ano letivo primeiro.");
  }

  const { error } = await supabase.from("classes").insert({
    school_id: schoolId,
    school_year_id: schoolYear.id,
    name,
    stage,
    series: stage === "CURSO_LIVRE" ? null : series,
    shift,
    vacancies: Number.isFinite(vacancies) && vacancies >= 0 ? vacancies : 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/turmas");
  revalidatePath("/dashboard");
}

export async function createEnrollmentAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const studentId = String(formData.get("student_id") ?? "").trim();
  const classId = String(formData.get("class_id") ?? "").trim();
  const enrolledAt = String(formData.get("enrolled_at") ?? "").trim();

  if (!studentId || !classId) {
    redirect(`/matriculas?error=${encodeURIComponent("Selecione aluno e turma para realizar a matrícula.")}`);
  }

  const [studentResult, classResult] = await Promise.all([
    supabase.from("students").select("id").eq("id", studentId).eq("school_id", schoolId).maybeSingle(),
    supabase
      .from("classes")
      .select("id, school_year_id")
      .eq("id", classId)
      .eq("school_id", schoolId)
      .maybeSingle(),
  ]);

  if (!studentResult.data || !classResult.data) {
    redirect(`/matriculas?error=${encodeURIComponent("Aluno ou turma inválidos para matrícula.")}`);
  }

  const { error } = await supabase.from("enrollments").insert({
    school_id: schoolId,
    student_id: studentId,
    class_id: classId,
    school_year_id: classResult.data.school_year_id,
    status: "ATIVA",
    enrolled_at: enrolledAt || new Date().toISOString().slice(0, 10),
    canceled_at: null,
  });

  if (error) {
    const friendly = error.message.includes("unique")
      ? "Este aluno já possui matrícula ativa para esta turma no ano letivo."
      : error.message;
    redirect(`/matriculas?error=${encodeURIComponent(friendly)}`);
  }

  revalidatePath("/matriculas");
  revalidatePath("/dashboard");
  redirect(`/matriculas?success=${encodeURIComponent("Matrícula cadastrada com sucesso.")}`);
}

export async function updateEnrollmentAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const enrollmentId = String(formData.get("enrollment_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const canceledAt = String(formData.get("canceled_at") ?? "").trim();

  if (!enrollmentId || !status) {
    redirect(`/matriculas?error=${encodeURIComponent("Dados inválidos para atualizar matrícula.")}`);
  }

  const allowedStatuses = new Set(["ATIVA", "CANCELADA", "TRANCADA", "CONCLUIDA"]);
  if (!allowedStatuses.has(status)) {
    redirect(`/matriculas?error=${encodeURIComponent("Status de matrícula inválido.")}`);
  }

  const payload: { status: string; canceled_at: string | null } = {
    status,
    canceled_at: status === "CANCELADA" ? canceledAt || new Date().toISOString().slice(0, 10) : null,
  };

  const { error } = await supabase
    .from("enrollments")
    .update(payload)
    .eq("id", enrollmentId)
    .eq("school_id", schoolId);

  if (error) {
    redirect(`/matriculas?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/matriculas");
  revalidatePath("/dashboard");
  redirect(`/matriculas?success=${encodeURIComponent("Matrícula atualizada com sucesso.")}`);
}

export async function deleteEnrollmentAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const enrollmentId = String(formData.get("enrollment_id") ?? "").trim();

  if (!enrollmentId) {
    redirect(`/matriculas?error=${encodeURIComponent("Matrícula inválida para exclusão.")}`);
  }

  const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId).eq("school_id", schoolId);
  if (error) {
    redirect(`/matriculas?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/matriculas");
  revalidatePath("/dashboard");
  redirect(`/matriculas?success=${encodeURIComponent("Matrícula excluída com sucesso.")}`);
}

export async function updateClassAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const classId = String(formData.get("class_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  const series = String(formData.get("series") ?? "").trim();
  const shift = String(formData.get("shift") ?? "").trim();
  const vacancies = Number(formData.get("vacancies") ?? 0);

  if (!classId || !name || !stage || !shift) {
    throw new Error("Preencha os campos obrigatÃ³rios para editar a turma.");
  }
  if (stage !== "CURSO_LIVRE" && !series) {
    throw new Error("Selecione a série da turma.");
  }

  const { error } = await supabase
    .from("classes")
    .update({
      name,
      stage,
      series: stage === "CURSO_LIVRE" ? null : series,
      shift,
      vacancies: Number.isFinite(vacancies) && vacancies >= 0 ? vacancies : 0,
    })
    .eq("id", classId)
    .eq("school_id", schoolId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/turmas");
  revalidatePath("/disciplinas");
  revalidatePath("/horarios");
  redirect("/turmas?success=Turma%20atualizada%20com%20sucesso.");
}

export async function deleteClassAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const classId = String(formData.get("class_id") ?? "").trim();

  if (!classId) {
    redirect(`/turmas?error=${encodeURIComponent("Turma invÃ¡lida para exclusÃ£o.")}`);
  }

  const { error } = await supabase.from("classes").delete().eq("id", classId).eq("school_id", schoolId);

  if (error) {
    redirect(`/turmas?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/turmas");
  revalidatePath("/disciplinas");
  revalidatePath("/horarios");
  revalidatePath("/matriculas");
  redirect(`/turmas?success=${encodeURIComponent("Turma excluÃ­da com sucesso.")}`);
}

export async function linkSubjectToClassAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const classId = String(formData.get("class_id") ?? "").trim();
  const subjectId = String(formData.get("subject_id") ?? "").trim();
  const teacherId = String(formData.get("teacher_id") ?? "").trim();

  if (!classId || !subjectId || !teacherId) {
    throw new Error("Selecione turma, disciplina e professor para vincular.");
  }

  const { error } = await supabase.from("class_subjects").insert({
    school_id: schoolId,
    class_id: classId,
    subject_id: subjectId,
    teacher_id: teacherId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/turmas");
  revalidatePath("/horarios");
  revalidatePath("/planejamento");
  revalidatePath("/coordenacao");
}

export async function createAssessmentAction(formData: FormData) {
  const { supabase, schoolId, userId } = await getAcademicContext();
  const classSubjectId = String(formData.get("class_subject_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const assessmentDate = String(formData.get("assessment_date") ?? "").trim();
  const maxScore = Number(formData.get("max_score") ?? 10);

  if (!classSubjectId || !title || !assessmentDate) {
    redirect(`/avaliacoes?error=${encodeURIComponent("Preencha turma/disciplina, titulo e data da avaliacao.")}`);
  }

  const { data: classSubject } = await supabase
    .from("class_subjects")
    .select("id")
    .eq("id", classSubjectId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!classSubject) {
    redirect(`/avaliacoes?error=${encodeURIComponent("Turma/disciplina invalida para criar avaliacao.")}`);
  }

  const { error } = await supabase.from("assessments").insert({
    school_id: schoolId,
    class_subject_id: classSubjectId,
    title,
    assessment_date: assessmentDate,
    max_score: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 10,
    created_by: userId,
  });

  if (error) {
    redirect(`/avaliacoes?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/avaliacoes");
  revalidatePath("/dashboard");
  redirect(`/avaliacoes?success=${encodeURIComponent("Avaliacao cadastrada com sucesso.")}`);
}

export async function createAssessmentItemAction(formData: FormData) {
  const { supabase, schoolId } = await getAcademicContext();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const weight = Number(formData.get("weight") ?? 1);
  const maxScore = Number(formData.get("max_score") ?? 10);

  if (!assessmentId || !title) {
    redirect(`/avaliacoes?error=${encodeURIComponent("Preencha avaliacao e titulo do item.")}`);
  }

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id")
    .eq("id", assessmentId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!assessment) {
    redirect(`/avaliacoes?error=${encodeURIComponent("Avaliacao invalida para adicionar item.")}`);
  }

  const { error } = await supabase.from("assessment_items").insert({
    school_id: schoolId,
    assessment_id: assessmentId,
    title,
    weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
    max_score: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 10,
  });

  if (error) {
    redirect(`/avaliacoes?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/avaliacoes");
  redirect(`/avaliacoes?success=${encodeURIComponent("Item da avaliacao cadastrado com sucesso.")}`);
}

export async function upsertGradeAction(formData: FormData) {
  const { supabase, schoolId } = await getAcademicContext();
  const assessmentItemId = String(formData.get("assessment_item_id") ?? "").trim();
  const enrollmentId = String(formData.get("enrollment_id") ?? "").trim();
  const score = Number(formData.get("score") ?? 0);

  if (!assessmentItemId || !enrollmentId || !Number.isFinite(score)) {
    redirect(`/avaliacoes?error=${encodeURIComponent("Preencha item, matricula e nota.")}`);
  }

  const [itemResult, enrollmentResult] = await Promise.all([
    supabase
      .from("assessment_items")
      .select("id, max_score, assessments!inner(id, class_subject_id)")
      .eq("id", assessmentItemId)
      .eq("school_id", schoolId)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("id, class_id")
      .eq("id", enrollmentId)
      .eq("school_id", schoolId)
      .maybeSingle(),
  ]);

  if (!itemResult.data || !enrollmentResult.data) {
    redirect(`/avaliacoes?error=${encodeURIComponent("Item de avaliacao ou matricula invalida.")}`);
  }

  const itemAssessment = Array.isArray(itemResult.data.assessments)
    ? itemResult.data.assessments[0]
    : itemResult.data.assessments;

  const { data: classSubject } = await supabase
    .from("class_subjects")
    .select("id, class_id")
    .eq("id", itemAssessment.class_subject_id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!classSubject || classSubject.class_id !== enrollmentResult.data.class_id) {
    redirect(`/avaliacoes?error=${encodeURIComponent("A matricula nao pertence a turma da avaliacao selecionada.")}`);
  }

  if (score < 0 || score > Number(itemResult.data.max_score ?? 10)) {
    redirect(`/avaliacoes?error=${encodeURIComponent("A nota deve estar dentro do intervalo permitido para o item.")}`);
  }

  const { error } = await supabase.from("grades").upsert(
    {
      school_id: schoolId,
      enrollment_id: enrollmentId,
      assessment_item_id: assessmentItemId,
      score,
    },
    { onConflict: "enrollment_id,assessment_item_id" },
  );

  if (error) {
    redirect(`/avaliacoes?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/avaliacoes");
  revalidatePath("/dashboard");
  redirect(`/avaliacoes?success=${encodeURIComponent("Nota salva com sucesso.")}`);
}

export async function createAnnouncementAction(formData: FormData) {
  const { supabase, schoolId, userId, roles } = await getBaseContext();
  if (!roles.includes("DIRECAO") && !roles.includes("COORDENACAO")) {
    throw new Error("Somente Direção e Coordenação podem publicar avisos no mural.");
  }

  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const audience = String(formData.get("audience") ?? "TODOS").trim();
  const isPinned = String(formData.get("is_pinned") ?? "") === "on";
  const publishedDateRaw = String(formData.get("published_date") ?? "").trim();
  const attachmentFile = formData.get("attachment_file");

  if (!title || !message) {
    throw new Error("Preencha os campos obrigatÃ³rios do aviso.");
  }

  let publishedAt = new Date();
  if (publishedDateRaw) {
    const parsed = new Date(`${publishedDateRaw}T08:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Data de publicação inválida.");
    }
    publishedAt = parsed;
  }

  const attachment = await uploadAnnouncementAttachment(
    schoolId,
    attachmentFile instanceof File ? attachmentFile : null,
  );

  const { error } = await supabase.from("announcements").insert({
    school_id: schoolId,
    title,
    message,
    audience,
    is_pinned: isPinned,
    published_at: publishedAt.toISOString(),
    ...attachment,
    created_by: userId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/mural");
  revalidatePath("/dashboard");
}

export async function updateAnnouncementAction(formData: FormData) {
  const { supabase, schoolId, roles } = await getBaseContext();
  if (!roles.includes("DIRECAO") && !roles.includes("COORDENACAO")) {
    throw new Error("Somente Direção e Coordenação podem editar avisos no mural.");
  }

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const audience = String(formData.get("audience") ?? "TODOS").trim();
  const isPinned = String(formData.get("is_pinned") ?? "") === "on";
  const publishedDateRaw = String(formData.get("published_date") ?? "").trim();
  const removeAttachment = String(formData.get("remove_attachment") ?? "") === "on";
  const attachmentFile = formData.get("attachment_file");

  if (!id || !title || !message) {
    redirect(`/mural?error=${encodeURIComponent("Preencha os campos obrigatórios do aviso.")}`);
  }

  const { data: existing, error: existingError } = await supabase
    .from("announcements")
    .select("id, attachment_path")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (existingError || !existing) {
    redirect(`/mural?error=${encodeURIComponent("Aviso não encontrado para edição.")}`);
  }

  let publishedAt = new Date();
  if (publishedDateRaw) {
    const parsed = new Date(`${publishedDateRaw}T08:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      redirect(`/mural?error=${encodeURIComponent("Data de publicação inválida.")}`);
    }
    publishedAt = parsed;
  }

  let attachmentPayload: {
    attachment_path: string | null;
    attachment_name: string | null;
    attachment_mime: string | null;
    attachment_size: number | null;
  } = {
    attachment_path: existing.attachment_path,
    attachment_name: null,
    attachment_mime: null,
    attachment_size: null,
  };

  if (removeAttachment) {
    await removeAnnouncementAttachment(existing.attachment_path);
    attachmentPayload = {
      attachment_path: null,
      attachment_name: null,
      attachment_mime: null,
      attachment_size: null,
    };
  }

  if (attachmentFile instanceof File && attachmentFile.size > 0) {
    const uploaded = await uploadAnnouncementAttachment(schoolId, attachmentFile);
    if (existing.attachment_path) {
      await removeAnnouncementAttachment(existing.attachment_path);
    }
    attachmentPayload = uploaded;
  }

  const { error } = await supabase
    .from("announcements")
    .update({
      title,
      message,
      audience,
      is_pinned: isPinned,
      published_at: publishedAt.toISOString(),
      ...attachmentPayload,
    })
    .eq("id", id)
    .eq("school_id", schoolId);

  if (error) {
    redirect(`/mural?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/mural");
  revalidatePath("/dashboard");
  redirect(`/mural?success=${encodeURIComponent("Aviso atualizado com sucesso.")}`);
}

export async function deleteAnnouncementAction(formData: FormData) {
  const { supabase, schoolId, roles } = await getBaseContext();
  if (!roles.includes("DIRECAO") && !roles.includes("COORDENACAO")) {
    throw new Error("Somente Direção e Coordenação podem excluir avisos no mural.");
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect(`/mural?error=${encodeURIComponent("Aviso inválido para exclusão.")}`);
  }

  const { data: existing } = await supabase
    .from("announcements")
    .select("attachment_path")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (existing?.attachment_path) {
    await removeAnnouncementAttachment(existing.attachment_path);
  }

  const { error } = await supabase.from("announcements").delete().eq("id", id).eq("school_id", schoolId);
  if (error) {
    redirect(`/mural?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/mural");
  revalidatePath("/dashboard");
  redirect(`/mural?success=${encodeURIComponent("Aviso excluído com sucesso.")}`);
}

export async function createEventAction(formData: FormData) {
  const { supabase, schoolId, userId } = await getSchoolManagementContext();
  const title = String(formData.get("title") ?? "").trim();
  const startsAtRaw = String(formData.get("event_date") ?? formData.get("starts_at") ?? "").trim();
  const endsAtRaw = String(formData.get("ends_at") ?? "").trim();
  const audience = String(formData.get("audience") ?? "TODOS").trim();
  const description = String(formData.get("description") ?? "").trim();
  const eventType = String(formData.get("event_type") ?? "PROGRAMACAO").trim();
  const isAdministrative = String(formData.get("is_administrative") ?? "") === "on";
  const attachmentFile = formData.get("attachment_file");

  if (!title || !startsAtRaw) {
    throw new Error("Título e início do evento são obrigatórios.");
  }

  const startsAt = normalizeEventDateInput(startsAtRaw);
  if (!startsAt) {
    throw new Error("Data do evento inválida.");
  }

  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAtRaw && (!endsAt || Number.isNaN(endsAt.getTime()))) {
    throw new Error("Data/hora de término inválida.");
  }
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new Error("O término não pode ser antes do início.");
  }

  const rawTargeting = readEventTargeting(formData);
  const targetStages = isAdministrative ? [] : rawTargeting.targetStages;
  const targetSeries = isAdministrative ? [] : rawTargeting.targetSeries;
  const targetClassIds = isAdministrative ? [] : rawTargeting.targetClassIds;
  const attachment = await uploadEventAttachment(schoolId, attachmentFile instanceof File ? attachmentFile : null);

  const { error } = await supabase.from("events").insert({
    school_id: schoolId,
    title,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt ? endsAt.toISOString() : null,
    audience,
    description: description || null,
    event_type: eventType,
    target_stages: targetStages,
    target_series: targetSeries,
    target_class_ids: targetClassIds,
    is_administrative: isAdministrative,
    ...attachment,
    created_by: userId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/calendario");
  revalidatePath("/dashboard");
}

export async function updateEventAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const startsAtRaw = String(formData.get("event_date") ?? formData.get("starts_at") ?? "").trim();
  const endsAtRaw = String(formData.get("ends_at") ?? "").trim();
  const audience = String(formData.get("audience") ?? "TODOS").trim();
  const description = String(formData.get("description") ?? "").trim();
  const eventType = String(formData.get("event_type") ?? "PROGRAMACAO").trim();
  const isAdministrative = String(formData.get("is_administrative") ?? "") === "on";
  const removeAttachment = String(formData.get("remove_attachment") ?? "") === "on";
  const attachmentFile = formData.get("attachment_file");

  if (!id || !title || !startsAtRaw) {
    throw new Error("Dados obrigatórios para edição do evento não informados.");
  }

  const startsAt = normalizeEventDateInput(startsAtRaw);
  if (!startsAt) {
    throw new Error("Data do evento inválida.");
  }
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAtRaw && (!endsAt || Number.isNaN(endsAt.getTime()))) {
    throw new Error("Data/hora de término inválida.");
  }
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new Error("O término não pode ser antes do início.");
  }

  const { data: existingEvent, error: existingError } = await supabase
    .from("events")
    .select("id, attachment_path, attachment_name, attachment_mime, attachment_size")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (existingError || !existingEvent) {
    throw new Error("Evento não encontrado para edição.");
  }

  let attachmentPayload = {
    attachment_path: existingEvent.attachment_path as string | null,
    attachment_name: existingEvent.attachment_name as string | null,
    attachment_mime: existingEvent.attachment_mime as string | null,
    attachment_size: existingEvent.attachment_size as number | null,
  };

  if (removeAttachment && existingEvent.attachment_path) {
    const admin = await ensureEventAttachmentsBucket();
    await admin.storage.from(EVENT_ATTACHMENTS_BUCKET).remove([existingEvent.attachment_path]);
    attachmentPayload = {
      attachment_path: null,
      attachment_name: null,
      attachment_mime: null,
      attachment_size: null,
    };
  }

  if (attachmentFile instanceof File && attachmentFile.size > 0) {
    const uploaded = await uploadEventAttachment(schoolId, attachmentFile, attachmentPayload.attachment_path);
    attachmentPayload = uploaded;
  }

  const rawTargeting = readEventTargeting(formData);
  const targetStages = isAdministrative ? [] : rawTargeting.targetStages;
  const targetSeries = isAdministrative ? [] : rawTargeting.targetSeries;
  const targetClassIds = isAdministrative ? [] : rawTargeting.targetClassIds;

  const { error } = await supabase
    .from("events")
    .update({
      title,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
      audience,
      description: description || null,
      event_type: eventType,
      target_stages: targetStages,
      target_series: targetSeries,
      target_class_ids: targetClassIds,
      is_administrative: isAdministrative,
      ...attachmentPayload,
    })
    .eq("id", id)
    .eq("school_id", schoolId);

  if (error) throw new Error(error.message);

  revalidatePath("/calendario");
  revalidatePath("/dashboard");
}

export async function deleteEventAction(formData: FormData) {
  const { supabase, schoolId } = await getSchoolManagementContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Evento inválido para exclusão.");

  const { data: event } = await supabase
    .from("events")
    .select("attachment_path")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (event?.attachment_path) {
    const admin = await ensureEventAttachmentsBucket();
    await admin.storage.from(EVENT_ATTACHMENTS_BUCKET).remove([event.attachment_path]);
  }

  const { error } = await supabase.from("events").delete().eq("id", id).eq("school_id", schoolId);
  if (error) throw new Error(error.message);

  revalidatePath("/calendario");
  revalidatePath("/dashboard");
}

export async function createClassScheduleAction(formData: FormData) {
  const { supabase, schoolId, userId } = await getScheduleManagementContext();
  const classId = String(formData.get("class_id") ?? "").trim();
  const entryType = String(formData.get("entry_type") ?? "AULA").trim();
  const title = String(formData.get("title") ?? "").trim();
  const classSubjectId = String(formData.get("class_subject_id") ?? "").trim();
  const teacherId = String(formData.get("teacher_id") ?? "").trim();
  const dayOfWeek = Number(formData.get("day_of_week") ?? 0);
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const endsAt = String(formData.get("ends_at") ?? "").trim();

  if (!classId || !dayOfWeek || !startsAt || !endsAt) {
    redirect(
      `/horarios?class_id=${encodeURIComponent(classId)}&error=${encodeURIComponent("Preencha os campos obrigatórios do horário.")}`,
    );
  }

  const isInterval = entryType === "INTERVALO";
  if (!isInterval && (!classSubjectId || !teacherId)) {
    redirect(
      `/horarios?class_id=${encodeURIComponent(classId)}&error=${encodeURIComponent("Para aula, selecione disciplina e professor.")}`,
    );
  }

  const { error } = await supabase.from("class_schedules").insert({
    school_id: schoolId,
    class_id: classId,
    entry_type: isInterval ? "INTERVALO" : "AULA",
    title: isInterval ? title || "Intervalo" : null,
    class_subject_id: isInterval ? null : classSubjectId,
    teacher_id: isInterval ? null : teacherId,
    day_of_week: dayOfWeek,
    starts_at: startsAt,
    ends_at: endsAt,
    created_by: userId,
  });
  if (error) {
    const normalized = error.message ?? "Não foi possível adicionar o horário.";
    const friendlyMessage = normalized.includes("uq_class_schedules_slot")
      ? "Já existe um horário nesta turma para o mesmo dia e horário de início."
      : normalized.includes("Selected class subject does not belong to selected class")
        ? "A disciplina selecionada não pertence à turma escolhida."
        : normalized.includes("chk_class_schedules_entry_data")
          ? "Para aula, informe disciplina e professor. Para intervalo, não informe esses campos."
          : normalized;
    redirect(
      `/horarios?class_id=${encodeURIComponent(classId)}&error=${encodeURIComponent(friendlyMessage)}`,
    );
  }

  revalidatePath("/horarios");
  revalidatePath("/planejamento");
  revalidatePath("/coordenacao");
}

export async function updateClassScheduleAction(formData: FormData) {
  const { supabase, schoolId } = await getScheduleManagementContext();
  const id = String(formData.get("id") ?? "").trim();
  const entryType = String(formData.get("entry_type") ?? "AULA").trim();
  const classSubjectId = String(formData.get("class_subject_id") ?? "").trim();
  const teacherId = String(formData.get("teacher_id") ?? "").trim();
  const dayOfWeek = Number(formData.get("day_of_week") ?? 0);
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const endsAt = String(formData.get("ends_at") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  if (!id || !dayOfWeek || !startsAt || !endsAt) {
    throw new Error("Dados inválidos para atualização do horário.");
  }
  if (entryType !== "INTERVALO" && (!classSubjectId || !teacherId)) {
    throw new Error("Para aula, selecione disciplina e professor.");
  }

  const { data: currentSchedule, error: currentScheduleError } = await supabase
    .from("class_schedules")
    .select("id, class_id")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (currentScheduleError || !currentSchedule) {
    throw new Error("Horário não encontrado para atualização.");
  }

  const { error } = await supabase
    .from("class_schedules")
    .update({
      entry_type: entryType === "INTERVALO" ? "INTERVALO" : "AULA",
      class_subject_id: entryType === "INTERVALO" ? null : classSubjectId,
      teacher_id: entryType === "INTERVALO" ? null : teacherId,
      day_of_week: dayOfWeek,
      starts_at: startsAt,
      ends_at: endsAt,
      title: entryType === "INTERVALO" ? title || "Intervalo" : null,
    })
    .eq("id", id)
    .eq("school_id", schoolId);
  if (error) {
    const normalized = error.message ?? "Não foi possível atualizar o horário.";
    const friendlyMessage = normalized.includes("uq_class_schedules_slot")
      ? "Já existe um horário nesta turma para o mesmo dia e horário de início."
      : normalized.includes("Selected class subject does not belong to selected class")
        ? "A disciplina selecionada não pertence à turma escolhida."
        : normalized.includes("chk_class_schedules_entry_data")
          ? "Para aula, informe disciplina e professor. Para intervalo, não informe esses campos."
          : normalized;
    redirect(
      `/horarios?class_id=${encodeURIComponent(currentSchedule.class_id)}&edit_schedule_id=${encodeURIComponent(id)}&error=${encodeURIComponent(friendlyMessage)}`,
    );
  }

  revalidatePath("/horarios");
  revalidatePath("/planejamento");
  revalidatePath("/coordenacao");
  redirect(`/horarios?class_id=${encodeURIComponent(currentSchedule.class_id)}`);
}

export async function deleteClassScheduleAction(formData: FormData) {
  const { supabase, schoolId } = await getScheduleManagementContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("HorÃ¡rio invÃ¡lido para exclusÃ£o.");

  const { error } = await supabase.from("class_schedules").delete().eq("id", id).eq("school_id", schoolId);
  if (error) throw new Error(error.message);

  revalidatePath("/horarios");
  revalidatePath("/planejamento");
  revalidatePath("/coordenacao");
}

export async function saveLessonPlanAction(formData: FormData) {
  const { supabase, schoolId, userId, roles } = await getAcademicContext();

  const id = String(formData.get("id") ?? "").trim();
  const classScheduleId = String(formData.get("class_schedule_id") ?? "").trim();
  const lessonDate = String(formData.get("lesson_date") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const objective = String(formData.get("objective") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const methodology = String(formData.get("methodology") ?? "").trim();
  const pillars = String(formData.get("pillars") ?? "").trim();
  const resources = String(formData.get("resources") ?? "").trim();
  const classroomActivities = String(formData.get("classroom_activities") ?? "").trim();
  const homeActivities = String(formData.get("home_activities") ?? "").trim();
  const aiFeedback = String(formData.get("ai_feedback") ?? "").trim();
  const requestedStatus = String(formData.get("status") ?? "DRAFT").trim() as LessonPlanStatus;
  const reviewerComment = String(formData.get("reviewer_comment") ?? "").trim();

  if (!classScheduleId || !lessonDate) {
    throw new Error("HorÃ¡rio e data da aula sÃ£o obrigatÃ³rios.");
  }

  const { data: schedule, error: scheduleError } = await supabase
    .from("class_schedules")
    .select("id, class_subject_id, entry_type")
    .eq("id", classScheduleId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (scheduleError || !schedule) {
    throw new Error("Horário da aula não encontrado.");
  }
  if (!schedule.class_subject_id || schedule.entry_type === "INTERVALO") {
    throw new Error("Este horário não está vinculado a uma disciplina válida para planejamento.");
  }

  const canReview = hasAnyRole(roles, REVIEW_ROLES);
  if (!canReview && reviewerComment) {
    throw new Error("Somente coordenaÃ§Ã£o/direÃ§Ã£o pode registrar parecer.");
  }

  const normalizedStatus: LessonPlanStatus = requestedStatus === "UNDER_REVIEW" ? "HUMAN_REVIEW" : requestedStatus;

  const payload = {
    school_id: schoolId,
    class_subject_id: schedule.class_subject_id,
    class_schedule_id: classScheduleId,
    lesson_date: lessonDate,
    title: title || `Planejamento ${lessonDate}`,
    objective: objective || null,
    content: content || null,
    methodology: methodology || null,
    pillars: pillars || null,
    resources: resources || null,
    classroom_activities: classroomActivities || null,
    home_activities: homeActivities || null,
    ai_feedback: aiFeedback || null,
    analyzed_at: aiFeedback ? new Date().toISOString() : null,
    planned_date: lessonDate,
    status: normalizedStatus,
    reviewer_comment: canReview ? reviewerComment || null : null,
    created_by: userId,
  };

  if (id) {
    const { error } = await supabase.from("lesson_plans").update(payload).eq("id", id).eq("school_id", schoolId);
    if (error) throw new Error(error.message);
  } else {
    const { data: existing } = await supabase
      .from("lesson_plans")
      .select("id")
      .eq("school_id", schoolId)
      .eq("class_schedule_id", classScheduleId)
      .eq("lesson_date", lessonDate)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase.from("lesson_plans").update(payload).eq("id", existing.id).eq("school_id", schoolId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("lesson_plans").insert(payload);
      if (error) throw new Error(error.message);
    }
  }

  revalidatePath("/planejamento");
  revalidatePath("/coordenacao");
}

export async function deleteLessonPlanAction(formData: FormData) {
  const { supabase, schoolId, roles, userId } = await getAcademicContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Planejamento invÃ¡lido.");

  const canReview = hasAnyRole(roles, REVIEW_ROLES);
  let query = supabase.from("lesson_plans").delete().eq("id", id).eq("school_id", schoolId);
  if (!canReview) {
    query = query.eq("created_by", userId);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidatePath("/planejamento");
  revalidatePath("/coordenacao");
}

export async function duplicateLessonPlanAction(formData: FormData) {
  const { supabase, schoolId, roles, userId } = await getAcademicContext();
  const sourceId = String(formData.get("source_id") ?? "").trim();
  const targetScheduleId = String(formData.get("target_schedule_id") ?? "").trim();
  const targetLessonDate = String(formData.get("target_lesson_date") ?? "").trim();

  if (!sourceId || !targetScheduleId || !targetLessonDate) {
    throw new Error("Dados obrigatÃ³rios para duplicaÃ§Ã£o nÃ£o informados.");
  }

  const canReview = hasAnyRole(roles, REVIEW_ROLES);
  let sourceQuery = supabase.from("lesson_plans").select("*").eq("id", sourceId).eq("school_id", schoolId);
  if (!canReview) sourceQuery = sourceQuery.eq("created_by", userId);
  const { data: source, error: sourceError } = await sourceQuery.maybeSingle();
  if (sourceError || !source) throw new Error("Planejamento de origem nÃ£o encontrado.");

  const { data: targetSchedule, error: targetScheduleError } = await supabase
    .from("class_schedules")
    .select("id, class_subject_id, entry_type, day_of_week")
    .eq("id", targetScheduleId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (targetScheduleError || !targetSchedule) {
    throw new Error("Horário de destino não encontrado para duplicação.");
  }
  if (!targetSchedule.class_subject_id || targetSchedule.entry_type === "INTERVALO") {
    throw new Error("O horário de destino não permite planejamento porque não possui disciplina.");
  }

  const targetDate = new Date(`${targetLessonDate}T12:00:00`);
  if (Number.isNaN(targetDate.getTime())) {
    throw new Error("Data de destino inválida.");
  }
  const isoWeekday = targetDate.getDay() === 0 ? 7 : targetDate.getDay();
  if (isoWeekday !== targetSchedule.day_of_week) {
    throw new Error("A data de destino precisa corresponder ao dia da semana do horário selecionado.");
  }

  const sourceStatus = source.status === "UNDER_REVIEW" ? "HUMAN_REVIEW" : source.status;

  const payload = {
    school_id: schoolId,
    class_subject_id: targetSchedule.class_subject_id,
    class_schedule_id: targetScheduleId,
    lesson_date: targetLessonDate,
    title: source.title,
    objective: source.objective,
    content: source.content,
    methodology: source.methodology ?? null,
    pillars: source.pillars ?? null,
    resources: source.resources ?? null,
    classroom_activities: source.classroom_activities ?? null,
    home_activities: source.home_activities ?? null,
    ai_feedback: null,
    ai_last_response_id: null,
    analyzed_at: null,
    planned_date: targetLessonDate,
    status: (sourceStatus as LessonPlanStatus) ?? ("DRAFT" as LessonPlanStatus),
    reviewer_comment: null,
    created_by: userId,
  };

  const { data: existing } = await supabase
    .from("lesson_plans")
    .select("id")
    .eq("school_id", schoolId)
    .eq("class_schedule_id", targetScheduleId)
    .eq("lesson_date", targetLessonDate)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("lesson_plans").update(payload).eq("id", existing.id).eq("school_id", schoolId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("lesson_plans").insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/planejamento");
}

export async function addLessonPlanLinkResourceAction(formData: FormData) {
  const { supabase, schoolId, userId } = await getAcademicContext();
  const lessonPlanId = String(formData.get("lesson_plan_id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();

  if (!lessonPlanId || !url) {
    throw new Error("Informe o plano e a URL do recurso.");
  }

  const { data: plan, error: planError } = await supabase
    .from("lesson_plans")
    .select("id")
    .eq("id", lessonPlanId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (planError || !plan) {
    throw new Error("Plano de aula nao encontrado para adicionar o link.");
  }

  const { error } = await supabase.from("lesson_plan_resources").insert({
    school_id: schoolId,
    lesson_plan_id: lessonPlanId,
    resource_type: "LINK",
    label: label || null,
    url,
    created_by: userId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/planejamento");
}

export async function uploadLessonPlanFileResourceAction(formData: FormData) {
  const { supabase, schoolId, userId } = await getAcademicContext();
  const lessonPlanId = String(formData.get("lesson_plan_id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");

  if (!lessonPlanId || !(file instanceof File) || file.size === 0) {
    throw new Error("Selecione um arquivo valido para anexar ao plano.");
  }

  const { data: plan, error: planError } = await supabase
    .from("lesson_plans")
    .select("id")
    .eq("id", lessonPlanId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (planError || !plan) {
    throw new Error("Plano de aula nao encontrado para anexar arquivo.");
  }

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const filePath = `${schoolId}/${lessonPlanId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("lesson-plan-resources")
    .upload(filePath, bytes, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: dbError } = await supabase.from("lesson_plan_resources").insert({
    school_id: schoolId,
    lesson_plan_id: lessonPlanId,
    resource_type: "FILE",
    label: label || null,
    file_path: filePath,
    file_name: file.name,
    file_size: file.size,
    created_by: userId,
  });

  if (dbError) throw new Error(dbError.message);

  revalidatePath("/planejamento");
}

export async function deleteLessonPlanResourceAction(formData: FormData) {
  const { supabase, schoolId } = await getAcademicContext();
  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    throw new Error("Recurso invalido para exclusao.");
  }

  const { data: resource, error: resourceError } = await supabase
    .from("lesson_plan_resources")
    .select("id, file_path")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (resourceError || !resource) {
    throw new Error("Recurso nao encontrado.");
  }

  if (resource.file_path) {
    const admin = createAdminClient();
    await admin.storage.from("lesson-plan-resources").remove([resource.file_path]);
  }

  const { error } = await supabase.from("lesson_plan_resources").delete().eq("id", id).eq("school_id", schoolId);
  if (error) throw new Error(error.message);

  revalidatePath("/planejamento");
}


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

function hasAnyRole(userRoles: UserRole[], allowedRoles: UserRole[]) {
  return userRoles.some((role) => allowedRoles.includes(role));
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

export async function createAnnouncementAction(formData: FormData) {
  const { supabase, schoolId, userId } = await getSchoolManagementContext();
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const audience = String(formData.get("audience") ?? "TODOS").trim();
  const isPinned = String(formData.get("is_pinned") ?? "") === "on";

  if (!title || !message) {
    throw new Error("Preencha os campos obrigatÃ³rios do aviso.");
  }

  const { error } = await supabase.from("announcements").insert({
    school_id: schoolId,
    title,
    message,
    audience,
    is_pinned: isPinned,
    created_by: userId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/mural");
  revalidatePath("/dashboard");
}

export async function createEventAction(formData: FormData) {
  const { supabase, schoolId, userId } = await getSchoolManagementContext();
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const endsAt = String(formData.get("ends_at") ?? "").trim();
  const audience = String(formData.get("audience") ?? "TODOS").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!title || !startsAt) {
    throw new Error("TÃ­tulo e inÃ­cio do evento sÃ£o obrigatÃ³rios.");
  }

  const { error } = await supabase.from("events").insert({
    school_id: schoolId,
    title,
    starts_at: startsAt,
    ends_at: endsAt || null,
    audience,
    description: description || null,
    created_by: userId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/calendario");
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
  if (error) throw new Error(error.message);

  revalidatePath("/horarios");
  revalidatePath("/planejamento");
  revalidatePath("/coordenacao");
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


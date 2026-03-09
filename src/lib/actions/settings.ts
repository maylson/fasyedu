"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/constants";

async function getDirectionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
    throw new Error("Nenhuma escola ativa encontrada.");
  }

  const roles = memberships
    .filter((item) => item.school_id === activeMembership.school_id)
    .map((item) => item.role as UserRole);

  if (!roles.includes("DIRECAO")) {
    throw new Error("Apenas Direção pode alterar configurações.");
  }

  return { supabase, schoolId: activeMembership.school_id };
}

export async function createSchoolYearAction(formData: FormData) {
  const { supabase, schoolId } = await getDirectionContext();
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const endsAt = String(formData.get("ends_at") ?? "").trim();

  if (!title || !startsAt || !endsAt) {
    redirect(`/configuracoes/ano-letivo?error=${encodeURIComponent("Preencha título, início e fim do ano letivo.")}`);
  }

  const { error } = await supabase.from("school_years").insert({
    school_id: schoolId,
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: false,
  });

  if (error) {
    redirect(`/configuracoes/ano-letivo?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/configuracoes/ano-letivo");
  revalidatePath("/turmas");
  redirect(`/configuracoes/ano-letivo?success=${encodeURIComponent("Ano letivo criado com sucesso.")}`);
}

export async function activateSchoolYearAction(formData: FormData) {
  const { supabase, schoolId } = await getDirectionContext();
  const schoolYearId = String(formData.get("school_year_id") ?? "").trim();

  if (!schoolYearId) {
    redirect(`/configuracoes/ano-letivo?error=${encodeURIComponent("Ano letivo inválido para ativação.")}`);
  }

  const { error: clearError } = await supabase
    .from("school_years")
    .update({ is_active: false })
    .eq("school_id", schoolId)
    .eq("is_active", true);

  if (clearError) {
    redirect(`/configuracoes/ano-letivo?error=${encodeURIComponent(clearError.message)}`);
  }

  const { error: activateError } = await supabase
    .from("school_years")
    .update({ is_active: true })
    .eq("school_id", schoolId)
    .eq("id", schoolYearId);

  if (activateError) {
    redirect(`/configuracoes/ano-letivo?error=${encodeURIComponent(activateError.message)}`);
  }

  revalidatePath("/configuracoes/ano-letivo");
  revalidatePath("/turmas");
  redirect(`/configuracoes/ano-letivo?success=${encodeURIComponent("Ano letivo ativado com sucesso.")}`);
}

export async function updatePlanningPreferencesAction(formData: FormData) {
  const { supabase, schoolId } = await getDirectionContext();
  const planningPillarsEnabled = String(formData.get("planning_pillars_enabled") ?? "") === "on";

  const { error } = await supabase
    .from("schools")
    .update({ planning_pillars_enabled: planningPillarsEnabled })
    .eq("id", schoolId);

  if (error) {
    redirect(`/configuracoes/pedagogico?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/configuracoes/pedagogico");
  revalidatePath("/planejamento");
  redirect(`/configuracoes/pedagogico?success=${encodeURIComponent("Preferências pedagógicas atualizadas com sucesso.")}`);
}

export async function updateFamilyPortalSettingsAction(formData: FormData) {
  const { supabase, schoolId } = await getDirectionContext();
  const agendaEnabled = String(formData.get("student_agenda_enabled") ?? "") === "on";

  const { error } = await supabase
    .from("schools")
    .update({
      parent_contents_enabled: agendaEnabled,
      student_agenda_enabled: agendaEnabled,
    })
    .eq("id", schoolId);

  if (error) {
    redirect(`/configuracoes/pedagogico?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/configuracoes/pedagogico");
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  redirect(`/configuracoes/pedagogico?success=${encodeURIComponent("Configurações da agenda da família atualizadas com sucesso.")}`);
}

export async function updateSchoolLlmSettingsAction(formData: FormData) {
  const { supabase, schoolId } = await getDirectionContext();
  const llmEnabled = String(formData.get("llm_enabled") ?? "") === "on";
  const llmProvider = String(formData.get("llm_provider") ?? "OPENAI").trim().toUpperCase();
  const llmModel = String(formData.get("llm_model") ?? "").trim();
  const llmBaseUrl = String(formData.get("llm_base_url") ?? "").trim();
  const llmApiKey = String(formData.get("llm_api_key") ?? "").trim();
  const llmPromptTemplate = String(formData.get("llm_prompt_template") ?? "").trim();

  const updatePayload: {
    llm_enabled: boolean;
    llm_provider: string;
    llm_model: string | null;
    llm_base_url: string | null;
    llm_prompt_template: string | null;
    llm_api_key?: string;
  } = {
    llm_enabled: llmEnabled,
    llm_provider: llmProvider || "OPENAI",
    llm_model: llmModel || null,
    llm_base_url: llmBaseUrl || null,
    llm_prompt_template: llmPromptTemplate || null,
  };

  if (llmApiKey) {
    updatePayload.llm_api_key = llmApiKey;
  }

  const { error } = await supabase.from("schools").update(updatePayload).eq("id", schoolId);

  if (error) {
    redirect(`/configuracoes/pedagogico?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/configuracoes/pedagogico");
  revalidatePath("/planejamento");
  redirect(`/configuracoes/pedagogico?success=${encodeURIComponent("Configurações de IA atualizadas com sucesso.")}`);
}

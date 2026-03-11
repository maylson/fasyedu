"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_OPTIONS, type UserRole } from "@/lib/constants";

const MANAGEMENT_ROLES: UserRole[] = ["SUPPORT", "DIRECAO", "COORDENACAO", "SECRETARIA"];

function hasManagementRole(roles: UserRole[]) {
  return roles.some((role) => MANAGEMENT_ROLES.includes(role));
}

async function getUserManagementContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Usuário não autenticado.");
  }

  const { data: memberships, error } = await supabase
    .from("user_school_roles")
    .select("school_id, role")
    .eq("user_id", user.id)
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

  if (!hasManagementRole(roles)) {
    throw new Error("Sem permissão para criar usuários.");
  }

  return { schoolId: activeMembership.school_id, creatorUserId: user.id };
}

async function getDirectionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Usuário não autenticado.");
  }

  const { data: memberships, error } = await supabase
    .from("user_school_roles")
    .select("school_id, role")
    .eq("user_id", user.id)
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

  const schoolRoles = memberships
    .filter((item) => item.school_id === activeMembership.school_id)
    .map((item) => item.role as UserRole);

  if (!schoolRoles.includes("DIRECAO") && !schoolRoles.includes("SUPPORT")) {
    throw new Error("Apenas o perfil DIREÇÃO pode editar outros usuários.");
  }

  return { schoolId: activeMembership.school_id };
}

export async function createUserWithRolesAction(formData: FormData) {
  try {
    const { schoolId } = await getUserManagementContext();
    const admin = createAdminClient();

    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const rawSelectedRoles = formData
      .getAll("roles")
      .map((value) => String(value).trim());
    if (rawSelectedRoles.includes("SUPPORT")) {
      redirect(`/usuarios?error=${encodeURIComponent("A role SUPPORT é interna e não pode ser atribuída por esta interface.")}`);
    }
    const selectedRoles = rawSelectedRoles
      .filter((role): role is (typeof ROLE_OPTIONS)[number] => ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number]));

    if (!fullName || !email || !password) {
      redirect(`/usuarios?error=${encodeURIComponent("Nome, e-mail e senha são obrigatórios.")}`);
    }
    if (password.length < 8) {
      redirect(`/usuarios?error=${encodeURIComponent("A senha deve ter no mínimo 8 caracteres.")}`);
    }
    if (selectedRoles.length === 0) {
      redirect(`/usuarios?error=${encodeURIComponent("Selecione ao menos um perfil para o usuário.")}`);
    }

    const createResult = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createResult.error) {
      const errorMessage = createResult.error.message.toLowerCase();
      if (errorMessage.includes("already")) {
        redirect(
          `/usuarios?error=${encodeURIComponent(
            "Já existe um usuário com esse e-mail. Use a edição de usuário para ajustar os perfis.",
          )}`,
        );
      } else {
        redirect(`/usuarios?error=${encodeURIComponent(createResult.error.message)}`);
      }
    }

    const targetUserId = createResult.data.user.id;

    const { data: currentAuthUser, error: currentAuthUserError } = await admin.auth.admin.getUserById(targetUserId);
    if (currentAuthUserError) {
      redirect(`/usuarios?error=${encodeURIComponent(currentAuthUserError.message)}`);
    }

    const currentEmail = (currentAuthUser.user?.email ?? "").trim().toLowerCase();
    if (currentEmail !== email) {
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetUserId, {
        email,
        email_confirm: true,
      });
      if (authUpdateError) {
        const friendly = authUpdateError.message.toLowerCase().includes("already")
          ? "Este e-mail já está em uso por outro usuário."
          : authUpdateError.message;
        redirect(`/usuarios?error=${encodeURIComponent(friendly)}`);
      }
    }

    const { error: profileError } = await admin.from("user_profiles").upsert({
      id: targetUserId,
      full_name: fullName,
      phone: phone || null,
    });
    if (profileError) {
      redirect(`/usuarios?error=${encodeURIComponent(profileError.message)}`);
    }

    const rows = selectedRoles.map((role) => ({
      user_id: targetUserId,
      school_id: schoolId,
      role,
      is_active: true,
    }));

    const { error: rolesError } = await admin.from("user_school_roles").upsert(rows, {
      onConflict: "user_id,school_id,role",
    });
    if (rolesError) {
      redirect(`/usuarios?error=${encodeURIComponent(rolesError.message)}`);
    }

    if (selectedRoles.includes("PROFESSOR")) {
      const { error: teacherError } = await admin.from("teachers").upsert(
        {
          school_id: schoolId,
          user_id: targetUserId,
          full_name: fullName,
          email,
          phone: phone || null,
        },
        { onConflict: "user_id" },
      );
      if (teacherError) {
        redirect(`/usuarios?error=${encodeURIComponent(teacherError.message)}`);
      }
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Erro inesperado ao criar usuário.";
    redirect(`/usuarios?error=${encodeURIComponent(message)}`);
  }

  redirect(`/usuarios?success=${encodeURIComponent("Usuário criado e vinculado com sucesso.")}`);
}

export async function updateUserByDirectionAction(formData: FormData) {
  try {
    const { schoolId } = await getDirectionContext();
    const admin = createAdminClient();

    const targetUserId = String(formData.get("target_user_id") ?? "").trim();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const rawSelectedRoles = formData
      .getAll("roles")
      .map((value) => String(value).trim());
    if (rawSelectedRoles.includes("SUPPORT")) {
      redirect(`/usuarios?error=${encodeURIComponent("A role SUPPORT é interna e não pode ser atribuída por esta interface.")}`);
    }
    const selectedRoles = rawSelectedRoles
      .filter((role): role is (typeof ROLE_OPTIONS)[number] => ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number]));

    if (!targetUserId) {
      redirect(`/usuarios?error=${encodeURIComponent("Usuário alvo inválido.")}`);
    }
    if (!fullName) {
      redirect(`/usuarios?error=${encodeURIComponent("Nome completo é obrigatório.")}`);
    }
    if (!email) {
      redirect(`/usuarios?error=${encodeURIComponent("E-mail é obrigatório.")}`);
    }
    if (selectedRoles.length === 0) {
      redirect(`/usuarios?error=${encodeURIComponent("Selecione ao menos um perfil ativo.")}`);
    }

    const { data: currentAuthUser, error: currentAuthUserError } = await admin.auth.admin.getUserById(targetUserId);
    if (currentAuthUserError) {
      redirect(`/usuarios?error=${encodeURIComponent(currentAuthUserError.message)}`);
    }

    const currentEmail = (currentAuthUser.user?.email ?? "").trim().toLowerCase();
    if (currentEmail !== email) {
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetUserId, {
        email,
        email_confirm: true,
      });
      if (authUpdateError) {
        const friendly = authUpdateError.message.toLowerCase().includes("already")
          ? "Este e-mail já está em uso por outro usuário."
          : authUpdateError.message;
        redirect(`/usuarios?error=${encodeURIComponent(friendly)}`);
      }
    }

    const { error: profileError } = await admin.from("user_profiles").upsert({
      id: targetUserId,
      full_name: fullName,
      phone: phone || null,
    });
    if (profileError) {
      redirect(`/usuarios?error=${encodeURIComponent(profileError.message)}`);
    }

    const { data: existingRoles, error: existingRolesError } = await admin
      .from("user_school_roles")
      .select("id, role")
      .eq("school_id", schoolId)
      .eq("user_id", targetUserId);

    if (existingRolesError) {
      redirect(`/usuarios?error=${encodeURIComponent(existingRolesError.message)}`);
    }

    const existingByRole = new Map((existingRoles ?? []).map((row) => [row.role as UserRole, row]));

    for (const role of ROLE_OPTIONS) {
      const shouldBeActive = selectedRoles.includes(role);
      const existingRow = existingByRole.get(role);

      if (existingRow) {
        const { error } = await admin.from("user_school_roles").update({ is_active: shouldBeActive }).eq("id", existingRow.id);
        if (error) {
          redirect(`/usuarios?error=${encodeURIComponent(error.message)}`);
        }
      } else if (shouldBeActive) {
        const { error } = await admin.from("user_school_roles").insert({
          user_id: targetUserId,
          school_id: schoolId,
          role,
          is_active: true,
        });
        if (error) {
          redirect(`/usuarios?error=${encodeURIComponent(error.message)}`);
        }
      }
    }

    if (selectedRoles.includes("PROFESSOR")) {
      const { data: authUser } = await admin.auth.admin.getUserById(targetUserId);
      const email = authUser.user?.email ?? null;
      const { error: teacherError } = await admin.from("teachers").upsert(
        {
          school_id: schoolId,
          user_id: targetUserId,
          full_name: fullName,
          email,
          phone: phone || null,
        },
        { onConflict: "user_id" },
      );
      if (teacherError) {
        redirect(`/usuarios?error=${encodeURIComponent(teacherError.message)}`);
      }
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Erro inesperado ao editar usuário.";
    redirect(`/usuarios?error=${encodeURIComponent(message)}`);
  }

  redirect(`/usuarios?success=${encodeURIComponent("Usuário atualizado com sucesso.")}`);
}




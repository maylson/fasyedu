"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateMyProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();

  if (!fullName) {
    redirect(`/minha-conta?error=${encodeURIComponent("Nome completo é obrigatório.")}`);
  }

  const { error } = await supabase.from("user_profiles").upsert({
    id: user.id,
    full_name: fullName,
    phone: phone || null,
    document: document || null,
  });

  if (error) {
    redirect(`/minha-conta?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/minha-conta?success=${encodeURIComponent("Dados atualizados com sucesso.")}`);
}

export async function updateMyPasswordAction(formData: FormData) {
  const supabase = await createClient();
  const password = String(formData.get("password") ?? "").trim();
  const confirmPassword = String(formData.get("confirm_password") ?? "").trim();

  if (password.length < 8) {
    redirect(`/minha-conta?error=${encodeURIComponent("A nova senha deve ter no mínimo 8 caracteres.")}`);
  }

  if (password !== confirmPassword) {
    redirect(`/minha-conta?error=${encodeURIComponent("As senhas não conferem.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/minha-conta?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/minha-conta?success=${encodeURIComponent("Senha alterada com sucesso.")}`);
}

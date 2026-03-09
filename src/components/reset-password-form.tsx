"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setStatus("error");
      setMessage("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("As senhas não conferem.");
      return;
    }

    setStatus("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("error");
      setMessage("Link inválido ou expirado. Solicite uma nova recuperação.");
      return;
    }

    setStatus("success");
    setMessage("Senha atualizada com sucesso. Você já pode entrar no sistema.");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {message ? (
        <p className={`rounded-xl px-3 py-2 text-sm ${status === "success" ? "border border-cyan-200 bg-cyan-50 text-[var(--brand-blue)]" : "border border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Nova senha</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="fasy-input"
          placeholder="Mínimo de 8 caracteres"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Confirmar senha</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          className="fasy-input"
          placeholder="Repita a senha"
        />
      </label>

      <button type="submit" disabled={status === "loading"} className="fasy-btn-primary w-full px-4 py-2 disabled:opacity-70">
        {status === "loading" ? "Atualizando..." : "Atualizar senha"}
      </button>
    </form>
  );
}

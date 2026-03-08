"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const supabase = useMemo(() => createClient(), []);
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
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            status === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
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
          className="w-full rounded-xl border border-[var(--line)] px-3 py-2 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-emerald-100"
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
          className="w-full rounded-xl border border-[var(--line)] px-3 py-2 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-emerald-100"
          placeholder="Repita a senha"
        />
      </label>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-xl bg-[var(--primary)] px-4 py-2 font-medium text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-70"
      >
        {status === "loading" ? "Atualizando..." : "Atualizar senha"}
      </button>
    </form>
  );
}

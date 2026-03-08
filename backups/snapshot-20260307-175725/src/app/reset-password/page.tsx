import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="fasy-grid fasy-aurora flex min-h-screen items-center justify-center p-4">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[0_16px_50px_rgba(6,98,67,0.16)]">
        <h1 className="text-2xl font-semibold">Redefinir senha</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Defina uma nova senha para continuar no FASY.
        </p>

        <ResetPasswordForm />

        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-[var(--primary-strong)] underline">
          Voltar para login
        </Link>
      </section>
    </main>
  );
}

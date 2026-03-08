import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="fasy-grid fasy-aurora flex min-h-screen items-center justify-center p-4">
      <section className="fasy-glass w-full max-w-lg rounded-3xl p-8">
        <h1 className="text-2xl font-semibold">Redefinir senha</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Defina uma nova senha para continuar no FASY.</p>

        <ResetPasswordForm />

        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-[var(--brand-blue)] underline">
          Voltar para login
        </Link>
      </section>
    </main>
  );
}
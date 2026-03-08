import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { requestPasswordResetAction } from "@/lib/actions/auth";

type ForgotPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;

  return (
    <main className="fasy-grid fasy-aurora flex min-h-screen items-center justify-center p-4">
      <section className="fasy-glass w-full max-w-lg rounded-3xl p-8">
        <h1 className="text-2xl font-semibold">Recuperar senha</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Enviaremos um link para redefinição da sua senha.</p>

        {error ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-[var(--brand-blue)]">{success}</p> : null}

        <form action={requestPasswordResetAction} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">E-mail</span>
            <input name="email" type="email" required className="fasy-input" placeholder="seu@email.com" />
          </label>

          <SubmitButton className="fasy-btn-primary w-full px-4 py-2" pendingLabel="Enviando...">
            Enviar link de recuperação
          </SubmitButton>
        </form>

        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-[var(--brand-blue)] underline">
          Voltar para login
        </Link>
      </section>
    </main>
  );
}

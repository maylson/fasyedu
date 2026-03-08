import Link from "next/link";
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
      <section className="w-full max-w-lg rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[0_16px_50px_rgba(6,98,67,0.16)]">
        <h1 className="text-2xl font-semibold">Recuperar senha</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Enviaremos um link para redefinição da sua senha.</p>

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}

        <form action={requestPasswordResetAction} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Email</span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-[var(--line)] px-3 py-2 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-emerald-100"
              placeholder="seu@email.com"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--primary)] px-4 py-2 font-medium text-white transition hover:bg-[var(--primary-strong)]"
          >
            Enviar link de recuperação
          </button>
        </form>

        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-[var(--primary-strong)] underline">
          Voltar para login
        </Link>
      </section>
    </main>
  );
}

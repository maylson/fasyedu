import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { signInAction } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="fasy-grid fasy-aurora relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <section className="w-full max-w-4xl rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_24px_70px_rgba(8,33,63,0.22)]">
        <div className="grid md:grid-cols-2">
          <div className="fasy-dark-panel rounded-l-3xl p-10">
            <p className="text-xs tracking-[0.18em] uppercase text-cyan-100">FASY</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-[var(--brand-ice)]">Formative Assessment System</h1>
            <p className="mt-4 text-sm text-cyan-100">Gestão escolar e pedagógica multiescola com acompanhamento de aprendizagem.</p>
          </div>

          <div className="p-8 md:p-10">
            <h2 className="text-2xl font-semibold">Entrar</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Acesse com e-mail e senha da sua conta.</p>

            {error ? (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            ) : null}

            <form action={signInAction} className="mt-6 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">E-mail</span>
                <input name="email" type="email" required className="fasy-input" placeholder="seu@email.com" />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Senha</span>
                <input name="password" type="password" required className="fasy-input" placeholder="********" />
              </label>

              <SubmitButton className="fasy-btn-primary w-full px-4 py-2" pendingLabel="Entrando...">
                Entrar no FASY
              </SubmitButton>
            </form>

            <Link href="/forgot-password" className="mt-4 inline-block text-sm font-medium text-[var(--brand-blue)] underline">
              Esqueci minha senha
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

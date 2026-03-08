import Link from "next/link";
import { redirect } from "next/navigation";
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
      <section className="w-full max-w-4xl rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_24px_70px_rgba(6,98,67,0.18)]">
        <div className="grid md:grid-cols-2">
          <div className="rounded-l-3xl bg-[var(--primary-strong)] p-10 text-white">
            <p className="text-xs tracking-[0.18em] uppercase text-emerald-100">FASY</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight">Formative Assessment System</h1>
            <p className="mt-4 text-sm text-emerald-100">
              Gestão escolar e pedagógica multiescola com acompanhamento de aprendizagem.
            </p>
          </div>

          <div className="p-8 md:p-10">
            <h2 className="text-2xl font-semibold">Entrar</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Acesse com email e senha da sua conta.</p>

            {error ? (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            ) : null}

            <form action={signInAction} className="mt-6 space-y-4">
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

              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Senha</span>
                <input
                  name="password"
                  type="password"
                  required
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-emerald-100"
                  placeholder="********"
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-xl bg-[var(--primary)] px-4 py-2 font-medium text-white transition hover:bg-[var(--primary-strong)]"
              >
                Entrar no FASY
              </button>
            </form>

            <Link href="/forgot-password" className="mt-4 inline-block text-sm font-medium text-[var(--primary-strong)] underline">
              Esqueci minha senha
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

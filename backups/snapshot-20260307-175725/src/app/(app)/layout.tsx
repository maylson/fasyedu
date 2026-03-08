import Link from "next/link";
import { ReactNode } from "react";
import { getUserContext } from "@/lib/app-context";
import { setActiveSchoolAction, signOutAction } from "@/lib/actions/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/usuarios", label: "Usuários" },
  { href: "/alunos", label: "Alunos e Pais" },
  { href: "/turmas", label: "Turmas" },
  { href: "/disciplinas", label: "Disciplinas" },
  { href: "/matriculas", label: "Matrículas" },
  { href: "/planejamento", label: "Planejamento" },
  { href: "/avaliacoes", label: "Avaliações" },
  { href: "/calendario", label: "Calendário" },
  { href: "/mural", label: "Mural" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, memberships, activeSchoolId, roles } = await getUserContext();
  const activeSchool = memberships.find((item) => item.school_id === activeSchoolId)?.schools?.name ?? "Sem escola ativa";

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-7xl gap-4 md:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(6,98,67,0.1)]">
          <p className="text-xs tracking-[0.18em] uppercase text-[var(--muted)]">FASY</p>
          <h1 className="mt-2 text-xl font-semibold leading-tight">Formative Assessment System</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">{activeSchool}</p>

          <nav className="mt-6 grid gap-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-transparent px-3 py-2 text-sm transition hover:border-[var(--line)] hover:bg-[#f7faf6]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-6 rounded-xl border border-[var(--line)] bg-[#f8fbf8] p-3 text-xs">
            <p className="font-medium">{user.email}</p>
            <p className="mt-1 text-[var(--muted)]">Perfis: {roles.join(", ") || "Sem perfil"}</p>
          </div>

          <form action={signOutAction} className="mt-4">
            <button
              type="submit"
              className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-medium transition hover:bg-[#f7faf6]"
            >
              Sair
            </button>
          </form>
        </aside>

        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_10px_30px_rgba(6,98,67,0.1)] md:p-6">
          <div className="mb-6 flex flex-col gap-3 border-b border-[var(--line)] pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-[var(--muted)]">Escola ativa</p>
              <h2 className="text-lg font-semibold">{activeSchool}</h2>
            </div>

            <form action={setActiveSchoolAction} className="flex items-center gap-2">
              <select
                name="school_id"
                defaultValue={activeSchoolId ?? ""}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              >
                {memberships.map((membership) => (
                  <option key={`${membership.school_id}-${membership.role}`} value={membership.school_id}>
                    {membership.schools?.name ?? membership.school_id}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
              >
                Trocar
              </button>
            </form>
          </div>

          {children}
        </section>
      </div>
    </div>
  );
}

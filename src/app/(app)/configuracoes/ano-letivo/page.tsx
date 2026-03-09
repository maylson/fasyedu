import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import { activateSchoolYearAction, createSchoolYearAction } from "@/lib/actions/settings";
import { getUserContext } from "@/lib/app-context";

type AnoLetivoPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnoLetivoPage({ searchParams }: AnoLetivoPageProps) {
  const { supabase, activeSchoolId, roles } = await getUserContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;
  const isDirection = roles.includes("DIRECAO") || roles.includes("SUPPORT");
  const isSupport = roles.includes("SUPPORT");

  const { data: schoolYears } = await supabase
    .from("school_years")
    .select("id, title, starts_at, ends_at, is_active")
    .eq("school_id", activeSchoolId)
    .order("starts_at", { ascending: false });

  if (!isDirection) {
    return (
      <ModuleShell title="Configurações · Ano Letivo" description="Configuração anual da escola">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Somente a Direção pode alterar configurações de ano letivo.
        </p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell title="Configurações · Ano Letivo" description="Defina e ative o ano letivo da escola">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1 text-sm text-[var(--brand-blue)]">Ano letivo</span>
        {isSupport ? (
          <Link href="/configuracoes/pedagogico" className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]">
            Pedagógico
          </Link>
        ) : null}
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      ) : null}

      <form action={createSchoolYearAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-3">
        <input name="title" required placeholder="Ex: 2027" className="fasy-input" />
        <input name="starts_at" type="date" required className="fasy-input" />
        <input name="ends_at" type="date" required className="fasy-input" />
        <div className="md:col-span-3">
          <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
            Cadastrar ano letivo
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Início</th>
              <th className="px-4 py-3">Fim</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {schoolYears?.map((item) => (
              <tr key={item.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">{item.title}</td>
                <td className="px-4 py-3">{new Date(`${item.starts_at}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3">{new Date(`${item.ends_at}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3">
                  {item.is_active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Ativo</span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">Inativo</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {item.is_active ? (
                    <span className="text-xs text-[var(--muted)]">Ano atual</span>
                  ) : (
                    <form action={activateSchoolYearAction}>
                      <input type="hidden" name="school_year_id" value={item.id} />
                      <button type="submit" className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]">
                        Ativar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}


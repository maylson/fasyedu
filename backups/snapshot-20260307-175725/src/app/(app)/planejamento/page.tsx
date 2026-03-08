import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function PlanejamentoPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("lesson_plans")
    .select("title, planned_date, objective")
    .eq("school_id", activeSchoolId)
    .order("planned_date", { ascending: false })
    .limit(20);

  return (
    <ModuleShell title="Planejamento de Aulas" description="Planos e objetivos das aulas por disciplina">
      <div className="space-y-3">
        {data?.map((plan) => (
          <article key={`${plan.title}-${plan.planned_date}`} className="rounded-2xl border border-[var(--line)] bg-[#f8fbf8] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{plan.title}</h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs text-[var(--primary-strong)]">
                {plan.planned_date ?? "Sem data"}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">{plan.objective ?? "Sem objetivo registrado."}</p>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}

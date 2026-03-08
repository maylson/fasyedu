import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function DisciplinasPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("subjects")
    .select("name, code, stage, weekly_workload")
    .eq("school_id", activeSchoolId)
    .order("name")
    .limit(30);

  return (
    <ModuleShell title="Disciplinas" description="Catálogo curricular por etapa">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((subject) => (
          <article key={subject.name} className="rounded-2xl border border-[var(--line)] bg-[#f8fbf8] p-4">
            <h3 className="font-semibold">{subject.name}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">Codigo: {subject.code ?? "-"}</p>
            <p className="mt-2 text-sm">{subject.stage}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Carga semanal: {subject.weekly_workload ?? 0}h</p>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}

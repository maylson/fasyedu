import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function AvaliacoesPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("assessments")
    .select("title, assessment_date, max_score")
    .eq("school_id", activeSchoolId)
    .order("assessment_date", { ascending: false })
    .limit(20);

  return (
    <ModuleShell title="Avaliações e Notas" description="Composição avaliativa e notas da aprendizagem">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((assessment) => (
          <article
            key={`${assessment.title}-${assessment.assessment_date}`}
            className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4"
          >
            <h3 className="font-semibold">{assessment.title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">Data: {assessment.assessment_date}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Nota máxima: {assessment.max_score}</p>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}
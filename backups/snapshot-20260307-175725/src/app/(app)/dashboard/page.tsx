import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function DashboardPage() {
  const { supabase, activeSchoolId } = await getUserContext();

  if (!activeSchoolId) {
    return (
      <ModuleShell title="Dashboard" description="Visão geral da escola">
        <p className="rounded-xl border border-[var(--line)] bg-[#f8fbf8] p-4 text-sm">Nenhuma escola ativa para exibir dados.</p>
      </ModuleShell>
    );
  }

  const [students, teachers, classes, announcements] = await Promise.all([
    supabase.from("students").select("*", { head: true, count: "exact" }).eq("school_id", activeSchoolId),
    supabase.from("teachers").select("*", { head: true, count: "exact" }).eq("school_id", activeSchoolId),
    supabase.from("classes").select("*", { head: true, count: "exact" }).eq("school_id", activeSchoolId),
    supabase.from("announcements").select("*", { head: true, count: "exact" }).eq("school_id", activeSchoolId),
  ]);

  const cards = [
    { label: "Alunos", value: students.count ?? 0 },
    { label: "Professores", value: teachers.count ?? 0 },
    { label: "Turmas", value: classes.count ?? 0 },
    { label: "Avisos", value: announcements.count ?? 0 },
  ];

  return (
    <ModuleShell title="Dashboard" description="Resumo rápido da operação pedagógica">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-[var(--line)] bg-[#f8fbf8] p-4">
            <p className="text-sm text-[var(--muted)]">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--primary-strong)]">{card.value}</p>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}

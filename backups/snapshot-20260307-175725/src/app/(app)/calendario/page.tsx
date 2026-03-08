import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function CalendarioPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("events")
    .select("title, starts_at, ends_at, audience")
    .eq("school_id", activeSchoolId)
    .order("starts_at")
    .limit(30);

  return (
    <ModuleShell title="Calendário Escolar" description="Eventos, reuniões e atividades institucionais">
      <div className="space-y-3">
        {data?.map((event, index) => (
          <article key={index} className="rounded-2xl border border-[var(--line)] bg-[#f8fbf8] p-4">
            <h3 className="font-semibold">{event.title}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Inicio: {event.starts_at} {event.ends_at ? `| Fim: ${event.ends_at}` : ""}
            </p>
            <p className="mt-1 text-xs text-[var(--primary-strong)]">Público: {event.audience}</p>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}

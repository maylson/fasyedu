import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function MuralPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("announcements")
    .select("title, message, audience, is_pinned, published_at")
    .eq("school_id", activeSchoolId)
    .order("published_at", { ascending: false })
    .limit(20);

  return (
    <ModuleShell title="Mural de Avisos" description="Comunicacoes e recados institucionais">
      <div className="space-y-3">
        {data?.map((announcement) => (
          <article key={`${announcement.title}-${announcement.published_at}`} className="rounded-2xl border border-[var(--line)] bg-[#f8fbf8] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{announcement.title}</h3>
              {announcement.is_pinned ? (
                <span className="rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-medium text-[#46310b]">Fixado</span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">{announcement.message}</p>
            <p className="mt-2 text-xs text-[var(--primary-strong)]">
              Público: {announcement.audience} | Publicado em: {announcement.published_at}
            </p>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}

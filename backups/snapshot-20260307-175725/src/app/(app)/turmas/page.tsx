import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function TurmasPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("classes")
    .select("name, stage, shift, vacancies")
    .eq("school_id", activeSchoolId)
    .order("name")
    .limit(30);

  return (
    <ModuleShell title="Turmas" description="Gestão de turmas por etapa e turno">
      <div className="rounded-2xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f8fbf8] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Turma</th>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3">Turno</th>
              <th className="px-4 py-3">Vagas</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row) => (
              <tr key={`${row.name}-${row.shift}`} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{row.stage}</td>
                <td className="px-4 py-3">{row.shift}</td>
                <td className="px-4 py-3">{row.vacancies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}

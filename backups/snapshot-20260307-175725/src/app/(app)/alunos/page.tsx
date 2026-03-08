import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function AlunosPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("students")
    .select("full_name, registration_code, stage, status")
    .eq("school_id", activeSchoolId)
    .order("full_name")
    .limit(30);

  return (
    <ModuleShell title="Alunos e Pais" description="Cadastro de estudantes e acompanhamento responsavel">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((student) => (
          <article key={student.registration_code} className="rounded-2xl border border-[var(--line)] bg-[#f8fbf8] p-4">
            <h3 className="font-semibold">{student.full_name}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">Matricula: {student.registration_code}</p>
            <p className="mt-2 text-sm">{student.stage}</p>
            <span className="mt-3 inline-block rounded-full bg-white px-2 py-1 text-xs text-[var(--primary-strong)]">
              {student.status}
            </span>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}

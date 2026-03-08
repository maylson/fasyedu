import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function MatriculasPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("enrollments")
    .select("status, enrolled_at, students(full_name), classes(name)")
    .eq("school_id", activeSchoolId)
    .order("enrolled_at", { ascending: false })
    .limit(30);

  return (
    <ModuleShell title="Matrículas" description="Controle de matrículas por turma e ano letivo">
      <div className="rounded-2xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Aluno</th>
              <th className="px-4 py-3">Turma</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row, index) => {
              const enrollment = row as {
                students?: { full_name?: string } | Array<{ full_name?: string }>;
                classes?: { name?: string } | Array<{ name?: string }>;
                enrolled_at: string;
                status: string;
              };
              const studentName = Array.isArray(enrollment.students)
                ? enrollment.students[0]?.full_name ?? "-"
                : enrollment.students?.full_name ?? "-";
              const className = Array.isArray(enrollment.classes)
                ? enrollment.classes[0]?.name ?? "-"
                : enrollment.classes?.name ?? "-";

              return (
                <tr key={index} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">{studentName}</td>
                  <td className="px-4 py-3">{className}</td>
                  <td className="px-4 py-3">{enrollment.enrolled_at}</td>
                  <td className="px-4 py-3">{enrollment.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}
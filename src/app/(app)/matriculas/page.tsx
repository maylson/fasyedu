import { ModuleShell } from "@/components/module-shell";
import { SubmitButton } from "@/components/submit-button";
import { createEnrollmentAction, deleteEnrollmentAction, updateEnrollmentAction } from "@/lib/actions/academic";
import { getUserContext } from "@/lib/app-context";

type MatriculasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type StudentRow = {
  id: string;
  full_name: string;
  registration_code: string;
};

type ClassRow = {
  id: string;
  name: string;
  stage: string;
  series: string | null;
};

type EnrollmentRow = {
  id: string;
  status: string;
  enrolled_at: string;
  canceled_at: string | null;
  students?: { full_name?: string; registration_code?: string } | Array<{ full_name?: string; registration_code?: string }>;
  classes?: { name?: string; stage?: string; series?: string | null } | Array<{ name?: string; stage?: string; series?: string | null }>;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatStage(stage?: string) {
  if (!stage) return "-";
  if (stage === "EDUCACAO_INFANTIL") return "Educação Infantil";
  if (stage === "FUNDAMENTAL_1") return "Fundamental 1";
  if (stage === "FUNDAMENTAL_2") return "Fundamental 2";
  if (stage === "ENSINO_MEDIO") return "Ensino Médio";
  if (stage === "CURSO_LIVRE") return "Curso Livre";
  return stage;
}

export default async function MatriculasPage({ searchParams }: MatriculasPageProps) {
  const { supabase, activeSchoolId, roles } = await getUserContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;

  const canManage = roles.includes("SUPPORT") || roles.includes("DIRECAO") || roles.includes("COORDENACAO") || roles.includes("SECRETARIA");

  const [studentsResult, classesResult, enrollmentsResult] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, registration_code")
      .eq("school_id", activeSchoolId)
      .order("full_name"),
    supabase
      .from("classes")
      .select("id, name, stage, series")
      .eq("school_id", activeSchoolId)
      .order("name"),
    supabase
      .from("enrollments")
      .select("id, status, enrolled_at, canceled_at, students(full_name, registration_code), classes(name, stage, series)")
      .eq("school_id", activeSchoolId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const students = (studentsResult.data ?? []) as StudentRow[];
  const classes = (classesResult.data ?? []) as ClassRow[];
  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];

  return (
    <ModuleShell title="Matrículas" description="Controle completo de matrículas por turma e ano letivo">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

      {canManage ? (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Nova matrícula</h3>
          <form action={createEnrollmentAction} className="mt-3 grid gap-3 md:grid-cols-4">
            <select name="student_id" className="fasy-input md:col-span-2" required defaultValue="">
              <option value="" disabled>
                Selecione o aluno
              </option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} · {student.registration_code}
                </option>
              ))}
            </select>

            <select name="class_id" className="fasy-input md:col-span-2" required defaultValue="">
              <option value="" disabled>
                Selecione a turma
              </option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} · {formatStage(classItem.stage)}
                </option>
              ))}
            </select>

            <input name="enrolled_at" type="date" className="fasy-input md:col-span-1" />

            <div className="md:col-span-3">
              <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Salvando...">
                Cadastrar matrícula
              </SubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[var(--line)] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3">Turma</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3">Data da matrícula</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cancelada em</th>
                {canManage ? <th className="px-4 py-3">Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {enrollments.map((row) => {
                const student = asSingle(row.students);
                const classItem = asSingle(row.classes);
                return (
                  <tr key={row.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">
                      <p className="font-medium">{student?.full_name ?? "-"}</p>
                      <p className="text-xs text-[var(--muted)]">{student?.registration_code ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3">{classItem?.name ?? "-"}</td>
                    <td className="px-4 py-3">{formatStage(classItem?.stage)}</td>
                    <td className="px-4 py-3">{new Date(`${row.enrolled_at}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">{row.canceled_at ? new Date(`${row.canceled_at}T12:00:00`).toLocaleDateString("pt-BR") : "-"}</td>
                    {canManage ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={updateEnrollmentAction} className="flex items-center gap-2">
                            <input type="hidden" name="enrollment_id" value={row.id} />
                            <select name="status" defaultValue={row.status} className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs">
                              <option value="ATIVA">ATIVA</option>
                              <option value="TRANCADA">TRANCADA</option>
                              <option value="CONCLUIDA">CONCLUÍDA</option>
                              <option value="CANCELADA">CANCELADA</option>
                            </select>
                            <input
                              type="date"
                              name="canceled_at"
                              defaultValue={row.canceled_at ?? ""}
                              className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs"
                            />
                            <SubmitButton className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs hover:bg-[var(--panel-soft)]" pendingLabel="Salvando...">
                              Atualizar
                            </SubmitButton>
                          </form>

                          <form action={deleteEnrollmentAction}>
                            <input type="hidden" name="enrollment_id" value={row.id} />
                            <SubmitButton className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100" pendingLabel="Excluindo...">
                              Excluir
                            </SubmitButton>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {enrollments.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-[var(--muted)]" colSpan={canManage ? 7 : 6}>
                    Nenhuma matrícula cadastrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ModuleShell>
  );
}



import { ModuleShell } from "@/components/module-shell";
import { SubmitButton } from "@/components/submit-button";
import { getUserContext } from "@/lib/app-context";
import { createStudentAction } from "@/lib/actions/academic";
import { getEducationStageLabel, STAGE_OPTIONS } from "@/lib/constants";

export default async function AlunosPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("students")
    .select("full_name, registration_code, stage, status")
    .eq("school_id", activeSchoolId)
    .order("full_name")
    .limit(30);

  return (
    <ModuleShell title="Alunos e Pais" description="Cadastro de estudantes e acompanhamento responsável">
      <form action={createStudentAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-5">
        <input name="registration_code" required placeholder="Matrícula" className="fasy-input md:col-span-1" />
        <input name="full_name" required placeholder="Nome completo" className="fasy-input md:col-span-2" />
        <input name="birth_date" type="date" className="fasy-input md:col-span-1" />
        <select name="stage" defaultValue="FUNDAMENTAL_1" className="fasy-input md:col-span-1">
          {STAGE_OPTIONS.map((stage) => (
            <option key={stage} value={stage}>
              {getEducationStageLabel(stage)}
            </option>
          ))}
        </select>
        <div className="md:col-span-5">
          <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Cadastrando...">
            Cadastrar aluno
          </SubmitButton>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((student) => (
          <article key={student.registration_code} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
            <h3 className="font-semibold">{student.full_name}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">Matrícula: {student.registration_code}</p>
            <p className="mt-2 text-sm">{getEducationStageLabel(student.stage)}</p>
            <span className="mt-3 inline-block rounded-full bg-white px-2 py-1 text-xs text-[var(--brand-blue)]">
              {student.status}
            </span>
          </article>
        ))}
      </div>
    </ModuleShell>
  );
}

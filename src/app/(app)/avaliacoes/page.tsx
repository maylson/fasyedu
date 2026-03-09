import { ModuleShell } from "@/components/module-shell";
import { SubmitButton } from "@/components/submit-button";
import { createAssessmentAction, createAssessmentItemAction, upsertGradeAction } from "@/lib/actions/academic";
import { getUserContext } from "@/lib/app-context";

type AvaliacoesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ClassSubjectRow = {
  id: string;
  class_id: string;
  classes?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
  subjects?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
};

type AssessmentRow = {
  id: string;
  title: string;
  assessment_date: string;
  max_score: number;
  class_subject_id: string;
  class_subjects?: {
    id?: string;
    classes?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
    subjects?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
  } | Array<{
    id?: string;
    classes?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
    subjects?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
  }>;
};

type AssessmentItemRow = {
  id: string;
  assessment_id: string;
  title: string;
  weight: number;
  max_score: number;
};

type EnrollmentRow = {
  id: string;
  class_id: string;
  students?: { full_name?: string } | Array<{ full_name?: string }>;
  classes?: { id?: string; name?: string } | Array<{ id?: string; name?: string }>;
};

type GradeRow = {
  id: string;
  enrollment_id: string;
  assessment_item_id: string;
  score: number;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function AvaliacoesPage({ searchParams }: AvaliacoesPageProps) {
  const { supabase, activeSchoolId, roles } = await getUserContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;

  const canManage = roles.includes("DIRECAO") || roles.includes("COORDENACAO") || roles.includes("PROFESSOR");

  const [classSubjectsResult, assessmentsResult, itemsResult, enrollmentsResult, gradesResult] = await Promise.all([
    supabase
      .from("class_subjects")
      .select("id, class_id, classes(id, name), subjects(id, name)")
      .eq("school_id", activeSchoolId)
      .order("id"),
    supabase
      .from("assessments")
      .select("id, title, assessment_date, max_score, class_subject_id, class_subjects(id, classes(id, name), subjects(id, name))")
      .eq("school_id", activeSchoolId)
      .order("assessment_date", { ascending: false })
      .limit(120),
    supabase
      .from("assessment_items")
      .select("id, assessment_id, title, weight, max_score")
      .eq("school_id", activeSchoolId)
      .order("title"),
    supabase
      .from("enrollments")
      .select("id, class_id, students(full_name), classes(id, name)")
      .eq("school_id", activeSchoolId)
      .eq("status", "ATIVA")
      .order("created_at", { ascending: false }),
    supabase
      .from("grades")
      .select("id, enrollment_id, assessment_item_id, score")
      .eq("school_id", activeSchoolId),
  ]);

  const classSubjects = (classSubjectsResult.data ?? []) as ClassSubjectRow[];
  const assessments = (assessmentsResult.data ?? []) as AssessmentRow[];
  const items = (itemsResult.data ?? []) as AssessmentItemRow[];
  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const grades = (gradesResult.data ?? []) as GradeRow[];

  const itemsByAssessment = new Map<string, AssessmentItemRow[]>();
  for (const item of items) {
    const current = itemsByAssessment.get(item.assessment_id) ?? [];
    current.push(item);
    itemsByAssessment.set(item.assessment_id, current);
  }

  const gradesByItem = new Map<string, GradeRow[]>();
  for (const grade of grades) {
    const current = gradesByItem.get(grade.assessment_item_id) ?? [];
    current.push(grade);
    gradesByItem.set(grade.assessment_item_id, current);
  }

  const enrollmentCountByClass = new Map<string, number>();
  for (const enrollment of enrollments) {
    enrollmentCountByClass.set(enrollment.class_id, (enrollmentCountByClass.get(enrollment.class_id) ?? 0) + 1);
  }

  const totalAssessments = assessments.length;
  const totalItems = items.length;
  const totalGrades = grades.length;
  const overallAverage =
    totalGrades > 0 ? (grades.reduce((acc, grade) => acc + Number(grade.score || 0), 0) / totalGrades).toFixed(2) : "0.00";

  return (
    <ModuleShell title="Avaliacoes e Notas" description="Avaliacao, itens, lancamento de notas e relatorios basicos">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
          <p className="text-sm text-[var(--muted)]">Avaliacoes</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--brand-blue)]">{totalAssessments}</p>
        </article>
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
          <p className="text-sm text-[var(--muted)]">Itens avaliativos</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--brand-blue)]">{totalItems}</p>
        </article>
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
          <p className="text-sm text-[var(--muted)]">Notas lancadas</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--brand-blue)]">{totalGrades}</p>
        </article>
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
          <p className="text-sm text-[var(--muted)]">Media geral</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--brand-blue)]">{overallAverage}</p>
        </article>
      </div>

      {canManage ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Nova avaliacao</h3>
            <form action={createAssessmentAction} className="mt-3 grid gap-3">
              <select name="class_subject_id" className="fasy-input" required defaultValue="">
                <option value="" disabled>Selecione turma e disciplina</option>
                {classSubjects.map((row) => {
                  const classRef = asSingle(row.classes);
                  const subjectRef = asSingle(row.subjects);
                  return (
                    <option key={row.id} value={row.id}>
                      {(classRef?.name ?? "Turma")} · {(subjectRef?.name ?? "Disciplina")}
                    </option>
                  );
                })}
              </select>
              <input name="title" className="fasy-input" placeholder="Titulo da avaliacao" required />
              <input name="assessment_date" type="date" className="fasy-input" required />
              <input name="max_score" type="number" min="0.1" step="0.1" defaultValue={10} className="fasy-input" />
              <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Salvando...">
                Cadastrar avaliacao
              </SubmitButton>
            </form>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Novo item</h3>
            <form action={createAssessmentItemAction} className="mt-3 grid gap-3">
              <select name="assessment_id" className="fasy-input" required defaultValue="">
                <option value="" disabled>Selecione a avaliacao</option>
                {assessments.map((row) => {
                  const classSubject = asSingle(row.class_subjects);
                  const classRef = asSingle(classSubject?.classes);
                  const subjectRef = asSingle(classSubject?.subjects);
                  return (
                    <option key={row.id} value={row.id}>
                      {row.title} · {(classRef?.name ?? "Turma")} · {(subjectRef?.name ?? "Disciplina")}
                    </option>
                  );
                })}
              </select>
              <input name="title" className="fasy-input" placeholder="Titulo do item" required />
              <input name="weight" type="number" min="0.0001" step="0.0001" defaultValue={1} className="fasy-input" />
              <input name="max_score" type="number" min="0.1" step="0.1" defaultValue={10} className="fasy-input" />
              <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Salvando...">
                Cadastrar item
              </SubmitButton>
            </form>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Lancar nota</h3>
            <form action={upsertGradeAction} className="mt-3 grid gap-3">
              <select name="assessment_item_id" className="fasy-input" required defaultValue="">
                <option value="" disabled>Selecione o item</option>
                {items.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title} · max {row.max_score}
                  </option>
                ))}
              </select>
              <select name="enrollment_id" className="fasy-input" required defaultValue="">
                <option value="" disabled>Selecione o aluno matriculado</option>
                {enrollments.map((row) => {
                  const studentRef = asSingle(row.students);
                  const classRef = asSingle(row.classes);
                  return (
                    <option key={row.id} value={row.id}>
                      {(studentRef?.full_name ?? "Aluno")} · {(classRef?.name ?? "Turma")}
                    </option>
                  );
                })}
              </select>
              <input name="score" type="number" min="0" step="0.01" className="fasy-input" placeholder="Nota" required />
              <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Salvando...">
                Salvar nota
              </SubmitButton>
            </form>
          </section>
        </div>
      ) : null}

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Relatorio basico por avaliacao</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Avaliacao</th>
                <th className="px-3 py-2">Turma</th>
                <th className="px-3 py-2">Disciplina</th>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Itens</th>
                <th className="px-3 py-2">Notas lancadas</th>
                <th className="px-3 py-2">Alunos na turma</th>
                <th className="px-3 py-2">Media das notas</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((assessment) => {
                const classSubject = asSingle(assessment.class_subjects);
                const classRef = asSingle(classSubject?.classes);
                const subjectRef = asSingle(classSubject?.subjects);
                const assessmentItems = itemsByAssessment.get(assessment.id) ?? [];
                const totalGradesInAssessment = assessmentItems.reduce(
                  (acc, item) => acc + (gradesByItem.get(item.id)?.length ?? 0),
                  0,
                );
                const sumScores = assessmentItems.reduce(
                  (acc, item) => acc + (gradesByItem.get(item.id)?.reduce((itemAcc, grade) => itemAcc + Number(grade.score || 0), 0) ?? 0),
                  0,
                );
                const averageScore = totalGradesInAssessment > 0 ? (sumScores / totalGradesInAssessment).toFixed(2) : "-";
                const classId = classSubject?.id ? (asSingle(classSubject.classes)?.id ?? "") : "";
                const enrollmentCount = classId ? enrollmentCountByClass.get(classId) ?? 0 : 0;

                return (
                  <tr key={assessment.id} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2 font-medium">{assessment.title}</td>
                    <td className="px-3 py-2">{classRef?.name ?? "-"}</td>
                    <td className="px-3 py-2">{subjectRef?.name ?? "-"}</td>
                    <td className="px-3 py-2">{new Date(`${assessment.assessment_date}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-2">{assessmentItems.length}</td>
                    <td className="px-3 py-2">{totalGradesInAssessment}</td>
                    <td className="px-3 py-2">{enrollmentCount}</td>
                    <td className="px-3 py-2">{averageScore}</td>
                  </tr>
                );
              })}
              {assessments.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-[var(--muted)]" colSpan={8}>Nenhuma avaliacao cadastrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ModuleShell>
  );
}

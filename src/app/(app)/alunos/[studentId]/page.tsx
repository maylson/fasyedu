import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";
import { getEducationStageLabel, type UserRole } from "@/lib/constants";

type StudentPageProps = {
  params: Promise<{ studentId: string }>;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isStaff(roles: UserRole[]) {
  return roles.some((role) => ["SUPPORT", "DIRECAO", "COORDENACAO", "SECRETARIA", "PROFESSOR"].includes(role));
}

export default async function AlunoFichaPage({ params }: StudentPageProps) {
  const { studentId } = await params;
  const { supabase, activeSchoolId, user, roles } = await getUserContext();

  if (!activeSchoolId) {
    return (
      <ModuleShell title="Ficha do Aluno" description="Histórico escolar e vínculos do estudante">
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">Nenhuma escola ativa selecionada.</p>
      </ModuleShell>
    );
  }

  const { data: student } = await supabase
    .from("students")
    .select("id, user_id, full_name, registration_code, stage, status, birth_date, photo_url")
    .eq("school_id", activeSchoolId)
    .eq("id", studentId)
    .maybeSingle();

  if (!student) {
    return (
      <ModuleShell title="Ficha do Aluno" description="Histórico escolar e vínculos do estudante">
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Aluno não encontrado.</p>
      </ModuleShell>
    );
  }

  if (!isStaff(roles)) {
    let allowed = false;
    if (roles.includes("ALUNO") && student.user_id === user.id) allowed = true;

    if (!allowed && roles.includes("PAI")) {
      const { data: guardians } = await supabase
        .from("guardians")
        .select("id")
        .eq("school_id", activeSchoolId)
        .eq("user_id", user.id);
      const guardianIds = (guardians ?? []).map((row) => row.id);
      if (guardianIds.length > 0) {
        const { data: studentGuardian } = await supabase
          .from("student_guardians")
          .select("id")
          .eq("school_id", activeSchoolId)
          .eq("student_id", studentId)
          .in("guardian_id", guardianIds)
          .maybeSingle();
        allowed = Boolean(studentGuardian?.id);
      }
    }

    if (!allowed) {
      return (
        <ModuleShell title="Ficha do Aluno" description="Histórico escolar e vínculos do estudante">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Você não possui permissão para acessar esta ficha.</p>
        </ModuleShell>
      );
    }
  }

  const [guardiansResult, enrollmentsResult] = await Promise.all([
    supabase
      .from("student_guardians")
      .select("relationship, is_financial_responsible, guardians(full_name, email, phone)")
      .eq("school_id", activeSchoolId)
      .eq("student_id", studentId),
    supabase
      .from("enrollments")
      .select("id, status, enrolled_at, canceled_at, classes(name, stage, series, shift), school_years(title)")
      .eq("school_id", activeSchoolId)
      .eq("student_id", studentId)
      .order("enrolled_at", { ascending: false }),
  ]);

  const guardians = (guardiansResult.data ?? []) as Array<{
    relationship: string;
    is_financial_responsible: boolean;
    guardians?: { full_name?: string; email?: string | null; phone?: string | null } | Array<{ full_name?: string; email?: string | null; phone?: string | null }>;
  }>;

  const enrollments = (enrollmentsResult.data ?? []) as Array<{
    id: string;
    status: string;
    enrolled_at: string;
    canceled_at: string | null;
    classes?: { name?: string; stage?: string; series?: string | null; shift?: string | null } | Array<{ name?: string; stage?: string; series?: string | null; shift?: string | null }>;
    school_years?: { title?: string } | Array<{ title?: string }>;
  }>;

  return (
    <ModuleShell title="Ficha do Aluno" description="Histórico escolar e vínculos do estudante">
      <div className="flex items-center justify-between">
        <Link href="/alunos" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
          Voltar para Alunos e Pais
        </Link>
      </div>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-base font-semibold text-[var(--brand-blue)]">{student.full_name}</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <p><strong>Matrícula:</strong> {student.registration_code}</p>
          <p><strong>Etapa:</strong> {getEducationStageLabel(student.stage)}</p>
          <p><strong>Status:</strong> {student.status}</p>
          <p><strong>Nascimento:</strong> {student.birth_date ? new Date(`${student.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : "-"}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Responsáveis vinculados</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Relação</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Telefone</th>
                <th className="px-3 py-2">Financeiro</th>
              </tr>
            </thead>
            <tbody>
              {guardians.map((row, index) => {
                const guardian = asSingle(row.guardians);
                return (
                  <tr key={`guardian-${index}`} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2">{guardian?.full_name ?? "-"}</td>
                    <td className="px-3 py-2">{row.relationship || "-"}</td>
                    <td className="px-3 py-2">{guardian?.email ?? "-"}</td>
                    <td className="px-3 py-2">{guardian?.phone ?? "-"}</td>
                    <td className="px-3 py-2">{row.is_financial_responsible ? "Sim" : "Não"}</td>
                  </tr>
                );
              })}
              {guardians.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-[var(--muted)]" colSpan={5}>Nenhum responsável vinculado.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Histórico de matrículas</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Ano letivo</th>
                <th className="px-3 py-2">Turma</th>
                <th className="px-3 py-2">Etapa</th>
                <th className="px-3 py-2">Série</th>
                <th className="px-3 py-2">Turno</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Matrícula</th>
                <th className="px-3 py-2">Cancelamento</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((row) => {
                const classRef = asSingle(row.classes);
                const yearRef = asSingle(row.school_years);
                return (
                  <tr key={row.id} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2">{yearRef?.title ?? "-"}</td>
                    <td className="px-3 py-2">{classRef?.name ?? "-"}</td>
                    <td className="px-3 py-2">{classRef?.stage ? getEducationStageLabel(classRef.stage) : "-"}</td>
                    <td className="px-3 py-2">{classRef?.series ?? "-"}</td>
                    <td className="px-3 py-2">{classRef?.shift ?? "-"}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{new Date(`${row.enrolled_at}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-2">{row.canceled_at ? new Date(`${row.canceled_at}T12:00:00`).toLocaleDateString("pt-BR") : "-"}</td>
                  </tr>
                );
              })}
              {enrollments.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-[var(--muted)]" colSpan={8}>Nenhuma matrícula encontrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ModuleShell>
  );
}

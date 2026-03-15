import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import { SubmitButton } from "@/components/submit-button";
import {
  createGuardianLinkAction,
  deleteStudentAction,
  removeGuardianLinkAction,
  updateGuardianLinkAction,
  updateStudentAction,
} from "@/lib/actions/academic";
import { getUserContext } from "@/lib/app-context";
import { getEducationStageLabel, STAGE_OPTIONS, type UserRole } from "@/lib/constants";

type StudentPageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type GuardianLinkRow = {
  relationship: string;
  is_financial_responsible: boolean;
  guardian_id: string;
  guardians?:
    | { full_name?: string; email?: string | null; phone?: string | null; document?: string | null }
    | Array<{ full_name?: string; email?: string | null; phone?: string | null; document?: string | null }>;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isStaff(roles: UserRole[]) {
  return roles.some((role) => ["SUPPORT", "DIRECAO", "COORDENACAO", "SECRETARIA", "PROFESSOR"].includes(role));
}

function silhouetteSvgDataUri() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 140'>
    <rect width='120' height='140' rx='16' fill='#eef3f8'/>
    <circle cx='60' cy='46' r='24' fill='#b8c8da'/>
    <path d='M20 122c4-22 22-34 40-34s36 12 40 34' fill='#b8c8da'/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default async function AlunoFichaPage({ params, searchParams }: StudentPageProps) {
  const { studentId } = await params;
  const resolvedSearchParams = await searchParams;
  const { supabase, activeSchoolId, user, roles } = await getUserContext();

  const error = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null;
  const success = typeof resolvedSearchParams.success === "string" ? resolvedSearchParams.success : null;
  const silhouetteSrc = silhouetteSvgDataUri();

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
      .select("guardian_id, relationship, is_financial_responsible, guardians(full_name, email, phone, document)")
      .eq("school_id", activeSchoolId)
      .eq("student_id", studentId),
    supabase
      .from("enrollments")
      .select("id, status, enrolled_at, canceled_at, classes(name, stage, series, shift), school_years(title)")
      .eq("school_id", activeSchoolId)
      .eq("student_id", studentId)
      .order("enrolled_at", { ascending: false }),
  ]);

  const guardians = (guardiansResult.data ?? []) as GuardianLinkRow[];
  const enrollments = (enrollmentsResult.data ?? []) as Array<{
    id: string;
    status: string;
    enrolled_at: string;
    canceled_at: string | null;
    classes?: { name?: string; stage?: string; series?: string | null; shift?: string | null } | Array<{ name?: string; stage?: string; series?: string | null; shift?: string | null }>;
    school_years?: { title?: string } | Array<{ title?: string }>;
  }>;

  const canManage = roles.some((role) => ["SUPPORT", "DIRECAO", "COORDENACAO", "SECRETARIA"].includes(role));

  return (
    <ModuleShell title="Ficha do Aluno" description="Histórico escolar e vínculos do estudante">
      <div className="flex items-center justify-between">
        <Link href="/alunos" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
          Voltar para Alunos e Pais
        </Link>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <article className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)]">
            <img src={student.photo_url || silhouetteSrc} alt={`Foto de ${student.full_name}`} className="h-[260px] w-full object-cover" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[var(--brand-blue)]">{student.full_name}</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <p><strong>Matrícula:</strong> {student.registration_code}</p>
            <p><strong>Etapa:</strong> {getEducationStageLabel(student.stage)}</p>
            <p><strong>Status:</strong> {student.status}</p>
            <p><strong>Nascimento:</strong> {student.birth_date ? new Date(`${student.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : "-"}</p>
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--line)] bg-white p-4">
          <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Dados do aluno</h3>
          {canManage ? (
            <form action={updateStudentAction} className="mt-3 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="student_id" value={student.id} />
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Matrícula</span>
                <input name="registration_code" defaultValue={student.registration_code} required className="fasy-input" />
              </label>
              <label className="grid gap-1 text-sm md:col-span-1">
                <span className="font-medium">Nascimento</span>
                <input name="birth_date" type="date" defaultValue={student.birth_date ?? ""} className="fasy-input" />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="font-medium">Nome completo</span>
                <input name="full_name" defaultValue={student.full_name} required className="fasy-input" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Etapa</span>
                <select name="stage" defaultValue={student.stage} className="fasy-input">
                  {STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {getEducationStageLabel(stage)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Status</span>
                <select name="status" defaultValue={student.status} className="fasy-input">
                  <option value="ATIVO">ATIVO</option>
                  <option value="INATIVO">INATIVO</option>
                  <option value="TRANSFERIDO">TRANSFERIDO</option>
                  <option value="CONCLUIDO">CONCLUÍDO</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="font-medium">Foto</span>
                <input type="file" name="photo_file" accept="image/*" className="fasy-input" />
              </label>
              {student.photo_url ? (
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input type="checkbox" name="remove_photo" className="h-4 w-4" />
                  <span>Remover foto atual</span>
                </label>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Salvando...">
                  Salvar dados do aluno
                </SubmitButton>
              </div>
            </form>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 text-sm">
              <p><strong>Matrícula:</strong> {student.registration_code}</p>
              <p><strong>Etapa:</strong> {getEducationStageLabel(student.stage)}</p>
              <p><strong>Status:</strong> {student.status}</p>
              <p><strong>Nascimento:</strong> {student.birth_date ? new Date(`${student.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : "-"}</p>
            </div>
          )}

          {canManage ? (
            <form action={deleteStudentAction} className="mt-4 border-t border-[var(--line)] pt-4">
              <input type="hidden" name="student_id" value={student.id} />
              <p className="text-xs text-[var(--muted)]">Excluir o aluno remove também vínculos familiares, matrículas e dados relacionados.</p>
              <SubmitButton className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100" pendingLabel="Excluindo...">
                Excluir aluno
              </SubmitButton>
            </form>
          ) : null}
        </article>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Responsáveis vinculados</h3>
        <div className="mt-3 space-y-3">
          {guardians.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--muted)]">Nenhum responsável vinculado.</p>
          ) : (
            guardians.map((row) => {
              const guardian = asSingle(row.guardians);
              return (
                <article key={`${row.guardian_id}-${row.relationship}`} className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                  {canManage ? (
                    <form action={updateGuardianLinkAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <input type="hidden" name="student_id" value={student.id} />
                      <input type="hidden" name="guardian_id" value={row.guardian_id} />
                      <label className="grid gap-1 text-sm xl:col-span-2">
                        <span className="font-medium">Nome</span>
                        <input name="full_name" defaultValue={guardian?.full_name ?? ""} required className="fasy-input" />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium">Relação</span>
                        <input name="relationship" defaultValue={row.relationship} required className="fasy-input" />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium">Documento</span>
                        <input name="document" defaultValue={guardian?.document ?? ""} className="fasy-input" />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium">E-mail</span>
                        <input name="email" type="email" defaultValue={guardian?.email ?? ""} className="fasy-input" />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium">Telefone</span>
                        <input name="phone" defaultValue={guardian?.phone ?? ""} className="fasy-input" />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="is_financial_responsible" defaultChecked={row.is_financial_responsible} className="h-4 w-4" />
                        <span>Responsável financeiro</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2 xl:col-span-4">
                        <SubmitButton className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm hover:bg-white" pendingLabel="Salvando...">
                          Salvar responsável
                        </SubmitButton>
                      </div>
                    </form>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2 text-sm">
                      <p><strong>Nome:</strong> {guardian?.full_name ?? "-"}</p>
                      <p><strong>Relação:</strong> {row.relationship || "-"}</p>
                      <p><strong>E-mail:</strong> {guardian?.email ?? "-"}</p>
                      <p><strong>Telefone:</strong> {guardian?.phone ?? "-"}</p>
                      <p><strong>Documento:</strong> {guardian?.document ?? "-"}</p>
                      <p><strong>Financeiro:</strong> {row.is_financial_responsible ? "Sim" : "Não"}</p>
                    </div>
                  )}

                  {canManage ? (
                    <form action={removeGuardianLinkAction} className="mt-3">
                      <input type="hidden" name="student_id" value={student.id} />
                      <input type="hidden" name="guardian_id" value={row.guardian_id} />
                      <SubmitButton className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100" pendingLabel="Removendo...">
                        Remover vínculo
                      </SubmitButton>
                    </form>
                  ) : null}
                </article>
              );
            })
          )}
        </div>

        {canManage ? (
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <h4 className="text-sm font-semibold text-[var(--brand-blue)]">Adicionar responsável</h4>
            <form action={createGuardianLinkAction} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input type="hidden" name="student_id" value={student.id} />
              <label className="grid gap-1 text-sm xl:col-span-2">
                <span className="font-medium">Nome</span>
                <input name="full_name" required className="fasy-input" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Relação</span>
                <input name="relationship" required className="fasy-input" placeholder="Ex.: Mãe, Pai, Avó" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Documento</span>
                <input name="document" className="fasy-input" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">E-mail</span>
                <input name="email" type="email" className="fasy-input" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Telefone</span>
                <input name="phone" className="fasy-input" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_financial_responsible" className="h-4 w-4" />
                <span>Responsável financeiro</span>
              </label>
              <div className="xl:col-span-4">
                <SubmitButton className="fasy-btn-primary px-4 py-2 text-sm" pendingLabel="Salvando...">
                  Vincular responsável
                </SubmitButton>
              </div>
            </form>
          </div>
        ) : null}
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

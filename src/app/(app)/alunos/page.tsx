import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import { SubmitButton } from "@/components/submit-button";
import { getUserContext } from "@/lib/app-context";
import { createStudentAction } from "@/lib/actions/academic";
import { getEducationStageLabel, STAGE_OPTIONS } from "@/lib/constants";

type AlunosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function silhouetteSvgDataUri() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 140'>
    <rect width='120' height='140' rx='16' fill='#eef3f8'/>
    <circle cx='60' cy='46' r='24' fill='#b8c8da'/>
    <path d='M20 122c4-22 22-34 40-34s36 12 40 34' fill='#b8c8da'/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default async function AlunosPage({ searchParams }: AlunosPageProps) {
  const { supabase, activeSchoolId } = await getUserContext();
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const stageFilter = typeof params.stage === "string" ? params.stage : "ALL";
  const statusFilter = typeof params.status === "string" ? params.status : "ALL";
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;

  let query = supabase
    .from("students")
    .select("id, full_name, registration_code, stage, status, photo_url, photo_path")
    .eq("school_id", activeSchoolId)
    .order("full_name")
    .limit(200);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,registration_code.ilike.%${q}%`);
  }
  if (stageFilter !== "ALL") {
    query = query.eq("stage", stageFilter);
  }
  if (statusFilter !== "ALL") {
    query = query.eq("status", statusFilter);
  }

  const { data } = await query;
  const silhouetteSrc = silhouetteSvgDataUri();

  return (
    <ModuleShell title="Alunos e Pais" description="Cadastro de estudantes, vínculos familiares e acesso à ficha do aluno">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

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

      <form method="get" className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-[1.2fr_1fr_1fr_auto_auto] md:items-center">
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou matrícula" className="fasy-input" />

        <select name="stage" defaultValue={stageFilter} className="fasy-input">
          <option value="ALL">Todas as etapas</option>
          {STAGE_OPTIONS.map((stage) => (
            <option key={stage} value={stage}>
              {getEducationStageLabel(stage)}
            </option>
          ))}
        </select>

        <select name="status" defaultValue={statusFilter} className="fasy-input">
          <option value="ALL">Todos os status</option>
          <option value="ATIVO">ATIVO</option>
          <option value="INATIVO">INATIVO</option>
          <option value="TRANSFERIDO">TRANSFERIDO</option>
          <option value="CONCLUIDO">CONCLUÍDO</option>
        </select>

        <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
          Filtrar
        </button>
        <Link href="/alunos" className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm hover:bg-[var(--panel-soft)]">
          Limpar
        </Link>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((student) => (
          <article key={student.id} className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_8px_20px_rgba(8,33,63,0.06)]">
            <div className="grid grid-cols-[84px_1fr] gap-3">
              <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
                <img src={student.photo_url || silhouetteSrc} alt={`Foto de ${student.full_name}`} className="h-[110px] w-full object-cover" />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Carteirinha do aluno</p>
                <h3 className="mt-1 truncate text-base font-semibold text-[var(--brand-blue)]">{student.full_name}</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">Matrícula: {student.registration_code}</p>
                <p className="mt-1 text-xs">{getEducationStageLabel(student.stage)}</p>
                <span className="mt-2 inline-block rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-blue)]">
                  {student.status}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <Link
                href={`/alunos/${student.id}`}
                className="inline-flex rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs hover:bg-[var(--panel-soft)]"
              >
                Abrir ficha
              </Link>
            </div>
          </article>
        ))}

        {!data || data.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)] md:col-span-2 xl:col-span-3">
            Nenhum aluno encontrado com os filtros selecionados.
          </p>
        ) : null}
      </div>
    </ModuleShell>
  );
}

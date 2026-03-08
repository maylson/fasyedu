import { ModuleShell } from "@/components/module-shell";
import { StageSeriesFields } from "@/components/stage-series-fields";
import { createClassAction, deleteClassAction, updateClassAction } from "@/lib/actions/academic";
import { getUserContext } from "@/lib/app-context";
import { getEducationStageLabel, STAGE_OPTIONS } from "@/lib/constants";

type TurmasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TurmasPage({ searchParams }: TurmasPageProps) {
  const { supabase, activeSchoolId } = await getUserContext();
  const params = await searchParams;
  const getParam = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };

  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;
  const editClassId = getParam("edit_class_id");
  const confirmDeleteClassId = getParam("confirm_delete_class_id");
  const q = getParam("q").trim();
  const stageFilter = getParam("stage");
  const seriesFilter = getParam("series");
  const shiftFilter = getParam("shift");
  const sortBy = getParam("sort_by") || "name";
  const sortDir = getParam("sort_dir") === "desc" ? "desc" : "asc";

  const [classesResult, activeYearResult] = await Promise.all([
    supabase.from("classes").select("id, name, stage, series, shift, vacancies").eq("school_id", activeSchoolId).order("name").limit(300),
    supabase.from("school_years").select("id").eq("school_id", activeSchoolId).eq("is_active", true).maybeSingle(),
  ]);

  const classes = classesResult.data ?? [];
  const hasActiveYear = Boolean(activeYearResult.data?.id);
  const classToEdit = classes.find((item) => item.id === editClassId);
  const classToDelete = classes.find((item) => item.id === confirmDeleteClassId);

  const availableSeries = Array.from(new Set(classes.map((item) => item.series).filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b), "pt-BR"),
  );
  const availableShifts = Array.from(new Set(classes.map((item) => item.shift).filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b), "pt-BR"),
  );

  const filteredClasses = classes
    .filter((item) => {
      if (q && !item.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (stageFilter && item.stage !== stageFilter) return false;
      if (seriesFilter && (item.series ?? "") !== seriesFilter) return false;
      if (shiftFilter && item.shift !== shiftFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const valueA =
        sortBy === "stage"
          ? getEducationStageLabel(a.stage)
          : sortBy === "series"
            ? a.series ?? ""
            : sortBy === "shift"
              ? a.shift
              : sortBy === "vacancies"
                ? a.vacancies
                : a.name;
      const valueB =
        sortBy === "stage"
          ? getEducationStageLabel(b.stage)
          : sortBy === "series"
            ? b.series ?? ""
            : sortBy === "shift"
              ? b.shift
              : sortBy === "vacancies"
                ? b.vacancies
                : b.name;

      const compare =
        typeof valueA === "number" && typeof valueB === "number"
          ? valueA - valueB
          : String(valueA).localeCompare(String(valueB), "pt-BR");

      return sortDir === "desc" ? compare * -1 : compare;
    });

  const retainedQuery = new URLSearchParams();
  if (q) retainedQuery.set("q", q);
  if (stageFilter) retainedQuery.set("stage", stageFilter);
  if (seriesFilter) retainedQuery.set("series", seriesFilter);
  if (shiftFilter) retainedQuery.set("shift", shiftFilter);
  if (sortBy) retainedQuery.set("sort_by", sortBy);
  if (sortDir) retainedQuery.set("sort_dir", sortDir);

  const makeActionHref = (paramKey: string, paramValue: string, hash?: string) => {
    const query = new URLSearchParams(retainedQuery);
    query.set(paramKey, paramValue);
    const suffix = hash ? `#${hash}` : "";
    return `/turmas?${query.toString()}${suffix}`;
  };

  return (
    <ModuleShell title="Turmas" description="Gestão de turmas">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      ) : null}

      <form action={createClassAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
        <h3 className="text-sm font-semibold text-[var(--brand-blue)] md:col-span-2">Nova turma</h3>
        {!hasActiveYear ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 md:col-span-2">
            Sem ano letivo ativo. Ative um ano letivo para criar turmas.
          </p>
        ) : null}
        <input name="name" required placeholder="Ex: 7º Ano A" className="fasy-input" disabled={!hasActiveYear} />
        <StageSeriesFields disabled={!hasActiveYear} />
        <input name="shift" required placeholder="Ex: Manhã" className="fasy-input" disabled={!hasActiveYear} />
        <input name="vacancies" type="number" min={0} defaultValue={30} className="fasy-input" disabled={!hasActiveYear} />
        <div className="md:col-span-2">
          <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm disabled:opacity-60" disabled={!hasActiveYear}>
            Cadastrar turma
          </button>
        </div>
      </form>

      <form method="get" className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-3">
        <h3 className="text-sm font-semibold text-[var(--brand-blue)] md:col-span-3">Filtros e ordenação</h3>
        <input name="q" defaultValue={q} placeholder="Buscar por nome da turma" className="fasy-input" />
        <select name="stage" defaultValue={stageFilter} className="fasy-input">
          <option value="">Todas as etapas</option>
          {STAGE_OPTIONS.map((stage) => (
            <option key={`filter-stage-${stage}`} value={stage}>
              {getEducationStageLabel(stage)}
            </option>
          ))}
        </select>
        <select name="series" defaultValue={seriesFilter} className="fasy-input">
          <option value="">Todas as séries</option>
          {availableSeries.map((series) => (
            <option key={`filter-series-${series}`} value={series}>
              {series}
            </option>
          ))}
        </select>
        <select name="shift" defaultValue={shiftFilter} className="fasy-input">
          <option value="">Todos os turnos</option>
          {availableShifts.map((shift) => (
            <option key={`filter-shift-${shift}`} value={shift}>
              {shift}
            </option>
          ))}
        </select>
        <select name="sort_by" defaultValue={sortBy} className="fasy-input">
          <option value="name">Ordenar por: Turma</option>
          <option value="stage">Ordenar por: Etapa</option>
          <option value="series">Ordenar por: Série</option>
          <option value="shift">Ordenar por: Turno</option>
          <option value="vacancies">Ordenar por: Vagas</option>
        </select>
        <select name="sort_dir" defaultValue={sortDir} className="fasy-input">
          <option value="asc">Crescente</option>
          <option value="desc">Decrescente</option>
        </select>
        <div className="md:col-span-3 flex items-center gap-2">
          <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
            Aplicar filtros
          </button>
          <a href="/turmas" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
            Limpar
          </a>
        </div>
      </form>

      <div className="rounded-2xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Turma</th>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3">Série</th>
              <th className="px-4 py-3">Turno</th>
              <th className="px-4 py-3">Vagas</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredClasses.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{getEducationStageLabel(row.stage)}</td>
                <td className="px-4 py-3">{row.series ?? "-"}</td>
                <td className="px-4 py-3">{row.shift}</td>
                <td className="px-4 py-3">{row.vacancies}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <a
                      href={makeActionHref("edit_class_id", row.id, "edicao-turma")}
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
                    >
                      Editar
                    </a>
                    <a
                      href={makeActionHref("confirm_delete_class_id", row.id, "excluir-turma")}
                      className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      Excluir
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {filteredClasses.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-4 py-6 text-center text-[var(--muted)]" colSpan={6}>
                  Nenhuma turma encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {classToEdit ? (
        <div id="edicao-turma" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Edição de turma</h3>
            <a href="/turmas" className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]">
              Fechar edição
            </a>
          </div>
          <form action={updateClassAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
            <input type="hidden" name="class_id" value={classToEdit.id} />
            <input name="name" required defaultValue={classToEdit.name} className="fasy-input" autoFocus />
            <StageSeriesFields initialStage={classToEdit.stage} initialSeries={classToEdit.series ?? ""} />
            <input name="shift" required defaultValue={classToEdit.shift} className="fasy-input" />
            <input name="vacancies" type="number" min={0} defaultValue={classToEdit.vacancies} className="fasy-input" />
            <div className="md:col-span-2">
              <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
                Salvar alterações
              </button>
            </div>
          </form>
        </div>
      ) : (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--muted)]">
          Clique em <strong>Editar</strong> na tabela para atualizar uma turma específica.
        </p>
      )}

      {classToDelete ? (
        <div id="excluir-turma" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-rose-700">Excluir turma</h3>
            <a href="/turmas" className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]">
              Cancelar
            </a>
          </div>
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Confirma excluir a turma <strong>{classToDelete.name}</strong>? Esta ação remove vínculos relacionados.
          </p>
          <form action={deleteClassAction} className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <input type="hidden" name="class_id" value={classToDelete.id} />
            <button type="submit" className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50">
              Confirmar exclusão
            </button>
          </form>
        </div>
      ) : null}
    </ModuleShell>
  );
}

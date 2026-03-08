import { ModuleShell } from "@/components/module-shell";
import {
  createClassDisciplineAction,
  deleteClassDisciplineAction,
  duplicateClassDisciplineAction,
  updateClassDisciplineAction,
} from "@/lib/actions/academic";
import { getUserContext } from "@/lib/app-context";
import { getEducationStageLabel, STAGE_OPTIONS } from "@/lib/constants";

type DisciplinasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type DisciplineRow = {
  id: string;
  classId: string;
  className: string;
  classStage: string;
  subjectName: string;
  subjectCode: string;
};

const PAGE_SIZE = 50;

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function buildQuery(base: Record<string, string>, overrides: Record<string, string>) {
  const query = new URLSearchParams();
  const merged = { ...base, ...overrides };

  Object.entries(merged).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export default async function DisciplinasPage({ searchParams }: DisciplinasPageProps) {
  const { supabase, activeSchoolId } = await getUserContext();
  const params = await searchParams;

  const success = getParam(params, "success");
  const error = getParam(params, "error");
  const duplicateLinkId = getParam(params, "duplicate_link_id");
  const editLinkId = getParam(params, "edit_link_id");
  const confirmDeleteLinkId = getParam(params, "confirm_delete_link_id");

  const classIdFilter = getParam(params, "class_id");
  const stageFilter = getParam(params, "stage");
  const disciplineFilter = getParam(params, "discipline_q").trim();
  const codeFilter = getParam(params, "code_q").trim();
  const sort = getParam(params, "sort") || "turma_asc";
  const requestedPage = Number.parseInt(getParam(params, "page") || "1", 10);

  const [classesResult, linksResult] = await Promise.all([
    supabase.from("classes").select("id, name, stage").eq("school_id", activeSchoolId).order("name").limit(300),
    supabase
      .from("class_subjects")
      .select("id, class_id, subject_id, classes(name, stage), subjects(name, code)")
      .eq("school_id", activeSchoolId)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const classes = (classesResult.data ?? []) as Array<{ id: string; name: string; stage: string }>;
  const stageOrder = new Map<string, number>(STAGE_OPTIONS.map((stage, index) => [stage, index]));
  const classesSortedByStageAndName = [...classes].sort((a, b) => {
    const stageDiff = (stageOrder.get(a.stage) ?? 999) - (stageOrder.get(b.stage) ?? 999);
    if (stageDiff !== 0) return stageDiff;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const allRows = (linksResult.data ?? []).map((item) => {
    const row = item as {
      id: string;
      class_id: string;
      classes?: { name?: string; stage?: string } | Array<{ name?: string; stage?: string }>;
      subjects?: { name?: string; code?: string } | Array<{ name?: string; code?: string }>;
    };

    const classData = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    const subjectData = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;

    return {
      id: row.id,
      classId: row.class_id,
      className: classData?.name ?? "-",
      classStage: classData?.stage ?? "",
      subjectName: subjectData?.name ?? "-",
      subjectCode: subjectData?.code ?? "",
    } satisfies DisciplineRow;
  });

  let filteredRows = allRows.filter((row) => {
    if (classIdFilter && row.classId !== classIdFilter) return false;
    if (stageFilter && row.classStage !== stageFilter) return false;
    if (disciplineFilter && !row.subjectName.toLowerCase().includes(disciplineFilter.toLowerCase())) return false;
    if (codeFilter && !row.subjectCode.toLowerCase().includes(codeFilter.toLowerCase())) return false;
    return true;
  });

  filteredRows = filteredRows.sort((a, b) => {
    switch (sort) {
      case "turma_desc":
        return b.className.localeCompare(a.className, "pt-BR");
      case "disciplina_asc":
        return a.subjectName.localeCompare(b.subjectName, "pt-BR");
      case "disciplina_desc":
        return b.subjectName.localeCompare(a.subjectName, "pt-BR");
      case "codigo_asc":
        return (a.subjectCode || "").localeCompare(b.subjectCode || "", "pt-BR");
      case "codigo_desc":
        return (b.subjectCode || "").localeCompare(a.subjectCode || "", "pt-BR");
      case "turma_asc":
      default:
        return a.className.localeCompare(b.className, "pt-BR");
    }
  });

  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

  const sourceRow = allRows.find((row) => row.id === duplicateLinkId);
  const editRow = allRows.find((row) => row.id === editLinkId);
  const deleteRow = allRows.find((row) => row.id === confirmDeleteLinkId);

  const queryBase = {
    class_id: classIdFilter,
    stage: stageFilter,
    discipline_q: disciplineFilter,
    code_q: codeFilter,
    sort,
  };

  const prevPageHref = `/disciplinas${buildQuery(queryBase, {
    page: currentPage > 1 ? String(currentPage - 1) : "1",
    duplicate_link_id: duplicateLinkId,
  })}`;

  const nextPageHref = `/disciplinas${buildQuery(queryBase, {
    page: currentPage < totalPages ? String(currentPage + 1) : String(totalPages),
    duplicate_link_id: duplicateLinkId,
  })}`;

  return (
    <ModuleShell title="Disciplinas por Turma" description="Cada disciplina é cadastrada vinculada à turma.">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      ) : null}

      <form action={createClassDisciplineAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-3">
        <select name="class_id" required className="fasy-input md:col-span-1" disabled={classes.length === 0}>
          <option value="">Selecione a turma</option>
          {classesSortedByStageAndName.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <input name="discipline_name" required placeholder="Nome da disciplina" className="fasy-input md:col-span-1" />
        <input name="code" placeholder="Código (opcional)" className="fasy-input md:col-span-1" />

        <div className="md:col-span-3">
          <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
            Cadastrar disciplina na turma
          </button>
        </div>
      </form>

      <form method="get" className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-6">
        <select name="class_id" defaultValue={classIdFilter} className="fasy-input md:col-span-1">
          <option value="">Todas as turmas</option>
          {classesSortedByStageAndName.map((item) => (
            <option key={`filter-class-${item.id}`} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <select name="stage" defaultValue={stageFilter} className="fasy-input md:col-span-1">
          <option value="">Todas as etapas</option>
          {STAGE_OPTIONS.map((stage) => (
            <option key={`filter-stage-${stage}`} value={stage}>
              {getEducationStageLabel(stage)}
            </option>
          ))}
        </select>

        <input name="discipline_q" defaultValue={disciplineFilter} placeholder="Buscar disciplina" className="fasy-input md:col-span-1" />
        <input name="code_q" defaultValue={codeFilter} placeholder="Buscar código" className="fasy-input md:col-span-1" />

        <select name="sort" defaultValue={sort} className="fasy-input md:col-span-1">
          <option value="turma_asc">Turma (A-Z)</option>
          <option value="turma_desc">Turma (Z-A)</option>
          <option value="disciplina_asc">Disciplina (A-Z)</option>
          <option value="disciplina_desc">Disciplina (Z-A)</option>
          <option value="codigo_asc">Código (A-Z)</option>
          <option value="codigo_desc">Código (Z-A)</option>
        </select>

        <div className="flex items-center gap-2 md:col-span-1">
          <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
            Filtrar
          </button>
          <a href="/disciplinas" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-soft)]">
            Limpar
          </a>
        </div>
      </form>

      <div className="rounded-2xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Turma</th>
              <th className="px-4 py-3 whitespace-nowrap">Etapa</th>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3 whitespace-nowrap">{row.className}</td>
                <td className="px-4 py-3 whitespace-nowrap">{row.classStage ? getEducationStageLabel(row.classStage) : "-"}</td>
                <td className="px-4 py-3">{row.subjectName}</td>
                <td className="px-4 py-3">{row.subjectCode || "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <a
                      href={`/disciplinas${buildQuery(queryBase, {
                        page: String(currentPage),
                        edit_link_id: row.id,
                      })}#editar-disciplina`}
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
                    >
                      Editar
                    </a>
                    <a
                      href={`/disciplinas${buildQuery(queryBase, {
                        page: String(currentPage),
                        duplicate_link_id: row.id,
                      })}#duplicar-disciplina`}
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
                    >
                      Duplicar
                    </a>
                    <a
                      href={`/disciplinas${buildQuery(queryBase, {
                        page: String(currentPage),
                        confirm_delete_link_id: row.id,
                      })}#excluir-disciplina`}
                      className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      Excluir
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                  Nenhuma disciplina encontrada para os filtros aplicados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm">
        <p className="text-[var(--muted)]">
          Mostrando {pageRows.length} de {totalItems} registros
        </p>
        <div className="flex items-center gap-2">
          <a
            href={prevPageHref}
            className={`rounded-lg border px-3 py-1 ${currentPage === 1 ? "pointer-events-none border-[var(--line)] text-[var(--muted)] opacity-50" : "border-[var(--line)] hover:bg-[var(--panel-soft)]"}`}
          >
            Anterior
          </a>
          <span className="text-[var(--muted)]">
            Página {currentPage} de {totalPages}
          </span>
          <a
            href={nextPageHref}
            className={`rounded-lg border px-3 py-1 ${currentPage === totalPages ? "pointer-events-none border-[var(--line)] text-[var(--muted)] opacity-50" : "border-[var(--line)] hover:bg-[var(--panel-soft)]"}`}
          >
            Próxima
          </a>
        </div>
      </div>

      {editRow ? (
        <div id="editar-disciplina" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Editar disciplina</h3>
            <a
              href={`/disciplinas${buildQuery(queryBase, { page: String(currentPage) })}`}
              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
            >
              Fechar
            </a>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Turma: <strong>{editRow.className}</strong>
          </p>
          <form action={updateClassDisciplineAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
            <input type="hidden" name="link_id" value={editRow.id} />
            <select name="class_id" required defaultValue={editRow.classId} className="fasy-input">
              {classesSortedByStageAndName.map((item) => (
                <option key={`edit-class-${item.id}`} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input name="discipline_name" required defaultValue={editRow.subjectName} className="fasy-input" autoFocus />
            <input name="code" defaultValue={editRow.subjectCode} className="fasy-input" />
            <div className="md:col-span-2">
              <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
                Salvar alterações
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteRow ? (
        <div id="excluir-disciplina" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-rose-700">Excluir vínculo da disciplina</h3>
            <a
              href={`/disciplinas${buildQuery(queryBase, { page: String(currentPage) })}`}
              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
            >
              Cancelar
            </a>
          </div>
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Confirma excluir a disciplina <strong>{deleteRow.subjectName}</strong> da turma <strong>{deleteRow.className}</strong>?
          </p>
          <form action={deleteClassDisciplineAction} className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <input type="hidden" name="link_id" value={deleteRow.id} />
            <button type="submit" className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50">
              Confirmar exclusão
            </button>
          </form>
        </div>
      ) : null}

      {sourceRow ? (
        <div id="duplicar-disciplina" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Duplicar disciplina para outras turmas</h3>
            <a
              href={`/disciplinas${buildQuery(queryBase, { page: String(currentPage) })}`}
              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
            >
              Fechar
            </a>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Origem: <strong>{sourceRow.className}</strong> - <strong>{sourceRow.subjectName}</strong>
          </p>
          <form action={duplicateClassDisciplineAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
            <input type="hidden" name="source_link_id" value={sourceRow.id} />
            <fieldset className="rounded-xl border border-[var(--line)] p-3">
              <legend className="px-2 text-xs font-semibold text-[var(--muted)]">Turmas de destino</legend>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {classesSortedByStageAndName
                  .filter((item) => item.id !== sourceRow.classId)
                  .map((item, classIndex) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="target_class_ids" value={item.id} autoFocus={classIndex === 0} />
                      <span>{item.name}</span>
                    </label>
                  ))}
              </div>
            </fieldset>
            <div>
              <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
                Duplicar para turmas selecionadas
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </ModuleShell>
  );
}

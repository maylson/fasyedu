import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";
import { updateFamilyPortalSettingsAction, updatePlanningPreferencesAction, updateSchoolLlmSettingsAction } from "@/lib/actions/settings";

type PedagogicoPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PedagogicoPage({ searchParams }: PedagogicoPageProps) {
  const { supabase, activeSchoolId, roles } = await getUserContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;
  const isSupport = roles.includes("SUPPORT");

  const { data: school } = await supabase
    .from("schools")
    .select(
      "id, planning_pillars_enabled, student_agenda_enabled, llm_enabled, llm_provider, llm_model, llm_base_url, llm_prompt_template",
    )
    .eq("id", activeSchoolId)
    .maybeSingle();

  if (!isSupport) {
    return (
      <ModuleShell title="Configurações · Pedagógico" description="Parâmetros pedagógicos da escola">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Somente a role SUPPORT pode visualizar e alterar configurações pedagógicas.
        </p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell title="Configurações · Pedagógico" description="Defina recursos pedagógicos por escola">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/configuracoes/ano-letivo" className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--panel-soft)]">
          Ano letivo
        </Link>
        <span className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1 text-sm text-[var(--brand-blue)]">Pedagógico</span>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

      <form action={updatePlanningPreferencesAction} className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="planning_pillars_enabled"
            defaultChecked={Boolean(school?.planning_pillars_enabled)}
            className="mt-1 h-4 w-4 rounded border-[var(--line)]"
          />
          <span className="text-sm">
            <strong className="block text-[var(--brand-blue)]">Habilitar pilares no planejamento de aula</strong>
            Se ativado, os professores verão os pilares como checkboxes no formulário de planejamento.
          </span>
        </label>

        <div>
          <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
            Salvar preferências pedagógicas
          </button>
        </div>
      </form>

      <form action={updateFamilyPortalSettingsAction} className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-base font-semibold text-[var(--brand-blue)]">Agenda da família</h3>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="student_agenda_enabled"
            defaultChecked={Boolean(school?.student_agenda_enabled)}
            className="mt-1 h-4 w-4 rounded border-[var(--line)]"
          />
          <span className="text-sm">
            <strong className="block text-[var(--brand-blue)]">Habilitar menu Agenda (com conteúdos)</strong>
            Pais e alunos visualizam aulas, conteúdos, tarefas e eventos da semana em um único menu.
          </span>
        </label>

        <div>
          <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
            Salvar configurações da agenda
          </button>
        </div>
      </form>

      <form action={updateSchoolLlmSettingsAction} className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="text-base font-semibold text-[var(--brand-blue)]">Configuração de LLM (por escola)</h3>

        <label className="flex items-start gap-3">
          <input type="checkbox" name="llm_enabled" defaultChecked={Boolean(school?.llm_enabled)} className="mt-1 h-4 w-4 rounded border-[var(--line)]" />
          <span className="text-sm">
            <strong className="block text-[var(--brand-blue)]">Habilitar Wizard de IA</strong>
            Quando desativado, o sistema usa apenas avaliação local de fallback.
          </span>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Provedor</span>
            <select name="llm_provider" defaultValue={school?.llm_provider ?? "OPENAI"} className="fasy-input">
              <option value="OPENAI">OPENAI</option>
              <option value="OPENAI_COMPAT">OPENAI_COMPAT</option>
              <option value="ANTHROPIC">ANTHROPIC</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Modelo</span>
            <input name="llm_model" defaultValue={school?.llm_model ?? ""} className="fasy-input" placeholder="Ex.: gpt-4.1-mini" />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-medium">Base URL (opcional)</span>
            <input name="llm_base_url" defaultValue={school?.llm_base_url ?? ""} className="fasy-input" placeholder="Ex.: https://api.openai.com/v1" />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-medium">API Key (deixe em branco para manter a atual)</span>
            <input name="llm_api_key" type="password" className="fasy-input" placeholder="Cole a chave da LLM deste colégio" />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-medium">Prompt do Wizard (por escola)</span>
            <textarea
              name="llm_prompt_template"
              defaultValue={school?.llm_prompt_template ?? ""}
              className="fasy-input min-h-40"
              placeholder={`Use {{context_json}} e {{plan_json}} para injetar os dados.\nSe não usar placeholders, o sistema anexa contexto/plano no final automaticamente.`}
            />
          </label>
        </div>

        <div>
          <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
            Salvar configuração de IA
          </button>
        </div>
      </form>
    </ModuleShell>
  );
}


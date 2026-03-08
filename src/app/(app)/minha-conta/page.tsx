import { ModuleShell } from "@/components/module-shell";
import { updateMyPasswordAction, updateMyProfileAction } from "@/lib/actions/account";
import { getUserContext } from "@/lib/app-context";

type MinhaContaPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MinhaContaPage({ searchParams }: MinhaContaPageProps) {
  const { supabase, user, roles, memberships, activeSchoolId } = await getUserContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, phone, document")
    .eq("id", user.id)
    .maybeSingle();

  const schoolRoles = roles.join(", ");
  const schoolsCount = new Set(memberships.map((m) => m.school_id)).size;
  const activeSchoolName = memberships.find((m) => m.school_id === activeSchoolId)?.schools?.name ?? "-";

  return (
    <ModuleShell title="Minha Conta" description="Dados pessoais, acesso e segurança da conta">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-[var(--line)] bg-white p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-[var(--brand-blue)]">Dados pessoais</h3>
          <form action={updateMyProfileAction} className="grid gap-3 md:grid-cols-2">
            <input name="full_name" required defaultValue={profile?.full_name ?? ""} placeholder="Nome completo" className="fasy-input md:col-span-2" />
            <input name="phone" defaultValue={profile?.phone ?? ""} placeholder="Telefone" className="fasy-input" />
            <input name="document" defaultValue={profile?.document ?? ""} placeholder="CPF / Documento" className="fasy-input" />
            <input value={user.email ?? ""} disabled className="fasy-input md:col-span-2" />
            <div className="md:col-span-2">
              <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
                Salvar dados
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--brand-blue)]">Resumo de acesso</h3>
          <p className="text-xs text-[var(--muted)]">E-mail</p>
          <p className="mb-2 text-sm font-medium">{user.email}</p>
          <p className="text-xs text-[var(--muted)]">Perfis na escola ativa</p>
          <p className="mb-2 text-sm font-medium">{schoolRoles || "-"}</p>
          <p className="text-xs text-[var(--muted)]">Escola ativa</p>
          <p className="mb-2 text-sm font-medium">{activeSchoolName}</p>
          <p className="text-xs text-[var(--muted)]">Escolas vinculadas</p>
          <p className="text-sm font-medium">{schoolsCount}</p>
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--brand-blue)]">Segurança</h3>
        <form action={updateMyPasswordAction} className="grid gap-3 md:grid-cols-2">
          <input name="password" type="password" required placeholder="Nova senha (mínimo 8)" className="fasy-input" />
          <input name="confirm_password" type="password" required placeholder="Confirmar nova senha" className="fasy-input" />
          <div className="md:col-span-2">
            <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
              Alterar senha
            </button>
          </div>
        </form>
      </section>
    </ModuleShell>
  );
}

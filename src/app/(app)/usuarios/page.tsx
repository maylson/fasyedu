import { ModuleShell } from "@/components/module-shell";
import { createUserWithRolesAction, updateUserByDirectionAction } from "@/lib/actions/users";
import { getUserContext } from "@/lib/app-context";
import { ROLE_OPTIONS } from "@/lib/constants";

type UsuariosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsuariosPage({ searchParams }: UsuariosPageProps) {
  const { supabase, activeSchoolId, roles } = await getUserContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;
  const editUserId = typeof params.edit_user_id === "string" ? params.edit_user_id : "";
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const normalizedQuery = query.toLocaleLowerCase("pt-BR");
  const currentPageRaw = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const currentPage = Number.isFinite(currentPageRaw) && currentPageRaw > 0 ? currentPageRaw : 1;
  const pageSize = 25;
  const canEditOthers = roles.includes("DIRECAO") || roles.includes("SUPPORT");

  const roleRows: Array<{
    user_id: string;
    role: string;
    is_active: boolean;
    user_profiles?: { full_name?: string; phone?: string } | Array<{ full_name?: string; phone?: string }>;
  }> = [];
  const batchSize = 1000;
  let from = 0;
  let keepLoading = true;

  while (keepLoading) {
    const { data, error: rolesError } = await supabase
      .from("user_school_roles")
      .select("user_id, role, is_active, user_profiles(full_name, phone)")
      .eq("school_id", activeSchoolId)
      .order("created_at", { ascending: false })
      .range(from, from + batchSize - 1);

    if (rolesError) {
      break;
    }

    const chunk = (data ?? []) as typeof roleRows;
    roleRows.push(...chunk);
    keepLoading = chunk.length === batchSize;
    from += batchSize;
  }

  const usersMap = new Map<
    string,
    {
      userId: string;
      fullName: string;
      phone: string;
      activeRoles: string[];
    }
  >();

  for (const row of roleRows) {
    const profile = Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles;
    const existing = usersMap.get(row.user_id) ?? {
      userId: row.user_id,
      fullName: profile?.full_name ?? "Sem nome",
      phone: profile?.phone ?? "",
      activeRoles: [],
    };
    if (row.is_active) {
      existing.activeRoles.push(row.role);
    }
    if (profile?.full_name) {
      existing.fullName = profile.full_name;
    }
    if (profile?.phone) {
      existing.phone = profile.phone;
    }
    usersMap.set(row.user_id, existing);
  }

  const users = Array.from(usersMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
  const filteredUsers = normalizedQuery
    ? users.filter((user) => {
        const searchable = `${user.fullName} ${user.phone} ${user.activeRoles.join(" ")}`.toLocaleLowerCase("pt-BR");
        return searchable.includes(normalizedQuery);
      })
    : users;
  const totalUsers = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const usersPage = filteredUsers.slice(startIndex, endIndex);
  const userToEdit = canEditOthers ? filteredUsers.find((item) => item.userId === editUserId) : undefined;

  const buildPageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    const normalizedPage = String(Math.max(1, Math.min(nextPage, totalPages)));
    next.set("page", normalizedPage);
    if (editUserId) next.set("edit_user_id", editUserId);
    if (success) next.set("success", success);
    if (error) next.set("error", error);
    if (query) next.set("q", query);
    return `/usuarios?${next.toString()}`;
  };

  return (
    <ModuleShell title="Usuários e Perfis" description="Criação de usuários e gestão de múltiplos papéis por escola">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      ) : null}

      <form action={createUserWithRolesAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
        <input name="full_name" required placeholder="Nome completo" className="fasy-input" />
        <input name="phone" placeholder="Telefone (opcional)" className="fasy-input" />
        <input name="email" type="email" required placeholder="E-mail" className="fasy-input" />
        <input name="password" type="password" required placeholder="Senha inicial (mínimo 8)" className="fasy-input" />

        <fieldset className="md:col-span-2 rounded-xl border border-[var(--line)] p-3">
          <legend className="px-2 text-xs font-semibold text-[var(--muted)]">Perfis de acesso</legend>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {ROLE_OPTIONS.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roles" value={role} />
                <span>{role}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="md:col-span-2">
          <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
            Criar usuário
          </button>
        </div>
      </form>

      <form method="get" className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-[1fr_auto_auto]">
        <input
          name="q"
          defaultValue={query}
          placeholder="Pesquisar por nome, telefone ou perfil"
          className="fasy-input"
        />
        <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
          Pesquisar
        </button>
        <a href="/usuarios" className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--panel-soft)]">
          Limpar
        </a>
      </form>

      <div className="rounded-2xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-soft)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Perfis ativos</th>
              <th className="px-4 py-3">Telefone</th>
              {canEditOthers ? <th className="px-4 py-3">Ações</th> : null}
            </tr>
          </thead>
          <tbody>
            {usersPage.map((row) => {
              return (
                <tr key={row.userId} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">{row.fullName}</td>
                  <td className="px-4 py-3">{row.activeRoles.join(", ") || "-"}</td>
                  <td className="px-4 py-3">{row.phone || "-"}</td>
                  {canEditOthers ? (
                    <td className="px-4 py-3">
                      <a
                        href={`/usuarios?edit_user_id=${encodeURIComponent(row.userId)}&page=${safePage}`}
                        className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]"
                      >
                        Editar
                      </a>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-col gap-2 border-t border-[var(--line)] px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <p className="text-[var(--muted)]">
            Mostrando {totalUsers === 0 ? 0 : startIndex + 1} a {Math.min(endIndex, totalUsers)} de {totalUsers} usuários
            {query ? ` (filtro: "${query}")` : ""}
          </p>
          <div className="flex items-center gap-2">
            <a
              href={buildPageHref(safePage - 1)}
              aria-disabled={safePage <= 1}
              className={`rounded-lg border px-3 py-1 text-xs ${
                safePage <= 1
                  ? "pointer-events-none border-[var(--line)] text-[var(--muted)] opacity-50"
                  : "border-[var(--line)] hover:bg-[var(--panel-soft)]"
              }`}
            >
              Anterior
            </a>
            <span className="text-xs text-[var(--muted)]">
              Página {safePage} de {totalPages}
            </span>
            <a
              href={buildPageHref(safePage + 1)}
              aria-disabled={safePage >= totalPages}
              className={`rounded-lg border px-3 py-1 text-xs ${
                safePage >= totalPages
                  ? "pointer-events-none border-[var(--line)] text-[var(--muted)] opacity-50"
                  : "border-[var(--line)] hover:bg-[var(--panel-soft)]"
              }`}
            >
              Próxima
            </a>
          </div>
        </div>
      </div>

      {canEditOthers ? (
        userToEdit ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--brand-blue)]">Edição de usuário (Direção)</h3>
              <a href="/usuarios" className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-soft)]">
                Fechar edição
              </a>
            </div>
            <form action={updateUserByDirectionAction} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-2">
              <input type="hidden" name="target_user_id" value={userToEdit.userId} />
              <input name="full_name" defaultValue={userToEdit.fullName} required className="fasy-input" />
              <input name="phone" defaultValue={userToEdit.phone} placeholder="Telefone" className="fasy-input" />
              <fieldset className="md:col-span-2 rounded-xl border border-[var(--line)] p-3">
                <legend className="px-2 text-xs font-semibold text-[var(--muted)]">Perfis ativos</legend>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {ROLE_OPTIONS.map((role) => (
                    <label key={`${userToEdit.userId}-${role}`} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="roles" value={role} defaultChecked={userToEdit.activeRoles.includes(role)} />
                      <span>{role}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="md:col-span-2">
                <button type="submit" className="fasy-btn-primary px-4 py-2 text-sm">
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        ) : (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--muted)]">
            Clique em <strong>Editar</strong> na tabela para atualizar um usuário específico.
          </p>
        )
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Somente o perfil DIREÇÃO pode editar outros usuários.
        </p>
      )}
    </ModuleShell>
  );
}




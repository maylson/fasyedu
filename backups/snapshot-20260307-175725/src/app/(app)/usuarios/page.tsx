import { ModuleShell } from "@/components/module-shell";
import { getUserContext } from "@/lib/app-context";

export default async function UsuariosPage() {
  const { supabase, activeSchoolId } = await getUserContext();
  const { data } = await supabase
    .from("user_school_roles")
    .select("role, user_profiles(full_name)")
    .eq("school_id", activeSchoolId)
    .eq("is_active", true)
    .limit(20);

  return (
    <ModuleShell title="Usuários e Perfis" description="Controle de acesso por papéis múltiplos">
      <div className="rounded-2xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f8fbf8] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item, index) => {
              const row = item as {
                role: string;
                user_profiles?: { full_name?: string } | Array<{ full_name?: string }>;
              };
              const fullName = Array.isArray(row.user_profiles)
                ? row.user_profiles[0]?.full_name ?? "Sem nome"
                : row.user_profiles?.full_name ?? "Sem nome";

              return (
                <tr key={`${row.role}-${index}`} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">{fullName}</td>
                  <td className="px-4 py-3">{row.role}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}

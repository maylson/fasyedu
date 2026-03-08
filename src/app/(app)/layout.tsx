import { ReactNode } from "react";
import { getUserContext } from "@/lib/app-context";
import { AppSidebar } from "@/components/app-sidebar";
import { getAllowedNavItems } from "@/lib/navigation";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, memberships, activeSchoolId, roles } = await getUserContext();
  const activeSchool = memberships.find((item) => item.school_id === activeSchoolId)?.schools?.name ?? "Sem escola ativa";
  const navItems = getAllowedNavItems(roles);

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 md:p-6">
      <div className="grid w-full gap-4 md:grid-cols-[auto_1fr]">
        <AppSidebar navItems={navItems} email={user.email ?? ""} rolesLabel={roles.join(", ")} schoolName={activeSchool} />

        <section className="fasy-glass rounded-3xl p-4 md:p-6">
          <div className="mb-6 flex flex-col gap-3 border-b border-[var(--line)] pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-[var(--muted)]">Escola ativa</p>
              <h2 className="text-lg font-semibold text-[var(--brand-blue)]">{activeSchool}</h2>
            </div>
          </div>

          {children}
        </section>
      </div>
    </div>
  );
}

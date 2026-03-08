"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOutAction } from "@/lib/actions/auth";
import type { NavIcon } from "@/lib/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};

type AppSidebarProps = {
  navItems: NavItem[];
  email: string;
  rolesLabel: string;
  schoolName: string;
};

function Icon({ name }: { name: NavIcon }) {
  const base = "h-4 w-4";
  if (name === "dashboard") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="14" width="7" height="7" /></svg>;
  if (name === "users") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" /><path d="M16 11c1.7 0 3-1.3 3-3" /><path d="M21 20c0-2.4-1.6-4.2-4-4.8" /></svg>;
  if (name === "students") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l9-5 9 5-9 5-9-5z" /><path d="M7 10v5c0 2 2.2 4 5 4s5-2 5-4v-5" /></svg>;
  if (name === "classes") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 20h8" /></svg>;
  if (name === "subjects") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" /></svg>;
  if (name === "enrollments") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  if (name === "planning") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v4" /><path d="M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></svg>;
  if (name === "assessments") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  if (name === "calendar") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
  if (name === "board") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v12H5.2L4 17.2V4z" /><path d="M8 20h8" /></svg>;
  if (name === "schedule") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
  if (name === "settings") return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" /></svg>;
  return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" /></svg>;
}

export function AppSidebar({ navItems, email, rolesLabel, schoolName }: AppSidebarProps) {
  const pathname = usePathname();
  const [optimisticNav, setOptimisticNav] = useState<{ href: string; fromPath: string } | null>(null);
  const uniqueRoles = Array.from(
    new Set(
      (rolesLabel || "")
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean),
    ),
  );
  const compactRolesLabel =
    uniqueRoles.length > 4
      ? `${uniqueRoles.slice(0, 4).join(", ")} +${uniqueRoles.length - 4}`
      : uniqueRoles.join(", ");

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("fasy_sidebar_collapsed") === "true";
  });

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem("fasy_sidebar_collapsed", String(next));
  }

  return (
    <aside
      className={`fasy-dark-panel rounded-3xl border border-[#1d4f84] p-4 shadow-[0_14px_40px_rgba(8,33,63,0.38)] transition-all duration-300 ${
        collapsed ? "w-20" : "w-[280px]"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-xs tracking-[0.18em] uppercase text-cyan-200 ${collapsed ? "hidden" : ""}`}>FASY</p>
        <button
          type="button"
          onClick={toggleCollapse}
          className="rounded-lg border border-cyan-200/35 bg-white/8 px-2 py-1 text-xs text-cyan-50 hover:bg-white/16"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? ">>" : "<<"}
        </button>
      </div>

      {!collapsed ? (
        <>
          <h1 className="mt-2 text-xl font-semibold leading-tight text-[var(--brand-ice)]">Formative Assessment System</h1>
          <p className="mt-1 text-xs text-cyan-100/90">{schoolName}</p>
        </>
      ) : null}

      <nav className="mt-6 grid gap-2">
        {navItems.map((item) => {
          const effectivePath = optimisticNav && pathname === optimisticNav.fromPath ? optimisticNav.href : pathname;
          const active = effectivePath === item.href || effectivePath.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOptimisticNav({ href: item.href, fromPath: pathname })}
              title={item.label}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                active
                  ? "border-cyan-200/45 bg-white/20 text-white"
                  : "border-transparent bg-white/4 text-cyan-50 hover:border-cyan-200/35 hover:bg-white/12"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon name={item.icon} />
              <span className={collapsed ? "hidden" : ""}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={`mt-6 rounded-xl border border-cyan-200/30 bg-[#0a2445]/70 p-3 text-xs ${collapsed ? "px-2 py-3" : ""}`}>
        <p className={`font-medium break-words ${collapsed ? "hidden" : ""}`}>{email}</p>
        <p
          className={`mt-1 text-cyan-100 ${collapsed ? "hidden" : ""}`}
          title={uniqueRoles.length ? uniqueRoles.join(", ") : "Sem perfil"}
        >
          Perfis: {compactRolesLabel || "Sem perfil"}
        </p>
        {collapsed ? <p className="text-center text-cyan-100" title={email}>@</p> : null}
      </div>

      <form action={signOutAction} className="mt-4">
        <button
          type="submit"
          title="Sair"
          className={`w-full rounded-xl border border-cyan-200/35 bg-white/8 px-3 py-2 text-sm font-medium text-cyan-50 transition hover:bg-white/16 ${
            collapsed ? "px-2" : ""
          }`}
        >
          {collapsed ? "x" : "Sair"}
        </button>
      </form>
    </aside>
  );
}

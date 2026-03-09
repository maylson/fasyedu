import type { UserRole } from "@/lib/constants";

export type NavIcon =
  | "dashboard"
  | "users"
  | "students"
  | "classes"
  | "subjects"
  | "enrollments"
  | "planning"
  | "assessments"
  | "calendar"
  | "board"
  | "schedule"
  | "account"
  | "settings";

export type NavItemDef = {
  href: string;
  label: string;
  icon: NavIcon;
  allowedRoles: UserRole[];
};

const ALL_ROLES: UserRole[] = ["DIRECAO", "COORDENACAO", "SECRETARIA", "PROFESSOR", "PAI", "ALUNO"];

export const NAV_ITEMS: NavItemDef[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", allowedRoles: ALL_ROLES },
  { href: "/coordenacao", label: "Coordenação", icon: "planning", allowedRoles: ["DIRECAO", "COORDENACAO"] },
  { href: "/usuarios", label: "Usuários", icon: "users", allowedRoles: ["DIRECAO"] },
  { href: "/alunos", label: "Alunos e Pais", icon: "students", allowedRoles: ["DIRECAO", "COORDENACAO", "SECRETARIA"] },
  { href: "/turmas", label: "Turmas", icon: "classes", allowedRoles: ["DIRECAO", "COORDENACAO", "SECRETARIA"] },
  { href: "/disciplinas", label: "Disciplinas", icon: "subjects", allowedRoles: ["DIRECAO", "COORDENACAO", "SECRETARIA"] },
  { href: "/matriculas", label: "Matrículas", icon: "enrollments", allowedRoles: ["DIRECAO", "COORDENACAO", "SECRETARIA"] },
  { href: "/planejamento", label: "Planejamento", icon: "planning", allowedRoles: ["PROFESSOR"] },
  { href: "/agenda", label: "Agenda", icon: "calendar", allowedRoles: ["PAI", "ALUNO"] },
  { href: "/avaliacoes", label: "Avaliações", icon: "assessments", allowedRoles: ["DIRECAO", "COORDENACAO", "PROFESSOR", "ALUNO"] },
  { href: "/calendario", label: "Calendário", icon: "calendar", allowedRoles: ALL_ROLES },
  { href: "/mural", label: "Mural", icon: "board", allowedRoles: ALL_ROLES },
  { href: "/horarios", label: "Horários", icon: "schedule", allowedRoles: ALL_ROLES },
  { href: "/minha-conta", label: "Minha Conta", icon: "account", allowedRoles: ALL_ROLES },
  { href: "/configuracoes", label: "Configurações", icon: "settings", allowedRoles: ["DIRECAO"] },
];

export function getAllowedNavItems(roles: UserRole[]) {
  return NAV_ITEMS.filter((item) => item.allowedRoles.some((role) => roles.includes(role)));
}

export function isPathAllowedForRoles(pathname: string, roles: UserRole[]) {
  const matched = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (!matched) return true;
  return matched.allowedRoles.some((role) => roles.includes(role));
}

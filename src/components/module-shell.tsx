import { ReactNode } from "react";

type ModuleShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ModuleShell({ title, description, children }: ModuleShellProps) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-[var(--muted)]">{description}</p>
      </header>
      {children}
    </div>
  );
}

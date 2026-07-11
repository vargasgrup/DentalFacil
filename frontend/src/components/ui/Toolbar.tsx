import { ReactNode } from "react";

interface ToolbarProps {
  search?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Toolbar({ search, actions, children }: ToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 items-center gap-3">
        {search}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

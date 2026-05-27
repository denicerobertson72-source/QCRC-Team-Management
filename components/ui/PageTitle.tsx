import type { ReactNode } from "react";

export function PageTitle({ title, actions, subtitle }: { title: string; actions?: ReactNode; subtitle?: string }) {
  return (
    <div className="page-header">
      <div className="page-title">
        <h1>{title}</h1>
        {actions ? <div className="row">{actions}</div> : null}
      </div>
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </div>
  );
}

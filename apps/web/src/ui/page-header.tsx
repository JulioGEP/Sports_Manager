import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Migas o contexto encima del título. */
  eyebrow?: ReactNode;
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <div className="page-header__eyebrow">{eyebrow}</div> : null}
        <h1 className="page-header__title">{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

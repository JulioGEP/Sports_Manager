import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, description, actions, footer, children, className }: CardProps) {
  return (
    <section className={["card", className ?? ""].join(" ").trim()}>
      {title || actions ? (
        <header className="card__header">
          <div>
            {title ? <h2 className="card__title">{title}</h2> : null}
            {description ? <p className="card__description">{description}</p> : null}
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className="card__body">{children}</div> : null}
      {footer ? <footer className="card__footer">{footer}</footer> : null}
    </section>
  );
}

import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <div className="empty__icon">{icon}</div> : null}
      <p className="empty__title">{title}</p>
      {description ? <p className="empty__description">{description}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

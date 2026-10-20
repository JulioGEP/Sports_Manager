import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="stat">
      {icon ? <div className="stat__icon">{icon}</div> : null}
      <div>
        <div className="stat__value">{value}</div>
        <div className="stat__label">{label}</div>
        {hint ? <div className="stat__hint">{hint}</div> : null}
      </div>
    </div>
  );
}

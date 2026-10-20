import type { ReactNode } from "react";
import { CheckCircle, Info, Warning } from "./icons";

export type AlertKind = "error" | "success" | "info" | "warning";

const styles: Record<AlertKind, string> = {
  error: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
};

/** Aviso en línea. El color nunca va solo: icono y texto siempre. */
export function Alert({
  kind,
  title,
  children,
  actions,
}: {
  kind: AlertKind;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = kind === "success" ? CheckCircle : kind === "info" ? Info : Warning;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`flex gap-3 rounded-field p-4 text-body ${styles[kind]}`}
    >
      <Icon size={22} weight="duotone" aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-2">
        {title ? <strong className="font-semibold">{title}</strong> : null}
        {children ? <div>{children}</div> : null}
        {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
      </div>
    </div>
  );
}

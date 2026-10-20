import type { ReactNode } from "react";
import { Icon } from "./icons";

export type AlertKind = "error" | "success" | "info" | "warning";

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
  const IconFor =
    kind === "error" || kind === "warning"
      ? Icon.Warning
      : kind === "success"
        ? Icon.Check
        : Icon.Info;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`alert alert--${kind}`}>
      <IconFor size={18} />
      <div className="alert__body">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
        {actions ? <div className="alert__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

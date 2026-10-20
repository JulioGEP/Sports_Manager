import type { ReactNode } from "react";

export function Alert({ kind, children }: { kind: "error" | "ok" | "info"; children: ReactNode }) {
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`alert alert--${kind}`}>
      {children}
    </p>
  );
}

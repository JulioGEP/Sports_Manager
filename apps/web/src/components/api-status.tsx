"use client";

import { HealthResponseSchema, type HealthResponse } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type State = { kind: "loading" } | { kind: "ok"; health: HealthResponse } | { kind: "error" };

/**
 * Muestra el estado de la API consultando /api/health en el mismo host.
 * La web nunca habla con la base de datos: solo con la API (ADR 0001).
 */
export function ApiStatus() {
  const t = useTranslations("apiStatus");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return HealthResponseSchema.parse(await res.json());
      })
      .then((health) => setState({ kind: "ok", health }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => controller.abort();
  }, []);

  if (state.kind === "loading") return <span className="badge">{t("loading")}</span>;
  if (state.kind === "error") return <span className="badge badge--error">{t("error")}</span>;

  const { health } = state;
  return (
    <dl className="status">
      <div>
        <dt>{t("ok")}</dt>
        <dd>
          <span className="badge badge--ok">{health.time}</span>
        </dd>
      </div>
      <div>
        <dt>{t("functionRegion")}</dt>
        <dd>{health.region ?? t("unknown")}</dd>
      </div>
      <div>
        <dt>{t("dbRegion")}</dt>
        <dd>{health.db.ok ? (health.db.region ?? t("unknown")) : t("dbDown")}</dd>
      </div>
    </dl>
  );
}

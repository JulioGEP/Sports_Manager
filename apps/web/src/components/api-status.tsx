"use client";

import { HealthResponseSchema, type HealthResponse } from "@sportsmanager/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Badge } from "@/ui";

type State = { kind: "loading" } | { kind: "ok"; health: HealthResponse } | { kind: "error" };

/**
 * Muestra el estado de la API consultando /api/health en el mismo host.
 * La web nunca habla con la base de datos: solo con la API (ADR 0001).
 */
export function ApiStatus() {
  const t = useTranslations("apiStatus");
  const format = useFormatter();
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

  if (state.kind === "loading") return <Badge>{t("loading")}</Badge>;
  if (state.kind === "error") return <Badge tone="danger">{t("error")}</Badge>;

  const { health } = state;
  return (
    <dl className="dl">
      <dt>{t("api")}</dt>
      <dd>
        <Badge tone="success">{t("ok")}</Badge>
      </dd>
      <dt>{t("checkedAt")}</dt>
      <dd>
        {format.dateTime(new Date(health.time), { dateStyle: "medium", timeStyle: "medium" })}
      </dd>
      <dt>{t("functionRegion")}</dt>
      <dd>{health.region ?? t("unknown")}</dd>
      <dt>{t("dbRegion")}</dt>
      <dd>
        {health.db.ok ? (
          (health.db.region ?? t("unknown"))
        ) : (
          <Badge tone="danger">{t("dbDown")}</Badge>
        )}
      </dd>
      {health.db.ok && health.db.latencyMs !== null ? (
        <>
          <dt>{t("dbLatency")}</dt>
          <dd>{t("ms", { value: health.db.latencyMs })}</dd>
        </>
      ) : null}
    </dl>
  );
}

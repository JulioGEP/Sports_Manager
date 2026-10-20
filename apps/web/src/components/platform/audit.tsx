"use client";

import { AuditResponseSchema, type AuditEntry } from "@sportsmanager/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { Alert, DataTable, EmptyState, Icon, PageHeader } from "@/ui";

export function PlatformAudit() {
  const t = useTranslations("platform.audit");
  const c = useTranslations("common");
  const actions = useTranslations("audit");
  const errors = useTranslations("errors");
  const format = useFormatter();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/platform/audit?limit=100", { schema: AuditResponseSchema })
      .then((res) => setEntries(res.entries))
      .catch((err: unknown) => setError(errors(errorKey(err))));
  }, [errors]);

  return (
    <div className="stack">
      <PageHeader title={t("title")} description={t("description")} />
      {error ? <Alert kind="error">{error}</Alert> : null}
      <div className="card">
        <DataTable<AuditEntry>
          caption={t("title")}
          rows={entries ?? []}
          getKey={(e) => e.id}
          empty={
            <EmptyState
              icon={<Icon.Activity />}
              title={entries === null ? c("loading") : t("empty")}
            />
          }
          columns={[
            {
              key: "when",
              header: t("table.when"),
              cell: (e) =>
                format.dateTime(new Date(e.createdAt), { dateStyle: "medium", timeStyle: "short" }),
            },
            {
              key: "action",
              header: t("table.action"),
              cell: (e) => <strong>{actions(e.action)}</strong>,
            },
            { key: "who", header: t("table.who"), cell: (e) => e.actorName ?? t("system") },
            { key: "club", header: t("table.club"), cell: (e) => e.organizationName ?? "" },
            { key: "target", header: t("table.target"), cell: (e) => e.target ?? "" },
          ]}
        />
      </div>
    </div>
  );
}

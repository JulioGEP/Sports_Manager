import { AuditResponseSchema, type AuditEntry } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { apiFetch, errorKey } from "@/lib/api";
import { useT } from "@/lib/intl";
import { Alert, Card, DataList, EmptyState, Icon, PageHeader } from "@/ui";

export function PlatformAuditPage() {
  const t = useT("platform.audit");
  const c = useT("common");
  const actions = useT("audit");
  const errors = useT("errors");
  const intl = useIntl();
  const entries = useQuery({
    queryKey: ["platform", "audit"],
    queryFn: () =>
      apiFetch("/api/platform/audit?limit=100", { schema: AuditResponseSchema, club: null }),
  });
  const when = (iso: string) =>
    intl.formatDate(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      {entries.isError ? <Alert kind="error">{errors(errorKey(entries.error))}</Alert> : null}
      <Card padded={false}>
        <DataList<AuditEntry>
          caption={t("title")}
          rows={entries.data?.entries ?? []}
          getKey={(e) => e.id}
          empty={
            <EmptyState
              icon={<Icon.Pulse weight="duotone" />}
              title={entries.isPending ? c("loading") : t("empty")}
            />
          }
          columns={[
            {
              key: "when",
              header: t("table.when"),
              cell: (e) => <span className="font-mono text-secondary">{when(e.createdAt)}</span>,
            },
            {
              key: "action",
              header: t("table.action"),
              cell: (e) => <strong className="font-medium">{actions(e.action)}</strong>,
            },
            { key: "who", header: t("table.who"), cell: (e) => e.actorName ?? t("system") },
            { key: "club", header: t("table.club"), cell: (e) => e.organizationName ?? "" },
            { key: "target", header: t("table.target"), cell: (e) => e.target ?? "" },
          ]}
          mobileRow={(e) => ({
            title: actions(e.action),
            subtitle: `${e.actorName ?? t("system")} · ${e.organizationName ?? ""} · ${when(e.createdAt)}`,
          })}
        />
      </Card>
    </div>
  );
}

import { HealthResponseSchema } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/intl";
import { Card, Definitions, PageHeader, StatusChip } from "@/ui";

export function PlatformSystemPage() {
  const t = useT("platform.system");
  const s = useT("apiStatus");
  const intl = useIntl();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch("/api/health", { schema: HealthResponseSchema, club: null }),
    retry: false,
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      <Card title={t("apiTitle")}>
        {health.isPending ? <StatusChip kind="neutral">{s("loading")}</StatusChip> : null}
        {health.isError ? <StatusChip kind="danger">{s("error")}</StatusChip> : null}
        {health.data ? (
          <Definitions
            items={[
              { term: s("api"), detail: <StatusChip kind="success">{s("ok")}</StatusChip> },
              {
                term: s("checkedAt"),
                detail: intl.formatDate(new Date(health.data.time), {
                  dateStyle: "medium",
                  timeStyle: "medium",
                }),
              },
              { term: s("functionRegion"), detail: health.data.region ?? s("unknown") },
              {
                term: s("dbRegion"),
                detail: health.data.db.ok ? (
                  (health.data.db.region ?? s("unknown"))
                ) : (
                  <StatusChip kind="danger">{s("dbDown")}</StatusChip>
                ),
              },
              ...(health.data.db.ok && health.data.db.latencyMs !== null
                ? [
                    {
                      term: s("dbLatency"),
                      detail: (
                        <span className="font-mono">
                          {s("ms", { value: health.data.db.latencyMs })}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
      </Card>
    </div>
  );
}

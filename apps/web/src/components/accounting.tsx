import {
  AccountingIssuesResponseSchema,
  AccountingRetryResponseSchema,
  AccountingStatusResponseSchema,
  AccountingSyncResponseSchema,
  type AccountingConnection,
  type FeeCharge,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useIntl } from "react-intl";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, Button, Card, EmptyState, Icon, Stat, StatusChip, useToast } from "@/ui";

/**
 * Contabilidad conectada (ADR 0042): lo que comparten Cuotas y Ajustes. El estado de la conexión,
 * sus cifras, el botón de sincronizar (que encadena tandas hasta acabar) y las incidencias.
 */

export const accountingQueryKey = (slug: string) => ["org", slug, "accounting"] as const;

export function useAccountingStatus(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: accountingQueryKey(slug),
    queryFn: () => apiFetch("/api/org/accounting", { schema: AccountingStatusResponseSchema }),
    enabled,
    retry: false,
  });
}

/** Encadena tandas de envío hasta que no queda nada o algo para la tanda. */
export function useSyncNow() {
  const t = useT("accounting");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [progress, setProgress] = useState<{
    sent: number;
    remaining: number;
    waiting: number | null;
  } | null>(null);

  async function run() {
    const total = { documents: 0, payments: 0, failed: 0 };
    setProgress({ sent: 0, remaining: 0, waiting: null });
    try {
      // Cada tanda manda hasta veinte cosas. Si Holded pide esperar por su límite de peticiones,
      // se espera lo que diga y se sigue: así se envía todo un mes de cuotas sin vigilarlo.
      for (let round = 0; round < 40; round++) {
        const res = await apiFetch("/api/org/accounting/sync", {
          method: "POST",
          schema: AccountingSyncResponseSchema,
        });
        total.documents += res.created.documents;
        total.payments += res.created.payments;
        total.failed += res.failed;
        const sent = total.documents + total.payments;
        if (res.done) break;
        const wait = Math.min(res.retryAfterSeconds ?? 0, 90);
        setProgress({ sent, remaining: res.remaining, waiting: wait > 0 ? wait : null });
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        setProgress({ sent, remaining: res.remaining, waiting: null });
      }
      toast("success", t("syncDone", total));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setProgress(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: accountingQueryKey(slug) }),
        client.invalidateQueries({ queryKey: ["org", slug, "fees"] }),
      ]);
    }
  }

  return { run, busy: progress !== null, progress };
}

export function SyncButton({ disabled = false }: { disabled?: boolean }) {
  const t = useT("accounting");
  const { run, busy, progress } = useSyncNow();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <Button action="send" loading={busy} disabled={disabled} onClick={() => void run()}>
        {t("sync")}
      </Button>
      {progress && (progress.sent > 0 || progress.waiting) ? (
        <span className="text-secondary text-muted" role="status">
          {progress.waiting
            ? t("syncWaiting", { seconds: progress.waiting, remaining: progress.remaining })
            : t("syncing", { sent: progress.sent, remaining: progress.remaining })}
        </span>
      ) : null}
    </span>
  );
}

export function AccountingStats({ connection }: { connection: AccountingConnection }) {
  const t = useT("accounting.stats");
  const { counts } = connection;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        icon={<Icon.Receipt weight="duotone" />}
        value={counts.documents}
        label={t("documents")}
      />
      <Stat icon={<Icon.Coins weight="duotone" />} value={counts.payments} label={t("payments")} />
      <Stat icon={<Icon.Clock weight="duotone" />} value={counts.pending} label={t("pending")} />
      <Stat icon={<Icon.Warning weight="duotone" />} value={counts.failed} label={t("failed")} />
    </div>
  );
}

/** Cuándo fue la última tanda y si se paró. */
export function LastSync({ connection }: { connection: AccountingConnection }) {
  const t = useT("accounting");
  const intl = useIntl();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-secondary text-muted">
        {connection.lastSyncAt
          ? t("lastSync", {
              date: intl.formatDate(new Date(connection.lastSyncAt), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })
          : t("neverSynced")}
      </p>
      {connection.lastError ? (
        <Alert kind="warning">{t("lastError", { error: connection.lastError })}</Alert>
      ) : null}
    </div>
  );
}

export function ConnectionStateChip({ connection }: { connection: AccountingConnection }) {
  const t = useT("accounting");
  return connection.status === "active" ? (
    <StatusChip kind="success">{t("active")}</StatusChip>
  ) : (
    <StatusChip kind="warning">{t("paused")}</StatusChip>
  );
}

/** Lo que la herramienta ha rechazado, con su motivo, y el botón para volver a intentarlo. */
export function AccountingIssues({ canRetry }: { canRetry: boolean }) {
  const t = useT("accounting.issues");
  const entities = useT("accounting.entities");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const intl = useIntl();
  const { run, busy } = useSyncNow();
  const issues = useQuery({
    queryKey: [...accountingQueryKey(slug), "issues"],
    queryFn: () =>
      apiFetch("/api/org/accounting/issues", { schema: AccountingIssuesResponseSchema }),
  });
  const list = issues.data?.issues ?? [];

  async function retry() {
    try {
      await apiFetch("/api/org/accounting/retry", {
        method: "POST",
        schema: AccountingRetryResponseSchema,
      });
      await run();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      await client.invalidateQueries({ queryKey: accountingQueryKey(slug) });
    }
  }

  return (
    <Card
      title={t("title")}
      description={t("description")}
      actions={
        canRetry && list.length > 0 ? (
          <Button variant="secondary" action="restore" loading={busy} onClick={() => void retry()}>
            {t("retry")}
          </Button>
        ) : null
      }
    >
      {issues.isError ? <Alert kind="error">{errors(errorKey(issues.error))}</Alert> : null}
      {issues.data && list.length === 0 ? (
        <EmptyState icon={<Icon.CheckCircle weight="duotone" />} title={t("empty")} />
      ) : null}
      {list.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {list.map((issue) => (
            <li
              key={`${issue.entity}:${issue.localId}`}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
            >
              <span className="flex flex-wrap items-center gap-2">
                <StatusChip kind="danger">{entities(issue.entity)}</StatusChip>
                <span className="text-body font-medium text-ink">{issue.label}</span>
              </span>
              {issue.error ? <span className="text-secondary text-ink">{issue.error}</span> : null}
              <span className="text-label text-muted">
                {t("attempts", { count: issue.attempts })} ·{" "}
                {intl.formatDate(new Date(issue.updatedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/** Una línea bajo el estado del cargo: si su documento está ya en la herramienta y con qué número. */
export function ChargeAccountingLine({ accounting }: { accounting: FeeCharge["accounting"] }) {
  const t = useT("fees.charges.accounting");
  const providers = useT("accounting.providers");
  if (!accounting) return null;
  const provider = providers(accounting.provider);
  const text =
    accounting.status === "synced" && accounting.number
      ? t("syncedNumber", { provider, number: accounting.number })
      : t(accounting.status, { provider });
  return (
    <span className={`text-label ${accounting.status === "failed" ? "text-danger" : "text-muted"}`}>
      {text}
    </span>
  );
}

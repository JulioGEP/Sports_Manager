import {
  ACCOUNTING_DOCUMENT_TYPES,
  AccountingOptionsResponseSchema,
  AccountingStatusResponseSchema,
  MANUAL_PAYMENT_METHODS,
  type AccountingConnection,
  type AccountingDocumentType,
  type AccountingSettingsUpdate,
  type PaymentMethod,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import {
  AccountingIssues,
  AccountingStats,
  ConnectionStateChip,
  LastSync,
  SyncButton,
  accountingQueryKey,
  useAccountingStatus,
} from "@/components/accounting";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Definitions,
  Field,
  Input,
  Select,
  Sheet,
  useToast,
} from "@/ui";

/** Formas de pago que se pueden llevar a una cuenta de tesorería: las de a mano y Stripe. */
const TREASURY_METHODS: readonly PaymentMethod[] = [...MANUAL_PAYMENT_METHODS, "stripe"];

/**
 * Contabilidad (ADR 0042): conectar Holded con su clave de API, decidir cómo salen las cuotas
 * (factura o ticket, impuesto, serie, aprobación, desde cuándo) y en qué cuenta entra cada forma
 * de pago, sincronizar y ver lo que Holded ha rechazado. La clave entra una vez y no vuelve a salir.
 */
export function AccountingTab() {
  const c = useT("common");
  const errors = useT("errors");
  const { org } = useReadyClub();
  const status = useAccountingStatus();
  if (status.isPending) return <p className="text-body text-muted">{c("loading")}</p>;
  if (status.isError || !status.data)
    return <Alert kind="error">{errors(errorKey(status.error))}</Alert>;
  const { connection, platformReady } = status.data;
  const canManage = org.actor.permissions.includes("org.settings.write");
  const canSync = org.actor.permissions.includes("org.fees.write");
  if (!connection) return <ConnectCard platformReady={platformReady} canManage={canManage} />;
  return <Connected connection={connection} canManage={canManage} canSync={canSync} />;
}

function ConnectCard({ platformReady, canManage }: { platformReady: boolean; canManage: boolean }) {
  const t = useT("settings.accounting.connect");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/accounting/connect", {
        method: "POST",
        body: { provider: "holded", apiKey: apiKey.trim() },
        schema: AccountingStatusResponseSchema,
      });
      client.setQueryData(accountingQueryKey(slug), res);
      setApiKey("");
      toast("success", t("connected"));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 400) setError(t("invalid"));
      else if (err instanceof ApiClientError && err.status === 409) setError(t("unreachable"));
      else setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={(e) => void submit(e)}>
        <Card
          title={t("title")}
          description={t("description")}
          footer={
            canManage && platformReady ? (
              <Button
                action="link"
                type="submit"
                loading={busy}
                disabled={apiKey.trim().length < 16}
              >
                {t("submit")}
              </Button>
            ) : null
          }
        >
          <div className="flex flex-col gap-4">
            {!platformReady ? <Alert kind="warning">{t("platformMissing")}</Alert> : null}
            <Field label={t("apiKey")} hint={t("apiKeyHint")}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  disabled={!canManage || !platformReady}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              )}
            </Field>
            <p className="text-secondary text-muted">{t("fromToday")}</p>
            {error ? <Alert kind="error">{error}</Alert> : null}
          </div>
        </Card>
      </form>
      <Card title={t("howTo")}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-ink">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
      </Card>
    </div>
  );
}

function Connected({
  connection,
  canManage,
  canSync,
}: {
  connection: AccountingConnection;
  canManage: boolean;
  canSync: boolean;
}) {
  const t = useT("settings.accounting.status");
  const providers = useT("accounting.providers");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const intl = useIntl();
  const { slug } = useReadyClub();
  const [confirm, setConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [busy, setBusy] = useState(false);

  async function patch(body: AccountingSettingsUpdate, message: string) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/accounting", {
        method: "PATCH",
        body,
        schema: AccountingStatusResponseSchema,
      });
      client.setQueryData(accountingQueryKey(slug), res);
      toast("success", message);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setConfirm(false);
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/accounting", {
        method: "DELETE",
        schema: AccountingStatusResponseSchema,
      });
      client.setQueryData(accountingQueryKey(slug), res);
      await client.invalidateQueries({ queryKey: ["org", slug, "fees"] });
      toast("success", t("disconnected"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const active = connection.status === "active";
  return (
    <div className="flex flex-col gap-6">
      <Card
        title={providers(connection.provider)}
        actions={<ConnectionStateChip connection={connection} />}
        footer={
          <>
            {canManage ? (
              <>
                <Button variant="danger" action="unlink" onClick={() => setConfirm(true)}>
                  {t("disconnect")}
                </Button>
                <Button variant="secondary" action="edit" onClick={() => setRotating(true)}>
                  {t("rotate")}
                </Button>
                <Button
                  variant="secondary"
                  action={active ? "suspend" : "activate"}
                  loading={busy}
                  onClick={() =>
                    void patch(
                      { status: active ? "paused" : "active" },
                      active ? t("pausedDone") : t("resumedDone"),
                    )
                  }
                >
                  {active ? t("pause") : t("resume")}
                </Button>
              </>
            ) : null}
            {canSync && active ? <SyncButton /> : null}
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Definitions
            items={[
              { term: t("account"), detail: connection.accountName ?? "—" },
              {
                term: t("key"),
                detail: <span className="font-mono">{connection.apiKeyHint}</span>,
              },
              {
                term: t("connectedAt"),
                detail: intl.formatDate(new Date(connection.connectedAt), { dateStyle: "medium" }),
              },
            ]}
          />
          <AccountingStats connection={connection} />
          <LastSync connection={connection} />
        </div>
      </Card>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SettingsForm
          key={JSON.stringify([
            connection.documentType,
            connection.tax?.key,
            connection.numberingSeriesId,
            connection.approveDocuments,
            connection.syncFrom,
            connection.autoSync,
          ])}
          connection={connection}
          canManage={canManage}
        />
        <TreasuryForm
          key={JSON.stringify(connection.treasuryAccounts)}
          connection={connection}
          canManage={canManage}
        />
      </div>
      <AccountingIssues canRetry={canSync} />
      {rotating ? <RotateKeySheet onClose={() => setRotating(false)} /> : null}
      <ConfirmDialog
        open={confirm}
        title={t("confirmDisconnectTitle")}
        body={t("confirmDisconnectBody")}
        confirmLabel={t("disconnect")}
        confirmAction="unlink"
        cancelLabel={c("cancel")}
        onConfirm={() => void disconnect()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

function useAccountingOptions(documentType: AccountingDocumentType) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: [...accountingQueryKey(slug), "options", documentType],
    queryFn: () =>
      apiFetch(`/api/org/accounting/options?documentType=${documentType}`, {
        schema: AccountingOptionsResponseSchema,
      }),
    retry: false,
    staleTime: 60_000,
  });
}

function SettingsForm({
  connection,
  canManage,
}: {
  connection: AccountingConnection;
  canManage: boolean;
}) {
  const t = useT("settings.accounting.settings");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [documentType, setDocumentType] = useState(connection.documentType);
  const [taxKey, setTaxKey] = useState(connection.tax?.key ?? "");
  const [series, setSeries] = useState(connection.numberingSeriesId ?? "");
  const [approve, setApprove] = useState(connection.approveDocuments);
  const [syncFrom, setSyncFrom] = useState(connection.syncFrom);
  const [autoSync, setAutoSync] = useState(connection.autoSync);
  const [busy, setBusy] = useState(false);
  const options = useAccountingOptions(documentType);

  const body: AccountingSettingsUpdate = {
    ...(documentType !== connection.documentType ? { documentType } : {}),
    ...((taxKey || null) !== (connection.tax?.key ?? null) ? { taxKey: taxKey || null } : {}),
    ...((series || null) !== connection.numberingSeriesId
      ? { numberingSeriesId: series || null }
      : {}),
    ...(approve !== connection.approveDocuments ? { approveDocuments: approve } : {}),
    ...(syncFrom !== connection.syncFrom ? { syncFrom } : {}),
    ...(autoSync !== connection.autoSync ? { autoSync } : {}),
  };
  const dirty = Object.keys(body).length > 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/accounting", {
        method: "PATCH",
        body,
        schema: AccountingStatusResponseSchema,
      });
      client.setQueryData(accountingQueryKey(slug), res);
      await client.invalidateQueries({ queryKey: ["org", slug, "fees"] });
      toast("success", t("saved"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const taxes = options.data?.taxes ?? (connection.tax ? [connection.tax] : []);
  return (
    <form onSubmit={(e) => void save(e)}>
      <Card
        title={t("title")}
        description={t("description")}
        footer={
          canManage ? (
            <Button action="save" type="submit" loading={busy} disabled={!dirty}>
              {c("save")}
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {options.isError ? <Alert kind="warning">{t("optionsError")}</Alert> : null}
          <Field label={t("documentType")} hint={t("documentTypeHint")}>
            {(id) => (
              <Select
                id={id}
                value={documentType}
                disabled={!canManage}
                onChange={(e) => {
                  setDocumentType(e.target.value as AccountingDocumentType);
                  setSeries("");
                }}
              >
                {ACCOUNTING_DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`documentTypes.${type}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("tax")} hint={t("taxHint")}>
            {(id) => (
              <Select
                id={id}
                value={taxKey}
                disabled={!canManage}
                onChange={(e) => setTaxKey(e.target.value)}
              >
                <option value="">{t("noTax")}</option>
                {taxes.map((tax) => (
                  <option key={tax.key} value={tax.key}>
                    {tax.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("series")}>
            {(id) => (
              <Select
                id={id}
                value={series}
                disabled={!canManage}
                onChange={(e) => setSeries(e.target.value)}
              >
                <option value="">{t("defaultSeries")}</option>
                {(options.data?.numberingSeries ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.format ? `${s.name} · ${s.format}` : s.name}
                  </option>
                ))}
                {series && !options.data?.numberingSeries.some((s) => s.id === series) ? (
                  <option value={series}>{series}</option>
                ) : null}
              </Select>
            )}
          </Field>
          <Field label={t("syncFrom")} hint={t("syncFromHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={syncFrom}
                disabled={!canManage}
                onChange={(e) => setSyncFrom(e.target.value)}
              />
            )}
          </Field>
          <Check
            checked={approve}
            disabled={!canManage}
            onChange={setApprove}
            label={t("approve")}
            hint={t("approveHint")}
          />
          <Check
            checked={autoSync}
            disabled={!canManage}
            onChange={setAutoSync}
            label={t("autoSync")}
            hint={t("autoSyncHint")}
          />
        </div>
      </Card>
    </form>
  );
}

function Check({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-body text-ink">
      <input
        type="checkbox"
        className="mt-1 size-5 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        <span className="text-secondary text-muted">{hint}</span>
      </span>
    </label>
  );
}

function TreasuryForm({
  connection,
  canManage,
}: {
  connection: AccountingConnection;
  canManage: boolean;
}) {
  const t = useT("settings.accounting.treasury");
  const methods = useT("paymentMethods");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const options = useAccountingOptions(connection.documentType);
  const [map, setMap] = useState<Partial<Record<PaymentMethod, string>>>(
    connection.treasuryAccounts,
  );
  const [busy, setBusy] = useState(false);
  const dirty = TREASURY_METHODS.some(
    (m) => (map[m] ?? "") !== (connection.treasuryAccounts[m] ?? ""),
  );
  const accounts = options.data?.treasuryAccounts ?? [];

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/accounting", {
        method: "PATCH",
        body: {
          treasuryAccounts: Object.fromEntries(TREASURY_METHODS.map((m) => [m, map[m] || null])),
        },
        schema: AccountingStatusResponseSchema,
      });
      client.setQueryData(accountingQueryKey(slug), res);
      toast("success", t("saved"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)}>
      <Card
        title={t("title")}
        description={t("description")}
        footer={
          canManage ? (
            <Button action="save" type="submit" loading={busy} disabled={!dirty}>
              {c("save")}
            </Button>
          ) : null
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {TREASURY_METHODS.map((method) => (
            <Field key={method} label={methods(method)}>
              {(id) => (
                <Select
                  id={id}
                  value={map[method] ?? ""}
                  disabled={!canManage}
                  onChange={(e) => setMap({ ...map, [method]: e.target.value })}
                >
                  <option value="">{t("none")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  {map[method] && !accounts.some((a) => a.id === map[method]) ? (
                    <option value={map[method]}>{map[method]}</option>
                  ) : null}
                </Select>
              )}
            </Field>
          ))}
        </div>
      </Card>
    </form>
  );
}

function RotateKeySheet({ onClose }: { onClose: () => void }) {
  const t = useT("settings.accounting.rotate");
  const connect = useT("settings.accounting.connect");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/accounting/key", {
        method: "POST",
        body: { apiKey: apiKey.trim() },
        schema: AccountingStatusResponseSchema,
      });
      client.setQueryData(accountingQueryKey(slug), res);
      toast("success", t("saved"));
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 400) setError(connect("invalid"));
      else if (err instanceof ApiClientError && err.status === 409)
        setError(connect("unreachable"));
      else setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="save"
            type="submit"
            form="rotate-key-form"
            loading={busy}
            disabled={apiKey.trim().length < 16}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="rotate-key-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={connect("apiKey")} hint={connect("apiKeyHint")}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

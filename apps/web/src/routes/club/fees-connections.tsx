import { StripeOnboardingResponseSchema, type PaymentsSettings } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  ConnectionStateChip,
  LastSync,
  SyncButton,
  useAccountingStatus,
} from "@/components/accounting";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { orgQueries } from "@/lib/queries";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Definitions,
  Icon,
  StatusChip,
  useToast,
  type StatusKind,
} from "@/ui";

/**
 * Pasarela y contabilidad (ADR 0042), dentro de Cuotas: por qué el club tiene que conectar una
 * pasarela de pago como Stripe para cobrar en línea, en qué paso está, y su contabilidad (Holded)
 * con lo enviado y lo pendiente. Lo que se toca de verdad vive en Ajustes; aquí se explica y se
 * empieza.
 */
export function FeesConnections() {
  const { org, slug } = useReadyClub();
  const permissions = org.actor.permissions;
  const payments = useQuery({
    ...orgQueries.feesSettings(slug),
    enabled: permissions.includes("org.settings.read"),
    retry: false,
  });
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <GatewayCard
        settings={payments.data?.payments ?? null}
        canManage={permissions.includes("org.settings.write")}
      />
      <AccountingCard
        canManage={permissions.includes("org.settings.write")}
        canSync={permissions.includes("org.fees.write")}
      />
    </div>
  );
}

function Benefits({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((text) => (
        <li key={text} className="flex gap-3 text-body text-ink">
          <Icon.CheckCircle
            weight="duotone"
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-club-text"
          />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

type StepState = "done" | "pending" | "review";
const stepKind: Record<StepState, StatusKind> = {
  done: "success",
  pending: "neutral",
  review: "warning",
};

function Steps({ steps }: { steps: { label: ReactNode; state: StepState; hint?: ReactNode }[] }) {
  const t = useT("fees.connections.state");
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-label text-club-soft-text"
          >
            {i + 1}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-body text-ink">
              {step.label}
              <StatusChip kind={stepKind[step.state]}>{t(step.state)}</StatusChip>
            </span>
            {step.hint ? <span className="text-secondary text-muted">{step.hint}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function GatewayCard({
  settings,
  canManage,
}: {
  settings: PaymentsSettings | null;
  canManage: boolean;
}) {
  const t = useT("fees.connections.gateway");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [busy, setBusy] = useState(false);

  const status = settings?.stripeAccountStatus ?? null;
  const hasAccount = Boolean(settings?.stripeAccountId);
  const accountState: StepState =
    !hasAccount || status === "onboarding"
      ? "pending"
      : status === "restricted"
        ? "review"
        : "done";
  const live = settings?.provider === "stripe";

  async function connect() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/fees/settings/stripe/onboarding", {
        method: "POST",
        body: {},
        schema: StripeOnboardingResponseSchema,
      });
      window.location.assign(res.url);
    } catch (err) {
      toast("error", errors(errorKey(err)));
      setBusy(false);
    }
  }

  let action: ReactNode = null;
  if (settings && !live) {
    if (!settings.stripeConfigured) action = <Alert kind="info">{t("platformMissing")}</Alert>;
    else if (!canManage) action = <Alert kind="info">{t("noPermission")}</Alert>;
    else if (accountState !== "done")
      action = (
        <Button action="link" loading={busy} onClick={() => void connect()}>
          {hasAccount ? t("continue") : t("connect")}
        </Button>
      );
    else
      action = (
        <ButtonLink to={`${paths.settings}?tab=payments`} action="activate">
          {t("activate")}
        </ButtonLink>
      );
  } else if (settings && live) {
    action = (
      <div className="flex flex-col gap-3">
        <Alert kind="success">{t("live")}</Alert>
        {canManage ? (
          <span>
            <ButtonLink to={`${paths.settings}?tab=payments`} variant="secondary" action="edit">
              {t("manage")}
            </ButtonLink>
          </span>
        ) : null}
      </div>
    );
  } else if (!settings) {
    action = <Alert kind="info">{t("noPermission")}</Alert>;
  }

  return (
    <Card title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3" aria-label={t("why")}>
          <h3 className="text-body font-semibold text-ink">{t("why")}</h3>
          <Benefits
            items={[t("benefits.pay"), t("benefits.auto"), t("benefits.money"), t("benefits.cost")]}
          />
        </section>
        {settings ? (
          <section className="flex flex-col gap-3" aria-label={t("steps")}>
            <h3 className="text-body font-semibold text-ink">{t("steps")}</h3>
            <Steps
              steps={[
                {
                  label: t("step1"),
                  state: settings.stripeConfigured ? "done" : "pending",
                  ...(settings.stripeConfigured ? {} : { hint: t("step1Missing") }),
                },
                {
                  label: t("step2"),
                  state: accountState,
                  ...(accountState === "review" ? { hint: t("step2Review") } : {}),
                },
                { label: t("step3"), state: live ? "done" : "pending" },
              ]}
            />
          </section>
        ) : null}
        {action}
      </div>
    </Card>
  );
}

function AccountingCard({ canManage, canSync }: { canManage: boolean; canSync: boolean }) {
  const t = useT("fees.connections.accounting");
  const stats = useT("accounting.stats");
  const providers = useT("accounting.providers");
  const errors = useT("errors");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const status = useAccountingStatus();
  const connection = status.data?.connection ?? null;

  return (
    <Card
      title={t("title")}
      description={t("description")}
      actions={connection ? <ConnectionStateChip connection={connection} /> : null}
    >
      <div className="flex flex-col gap-5">
        <Benefits
          items={[
            t("benefits.documents"),
            t("benefits.payments"),
            t("benefits.cancel"),
            t("benefits.safe"),
          ]}
        />
        {status.isError ? <Alert kind="error">{errors(errorKey(status.error))}</Alert> : null}
        {connection ? (
          <div className="flex flex-col gap-4">
            <Definitions
              items={[
                {
                  term: t("connectedTo"),
                  detail: connection.accountName
                    ? `${providers(connection.provider)} · ${connection.accountName}`
                    : providers(connection.provider),
                },
                { term: stats("documents"), detail: connection.counts.documents },
                { term: stats("payments"), detail: connection.counts.payments },
                { term: stats("pending"), detail: connection.counts.pending },
                {
                  term: stats("failed"),
                  detail:
                    connection.counts.failed > 0 ? (
                      <StatusChip kind="danger">{connection.counts.failed}</StatusChip>
                    ) : (
                      0
                    ),
                },
              ]}
            />
            <LastSync connection={connection} />
            <div className="flex flex-wrap gap-3">
              {canSync && connection.status === "active" ? <SyncButton /> : null}
              {canManage ? (
                <ButtonLink
                  to={`${paths.settings}?tab=accounting`}
                  variant="secondary"
                  action="edit"
                >
                  {t("manage")}
                </ButtonLink>
              ) : null}
            </div>
          </div>
        ) : status.data ? (
          canManage ? (
            <span>
              <ButtonLink to={`${paths.settings}?tab=accounting`} action="link">
                {t("connect")}
              </ButtonLink>
            </span>
          ) : (
            <Alert kind="info">{t("noPermission")}</Alert>
          )
        ) : null}
      </div>
    </Card>
  );
}

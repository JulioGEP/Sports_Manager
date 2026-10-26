import { SubscribeResponseSchema, type Subscription } from "@sportsmanager/shared";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { PlanLine } from "@/components/fitness/athlete-ui";
import { ClassRow } from "@/components/fitness/class-row";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useMyBookings, useMyPlan } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  StatusChip,
  Tabs,
  useToast,
} from "@/ui";

/** Se puede domiciliar una tarifa activa, recurrente y que aún no cobra Stripe. */
function canDomicile(plan: Subscription) {
  return (
    plan.status === "active" &&
    plan.plan.period !== "once" &&
    !(plan.billing === "stripe" && plan.stripeStatus === "active")
  );
}

/**
 * La tarifa del atleta (ADR 0049): lo que tiene, lo que le queda y hasta cuándo. Si el box cobra
 * por Stripe, la domicilia (tarjeta o SEPA) y se olvida. Debajo, sus reservas: las próximas y lo
 * que ya hizo, con su estado.
 */
export function MyPlanPage() {
  const t = useT("fitness.athlete.plan");
  const periods = useT("feePeriods");
  const errors = useT("errors");
  const toast = useToast();
  const { day } = useDates();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [params] = useSearchParams();
  const plan = useMyPlan();
  const bookings = useMyBookings();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const returned = params.get("subscription");

  async function domicile(id: string) {
    setBusy(id);
    try {
      const session = await apiFetch(`/api/org/fees/subscriptions/${id}/checkout`, {
        method: "POST",
        body: { returnPath: "/my-plan" },
        schema: SubscribeResponseSchema,
      });
      window.location.assign(session.url);
    } catch (err) {
      toast("error", errors(errorKey(err)));
      setBusy(null);
    }
  }

  const list = tab === "upcoming" ? bookings.data?.upcoming : bookings.data?.history;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <ButtonLink action="open" to={paths.fees} variant="secondary">
            {t("payments")}
          </ButtonLink>
        }
      />

      {returned === "success" ? (
        <Alert kind="success" title={t("domiciledTitle")}>
          {t("domiciledBody")}
        </Alert>
      ) : returned === "cancel" ? (
        <Alert kind="info">{t("domicileCancelled")}</Alert>
      ) : null}

      {plan.isPending ? (
        <div className="h-32 animate-pulse rounded-card bg-raised" aria-busy="true" />
      ) : plan.isError ? (
        <Alert kind="error">{errors(errorKey(plan.error))}</Alert>
      ) : plan.data.plans.length === 0 ? (
        <EmptyState
          icon={<Icon.Ticket size={28} weight="duotone" aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyHint")}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {plan.data.plans.map((p) => (
            <Card
              key={p.id}
              title={p.plan.name}
              description={periods(p.plan.period)}
              actions={
                p.billing === "stripe" && p.stripeStatus === "active" ? (
                  <StatusChip kind="success">{t("domiciled")}</StatusChip>
                ) : null
              }
              footer={
                plan.data.canSubscribe && canDomicile(p) ? (
                  <Button action="pay" loading={busy === p.id} onClick={() => void domicile(p.id)}>
                    {t("domicile")}
                  </Button>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-3">
                <PlanLine plan={p} />
                {p.stripeStatus === "past_due" ? (
                  <Alert kind="warning">{t("pastDue")}</Alert>
                ) : null}
                {p.status === "paused" && p.pausedUntil ? (
                  <p className="text-secondary text-muted">
                    {t("paused", { date: day(p.pausedUntil) })}
                  </p>
                ) : null}
                {plan.data.canSubscribe && canDomicile(p) ? (
                  <p className="text-secondary text-muted">{t("domicileHint")}</p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="my-bookings">
        <h2 id="my-bookings" className="text-title2 text-ink">
          {t("bookings")}
        </h2>
        <Tabs
          label={t("bookings")}
          selected={tab}
          onChange={setTab}
          items={[
            { key: "upcoming", label: t("upcoming"), count: bookings.data?.upcoming.length },
            { key: "history", label: t("history"), count: bookings.data?.history.length },
          ]}
        />
        {bookings.isPending ? (
          <div className="h-32 animate-pulse rounded-card bg-raised" aria-busy="true" />
        ) : !list || list.length === 0 ? (
          <EmptyState
            icon={<Icon.CalendarBlank size={28} weight="duotone" aria-hidden="true" />}
            title={tab === "upcoming" ? t("noUpcoming") : t("noHistory")}
            action={
              tab === "upcoming" ? (
                <ButtonLink to={paths.classes} size="sm">
                  {t("book")}
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <Card padded={false}>
            <ul className="flex flex-col divide-y divide-line">
              {list.map((cls) => (
                <ClassRow key={cls.id} cls={cls} to={paths.classDetail(cls.id)} />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

import {
  FEE_PERIODS,
  FeePlanCreateSchema,
  FeePlanResponseSchema,
  FeePlanUpdateSchema,
  PLAN_ENTITLEMENTS,
  PlanChargesGeneratedSchema,
  PlanChargesGenerateSchema,
  SubscriptionCreateSchema,
  SubscriptionResponseSchema,
  formatAmount,
  parseMoney,
  type FeePeriod,
  type FeePlan,
  type PlanEntitlement,
  type Subscription,
  type SubscriptionStatus,
  type SubscriptionUpdate,
} from "@sportsmanager/shared";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { money } from "@/components/fees";
import {
  CheckField,
  useEntitlementLabel,
  useFeePlans,
  useInvalidateOwner,
} from "@/components/fitness/owner-ui";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import {
  todayInClub,
  useAthletes,
  useClassTypes,
  useClubTimezone,
  useSubscriptions,
} from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  DataList,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  StatusChip,
  Tabs,
  useToast,
  type RowAction,
  type StatusKind,
} from "@/ui";

type Tab = "plans" | "athletes" | "charges";

const SUBSCRIPTION_TONE: Record<SubscriptionStatus, StatusKind> = {
  active: "success",
  paused: "warning",
  cancelled: "neutral",
  expired: "neutral",
};

/**
 * Tarifas y bonos del box (ADR 0049): qué da cada plan (ilimitada, clases por semana o al mes, un
 * bono de sesiones con caducidad), quién tiene cuál y cómo va gastándola, y los cargos del mes de
 * las tarifas que se cobran a mano (las domiciliadas las cobra Stripe).
 */
export function PlansPage() {
  const t = useT("fitness.owner.plans");
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "athletes" || raw === "charges" ? raw : "plans";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs<Tab>
        label={t("tabsLabel")}
        selected={tab}
        onChange={(key) => setParams(key === "plans" ? {} : { tab: key }, { replace: true })}
        items={[
          { key: "plans", label: t("tabs.plans") },
          { key: "athletes", label: t("tabs.athletes") },
          { key: "charges", label: t("tabs.charges") },
        ]}
      />
      {tab === "plans" ? <PlansTab /> : tab === "athletes" ? <AthletesTab /> : <ChargesTab />}
    </div>
  );
}

function useCanWriteFees() {
  const { org } = useReadyClub();
  return org.actor.permissions.includes("org.fees.write");
}

function PlansTab() {
  const t = useT("fitness.owner.plans");
  const periods = useT("feePeriods");
  const errors = useT("errors");
  const toast = useToast();
  const canWrite = useCanWriteFees();
  const entitlement = useEntitlementLabel();
  const plans = useFeePlans();
  const invalidate = useInvalidateOwner();
  const [editing, setEditing] = useState<FeePlan | null>(null);
  const [creating, setCreating] = useState(false);

  async function setStatus(plan: FeePlan, status: "active" | "archived") {
    try {
      await apiFetch(`/api/org/fees/plans/${plan.id}`, {
        method: "PATCH",
        body: { status },
        schema: FeePlanResponseSchema,
      });
      toast("success", t(status === "archived" ? "archived" : "restored", { name: plan.name }));
      void invalidate();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <div className="flex justify-end">
          <Button action="add" onClick={() => setCreating(true)}>
            {t("new")}
          </Button>
        </div>
      ) : null}
      {plans.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      <DataList<FeePlan>
        caption={t("caption")}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            cell: (p) => (
              <span className="flex flex-col">
                <span className="font-medium text-ink">{p.name}</span>
                {p.description ? (
                  <span className="text-label text-muted">{p.description}</span>
                ) : null}
              </span>
            ),
          },
          { key: "entitlement", header: t("table.entitlement"), cell: (p) => entitlement(p) },
          {
            key: "amount",
            header: t("table.amount"),
            align: "right",
            numeric: true,
            cell: (p) => `${money(p.amountCents)} · ${periods(p.period)}`,
          },
          {
            key: "athletes",
            header: t("table.athletes"),
            align: "right",
            numeric: true,
            cell: (p) => p.activeAthletes,
          },
          {
            key: "status",
            header: t("table.status"),
            cell: (p) => (
              <StatusChip kind={p.status === "active" ? "success" : "neutral"}>
                {t(`planStatus.${p.status}`)}
              </StatusChip>
            ),
          },
        ]}
        rows={plans.data?.plans ?? []}
        getKey={(p) => p.id}
        mobileRow={(p) => ({
          title: p.name,
          subtitle: `${entitlement(p)} · ${t("athletesShort", { count: p.activeAthletes })}`,
          trailing: (
            <span className="flex flex-col items-end">
              <span className="font-mono text-body text-ink">{money(p.amountCents)}</span>
              <span className="text-label text-muted">{periods(p.period)}</span>
            </span>
          ),
        })}
        rowActions={
          canWrite
            ? (p): RowAction[] => [
                { key: "edit", label: t("edit"), action: "edit", onClick: () => setEditing(p) },
                p.status === "active"
                  ? {
                      key: "archive",
                      label: t("archive"),
                      action: "archive",
                      tone: "danger",
                      onClick: () => void setStatus(p, "archived"),
                    }
                  : {
                      key: "restore",
                      label: t("restore"),
                      action: "restore",
                      onClick: () => void setStatus(p, "active"),
                    },
              ]
            : undefined
        }
        empty={
          <EmptyState
            icon={<Icon.Ticket weight="duotone" />}
            title={t("empty")}
            description={t("emptyHint")}
            action={
              canWrite ? (
                <Button action="add" onClick={() => setCreating(true)}>
                  {t("new")}
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canWrite && (creating || editing) ? (
        <PlanSheet
          plan={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

const NEEDS_SESSIONS: readonly PlanEntitlement[] = ["per_week", "per_month", "pack"];

function PlanSheet({ plan, onClose }: { plan: FeePlan | null; onClose: () => void }) {
  const t = useT("fitness.owner.plans");
  const periods = useT("feePeriods");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateOwner();
  const classTypes = useClassTypes();
  const [name, setName] = useState(plan?.name ?? "");
  const [amount, setAmount] = useState(plan ? formatAmount(plan.amountCents) : "");
  const [period, setPeriod] = useState<FeePeriod>(plan?.period ?? "monthly");
  const [kind, setKind] = useState<PlanEntitlement>(plan?.entitlement ?? "unlimited");
  const [sessions, setSessions] = useState(plan?.sessions ? String(plan.sessions) : "");
  const [validity, setValidity] = useState(plan?.validityDays ? String(plan.validityDays) : "");
  const [types, setTypes] = useState<string[]>(plan?.classTeamIds ?? []);
  const [sectionId, setSectionId] = useState(plan?.section?.id ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [plus, setPlus] = useState(plan?.includesPlus ?? false);
  const [programming, setProgramming] = useState(plan?.includesProgramming ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseKind(next: PlanEntitlement) {
    setKind(next);
    // Un bono se paga una vez; una tarifa con clases, cada mes. Solo como punto de partida.
    if (!plan && next === "pack") setPeriod("once");
    if (!plan && next !== "pack" && period === "once") setPeriod("monthly");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = parseMoney(amount) ?? Number.NaN;
    const body = {
      name,
      amountCents,
      period,
      sectionId: sectionId || null,
      description: description.trim() || null,
      entitlement: kind,
      sessions: NEEDS_SESSIONS.includes(kind) && sessions.trim() ? Number(sessions) : null,
      validityDays: kind === "pack" && validity.trim() ? Number(validity) : null,
      classTeamIds: kind === "none" || types.length === 0 ? null : types,
      includesPlus: plus,
      includesProgramming: programming,
    };
    if (NEEDS_SESSIONS.includes(kind) && !body.sessions) {
      setError(t("sheet.sessionsRequired"));
      return;
    }
    const parsed = plan ? FeePlanUpdateSchema.safeParse(body) : FeePlanCreateSchema.safeParse(body);
    if (!parsed.success || !Number.isFinite(amountCents)) {
      setError(t("sheet.invalid"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch(plan ? `/api/org/fees/plans/${plan.id}` : "/api/org/fees/plans", {
        method: plan ? "PATCH" : "POST",
        body: parsed.data,
        schema: FeePlanResponseSchema,
      });
      toast("success", plan ? t("sheet.saved") : t("sheet.created", { name }));
      void invalidate();
      onClose();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("close")}
      title={plan ? t("sheet.editTitle") : t("sheet.title")}
      description={t("sheet.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="fitness-plan-form"
            action={plan ? "save" : "add"}
            loading={busy}
          >
            {plan ? t("save") : t("sheet.submit")}
          </Button>
        </>
      }
    >
      <form id="fitness-plan-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("sheet.name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              placeholder={t("sheet.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("sheet.kind")} hint={t(`sheet.kindHint.${kind}`)}>
          {(id, describedBy) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={kind}
              onChange={(e) => chooseKind(e.target.value as PlanEntitlement)}
            >
              {PLAN_ENTITLEMENTS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {NEEDS_SESSIONS.includes(kind) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(`sheet.sessions.${kind}`)}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  required
                  value={sessions}
                  onChange={(e) => setSessions(e.target.value)}
                />
              )}
            </Field>
            {kind === "pack" ? (
              <Field label={t("sheet.validity")} hint={t("sheet.validityHint")}>
                {(id, describedBy) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={730}
                    value={validity}
                    onChange={(e) => setValidity(e.target.value)}
                  />
                )}
              </Field>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sheet.amount")} hint={t("sheet.amountHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("sheet.period")}>
            {(id) => (
              <Select
                id={id}
                value={period}
                onChange={(e) => setPeriod(e.target.value as FeePeriod)}
              >
                {FEE_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {periods(p)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {kind !== "none" && (classTypes.data?.classTypes ?? []).length > 0 ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-body font-medium text-ink">{t("sheet.classTypes")}</legend>
            <p className="text-secondary text-muted">{t("sheet.classTypesHint")}</p>
            {(classTypes.data?.classTypes ?? []).map((ct) => (
              <CheckField
                key={ct.teamId}
                label={ct.name}
                hint={ct.section.name}
                checked={types.includes(ct.teamId)}
                onChange={(v) =>
                  setTypes((all) => (v ? [...all, ct.teamId] : all.filter((x) => x !== ct.teamId)))
                }
              />
            ))}
          </fieldset>
        ) : null}
        <Field label={t("sheet.section")} hint={t("sheet.sectionHint")}>
          {(id, describedBy) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">{t("sheet.allSections")}</option>
              {(classTypes.data?.sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("sheet.descriptionField")}>
          {(id) => (
            <Input
              id={id}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <label className="flex items-start gap-3 rounded-control bg-raised p-3">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={plus}
            onChange={(e) => setPlus(e.target.checked)}
          />
          <span className="flex flex-col">
            <span className="font-medium text-ink">{t("sheet.plus")}</span>
            <span className="text-secondary text-muted">{t("sheet.plusHint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-control bg-raised p-3">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={programming}
            onChange={(e) => setProgramming(e.target.checked)}
          />
          <span className="flex flex-col">
            <span className="font-medium text-ink">{t("sheet.programming")}</span>
            <span className="text-secondary text-muted">{t("sheet.programmingHint")}</span>
          </span>
        </label>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

type SubFilter = "current" | "ended";

function AthletesTab() {
  const t = useT("fitness.owner.plans");
  const s = useT("fitness.common.subscriptionStatus");
  const usage = useT("fitness.common.usage");
  const errors = useT("errors");
  const toast = useToast();
  const { day } = useDates();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const canWrite = useCanWriteFees();
  const entitlement = useEntitlementLabel();
  const subs = useSubscriptions();
  const invalidate = useInvalidateOwner();
  const [filter, setFilter] = useState<SubFilter>("current");
  const [adding, setAdding] = useState(false);
  const [pausing, setPausing] = useState<Subscription | null>(null);
  const [cancelling, setCancelling] = useState<Subscription | null>(null);

  const rows = (subs.data?.plans ?? []).filter((p) =>
    filter === "current"
      ? p.status === "active" || p.status === "paused"
      : p.status === "cancelled" || p.status === "expired",
  );

  async function patch(sub: Subscription, body: SubscriptionUpdate, done: string) {
    try {
      await apiFetch(`/api/org/subscriptions/${sub.id}`, {
        method: "PATCH",
        body,
        schema: SubscriptionResponseSchema,
      });
      toast("success", done);
      void invalidate();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const usageText = (p: Subscription) =>
    p.usage.limit === null
      ? usage("unlimited")
      : usage("remaining", { remaining: p.usage.remaining ?? 0, limit: p.usage.limit });
  const statusChip = (p: Subscription) => (
    <span className="flex flex-col items-start gap-1">
      <StatusChip kind={SUBSCRIPTION_TONE[p.status]}>{s(p.status)}</StatusChip>
      {p.status === "paused" && p.pausedUntil ? (
        <span className="text-label text-muted">
          {t("pausedUntil", { date: day(p.pausedUntil) })}
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<SubFilter>
          label={t("filterLabel")}
          value={filter}
          onChange={setFilter}
          options={[
            { key: "current", label: t("filter.current") },
            { key: "ended", label: t("filter.ended") },
          ]}
        />
        {canWrite ? (
          <Button action="add" onClick={() => setAdding(true)}>
            {t("assign")}
          </Button>
        ) : null}
      </div>
      {subs.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      <DataList<Subscription>
        caption={t("subsCaption")}
        columns={[
          {
            key: "athlete",
            header: t("subs.athlete"),
            cell: (p) => <span className="font-medium text-ink">{p.player.name}</span>,
          },
          {
            key: "plan",
            header: t("subs.plan"),
            cell: (p) => (
              <span className="flex flex-col">
                <span className="text-ink">{p.plan.name}</span>
                <span className="text-label text-muted">{entitlement(p.plan)}</span>
              </span>
            ),
          },
          { key: "status", header: t("subs.status"), cell: statusChip },
          { key: "usage", header: t("subs.usage"), cell: usageText },
          {
            key: "expires",
            header: t("subs.expires"),
            cell: (p) => (p.expiresOn ? day(p.expiresOn) : "–"),
          },
          {
            key: "billing",
            header: t("subs.billing"),
            cell: (p) =>
              p.billing === "stripe" ? (
                <StatusChip kind={p.stripeStatus === "active" ? "success" : "warning"}>
                  {t(`stripe.${p.stripeStatus === "active" ? "active" : "issue"}`)}
                </StatusChip>
              ) : (
                <span className="text-muted">{t("manualBilling")}</span>
              ),
          },
        ]}
        rows={rows}
        getKey={(p) => p.id}
        href={(p) => paths.athleteFile(p.player.id)}
        mobileRow={(p) => ({
          title: p.player.name,
          subtitle: `${p.plan.name} · ${usageText(p)}`,
          trailing: <StatusChip kind={SUBSCRIPTION_TONE[p.status]}>{s(p.status)}</StatusChip>,
        })}
        rowActions={
          canWrite
            ? (p): RowAction[] => [
                ...(p.status === "active"
                  ? [
                      {
                        key: "pause",
                        label: t("pause"),
                        action: "suspend" as const,
                        onClick: () => setPausing(p),
                      },
                    ]
                  : []),
                ...(p.status === "paused"
                  ? [
                      {
                        key: "resume",
                        label: t("resume"),
                        action: "activate" as const,
                        onClick: () =>
                          void patch(p, { status: "active", pausedUntil: null }, t("resumed")),
                      },
                    ]
                  : []),
                ...(p.status === "active" || p.status === "paused"
                  ? [
                      {
                        key: "cancel",
                        label: t("cancelPlan"),
                        action: "deactivate" as const,
                        tone: "danger" as const,
                        onClick: () => setCancelling(p),
                      },
                    ]
                  : []),
              ]
            : undefined
        }
        empty={
          <EmptyState
            icon={<Icon.UsersThree weight="duotone" />}
            title={filter === "current" ? t("subsEmpty") : t("subsEmptyEnded")}
            description={filter === "current" ? t("subsEmptyHint") : undefined}
            action={
              canWrite && filter === "current" ? (
                <Button action="add" onClick={() => setAdding(true)}>
                  {t("assign")}
                </Button>
              ) : undefined
            }
          />
        }
      />
      {adding ? <AssignSheet onClose={() => setAdding(false)} /> : null}
      {pausing ? (
        <PauseSheet
          sub={pausing}
          onClose={() => setPausing(null)}
          onPause={(until) => {
            void patch(pausing, { status: "paused", pausedUntil: until }, t("paused"));
            setPausing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={cancelling !== null}
        title={t("cancelTitle", { name: cancelling?.player.name ?? "" })}
        body={t("cancelBody")}
        confirmLabel={t("cancelPlan")}
        confirmAction="deactivate"
        tone="danger"
        cancelLabel={t("cancel")}
        onConfirm={() => {
          if (cancelling) void patch(cancelling, { status: "cancelled" }, t("cancelled"));
          setCancelling(null);
        }}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

function AssignSheet({ onClose }: { onClose: () => void }) {
  const t = useT("fitness.owner.plans");
  const errors = useT("errors");
  const toast = useToast();
  const timezone = useClubTimezone();
  const athletes = useAthletes();
  const plans = useFeePlans();
  const entitlement = useEntitlementLabel();
  const invalidate = useInvalidateOwner();
  const [playerId, setPlayerId] = useState("");
  const [feePlanId, setFeePlanId] = useState("");
  const [startsOn, setStartsOn] = useState(todayInClub(timezone));
  const [chargeNow, setChargeNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = (plans.data?.plans ?? []).filter((p) => p.status === "active");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = SubscriptionCreateSchema.safeParse({ playerId, feePlanId, startsOn, chargeNow });
    if (!parsed.success) {
      setError(t("assignSheet.invalid"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/org/subscriptions", {
        method: "POST",
        body: parsed.data,
        schema: SubscriptionResponseSchema,
      });
      toast("success", t("assignSheet.done"));
      void invalidate();
      onClose();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("close")}
      title={t("assignSheet.title")}
      description={t("assignSheet.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="assign-plan-form" action="add" loading={busy}>
            {t("assignSheet.submit")}
          </Button>
        </>
      }
    >
      <form id="assign-plan-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("assignSheet.athlete")}>
          {(id) => (
            <Select id={id} required value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              <option value="">{t("assignSheet.pickAthlete")}</option>
              {(athletes.data?.athletes ?? []).map((a) => (
                <option key={a.playerId} value={a.playerId}>
                  {a.plan ? `${a.name} · ${a.plan.name}` : a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("assignSheet.plan")}>
          {(id) => (
            <Select
              id={id}
              required
              value={feePlanId}
              onChange={(e) => setFeePlanId(e.target.value)}
            >
              <option value="">{t("assignSheet.pickPlan")}</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.name} · ${entitlement(p)} · ${money(p.amountCents)}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("assignSheet.startsOn")}>
          {(id) => (
            <Input
              id={id}
              type="date"
              required
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          )}
        </Field>
        <CheckField
          label={t("assignSheet.chargeNow")}
          hint={t("assignSheet.chargeNowHint")}
          checked={chargeNow}
          onChange={setChargeNow}
        />
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function PauseSheet({
  sub,
  onClose,
  onPause,
}: {
  sub: Subscription;
  onClose: () => void;
  onPause: (until: string) => void;
}) {
  const t = useT("fitness.owner.plans");
  const timezone = useClubTimezone();
  const [until, setUntil] = useState("");
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("close")}
      title={t("pauseSheet.title", { name: sub.player.name })}
      description={t("pauseSheet.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="pause-plan-form" action="suspend" disabled={!until}>
            {t("pause")}
          </Button>
        </>
      }
    >
      <form
        id="pause-plan-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (until) onPause(until);
        }}
      >
        <Field label={t("pauseSheet.until")} hint={t("pauseSheet.untilHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="date"
              required
              min={todayInClub(timezone)}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

function ChargesTab() {
  const t = useT("fitness.owner.plans.charges");
  const errors = useT("errors");
  const toast = useToast();
  const timezone = useClubTimezone();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const canWrite = useCanWriteFees();
  const invalidate = useInvalidateOwner();
  const today = todayInClub(timezone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dueOn, setDueOn] = useState(`${today.slice(0, 7)}-05`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = PlanChargesGenerateSchema.safeParse({ month, dueOn });
    if (!parsed.success) {
      toast("error", t("invalid"));
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const out = await apiFetch("/api/org/subscriptions/charges", {
        method: "POST",
        body: parsed.data,
        schema: PlanChargesGeneratedSchema,
      });
      setResult(out);
      void invalidate();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={t("title")} description={t("description")}>
        <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("month")}>
              {(id) => (
                <Input
                  id={id}
                  type="month"
                  required
                  value={month}
                  disabled={!canWrite}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    if (e.target.value) setDueOn(`${e.target.value}-05`);
                  }}
                />
              )}
            </Field>
            <Field label={t("dueOn")} hint={t("dueOnHint")}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="date"
                  required
                  value={dueOn}
                  disabled={!canWrite}
                  onChange={(e) => setDueOn(e.target.value)}
                />
              )}
            </Field>
          </div>
          {result ? (
            <Alert
              kind="success"
              title={t("done", { created: result.created })}
              actions={
                <ButtonLink to={paths.fees} variant="secondary" size="sm" action="open">
                  {t("openPayments")}
                </ButtonLink>
              }
            >
              {t("skipped", { count: result.skipped })}
            </Alert>
          ) : null}
          {canWrite ? (
            <div className="flex justify-end">
              <Button type="submit" action="pay" loading={busy}>
                {t("submit")}
              </Button>
            </div>
          ) : (
            <Alert kind="info">{t("readOnly")}</Alert>
          )}
        </form>
      </Card>
      <Card title={t("howTitle")}>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-muted">
          <li>{t("how1")}</li>
          <li>{t("how2")}</li>
          <li>{t("how3")}</li>
        </ul>
      </Card>
    </div>
  );
}

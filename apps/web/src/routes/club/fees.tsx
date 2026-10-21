import {
  CheckoutSessionResponseSchema,
  FEE_CHARGE_STATUSES,
  FEE_PERIODS,
  FeeChargeGenerateSchema,
  FeeChargeResponseSchema,
  FeeChargesGeneratedResponseSchema,
  FeeChargesResponseSchema,
  FeePlanCreateSchema,
  FeePlanResponseSchema,
  FeePlansResponseSchema,
  MemberTypesResponseSchema,
  MyFeesResponseSchema,
  SectionsResponseSchema,
  centsToAmount,
  personDisplayName,
  type FeeCharge,
  type FeeChargeStatus,
  type FeePeriod,
  type FeePlan,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ChargeSheet, FeeStatusChip, PaymentSheet, money } from "@/components/fees";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataList,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  Stat,
  StatusChip,
  Tabs,
  useToast,
} from "@/ui";

/**
 * Cuotas (Bloque 18). Quien gestiona el club ve los cargos, los cobros y los planes; una familia
 * o un socio ve lo suyo y, si el club cobra por Stripe, paga desde aquí.
 */
export function FeesPage() {
  const { org } = useReadyClub();
  const canRead = org.actor.permissions.includes("org.fees.read");
  return canRead ? <FeesAdmin /> : <MyFees />;
}

type AdminTab = "charges" | "plans";

function FeesAdmin() {
  const t = useT("fees");
  const { org } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const canWrite = org.actor.permissions.includes("org.fees.write");
  const tab: AdminTab = params.get("tab") === "plans" ? "plans" : "charges";
  const [generating, setGenerating] = useState(false);
  const [newCharge, setNewCharge] = useState(false);
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug, "fees"] });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => setGenerating(true)}>
                {t("generate.action")}
              </Button>
              <Button action="add" onClick={() => setNewCharge(true)}>
                {t("newCharge")}
              </Button>
            </>
          ) : null
        }
      />
      <Tabs<AdminTab>
        label={t("title")}
        selected={tab}
        onChange={(key) => setParams(key === "charges" ? {} : { tab: key }, { replace: true })}
        items={[
          { key: "charges", label: t("tabs.charges") },
          { key: "plans", label: t("tabs.plans") },
        ]}
      />
      {tab === "charges" ? <ChargesTab canWrite={canWrite} /> : <PlansTab canWrite={canWrite} />}
      {canWrite ? (
        <>
          <GenerateSheet
            open={generating}
            onClose={() => setGenerating(false)}
            onSaved={() => void reload()}
          />
          <ChargeSheet
            key={newCharge ? "open" : "closed"}
            open={newCharge}
            person={null}
            onClose={() => setNewCharge(false)}
            onSaved={() => void reload()}
          />
        </>
      ) : null}
    </div>
  );
}

function ChargesTab({ canWrite }: { canWrite: boolean }) {
  const t = useT("fees.charges");
  const fs = useT("feeStatus");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { day } = useDates();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status");
  const status = (FEE_CHARGE_STATUSES as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as FeeChargeStatus)
    : null;
  const [search, setSearch] = useState("");
  const [paying, setPaying] = useState<FeeCharge | null>(null);
  const [cancelling, setCancelling] = useState<FeeCharge | null>(null);

  const charges = useQuery({
    queryKey: ["org", slug, "fees", "charges", status],
    queryFn: () =>
      apiFetch(`/api/org/fees/charges${status ? `?status=${status}` : ""}`, {
        schema: FeeChargesResponseSchema,
      }),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug, "fees"] });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = charges.data?.charges ?? [];
    if (!q) return list;
    return list.filter((ch) =>
      [personDisplayName(ch.person), ch.concept, ch.periodLabel ?? "", ch.plan?.name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [charges.data, search]);

  function setStatus(next: string) {
    const sp = new URLSearchParams(params);
    if (next) sp.set("status", next);
    else sp.delete("status");
    setParams(sp, { replace: true });
  }

  async function setChargeStatus(charge: FeeCharge, next: "pending" | "cancelled") {
    setCancelling(null);
    try {
      await apiFetch(`/api/org/fees/charges/${charge.id}`, {
        method: "PATCH",
        body: { status: next },
        schema: FeeChargeResponseSchema,
      });
      toast("success", t(next === "cancelled" ? "cancelled" : "reactivated"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const totals = charges.data?.totals;

  return (
    <div className="flex flex-col gap-5">
      {totals ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            icon={<Icon.Clock weight="duotone" />}
            value={money(totals.pendingCents)}
            label={t("stats.pending", { count: totals.pendingCount })}
          />
          <Stat
            icon={<Icon.Warning weight="duotone" />}
            value={money(totals.overdueCents)}
            label={t("stats.overdue", { count: totals.overdueCount })}
          />
          <Stat
            icon={<Icon.Coins weight="duotone" />}
            value={money(totals.paidCents)}
            label={t("stats.paid")}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t("search")}>
            {(id) => (
              <Input
                id={id}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
              />
            )}
          </Field>
        </div>
        <div className="sm:w-56">
          <Field label={t("status")}>
            {(id) => (
              <Select id={id} value={status ?? ""} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t("allStatuses")}</option>
                {FEE_CHARGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {fs(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
      {charges.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      <DataList<FeeCharge>
        caption={t("caption")}
        columns={[
          {
            key: "person",
            header: t("table.person"),
            cell: (ch) => (
              <span className="font-medium text-ink">{personDisplayName(ch.person)}</span>
            ),
          },
          {
            key: "concept",
            header: t("table.concept"),
            cell: (ch) => (
              <span className="flex flex-col">
                <span>{ch.concept}</span>
                <span className="text-label text-muted">
                  {[ch.periodLabel, ch.plan?.name].filter(Boolean).join(" · ")}
                </span>
              </span>
            ),
          },
          { key: "due", header: t("table.dueOn"), cell: (ch) => day(ch.dueOn) },
          {
            key: "amount",
            header: t("table.amount"),
            align: "right",
            numeric: true,
            cell: (ch) => (
              <span className="flex flex-col items-end">
                <span>{money(ch.amountCents)}</span>
                {ch.paidCents > 0 && ch.paidCents < ch.amountCents ? (
                  <span className="text-label text-muted">
                    {t("paidPart", { paid: money(ch.paidCents) })}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            key: "status",
            header: t("table.status"),
            cell: (ch) => <FeeStatusChip status={ch.status} />,
          },
        ]}
        rows={rows}
        getKey={(ch) => ch.id}
        mobileRow={(ch) => ({
          title: personDisplayName(ch.person),
          subtitle: `${ch.concept} · ${day(ch.dueOn)}`,
          trailing: (
            <span className="flex flex-col items-end gap-1">
              <span className="font-mono text-body text-ink">{money(ch.amountCents)}</span>
              <FeeStatusChip status={ch.status} />
            </span>
          ),
        })}
        actions={
          canWrite
            ? (ch) => (
                <span className="flex flex-wrap justify-end gap-2">
                  {ch.status === "pending" || ch.status === "overdue" ? (
                    <>
                      <Button action="pay" size="sm" onClick={() => setPaying(ch)}>
                        {t("recordPayment")}
                      </Button>
                      <Button
                        action="suspend"
                        size="sm"
                        variant="danger"
                        onClick={() => setCancelling(ch)}
                      >
                        {t("cancel")}
                      </Button>
                    </>
                  ) : null}
                  {ch.status === "cancelled" ? (
                    <Button
                      action="restore"
                      size="sm"
                      variant="secondary"
                      onClick={() => void setChargeStatus(ch, "pending")}
                    >
                      {t("reactivate")}
                    </Button>
                  ) : null}
                </span>
              )
            : undefined
        }
        empty={
          <EmptyState
            icon={<Icon.Coins weight="duotone" />}
            title={status || search ? t("emptyFiltered") : t("empty")}
            description={status || search ? undefined : t("emptyHint")}
          />
        }
      />
      {canWrite ? (
        <PaymentSheet
          charge={paying}
          onClose={() => setPaying(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={cancelling !== null}
        title={t("confirmCancelTitle")}
        body={t("confirmCancelBody", {
          name: cancelling ? personDisplayName(cancelling.person) : "",
          concept: cancelling?.concept ?? "",
        })}
        confirmLabel={t("cancel")}
        confirmAction="suspend"
        cancelLabel={c("cancel")}
        onConfirm={() => cancelling && void setChargeStatus(cancelling, "cancelled")}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

/** Genera el cargo de un periodo para todas las personas a las que aplica un plan. */
function GenerateSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("fees.generate");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [planId, setPlanId] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [dueOn, setDueOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plans = useQuery({
    queryKey: ["org", slug, "fees", "plans"],
    queryFn: () => apiFetch("/api/org/fees/plans", { schema: FeePlansResponseSchema }),
    enabled: open,
  });
  const active = (plans.data?.plans ?? []).filter((p) => p.status === "active");
  const chosen = active.find((p) => p.id === planId) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = FeeChargeGenerateSchema.safeParse({ feePlanId: planId, periodLabel, dueOn });
    if (!parsed.success) {
      setError(errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/org/fees/charges/generate", {
        method: "POST",
        body: parsed.data,
        schema: FeeChargesGeneratedResponseSchema,
      });
      toast("success", t("done", { created: res.created, skipped: res.skipped }));
      setPeriodLabel("");
      onClose();
      onSaved();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="generate-form" loading={busy} disabled={!chosen}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="generate-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field
          label={t("plan")}
          hint={
            chosen
              ? t("planHint", { count: chosen.appliesTo, amount: money(chosen.amountCents) })
              : undefined
          }
        >
          {(id) => (
            <Select id={id} required value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">{t("choosePlan")}</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.amountCents)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("periodLabel")} hint={t("periodLabelHint")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={60}
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder={t("periodLabelPlaceholder")}
              />
            )}
          </Field>
          <Field label={t("dueOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        {active.length === 0 && plans.data ? <Alert kind="info">{t("noPlans")}</Alert> : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function PlansTab({ canWrite }: { canWrite: boolean }) {
  const t = useT("fees.plans");
  const periods = useT("feePeriods");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [editing, setEditing] = useState<FeePlan | null>(null);
  const [creating, setCreating] = useState(false);
  const plans = useQuery({
    queryKey: ["org", slug, "fees", "plans"],
    queryFn: () => apiFetch("/api/org/fees/plans", { schema: FeePlansResponseSchema }),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug, "fees"] });

  async function setStatus(plan: FeePlan, status: "active" | "archived") {
    try {
      await apiFetch(`/api/org/fees/plans/${plan.id}`, {
        method: "PATCH",
        body: { status },
        schema: FeePlanResponseSchema,
      });
      toast("success", t(status === "archived" ? "archived" : "restored"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const target = (p: FeePlan) =>
    p.memberType
      ? t("targetType", { name: p.memberType.name })
      : p.section
        ? t("targetSection", { name: p.section.name })
        : t("targetAll");

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
          {
            key: "amount",
            header: t("table.amount"),
            align: "right",
            numeric: true,
            cell: (p) => `${money(p.amountCents)} · ${periods(p.period)}`,
          },
          { key: "target", header: t("table.target"), cell: (p) => target(p) },
          {
            key: "applies",
            header: t("table.appliesTo"),
            align: "right",
            numeric: true,
            cell: (p) => p.appliesTo,
          },
          {
            key: "status",
            header: t("table.status"),
            cell: (p) => (
              <StatusChip kind={p.status === "active" ? "success" : "neutral"}>
                {t(`status.${p.status}`)}
              </StatusChip>
            ),
          },
        ]}
        rows={plans.data?.plans ?? []}
        getKey={(p) => p.id}
        mobileRow={(p) => ({
          title: p.name,
          subtitle: `${target(p)} · ${t("appliesToShort", { count: p.appliesTo })}`,
          trailing: <span className="font-mono text-body text-ink">{money(p.amountCents)}</span>,
        })}
        actions={
          canWrite
            ? (p) => (
                <span className="flex flex-wrap justify-end gap-2">
                  <Button action="edit" size="sm" variant="secondary" onClick={() => setEditing(p)}>
                    {t("edit")}
                  </Button>
                  {p.status === "active" ? (
                    <Button
                      action="archive"
                      size="sm"
                      variant="danger"
                      onClick={() => void setStatus(p, "archived")}
                    >
                      {t("archive")}
                    </Button>
                  ) : (
                    <Button
                      action="restore"
                      size="sm"
                      variant="secondary"
                      onClick={() => void setStatus(p, "active")}
                    >
                      {t("restore")}
                    </Button>
                  )}
                </span>
              )
            : undefined
        }
        empty={
          <EmptyState
            icon={<Icon.ClipboardText weight="duotone" />}
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
          onSaved={() => void reload()}
        />
      ) : null}
    </div>
  );
}

type PlanTarget = "all" | `type:${string}` | `section:${string}`;

function PlanSheet({
  plan,
  onClose,
  onSaved,
}: {
  plan: FeePlan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("fees.planSheet");
  const c = useT("common");
  const periods = useT("feePeriods");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [name, setName] = useState(plan?.name ?? "");
  const [amount, setAmount] = useState(plan ? centsToAmount(plan.amountCents) : "");
  const [period, setPeriod] = useState<FeePeriod>(plan?.period ?? "monthly");
  const [target, setTarget] = useState<PlanTarget>(
    plan?.memberType
      ? `type:${plan.memberType.id}`
      : plan?.section
        ? `section:${plan.section.id}`
        : "all",
  );
  const [description, setDescription] = useState(plan?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberTypes = useQuery({
    queryKey: ["org", slug, "member-types"],
    queryFn: () => apiFetch("/api/org/member-types", { schema: MemberTypesResponseSchema }),
  });
  const sections = useQuery({
    queryKey: ["org", slug, "sections", "all"],
    queryFn: () => apiFetch("/api/org/sections", { schema: SectionsResponseSchema }),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
    const parsed = FeePlanCreateSchema.safeParse({
      name,
      amountCents,
      period,
      memberTypeId: target.startsWith("type:") ? target.slice(5) : null,
      sectionId: target.startsWith("section:") ? target.slice(8) : null,
      description: description.trim() || null,
    });
    if (!parsed.success) {
      setError(errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch(plan ? `/api/org/fees/plans/${plan.id}` : "/api/org/fees/plans", {
        method: plan ? "PATCH" : "POST",
        body: parsed.data,
        schema: FeePlanResponseSchema,
      });
      toast("success", t(plan ? "saved" : "created"));
      onClose();
      onSaved();
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
      closeLabel={c("close")}
      title={plan ? t("editTitle") : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action={plan ? "save" : "add"} type="submit" form="plan-form" loading={busy}>
            {plan ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="plan-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("amount")} hint={t("amountHint")}>
            {(id) => (
              <Input
                id={id}
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("period")}>
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
        <Field label={t("target")} hint={t("targetHint")}>
          {(id) => (
            <Select
              id={id}
              value={target}
              onChange={(e) => setTarget(e.target.value as PlanTarget)}
            >
              <option value="all">{t("targetAll")}</option>
              {(memberTypes.data?.memberTypes ?? []).filter((m) => m.status === "active").length >
              0 ? (
                <optgroup label={t("targetTypes")}>
                  {(memberTypes.data?.memberTypes ?? [])
                    .filter((m) => m.status === "active")
                    .map((m) => (
                      <option key={m.id} value={`type:${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                </optgroup>
              ) : null}
              {(sections.data?.sections ?? []).length > 0 ? (
                <optgroup label={t("targetSections")}>
                  {(sections.data?.sections ?? []).map((s) => (
                    <option key={s.id} value={`section:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
          )}
        </Field>
        <Field label={t("descriptionField")}>
          {(id) => (
            <Input
              id={id}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

/** Lo propio: cuotas de la familia o del socio, con el pago por Stripe si el club lo tiene. */
function MyFees() {
  const t = useT("fees.mine");
  const methods = useT("paymentMethods");
  const errors = useT("errors");
  const toast = useToast();
  const { day } = useDates();
  const { slug } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const checkout = params.get("checkout");
  const [paying, setPaying] = useState<string | null>(null);
  const mine = useQuery({
    queryKey: ["org", slug, "fees", "mine"],
    queryFn: () => apiFetch("/api/org/fees/mine", { schema: MyFeesResponseSchema }),
  });
  const charges = mine.data?.charges ?? [];
  const open = charges.filter((ch) => ch.status === "pending" || ch.status === "overdue");
  const owed = open.reduce((sum, ch) => sum + (ch.amountCents - ch.paidCents), 0);
  const overdue = charges.filter((ch) => ch.status === "overdue").length;

  async function pay(charge: FeeCharge) {
    setPaying(charge.id);
    try {
      const res = await apiFetch(`/api/org/fees/charges/${charge.id}/checkout`, {
        method: "POST",
        body: {},
        schema: CheckoutSessionResponseSchema,
      });
      window.location.assign(res.url);
    } catch (err) {
      toast("error", errors(errorKey(err)));
      setPaying(null);
    }
  }

  function dismissCheckout() {
    const sp = new URLSearchParams(params);
    sp.delete("checkout");
    setParams(sp, { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      {checkout === "success" ? (
        <Alert kind="success">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t("checkoutSuccess")}
            <Button size="sm" variant="tertiary" onClick={dismissCheckout}>
              {t("dismiss")}
            </Button>
          </span>
        </Alert>
      ) : null}
      {checkout === "cancel" ? (
        <Alert kind="info">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t("checkoutCancel")}
            <Button size="sm" variant="tertiary" onClick={dismissCheckout}>
              {t("dismiss")}
            </Button>
          </span>
        </Alert>
      ) : null}
      {mine.data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            icon={<Icon.Coins weight="duotone" />}
            value={money(owed)}
            label={t("owed", { count: open.length })}
          />
          <Stat icon={<Icon.Warning weight="duotone" />} value={overdue} label={t("overdue")} />
        </div>
      ) : null}
      {mine.data?.provider === "manual" && open.length > 0 ? (
        <Alert kind="info">{t("manualHint")}</Alert>
      ) : null}
      {mine.isError ? <Alert kind="error">{t("loadError")}</Alert> : null}
      {mine.data && charges.length === 0 ? (
        <EmptyState
          icon={<Icon.CheckCircle weight="duotone" />}
          title={t("empty")}
          description={t("emptyHint")}
        />
      ) : null}
      <ul className="flex flex-col gap-3">
        {charges.map((ch) => {
          const pending = ch.amountCents - ch.paidCents;
          const payable =
            mine.data?.provider === "stripe" &&
            (ch.status === "pending" || ch.status === "overdue");
          return (
            <li key={ch.id}>
              <Card padded={false}>
                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-semibold text-ink">{ch.concept}</span>
                      <FeeStatusChip status={ch.status} />
                    </span>
                    <span className="text-secondary text-muted">
                      {[
                        ch.periodLabel,
                        personDisplayName(ch.person),
                        t("dueOn", { date: day(ch.dueOn) }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {ch.payments.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-0.5 text-label text-muted">
                        {ch.payments.map((p) => (
                          <li key={p.id}>
                            {t("paymentLine", {
                              amount: money(p.amountCents),
                              method: methods(p.method),
                              date: day(p.paidOn),
                            })}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="font-mono text-title2 text-ink">
                      {money(ch.status === "paid" ? ch.amountCents : pending)}
                    </span>
                    {payable ? (
                      <Button action="pay" loading={paying === ch.id} onClick={() => void pay(ch)}>
                        {t("pay")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import {
  centsToAmount,
  FeeChargeResponseSchema,
  FeePlansResponseSchema,
  MANUAL_PAYMENT_METHODS,
  PeopleResponseSchema,
  personDisplayName,
  type FeeCharge,
  type FeeChargeStatus,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Sheet,
  StatusChip,
  useToast,
  type StatusKind,
} from "@/ui";

/** Piezas de cuotas compartidas por la pantalla de cuotas y la ficha de socio (Bloque 18). */

export const feeStatusKind: Record<FeeChargeStatus, StatusKind> = {
  pending: "info",
  paid: "success",
  overdue: "warning",
  cancelled: "neutral",
};

/** Importe en euros con el formato del idioma. */
export function money(cents: number): string {
  return `${centsToAmount(cents).replace(".", ",")} €`;
}

export function FeeStatusChip({ status }: { status: FeeChargeStatus }) {
  const fs = useT("feeStatus");
  return <StatusChip kind={feeStatusKind[status]}>{fs(status)}</StatusChip>;
}

/**
 * Registrar un pago a mano sobre un cargo pendiente o vencido. `path` cambia adónde se apunta: un
 * pedido de la tienda se cobra por su propia ruta (ADR 0041), con el permiso de la tienda.
 */
export function PaymentSheet({
  charge,
  path,
  onClose,
  onSaved,
}: {
  charge: Pick<FeeCharge, "id" | "person" | "concept" | "amountCents" | "paidCents"> | null;
  path?: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("fees.payment");
  const c = useT("common");
  const methods = useT("paymentMethods");
  const errors = useT("errors");
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof MANUAL_PAYMENT_METHODS)[number]>("transfer");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingCents = charge ? charge.amountCents - charge.paidCents : 0;
  const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!charge) return;
    setError(null);
    setBusy(true);
    try {
      const body = {
        amountCents: Number.isFinite(amountCents) && amountCents > 0 ? amountCents : pendingCents,
        method,
        paidOn,
        note: note.trim() || null,
      };
      if (path) await apiFetch(path, { method: "POST", body });
      else
        await apiFetch(`/api/org/fees/charges/${charge.id}/payments`, {
          method: "POST",
          body,
          schema: FeeChargeResponseSchema,
        });
      toast("success", t("saved"));
      setAmount("");
      setNote("");
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
      open={charge !== null}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={
        charge
          ? t("description", {
              name: personDisplayName(charge.person),
              concept: charge.concept,
              pending: money(pendingCents),
            })
          : ""
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="pay" type="submit" form="payment-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="payment-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("amount")} hint={t("amountHint", { pending: money(pendingCents) })}>
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder={centsToAmount(pendingCents)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("method")}>
            {(id) => (
              <Select
                id={id}
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                {MANUAL_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {methods(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("paidOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("note")}>
            {(id) => (
              <Input
                id={id}
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

/** Un cargo suelto a una persona: con o sin plan. Si viene la persona, no se busca. */
export function ChargeSheet({
  open,
  person,
  onClose,
  onSaved,
}: {
  open: boolean;
  person: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("fees.charge");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState(person?.id ?? "");
  const [planId, setPlanId] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [dueOn, setDueOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodLabel, setPeriodLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plans = useQuery({
    queryKey: ["org", slug, "fees", "plans"],
    queryFn: () => apiFetch("/api/org/fees/plans", { schema: FeePlansResponseSchema }),
    enabled: open,
  });
  const people = useQuery({
    queryKey: ["org", slug, "people", query],
    queryFn: () =>
      apiFetch(`/api/org/people?q=${encodeURIComponent(query)}`, { schema: PeopleResponseSchema }),
    enabled: open && !person && query.trim().length >= 2,
  });

  function choosePlan(id: string) {
    setPlanId(id);
    const plan = plans.data?.plans.find((p) => p.id === id);
    if (plan) {
      if (!concept.trim()) setConcept(plan.name);
      setAmount(centsToAmount(plan.amountCents));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
    const target = person?.id ?? personId;
    if (!target || !Number.isFinite(amountCents) || amountCents <= 0) {
      setError(errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/org/fees/charges", {
        method: "POST",
        body: {
          personId: target,
          feePlanId: planId || null,
          concept,
          amountCents,
          dueOn,
          periodLabel: periodLabel.trim() || null,
        },
        schema: FeeChargeResponseSchema,
      });
      toast("success", t("saved"));
      setConcept("");
      setAmount("");
      setPeriodLabel("");
      setPlanId("");
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
      description={person ? t("descriptionFor", { name: person.name }) : t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="add" type="submit" form="charge-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="charge-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {!person ? (
          <Field label={t("person")} hint={t("personHint")}>
            {(id) => (
              <div className="flex flex-col gap-2">
                <Input
                  id={id}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPersonId("");
                  }}
                />
                {people.data && !personId ? (
                  <ul className="flex max-h-48 flex-col divide-y divide-line overflow-y-auto rounded-field border border-border">
                    {people.data.people.slice(0, 20).map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body hover:bg-raised"
                          onClick={() => {
                            setPersonId(p.id);
                            setQuery(personDisplayName(p));
                          }}
                        >
                          <span>{personDisplayName(p)}</span>
                          <span className="text-secondary text-muted">{p.email ?? ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </Field>
        ) : null}
        <Field label={t("plan")} hint={t("planHint")}>
          {(id) => (
            <Select id={id} value={planId} onChange={(e) => choosePlan(e.target.value)}>
              <option value="">{t("noPlan")}</option>
              {plans.data?.plans
                .filter((p) => p.status === "active")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.amountCents)}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label={t("concept")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={120}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("amount")}>
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
          <Field label={t("periodLabel")}>
            {(id) => (
              <Input
                id={id}
                maxLength={60}
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
              />
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

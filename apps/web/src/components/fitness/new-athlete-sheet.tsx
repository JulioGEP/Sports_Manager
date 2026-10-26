import {
  FeePlansResponseSchema,
  InvitationSentResponseSchema,
  PlayerCreateSchema,
  PlayerDetailResponseSchema,
  SubscriptionResponseSchema,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { money } from "@/components/fees";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClassTime, useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, Button, Field, Input, Select, Sheet, useToast } from "@/ui";

/**
 * Alta de un atleta en el box (ADR 0050): sus datos, la tarifa con la que empieza (y su primer
 * cargo) y, si se quiere, la invitación a la app para que reserve. En un club deportivo esto es la
 * ficha de deportista; en un box, un solo paso desde la lista de atletas.
 */
export function NewAthleteSheet({ onClose }: { onClose: () => void }) {
  const t = useT("fitness.owner.newAthlete");
  const c = useT("fitness.common");
  const errors = useT("errors");
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateFitness();
  const time = useClassTime();
  const { slug, org } = useReadyClub();
  const canFees = org.actor.permissions.includes("org.fees.write");
  const canInvite = org.actor.permissions.includes("org.players.write");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    birthDate: "",
    feePlanId: "",
    startsOn: time.today,
    chargeNow: true,
    invite: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plans = useQuery({
    queryKey: ["org", slug, "fees", "plans"],
    queryFn: () => apiFetch("/api/org/fees/plans", { schema: FeePlansResponseSchema }),
    enabled: canFees,
  });
  const options = (plans.data?.plans ?? []).filter(
    (p) => p.status === "active" && p.entitlement !== "none",
  );
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = PlayerCreateSchema.safeParse({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      birthDate: form.birthDate || null,
      joinedOn: form.startsOn || time.today,
    });
    if (!parsed.success) {
      setError(t("invalid"));
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch("/api/org/players", {
        method: "POST",
        body: parsed.data,
        schema: PlayerDetailResponseSchema,
      });
      const id = created.player.id;
      const pending: string[] = [];
      if (form.feePlanId) {
        try {
          await apiFetch("/api/org/subscriptions", {
            method: "POST",
            body: {
              playerId: id,
              feePlanId: form.feePlanId,
              startsOn: form.startsOn || time.today,
              chargeNow: form.chargeNow,
            },
            schema: SubscriptionResponseSchema,
          });
        } catch {
          pending.push(t("pendingPlan"));
        }
      }
      if (form.invite && form.email.trim() && canInvite) {
        try {
          await apiFetch(`/api/org/players/${id}/athlete/invite`, {
            method: "POST",
            body: { email: form.email.trim() },
            schema: InvitationSentResponseSchema,
          });
        } catch {
          pending.push(t("pendingInvite"));
        }
      }
      await invalidate();
      const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
      if (pending.length > 0)
        toast("error", t("createdWithPending", { name, pending: pending.join(" ") }));
      else toast("success", t("created", { name }));
      onClose();
      void navigate(clubPaths(slug).athleteFile(id));
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
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="add" type="submit" form="new-athlete-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="new-athlete-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("firstName")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={60}
                autoComplete="off"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("lastName")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={80}
                autoComplete="off"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("email")} hint={t("emailHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                type="email"
                autoComplete="off"
                aria-describedby={describedBy}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("phone")}>
            {(id) => (
              <Input
                id={id}
                type="tel"
                autoComplete="off"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("birthDate")} hint={t("birthDateHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                type="date"
                aria-describedby={describedBy}
                value={form.birthDate}
                onChange={(e) => set("birthDate", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("startsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={form.startsOn}
                onChange={(e) => set("startsOn", e.target.value)}
              />
            )}
          </Field>
        </div>
        {canFees ? (
          <Field label={t("plan")} hint={t("planHint")}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.feePlanId}
                onChange={(e) => set("feePlanId", e.target.value)}
              >
                <option value="">{t("noPlan")}</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.amountCents)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {form.feePlanId ? (
          <label className="flex items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              className="size-5 accent-[var(--club-fill)]"
              checked={form.chargeNow}
              onChange={(e) => set("chargeNow", e.target.checked)}
            />
            {t("chargeNow")}
          </label>
        ) : null}
        {canInvite ? (
          <label className="flex items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              className="size-5 accent-[var(--club-fill)]"
              checked={form.invite && Boolean(form.email.trim())}
              disabled={!form.email.trim()}
              onChange={(e) => set("invite", e.target.checked)}
            />
            {t("invite")}
          </label>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

import {
  BookingResultSchema,
  CancelResultSchema,
  ClassDetailResponseSchema,
  formatSeconds,
  parseDuration,
  type ClassSummary,
  type Score,
  type ScoreType,
  type Subscription,
} from "@sportsmanager/shared";
import { useState } from "react";
import { money } from "@/components/fees";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { useInvalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { useDates } from "@/lib/dates";
import { Button, ConfirmDialog, Field, Input, StatusChip, useToast, type StatusKind } from "@/ui";

/**
 * Piezas comunes de las pantallas del atleta (ADR 0049): reservar y cancelar con su aviso, la
 * tarifa en una línea y los campos del marcador según el tipo de puntuación.
 */

export const SUBSCRIPTION_TONE: Record<Subscription["status"], StatusKind> = {
  active: "success",
  paused: "warning",
  cancelled: "neutral",
  expired: "neutral",
};

/** Reservar, apuntarse a la espera y cancelar: con su aviso y, si el box dice que no, el motivo. */
export function useBookingActions() {
  const a = useT("fitness.common.action");
  const blocks = useT("fitness.common.block");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const [busy, setBusy] = useState<string | null>(null);

  async function reasonOf(classId: string): Promise<string | null> {
    try {
      const fresh = await apiFetch(`/api/org/classes/${classId}`, {
        schema: ClassDetailResponseSchema,
      });
      return fresh.class.block ? blocks(fresh.class.block) : null;
    } catch {
      return null;
    }
  }

  async function book(cls: ClassSummary) {
    setBusy(cls.id);
    try {
      const result = await apiFetch(`/api/org/classes/${cls.id}/bookings`, {
        method: "POST",
        body: {},
        schema: BookingResultSchema,
      });
      toast(
        "success",
        result.booking.status === "waitlist"
          ? a("waitlisted", { position: result.booking.position ?? 1 })
          : a("booked"),
      );
    } catch (err) {
      const reason =
        err instanceof ApiClientError && err.status === 409 ? await reasonOf(cls.id) : null;
      toast("error", reason ?? errors(errorKey(err)));
    } finally {
      setBusy(null);
      await invalidate();
    }
  }

  async function cancel(cls: ClassSummary) {
    setBusy(cls.id);
    try {
      const result = await apiFetch(`/api/org/classes/${cls.id}/bookings/me`, {
        method: "DELETE",
        schema: CancelResultSchema,
      });
      toast("success", result.status === "late_cancel" ? a("lateCancelled") : a("cancelled"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
      await invalidate();
    }
  }

  return { book, cancel, busy };
}

/**
 * La acción de una clase para el atleta: reservar, la espera, cancelar o salir de la espera. Si
 * no se puede, el motivo en lugar del botón. Cancelar fuera de plazo pide confirmación.
 */
export function BookingButton({
  cls,
  actions,
  size = "sm",
}: {
  cls: ClassSummary;
  actions: ReturnType<typeof useBookingActions>;
  size?: "sm" | "md";
}) {
  const a = useT("fitness.common.action");
  const blocks = useT("fitness.common.block");
  const t = useT("fitness.athlete.booking");
  const c = useT("fitness.common");
  const [confirmLate, setConfirmLate] = useState(false);
  const started = Date.parse(cls.startsAt) <= Date.now();
  const loading = actions.busy === cls.id;
  const my = cls.my?.status ?? null;

  if (my === "booked") {
    if (started) return null;
    const late = Date.parse(cls.freeCancelUntil) <= Date.now();
    return (
      <>
        <Button
          variant="secondary"
          size={size}
          loading={loading}
          onClick={() => (late ? setConfirmLate(true) : void actions.cancel(cls))}
        >
          {a("cancel")}
        </Button>
        <ConfirmDialog
          open={confirmLate}
          title={t("lateTitle")}
          body={t("lateBody")}
          confirmLabel={a("cancel")}
          cancelLabel={c("close")}
          tone="danger"
          onConfirm={() => {
            setConfirmLate(false);
            void actions.cancel(cls);
          }}
          onCancel={() => setConfirmLate(false)}
        />
      </>
    );
  }
  if (my === "waitlist") {
    return (
      <Button
        variant="ghost"
        size={size}
        loading={loading}
        onClick={() => void actions.cancel(cls)}
      >
        {a("leaveWaitlist")}
      </Button>
    );
  }
  if (my === "attended" || my === "no_show" || my === "late_cancel") return null;
  if (cls.action === "book") {
    return (
      <Button size={size} loading={loading} onClick={() => void actions.book(cls)}>
        {a("book")}
      </Button>
    );
  }
  if (cls.action === "waitlist") {
    return (
      <Button
        variant="secondary"
        size={size}
        loading={loading}
        onClick={() => void actions.book(cls)}
      >
        {a("waitlist")}
      </Button>
    );
  }
  if (cls.block && cls.block !== "already_booked") {
    return <span className="text-secondary text-muted">{blocks(cls.block)}</span>;
  }
  return null;
}

/** La tarifa en dos líneas: nombre y estado; lo que da y lo que queda. */
export function PlanLine({ plan, compact = false }: { plan: Subscription; compact?: boolean }) {
  const ent = useT("fitness.common.entitlements");
  const usage = useT("fitness.common.usage");
  const status = useT("fitness.common.subscriptionStatus");
  const { day } = useDates();
  const what =
    plan.plan.entitlement === "unlimited" || plan.plan.entitlement === "none"
      ? ent(plan.plan.entitlement)
      : ent(plan.plan.entitlement, { count: plan.plan.sessions ?? 0 });
  const left =
    plan.usage.limit === null
      ? usage("unlimited")
      : usage("remaining", { remaining: plan.usage.remaining ?? 0, limit: plan.usage.limit });
  const pct =
    plan.usage.limit && plan.usage.limit > 0
      ? Math.min(100, Math.round((plan.usage.used / plan.usage.limit) * 100))
      : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{plan.plan.name}</span>
        <StatusChip kind={SUBSCRIPTION_TONE[plan.status]}>{status(plan.status)}</StatusChip>
        {compact ? null : (
          <span className="text-secondary text-muted">
            {what} · {money(plan.plan.amountCents)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-secondary text-ink">{left}</span>
        {pct !== null ? (
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={left}
            className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-raised"
          >
            <span className="block h-full rounded-full bg-club" style={{ width: `${pct}%` }} />
          </span>
        ) : null}
        {plan.expiresOn ? (
          <span className="text-secondary text-muted">
            {usage("until", { date: day(plan.expiresOn) })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// --- Marcador ---

/** Lo que se escribe en los campos del marcador, como texto (los inputs mandan texto). */
export interface ScoreDraft {
  time: string;
  rounds: string;
  reps: string;
  loadKg: string;
  distanceM: string;
  calories: string;
  completed: boolean;
}

export const EMPTY_SCORE: ScoreDraft = {
  time: "",
  rounds: "",
  reps: "",
  loadKg: "",
  distanceM: "",
  calories: "",
  completed: true,
};

export function draftOf(score: Score | null | undefined, completed = true): ScoreDraft {
  if (!score) return EMPTY_SCORE;
  const text = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    time: score.timeSeconds ? formatSeconds(score.timeSeconds) : "",
    rounds: text(score.rounds),
    reps: text(score.reps),
    loadKg: text(score.loadKg),
    distanceM: text(score.distanceM),
    calories: text(score.calories),
    completed,
  };
}

const int = (v: string) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const decimal = (v: string) => {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** El marcador que espera la API para un tipo de puntuación. */
export function scoreOf(type: ScoreType, d: ScoreDraft): Score {
  switch (type) {
    case "time":
      return d.completed
        ? { timeSeconds: parseDuration(d.time) }
        : { timeSeconds: null, reps: int(d.reps) };
    case "rounds_reps":
      return { rounds: int(d.rounds), reps: int(d.reps) ?? 0 };
    case "load":
      return { loadKg: decimal(d.loadKg) };
    case "reps":
      return { reps: int(d.reps) };
    case "distance":
      return { distanceM: int(d.distanceM) };
    case "calories":
      return { calories: int(d.calories) };
    default:
      return {};
  }
}

/** Los campos del marcador de un tipo de puntuación. */
export function ScoreFields({
  type,
  value,
  onChange,
  timeCap,
}: {
  type: ScoreType;
  value: ScoreDraft;
  onChange: (next: ScoreDraft) => void;
  /** Con time cap, el atleta dice si acabó dentro; si no, cuenta sus repeticiones. */
  timeCap?: boolean;
}) {
  const t = useT("fitness.athlete.score");
  const set = (patch: Partial<ScoreDraft>) => onChange({ ...value, ...patch });
  const number = (key: keyof ScoreDraft, label: string, step = "1") => (
    <Field label={label}>
      {(id, describedBy) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          inputMode={step === "1" ? "numeric" : "decimal"}
          type="number"
          min={0}
          step={step}
          value={value[key] as string}
          onChange={(e) => set({ [key]: e.target.value })}
        />
      )}
    </Field>
  );
  if (type === "none") return null;
  if (type === "time") {
    return (
      <div className="flex flex-col gap-4">
        {timeCap ? (
          <label className="flex min-h-12 items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              className="size-5 accent-[var(--club-fill)]"
              checked={value.completed}
              onChange={(e) => set({ completed: e.target.checked })}
            />
            {t("completedInCap")}
          </label>
        ) : null}
        {value.completed ? (
          <Field label={t("time")} hint={t("timeHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="numeric"
                placeholder="8:47"
                value={value.time}
                onChange={(e) => set({ time: e.target.value })}
              />
            )}
          </Field>
        ) : (
          number("reps", t("repsAtCap"))
        )}
      </div>
    );
  }
  if (type === "rounds_reps") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {number("rounds", t("rounds"))}
        {number("reps", t("extraReps"))}
      </div>
    );
  }
  if (type === "load") return number("loadKg", t("load"), "0.5");
  if (type === "reps") return number("reps", t("reps"));
  if (type === "distance") return number("distanceM", t("distance"));
  return number("calories", t("calories"));
}

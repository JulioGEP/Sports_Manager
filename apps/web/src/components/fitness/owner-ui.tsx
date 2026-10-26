import {
  BookingPolicySchema,
  FeePlansResponseSchema,
  type FeePlan,
  type PlanEntitlement,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { apiFetch } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { fitnessKey, invalidateFitness } from "@/lib/fitness";
import { useT } from "@/lib/intl";

/**
 * Piezas de las pantallas del dueño de un box (ADR 0049): los planes de cuota con su derecho de
 * uso, la política de reservas, las barras de las métricas y los días de la semana.
 */

/** Los planes de cuota del club: la misma consulta (y caché) que la página de cobros. */
export function useFeePlans(enabled = true) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: ["org", slug, "fees", "plans"],
    queryFn: () => apiFetch("/api/org/fees/plans", { schema: FeePlansResponseSchema }),
    enabled,
  });
}

export function useBookingPolicy() {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "policy"),
    queryFn: () => apiFetch("/api/org/booking-policy", { schema: BookingPolicySchema }),
  });
}

/** Tras tocar tarifas: lo de fitness y lo de cobros, que comparten planes y cargos. */
export function useInvalidateOwner() {
  const client = useQueryClient();
  const { slug } = useReadyClub();
  return useCallback(
    () =>
      Promise.all([
        invalidateFitness(client, slug),
        client.invalidateQueries({ queryKey: ["org", slug, "fees"] }),
      ]),
    [client, slug],
  );
}

/** "Ilimitada", "3 clases por semana", "Bono de 10 sesiones · 90 días". */
export function useEntitlementLabel() {
  const e = useT("fitness.common.entitlements");
  const t = useT("fitness.owner.plans");
  return useCallback(
    (plan: Pick<FeePlan, "entitlement" | "sessions" | "validityDays">) => {
      const kind: PlanEntitlement = plan.entitlement;
      if (kind === "none" || kind === "unlimited") return e(kind);
      const base = e(kind, { count: plan.sessions ?? 0 });
      return kind === "pack" && plan.validityDays
        ? `${base} · ${t("validityShort", { days: plan.validityDays })}`
        : base;
    },
    [e, t],
  );
}

/** Nombre de un día de la semana del horario (1 lunes … 7 domingo). */
export function useWeekdayName() {
  const intl = useIntl();
  return useCallback(
    (weekday: number, style: "long" | "short" = "long") =>
      // El 1 de enero de 2024 fue lunes.
      intl.formatDate(new Date(Date.UTC(2024, 0, weekday)), { weekday: style, timeZone: "UTC" }),
    [intl],
  );
}

/** Porcentaje entero: 0,734 → "73 %". */
export function usePercent() {
  const intl = useIntl();
  return useCallback(
    (ratio: number) => intl.formatNumber(ratio, { style: "percent", maximumFractionDigits: 0 }),
    [intl],
  );
}

/** Barra horizontal con su cifra al lado (DESIGN.md 0.5); la cifra es el dato, la barra decora. */
export function MeterBar({ ratio, tone = "club" }: { ratio: number; tone?: "club" | "muted" }) {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return (
    <span aria-hidden="true" className="block h-2.5 w-full overflow-hidden rounded-full bg-raised">
      <span
        className={`block h-full rounded-full ${tone === "club" ? "bg-club" : "bg-muted/40"}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** Casilla con su explicación debajo, como en el resto de formularios de la web. */
export function CheckField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <label className="flex min-h-12 items-start gap-3 py-1 text-body text-ink">
      <input
        type="checkbox"
        className="mt-1 size-5 shrink-0 accent-[var(--club-fill)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col">
        <span>{label}</span>
        {hint ? <span className="text-secondary text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

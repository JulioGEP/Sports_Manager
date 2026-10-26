import type { FitnessAthleteRow } from "@sportsmanager/shared";
import { useMemo, useState, type ReactNode } from "react";
import { ApiClientError, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useAthletes } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Avatar, Input, StatusChip } from "@/ui";

/** Si quien mira tiene un permiso del club. */
export function useHas() {
  const { org } = useReadyClub();
  const permissions = org.actor.permissions as readonly string[];
  return (permission: string) => permissions.includes(permission);
}

/**
 * Texto de un error de las pantallas del coach: un conflicto (la clase o el WOD han cambiado
 * entretanto) se explica con el texto de la pantalla; el resto, con el diccionario de errores.
 */
export function useStaffError() {
  const errors = useT("errors");
  const t = useT("fitness.staff");
  return (err: unknown, conflict?: string) =>
    err instanceof ApiClientError && err.status === 409
      ? (conflict ?? t("errors.conflict"))
      : errors(errorKey(err));
}

/** Restricción del cuerpo técnico (limitado, readaptación, baja), en su color. */
export function RestrictionChip({ status }: { status: "limited" | "rehab" | "out" }) {
  const t = useT("fitness.staff.restriction");
  return <StatusChip kind={status === "out" ? "danger" : "warning"}>{t(status)}</StatusChip>;
}

/** Normaliza para buscar sin tildes ni mayúsculas. */
export const searchable = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Buscador de atletas del box: escribe un nombre y elige. `action` pinta lo que se hace con cada
 * uno (reservar, check-in, escribir); `exclude` quita a quien ya está.
 */
export function AthletePicker({
  label,
  exclude = [],
  action,
}: {
  label: string;
  exclude?: string[];
  action: (athlete: FitnessAthleteRow) => ReactNode;
}) {
  const t = useT("fitness.staff.picker");
  const athletes = useAthletes();
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = searchable(query.trim());
    const skip = new Set(exclude);
    return (athletes.data?.athletes ?? [])
      .filter((a) => !skip.has(a.playerId))
      .filter((a) => !q || searchable(`${a.name} ${a.email ?? ""}`).includes(q))
      .slice(0, 20);
  }, [athletes.data, query, exclude]);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-secondary font-medium text-ink">{label}</span>
        <Input
          type="search"
          value={query}
          autoFocus
          placeholder={t("placeholder")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {athletes.isPending ? (
        <p className="text-secondary text-muted">{t("loading")}</p>
      ) : results.length === 0 ? (
        <p className="text-secondary text-muted">{t("none")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line" aria-label={label}>
          {results.map((a) => (
            <li key={a.playerId} className="flex min-h-14 items-center gap-3 py-2">
              <Avatar name={a.name} src={a.photoUrl} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-ink">{a.name}</span>
                <span className="truncate text-secondary text-muted">
                  {a.plan ? a.plan.name : t("noPlan")}
                </span>
              </span>
              {action(a)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Una cifra grande con su etiqueta, para las cabeceras de clase y de ficha. */
export function Figure({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="flex flex-col rounded-card bg-surface px-4 py-3 shadow-card precisa:border precisa:border-border">
      <span className="font-mono text-title2 text-ink">{value}</span>
      <span className="text-secondary text-muted">{label}</span>
    </div>
  );
}

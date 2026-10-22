import type { RosterEntry } from "@sportsmanager/shared";
import { Link } from "react-router";
import { useT } from "@/lib/intl";
import { Avatar, Button, StatusChip } from "@/ui";

/**
 * Tablero de plantilla (DESIGN.md 9.18): los jugadores como un entrenador los piensa, por posición y
 * con el dorsal a la vista, en vez de una tabla. Cada ficha se abre tocándola; editar y quitar son
 * iconos silenciosos que aparecen al pasar el ratón (en pantallas táctiles, siempre).
 */
export function RosterBoard({
  roster,
  positionsOrder,
  name,
  ageOf,
  href,
  statusLabel,
  canEdit,
  onEdit,
  onRemove,
}: {
  roster: RosterEntry[];
  /** Posiciones habituales del deporte, en su orden: portero, cierre, ala, pívot. */
  positionsOrder: string[];
  name: (p: RosterEntry) => string;
  ageOf: (p: RosterEntry) => string;
  href: (p: RosterEntry) => string;
  statusLabel: (status: RosterEntry["status"]) => string;
  canEdit: boolean;
  onEdit: (p: RosterEntry) => void;
  onRemove: (p: RosterEntry) => void;
}) {
  const t = useT("team");
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const order = positionsOrder.map(fold);
  const rank = (position: string | null) => {
    if (position === null) return Number.MAX_SAFE_INTEGER;
    const i = order.indexOf(fold(position));
    return i === -1 ? order.length : i;
  };
  const groups = new Map<string | null, RosterEntry[]>();
  for (const p of roster) {
    const key = p.position?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (a ?? "").localeCompare(b ?? "");
  });
  const byNumber = (a: RosterEntry, b: RosterEntry) =>
    (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999) || name(a).localeCompare(name(b));

  return (
    <div className="flex flex-col gap-5 px-5 pb-5" aria-label={t("roster")}>
      {ordered.map(([position, players]) => (
        <section key={position ?? "__none"} className="flex flex-col gap-2.5">
          <h3 className="flex items-baseline gap-2 text-label font-medium uppercase tracking-wide text-muted">
            {position ?? t("noPosition")}
            <span className="font-mono normal-case">{players.length}</span>
          </h3>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {[...players].sort(byNumber).map((p) => (
              <li
                key={p.playerId}
                className="group relative flex items-center gap-3 rounded-field border border-border bg-surface p-3 transition-colors hover:border-control hover:bg-page focus-within:border-control"
              >
                <span className="relative shrink-0">
                  <Avatar name={name(p)} size="lg" src={p.photoUrl} />
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -bottom-1 grid h-6 min-w-6 place-items-center rounded-full bg-club px-1.5 font-mono text-label font-semibold text-on-club ring-2 ring-surface"
                  >
                    {p.shirtNumber ?? "–"}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link
                    to={href(p)}
                    className="truncate text-body font-medium text-ink no-underline after:absolute after:inset-0 after:content-['']"
                  >
                    {name(p)}
                  </Link>
                  <span className="truncate text-secondary text-muted">
                    {ageOf(p)} · {t("familyCount", { count: p.guardiansCount })}
                  </span>
                  {p.status === "inactive" ? (
                    <span className="pt-1">
                      <StatusChip kind="neutral">{statusLabel(p.status)}</StatusChip>
                    </span>
                  ) : null}
                </span>
                {canEdit ? (
                  <span className="relative z-10 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                    <Button
                      iconOnly
                      action="edit"
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(p)}
                    >
                      {t("editEntry")}
                    </Button>
                    <Button
                      iconOnly
                      action="delete"
                      variant="ghost-danger"
                      size="sm"
                      onClick={() => onRemove(p)}
                    >
                      {t("remove")}
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

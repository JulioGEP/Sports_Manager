import type { MatchActionType } from "@sportsmanager/shared";
import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/lib/intl";
import { formatRating, signed } from "@/lib/matches";
import { Icon } from "@/ui";

/** Una fila de jugador, en un partido o acumulada en varios. */
export interface PlayerRow {
  id: string;
  name: string;
  shirtNumber: number | null;
  isGoalkeeper: boolean;
  timeMs: number;
  plusMinus: number;
  scoreFor: number;
  scoreAgainst: number;
  actions: Record<string, number>;
  rating: number;
  matches?: number | undefined;
  starts?: number | undefined;
}

type SortKey = string;

/**
 * Tabla de jugadores ordenable con columnas elegibles: las fijas (minutos, +/-, valoración) y
 * una por cada acción del catálogo que se marque. Cifras en Geist Mono, a la derecha.
 */
export function PlayersTable({
  rows,
  actionTypes,
  defaultCodes,
  caption,
  keepers = false,
  aggregate = false,
  onColumnsChange,
}: {
  rows: PlayerRow[];
  actionTypes: MatchActionType[];
  /** Acciones visibles al empezar. */
  defaultCodes: string[];
  caption: string;
  /** Tabla de porteros: paradas, goles encajados y porcentaje en vez del marcador en pista. */
  keepers?: boolean;
  /** Acumulado de varios partidos: añade partidos y titularidades. */
  aggregate?: boolean;
  onColumnsChange?: ((codes: string[]) => void) | undefined;
}) {
  const t = useT("matchStats.table");
  const [codes, setCodes] = useState<string[]>(defaultCodes);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: keepers ? "timeMs" : "rating",
    dir: "desc",
  });
  const candidates = useMemo(
    () =>
      actionTypes.filter(
        (a) =>
          a.scope === "player" &&
          (keepers || !a.keeperOnly) &&
          (a.status === "active" || rows.some((r) => r.actions[a.code])),
      ),
    [actionTypes, keepers, rows],
  );
  const keeperCodes = useMemo(
    () => actionTypes.filter((a) => a.keeperOnly).map((a) => a.code),
    [actionTypes],
  );
  const saves = (r: PlayerRow) => keeperCodes.reduce((a, code) => a + (r.actions[code] ?? 0), 0);
  const savePct = (r: PlayerRow) => {
    const faced = saves(r) + r.scoreAgainst;
    return faced === 0 ? null : Math.round((saves(r) / faced) * 100);
  };

  const valueOf = (r: PlayerRow, key: SortKey): number | string => {
    switch (key) {
      case "name":
        return r.name;
      case "number":
        return r.shirtNumber ?? 999;
      case "timeMs":
        return r.timeMs;
      case "plusMinus":
        return r.plusMinus;
      case "scoreFor":
        return r.scoreFor;
      case "scoreAgainst":
        return r.scoreAgainst;
      case "rating":
        return r.rating;
      case "matches":
        return r.matches ?? 0;
      case "starts":
        return r.starts ?? 0;
      case "saves":
        return saves(r);
      case "savePct":
        return savePct(r) ?? -1;
      default:
        return r.actions[key] ?? 0;
    }
  };
  const sorted = [...rows].sort((a, b) => {
    const va = valueOf(a, sort.key);
    const vb = valueOf(b, sort.key);
    const cmp =
      typeof va === "string" || typeof vb === "string"
        ? String(va).localeCompare(String(vb))
        : va - vb;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const toggle = (code: string) => {
    const next = codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
    setCodes(next);
    onColumnsChange?.(next);
  };
  const header = (key: SortKey, label: ReactNode, numeric = true) => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        className={`px-3 font-medium ${numeric ? "text-right" : "text-left"} first:pl-5 last:pr-5`}
      >
        <button
          type="button"
          onClick={() => setSort({ key, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
          aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
          className={`inline-flex min-h-9 items-center gap-1 ${active ? "text-club-text" : ""}`}
        >
          {label}
          {active ? (
            <Icon.CaretDown
              size={12}
              aria-hidden="true"
              className={sort.dir === "asc" ? "rotate-180" : ""}
            />
          ) : null}
        </button>
      </th>
    );
  };
  const visible = candidates.filter((a) => codes.includes(a.code));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 px-5" role="group" aria-label={t("columns")}>
        {candidates.map((a) => {
          const on = codes.includes(a.code);
          return (
            <button
              key={a.code}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(a.code)}
              className={`min-h-9 rounded-chip border px-3 text-secondary font-medium transition-colors ${
                on ? "border-ink bg-ink text-white" : "border-control bg-surface text-ink"
              }`}
            >
              {a.name}
            </button>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="h-11 border-b border-line text-label uppercase tracking-wide text-muted">
              {header("number", "#")}
              {header("name", t("player"), false)}
              {aggregate ? header("matches", t("matches")) : null}
              {aggregate ? header("starts", t("starts")) : null}
              {header("timeMs", t("minutes"))}
              {keepers ? header("saves", t("saves")) : header("scoreFor", t("scoreFor"))}
              {header("scoreAgainst", keepers ? t("conceded") : t("scoreAgainst"))}
              {keepers ? header("savePct", t("savePct")) : header("plusMinus", "+/-")}
              {visible.map((a) => header(a.code, a.name))}
              {header("rating", t("rating"))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="h-13 border-b border-line last:border-b-0 hover:bg-page">
                <td className="px-3 pl-5 text-right font-mono tabular text-muted">
                  {r.shirtNumber ?? "–"}
                </td>
                <td className="px-3 font-medium text-ink">{r.name}</td>
                {aggregate ? (
                  <td className="px-3 text-right font-mono tabular">{r.matches ?? 0}</td>
                ) : null}
                {aggregate ? (
                  <td className="px-3 text-right font-mono tabular">{r.starts ?? 0}</td>
                ) : null}
                <td className="px-3 text-right font-mono tabular">
                  {Math.round(r.timeMs / 60_000)}
                </td>
                <td className="px-3 text-right font-mono tabular">
                  {keepers ? saves(r) : r.scoreFor}
                </td>
                <td className="px-3 text-right font-mono tabular">{r.scoreAgainst}</td>
                <td className="px-3 text-right font-mono tabular">
                  {keepers ? (savePct(r) === null ? "–" : `${savePct(r)}%`) : signed(r.plusMinus)}
                </td>
                {visible.map((a) => (
                  <td key={a.code} className="px-3 text-right font-mono tabular">
                    {r.actions[a.code] ?? 0}
                  </td>
                ))}
                <td className="px-3 pr-5 text-right font-mono tabular font-semibold text-ink">
                  {formatRating(r.rating)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Botones de filtro con `aria-pressed` (DESIGN.md 9.6). */
export function FilterChips<K extends string>({
  items,
  selected,
  onChange,
  label,
}: {
  items: { key: K; label: string }[];
  selected: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.key === selected}
          onClick={() => onChange(item.key)}
          className={`min-h-11 rounded-chip border px-4 text-secondary font-medium transition-colors ${
            item.key === selected
              ? "border-ink bg-ink text-white"
              : "border-control bg-surface text-ink"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

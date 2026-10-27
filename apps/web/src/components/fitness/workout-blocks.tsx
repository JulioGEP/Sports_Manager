import {
  formatSeconds,
  levelCapacityOf,
  levelRank,
  lowestLevel,
  movementByCode,
  type AthleteLevel,
  type WorkoutBlockView,
  type WorkoutLevel,
  type WorkoutView,
} from "@sportsmanager/shared";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useKg } from "@/lib/fitness";
import { useLocale, useT } from "@/lib/intl";
import { useLevelName } from "@/lib/planning";
import { StatusChip } from "@/ui";
import { CAPACITY_COLOR, usePlanNames } from "./planning-ui";

/** Nombre del movimiento del catálogo en el idioma de quien mira. */
export function useMovementName() {
  const { locale } = useLocale();
  return (code: string | null | undefined) => {
    const m = movementByCode(code);
    return m ? m.name[locale] : (code ?? "");
  };
}

/**
 * Un bloque del WOD (ADR 0049): letra, tipo, título, la pizarra tal cual la escribió el coach,
 * los tres niveles y, para el atleta, su 1RM y los kilos del porcentaje. `footer` pone lo que se
 * hace con el bloque (apuntar el resultado, ver la clasificación).
 */
export function WorkoutBlockCard({
  block,
  footer,
  mine = null,
}: {
  block: WorkoutBlockView;
  footer?: ReactNode;
  /** La versión del atleta (ADR 0053): su nivel en la capacidad del bloque. */
  mine?: WorkoutLevel | null;
}) {
  const kinds = useT("fitness.common.blockKinds");
  const scores = useT("fitness.common.scoreTypes");
  const levelName = useLevelName();
  const c = useT("fitness.common");
  const p = useT("fitness.planning.block");
  const names = usePlanNames();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const kg = useKg();
  const movementName = useMovementName();
  const levelRows = (
    [
      ["foundations", block.foundations],
      ["scaled", block.scaled],
      ["rx", block.rx],
      ["rx_plus", block.rxPlus],
    ] as const
  ).filter(([, text]) => Boolean(text));
  // Si su nivel no tiene línea propia, la versión que le toca es la más cercana por debajo.
  const shown = new Set(levelRows.map(([l]) => l));
  const rows = levelRows.map(([l]) => l);
  const myRow =
    mine && rows.length > 0
      ? shown.has(mine)
        ? mine
        : ([...rows]
            .filter((l) => levelRank(l) <= levelRank(mine))
            .sort((a, b) => levelRank(b) - levelRank(a))[0] ??
          [...rows].sort((a, b) => levelRank(a) - levelRank(b))[0] ??
          null)
      : null;
  return (
    <article className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border">
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-club font-mono text-body font-semibold text-on-club"
        >
          {block.label}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-x-2 text-label uppercase tracking-wide text-muted">
            {block.capacity ? (
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: CAPACITY_COLOR[block.capacity] }}
              />
            ) : null}
            {kinds(block.kind)}
            {block.scoreType !== "none" ? ` · ${scores(block.scoreType)}` : ""}
            {block.timeCapSeconds ? ` · cap ${formatSeconds(block.timeCapSeconds)}` : ""}
            {block.plannedMinutes && !block.timeCapSeconds ? ` · ${block.plannedMinutes} min` : ""}
          </span>
          <h3 className="flex flex-wrap items-center gap-2 text-title3 text-ink">
            {block.title}
            {block.track === "plus" ? <StatusChip kind="club">{p("plus")}</StatusChip> : null}
          </h3>
          {block.capacity ? (
            <span className="sr-only">{names.capacity(block.capacity)}</span>
          ) : null}
        </span>
      </header>
      {block.description ? (
        <p className="whitespace-pre-line font-mono text-body text-ink">{block.description}</p>
      ) : null}
      {block.movement ? (
        <p className="flex flex-wrap items-center gap-2 text-secondary text-muted">
          <span>{movementName(block.movement.code)}</span>
          {block.percent ? <StatusChip kind="neutral">{`${block.percent} %`}</StatusChip> : null}
          {block.rmReps ? <StatusChip kind="club">{`${block.rmReps}RM`}</StatusChip> : null}
        </p>
      ) : null}
      {block.mine && (block.mine.loadKg !== null || block.mine.oneRmKg !== null) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-field bg-club-soft px-3 py-2 text-club-soft-text">
          {block.mine.loadKg !== null && block.percent ? (
            <span className="font-mono text-title3">{kg(block.mine.loadKg)}</span>
          ) : null}
          {block.mine.oneRmKg !== null ? (
            <span className="text-secondary">
              1RM {kg(block.mine.oneRmKg)}
              {block.mine.estimated ? " ~" : ""}
              {block.percent ? ` · ${c("percentOf", { percent: block.percent })}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
      {levelRows.length > 0 ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-secondary">
          {levelRows.map(([level, text]) => {
            const isMine = level === myRow;
            return (
              <div key={level} className="contents">
                <dt className={`font-semibold ${isMine ? "text-club-text" : "text-ink"}`}>
                  {levelName(level)}
                  {isMine ? (
                    <span className="ml-1.5 text-label font-medium">{p("yours")}</span>
                  ) : null}
                </dt>
                <dd className={isMine ? "font-medium text-ink" : "text-muted"}>{text}</dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      {block.exercises.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={p("exercises")}>
          {block.exercises.map((e) => (
            <li key={e.id}>
              <Link
                to={`${paths.exercises}?exercise=${e.id}`}
                className="inline-flex min-h-8 items-center rounded-chip border border-line px-2.5 text-label text-ink no-underline hover:bg-raised"
              >
                {e.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {footer ? <footer className="flex flex-wrap items-center gap-2">{footer}</footer> : null}
    </article>
  );
}

/** El WOD entero: título, notas y sus bloques en orden. */
/** El nivel del atleta para un bloque: el de su capacidad (el más prudente si toca varias). */
export function myLevelFor(
  block: Pick<WorkoutBlockView, "capacity">,
  levels: readonly AthleteLevel[] | undefined,
): WorkoutLevel | null {
  if (!levels || levels.length === 0) return null;
  const caps = levelCapacityOf(block.capacity);
  return lowestLevel(levels.filter((l) => caps.includes(l.capacity)).map((l) => l.level));
}

export function WorkoutBlocks({
  workout,
  blockFooter,
  levels,
}: {
  workout: WorkoutView;
  blockFooter?: (block: WorkoutBlockView) => ReactNode;
  /** Los niveles del atleta: marcan su versión en cada bloque. */
  levels?: AthleteLevel[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {workout.notes ? (
        <p className="whitespace-pre-line text-body text-muted">{workout.notes}</p>
      ) : null}
      {workout.blocks.map((block) => (
        <WorkoutBlockCard
          key={block.id}
          block={block}
          footer={blockFooter?.(block)}
          mine={myLevelFor(block, levels)}
        />
      ))}
    </div>
  );
}

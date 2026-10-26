import {
  formatSeconds,
  movementByCode,
  type WorkoutBlockView,
  type WorkoutView,
} from "@sportsmanager/shared";
import type { ReactNode } from "react";
import { useKg } from "@/lib/fitness";
import { useLocale, useT } from "@/lib/intl";
import { StatusChip } from "@/ui";

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
}: {
  block: WorkoutBlockView;
  footer?: ReactNode;
}) {
  const kinds = useT("fitness.common.blockKinds");
  const scores = useT("fitness.common.scoreTypes");
  const levels = useT("fitness.common.levels");
  const c = useT("fitness.common");
  const kg = useKg();
  const movementName = useMovementName();
  const levelRows = (
    [
      ["scaled", block.scaled],
      ["rx", block.rx],
      ["rx_plus", block.rxPlus],
    ] as const
  ).filter(([, text]) => Boolean(text));
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
          <span className="text-label uppercase tracking-wide text-muted">
            {kinds(block.kind)}
            {block.scoreType !== "none" ? ` · ${scores(block.scoreType)}` : ""}
            {block.timeCapSeconds ? ` · cap ${formatSeconds(block.timeCapSeconds)}` : ""}
          </span>
          <h3 className="text-title3 text-ink">{block.title}</h3>
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
          {levelRows.map(([level, text]) => (
            <div key={level} className="contents">
              <dt className="font-semibold text-ink">{levels(level)}</dt>
              <dd className="text-muted">{text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {footer ? <footer className="flex flex-wrap items-center gap-2">{footer}</footer> : null}
    </article>
  );
}

/** El WOD entero: título, notas y sus bloques en orden. */
export function WorkoutBlocks({
  workout,
  blockFooter,
}: {
  workout: WorkoutView;
  blockFooter?: (block: WorkoutBlockView) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {workout.notes ? (
        <p className="whitespace-pre-line text-body text-muted">{workout.notes}</p>
      ) : null}
      {workout.blocks.map((block) => (
        <WorkoutBlockCard key={block.id} block={block} footer={blockFooter?.(block)} />
      ))}
    </div>
  );
}

import type { MatchZone } from "@sportsmanager/shared";
import { MATCH_ZONES } from "@sportsmanager/shared";
import type { ReactNode } from "react";

/**
 * Gráficas de partido en SVG, sin librerías (DESIGN.md 10): marcas finas, una sola escala, el
 * equipo en el color del club y el rival en el gris de referencia, etiquetas directas y leyenda
 * con texto. Cada gráfica lleva un resumen en `aria-label` y las cifras van en Geist Mono.
 */

const OWN = "var(--club-fill)";
const OPPONENT = "var(--chart-reference)";
const GRID = "var(--chart-grid)";
const INK = "var(--text)";
const MUTED = "var(--text-muted)";

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-secondary text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-sm"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Comparativa por métrica: dos barras horizontales (equipo y rival) con la cifra al lado. */
export function ComparisonBars({
  rows,
  ownLabel,
  opponentLabel,
  summary,
}: {
  rows: { code: string; name: string; own: number; opponent: number }[];
  ownLabel: string;
  opponentLabel: string;
  summary: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.own, r.opponent]));
  const rowH = 44;
  const labelW = 150;
  const width = 520;
  const barW = width - labelW - 56;
  const height = rows.length * rowH + 8;
  return (
    <figure className="flex flex-col gap-3">
      <Legend
        items={[
          { label: ownLabel, color: OWN },
          { label: opponentLabel, color: OPPONENT },
        ]}
      />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={summary}
      >
        {rows.map((row, i) => {
          const y = i * rowH + 4;
          const ownW = (row.own / max) * barW;
          const oppW = (row.opponent / max) * barW;
          return (
            <g key={row.code}>
              <text x={0} y={y + 24} fontSize={13} fill={INK}>
                {row.name}
              </text>
              <rect x={labelW} y={y + 4} width={barW} height={14} fill={GRID} rx={4} />
              <rect
                x={labelW}
                y={y + 4}
                width={Math.max(ownW, row.own > 0 ? 4 : 0)}
                height={14}
                fill={OWN}
                rx={4}
              >
                <title>{`${row.name} · ${ownLabel}: ${row.own}`}</title>
              </rect>
              <text x={labelW + barW + 8} y={y + 16} fontSize={13} fill={INK} className="font-mono">
                {row.own}
              </text>
              <rect x={labelW} y={y + 22} width={barW} height={14} fill={GRID} rx={4} />
              <rect
                x={labelW}
                y={y + 22}
                width={Math.max(oppW, row.opponent > 0 ? 4 : 0)}
                height={14}
                fill={OPPONENT}
                rx={4}
              >
                <title>{`${row.name} · ${opponentLabel}: ${row.opponent}`}</title>
              </rect>
              <text
                x={labelW + barW + 8}
                y={y + 34}
                fontSize={13}
                fill={MUTED}
                className="font-mono"
              >
                {row.opponent}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Barras agrupadas por periodo (o por partido): dos series con la misma escala. */
export function GroupedBars({
  groups,
  aLabel,
  bLabel,
  summary,
  aColor = OWN,
  bColor = OPPONENT,
}: {
  groups: { key: string; label: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
  summary: string;
  aColor?: string;
  bColor?: string;
}) {
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  const width = Math.max(480, groups.length * 72 + 40);
  const height = 200;
  const plotH = 140;
  const top = 20;
  const groupW = (width - 40) / Math.max(1, groups.length);
  const barW = Math.min(24, groupW / 3);
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <figure className="flex flex-col gap-3">
      <Legend
        items={[
          { label: aLabel, color: aColor },
          { label: bLabel, color: bColor },
        ]}
      />
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto h-auto w-full max-w-2xl"
          style={{ minWidth: Math.min(width, 480) }}
          role="img"
          aria-label={summary}
        >
          {ticks.map((t) => {
            const y = top + plotH - (t / max) * plotH;
            return (
              <g key={t}>
                <line x1={32} x2={width} y1={y} y2={y} stroke={GRID} />
                <text
                  x={28}
                  y={y + 4}
                  fontSize={12}
                  fill={MUTED}
                  textAnchor="end"
                  className="font-mono"
                >
                  {t}
                </text>
              </g>
            );
          })}
          {groups.map((g, i) => {
            const x0 = 40 + i * groupW + groupW / 2;
            const aH = (g.a / max) * plotH;
            const bH = (g.b / max) * plotH;
            return (
              <g key={g.key}>
                <rect
                  x={x0 - barW - 1}
                  y={top + plotH - aH}
                  width={barW}
                  height={aH}
                  fill={aColor}
                  rx={4}
                >
                  <title>{`${g.label} · ${aLabel}: ${g.a}`}</title>
                </rect>
                <rect x={x0 + 1} y={top + plotH - bH} width={barW} height={bH} fill={bColor} rx={4}>
                  <title>{`${g.label} · ${bLabel}: ${g.b}`}</title>
                </rect>
                <text
                  x={x0 - barW / 2 - 1}
                  y={top + plotH - aH - 4}
                  fontSize={12}
                  fill={INK}
                  textAnchor="middle"
                  className="font-mono"
                >
                  {g.a}
                </text>
                <text
                  x={x0 + barW / 2 + 1}
                  y={top + plotH - bH - 4}
                  fontSize={12}
                  fill={MUTED}
                  textAnchor="middle"
                  className="font-mono"
                >
                  {g.b}
                </text>
                <text x={x0} y={height - 8} fontSize={12} fill={INK} textAnchor="middle">
                  {g.label.length > 12 ? `${g.label.slice(0, 11)}…` : g.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/**
 * Mapa de finalización: medio campo de ataque con nueve zonas, la portería arriba. Cada celda
 * dice cuántas acciones (y cuántos goles) salieron de ahí; el fondo se tiñe con la cantidad.
 */
export function ZoneGrid({
  cells,
  format,
  summary,
  emptyLabel,
}: {
  cells: Record<MatchZone, { shots: number; goals: number }>;
  /** Texto de la celda ("3 (1)"). */
  format: (shots: number, goals: number) => string;
  summary: string;
  emptyLabel: string;
}) {
  const max = Math.max(1, ...MATCH_ZONES.map((z) => cells[z].shots));
  const total = MATCH_ZONES.reduce((a, z) => a + cells[z].shots, 0);
  return (
    <figure className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={summary}
        className="relative mx-auto w-full max-w-sm overflow-hidden rounded-card border border-border bg-page"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-[36%] top-0 h-2 rounded-b bg-club"
          title={emptyLabel}
        />
        <div className="grid grid-cols-3 gap-1 p-3 pt-5">
          {MATCH_ZONES.map((zone) => {
            const cell = cells[zone];
            const alpha = cell.shots === 0 ? 0 : 0.15 + (cell.shots / max) * 0.6;
            return (
              <div
                key={zone}
                className="flex aspect-[4/3] flex-col items-center justify-center rounded-field border border-line font-mono text-body text-ink"
                style={{
                  background: `color-mix(in oklab, var(--club-fill) ${Math.round(alpha * 100)}%, var(--surface))`,
                  color: alpha > 0.5 ? "var(--club-on-fill)" : undefined,
                }}
                title={`${zone}: ${format(cell.shots, cell.goals)}`}
              >
                {cell.shots > 0 ? format(cell.shots, cell.goals) : "–"}
              </div>
            );
          })}
        </div>
      </div>
      {total === 0 ? <p className="text-center text-secondary text-muted">{emptyLabel}</p> : null}
    </figure>
  );
}

/** Dispersión: cada jugador es un punto en dos métricas elegidas. */
export function Scatter({
  points,
  xLabel,
  yLabel,
  summary,
}: {
  points: { id: string; label: string; x: number; y: number }[];
  xLabel: string;
  yLabel: string;
  summary: string;
}) {
  const width = 520;
  const height = 320;
  const left = 44;
  const bottom = 36;
  const plotW = width - left - 48;
  const plotH = height - bottom - 24;
  const maxX = Math.max(1, ...points.map((p) => p.x));
  const maxY = Math.max(1, ...points.map((p) => p.y));
  const minX = Math.min(0, ...points.map((p) => p.x));
  const minY = Math.min(0, ...points.map((p) => p.y));
  const sx = (v: number) => left + ((v - minX) / (maxX - minX || 1)) * plotW;
  const sy = (v: number) => 24 + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={summary}
      >
        <line x1={left} x2={width - 16} y1={sy(minY)} y2={sy(minY)} stroke={GRID} />
        <line x1={sx(minX)} x2={sx(minX)} y1={24} y2={24 + plotH} stroke={GRID} />
        {minX < 0 ? (
          <line x1={sx(0)} x2={sx(0)} y1={24} y2={24 + plotH} stroke={GRID} strokeDasharray="4 4" />
        ) : null}
        {minY < 0 ? (
          <line
            x1={left}
            x2={width - 16}
            y1={sy(0)}
            y2={sy(0)}
            stroke={GRID}
            strokeDasharray="4 4"
          />
        ) : null}
        <text x={width - 16} y={height - 8} fontSize={12} fill={MUTED} textAnchor="end">
          {xLabel}
        </text>
        <text x={left} y={12} fontSize={12} fill={MUTED} textAnchor="start">
          {yLabel}
        </text>
        <text
          x={left - 6}
          y={sy(minY) + 4}
          fontSize={12}
          fill={MUTED}
          textAnchor="end"
          className="font-mono"
        >
          {minY}
        </text>
        <text
          x={left - 6}
          y={sy(maxY) + 4}
          fontSize={12}
          fill={MUTED}
          textAnchor="end"
          className="font-mono"
        >
          {maxY}
        </text>
        <text
          x={sx(maxX)}
          y={sy(minY) + 16}
          fontSize={12}
          fill={MUTED}
          textAnchor="end"
          className="font-mono"
        >
          {maxX}
        </text>
        {points.map((p) => (
          <g key={p.id}>
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={6}
              fill={OWN}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              <title>{`${p.label}: ${xLabel} ${p.x} · ${yLabel} ${p.y}`}</title>
            </circle>
            <text
              x={sx(p.x) > width * 0.8 ? sx(p.x) - 9 : sx(p.x) + 9}
              y={sy(p.y) + 4}
              fontSize={12}
              fill={INK}
              textAnchor={sx(p.x) > width * 0.8 ? "end" : "start"}
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Tabla sencilla de cifras con cabecera fija y celdas en Geist Mono, con desplazamiento horizontal. */
export function Matrix({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: ReactNode[];
  rows: { key: string; label: ReactNode; cells: ReactNode[] }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="h-11 border-b border-line text-left text-label uppercase tracking-wide text-muted">
            <th scope="col" className="px-3 font-medium first:pl-5" />
            {columns.map((col, i) => (
              <th key={i} scope="col" className="px-3 text-right font-medium last:pr-5">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="h-12 border-b border-line last:border-b-0">
              <th scope="row" className="px-3 pl-5 text-left font-medium text-ink">
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td key={i} className="px-3 text-right font-mono tabular last:pr-5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

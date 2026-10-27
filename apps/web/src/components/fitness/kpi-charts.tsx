import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Gráficas de los cuadros de mando (ADR 0055, DESIGN.md 10 y 9.20), en SVG y sin librerías. Una
 * sola serie por gráfica, en el color del club; la escala, una; las marcas, finas. Se dibujan al
 * tamaño real de su hueco (nada se estira), con la cruceta y el aviso al pasar el puntero o con
 * las flechas del teclado, y cada una lleva su resumen y su tabla para el lector de pantalla.
 */

export interface ChartPoint {
  label: string;
  value: number | null;
}

interface ChartProps {
  points: ChartPoint[];
  /** La cifra de un punto, como se lee ("31 %", "1.234,56 €"). */
  format: (value: number) => string;
  /** La etiqueta corta del eje ("26 oct") y la larga del aviso ("semana del 26 de octubre"). */
  short: (label: string) => string;
  long: (label: string) => string;
  /** Una frase con lo que dice la gráfica, para quien no la ve. */
  summary: string;
  /** Sin ejes ni etiquetas: la tendencia de una cifra. */
  compact?: boolean;
}

const CLUB = "var(--club-fill)";
const GRID = "var(--chart-grid)";
const REFERENCE = "var(--chart-reference)";
const SURFACE = "var(--surface)";
const INK = "var(--text)";
const MUTED = "var(--text-muted)";

/** El tamaño de una caja, al día con su `ResizeObserver`. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, box] as const;
}

/** Un máximo redondo para el eje: 1, 2, 2,5, 5 o 10 por su potencia de diez. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= max) ?? 10;
  return step * power;
}

/**
 * El marco común: la caja que se mide, el foco con las flechas, el aviso, el anuncio para el
 * lector de pantalla y la tabla con todos los puntos.
 */
function ChartFrame({
  points,
  format,
  long,
  summary,
  active,
  setActive,
  compact,
  children,
}: Omit<ChartProps, "short"> & {
  active: number | null;
  setActive: (index: number | null) => void;
  /** Dibuja la gráfica a su tamaño y dice dónde cae cada punto (para el aviso). */
  children: (box: { width: number; height: number }) => { node: ReactNode; xs: number[] };
}) {
  const [ref, box] = useBox<HTMLDivElement>();
  const tableId = useId();
  const point = active !== null ? points[active] : undefined;
  const drawn = box.width > 0 && box.height > 0 ? children(box) : null;
  const text = (p: ChartPoint) => `${p.value === null ? "–" : format(p.value)} · ${long(p.label)}`;

  function onKey(e: KeyboardEvent) {
    if (points.length === 0) return;
    const last = points.length - 1;
    const now = active ?? last;
    const next =
      e.key === "ArrowLeft"
        ? Math.max(0, now - 1)
        : e.key === "ArrowRight"
          ? Math.min(last, now + 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  }

  return (
    <div
      ref={ref}
      tabIndex={compact ? -1 : 0}
      role="group"
      aria-roledescription="gráfica"
      aria-label={summary}
      aria-describedby={tableId}
      onKeyDown={compact ? undefined : onKey}
      onFocus={() => (compact ? null : setActive(active ?? points.length - 1))}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
      className="relative h-full min-h-16 w-full rounded-field outline-none focus-visible:ring-2 focus-visible:ring-club-text focus-visible:ring-offset-2"
    >
      {drawn?.node}
      {point && drawn && !compact ? (
        <div
          role="presentation"
          className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 flex-col rounded-field bg-surface px-2 py-1 text-label whitespace-nowrap shadow-float precisa:border precisa:border-border"
          style={{
            left: Math.min(Math.max(drawn.xs[active!] ?? 0, 48), Math.max(48, box.width - 48)),
          }}
        >
          <strong className="font-mono text-secondary text-ink">
            {point.value === null ? "–" : format(point.value)}
          </strong>
          <span className="text-muted">{long(point.label)}</span>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {point ? text(point) : ""}
      </span>
      <table id={tableId} className="sr-only">
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{long(p.label)}</th>
              <td>{p.value === null ? "–" : format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** El índice del punto más cercano a una x, repartidos a lo ancho. */
const nearest = (x: number, xs: number[]) =>
  xs.reduce((best, v, i) => (Math.abs(v - x) < Math.abs(xs[best]! - x) ? i : best), 0);

/**
 * Línea con su área: la evolución de una cifra. La cruceta busca la x y el aviso da cada punto;
 * el de ahora va marcado (su cifra ya está en la cabecera). En compacto, sin ejes: la tendencia
 * bajo una cifra.
 */
export function LineChart(props: ChartProps & { domain?: [number, number] }) {
  const { points, short, compact = false } = props;
  const [active, setActive] = useState<number | null>(null);
  const geometry = (width: number, height: number) => {
    const padX = compact ? 4 : 8;
    const top = compact ? 6 : 22;
    const bottom = compact ? 4 : 20;
    const values = points.map((p) => p.value).filter((v): v is number => v !== null);
    const lo = props.domain?.[0] ?? Math.min(0, ...values);
    const hi = props.domain?.[1] ?? niceMax(Math.max(0, ...values));
    const span = hi - lo || 1;
    const xs = points.map((_, i) =>
      points.length === 1 ? width / 2 : padX + (i * (width - padX * 2)) / (points.length - 1),
    );
    const y = (v: number) => top + (1 - (v - lo) / span) * (height - top - bottom);
    return { xs, y, base: y(Math.max(lo, 0)), top, bottom };
  };

  return (
    <ChartFrame {...props} active={active} setActive={setActive}>
      {({ width, height }) => {
        const { xs, y, base, bottom } = geometry(width, height);
        // Tramos sin huecos: un punto sin dato corta la línea.
        const runs: { x: number; y: number }[][] = [];
        points.forEach((p, i) => {
          if (p.value === null) return runs.push([]);
          if (runs.length === 0) runs.push([]);
          runs[runs.length - 1]!.push({ x: xs[i]!, y: y(p.value) });
        });
        const paths = runs.filter((r) => r.length > 0);
        const lastIndex = points.map((p) => p.value !== null).lastIndexOf(true);
        const last = lastIndex >= 0 ? points[lastIndex]! : null;
        const node = (
          <svg
            width={width}
            height={height}
            aria-hidden="true"
            onPointerMove={(e) => {
              if (compact) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setActive(nearest(e.clientX - rect.left, xs));
            }}
            className="block overflow-visible"
          >
            {!compact ? (
              <line x1={0} x2={width} y1={base} y2={base} stroke={GRID} strokeWidth={1} />
            ) : null}
            {paths.map((run, i) => (
              <g key={i}>
                <path
                  d={`M${run[0]!.x},${base} ${run.map((p) => `L${p.x},${p.y}`).join(" ")} L${run[run.length - 1]!.x},${base} Z`}
                  fill={CLUB}
                  opacity={0.1}
                />
                <path
                  d={run.map((p, j) => `${j === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={CLUB}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            ))}
            {active !== null && points[active]?.value != null ? (
              <g>
                <line
                  x1={xs[active]}
                  x2={xs[active]}
                  y1={0}
                  y2={height - bottom}
                  stroke={REFERENCE}
                  strokeWidth={1}
                />
                <circle
                  cx={xs[active]}
                  cy={y(points[active].value)}
                  r={4}
                  fill={CLUB}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              </g>
            ) : null}
            {/* El punto de ahora; su cifra ya va en la cabecera de la pieza. */}
            {last && last.value !== null ? (
              <circle
                cx={xs[lastIndex]}
                cy={y(last.value)}
                r={4}
                fill={CLUB}
                stroke={SURFACE}
                strokeWidth={2}
              />
            ) : null}
            {!compact && points.length > 1 ? (
              <g fontSize={11} fill={MUTED}>
                <text x={xs[0]} y={height - 4}>
                  {short(points[0]!.label)}
                </text>
                <text x={xs[xs.length - 1]} y={height - 4} textAnchor="end">
                  {short(points[points.length - 1]!.label)}
                </text>
              </g>
            ) : null}
          </svg>
        );
        return { node, xs };
      }}
    </ChartFrame>
  );
}

/** Media columna con la punta redondeada y el pie recto (hacia arriba o, si es negativa, abajo). */
function barPath(x: number, w: number, from: number, to: number) {
  const r = Math.min(4, w / 2, Math.abs(to - from));
  if (to <= from) {
    return `M${x},${from} V${to + r} Q${x},${to} ${x + r},${to} H${x + w - r} Q${x + w},${to} ${x + w},${to + r} V${from} Z`;
  }
  return `M${x},${from} V${to - r} Q${x},${to} ${x + r},${to} H${x + w - r} Q${x + w},${to} ${x + w},${to - r} V${from} Z`;
}

/**
 * Columnas: magnitudes por periodo o por franja. La que importa (la de ahora o la franja del KPI)
 * va en el color del club y con su cifra en la punta; las demás, más suaves. Con negativos, el
 * cero queda en medio y las negativas bajan en gris.
 */
export function BarChart(
  props: ChartProps & { highlight?: string | null; domain?: [number, number] },
) {
  const { points, format, short, compact = false } = props;
  const highlight = props.highlight ?? points[points.length - 1]?.label ?? null;
  const [active, setActive] = useState<number | null>(null);

  return (
    <ChartFrame {...props} active={active} setActive={setActive}>
      {({ width, height }) => {
        const top = compact ? 4 : 20;
        const bottom = compact ? 2 : 20;
        const values = points.map((p) => p.value ?? 0);
        const lo = props.domain?.[0] ?? Math.min(0, ...values);
        const hi = props.domain?.[1] ?? niceMax(Math.max(0, ...values));
        const span = hi - lo || 1;
        const y = (v: number) => top + (1 - (v - lo) / span) * (height - top - bottom);
        const slot = width / Math.max(1, points.length);
        const bar = Math.max(2, Math.min(24, slot - 2));
        const xs = points.map((_, i) => i * slot + slot / 2);
        const zero = y(0);
        const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(width / 44))));
        const node = (
          <svg
            width={width}
            height={height}
            aria-hidden="true"
            onPointerMove={(e) => {
              if (compact) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setActive(nearest(e.clientX - rect.left, xs));
            }}
            className="block overflow-visible"
          >
            <line x1={0} x2={width} y1={zero} y2={zero} stroke={GRID} strokeWidth={1} />
            {points.map((p, i) => {
              if (p.value === null) return null;
              const strong = p.label === highlight;
              const x = xs[i]! - bar / 2;
              const to = y(p.value);
              const lifted = active === i;
              return (
                <g key={p.label}>
                  <path
                    d={barPath(
                      x,
                      bar,
                      zero,
                      Math.abs(to - zero) < 1 ? zero - (p.value < 0 ? -1 : 1) : to,
                    )}
                    fill={p.value < 0 ? REFERENCE : CLUB}
                    opacity={strong || lifted ? 1 : 0.4}
                  />
                  {strong && !compact ? (
                    <text
                      x={xs[i]}
                      y={p.value < 0 ? to + 14 : to - 6}
                      fontSize={12}
                      fill={INK}
                      textAnchor="middle"
                      className="font-mono"
                    >
                      {format(p.value)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {!compact ? (
              <g fontSize={11} fill={MUTED} textAnchor="middle">
                {points.map((p, i) =>
                  i % every === 0 || i === points.length - 1 ? (
                    <text key={p.label} x={xs[i]} y={height - 4}>
                      {short(p.label)}
                    </text>
                  ) : null,
                )}
              </g>
            ) : null}
          </svg>
        );
        return { node, xs };
      }}
    </ChartFrame>
  );
}

/**
 * Anillo: una proporción sobre su total (ocupación, conversión, días listos). La pista es el tono
 * suave del club y el arco, el club; la cifra va en el centro.
 */
export function RadialGauge({
  ratio,
  center,
  caption,
  summary,
}: {
  ratio: number | null;
  center: string;
  caption?: string | null;
  summary: string;
}) {
  const [ref, box] = useBox<HTMLDivElement>();
  const size = Math.max(0, Math.min(box.width, box.height));
  const stroke = Math.max(8, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const filled = ratio === null ? 0 : Math.max(0, Math.min(1, ratio)) * length;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={summary}
      className="relative grid h-full min-h-20 w-full place-items-center"
    >
      {size > 0 ? (
        <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--club-soft)"
            strokeWidth={stroke}
          />
          {filled > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={CLUB}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${length}`}
            />
          ) : null}
        </svg>
      ) : null}
      <span
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <span className={`font-mono text-ink ${size > 150 ? "text-display" : "text-title2"}`}>
          {center}
        </span>
        {caption ? (
          <span className="max-w-[70%] truncate text-label text-muted">{caption}</span>
        ) : null}
      </span>
    </div>
  );
}

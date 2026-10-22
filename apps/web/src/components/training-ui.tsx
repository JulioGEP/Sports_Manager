import {
  type AvailabilityDto,
  type DiagramArrowKind,
  type DiagramField,
  type DiagramPieceKind,
  type DrillDiagram,
  type InsightDto,
  type RestrictionTag,
  type TrainingContent,
} from "@sportsmanager/shared";
import { useState, type PointerEvent, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Link } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { Button, Icon, StatusChip, useToast, type StatusKind } from "@/ui";

/**
 * Piezas comunes de entrenamiento, carga y salud (ADR 0039): estado de disponibilidad,
 * restricciones, contenidos, recomendaciones explicables, la pizarra de la tarea (vista y editor),
 * escalas de RPE y bienestar y las gráficas pequeñas de carga. SVG propio (DESIGN.md 10).
 */

// --- Etiquetas ---

const availabilityKind: Record<AvailabilityDto["status"], StatusKind> = {
  available: "success",
  limited: "warning",
  rehab: "info",
  out: "danger",
};

export function AvailabilityChip({
  value,
}: {
  value: Pick<AvailabilityDto, "status" | "restrictions" | "maxMinutes">;
}) {
  const t = useT("availability");
  const r = useT("restrictions");
  const detail =
    value.status === "limited"
      ? [
          ...value.restrictions.map((tag) => r(tag)),
          ...(value.maxMinutes ? [t("maxMinutes", { minutes: value.maxMinutes })] : []),
        ].join(" · ")
      : "";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusChip kind={availabilityKind[value.status]}>{t(`status.${value.status}`)}</StatusChip>
      {detail ? <span className="text-secondary text-muted">{detail}</span> : null}
    </span>
  );
}

export function RestrictionTags({ tags }: { tags: readonly RestrictionTag[] }) {
  const r = useT("tags");
  if (tags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-chip border border-border px-2 py-0.5 text-label text-muted"
        >
          {r(tag)}
        </span>
      ))}
    </span>
  );
}

/** Contenidos de una tarea o sesión, con enlace a la biblioteca filtrada por cada uno. */
export function ContentChips({
  ids,
  contents,
  link = false,
}: {
  ids: readonly string[];
  contents: readonly Pick<TrainingContent, "id" | "name">[];
  link?: boolean;
}) {
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const named = ids
    .map((id) => contents.find((c) => c.id === id))
    .filter((c): c is Pick<TrainingContent, "id" | "name"> => !!c);
  if (named.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {named.map((c) =>
        link ? (
          <Link
            key={c.id}
            to={`${paths.drills}?content=${c.id}`}
            className="rounded-chip bg-club-soft px-2 py-0.5 text-label font-medium text-club-soft-text no-underline"
          >
            {c.name}
          </Link>
        ) : (
          <span
            key={c.id}
            className="rounded-chip bg-club-soft px-2 py-0.5 text-label font-medium text-club-soft-text"
          >
            {c.name}
          </span>
        ),
      )}
    </span>
  );
}

// --- Recomendaciones ---

const levelKind: Record<InsightDto["level"], StatusKind> = {
  alert: "danger",
  attention: "warning",
  info: "info",
};

/**
 * "A tener en cuenta": cada recomendación con su nivel, qué detecta (la cifra delante), qué
 * propone y, si quien la lee planifica, aplicarla o descartarla. El texto sale de la regla y sus
 * valores, en el idioma de quien la lee.
 */
export function InsightList({
  insights,
  contents,
  players,
  teamId,
  canAnswer,
  onAnswered,
  emptyLabel,
  limit,
}: {
  insights: readonly InsightDto[];
  contents: readonly Pick<TrainingContent, "id" | "name">[];
  players: readonly { id: string; name: string }[];
  teamId: string;
  canAnswer: boolean;
  onAnswered?: () => void;
  emptyLabel?: string;
  limit?: number;
}) {
  const t = useT("insights");
  const [showAll, setShowAll] = useState(false);
  const visible = limit && !showAll ? insights.slice(0, limit) : insights;
  if (insights.length === 0)
    return <p className="text-secondary text-muted">{emptyLabel ?? t("empty")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {visible.map((insight) => (
          <li key={insight.fingerprint}>
            <InsightCard
              insight={insight}
              contents={contents}
              players={players}
              teamId={teamId}
              canAnswer={canAnswer}
              {...(onAnswered ? { onAnswered } : {})}
            />
          </li>
        ))}
      </ul>
      {limit && insights.length > limit ? (
        <Button variant="tertiary" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t("showLess") : t("showAll", { count: insights.length })}
        </Button>
      ) : null}
    </div>
  );
}

function useInsightValues() {
  const intl = useIntl();
  const r = useT("tags");
  const a = useT("availability");
  const z = useT("zones");
  const t = useT("insights");
  return (
    rule: InsightDto["rule"],
    values: InsightDto["values"],
  ): Record<string, string | number> => {
    const out: Record<string, string | number> = { ...values };
    if (typeof values.tags === "string")
      out.tags = values.tags
        .split(",")
        .filter(Boolean)
        .map((tag) => r(tag).toLocaleLowerCase(intl.locale))
        .join(", ");
    if (typeof values.status === "string") out.status = a(`inline.${values.status}`);
    if (typeof values.zone === "string")
      out.zone = values.zone ? t("zoneHint", { zone: z(values.zone) }) : "";
    if (typeof values.reviewOn === "string")
      out.review = values.reviewOn
        ? t("reviewHint", {
            date: intl.formatDate(new Date(`${values.reviewOn}T00:00:00Z`), {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            }),
          })
        : "";
    if (rule === "restriction_conflict")
      out.kind = values.tags
        ? "tags"
        : Number(values.max) > 0 && Number(values.minutes) > Number(values.max)
          ? "minutes"
          : "explicit";
    for (const key of ["date", "playedOn", "reviewOn", "since", "week"])
      if (typeof values[key] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(values[key])))
        out[key] = intl.formatDate(new Date(`${String(values[key])}T00:00:00Z`), {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        });
    for (const key of ["ratio", "rate", "median", "recent", "season", "target", "mean"])
      if (typeof values[key] === "number") out[key] = intl.formatNumber(values[key]);
    return out;
  };
}

export function InsightCard({
  insight,
  contents,
  players,
  teamId,
  canAnswer,
  onAnswered,
}: {
  insight: InsightDto;
  contents: readonly Pick<TrainingContent, "id" | "name">[];
  players: readonly { id: string; name: string }[];
  teamId: string;
  canAnswer: boolean;
  onAnswered?: () => void;
}) {
  const t = useT("insights");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const format = useInsightValues();
  const values = format(insight.rule, insight.values);
  const [busy, setBusy] = useState<"applied" | "dismissed" | null>(null);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? "—";

  async function answer(outcome: "applied" | "dismissed") {
    setBusy(outcome);
    try {
      await apiFetch(`/api/org/teams/${teamId}/insights/feedback`, {
        method: "POST",
        body: {
          rule: insight.rule,
          fingerprint: insight.fingerprint,
          playerId: insight.playerId,
          outcome,
        },
      });
      toast("success", outcome === "applied" ? t("applied") : t("dismissed"));
      onAnswered?.();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="flex flex-col gap-2 rounded-field border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip kind={levelKind[insight.level]}>{t(`levels.${insight.level}`)}</StatusChip>
        <h3 className="text-body font-semibold text-ink">
          {t(`rules.${insight.rule}.title`, values)}
        </h3>
      </div>
      <p className="text-secondary text-ink">{t(`rules.${insight.rule}.evidence`, values)}</p>
      <p className="text-secondary text-muted">
        <span className="font-medium text-ink">{t("proposal")}: </span>
        {t(`rules.${insight.rule}.suggestion`, values)}
      </p>
      {insight.groups ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {insight.groups.map((g) => (
            <div key={g.key} className="rounded-field bg-raised p-3">
              <p className="text-label font-semibold uppercase tracking-wide text-muted">
                {t(`groups.${g.key}`)}
              </p>
              <p className="text-secondary text-ink">
                {g.playerIds.length > 0 ? g.playerIds.map(name).join(", ") : "—"}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <ContentChips ids={insight.contentIds} contents={contents} link />
        {insight.matchId ? (
          <Link to={paths.matchStats(insight.matchId)} className="text-secondary font-medium">
            {t("openMatch")}
          </Link>
        ) : null}
        {insight.playerId && insight.rule !== "strength" ? (
          <Link
            to={paths.playerPerformance(insight.playerId)}
            className="text-secondary font-medium"
          >
            {t("openPlayer")}
          </Link>
        ) : null}
      </div>
      {canAnswer ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            icon={<Icon.Check size={16} aria-hidden="true" />}
            loading={busy === "applied"}
            onClick={() => void answer("applied")}
          >
            {t("apply")}
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            icon={<Icon.X size={16} aria-hidden="true" />}
            loading={busy === "dismissed"}
            onClick={() => void answer("dismissed")}
          >
            {t("dismiss")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

// --- Escalas ---

/** RPE de 0 a 10 (escala CR-10 de Foster): un toque por jugador. */
export function RpeScale({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {Array.from({ length: 11 }, (_, n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${label}: ${n}`}
          onClick={() => onChange(n)}
          className={`${compact ? "h-9 w-8" : "h-11 w-10"} rounded-control font-mono text-secondary font-semibold transition-colors ${
            value === n ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-club-soft"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Escala de 1 a 5 (bienestar, valoración): 5 es lo mejor, y lo dicen las etiquetas de los extremos. */
export function ScaleInput({
  value,
  onChange,
  label,
  min = 1,
  max = 5,
  lowLabel,
  highLabel,
}: {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-secondary font-medium text-ink">{label}</legend>
      <div className="flex gap-1">
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${label}: ${n}`}
            onClick={() => onChange(n)}
            className={`h-11 flex-1 rounded-control font-mono text-body font-semibold transition-colors ${
              value === n ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-club-soft"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {lowLabel || highLabel ? (
        <div className="flex justify-between text-label text-muted">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      ) : null}
    </fieldset>
  );
}

/** Valoración de una tarea o sesión: no funcionó, regular, funcionó. */
export function RatingInput({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
}) {
  const t = useT("session.rating");
  const options = [
    { n: 1, icon: <Icon.ThumbsDown size={16} aria-hidden="true" />, text: t("1") },
    { n: 2, icon: <Icon.Pulse size={16} aria-hidden="true" />, text: t("2") },
    { n: 3, icon: <Icon.ThumbsUp size={16} aria-hidden="true" />, text: t("3") },
  ];
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-control bg-raised p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.n}
          type="button"
          aria-pressed={value === o.n}
          onClick={() => onChange(o.n)}
          className={`inline-flex h-10 items-center gap-1.5 rounded-control px-3 text-secondary font-medium ${
            value === o.n ? "bg-surface text-ink shadow-row" : "text-muted"
          }`}
        >
          {o.icon}
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** Relación aguda:crónica con el umbral del club: aviso, nunca predicción. */
export function RatioChip({
  ratio,
  high,
  low,
}: {
  ratio: number | null;
  high: number;
  low: number;
}) {
  const intl = useIntl();
  const t = useT("load");
  if (ratio === null) return <span className="text-secondary text-muted">{t("noRatio")}</span>;
  const kind: StatusKind = ratio > high ? "warning" : ratio < low ? "info" : "success";
  return (
    <StatusChip kind={kind}>{intl.formatNumber(ratio, { maximumFractionDigits: 2 })}</StatusChip>
  );
}

// --- Gráficas pequeñas ---

const CLUB = "var(--club-fill)";
const REFERENCE = "var(--chart-reference)";
const GRID = "var(--chart-grid)";
const INK = "var(--text)";
const MUTED = "var(--text-muted)";

/** Barras diarias apiladas (sesión, partido, extra) con la leyenda en texto. */
export function DailyLoadBars({
  days,
  summary,
}: {
  days: readonly { date: string; session: number; match: number; extra: number }[];
  summary: string;
}) {
  const t = useT("load");
  const intl = useIntl();
  const max = Math.max(1, ...days.map((d) => d.session + d.match + d.extra));
  const width = 700;
  const height = 160;
  const bw = width / days.length;
  const series = [
    { key: "session" as const, color: CLUB, label: t("sources.session") },
    { key: "match" as const, color: "var(--club-deep)", label: t("sources.match") },
    { key: "extra" as const, color: REFERENCE, label: t("sources.extra") },
  ];
  return (
    <figure className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-secondary text-muted">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-sm"
              style={{ background: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        className="h-auto w-full"
        role="img"
        aria-label={summary}
      >
        <line x1={0} x2={width} y1={height} y2={height} stroke={GRID} />
        {days.map((d, i) => {
          let y = height;
          const total = d.session + d.match + d.extra;
          return (
            <g key={d.date}>
              {series.map((s) => {
                const h = (d[s.key] / max) * (height - 8);
                y -= h;
                return h > 0 ? (
                  <rect
                    key={s.key}
                    x={i * bw + 2}
                    y={y}
                    width={Math.max(2, bw - 4)}
                    height={h}
                    fill={s.color}
                    rx={2}
                  />
                ) : null;
              })}
              <title>{`${intl.formatDate(new Date(`${d.date}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" })}: ${total}`}</title>
              {i % 7 === days.length % 7 ? (
                <text
                  x={i * bw + bw / 2}
                  y={height + 14}
                  fontSize={10}
                  textAnchor="middle"
                  fill={MUTED}
                >
                  {intl.formatDate(new Date(`${d.date}T00:00:00Z`), {
                    day: "numeric",
                    month: "numeric",
                    timeZone: "UTC",
                  })}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Línea mínima de los últimos días para una fila de tabla. */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  const max = Math.max(1, ...values);
  const w = 112;
  const h = 28;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-28" role="img" aria-label={label}>
      <line x1={0} x2={w} y1={h - 1} y2={h - 1} stroke={GRID} />
      <polyline points={points} fill="none" stroke={CLUB} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Evolución de un test de un jugador (DESIGN.md 10): la línea en el color del club, la cifra
 * principal arriba y, si menos es mejor, el eje invertido (arriba siempre es mejor).
 */
export function EvolutionLine({
  points,
  lowerBetter,
  unit,
  summary,
}: {
  points: readonly { date: string; value: number }[];
  lowerBetter: boolean;
  unit: string;
  summary: string;
}) {
  const intl = useIntl();
  const w = 320;
  const h = 120;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
  const y = (v: number) => {
    const ratio = (v - lo) / span;
    const up = lowerBetter ? 1 - ratio : ratio;
    return h - 16 - up * (h - 36);
  };
  const x = (i: number) => (points.length > 1 ? 16 + (i * (w - 32)) / (points.length - 1) : w / 2);
  const last = points.at(-1);
  const first = points[0];
  const delta = last && first ? last.value - first.value : 0;
  const better = lowerBetter ? delta < 0 : delta > 0;
  return (
    <figure className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-title2 text-ink">
          {last ? intl.formatNumber(last.value, { maximumFractionDigits: 2 }) : "—"} {unit}
        </span>
        {points.length > 1 && delta !== 0 ? (
          <StatusChip kind={better ? "success" : "neutral"}>
            {`${delta > 0 ? "+" : ""}${intl.formatNumber(delta, { maximumFractionDigits: 2 })}`}
          </StatusChip>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full max-w-sm"
        role="img"
        aria-label={summary}
      >
        <line x1={0} x2={w} y1={h - 16} y2={h - 16} stroke={GRID} />
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
          fill="none"
          stroke={CLUB}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.value)} r={4} fill={CLUB}>
              <title>{`${p.date}: ${p.value} ${unit}`}</title>
            </circle>
            <text x={x(i)} y={h - 2} fontSize={10} textAnchor="middle" fill={MUTED}>
              {intl.formatDate(new Date(`${p.date}T00:00:00Z`), {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

// --- Pizarra de la tarea ---

const FIELD_BOX: Record<DiagramField, { w: number; h: number }> = {
  full: { w: 200, h: 100 },
  half: { w: 100, h: 100 },
  free: { w: 100, h: 100 },
};

function CourtLines({ field }: { field: DiagramField }) {
  const { w, h } = FIELD_BOX[field];
  const line = { stroke: "var(--border)", strokeWidth: 0.8, fill: "none" };
  if (field === "free") return null;
  if (field === "half")
    return (
      <g>
        <rect x={1} y={1} width={w - 2} height={h - 2} {...line} />
        <path
          d={`M 1 ${h / 2 - 15} A 15 15 0 0 1 1 ${h / 2 + 15}`}
          {...line}
          transform={`translate(${-14},0)`}
        />
        <path d={`M ${w - 1} ${h / 2 - 30} A 30 30 0 0 0 ${w - 1} ${h / 2 + 30}`} {...line} />
        <rect x={w - 3} y={h / 2 - 8} width={2} height={16} fill="var(--text-muted)" />
        <circle cx={1} cy={h / 2} r={15} {...line} />
      </g>
    );
  return (
    <g>
      <rect x={1} y={1} width={w - 2} height={h - 2} {...line} />
      <line x1={w / 2} x2={w / 2} y1={1} y2={h - 1} {...line} />
      <circle cx={w / 2} cy={h / 2} r={12} {...line} />
      <path d={`M 1 ${h / 2 - 30} A 30 30 0 0 1 1 ${h / 2 + 30}`} {...line} />
      <path d={`M ${w - 1} ${h / 2 - 30} A 30 30 0 0 0 ${w - 1} ${h / 2 + 30}`} {...line} />
      <rect x={1} y={h / 2 - 8} width={2} height={16} fill="var(--text-muted)" />
      <rect x={w - 3} y={h / 2 - 8} width={2} height={16} fill="var(--text-muted)" />
    </g>
  );
}

function arrowPath(kind: DiagramArrowKind, x1: number, y1: number, x2: number, y2: number) {
  if (kind !== "dribble") return `M ${x1} ${y1} L ${x2} ${y2}`;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(2, Math.floor(len / 5));
  const nx = -(y2 - y1) / (len || 1);
  const ny = (x2 - x1) / (len || 1);
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const amp = i === steps ? 0 : i % 2 === 0 ? 1.8 : -1.8;
    d += ` L ${x1 + (x2 - x1) * t + nx * amp} ${y1 + (y2 - y1) * t + ny * amp}`;
  }
  return d;
}

function Piece({
  kind,
  x,
  y,
  label,
}: {
  kind: DiagramPieceKind;
  x: number;
  y: number;
  label?: string | undefined;
}) {
  switch (kind) {
    case "ball":
      return <circle cx={x} cy={y} r={2} fill="#fff" stroke={INK} strokeWidth={0.7} />;
    case "cone":
      return (
        <path
          d={`M ${x} ${y - 3} L ${x + 2.6} ${y + 2} L ${x - 2.6} ${y + 2} Z`}
          fill="var(--status-warning-text)"
        />
      );
    case "goal":
      return <rect x={x - 1.2} y={y - 6} width={2.4} height={12} fill={INK} rx={0.6} />;
    default: {
      const fill = kind === "rival" ? REFERENCE : kind === "keeper" ? "var(--club-deep)" : CLUB;
      return (
        <g>
          <circle
            cx={x}
            cy={y}
            r={4}
            fill={fill}
            stroke={kind === "keeper" ? "#fff" : "none"}
            strokeWidth={0.8}
          />
          {label ? (
            <text x={x} y={y + 1.6} fontSize={4.2} textAnchor="middle" fill="#fff" fontWeight={700}>
              {label}
            </text>
          ) : null}
        </g>
      );
    }
  }
}

/** La pizarra en solo lectura: pista, piezas y flechas (pase, conducción y desplazamiento). */
export function DrillBoard({
  diagram,
  label,
  className = "",
  children,
  onPointerDown,
}: {
  diagram: DrillDiagram;
  label: string;
  className?: string;
  children?: ReactNode;
  onPointerDown?: (e: PointerEvent<SVGSVGElement>, at: { x: number; y: number }) => void;
}) {
  const { w, h } = FIELD_BOX[diagram.field];
  const sx = w / 100;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`h-auto w-full rounded-field bg-raised ${className}`}
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        if (!onPointerDown) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onPointerDown(e, {
          x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
          y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
        });
      }}
    >
      <defs>
        <marker
          id="drill-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={INK} />
        </marker>
      </defs>
      <CourtLines field={diagram.field} />
      {diagram.arrows.map((a, i) => (
        <path
          key={`a${i}`}
          d={arrowPath(a.kind, a.x1 * sx, a.y1, a.x2 * sx, a.y2)}
          fill="none"
          stroke={INK}
          strokeWidth={0.8}
          strokeDasharray={a.kind === "run" ? "2.2 1.6" : undefined}
          markerEnd="url(#drill-arrow)"
        />
      ))}
      {diagram.pieces.map((p, i) => (
        <Piece key={`p${i}`} kind={p.kind} x={p.x * sx} y={p.y} label={p.label} />
      ))}
      {children}
    </svg>
  );
}

type Tool = DiagramPieceKind | DiagramArrowKind | "erase";
const PIECE_TOOLS: DiagramPieceKind[] = ["own", "rival", "keeper", "ball", "cone", "goal"];
const ARROW_TOOLS: DiagramArrowKind[] = ["pass", "dribble", "run"];

/**
 * Editor de la pizarra: se elige una herramienta y se toca la pista. Las piezas se ponen con un
 * toque; las flechas, con dos (origen y destino). Borrar quita lo más cercano al toque. La lista
 * de debajo es la vía del teclado y del lector de pantalla.
 */
export function DrillBoardEditor({
  value,
  onChange,
}: {
  value: DrillDiagram;
  onChange: (value: DrillDiagram) => void;
}) {
  const t = useT("board");
  const [tool, setTool] = useState<Tool>("own");
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [nextLabel, setNextLabel] = useState(1);

  function tap(at: { x: number; y: number }) {
    const x = Math.round(at.x);
    const y = Math.round(at.y);
    if (tool === "erase") {
      const dist = (px: number, py: number) => Math.hypot(px - x, py - y);
      const piece = value.pieces
        .map((p, i) => ({ i, d: dist(p.x, p.y) }))
        .sort((a, b) => a.d - b.d)[0];
      const arrow = value.arrows
        .map((a, i) => ({
          i,
          d: Math.min(
            dist(a.x1, a.y1),
            dist(a.x2, a.y2),
            dist((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2),
          ),
        }))
        .sort((a, b) => a.d - b.d)[0];
      if (piece && (!arrow || piece.d <= arrow.d) && piece.d < 10)
        onChange({ ...value, pieces: value.pieces.filter((_, i) => i !== piece.i) });
      else if (arrow && arrow.d < 10)
        onChange({ ...value, arrows: value.arrows.filter((_, i) => i !== arrow.i) });
      return;
    }
    if ((ARROW_TOOLS as string[]).includes(tool)) {
      if (!start) {
        setStart({ x, y });
        return;
      }
      if (value.arrows.length < 40)
        onChange({
          ...value,
          arrows: [
            ...value.arrows,
            { kind: tool as DiagramArrowKind, x1: start.x, y1: start.y, x2: x, y2: y },
          ],
        });
      setStart(null);
      return;
    }
    if (value.pieces.length >= 40) return;
    const kind = tool as DiagramPieceKind;
    const label = kind === "own" ? String(nextLabel) : undefined;
    if (kind === "own") setNextLabel((n) => (n % 9) + 1);
    onChange({ ...value, pieces: [...value.pieces, { kind, x, y, ...(label ? { label } : {}) }] });
  }

  const toolButton = (key: Tool, icon: ReactNode) => (
    <button
      key={key}
      type="button"
      aria-pressed={tool === key}
      onClick={() => {
        setTool(key);
        setStart(null);
      }}
      className={`inline-flex h-10 items-center gap-1.5 rounded-control px-3 text-secondary font-medium ${
        tool === key ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-club-soft"
      }`}
    >
      {icon}
      {t(`tools.${key}`)}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("toolbar")}>
        {PIECE_TOOLS.map((k) => toolButton(k, null))}
        {ARROW_TOOLS.map((k) => toolButton(k, null))}
        {toolButton("erase", <Icon.Trash size={16} aria-hidden="true" />)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-secondary text-muted">{t("field")}</span>
        {(["full", "half", "free"] as DiagramField[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={value.field === f}
            onClick={() => onChange({ ...value, field: f })}
            className={`h-9 rounded-control px-3 text-secondary ${
              value.field === f ? "bg-surface font-semibold text-ink shadow-row" : "text-muted"
            }`}
          >
            {t(`fields.${f}`)}
          </button>
        ))}
        <Button
          size="sm"
          variant="tertiary"
          onClick={() => onChange({ ...value, pieces: [], arrows: [] })}
          disabled={value.pieces.length === 0 && value.arrows.length === 0}
        >
          {t("clear")}
        </Button>
      </div>
      <p className="text-secondary text-muted" aria-live="polite">
        {start
          ? t("arrowEnd")
          : (ARROW_TOOLS as string[]).includes(tool)
            ? t("arrowStart")
            : tool === "erase"
              ? t("eraseHint")
              : t("pieceHint")}
      </p>
      <DrillBoard
        diagram={value}
        label={t("summary", { pieces: value.pieces.length, arrows: value.arrows.length })}
        className="cursor-crosshair touch-none"
        onPointerDown={(_e, at) => tap(at)}
      >
        {start ? (
          <circle
            cx={start.x * (FIELD_BOX[value.field].w / 100)}
            cy={start.y}
            r={2}
            fill="var(--club-deep)"
          />
        ) : null}
      </DrillBoard>
      {value.pieces.length + value.arrows.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("elements")}>
          {value.pieces.map((p, i) => (
            <li key={`p${i}`}>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, pieces: value.pieces.filter((_, j) => j !== i) })
                }
                className="inline-flex h-8 items-center gap-1 rounded-chip border border-border px-2 text-label text-ink"
                aria-label={t("removeElement", {
                  element: `${t(`tools.${p.kind}`)}${p.label ? ` ${p.label}` : ""}`,
                })}
              >
                {t(`tools.${p.kind}`)}
                {p.label ? ` ${p.label}` : ""}
                <Icon.X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
          {value.arrows.map((a, i) => (
            <li key={`a${i}`}>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, arrows: value.arrows.filter((_, j) => j !== i) })
                }
                className="inline-flex h-8 items-center gap-1 rounded-chip border border-border px-2 text-label text-ink"
                aria-label={t("removeElement", { element: t(`tools.${a.kind}`) })}
              >
                {t(`tools.${a.kind}`)}
                <Icon.X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const EMPTY_DIAGRAM: DrillDiagram = { field: "half", pieces: [], arrows: [] };

/** Minutos y carga en texto corto: "72 min · 430 UA". */
export function useLoadFormat() {
  const intl = useIntl();
  const t = useT("load");
  return {
    load: (n: number | null | undefined) =>
      n === null || n === undefined ? "—" : t("ua", { value: intl.formatNumber(Math.round(n)) }),
    minutes: (n: number) => t("minutes", { value: n }),
  };
}

/** Fecha corta de calendario en el idioma de quien lee. */
export function useShortDate() {
  const intl = useIntl();
  const dates = useDates();
  return {
    weekday: (iso: string) =>
      intl.formatDate(new Date(`${iso}T00:00:00Z`), {
        weekday: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    long: (iso: string) =>
      intl.formatDate(new Date(`${iso}T00:00:00Z`), {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }),
    day: dates.day,
    time: (iso: string, timezone: string) =>
      intl.formatTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: timezone }),
  };
}

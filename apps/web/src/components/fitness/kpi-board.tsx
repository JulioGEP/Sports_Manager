import {
  BOX_AREAS,
  BOX_DASHBOARD_MAX_WIDGETS,
  BOX_KPIS,
  BOX_WIDGET_SIZES,
  formatMoney,
  widgetOf,
  type BoxDashboard,
  type BoxKpi,
  type BoxKpiValue,
  type BoxKpiView,
  type BoxWidget,
  type BoxWidgetSize,
  type Permission,
} from "@sportsmanager/shared";
import { useCallback, useState, type PointerEvent, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Link } from "react-router";
import { BarChart, LineChart, RadialGauge, type ChartPoint } from "@/components/fitness/kpi-charts";
import { MeterBar, usePercent } from "@/components/fitness/owner-ui";
import { errorKey } from "@/lib/api";
import { screenIcon, screenTarget } from "@/lib/box-areas";
import { useReadyClub } from "@/lib/club";
import { useTileDrag } from "@/lib/drag";
import { useDashboard, useSaveDashboard } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  Menu,
  MenuDivider,
  MenuItem,
  MenuSection,
  Segmented,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

/**
 * Cuadro de mando del box (ADR 0055, DESIGN.md 9.20): las piezas que el club ha elegido para Hoy
 * o para la portada de un área. Cada pieza es un KPI con su vista (número, línea, barras o radial)
 * y su tamaño (1×1, 2×1, 2×2 o todo el ancho). Quien lleva los ajustes lo personaliza en el propio
 * cuadro: arrastra las piezas por su asa (o las mueve desde su menú, que es la vía del teclado),
 * cambia la vista y el tamaño, añade y quita, y guarda para todo el equipo.
 */

type IconComponent = typeof Icon.House;

/** El sitio de cada tamaño en la rejilla: dos columnas en el móvil, cuatro con sitio. */
const SIZE_CLASS: Record<BoxWidgetSize, string> = {
  s: "col-span-1",
  m: "col-span-2",
  l: "col-span-2 row-span-2",
  xl: "col-span-2 @3xl:col-span-4",
};

const VIEW_ICON: Record<BoxKpiView, IconComponent> = {
  number: Icon.NumberSquareOne,
  line: Icon.ChartLine,
  bar: Icon.ChartBar,
  radial: Icon.ChartDonut,
};

const TONE_TEXT: Record<BoxKpiValue["tone"], string> = {
  neutral: "text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const sameLayout = (a: readonly BoxWidget[], b: readonly BoxWidget[]) =>
  a.length === b.length &&
  a.every((x, i) => x.kpi === b[i]!.kpi && x.view === b[i]!.view && x.size === b[i]!.size);

export function KpiBoard({
  dashboard,
  title,
  hideWhenEmpty = false,
}: {
  dashboard: BoxDashboard;
  title: ReactNode;
  /** Sin cifras que enseñar y sin poder personalizar, no se pinta (el inicio del coach). */
  hideWhenEmpty?: boolean;
}) {
  const k = useT("fitness.kpis");
  const errors = useT("errors");
  const toast = useToast();
  const board = useDashboard(dashboard);
  /** Las piezas mientras se personaliza; nulo, fuera de la edición. */
  const [draft, setDraft] = useState<BoxWidget[] | null>(null);
  const editing = draft !== null;
  const preview = useDashboard(dashboard, { preview: true, enabled: editing });
  const save = useSaveDashboard(dashboard);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [announce, setAnnounce] = useState("");
  const data = board.data;
  const values = new Map(
    [...(data?.values ?? []), ...((editing && preview.data?.values) || [])].map((v) => [v.id, v]),
  );
  const widgets = (draft ?? data?.widgets ?? []).filter((x) => values.has(x.kpi));
  const dirty = draft !== null && data !== undefined && !sameLayout(draft, data.widgets);
  const name = useCallback((id: BoxKpi) => k(`kpi.${id}.label`), [k]);

  const update = (fn: (list: BoxWidget[]) => BoxWidget[]) => setDraft((list) => fn(list ?? []));
  const move = (from: number, to: number) => {
    if (!draft || to < 0 || to >= draft.length || from === to) return;
    const next = [...draft];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setDraft(next);
    setAnnounce(k("edit.moved", { name: name(item!.kpi), position: to + 1, total: next.length }));
  };
  const { drag, start } = useTileDrag<number>((from, target) =>
    move(from, target === "end" ? widgets.length - 1 : Number(target)),
  );

  async function run(next: BoxWidget[] | null) {
    setBusy(true);
    try {
      await save(next);
      toast("success", next === null ? k("edit.restored") : k("edit.saved"));
      setDraft(null);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  if (hideWhenEmpty && data && data.widgets.length === 0 && !data.canEdit) return null;

  return (
    <section aria-labelledby={`kpis-${dashboard}`} className="flex flex-col gap-3">
      <div className="flex min-h-(--h-control) flex-wrap items-center justify-between gap-3">
        <h2 id={`kpis-${dashboard}`} className="text-title2 text-ink">
          {title}
        </h2>
        {data?.canEdit && !editing ? (
          <Button
            action="edit"
            variant="tertiary"
            size="sm"
            onClick={() => setDraft(data.widgets.map((x) => ({ ...x })))}
          >
            {k("customize")}
          </Button>
        ) : null}
      </div>
      {editing ? <p className="text-secondary text-muted">{k("edit.hint")}</p> : null}
      {board.isError ? <Alert kind="error">{k("loadError")}</Alert> : null}

      {board.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-card bg-raised" />
          ))}
        </div>
      ) : data && widgets.length === 0 && !editing ? (
        <div className="rounded-card bg-surface shadow-card precisa:border precisa:border-border">
          <EmptyState
            icon={<Icon.ChartBar weight="duotone" />}
            title={k("empty.title")}
            description={data.canEdit ? k("empty.hint") : k("empty.readOnly")}
            action={
              data.canEdit ? (
                <Button action="edit" variant="secondary" onClick={() => setDraft([])}>
                  {k("customize")}
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="@container">
          <ul className="grid auto-rows-[minmax(10rem,auto)] grid-flow-row-dense grid-cols-2 gap-3 sm:gap-4 @3xl:grid-cols-4">
            {widgets.map((widget, i) => {
              const value = values.get(widget.kpi)!;
              const target = drag?.over === String(i) && drag.item !== i;
              return (
                <li
                  key={widget.kpi}
                  data-drop={editing ? String(i) : undefined}
                  className={`flex min-w-0 ${SIZE_CLASS[widget.size]} ${
                    drag?.item === i ? "opacity-40" : ""
                  }`}
                >
                  {editing ? (
                    <EditableWidget
                      widget={widget}
                      value={value}
                      first={i === 0}
                      last={i === widgets.length - 1}
                      target={target}
                      onGrab={start(i)}
                      onView={(view) =>
                        update((list) =>
                          list.map((x, j) => (j === i ? widgetOf(x.kpi, view, x.size) : x)),
                        )
                      }
                      onSize={(size) =>
                        update((list) => list.map((x, j) => (j === i ? { ...x, size } : x)))
                      }
                      onMove={(by) => move(i, i + by)}
                      onRemove={() => {
                        setAnnounce(k("edit.removed", { name: name(widget.kpi) }));
                        update((list) => list.filter((_, j) => j !== i));
                      }}
                    />
                  ) : (
                    <KpiWidget widget={widget} value={value} />
                  )}
                </li>
              );
            })}
            {editing && widgets.length < BOX_DASHBOARD_MAX_WIDGETS ? (
              <li data-drop="end" className="col-span-1 flex">
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className={`flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-4 text-secondary font-medium transition-colors ${
                    drag?.over === "end"
                      ? "border-club text-club-text"
                      : "border-line text-muted hover:border-club hover:text-club-text"
                  }`}
                >
                  <Icon.Plus size={24} aria-hidden="true" />
                  {k("edit.add")}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      )}

      {editing ? (
        <div className="sticky bottom-24 z-20 flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-3 shadow-float precisa:bottom-4 precisa:border precisa:border-border">
          <span className="text-secondary text-muted">
            {widgets.length >= BOX_DASHBOARD_MAX_WIDGETS
              ? k("edit.full")
              : dirty
                ? k("edit.unsaved")
                : null}
          </span>
          <div className="flex flex-wrap gap-2">
            {data?.custom ? (
              <Button
                action="restore"
                variant="tertiary"
                disabled={busy}
                onClick={() => void run(null)}
              >
                {k("edit.restore")}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => (dirty ? setDiscarding(true) : setDraft(null))}
            >
              {k("edit.cancel")}
            </Button>
            <Button action="save" loading={busy} disabled={!dirty} onClick={() => void run(draft)}>
              {k("edit.save")}
            </Button>
          </div>
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {announce}
      </span>

      {drag && widgets[drag.item] ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-control bg-club px-3 py-2 text-secondary font-medium text-on-club shadow-float"
          style={{ left: drag.x, top: drag.y }}
        >
          {name(widgets[drag.item]!.kpi)}
        </div>
      ) : null}

      {editing && adding ? (
        <AddKpiSheet
          dashboard={dashboard}
          available={(preview.data?.available ?? data?.available ?? []).filter(
            (id) => !widgets.some((x) => x.kpi === id),
          )}
          values={values}
          loading={preview.isPending}
          full={widgets.length >= BOX_DASHBOARD_MAX_WIDGETS}
          onAdd={(id) => {
            update((list) => [...list, widgetOf(id)]);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}

      <ConfirmDialog
        open={discarding}
        title={k("edit.discardTitle")}
        body={k("edit.discardBody")}
        confirmLabel={k("edit.discard")}
        cancelLabel={k("edit.keep")}
        tone="danger"
        onConfirm={() => {
          setDiscarding(false);
          setDraft(null);
        }}
        onCancel={() => setDiscarding(false)}
      />
    </section>
  );
}

function useHasPermission() {
  const { org } = useReadyClub();
  return useCallback((p: Permission) => org.actor.permissions.includes(p), [org.actor.permissions]);
}

/**
 * Cómo se leen las cifras y las etiquetas de un KPI: la principal, la de cada punto de su
 * histórico y las de su eje (semana, mes o franja), con sus frases para el lector de pantalla.
 */
function useKpiFormat() {
  const intl = useIntl();
  const percent = usePercent();
  const k = useT("fitness.kpis");

  const number = useCallback(
    (id: BoxKpi, n: number): string => {
      switch (BOX_KPIS[id].format) {
        case "percent":
        case "slot":
          return percent(n);
        case "money":
          return formatMoney(n);
        case "decimal":
          return intl.formatNumber(n, { maximumFractionDigits: 1 });
        case "signed":
          return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
        default:
          return intl.formatNumber(n);
      }
    },
    [intl, percent],
  );

  const figure = useCallback(
    (v: BoxKpiValue): { main: string; extra: string | null } => {
      if (v.value === null) return { main: "–", extra: null };
      const format = BOX_KPIS[v.id].format;
      if (format === "fraction") return { main: `${v.value}/${v.total ?? 0}`, extra: null };
      if (format === "slot")
        return { main: v.label ?? "–", extra: k("slotOccupancy", { percent: percent(v.value) }) };
      return { main: number(v.id, v.value), extra: null };
    },
    [k, number, percent],
  );

  const day = useCallback(
    (iso: string, month: "short" | "long") =>
      intl.formatDate(new Date(`${iso}T12:00:00Z`), { day: "numeric", month, timeZone: "UTC" }),
    [intl],
  );
  const short = useCallback(
    (label: string) =>
      label.length === 10
        ? day(label, "short")
        : label.length === 7
          ? intl.formatDate(new Date(`${label}-15T12:00:00Z`), { month: "short", timeZone: "UTC" })
          : label,
    [day, intl],
  );
  const long = useCallback(
    (id: BoxKpi, label: string) => {
      if (label.length === 5) return k("chart.slotAt", { hour: label });
      if (label.length === 7)
        return intl.formatDate(new Date(`${label}-15T12:00:00Z`), {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
      if (id === "prs_week") return k("chart.sevenDaysTo", { date: day(label, "long") });
      if (id === "visits_per_athlete") return k("chart.windowTo", { date: day(label, "long") });
      return k("chart.weekOf", { date: day(label, "long") });
    },
    [day, intl, k],
  );

  return { number, figure, short, long };
}

/** La cabecera de una pieza: su nombre (enlace a donde se resuelve) y el icono de su pantalla. */
function WidgetHead({ id, compact }: { id: BoxKpi; compact: boolean }) {
  const k = useT("fitness.kpis");
  const { slug } = useReadyClub();
  const has = useHasPermission();
  const def = BOX_KPIS[id];
  const ScreenIcon = screenIcon(def.screen);
  const to = screenTarget(slug, def.screen, has);
  const label = k(`kpi.${id}.label`);
  return (
    <span className="flex items-start justify-between gap-3">
      {to ? (
        <Link
          to={to}
          title={k(`kpi.${id}.about`)}
          className="inline-flex min-w-0 items-center gap-1 text-secondary font-medium text-muted no-underline hover:text-ink"
        >
          <span className="line-clamp-2">{label}</span>
          <Icon.CaretRight size={14} aria-hidden="true" className="shrink-0" />
        </Link>
      ) : (
        <span className="text-secondary font-medium text-muted" title={k(`kpi.${id}.about`)}>
          {label}
        </span>
      )}
      <span
        aria-hidden="true"
        className={`size-9 shrink-0 place-items-center rounded-full bg-club-soft text-club-soft-text ${
          compact ? "hidden sm:grid" : "grid"
        }`}
      >
        <ScreenIcon size={20} weight="duotone" />
      </span>
    </span>
  );
}

/** La línea que explica la cifra: en el color de su estado y con su icono si pide atención. */
function WidgetHint({ value: v }: { value: BoxKpiValue }) {
  const k = useT("fitness.kpis");
  const ToneIcon =
    v.tone === "success" ? Icon.CheckCircle : v.tone === "neutral" ? null : Icon.Warning;
  return (
    <span className={`flex items-start gap-1.5 text-secondary ${TONE_TEXT[v.tone]}`}>
      {ToneIcon ? (
        <ToneIcon size={18} weight="duotone" aria-hidden="true" className="mt-0.5 shrink-0" />
      ) : null}
      <span>{v.value === null ? k("noData") : k(`kpi.${v.id}.hint`, v.params)}</span>
    </span>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  const k = useT("fitness.kpis");
  return (
    <span title={k("delta", { delta: delta > 0 ? `+${delta}` : String(delta) })}>
      <StatusChip kind={delta > 0 ? "success" : delta < 0 ? "danger" : "neutral"}>
        {delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0"} pts
      </StatusChip>
    </span>
  );
}

/** El cuerpo de una pieza según su vista: lo comparten el cuadro y su edición. */
function WidgetBody({
  widget,
  value: v,
  interactive,
}: {
  widget: BoxWidget;
  value: BoxKpiValue;
  interactive: boolean;
}) {
  const k = useT("fitness.kpis");
  const f = useKpiFormat();
  const def = BOX_KPIS[widget.kpi];
  const { main, extra } = f.figure(v);
  const name = k(`kpi.${v.id}.label`);
  const points: ChartPoint[] = v.series ?? [];
  const domain: [number, number] | undefined =
    def.format === "percent" || def.format === "slot" ? [0, 1] : undefined;
  const trendLabel = def.trend
    ? k(`trend.${def.trend.every}`) + (def.trend.estimated ? " *" : "")
    : null;
  const first = points[0]?.value;
  const summary =
    points.length > 0
      ? def.trend?.every === "slot"
        ? k("chart.slotSummary", { name, hour: v.label ?? "–", value: extra ?? main })
        : k("chart.summary", {
            name,
            period: (trendLabel ?? "").toLowerCase(),
            first: first === null || first === undefined ? "–" : f.number(v.id, first),
            last: main,
          })
      : name;
  const chartProps = {
    points,
    format: (n: number) => f.number(v.id, n),
    short: f.short,
    long: (label: string) => f.long(v.id, label),
    summary,
    ...(domain ? { domain } : {}),
  };
  const big = widget.size === "l" || widget.size === "xl";

  if (widget.view === "radial") {
    const ratio =
      v.value === null
        ? null
        : def.format === "fraction"
          ? v.total
            ? v.value / v.total
            : 0
          : v.value;
    return (
      <>
        <div className="min-h-24 flex-1">
          <RadialGauge
            ratio={ratio}
            center={main}
            caption={def.format === "slot" && v.value !== null ? f.number(v.id, v.value) : null}
            summary={k("chart.radialSummary", { name, value: extra ? `${main}, ${extra}` : main })}
          />
        </div>
        <WidgetHint value={v} />
      </>
    );
  }

  if (widget.view === "line" || widget.view === "bar") {
    return (
      <>
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`font-mono text-ink ${big ? "text-display" : "text-title1"}`}>
            {main}
          </span>
          {extra ? <span className="text-secondary text-muted">{extra}</span> : null}
          {v.delta !== null ? <DeltaChip delta={v.delta} /> : null}
          {trendLabel ? (
            <span
              className="ml-auto text-label text-muted"
              title={def.trend?.estimated ? k("trend.estimated") : undefined}
            >
              {trendLabel}
            </span>
          ) : null}
        </span>
        <div className={`min-h-24 flex-1 ${interactive ? "" : "pointer-events-none"}`}>
          {points.length === 0 ? (
            <span className="grid h-full place-items-center text-secondary text-muted">
              {k("noData")}
            </span>
          ) : widget.view === "line" ? (
            <LineChart {...chartProps} />
          ) : (
            <BarChart
              {...chartProps}
              {...(def.trend?.every === "slot" ? { highlight: v.label } : {})}
            />
          )}
        </div>
        {big ? <WidgetHint value={v} /> : null}
      </>
    );
  }

  // Número: la cifra, su explicación y, si hay sitio, su tendencia.
  const meter =
    v.value !== null && (def.format === "percent" || def.format === "slot") ? v.value : null;
  return (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`font-mono text-ink ${big ? "text-display-lg" : "text-title1 sm:text-display"}`}
        >
          {main}
        </span>
        {extra ? <span className="text-secondary text-muted">{extra}</span> : null}
        {v.delta !== null ? <DeltaChip delta={v.delta} /> : null}
      </span>
      {meter !== null ? <MeterBar ratio={meter} /> : null}
      <span className="mt-auto flex flex-col gap-2">
        <WidgetHint value={v} />
        {v.sample.length > 0 ? (
          <span className="truncate text-label text-muted">{v.sample.join(" · ")}</span>
        ) : null}
      </span>
      {widget.size !== "s" && points.length > 1 ? (
        <div className="pointer-events-none h-12">
          <LineChart {...chartProps} compact />
        </div>
      ) : null}
    </>
  );
}

const TILE =
  "flex w-full min-w-0 flex-col gap-2 rounded-card bg-surface p-3 shadow-card sm:gap-3 sm:p-4 precisa:border precisa:border-border";

/** Una pieza del cuadro, para mirar. */
function KpiWidget({ widget, value }: { widget: BoxWidget; value: BoxKpiValue }) {
  return (
    <article data-kpi={widget.kpi} data-view={widget.view} className={TILE}>
      <WidgetHead id={widget.kpi} compact={widget.size === "s"} />
      <WidgetBody widget={widget} value={value} interactive />
    </article>
  );
}

/**
 * Una pieza mientras se personaliza: el asa para arrastrarla, su vista y su menú (tamaño, mover
 * antes o después, quitar). Debajo, cómo queda, sin enlaces ni gráficas que atrapen el puntero.
 */
function EditableWidget({
  widget,
  value,
  first,
  last,
  target,
  onGrab,
  onView,
  onSize,
  onMove,
  onRemove,
}: {
  widget: BoxWidget;
  value: BoxKpiValue;
  first: boolean;
  last: boolean;
  /** Lo que se arrastra está encima: aquí caería. */
  target: boolean;
  onGrab: (e: PointerEvent) => void;
  onView: (view: BoxKpiView) => void;
  onSize: (size: BoxWidgetSize) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const k = useT("fitness.kpis");
  const name = k(`kpi.${widget.kpi}.label`);
  const views = BOX_KPIS[widget.kpi].views as readonly BoxKpiView[];
  return (
    <article
      data-kpi={widget.kpi}
      data-view={widget.view}
      className={`${TILE} ring-2 transition-shadow ${target ? "ring-club" : "ring-club-soft"}`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={k("edit.drag", { name })}
          title={k("edit.drag", { name })}
          onPointerDown={onGrab}
          className="grid size-10 shrink-0 cursor-grab touch-none place-items-center rounded-control text-muted hover:bg-raised active:cursor-grabbing"
        >
          <Icon.DotsSixVertical size={22} aria-hidden="true" />
        </button>
        <span className="line-clamp-2 min-w-0 flex-1 text-secondary font-medium text-ink">
          {name}
        </span>
        <Menu
          label={k("edit.options", { name })}
          trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
          triggerClassName="text-muted hover:bg-raised"
        >
          <MenuSection>{k("edit.size")}</MenuSection>
          {BOX_WIDGET_SIZES.map((size) => (
            <MenuItem
              key={size}
              onClick={() => onSize(size)}
              icon={
                size === widget.size ? (
                  <Icon.Check size={20} aria-hidden="true" />
                ) : (
                  <span className="size-5" aria-hidden="true" />
                )
              }
            >
              <span aria-current={size === widget.size ? "true" : undefined}>
                {k(`sizes.${size}`)}
              </span>
            </MenuItem>
          ))}
          <MenuDivider />
          {!first ? (
            <MenuItem
              icon={<Icon.ArrowLeft size={20} aria-hidden="true" />}
              onClick={() => onMove(-1)}
            >
              {k("edit.moveBefore")}
            </MenuItem>
          ) : null}
          {!last ? (
            <MenuItem
              icon={<Icon.ArrowRight size={20} aria-hidden="true" />}
              onClick={() => onMove(1)}
            >
              {k("edit.moveAfter")}
            </MenuItem>
          ) : null}
          {!first || !last ? <MenuDivider /> : null}
          <MenuItem
            tone="danger"
            icon={<Icon.Trash size={20} aria-hidden="true" />}
            onClick={onRemove}
          >
            {k("edit.remove")}
          </MenuItem>
        </Menu>
      </div>
      {views.length > 1 ? (
        <Segmented
          label={k("edit.view", { name })}
          value={widget.view}
          onChange={onView}
          iconOnly
          fill
          options={views.map((view) => {
            const ViewIcon = VIEW_ICON[view];
            return {
              key: view,
              label: k(`views.${view}`),
              icon: <ViewIcon size={20} aria-hidden="true" />,
            };
          })}
        />
      ) : null}
      <div className="pointer-events-none flex flex-1 flex-col gap-2 sm:gap-3" aria-hidden="true">
        <WidgetBody widget={widget} value={value} interactive={false} />
      </div>
    </article>
  );
}

/**
 * Añadir un KPI al cuadro: los que faltan, con su definición, su cifra de ahora y las vistas que
 * admite. En Hoy, agrupados por área.
 */
function AddKpiSheet({
  dashboard,
  available,
  values,
  loading,
  full,
  onAdd,
  onClose,
}: {
  dashboard: BoxDashboard;
  available: BoxKpi[];
  values: Map<BoxKpi, BoxKpiValue>;
  loading: boolean;
  full: boolean;
  onAdd: (id: BoxKpi) => void;
  onClose: () => void;
}) {
  const k = useT("fitness.kpis");
  const f = useKpiFormat();
  const groups =
    dashboard === "today"
      ? BOX_AREAS.map((area) => ({
          key: area,
          title: k(`dashboards.${area}`),
          ids: available.filter((id) => BOX_KPIS[id].area === area),
        })).filter((g) => g.ids.length > 0)
      : [{ key: dashboard, title: null, ids: available }];
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={k("edit.cancel")}
      title={k("edit.addTitle", { dashboard: k(`dashboards.${dashboard}`) })}
      description={k("edit.addDescription")}
    >
      <div className="flex flex-col gap-4">
        {full ? <p className="text-secondary text-warning">{k("edit.full")}</p> : null}
        {loading ? (
          <div className="h-24 animate-pulse rounded-field bg-raised" />
        ) : available.length === 0 ? (
          <p className="text-secondary text-muted">{k("edit.addEmpty")}</p>
        ) : (
          groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-1">
              {g.title ? (
                <h3 className="text-label uppercase tracking-wide text-muted">{g.title}</h3>
              ) : null}
              <ul className="flex flex-col divide-y divide-line rounded-field border border-line">
                {g.ids.map((id) => {
                  const v = values.get(id);
                  const views = BOX_KPIS[id].views as readonly BoxKpiView[];
                  return (
                    <li key={id} className="flex min-h-14 items-center gap-2 py-2 pr-1 pl-3">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-medium text-ink">{k(`kpi.${id}.label`)}</span>
                        <span className="text-label text-muted">{k(`kpi.${id}.about`)}</span>
                        <span className="flex flex-wrap items-center gap-2 text-label text-muted">
                          {v ? (
                            <span className="font-mono">
                              {k("edit.now", { value: f.figure(v).main })}
                            </span>
                          ) : null}
                          <span className="flex items-center gap-1">
                            {views.map((view) => {
                              const ViewIcon = VIEW_ICON[view];
                              return (
                                <span key={view} title={k(`views.${view}`)}>
                                  <ViewIcon size={16} aria-hidden="true" />
                                  <span className="sr-only">{k(`views.${view}`)}</span>
                                </span>
                              );
                            })}
                          </span>
                        </span>
                      </span>
                      <Button
                        action="add"
                        variant="ghost"
                        size="sm"
                        iconOnly
                        disabled={full}
                        onClick={() => onAdd(id)}
                      >
                        {k("edit.addOne", { name: k(`kpi.${id}.label`) })}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}

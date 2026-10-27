import { z } from "zod";
import type { Permission } from "./roles.ts";

/**
 * Cuadros de mando del box (ADR 0055). El personal del box navega por tres áreas: Entrenamiento,
 * Negocio y El box. Cada área tiene su portada con los KPIs de sus pantallas, y Hoy enseña los que
 * el club elige de todas. El catálogo es cerrado: el club decide cuáles mira, cómo los ve (número,
 * línea, barras o radial), qué sitio ocupan y en qué orden; nunca la fórmula. Así una cifra se
 * calcula igual en todos los boxes y siempre se puede explicar.
 */

export const BOX_AREAS = ["training", "business", "box"] as const;
export type BoxArea = (typeof BOX_AREAS)[number];
export const BoxAreaSchema = z.enum(BOX_AREAS);

/** Un cuadro de mando: Hoy o la portada de un área. */
export const BOX_DASHBOARDS = ["today", ...BOX_AREAS] as const;
export type BoxDashboard = (typeof BOX_DASHBOARDS)[number];
export const BoxDashboardSchema = z.enum(BOX_DASHBOARDS);

/** Las pantallas de cada área, en el orden de la navegación (lo más usado, primero). */
export const BOX_AREA_SCREENS = {
  training: ["classes", "programming", "athletes", "planning", "exercises"],
  business: ["plans", "payments", "leads", "store", "announcements"],
  box: ["messages", "schedule", "staff", "rooms", "equipment", "tv"],
} as const satisfies Record<BoxArea, readonly string[]>;
export type BoxScreen = (typeof BOX_AREA_SCREENS)[BoxArea][number];

/**
 * Cómo se lee la cifra principal: un recuento, un porcentaje (0 a 1), dinero en céntimos, un
 * decimal, "x de y", una diferencia con signo o una franja horaria con su ocupación.
 */
export const BOX_KPI_FORMATS = [
  "count",
  "percent",
  "money",
  "decimal",
  "fraction",
  "signed",
  "slot",
] as const;
export type BoxKpiFormat = (typeof BOX_KPI_FORMATS)[number];

/**
 * Cómo se ve un KPI. `number`, la cifra (con su tendencia si hay sitio); `line` y `bar`, su
 * histórico; `radial`, una proporción sobre un anillo. Cada KPI ofrece solo las que lo cuentan
 * bien: línea y barras si tiene histórico, radial si es una proporción.
 */
export const BOX_KPI_VIEWS = ["number", "line", "bar", "radial"] as const;
export type BoxKpiView = (typeof BOX_KPI_VIEWS)[number];

/** El sitio que ocupa en la rejilla de cuatro columnas: 1×1, 2×1, 2×2 o todo el ancho. */
export const BOX_WIDGET_SIZES = ["s", "m", "l", "xl"] as const;
export type BoxWidgetSize = (typeof BOX_WIDGET_SIZES)[number];

/**
 * El histórico de un KPI: por semanas (las ocho últimas), por meses (los seis últimos) o, en las
 * franjas, la ocupación de cada hora de inicio. `estimated`: los periodos pasados se reconstruyen
 * con las fechas de inicio y fin de cada tarifa, y así se dice.
 */
export interface BoxKpiTrend {
  every: "week" | "month" | "slot";
  estimated?: true;
}

export interface BoxKpiDefinition {
  area: BoxArea;
  /** La pantalla donde se resuelve: la tarjeta del KPI lleva allí. */
  screen: BoxScreen;
  /** Sin este permiso, el KPI ni se calcula ni se ofrece. */
  permission: Permission;
  format: BoxKpiFormat;
  /** Las vistas que admite; la primera es la de serie. */
  views: readonly [BoxKpiView, ...BoxKpiView[]];
  trend: BoxKpiTrend | null;
}

const kpi = (
  area: BoxArea,
  screen: BoxScreen,
  permission: Permission,
  format: BoxKpiFormat,
  views: readonly [BoxKpiView, ...BoxKpiView[]] = ["number"],
  trend: BoxKpiTrend | null = null,
): BoxKpiDefinition => ({ area, screen, permission, format, views, trend });

const WEEKS: BoxKpiTrend = { every: "week" };
const MONTHS: BoxKpiTrend = { every: "month" };
const ESTIMATED_MONTHS: BoxKpiTrend = { every: "month", estimated: true };
const SLOTS: BoxKpiTrend = { every: "slot" };

/** El catálogo, por área y en el orden en que se ofrece al elegir. */
export const BOX_KPIS = {
  // Entrenamiento
  classes_today: kpi("training", "classes", "org.events.read", "count"),
  occupancy_week: kpi(
    "training",
    "classes",
    "org.events.read",
    "percent",
    ["number", "line", "bar", "radial"],
    WEEKS,
  ),
  programming_ready: kpi("training", "programming", "org.training.read", "fraction", [
    "number",
    "radial",
  ]),
  active_athletes: kpi(
    "training",
    "athletes",
    "org.players.read",
    "count",
    ["number", "line", "bar"],
    ESTIMATED_MONTHS,
  ),
  inactive_athletes: kpi("training", "athletes", "org.players.read", "count"),
  visits_per_athlete: kpi(
    "training",
    "athletes",
    "org.players.read",
    "decimal",
    ["number", "line", "bar"],
    ESTIMATED_MONTHS,
  ),
  prs_week: kpi(
    "training",
    "athletes",
    "org.players.read",
    "count",
    ["number", "bar", "line"],
    WEEKS,
  ),
  active_plans: kpi("training", "planning", "org.training.read", "count"),
  exercises_library: kpi("training", "exercises", "org.settings.read", "count"),
  // Negocio
  recurring_revenue: kpi(
    "business",
    "plans",
    "org.fees.read",
    "money",
    ["number", "line", "bar"],
    ESTIMATED_MONTHS,
  ),
  members_net: kpi(
    "business",
    "plans",
    "org.fees.read",
    "signed",
    ["number", "bar"],
    ESTIMATED_MONTHS,
  ),
  packs_expiring: kpi("business", "plans", "org.fees.read", "count"),
  paused_plans: kpi("business", "plans", "org.fees.read", "count"),
  overdue_charges: kpi("business", "payments", "org.fees.read", "money"),
  collected_month: kpi(
    "business",
    "payments",
    "org.fees.read",
    "money",
    ["number", "bar", "line"],
    MONTHS,
  ),
  open_leads: kpi("business", "leads", "org.club_members.read", "count"),
  trials_week: kpi(
    "business",
    "leads",
    "org.club_members.read",
    "count",
    ["number", "bar", "line"],
    WEEKS,
  ),
  lead_conversion: kpi(
    "business",
    "leads",
    "org.club_members.read",
    "percent",
    ["number", "radial", "line", "bar"],
    MONTHS,
  ),
  store_sales_month: kpi(
    "business",
    "store",
    "org.store.read",
    "money",
    ["number", "bar", "line"],
    MONTHS,
  ),
  announcements_month: kpi(
    "business",
    "announcements",
    "org.community.write",
    "count",
    ["number", "bar"],
    MONTHS,
  ),
  // El box
  classes_week: kpi(
    "box",
    "schedule",
    "org.events.read",
    "count",
    ["number", "bar", "line"],
    WEEKS,
  ),
  peak_slot: kpi("box", "schedule", "org.events.read", "slot", ["number", "radial", "bar"], SLOTS),
  quiet_slot: kpi("box", "schedule", "org.events.read", "slot", ["number", "radial", "bar"], SLOTS),
  classes_without_coach: kpi("box", "schedule", "org.events.read", "count"),
  unread_messages: kpi("box", "messages", "org.community.write", "count"),
  equipment_out: kpi("box", "equipment", "org.training.read", "count"),
} as const satisfies Record<string, BoxKpiDefinition>;

export type BoxKpi = keyof typeof BOX_KPIS;
export const BOX_KPI_IDS = Object.keys(BOX_KPIS) as [BoxKpi, ...BoxKpi[]];
export const BoxKpiSchema = z.enum(BOX_KPI_IDS);

/** Una pieza del cuadro: qué KPI, cómo se ve y qué sitio ocupa. */
export const BoxWidgetSchema = z.object({
  kpi: BoxKpiSchema,
  view: z.enum(BOX_KPI_VIEWS),
  size: z.enum(BOX_WIDGET_SIZES),
});
export type BoxWidget = z.infer<typeof BoxWidgetSchema>;

/** Lo que cabe en un cuadro: tres filas de cuatro. */
export const BOX_DASHBOARD_MAX_WIDGETS = 12;

/** El tamaño con el que llega cada vista: la cifra y el anillo, 1×1; las gráficas, 2×1. */
export const DEFAULT_WIDGET_SIZE: Record<BoxKpiView, BoxWidgetSize> = {
  number: "s",
  radial: "s",
  line: "m",
  bar: "m",
};

/** Una pieza nueva de un KPI: su vista de serie y su tamaño. */
export function widgetOf(id: BoxKpi, view?: BoxKpiView, size?: BoxWidgetSize): BoxWidget {
  const views = BOX_KPIS[id].views as readonly BoxKpiView[];
  const v = view && views.includes(view) ? view : views[0]!;
  return { kpi: id, view: v, size: size ?? DEFAULT_WIDGET_SIZE[v] };
}

const w = widgetOf;

/**
 * Los de serie: una cabecera con lo esencial y gráficas donde cuentan algo. Un club que no toca
 * nada ve un cuadro completo desde el primer día.
 */
export const BOX_DASHBOARD_DEFAULTS: Record<BoxDashboard, readonly BoxWidget[]> = {
  today: [
    w("active_athletes"),
    w("occupancy_week", "radial"),
    w("recurring_revenue", "line"),
    w("trials_week", "bar"),
    w("collected_month", "bar"),
  ],
  training: [
    w("occupancy_week", "line"),
    w("classes_today"),
    w("programming_ready", "radial"),
    w("active_athletes", "bar"),
    w("inactive_athletes"),
    w("visits_per_athlete"),
    w("prs_week", "bar"),
    w("active_plans"),
    w("exercises_library"),
  ],
  business: [
    w("recurring_revenue", "line"),
    w("collected_month", "bar"),
    w("members_net", "bar"),
    w("overdue_charges"),
    w("packs_expiring"),
    w("trials_week", "bar"),
    w("lead_conversion", "radial"),
    w("open_leads"),
    w("store_sales_month", "bar"),
    w("paused_plans"),
    w("announcements_month"),
  ],
  box: [
    w("peak_slot", "bar", "xl"),
    w("classes_week", "line"),
    w("quiet_slot", "radial"),
    w("classes_without_coach"),
    w("unread_messages"),
    w("equipment_out"),
  ],
};

/**
 * Lo que el club ha cambiado, por cuadro: sus piezas en orden. Un cuadro sin entrada enseña los de
 * serie. Lo guardado antes de las vistas (solo el nombre del KPI) se sigue leyendo.
 */
export type BoxDashboardsConfig = Partial<Record<BoxDashboard, BoxWidget[]>>;

/** Lo guardado, leído con cuidado: solo cuadros que existen y listas. */
export function readDashboardsConfig(raw: unknown): Partial<Record<BoxDashboard, unknown[]>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<BoxDashboard, unknown[]>> = {};
  for (const dashboard of BOX_DASHBOARDS) {
    const list = (raw as Record<string, unknown>)[dashboard];
    if (Array.isArray(list)) out[dashboard] = list;
  }
  return out;
}

/** Los KPIs que se pueden poner en un cuadro: en Hoy, cualquiera; en un área, los suyos. */
export function eligibleKpis(dashboard: BoxDashboard): BoxKpi[] {
  return BOX_KPI_IDS.filter((id) => dashboard === "today" || BOX_KPIS[id].area === dashboard);
}

const isKpi = (value: unknown): value is BoxKpi =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(BOX_KPIS, value);

/**
 * Las piezas de un cuadro según lo guardado: sin entrada, las de serie; con entrada, las que
 * siguen existiendo y caben en ese cuadro, con una vista que su KPI admite y un tamaño válido, sin
 * repetir KPI y como mucho doce. Una lista vacía es una elección: el club no quiere cifras ahí.
 */
export function dashboardWidgets(
  config: Partial<Record<BoxDashboard, unknown[]>> | null | undefined,
  dashboard: BoxDashboard,
): BoxWidget[] {
  const saved = config?.[dashboard];
  if (!saved) return BOX_DASHBOARD_DEFAULTS[dashboard].map((x) => ({ ...x }));
  const eligible = new Set<string>(eligibleKpis(dashboard));
  const out: BoxWidget[] = [];
  for (const item of saved) {
    const raw: { kpi?: unknown; view?: unknown; size?: unknown } =
      typeof item === "string" ? { kpi: item } : item && typeof item === "object" ? item : {};
    if (!isKpi(raw.kpi) || !eligible.has(raw.kpi) || out.some((x) => x.kpi === raw.kpi)) continue;
    const view = (BOX_KPI_VIEWS as readonly unknown[]).includes(raw.view)
      ? (raw.view as BoxKpiView)
      : undefined;
    const size = (BOX_WIDGET_SIZES as readonly unknown[]).includes(raw.size)
      ? (raw.size as BoxWidgetSize)
      : undefined;
    out.push(widgetOf(raw.kpi, view, size));
    if (out.length === BOX_DASHBOARD_MAX_WIDGETS) break;
  }
  return out;
}

/** Las piezas que una persona puede ver, en el mismo orden. */
export function visibleWidgets(
  widgets: readonly BoxWidget[],
  permissions: ReadonlySet<Permission> | readonly Permission[],
): BoxWidget[] {
  return widgets.filter((x) => canSeeKpi(x.kpi, permissions));
}

/** Si una persona puede ver un KPI. */
export function canSeeKpi(
  id: BoxKpi,
  permissions: ReadonlySet<Permission> | readonly Permission[],
): boolean {
  const p = BOX_KPIS[id].permission;
  return permissions instanceof Set
    ? permissions.has(p)
    : (permissions as Permission[]).includes(p);
}

/**
 * Si una pieza necesita el histórico: las gráficas siempre; la cifra, cuando tiene sitio para su
 * tendencia (2×1 o más).
 */
export function widgetNeedsTrend(widget: BoxWidget): boolean {
  if (!BOX_KPIS[widget.kpi].trend) return false;
  return widget.view === "line" || widget.view === "bar" || widget.size !== "s";
}

/** El área a la que pertenece una pantalla (para la navegación y las migas). */
export function areaOfScreen(screen: BoxScreen): BoxArea {
  return BOX_AREAS.find((a) => (BOX_AREA_SCREENS[a] as readonly string[]).includes(screen))!;
}

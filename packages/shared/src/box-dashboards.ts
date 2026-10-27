import { z } from "zod";
import type { Permission } from "./roles.ts";

/**
 * Cuadros de mando del box (ADR 0055). El personal del box navega por tres áreas: Entrenamiento,
 * Negocio y El box. Cada área tiene su portada con los KPIs de sus pantallas, y Hoy enseña los que
 * el club elige de todas. El catálogo es cerrado: el club decide cuáles mira y en qué orden, nunca
 * la fórmula. Así una cifra se calcula igual en todos los boxes y siempre se puede explicar.
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

export interface BoxKpiDefinition {
  area: BoxArea;
  /** La pantalla donde se resuelve: la tarjeta del KPI lleva allí. */
  screen: BoxScreen;
  /** Sin este permiso, el KPI ni se calcula ni se ofrece. */
  permission: Permission;
  format: BoxKpiFormat;
}

/** El catálogo, por área y en el orden en que se ofrece al elegir. */
export const BOX_KPIS = {
  // Entrenamiento
  classes_today: {
    area: "training",
    screen: "classes",
    permission: "org.events.read",
    format: "count",
  },
  occupancy_week: {
    area: "training",
    screen: "classes",
    permission: "org.events.read",
    format: "percent",
  },
  programming_ready: {
    area: "training",
    screen: "programming",
    permission: "org.training.read",
    format: "fraction",
  },
  active_athletes: {
    area: "training",
    screen: "athletes",
    permission: "org.players.read",
    format: "count",
  },
  inactive_athletes: {
    area: "training",
    screen: "athletes",
    permission: "org.players.read",
    format: "count",
  },
  visits_per_athlete: {
    area: "training",
    screen: "athletes",
    permission: "org.players.read",
    format: "decimal",
  },
  prs_week: {
    area: "training",
    screen: "athletes",
    permission: "org.players.read",
    format: "count",
  },
  active_plans: {
    area: "training",
    screen: "planning",
    permission: "org.training.read",
    format: "count",
  },
  exercises_library: {
    area: "training",
    screen: "exercises",
    permission: "org.settings.read",
    format: "count",
  },
  // Negocio
  recurring_revenue: {
    area: "business",
    screen: "plans",
    permission: "org.fees.read",
    format: "money",
  },
  members_net: { area: "business", screen: "plans", permission: "org.fees.read", format: "signed" },
  packs_expiring: {
    area: "business",
    screen: "plans",
    permission: "org.fees.read",
    format: "count",
  },
  paused_plans: { area: "business", screen: "plans", permission: "org.fees.read", format: "count" },
  overdue_charges: {
    area: "business",
    screen: "payments",
    permission: "org.fees.read",
    format: "money",
  },
  collected_month: {
    area: "business",
    screen: "payments",
    permission: "org.fees.read",
    format: "money",
  },
  open_leads: {
    area: "business",
    screen: "leads",
    permission: "org.club_members.read",
    format: "count",
  },
  trials_week: {
    area: "business",
    screen: "leads",
    permission: "org.club_members.read",
    format: "count",
  },
  lead_conversion: {
    area: "business",
    screen: "leads",
    permission: "org.club_members.read",
    format: "percent",
  },
  store_sales_month: {
    area: "business",
    screen: "store",
    permission: "org.store.read",
    format: "money",
  },
  announcements_month: {
    area: "business",
    screen: "announcements",
    permission: "org.community.write",
    format: "count",
  },
  // El box
  classes_week: { area: "box", screen: "schedule", permission: "org.events.read", format: "count" },
  peak_slot: { area: "box", screen: "schedule", permission: "org.events.read", format: "slot" },
  quiet_slot: { area: "box", screen: "schedule", permission: "org.events.read", format: "slot" },
  classes_without_coach: {
    area: "box",
    screen: "schedule",
    permission: "org.events.read",
    format: "count",
  },
  unread_messages: {
    area: "box",
    screen: "messages",
    permission: "org.community.write",
    format: "count",
  },
  equipment_out: {
    area: "box",
    screen: "equipment",
    permission: "org.training.read",
    format: "count",
  },
} as const satisfies Record<string, BoxKpiDefinition>;

export type BoxKpi = keyof typeof BOX_KPIS;
export const BOX_KPI_IDS = Object.keys(BOX_KPIS) as [BoxKpi, ...BoxKpi[]];
export const BoxKpiSchema = z.enum(BOX_KPI_IDS);

/** Lo que cabe en un cuadro de mando: dos filas de cuatro. */
export const BOX_DASHBOARD_MAX_KPIS = 8;

/**
 * Los de serie. Hoy enseña lo que el inicio del dueño enseñaba antes (atletas, ocupación,
 * recurrente y pruebas), así un club que no toca nada no nota el cambio.
 */
export const BOX_DASHBOARD_DEFAULTS: Record<BoxDashboard, readonly BoxKpi[]> = {
  today: ["active_athletes", "occupancy_week", "recurring_revenue", "trials_week"],
  training: [
    "classes_today",
    "occupancy_week",
    "programming_ready",
    "inactive_athletes",
    "visits_per_athlete",
    "prs_week",
  ],
  business: [
    "recurring_revenue",
    "members_net",
    "overdue_charges",
    "collected_month",
    "open_leads",
    "trials_week",
    "store_sales_month",
    "packs_expiring",
  ],
  box: [
    "classes_week",
    "peak_slot",
    "quiet_slot",
    "classes_without_coach",
    "unread_messages",
    "equipment_out",
  ],
};

/** Lo que el club ha cambiado: un cuadro sin entrada sigue con los de serie. */
export type BoxDashboardsConfig = Partial<Record<BoxDashboard, string[]>>;

/** Lo guardado, leído con cuidado: solo cuadros que existen y listas de textos. */
export function readDashboardsConfig(raw: unknown): BoxDashboardsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: BoxDashboardsConfig = {};
  for (const dashboard of BOX_DASHBOARDS) {
    const list = (raw as Record<string, unknown>)[dashboard];
    if (Array.isArray(list))
      out[dashboard] = list.filter((x): x is string => typeof x === "string");
  }
  return out;
}

/** Los KPIs que se pueden poner en un cuadro: en Hoy, cualquiera; en un área, los suyos. */
export function eligibleKpis(dashboard: BoxDashboard): BoxKpi[] {
  return BOX_KPI_IDS.filter((id) => dashboard === "today" || BOX_KPIS[id].area === dashboard);
}

/**
 * Los KPIs de un cuadro según lo guardado: sin entrada, los de serie; con entrada, los que siguen
 * existiendo y caben en ese cuadro, sin repetir y como mucho ocho. Una lista vacía es una elección:
 * el club no quiere cifras ahí.
 */
export function dashboardKpis(
  config: BoxDashboardsConfig | null | undefined,
  dashboard: BoxDashboard,
): BoxKpi[] {
  const saved = config?.[dashboard];
  if (!saved) return [...BOX_DASHBOARD_DEFAULTS[dashboard]];
  const eligible = new Set<string>(eligibleKpis(dashboard));
  const out: BoxKpi[] = [];
  for (const id of saved) {
    if (eligible.has(id) && !out.includes(id as BoxKpi)) out.push(id as BoxKpi);
    if (out.length === BOX_DASHBOARD_MAX_KPIS) break;
  }
  return out;
}

/** Los que una persona puede ver de una lista, en el mismo orden. */
export function visibleKpis(
  ids: readonly BoxKpi[],
  permissions: ReadonlySet<Permission> | readonly Permission[],
): BoxKpi[] {
  const has = (p: Permission) =>
    permissions instanceof Set ? permissions.has(p) : (permissions as Permission[]).includes(p);
  return ids.filter((id) => has(BOX_KPIS[id].permission));
}

/** El área a la que pertenece una pantalla (para la navegación y las migas). */
export function areaOfScreen(screen: BoxScreen): BoxArea {
  return BOX_AREAS.find((a) => (BOX_AREA_SCREENS[a] as readonly string[]).includes(screen))!;
}

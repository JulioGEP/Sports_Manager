import { describe, expect, it } from "vitest";
import {
  BOX_AREA_SCREENS,
  BOX_AREAS,
  BOX_DASHBOARD_DEFAULTS,
  BOX_DASHBOARD_MAX_WIDGETS,
  BOX_DASHBOARDS,
  BOX_KPI_IDS,
  BOX_KPIS,
  canSeeKpi,
  dashboardWidgets,
  eligibleKpis,
  readDashboardsConfig,
  visibleWidgets,
  widgetNeedsTrend,
  widgetOf,
} from "./box-dashboards.ts";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./roles.ts";

describe("cuadros de mando del box", () => {
  it("cada KPI cuelga de una pantalla de su área, de un permiso que existe y de vistas con sentido", () => {
    for (const id of BOX_KPI_IDS) {
      const def = BOX_KPIS[id];
      expect(BOX_AREA_SCREENS[def.area] as readonly string[], id).toContain(def.screen);
      expect(PERMISSIONS, id).toContain(def.permission);
      // Línea y barras, solo con histórico; radial, solo si la cifra es una proporción.
      const views = def.views as readonly string[];
      if (views.includes("line") || views.includes("bar")) expect(def.trend, id).not.toBeNull();
      if (views.includes("radial"))
        expect(["percent", "fraction", "slot"], id).toContain(def.format);
      expect(views[0], id).toBe("number");
    }
  });

  it("los de serie caben, no se repiten, son del cuadro que toca y con una vista admitida", () => {
    for (const dashboard of BOX_DASHBOARDS) {
      const widgets = BOX_DASHBOARD_DEFAULTS[dashboard];
      expect(widgets.length).toBeLessThanOrEqual(BOX_DASHBOARD_MAX_WIDGETS);
      expect(new Set(widgets.map((x) => x.kpi)).size).toBe(widgets.length);
      for (const x of widgets) {
        expect(eligibleKpis(dashboard)).toContain(x.kpi);
        expect(BOX_KPIS[x.kpi].views as readonly string[]).toContain(x.view);
      }
    }
  });

  it("Hoy elige de todas las áreas; un área, solo de las suyas", () => {
    expect(eligibleKpis("today")).toEqual(BOX_KPI_IDS);
    for (const area of BOX_AREAS)
      for (const id of eligibleKpis(area)) expect(BOX_KPIS[id].area).toBe(area);
  });

  it("una pieza nueva llega con su vista de serie y su tamaño; una vista que no admite, no", () => {
    expect(widgetOf("recurring_revenue", "line")).toEqual({
      kpi: "recurring_revenue",
      view: "line",
      size: "m",
    });
    expect(widgetOf("inactive_athletes", "line")).toEqual({
      kpi: "inactive_athletes",
      view: "number",
      size: "s",
    });
    expect(widgetOf("occupancy_week", "radial", "l").size).toBe("l");
  });

  it("lee lo guardado: sin repetidos, sin desconocidos, vistas válidas, y lo de antes de las vistas", () => {
    expect(dashboardWidgets({}, "training")).toEqual(BOX_DASHBOARD_DEFAULTS.training);
    expect(dashboardWidgets(null, "today")).toEqual(BOX_DASHBOARD_DEFAULTS.today);
    expect(
      dashboardWidgets(
        {
          training: [
            { kpi: "prs_week", view: "line", size: "l" },
            "timer",
            { kpi: "prs_week", view: "bar", size: "s" },
            { kpi: "recurring_revenue", view: "line", size: "m" },
            "classes_today",
            { kpi: "active_athletes", view: "radial", size: "huge" },
          ],
        },
        "training",
      ),
    ).toEqual([
      { kpi: "prs_week", view: "line", size: "l" },
      { kpi: "classes_today", view: "number", size: "s" },
      { kpi: "active_athletes", view: "number", size: "s" },
    ]);
    expect(dashboardWidgets({ business: [] }, "business")).toEqual([]);
    expect(dashboardWidgets({ today: [...BOX_KPI_IDS] }, "today")).toHaveLength(
      BOX_DASHBOARD_MAX_WIDGETS,
    );
  });

  it("lo guardado se lee con cuidado", () => {
    expect(readDashboardsConfig(null)).toEqual({});
    expect(readDashboardsConfig([])).toEqual({});
    expect(readDashboardsConfig({ today: ["a"], other: ["x"], box: "y" })).toEqual({
      today: ["a"],
    });
  });

  it("cada cual ve los KPIs de su permiso: el coach, nada de dinero", () => {
    const coach = new Set(ROLE_PERMISSIONS.coach);
    expect(canSeeKpi("recurring_revenue", coach)).toBe(false);
    expect(canSeeKpi("overdue_charges", coach)).toBe(false);
    expect(canSeeKpi("classes_today", coach)).toBe(true);
    const visible = visibleWidgets(BOX_DASHBOARD_DEFAULTS.business, coach).map((x) => x.kpi);
    expect(visible).not.toContain("collected_month");
    expect(visibleWidgets(BOX_DASHBOARD_DEFAULTS.business, ROLE_PERMISSIONS.org_admin)).toEqual(
      BOX_DASHBOARD_DEFAULTS.business,
    );
  });

  it("el histórico se pide solo si la pieza lo dibuja", () => {
    expect(widgetNeedsTrend({ kpi: "recurring_revenue", view: "line", size: "m" })).toBe(true);
    expect(widgetNeedsTrend({ kpi: "recurring_revenue", view: "number", size: "s" })).toBe(false);
    expect(widgetNeedsTrend({ kpi: "recurring_revenue", view: "number", size: "m" })).toBe(true);
    expect(widgetNeedsTrend({ kpi: "inactive_athletes", view: "number", size: "l" })).toBe(false);
  });
});

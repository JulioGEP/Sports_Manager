import { describe, expect, it } from "vitest";
import {
  BOX_AREA_SCREENS,
  BOX_AREAS,
  BOX_DASHBOARD_DEFAULTS,
  BOX_DASHBOARD_MAX_KPIS,
  BOX_DASHBOARDS,
  BOX_KPI_IDS,
  BOX_KPIS,
  dashboardKpis,
  eligibleKpis,
  readDashboardsConfig,
  visibleKpis,
} from "./box-dashboards.ts";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./roles.ts";

describe("cuadros de mando del box", () => {
  it("cada KPI cuelga de una pantalla de su área y de un permiso que existe", () => {
    for (const id of BOX_KPI_IDS) {
      const def = BOX_KPIS[id];
      expect(BOX_AREA_SCREENS[def.area] as readonly string[], id).toContain(def.screen);
      expect(PERMISSIONS, id).toContain(def.permission);
    }
  });

  it("los de serie caben, no se repiten y son del cuadro que toca", () => {
    for (const dashboard of BOX_DASHBOARDS) {
      const ids = BOX_DASHBOARD_DEFAULTS[dashboard];
      expect(ids.length).toBeLessThanOrEqual(BOX_DASHBOARD_MAX_KPIS);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(eligibleKpis(dashboard)).toContain(id);
    }
  });

  it("Hoy elige de todas las áreas; un área, solo de las suyas", () => {
    expect(eligibleKpis("today")).toEqual(BOX_KPI_IDS);
    for (const area of BOX_AREAS)
      for (const id of eligibleKpis(area)) expect(BOX_KPIS[id].area).toBe(area);
  });

  it("sin elección, los de serie; con elección, sin repetidos, sin desconocidos y como mucho ocho", () => {
    expect(dashboardKpis({}, "training")).toEqual(BOX_DASHBOARD_DEFAULTS.training);
    expect(dashboardKpis(null, "today")).toEqual(BOX_DASHBOARD_DEFAULTS.today);
    expect(
      dashboardKpis(
        { training: ["prs_week", "timer", "prs_week", "recurring_revenue", "classes_today"] },
        "training",
      ),
    ).toEqual(["prs_week", "classes_today"]);
    expect(dashboardKpis({ business: [] }, "business")).toEqual([]);
    expect(dashboardKpis({ today: [...BOX_KPI_IDS] }, "today")).toHaveLength(
      BOX_DASHBOARD_MAX_KPIS,
    );
  });

  it("lo guardado se lee con cuidado", () => {
    expect(readDashboardsConfig(null)).toEqual({});
    expect(readDashboardsConfig([])).toEqual({});
    expect(readDashboardsConfig({ today: ["a", 3, "b"], other: ["x"], box: "y" })).toEqual({
      today: ["a", "b"],
    });
  });

  it("cada cual ve los KPIs de su permiso: el coach, nada de dinero", () => {
    const coach = new Set(ROLE_PERMISSIONS.coach);
    const visible = visibleKpis(BOX_KPI_IDS, coach);
    expect(visible).not.toContain("recurring_revenue");
    expect(visible).not.toContain("overdue_charges");
    expect(visible).toContain("classes_today");
    expect(visibleKpis(BOX_KPI_IDS, ROLE_PERMISSIONS.org_admin)).toEqual(BOX_KPI_IDS);
  });
});

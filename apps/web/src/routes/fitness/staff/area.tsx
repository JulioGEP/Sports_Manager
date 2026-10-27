import { BOX_AREAS, type BoxArea } from "@sportsmanager/shared";
import { Link, Navigate, useParams } from "react-router";
import { KpiBoard } from "@/components/fitness/kpi-board";
import { MeterBar, usePercent } from "@/components/fitness/owner-ui";
import { useHas } from "@/components/fitness/staff-ui";
import { AREA_LABEL_KEYS, boxAreaScreens } from "@/lib/box-areas";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClubModel, useDashboard } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Card, EmptyState, Icon, PageHeader } from "@/ui";

const isArea = (value: string | undefined): value is BoxArea =>
  (BOX_AREAS as readonly string[]).includes(value ?? "");

/**
 * Portada de un área del box (ADR 0055): la cabecera de cada grupo de la navegación se toca y
 * abre esto. Arriba, los KPIs que el club ha elegido para el área; debajo, la entrada a cada una
 * de sus pantallas. Solo para el personal de un box; cualquier otro vuelve al inicio.
 */
export function AreaPage() {
  const { area } = useParams();
  const { slug } = useReadyClub();
  const model = useClubModel();
  const has = useHas();
  if (model !== "fitness" || !isArea(area) || !has("org.events.read"))
    return <Navigate to={clubPaths(slug).home} replace />;
  return <AreaOverview key={area} area={area} />;
}

function AreaOverview({ area }: { area: BoxArea }) {
  const k = useT("fitness.kpis");
  const nav = useT("fitness.common.nav");
  const { slug } = useReadyClub();
  const has = useHas();
  const screens = boxAreaScreens(slug, has)[area];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={k("eyebrow")}
        title={nav(AREA_LABEL_KEYS[area])}
        description={k(`areas.${area}`)}
      />
      <KpiBoard dashboard={area} title={k("boardTitle")} />
      {area === "box" ? <OccupancyBySlot /> : null}
      {screens.length > 0 ? (
        <section aria-labelledby="area-screens" className="flex flex-col gap-3">
          <h2 id="area-screens" className="text-title2 text-ink">
            {k("screensTitle")}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {screens.map((s) => (
              <li key={s.screen} className="flex">
                <Link
                  to={s.to}
                  className="flex min-h-20 w-full items-center gap-4 rounded-card bg-surface p-4 no-underline shadow-card transition-colors hover:bg-raised precisa:border precisa:border-border"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-club-soft text-club-soft-text"
                  >
                    <s.icon size={24} weight="duotone" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-ink">{nav(s.labelKey)}</span>
                    <span className="text-secondary text-muted">{k(`screens.${s.screen}`)}</span>
                  </span>
                  <Icon.CaretRight size={16} aria-hidden="true" className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Ocupación por franja de las últimas cuatro semanas (antes en Métricas): dónde sobra sitio y
 * dónde falta, para decidir el horario. Cada barra lleva su cifra al lado.
 */
function OccupancyBySlot() {
  const k = useT("fitness.kpis.byHour");
  const percent = usePercent();
  const board = useDashboard("box");
  const rows = board.data?.byHour ?? [];
  const ratio = (taken: number, offered: number) => (offered > 0 ? taken / offered : 0);
  if (!board.data) return null;
  return (
    <Card title={k("title")} description={k("hint")}>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon.ChartBar weight="duotone" />}
          title={k("empty")}
          description={k("emptyHint")}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-body">
            <caption className="sr-only">{k("title")}</caption>
            <thead>
              <tr className="text-left text-label uppercase tracking-wide text-muted">
                <th scope="col" className="w-20 pb-2 font-medium">
                  {k("hour")}
                </th>
                <th scope="col" className="pb-2 font-medium">
                  <span className="sr-only">{k("bar")}</span>
                </th>
                <th scope="col" className="w-28 pb-2 text-right font-medium">
                  {k("taken")}
                </th>
                <th scope="col" className="w-20 pb-2 text-right font-medium">
                  {k("occupancy")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.hour} className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 text-left font-mono text-ink">
                    {row.hour}
                  </th>
                  <td className="py-2">
                    <MeterBar ratio={ratio(row.taken, row.offered)} />
                  </td>
                  <td className="py-2 pl-3 text-right font-mono text-muted">
                    {k("takenOf", { taken: row.taken, offered: row.offered })}
                  </td>
                  <td className="py-2 pl-3 text-right font-mono text-ink">
                    {percent(ratio(row.taken, row.offered))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

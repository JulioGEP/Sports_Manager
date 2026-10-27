import { BOX_AREAS, type BoxArea } from "@sportsmanager/shared";
import { Link, Navigate, useParams } from "react-router";
import { KpiBoard } from "@/components/fitness/kpi-board";
import { useHas } from "@/components/fitness/staff-ui";
import { AREA_LABEL_KEYS, boxAreaScreens } from "@/lib/box-areas";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClubModel } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Icon, PageHeader } from "@/ui";

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

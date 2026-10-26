import { useNavigate } from "react-router";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Tabs } from "@/ui";

type PlanTab = "map" | "week" | "review" | "health";

/** Las vistas de un plan: el mapa del ciclo, la semana en curso, la revisión y la salud. */
export function PlanTabs({
  planId,
  current,
  week,
}: {
  planId: string;
  current: PlanTab;
  /** La semana que abre "Semana" (la que va, o la primera). */
  week: number;
}) {
  const t = useT("fitness.planning.tabs");
  const navigate = useNavigate();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const to: Record<PlanTab, string> = {
    map: paths.planningPlan(planId),
    week: paths.planningWeek(planId, week),
    review: paths.planningReview(planId),
    health: paths.planningHealth(planId),
  };
  return (
    <Tabs<PlanTab>
      label={t("label")}
      selected={current}
      onChange={(key) => void navigate(to[key])}
      items={(["map", "week", "review", "health"] as const).map((key) => ({ key, label: t(key) }))}
    />
  );
}

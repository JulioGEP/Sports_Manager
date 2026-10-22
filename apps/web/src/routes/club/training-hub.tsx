import { TeamsResponseSchema, type TeamSummary } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, ButtonLink, Card, DataList, EmptyState, Icon, PageHeader } from "@/ui";

/**
 * Portada de entrenamiento (ADR 0038): los equipos de su ámbito con la entrada a la semana de
 * cada uno, la biblioteca de tareas, la enfermería para quien la lleva y, para quien coordina,
 * los ajustes y la metodología de cada sección.
 */
export function TrainingHubPage() {
  const t = useT("training.hub");
  const tt = useT("training");
  const staffRoles = useT("teamStaffRoles");
  const c = useT("common");
  const errors = useT("errors");
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canConfigure = permissions.includes("org.training.library");
  const canSeeLoad = permissions.includes("org.load.read");
  const canSeeInfirmary =
    permissions.includes("org.health.read") || permissions.includes("org.availability.write");

  const teams = useQuery({
    queryKey: ["org", slug, "teams", "training"],
    queryFn: () => apiFetch("/api/org/teams", { schema: TeamsResponseSchema }),
    retry: false,
  });

  if (teams.isError) return <Alert kind="error">{errors(errorKey(teams.error))}</Alert>;
  if (!teams.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const active = teams.data.teams.filter((team) => team.status === "active");
  const sections = [...new Map(active.map((team) => [team.section.id, team.section])).values()];
  const single = active.length === 1 ? active[0] : undefined;
  const staffOf = (team: TeamSummary) =>
    team.staff.map((s) => `${s.name} (${staffRoles(s.roleInTeam)})`).join(", ");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={teams.data.season?.name}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <ButtonLink
              to={paths.drills}
              variant="secondary"
              icon={<Icon.ClipboardText size={18} aria-hidden="true" />}
            >
              {tt("links.drills")}
            </ButtonLink>
            {canSeeInfirmary ? (
              <ButtonLink
                to={paths.infirmary}
                variant="secondary"
                icon={<Icon.Heartbeat size={18} aria-hidden="true" />}
              >
                {tt("links.infirmary")}
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.SportIcons.Silbato />}
            title={t("empty")}
            description={t("emptyHint")}
          />
        </Card>
      ) : null}

      {single ? (
        <Card
          title={single.name}
          description={[single.category, single.section.name].filter(Boolean).join(" · ")}
          actions={
            <ButtonLink to={paths.teamTraining(single.id)} action="open">
              {t("openWeek")}
            </ButtonLink>
          }
        >
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              to={paths.teamTrainingSeason(single.id)}
              variant="secondary"
              size="sm"
              icon={<Icon.CalendarBlank size={16} aria-hidden="true" />}
            >
              {tt("links.season")}
            </ButtonLink>
            <ButtonLink
              to={paths.teamTrainingHistory(single.id)}
              variant="secondary"
              size="sm"
              icon={<Icon.ClockCounterClockwise size={16} aria-hidden="true" />}
            >
              {tt("links.history")}
            </ButtonLink>
            {canSeeLoad ? (
              <>
                <ButtonLink
                  to={paths.teamLoad(single.id)}
                  variant="secondary"
                  size="sm"
                  icon={<Icon.Pulse size={16} aria-hidden="true" />}
                >
                  {tt("links.load")}
                </ButtonLink>
                <ButtonLink
                  to={paths.teamTests(single.id)}
                  variant="secondary"
                  size="sm"
                  icon={<Icon.Timer size={16} aria-hidden="true" />}
                >
                  {tt("links.tests")}
                </ButtonLink>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      {!single
        ? sections.map((section) => {
            const rows = active.filter((team) => team.section.id === section.id);
            return (
              <Card
                key={section.id}
                title={section.name}
                description={t("teamsCount", { count: rows.length })}
                padded={false}
                actions={
                  canConfigure ? (
                    <>
                      <ButtonLink
                        to={paths.sectionMethodology(section.id)}
                        variant="secondary"
                        size="sm"
                        icon={<Icon.ChartBar size={16} aria-hidden="true" />}
                      >
                        {t("methodology")}
                      </ButtonLink>
                      <ButtonLink
                        to={paths.sectionTrainingConfig(section.id)}
                        variant="secondary"
                        size="sm"
                        action="edit"
                      >
                        {t("settings")}
                      </ButtonLink>
                    </>
                  ) : null
                }
              >
                <DataList<TeamSummary>
                  caption={section.name}
                  rows={rows}
                  getKey={(team) => team.id}
                  empty={null}
                  href={(team) => paths.teamTraining(team.id)}
                  columns={[
                    {
                      key: "team",
                      header: t("table.team"),
                      cell: (team) => (
                        <Link to={paths.teamTraining(team.id)} className="font-medium text-ink">
                          {team.name}
                        </Link>
                      ),
                    },
                    {
                      key: "category",
                      header: t("table.category"),
                      cell: (team) => team.category ?? "—",
                    },
                    {
                      key: "staff",
                      header: t("table.staff"),
                      cell: (team) => (
                        <span className="text-secondary text-muted">{staffOf(team) || "—"}</span>
                      ),
                    },
                    {
                      key: "players",
                      header: t("table.players"),
                      numeric: true,
                      cell: (team) => team.playersCount,
                    },
                  ]}
                  mobileRow={(team) => ({
                    title: <Link to={paths.teamTraining(team.id)}>{team.name}</Link>,
                    subtitle: [team.category, t("players", { count: team.playersCount })]
                      .filter(Boolean)
                      .join(" · "),
                  })}
                />
              </Card>
            );
          })
        : null}

      {single && canConfigure ? (
        <Card title={single.section.name}>
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              to={paths.sectionMethodology(single.section.id)}
              variant="secondary"
              size="sm"
              icon={<Icon.ChartBar size={16} aria-hidden="true" />}
            >
              {t("methodology")}
            </ButtonLink>
            <ButtonLink
              to={paths.sectionTrainingConfig(single.section.id)}
              variant="secondary"
              size="sm"
              action="edit"
            >
              {t("settings")}
            </ButtonLink>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

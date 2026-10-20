import { FamilyResponseSchema, playerDisplayName } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { Alert, Avatar, Card, EmptyState, Icon, PageHeader, StatusChip } from "@/ui";

/** Lo que ve una familia: sus jugadores, su equipo de esta temporada y quién lo entrena. */
export function FamilyPage() {
  const t = useT("family");
  const tt = useT("team");
  const rel = useT("relationships");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const { slug } = useReadyClub();
  const family = useQuery({
    queryKey: ["org", slug, "family"],
    queryFn: () => apiFetch("/api/org/family", { schema: FamilyResponseSchema }),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      {family.isError ? <Alert kind="error">{errors(errorKey(family.error))}</Alert> : null}
      {family.data && family.data.players.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.HandHeart weight="duotone" />}
            title={t("empty")}
            description={t("emptyHint")}
          />
        </Card>
      ) : null}
      {family.isPending ? (
        <div className="h-40 animate-pulse rounded-card bg-raised" aria-label={c("loading")} />
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {family.data?.players.map((p) => {
          const age = dates.age(p.birthDate);
          return (
            <Card
              key={p.id}
              title={
                <span className="flex items-center gap-3">
                  <Avatar name={playerDisplayName(p)} />
                  {playerDisplayName(p)}
                </span>
              }
              description={`${t("relationship", { relationship: rel(p.relationship).toLowerCase() })}${
                age === null ? "" : ` · ${tt("age", { age })}`
              }`}
              actions={
                p.status === "inactive" ? (
                  <StatusChip kind="neutral">{t("inactive")}</StatusChip>
                ) : null
              }
              padded={false}
            >
              {p.teams.length === 0 ? (
                <p className="px-5 pb-5 text-body text-muted">{t("noTeam")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {p.teams.map((team) => (
                    <li key={team.teamId} className="flex flex-col gap-2 px-5 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-body text-club-soft-text">
                          {team.shirtNumber ?? "–"}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-medium text-ink">{team.teamName}</span>
                          <span className="text-secondary text-muted">
                            {team.sectionName} · {team.seasonName}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-secondary text-muted">
                        <Icon.Users size={16} aria-hidden="true" />
                        {team.staff.length > 0 ? (
                          <span>
                            {t("coaches")}: {team.staff.map((s) => s.name).join(", ")}
                          </span>
                        ) : (
                          <span>{t("noCoaches")}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

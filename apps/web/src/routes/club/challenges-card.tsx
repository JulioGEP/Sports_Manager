import {
  ChallengesResponseSchema,
  type ChallengeManageScope,
  type ChallengeSummary,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, Button, ButtonLink, Card, EmptyState, Icon, StatusChip } from "@/ui";
import { NewChallengeSheet } from "./challenge-new-sheet";
import { challengeKind, useChallengePeriod, useScopeLabel } from "./challenge-scope";

/** Los retos de un equipo (los suyos y los de toda su sección) o de una sección (todos los suyos). */
export function useChallengesOf(
  filter: { sectionId: string; teamId?: string | undefined },
  enabled = true,
) {
  const { slug } = useReadyClub();
  const query = filter.teamId ? `?team=${filter.teamId}` : `?section=${filter.sectionId}`;
  return useQuery({
    queryKey: ["org", slug, "challenges", query],
    queryFn: () => apiFetch(`/api/org/challenges${query}`, { schema: ChallengesResponseSchema }),
    enabled,
  });
}

/**
 * El reto dentro de la ficha de cada equipo y de cada sección (ADR 0032): el que está en marcha,
 * los borradores y el histórico, con su seguimiento a un clic. Desde aquí se crea uno nuevo con
 * el ámbito ya puesto. No hay entrada en la barra de navegación.
 */
export function ChallengesCard({
  section,
  team,
}: {
  section: { id: string; name: string };
  team?: { id: string; name: string } | undefined;
}) {
  const t = useT("challengesCard");
  const tc = useT("challenges");
  const c = useT("common");
  const errors = useT("errors");
  const navigate = useNavigate();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const scopeLabel = useScopeLabel();
  const period = useChallengePeriod();
  const list = useChallengesOf({ sectionId: section.id, teamId: team?.id });
  const [creating, setCreating] = useState(false);

  const manage: ChallengeManageScope = list.data?.manage ?? { scope: "none", ownTeamIds: [] };
  const canCreate =
    manage.scope === "club" ||
    (manage.scope === "own" &&
      (team ? manage.ownTeamIds.includes(team.id) : manage.ownTeamIds.length > 0));
  const rows = list.data?.challenges ?? [];
  const detailPath = (ch: ChallengeSummary) =>
    `${paths.challenge(ch.id)}${team ? `?team=${team.id}` : ""}`;

  return (
    <>
      <Card
        title={t("title")}
        description={team ? t("descriptionTeam") : t("descriptionSection")}
        padded={false}
        actions={
          canCreate ? (
            <Button
              size="sm"
              icon={<Icon.Plus size={16} aria-hidden="true" />}
              onClick={() => setCreating(true)}
            >
              {t("new")}
            </Button>
          ) : null
        }
      >
        {list.isError ? (
          <div className="px-5 pb-5">
            <Alert kind="error">{errors(errorKey(list.error))}</Alert>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon.Trophy weight="duotone" />}
            title={list.isPending ? c("loading") : team ? t("emptyTeam") : t("emptySection")}
            description={list.data && canCreate ? t("emptyHint") : undefined}
            action={
              list.data && canCreate ? (
                <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                  {t("new")}
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((ch) => (
              <li key={ch.id} className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-club-soft text-club-soft-text">
                  <Icon.Trophy size={20} weight="duotone" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link to={detailPath(ch)} className="truncate font-medium text-ink">
                    {ch.name}
                  </Link>
                  <span className="truncate text-secondary text-muted">
                    {scopeLabel(ch)} · {period(ch)} · {tc("table.points")}: {ch.minPoints} /{" "}
                    {ch.targetPoints}
                  </span>
                </span>
                {ch.pendingCount > 0 ? (
                  <StatusChip kind="warning">
                    {tc("pendingCount", { count: ch.pendingCount })}
                  </StatusChip>
                ) : null}
                <StatusChip kind={challengeKind[ch.status]}>{tc(`status.${ch.status}`)}</StatusChip>
                <ButtonLink to={detailPath(ch)} variant="secondary" size="sm">
                  {c("open")}
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canCreate ? (
        <NewChallengeSheet
          open={creating}
          manage={manage}
          lock={{
            sectionId: section.id,
            sectionName: section.name,
            teamId: team?.id ?? null,
            teamName: team?.name ?? null,
          }}
          onClose={() => setCreating(false)}
          onCreated={(id) =>
            void navigate(`${paths.challenge(id)}${team ? `?team=${team.id}` : ""}`)
          }
        />
      ) : null}
    </>
  );
}

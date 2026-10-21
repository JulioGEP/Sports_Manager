import {
  PlayersOverviewResponseSchema,
  playerDisplayName,
  type PlayerOverview,
  type StaffPosition,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  StatusChip,
  type StatusKind,
} from "@/ui";

/**
 * Panel de cada cargo del personal (Bloque 13, ADR 0030): a quién mirar hoy según lo que hace
 * cada persona en el club. Entrenadores y delegación ven sus equipos; dirección y coordinación,
 * todo el club; fisio, preparación física, psicología y scout, los jugadores que su área señala.
 * Son listas de trabajo, no clasificaciones: una cifra baja va en gris, nunca en rojo (DESIGN.md 10).
 */

export type PanelKind = "coach" | StaffPosition;

/** Umbral por debajo del cual un indicador pide atención. */
const ATTENTION = 50;

/** Fecha de hoy en `AAAA-MM-DD`, para saber si una revisión ya ha pasado. */
const todayIso = () => new Date().toISOString().slice(0, 10);

interface Focus {
  /** Qué dimensión manda en la lista: la cifra que se enseña junto al nombre. */
  dimension: keyof PlayerOverview["indicators"] | null;
  /** Qué comprobaciones aparecen como motivos en la lista. */
  reasons: readonly Reason[];
  icon: ReactNode;
}

type Reason =
  | "lowScore"
  | "unrated"
  | "noObjective"
  | "objectiveOverdue"
  | "noPlan"
  | "planOverdue"
  | "noPhysicalGoal"
  | "noEmotionalGoal"
  | "noHeight"
  | "noFamily"
  | "noTeam"
  | "noPhoto";

const FOCUS: Record<PanelKind, Focus> = {
  coach: {
    dimension: null,
    reasons: ["noObjective", "objectiveOverdue", "unrated", "noPlan", "planOverdue", "noTeam"],
    icon: <Icon.SportIcons.Silbato />,
  },
  director: {
    dimension: null,
    reasons: ["objectiveOverdue", "planOverdue", "noObjective", "unrated", "noTeam", "noFamily"],
    icon: <Icon.Target weight="duotone" />,
  },
  coordinator: {
    dimension: null,
    reasons: ["objectiveOverdue", "planOverdue", "noObjective", "noPlan", "unrated", "noTeam"],
    icon: <Icon.ListChecks weight="duotone" />,
  },
  delegate: {
    dimension: null,
    reasons: ["noFamily", "noPhoto", "noTeam"],
    icon: <Icon.ClipboardText weight="duotone" />,
  },
  physio: {
    dimension: "body",
    reasons: ["lowScore", "unrated", "noHeight"],
    icon: <Icon.Heartbeat weight="duotone" />,
  },
  fitness: {
    dimension: "body",
    reasons: ["lowScore", "unrated", "noPhysicalGoal", "noHeight"],
    icon: <Icon.Barbell weight="duotone" />,
  },
  psychologist: {
    dimension: "wellbeing",
    reasons: ["lowScore", "unrated", "noEmotionalGoal"],
    icon: <Icon.Brain weight="duotone" />,
  },
  scout: {
    dimension: "sport",
    reasons: ["unrated", "lowScore"],
    icon: <Icon.Binoculars weight="duotone" />,
  },
};

function reasonsOf(p: PlayerOverview, focus: Focus, today: string): Reason[] {
  const out: Reason[] = [];
  const score = focus.dimension ? p.indicators[focus.dimension] : null;
  const rated = Object.values(p.indicators).filter((v) => v !== null).length;
  for (const reason of focus.reasons) {
    switch (reason) {
      case "lowScore":
        if (score !== null && score < ATTENTION) out.push(reason);
        break;
      case "unrated":
        if (focus.dimension ? score === null : rated < 4) out.push(reason);
        break;
      case "noObjective":
        if (!p.objective) out.push(reason);
        break;
      case "objectiveOverdue":
        if (p.objective?.reviewOn && p.objective.reviewOn < today) out.push(reason);
        break;
      case "noPlan":
        if (!p.plan) out.push(reason);
        break;
      case "planOverdue":
        if (p.plan?.nextReviewOn && p.plan.nextReviewOn < today) out.push(reason);
        break;
      case "noPhysicalGoal":
        if (p.plan && !p.plan.physical) out.push(reason);
        break;
      case "noEmotionalGoal":
        if (p.plan && !p.plan.emotional) out.push(reason);
        break;
      case "noHeight":
        if (p.heightCm === null) out.push(reason);
        break;
      case "noFamily":
        if (p.guardiansCount === 0) out.push(reason);
        break;
      case "noTeam":
        if (p.teams.length === 0) out.push(reason);
        break;
      case "noPhoto":
        if (!p.photoUrl) out.push(reason);
        break;
    }
  }
  return out;
}

/** Una cifra por debajo del umbral va en gris: son niños (DESIGN.md 10). */
const scoreKind = (score: number | null): StatusKind =>
  score === null ? "neutral" : score < ATTENTION ? "neutral" : "club";

export function StaffPanel({ kind }: { kind: PanelKind }) {
  const t = useT("home.panel");
  const names = useT("player.indicatorNames");
  const errors = useT("errors");
  const dates = useDates();
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const own = kind === "coach" || kind === "delegate";
  const canSeeChallenges = org.actor.permissions.includes("org.challenges.read");
  const overview = useQuery({
    queryKey: ["org", slug, "players", "overview", own ? "own" : "club"],
    queryFn: () =>
      apiFetch(`/api/org/players/overview${own ? "?scope=own" : ""}`, {
        schema: PlayersOverviewResponseSchema,
      }),
  });
  const focus = FOCUS[kind];
  const today = todayIso();

  const { attention, teams, rated } = useMemo(() => {
    const players = overview.data?.players ?? [];
    const withReasons = players
      .map((p) => ({ player: p, reasons: reasonsOf(p, focus, today) }))
      .filter((x) => x.reasons.length > 0)
      .sort((a, b) => {
        if (focus.dimension) {
          const sa = a.player.indicators[focus.dimension] ?? 101;
          const sb = b.player.indicators[focus.dimension] ?? 101;
          if (sa !== sb) return sa - sb;
        }
        return b.reasons.length - a.reasons.length;
      });
    const byTeam = new Map<string, { teamId: string; teamName: string; count: number }>();
    for (const p of players) {
      for (const team of p.teams) {
        const entry = byTeam.get(team.teamId) ?? { ...team, count: 0 };
        entry.count += 1;
        byTeam.set(team.teamId, entry);
      }
    }
    const ratedCount = focus.dimension
      ? players.filter((p) => p.indicators[focus.dimension!] !== null).length
      : players.filter((p) => Object.values(p.indicators).every((v) => v !== null)).length;
    return {
      attention: withReasons.slice(0, 10),
      teams: [...byTeam.values()].sort((a, b) => a.teamName.localeCompare(b.teamName)),
      rated: ratedCount,
    };
  }, [overview.data, focus, today]);

  const total = overview.data?.players.length ?? 0;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className="text-club-text [&_svg]:size-6">{focus.icon}</span>
          {t(`${kind}.title`)}
        </span>
      }
      description={t(`${kind}.description`)}
      padded={false}
      actions={
        <>
          {overview.data ? (
            <StatusChip kind="neutral">
              {focus.dimension
                ? t("rated", { rated, total, dimension: names(focus.dimension) })
                : t("players", { total })}
            </StatusChip>
          ) : null}
          {canSeeChallenges ? (
            <ButtonLink action="open" to={paths.challenges} variant="secondary" size="sm">
              {t("openChallenges")}
            </ButtonLink>
          ) : null}
        </>
      }
    >
      {overview.isError ? (
        <div className="px-5 pb-5">
          <Alert kind="error">{errors(errorKey(overview.error))}</Alert>
        </div>
      ) : null}
      {own && teams.length > 0 ? (
        <ul className="flex flex-wrap gap-2 px-5 pb-3" aria-label={t("myTeams")}>
          {teams.map((team) => (
            <li key={team.teamId}>
              <Link
                to={paths.team(team.teamId)}
                className="inline-flex h-10 items-center gap-2 rounded-chip bg-club-soft px-3 text-secondary font-medium text-club-soft-text no-underline"
              >
                {team.teamName}
                <span className="font-mono">{team.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {overview.data && own && total === 0 ? (
        <EmptyState
          icon={<Icon.UsersThree weight="duotone" />}
          title={t("noTeamsTitle")}
          description={t("noTeamsBody")}
        />
      ) : overview.data && attention.length === 0 ? (
        <EmptyState icon={<Icon.CheckCircle weight="duotone" />} title={t("allClear")} />
      ) : (
        <ul className="flex flex-col divide-y divide-line" aria-label={t(`${kind}.title`)}>
          {attention.map(({ player, reasons }) => {
            const score = focus.dimension ? player.indicators[focus.dimension] : null;
            return (
              <li key={player.id} className="flex min-h-16 items-center gap-3 px-5 py-3">
                <Avatar name={playerDisplayName(player)} src={player.photoUrl} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link to={paths.player(player.id)} className="truncate font-medium text-ink">
                    {playerDisplayName(player)}
                  </Link>
                  <span className="truncate text-secondary text-muted">
                    {player.teams.map((x) => x.teamName).join(", ") || t("noTeam")} ·{" "}
                    {reasons.map((r) => t(`reasons.${r}`)).join(" · ")}
                    {player.lastNoteOn
                      ? ` · ${t("lastNote", { date: dates.day(player.lastNoteOn) })}`
                      : ""}
                  </span>
                </span>
                {focus.dimension ? (
                  <StatusChip kind={scoreKind(score)}>
                    {score === null
                      ? t("unrated")
                      : `${names(focus.dimension)} ${String(score).padStart(2, " ")}`}
                  </StatusChip>
                ) : null}
                <ButtonLink
                  iconOnly
                  action="open"
                  to={paths.player(player.id)}
                  variant="tertiary"
                  size="sm"
                >
                  {t("open")}
                </ButtonLink>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

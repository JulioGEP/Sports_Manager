import { WORKOUT_LEVELS, type WorkoutLevel } from "@sportsmanager/shared";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ApiClientError, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useFitnessRole, useLeaderboard } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Alert, Button, Card, EmptyState, Icon, PageHeader, Segmented, StatusChip } from "@/ui";

type LevelFilter = "all" | WorkoutLevel;

/**
 * La clasificación de un bloque (ADR 0049): por marcador, con el nivel de cada cual y filtro por
 * nivel; con `?class=`, solo quienes vinieron a esa clase. Quien prefiere no salir no sale (salvo
 * para sí mismo y para el personal). La ven atletas y coaches.
 */
export function LeaderboardPage() {
  const t = useT("fitness.athlete.leaderboard");
  const levels = useT("fitness.common.levels");
  const scores = useT("fitness.common.scoreTypes");
  const errors = useT("errors");
  const { blockId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const classId = params.get("class") ?? undefined;
  const [level, setLevel] = useState<LevelFilter>("all");
  const board = useLeaderboard(blockId, {
    level: level === "all" ? undefined : level,
    classId,
  });
  const role = useFitnessRole();
  const staff = role === "owner" || role === "coach";
  const back = classId ? paths.classDetail(classId) : staff ? paths.programming : paths.wod;
  const closed = board.error instanceof ApiClientError && board.error.status === 403;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backTo={back}
        backLabel={classId ? t("backClass") : staff ? t("backProgramming") : t("backWod")}
        eyebrow={board.data ? scores(board.data.block.scoreType) : undefined}
        title={board.data ? `${board.data.block.label} · ${board.data.block.title}` : t("title")}
        description={classId ? t("classOnly") : t("description")}
        actions={
          classId ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void navigate(paths.leaderboard(blockId ?? ""), { replace: true })}
            >
              {t("everyone")}
            </Button>
          ) : null
        }
      />

      <Segmented
        label={t("levelFilter")}
        value={level}
        onChange={setLevel}
        options={[
          { key: "all", label: t("all") },
          ...WORKOUT_LEVELS.map((l) => ({ key: l, label: levels(l) })),
        ]}
      />

      {board.isPending ? (
        <div className="h-64 animate-pulse rounded-card bg-raised" aria-busy="true" />
      ) : closed ? (
        <Alert kind="info">{t("closed")}</Alert>
      ) : board.isError ? (
        <Alert kind="error">{errors(errorKey(board.error))}</Alert>
      ) : board.data.entries.length === 0 ? (
        <EmptyState
          icon={<Icon.Trophy size={28} weight="duotone" aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyHint")}
        />
      ) : (
        <Card padded={false}>
          <ol className="flex flex-col divide-y divide-line">
            {board.data.entries.map((e) => (
              <li
                key={e.playerId}
                aria-current={e.isMe ? "true" : undefined}
                className={`flex min-h-14 items-center gap-3 px-5 py-2 ${e.isMe ? "bg-club-soft" : ""}`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-body font-semibold ${
                    e.rank <= 3 ? "bg-club text-on-club" : "bg-raised text-ink"
                  }`}
                >
                  {e.rank}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-ink">
                    {e.name}
                    {e.isMe ? <span className="text-muted"> · {t("you")}</span> : null}
                  </span>
                  <span>
                    <StatusChip kind={e.level === "scaled" ? "neutral" : "club"}>
                      {levels(e.level)}
                    </StatusChip>
                  </span>
                </span>
                <span
                  className={`font-mono text-title3 ${e.completed ? "text-ink" : "text-muted"}`}
                >
                  {e.display}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {board.data && board.data.hiddenCount > 0 ? (
        <p className="text-secondary text-muted">
          {t("hidden", { count: board.data.hiddenCount })}
        </p>
      ) : null}
    </div>
  );
}

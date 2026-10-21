import {
  DEVELOPMENT_AREAS,
  FamilyPlayerDetailResponseSchema,
  PLAYER_PHOTO_CONTENT_TYPES,
  PLAYER_PHOTO_MAX_BYTES,
  PLAYER_PHOTO_MAX_SIDE_PX,
  PlayerBasicResponseSchema,
  playerDisplayName,
  yearsSince,
  type PlayerEvent,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey, uploadFile } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { shrinkImage } from "@/lib/images";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Definitions,
  EmptyState,
  Icon,
  StatusChip,
  useToast,
} from "@/ui";

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-label uppercase tracking-wide text-muted">{children}</span>;
}

function InfoChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-chip bg-raised px-2.5 py-0.5 text-secondary font-medium text-ink">
      {children}
    </span>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-raised"
    >
      <div className="h-full rounded-full bg-club" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Ficha de uno de los suyos, para la familia (Bloque 13, ADR 0030): foto (y cambiarla), equipo y
 * cuerpo técnico, objetivo, PDI si el club lo ha compartido, puntos del reto y movimientos. Sin
 * indicadores, sin anotaciones del personal y sin comparar con nadie (DESIGN.md 0.10 y 10).
 */
export function FamilyPlayerPage() {
  const t = useT("familyPlayer");
  const tp = useT("player");
  const tf = useT("family");
  const rel = useT("relationships");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const dates = useDates();
  const { id = "" } = useParams();
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const canPhoto = org.actor.permissions.includes("org.family.write");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const detail = useQuery({
    queryKey: ["org", slug, "family", "player", id],
    queryFn: () =>
      apiFetch(`/api/org/family/players/${id}`, { schema: FamilyPlayerDetailResponseSchema }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  if (detail.isError) {
    const notFound = detail.error instanceof ApiClientError && detail.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(detail.error))}</Alert>
    );
  }
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const { player, teams, objective, developmentPlan, timeline, challenge } = detail.data;
  const name = playerDisplayName(player);
  const age = dates.age(player.birthDate);
  const current = teams.find((x) => x.seasonIsCurrent) ?? null;
  const eventText = (e: PlayerEvent) =>
    tp(`timeline.events.${e.kind}`, {
      team: "",
      season: "",
      title: "",
      progress: 0,
      status: "",
      text: "",
      challenge: "",
      points: 0,
      ...e.details,
    });

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const photo = await shrinkImage(file, PLAYER_PHOTO_MAX_SIDE_PX, PLAYER_PHOTO_MAX_BYTES);
      if (!(PLAYER_PHOTO_CONTENT_TYPES as readonly string[]).includes(photo.type)) {
        toast("error", errors("unsupported_media_type"));
        return;
      }
      if (photo.size > PLAYER_PHOTO_MAX_BYTES) {
        toast("error", errors("payload_too_large"));
        return;
      }
      await uploadFile(`/api/org/players/${id}/photo`, photo, PlayerBasicResponseSchema);
      toast("success", tp("photo.saved"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setPhotoBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }
  async function removePhoto() {
    setRemovingPhoto(false);
    try {
      await apiFetch(`/api/org/players/${id}/photo`, { method: "DELETE" });
      toast("success", tp("photo.removed"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const challengeProgress = challenge
    ? Math.round((challenge.approvedPoints / Math.max(1, challenge.targetPoints)) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ButtonLink
          to={paths.family}
          variant="tertiary"
          size="sm"
          icon={<Icon.ArrowLeft size={16} aria-hidden="true" />}
        >
          {t("back")}
        </ButtonLink>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap gap-4">
          <div className="flex flex-col items-center gap-2">
            <Avatar
              name={name}
              size="xl"
              src={player.photoUrl}
              alt={player.photoUrl ? tp("photo.alt", { name }) : undefined}
            />
            {canPhoto ? (
              <>
                <input
                  ref={photoInput}
                  type="file"
                  accept={PLAYER_PHOTO_CONTENT_TYPES.join(",")}
                  className="sr-only"
                  aria-label={tp("photo.change")}
                  disabled={photoBusy}
                  onChange={(e) => void uploadPhoto(e.target.files?.[0])}
                />
                <Button
                  variant="tertiary"
                  size="sm"
                  loading={photoBusy}
                  onClick={() => photoInput.current?.click()}
                >
                  {photoBusy ? tp("photo.uploading") : tp("photo.change")}
                </Button>
                {player.photoUrl ? (
                  <Button variant="tertiary" size="sm" onClick={() => setRemovingPhoto(true)}>
                    {tp("photo.remove")}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            {current ? (
              <Eyebrow>
                {current.category ?? current.sectionName} · {current.seasonName}
              </Eyebrow>
            ) : null}
            <h1 className="flex flex-wrap items-center gap-3 text-title1 lg:text-title1-lg text-ink">
              {name}
              {player.status === "inactive" ? (
                <StatusChip kind="neutral">{tf("inactive")}</StatusChip>
              ) : null}
            </h1>
            <p className="text-body text-muted">
              {tf("relationship", { relationship: rel(player.relationship).toLowerCase() })}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {age !== null ? <InfoChip>{tp("chips.age", { age })}</InfoChip> : null}
              <InfoChip>
                {tp("chips.yearsAtClub", {
                  count: yearsSince(player.joinedOn ?? player.createdAt),
                })}
              </InfoChip>
              {player.dominantFoot ? (
                <InfoChip>{tp(`dominantFoot.${player.dominantFoot}`)}</InfoChip>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Equipo de esta temporada y quién lo entrena. */}
        <Card title={t("team.title")} description={t("team.description")} padded={false}>
          {current ? (
            <div className="flex flex-col gap-3 px-5 pb-5">
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-title2 text-club-soft-text">
                  {current.shirtNumber ?? "–"}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-title2 text-ink">{current.teamName}</span>
                  <span className="text-secondary text-muted">
                    {current.sectionName} · {current.seasonName}
                    {current.position ? ` · ${current.position}` : ""}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-secondary text-muted">
                <Icon.Users size={16} aria-hidden="true" />
                {current.staff.length > 0 ? (
                  <span>
                    {tf("coaches")}: {current.staff.map((s) => s.name).join(", ")}
                  </span>
                ) : (
                  <span>{tf("noCoaches")}</span>
                )}
              </div>
            </div>
          ) : (
            <EmptyState icon={<Icon.UsersThree weight="duotone" />} title={tf("noTeam")} />
          )}
        </Card>

        {/* Reto: solo los puntos de este jugador, nunca los de otros. */}
        <Card
          title={
            <span className="flex flex-col gap-0.5">
              <Eyebrow>{t("challenge.eyebrow")}</Eyebrow>
              {challenge ? challenge.name : t("challenge.title")}
            </span>
          }
          actions={
            challenge ? (
              <ButtonLink to={`${paths.challenges}?player=${id}`} variant="secondary" size="sm">
                {t("challenge.open")}
              </ButtonLink>
            ) : null
          }
        >
          {challenge ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-3">
                <span className="font-mono text-display text-ink">{challenge.approvedPoints}</span>
                <span className="text-secondary text-muted">
                  {t("challenge.target", { target: challenge.targetPoints })}
                </span>
              </div>
              <ProgressBar
                value={challengeProgress}
                label={t("challenge.progressLabel", {
                  points: challenge.approvedPoints,
                  target: challenge.targetPoints,
                })}
              />
              <div className="flex flex-wrap gap-2">
                <StatusChip
                  kind={challenge.approvedPoints >= challenge.minPoints ? "success" : "neutral"}
                >
                  {t("challenge.min", { min: challenge.minPoints })}
                </StatusChip>
                {challenge.pendingPoints > 0 ? (
                  <StatusChip kind="info">
                    {t("challenge.pending", { points: challenge.pendingPoints })}
                  </StatusChip>
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyState icon={<Icon.Trophy weight="duotone" />} title={t("challenge.none")} />
          )}
        </Card>

        {/* Objetivo individual: la prioridad del club con este jugador. */}
        <Card
          title={
            <span className="flex flex-col gap-0.5">
              <Eyebrow>{tp("objective.eyebrow")}</Eyebrow>
              {tp("objective.title")}
            </span>
          }
        >
          {objective ? (
            <div className="flex flex-col gap-4">
              <p className="text-title2 lg:text-title2-lg text-ink">{objective.title}</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-secondary text-muted">
                  <span>{tp("objective.progress")}</span>
                  <span className="font-mono text-ink">{objective.progress}%</span>
                </div>
                <ProgressBar
                  value={objective.progress}
                  label={tp("objective.progressLabel", { progress: objective.progress })}
                />
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-secondary text-muted">
                <span>
                  {objective.owner
                    ? tp("objective.owner", { name: objective.owner.name })
                    : tp("objective.noOwner")}
                </span>
                <span>
                  {objective.reviewOn
                    ? tp("objective.review", { date: dates.day(objective.reviewOn) })
                    : tp("objective.noReview")}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState icon={<Icon.SportIcons.Trofeo />} title={t("objective.empty")} />
          )}
        </Card>

        {/* Datos del jugador: lo que la familia ya conoce, para comprobar que está bien. */}
        <Card title={tp("sportsData.title")}>
          <Definitions
            items={[
              { term: tp("born"), detail: player.birthDate ? dates.day(player.birthDate) : "–" },
              {
                term: tp("since"),
                detail: dates.day(player.joinedOn ?? player.createdAt.slice(0, 10)),
              },
              { term: tp("sportsData.position"), detail: current?.position ?? "–" },
              {
                term: tp("sportsData.height"),
                detail: (
                  <span className="font-mono">
                    {player.heightCm === null
                      ? "–"
                      : tp("sportsData.heightValue", { cm: player.heightCm })}
                  </span>
                ),
              },
              {
                term: tp("sportsData.foot"),
                detail: tp(`dominantFoot.${player.dominantFoot ?? "unknown"}`),
              },
            ]}
          />
        </Card>
      </div>

      {/* PDI: solo cuando el club lo comparte. */}
      <Card
        title={
          <span className="flex flex-col gap-0.5">
            <Eyebrow>{tp("plan.eyebrow")}</Eyebrow>
            {tp("plan.title")}
          </span>
        }
        description={t("plan.description")}
        footer={
          developmentPlan ? (
            <div className="flex w-full flex-wrap justify-between gap-x-4 gap-y-1 text-secondary text-muted">
              <span>
                {developmentPlan.coordinator
                  ? tp("plan.coordinator", { name: developmentPlan.coordinator.name })
                  : tp("plan.noCoordinator")}
              </span>
              <span>
                {developmentPlan.nextReviewOn
                  ? tp("plan.nextReview", { date: dates.day(developmentPlan.nextReviewOn) })
                  : tp("plan.noReview")}
              </span>
            </div>
          ) : null
        }
      >
        {developmentPlan ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEVELOPMENT_AREAS.map((area) => (
              <li
                key={area}
                className="flex flex-col gap-1 rounded-card border border-border bg-page p-4"
              >
                <Eyebrow>{tp(`developmentAreas.${area}`)}</Eyebrow>
                {developmentPlan[area] ? (
                  <span className="text-body font-medium text-ink">{developmentPlan[area]}</span>
                ) : (
                  <span className="text-body text-muted">{tp("plan.undefined")}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Icon.SportIcons.PruebaFisica />}
            title={t("plan.notShared")}
            description={t("plan.notSharedHint")}
          />
        )}
      </Card>

      {/* Movimientos: entradas en plantilla, objetivos, fotos, retos. Sin anotaciones del personal. */}
      <Card
        title={
          <span className="flex flex-col gap-0.5">
            <Eyebrow>{tp("timeline.eyebrow")}</Eyebrow>
            {tp("timeline.title")}
          </span>
        }
        actions={
          <StatusChip kind="neutral">{tp("timeline.count", { count: timeline.length })}</StatusChip>
        }
      >
        <ol className="flex flex-col">
          {timeline.map((e) => (
            <li
              key={e.id}
              className="relative border-l border-line pb-5 pl-6 last:border-l-transparent last:pb-0"
            >
              <span
                aria-hidden="true"
                className="absolute top-1.5 -left-[6px] size-3 rounded-full border-2 border-club bg-surface"
              />
              <div className="flex flex-col">
                <span className="text-secondary text-muted">{dates.day(e.happenedOn)}</span>
                <span className="text-body font-medium text-ink">{eventText(e)}</span>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <ConfirmDialog
        open={removingPhoto}
        title={tp("photo.confirmRemoveTitle", { name })}
        body={tp("photo.confirmRemoveBody")}
        confirmLabel={tp("photo.remove")}
        cancelLabel={c("cancel")}
        onConfirm={() => void removePhoto()}
        onCancel={() => setRemovingPhoto(false)}
      />
    </div>
  );
}

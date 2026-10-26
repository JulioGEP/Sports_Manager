import {
  DEVELOPMENT_AREAS,
  DEVELOPMENT_GOAL_MAX,
  DEVELOPMENT_PLAN_STATUSES,
  DOMINANT_FEET,
  EligibleMembersResponseSchema,
  FAMILY_RELATIONSHIPS,
  InvitationSentResponseSchema,
  LOCALES,
  PLAYER_HEIGHT_MAX_CM,
  PLAYER_HEIGHT_MIN_CM,
  PLAYER_INDICATOR_DIMENSIONS,
  PLAYER_INDICATOR_NOTE_MAX,
  PLAYER_NOTE_MAX,
  PLAYER_OBJECTIVE_TITLE_MAX,
  PLAYER_PHOTO_CONTENT_TYPES,
  PLAYER_PHOTO_MAX_BYTES,
  PLAYER_PHOTO_MAX_SIDE_PX,
  PlayerDetailResponseSchema,
  PlayerResponseSchema,
  playerDisplayName,
  yearsSince,
  type DevelopmentPlanStatus,
  type DominantFoot,
  type PersonGender,
  PERSON_GENDERS,
  type FamilyRelationship,
  type Guardian,
  type Locale,
  type PlayerDetailResponse,
  type PlayerEvent,
  type PlayerIndicatorDimension,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey, uploadFile } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { shrinkImage } from "@/lib/images";
import { useT } from "@/lib/intl";
import { useVoice } from "@/lib/voice";
import { PlayerMatchesCard } from "@/components/player-matches";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  CopyLink,
  Definitions,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  Sheet,
  StatusChip,
  useToast,
  type StatusKind,
  BackLink,
} from "@/ui";

type Player = PlayerDetailResponse["player"];
type Pending = PlayerDetailResponse["pendingInvitations"][number];
type Objective = NonNullable<PlayerDetailResponse["objective"]>;
type Plan = NonNullable<PlayerDetailResponse["developmentPlan"]>;
type Indicator = PlayerDetailResponse["indicators"][number];
type SheetName =
  "edit" | "invite" | "link" | "objective" | "indicators" | "plan" | "note" | "staff" | "athlete";

const inviteKind: Record<Pending["state"], StatusKind> = {
  pending: "info",
  accepted: "success",
  revoked: "neutral",
  expired: "warning",
};

const planKind: Record<DevelopmentPlanStatus, StatusKind> = {
  draft: "warning",
  active: "info",
  shared: "success",
};

/** Ancla de la tarjeta Familia: "Gestionar accesos" y "Accesos familiares" bajan hasta ella. */
const FAMILY_ANCHOR = "familia";

/** Fecha de hoy en `AAAA-MM-DD`, para saber si una revisión ya ha pasado. */
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Barra de progreso de 0 a 100 en color del club. Siempre con la cifra al lado (DESIGN.md 0.5). */
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

/** Píldora informativa de la cabecera: edad, años en el club, pie, accesos. */
function InfoChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-chip bg-raised px-2.5 py-0.5 text-secondary font-medium text-ink">
      {children}
    </span>
  );
}

/** Etiqueta de sección en mayúsculas pequeñas, como pide el contexto Precisa (DESIGN.md 4). */
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-label uppercase tracking-wide text-muted">{children}</span>;
}

/** Miembros con rol de entrenador o administración: responsables del objetivo o del PDI. */
function useEligibleStaff(playerId: string) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: ["org", slug, "player", playerId, "eligible-staff"],
    queryFn: () =>
      apiFetch(`/api/org/players/${playerId}/eligible-staff`, {
        schema: EligibleMembersResponseSchema,
      }),
  });
}

/**
 * Ficha de un jugador (Bloque 11 y 12): quién es, cómo está y qué necesita hoy. Datos de
 * menores: solo personal del club. Cabecera con foto, indicadores, objetivo individual, acciones
 * prioritarias, timeline, datos deportivos, PDI, equipos, familia y estado.
 */
export function PlayerPage() {
  const t = useT("player");
  const positionsT = useT("positions");
  const genders = useT("genders");
  const ps = useT("playerStatus");
  const rel = useT("relationships");
  const states = useT("invitationState");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const dates = useDates();
  const voice = useVoice();
  const { id = "" } = useParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canSeeMatches = permissions.includes("org.matches.read");
  const canWrite = permissions.includes("org.players.write");
  const canInvite = permissions.includes("org.members.invite");
  const canChallenges = permissions.includes("org.challenges.read");
  /** Rendimiento (ADR 0039): disponibilidad, carga, bienestar, tests y, con acceso, la salud. */
  const canSeePerformance =
    permissions.includes("org.load.read") || permissions.includes("org.health.read");

  const detail = useQuery({
    queryKey: ["org", slug, "player", id],
    queryFn: () => apiFetch(`/api/org/players/${id}`, { schema: PlayerDetailResponseSchema }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [unlinking, setUnlinking] = useState<Guardian | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [removingObjective, setRemovingObjective] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

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
  const { player, teams, objective, indicators, developmentPlan } = detail.data;
  // La cuenta del propio deportista (ADR 0046) va aparte de la familia.
  const athleteAccount = detail.data.guardians.find((g) => g.relationship === "self") ?? null;
  const athleteInvite =
    detail.data.pendingInvitations.find((i) => i.relationship === "self") ?? null;
  const guardians = detail.data.guardians.filter((g) => g.relationship !== "self");
  const pendingInvitations = detail.data.pendingInvitations.filter(
    (i) => i.relationship !== "self",
  );
  const timeline = detail.data.timeline;
  /** Personal asignado (Bloque 19): quien atiende al deportista sin llevar su equipo. */
  const assignedStaff = detail.data.staff;
  const canAssignStaff = detail.data.access.staff;
  /** Valorar y cambiar la foto: lo decide la API (permiso de club o cuerpo técnico del jugador). */
  const canAssess = detail.data.access.assess;
  const canPhoto = detail.data.access.photo;
  const name = playerDisplayName(player);
  const age = dates.age(player.birthDate);
  const current = teams.find((x) => x.seasonIsCurrent) ?? null;
  const today = todayIso();
  const headline = current
    ? [
        current.teamName,
        current.shirtNumber === null ? null : t("number", { number: current.shirtNumber }),
        current.position,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("noCurrentTeam");

  async function setStatus(status: Player["status"]) {
    setDeactivating(false);
    try {
      await apiFetch(`/api/org/players/${id}`, {
        method: "PATCH",
        body: { status },
        schema: PlayerResponseSchema,
      });
      toast(
        "success",
        status === "inactive" ? t("deactivated", { name }) : t("reactivated", { name }),
      );
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function unlink(g: Guardian) {
    setUnlinking(null);
    try {
      await apiFetch(`/api/org/players/${id}/guardians/${g.userId}`, { method: "DELETE" });
      toast("success", t("unlinked", { name: g.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function unassignStaff(member: { userId: string; name: string }) {
    try {
      await apiFetch(`/api/org/players/${id}/staff/${member.userId}`, { method: "DELETE" });
      toast("success", t("staff.removed", { member: member.name, name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
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
      await uploadFile(`/api/org/players/${id}/photo`, photo, PlayerDetailResponseSchema);
      toast("success", t("photo.saved"));
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
      await apiFetch(`/api/org/players/${id}/photo`, {
        method: "DELETE",
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("photo.removed"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function removeObjective() {
    setRemovingObjective(false);
    try {
      await apiFetch(`/api/org/players/${id}/objective`, {
        method: "DELETE",
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("objective.removed"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  /** Lo que la ficha necesita hoy, deducido de lo que falta. Sin datos de más, sin red. */
  const pending: { key: string; onClick?: () => void; to?: string; external?: boolean }[] = [];
  // Cada acción lleva su atajo solo si quien mira puede hacerla; si no, queda como aviso.
  const photoAction = canPhoto ? { onClick: () => photoInput.current?.click() } : {};
  const editAction = canWrite ? { onClick: () => setSheet("edit") } : {};
  const assessAction = (sheet: SheetName) => (canAssess ? { onClick: () => setSheet(sheet) } : {});
  if (!player.photoUrl) pending.push({ key: "photo", ...photoAction });
  if (!player.birthDate) pending.push({ key: "birthDate", ...editAction });
  if (player.heightCm === null || player.dominantFoot === null)
    pending.push({ key: "sportsData", ...editAction });
  // El adulto que entra con su cuenta (ADR 0046) no necesita a su familia para tener acceso.
  if (
    guardians.length === 0 &&
    !athleteAccount &&
    !detail.data.pendingInvitations.some((i) => i.state === "pending")
  )
    pending.push({ key: "family", to: `#${FAMILY_ANCHOR}`, external: true });
  if (!current) pending.push({ key: "team", to: paths.teams });
  if (!objective) pending.push({ key: "objective", ...assessAction("objective") });
  else if (objective.reviewOn && objective.reviewOn < today)
    pending.push({ key: "objectiveReview", ...assessAction("objective") });
  if (indicators.length < PLAYER_INDICATOR_DIMENSIONS.length)
    pending.push({ key: "indicators", ...assessAction("indicators") });
  if (!developmentPlan) pending.push({ key: "plan", ...assessAction("plan") });
  else if (developmentPlan.nextReviewOn && developmentPlan.nextReviewOn < today)
    pending.push({ key: "planReview", ...assessAction("plan") });

  const indicatorBy = new Map(indicators.map((i) => [i.dimension, i] as const));
  const eventText = (e: PlayerEvent) =>
    t(`timeline.events.${e.kind}`, {
      team: "",
      season: "",
      title: "",
      progress: 0,
      status: "",
      text: "",
      ...e.details,
    });

  return (
    <div className="flex flex-col gap-5">
      <BackLink to={paths.players}>{t("back")}</BackLink>

      {/* Cabecera: foto, equipo y temporada, nombre, estado, dorsal y posición, y lecturas rápidas. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap gap-4">
          <div className="flex flex-col items-center gap-2">
            <Avatar
              name={name}
              size="xl"
              src={player.photoUrl}
              alt={player.photoUrl ? t("photo.alt", { name }) : undefined}
            />
            {canPhoto ? (
              <>
                <input
                  ref={photoInput}
                  type="file"
                  accept={PLAYER_PHOTO_CONTENT_TYPES.join(",")}
                  className="sr-only"
                  aria-label={t("photo.change")}
                  disabled={photoBusy}
                  onChange={(e) => void uploadPhoto(e.target.files?.[0])}
                />
                <Button
                  action="photo"
                  variant="tertiary"
                  size="sm"
                  loading={photoBusy}
                  onClick={() => photoInput.current?.click()}
                >
                  {photoBusy ? t("photo.uploading") : t("photo.change")}
                </Button>
                {player.photoUrl ? (
                  <Button
                    action="delete"
                    variant="danger"
                    size="sm"
                    onClick={() => setRemovingPhoto(true)}
                  >
                    {t("photo.remove")}
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
              <StatusChip kind={player.status === "active" ? "success" : "neutral"}>
                {ps(player.status)}
              </StatusChip>
            </h1>
            <p className="text-body text-muted">{headline}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {age !== null ? <InfoChip>{t("chips.age", { age })}</InfoChip> : null}
              <InfoChip>
                {t("chips.yearsAtClub", {
                  count: yearsSince(player.joinedOn ?? player.createdAt),
                })}
              </InfoChip>
              {player.dominantFoot ? (
                <InfoChip>{t(`dominantFoot.${player.dominantFoot}`)}</InfoChip>
              ) : null}
              <InfoChip>{t("chips.familyAccess", { count: guardians.length })}</InfoChip>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeePerformance ? (
            <ButtonLink
              to={paths.playerPerformance(id)}
              variant="secondary"
              icon={<Icon.Heartbeat size={18} aria-hidden="true" />}
            >
              {t("performance")}
            </ButtonLink>
          ) : null}
          {canWrite ? (
            <Button action="edit" variant="secondary" onClick={() => setSheet("edit")}>
              {t("editProfile")}
            </Button>
          ) : null}
          <ButtonLink
            to={`#${FAMILY_ANCHOR}`}
            external
            variant="secondary"
            icon={<Icon.HandHeart size={18} aria-hidden="true" />}
          >
            {t("manageAccess")}
          </ButtonLink>
        </div>
      </header>

      {/* Indicadores: cuatro lecturas de 0 a 100 con su nota. */}
      <Card
        title={t("indicators.title")}
        description={t("indicators.description")}
        actions={
          canAssess ? (
            <Button variant="secondary" size="sm" onClick={() => setSheet("indicators")}>
              {t("indicators.rate")}
            </Button>
          ) : null
        }
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAYER_INDICATOR_DIMENSIONS.map((dimension) => {
            const item = indicatorBy.get(dimension) ?? null;
            const label = t(`indicatorNames.${dimension}`);
            return (
              <li
                key={dimension}
                className="flex flex-col gap-2 rounded-card border border-border bg-page p-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-label text-club-soft-text"
                  >
                    {t(`indicatorCodes.${dimension}`)}
                  </span>
                  <Eyebrow>{label}</Eyebrow>
                </div>
                {item ? (
                  <>
                    <span className="font-mono text-title1 lg:text-title1-lg text-ink">
                      {item.score}
                    </span>
                    <span className="min-h-5 text-secondary text-muted">{item.note ?? ""}</span>
                    <ProgressBar
                      value={item.score}
                      label={t("indicators.progressLabel", { dimension: label, score: item.score })}
                    />
                  </>
                ) : (
                  <span className="text-body text-muted">{t("indicators.unrated")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Prioridad actual y qué hace falta hoy. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title={
            <span className="flex flex-col gap-0.5">
              <Eyebrow>{t("objective.eyebrow")}</Eyebrow>
              {t("objective.title")}
            </span>
          }
          actions={
            canAssess ? (
              <>
                {objective ? (
                  <Button
                    action="delete"
                    variant="danger"
                    size="sm"
                    onClick={() => setRemovingObjective(true)}
                  >
                    {t("objective.remove")}
                  </Button>
                ) : null}
                <Button
                  action={objective ? "edit" : "add"}
                  variant="secondary"
                  size="sm"
                  onClick={() => setSheet("objective")}
                >
                  {objective ? t("objective.edit") : t("objective.define")}
                </Button>
              </>
            ) : null
          }
        >
          {objective ? (
            <div className="flex flex-col gap-4">
              <p className="text-title2 lg:text-title2-lg text-ink">{objective.title}</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-secondary text-muted">
                  <span>{t("objective.progress")}</span>
                  <span className="font-mono text-ink">{objective.progress}%</span>
                </div>
                <ProgressBar
                  value={objective.progress}
                  label={t("objective.progressLabel", { progress: objective.progress })}
                />
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-secondary text-muted">
                <span>
                  {objective.owner
                    ? t("objective.owner", { name: objective.owner.name })
                    : t("objective.noOwner")}
                </span>
                <span>
                  {objective.reviewOn
                    ? t("objective.review", { date: dates.day(objective.reviewOn) })
                    : t("objective.noReview")}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Icon.SportIcons.Trofeo />}
              title={t("objective.empty")}
              description={t("objective.emptyHint")}
              action={
                canAssess ? (
                  <Button
                    action="add"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSheet("objective")}
                  >
                    {t("objective.define")}
                  </Button>
                ) : null
              }
            />
          )}
        </Card>

        <Card
          title={
            <span className="flex flex-col gap-0.5">
              <Eyebrow>{t("actions.eyebrow")}</Eyebrow>
              {t("actions.title")}
            </span>
          }
          padded={false}
        >
          {pending.length === 0 ? (
            <EmptyState
              icon={<Icon.CheckCircle weight="duotone" />}
              title={t("actions.allDone")}
              description={t("actions.allDoneHint")}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {pending.map((item) => (
                <li key={item.key} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full bg-warning-soft ring-2 ring-warning"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-ink">{t(`actions.${item.key}`)}</span>
                    <span className="text-secondary text-muted">
                      {t(`actions.${item.key}Hint`)}
                    </span>
                  </span>
                  {item.to ? (
                    <ButtonLink
                      action="open"
                      to={item.to}
                      external={item.external ?? false}
                      variant="tertiary"
                      size="sm"
                    >
                      {t("actions.go")}
                    </ButtonLink>
                  ) : item.onClick ? (
                    <Button action="open" variant="tertiary" size="sm" onClick={item.onClick}>
                      {t("actions.go")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Timeline, datos deportivos y acciones rápidas. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title={
            <span className="flex flex-col gap-0.5">
              <Eyebrow>{t("timeline.eyebrow")}</Eyebrow>
              {t("timeline.title")}
            </span>
          }
          actions={
            <>
              <StatusChip kind="neutral">
                {t("timeline.count", { count: timeline.length })}
              </StatusChip>
              {canAssess ? (
                <Button action="add" variant="secondary" size="sm" onClick={() => setSheet("note")}>
                  {t("timeline.add")}
                </Button>
              ) : null}
            </>
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
                  <span className="text-secondary text-muted">
                    {dates.day(e.happenedOn)}
                    {e.actorName ? ` · ${t("timeline.by", { name: e.actorName })}` : ""}
                  </span>
                  <span className="text-body font-medium text-ink">{eventText(e)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title={t("sportsData.title")} description={t("sportsData.description")}>
            <Definitions
              items={[
                {
                  term: t("sportsData.team"),
                  detail: current ? (
                    <Link to={paths.team(current.teamId)}>{current.teamName}</Link>
                  ) : (
                    "–"
                  ),
                },
                { term: t("sportsData.category"), detail: current?.category ?? "–" },
                { term: t("sportsData.position"), detail: current?.position ?? "–" },
                {
                  term: t("sportsData.number"),
                  detail: (
                    <span className="font-mono">
                      {current?.shirtNumber === null || current?.shirtNumber === undefined
                        ? "–"
                        : current.shirtNumber}
                    </span>
                  ),
                },
                {
                  term: t("sportsData.height"),
                  detail: (
                    <span className="font-mono">
                      {player.heightCm === null
                        ? "–"
                        : t("sportsData.heightValue", { cm: player.heightCm })}
                    </span>
                  ),
                },
                {
                  term: t("sportsData.foot"),
                  detail: t(`dominantFoot.${player.dominantFoot ?? "unknown"}`),
                },
                {
                  term: t("sportsData.birthYear"),
                  detail: (
                    <span className="font-mono">
                      {player.birthDate ? player.birthDate.slice(0, 4) : "–"}
                    </span>
                  ),
                },
              ]}
            />
          </Card>
          <Card title={t("quickActions.title")}>
            <div className="flex flex-col gap-2">
              {current ? (
                <ButtonLink action="open" to={paths.team(current.teamId)} variant="secondary">
                  {t("quickActions.openTeam", { team: current.teamName })}
                </ButtonLink>
              ) : null}
              <ButtonLink action="open" to={`#${FAMILY_ANCHOR}`} external variant="secondary">
                {t("quickActions.familyAccess")}
              </ButtonLink>
              {canChallenges ? (
                <ButtonLink
                  action="open"
                  to={current ? `${paths.team(current.teamId)}#challenges` : paths.challenges}
                  variant="secondary"
                >
                  {t("quickActions.challenge")}
                </ButtonLink>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Plan de desarrollo individual: seis áreas, una línea por área. */}
      <Card
        title={
          <span className="flex flex-col gap-0.5">
            <Eyebrow>{t("plan.eyebrow")}</Eyebrow>
            {t("plan.title")}
          </span>
        }
        description={t("plan.description")}
        actions={
          <>
            {developmentPlan ? (
              <StatusChip kind={planKind[developmentPlan.status]}>
                {t(`planStatus.${developmentPlan.status}`)}
              </StatusChip>
            ) : null}
            {canAssess ? (
              <Button
                action={developmentPlan ? "edit" : "add"}
                variant="secondary"
                size="sm"
                onClick={() => setSheet("plan")}
              >
                {developmentPlan ? t("plan.edit") : t("plan.create")}
              </Button>
            ) : null}
          </>
        }
        footer={
          developmentPlan ? (
            <div className="flex w-full flex-wrap justify-between gap-x-4 gap-y-1 text-secondary text-muted">
              <span>
                {developmentPlan.coordinator
                  ? t("plan.coordinator", { name: developmentPlan.coordinator.name })
                  : t("plan.noCoordinator")}
              </span>
              <span>
                {developmentPlan.nextReviewOn
                  ? t("plan.nextReview", { date: dates.day(developmentPlan.nextReviewOn) })
                  : t("plan.noReview")}
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
                <Eyebrow>{t(`developmentAreas.${area}`)}</Eyebrow>
                {developmentPlan[area] ? (
                  <span className="text-body font-medium text-ink">{developmentPlan[area]}</span>
                ) : (
                  <span className="text-body text-muted">{t("plan.undefined")}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Icon.SportIcons.PruebaFisica />}
            title={t("plan.empty")}
            description={t("plan.emptyHint")}
            action={
              canAssess ? (
                <Button action="add" variant="secondary" size="sm" onClick={() => setSheet("plan")}>
                  {t("plan.create")}
                </Button>
              ) : null
            }
          />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("data")} description={t("dataDescription")}>
          <Definitions
            items={[
              { term: t("born"), detail: player.birthDate ? dates.day(player.birthDate) : "–" },
              { term: t("age"), detail: age === null ? "–" : String(age) },
              {
                term: t("since"),
                detail: dates.day(player.joinedOn ?? player.createdAt.slice(0, 10)),
              },
              { term: t("person.gender"), detail: player.gender ? genders(player.gender) : "–" },
              { term: t("person.email"), detail: player.email ?? "–" },
              { term: t("person.phone"), detail: player.phone ?? "–" },
              { term: t("person.nationalId"), detail: player.nationalId ?? "–" },
              {
                term: t("person.member"),
                detail: player.clubMember ? (
                  <Link to={paths.clubMember(player.clubMember.id)}>
                    {t("person.memberNumber", { number: player.clubMember.memberNumber })}
                  </Link>
                ) : permissions.includes("org.club_members.write") ? (
                  <Link to={`${paths.clubMembers}?new=1&person=${player.personId}`}>
                    {t("person.makeMember")}
                  </Link>
                ) : (
                  t("person.notMember")
                ),
              },
            ]}
          />
        </Card>

        {canSeeMatches ? <PlayerMatchesCard playerId={id} /> : null}

        <Card title={t("teams")} description={t("teamsDescription")} padded={false}>
          {teams.length === 0 ? (
            <EmptyState icon={<Icon.UsersThree weight="duotone" />} title={t("emptyTeams")} />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {teams.map((x) => (
                <li key={x.teamId} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-body text-club-soft-text">
                    {x.shirtNumber ?? "–"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link to={paths.team(x.teamId)} className="truncate font-medium text-ink">
                      {x.teamName}
                    </Link>
                    <span className="truncate text-secondary text-muted">
                      {x.sectionName} · {x.seasonName}
                      {x.position ? ` · ${x.position}` : ""}
                    </span>
                  </span>
                  {x.seasonIsCurrent ? (
                    <StatusChip kind="club">{t("currentSeason")}</StatusChip>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div id={FAMILY_ANCHOR} className="scroll-mt-6">
          <Card
            title={t("family")}
            description={t("familyDescription")}
            padded={false}
            actions={
              canWrite ? (
                <>
                  <Button
                    action="link"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSheet("link")}
                  >
                    {t("linkMember")}
                  </Button>
                  {canInvite ? (
                    <Button action="invite" size="sm" onClick={() => setSheet("invite")}>
                      {t("inviteFamily")}
                    </Button>
                  ) : null}
                </>
              ) : null
            }
          >
            {lastLink && lastLink.email !== athleteInvite?.email ? (
              <div className="px-5 pb-4">
                <CopyLink
                  url={lastLink.url}
                  hint={t("inviteSheet.linkHint", { email: lastLink.email })}
                  copyLabel={c("copy")}
                  copiedLabel={c("copied")}
                />
              </div>
            ) : null}
            {guardians.length === 0 && pendingInvitations.length === 0 ? (
              <EmptyState icon={<Icon.HandHeart weight="duotone" />} title={t("emptyFamily")} />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {guardians.map((g) => (
                  <li
                    key={g.userId}
                    className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <Avatar name={g.name} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-ink">{g.name}</span>
                      <span className="truncate text-secondary text-muted">{g.email}</span>
                    </span>
                    <StatusChip kind="club">{rel(g.relationship)}</StatusChip>
                    {canWrite ? (
                      <Button
                        iconOnly
                        action="unlink"
                        variant="tertiary"
                        size="sm"
                        onClick={() => setUnlinking(g)}
                      >
                        {t("unlink")}
                      </Button>
                    ) : null}
                  </li>
                ))}
                {pendingInvitations.map((i) => (
                  <li key={i.id} className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised text-muted">
                      <Icon.Envelope size={20} aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-ink">{i.email}</span>
                      <span className="truncate text-secondary text-muted">
                        {i.relationship ? rel(i.relationship) : t("pendingInvitations")} ·{" "}
                        {dates.day(i.expiresAt.slice(0, 10))}
                      </span>
                    </span>
                    <StatusChip kind={inviteKind[i.state]}>{states(i.state)}</StatusChip>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* El propio deportista con su cuenta (ADR 0046): su ficha, su plan y su bienestar. */}
        <Card
          title={t("athleteAccess.title")}
          description={t("athleteAccess.description")}
          padded={false}
          actions={
            canWrite && !athleteAccount && athleteInvite?.state !== "pending" ? (
              <Button
                action="add"
                variant="secondary"
                size="sm"
                onClick={() => setSheet("athlete")}
              >
                {t("athleteAccess.give")}
              </Button>
            ) : null
          }
        >
          {athleteAccount ? (
            <div className="flex min-h-16 flex-wrap items-center gap-3 px-5 pb-4">
              <Avatar name={athleteAccount.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-ink">{athleteAccount.name}</span>
                <span className="truncate text-secondary text-muted">{athleteAccount.email}</span>
              </span>
              <StatusChip kind="success">{t("athleteAccess.active")}</StatusChip>
              {canWrite ? (
                <Button
                  iconOnly
                  action="unlink"
                  variant="tertiary"
                  size="sm"
                  onClick={() => setUnlinking(athleteAccount)}
                >
                  {t("athleteAccess.remove")}
                </Button>
              ) : null}
            </div>
          ) : athleteInvite ? (
            <div className="flex flex-col">
              {lastLink && lastLink.email === athleteInvite.email ? (
                <div className="px-5 pb-4">
                  <CopyLink
                    url={lastLink.url}
                    hint={t("inviteSheet.linkHint", { email: lastLink.email })}
                    copyLabel={c("copy")}
                    copiedLabel={c("copied")}
                  />
                </div>
              ) : null}
              <div className="flex min-h-16 flex-wrap items-center gap-3 px-5 pb-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised text-muted">
                  <Icon.Envelope size={20} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-ink">{athleteInvite.email}</span>
                  <span className="truncate text-secondary text-muted">
                    {t("athleteAccess.invited", {
                      date: dates.day(athleteInvite.expiresAt.slice(0, 10)),
                    })}
                  </span>
                </span>
                <StatusChip kind={inviteKind[athleteInvite.state]}>
                  {states(athleteInvite.state)}
                </StatusChip>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Icon.UserCircle weight="duotone" />}
              title={t("athleteAccess.empty")}
              description={t("athleteAccess.emptyHint")}
            />
          )}
        </Card>

        <Card
          title={t("staff.title")}
          description={t("staff.description")}
          padded={false}
          actions={
            canAssignStaff ? (
              <Button variant="secondary" size="sm" onClick={() => setSheet("staff")}>
                {t("staff.assign")}
              </Button>
            ) : null
          }
        >
          {assignedStaff.length === 0 ? (
            <EmptyState icon={<Icon.Heartbeat weight="duotone" />} title={t("staff.empty")} />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {assignedStaff.map((member) => (
                <li
                  key={member.userId}
                  className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3"
                >
                  <Avatar name={member.name} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-ink">{member.name}</span>
                  </span>
                  {member.position ? (
                    <StatusChip kind="club">{positionsT(member.position)}</StatusChip>
                  ) : null}
                  {canAssignStaff ? (
                    <Button variant="tertiary" size="sm" onClick={() => void unassignStaff(member)}>
                      {t("staff.remove")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canWrite ? (
          <Card title={t("status")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusChip kind={player.status === "active" ? "success" : "neutral"}>
                {ps(player.status)}
              </StatusChip>
              {player.status === "active" ? (
                <Button
                  action="deactivate"
                  variant="danger"
                  size="sm"
                  onClick={() => setDeactivating(true)}
                >
                  {t("deactivate")}
                </Button>
              ) : (
                <Button
                  action="restore"
                  variant="secondary"
                  size="sm"
                  onClick={() => void setStatus("active")}
                >
                  {t("reactivate")}
                </Button>
              )}
            </div>
          </Card>
        ) : null}
      </div>

      {sheet === "edit" ? (
        <EditPlayerSheet
          player={player}
          onClose={() => setSheet(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      {sheet === "objective" ? (
        <ObjectiveSheet
          playerId={id}
          playerName={name}
          objective={objective}
          onClose={() => setSheet(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      {sheet === "indicators" ? (
        <IndicatorsSheet
          playerId={id}
          playerName={name}
          indicators={indicators}
          onClose={() => setSheet(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      {sheet === "plan" ? (
        <PlanSheet
          playerId={id}
          playerName={name}
          plan={developmentPlan}
          onClose={() => setSheet(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      {sheet === "note" ? (
        <NoteSheet
          playerId={id}
          playerName={name}
          onClose={() => setSheet(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      {sheet === "invite" ? (
        <InviteFamilySheet
          playerId={id}
          playerName={name}
          defaultLocale={org.organization.view === "full" ? org.organization.defaultLocale : "es"}
          onClose={() => setSheet(null)}
          onSent={(email, url) => {
            if (url) setLastLink({ email, url });
            void reload();
          }}
        />
      ) : null}
      {sheet === "link" ? (
        <LinkMemberSheet
          playerId={id}
          playerName={name}
          excluded={guardians.map((g) => g.userId)}
          onClose={() => setSheet(null)}
          onLinked={() => void reload()}
        />
      ) : null}
      {sheet === "athlete" ? (
        <AthleteAccessSheet
          playerId={id}
          playerName={name}
          playerEmail={player.email}
          canInvite={canInvite}
          defaultLocale={org.organization.view === "full" ? org.organization.defaultLocale : "es"}
          onClose={() => setSheet(null)}
          onDone={(email, url) => {
            if (email && url) setLastLink({ email, url });
            void reload();
          }}
        />
      ) : null}
      {sheet === "staff" ? (
        <AssignStaffSheet
          playerId={id}
          playerName={name}
          excluded={assignedStaff.map((m) => m.userId)}
          onClose={() => setSheet(null)}
          onAssigned={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={unlinking !== null}
        title={
          unlinking?.relationship === "self"
            ? t("athleteAccess.confirmRemoveTitle", { name: unlinking.name })
            : t("confirmUnlinkTitle", { name: unlinking?.name ?? "" })
        }
        body={
          unlinking?.relationship === "self"
            ? t("athleteAccess.confirmRemoveBody")
            : t("confirmUnlinkBody")
        }
        confirmLabel={unlinking?.relationship === "self" ? t("athleteAccess.remove") : t("unlink")}
        confirmAction="unlink"
        cancelLabel={c("cancel")}
        onConfirm={() => unlinking && void unlink(unlinking)}
        onCancel={() => setUnlinking(null)}
      />
      <ConfirmDialog
        open={removingPhoto}
        title={t("photo.confirmRemoveTitle", { name })}
        body={t("photo.confirmRemoveBody")}
        confirmLabel={t("photo.remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => void removePhoto()}
        onCancel={() => setRemovingPhoto(false)}
      />
      <ConfirmDialog
        open={removingObjective}
        title={t("objective.confirmRemoveTitle", { name })}
        body={t("objective.confirmRemoveBody")}
        confirmLabel={t("objective.remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => void removeObjective()}
        onCancel={() => setRemovingObjective(false)}
      />
      {/* Dar de baja es un momento sensible: texto del design system, siempre en voz profesional. */}
      <ConfirmDialog
        open={deactivating}
        title={voice("member.remove.title", { player: name })}
        body={voice("member.remove.body")}
        confirmLabel={voice("member.remove.confirm")}
        confirmAction="deactivate"
        cancelLabel={c("cancel")}
        onConfirm={() => void setStatus("inactive")}
        onCancel={() => setDeactivating(false)}
      />
    </div>
  );
}

function EditPlayerSheet({
  player,
  onClose,
  onSaved,
}: {
  player: Player;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("player.editSheet");
  const tp = useT("players.sheet");
  const feet = useT("player.dominantFoot");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [firstName, setFirstName] = useState(player.firstName);
  const [lastName, setLastName] = useState(player.lastName);
  const [birthDate, setBirthDate] = useState(player.birthDate ?? "");
  const [joinedOn, setJoinedOn] = useState(player.joinedOn ?? "");
  const [dominantFoot, setDominantFoot] = useState<DominantFoot | "">(player.dominantFoot ?? "");
  const [heightCm, setHeightCm] = useState(player.heightCm === null ? "" : String(player.heightCm));
  const [gender, setGender] = useState<PersonGender | "">(player.gender ?? "");
  const [email, setEmail] = useState(player.email ?? "");
  const [phone, setPhone] = useState(player.phone ?? "");
  const [nationalId, setNationalId] = useState(player.nationalId ?? "");
  const genders = useT("genders");
  const tpp = useT("player.person");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${player.id}`, {
        method: "PATCH",
        body: {
          firstName,
          lastName,
          birthDate: birthDate || null,
          joinedOn: joinedOn || null,
          dominantFoot: dominantFoot || null,
          heightCm: heightCm.trim() === "" ? null : Number(heightCm),
          gender: gender || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          nationalId: nationalId.trim() || null,
        },
        schema: PlayerResponseSchema,
      });
      toast("success", t("saved"));
      onClose();
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="edit-player-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="edit-player-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tp("firstName")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={60}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            )}
          </Field>
          <Field label={tp("lastName")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={80}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tp("birthDate")} hint={tp("birthDateHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            )}
          </Field>
          <Field label={tp("joinedOn")} hint={tp("joinedOnHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={joinedOn}
                onChange={(e) => setJoinedOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("foot")}>
            {(id) => (
              <Select
                id={id}
                value={dominantFoot}
                onChange={(e) => setDominantFoot(e.target.value as DominantFoot | "")}
              >
                <option value="">{t("footNone")}</option>
                {DOMINANT_FEET.map((foot) => (
                  <option key={foot} value={foot}>
                    {feet(foot)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("height")} hint={t("heightHint")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={PLAYER_HEIGHT_MIN_CM}
                max={PLAYER_HEIGHT_MAX_CM}
                className="font-mono"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tpp("gender")}>
            {(id) => (
              <Select
                id={id}
                value={gender}
                onChange={(e) => setGender(e.target.value as PersonGender | "")}
              >
                <option value="">{tpp("genderNone")}</option>
                {PERSON_GENDERS.map((code) => (
                  <option key={code} value={code}>
                    {genders(code)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={tpp("nationalId")}>
            {(id) => (
              <Input
                id={id}
                maxLength={20}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tpp("email")} hint={tpp("emailHint")}>
            {(id) => (
              <Input
                id={id}
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field label={tpp("phone")}>
            {(id) => (
              <Input
                id={id}
                type="tel"
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

/** Selector de responsable entre el personal del club, con la opción de dejarlo vacío. */
function StaffSelect({
  id,
  value,
  onChange,
  playerId,
  noneLabel,
}: {
  id: string;
  value: string;
  onChange: (userId: string) => void;
  playerId: string;
  noneLabel: string;
}) {
  const staff = useEligibleStaff(playerId);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{noneLabel}</option>
      {(staff.data?.members ?? []).map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.name}
        </option>
      ))}
    </Select>
  );
}

function ObjectiveSheet({
  playerId,
  playerName,
  objective,
  onClose,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  objective: Objective | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("player.objective.sheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [title, setTitle] = useState(objective?.title ?? "");
  const [progress, setProgress] = useState(String(objective?.progress ?? 0));
  const [ownerUserId, setOwnerUserId] = useState(objective?.owner?.userId ?? "");
  const [reviewOn, setReviewOn] = useState(objective?.reviewOn ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${playerId}/objective`, {
        method: "PUT",
        body: {
          title,
          progress: Number(progress),
          ownerUserId: ownerUserId || null,
          reviewOn: reviewOn || null,
        },
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("saved"));
      onClose();
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="objective-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="objective-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={PLAYER_OBJECTIVE_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("progress")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                required
                min={0}
                max={100}
                className="font-mono"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("reviewOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={reviewOn}
                onChange={(e) => setReviewOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t("owner")}>
          {(id) => (
            <StaffSelect
              id={id}
              value={ownerUserId}
              onChange={setOwnerUserId}
              playerId={playerId}
              noneLabel={t("noOwner")}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

function IndicatorsSheet({
  playerId,
  playerName,
  indicators,
  onClose,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  indicators: Indicator[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("player.indicators.sheet");
  const names = useT("player.indicatorNames");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const initial = Object.fromEntries(
    PLAYER_INDICATOR_DIMENSIONS.map((d) => {
      const item = indicators.find((i) => i.dimension === d);
      return [d, { score: item ? String(item.score) : "", note: item?.note ?? "" }];
    }),
  ) as Record<PlayerIndicatorDimension, { score: string; note: string }>;
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (d: PlayerIndicatorDimension, patch: Partial<{ score: string; note: string }>) =>
    setValues((v) => ({ ...v, [d]: { ...v[d], ...patch } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(
      PLAYER_INDICATOR_DIMENSIONS.filter((d) => values[d].score.trim() !== "").map((d) => [
        d,
        { score: Number(values[d].score), note: values[d].note.trim() || null },
      ]),
    );
    if (Object.keys(body).length === 0) {
      toast("error", errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${playerId}/indicators`, {
        method: "PUT",
        body,
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("saved"));
      onClose();
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="indicators-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="indicators-form" className="flex flex-col gap-5" onSubmit={(e) => void submit(e)}>
        {PLAYER_INDICATOR_DIMENSIONS.map((d) => (
          <fieldset key={d} className="flex flex-col gap-3">
            <legend className="text-body font-semibold text-ink">{names(d)}</legend>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Field label={t("score")}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    className="font-mono"
                    value={values[d].score}
                    onChange={(e) => set(d, { score: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t("note")} hint={t("noteHint")}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={PLAYER_INDICATOR_NOTE_MAX}
                    value={values[d].note}
                    onChange={(e) => set(d, { note: e.target.value })}
                  />
                )}
              </Field>
            </div>
          </fieldset>
        ))}
      </form>
    </Sheet>
  );
}

function PlanSheet({
  playerId,
  playerName,
  plan,
  onClose,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("player.plan.sheet");
  const areas = useT("player.developmentAreas");
  const statuses = useT("player.planStatus");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [goals, setGoals] = useState(
    Object.fromEntries(DEVELOPMENT_AREAS.map((a) => [a, plan?.[a] ?? ""])) as Record<
      (typeof DEVELOPMENT_AREAS)[number],
      string
    >,
  );
  const [coordinatorUserId, setCoordinatorUserId] = useState(plan?.coordinator?.userId ?? "");
  const [nextReviewOn, setNextReviewOn] = useState(plan?.nextReviewOn ?? "");
  const [status, setStatus] = useState<DevelopmentPlanStatus>(plan?.status ?? "draft");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${playerId}/development-plan`, {
        method: "PUT",
        body: {
          ...Object.fromEntries(DEVELOPMENT_AREAS.map((a) => [a, goals[a].trim() || null])),
          coordinatorUserId: coordinatorUserId || null,
          nextReviewOn: nextReviewOn || null,
          status,
        },
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("saved"));
      onClose();
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="plan-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="plan-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {DEVELOPMENT_AREAS.map((a) => (
          <Field key={a} label={areas(a)}>
            {(id) => (
              <Input
                id={id}
                maxLength={DEVELOPMENT_GOAL_MAX}
                value={goals[a]}
                onChange={(e) => setGoals((g) => ({ ...g, [a]: e.target.value }))}
              />
            )}
          </Field>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("status")}>
            {(id) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as DevelopmentPlanStatus)}
              >
                {DEVELOPMENT_PLAN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statuses(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("nextReviewOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={nextReviewOn}
                onChange={(e) => setNextReviewOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t("coordinator")}>
          {(id) => (
            <StaffSelect
              id={id}
              value={coordinatorUserId}
              onChange={setCoordinatorUserId}
              playerId={playerId}
              noneLabel={t("noCoordinator")}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

function NoteSheet({
  playerId,
  playerName,
  onClose,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("player.timeline.sheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [text, setText] = useState("");
  const [happenedOn, setHappenedOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${playerId}/events`, {
        method: "POST",
        body: { text, ...(happenedOn ? { happenedOn } : {}) },
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("saved"));
      onClose();
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="add" type="submit" form="note-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="note-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("text")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={PLAYER_NOTE_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("date")}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={happenedOn}
              onChange={(e) => setHappenedOn(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

function InviteFamilySheet({
  playerId,
  playerName,
  defaultLocale,
  onClose,
  onSent,
}: {
  playerId: string;
  playerName: string;
  defaultLocale: Locale;
  onClose: () => void;
  onSent: (email: string, url: string | null) => void;
}) {
  const t = useT("player.inviteSheet");
  const rel = useT("relationships");
  const locales = useT("locales");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<FamilyRelationship>("mother");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sent = await apiFetch(`/api/org/players/${playerId}/guardians/invite`, {
        method: "POST",
        body: { email, relationship, locale },
        schema: InvitationSentResponseSchema,
      });
      toast(
        "success",
        t(sent.emailStatus === "failed" ? "failed" : "sent", { email: sent.invitation.email }),
      );
      onClose();
      onSent(sent.invitation.email, sent.acceptUrl);
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409 && /miembro/.test(err.message)
          ? t("alreadyMember")
          : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="send" type="submit" form="invite-family-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="invite-family-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void submit(e)}
      >
        <Field label={t("email")}>
          {(id) => (
            <Input
              id={id}
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("relationship")}>
            {(id) => (
              <Select
                id={id}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as FamilyRelationship)}
              >
                {FAMILY_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {rel(r)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("language")}>
            {(id) => (
              <Select id={id} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {locales(code)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function LinkMemberSheet({
  playerId,
  playerName,
  excluded,
  onClose,
  onLinked,
}: {
  playerId: string;
  playerName: string;
  excluded: string[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const t = useT("player.linkSheet");
  const rel = useT("relationships");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [userId, setUserId] = useState("");
  const [relationship, setRelationship] = useState<FamilyRelationship>("mother");
  const [busy, setBusy] = useState(false);
  const members = useQuery({
    queryKey: ["org", slug, "player", playerId, "eligible-guardians"],
    queryFn: () =>
      apiFetch(`/api/org/players/${playerId}/eligible-guardians`, {
        schema: EligibleMembersResponseSchema,
      }),
  });
  const candidates = (members.data?.members ?? []).filter((m) => !excluded.includes(m.userId));
  const selected = candidates.find((m) => m.userId === userId) ?? candidates[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${playerId}/guardians`, {
        method: "POST",
        body: { userId: selected.userId, relationship },
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("linked", { member: selected.name, name: playerName }));
      onClose();
      onLinked();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="link"
            type="submit"
            form="link-member-form"
            loading={busy}
            disabled={!selected}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="link-member-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {members.data && candidates.length === 0 ? (
          <Alert kind="info">{t("empty")}</Alert>
        ) : (
          <Field label={t("member")}>
            {(id) => (
              <Select
                id={id}
                value={selected?.userId ?? ""}
                onChange={(e) => setUserId(e.target.value)}
              >
                {candidates.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t("relationship")}>
          {(id) => (
            <Select
              id={id}
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as FamilyRelationship)}
            >
              {FAMILY_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {rel(r)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Sheet>
  );
}

/**
 * Dar acceso al propio deportista (ADR 0046): por email, con una invitación con el rol de
 * deportista, o con la cuenta de alguien que ya es miembro del club (una madre que también entrena).
 */
function AthleteAccessSheet({
  playerId,
  playerName,
  playerEmail,
  canInvite,
  defaultLocale,
  onClose,
  onDone,
}: {
  playerId: string;
  playerName: string;
  playerEmail: string | null;
  canInvite: boolean;
  defaultLocale: Locale;
  onClose: () => void;
  onDone: (email: string | null, url: string | null) => void;
}) {
  const t = useT("player.athleteSheet");
  const locales = useT("locales");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [mode, setMode] = useState<"invite" | "link">(canInvite ? "invite" : "link");
  const [email, setEmail] = useState(playerEmail ?? "");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const members = useQuery({
    queryKey: ["org", slug, "player", playerId, "eligible-guardians"],
    queryFn: () =>
      apiFetch(`/api/org/players/${playerId}/eligible-guardians`, {
        schema: EligibleMembersResponseSchema,
      }),
    enabled: mode === "link",
  });
  const candidates = members.data?.members ?? [];
  const selected = candidates.find((m) => m.userId === userId) ?? candidates[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "invite") {
        const sent = await apiFetch(`/api/org/players/${playerId}/athlete/invite`, {
          method: "POST",
          body: { email, locale },
          schema: InvitationSentResponseSchema,
        });
        toast(
          "success",
          t(sent.emailStatus === "failed" ? "failed" : "sent", { email: sent.invitation.email }),
        );
        onClose();
        onDone(sent.invitation.email, sent.acceptUrl);
      } else {
        if (!selected) return;
        await apiFetch(`/api/org/players/${playerId}/athlete`, {
          method: "POST",
          body: { userId: selected.userId },
          schema: PlayerDetailResponseSchema,
        });
        toast("success", t("linked", { member: selected.name, name: playerName }));
        onClose();
        onDone(null, null);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409
          ? /miembro/.test(err.message)
            ? t("alreadyMember")
            : t("taken")
          : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={mode === "invite" ? "send" : "link"}
            type="submit"
            form="athlete-access-form"
            loading={busy}
            disabled={mode === "link" && !selected}
          >
            {mode === "invite" ? t("submitInvite") : t("submitLink")}
          </Button>
        </>
      }
    >
      <form
        id="athlete-access-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void submit(e)}
      >
        {canInvite ? (
          <Field label={t("how")}>
            {(id) => (
              <Select
                id={id}
                value={mode}
                onChange={(e) => setMode(e.target.value as "invite" | "link")}
              >
                <option value="invite">{t("modes.invite")}</option>
                <option value="link">{t("modes.link")}</option>
              </Select>
            )}
          </Field>
        ) : null}
        {mode === "invite" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("email")}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field label={t("language")}>
              {(id) => (
                <Select
                  id={id}
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                >
                  {LOCALES.map((code) => (
                    <option key={code} value={code}>
                      {locales(code)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : members.data && candidates.length === 0 ? (
          <Alert kind="info">{t("empty")}</Alert>
        ) : (
          <Field label={t("member")}>
            {(id) => (
              <Select
                id={id}
                value={selected?.userId ?? ""}
                onChange={(e) => setUserId(e.target.value)}
              >
                {candidates.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <p className="text-secondary text-muted">{t("what")}</p>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

/** Asignar personal a un deportista (Bloque 19): un miembro con rol de personal, entrenador o administración. */
function AssignStaffSheet({
  playerId,
  playerName,
  excluded,
  onClose,
  onAssigned,
}: {
  playerId: string;
  playerName: string;
  excluded: string[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const t = useT("player.staff.sheet");
  const tp = useT("player.staff");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const members = useQuery({
    queryKey: ["org", slug, "player", playerId, "eligible-staff"],
    queryFn: () =>
      apiFetch(`/api/org/players/${playerId}/eligible-staff`, {
        schema: EligibleMembersResponseSchema,
      }),
  });
  const candidates = (members.data?.members ?? []).filter((m) => !excluded.includes(m.userId));
  const selected = candidates.find((m) => m.userId === userId) ?? candidates[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${playerId}/staff`, {
        method: "POST",
        body: { userId: selected.userId },
        schema: PlayerDetailResponseSchema,
      });
      toast("success", tp("assigned", { member: selected.name, name: playerName }));
      onClose();
      onAssigned();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="assign-staff-form" loading={busy} disabled={!selected}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="assign-staff-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {members.data && candidates.length === 0 ? (
          <Alert kind="info">{t("empty")}</Alert>
        ) : (
          <Field label={t("member")}>
            {(id) => (
              <Select
                id={id}
                value={selected?.userId ?? ""}
                onChange={(e) => setUserId(e.target.value)}
              >
                {candidates.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </form>
    </Sheet>
  );
}

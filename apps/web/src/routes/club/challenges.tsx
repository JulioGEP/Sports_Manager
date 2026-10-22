import {
  CHALLENGE_AREAS,
  CHALLENGE_NOTE_MAX,
  ChallengesResponseSchema,
  FamilyChallengesResponseSchema,
  FamilyResponseSchema,
  RATING_MAX,
  SUBMISSION_MAX_QUANTITY,
  playerDisplayName,
  pointsFor,
  type ChallengeManageScope,
  type ChallengeSubmission,
  type ChallengeSummary,
  type ChallengeTask,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  DataList,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  Tabs,
  useToast,
} from "@/ui";
import { NewChallengeSheet } from "./challenge-new-sheet";
import { submissionKind, challengeKind, useScopeLabel } from "./challenge-scope";

/**
 * Retos por puntos (Bloque 13, ADR 0030; ámbito por sección o equipo, ADR 0032). El reto vive en
 * la ficha de cada equipo y de cada sección; esta vista de conjunto, sin entrada en la barra, es a
 * donde llevan las alertas de "por validar" del inicio. Una familia llega a los retos desde la
 * ficha de cada uno de los suyos. Nunca una clasificación para las familias.
 */
export function ChallengesPage() {
  const { org, slug } = useReadyClub();
  const errors = useT("errors");
  const permissions = org.actor.permissions;
  if (permissions.includes("org.challenges.read")) return <StaffChallengesPage />;
  if (permissions.includes("org.family.read"))
    return <Navigate to={clubPaths(slug).family} replace />;
  return <Alert kind="error">{errors("forbidden")}</Alert>;
}

function StaffChallengesPage() {
  const t = useT("challenges");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const scopeLabel = useScopeLabel();
  const creating = params.get("new") === "1";
  const sectionFilter = params.get("section") ?? "";

  const challenges = useQuery({
    queryKey: ["org", slug, "challenges"],
    queryFn: () => apiFetch("/api/org/challenges", { schema: ChallengesResponseSchema }),
  });
  // Hasta que la API conteste, el permiso decide si se enseña el botón; después manda la API.
  const manage: ChallengeManageScope = challenges.data?.manage ?? {
    scope: org.actor.permissions.includes("org.challenges.manage") ? "club" : "none",
    ownTeamIds: [],
  };
  const canManage = manage.scope !== "none";
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });
  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  const setCreating = (open: boolean) => updateParams({ new: open ? "1" : null });

  const all = challenges.data?.challenges ?? [];
  const sections = useMemo(() => {
    const seen = new Map<string, string>();
    for (const ch of all) seen.set(ch.section.id, ch.section.name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [all]);
  const rows = sectionFilter ? all.filter((ch) => ch.section.id === sectionFilter) : all;

  const period = (ch: ChallengeSummary) =>
    ch.startsOn && ch.endsOn
      ? dates.range(ch.startsOn, ch.endsOn)
      : ch.startsOn
        ? t("from", { date: dates.day(ch.startsOn) })
        : ch.endsOn
          ? t("until", { date: dates.day(ch.endsOn) })
          : t("noDates");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canManage ? (
            <Button
              icon={<Icon.Plus size={20} aria-hidden="true" />}
              onClick={() => setCreating(true)}
            >
              {t("new")}
            </Button>
          ) : null
        }
      />
      {challenges.isError ? <Alert kind="error">{errors(errorKey(challenges.error))}</Alert> : null}
      <Alert kind="info">{t("familiesNote")}</Alert>
      {sections.length > 1 ? (
        <div className="w-full max-w-xs">
          <Select
            aria-label={t("scope.filter")}
            value={sectionFilter}
            onChange={(e) => updateParams({ section: e.target.value || null })}
          >
            <option value="">{t("scope.filterAll")}</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <Card padded={false}>
        <DataList<ChallengeSummary>
          caption={t("title")}
          rows={rows}
          getKey={(ch) => ch.id}
          empty={
            <EmptyState
              icon={<Icon.Trophy weight="duotone" />}
              title={challenges.isPending ? c("loading") : t("empty")}
              description={challenges.data ? t("emptyHint") : undefined}
              action={
                canManage && challenges.data ? (
                  <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                    {t("new")}
                  </Button>
                ) : null
              }
            />
          }
          columns={[
            {
              key: "name",
              header: t("table.challenge"),
              cell: (ch) => (
                <span className="flex min-w-0 flex-col">
                  <Link to={paths.challenge(ch.id)} className="font-medium text-ink">
                    {ch.name}
                  </Link>
                  <span className="text-secondary text-ink">{scopeLabel(ch)}</span>
                  <span className="text-secondary text-muted">
                    {ch.season ? `${ch.season.name} · ` : ""}
                    {period(ch)}
                  </span>
                </span>
              ),
            },
            {
              key: "status",
              header: t("table.status"),
              cell: (ch) => (
                <StatusChip kind={challengeKind[ch.status]}>{t(`status.${ch.status}`)}</StatusChip>
              ),
            },
            {
              key: "points",
              header: t("table.points"),
              numeric: true,
              cell: (ch) => `${ch.minPoints} / ${ch.targetPoints}`,
            },
            { key: "tasks", header: t("table.tasks"), numeric: true, cell: (ch) => ch.tasksCount },
            {
              key: "participants",
              header: t("table.participants"),
              numeric: true,
              cell: (ch) => ch.participantsCount,
            },
            {
              key: "pending",
              header: t("table.pending"),
              cell: (ch) =>
                ch.pendingCount > 0 ? (
                  <StatusChip kind="warning">
                    {t("pendingCount", { count: ch.pendingCount })}
                  </StatusChip>
                ) : (
                  <span className="text-muted">{t("noPending")}</span>
                ),
            },
          ]}
          mobileRow={(ch) => ({
            title: <Link to={paths.challenge(ch.id)}>{ch.name}</Link>,
            subtitle: `${scopeLabel(ch)} · ${period(ch)} · ${t("table.points")}: ${ch.minPoints} / ${ch.targetPoints}`,
            trailing: (
              <StatusChip kind={ch.pendingCount > 0 ? "warning" : challengeKind[ch.status]}>
                {ch.pendingCount > 0
                  ? t("pendingCount", { count: ch.pendingCount })
                  : t(`status.${ch.status}`)}
              </StatusChip>
            ),
          })}
          href={(ch) => paths.challenge(ch.id)}
        />
      </Card>
      {canManage ? (
        <NewChallengeSheet
          open={creating}
          manage={manage}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            void reload();
            void navigate(paths.challenge(id));
          }}
        />
      ) : null}
    </div>
  );
}

// --- Familia ---

/** Los retos de uno de los suyos, dentro de su ficha (`/family/:id/challenges`). */
export function FamilyPlayerChallengesPage() {
  const t = useT("familyChallenge");
  const tc = useT("challenges");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const toast = useToast();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { id: playerId = "" } = useParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const scopeLabel = useScopeLabel();
  const canWrite = org.actor.permissions.includes("org.family.write");

  const family = useQuery({
    queryKey: ["org", slug, "family"],
    queryFn: () => apiFetch("/api/org/family", { schema: FamilyResponseSchema }),
  });
  const players = family.data?.players ?? [];
  const player = players.find((p) => p.id === playerId) ?? null;

  const view = useQuery({
    queryKey: ["org", slug, "family", "challenges", playerId],
    queryFn: () =>
      apiFetch(`/api/org/family/players/${playerId}/challenges`, {
        schema: FamilyChallengesResponseSchema,
      }),
    enabled: playerId !== "",
  });
  const reload = () =>
    client.invalidateQueries({ queryKey: ["org", slug, "family", "challenges", playerId] });

  // Un jugador puede tener varios retos a la vez (su sección y su equipo): el de la URL o el primero.
  const views = view.data?.challenges ?? [];
  const requestedChallenge = params.get("challenge");
  const familyData = views.find((v) => v.challenge.id === requestedChallenge) ?? views[0] ?? null;
  const challengeId = familyData?.challenge.id ?? "";

  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState<ChallengeSubmission | null>(null);

  async function remove(s: ChallengeSubmission) {
    setRemoving(null);
    try {
      await apiFetch(
        `/api/org/family/players/${playerId}/challenges/${challengeId}/submissions/${s.id}`,
        { method: "DELETE" },
      );
      toast("success", t("removed"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const challenge = familyData?.challenge ?? null;
  const totals = familyData?.totals;
  const progress = challenge
    ? Math.round(((totals?.approved ?? 0) / Math.max(1, challenge.targetPoints)) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.familyPlayer(playerId)}
        backLabel={player ? t("back", { name: playerDisplayName(player) }) : t("backShort")}
        eyebrow={player ? playerDisplayName(player) : undefined}
        title={t("title")}
        description={t("description")}
      />
      {family.isError ? <Alert kind="error">{errors(errorKey(family.error))}</Alert> : null}
      {family.data && !player ? <Alert kind="error">{errors("not_found")}</Alert> : null}
      {view.isError ? <Alert kind="error">{errors(errorKey(view.error))}</Alert> : null}
      {player && view.data && !challenge ? (
        <Card>
          <EmptyState
            icon={<Icon.Trophy weight="duotone" />}
            title={t("noChallenge")}
            description={t("noChallengeHint")}
          />
        </Card>
      ) : null}
      {player && views.length > 1 ? (
        <Tabs<string>
          label={t("challengeTabs", { name: playerDisplayName(player) })}
          selected={challengeId}
          onChange={(id) => setParams({ challenge: id }, { replace: true })}
          items={views.map((v) => ({
            key: v.challenge.id,
            label: v.challenge.team ? v.challenge.team.name : v.challenge.section.name,
          }))}
        />
      ) : null}
      {player && challenge && totals && familyData ? (
        <>
          <Card
            title={
              <span className="flex items-center gap-3">
                <Avatar name={playerDisplayName(player)} src={player.photoUrl} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-label uppercase tracking-wide text-muted">
                    {playerDisplayName(player)} · {scopeLabel(challenge)}
                  </span>
                  {challenge.name}
                </span>
              </span>
            }
            description={
              challenge.description ??
              (challenge.startsOn && challenge.endsOn
                ? dates.range(challenge.startsOn, challenge.endsOn)
                : undefined)
            }
            actions={
              canWrite ? (
                <Button
                  icon={<Icon.Plus size={20} aria-hidden="true" />}
                  onClick={() => setRegistering(true)}
                >
                  {t("register")}
                </Button>
              ) : null
            }
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-3">
                <span className="font-mono text-display lg:text-display-lg text-ink">
                  {totals.approved}
                </span>
                <span className="text-secondary text-muted">
                  {t("target", { target: challenge.targetPoints })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, progress)}
                aria-label={t("progressLabel", {
                  points: totals.approved,
                  target: challenge.targetPoints,
                })}
                className="h-2 w-full overflow-hidden rounded-full bg-raised"
              >
                <div
                  className="h-full rounded-full bg-club"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusChip kind={totals.approved >= challenge.minPoints ? "success" : "neutral"}>
                  {t("min", { min: challenge.minPoints })}
                </StatusChip>
                <StatusChip
                  kind={totals.approved >= challenge.targetPoints ? "success" : "neutral"}
                >
                  {t("targetChip", { target: challenge.targetPoints })}
                </StatusChip>
                {totals.pending > 0 ? (
                  <StatusChip kind="info">{t("pending", { points: totals.pending })}</StatusChip>
                ) : null}
              </div>
              <ul className="grid grid-cols-3 gap-3">
                {CHALLENGE_AREAS.map((area) => (
                  <li
                    key={area}
                    className="flex flex-col gap-1 rounded-card border border-border bg-page p-3"
                  >
                    <span className="text-label uppercase tracking-wide text-muted">
                      {tc(`areas.${area}`)}
                    </span>
                    <span className="font-mono text-title2 text-ink">{totals.byArea[area]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card title={t("submissions")} description={t("submissionsDescription")} padded={false}>
              {familyData.submissions.length === 0 ? (
                <EmptyState
                  icon={<Icon.ListChecks weight="duotone" />}
                  title={t("noSubmissions")}
                  action={
                    canWrite ? (
                      <Button variant="secondary" size="sm" onClick={() => setRegistering(true)}>
                        {t("register")}
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {familyData.submissions.map((s) => (
                    <li key={s.id} className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-body text-club-soft-text">
                        +{s.points}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-ink">{s.task.name}</span>
                        <span className="truncate text-secondary text-muted">
                          {dates.day(s.happenedOn)} · {t("quantity", { count: s.quantity })}
                          {s.note ? ` · ${s.note}` : ""}
                          {s.status === "rejected" && s.reviewNote ? ` · ${s.reviewNote}` : ""}
                        </span>
                      </span>
                      <StatusChip kind={submissionKind[s.status]}>
                        {tc(`submissionStatus.${s.status}`)}
                      </StatusChip>
                      {canWrite && s.status === "submitted" ? (
                        <Button
                          iconOnly
                          action="delete"
                          variant="ghost-danger"
                          size="sm"
                          onClick={() => setRemoving(s)}
                        >
                          {t("withdraw")}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={t("tasks")} description={t("tasksDescription")} padded={false}>
              <ul className="flex flex-col divide-y divide-line">
                {familyData.tasks.map((task) => (
                  <li key={task.id} className="flex min-h-14 items-center gap-3 px-5 py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body text-ink">{task.name}</span>
                      <span className="truncate text-secondary text-muted">
                        {tc(`areas.${task.area}`)} · {tc(`kinds.${task.kind}`)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end text-right text-secondary tabular-nums">
                      <span className="text-ink">
                        {tc("pointsPerUnit", { points: task.pointsPerUnit })}
                      </span>
                      {task.maxPoints !== null ? (
                        <span className="text-muted">
                          {tc("maxPoints", { points: task.maxPoints })}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          {canWrite ? (
            <RegisterSheet
              open={registering}
              playerId={playerId}
              challengeId={challengeId}
              playerName={playerDisplayName(player)}
              tasks={familyData.tasks}
              onClose={() => setRegistering(false)}
              onSaved={() => void reload()}
            />
          ) : null}
          <ConfirmDialog
            open={removing !== null}
            title={t("confirmWithdrawTitle", { task: removing?.task.name ?? "" })}
            body={t("confirmWithdrawBody")}
            confirmLabel={t("withdraw")}
            cancelLabel={c("cancel")}
            onConfirm={() => removing && void remove(removing)}
            onCancel={() => setRemoving(null)}
          />
        </>
      ) : null}
    </div>
  );
}

function RegisterSheet({
  open,
  playerId,
  challengeId,
  playerName,
  tasks,
  onClose,
  onSaved,
}: {
  open: boolean;
  playerId: string;
  challengeId: string;
  playerName: string;
  tasks: ChallengeTask[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("familyChallenge.sheet");
  const tc = useT("challenges");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [taskId, setTaskId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [happenedOn, setHappenedOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const task = tasks.find((x) => x.id === taskId) ?? tasks[0] ?? null;
  const grouped = useMemo(
    () => CHALLENGE_AREAS.map((area) => ({ area, tasks: tasks.filter((x) => x.area === area) })),
    [tasks],
  );
  const preview = task ? pointsFor(task, Number(quantity) || 0) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!task) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/org/family/players/${playerId}/challenges/${challengeId}/submissions`, {
        method: "POST",
        body: {
          taskId: task.id,
          quantity: Number(quantity),
          note: note.trim() || null,
          ...(happenedOn ? { happenedOn } : {}),
        },
        schema: FamilyChallengesResponseSchema,
      });
      toast("success", t("saved"));
      setQuantity("1");
      setNote("");
      setHappenedOn("");
      onClose();
      onSaved();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="register-form" loading={busy} disabled={!task}>
            {t("submit", { points: preview })}
          </Button>
        </>
      }
    >
      <form id="register-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("task")}>
          {(id) => (
            <Select id={id} value={task?.id ?? ""} onChange={(e) => setTaskId(e.target.value)}>
              {grouped.map((group) =>
                group.tasks.length > 0 ? (
                  <optgroup key={group.area} label={tc(`areas.${group.area}`)}>
                    {group.tasks.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={task?.kind === "rating" ? t("rating") : t("sessions")}
            hint={
              task
                ? task.kind === "rating"
                  ? t("ratingHint", { points: task.pointsPerUnit, max: RATING_MAX })
                  : t("sessionsHint", { points: task.pointsPerUnit })
                : undefined
            }
          >
            {(id) =>
              task?.kind === "rating" ? (
                <Select id={id} value={quantity} onChange={(e) => setQuantity(e.target.value)}>
                  {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={SUBMISSION_MAX_QUANTITY}
                  required
                  className="font-mono"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              )
            }
          </Field>
          <Field label={t("date")} hint={t("dateHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={happenedOn}
                onChange={(e) => setHappenedOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t("note")} hint={t("noteHint")}>
          {(id) => (
            <Input
              id={id}
              maxLength={CHALLENGE_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {task?.maxPoints !== null && task?.maxPoints !== undefined ? (
          <p className="text-secondary text-muted">{t("capHint", { points: task.maxPoints })}</p>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

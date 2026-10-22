import {
  CHALLENGE_AREAS,
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_NAME_MAX,
  CHALLENGE_NOTE_MAX,
  CHALLENGE_TASK_KINDS,
  CHALLENGE_TASK_NAME_MAX,
  ChallengeDetailResponseSchema,
  ChallengeResponseSchema,
  ChallengeStandingsResponseSchema,
  ChallengeSubmissionResponseSchema,
  ChallengeSubmissionsResponseSchema,
  SUBMISSION_STATUSES,
  TeamDetailResponseSchema,
  type ChallengeArea,
  type ChallengeManageScope,
  type ChallengeStanding,
  type ChallengeSubmission,
  type ChallengeSummary,
  type ChallengeTask,
  type ChallengeTaskKind,
  type SubmissionStatus,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
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
  type RowAction,
} from "@/ui";
import {
  ScopeFields,
  challengeKind,
  resolveScope,
  scopeIsComplete,
  scopeStateOf,
  submissionKind,
  useScopeLabel,
  useScopeOptions,
  type ScopeState,
} from "./challenge-scope";

type Tab = "tasks" | "review" | "standings";

/**
 * Un reto, para el personal (Bloque 13, ADR 0030): catálogo de pruebas, validación de registros
 * y participación por jugador. Quien gestiona edita el catálogo, activa y cierra; quien valida
 * aprueba o rechaza, de todo el club o solo de sus equipos. Qué puede hacer cada uno con este
 * reto lo dice la API (`access`): la entrenadora gestiona solo los retos de sus equipos (ADR 0032).
 */
export function ChallengePage() {
  const t = useT("challenge");
  const tc = useT("challenges");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const toast = useToast();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const scopeLabel = useScopeLabel();

  const rawTab = params.get("tab");
  const tab: Tab = rawTab === "review" || rawTab === "standings" ? rawTab : "tasks";
  const setTab = (next: Tab) => {
    const sp = new URLSearchParams(params);
    if (next === "tasks") sp.delete("tab");
    else sp.set("tab", next);
    setParams(sp, { replace: true });
  };
  /** Desde qué equipo se ha llegado (ADR 0032): la vuelta y el seguimiento son de ese equipo. */
  const teamParam = params.get("team");

  const detail = useQuery({
    queryKey: ["org", slug, "challenge", id],
    queryFn: () => apiFetch(`/api/org/challenges/${id}`, { schema: ChallengeDetailResponseSchema }),
    retry: false,
  });
  const fromTeam = useQuery({
    queryKey: ["org", slug, "team", teamParam],
    queryFn: () => apiFetch(`/api/org/teams/${teamParam}`, { schema: TeamDetailResponseSchema }),
    enabled: teamParam !== null,
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [taskSheet, setTaskSheet] = useState<"new" | ChallengeTask | null>(null);
  const [removingTask, setRemovingTask] = useState<ChallengeTask | null>(null);

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
  const { challenge, tasks, access } = detail.data;
  const canManage = access.manage;
  const canReview = access.review;
  const editable = canManage && challenge.status !== "closed";
  // Un reto de equipo vuelve a su equipo; uno de sección, al equipo desde el que se abrió o a la sección.
  const backTeam =
    challenge.team ?? (teamParam ? { id: teamParam, name: fromTeam.data?.team.name ?? "" } : null);
  const focusTeam = challenge.team ? null : backTeam;

  async function setStatus(status: "active" | "closed") {
    setClosing(false);
    try {
      await apiFetch(`/api/org/challenges/${id}`, {
        method: "PATCH",
        body: { status },
        schema: ChallengeResponseSchema,
      });
      toast("success", status === "closed" ? t("closed") : t("activated"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function removeTask(task: ChallengeTask) {
    setRemovingTask(null);
    try {
      await apiFetch(`/api/org/challenges/${id}/tasks/${task.id}`, { method: "DELETE" });
      toast("success", t("tasks.removed", { name: task.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const period =
    challenge.startsOn && challenge.endsOn
      ? dates.range(challenge.startsOn, challenge.endsOn)
      : challenge.startsOn
        ? tc("from", { date: dates.day(challenge.startsOn) })
        : challenge.endsOn
          ? tc("until", { date: dates.day(challenge.endsOn) })
          : tc("noDates");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={backTeam ? paths.team(backTeam.id) : paths.section(challenge.section.id)}
        backLabel={
          backTeam
            ? backTeam.name
              ? t("backTeam", { team: backTeam.name })
              : t("backTeamShort")
            : t("backSection", { section: challenge.section.name })
        }
        eyebrow={`${scopeLabel(challenge)} · ${challenge.season ? `${challenge.season.name} · ` : ""}${period}`}
        title={
          <>
            {challenge.name}
            <StatusChip kind={challengeKind[challenge.status]}>
              {tc(`status.${challenge.status}`)}
            </StatusChip>
          </>
        }
        description={
          challenge.description ??
          t("points", { min: challenge.minPoints, target: challenge.targetPoints })
        }
        actions={
          canManage ? (
            <>
              {challenge.status !== "closed" ? (
                <Button action="edit" variant="secondary" onClick={() => setEditing(true)}>
                  {t("edit")}
                </Button>
              ) : null}
              {challenge.status === "draft" ? (
                <Button action="activate" onClick={() => void setStatus("active")}>
                  {t("activate")}
                </Button>
              ) : null}
              {challenge.status === "active" ? (
                <Button action="finish" variant="danger" onClick={() => setClosing(true)}>
                  {t("close")}
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <span className="text-secondary text-muted">{t("stats.points")}</span>
          <p className="font-mono text-title1 text-ink">
            {challenge.minPoints} / {challenge.targetPoints}
          </p>
        </Card>
        <Card>
          <span className="text-secondary text-muted">{t("stats.participants")}</span>
          <p className="font-mono text-title1 text-ink">{challenge.participantsCount}</p>
        </Card>
        <Card>
          <span className="text-secondary text-muted">{t("stats.pending")}</span>
          <p className="font-mono text-title1 text-ink">{challenge.pendingCount}</p>
        </Card>
      </div>

      <Tabs<Tab>
        label={challenge.name}
        selected={tab}
        onChange={setTab}
        items={[
          { key: "tasks", label: t("tabs.tasks"), count: tasks.length },
          ...(canReview
            ? [
                { key: "review" as const, label: t("tabs.review"), count: challenge.pendingCount },
                {
                  key: "standings" as const,
                  label: t("tabs.standings"),
                  count: challenge.participantsCount,
                },
              ]
            : []),
        ]}
      />

      {tab === "tasks" ? (
        <Card
          title={t("tasks.title")}
          description={t("tasks.description")}
          padded={false}
          actions={
            editable ? (
              <Button action="add" size="sm" onClick={() => setTaskSheet("new")}>
                {t("tasks.new")}
              </Button>
            ) : null
          }
        >
          <DataList<ChallengeTask>
            caption={t("tasks.title")}
            rows={tasks}
            getKey={(task) => task.id}
            empty={
              <EmptyState
                icon={<Icon.ListChecks weight="duotone" />}
                title={t("tasks.empty")}
                action={
                  editable ? (
                    <Button
                      action="add"
                      variant="secondary"
                      size="sm"
                      onClick={() => setTaskSheet("new")}
                    >
                      {t("tasks.new")}
                    </Button>
                  ) : null
                }
              />
            }
            columns={[
              {
                key: "name",
                header: t("tasks.table.task"),
                cell: (task) => (
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-ink">{task.name}</span>
                    {task.status === "archived" ? (
                      <span className="text-secondary text-muted">{t("tasks.archived")}</span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: "area",
                header: t("tasks.table.area"),
                cell: (task) => <StatusChip kind="club">{tc(`areas.${task.area}`)}</StatusChip>,
              },
              {
                key: "kind",
                header: t("tasks.table.kind"),
                cell: (task) => tc(`kinds.${task.kind}`),
              },
              {
                key: "points",
                header: t("tasks.table.points"),
                numeric: true,
                cell: (task) => task.pointsPerUnit,
              },
              {
                key: "max",
                header: t("tasks.table.max"),
                numeric: true,
                cell: (task) =>
                  task.maxPoints === null ? (
                    <span className="font-sans text-muted">{t("tasks.noMax")}</span>
                  ) : (
                    task.maxPoints
                  ),
              },
              {
                key: "submissions",
                header: t("tasks.table.submissions"),
                numeric: true,
                cell: (task) => task.submissionsCount,
              },
            ]}
            mobileRow={(task) => ({
              title: task.name,
              subtitle: `${tc(`areas.${task.area}`)} · ${tc(`kinds.${task.kind}`)} · ${tc("pointsPerUnit", { points: task.pointsPerUnit })}${task.maxPoints !== null ? ` · ${tc("maxPoints", { points: task.maxPoints })}` : ""}`,
              trailing:
                task.status === "archived" ? (
                  <StatusChip kind="neutral">{t("tasks.archived")}</StatusChip>
                ) : undefined,
            })}
            rowActions={
              editable
                ? (task): RowAction[] => [
                    {
                      key: "edit",
                      label: t("tasks.edit"),
                      action: "edit",
                      onClick: () => setTaskSheet(task),
                    },
                    ...(task.status === "active"
                      ? [
                          {
                            key: "remove",
                            label: t("tasks.remove"),
                            action: "delete" as const,
                            tone: "danger" as const,
                            onClick: () => setRemovingTask(task),
                          },
                        ]
                      : []),
                  ]
                : undefined
            }
          />
        </Card>
      ) : null}

      {tab === "review" && canReview ? (
        <ReviewTab challenge={challenge} focusTeam={focusTeam} onChanged={() => void reload()} />
      ) : null}
      {tab === "standings" && canReview ? (
        <StandingsTab challenge={challenge} focusTeam={focusTeam} />
      ) : null}

      {editing ? (
        <EditChallengeSheet
          challenge={challenge}
          manage={detail.data.manage}
          onClose={() => setEditing(false)}
          onSaved={() => void reload()}
        />
      ) : null}
      {taskSheet ? (
        <TaskSheet
          challengeId={id}
          task={taskSheet === "new" ? null : taskSheet}
          onClose={() => setTaskSheet(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={removingTask !== null}
        title={t("tasks.confirmRemoveTitle", { name: removingTask?.name ?? "" })}
        body={t("tasks.confirmRemoveBody")}
        confirmLabel={t("tasks.remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removingTask && void removeTask(removingTask)}
        onCancel={() => setRemovingTask(null)}
      />
      <ConfirmDialog
        open={closing}
        title={t("confirmCloseTitle", { name: challenge.name })}
        body={t("confirmCloseBody")}
        confirmLabel={t("close")}
        confirmAction="finish"
        cancelLabel={c("cancel")}
        onConfirm={() => void setStatus("closed")}
        onCancel={() => setClosing(false)}
      />
    </div>
  );
}

function ReviewTab({
  challenge,
  focusTeam,
  onChanged,
}: {
  challenge: ChallengeSummary;
  /** En un reto de sección abierto desde un equipo: solo los registros de ese equipo. */
  focusTeam: { id: string; name: string } | null;
  onChanged: () => void;
}) {
  const t = useT("challenge.review");
  const tc = useT("challenges");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [status, setStatus] = useState<SubmissionStatus | "">("submitted");
  const [rejecting, setRejecting] = useState<ChallengeSubmission | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (focusTeam) query.set("team", focusTeam.id);
  const submissions = useQuery({
    queryKey: ["org", slug, "challenge", challenge.id, "submissions", query.toString()],
    queryFn: () =>
      apiFetch(`/api/org/challenges/${challenge.id}/submissions?${query.toString()}`, {
        schema: ChallengeSubmissionsResponseSchema,
      }),
  });
  const reload = () =>
    client.invalidateQueries({ queryKey: ["org", slug, "challenge", challenge.id] });

  async function review(s: ChallengeSubmission, decision: "approved" | "rejected", note = "") {
    setRejecting(null);
    setBusy(s.id);
    try {
      await apiFetch(`/api/org/challenges/${challenge.id}/submissions/${s.id}/review`, {
        method: "POST",
        body: { decision, note: note.trim() || null },
        schema: ChallengeSubmissionResponseSchema,
      });
      toast(
        "success",
        decision === "approved"
          ? t("approved", { name: s.player.name, points: s.points })
          : t("rejected", { name: s.player.name }),
      );
      void reload();
      onChanged();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  const closed = challenge.status === "closed";

  return (
    <div className="flex flex-col gap-4">
      {focusTeam ? (
        <Alert kind="info">{t("teamFocus", { team: focusTeam.name })}</Alert>
      ) : submissions.data?.scope === "own" ? (
        <Alert kind="info">{t("ownScope")}</Alert>
      ) : null}
      <div className="w-full max-w-xs">
        <Select
          aria-label={t("filter")}
          value={status}
          onChange={(e) => setStatus(e.target.value as SubmissionStatus | "")}
        >
          {SUBMISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t("filter")}: {tc(`submissionStatus.${s}`)}
            </option>
          ))}
          <option value="">{t("all")}</option>
        </Select>
      </div>
      {submissions.isError ? (
        <Alert kind="error">{errors(errorKey(submissions.error))}</Alert>
      ) : null}
      <Card padded={false}>
        <DataList<ChallengeSubmission>
          caption={t("title")}
          rows={submissions.data?.submissions ?? []}
          getKey={(s) => s.id}
          empty={
            <EmptyState
              icon={<Icon.CheckCircle weight="duotone" />}
              title={submissions.isPending ? c("loading") : t("empty")}
            />
          }
          columns={[
            {
              key: "player",
              header: t("table.player"),
              cell: (s) => (
                <span className="flex items-center gap-3">
                  <Avatar name={s.player.name} size="sm" src={s.player.photoUrl} />
                  <span className="flex min-w-0 flex-col">
                    <Link to={paths.player(s.player.id)} className="font-medium text-ink">
                      {s.player.name}
                    </Link>
                    <span className="text-secondary text-muted">{s.team?.name ?? ""}</span>
                  </span>
                </span>
              ),
            },
            {
              key: "task",
              header: t("table.task"),
              cell: (s) => (
                <span className="flex min-w-0 flex-col">
                  <span>{s.task.name}</span>
                  <span className="text-secondary text-muted">
                    {t("quantity", { count: s.quantity })}
                    {s.note ? ` · ${s.note}` : ""}
                  </span>
                </span>
              ),
            },
            { key: "points", header: t("table.points"), numeric: true, cell: (s) => s.points },
            { key: "date", header: t("table.date"), cell: (s) => dates.day(s.happenedOn) },
            {
              key: "status",
              header: t("table.status"),
              cell: (s) => (
                <span className="flex flex-col">
                  <StatusChip kind={submissionKind[s.status]}>
                    {tc(`submissionStatus.${s.status}`)}
                  </StatusChip>
                  {s.reviewedBy ? (
                    <span className="pt-1 text-secondary text-muted">
                      {t("by", { name: s.reviewedBy.name })}
                    </span>
                  ) : null}
                </span>
              ),
            },
          ]}
          mobileRow={(s) => ({
            leading: <Avatar name={s.player.name} src={s.player.photoUrl} />,
            title: `${s.player.name} · +${s.points}`,
            subtitle: `${s.task.name} · ${t("quantity", { count: s.quantity })} · ${dates.day(s.happenedOn)}`,
            trailing: (
              <StatusChip kind={submissionKind[s.status]}>
                {tc(`submissionStatus.${s.status}`)}
              </StatusChip>
            ),
          })}
          rowActions={
            closed
              ? undefined
              : (s): RowAction[] =>
                  s.status === "submitted"
                    ? [
                        {
                          key: "approve",
                          label: t("approve"),
                          action: "approve",
                          tone: "primary",
                          loading: busy === s.id,
                          onClick: () => void review(s, "approved"),
                        },
                        {
                          key: "reject",
                          label: t("reject"),
                          action: "reject",
                          tone: "danger",
                          onClick: () => setRejecting(s),
                        },
                      ]
                    : []
          }
        />
      </Card>
      {rejecting ? (
        <RejectSheet
          submission={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => void review(rejecting, "rejected", note)}
        />
      ) : null}
    </div>
  );
}

function RejectSheet({
  submission,
  onClose,
  onConfirm,
}: {
  submission: ChallengeSubmission;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const t = useT("challenge.review.rejectSheet");
  const c = useT("common");
  const [note, setNote] = useState("");
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: submission.player.name })}
      description={t("description", { task: submission.task.name })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="reject" type="submit" form="reject-form">
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="reject-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(note);
        }}
      >
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
      </form>
    </Sheet>
  );
}

function StandingsTab({
  challenge,
  focusTeam,
}: {
  challenge: ChallengeSummary;
  /** En un reto de sección abierto desde un equipo: el seguimiento de ese equipo. */
  focusTeam: { id: string; name: string } | null;
}) {
  const t = useT("challenge.standings");
  const tc = useT("challenges");
  const c = useT("common");
  const errors = useT("errors");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const standings = useQuery({
    queryKey: ["org", slug, "challenge", challenge.id, "standings", focusTeam?.id ?? ""],
    queryFn: () =>
      apiFetch(
        `/api/org/challenges/${challenge.id}/standings${focusTeam ? `?team=${focusTeam.id}` : ""}`,
        { schema: ChallengeStandingsResponseSchema },
      ),
  });
  return (
    <div className="flex flex-col gap-4">
      <Alert kind="info">
        {focusTeam
          ? t("teamFocus", { team: focusTeam.name })
          : standings.data?.scope === "own"
            ? t("ownScope")
            : t("staffOnly")}
      </Alert>
      {standings.isError ? <Alert kind="error">{errors(errorKey(standings.error))}</Alert> : null}
      <Card padded={false}>
        <DataList<ChallengeStanding>
          caption={t("title")}
          rows={standings.data?.standings ?? []}
          getKey={(s) => s.player.id}
          empty={
            <EmptyState
              icon={<Icon.Medal weight="duotone" />}
              title={standings.isPending ? c("loading") : t("empty")}
            />
          }
          columns={[
            {
              key: "player",
              header: t("table.player"),
              cell: (s) => (
                <span className="flex items-center gap-3">
                  <Avatar name={s.player.name} size="sm" src={s.player.photoUrl} />
                  <span className="flex min-w-0 flex-col">
                    <Link to={paths.player(s.player.id)} className="font-medium text-ink">
                      {s.player.name}
                    </Link>
                    <span className="text-secondary text-muted">{s.team?.name ?? ""}</span>
                  </span>
                </span>
              ),
            },
            {
              key: "approved",
              header: t("table.approved"),
              numeric: true,
              cell: (s) => s.totals.approved,
            },
            {
              key: "pending",
              header: t("table.pending"),
              numeric: true,
              cell: (s) => s.totals.pending,
            },
            ...CHALLENGE_AREAS.map((area: ChallengeArea) => ({
              key: area,
              header: tc(`areas.${area}`),
              numeric: true,
              cell: (s: ChallengeStanding) => s.totals.byArea[area],
            })),
            {
              key: "goal",
              header: t("table.goal"),
              cell: (s) => (
                <StatusChip kind={s.reachedTarget ? "success" : s.reachedMin ? "club" : "neutral"}>
                  {s.reachedTarget
                    ? t("reachedTarget")
                    : s.reachedMin
                      ? t("reachedMin")
                      : t("inProgress")}
                </StatusChip>
              ),
            },
          ]}
          mobileRow={(s) => ({
            leading: <Avatar name={s.player.name} src={s.player.photoUrl} />,
            title: s.player.name,
            subtitle: `${s.team?.name ?? ""} · ${t("table.approved")}: ${s.totals.approved} · ${t("table.pending")}: ${s.totals.pending}`,
            trailing: <span className="font-mono text-title2 text-ink">{s.totals.approved}</span>,
          })}
        />
      </Card>
    </div>
  );
}

function EditChallengeSheet({
  challenge,
  manage,
  onClose,
  onSaved,
}: {
  challenge: ChallengeSummary;
  manage: ChallengeManageScope;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("challenges.sheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  // El ámbito solo cambia en borrador: después el reto ya tiene participantes.
  const scopeEditable = challenge.status === "draft";
  const scopeOptions = useScopeOptions(manage, scopeEditable);
  const [scope, setScope] = useState<ScopeState>(() => scopeStateOf(challenge));
  const [name, setName] = useState(challenge.name);
  const [description, setDescription] = useState(challenge.description ?? "");
  const [startsOn, setStartsOn] = useState(challenge.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(challenge.endsOn ?? "");
  const [minPoints, setMinPoints] = useState(String(challenge.minPoints));
  const [targetPoints, setTargetPoints] = useState(String(challenge.targetPoints));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (Number(targetPoints) < Number(minPoints)) {
      setError(t("pointsOrder"));
      return;
    }
    if (scopeEditable && !scopeIsComplete(scopeOptions, scope)) return;
    const resolved = resolveScope(scopeOptions, scope);
    const scopeChanged =
      scopeEditable &&
      (resolved.sectionId !== challenge.section.id ||
        resolved.teamId !== (challenge.team?.id ?? null));
    setBusy(true);
    try {
      await apiFetch(`/api/org/challenges/${challenge.id}`, {
        method: "PATCH",
        body: {
          name,
          description: description.trim() || null,
          ...(scopeChanged ? { sectionId: resolved.sectionId, teamId: resolved.teamId } : {}),
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          minPoints: Number(minPoints),
          targetPoints: Number(targetPoints),
        },
        schema: ChallengeResponseSchema,
      });
      toast("success", t("saved"));
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
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("editTitle", { name: challenge.name })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="edit-challenge-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form
        id="edit-challenge-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void submit(e)}
      >
        {scopeEditable ? (
          <ScopeFields options={scopeOptions} state={scope} onChange={setScope} />
        ) : (
          <p className="text-secondary text-muted">{t("scopeFixed")}</p>
        )}
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={CHALLENGE_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("descriptionLabel")}>
          {(id) => (
            <Input
              id={id}
              maxLength={CHALLENGE_DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("startsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("endsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("minPoints")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                required
                className="font-mono"
                value={minPoints}
                onChange={(e) => setMinPoints(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("targetPoints")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                required
                className="font-mono"
                value={targetPoints}
                onChange={(e) => setTargetPoints(e.target.value)}
              />
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function TaskSheet({
  challengeId,
  task,
  onClose,
  onSaved,
}: {
  challengeId: string;
  task: ChallengeTask | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("challenge.tasks.sheet");
  const tc = useT("challenges");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(task?.name ?? "");
  const [area, setArea] = useState<ChallengeArea>(task?.area ?? "training");
  const [kind, setKind] = useState<ChallengeTaskKind>(task?.kind ?? "sessions");
  const [pointsPerUnit, setPointsPerUnit] = useState(String(task?.pointsPerUnit ?? 1));
  const [maxPoints, setMaxPoints] = useState(
    task?.maxPoints === null || !task ? "" : String(task.maxPoints),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = {
        name,
        area,
        kind,
        pointsPerUnit: Number(pointsPerUnit),
        maxPoints: maxPoints.trim() === "" ? null : Number(maxPoints),
      };
      if (task) {
        await apiFetch(`/api/org/challenges/${challengeId}/tasks/${task.id}`, {
          method: "PATCH",
          body,
          schema: ChallengeDetailResponseSchema,
        });
      } else {
        await apiFetch(`/api/org/challenges/${challengeId}/tasks`, {
          method: "POST",
          body,
          schema: ChallengeDetailResponseSchema,
        });
      }
      toast("success", task ? t("saved") : t("created", { name }));
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
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={task ? t("editTitle", { name: task.name }) : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action={task ? "save" : "add"} type="submit" form="task-form" loading={busy}>
            {task ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="task-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={CHALLENGE_TASK_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("area")}>
            {(id) => (
              <Select
                id={id}
                value={area}
                onChange={(e) => setArea(e.target.value as ChallengeArea)}
              >
                {CHALLENGE_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {tc(`areas.${a}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("kind")} hint={t(`kindHint.${kind}`)}>
            {(id) => (
              <Select
                id={id}
                value={kind}
                onChange={(e) => setKind(e.target.value as ChallengeTaskKind)}
              >
                {CHALLENGE_TASK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {tc(`kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("pointsPerUnit")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                required
                className="font-mono"
                value={pointsPerUnit}
                onChange={(e) => setPointsPerUnit(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("maxPoints")} hint={t("maxPointsHint")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                className="font-mono"
                value={maxPoints}
                onChange={(e) => setMaxPoints(e.target.value)}
              />
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

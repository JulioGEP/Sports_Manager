import {
  DrillsResponseSchema,
  PARTICIPATIONS,
  SESSION_BLOCKS,
  SESSION_STATUSES,
  SessionDetailResponseSchema,
  TeamWeekResponseSchema,
  type DrillSummary,
  type Participation,
  type RestrictionTag,
  type SessionBlock,
  type SessionDetailResponse,
  type SessionItem,
  type SessionItemInput,
  type SessionRosterEntry,
  type SessionStatus,
  type TrainingContent,
} from "@sportsmanager/shared";
import { AttendanceToggle } from "@sportsmanager/design";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AiDraftAction } from "@/components/ai-draft";
import {
  AvailabilityChip,
  ContentChips,
  DrillBoard,
  InsightList,
  RatingInput,
  RestrictionTags,
  RpeScale,
  useLoadFormat,
  useSessionBlocks,
  useShortDate,
} from "@/components/training-ui";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  Menu,
  MenuItem,
  PageHeader,
  Select,
  Sheet,
  Stat,
  StatusChip,
  useToast,
  type StatusKind,
} from "@/ui";
import { useClubTimezone } from "./team-training";

// --- Piezas comunes de la sesión (editor, modo pista e impresión) ---

/** La sesión con su plantilla del día, sus tareas y lo que hay que tener en cuenta. */
export function useSessionDetail(id: string) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: ["org", slug, "session", id],
    queryFn: () => apiFetch(`/api/org/sessions/${id}`, { schema: SessionDetailResponseSchema }),
    retry: false,
  });
}

/** Tareas en el orden de la sesión: bloque a bloque y, dentro, como las dejó el cuerpo técnico. */
export function orderedItems(items: readonly SessionItem[]): SessionItem[] {
  return [...items].sort(
    (a, b) =>
      SESSION_BLOCKS.indexOf(a.block) - SESSION_BLOCKS.indexOf(b.block) ||
      a.sortOrder - b.sortOrder,
  );
}

/** Lo que dice una tarea en una línea: series, descanso, RPE, grupo y jugadores. */
export function useItemFacts() {
  const t = useT("session.item");
  return (item: SessionItem, roster: readonly SessionRosterEntry[]): string[] => {
    const facts: string[] = [];
    if (item.sets && item.reps) facts.push(t("setsReps", { sets: item.sets, reps: item.reps }));
    else if (item.sets) facts.push(t("sets", { sets: item.sets }));
    if (item.restSec) facts.push(t("rest", { seconds: item.restSec }));
    if (item.targetRpe !== null) facts.push(t("rpe", { rpe: item.targetRpe }));
    if (item.groupLabel) facts.push(item.groupLabel);
    if (item.playerIds && item.playerIds.length > 0)
      facts.push(
        item.playerIds
          .map((p) => roster.find((r) => r.playerId === p)?.name)
          .filter(Boolean)
          .join(", "),
      );
    return facts;
  };
}

/** Carga, 404 o la página: lo mismo para el editor, el modo pista y la impresión. */
export function SessionGate({
  query,
  children,
}: {
  query: ReturnType<typeof useSessionDetail>;
  children: (data: SessionDetailResponse) => ReactNode;
}) {
  const c = useT("common");
  const errors = useT("errors");
  if (query.isError) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(query.error))}</Alert>
    );
  }
  if (!query.data)
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-24 animate-pulse rounded-card bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  return <>{children(query.data)}</>;
}

const statusKind: Record<SessionStatus, StatusKind> = {
  draft: "neutral",
  planned: "info",
  done: "success",
  cancelled: "danger",
};

const attendanceKind: Record<"present" | "absent" | "excused", StatusKind> = {
  present: "success",
  absent: "danger",
  excused: "neutral",
};

const MD_OPTIONS = [
  ...[-6, -5, -4, -3, -2, -1].map((n) => `MD${n}`),
  "MD",
  ...[1, 2, 3, 4, 5, 6].map((n) => `MD+${n}`),
];

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const toInput = (item: SessionItem): SessionItemInput => ({
  id: item.id,
  drillId: item.drillId,
  title: item.title,
  minutes: item.minutes,
  sets: item.sets,
  reps: item.reps,
  restSec: item.restSec,
  targetRpe: item.targetRpe,
  groupLabel: item.groupLabel,
  playerIds: item.playerIds,
  contentIds: item.contentIds,
  notes: item.notes,
});

const textareaClass =
  "w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club";

interface ItemEditor {
  block: SessionBlock;
  /** Posición en el bloque, o nula si es nueva. */
  index: number | null;
  value: SessionItemInput;
  drill: { name: string; restrictionTags: readonly RestrictionTag[] } | null;
}

/**
 * Sesión de entrenamiento (ADR 0039): cabecera, tareas por bloque y la plantilla del día con su
 * disponibilidad. Cada papel del cuerpo técnico edita sus bloques; quien lleva la parte principal
 * edita la cabecera, copia y quita la sesión. El cierre registra asistencia, RPE y valoración.
 */
export function SessionPage() {
  const { id = "" } = useParams();
  const detail = useSessionDetail(id);
  return <SessionGate query={detail}>{(data) => <SessionEditor data={data} />}</SessionGate>;
}

function SessionEditor({ data }: { data: SessionDetailResponse }) {
  const t = useT("session");
  const c = useT("common");
  const ins = useT("insights");
  const ss = useT("sessionStatus");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const tz = useClubTimezone();
  const dates = useShortDate();
  const fmt = useLoadFormat();
  const facts = useItemFacts();
  const [editingHeader, setEditingHeader] = useState(false);
  const [closing, setClosing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [libraryFor, setLibraryFor] = useState<SessionBlock | null>(null);
  const [editor, setEditor] = useState<ItemEditor | null>(null);
  const [savingBlock, setSavingBlock] = useState<SessionBlock | null>(null);

  const { session, items, roster, access, contents } = data;
  const sessionBlocks = useSessionBlocks(data.section.sportCode);
  const players = roster.map((r) => ({ id: r.playerId, name: r.name }));
  const ready = roster.filter(
    (r) => r.availability.status === "available" || r.availability.status === "limited",
  ).length;
  const blockItems = (block: SessionBlock) =>
    items.filter((i) => i.block === block).sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleBlocks = SESSION_BLOCKS.filter(
    (b) => (access.blocks.includes(b) && sessionBlocks.used(b)) || items.some((i) => i.block === b),
  );
  const anyEdit = access.header || access.blocks.length > 0 || access.close;

  /** Pone la sesión nueva en pantalla y avisa a las demás vistas del club (semana, histórico). */
  function apply(fresh: SessionDetailResponse) {
    client.setQueryData(["org", slug, "session", session.id], fresh);
    void client.invalidateQueries({
      queryKey: ["org", slug],
      predicate: (q) => !(q.queryKey[2] === "session" && q.queryKey[3] === session.id),
    });
  }

  async function saveBlock(block: SessionBlock, next: SessionItemInput[], message?: string) {
    setSavingBlock(block);
    try {
      const fresh = await apiFetch(`/api/org/sessions/${session.id}/blocks/${block}`, {
        method: "PUT",
        body: { items: next },
        schema: SessionDetailResponseSchema,
      });
      apply(fresh);
      if (message) toast("success", message);
      return true;
    } catch (err) {
      toast("error", errors(errorKey(err)));
      return false;
    } finally {
      setSavingBlock(null);
    }
  }

  function move(block: SessionBlock, index: number, by: -1 | 1) {
    const list = blockItems(block).map(toInput);
    const target = index + by;
    const a = list[index];
    const b = list[target];
    if (!a || !b) return;
    list[index] = b;
    list[target] = a;
    void saveBlock(block, list);
  }

  async function submitItem(value: SessionItemInput) {
    if (!editor) return false;
    const list = blockItems(editor.block).map(toInput);
    if (editor.index === null) list.push(value);
    else list[editor.index] = value;
    const ok = await saveBlock(editor.block, list, t("blocks.saved"));
    if (ok) setEditor(null);
    return ok;
  }

  async function remove() {
    setRemoving(false);
    try {
      await apiFetch(`/api/org/sessions/${session.id}`, { method: "DELETE" });
      toast("success", t("remove.done"));
      void client.invalidateQueries({ queryKey: ["org", slug] });
      void navigate(paths.teamTraining(session.team.id));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const time = `${dates.time(session.startsAt, tz)}–${dates.time(session.endsAt, tz)}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.teamTraining(session.team.id)}
        backLabel={t("backToWeek")}
        eyebrow={[session.team.name, time, session.facility?.name].filter(Boolean).join(" · ")}
        title={
          <>
            <span className="first-letter:uppercase">{dates.long(session.date)}</span>
            <StatusChip kind={statusKind[session.status]}>{ss(session.status)}</StatusChip>
            {session.mdLabel ? <StatusChip kind="club">{session.mdLabel}</StatusChip> : null}
          </>
        }
        description={session.objective ?? t("noObjective")}
        actions={
          <>
            {access.header && session.status !== "done" ? (
              <AiDraftAction
                teamId={session.team.id}
                date={session.date}
                eventIds={[session.eventId]}
                label={t("actions.propose")}
              />
            ) : null}
            {access.close ? (
              <Button action="finish" onClick={() => setClosing(true)}>
                {session.status === "done" ? t("actions.reclose") : t("actions.close")}
              </Button>
            ) : null}
            <ButtonLink
              to={paths.sessionCourt(session.id)}
              variant="secondary"
              icon={<Icon.CornersOut size={18} aria-hidden="true" />}
            >
              {t("actions.court")}
            </ButtonLink>
            <Menu
              label={c("moreActions")}
              trigger={<Icon.DotsThreeVertical size={22} aria-hidden="true" />}
            >
              <MenuItem
                to={paths.sessionPrint(session.id)}
                icon={<Icon.Printer size={20} aria-hidden="true" />}
              >
                {t("actions.print")}
              </MenuItem>
              {access.header ? (
                <MenuItem
                  icon={<Icon.Copy size={20} aria-hidden="true" />}
                  onClick={() => setCopying(true)}
                >
                  {t("actions.copy")}
                </MenuItem>
              ) : null}
              {access.header ? (
                <MenuItem
                  tone="danger"
                  icon={<Icon.Trash size={20} aria-hidden="true" />}
                  onClick={() => setRemoving(true)}
                >
                  {t("actions.remove")}
                </MenuItem>
              ) : null}
            </Menu>
          </>
        }
      />

      {!anyEdit ? <Alert kind="info">{t("readOnly")}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Icon.Clock weight="duotone" />}
          value={fmt.minutes(session.plannedMinutes)}
          label={t("summary.plannedMinutes")}
        />
        <Stat
          icon={<Icon.Lightning weight="duotone" />}
          value={fmt.load(session.plannedLoad)}
          label={t("summary.plannedLoad")}
        />
        <Stat
          icon={<Icon.Users weight="duotone" />}
          value={t("summary.readyValue", { ready, total: roster.length })}
          label={t("summary.ready")}
        />
        {session.status === "done" ? (
          <Stat
            icon={<Icon.FlagCheckered weight="duotone" />}
            value={fmt.load(session.actualLoad)}
            label={t("summary.actual", { minutes: session.actualMinutes ?? 0 })}
          />
        ) : (
          <Stat
            icon={<Icon.Target weight="duotone" />}
            value={session.targetRpe ?? "—"}
            label={t("targetRpe")}
          />
        )}
      </div>

      <Card
        title={t("header.title")}
        actions={
          access.header ? (
            <Button
              size="sm"
              variant="secondary"
              action="edit"
              onClick={() => setEditingHeader(true)}
            >
              {t("header.edit")}
            </Button>
          ) : null
        }
      >
        <dl className="grid gap-x-6 gap-y-3 text-body sm:grid-cols-[max-content_1fr]">
          <dt className="text-secondary text-muted">{t("objective")}</dt>
          <dd className="min-w-0 font-medium text-ink">{session.objective ?? "—"}</dd>
          <dt className="text-secondary text-muted">{t("cycle")}</dt>
          <dd className="min-w-0 font-medium text-ink">
            {data.cycles.find((cy) => cy.id === session.cycleId)?.name ?? t("noCycle")}
          </dd>
          <dt className="text-secondary text-muted">{t("contents")}</dt>
          <dd className="min-w-0">
            {session.contentIds.length > 0 ? (
              <ContentChips ids={session.contentIds} contents={contents} link />
            ) : (
              <span className="text-muted">—</span>
            )}
          </dd>
          {session.contentMinutes.length > 0 ? (
            <>
              <dt className="text-secondary text-muted">{t("contentMinutes")}</dt>
              <dd className="flex min-w-0 flex-wrap gap-1.5">
                {session.contentMinutes.map((cm) => (
                  <span
                    key={cm.contentId}
                    className="rounded-chip bg-raised px-2 py-0.5 text-label text-ink"
                  >
                    {contents.find((ct) => ct.id === cm.contentId)?.name ?? "—"} ·{" "}
                    <span className="font-mono">{fmt.minutes(cm.minutes)}</span>
                  </span>
                ))}
              </dd>
            </>
          ) : null}
          {session.notes ? (
            <>
              <dt className="text-secondary text-muted">{t("notes")}</dt>
              <dd className="min-w-0 whitespace-pre-line text-ink">{session.notes}</dd>
            </>
          ) : null}
        </dl>
      </Card>

      {data.insights.length > 0 ? (
        <Card title={ins("title")} description={ins("description")}>
          <InsightList
            insights={data.insights}
            contents={contents}
            players={players}
            teamId={session.team.id}
            canAnswer={access.header}
            onAnswered={() => void client.invalidateQueries({ queryKey: ["org", slug] })}
          />
        </Card>
      ) : null}

      {visibleBlocks.map((block) => {
        const list = blockItems(block);
        const editable = access.blocks.includes(block);
        const minutes = list.reduce((sum, i) => sum + i.minutes, 0);
        return (
          <Card
            key={block}
            title={sessionBlocks.label(block)}
            description={
              list.length > 0 ? fmt.minutes(minutes) : editable ? t("blocks.empty") : undefined
            }
            actions={
              editable ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Icon.MagnifyingGlass size={16} aria-hidden="true" />}
                    onClick={() => setLibraryFor(block)}
                    disabled={list.length >= 20}
                  >
                    {t("blocks.fromLibrary")}
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    action="add"
                    disabled={list.length >= 20}
                    onClick={() =>
                      setEditor({
                        block,
                        index: null,
                        value: { title: "", minutes: 10, playerIds: null, contentIds: [] },
                        drill: null,
                      })
                    }
                  >
                    {t("blocks.free")}
                  </Button>
                </>
              ) : null
            }
          >
            {list.length === 0 ? null : (
              <ol className="flex flex-col gap-3" aria-busy={savingBlock === block || undefined}>
                {list.map((item, index) => {
                  const itemFacts = facts(item, roster);
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 rounded-field border border-border p-3 sm:flex-row"
                    >
                      {item.diagram ? (
                        <div className="w-full shrink-0 sm:w-40">
                          <DrillBoard diagram={item.diagram} label={item.title} />
                        </div>
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
                            {item.drillId ? (
                              <Link to={paths.drill(item.drillId)}>{item.title}</Link>
                            ) : (
                              item.title
                            )}
                            {item.fromAi ? (
                              <StatusChip kind="info">{t("blocks.fromAi")}</StatusChip>
                            ) : null}
                          </h3>
                          <span className="font-mono text-secondary text-ink">
                            {fmt.minutes(item.minutes)}
                          </span>
                        </div>
                        {itemFacts.length > 0 ? (
                          <p className="text-secondary text-muted">{itemFacts.join(" · ")}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5">
                          <ContentChips ids={item.contentIds} contents={contents} />
                          <RestrictionTags tags={item.restrictionTags} />
                        </div>
                        {item.notes ? (
                          <p className="whitespace-pre-line text-secondary text-ink">
                            {item.notes}
                          </p>
                        ) : null}
                        {item.rating ? (
                          <span className="text-secondary text-muted">
                            {t("blocks.rated", { rating: t(`rating.${item.rating}`) })}
                          </span>
                        ) : null}
                      </div>
                      {editable ? (
                        <div className="flex shrink-0 gap-0.5 self-start">
                          <IconButton
                            label={t("blocks.moveUp", { title: item.title })}
                            disabled={index === 0 || savingBlock !== null}
                            onClick={() => move(block, index, -1)}
                          >
                            <Icon.ArrowUp size={18} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label={t("blocks.moveDown", { title: item.title })}
                            disabled={index === list.length - 1 || savingBlock !== null}
                            onClick={() => move(block, index, 1)}
                          >
                            <Icon.ArrowDown size={18} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label={t("blocks.edit", { title: item.title })}
                            onClick={() =>
                              setEditor({
                                block,
                                index,
                                value: toInput(item),
                                drill: item.drillId
                                  ? { name: item.title, restrictionTags: item.restrictionTags }
                                  : null,
                              })
                            }
                          >
                            <Icon.PencilSimple size={18} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label={t("blocks.remove", { title: item.title })}
                            className="text-danger"
                            disabled={savingBlock !== null}
                            onClick={() =>
                              void saveBlock(
                                block,
                                list.filter((i) => i.id !== item.id).map(toInput),
                                t("blocks.removed"),
                              )
                            }
                          >
                            <Icon.Trash size={18} aria-hidden="true" />
                          </IconButton>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        );
      })}

      {visibleBlocks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.ClipboardText weight="duotone" />}
            title={t("blocks.none")}
            description={t("blocks.noneHint")}
          />
        </Card>
      ) : null}

      <RosterCard data={data} />

      {editingHeader ? (
        <HeaderSheet
          data={data}
          onClose={() => setEditingHeader(false)}
          onSaved={(fresh) => {
            apply(fresh);
            setEditingHeader(false);
          }}
        />
      ) : null}
      {libraryFor ? (
        <LibrarySheet
          data={data}
          onClose={() => setLibraryFor(null)}
          onPick={(drill) => {
            const block = libraryFor;
            setLibraryFor(null);
            setEditor({
              block,
              index: null,
              value: {
                drillId: drill.id,
                title: drill.name,
                minutes: drill.durationMin ?? 10,
                targetRpe: drill.targetRpe,
                playerIds: null,
                contentIds: drill.contents.map((ct) => ct.id).slice(0, 8),
              },
              drill: { name: drill.name, restrictionTags: drill.restrictionTags },
            });
          }}
        />
      ) : null}
      {editor ? (
        <ItemSheet
          editor={editor}
          data={data}
          busy={savingBlock !== null}
          onClose={() => setEditor(null)}
          onSubmit={submitItem}
        />
      ) : null}
      {closing ? (
        <CloseSheet
          data={data}
          onClose={() => setClosing(false)}
          onSaved={(fresh) => {
            apply(fresh);
            setClosing(false);
          }}
        />
      ) : null}
      {copying ? <CopySheet data={data} onClose={() => setCopying(false)} /> : null}
      <ConfirmDialog
        open={removing}
        title={t("remove.title")}
        body={t("remove.body")}
        confirmLabel={t("actions.remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </div>
  );
}

/** Plantilla del día: disponibilidad de cada uno y, si la sesión está cerrada, asistencia y RPE. */
function RosterCard({ data }: { data: SessionDetailResponse }) {
  const t = useT("session.roster");
  const at = useT("attendance");
  const pt = useT("participations");
  const fmt = useLoadFormat();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const { roster } = data;
  const present = roster.filter((r) => r.attendance === "present").length;
  return (
    <Card
      title={t("title")}
      description={
        roster.some((r) => r.attendance)
          ? t("present", { present, total: roster.length })
          : t("description", { total: roster.length })
      }
    >
      {roster.length === 0 ? (
        <EmptyState icon={<Icon.Users weight="duotone" />} title={t("empty")} />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {roster.map((r) => (
            <li key={r.playerId} className="flex min-h-14 flex-wrap items-center gap-3 py-2">
              <Avatar name={r.name} size="sm" src={r.photoUrl} />
              {/* El nombre no baja de 10rem: en móvil, los chips pasan a la línea de abajo. */}
              <span className="flex min-w-40 flex-1 flex-col">
                <Link
                  to={paths.playerPerformance(r.playerId)}
                  className="truncate font-medium text-ink no-underline hover:underline"
                >
                  {r.shirtNumber !== null ? `${r.shirtNumber} · ` : ""}
                  {r.name}
                </Link>
                {r.position ? (
                  <span className="truncate text-secondary text-muted">{r.position}</span>
                ) : null}
              </span>
              <AvailabilityChip value={r.availability} />
              {r.attendance ? (
                <StatusChip kind={attendanceKind[r.attendance]}>{at(r.attendance)}</StatusChip>
              ) : null}
              {r.load ? (
                <span className="font-mono text-secondary text-muted">
                  {[
                    r.load.rpe !== null ? t("rpe", { rpe: r.load.rpe }) : null,
                    fmt.minutes(r.load.minutes),
                    r.load.participation !== "full" ? pt(r.load.participation) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Selector de contenidos: los activos de la sección, con un tope. */
function ContentPicker({
  contents,
  value,
  onChange,
  max,
  label,
}: {
  contents: readonly TrainingContent[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  max: number;
  label: string;
}) {
  const options = contents.filter((ct) => ct.status === "active" || value.includes(ct.id));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="pb-1.5 text-secondary font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((ct) => {
          const on = value.includes(ct.id);
          return (
            <button
              key={ct.id}
              type="button"
              aria-pressed={on}
              disabled={!on && value.length >= max}
              onClick={() => onChange(on ? value.filter((v) => v !== ct.id) : [...value, ct.id])}
              className={`min-h-9 rounded-chip px-3 text-secondary font-medium transition-colors disabled:opacity-50 ${
                on ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-club-soft"
              }`}
            >
              {ct.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Cabecera de la sesión: objetivo, estado, MD, ciclo, RPE objetivo, contenidos y notas. */
function HeaderSheet({
  data,
  onClose,
  onSaved,
}: {
  data: SessionDetailResponse;
  onClose: () => void;
  onSaved: (fresh: SessionDetailResponse) => void;
}) {
  const t = useT("session");
  const c = useT("common");
  const ss = useT("sessionStatus");
  const errors = useT("errors");
  const toast = useToast();
  const { session } = data;
  const [objective, setObjective] = useState(session.objective ?? "");
  const [status, setStatus] = useState<SessionStatus>(session.status);
  const [targetRpe, setTargetRpe] = useState(
    session.targetRpe === null ? "" : String(session.targetRpe),
  );
  const [md, setMd] = useState(session.mdLabelOverride ?? "");
  const [cycleId, setCycleId] = useState(session.cycleId ?? "");
  const [contentIds, setContentIds] = useState<string[]>(session.contentIds);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [busy, setBusy] = useState(false);
  const autoMd = session.mdLabelOverride ? null : session.mdLabel;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const fresh = await apiFetch(`/api/org/sessions/${session.id}`, {
        method: "PATCH",
        body: {
          objective: objective.trim() || null,
          status,
          targetRpe: targetRpe === "" ? null : Number(targetRpe),
          mdLabel: md || null,
          cycleId: cycleId || null,
          contentIds,
          notes: notes.trim() || null,
        },
        schema: SessionDetailResponseSchema,
      });
      toast("success", t("header.saved"));
      onSaved(fresh);
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
      title={t("header.title")}
      description={t("header.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="session-header-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form
        id="session-header-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void submit(e)}
      >
        <Field label={t("objective")} hint={t("header.objectiveHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              maxLength={160}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("status")}>
            {(id) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as SessionStatus)}
              >
                {SESSION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ss(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("targetRpe")}>
            {(id) => (
              <Select id={id} value={targetRpe} onChange={(e) => setTargetRpe(e.target.value)}>
                <option value="">{t("noRpe")}</option>
                {Array.from({ length: 11 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("md")} hint={t("header.mdHint")}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={md}
                onChange={(e) => setMd(e.target.value)}
              >
                <option value="">
                  {autoMd ? t("header.mdAutoValue", { md: autoMd }) : t("header.mdAuto")}
                </option>
                {MD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("cycle")}>
            {(id) => (
              <Select id={id} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                <option value="">{t("noCycle")}</option>
                {data.cycles.map((cy) => (
                  <option key={cy.id} value={cy.id}>
                    {cy.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <ContentPicker
          contents={data.contents}
          value={contentIds}
          onChange={setContentIds}
          max={12}
          label={t("contents")}
        />
        <Field label={t("notes")}>
          {(id) => (
            <textarea
              id={id}
              rows={3}
              maxLength={2000}
              className={textareaClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

/** Buscador de la biblioteca: las tareas que ve el equipo, por nombre y por contenido. */
function LibrarySheet({
  data,
  onClose,
  onPick,
}: {
  data: SessionDetailResponse;
  onClose: () => void;
  onPick: (drill: DrillSummary) => void;
}) {
  const t = useT("session.library");
  const c = useT("common");
  const errors = useT("errors");
  const fmt = useLoadFormat();
  const rt = useT("session.rating");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [q, setQ] = useState("");
  const [content, setContent] = useState("");
  const search = useDeferredValue(q.trim());
  const params = new URLSearchParams({ section: data.section.id, team: data.session.team.id });
  if (search) params.set("q", search);
  if (content) params.set("content", content);
  const list = useQuery({
    queryKey: ["org", slug, "drills", "picker", data.session.team.id, search, content],
    queryFn: () =>
      apiFetch(`/api/org/drills?${params.toString()}`, { schema: DrillsResponseSchema }),
    placeholderData: keepPreviousData,
  });
  const drills = list.data?.drills ?? [];

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <ButtonLink to={paths.drills} variant="tertiary" action="open">
          {t("openLibrary")}
        </ButtonLink>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label={t("search")}>
            {(id) => (
              <Input
                id={id}
                type="search"
                value={q}
                maxLength={80}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("content")}>
            {(id) => (
              <Select id={id} value={content} onChange={(e) => setContent(e.target.value)}>
                <option value="">{t("allContents")}</option>
                {data.contents
                  .filter((ct) => ct.status === "active")
                  .map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
        {list.isError ? <Alert kind="error">{errors(errorKey(list.error))}</Alert> : null}
        {!list.data && !list.isError ? (
          <div className="h-40 animate-pulse rounded-field bg-raised" aria-label={c("loading")} />
        ) : null}
        {list.data && drills.length === 0 ? (
          <EmptyState icon={<Icon.MagnifyingGlass weight="duotone" />} title={t("empty")} />
        ) : null}
        <ul className="flex flex-col gap-2" aria-busy={list.isFetching || undefined}>
          {drills.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-field border border-border p-3"
            >
              {d.diagram ? (
                <div className="w-20 shrink-0">
                  <DrillBoard diagram={d.diagram} label={d.name} />
                </div>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-medium text-ink">{d.name}</span>
                <span className="text-secondary text-muted">
                  {[
                    d.format,
                    d.durationMin ? fmt.minutes(d.durationMin) : null,
                    d.rating !== null ? rt(String(Math.round(d.rating))) : null,
                    d.uses > 0 ? t("uses", { count: d.uses }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <div className="flex flex-wrap gap-1">
                  <ContentChips ids={d.contents.map((ct) => ct.id)} contents={d.contents} />
                  <RestrictionTags tags={d.restrictionTags} />
                </div>
              </div>
              <Button size="sm" action="add" onClick={() => onPick(d)}>
                {t("add")}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

/** Una tarea del bloque: minutos, series, RPE, grupo, jugadores, contenidos y notas. */
function ItemSheet({
  editor,
  data,
  busy,
  onClose,
  onSubmit,
}: {
  editor: ItemEditor;
  data: SessionDetailResponse;
  busy: boolean;
  onClose: () => void;
  onSubmit: (value: SessionItemInput) => Promise<boolean>;
}) {
  const t = useT("session.itemSheet");
  const st = useT("session");
  const c = useT("common");
  const blocksT = useSessionBlocks(data.section.sportCode).label;
  const v = editor.value;
  const [title, setTitle] = useState(v.title ?? "");
  const [minutes, setMinutes] = useState(String(v.minutes));
  const [sets, setSets] = useState(v.sets ? String(v.sets) : "");
  const [reps, setReps] = useState(v.reps ? String(v.reps) : "");
  const [restSec, setRestSec] = useState(v.restSec ? String(v.restSec) : "");
  const [targetRpe, setTargetRpe] = useState(
    v.targetRpe === null || v.targetRpe === undefined ? "" : String(v.targetRpe),
  );
  const [groupLabel, setGroupLabel] = useState(v.groupLabel ?? "");
  const [playerIds, setPlayerIds] = useState<string[]>(v.playerIds ?? []);
  const [contentIds, setContentIds] = useState<string[]>(v.contentIds ?? []);
  const [notes, setNotes] = useState(v.notes ?? "");

  const tags = editor.drill?.restrictionTags ?? [];
  const included = (id: string) => playerIds.length === 0 || playerIds.includes(id);
  const conflicts = data.roster.filter(
    (r) =>
      included(r.playerId) &&
      r.availability.status === "limited" &&
      r.availability.restrictions.some((tag) => tags.includes(tag)),
  );
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  function submit(e: FormEvent) {
    e.preventDefault();
    void onSubmit({
      ...(v.id ? { id: v.id } : {}),
      drillId: v.drillId ?? null,
      title: title.trim(),
      minutes: Number(minutes),
      sets: num(sets),
      reps: num(reps),
      restSec: num(restSec),
      targetRpe: num(targetRpe),
      groupLabel: groupLabel.trim() || null,
      playerIds: playerIds.length > 0 ? playerIds : null,
      contentIds,
      notes: notes.trim() || null,
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={editor.index === null ? t("titleNew") : t("titleEdit")}
      description={
        editor.drill
          ? t("fromDrill", { block: blocksT(editor.block), name: editor.drill.name })
          : blocksT(editor.block)
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="save"
            type="submit"
            form="session-item-form"
            loading={busy}
            disabled={!title.trim() || !(Number(minutes) >= 1)}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="session-item-form" className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={t("minutes")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={240}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("sets")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={sets}
                onChange={(e) => setSets(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("reps")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("restSec")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={1800}
                value={restSec}
                onChange={(e) => setRestSec(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={st("targetRpe")}>
            {(id) => (
              <Select id={id} value={targetRpe} onChange={(e) => setTargetRpe(e.target.value)}>
                <option value="">{st("noRpe")}</option>
                {Array.from({ length: 11 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("group")} hint={t("groupHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                maxLength={40}
                value={groupLabel}
                onChange={(e) => setGroupLabel(e.target.value)}
              />
            )}
          </Field>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-secondary text-muted">{t("demands")}</span>
            <RestrictionTags tags={tags} />
          </div>
        ) : null}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-secondary font-medium text-ink">{t("players")}</legend>
          <p className="text-secondary text-muted">{t("playersHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {data.roster.map((r) => {
              const on = playerIds.includes(r.playerId);
              return (
                <button
                  key={r.playerId}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPlayerIds(
                      on ? playerIds.filter((p) => p !== r.playerId) : [...playerIds, r.playerId],
                    )
                  }
                  className={`min-h-9 rounded-chip px-3 text-secondary font-medium transition-colors ${
                    on ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-club-soft"
                  } ${r.availability.status === "out" ? "line-through opacity-70" : ""}`}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        {conflicts.length > 0 ? (
          <Alert kind="warning">
            {t("conflict", { names: conflicts.map((r) => r.name).join(", ") })}
          </Alert>
        ) : null}
        <ContentPicker
          contents={data.contents}
          value={contentIds}
          onChange={setContentIds}
          max={8}
          label={st("contents")}
        />
        <Field label={st("notes")}>
          {(id) => (
            <textarea
              id={id}
              rows={3}
              maxLength={400}
              className={textareaClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

type Present = "present" | "absent" | "excused";
interface CloseRow {
  status: Present;
  rpe: number | null;
  participation: Participation;
  minutes: string;
}

/**
 * Cierre de la sesión: asistencia de cada uno y, con seguimiento completo, su RPE, participación y
 * minutos; con el básico, el RPE del grupo. Valoración de las tareas y de la sesión. Con esto se
 * calcula la carga (RPE × minutos).
 */
function CloseSheet({
  data,
  onClose,
  onSaved,
}: {
  data: SessionDetailResponse;
  onClose: () => void;
  onSaved: (fresh: SessionDetailResponse) => void;
}) {
  const t = useT("session.close");
  const at = useT("attendance");
  const pt = useT("participations");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { session, roster } = data;
  const full = data.tracking === "full";
  const eventMinutes = Math.max(
    1,
    Math.round((Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60_000),
  );
  const [actual, setActual] = useState(
    String(
      session.actualMinutes ?? (session.plannedMinutes > 0 ? session.plannedMinutes : eventMinutes),
    ),
  );
  const [rows, setRows] = useState<Record<string, CloseRow>>(() =>
    Object.fromEntries(
      roster.map((r) => [
        r.playerId,
        {
          status: r.attendance ?? (r.availability.status === "out" ? "excused" : "present"),
          rpe: r.load?.rpe ?? null,
          participation:
            r.load?.participation ??
            (r.availability.status === "rehab"
              ? "rehab"
              : r.availability.status === "limited"
                ? "partial"
                : "full"),
          minutes:
            r.load && r.load.minutes !== (session.actualMinutes ?? session.plannedMinutes)
              ? String(r.load.minutes)
              : "",
        },
      ]),
    ),
  );
  const [groupRpe, setGroupRpe] = useState<number | null>(() =>
    full ? null : (roster.find((r) => r.load && r.load.rpe !== null)?.load?.rpe ?? null),
  );
  const [rating, setRating] = useState<number | null>(session.rating);
  const [itemRatings, setItemRatings] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      data.items.filter((i) => i.rating !== null).map((i) => [i.id, i.rating as number]),
    ),
  );
  const [notes, setNotes] = useState(session.notes ?? "");
  const [busy, setBusy] = useState(false);
  const present = roster.filter((r) => rows[r.playerId]?.status === "present").length;
  const update = (id: string, patch: Partial<CloseRow>) =>
    setRows((all) => {
      const row = all[id];
      return row ? { ...all, [id]: { ...row, ...patch } } : all;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const fresh = await apiFetch(`/api/org/sessions/${session.id}/close`, {
        method: "PUT",
        body: {
          actualMinutes: Number(actual) >= 1 ? Number(actual) : undefined,
          rating,
          notes: notes.trim() || null,
          groupRpe,
          players: roster.map((r) => {
            const row = rows[r.playerId]!;
            return row.status === "present" && full
              ? {
                  playerId: r.playerId,
                  status: row.status,
                  participation: row.participation,
                  rpe: row.rpe,
                  minutes: row.minutes.trim() === "" ? null : Number(row.minutes),
                }
              : { playerId: r.playerId, status: row.status };
          }),
          itemRatings: Object.entries(itemRatings).map(([itemId, value]) => ({
            itemId,
            rating: value,
          })),
        },
        schema: SessionDetailResponseSchema,
      });
      toast("success", t("done", { count: present }));
      onSaved(fresh);
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
      description={full ? t("description") : t("basicDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="finish" type="submit" form="session-close-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="session-close-form"
        className="flex flex-col gap-5"
        onSubmit={(e) => void submit(e)}
      >
        <Field label={t("actualMinutes")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={240}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="max-w-32"
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-secondary font-medium text-ink">{t("groupRpe")}</span>
          <span className="text-secondary text-muted">
            {full ? t("groupRpeHintFull") : t("groupRpeHint")}
          </span>
          <RpeScale value={groupRpe} onChange={setGroupRpe} label={t("groupRpe")} compact />
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="close-players">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="close-players" className="text-body font-semibold text-ink">
              {t("players")}
            </h3>
            <span className="font-mono text-secondary text-muted">
              {t("presentCount", { present, total: roster.length })}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {roster.map((r) => {
              const row = rows[r.playerId]!;
              return (
                <li key={r.playerId} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 font-medium text-ink">{r.name}</span>
                    {r.availability.status !== "available" ? (
                      <AvailabilityChip value={r.availability} />
                    ) : null}
                    <span className="flex items-center gap-1">
                      <AttendanceToggle
                        playerName={r.name}
                        value={row.status === "excused" ? null : row.status}
                        onChange={(value) => update(r.playerId, { status: value })}
                        labels={{
                          present: at("present"),
                          absent: at("absent"),
                          group: (n) => at("group", { name: n }),
                        }}
                      />
                      <Button
                        variant="tertiary"
                        size="sm"
                        aria-pressed={row.status === "excused"}
                        onClick={() => update(r.playerId, { status: "excused" })}
                      >
                        {at("excuse")}
                      </Button>
                    </span>
                  </div>
                  {full && row.status === "present" ? (
                    <div className="flex flex-col gap-2 rounded-field bg-page p-2">
                      <RpeScale
                        value={row.rpe}
                        onChange={(value) => update(r.playerId, { rpe: value })}
                        label={t("rpeOf", { name: r.name })}
                        compact
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={t("participation")}>
                          {(id) => (
                            <Select
                              id={id}
                              value={row.participation}
                              onChange={(e) =>
                                update(r.playerId, {
                                  participation: e.target.value as Participation,
                                })
                              }
                            >
                              {PARTICIPATIONS.map((p) => (
                                <option key={p} value={p}>
                                  {pt(p)}
                                </option>
                              ))}
                            </Select>
                          )}
                        </Field>
                        <Field label={t("minutes")}>
                          {(id) => (
                            <Input
                              id={id}
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={240}
                              placeholder={actual}
                              value={row.minutes}
                              onChange={(e) => update(r.playerId, { minutes: e.target.value })}
                            />
                          )}
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {data.items.length > 0 ? (
          <section className="flex flex-col gap-2" aria-labelledby="close-items">
            <h3 id="close-items" className="text-body font-semibold text-ink">
              {t("itemRatings")}
            </h3>
            <ul className="flex flex-col gap-2">
              {orderedItems(data.items).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 text-ink">{item.title}</span>
                  <RatingInput
                    value={itemRatings[item.id] ?? null}
                    onChange={(value) => setItemRatings((all) => ({ ...all, [item.id]: value }))}
                    label={t("ratingOf", { title: item.title })}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-secondary font-medium text-ink">{t("rating")}</span>
          <RatingInput value={rating} onChange={setRating} label={t("rating")} />
        </div>

        <Field label={t("notes")}>
          {(id) => (
            <textarea
              id={id}
              rows={3}
              maxLength={2000}
              className={textareaClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

/** Copiar la sesión a otro entrenamiento del equipo: si ya tenía planificación, se sustituye. */
function CopySheet({ data, onClose }: { data: SessionDetailResponse; onClose: () => void }) {
  const t = useT("session.copy");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const tz = useClubTimezone();
  const dates = useShortDate();
  const teamId = data.session.team.id;
  const [week, setWeek] = useState(() => addDays(data.session.date, 7));
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const weekQuery = useQuery({
    queryKey: ["org", slug, "session-copy-week", teamId, week],
    queryFn: () =>
      apiFetch(`/api/org/teams/${teamId}/training/week?date=${week}`, {
        schema: TeamWeekResponseSchema,
      }),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(week),
    placeholderData: keepPreviousData,
  });
  const options = (weekQuery.data?.days ?? []).flatMap((day) => [
    ...day.trainings.map((tr) => ({
      eventId: tr.eventId,
      label: `${dates.weekday(day.date)} · ${dates.time(tr.startsAt, tz)} · ${tr.title}`,
      replaces: false,
    })),
    ...day.sessions
      .filter((s) => s.id !== data.session.id)
      .map((s) => ({
        eventId: s.eventId,
        label: `${dates.weekday(day.date)} · ${dates.time(s.startsAt, tz)} · ${s.title}`,
        replaces: true,
      })),
  ]);
  const chosen = options.find((o) => o.eventId === target);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    try {
      const fresh = await apiFetch(`/api/org/sessions/${data.session.id}/copy`, {
        method: "POST",
        body: { eventId: target },
        schema: SessionDetailResponseSchema,
      });
      toast("success", t("done"));
      void client.invalidateQueries({ queryKey: ["org", slug] });
      onClose();
      void navigate(paths.session(fresh.session.id));
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
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="copy"
            type="submit"
            form="session-copy-form"
            loading={busy}
            disabled={!target}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="session-copy-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("week")} hint={t("weekHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="date"
              aria-describedby={describedBy}
              value={week}
              onChange={(e) => {
                setWeek(e.target.value);
                setTarget("");
              }}
            />
          )}
        </Field>
        {weekQuery.isError ? <Alert kind="error">{errors(errorKey(weekQuery.error))}</Alert> : null}
        {weekQuery.data && options.length === 0 ? (
          <Alert kind="info">{t("none")}</Alert>
        ) : (
          <Field label={t("target")}>
            {(id) => (
              <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{t("choose")}</option>
                {options.map((o) => (
                  <option key={o.eventId} value={o.eventId}>
                    {o.replaces ? t("replacesOption", { label: o.label }) : o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {chosen?.replaces ? <Alert kind="warning">{t("replaces")}</Alert> : null}
      </form>
    </Sheet>
  );
}

import {
  AttendanceResponseSchema,
  EVENT_KINDS,
  EventResponseSchema,
  EventSessionResponseSchema,
  EventsResponseSchema,
  FacilitiesResponseSchema,
  HOME_AWAY,
  SectionsResponseSchema,
  SessionDetailResponseSchema,
  TeamsResponseSchema,
  type AttendanceStatus,
  type EventKind,
  type EventSummary,
  type HomeAway,
} from "@sportsmanager/shared";
import { AttendanceToggle } from "@sportsmanager/design";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import {
  addDays,
  dayKey,
  groupByDay,
  localToIso,
  timeKey,
  todayStart,
  useAgendaFormat,
  weekStart,
} from "@/lib/agenda";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { useMediaQuery } from "@/lib/media";
import { DESKTOP_QUERY } from "@/lib/theme";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Definitions,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  useToast,
  type StatusKind,
} from "@/ui";

export const eventKindStatus: Record<EventKind, StatusKind> = {
  training: "club",
  match: "warning",
  activity: "info",
  meeting: "neutral",
  booking: "neutral",
  other: "neutral",
};

/**
 * Agenda del club (Bloque 16): la semana en la zona horaria del club. El personal ve el club entero
 * (o filtra por sección, equipo e instalación); una familia ve la agenda de los suyos.
 */
export function AgendaPage() {
  const t = useT("agenda");
  const ek = useT("eventKinds");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [params, setParams] = useSearchParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canRead = permissions.includes("org.events.read");
  const familyOnly = !canRead && permissions.includes("org.family.read");
  const canWrite = permissions.includes("org.events.write");
  const canWriteOwn = permissions.includes("org.events.write_own");
  const canAttend =
    canWrite ||
    permissions.includes("org.attendance.write_own") ||
    permissions.includes("org.attendance.read");
  const timezone = org.organization.view === "full" ? org.organization.timezone : "Europe/Madrid";
  const fmt = useAgendaFormat(timezone);

  const [weekOf, setWeekOf] = useState<Date>(() => weekStart(timezone, new Date()));
  const weekEnd = addDays(timezone, weekOf, 7);
  const sectionFilter = params.get("section") ?? "";
  const teamFilter = params.get("team") ?? "";
  const facilityFilter = params.get("facility") ?? "";
  const [selected, setSelected] = useState<EventSummary | null>(null);
  const [editing, setEditing] = useState<EventSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [attendanceFor, setAttendanceFor] = useState<EventSummary | null>(null);
  const [deleting, setDeleting] = useState<EventSummary | null>(null);
  const [deleteSeries, setDeleteSeries] = useState(false);

  const query = new URLSearchParams({ from: weekOf.toISOString(), to: weekEnd.toISOString() });
  if (sectionFilter) query.set("section", sectionFilter);
  if (teamFilter) query.set("team", teamFilter);
  if (facilityFilter) query.set("facility", facilityFilter);
  const events = useQuery({
    queryKey: ["agenda", slug, familyOnly ? "family" : "club", query.toString()],
    queryFn: () =>
      apiFetch(`${familyOnly ? "/api/org/family/agenda" : "/api/org/events"}?${query.toString()}`, {
        schema: EventsResponseSchema,
      }),
    enabled: canRead || familyOnly,
  });
  const sections = useQuery({
    queryKey: ["org", slug, "sections", "all"],
    queryFn: () => apiFetch("/api/org/sections", { schema: SectionsResponseSchema }),
    enabled: permissions.includes("org.structure.read"),
  });
  const teams = useQuery({
    queryKey: ["org", slug, "teams", null],
    queryFn: () => apiFetch("/api/org/teams", { schema: TeamsResponseSchema }),
    enabled: permissions.includes("org.structure.read"),
  });
  const facilities = useQuery({
    queryKey: ["org", slug, "facilities"],
    queryFn: () => apiFetch("/api/org/facilities", { schema: FacilitiesResponseSchema }),
    enabled: permissions.includes("org.facilities.read"),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["agenda", slug] });

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    setParams(sp, { replace: true });
  }

  const conflicted = useMemo(() => {
    const set = new Set<string>();
    for (const cf of events.data?.conflicts ?? []) {
      set.add(cf.eventId);
      set.add(cf.withEventId);
    }
    return set;
  }, [events.data]);
  const byDay = useMemo(
    () => groupByDay(timezone, events.data?.events ?? []),
    [events.data, timezone],
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(timezone, weekOf, i));
  const todayKey = dayKey(timezone, new Date());
  const teamsForFilter = (teams.data?.teams ?? []).filter(
    (x) => !sectionFilter || x.section.id === sectionFilter,
  );

  async function remove(event: EventSummary) {
    setDeleting(null);
    try {
      await apiFetch(`/api/org/events/${event.id}${deleteSeries ? "?series=1" : ""}`, {
        method: "DELETE",
      });
      toast("success", t("removed"));
      setSelected(null);
      setDeleteSeries(false);
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const eventCard = (e: EventSummary) => (
    <button
      key={e.id}
      type="button"
      onClick={() => setSelected(e)}
      className="flex w-full flex-col gap-1 rounded-field border border-border bg-surface px-3 py-2 text-left transition-colors hover:bg-raised"
    >
      {/* La hora nunca se parte; si no cabe al lado, la etiqueta baja a su propia línea. */}
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-mono text-secondary whitespace-nowrap text-ink">
          {fmt.time(e.startsAt)}–{fmt.time(e.endsAt)}
        </span>
        <StatusChip kind={eventKindStatus[e.kind]}>{ek(e.kind)}</StatusChip>
      </span>
      <span className="line-clamp-2 text-body font-medium text-ink">{e.title}</span>
      <span className="truncate text-secondary text-muted">
        {[e.team?.name, e.facility?.name ?? e.location].filter(Boolean).join(" · ")}
      </span>
      {conflicted.has(e.id) ? (
        <span className="flex items-center gap-1 text-secondary text-warning">
          <Icon.Warning size={14} aria-hidden="true" />
          {t("conflict")}
        </span>
      ) : null}
      {e.attendance ? (
        <span className="text-secondary text-muted">
          {t("attendanceShort", { present: e.attendance.present, total: e.attendance.total })}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={familyOnly ? t("familyDescription") : t("description")}
        actions={
          canWrite || canWriteOwn ? (
            <Button action="add" onClick={() => setCreating(true)}>
              {t("new")}
            </Button>
          ) : null
        }
      />
      {events.isError ? <Alert kind="error">{errors(errorKey(events.error))}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            aria-label={t("prevWeek")}
            onClick={() => setWeekOf(addDays(timezone, weekOf, -7))}
          >
            <Icon.CaretRight size={16} aria-hidden="true" className="rotate-180" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setWeekOf(weekStart(timezone, new Date()))}
          >
            {t("today")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label={t("nextWeek")}
            onClick={() => setWeekOf(addDays(timezone, weekOf, 7))}
          >
            <Icon.CaretRight size={16} aria-hidden="true" />
          </Button>
        </div>
        <span className="text-body font-medium text-ink">{fmt.weekLabel(weekOf, weekEnd)}</span>
        {!familyOnly ? (
          <div className="flex flex-wrap gap-2">
            {sections.data && sections.data.sections.length > 0 ? (
              <Select
                aria-label={t("sectionFilter")}
                className="!w-auto max-w-48"
                value={sectionFilter}
                onChange={(e) => update({ section: e.target.value || null, team: null })}
              >
                <option value="">{t("allSections")}</option>
                {sections.data.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {teamsForFilter.length > 0 ? (
              <Select
                aria-label={t("teamFilter")}
                className="!w-auto max-w-48"
                value={teamFilter}
                onChange={(e) => update({ team: e.target.value || null })}
              >
                <option value="">{t("allTeams")}</option>
                {teamsForFilter.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {facilities.data && facilities.data.facilities.length > 0 ? (
              <Select
                aria-label={t("facilityFilter")}
                className="!w-auto max-w-48"
                value={facilityFilter}
                onChange={(e) => update({ facility: e.target.value || null })}
              >
                <option value="">{t("allFacilities")}</option>
                {facilities.data.facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        ) : null}
      </div>

      {events.data && events.data.events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon.CalendarBlank weight="duotone" />}
            title={t("empty")}
            description={familyOnly ? t("emptyFamily") : t("emptyHint")}
            action={
              canWrite || canWriteOwn ? (
                <Button
                  action="add"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCreating(true)}
                >
                  {t("new")}
                </Button>
              ) : null
            }
          />
        </Card>
      ) : desktop ? (
        /*
         * Siete columnas con un ancho mínimo (9 rem: caben la franja horaria y la etiqueta más larga).
         * Si la pantalla no da para las siete, la semana se desplaza en horizontal dentro de su caja,
         * como las tablas anchas (DESIGN.md 9.8), en vez de aplastar las tarjetas.
         */
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[repeat(7,minmax(9rem,1fr))] gap-2">
            {days.map((day) => {
              const key = dayKey(timezone, day);
              const list = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <section key={key} className="flex min-w-0 flex-col gap-2">
                  <h2
                    className={`rounded-chip px-2 py-1 text-center text-label uppercase tracking-wide ${
                      isToday ? "bg-club-soft text-club-soft-text" : "text-muted"
                    }`}
                  >
                    {fmt.dayShort(day)}
                  </h2>
                  {list.length === 0 ? (
                    <span className="px-2 text-center text-secondary text-muted">{t("free")}</span>
                  ) : (
                    list.map(eventCard)
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => {
            const key = dayKey(timezone, day);
            const list = byDay.get(key) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={key} className="flex flex-col gap-2">
                <h2 className={`text-title2 ${key === todayKey ? "text-club-text" : "text-ink"}`}>
                  {fmt.dayLong(day)}
                </h2>
                {list.map(eventCard)}
              </section>
            );
          })}
        </div>
      )}

      {selected ? (
        <EventDetailSheet
          event={selected}
          conflicted={conflicted.has(selected.id)}
          canEdit={canWrite || (canWriteOwn && selected.team !== null)}
          canAttend={canAttend && selected.team !== null}
          teamPath={selected.team ? paths.team(selected.team.id) : null}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onDelete={(series) => {
            setDeleteSeries(series);
            setDeleting(selected);
          }}
          onAttendance={() => {
            setAttendanceFor(selected);
            setSelected(null);
          }}
        />
      ) : null}
      {canWrite || canWriteOwn ? (
        <EventSheet
          open={creating || editing !== null}
          event={editing}
          timezone={timezone}
          defaultDate={dayKey(timezone, todayStart(timezone))}
          sections={sections.data?.sections ?? []}
          teams={teams.data?.teams ?? []}
          facilities={facilities.data?.facilities.filter((f) => f.status === "active") ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => void reload()}
        />
      ) : null}
      {attendanceFor ? (
        <AttendanceSheet
          event={attendanceFor}
          onClose={() => setAttendanceFor(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t("confirmDeleteTitle", { title: deleting?.title ?? "" })}
        body={
          deleting?.seriesId
            ? deleteSeries
              ? t("confirmDeleteSeriesBody")
              : t("confirmDeleteOneBody")
            : t("confirmDeleteBody")
        }
        confirmLabel={t("delete")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => deleting && void remove(deleting)}
        onCancel={() => {
          setDeleting(null);
          setDeleteSeries(false);
        }}
      />
    </div>
  );
}

function EventDetailSheet({
  event,
  conflicted,
  canEdit,
  canAttend,
  teamPath,
  onClose,
  onEdit,
  onDelete,
  onAttendance,
}: {
  event: EventSummary;
  conflicted: boolean;
  canEdit: boolean;
  canAttend: boolean;
  teamPath: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (series: boolean) => void;
  onAttendance: () => void;
}) {
  const t = useT("agenda");
  const ek = useT("eventKinds");
  const c = useT("common");
  const { org } = useReadyClub();
  const timezone = org.organization.view === "full" ? org.organization.timezone : "Europe/Madrid";
  const fmt = useAgendaFormat(timezone);
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={event.title}
      description={`${fmt.dateMedium(event.startsAt)} · ${fmt.time(event.startsAt)}–${fmt.time(event.endsAt)}`}
      footer={
        <>
          {canAttend ? (
            <Button
              variant="secondary"
              icon={<Icon.ListChecks size={18} aria-hidden="true" />}
              onClick={onAttendance}
            >
              {t("attendance")}
            </Button>
          ) : null}
          {canEdit ? (
            <>
              {event.seriesId ? (
                <Button action="delete" variant="danger" onClick={() => onDelete(true)}>
                  {t("deleteSeries")}
                </Button>
              ) : null}
              <Button action="delete" variant="danger" onClick={() => onDelete(false)}>
                {event.seriesId ? t("deleteOne") : t("delete")}
              </Button>
              <Button action="edit" onClick={onEdit}>
                {t("edit")}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <StatusChip kind={eventKindStatus[event.kind]}>{ek(event.kind)}</StatusChip>
          {event.homeAway ? (
            <StatusChip kind="neutral">{t(`homeAway.${event.homeAway}`)}</StatusChip>
          ) : null}
          {conflicted ? <StatusChip kind="warning">{t("conflict")}</StatusChip> : null}
        </div>
        <Definitions
          items={[
            ...(event.section ? [{ term: t("detail.section"), detail: event.section.name }] : []),
            ...(event.team
              ? [
                  {
                    term: t("detail.team"),
                    detail: teamPath ? (
                      <Link to={teamPath}>{event.team.name}</Link>
                    ) : (
                      event.team.name
                    ),
                  },
                ]
              : []),
            ...(event.facility
              ? [{ term: t("detail.facility"), detail: event.facility.name }]
              : []),
            ...(event.location ? [{ term: t("detail.location"), detail: event.location }] : []),
            ...(event.opponent ? [{ term: t("detail.opponent"), detail: event.opponent }] : []),
            ...(event.attendance
              ? [{ term: t("detail.attendance"), detail: t("attendanceShort", event.attendance) }]
              : []),
            ...(event.seriesId
              ? [{ term: t("detail.series"), detail: t("detail.seriesHint") }]
              : []),
          ]}
        />
        {event.notes ? <p className="text-body text-ink">{event.notes}</p> : null}
        {event.kind === "training" && event.team ? (
          <TrainingSessionLink eventId={event.id} teamId={event.team.id} />
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * La sesión de un entrenamiento (ADR 0039): si está planificada, se abre; si no, quien planifica
 * ese equipo la crea desde aquí. La API decide si puede (403 o 404 si no es de los suyos).
 */
function TrainingSessionLink({ eventId, teamId }: { eventId: string; teamId: string }) {
  const t = useT("agenda.session");
  const errors = useT("errors");
  const toast = useToast();
  const navigate = useNavigate();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canRead = permissions.includes("org.training.read");
  const canPlan =
    permissions.includes("org.training.write") || permissions.includes("org.training.write_own");
  const [busy, setBusy] = useState(false);
  const session = useQuery({
    queryKey: ["org", slug, "event", eventId, "session"],
    queryFn: () =>
      apiFetch(`/api/org/events/${eventId}/session`, { schema: EventSessionResponseSchema }),
    enabled: canRead,
    retry: false,
  });
  if (!canRead || !session.data) return null;
  const sessionId = session.data.sessionId;

  async function plan() {
    setBusy(true);
    try {
      const created = await apiFetch(`/api/org/teams/${teamId}/sessions`, {
        method: "POST",
        body: { eventId },
        schema: SessionDetailResponseSchema,
      });
      void navigate(paths.session(created.session.id));
    } catch (err) {
      toast("error", errors(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-field bg-raised px-4 py-3">
      <span className="text-secondary text-ink">{sessionId ? t("planned") : t("notPlanned")}</span>
      {sessionId ? (
        <ButtonLink to={paths.session(sessionId)} size="sm" action="open">
          {t("open")}
        </ButtonLink>
      ) : canPlan ? (
        <Button size="sm" action="add" loading={busy} onClick={() => void plan()}>
          {t("plan")}
        </Button>
      ) : null}
    </div>
  );
}

type SectionOption = { id: string; name: string };
type TeamOption = { id: string; name: string; section: { id: string } };
type FacilityOption = { id: string; name: string };

/** Alta o edición de un evento. Las horas son locales del club y viajan como instantes ISO. */
export function EventSheet({
  open,
  event,
  timezone,
  defaultDate,
  defaultTeamId,
  sections,
  teams,
  facilities,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: EventSummary | null;
  timezone: string;
  defaultDate: string;
  defaultTeamId?: string | undefined;
  sections: SectionOption[];
  teams: TeamOption[];
  facilities: FacilityOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("agenda.sheet");
  const ek = useT("eventKinds");
  const ha = useT("agenda.homeAway");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const initialTeam = event?.team?.id ?? defaultTeamId ?? "";
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "training");
  const [title, setTitle] = useState(event?.title ?? "");
  const [sectionId, setSectionId] = useState(
    event?.section?.id ?? teams.find((x) => x.id === initialTeam)?.section.id ?? "",
  );
  const [teamId, setTeamId] = useState(initialTeam);
  const [facilityId, setFacilityId] = useState(event?.facility?.id ?? "");
  const [date, setDate] = useState(
    event ? dayKey(timezone, new Date(event.startsAt)) : defaultDate,
  );
  const [startTime, setStartTime] = useState(
    event ? timeKey(timezone, new Date(event.startsAt)) : "18:00",
  );
  const [endTime, setEndTime] = useState(
    event ? timeKey(timezone, new Date(event.endsAt)) : "19:00",
  );
  const [location, setLocation] = useState(event?.location ?? "");
  const [opponent, setOpponent] = useState(event?.opponent ?? "");
  const [homeAway, setHomeAway] = useState<HomeAway | "">(event?.homeAway ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teamOptions = teams.filter((x) => !sectionId || x.section.id === sectionId);

  function chooseTeam(id: string) {
    setTeamId(id);
    const team = teams.find((x) => x.id === id);
    if (team && !sectionId) setSectionId(team.section.id);
    if (team && !title.trim()) setTitle(kind === "match" ? team.name : `${ek(kind)} ${team.name}`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = {
        kind,
        title,
        sectionId: sectionId || null,
        teamId: teamId || null,
        facilityId: facilityId || null,
        startsAt: localToIso(timezone, date, startTime),
        endsAt: localToIso(timezone, date, endTime),
        location: location.trim() || null,
        opponent: kind === "match" ? opponent.trim() || null : null,
        homeAway: kind === "match" ? homeAway || null : null,
        notes: notes.trim() || null,
      };
      const saved = event
        ? await apiFetch(`/api/org/events/${event.id}`, {
            method: "PATCH",
            body,
            schema: EventResponseSchema,
          })
        : await apiFetch("/api/org/events", {
            method: "POST",
            body: { ...body, repeatWeeklyUntil: repeatUntil || null },
            schema: EventResponseSchema,
          });
      if (saved.conflictsWith && saved.conflictsWith.length > 0) {
        toast("error", t("conflictWith", { title: saved.conflictsWith[0]!.title }));
      } else {
        toast("success", event ? t("saved") : t("created", { count: saved.created ?? 1 }));
      }
      if (!event) {
        setTitle("");
        setNotes("");
        setRepeatUntil("");
      }
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
      title={event ? t("editTitle") : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="event-form" loading={busy}>
            {event ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="event-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("kind")}>
            {(id) => (
              <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ek(k)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("eventTitle")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("section")}>
            {(id) => (
              <Select
                id={id}
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setTeamId("");
                }}
              >
                <option value="">{t("noSection")}</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("team")}>
            {(id) => (
              <Select id={id} value={teamId} onChange={(e) => chooseTeam(e.target.value)}>
                <option value="">{t("noTeam")}</option>
                {teamOptions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("date")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("startTime")}>
            {(id) => (
              <Input
                id={id}
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("endTime")}>
            {(id) => (
              <Input
                id={id}
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("facility")}>
            {(id) => (
              <Select id={id} value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                <option value="">{t("noFacility")}</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("location")} hint={t("locationHint")}>
            {(id) => (
              <Input
                id={id}
                maxLength={400}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            )}
          </Field>
        </div>
        {kind === "match" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("opponent")}>
              {(id) => (
                <Input
                  id={id}
                  maxLength={60}
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                />
              )}
            </Field>
            <Field label={t("homeAwayLabel")}>
              {(id) => (
                <Select
                  id={id}
                  value={homeAway}
                  onChange={(e) => setHomeAway(e.target.value as HomeAway | "")}
                >
                  <option value="">{t("homeAwayUnknown")}</option>
                  {HOME_AWAY.map((v) => (
                    <option key={v} value={v}>
                      {ha(v)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : null}
        <Field label={t("notes")}>
          {(id) => (
            <Input
              id={id}
              maxLength={400}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {!event ? (
          <Field label={t("repeatUntil")} hint={t("repeatUntilHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

/** Pase de lista (Bloque 17): la plantilla del equipo con Presente / Falta y la falta justificada. */
export function AttendanceSheet({
  event,
  onClose,
  onSaved,
}: {
  event: EventSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("attendance");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [draft, setDraft] = useState<Record<string, AttendanceStatus> | null>(null);
  const [busy, setBusy] = useState(false);
  const detail = useQuery({
    queryKey: ["agenda", slug, "attendance", event.id],
    queryFn: () =>
      apiFetch(`/api/org/events/${event.id}/attendance`, { schema: AttendanceResponseSchema }),
  });
  const entries = detail.data?.entries ?? [];
  const current: Record<string, AttendanceStatus> =
    draft ??
    Object.fromEntries(entries.filter((e) => e.status).map((e) => [e.playerId, e.status!]));
  const canWrite = detail.data?.access.write ?? false;
  const set = (playerId: string, status: AttendanceStatus) =>
    setDraft({ ...current, [playerId]: status });
  const marked = entries.filter((e) => current[e.playerId]).length;
  const present = entries.filter((e) => current[e.playerId] === "present").length;

  async function save() {
    setBusy(true);
    try {
      await apiFetch(`/api/org/events/${event.id}/attendance`, {
        method: "PUT",
        body: {
          entries: Object.entries(current).map(([playerId, status]) => ({ playerId, status })),
        },
        schema: AttendanceResponseSchema,
      });
      toast("success", t("saved", { present, total: entries.length }));
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
      description={`${event.title} · ${t("marked", { marked, total: entries.length })}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          {canWrite ? (
            <Button action="save" loading={busy} onClick={() => void save()}>
              {c("save")}
            </Button>
          ) : null}
        </>
      }
    >
      {detail.isError ? <Alert kind="error">{errors(errorKey(detail.error))}</Alert> : null}
      {detail.data && entries.length === 0 ? (
        <EmptyState icon={<Icon.Users weight="duotone" />} title={t("empty")} />
      ) : null}
      {detail.data && !canWrite ? <Alert kind="info">{t("readOnly")}</Alert> : null}
      <ul className="flex flex-col divide-y divide-line">
        {entries.map((e) => {
          const status = current[e.playerId] ?? null;
          const name = `${e.firstName} ${e.lastName}`;
          return (
            <li key={e.playerId} className="flex min-h-16 flex-wrap items-center gap-3 py-2">
              <Avatar name={name} size="sm" src={e.photoUrl} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-ink">{name}</span>
                {status === "excused" ? (
                  <span className="text-secondary text-muted">{t("excused")}</span>
                ) : null}
              </span>
              {canWrite ? (
                <span className="flex items-center gap-1">
                  <AttendanceToggle
                    playerName={name}
                    value={status === "present" || status === "absent" ? status : null}
                    onChange={(v) => set(e.playerId, v)}
                    labels={{
                      present: t("present"),
                      absent: t("absent"),
                      group: (n) => t("group", { name: n }),
                    }}
                  />
                  <Button
                    variant="tertiary"
                    size="sm"
                    aria-pressed={status === "excused"}
                    onClick={() => set(e.playerId, "excused")}
                  >
                    {t("excuse")}
                  </Button>
                </span>
              ) : (
                <StatusChip
                  kind={
                    status === "present"
                      ? "success"
                      : status === "absent"
                        ? "danger"
                        : status === "excused"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {status ? t(status) : t("unmarked")}
                </StatusChip>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

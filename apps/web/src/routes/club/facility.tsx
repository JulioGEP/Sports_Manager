import {
  EventsResponseSchema,
  FacilitiesResponseSchema,
  FacilityHoursSetSchema,
  FacilityResponseSchema,
  WEEKDAYS,
  minutesOf,
  type EventSummary,
  type Facility,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  addDays,
  dayKey,
  groupByDay,
  minutesOfDay,
  useAgendaFormat,
  weekStart,
} from "@/lib/agenda";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatusChip,
  useToast,
} from "@/ui";
import { eventKindStatus } from "./agenda";
import { FacilitySheet, facilityIcon } from "./facilities";

/**
 * Ficha de una instalación (Bloque 16): datos, franjas de apertura y la ocupación de la semana.
 * La API no tiene lectura por id: la ficha sale de la lista, que ya trae las franjas.
 */
export function FacilityPage() {
  const { id = "" } = useParams();
  const t = useT("facilities");
  const kinds = useT("facilityKinds");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug, org } = useReadyClub();
  const paths = clubPaths(slug);
  const canWrite = org.actor.permissions.includes("org.facilities.write");
  const canEvents = org.actor.permissions.includes("org.events.read");
  const timezone = org.organization.view === "full" ? org.organization.timezone : "Europe/Madrid";
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  const facilities = useQuery({
    queryKey: ["org", slug, "facilities"],
    queryFn: () => apiFetch("/api/org/facilities", { schema: FacilitiesResponseSchema }),
  });
  const facility = facilities.data?.facilities.find((f) => f.id === id) ?? null;

  async function setStatus(status: "active" | "archived") {
    setConfirmArchive(false);
    setBusy(true);
    try {
      await apiFetch(`/api/org/facilities/${id}`, {
        method: "PATCH",
        body: { status },
        schema: FacilityResponseSchema,
      });
      toast("success", t(status === "archived" ? "detail.archivedToast" : "detail.restoredToast"));
      await client.invalidateQueries({ queryKey: ["org", slug, "facilities"] });
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  if (facilities.isPending) return <p className="text-body text-muted">{c("loading")}</p>;
  if (facilities.isError) return <Alert kind="error">{t("loadError")}</Alert>;
  if (!facility) {
    return (
      <div className="flex flex-col gap-4">
        <Alert kind="error">{t("notFound")}</Alert>
        <div>
          <ButtonLink action="back" to={paths.facilities} variant="secondary">
            {t("backToList")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link to={paths.facilities} className="inline-flex items-center gap-1 text-club-text">
            <Icon.ArrowLeft size={16} aria-hidden="true" />
            {t("title")}
          </Link>
        }
        title={
          <span className="inline-flex items-center gap-3">
            <span className="text-club-text">{facilityIcon(facility.kind, 28)}</span>
            {facility.name}
            {facility.status === "archived" ? (
              <StatusChip kind="neutral">{t("archived")}</StatusChip>
            ) : null}
          </span>
        }
        description={[
          kinds(facility.kind),
          facility.capacity ? t("capacityShort", { count: facility.capacity }) : null,
          facility.description,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          canWrite ? (
            <>
              <Button action="edit" variant="secondary" onClick={() => setEditing(true)}>
                {t("detail.edit")}
              </Button>
              {facility.status === "active" ? (
                <Button
                  action="archive"
                  variant="danger"
                  loading={busy}
                  onClick={() => setConfirmArchive(true)}
                >
                  {t("detail.archive")}
                </Button>
              ) : (
                <Button action="restore" loading={busy} onClick={() => void setStatus("active")}>
                  {t("detail.restore")}
                </Button>
              )}
            </>
          ) : null
        }
      />
      {facility.status === "archived" ? (
        <Alert kind="info">{t("detail.archivedHint")}</Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <HoursCard
          key={`${facility.id}:${JSON.stringify(facility.hours)}`}
          facility={facility}
          canWrite={canWrite}
        />
        {canEvents ? (
          <WeekCard
            facility={facility}
            timezone={timezone}
            agendaPath={`${paths.agenda}?facility=${facility.id}`}
          />
        ) : null}
      </div>
      {canWrite && editing ? (
        <FacilitySheet open facility={facility} onClose={() => setEditing(false)} />
      ) : null}
      <ConfirmDialog
        open={confirmArchive}
        title={t("detail.confirmArchiveTitle", { name: facility.name })}
        body={t("detail.confirmArchiveBody")}
        confirmLabel={t("detail.archive")}
        confirmAction="archive"
        cancelLabel={c("cancel")}
        onConfirm={() => void setStatus("archived")}
        onCancel={() => setConfirmArchive(false)}
      />
    </div>
  );
}

interface SlotDraft {
  weekday: number;
  opensAt: string;
  closesAt: string;
}

const slotKey = (s: SlotDraft) => `${s.weekday}:${s.opensAt}:${s.closesAt}`;
const sortSlots = (slots: SlotDraft[]) =>
  [...slots].sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt));

/** Franjas de apertura: la lista para quien mira, el editor para quien gestiona. */
function HoursCard({ facility, canWrite }: { facility: Facility; canWrite: boolean }) {
  const t = useT("facilities.hours");
  const c = useT("common");
  const weekdays = useT("weekdays");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const initial = useMemo(() => sortSlots(facility.hours), [facility.hours]);
  const [slots, setSlots] = useState<SlotDraft[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = sortSlots(slots).map(slotKey).join("|") !== initial.map(slotKey).join("|");

  function patch(index: number, next: Partial<SlotDraft>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)));
  }
  function add() {
    const last = slots[slots.length - 1];
    setSlots((prev) => [
      ...prev,
      last
        ? { weekday: Math.min(7, last.weekday + 1), opensAt: last.opensAt, closesAt: last.closesAt }
        : { weekday: 1, opensAt: "09:00", closesAt: "22:00" },
    ]);
  }
  function weekdaysPreset() {
    const base = slots[0] ?? { weekday: 1, opensAt: "09:00", closesAt: "22:00" };
    setSlots([1, 2, 3, 4, 5].map((weekday) => ({ ...base, weekday })));
  }

  async function save() {
    setError(null);
    const parsed = FacilityHoursSetSchema.safeParse({ hours: sortSlots(slots) });
    if (!parsed.success) {
      setError(t("invalid"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/org/facilities/${facility.id}/hours`, {
        method: "PUT",
        body: parsed.data,
        schema: FacilityResponseSchema,
      });
      toast("success", t("saved"));
      await client.invalidateQueries({ queryKey: ["org", slug, "facilities"] });
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const byDay = useMemo(() => {
    const map = new Map<number, SlotDraft[]>();
    for (const s of initial) map.set(s.weekday, [...(map.get(s.weekday) ?? []), s]);
    return map;
  }, [initial]);

  if (!canWrite) {
    return (
      <Card title={t("title")} description={t("description")}>
        {initial.length === 0 ? (
          <p className="text-body text-muted">{t("none")}</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            {WEEKDAYS.filter((d) => byDay.has(d)).map((d) => (
              <div key={d} className="contents">
                <dt className="font-medium text-ink">{weekdays(String(d))}</dt>
                <dd className="text-muted">
                  {(byDay.get(d) ?? []).map((s) => `${s.opensAt}–${s.closesAt}`).join(", ")}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    );
  }

  return (
    <Card
      title={t("title")}
      description={t("description")}
      actions={
        <Button variant="tertiary" size="sm" onClick={weekdaysPreset}>
          {t("preset")}
        </Button>
      }
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button action="add" variant="secondary" onClick={add}>
            {t("add")}
          </Button>
          <Button action="save" loading={busy} disabled={!dirty} onClick={() => void save()}>
            {c("save")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {slots.length === 0 ? <p className="text-body text-muted">{t("none")}</p> : null}
        {slots.map((s, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 sm:gap-3"
          >
            <Select
              aria-label={t("weekday")}
              value={String(s.weekday)}
              onChange={(e) => patch(i, { weekday: Number(e.target.value) })}
            >
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {weekdays(String(d))}
                </option>
              ))}
            </Select>
            <Input
              aria-label={t("opensAt")}
              type="time"
              step={300}
              required
              value={s.opensAt}
              onChange={(e) => patch(i, { opensAt: e.target.value })}
              className="w-28"
            />
            <Input
              aria-label={t("closesAt")}
              type="time"
              step={300}
              required
              value={s.closesAt}
              onChange={(e) => patch(i, { closesAt: e.target.value })}
              className="w-28"
            />
            <IconButton
              label={t("remove")}
              className="text-danger"
              onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}
            >
              <Icon.Trash size={20} aria-hidden="true" />
            </IconButton>
          </div>
        ))}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </div>
    </Card>
  );
}

const GRID_START = 8 * 60;
const GRID_END = 23 * 60;
const PX_PER_HOUR = 40;
const GRID_HEIGHT = ((GRID_END - GRID_START) / 60) * PX_PER_HOUR;
const yOf = (minutes: number) =>
  ((Math.min(GRID_END, Math.max(GRID_START, minutes)) - GRID_START) / 60) * PX_PER_HOUR;

/** Ocupación semanal: franjas de apertura sombreadas y los eventos encima, en la zona del club. */
function WeekCard({
  facility,
  timezone,
  agendaPath,
}: {
  facility: Facility;
  timezone: string;
  agendaPath: string;
}) {
  const t = useT("facilities.week");
  const ek = useT("eventKinds");
  const { slug } = useReadyClub();
  const fmt = useAgendaFormat(timezone);
  const [weekOf, setWeekOf] = useState<Date>(() => weekStart(timezone, new Date()));
  const weekEnd = addDays(timezone, weekOf, 7);
  const query = new URLSearchParams({
    facility: facility.id,
    from: weekOf.toISOString(),
    to: weekEnd.toISOString(),
  });
  const events = useQuery({
    queryKey: ["agenda", slug, "facility", facility.id, query.toString()],
    queryFn: () =>
      apiFetch(`/api/org/events?${query.toString()}`, { schema: EventsResponseSchema }),
  });
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
  const hours = Array.from({ length: (GRID_END - GRID_START) / 60 }, (_, i) => GRID_START / 60 + i);

  return (
    <Card
      title={t("title")}
      description={t("description")}
      padded={false}
      actions={
        <div className="flex items-center gap-1">
          <IconButton
            label={t("previous")}
            onClick={() => setWeekOf(addDays(timezone, weekOf, -7))}
          >
            <Icon.ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
          <span className="min-w-36 text-center text-secondary text-ink tabular">
            {fmt.weekLabel(weekOf, weekEnd)}
          </span>
          <IconButton label={t("next")} onClick={() => setWeekOf(addDays(timezone, weekOf, 7))}>
            <Icon.ArrowRight size={20} aria-hidden="true" />
          </IconButton>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setWeekOf(weekStart(timezone, new Date()))}
          >
            {t("today")}
          </Button>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-secondary text-muted">
            {events.data ? t("count", { count: events.data.events.length }) : ""}
            {conflicted.size > 0 ? ` · ${t("conflicts", { count: conflicted.size })}` : ""}
          </span>
          <ButtonLink action="open" to={agendaPath} variant="tertiary" size="sm">
            {t("openAgenda")}
          </ButtonLink>
        </div>
      }
    >
      {events.isError ? (
        <div className="p-5">
          <Alert kind="error">{t("loadError")}</Alert>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <div className="grid min-w-160 grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
          <div />
          {days.map((day) => {
            const key = dayKey(timezone, day);
            return (
              <div
                key={key}
                className={`border-b border-line px-1 py-2 text-center text-label ${
                  key === todayKey ? "text-club-text" : "text-muted"
                }`}
              >
                {fmt.dayShort(day)}
              </div>
            );
          })}
          <div className="relative" style={{ height: GRID_HEIGHT }}>
            {hours.map((h) => (
              <span
                key={h}
                className="absolute right-1 -translate-y-1/2 text-label text-muted tabular"
                style={{ top: yOf(h * 60) }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((day, i) => {
            const key = dayKey(timezone, day);
            const open = facility.hours.filter((h) => h.weekday === i + 1);
            const list = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                className="relative border-l border-line"
                style={{
                  height: GRID_HEIGHT,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${PX_PER_HOUR}px)`,
                }}
              >
                {open.map((slot) => (
                  <div
                    key={`${slot.opensAt}-${slot.closesAt}`}
                    aria-hidden="true"
                    className="absolute inset-x-0 bg-club-soft/50"
                    style={{
                      top: yOf(minutesOf(slot.opensAt)),
                      height: Math.max(
                        0,
                        yOf(minutesOf(slot.closesAt)) - yOf(minutesOf(slot.opensAt)),
                      ),
                    }}
                  />
                ))}
                {list.map((e) => (
                  <EventBlock
                    key={e.id}
                    event={e}
                    timezone={timezone}
                    conflicted={conflicted.has(e.id)}
                    kindLabel={ek(e.kind)}
                    timeLabel={`${fmt.time(e.startsAt)}–${fmt.time(e.endsAt)}`}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function EventBlock({
  event,
  timezone,
  conflicted,
  kindLabel,
  timeLabel,
}: {
  event: EventSummary;
  timezone: string;
  conflicted: boolean;
  kindLabel: string;
  timeLabel: string;
}) {
  const start = minutesOfDay(timezone, new Date(event.startsAt));
  const endRaw = minutesOfDay(timezone, new Date(event.endsAt));
  const end = endRaw <= start ? GRID_END : endRaw;
  const top = yOf(start);
  const height = Math.max(18, yOf(end) - top);
  const tone = conflicted
    ? "border-warning bg-warning-soft"
    : eventKindStatus[event.kind] === "club"
      ? "border-club bg-club-soft"
      : "border-info bg-info-soft";
  return (
    <div
      className={`absolute inset-x-0.5 overflow-hidden rounded-row border-l-2 px-1.5 py-0.5 text-label text-ink ${tone}`}
      style={{ top, height }}
      title={`${timeLabel} · ${event.title} (${kindLabel})${event.team ? ` · ${event.team.name}` : ""}`}
    >
      <span className="block truncate font-medium">{event.title}</span>
      <span className="block truncate text-muted tabular">{timeLabel}</span>
    </div>
  );
}

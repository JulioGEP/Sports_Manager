import {
  ACTIVITY_SPORT_CODES,
  BookingPolicySchema,
  ClassTypeCreateSchema,
  ClassTypeResponseSchema,
  ClassTypeUpdateSchema,
  SectionResponseSchema,
  SportCatalogResponseSchema,
  TeamScheduleSetSchema,
  WEEKDAYS,
  type BookingPolicy,
  type ClassType,
  type ClassTypesResponse,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { CheckField, useBookingPolicy, useWeekdayName } from "@/components/fitness/owner-ui";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useClassTypes, useInvalidateFitness } from "@/lib/fitness";
import { useLocale, useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
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

type Tab = "types" | "policy";

/**
 * El horario del box (ADR 0049): los tipos de clase de cada disciplina con su aforo y sus franjas
 * semanales (coach, sala y aforo de cada una), de donde salen las clases de la temporada; y la
 * política de reservas que siguen todos.
 */
export function ClassTypesPage() {
  const t = useT("fitness.owner.classTypes");
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "policy" ? "policy" : "types";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs<Tab>
        label={t("tabsLabel")}
        selected={tab}
        onChange={(key) => setParams(key === "types" ? {} : { tab: key }, { replace: true })}
        items={[
          { key: "types", label: t("tabs.types") },
          { key: "policy", label: t("tabs.policy") },
        ]}
      />
      {tab === "types" ? <TypesTab /> : <PolicyTab />}
    </div>
  );
}

function TypesTab() {
  const t = useT("fitness.owner.classTypes");
  const weekday = useWeekdayName();
  const { org } = useReadyClub();
  const canWrite = org.actor.permissions.includes("org.structure.write");
  const query = useClassTypes();
  const [creating, setCreating] = useState(false);
  const [discipline, setDiscipline] = useState<{ id: string; name: string } | "new" | null>(null);
  const [params, setParams] = useSearchParams();
  // `?new=1` (desde la paleta de mandos) abre el alta de un tipo de clase.
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setCreating(true);
    setParams({}, { replace: true });
  }, [params, setParams]);
  const [editing, setEditing] = useState<ClassType | null>(null);
  const [scheduling, setScheduling] = useState<ClassType | null>(null);
  const [archiving, setArchiving] = useState<ClassType | null>(null);
  const invalidate = useInvalidateFitness();
  const toast = useToast();
  const errors = useT("errors");
  const data = query.data;

  async function setStatus(type: ClassType, status: ClassType["status"]) {
    try {
      await apiFetch(`/api/org/class-types/${type.teamId}`, {
        method: "PATCH",
        body: { status },
        schema: ClassTypeResponseSchema,
      });
      toast("success", t(status === "archived" ? "archived" : "restored", { name: type.name }));
      void invalidate();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setArchiving(null);
    }
  }

  if (query.isError) return <Alert kind="error">{t("loadError")}</Alert>;
  if (!data) return <div className="h-40 animate-pulse rounded-card bg-raised" />;
  if (data.sections.length === 0)
    return (
      <>
        <EmptyState
          icon={<Icon.SquaresFour weight="duotone" />}
          title={t("noSections")}
          description={t("disciplines.emptyHint")}
          action={
            canWrite ? (
              <Button action="add" onClick={() => setDiscipline("new")}>
                {t("disciplines.new")}
              </Button>
            ) : undefined
          }
        />
        {discipline ? (
          <DisciplineSheet discipline={discipline} onClose={() => setDiscipline(null)} />
        ) : null}
      </>
    );

  const active = data.classTypes.filter((c) => c.status === "active");
  const archived = data.classTypes.filter((c) => c.status === "archived");
  const bySection = data.sections
    .map((s) => ({ section: s, types: active.filter((c) => c.section.id === s.id) }))
    .filter((g) => g.types.length > 0 || canWrite);

  return (
    <div className="flex flex-col gap-6">
      <Card
        title={t("disciplines.title")}
        description={t("disciplines.hint")}
        actions={
          canWrite ? (
            <Button variant="secondary" size="sm" action="add" onClick={() => setDiscipline("new")}>
              {t("disciplines.new")}
            </Button>
          ) : undefined
        }
      >
        <ul className="flex flex-wrap gap-2">
          {data.sections.map((section) => (
            <li key={section.id}>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => setDiscipline(section)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-chip bg-raised px-3 text-body text-ink hover:bg-club-soft"
                  aria-label={t("disciplines.renameLabel", { name: section.name })}
                >
                  {section.name}
                  <Icon.PencilSimple size={16} aria-hidden="true" />
                </button>
              ) : (
                <StatusChip kind="neutral">{section.name}</StatusChip>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {discipline ? (
        <DisciplineSheet discipline={discipline} onClose={() => setDiscipline(null)} />
      ) : null}
      {canWrite ? (
        <div className="flex justify-end">
          <Button action="add" onClick={() => setCreating(true)}>
            {t("new")}
          </Button>
        </div>
      ) : null}
      {active.length === 0 ? (
        <EmptyState
          icon={<Icon.Clock weight="duotone" />}
          title={t("empty")}
          description={t("emptyHint")}
          action={
            canWrite ? (
              <Button action="add" onClick={() => setCreating(true)}>
                {t("new")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        bySection
          .filter((g) => g.types.length > 0)
          .map(({ section, types }) => (
            <section key={section.id} className="flex flex-col gap-3">
              <h2 className="text-title3 text-ink">{section.name}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {types.map((type) => (
                  <Card
                    key={type.teamId}
                    title={type.name}
                    description={
                      type.capacity === null
                        ? t("noCapacity")
                        : t("capacity", { count: type.capacity })
                    }
                    actions={
                      canWrite ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Icon.Clock size={18} aria-hidden="true" />}
                            onClick={() => setScheduling(type)}
                          >
                            {t("schedule")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            action="edit"
                            onClick={() => setEditing(type)}
                          >
                            {t("edit")}
                          </Button>
                        </>
                      ) : undefined
                    }
                  >
                    {type.slots.length === 0 ? (
                      <p className="text-body text-muted">{t("noSlots")}</p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-line">
                        {[...type.slots]
                          .sort(
                            (a, b) => a.weekday - b.weekday || a.startsAt.localeCompare(b.startsAt),
                          )
                          .map((slot) => (
                            <li key={slot.id} className="flex items-center gap-3 py-2">
                              <span className="w-24 shrink-0 text-body font-medium text-ink first-letter:uppercase">
                                {weekday(slot.weekday)}
                              </span>
                              <span className="w-28 shrink-0 font-mono text-body text-ink">
                                {slot.startsAt}–{slot.endsAt}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 text-secondary text-muted">
                                <span>{slot.coach?.name ?? t("noCoach")}</span>
                                {slot.facility ? <span>{slot.facility.name}</span> : null}
                                {slot.capacity !== null ? (
                                  <span>{t("capacityShort", { count: slot.capacity })}</span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <StatusChip kind={type.upcoming > 0 ? "success" : "neutral"}>
                        {t("upcoming", { count: type.upcoming })}
                      </StatusChip>
                      {canWrite ? (
                        <Button
                          variant="ghost-danger"
                          size="sm"
                          action="archive"
                          onClick={() => setArchiving(type)}
                        >
                          {t("archive")}
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))
      )}
      {archived.length > 0 ? (
        <Card title={t("archivedGroup")} description={t("archivedHint")} padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {archived.map((type) => (
              <li key={type.teamId} className="flex min-h-14 items-center gap-3 px-5 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-ink">{type.name}</span>
                  <span className="text-secondary text-muted">{type.section.name}</span>
                </span>
                {canWrite ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    action="restore"
                    onClick={() => void setStatus(type, "active")}
                  >
                    {t("restore")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {creating || editing ? (
        <TypeSheet
          data={data}
          type={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
      {scheduling ? (
        <ScheduleSheet data={data} type={scheduling} onClose={() => setScheduling(null)} />
      ) : null}
      <ConfirmDialog
        open={archiving !== null}
        title={t("archiveTitle", { name: archiving?.name ?? "" })}
        body={t("archiveBody")}
        confirmLabel={t("archive")}
        confirmAction="archive"
        tone="danger"
        cancelLabel={t("cancel")}
        onConfirm={() => archiving && void setStatus(archiving, "archived")}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}

function TypeSheet({
  data,
  type,
  onClose,
}: {
  data: ClassTypesResponse;
  type: ClassType | null;
  onClose: () => void;
}) {
  const t = useT("fitness.owner.classTypes");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const [sectionId, setSectionId] = useState(type?.section.id ?? data.sections[0]?.id ?? "");
  const [name, setName] = useState(type?.name ?? "");
  const [capacity, setCapacity] = useState(type?.capacity ? String(type.capacity) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cap = capacity.trim() ? Number(capacity) : null;
    const parsed = type
      ? ClassTypeUpdateSchema.safeParse({ name, capacity: cap })
      : ClassTypeCreateSchema.safeParse({ sectionId, name, capacity: cap });
    if (!parsed.success) {
      setError(t("invalid"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch(type ? `/api/org/class-types/${type.teamId}` : "/api/org/class-types", {
        method: type ? "PATCH" : "POST",
        body: parsed.data,
        schema: ClassTypeResponseSchema,
      });
      toast("success", type ? t("saved") : t("created", { name }));
      void invalidate();
      onClose();
    } catch (err) {
      setError(errorKey(err) === "conflict" ? t("nameTaken") : errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("close")}
      title={type ? t("editTitle") : t("newTitle")}
      description={t("sheetHint")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="class-type-form"
            action={type ? "save" : "add"}
            loading={busy}
          >
            {type ? t("save") : t("create")}
          </Button>
        </>
      }
    >
      <form id="class-type-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {!type ? (
          <Field label={t("section")}>
            {(id) => (
              <Select id={id} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {data.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={t("name")} hint={t("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("capacityField")} hint={t("capacityHint")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

type SlotDraft = {
  key: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  coachUserId: string;
  facilityId: string;
  capacity: string;
};

let draftKey = 0;
const newKey = () => `slot-${++draftKey}`;

function ScheduleSheet({
  data,
  type,
  onClose,
}: {
  data: ClassTypesResponse;
  type: ClassType;
  onClose: () => void;
}) {
  const t = useT("fitness.owner.classTypes");
  const errors = useT("errors");
  const weekday = useWeekdayName();
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const [slots, setSlots] = useState<SlotDraft[]>(() =>
    type.slots.map((s) => ({
      key: newKey(),
      weekday: s.weekday,
      startsAt: s.startsAt.slice(0, 5),
      endsAt: s.endsAt.slice(0, 5),
      coachUserId: s.coach?.userId ?? "",
      facilityId: s.facility?.id ?? "",
      capacity: s.capacity !== null ? String(s.capacity) : "",
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<SlotDraft>) =>
    setSlots((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const add = () =>
    setSlots((all) => {
      const last = all[all.length - 1];
      return [
        ...all,
        {
          key: newKey(),
          weekday: last ? (last.weekday % 7) + 1 : 1,
          startsAt: last?.startsAt ?? "07:00",
          endsAt: last?.endsAt ?? "08:00",
          coachUserId: last?.coachUserId ?? "",
          facilityId: last?.facilityId ?? "",
          capacity: last?.capacity ?? "",
        },
      ];
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = TeamScheduleSetSchema.safeParse({
      generate: true,
      slots: slots.map((s) => ({
        weekday: s.weekday,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        coachUserId: s.coachUserId || null,
        facilityId: s.facilityId || null,
        capacity: s.capacity.trim() ? Number(s.capacity) : null,
      })),
    });
    if (!parsed.success) {
      setError(t("slotsInvalid"));
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch(`/api/org/class-types/${type.teamId}/schedule`, {
        method: "PUT",
        body: parsed.data,
        schema: ClassTypeResponseSchema,
      });
      toast("success", t("scheduleSaved", { count: result.generated ?? 0 }));
      void invalidate();
      onClose();
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
      closeLabel={t("close")}
      title={t("scheduleTitle", { name: type.name })}
      description={t("scheduleHint")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="schedule-form" action="save" loading={busy}>
            {t("saveSchedule")}
          </Button>
        </>
      }
    >
      <form id="schedule-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {slots.length === 0 ? <p className="text-body text-muted">{t("noSlots")}</p> : null}
        {slots.map((slot, i) => (
          <fieldset
            key={slot.key}
            className="flex flex-col gap-3 rounded-field border border-line p-3"
          >
            <legend className="px-1 text-label uppercase tracking-wide text-muted">
              {t("slotLegend", { number: i + 1 })}
            </legend>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("weekday")}>
                {(id) => (
                  <Select
                    id={id}
                    value={slot.weekday}
                    onChange={(e) => update(slot.key, { weekday: Number(e.target.value) })}
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>
                        {weekday(d)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("startsAt")}>
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    required
                    value={slot.startsAt}
                    onChange={(e) => update(slot.key, { startsAt: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t("endsAt")}>
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    required
                    value={slot.endsAt}
                    onChange={(e) => update(slot.key, { endsAt: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("coach")}>
                {(id) => (
                  <Select
                    id={id}
                    value={slot.coachUserId}
                    onChange={(e) => update(slot.key, { coachUserId: e.target.value })}
                  >
                    <option value="">{t("noCoach")}</option>
                    {data.coaches.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("room")}>
                {(id) => (
                  <Select
                    id={id}
                    value={slot.facilityId}
                    onChange={(e) => update(slot.key, { facilityId: e.target.value })}
                  >
                    <option value="">{t("noRoom")}</option>
                    {data.facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("slotCapacity")}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={999}
                    placeholder={type.capacity ? String(type.capacity) : ""}
                    value={slot.capacity}
                    onChange={(e) => update(slot.key, { capacity: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <div className="flex justify-end">
              <Button
                variant="ghost-danger"
                size="sm"
                action="delete"
                onClick={() => setSlots((all) => all.filter((s) => s.key !== slot.key))}
              >
                {t("removeSlot")}
              </Button>
            </div>
          </fieldset>
        ))}
        <div>
          <Button variant="secondary" action="add" onClick={add} disabled={slots.length >= 14}>
            {t("addSlot")}
          </Button>
        </div>
        <Alert kind="info">{t("generateHint")}</Alert>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

type PolicyDraft = Omit<BookingPolicy, "maxPerDay"> & { maxPerDay: string };

function PolicyTab() {
  const t = useT("fitness.owner.policy");
  const errors = useT("errors");
  const toast = useToast();
  const { org } = useReadyClub();
  const canWrite = org.actor.permissions.includes("org.settings.write");
  const policy = useBookingPolicy();
  const invalidate = useInvalidateFitness();
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (policy.data && draft === null)
      setDraft({
        ...policy.data,
        maxPerDay: policy.data.maxPerDay === null ? "" : String(policy.data.maxPerDay),
      });
  }, [policy.data, draft]);

  if (policy.isError) return <Alert kind="error">{t("loadError")}</Alert>;
  if (!draft) return <div className="h-40 animate-pulse rounded-card bg-raised" />;
  const set = (patch: Partial<PolicyDraft>) => setDraft({ ...draft, ...patch });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const parsed = BookingPolicySchema.safeParse({
      ...draft,
      opensDaysBefore: Number(draft.opensDaysBefore),
      closesMinutesBefore: Number(draft.closesMinutesBefore),
      cancelHoursBefore: Number(draft.cancelHoursBefore),
      maxPerDay: draft.maxPerDay.trim() ? Number(draft.maxPerDay) : null,
    });
    if (!parsed.success) {
      toast("error", t("invalid"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/org/booking-policy", {
        method: "PUT",
        body: parsed.data,
        schema: BookingPolicySchema,
      });
      toast("success", t("saved"));
      void invalidate();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const number = (
    key: "opensDaysBefore" | "closesMinutesBefore" | "cancelHoursBefore",
    max: number,
  ) => (
    <Field label={t(`${key}.label`)} hint={t(`${key}.hint`)}>
      {(id, describedBy) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          required
          disabled={!canWrite}
          value={draft[key]}
          onChange={(e) => set({ [key]: Number(e.target.value) })}
        />
      )}
    </Field>
  );

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => void submit(e)}>
      <Card title={t("windowTitle")} description={t("windowHint")}>
        <div className="grid gap-4 md:grid-cols-3">
          {number("opensDaysBefore", 60)}
          {number("closesMinutesBefore", 1440)}
          {number("cancelHoursBefore", 72)}
        </div>
      </Card>
      <Card title={t("rulesTitle")} description={t("rulesHint")}>
        <div className="flex flex-col gap-1">
          <CheckField
            label={t("lateCancelConsumes.label")}
            hint={t("lateCancelConsumes.hint")}
            checked={draft.lateCancelConsumes}
            disabled={!canWrite}
            onChange={(v) => set({ lateCancelConsumes: v })}
          />
          <CheckField
            label={t("noShowConsumes.label")}
            hint={t("noShowConsumes.hint")}
            checked={draft.noShowConsumes}
            disabled={!canWrite}
            onChange={(v) => set({ noShowConsumes: v })}
          />
          <CheckField
            label={t("waitlist.label")}
            hint={t("waitlist.hint")}
            checked={draft.waitlist}
            disabled={!canWrite}
            onChange={(v) => set({ waitlist: v })}
          />
          <div className="max-w-xs pt-2">
            <Field label={t("maxPerDay.label")} hint={t("maxPerDay.hint")}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10}
                  placeholder={t("maxPerDay.none")}
                  disabled={!canWrite}
                  value={draft.maxPerDay}
                  onChange={(e) => set({ maxPerDay: e.target.value })}
                />
              )}
            </Field>
          </div>
        </div>
      </Card>
      <Card title={t("communityTitle")} description={t("communityHint")}>
        <div className="flex flex-col gap-1">
          <CheckField
            label={t("showAttendees.label")}
            hint={t("showAttendees.hint")}
            checked={draft.showAttendees}
            disabled={!canWrite}
            onChange={(v) => set({ showAttendees: v })}
          />
          <CheckField
            label={t("showLeaderboards.label")}
            hint={t("showLeaderboards.hint")}
            checked={draft.showLeaderboards}
            disabled={!canWrite}
            onChange={(v) => set({ showLeaderboards: v })}
          />
        </div>
      </Card>
      {canWrite ? (
        <div className="flex justify-end">
          <Button type="submit" action="save" loading={busy}>
            {t("save")}
          </Button>
        </div>
      ) : (
        <Alert kind="info">{t("readOnly")}</Alert>
      )}
    </form>
  );
}

/** Deportes que encajan en un box: los de actividad (CrossFit, fitness, yoga, pilates) y "otro". */
const BOX_SPORTS = [...ACTIVITY_SPORT_CODES, "athletics", "gymnastics", "other"] as const;

/**
 * Una disciplina del box (ADR 0050): en un club deportivo es una sección; aquí basta con su nombre
 * y lo que se entrena. Se crea y se renombra desde el horario, sin pasar por "Secciones".
 */
function DisciplineSheet({
  discipline,
  onClose,
}: {
  discipline: { id: string; name: string } | "new";
  onClose: () => void;
}) {
  const t = useT("fitness.owner.classTypes.disciplines");
  const c = useT("fitness.common");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const { slug } = useReadyClub();
  const { locale } = useLocale();
  const isNew = discipline === "new";
  const [name, setName] = useState(isNew ? "" : discipline.name);
  const [sportCode, setSportCode] = useState("crossfit");
  const [busy, setBusy] = useState(false);
  const sports = useQuery({
    queryKey: ["org", slug, "sports"],
    queryFn: () => apiFetch("/api/org/sports", { schema: SportCatalogResponseSchema }),
    enabled: isNew,
  });
  const options = (sports.data?.sports ?? []).filter((s) =>
    (BOX_SPORTS as readonly string[]).includes(s.code),
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (isNew) {
        await apiFetch("/api/org/sections", {
          method: "POST",
          body: { name: name.trim(), sportCode, kind: "activity" },
          schema: SectionResponseSchema,
        });
        toast("success", t("created", { name: name.trim() }));
      } else {
        await apiFetch(`/api/org/sections/${discipline.id}`, {
          method: "PATCH",
          body: { name: name.trim() },
          schema: SectionResponseSchema,
        });
        toast("success", t("renamed", { name: name.trim() }));
      }
      void invalidate();
      onClose();
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
      title={isNew ? t("sheetNew") : t("sheetRename")}
      description={isNew ? t("sheetNewHint") : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="discipline-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="discipline-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")} hint={t("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {isNew ? (
          <Field label={t("sport")} hint={t("sportHint")}>
            {(id) => (
              <Select id={id} value={sportCode} onChange={(e) => setSportCode(e.target.value)}>
                {options.map((sport) => (
                  <option key={sport.code} value={sport.code}>
                    {sport.name[locale]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </form>
    </Sheet>
  );
}

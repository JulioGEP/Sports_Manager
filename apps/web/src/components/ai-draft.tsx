import {
  AI_INTENSITIES,
  AiApplyResponseSchema,
  AiDraftConfigResponseSchema,
  AiGenerationResponseSchema,
  type AiApplyResponse,
  type AiCheck,
  type AiDraftConfigResponse,
  type AiGenerationResponse,
  type AiIntensity,
  type AiProposalItem,
  type AiProposalSession,
  type SessionBlock,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ContentChips, RestrictionTags, useShortDate } from "@/components/training-ui";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useLocale, useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Field,
  Input,
  Segmented,
  Sheet,
  StatusChip,
  useToast,
  type StatusKind,
} from "@/ui";

/**
 * Propuesta de sesión con IA (ADR 0044): el formulario (qué entrenamientos, objetivo, 100 puntos de
 * énfasis, intensidad, material y contexto), la espera mientras se genera y el borrador con su
 * porqué, que quien planifica aplica a las sesiones o descarta. Nada se aplica solo.
 */

const textareaClass =
  "w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club";
const checkboxClass = "size-5 shrink-0 accent-(--club-fill)";

/** Lo que necesita el formulario. Cuenta la cuota, así que se refresca al pedir. */
export function useAiConfig(teamId: string, date: string | null) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: ["org", slug, "team", teamId, "ai-config", date ?? "today"],
    queryFn: () =>
      apiFetch(`/api/org/teams/${teamId}/ai-config${date ? `?date=${date}` : ""}`, {
        schema: AiDraftConfigResponseSchema,
      }),
    retry: false,
    staleTime: 30_000,
  });
}

const statusKind: Record<AiGenerationResponse["generation"]["status"], StatusKind> = {
  queued: "neutral",
  running: "info",
  ready: "success",
  failed: "danger",
};

/**
 * El botón y su panel. Solo aparece si el club tiene la propuesta con IA y quien mira planifica el
 * equipo. `eventIds` marca de partida los entrenamientos a planificar (una sesión, o la semana).
 */
export function AiDraftAction({
  teamId,
  date,
  eventIds,
  label,
  size,
  onApplied,
}: {
  teamId: string;
  date: string | null;
  eventIds?: readonly string[];
  label: string;
  size?: "sm";
  onApplied?: (result: AiApplyResponse) => void;
}) {
  const config = useAiConfig(teamId, date);
  const [open, setOpen] = useState(false);
  if (!config.data?.available || !config.data.access.request) return null;
  return (
    <>
      <Button
        variant="secondary"
        action="propose"
        {...(size ? { size } : {})}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open ? (
        <AiDraftSheet
          teamId={teamId}
          config={config.data}
          {...(eventIds ? { initialEventIds: eventIds } : {})}
          onClose={() => setOpen(false)}
          onApplied={(result) => {
            setOpen(false);
            onApplied?.(result);
          }}
        />
      ) : null}
    </>
  );
}

function AiDraftSheet({
  teamId,
  config,
  initialEventIds,
  onClose,
  onApplied,
}: {
  teamId: string;
  config: AiDraftConfigResponse;
  initialEventIds?: readonly string[];
  onClose: () => void;
  onApplied: (result: AiApplyResponse) => void;
}) {
  const t = useT("aiDraft");
  const c = useT("common");
  const { locale } = useLocale();
  const [generationId, setGenerationId] = useState<string | null>(null);
  const profile = config.profile.name[locale];
  const frame: SheetFrame = {
    title: t("title"),
    description: t("description", { profile }),
    onClose,
    closeLabel: c("close"),
  };
  return generationId ? (
    <GenerationView
      frame={frame}
      id={generationId}
      profile={profile}
      onBack={() => setGenerationId(null)}
      onApplied={onApplied}
    />
  ) : (
    <DraftForm
      frame={frame}
      teamId={teamId}
      config={config}
      {...(initialEventIds ? { initialEventIds } : {})}
      onRequested={setGenerationId}
    />
  );
}

/** Lo común del panel: título, descripción y cierre. Cada vista pone su cuerpo y su pie. */
interface SheetFrame {
  title: string;
  description: string;
  onClose: () => void;
  closeLabel: string;
}

// --- Formulario ---

function DraftForm({
  frame,
  teamId,
  config,
  initialEventIds,
  onRequested,
}: {
  frame: SheetFrame;
  teamId: string;
  config: AiDraftConfigResponse;
  initialEventIds?: readonly string[];
  onRequested: (id: string) => void;
}) {
  const t = useT("aiDraft");
  const c = useT("common");
  const st = useT("aiDraft.status");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const { locale } = useLocale();
  const dates = useShortDate();
  const events = config.week.events;
  const known = new Set(events.map((e) => e.id));
  const [eventIds, setEventIds] = useState<string[]>(() => {
    const initial = (initialEventIds ?? []).filter((id) => known.has(id));
    if (initial.length > 0) return initial;
    const unplanned = events.filter((e) => e.itemsCount === 0).map((e) => e.id);
    return unplanned.length > 0 ? unplanned : events.map((e) => e.id);
  });
  const [objective, setObjective] = useState("");
  const [emphasis, setEmphasis] = useState<Record<string, number>>(config.profile.defaultEmphasis);
  const [intensity, setIntensity] = useState<AiIntensity>("medium");
  const [equipmentIds, setEquipmentIds] = useState<string[]>(config.equipment.map((e) => e.id));
  const [extraEquipment, setExtraEquipment] = useState("");
  const [context, setContext] = useState("");
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [includeVariants, setIncludeVariants] = useState(true);
  const [busy, setBusy] = useState(false);
  const total = Object.values(emphasis).reduce((a, n) => a + n, 0);
  const { quota } = config;
  const exhausted = quota.remaining === 0;
  const resetsOn = dates.long(quota.resetsOn);

  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...list, id] : list.filter((x) => x !== id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const response = await apiFetch(`/api/org/teams/${teamId}/ai-drafts`, {
        method: "POST",
        body: {
          eventIds,
          objective: objective.trim() || null,
          emphasis,
          intensity,
          equipmentIds,
          extraEquipment: extraEquipment.trim() || null,
          context: context.trim() || null,
          libraryOnly,
          includeVariants,
        },
        schema: AiGenerationResponseSchema,
      });
      client.setQueryData(["org", slug, "ai-draft", response.generation.id], response);
      void client.invalidateQueries({ queryKey: ["org", slug, "team", teamId, "ai-config"] });
      onRequested(response.generation.id);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      {...frame}
      footer={
        <>
          <Button variant="secondary" onClick={frame.onClose}>
            {c("cancel")}
          </Button>
          <Button
            type="submit"
            form="ai-draft-form"
            action="propose"
            loading={busy}
            disabled={exhausted || eventIds.length === 0 || total !== 100}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="ai-draft-form" className="flex flex-col gap-5" onSubmit={(e) => void submit(e)}>
        <Alert kind={exhausted ? "warning" : "info"}>
          {exhausted
            ? t("quotaEmpty", { limit: quota.limit, date: resetsOn })
            : t("quota", { remaining: quota.remaining, limit: quota.limit, date: resetsOn })}
        </Alert>
        {config.recent.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-body font-semibold text-ink">{t("recent")}</h3>
            <ul className="flex flex-col gap-1">
              {config.recent.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 rounded-field px-3 text-left hover:bg-raised"
                    onClick={() => onRequested(g.id)}
                  >
                    <span className="text-body text-ink">
                      {g.dates.map((d) => dates.weekday(d)).join(", ")}
                    </span>
                    <StatusChip kind={g.appliedAt ? "club" : statusKind[g.status]}>
                      {g.appliedAt ? st("applied") : st(g.status)}
                    </StatusChip>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-secondary font-medium text-ink">{t("sessions")}</legend>
          {events.length === 0 ? (
            <p className="text-secondary text-muted">{t("noEvents")}</p>
          ) : (
            events.map((event) => (
              <label key={event.id} className="flex min-h-12 items-center gap-3 text-body text-ink">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={eventIds.includes(event.id)}
                  onChange={(e) => setEventIds((list) => toggle(list, event.id, e.target.checked))}
                />
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="first-letter:uppercase">{dates.long(event.date)}</span>
                  <span className="text-secondary text-muted">
                    {[event.facility?.name].filter(Boolean).join(" · ")}
                  </span>
                  {event.itemsCount > 0 ? (
                    <StatusChip kind="neutral">{t("planned")}</StatusChip>
                  ) : null}
                </span>
              </label>
            ))
          )}
          <p className="text-secondary text-muted">{t("sessionsHint")}</p>
        </fieldset>

        <Field label={t("objective")} hint={t("objectiveHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              maxLength={200}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-secondary font-medium text-ink">{t("emphasis")}</legend>
          <p className="text-secondary text-muted">{t("emphasisHint")}</p>
          {config.profile.axes.map((axis) => {
            const value = emphasis[axis.code] ?? 0;
            const id = `emphasis-${axis.code}`;
            return (
              <div key={axis.code} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={id} className="text-secondary font-medium text-ink">
                    {axis.label[locale]}
                  </label>
                  <span className="font-mono text-secondary text-ink">{value}</span>
                </div>
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={value}
                  aria-valuetext={t("axisValue", { axis: axis.label[locale], points: value })}
                  className="h-11 w-full accent-(--club-fill)"
                  onChange={(e) =>
                    setEmphasis((current) => ({ ...current, [axis.code]: Number(e.target.value) }))
                  }
                />
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              role="status"
              className={`text-secondary font-medium ${total === 100 ? "text-success" : total > 100 ? "text-danger" : "text-ink"}`}
            >
              {total === 100
                ? t("emphasisReady")
                : total < 100
                  ? t("emphasisLeft", { points: 100 - total })
                  : t("emphasisOver", { points: total - 100 })}
            </p>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => setEmphasis(config.profile.defaultEmphasis)}
            >
              {t("emphasisReset")}
            </Button>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <span className="text-secondary font-medium text-ink">{t("intensity")}</span>
          <Segmented<AiIntensity>
            label={t("intensity")}
            value={intensity}
            onChange={setIntensity}
            options={AI_INTENSITIES.map((key) => ({ key, label: t(`intensities.${key}`) }))}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-secondary font-medium text-ink">{t("equipment")}</legend>
          {config.equipment.length === 0 ? (
            <p className="text-secondary text-muted">{t("noEquipment")}</p>
          ) : (
            <>
              <p className="text-secondary text-muted">{t("equipmentHint")}</p>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {config.equipment.map((item) => (
                  <label
                    key={item.id}
                    className="flex min-h-12 items-center gap-3 text-body text-ink"
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={equipmentIds.includes(item.id)}
                      onChange={(e) =>
                        setEquipmentIds((list) => toggle(list, item.id, e.target.checked))
                      }
                    />
                    <span>
                      {item.name}
                      {item.quantity ? (
                        <span className="font-mono text-secondary text-muted">
                          {" "}
                          · {item.quantity}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
          <Field label={t("extraEquipment")}>
            {(id) => (
              <Input
                id={id}
                maxLength={300}
                value={extraEquipment}
                onChange={(e) => setExtraEquipment(e.target.value)}
              />
            )}
          </Field>
        </fieldset>

        <Field label={t("context")} hint={t("contextHint")}>
          {(id, describedBy) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              rows={3}
              maxLength={800}
              className={textareaClass}
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-col">
          <label className="flex min-h-12 items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={libraryOnly}
              onChange={(e) => setLibraryOnly(e.target.checked)}
            />
            <span className="flex flex-col">
              <span>{t("libraryOnly")}</span>
              <span className="text-secondary text-muted">{t("libraryOnlyHint")}</span>
            </span>
          </label>
          <label className="flex min-h-12 items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={includeVariants}
              onChange={(e) => setIncludeVariants(e.target.checked)}
            />
            {t("includeVariants")}
          </label>
        </div>
      </form>
    </Sheet>
  );
}

// --- La propuesta ---

function GenerationView({
  frame,
  id,
  profile,
  onBack,
  onApplied,
}: {
  frame: SheetFrame;
  id: string;
  profile: string;
  onBack: () => void;
  onApplied: (result: AiApplyResponse) => void;
}) {
  const t = useT("aiDraft");
  const f = useT("aiDraft.failures");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  // Nulo: todas las sesiones de la propuesta.
  const [selected, setSelected] = useState<string[] | null>(null);
  const [saveNewDrills, setSaveNewDrills] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["org", slug, "ai-draft", id],
    queryFn: () => apiFetch(`/api/org/ai-drafts/${id}`, { schema: AiGenerationResponseSchema }),
    retry: false,
    refetchInterval: (q) => {
      const status = q.state.data?.generation.status;
      return status === "queued" || status === "running" ? 3000 : false;
    },
  });
  const data = query.data;
  const pending =
    !data || data.generation.status === "queued" || data.generation.status === "running";
  const proposal = !pending ? data.generation.proposal : null;
  const chosen = selected ?? proposal?.sessions.map((s) => s.eventId) ?? [];

  async function apply() {
    if (!data) return;
    setBusy(true);
    try {
      const result = await apiFetch(`/api/org/ai-drafts/${data.generation.id}/apply`, {
        method: "POST",
        body: { eventIds: chosen, saveNewDrills },
        schema: AiApplyResponseSchema,
      });
      toast("success", t("applied", { count: result.sessions.length }));
      void client.invalidateQueries({ queryKey: ["org", slug] });
      onApplied(result);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Button variant="secondary" onClick={onBack}>
      {t("retry")}
    </Button>
  );
  const footer = query.isError ? (
    back
  ) : pending ? (
    <Button variant="secondary" onClick={frame.onClose}>
      {frame.closeLabel}
    </Button>
  ) : proposal && data.access.apply ? (
    <>
      {back}
      <Button loading={busy} disabled={chosen.length === 0} onClick={() => void apply()}>
        {t("apply")}
      </Button>
    </>
  ) : (
    back
  );

  return (
    <Sheet open {...frame} footer={footer}>
      {query.isError ? (
        <Alert kind="error">{errors(errorKey(query.error))}</Alert>
      ) : pending ? (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <h3 className="text-body font-semibold text-ink">{t("waitingTitle")}</h3>
          <p className="text-body text-ink">{t("waiting", { profile })}</p>
          <div className="h-2 w-full overflow-hidden rounded-chip bg-raised">
            <div className="h-full w-1/3 animate-pulse rounded-chip bg-club" />
          </div>
          <p className="text-secondary text-muted">{t("waitingClose")}</p>
        </div>
      ) : !proposal ? (
        <Alert kind="error">
          {f(data.generation.failure ?? "model_error")} {t("failedQuota")}
        </Alert>
      ) : (
        <ProposalView
          data={data}
          selected={chosen}
          onSelect={setSelected}
          saveNewDrills={saveNewDrills}
          onSaveNewDrills={setSaveNewDrills}
        />
      )}
    </Sheet>
  );
}

function useCheckText(data: AiGenerationResponse) {
  const t = useT("aiDraft.checks");
  const tags = useT("tags");
  const nameOf = (id: string | null) =>
    data.lookups.players.find((p) => p.id === id)?.name ?? t("someone");
  return (check: AiCheck) => {
    const v = check.values;
    const values: Record<string, string | number> = { ...v, name: nameOf(check.playerId) };
    if (check.code === "restriction" && typeof v.tags === "string")
      values.tags = v.tags
        .split(",")
        .map((tag) => tags(tag.trim()))
        .join(", ");
    return t(check.code, values);
  };
}

function ProposalView({
  data,
  selected,
  onSelect,
  saveNewDrills,
  onSaveNewDrills,
}: {
  data: AiGenerationResponse;
  selected: string[];
  onSelect: (selected: string[]) => void;
  saveNewDrills: boolean;
  onSaveNewDrills: (on: boolean) => void;
}) {
  const t = useT("aiDraft");
  const checkText = useCheckText(data);
  const { generation } = data;
  const proposal = generation.proposal!;
  const hasNew = proposal.sessions.some((s) =>
    s.blocks.some((b) => b.items.some((i) => i.newDrill !== null)),
  );
  const planned = new Set(generation.planned.map((p) => p.eventId));

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1">
        <h3 className="text-body font-semibold text-ink">{t("summary")}</h3>
        <p className="whitespace-pre-line text-body text-ink">{proposal.summary}</p>
      </section>
      {proposal.checks.length > 0 ? (
        <Alert kind="warning">{proposal.checks.map(checkText).join(" ")}</Alert>
      ) : null}

      {proposal.sessions.map((session) => (
        <ProposedSession
          key={session.eventId}
          data={data}
          session={session}
          planned={planned.has(session.eventId)}
          selected={selected.includes(session.eventId)}
          canApply={data.access.apply}
          onSelect={(on) =>
            onSelect(
              on ? [...selected, session.eventId] : selected.filter((x) => x !== session.eventId),
            )
          }
          checkText={checkText}
        />
      ))}

      {data.access.apply && hasNew ? (
        <label className="flex min-h-12 items-center gap-3 border-t border-line pt-4 text-body text-ink">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={saveNewDrills}
            onChange={(e) => onSaveNewDrills(e.target.checked)}
          />
          {t("saveNewDrills")}
        </label>
      ) : null}
    </div>
  );
}

function ProposedSession({
  data,
  session,
  planned,
  selected,
  canApply,
  onSelect,
  checkText,
}: {
  data: AiGenerationResponse;
  session: AiProposalSession;
  planned: boolean;
  selected: boolean;
  canApply: boolean;
  onSelect: (on: boolean) => void;
  checkText: (check: AiCheck) => string;
}) {
  const t = useT("aiDraft");
  const { locale } = useLocale();
  const dates = useShortDate();
  const labelOf = (block: SessionBlock) =>
    data.generation.blockLabels.find((b) => b.block === block)?.label[locale] ?? block;
  const heading = <span className="first-letter:uppercase">{dates.long(session.date)}</span>;
  return (
    <section className="flex flex-col gap-3 rounded-field border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canApply ? (
          <label className="flex min-h-12 items-center gap-3 text-body font-semibold text-ink">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
            />
            {heading}
          </label>
        ) : (
          <h3 className="text-body font-semibold text-ink">{heading}</h3>
        )}
        <span className="font-mono text-secondary text-ink">
          {t("plannedMinutes", { planned: session.plannedMinutes, available: session.minutes })}
        </span>
      </div>
      {planned ? <p className="text-secondary text-muted">{t("replaces")}</p> : null}
      <dl className="grid gap-x-4 gap-y-1 text-body sm:grid-cols-[max-content_1fr]">
        <dt className="text-secondary text-muted">{t("objectiveLabel")}</dt>
        <dd className="font-medium text-ink">{session.objective}</dd>
        <dt className="text-secondary text-muted">{t("targetRpe")}</dt>
        <dd className="font-mono text-ink">{session.targetRpe}</dd>
        {session.contentIds.length > 0 ? (
          <>
            <dt className="text-secondary text-muted">{t("contents")}</dt>
            <dd>
              <ContentChips ids={session.contentIds} contents={data.lookups.contents} />
            </dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-col gap-1 rounded-field bg-club-soft p-3">
        <span className="text-label font-medium uppercase tracking-wide text-club-soft-text">
          {t("why")}
        </span>
        <p className="whitespace-pre-line text-secondary text-club-soft-text">
          {session.rationale}
        </p>
      </div>
      {session.checks.length + session.warnings.length > 0 ? (
        <Alert kind="warning">
          <span className="flex flex-col gap-1">
            <span className="font-medium">{t("warnings")}</span>
            {[...session.checks.map(checkText), ...session.warnings].map((text, i) => (
              <span key={i}>{text}</span>
            ))}
          </span>
        </Alert>
      ) : null}
      {session.blocks.map((block) => (
        <div key={block.block} className="flex flex-col gap-2">
          <h4 className="text-secondary font-semibold uppercase tracking-wide text-muted">
            {labelOf(block.block)} ·{" "}
            <span className="font-mono">{block.items.reduce((a, i) => a + i.minutes, 0)} min</span>
          </h4>
          <ol className="flex flex-col gap-2">
            {block.items.map((item, i) => (
              <ProposedItem key={i} data={data} item={item} />
            ))}
          </ol>
        </div>
      ))}
      {session.equipment.length > 0 ? (
        <p className="text-secondary text-muted">
          {t("equipmentNeeded")}: {session.equipment.join(", ")}
        </p>
      ) : null}
    </section>
  );
}

function ProposedItem({ data, item }: { data: AiGenerationResponse; item: AiProposalItem }) {
  const t = useT("aiDraft");
  const it = useT("session.item");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const drill = item.drillId ? data.lookups.drills.find((d) => d.id === item.drillId) : null;
  const facts: string[] = [];
  if (item.sets && item.reps) facts.push(it("setsReps", { sets: item.sets, reps: item.reps }));
  else if (item.sets) facts.push(it("sets", { sets: item.sets }));
  if (item.restSec) facts.push(it("rest", { seconds: item.restSec }));
  if (item.targetRpe !== null) facts.push(it("rpe", { rpe: item.targetRpe }));
  if (item.groupLabel) facts.push(item.groupLabel);
  if (item.playerIds && item.playerIds.length > 0)
    facts.push(
      item.playerIds
        .map((id) => data.lookups.players.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(", "),
    );
  const extra = item.newDrill;
  return (
    <li className="flex flex-col gap-1.5 rounded-field bg-raised p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body font-semibold text-ink">{item.title}</span>
          {extra ? <StatusChip kind="info">{t("newDrill")}</StatusChip> : null}
        </span>
        <span className="font-mono text-secondary text-ink">{item.minutes} min</span>
      </div>
      {drill ? (
        <Link to={paths.drill(drill.id)} className="text-secondary text-club-text">
          {t("fromLibrary", { name: drill.name })}
        </Link>
      ) : null}
      {facts.length > 0 ? <p className="text-secondary text-muted">{facts.join(" · ")}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <ContentChips ids={item.contentIds} contents={data.lookups.contents} />
        <RestrictionTags tags={item.restrictionTags} />
      </div>
      {item.notes ? (
        <p className="whitespace-pre-line text-secondary text-ink">{item.notes}</p>
      ) : null}
      {extra ? (
        <details className="text-secondary text-ink">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-club-text">
            {t("howTo")}
          </summary>
          <dl className="flex flex-col gap-1.5">
            {(
              [
                ["description", extra.description],
                ["rules", extra.rules],
                ["coachingPoints", extra.coachingPoints],
                ["variants", extra.variants],
                ["organization", [extra.format, extra.space].filter(Boolean).join(" · ")],
                ["material", extra.material],
              ] as const
            )
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="font-medium text-muted">{t(`drillFields.${key}`)}</dt>
                  <dd className="whitespace-pre-line">{value}</dd>
                </div>
              ))}
          </dl>
        </details>
      ) : null}
    </li>
  );
}

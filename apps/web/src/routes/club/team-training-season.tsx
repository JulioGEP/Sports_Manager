import {
  addDays,
  TeamSeasonResponseSchema,
  type TeamSeasonResponse,
  type TrainingContent,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { Link, useParams } from "react-router";
import { ContentChips, useLoadFormat } from "@/components/training-ui";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
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
  Sheet,
  useToast,
} from "@/ui";
import { todayIn, useClubTimezone } from "./team-training";

type Cycle = TeamSeasonResponse["cycles"][number];
type Week = TeamSeasonResponse["weeks"][number];

const textareaClass =
  "w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink";

/**
 * Plan de temporada de un equipo (Bloque 21): el plan, sus ciclos con los contenidos foco y la
 * carga semanal objetivo, la carga planificada frente a la real de cada semana y los partidos.
 */
export function TeamTrainingSeasonPage() {
  const t = useT("training.season");
  const tt = useT("training");
  const c = useT("common");
  const errors = useT("errors");
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const client = useQueryClient();
  const dates = useDates();
  const fmt = useLoadFormat();
  const toast = useToast();
  const [editingPlan, setEditingPlan] = useState(false);
  const [editing, setEditing] = useState<Cycle | "new" | null>(null);
  const [removing, setRemoving] = useState<Cycle | null>(null);
  const [allMatches, setAllMatches] = useState(false);

  const season = useQuery({
    queryKey: ["org", slug, "team", id, "training", "season"],
    queryFn: () =>
      apiFetch(`/api/org/teams/${id}/training/season`, { schema: TeamSeasonResponseSchema }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  if (season.isError) {
    const notFound = season.error instanceof ApiClientError && season.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(season.error))}</Alert>
    );
  }
  if (!season.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-56 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const data = season.data;
  const { team, plan, cycles, weeks, matches, contents, access } = data;
  const weeksOf = (cy: Cycle) =>
    weeks.filter((w) => w.start <= cy.endsOn && addDays(w.start, 6) >= cy.startsOn);
  const meanActual = (cy: Cycle) => {
    const values = weeksOf(cy)
      .map((w) => w.actual)
      .filter((v): v is number => v !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const shownMatches = allMatches ? matches : matches.slice(0, 8);

  async function remove(cy: Cycle) {
    setRemoving(null);
    try {
      await apiFetch(`/api/org/teams/${id}/training/cycles/${cy.id}`, { method: "DELETE" });
      toast("success", t("cycle.removed", { name: cy.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.teamTraining(id)}
        backLabel={tt("backToWeek")}
        eyebrow={`${team.name} · ${data.season.name}`}
        title={t("title")}
        description={plan ? plan.name : t("noPlan")}
        actions={
          access.write ? (
            <>
              <Button variant="secondary" action="edit" onClick={() => setEditingPlan(true)}>
                {plan ? t("plan.edit") : t("plan.create")}
              </Button>
              <Button action="add" onClick={() => setEditing("new")}>
                {t("cycle.new")}
              </Button>
            </>
          ) : null
        }
      />

      {plan?.notes ? (
        <Card title={t("plan.notes")}>
          <p className="whitespace-pre-line text-body text-ink">{plan.notes}</p>
        </Card>
      ) : null}

      <Card title={t("load.title")} description={t("load.description")}>
        <SeasonLoadChart weeks={weeks} cycles={cycles} />
      </Card>

      <Card title={t("cycles")} description={t("cyclesHint")} padded={cycles.length > 0}>
        {cycles.length === 0 ? (
          <EmptyState
            icon={<Icon.CalendarBlank />}
            title={t("cycle.empty")}
            description={t("cycle.emptyHint")}
            action={
              access.write ? (
                <Button
                  action="add"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing("new")}
                >
                  {t("cycle.new")}
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {cycles.map((cy) => {
              const mean = meanActual(cy);
              return (
                <li
                  key={cy.id}
                  className="flex flex-col gap-2 rounded-field border border-border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-body font-semibold text-ink">{cy.name}</span>
                      <span className="text-secondary text-muted">
                        {dates.range(cy.startsOn, cy.endsOn)}
                      </span>
                    </div>
                    {access.write ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="tertiary"
                          action="edit"
                          onClick={() => setEditing(cy)}
                        >
                          {c("edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost-danger"
                          action="delete"
                          onClick={() => setRemoving(cy)}
                        >
                          {c("remove")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {cy.focusContentIds.length > 0 ? (
                    <ContentChips ids={cy.focusContentIds} contents={contents} link />
                  ) : null}
                  <p className="text-secondary text-muted">
                    {[
                      cy.targetWeeklyLoad !== null
                        ? t("cycle.targetValue", { load: fmt.load(cy.targetWeeklyLoad) })
                        : null,
                      mean !== null ? t("cycle.mean", { load: fmt.load(mean) }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("cycle.noTarget")}
                  </p>
                  {cy.notes ? (
                    <p className="whitespace-pre-line text-secondary text-ink">{cy.notes}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t("matches")} description={t("matchesHint", { count: matches.length })}>
        {matches.length === 0 ? (
          <p className="text-secondary text-muted">{t("noMatches")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col">
              {shownMatches.map((m, i) => (
                <li
                  key={`${m.date}-${m.matchId ?? i}`}
                  className="flex flex-wrap items-center gap-3 border-t border-line py-2 first:border-t-0"
                >
                  <span className="w-28 shrink-0 text-secondary text-muted">
                    {dates.day(m.date)}
                  </span>
                  <span className="min-w-0 flex-1 text-body text-ink">
                    {m.opponent ?? t("noOpponent")}
                  </span>
                  {m.ownScore !== null && m.opponentScore !== null ? (
                    <span className="font-mono text-body font-semibold text-ink">
                      {`${m.ownScore}–${m.opponentScore}`}
                    </span>
                  ) : null}
                  {m.matchId && m.ownScore !== null ? (
                    <Link to={paths.matchStats(m.matchId)} className="text-secondary font-medium">
                      {t("openStats")}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {matches.length > 8 ? (
              <Button variant="tertiary" size="sm" onClick={() => setAllMatches((v) => !v)}>
                {allMatches ? t("showLess") : t("showAll", { count: matches.length })}
              </Button>
            ) : null}
          </div>
        )}
      </Card>

      {access.write ? (
        <>
          {editingPlan ? (
            <PlanSheet
              teamId={id}
              plan={plan}
              seasonName={data.season.name}
              onClose={() => setEditingPlan(false)}
              onDone={() => void reload()}
            />
          ) : null}
          {editing ? (
            <CycleSheet
              teamId={id}
              cycle={editing === "new" ? null : editing}
              season={data.season}
              contents={contents}
              onClose={() => setEditing(null)}
              onDone={() => void reload()}
            />
          ) : null}
        </>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("cycle.confirmRemove", { name: removing?.name ?? "" })}
        body={t("cycle.confirmRemoveBody")}
        confirmLabel={c("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

/**
 * Carga por semana: barra hueca la planificada y maciza la real, con los ciclos de fondo, un
 * punto por partido y la semana en curso marcada. El resumen va en texto para el lector.
 */
function SeasonLoadChart({ weeks, cycles }: { weeks: readonly Week[]; cycles: readonly Cycle[] }) {
  const t = useT("training.season.load");
  const intl = useIntl();
  const fmt = useLoadFormat();
  const timezone = useClubTimezone();
  if (weeks.length === 0) return <p className="text-secondary text-muted">{t("empty")}</p>;
  const today = todayIn(timezone);
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.planned, w.actual ?? 0)));
  const bw = 22;
  const top = 22;
  const height = 150;
  const width = weeks.length * bw;
  const y = (v: number) => top + height - (v / max) * height;
  const index = (date: string) =>
    weeks.findIndex((w) => w.start <= date && addDays(w.start, 6) >= date);
  const planned = weeks.reduce((a, w) => a + w.planned, 0);
  const actual = weeks.reduce((a, w) => a + (w.actual ?? 0), 0);
  const label = (iso: string) =>
    intl.formatDate(new Date(`${iso}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return (
    <figure className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-secondary text-muted">
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-sm border-2"
            style={{ borderColor: "var(--club-fill)" }}
          />
          {t("planned")}
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-sm"
            style={{ background: "var(--club-fill)" }}
          />
          {t("actual")}
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-full"
            style={{ background: "var(--text)" }}
          />
          {t("match")}
        </li>
      </ul>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${top + height + 20}`}
          className="h-48 min-w-full"
          style={{ width: Math.max(width, 320) }}
          role="img"
          aria-label={t("summary", {
            weeks: weeks.length,
            planned: fmt.load(planned),
            actual: fmt.load(actual),
          })}
        >
          {cycles.map((cy, i) => {
            const from = Math.max(0, index(cy.startsOn) === -1 ? 0 : index(cy.startsOn));
            const toIndex = index(cy.endsOn);
            const to = toIndex === -1 ? weeks.length - 1 : toIndex;
            if (to < from) return null;
            return (
              <g key={cy.id}>
                <rect
                  x={from * bw}
                  y={top}
                  width={(to - from + 1) * bw}
                  height={height}
                  fill={i % 2 === 0 ? "var(--chart-grid)" : "transparent"}
                  opacity={0.5}
                />
                <text x={from * bw + 3} y={top - 8} fontSize={10} fill="var(--text-muted)">
                  {cy.name.length > (to - from + 1) * 4
                    ? `${cy.name.slice(0, (to - from + 1) * 4)}…`
                    : cy.name}
                </text>
              </g>
            );
          })}
          <line x1={0} x2={width} y1={top + height} y2={top + height} stroke="var(--chart-grid)" />
          {weeks.map((w, i) => {
            const current = w.start <= today && addDays(w.start, 6) >= today;
            return (
              <g key={w.start}>
                {current ? (
                  <rect
                    x={i * bw}
                    y={top}
                    width={bw}
                    height={height}
                    fill="var(--club-soft)"
                    opacity={0.7}
                  />
                ) : null}
                {w.planned > 0 ? (
                  <rect
                    x={i * bw + 4}
                    y={y(w.planned)}
                    width={bw - 8}
                    height={top + height - y(w.planned)}
                    fill="none"
                    stroke="var(--club-fill)"
                    strokeWidth={1.5}
                    rx={2}
                  />
                ) : null}
                {w.actual ? (
                  <rect
                    x={i * bw + 7}
                    y={y(w.actual)}
                    width={bw - 14}
                    height={top + height - y(w.actual)}
                    fill="var(--club-fill)"
                    rx={1.5}
                  />
                ) : null}
                {Array.from({ length: w.matches }, (_, m) => (
                  <circle
                    key={m}
                    cx={i * bw + bw / 2 + (m - (w.matches - 1) / 2) * 6}
                    cy={top + height + 6}
                    r={2.6}
                    fill="var(--text)"
                  />
                ))}
                {i % 4 === 0 ? (
                  <text x={i * bw + 2} y={top + height + 18} fontSize={9} fill="var(--text-muted)">
                    {label(w.start)}
                  </text>
                ) : null}
                <title>
                  {`${label(w.start)} · ${t("planned")}: ${fmt.load(w.planned)} · ${t("actual")}: ${fmt.load(w.actual)} · ${t("sessions", { count: w.sessions })}`}
                </title>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/** Nombre y notas del plan de temporada. */
function PlanSheet({
  teamId,
  plan,
  seasonName,
  onClose,
  onDone,
}: {
  teamId: string;
  plan: TeamSeasonResponse["plan"];
  seasonName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT("training.season.plan");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(plan?.name ?? t("defaultName", { season: seasonName }));
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/org/teams/${teamId}/training/plan`, {
        method: "PUT",
        body: { name: name.trim(), notes: notes.trim() || null },
      });
      toast("success", t("saved"));
      onClose();
      onDone();
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
      title={plan ? t("edit") : t("create")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="save"
            type="submit"
            form="plan-form"
            loading={busy}
            disabled={!name.trim()}
          >
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="plan-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")}>
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
        <Field label={t("notes")} hint={t("notesHint")}>
          {(id, describedBy) => (
            <textarea
              id={id}
              rows={5}
              maxLength={2000}
              aria-describedby={describedBy}
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

/** Alta o cambio de un ciclo: fechas, contenidos foco (hasta 12) y carga semanal objetivo. */
function CycleSheet({
  teamId,
  cycle,
  season,
  contents,
  onClose,
  onDone,
}: {
  teamId: string;
  cycle: Cycle | null;
  season: TeamSeasonResponse["season"];
  contents: readonly TrainingContent[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT("training.season.cycle");
  const kinds = useT("contentKinds");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const timezone = useClubTimezone();
  const [name, setName] = useState(cycle?.name ?? "");
  const [startsOn, setStartsOn] = useState(() => {
    if (cycle) return cycle.startsOn;
    const today = todayIn(timezone);
    return today >= season.startsOn && today <= season.endsOn ? today : season.startsOn;
  });
  const [endsOn, setEndsOn] = useState(cycle?.endsOn ?? addDays(startsOn, 27));
  const [focus, setFocus] = useState<string[]>(cycle?.focusContentIds ?? []);
  const [target, setTarget] = useState(cycle?.targetWeeklyLoad?.toString() ?? "");
  const [notes, setNotes] = useState(cycle?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const invalidDates = endsOn < startsOn;
  const pickable = contents.filter((ct) => ct.status === "active" || focus.includes(ct.id));
  const byKind = [...new Set(pickable.map((ct) => ct.kind))];

  function toggle(id: string, on: boolean) {
    setFocus((prev) =>
      on ? (prev.length >= 12 ? prev : [...prev, id]) : prev.filter((x) => x !== id),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalidDates) return;
    setBusy(true);
    const body = {
      name: name.trim(),
      startsOn,
      endsOn,
      focusContentIds: focus,
      targetWeeklyLoad: target.trim() ? Math.max(0, Math.round(Number(target))) : null,
      notes: notes.trim() || null,
    };
    try {
      await apiFetch(
        cycle
          ? `/api/org/teams/${teamId}/training/cycles/${cycle.id}`
          : `/api/org/teams/${teamId}/training/cycles`,
        { method: cycle ? "PATCH" : "POST", body },
      );
      toast("success", cycle ? t("saved", { name: body.name }) : t("created", { name: body.name }));
      onClose();
      onDone();
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
      title={cycle ? t("editTitle") : t("newTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={cycle ? "save" : "add"}
            type="submit"
            form="cycle-form"
            loading={busy}
            disabled={!name.trim() || invalidDates}
          >
            {cycle ? c("save") : t("create")}
          </Button>
        </>
      }
    >
      <form id="cycle-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")} hint={t("nameHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              required
              maxLength={80}
              aria-describedby={describedBy}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("startsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                min={season.startsOn}
                max={season.endsOn}
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("endsOn")} error={invalidDates ? t("invalidDates") : undefined}>
            {(id, describedBy) => (
              <Input
                id={id}
                type="date"
                required
                min={startsOn}
                max={season.endsOn}
                aria-invalid={invalidDates || undefined}
                aria-describedby={describedBy}
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t("target")} hint={t("targetHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              step={50}
              aria-describedby={describedBy}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-secondary font-medium text-ink">
            {t("focus", { count: focus.length })}
          </legend>
          <p className="text-secondary text-muted">{t("focusHint")}</p>
          {byKind.map((kind) => (
            <div key={kind} className="flex flex-col gap-1.5">
              <p className="text-label font-semibold uppercase tracking-wide text-muted">
                {kinds(kind)}
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {pickable
                  .filter((ct) => ct.kind === kind)
                  .map((ct) => (
                    <li key={ct.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-control px-3 py-2 text-body text-ink">
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--club-fill)]"
                          checked={focus.includes(ct.id)}
                          disabled={!focus.includes(ct.id) && focus.length >= 12}
                          onChange={(e) => toggle(ct.id, e.target.checked)}
                        />
                        {ct.name}
                      </label>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </fieldset>
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

import {
  AVAILABILITY_STATUSES,
  BODY_AREAS,
  BODY_SIDES,
  CONSENT_RELATIONSHIPS,
  INJURY_CONTEXTS,
  INJURY_KINDS,
  INJURY_MECHANISMS,
  INJURY_STATUSES,
  PlayerHealthResponseSchema,
  PlayerPerformanceResponseSchema,
  RESTRICTION_TAGS,
  TRAINING_CONTENT_KINDS,
  WELLNESS_ITEMS,
  type AvailabilityStatus,
  type BodyArea,
  type BodySide,
  type ConsentRelationship,
  type InjuryContext,
  type InjuryDto,
  type InjuryKind,
  type InjuryMechanism,
  type InjuryStatus,
  type PlayerHealthResponse,
  type PlayerPerformanceResponse,
  type RestrictionTag,
  type WellnessDto,
  type WellnessItem,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { useParams } from "react-router";
import {
  AvailabilityChip,
  DailyLoadBars,
  EvolutionLine,
  InsightList,
  RatioChip,
  RpeScale,
  ScaleInput,
  Sparkline,
  useLoadFormat,
  useShortDate,
} from "@/components/training-ui";
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
  Definitions,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  Stat,
  StatusChip,
  useToast,
  type StatusKind,
} from "@/ui";

type Performance = PlayerPerformanceResponse;

const textareaClass =
  "w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink";

/**
 * Tras guardar: el resto de vistas del club se refrescan, pero nunca la Salud (cada lectura queda
 * auditada; su respuesta ya llega con la mutación) ni lo que la propia mutación ya devuelve.
 */
function refreshOthers(
  client: QueryClient,
  slug: string,
  skip: (key: readonly unknown[]) => boolean,
) {
  void client.invalidateQueries({
    queryKey: ["org", slug],
    predicate: (q) => q.queryKey[4] !== "health" && !skip(q.queryKey),
  });
}

/**
 * Rendimiento de un jugador (bloques 22 a 26, ADR 0038): disponibilidad, recomendaciones, carga,
 * bienestar, objetivo de trabajo y tests. La Salud (lesiones y readaptación) solo aparece para
 * quien tiene acceso a ella, y cada consulta queda en la auditoría.
 */
export function PlayerPerformancePage() {
  const t = useT("performance");
  const ins = useT("insights");
  const c = useT("common");
  const errors = useT("errors");
  const client = useQueryClient();
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const perfKey = ["org", slug, "player", id, "performance"];

  const query = useQuery({
    queryKey: perfKey,
    queryFn: () =>
      apiFetch(`/api/org/players/${id}/performance`, { schema: PlayerPerformanceResponseSchema }),
    retry: false,
  });

  /** Con la respuesta de la mutación en la mano, solo se refresca lo demás. */
  function applied(next?: Performance) {
    if (next) client.setQueryData(perfKey, next);
    refreshOthers(
      client,
      slug,
      (key) => next !== undefined && key[3] === id && key[4] === "performance",
    );
  }

  if (query.isError) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(query.error))}</Alert>
    );
  }
  if (!query.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const data = query.data;
  const { player, access } = data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.player(id)}
        backLabel={t("backToPlayer")}
        eyebrow={`${t("title")} · ${player.team?.name ?? t("noTeam")}`}
        title={
          <>
            <Avatar name={player.name} src={player.photoUrl} size="lg" />
            {player.name}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <AvailabilityCard data={data} onSaved={applied} />
        <Card title={ins("title")} description={ins("description")}>
          {player.team ? (
            <InsightList
              insights={data.insights}
              contents={data.focus.contents}
              players={[{ id: player.id, name: player.name }]}
              teamId={player.team.id}
              canAnswer={access.loadWrite || access.focusWrite}
              onAnswered={() => applied()}
              limit={3}
            />
          ) : (
            <p className="text-secondary text-muted">{t("insightsNoTeam")}</p>
          )}
        </Card>
      </div>

      <LoadCard data={data} onSaved={applied} />

      <div className="grid gap-5 lg:grid-cols-2">
        <WellnessCard data={data} onSaved={applied} />
        <FocusCard data={data} onSaved={applied} />
      </div>

      <TestsCard data={data} />

      {access.healthRead ? (
        <HealthCard playerId={player.id} playerName={player.name} today={data.today} />
      ) : null}
    </div>
  );
}

// --- Disponibilidad ---

function AvailabilityCard({
  data,
  onSaved,
}: {
  data: Performance;
  onSaved: (next?: Performance) => void;
}) {
  const t = useT("performance.availability");
  const a = useT("availability");
  const r = useT("restrictions");
  const dates = useDates();
  const [editing, setEditing] = useState(false);
  const { current, history } = data.availability;
  const periods = [...history].sort((x, y) => y.fromOn.localeCompare(x.fromOn));

  return (
    <Card
      title={t("title")}
      description={t("description")}
      actions={
        data.access.availabilityWrite ? (
          <Button action="edit" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {t("change")}
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <AvailabilityChip value={current} />
          {current.status !== "available" ? (
            <p className="text-secondary text-muted">
              {[
                current.fromOn ? t("since", { date: dates.day(current.fromOn) }) : "",
                current.expectedReturnOn
                  ? t("expectedReturn", { date: dates.day(current.expectedReturnOn) })
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {current.note ? <p className="text-body text-ink">{current.note}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-label font-semibold uppercase tracking-wide text-muted">
            {t("history")}
          </h3>
          {periods.length === 0 ? (
            <p className="text-secondary text-muted">{t("historyEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {periods.slice(0, 6).map((p) => (
                <li key={p.id} className="flex flex-col gap-0.5 py-2">
                  <span className="flex flex-wrap items-center gap-2 text-secondary">
                    <span className="font-medium text-ink">{a(`status.${p.status}`)}</span>
                    <span className="text-muted">
                      {t("period", {
                        from: dates.day(p.fromOn),
                        to: p.endedOn ? dates.day(p.endedOn) : t("ongoing"),
                      })}
                    </span>
                  </span>
                  {p.restrictions.length > 0 || p.maxMinutes ? (
                    <span className="text-label text-muted">
                      {[
                        ...p.restrictions.map((tag) => r(tag)),
                        ...(p.maxMinutes ? [a("maxMinutes", { minutes: p.maxMinutes })] : []),
                      ].join(" · ")}
                    </span>
                  ) : null}
                  {p.note ? <span className="text-label text-muted">{p.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {editing ? (
        <AvailabilitySheet
          playerId={data.player.id}
          playerName={data.player.name}
          current={current}
          today={data.today}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false);
            onSaved(next);
          }}
        />
      ) : null}
    </Card>
  );
}

function AvailabilitySheet({
  playerId,
  playerName,
  current,
  today,
  onClose,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  current: Performance["availability"]["current"];
  today: string;
  onClose: () => void;
  onSaved: (next?: Performance) => void;
}) {
  const t = useT("performance.availabilitySheet");
  const a = useT("availability");
  const r = useT("restrictions");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [status, setStatus] = useState<AvailabilityStatus>(current.status);
  const [restrictions, setRestrictions] = useState<RestrictionTag[]>(current.restrictions);
  const [maxMinutes, setMaxMinutes] = useState(
    current.maxMinutes ? String(current.maxMinutes) : "",
  );
  const [fromOn, setFromOn] = useState(today);
  const [expectedReturnOn, setExpectedReturnOn] = useState(current.expectedReturnOn ?? "");
  const [note, setNote] = useState(current.note ?? "");
  const [busy, setBusy] = useState(false);
  const limited = status === "limited";
  const open = status !== "available";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const response = await apiFetch(`/api/org/players/${playerId}/availability`, {
        method: "PUT",
        body: {
          status,
          restrictions: limited ? restrictions : [],
          maxMinutes: limited && maxMinutes ? Number(maxMinutes) : null,
          fromOn,
          expectedReturnOn: open && expectedReturnOn ? expectedReturnOn : null,
          note: open && note.trim() ? note.trim() : null,
        },
      });
      // Quien no ve la carga recibe un 204: entonces se vuelve a pedir.
      const parsed = PlayerPerformanceResponseSchema.safeParse(response);
      toast("success", t("saved"));
      onSaved(parsed.success ? parsed.data : undefined);
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
          <Button action="save" type="submit" form="availability-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="availability-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("status")}>
          {(id) => (
            <Select
              id={id}
              value={status}
              onChange={(e) => setStatus(e.target.value as AvailabilityStatus)}
            >
              {AVAILABILITY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {a(`status.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {limited ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-1 text-secondary font-medium text-ink">
                {t("restrictions")}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {RESTRICTION_TAGS.map((tag) => (
                  <label
                    key={tag}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-control px-3 py-2 text-body text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={restrictions.includes(tag)}
                      onChange={(e) =>
                        setRestrictions((list) =>
                          e.target.checked ? [...list, tag] : list.filter((x) => x !== tag),
                        )
                      }
                    />
                    {r(tag)}
                  </label>
                ))}
              </div>
              <p className="text-secondary text-muted">{t("restrictionsHint")}</p>
            </fieldset>
            <Field label={t("maxMinutes")} hint={t("maxMinutesHint")}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={240}
                  aria-describedby={describedBy}
                  value={maxMinutes}
                  onChange={(e) => setMaxMinutes(e.target.value)}
                />
              )}
            </Field>
          </>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fromOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={fromOn}
                onChange={(e) => setFromOn(e.target.value)}
              />
            )}
          </Field>
          {open ? (
            <Field label={t("expectedReturnOn")}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  min={fromOn}
                  value={expectedReturnOn}
                  onChange={(e) => setExpectedReturnOn(e.target.value)}
                />
              )}
            </Field>
          ) : null}
        </div>
        {open ? (
          <Field label={t("note")} hint={t("noteHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                maxLength={160}
                aria-describedby={describedBy}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
        ) : null}
      </form>
    </Sheet>
  );
}

// --- Carga ---

function LoadCard({ data, onSaved }: { data: Performance; onSaved: (next?: Performance) => void }) {
  const t = useT("performance.load");
  const x = useT("performance.extras");
  const c = useT("common");
  const errors = useT("errors");
  const intl = useIntl();
  const dates = useDates();
  const fmt = useLoadFormat();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { metrics, days, extras } = data.load;
  const { high, low } = data.load.acwr;
  const number = (n: number | null) =>
    n === null ? "—" : intl.formatNumber(n, { maximumFractionDigits: 2 });
  const total = days.reduce((sum, d) => sum + d.session + d.match + d.extra, 0);
  const sorted = [...extras].sort((a, b) => b.date.localeCompare(a.date));

  async function remove(loadId: string) {
    setRemoving(null);
    try {
      await apiFetch(`/api/org/players/${data.player.id}/loads/${loadId}`, { method: "DELETE" });
      toast("success", x("removed"));
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <Card title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat value={fmt.load(metrics.acute)} label={t("acute")} />
          <Stat value={fmt.load(metrics.chronic)} label={t("chronic")} />
          <Stat
            value={<RatioChip ratio={metrics.ratio} high={high} low={low} />}
            label={t("ratio")}
          />
          <Stat value={number(metrics.monotony)} label={t("monotony")} />
          <Stat
            value={metrics.strain === null ? "—" : fmt.load(metrics.strain)}
            label={t("strain")}
          />
        </div>
        <p className="text-secondary text-muted">
          {t("ratioNote", { high: number(high), low: number(low), days: metrics.historyDays })}
        </p>
        <DailyLoadBars
          days={days}
          summary={t("chartSummary", { total: intl.formatNumber(Math.round(total)) })}
        />
        <section className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-body font-semibold text-ink">{x("title")}</h3>
              <p className="text-secondary text-muted">{x("description")}</p>
            </div>
            {data.access.loadWrite ? (
              <Button action="add" variant="secondary" size="sm" onClick={() => setAdding(true)}>
                {x("add")}
              </Button>
            ) : null}
          </div>
          {sorted.length === 0 ? (
            <p className="text-secondary text-muted">{x("empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {sorted.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body text-ink">{dates.day(l.date)}</span>
                    <span className="text-secondary text-muted">
                      {x("line", {
                        minutes: l.minutes,
                        rpe: l.rpe,
                        load: intl.formatNumber(l.minutes * l.rpe),
                      })}
                      {l.note ? ` · ${l.note}` : ""}
                    </span>
                  </span>
                  {data.access.loadWrite ? (
                    <Button
                      variant="ghost-danger"
                      size="sm"
                      action="delete"
                      onClick={() => setRemoving(l.id)}
                    >
                      {x("remove")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {adding ? (
        <ExtraLoadSheet
          playerId={data.player.id}
          playerName={data.player.name}
          today={data.today}
          onClose={() => setAdding(false)}
          onSaved={(next) => {
            setAdding(false);
            onSaved(next);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={x("confirmTitle")}
        body={x("confirmBody")}
        confirmLabel={x("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

function ExtraLoadSheet({
  playerId,
  playerName,
  today,
  onClose,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  today: string;
  onClose: () => void;
  onSaved: (next: Performance) => void;
}) {
  const t = useT("performance.extraSheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = Number(minutes) >= 1 && Number(minutes) <= 240 && rpe !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const next = await apiFetch(`/api/org/players/${playerId}/loads`, {
        method: "POST",
        body: { date, minutes: Number(minutes), rpe, note: note.trim() || null },
        schema: PlayerPerformanceResponseSchema,
      });
      toast("success", t("saved"));
      onSaved(next);
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
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="add"
            type="submit"
            form="extra-load-form"
            loading={busy}
            disabled={!valid}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="extra-load-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("date")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
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
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-secondary font-medium text-ink">{t("rpe")}</span>
          <RpeScale value={rpe} onChange={setRpe} label={t("rpe")} />
          <span className="text-secondary text-muted">{t("rpeHint")}</span>
        </div>
        <Field label={t("note")}>
          {(id) => (
            <Input id={id} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

// --- Bienestar ---

function WellnessCard({
  data,
  onSaved,
}: {
  data: Performance;
  onSaved: (next?: Performance) => void;
}) {
  const t = useT("performance.wellness");
  const w = useT("wellness");
  const short = useShortDate();
  const [editing, setEditing] = useState(false);
  const entries = [...data.wellness].sort((a, b) => a.date.localeCompare(b.date));
  const today = entries.find((e) => e.date === data.today) ?? null;
  const recent = [...entries].reverse().slice(0, 7);
  const scoreKind = (score: number): StatusKind =>
    score >= 20 ? "success" : score >= 15 ? "neutral" : "warning";

  return (
    <Card
      title={t("title")}
      description={t("description")}
      actions={
        data.access.loadWrite ? (
          <Button
            action={today ? "edit" : "add"}
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
          >
            {today ? t("editToday") : t("record")}
          </Button>
        ) : null
      }
    >
      {entries.length === 0 ? (
        <p className="text-secondary text-muted">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.length > 1 ? (
            <Sparkline values={entries.map((e) => e.score)} label={t("trend")} />
          ) : null}
          <ul className="flex flex-col divide-y divide-line">
            {recent.map((e) => (
              <li key={e.date} className="flex flex-col gap-1 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium text-ink">
                    {e.date === data.today ? w("today") : short.weekday(e.date)}
                  </span>
                  <StatusChip kind={scoreKind(e.score)}>
                    {w("score", { score: e.score })}
                  </StatusChip>
                </span>
                <span className="text-label text-muted">
                  {WELLNESS_ITEMS.map((item) => `${w(`items.${item}.label`)} ${e[item]}`).join(
                    " · ",
                  )}
                </span>
                {e.sorenessArea || e.note ? (
                  <span className="text-secondary text-ink">
                    {[e.sorenessArea, e.note].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing ? (
        <WellnessSheet
          playerId={data.player.id}
          playerName={data.player.name}
          date={data.today}
          entry={today}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false);
            onSaved(next);
          }}
        />
      ) : null}
    </Card>
  );
}

function WellnessSheet({
  playerId,
  playerName,
  date,
  entry,
  onClose,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  date: string;
  entry: WellnessDto | null;
  onClose: () => void;
  onSaved: (next: Performance) => void;
}) {
  const t = useT("performance.wellness");
  const w = useT("wellness");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [values, setValues] = useState<Record<WellnessItem, number | null>>({
    sleep: entry?.sleep ?? null,
    fatigue: entry?.fatigue ?? null,
    soreness: entry?.soreness ?? null,
    stress: entry?.stress ?? null,
    mood: entry?.mood ?? null,
  });
  const [sorenessArea, setSorenessArea] = useState(entry?.sorenessArea ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [busy, setBusy] = useState(false);
  const complete = WELLNESS_ITEMS.every((item) => values[item] !== null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setBusy(true);
    try {
      const next = await apiFetch(`/api/org/players/${playerId}/wellness`, {
        method: "PUT",
        body: {
          date,
          ...values,
          sorenessArea: sorenessArea.trim() || null,
          note: note.trim() || null,
        },
        schema: PlayerPerformanceResponseSchema,
      });
      toast("success", w("saved"));
      onSaved(next);
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
      title={t("sheetTitle", { name: playerName })}
      description={t("sheetDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="save"
            type="submit"
            form="wellness-form"
            loading={busy}
            disabled={!complete}
          >
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="wellness-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {WELLNESS_ITEMS.map((item) => (
          <ScaleInput
            key={item}
            label={w(`items.${item}.label`)}
            lowLabel={w(`items.${item}.low`)}
            highLabel={w(`items.${item}.high`)}
            value={values[item]}
            onChange={(v) => setValues((prev) => ({ ...prev, [item]: v }))}
          />
        ))}
        <Field label={w("sorenessArea")}>
          {(id) => (
            <Input
              id={id}
              maxLength={60}
              value={sorenessArea}
              onChange={(e) => setSorenessArea(e.target.value)}
            />
          )}
        </Field>
        <Field label={w("note")}>
          {(id) => (
            <Input id={id} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

// --- Objetivo de trabajo ---

function FocusCard({
  data,
  onSaved,
}: {
  data: Performance;
  onSaved: (next?: Performance) => void;
}) {
  const t = useT("performance.focus");
  const fmt = useLoadFormat();
  const dates = useDates();
  const [editing, setEditing] = useState(false);
  const { contentIds, contents, minutes, objective } = data.focus;
  const chosen = contentIds
    .map((cid) => contents.find((x) => x.id === cid))
    .filter((x): x is (typeof contents)[number] => x !== undefined);
  const minutesOf = (cid: string) => minutes.find((m) => m.contentId === cid)?.minutes ?? 0;

  return (
    <Card
      title={t("title")}
      description={t("description")}
      actions={
        data.access.focusWrite && contents.length > 0 ? (
          <Button action="edit" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        {objective ? (
          <p className="text-body text-ink">
            {t("objective", { title: objective.title })}
            {objective.reviewOn ? (
              <span className="text-secondary text-muted">
                {" · "}
                {t("review", { date: dates.day(objective.reviewOn) })}
              </span>
            ) : null}
          </p>
        ) : null}
        {!data.player.team ? (
          <p className="text-secondary text-muted">{t("noTeam")}</p>
        ) : chosen.length === 0 ? (
          <p className="text-secondary text-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {chosen.map((content) => (
              <li
                key={content.id}
                className="inline-flex items-center gap-2 rounded-chip bg-club-soft px-3 py-1 text-secondary text-club-soft-text"
              >
                <span className="font-medium">{content.name}</span>
                <span className="font-mono">{fmt.minutes(minutesOf(content.id))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing ? (
        <FocusSheet
          playerId={data.player.id}
          contents={contents}
          selected={contentIds}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false);
            onSaved(next);
          }}
        />
      ) : null}
    </Card>
  );
}

function FocusSheet({
  playerId,
  contents,
  selected,
  onClose,
  onSaved,
}: {
  playerId: string;
  contents: Performance["focus"]["contents"];
  selected: string[];
  onClose: () => void;
  onSaved: (next: Performance) => void;
}) {
  const t = useT("performance.focus");
  const k = useT("contentKinds");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [chosen, setChosen] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const active = contents.filter((x) => x.status === "active" || chosen.includes(x.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const next = await apiFetch(`/api/org/players/${playerId}/focus`, {
        method: "PUT",
        body: { contentIds: chosen },
        schema: PlayerPerformanceResponseSchema,
      });
      toast("success", t("saved"));
      onSaved(next);
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
      title={t("sheetTitle")}
      description={t("sheetDescription")}
      footer={
        <>
          <span className="mr-auto self-center font-mono text-secondary text-muted">
            {t("limit", { count: chosen.length })}
          </span>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="focus-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="focus-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {TRAINING_CONTENT_KINDS.map((kind) => {
          const group = active.filter((x) => x.kind === kind);
          if (group.length === 0) return null;
          return (
            <fieldset key={kind} className="flex flex-col gap-2">
              <legend className="pb-1 text-label font-semibold uppercase tracking-wide text-muted">
                {k(kind)}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.map((content) => {
                  const checked = chosen.includes(content.id);
                  return (
                    <label
                      key={content.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-control px-3 py-2 text-body text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && chosen.length >= 6}
                        onChange={(e) =>
                          setChosen((list) =>
                            e.target.checked
                              ? [...list, content.id]
                              : list.filter((x) => x !== content.id),
                          )
                        }
                      />
                      {content.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </form>
    </Sheet>
  );
}

// --- Tests ---

function TestsCard({ data }: { data: Performance }) {
  const t = useT("performance.tests");
  const u = useT("testUnits");
  return (
    <Card title={t("title")} description={t("description")}>
      {data.tests.length === 0 ? (
        <EmptyState icon={<Icon.SportIcons.PruebaFisica />} title={t("empty")} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.tests.map(({ test, results }) => (
            <section key={test.id} className="flex flex-col gap-1">
              <h3 className="text-body font-semibold text-ink">{test.name}</h3>
              <EvolutionLine
                points={[...results].sort((a, b) => a.date.localeCompare(b.date))}
                lowerBetter={test.direction === "lower_better"}
                unit={u(test.unit)}
                summary={t("summary", { test: test.name, count: results.length })}
              />
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

// --- Salud ---

const severityKind: Record<InjuryDto["severity"], StatusKind> = {
  minimal: "neutral",
  mild: "info",
  moderate: "warning",
  severe: "danger",
};
const injuryStatusKind: Record<InjuryStatus, StatusKind> = {
  active: "danger",
  rehab: "info",
  recovered: "success",
};

/**
 * Salud (Bloque 24): consentimiento, lesiones y fases de readaptación. Se pide aparte, solo con
 * acceso a Salud, y cada lectura queda auditada: tras guardar se usa la respuesta, sin volver a leer.
 */
function HealthCard({
  playerId,
  playerName,
  today,
}: {
  playerId: string;
  playerName: string;
  today: string;
}) {
  const t = useT("health");
  const rel = useT("consentRelationships");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const healthKey = ["org", slug, "player", playerId, "health"];
  const [consenting, setConsenting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [editing, setEditing] = useState<InjuryDto | "new" | null>(null);
  const [phasing, setPhasing] = useState<InjuryDto | null>(null);
  const [removing, setRemoving] = useState<InjuryDto | null>(null);

  const query = useQuery({
    queryKey: healthKey,
    queryFn: () =>
      apiFetch(`/api/org/players/${playerId}/health`, { schema: PlayerHealthResponseSchema }),
    retry: false,
  });

  function applied(next: PlayerHealthResponse) {
    client.setQueryData(healthKey, next);
    refreshOthers(client, slug, () => false);
  }

  async function run(request: Promise<PlayerHealthResponse>, done: string) {
    try {
      applied(await request);
      toast("success", done);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  let body: ReactNode;
  if (query.isError) body = <Alert kind="error">{errors(errorKey(query.error))}</Alert>;
  else if (!query.data)
    body = (
      <div
        className="h-32 animate-pulse rounded-field bg-raised"
        aria-busy="true"
        aria-label={c("loading")}
      />
    );
  else {
    const { consent, currentTextVersion, injuries, access } = query.data;
    const consentActive = consent !== null && consent.revokedOn === null;
    const sorted = [...injuries].sort(
      (a, b) =>
        Number(a.status === "recovered") - Number(b.status === "recovered") ||
        b.occurredOn.localeCompare(a.occurredOn),
    );
    body = (
      <div className="flex flex-col gap-4">
        {consentActive ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-2 text-secondary text-ink">
              <Icon.ShieldCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              {t("consent.active", {
                name: consent.grantedByName,
                relationship: rel(consent.relationship),
                date: dates.day(consent.grantedOn),
                version: consent.textVersion,
              })}
            </p>
            {consent.textVersion !== currentTextVersion ? (
              <Alert kind="warning">{t("consent.outdated", { version: currentTextVersion })}</Alert>
            ) : null}
            {access.write ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="tertiary" size="sm" onClick={() => setConsenting(true)}>
                  {t("consent.renew")}
                </Button>
                <Button variant="ghost-danger" size="sm" onClick={() => setRevoking(true)}>
                  {t("consent.revoke")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Alert
            kind="warning"
            actions={
              access.write ? (
                <Button size="sm" variant="secondary" onClick={() => setConsenting(true)}>
                  {t("consent.record")}
                </Button>
              ) : null
            }
          >
            {t("consent.missing")}
            {consent?.revokedOn
              ? ` ${t("consent.revokedOn", { date: dates.day(consent.revokedOn) })}`
              : ""}
          </Alert>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-body font-semibold text-ink">{t("injuries.title")}</h3>
            {access.write && consentActive ? (
              <Button action="add" variant="secondary" size="sm" onClick={() => setEditing("new")}>
                {t("injuries.add")}
              </Button>
            ) : null}
          </div>
          {sorted.length === 0 ? (
            <p className="text-secondary text-muted">{t("injuries.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {sorted.map((injury) => (
                <li key={injury.id}>
                  <InjuryItem
                    injury={injury}
                    canWrite={access.write}
                    onEdit={() => setEditing(injury)}
                    onPhases={() => setPhasing(injury)}
                    onRemove={() => setRemoving(injury)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {consenting ? (
          <ConsentSheet
            playerId={playerId}
            playerName={playerName}
            today={today}
            version={currentTextVersion}
            current={consentActive ? consent : null}
            onClose={() => setConsenting(false)}
            onSaved={(next) => {
              setConsenting(false);
              applied(next);
            }}
          />
        ) : null}
        {editing ? (
          <InjurySheet
            playerId={playerId}
            injury={editing === "new" ? null : editing}
            today={today}
            onClose={() => setEditing(null)}
            onSaved={(next) => {
              setEditing(null);
              applied(next);
            }}
          />
        ) : null}
        {phasing ? (
          <PhasesSheet
            injury={phasing}
            onClose={() => setPhasing(null)}
            onSaved={(next) => {
              setPhasing(null);
              applied(next);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Icon.Heartbeat size={22} aria-hidden="true" />
          {t("title")}
        </span>
      }
      description={t("description")}
    >
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-1.5 text-label text-muted">
          <Icon.Eye size={14} aria-hidden="true" />
          {t("audited")}
        </p>
        {body}
      </div>
      <ConfirmDialog
        open={revoking}
        title={t("consent.revokeTitle")}
        body={t("consent.revokeBody")}
        confirmLabel={t("consent.revoke")}
        cancelLabel={c("cancel")}
        onConfirm={() => {
          setRevoking(false);
          void run(
            apiFetch(`/api/org/players/${playerId}/health/consent`, {
              method: "DELETE",
              schema: PlayerHealthResponseSchema,
            }),
            t("consent.revoked"),
          );
        }}
        onCancel={() => setRevoking(false)}
      />
      <ConfirmDialog
        open={removing !== null}
        title={t("injuries.removeTitle")}
        body={t("injuries.removeBody")}
        confirmLabel={t("injuries.remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => {
          const injury = removing;
          setRemoving(null);
          if (injury)
            void run(
              apiFetch(`/api/org/injuries/${injury.id}`, {
                method: "DELETE",
                schema: PlayerHealthResponseSchema,
              }),
              t("injuries.removed"),
            );
        }}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

function InjuryItem({
  injury,
  canWrite,
  onEdit,
  onPhases,
  onRemove,
}: {
  injury: InjuryDto;
  canWrite: boolean;
  onEdit: () => void;
  onPhases: () => void;
  onRemove: () => void;
}) {
  const t = useT("health.injuries");
  const p = useT("health.phases");
  const areas = useT("bodyAreas");
  const sides = useT("bodySides");
  const kinds = useT("injuryKinds");
  const mechanisms = useT("injuryMechanisms");
  const contexts = useT("injuryContexts");
  const statuses = useT("injuryStatuses");
  const severities = useT("injurySeverities");
  const dates = useDates();
  const done = injury.phases.filter((phase) => phase.doneOn).length;
  const details = [
    ...(injury.diagnosis ? [{ term: t("diagnosis"), detail: injury.diagnosis }] : []),
    ...(injury.clinicalNotes
      ? [
          {
            term: t("clinicalNotes"),
            detail: <span className="whitespace-pre-line font-normal">{injury.clinicalNotes}</span>,
          },
        ]
      : []),
  ];

  return (
    <article className="flex flex-col gap-2 rounded-field border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-body font-semibold text-ink">
          {t("heading", { area: areas(injury.bodyArea), kind: kinds(injury.kind) })}
        </h4>
        <StatusChip kind={injuryStatusKind[injury.status]}>{statuses(injury.status)}</StatusChip>
        <StatusChip kind={severityKind[injury.severity]}>{severities(injury.severity)}</StatusChip>
        {injury.recurrence ? <StatusChip kind="warning">{t("recurrence")}</StatusChip> : null}
      </div>
      <p className="text-secondary text-muted">
        {[
          t("side", { side: sides(injury.side) }),
          mechanisms(injury.mechanism),
          contexts(injury.context),
        ].join(" · ")}
      </p>
      <p className="text-secondary text-muted">
        {[
          t("occurred", { date: dates.day(injury.occurredOn) }),
          t("daysOut", { days: injury.daysOut }),
          injury.returnedOn
            ? t("returned", { date: dates.day(injury.returnedOn) })
            : injury.expectedReturnOn
              ? t("expected", { date: dates.day(injury.expectedReturnOn) })
              : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {details.length > 0 ? <Definitions items={details} /> : null}
      {injury.phases.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase tracking-wide text-muted">
            {p("progress", { done, total: injury.phases.length })}
          </span>
          <ol className="flex flex-col gap-1">
            {injury.phases.map((phase) => (
              <li key={phase.id} className="flex items-start gap-2 text-secondary text-ink">
                {phase.doneOn ? (
                  <Icon.CheckCircle
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-success"
                  />
                ) : (
                  <Icon.Clock size={18} aria-hidden="true" className="shrink-0 text-muted" />
                )}
                <span className="flex flex-col">
                  <span className={phase.doneOn ? "text-muted" : "font-medium"}>{phase.name}</span>
                  {phase.criteria ? (
                    <span className="text-label text-muted">{phase.criteria}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" action="edit" onClick={onEdit}>
            {t("edit")}
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            icon={<Icon.ListChecks size={16} aria-hidden="true" />}
            onClick={onPhases}
          >
            {t("phases")}
          </Button>
          <Button size="sm" variant="ghost-danger" action="delete" onClick={onRemove}>
            {t("remove")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function ConsentSheet({
  playerId,
  playerName,
  today,
  version,
  current,
  onClose,
  onSaved,
}: {
  playerId: string;
  playerName: string;
  today: string;
  version: string;
  current: PlayerHealthResponse["consent"];
  onClose: () => void;
  onSaved: (next: PlayerHealthResponse) => void;
}) {
  const t = useT("health.consentSheet");
  const h = useT("health.consent");
  const rel = useT("consentRelationships");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [relationship, setRelationship] = useState<ConsentRelationship>(
    current?.relationship ?? "guardian",
  );
  const [grantedByName, setGrantedByName] = useState(
    current?.grantedByName ?? (relationship === "self" ? playerName : ""),
  );
  const [grantedOn, setGrantedOn] = useState(today);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const next = await apiFetch(`/api/org/players/${playerId}/health/consent`, {
        method: "PUT",
        body: {
          grantedByName: grantedByName.trim(),
          relationship,
          grantedOn,
          textVersion: version,
        },
        schema: PlayerHealthResponseSchema,
      });
      toast("success", h("saved"));
      onSaved(next);
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
            action="save"
            type="submit"
            form="consent-form"
            loading={busy}
            disabled={!grantedByName.trim()}
          >
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="consent-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("relationship")}>
          {(id) => (
            <Select
              id={id}
              value={relationship}
              onChange={(e) => {
                const next = e.target.value as ConsentRelationship;
                setRelationship(next);
                if (next === "self" && !grantedByName.trim()) setGrantedByName(playerName);
              }}
            >
              {CONSENT_RELATIONSHIPS.map((x) => (
                <option key={x} value={x}>
                  {rel(x)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("grantedByName")} hint={t("grantedByNameHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              required
              maxLength={120}
              aria-describedby={describedBy}
              value={grantedByName}
              onChange={(e) => setGrantedByName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("grantedOn")}>
          {(id) => (
            <Input
              id={id}
              type="date"
              required
              max={today}
              value={grantedOn}
              onChange={(e) => setGrantedOn(e.target.value)}
            />
          )}
        </Field>
        <p className="text-secondary text-muted">{t("version", { version })}</p>
      </form>
    </Sheet>
  );
}

function InjurySheet({
  playerId,
  injury,
  today,
  onClose,
  onSaved,
}: {
  playerId: string;
  injury: InjuryDto | null;
  today: string;
  onClose: () => void;
  onSaved: (next: PlayerHealthResponse) => void;
}) {
  const t = useT("health.injurySheet");
  const h = useT("health.injuries");
  const areas = useT("bodyAreas");
  const sides = useT("bodySides");
  const kinds = useT("injuryKinds");
  const mechanisms = useT("injuryMechanisms");
  const contexts = useT("injuryContexts");
  const statuses = useT("injuryStatuses");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [occurredOn, setOccurredOn] = useState(injury?.occurredOn ?? today);
  const [context, setContext] = useState<InjuryContext>(injury?.context ?? "training");
  const [bodyArea, setBodyArea] = useState<BodyArea | "">(injury?.bodyArea ?? "");
  const [side, setSide] = useState<BodySide | "">(injury?.side ?? "");
  const [kind, setKind] = useState<InjuryKind>(injury?.kind ?? "muscle");
  const [mechanism, setMechanism] = useState<InjuryMechanism>(injury?.mechanism ?? "non_contact");
  const [recurrence, setRecurrence] = useState(injury?.recurrence ?? false);
  const [diagnosis, setDiagnosis] = useState(injury?.diagnosis ?? "");
  const [clinicalNotes, setClinicalNotes] = useState(injury?.clinicalNotes ?? "");
  const [expectedReturnOn, setExpectedReturnOn] = useState(injury?.expectedReturnOn ?? "");
  const [status, setStatus] = useState<InjuryStatus>(injury?.status ?? "active");
  const [returnedOn, setReturnedOn] = useState(injury?.returnedOn ?? "");
  const [busy, setBusy] = useState(false);
  const valid = bodyArea !== "" && side !== "" && occurredOn !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const fields = {
      occurredOn,
      context,
      bodyArea,
      side,
      kind,
      mechanism,
      recurrence,
      diagnosis: diagnosis.trim() || null,
      clinicalNotes: clinicalNotes.trim() || null,
      expectedReturnOn: expectedReturnOn || null,
    };
    try {
      const next = await apiFetch(
        injury ? `/api/org/injuries/${injury.id}` : `/api/org/players/${playerId}/health/injuries`,
        {
          method: injury ? "PATCH" : "POST",
          body: injury ? { ...fields, status, returnedOn: returnedOn || null } : fields,
          schema: PlayerHealthResponseSchema,
        },
      );
      toast("success", injury ? h("updated") : h("created"));
      onSaved(next);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const select = <K extends string>(
    label: string,
    value: K | "",
    onChange: (value: K) => void,
    options: readonly K[],
    name: (value: K) => string,
    placeholder = false,
  ) => (
    <Field label={label}>
      {(id) => (
        <Select id={id} required value={value} onChange={(e) => onChange(e.target.value as K)}>
          {placeholder ? (
            <option value="" disabled>
              —
            </option>
          ) : null}
          {options.map((x) => (
            <option key={x} value={x}>
              {name(x)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={injury ? t("editTitle") : t("newTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={injury ? "save" : "add"}
            type="submit"
            form="injury-form"
            loading={busy}
            disabled={!valid}
          >
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="injury-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("occurredOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                max={today}
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            )}
          </Field>
          {select(t("context"), context, setContext, INJURY_CONTEXTS, contexts)}
          {select(t("bodyArea"), bodyArea, setBodyArea, BODY_AREAS, areas, true)}
          {select(t("side"), side, setSide, BODY_SIDES, sides, true)}
          {select(t("kind"), kind, setKind, INJURY_KINDS, kinds)}
          {select(t("mechanism"), mechanism, setMechanism, INJURY_MECHANISMS, mechanisms)}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-control px-3 py-2 text-body text-ink">
          <input
            type="checkbox"
            checked={recurrence}
            onChange={(e) => setRecurrence(e.target.checked)}
          />
          {t("recurrence")}
        </label>
        <Field label={t("diagnosis")}>
          {(id) => (
            <textarea
              id={id}
              rows={2}
              maxLength={400}
              className={textareaClass}
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("clinicalNotes")}>
          {(id) => (
            <textarea
              id={id}
              rows={4}
              maxLength={2000}
              className={textareaClass}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("expectedReturnOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                min={occurredOn}
                value={expectedReturnOn}
                onChange={(e) => setExpectedReturnOn(e.target.value)}
              />
            )}
          </Field>
          {injury ? (
            <>
              {select(t("status"), status, setStatus, INJURY_STATUSES, statuses)}
              <Field label={t("returnedOn")}>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    min={occurredOn}
                    value={returnedOn}
                    onChange={(e) => setReturnedOn(e.target.value)}
                  />
                )}
              </Field>
            </>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}

interface PhaseDraft {
  key: string;
  name: string;
  criteria: string;
  startedOn: string;
  doneOn: string;
}

function PhasesSheet({
  injury,
  onClose,
  onSaved,
}: {
  injury: InjuryDto;
  onClose: () => void;
  onSaved: (next: PlayerHealthResponse) => void;
}) {
  const t = useT("health.phases");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [rows, setRows] = useState<PhaseDraft[]>(() =>
    injury.phases.map((p) => ({
      key: p.id,
      name: p.name,
      criteria: p.criteria ?? "",
      startedOn: p.startedOn ?? "",
      doneOn: p.doneOn ?? "",
    })),
  );
  const [busy, setBusy] = useState(false);
  const valid = rows.every((r) => r.name.trim() !== "");
  const blank = (name = ""): PhaseDraft => ({
    key: crypto.randomUUID(),
    name,
    criteria: "",
    startedOn: "",
    doneOn: "",
  });
  const update = (key: string, patch: Partial<PhaseDraft>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const next = await apiFetch(`/api/org/injuries/${injury.id}/phases`, {
        method: "PUT",
        body: {
          phases: rows.map((r) => ({
            name: r.name.trim(),
            criteria: r.criteria.trim() || null,
            startedOn: r.startedOn || null,
            doneOn: r.doneOn || null,
          })),
        },
        schema: PlayerHealthResponseSchema,
      });
      toast("success", t("saved"));
      onSaved(next);
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
          <Button action="save" type="submit" form="phases-form" loading={busy} disabled={!valid}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="phases-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-secondary text-muted">{t("empty")}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRows(["1", "2", "3", "4"].map((n) => blank(t(`defaults.${n}`))))}
            >
              {t("useDefaults")}
            </Button>
          </div>
        ) : null}
        <ol className="flex flex-col gap-4">
          {rows.map((r, i) => (
            <li key={r.key} className="flex flex-col gap-3 rounded-field border border-border p-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label={t("name", { n: i + 1 })}>
                    {(id) => (
                      <Input
                        id={id}
                        required
                        maxLength={80}
                        value={r.name}
                        onChange={(e) => update(r.key, { name: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <Button
                  variant="ghost-danger"
                  action="delete"
                  iconOnly
                  onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                >
                  {t("removePhase", { n: i + 1 })}
                </Button>
              </div>
              <Field label={t("criteria")}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={400}
                    value={r.criteria}
                    onChange={(e) => update(r.key, { criteria: e.target.value })}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("startedOn")}>
                  {(id) => (
                    <Input
                      id={id}
                      type="date"
                      value={r.startedOn}
                      onChange={(e) => update(r.key, { startedOn: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={t("doneOn")}>
                  {(id) => (
                    <Input
                      id={id}
                      type="date"
                      min={r.startedOn || undefined}
                      value={r.doneOn}
                      onChange={(e) => update(r.key, { doneOn: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            </li>
          ))}
        </ol>
        {rows.length < 12 ? (
          <Button
            action="add"
            variant="tertiary"
            size="sm"
            onClick={() => setRows((list) => [...list, blank()])}
          >
            {t("add")}
          </Button>
        ) : null}
      </form>
    </Sheet>
  );
}

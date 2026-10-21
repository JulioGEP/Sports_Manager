import {
  MATCH_ZONES,
  MatchDetailResponseSchema,
  MatchEventsResponseSchema,
  MatchResponseSchema,
  MatchSquadResponseSchema,
  formatClock,
  formationSlots,
  type AttackDirection,
  type MatchActionType,
  type MatchDetail,
  type MatchDetailResponse,
  type MatchEvent,
  type MatchSquadPlayer,
  type MatchZone,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT, type Translate } from "@/lib/intl";
import { clientEventId, elapsedOf, scoreBadge, signed, statsOf } from "@/lib/matches";
import {
  Alert,
  Button,
  ButtonLink,
  ConfirmDialog,
  Crest,
  Field,
  Icon,
  IconButton,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

type Selection = { id: string; where: "court" | "bench" } | null;
type State = {
  match: MatchDetail;
  squad: MatchSquadPlayer[];
  roster: MatchDetailResponse["roster"];
  actionTypes: MatchActionType[];
  events: MatchEvent[];
  access: { write: boolean };
};

/** Nombre del periodo: partes si son dos, cuartos si son cuatro, periodo N en el resto. */
export function periodLabel(t: Translate, period: number, periods: number): string {
  if (periods === 2) return t(`periods.half${period === 1 ? "1" : "2"}`);
  if (periods === 4) return t("periods.quarter", { n: period });
  if (periods === 3) return t("periods.third", { n: period });
  return t("periods.generic", { n: period });
}

/** Cronómetro: tic cada 250 ms mientras corre, para pintar el tiempo y los minutos en pista. */
function useElapsed(clock: MatchDetail["clock"]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!clock.runningSince) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [clock.runningSince]);
  return elapsedOf(clock, clock.runningSince ? now : Date.now());
}

/**
 * Consola del partido en directo (Bloque 19, ADR 0032): registro de todo lo que pasa, de un
 * toque, en la banda. Cada evento viaja a la API al momento; el cronómetro se guarda al
 * arrancar, parar y cambiar de periodo, así que recargar la página no pierde nada.
 */
export function MatchLivePage() {
  const c = useT("common");
  const errors = useT("errors");
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { slug, branding } = useReadyClub();
  const paths = clubPaths(slug);

  const detail = useQuery({
    queryKey: ["org", slug, "match", id],
    queryFn: () => apiFetch(`/api/org/matches/${id}`, { schema: MatchDetailResponseSchema }),
    retry: false,
    staleTime: Infinity,
  });
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    if (detail.data) setState(detail.data);
  }, [detail.data]);

  if (detail.isError) {
    const notFound = detail.error instanceof ApiClientError && detail.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(detail.error))}</Alert>
    );
  }
  if (!state) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-20 animate-pulse rounded-card bg-raised" />
        <div className="h-96 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  return (
    <Console
      state={state}
      setState={setState}
      clubName={branding.name}
      logoUrl={branding.logoUrl}
      onFinished={() => void navigate(paths.matchStats(id))}
    />
  );
}

function Console({
  state,
  setState,
  clubName,
  logoUrl,
  onFinished,
}: {
  state: State;
  setState: (next: State | ((prev: State | null) => State | null)) => void;
  clubName: string;
  logoUrl: string | null;
  onFinished: () => void;
}) {
  const t = useT("match");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const { match, squad, actionTypes, events, access } = state;
  const settings = match.settings;
  const canWrite = access.write && match.status !== "finished";
  const elapsed = useElapsed(match.clock);
  const running = match.clock.runningSince !== null;

  const [selection, setSelection] = useState<Selection>(null);
  const [zonePick, setZonePick] = useState<{
    type: MatchActionType;
    playerId: string | null;
  } | null>(null);
  const [moreFor, setMoreFor] = useState<"player" | "team" | "opponent" | null>(null);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const onCourt = useMemo(() => squad.filter((p) => p.slot !== null), [squad]);
  const onCourtIds = useMemo(() => onCourt.map((p) => p.playerId), [onCourt]);
  const bench = useMemo(() => squad.filter((p) => p.slot === null), [squad]);
  const slots = useMemo(
    () => formationSlots(match.formation, settings.playersOnCourt, settings.goalkeeper),
    [match.formation, settings.playersOnCourt, settings.goalkeeper],
  );
  const stats = useMemo(
    () => statsOf(match, squad, actionTypes, events, { nowMs: elapsed }),
    [match, squad, actionTypes, events, elapsed],
  );
  const playerStats = useMemo(() => new Map(stats.players.map((p) => [p.playerId, p])), [stats]);
  const period = match.clock.period;
  const periodStats = stats.periods.find((p) => p.period === period);
  const periodOpen = useMemo(() => {
    const started = events.some((e) => e.kind === "period_start" && e.period === period);
    const ended = events.some((e) => e.kind === "period_end" && e.period === period);
    return started && !ended;
  }, [events, period]);
  const periodEnded = useMemo(
    () => events.some((e) => e.kind === "period_end" && e.period === period),
    [events, period],
  );
  const active = useMemo(() => actionTypes.filter((a) => a.status === "active"), [actionTypes]);
  const byScope = (scope: MatchActionType["scope"]) => active.filter((a) => a.scope === scope);
  const selected = selection ? (squad.find((p) => p.playerId === selection.id) ?? null) : null;
  const clockShown =
    settings.clock === "down" ? Math.max(0, settings.periodMinutes * 60_000 - elapsed) : elapsed;

  /** Las llamadas van en fila para que el orden de los eventos sea el de los toques. */
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(job, job);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);
  const fail = (err: unknown) => toast("error", errors(errorKey(err)));

  // --- Llamadas a la API ---

  const patchMatch = (body: Record<string, unknown>) =>
    enqueue(async () => {
      const res = await apiFetch(`/api/org/matches/${match.id}`, {
        method: "PATCH",
        body,
        schema: MatchResponseSchema,
      });
      setState((prev) => (prev ? { ...prev, match: res.match } : prev));
      return res.match;
    });
  const putSquad = (players: MatchSquadPlayer[]) =>
    enqueue(async () => {
      const res = await apiFetch(`/api/org/matches/${match.id}/squad`, {
        method: "PUT",
        body: {
          players: players.map((p) => ({
            playerId: p.playerId,
            shirtNumber: p.shirtNumber,
            position: p.position,
            isGoalkeeper: p.isGoalkeeper,
            starter: p.starter,
            slot: p.slot,
          })),
        },
        schema: MatchSquadResponseSchema,
      });
      setState((prev) =>
        prev
          ? {
              ...prev,
              match: res.match,
              squad: res.squad,
              roster: prev.roster.filter((r) => !res.squad.some((s) => s.playerId === r.playerId)),
            }
          : prev,
      );
      return res.squad;
    });
  type EventInput = Partial<Omit<MatchEvent, "onCourt" | "kind">> & {
    kind: MatchEvent["kind"];
    onCourt: string[];
  };
  const postEvents = (list: EventInput[]) =>
    enqueue(async () => {
      const res = await apiFetch(`/api/org/matches/${match.id}/events`, {
        method: "POST",
        body: {
          events: list.map((e) => ({
            clientId: clientEventId(),
            kind: e.kind,
            actionTypeId: e.actionTypeId ?? null,
            playerId: e.playerId ?? null,
            relatedPlayerId: e.relatedPlayerId ?? null,
            period: e.period ?? period,
            clockMs: e.clockMs ?? elapsed,
            zone: e.zone ?? null,
            onCourt: e.onCourt,
          })),
        },
        schema: MatchEventsResponseSchema,
      });
      setState((prev) => (prev ? { ...prev, match: res.match, events: res.events } : prev));
      return res.events;
    });
  const deleteEvent = (eventId: string) =>
    enqueue(async () => {
      const res = await apiFetch(`/api/org/matches/${match.id}/events/${eventId}`, {
        method: "DELETE",
        schema: MatchEventsResponseSchema,
      });
      setState((prev) => (prev ? { ...prev, match: res.match, events: res.events } : prev));
      return res.events;
    });

  // --- Acciones de la consola ---

  async function startMatch() {
    const starters = squad.filter((p) => p.slot !== null);
    if (starters.length !== settings.playersOnCourt) {
      setLineupOpen(true);
      return;
    }
    setBusy(true);
    try {
      await patchMatch({ status: "live" });
      await postEvents([
        { kind: "lineup", period: 1, clockMs: 0, onCourt: onCourtIds },
        { kind: "period_start", period: 1, clockMs: 0, onCourt: onCourtIds },
      ]);
      await patchMatch({
        clock: { period: 1, elapsedMs: 0, runningSince: new Date().toISOString() },
      });
      toast("success", t("started"));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  async function toggleClock() {
    try {
      if (running) {
        await patchMatch({ clock: { period, elapsedMs: elapsed, runningSince: null } });
      } else {
        if (!periodOpen) {
          await postEvents([
            { kind: "period_start", period, clockMs: elapsed, onCourt: onCourtIds },
          ]);
        }
        await patchMatch({
          clock: { period, elapsedMs: elapsed, runningSince: new Date().toISOString() },
        });
      }
    } catch (err) {
      fail(err);
    }
  }
  async function endPeriod() {
    try {
      await patchMatch({ clock: { period, elapsedMs: elapsed, runningSince: null } });
      await postEvents([{ kind: "period_end", period, clockMs: elapsed, onCourt: onCourtIds }]);
      if (period < settings.periods) {
        await patchMatch({ clock: { period: period + 1, elapsedMs: 0, runningSince: null } });
        toast("success", t("periodEnded", { period: periodLabel(t, period, settings.periods) }));
      } else {
        setFinishing(true);
      }
    } catch (err) {
      fail(err);
    }
  }
  async function finishMatch() {
    setFinishing(false);
    setBusy(true);
    try {
      if (periodOpen) {
        await postEvents([{ kind: "period_end", period, clockMs: elapsed, onCourt: onCourtIds }]);
      }
      await patchMatch({
        status: "finished",
        clock: { period, elapsedMs: elapsed, runningSince: null },
      });
      toast("success", t("finished"));
      onFinished();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  async function reopen() {
    try {
      await patchMatch({ status: "live" });
      toast("success", t("reopened"));
    } catch (err) {
      fail(err);
    }
  }

  async function record(
    type: MatchActionType,
    playerId: string | null,
    zone: MatchZone | null = null,
  ) {
    if (type.requiresZone && settings.zones && zone === null && type.scope === "player") {
      setZonePick({ type, playerId });
      return;
    }
    try {
      await postEvents([
        {
          kind: "action",
          actionTypeId: type.id,
          playerId: type.scope === "player" ? playerId : null,
          zone,
          onCourt: onCourtIds,
        },
      ]);
      if (type.card === "red" && playerId) {
        await putSquad(squad.map((p) => (p.playerId === playerId ? { ...p, slot: null } : p)));
        setSelection(null);
      }
    } catch (err) {
      fail(err);
    }
  }

  async function substitute(inId: string, outId: string) {
    const out = squad.find((p) => p.playerId === outId);
    const incoming = squad.find((p) => p.playerId === inId);
    if (!out || !incoming || out.slot === null) return;
    const next = squad.map((p) =>
      p.playerId === outId
        ? { ...p, slot: null, starter: match.status === "scheduled" ? false : p.starter }
        : p.playerId === inId
          ? { ...p, slot: out.slot, starter: match.status === "scheduled" ? true : p.starter }
          : p,
    );
    setSelection(null);
    try {
      if (match.status === "live") {
        const court = next.filter((p) => p.slot !== null).map((p) => p.playerId);
        await postEvents([{ kind: "sub", playerId: inId, relatedPlayerId: outId, onCourt: court }]);
      }
      await putSquad(next);
    } catch (err) {
      fail(err);
    }
  }
  async function swap(aId: string, bId: string) {
    const a = squad.find((p) => p.playerId === aId);
    const b = squad.find((p) => p.playerId === bId);
    if (!a || !b) return;
    setSelection(null);
    try {
      await putSquad(
        squad.map((p) =>
          p.playerId === aId
            ? { ...p, slot: b.slot }
            : p.playerId === bId
              ? { ...p, slot: a.slot }
              : p,
        ),
      );
    } catch (err) {
      fail(err);
    }
  }
  function tapCourt(p: MatchSquadPlayer) {
    if (!canWrite) return;
    if (!selection) return setSelection({ id: p.playerId, where: "court" });
    if (selection.id === p.playerId) return setSelection(null);
    if (selection.where === "court") return void swap(selection.id, p.playerId);
    void substitute(selection.id, p.playerId);
  }
  function tapBench(p: MatchSquadPlayer) {
    if (!canWrite) return;
    if (!selection) return setSelection({ id: p.playerId, where: "bench" });
    if (selection.id === p.playerId) return setSelection(null);
    if (selection.where === "court") return void substitute(p.playerId, selection.id);
    setSelection({ id: p.playerId, where: "bench" });
  }
  async function undo() {
    const last = events[events.length - 1];
    if (!last) return;
    try {
      if (last.kind === "sub" && last.playerId && last.relatedPlayerId) {
        const incoming = squad.find((p) => p.playerId === last.playerId);
        await putSquad(
          squad.map((p) =>
            p.playerId === last.playerId
              ? { ...p, slot: null }
              : p.playerId === last.relatedPlayerId
                ? { ...p, slot: incoming?.slot ?? null }
                : p,
          ),
        );
      }
      const remaining = await deleteEvent(last.id);
      if (last.kind === "period_start" && last.period === period) {
        await patchMatch({ clock: { period, elapsedMs: last.clockMs, runningSince: null } });
      } else if (last.kind === "period_end" && period > last.period) {
        await patchMatch({
          clock: { period: last.period, elapsedMs: last.clockMs, runningSince: null },
        });
      } else if (last.kind === "lineup" && remaining.length === 0) {
        await patchMatch({
          status: "scheduled",
          clock: { period: 1, elapsedMs: 0, runningSince: null },
        });
      }
      toast("success", t("undone"));
    } catch (err) {
      fail(err);
    }
  }

  const eventText = (e: MatchEvent) => {
    const who = (pid: string | null) => squad.find((p) => p.playerId === pid)?.name ?? "";
    switch (e.kind) {
      case "action": {
        const type = actionTypes.find((a) => a.id === e.actionTypeId);
        const name = type?.name ?? e.actionCode ?? "";
        return e.playerId ? `${name} · ${who(e.playerId)}` : name;
      }
      case "sub":
        return t("feedSub", { in: who(e.playerId), out: who(e.relatedPlayerId) });
      case "period_start":
        return t("feedPeriodStart", { period: periodLabel(t, e.period, settings.periods) });
      case "period_end":
        return t("feedPeriodEnd", { period: periodLabel(t, e.period, settings.periods) });
      case "lineup":
        return t("feedLineup");
    }
  };
  const foulsOwn = periodStats?.ownFouls ?? 0;
  const foulsOpp = periodStats?.opponentFouls ?? 0;
  const foulKind = (n: number) =>
    settings.foulLimit > 0 && n >= settings.foulLimit
      ? "danger"
      : settings.foulLimit > 0 && n === settings.foulLimit - 1
        ? "warning"
        : "neutral";
  const ownName = clubName;
  const flip = match.attackDirection === "left";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ButtonLink
          to={paths.teamMatches(match.team.id)}
          variant="tertiary"
          size="sm"
          icon={<Icon.ArrowLeft size={16} aria-hidden="true" />}
        >
          {t("back", { team: match.team.name })}
        </ButtonLink>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon.ArrowCounterClockwise size={16} aria-hidden="true" />}
              disabled={events.length === 0}
              onClick={() => void undo()}
            >
              {t("undo")}
            </Button>
          ) : null}
          {access.write ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon.Users size={16} aria-hidden="true" />}
              onClick={() => setLineupOpen(true)}
            >
              {t("squad")}
            </Button>
          ) : null}
          {access.write ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon.Sliders size={16} aria-hidden="true" />}
              onClick={() => setSettingsOpen(true)}
            >
              {t("settings")}
            </Button>
          ) : null}
          <ButtonLink
            to={paths.matchStats(match.id)}
            variant="secondary"
            size="sm"
            icon={<Icon.ChartBar size={16} aria-hidden="true" />}
          >
            {t("stats")}
          </ButtonLink>
        </div>
      </div>

      {/* Marcador y cronómetro */}
      <section
        aria-label={t("scoreboard")}
        className="grid grid-cols-2 items-center gap-3 rounded-card bg-club-deep px-4 py-4 text-on-club-deep shadow-card sm:grid-cols-[1fr_auto_1fr]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Crest name={ownName} logoUrl={logoUrl} size="md" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body font-semibold">{ownName}</span>
            <span className="truncate text-secondary opacity-80">{match.team.name}</span>
            <span className="pt-1">
              <StatusChip kind={foulKind(foulsOwn)}>{t("fouls", { count: foulsOwn })}</StatusChip>
            </span>
          </div>
          <span className="ml-auto font-mono text-display lg:text-display-lg tabular">
            {match.ownScore}
          </span>
        </div>
        <div className="order-last col-span-2 flex flex-col items-center gap-1 sm:order-none sm:col-span-1">
          <button
            type="button"
            disabled={!canWrite || match.status === "scheduled"}
            onClick={() => void toggleClock()}
            aria-pressed={running}
            aria-label={running ? t("pause") : t("play")}
            className="flex min-h-14 min-w-36 flex-col items-center justify-center rounded-control bg-surface px-5 py-2 text-ink shadow-float disabled:opacity-70"
          >
            <span className="flex items-center gap-2 font-mono text-title1 lg:text-title1-lg tabular">
              {running ? (
                <Icon.Pause size={20} weight="fill" aria-hidden="true" />
              ) : (
                <Icon.Play size={20} weight="fill" aria-hidden="true" />
              )}
              {formatClock(clockShown)}
            </span>
            <span className="text-label uppercase tracking-wide text-muted">
              {periodLabel(t, period, settings.periods)} ·{" "}
              {match.status === "scheduled"
                ? t("status.scheduled")
                : running
                  ? t("running")
                  : t("paused")}
            </span>
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span className="mr-auto font-mono text-display lg:text-display-lg tabular">
            {match.opponentScore}
          </span>
          <div className="flex min-w-0 flex-col items-end text-right">
            <span className="truncate text-body font-semibold">{match.opponent}</span>
            <span className="truncate text-secondary opacity-80">
              {match.homeAway === "home" ? t("away") : t("home")}
            </span>
            <span className="pt-1">
              <StatusChip kind={foulKind(foulsOpp)}>{t("fouls", { count: foulsOpp })}</StatusChip>
            </span>
          </div>
        </div>
      </section>

      {/* Controles del partido: empezar, periodo, acabar */}
      {access.write ? (
        <div className="flex flex-wrap items-center gap-2">
          {match.status === "scheduled" ? (
            <Button
              icon={<Icon.Play size={18} weight="fill" aria-hidden="true" />}
              loading={busy}
              onClick={() => void startMatch()}
            >
              {t("start")}
            </Button>
          ) : null}
          {match.status === "live" && periodOpen ? (
            <Button
              variant="secondary"
              icon={<Icon.Stop size={18} aria-hidden="true" />}
              onClick={() => void endPeriod()}
            >
              {t("endPeriod", { period: periodLabel(t, period, settings.periods) })}
            </Button>
          ) : null}
          {match.status === "live" && !periodOpen && !periodEnded ? (
            <Button
              icon={<Icon.Play size={18} weight="fill" aria-hidden="true" />}
              onClick={() => void toggleClock()}
            >
              {t("startPeriod", { period: periodLabel(t, period, settings.periods) })}
            </Button>
          ) : null}
          {match.status === "live" ? (
            <Button
              variant="danger"
              icon={<Icon.CheckCircle size={18} aria-hidden="true" />}
              onClick={() => setFinishing(true)}
            >
              {t("finish")}
            </Button>
          ) : null}
          {match.status === "finished" ? (
            <>
              <StatusChip kind="neutral">{t("status.finished")}</StatusChip>
              <Button variant="secondary" size="sm" onClick={() => void reopen()}>
                {t("reopen")}
              </Button>
            </>
          ) : null}
          {match.status === "scheduled" && onCourt.length !== settings.playersOnCourt ? (
            <span className="text-secondary text-muted">
              {t("lineupNeeded", { count: onCourt.length, total: settings.playersOnCourt })}
            </span>
          ) : null}
        </div>
      ) : (
        <Alert kind="info">{t("readOnly")}</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Pista */}
        <section aria-label={t("court")} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-label uppercase tracking-wide text-muted">
                {t("onCourt", { count: onCourt.length, total: settings.playersOnCourt })}
              </span>
              <span className="text-secondary text-muted">{canWrite ? t("courtHint") : ""}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {settings.formations.length > 0 ? (
                <div
                  className="flex items-center gap-1 rounded-control bg-raised p-1"
                  role="group"
                  aria-label={t("formation")}
                >
                  {settings.formations.map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={match.formation === f}
                      disabled={!canWrite}
                      onClick={() => void patchMatch({ formation: f }).catch(fail)}
                      className={`h-9 rounded-control px-3 font-mono text-secondary ${match.formation === f ? "bg-surface text-ink shadow-row" : "text-muted"}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              ) : null}
              <IconButton
                label={t("attackDirection")}
                disabled={!canWrite}
                onClick={() =>
                  void patchMatch({
                    attackDirection: (flip ? "right" : "left") satisfies AttackDirection,
                  }).catch(fail)
                }
              >
                <Icon.ArrowsLeftRight size={20} aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <p className="font-mono text-label text-muted">
            {flip
              ? `${match.opponent} ← ${ownName} · ${t("attacks")}`
              : `${ownName} · ${t("attacks")} → ${match.opponent}`}
          </p>
          <Court>
            {slots.map((slot) => {
              const p = squad.find((x) => x.slot === slot.slot);
              const x = flip ? 100 - slot.x : slot.x;
              if (!p) {
                return (
                  <button
                    key={slot.slot}
                    type="button"
                    disabled={!canWrite || !selection || selection.where !== "bench"}
                    aria-label={t("emptySlot")}
                    onClick={() => {
                      if (!selection) return;
                      void putSquad(
                        squad.map((q) =>
                          q.playerId === selection.id
                            ? {
                                ...q,
                                slot: slot.slot,
                                starter: match.status === "scheduled" ? true : q.starter,
                              }
                            : q,
                        ),
                      );
                      setSelection(null);
                    }}
                    style={{ left: `${x}%`, top: `${slot.y}%` }}
                    className="absolute grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-dashed border-white/70 text-white/80 disabled:opacity-60"
                  >
                    <Icon.Plus size={18} aria-hidden="true" />
                  </button>
                );
              }
              const ps = playerStats.get(p.playerId);
              return (
                <PlayerTile
                  key={p.playerId}
                  player={p}
                  x={x}
                  y={slot.y}
                  minutes={ps ? Math.round(ps.timeMs / 60_000) : 0}
                  plusMinus={ps?.plusMinus ?? 0}
                  selected={selection?.id === p.playerId}
                  disabled={!canWrite}
                  onClick={() => tapCourt(p)}
                  keeperLabel={t("keeper")}
                />
              );
            })}
          </Court>

          {/* Bandeja de acciones del jugador seleccionado */}
          <div
            aria-live="polite"
            className="rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border"
          >
            {selected && selection?.where === "court" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-body font-semibold text-ink">
                    <span className="grid size-8 place-items-center rounded-full bg-club font-mono text-secondary text-on-club">
                      {selected.shirtNumber ?? "–"}
                    </span>
                    {selected.name}
                    {selected.isGoalkeeper ? (
                      <StatusChip kind="club">{t("keeper")}</StatusChip>
                    ) : null}
                  </span>
                  <span className="text-secondary text-muted">{t("trayHint")}</span>
                </div>
                <ActionButtons
                  types={byScope("player").filter(
                    (a) => a.quick && (!a.keeperOnly || selected.isGoalkeeper),
                  )}
                  onPick={(type) => void record(type, selected.playerId)}
                  more={() => setMoreFor("player")}
                  moreLabel={t("more")}
                />
              </div>
            ) : selected && selection?.where === "bench" ? (
              <p className="text-body text-muted">{t("benchSelected", { name: selected.name })}</p>
            ) : (
              <div className="flex flex-col gap-1">
                <strong className="text-body text-ink">{t("tapPlayer")}</strong>
                <span className="text-secondary text-muted">{t("tapPlayerHint")}</span>
              </div>
            )}
          </div>
        </section>

        {/* Banquillo, rival, equipo y últimas acciones */}
        <aside className="flex flex-col gap-4">
          <section
            aria-label={t("bench")}
            className="rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border"
          >
            <div className="flex items-center justify-between gap-2 pb-3">
              <h2 className="text-title2 text-ink">{t("bench")}</h2>
              <span className="text-secondary text-muted">{t("benchHint")}</span>
            </div>
            {bench.length === 0 ? (
              <p className="text-secondary text-muted">{t("benchEmpty")}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                {bench.map((p) => {
                  const ps = playerStats.get(p.playerId);
                  const isSel = selection?.id === p.playerId;
                  return (
                    <li key={p.playerId}>
                      <button
                        type="button"
                        disabled={!canWrite || (ps?.sentOff ?? false)}
                        aria-pressed={isSel}
                        onClick={() => tapBench(p)}
                        className={`flex min-h-12 w-full items-center gap-2 rounded-field border px-2 py-1.5 text-left transition-colors disabled:opacity-60 ${
                          isSel ? "border-club bg-club-soft" : "border-border bg-page"
                        }`}
                      >
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-secondary ${p.isGoalkeeper ? "bg-ink text-white" : "bg-club text-on-club"}`}
                        >
                          {p.shirtNumber ?? "–"}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-secondary font-medium text-ink">
                            {p.name}
                          </span>
                          <span className="font-mono text-label text-muted">
                            {formatClock(ps?.timeMs ?? 0)} · {signed(ps?.plusMinus ?? 0)}
                            {ps?.sentOff ? ` · ${t("sentOff")}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-label={t("opponentActions")}
            className="rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border"
          >
            <h2 className="pb-3 text-title2 text-ink">{t("opponentActions")}</h2>
            <ActionButtons
              types={byScope("opponent").filter((a) => a.quick)}
              onPick={(type) => void record(type, null)}
              more={byScope("opponent").length > 0 ? () => setMoreFor("opponent") : undefined}
              moreLabel={t("more")}
              disabled={!canWrite}
              narrow
            />
          </section>

          {byScope("team").length > 0 ? (
            <section
              aria-label={t("teamActions")}
              className="rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border"
            >
              <h2 className="pb-3 text-title2 text-ink">{t("teamActions")}</h2>
              <ActionButtons
                types={byScope("team").filter((a) => a.quick)}
                onPick={(type) => void record(type, null)}
                more={() => setMoreFor("team")}
                moreLabel={t("more")}
                disabled={!canWrite}
                narrow
              />
            </section>
          ) : null}

          <section
            aria-label={t("feed")}
            className="rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border"
          >
            <h2 className="pb-3 text-title2 text-ink">{t("feed")}</h2>
            {events.length === 0 ? (
              <p className="text-secondary text-muted">{t("feedEmpty")}</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line">
                {[...events]
                  .reverse()
                  .slice(0, 10)
                  .map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <span className="font-mono text-secondary text-muted">
                        {formatClock(e.clockMs)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body text-ink">
                        {eventText(e)}
                      </span>
                      {e.ownScoreDelta > 0 || e.opponentScoreDelta > 0 ? (
                        <StatusChip kind={e.ownScoreDelta > 0 ? "club" : "neutral"}>
                          {e.ownScoreDelta > 0 ? `+${e.ownScoreDelta}` : `+${e.opponentScoreDelta}`}
                        </StatusChip>
                      ) : null}
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      {/* Mapa de zonas: desde dónde se ha finalizado */}
      {zonePick ? (
        <Sheet
          open
          onClose={() => setZonePick(null)}
          closeLabel={c("close")}
          title={zonePick.type.name}
          description={t("zone.description")}
        >
          <ZonePicker
            goalLabel={t("zone.goal")}
            onPick={(zone) => {
              const pick = zonePick;
              setZonePick(null);
              void record(pick.type, pick.playerId, zone);
            }}
          />
          <div className="pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                const pick = zonePick;
                setZonePick(null);
                void postEvents([
                  {
                    kind: "action",
                    actionTypeId: pick.type.id,
                    playerId: pick.type.scope === "player" ? pick.playerId : null,
                    onCourt: onCourtIds,
                  },
                ]).catch(fail);
              }}
            >
              {t("zone.skip")}
            </Button>
          </div>
        </Sheet>
      ) : null}

      {/* Catálogo completo de acciones */}
      {moreFor ? (
        <Sheet
          open
          onClose={() => setMoreFor(null)}
          closeLabel={c("close")}
          title={
            moreFor === "player"
              ? (selected?.name ?? "")
              : moreFor === "team"
                ? t("teamActions")
                : t("opponentActions")
          }
          description={t("moreDescription")}
        >
          <ActionButtons
            types={byScope(moreFor).filter(
              (a) => moreFor !== "player" || !a.keeperOnly || (selected?.isGoalkeeper ?? false),
            )}
            onPick={(type) => {
              setMoreFor(null);
              void record(type, moreFor === "player" ? (selected?.playerId ?? null) : null);
            }}
            moreLabel={t("more")}
            big
          />
        </Sheet>
      ) : null}

      {access.write ? (
        <LineupSheet
          open={lineupOpen}
          state={state}
          onClose={() => setLineupOpen(false)}
          onSave={(players) => {
            setLineupOpen(false);
            void putSquad(players)
              .then(() => toast("success", t("lineup.saved")))
              .catch(fail);
          }}
        />
      ) : null}
      {access.write ? (
        <MatchSettingsSheet
          open={settingsOpen}
          match={match}
          onClose={() => setSettingsOpen(false)}
          onSave={(body) => {
            setSettingsOpen(false);
            void patchMatch(body)
              .then(() => toast("success", t("settingsSheet.saved")))
              .catch(fail);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={finishing}
        title={t("confirmFinishTitle", { score: `${match.ownScore}–${match.opponentScore}` })}
        body={t("confirmFinishBody")}
        confirmLabel={t("finish")}
        cancelLabel={c("cancel")}
        tone="default"
        onConfirm={() => void finishMatch()}
        onCancel={() => setFinishing(false)}
      />
    </div>
  );
}

/** Media pista dibujada en SVG; los jugadores van encima como botones de verdad. */
function Court({ children }: { children: ReactNode }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-card bg-club-deep shadow-card">
      <svg
        viewBox="0 0 160 100"
        className="absolute inset-0 size-full"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <rect
          x="4"
          y="4"
          width="152"
          height="92"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="0.8"
        />
        <line
          x1="80"
          y1="4"
          x2="80"
          y2="96"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="0.8"
        />
        <circle
          cx="80"
          cy="50"
          r="10"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="0.8"
        />
        <path
          d="M4 26 A24 24 0 0 1 4 74"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="0.8"
        />
        <path
          d="M156 26 A24 24 0 0 0 156 74"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="0.8"
        />
        <rect x="1" y="40" width="3" height="20" fill="white" fillOpacity="0.6" />
        <rect x="156" y="40" width="3" height="20" fill="white" fillOpacity="0.6" />
      </svg>
      {children}
    </div>
  );
}

function PlayerTile({
  player,
  x,
  y,
  minutes,
  plusMinus,
  selected,
  disabled,
  onClick,
  keeperLabel,
}: {
  player: MatchSquadPlayer;
  x: number;
  y: number;
  minutes: number;
  plusMinus: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  keeperLabel: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${player.name}${player.isGoalkeeper ? ` · ${keeperLabel}` : ""}`}
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute flex min-h-12 min-w-16 -translate-x-1/2 sm:min-w-20 -translate-y-1/2 flex-col items-center rounded-field px-2 py-1 text-center transition-shadow ${
        selected ? "bg-surface shadow-float ring-2 ring-club" : "bg-black/35 text-white"
      }`}
    >
      <span
        className={`grid size-10 place-items-center rounded-full font-mono text-body font-semibold ${
          player.isGoalkeeper ? "bg-ink text-white ring-2 ring-white/70" : "bg-club text-on-club"
        }`}
      >
        {player.shirtNumber ?? "–"}
      </span>
      <span
        className={`max-w-24 truncate text-secondary font-medium ${selected ? "text-ink" : "text-white"}`}
      >
        {player.name.split(" ")[0]}
      </span>
      <span className={`font-mono text-label ${selected ? "text-muted" : "text-white/80"}`}>
        {minutes}′ · {signed(plusMinus)}
      </span>
    </button>
  );
}

const categoryClass: Record<MatchActionType["category"], string> = {
  positive: "border-success/30 bg-success-soft text-success",
  negative: "border-danger-border bg-danger-soft text-danger",
  neutral: "border-border bg-raised text-ink",
};

/** Botones del catálogo: color por categoría y siempre con texto (DESIGN.md 0.5). */
function ActionButtons({
  types,
  onPick,
  more,
  moreLabel,
  disabled = false,
  big = false,
  narrow = false,
}: {
  types: MatchActionType[];
  onPick: (type: MatchActionType) => void;
  more?: (() => void) | undefined;
  moreLabel: string;
  disabled?: boolean;
  big?: boolean;
  /** Columna lateral: dos columnas y nombres a dos líneas. */
  narrow?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 ${
        big
          ? "grid-cols-2 sm:grid-cols-3"
          : narrow
            ? "grid-cols-2"
            : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
      }`}
    >
      {types.map((type) => {
        const badge = scoreBadge(type);
        return (
          <button
            key={type.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(type)}
            className={`flex min-h-12 items-center justify-between gap-2 rounded-field border px-3 py-2 text-left text-secondary leading-tight font-medium transition-colors disabled:opacity-50 ${categoryClass[type.category]}`}
          >
            <span className="line-clamp-2 min-w-0">{type.name}</span>
            {badge ? <span className="font-mono text-label">{badge}</span> : null}
          </button>
        );
      })}
      {more ? (
        <button
          type="button"
          disabled={disabled}
          onClick={more}
          className="flex min-h-12 items-center justify-center gap-1 rounded-field border border-dashed border-control px-3 text-secondary font-medium text-club-text disabled:opacity-50"
        >
          <Icon.Plus size={16} aria-hidden="true" />
          {moreLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Nueve zonas del medio campo de ataque, la portería arriba. */
function ZonePicker({
  goalLabel,
  onPick,
}: {
  goalLabel: string;
  onPick: (zone: MatchZone) => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-card bg-club-deep p-3 pt-6">
      <span className="absolute top-1 left-1/2 -translate-x-1/2 rounded-b bg-white/80 px-6 py-0.5 text-label text-ink">
        {goalLabel}
      </span>
      <div className="grid grid-cols-3 gap-2">
        {MATCH_ZONES.map((zone, i) => (
          <button
            key={zone}
            type="button"
            onClick={() => onPick(zone)}
            aria-label={zone}
            className="aspect-[4/3] rounded-field border border-white/40 bg-white/10 font-mono text-body text-white transition-colors hover:bg-white/25"
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Convocatoria y quinteto inicial: quién va, quién es portero y quién empieza. */
function LineupSheet({
  open,
  state,
  onClose,
  onSave,
}: {
  open: boolean;
  state: State;
  onClose: () => void;
  onSave: (players: MatchSquadPlayer[]) => void;
}) {
  const t = useT("match.lineup");
  const c = useT("common");
  const { match, squad, roster } = state;
  const settings = match.settings;
  const [draft, setDraft] = useState<MatchSquadPlayer[]>(squad);
  const [extra, setExtra] = useState(roster);
  useEffect(() => {
    if (open) {
      setDraft(squad);
      setExtra(roster);
    }
  }, [open, squad, roster]);
  const starters = draft.filter((p) => p.slot !== null);
  const keepers = starters.filter((p) => p.isGoalkeeper).length;
  const full = starters.length === settings.playersOnCourt;
  const valid = full && (!settings.goalkeeper || keepers === 1);

  /** Los huecos se asignan en orden: portero al 0 si lo hay, el resto por dorsal. */
  function assignSlots(list: MatchSquadPlayer[]): MatchSquadPlayer[] {
    const chosen = list.filter((p) => p.slot !== null);
    const ordered = [
      ...chosen.filter((p) => settings.goalkeeper && p.isGoalkeeper),
      ...chosen.filter((p) => !(settings.goalkeeper && p.isGoalkeeper)),
    ];
    const slotOf = new Map(ordered.map((p, i) => [p.playerId, i]));
    return list.map((p) => ({
      ...p,
      slot: slotOf.has(p.playerId) ? slotOf.get(p.playerId)! : null,
      starter: match.status === "scheduled" ? slotOf.has(p.playerId) : p.starter,
    }));
  }
  const toggleStarter = (id: string) =>
    setDraft((list) =>
      assignSlots(
        list.map((p) => (p.playerId === id ? { ...p, slot: p.slot === null ? 99 : null } : p)),
      ),
    );
  const toggleKeeper = (id: string) =>
    setDraft((list) =>
      assignSlots(
        list.map((p) => (p.playerId === id ? { ...p, isGoalkeeper: !p.isGoalkeeper } : p)),
      ),
    );
  const remove = (id: string) => {
    const p = draft.find((x) => x.playerId === id);
    setDraft((list) => assignSlots(list.filter((x) => x.playerId !== id)));
    if (p)
      setExtra((list) => [
        ...list,
        {
          playerId: p.playerId,
          name: p.name,
          photoUrl: p.photoUrl,
          shirtNumber: p.shirtNumber,
          position: p.position,
        },
      ]);
  };
  const add = (id: string) => {
    const r = extra.find((x) => x.playerId === id);
    if (!r) return;
    setExtra((list) => list.filter((x) => x.playerId !== id));
    setDraft((list) => [...list, { ...r, isGoalkeeper: false, starter: false, slot: null }]);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description", { count: settings.playersOnCourt })}
      footer={
        <>
          <span className="mr-auto self-center font-mono text-secondary text-muted">
            {t("counter", { count: starters.length, total: settings.playersOnCourt })}
          </span>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button disabled={!valid} onClick={() => onSave(draft)}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {settings.goalkeeper && full && keepers !== 1 ? (
          <Alert kind="warning">{t("keeperNeeded")}</Alert>
        ) : null}
        <ul className="flex flex-col divide-y divide-line">
          {draft.map((p) => (
            <li key={p.playerId} className="flex min-h-14 items-center gap-3 py-2">
              <button
                type="button"
                aria-pressed={p.slot !== null}
                onClick={() => toggleStarter(p.playerId)}
                className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-field px-2 text-left ${p.slot !== null ? "bg-club-soft" : ""}`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-secondary ${p.isGoalkeeper ? "bg-ink text-white" : "bg-raised text-ink"}`}
                >
                  {p.shirtNumber ?? "–"}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body font-medium text-ink">{p.name}</span>
                  <span className="text-secondary text-muted">
                    {p.slot !== null ? t("starter") : t("benchPlayer")}
                    {p.position ? ` · ${p.position}` : ""}
                  </span>
                </span>
              </button>
              {settings.goalkeeper ? (
                <Button
                  variant={p.isGoalkeeper ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => toggleKeeper(p.playerId)}
                  aria-pressed={p.isGoalkeeper}
                >
                  {t("keeper")}
                </Button>
              ) : null}
              <Button variant="tertiary" size="sm" onClick={() => remove(p.playerId)}>
                {c("remove")}
              </Button>
            </li>
          ))}
        </ul>
        {extra.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <span className="text-label uppercase tracking-wide text-muted">{t("notCalled")}</span>
            <ul className="flex flex-wrap gap-2">
              {extra.map((r) => (
                <li key={r.playerId}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Icon.Plus size={14} aria-hidden="true" />}
                    onClick={() => add(r.playerId)}
                  >
                    {r.shirtNumber !== null ? `${r.shirtNumber} · ` : ""}
                    {r.name}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Ajustes del partido: rival, sistema y dirección de ataque. */
function MatchSettingsSheet({
  open,
  match,
  onClose,
  onSave,
}: {
  open: boolean;
  match: MatchDetail;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const t = useT("match.settingsSheet");
  const tm = useT("match");
  const c = useT("common");
  const [opponent, setOpponent] = useState(match.opponent);
  const [formation, setFormation] = useState(match.formation ?? "");
  const [direction, setDirection] = useState<AttackDirection>(match.attackDirection);
  const [notes, setNotes] = useState(match.notes ?? "");
  useEffect(() => {
    if (open) {
      setOpponent(match.opponent);
      setFormation(match.formation ?? "");
      setDirection(match.attackDirection);
      setNotes(match.notes ?? "");
    }
  }, [open, match]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description", {
        periods: match.settings.periods,
        minutes: match.settings.periodMinutes,
        players: match.settings.playersOnCourt,
      })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            disabled={!opponent.trim()}
            onClick={() =>
              onSave({
                opponent: opponent.trim(),
                formation: formation || null,
                attackDirection: direction,
                notes: notes.trim() || null,
              })
            }
          >
            {c("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("opponent")}>
          {(id) => (
            <input
              id={id}
              className="h-(--h-control) w-full rounded-field border border-control bg-surface px-4 text-body text-ink"
              maxLength={60}
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tm("formation")}>
            {(id) => (
              <Select id={id} value={formation} onChange={(e) => setFormation(e.target.value)}>
                <option value="">{t("noFormation")}</option>
                {match.settings.formations.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={tm("attackDirection")}>
            {(id) => (
              <Select
                id={id}
                value={direction}
                onChange={(e) => setDirection(e.target.value as AttackDirection)}
              >
                <option value="right">{t("toRight")}</option>
                <option value="left">{t("toLeft")}</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("notes")}>
          {(id) => (
            <textarea
              id={id}
              rows={3}
              maxLength={600}
              className="w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}

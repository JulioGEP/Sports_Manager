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
import { useTileDrag } from "@/lib/drag";
import { useT, type Translate } from "@/lib/intl";
import { clientEventId, elapsedOf, scoreBadge, statsOf } from "@/lib/matches";
import { useMediaQuery } from "@/lib/media";
import {
  Alert,
  Button,
  ConfirmDialog,
  Crest,
  Field,
  Icon,
  Menu,
  MenuDivider,
  MenuItem,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

type Where = "court" | "bench";
type Selection = { id: string; where: Where } | null;
type DragItem = { id: string; from: Where };
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

/** Si el periodo ha empezado y no ha acabado, y si ya ha acabado. */
function periodState(events: MatchEvent[], period: number) {
  const started = events.some((e) => e.kind === "period_start" && e.period === period);
  const ended = events.some((e) => e.kind === "period_end" && e.period === period);
  return { open: started && !ended, ended };
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
 * Pantalla completa del navegador, con la pantalla girada a horizontal cuando el dispositivo lo
 * permite (Android). Donde no se puede (Safari en iPhone) la consola ya ocupa toda la ventana.
 */
function useFullscreen() {
  const supported =
    typeof document !== "undefined" &&
    typeof document.documentElement.requestFullscreen === "function";
  const [active, setActive] = useState(
    () => typeof document !== "undefined" && document.fullscreenElement !== null,
  );
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      await orientation.lock?.("landscape").catch(() => undefined);
    } catch {
      // El navegador no lo permite: la consola ya ocupa toda la ventana.
    }
  }, []);
  return { supported, active, toggle };
}

/**
 * Consola del partido en directo (Bloque 20, ADR 0034; pantalla completa y tres zonas, ADR 0037):
 * ocupa toda la ventana, sin la navegación del club, y ordena la información en tres zonas: lo
 * nuestro (pista, banquillo y acciones del equipo), lo del rival y lo del partido (marcador,
 * cronómetro y últimas acciones). Un toque, una acción. Cada evento viaja a la API al momento; el
 * cronómetro se guarda al arrancar, parar y cambiar de periodo, así que recargar no pierde nada.
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
  const navigate = useNavigate();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const { match, squad, actionTypes, events, access } = state;
  const settings = match.settings;
  const canWrite = access.write && match.status !== "finished";
  const elapsed = useElapsed(match.clock);
  const running = match.clock.runningSince !== null;
  const fullscreen = useFullscreen();
  /** Un móvil en vertical: la consola cabe mejor girado (DESIGN.md 9.19). */
  const portraitPhone = useMediaQuery(
    "(orientation: portrait) and (hover: none) and (max-width: 1023px)",
  );

  const [selection, setSelection] = useState<Selection>(null);
  const [zonePick, setZonePick] = useState<{ type: MatchActionType; playerId: string } | null>(
    null,
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** La consola ocupa toda la ventana: la página de debajo no se desplaza mientras tanto. */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const onCourt = useMemo(() => squad.filter((p) => p.slot !== null), [squad]);
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
  const { open: periodOpen, ended: periodEnded } = useMemo(
    () => periodState(events, period),
    [events, period],
  );
  const active = useMemo(() => actionTypes.filter((a) => a.status === "active"), [actionTypes]);
  const byScope = (scope: MatchActionType["scope"]) => active.filter((a) => a.scope === scope);
  /** Todo el catálogo de un ámbito, las de la bandeja rápida primero y el resto en su orden. */
  const quickFirst = (types: MatchActionType[]) =>
    [...types].sort((a, b) => Number(b.quick) - Number(a.quick));
  const selected = selection ? (squad.find((p) => p.playerId === selection.id) ?? null) : null;
  const clockShown =
    settings.clock === "down" ? Math.max(0, settings.periodMinutes * 60_000 - elapsed) : elapsed;
  const byId = (id: string | null) => squad.find((p) => p.playerId === id);

  /**
   * Lo último que sabemos del partido, al margen del ciclo de pintado. Las operaciones van en fila
   * y leen de aquí, no del render que las lanzó: un cambio y un deshacer seguidos, o un arrastre
   * justo después de un toque, parten de lo que dejó la operación anterior aunque la API aún no
   * haya respondido.
   */
  const latest = useRef(state);
  latest.current = state;
  const commit = useCallback(
    (patch: Partial<State>) => {
      latest.current = { ...latest.current, ...patch };
      setState((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [setState],
  );
  /** Las llamadas van en fila para que el orden de los eventos sea el de los toques. */
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(job, job);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);
  const fail = (err: unknown) => toast("error", errors(errorKey(err)));
  /** Una operación de la consola: en fila, y con su error avisado. */
  const run = (job: () => Promise<void>) => enqueue(job).catch(fail);
  const courtIds = () => latest.current.squad.filter((p) => p.slot !== null).map((p) => p.playerId);
  /** Instante del cronómetro ahora mismo (el del toque, no el de la respuesta de la API). */
  const clockNow = () => elapsedOf(latest.current.match.clock);
  const redCards = useMemo(
    () => new Set(actionTypes.filter((a) => a.card === "red").map((a) => a.id)),
    [actionTypes],
  );
  const isSentOff = (id: string) =>
    latest.current.events.some(
      (e) =>
        e.kind === "action" &&
        e.playerId === id &&
        e.actionTypeId !== null &&
        redCards.has(e.actionTypeId),
    );

  // --- Llamadas a la API: siempre dentro de una operación en fila ---

  async function sendPatch(body: Record<string, unknown>) {
    const res = await apiFetch(`/api/org/matches/${match.id}`, {
      method: "PATCH",
      body,
      schema: MatchResponseSchema,
    });
    commit({ match: res.match });
    return res.match;
  }
  async function sendSquad(players: MatchSquadPlayer[]) {
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
    commit({
      match: res.match,
      squad: res.squad,
      roster: latest.current.roster.filter(
        (r) => !res.squad.some((s) => s.playerId === r.playerId),
      ),
    });
    return res.squad;
  }
  type EventInput = Partial<Omit<MatchEvent, "onCourt" | "kind">> & {
    kind: MatchEvent["kind"];
    onCourt: string[];
  };
  async function sendEvents(list: EventInput[]) {
    const clock = latest.current.match.clock;
    const res = await apiFetch(`/api/org/matches/${match.id}/events`, {
      method: "POST",
      body: {
        events: list.map((e) => ({
          clientId: clientEventId(),
          kind: e.kind,
          actionTypeId: e.actionTypeId ?? null,
          playerId: e.playerId ?? null,
          relatedPlayerId: e.relatedPlayerId ?? null,
          period: e.period ?? clock.period,
          clockMs: e.clockMs ?? elapsedOf(clock),
          zone: e.zone ?? null,
          onCourt: e.onCourt,
        })),
      },
      schema: MatchEventsResponseSchema,
    });
    commit({ match: res.match, events: res.events });
    return res.events;
  }
  async function sendDelete(eventId: string) {
    const res = await apiFetch(`/api/org/matches/${match.id}/events/${eventId}`, {
      method: "DELETE",
      schema: MatchEventsResponseSchema,
    });
    commit({ match: res.match, events: res.events });
    return res.events;
  }
  const patchMatch = (body: Record<string, unknown>) => enqueue(() => sendPatch(body));
  const putSquad = (players: MatchSquadPlayer[]) => enqueue(() => sendSquad(players));

  // --- Partido: empezar, cronómetro, periodos, acabar ---

  function startMatch() {
    if (onCourt.length !== settings.playersOnCourt) {
      setLineupOpen(true);
      return;
    }
    setBusy(true);
    void run(async () => {
      const court = courtIds();
      await sendPatch({ status: "live" });
      await sendEvents([
        { kind: "lineup", period: 1, clockMs: 0, onCourt: court },
        { kind: "period_start", period: 1, clockMs: 0, onCourt: court },
      ]);
      await sendPatch({
        clock: { period: 1, elapsedMs: 0, runningSince: new Date().toISOString() },
      });
      toast("success", t("started"));
    }).finally(() => setBusy(false));
  }
  function toggleClock() {
    void run(async () => {
      const { clock } = latest.current.match;
      const at = elapsedOf(clock);
      if (clock.runningSince) {
        await sendPatch({ clock: { period: clock.period, elapsedMs: at, runningSince: null } });
        return;
      }
      if (!periodState(latest.current.events, clock.period).open) {
        await sendEvents([
          { kind: "period_start", period: clock.period, clockMs: at, onCourt: courtIds() },
        ]);
      }
      await sendPatch({
        clock: { period: clock.period, elapsedMs: at, runningSince: new Date().toISOString() },
      });
    });
  }
  function endPeriod() {
    void run(async () => {
      const { clock } = latest.current.match;
      const at = elapsedOf(clock);
      await sendPatch({ clock: { period: clock.period, elapsedMs: at, runningSince: null } });
      await sendEvents([
        { kind: "period_end", period: clock.period, clockMs: at, onCourt: courtIds() },
      ]);
      if (clock.period < settings.periods) {
        await sendPatch({ clock: { period: clock.period + 1, elapsedMs: 0, runningSince: null } });
        toast(
          "success",
          t("periodEnded", { period: periodLabel(t, clock.period, settings.periods) }),
        );
      } else {
        setFinishing(true);
      }
    });
  }
  function finishMatch() {
    setFinishing(false);
    setBusy(true);
    void run(async () => {
      const { clock } = latest.current.match;
      const at = elapsedOf(clock);
      if (periodState(latest.current.events, clock.period).open) {
        await sendEvents([
          { kind: "period_end", period: clock.period, clockMs: at, onCourt: courtIds() },
        ]);
      }
      await sendPatch({
        status: "finished",
        clock: { period: clock.period, elapsedMs: at, runningSince: null },
      });
      toast("success", t("finished"));
      onFinished();
    }).finally(() => setBusy(false));
  }
  function reopen() {
    void run(async () => {
      await sendPatch({ status: "live" });
      toast("success", t("reopened"));
    });
  }

  // --- Registro de acciones ---

  /** Registra sin preguntar nada más; el instante es el del toque. */
  function recordNow(type: MatchActionType, playerId: string | null, zone: MatchZone | null) {
    const at = clockNow();
    const inPeriod = latest.current.match.clock.period;
    void run(async () => {
      await sendEvents([
        {
          kind: "action",
          actionTypeId: type.id,
          playerId: type.scope === "player" ? playerId : null,
          zone,
          period: inPeriod,
          clockMs: at,
          onCourt: courtIds(),
        },
      ]);
      if (type.card === "red" && playerId) {
        await sendSquad(
          latest.current.squad.map((p) => (p.playerId === playerId ? { ...p, slot: null } : p)),
        );
        setSelection(null);
      }
    });
  }
  function record(type: MatchActionType, playerId: string | null, zone: MatchZone | null = null) {
    if (type.requiresZone && settings.zones && zone === null && type.scope === "player") {
      if (playerId) setZonePick({ type, playerId });
      return;
    }
    recordNow(type, playerId, zone);
  }

  // --- Pista y banquillo: entrar, cambiar, intercambiar, salir ---

  const starterIf = (p: MatchSquadPlayer, onCourtNow: boolean) =>
    latest.current.match.status === "scheduled" ? onCourtNow : p.starter;

  function substitute(inId: string, outId: string) {
    setSelection(null);
    const at = clockNow();
    void run(async () => {
      const { squad: sq, match: m } = latest.current;
      const out = sq.find((p) => p.playerId === outId);
      const incoming = sq.find((p) => p.playerId === inId);
      if (!out || !incoming || out.slot === null || incoming.slot !== null) return;
      if (isSentOff(inId)) return;
      const next = sq.map((p) =>
        p.playerId === outId
          ? { ...p, slot: null, starter: starterIf(p, false) }
          : p.playerId === inId
            ? { ...p, slot: out.slot, starter: starterIf(p, true) }
            : p,
      );
      if (m.status === "live") {
        await sendEvents([
          {
            kind: "sub",
            playerId: inId,
            relatedPlayerId: outId,
            period: m.clock.period,
            clockMs: at,
            onCourt: next.filter((p) => p.slot !== null).map((p) => p.playerId),
          },
        ]);
      }
      await sendSquad(next);
    });
  }
  function swap(aId: string, bId: string) {
    setSelection(null);
    void run(async () => {
      const sq = latest.current.squad;
      const a = sq.find((p) => p.playerId === aId);
      const b = sq.find((p) => p.playerId === bId);
      if (!a || !b || a.slot === null || b.slot === null) return;
      await sendSquad(
        sq.map((p) =>
          p.playerId === aId
            ? { ...p, slot: b.slot }
            : p.playerId === bId
              ? { ...p, slot: a.slot }
              : p,
        ),
      );
    });
  }
  /** Del banquillo a un hueco libre, o de un hueco a otro libre. */
  function placeInSlot(id: string, slot: number) {
    setSelection(null);
    void run(async () => {
      const sq = latest.current.squad;
      const p = sq.find((q) => q.playerId === id);
      if (!p || sq.some((q) => q.slot === slot)) return;
      if (p.slot === null && isSentOff(id)) return;
      await sendSquad(
        sq.map((q) => (q.playerId === id ? { ...q, slot, starter: starterIf(q, true) } : q)),
      );
    });
  }
  /** Antes de empezar, quien estaba en la pista vuelve al banquillo. */
  function leaveCourt(id: string) {
    setSelection(null);
    void run(async () => {
      if (latest.current.match.status !== "scheduled") return;
      await sendSquad(
        latest.current.squad.map((q) =>
          q.playerId === id ? { ...q, slot: null, starter: false } : q,
        ),
      );
    });
  }

  function tapCourt(p: MatchSquadPlayer) {
    if (!canWrite) return;
    if (!selection) return setSelection({ id: p.playerId, where: "court" });
    if (selection.id === p.playerId) return setSelection(null);
    if (selection.where === "court") return swap(selection.id, p.playerId);
    substitute(selection.id, p.playerId);
  }
  function tapBench(p: MatchSquadPlayer) {
    if (!canWrite) return;
    if (!selection) return setSelection({ id: p.playerId, where: "bench" });
    if (selection.id === p.playerId) return setSelection(null);
    if (selection.where === "court") return substitute(p.playerId, selection.id);
    setSelection({ id: p.playerId, where: "bench" });
  }
  function tapSlot(slot: number) {
    if (!canWrite || !selection) return;
    placeInSlot(selection.id, slot);
  }

  /** Arrastrar y soltar: el mismo resultado que los toques, en un solo gesto. */
  const {
    drag,
    start: dragStart,
    consumeClick,
  } = useTileDrag<DragItem>((item, target) => {
    if (!canWrite) return;
    const [kind, value] = target.split(":");
    if (kind === "slot" && value !== undefined) {
      placeInSlot(item.id, Number(value));
    } else if (kind === "player" && value !== undefined && value !== item.id) {
      if (item.from === "bench") substitute(item.id, value);
      else swap(item.id, value);
    } else if (kind === "bench" && item.from === "court") {
      leaveCourt(item.id);
    }
  });
  useEffect(() => {
    if (drag) setSelection(null);
  }, [drag]);

  function undo() {
    void run(async () => {
      const { events: history, squad: sq, match: m } = latest.current;
      const last = history[history.length - 1];
      if (!last) return;
      if (last.kind === "sub" && last.playerId && last.relatedPlayerId) {
        const incoming = sq.find((p) => p.playerId === last.playerId);
        await sendSquad(
          sq.map((p) =>
            p.playerId === last.playerId
              ? { ...p, slot: null }
              : p.playerId === last.relatedPlayerId
                ? { ...p, slot: incoming?.slot ?? null }
                : p,
          ),
        );
      }
      const remaining = await sendDelete(last.id);
      const current = m.clock.period;
      if (last.kind === "period_start" && last.period === current) {
        await sendPatch({
          clock: { period: current, elapsedMs: last.clockMs, runningSince: null },
        });
      } else if (last.kind === "period_end" && current > last.period) {
        await sendPatch({
          clock: { period: last.period, elapsedMs: last.clockMs, runningSince: null },
        });
      } else if (last.kind === "lineup" && remaining.length === 0) {
        await sendPatch({
          status: "scheduled",
          clock: { period: 1, elapsedMs: 0, runningSince: null },
        });
      }
      toast("success", t("undone"));
    });
  }

  const eventText = (e: MatchEvent) => {
    const who = (pid: string | null) => byId(pid)?.name ?? "";
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
  const flip = match.attackDirection === "left";
  const periodName = periodLabel(t, period, settings.periods);
  const lastPeriodOver = !periodOpen && periodEnded && period === settings.periods;
  const dragging = drag?.item ?? null;
  const dragged = dragging ? byId(dragging.id) : undefined;
  const minutesOf = (id: string) => Math.round((playerStats.get(id)?.timeMs ?? 0) / 60_000);

  const clockLabel = running
    ? t("pause")
    : periodOpen
      ? t("play")
      : t("startPeriod", { period: periodName });
  const clockState =
    match.status === "scheduled"
      ? t("status.scheduled")
      : running
        ? t("running")
        : periodOpen
          ? t("paused")
          : t("status.scheduled");

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-page text-ink">
      {/* Partido: marcador, cronómetro y mandos */}
      <section
        aria-label={t("scoreboard")}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-club-deep px-3 py-2 text-on-club-deep sm:flex-nowrap sm:px-4 compact:gap-x-2 compact:py-1"
      >
        <BarButton
          label={t("back", { team: match.team.name })}
          onClick={() => void navigate(paths.teamMatches(match.team.id))}
        >
          <Icon.ArrowLeft size={22} aria-hidden="true" />
        </BarButton>

        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Crest name={clubName} logoUrl={logoUrl} size="sm" />
          <div className="flex min-w-0 flex-col leading-tight compact:hidden">
            <span className="truncate text-secondary font-semibold">{clubName}</span>
            <span className="truncate text-label opacity-80">{match.team.name}</span>
          </div>
          <span className="hidden sm:inline-flex compact:hidden">
            <StatusChip kind={foulKind(foulsOwn)}>{t("fouls", { count: foulsOwn })}</StatusChip>
          </span>
          <span className="ml-auto font-mono text-display tabular compact:text-title1">
            {match.ownScore}
          </span>
        </div>

        <div className="order-last flex basis-full items-center justify-center gap-2 sm:order-none sm:basis-auto">
          {match.status === "scheduled" ? (
            access.write ? (
              <Button action="activate" loading={busy} onClick={startMatch}>
                {t("start")}
              </Button>
            ) : (
              <ClockFace
                time={formatClock(clockShown)}
                caption={`${periodName} · ${clockState}`}
                running={false}
              />
            )
          ) : match.status === "finished" ? (
            <>
              <ClockFace
                time={formatClock(clockShown)}
                caption={`${periodName} · ${t("status.finished")}`}
                running={false}
              />
              <StatusChip kind="neutral">{t("status.finished")}</StatusChip>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!canWrite}
                onClick={toggleClock}
                aria-pressed={running}
                aria-label={clockLabel}
                className="rounded-control bg-surface text-ink shadow-float disabled:opacity-80"
              >
                <ClockFace
                  time={formatClock(clockShown)}
                  caption={`${periodName} · ${clockState}`}
                  running={running}
                />
              </button>
              {canWrite && periodOpen ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Icon.Stop size={16} aria-hidden="true" />}
                  onClick={endPeriod}
                >
                  {t("endPeriod", { period: periodName })}
                </Button>
              ) : null}
              {canWrite && lastPeriodOver ? (
                <Button
                  action="finish"
                  variant="danger"
                  size="sm"
                  onClick={() => setFinishing(true)}
                >
                  {t("finish")}
                </Button>
              ) : null}
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <span className="mr-auto font-mono text-display tabular compact:text-title1">
            {match.opponentScore}
          </span>
          <span className="hidden sm:inline-flex compact:hidden">
            <StatusChip kind={foulKind(foulsOpp)}>{t("fouls", { count: foulsOpp })}</StatusChip>
          </span>
          <div className="flex min-w-0 flex-col text-right leading-tight compact:hidden">
            <span className="truncate text-secondary font-semibold">{match.opponent}</span>
            <span className="truncate text-label opacity-80">
              {match.homeAway === "home" ? t("away") : t("home")}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!access.write ? <StatusChip kind="info">{t("readOnly")}</StatusChip> : null}
          {access.write && match.status === "scheduled" ? (
            <BarButton label={t("squad")} onClick={() => setLineupOpen(true)}>
              <Icon.Users size={20} aria-hidden="true" />
              <span className="hidden text-secondary font-medium md:inline">{t("squad")}</span>
            </BarButton>
          ) : null}
          {canWrite ? (
            <BarButton label={t("undo")} disabled={events.length === 0} onClick={undo}>
              <Icon.ArrowCounterClockwise size={20} aria-hidden="true" />
              <span className="hidden text-secondary font-medium md:inline">{t("undo")}</span>
            </BarButton>
          ) : null}
          <Menu
            label={t("menu")}
            triggerClassName="text-on-club-deep hover:bg-white/10"
            trigger={<Icon.DotsThreeVertical size={22} aria-hidden="true" />}
          >
            {access.write ? (
              <MenuItem
                icon={<Icon.Users size={20} aria-hidden="true" />}
                onClick={() => setLineupOpen(true)}
              >
                {t("squad")}
              </MenuItem>
            ) : null}
            {access.write ? (
              <MenuItem
                icon={<Icon.Sliders size={20} aria-hidden="true" />}
                onClick={() => setSettingsOpen(true)}
              >
                {t("settings")}
              </MenuItem>
            ) : null}
            <MenuItem
              icon={<Icon.ChartBar size={20} aria-hidden="true" />}
              to={paths.matchStats(match.id)}
            >
              {t("stats")}
            </MenuItem>
            {fullscreen.supported ? (
              <MenuItem
                icon={
                  fullscreen.active ? (
                    <Icon.CornersIn size={20} aria-hidden="true" />
                  ) : (
                    <Icon.CornersOut size={20} aria-hidden="true" />
                  )
                }
                onClick={() => void fullscreen.toggle()}
              >
                {fullscreen.active ? t("exitFullscreen") : t("fullscreen")}
              </MenuItem>
            ) : null}
            {access.write && match.status !== "scheduled" ? <MenuDivider /> : null}
            {access.write && match.status === "live" ? (
              <MenuItem
                tone="danger"
                icon={<Icon.FlagCheckered size={20} aria-hidden="true" />}
                onClick={() => setFinishing(true)}
              >
                {t("finish")}
              </MenuItem>
            ) : null}
            {access.write && match.status === "finished" ? (
              <MenuItem
                icon={<Icon.ArrowCounterClockwise size={20} aria-hidden="true" />}
                onClick={reopen}
              >
                {t("reopen")}
              </MenuItem>
            ) : null}
          </Menu>
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 landscape:grid landscape:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] landscape:overflow-hidden lg:gap-4 lg:p-4 compact:gap-2 compact:p-2">
        {portraitPhone ? (
          <div className="flex shrink-0 items-center gap-3 rounded-card bg-club-soft px-3 py-2 text-secondary text-club-soft-text">
            <Icon.DeviceRotate size={22} aria-hidden="true" />
            <span className="flex-1">{t("rotateHint")}</span>
            {fullscreen.supported ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon.CornersOut size={16} aria-hidden="true" />}
                onClick={() => void fullscreen.toggle()}
              >
                {t("fullscreen")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Nuestro equipo: pista, banquillo y acciones */}
        <section
          aria-label={t("ours")}
          className="flex min-h-0 flex-col gap-2 rounded-card bg-surface p-3 shadow-card precisa:border precisa:border-border portrait:shrink-0 landscape:overflow-y-auto compact:gap-1 compact:p-2"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
            <Eyebrow>{t("ours")}</Eyebrow>
            <span className="truncate text-secondary font-semibold text-ink compact:hidden">
              {match.team.name}
            </span>
            <span className="inline-flex sm:hidden compact:inline-flex">
              <StatusChip kind={foulKind(foulsOwn)}>{t("fouls", { count: foulsOwn })}</StatusChip>
            </span>
            <span className="font-mono text-label text-muted compact:hidden">
              {t("onCourt", { count: onCourt.length, total: settings.playersOnCourt })}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {settings.formations.length > 0 ? (
                <div
                  className="flex items-center gap-0.5 rounded-control bg-raised p-0.5"
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
                      className={`h-8 rounded-control px-2.5 font-mono text-label compact:h-7 ${
                        match.formation === f ? "bg-surface text-ink shadow-row" : "text-muted"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                aria-label={t("attackDirection")}
                disabled={!canWrite}
                onClick={() =>
                  void patchMatch({
                    attackDirection: (flip ? "right" : "left") satisfies AttackDirection,
                  }).catch(fail)
                }
                className="grid size-8 place-items-center rounded-control text-ink hover:bg-raised disabled:opacity-50 compact:size-7"
              >
                <Icon.ArrowsLeftRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex min-h-36 flex-1 gap-3 portrait:flex-none portrait:flex-col compact:gap-2">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center portrait:flex-none">
              <Court
                flip={flip}
                attackLabel={`${clubName} ${t("attacks")} ${flip ? "←" : "→"} ${match.opponent}`}
                goalLabel={match.opponent}
              >
                {slots.map((slot) => {
                  const p = squad.find((x) => x.slot === slot.slot);
                  const x = flip ? 100 - slot.x : slot.x;
                  const key = p ? `player:${p.playerId}` : `slot:${slot.slot}`;
                  const over = drag?.over === key;
                  if (!p) {
                    const open = Boolean(drag) || (selection !== null && canWrite);
                    return (
                      <button
                        key={slot.slot}
                        type="button"
                        data-drop={`slot:${slot.slot}`}
                        disabled={!canWrite || (!selection && !drag)}
                        aria-label={t("emptySlot")}
                        onClick={() => tapSlot(slot.slot)}
                        style={{ left: `${x}%`, top: `${slot.y}%` }}
                        className={`absolute grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-dashed text-white transition-all compact:size-10 ${
                          over
                            ? "scale-110 border-solid border-white bg-white/30"
                            : open
                              ? "border-white/90 bg-white/15"
                              : "border-white/50 opacity-70"
                        }`}
                      >
                        <Icon.Plus size={18} aria-hidden="true" />
                      </button>
                    );
                  }
                  return (
                    <CourtTile
                      key={p.playerId}
                      player={p}
                      x={x}
                      y={slot.y}
                      minutes={minutesOf(p.playerId)}
                      selected={selection?.id === p.playerId}
                      target={over ? "over" : drag && dragging?.id !== p.playerId ? "open" : "none"}
                      dimmed={zonePick !== null || dragging?.id === p.playerId}
                      disabled={!canWrite || zonePick !== null}
                      keeperLabel={t("keeper")}
                      onPointerDown={
                        canWrite ? dragStart({ id: p.playerId, from: "court" }) : undefined
                      }
                      onClick={() => {
                        if (consumeClick()) return;
                        tapCourt(p);
                      }}
                    />
                  );
                })}
                {zonePick ? (
                  <ZoneOverlay
                    flip={flip}
                    onPick={(zone) => {
                      const pick = zonePick;
                      setZonePick(null);
                      record(pick.type, pick.playerId, zone);
                    }}
                  />
                ) : null}
              </Court>
            </div>

            <section
              aria-label={t("bench")}
              data-drop="bench"
              className={`flex shrink-0 flex-col gap-1 rounded-field p-1 transition-colors landscape:w-44 landscape:min-h-0 landscape:overflow-y-auto landscape:touch-pan-y compact:w-36 ${
                drag?.over === "bench" && dragging?.from === "court" && match.status === "scheduled"
                  ? "bg-club-soft"
                  : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 px-1">
                <span className="text-label uppercase tracking-wide text-muted">{t("bench")}</span>
                {canWrite && bench.length > 0 ? (
                  <span className="hidden text-label text-muted landscape:inline compact:hidden">
                    {t("benchHint")}
                  </span>
                ) : null}
              </div>
              {bench.length === 0 ? (
                <p className="px-1 text-secondary text-muted">{t("benchEmpty")}</p>
              ) : (
                <ul className="flex flex-wrap gap-1 landscape:flex-col landscape:flex-nowrap">
                  {bench.map((p) => {
                    const sentOff = playerStats.get(p.playerId)?.sentOff ?? false;
                    return (
                      <li key={p.playerId} className="portrait:basis-[calc(50%-0.125rem)]">
                        <BenchTile
                          player={p}
                          minutes={minutesOf(p.playerId)}
                          selected={selection?.id === p.playerId}
                          dimmed={dragging?.id === p.playerId}
                          sentOffLabel={sentOff ? t("sentOff") : null}
                          benchLabel={t("bench")}
                          disabled={!canWrite || sentOff}
                          onPointerDown={
                            canWrite && !sentOff
                              ? dragStart({ id: p.playerId, from: "bench" })
                              : undefined
                          }
                          onClick={() => {
                            if (consumeClick()) return;
                            tapBench(p);
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Bandeja: lo que se registra de un toque */}
          <div
            aria-live="polite"
            className="flex min-h-28 shrink-0 flex-col gap-2 border-t border-line pt-2 compact:min-h-24 compact:gap-1 compact:pt-1"
          >
            {zonePick ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <strong className="text-body text-ink">
                    {t("zone.prompt", {
                      action: zonePick.type.name,
                      name: byId(zonePick.playerId)?.name ?? "",
                    })}
                  </strong>
                  <span className="text-secondary text-muted">{t("zone.description")}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const pick = zonePick;
                      setZonePick(null);
                      recordNow(pick.type, pick.playerId, null);
                    }}
                  >
                    {t("zone.skip")}
                  </Button>
                  <Button variant="tertiary" size="sm" onClick={() => setZonePick(null)}>
                    {c("cancel")}
                  </Button>
                </div>
              </>
            ) : selected && selection?.where === "court" ? (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-2 text-body font-semibold text-ink">
                    <PlayerBadge player={selected} size="sm" />
                    {selected.name}
                    {selected.isGoalkeeper ? (
                      <StatusChip kind="club">{t("keeper")}</StatusChip>
                    ) : null}
                  </span>
                  <span className="text-secondary text-muted">{t("trayHint")}</span>
                </div>
                <ActionButtons
                  layout="tray"
                  types={byScope("player").filter(
                    (a) => a.quick && (!a.keeperOnly || selected.isGoalkeeper),
                  )}
                  onPick={(type) => record(type, selected.playerId)}
                  more={() => setMoreOpen(true)}
                  moreLabel={t("more")}
                />
              </>
            ) : selected && selection?.where === "bench" ? (
              <p className="text-body text-ink">{t("benchSelected", { name: selected.name })}</p>
            ) : !access.write ? (
              <p className="text-secondary text-muted">{t("readOnlyHint")}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <strong className="text-body text-ink">{t("tapPlayer")}</strong>
                  <span className="text-secondary text-muted">
                    {match.status === "scheduled"
                      ? t("lineupHint", {
                          count: onCourt.length,
                          total: settings.playersOnCourt,
                        })
                      : t("tapPlayerHint")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 compact:gap-2">
                  {(["team", "match"] as const).map((scope) => (
                    <div key={scope} className="flex min-w-0 flex-col gap-1">
                      <span className="text-label uppercase tracking-wide text-muted">
                        {scope === "team" ? t("teamActions") : t("matchActions")}
                      </span>
                      {byScope(scope).length === 0 ? (
                        <p className="text-secondary text-muted">{t("noActions")}</p>
                      ) : (
                        <ActionButtons
                          layout="half"
                          types={quickFirst(byScope(scope))}
                          onPick={(type) => record(type, null)}
                          moreLabel={t("more")}
                          disabled={!canWrite}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-3 portrait:shrink-0 lg:gap-4 compact:gap-2">
          {/* Rival: todo su catálogo a la vista */}
          <section
            aria-label={t("opponentActions")}
            className="flex min-h-0 flex-col gap-2 rounded-card bg-surface p-3 shadow-card precisa:border precisa:border-border portrait:shrink-0 landscape:flex-1 landscape:overflow-y-auto compact:gap-1 compact:p-2"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Eyebrow>{t("opponent")}</Eyebrow>
              <span className="truncate text-secondary font-semibold text-ink">
                {match.opponent}
              </span>
              <span className="inline-flex sm:hidden compact:inline-flex">
                <StatusChip kind={foulKind(foulsOpp)}>{t("fouls", { count: foulsOpp })}</StatusChip>
              </span>
            </div>
            {byScope("opponent").length === 0 ? (
              <p className="text-secondary text-muted">{t("noActions")}</p>
            ) : (
              <ActionButtons
                layout="side"
                types={quickFirst(byScope("opponent"))}
                onPick={(type) => record(type, null)}
                moreLabel={t("more")}
                disabled={!canWrite}
              />
            )}
          </section>

          {/* Partido: últimas acciones, en pequeño */}
          <section
            aria-label={t("feed")}
            className="flex shrink-0 flex-col gap-1 rounded-card bg-surface p-3 shadow-card precisa:border precisa:border-border compact:p-2"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Eyebrow>{t("match")}</Eyebrow>
              <span className="text-secondary font-semibold text-ink">{t("feed")}</span>
            </div>
            {events.length === 0 ? (
              <p className="text-secondary text-muted">{t("feedEmpty")}</p>
            ) : (
              <ol className="flex max-h-36 flex-col divide-y divide-line overflow-y-auto compact:max-h-24">
                {[...events]
                  .reverse()
                  .slice(0, 8)
                  .map((e) => (
                    <li key={e.id} className="flex items-center gap-2 py-1">
                      <span className="font-mono text-label text-muted">
                        {formatClock(e.clockMs)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-label font-medium text-ink">
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

      {/* Fantasma que sigue al dedo mientras se arrastra */}
      {drag && dragged ? (
        <div
          aria-hidden="true"
          style={{ left: drag.x, top: drag.y }}
          className="pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-1/2 scale-105 items-center gap-2 rounded-field bg-surface px-2 py-1.5 text-ink shadow-float ring-2 ring-club"
        >
          <PlayerBadge player={dragged} size="sm" />
          <span className="text-secondary font-medium">{dragged.name.split(" ")[0]}</span>
        </div>
      ) : null}

      {/* Catálogo completo de acciones */}
      {moreOpen && selected ? (
        <Sheet
          open
          onClose={() => setMoreOpen(false)}
          closeLabel={c("close")}
          title={selected.name}
          description={t("moreDescription")}
        >
          <ActionButtons
            layout="sheet"
            types={byScope("player").filter((a) => !a.keeperOnly || selected.isGoalkeeper)}
            onPick={(type) => {
              setMoreOpen(false);
              record(type, selected.playerId);
            }}
            moreLabel={t("more")}
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
        confirmAction="finish"
        cancelLabel={c("cancel")}
        tone="default"
        onConfirm={finishMatch}
        onCancel={() => setFinishing(false)}
      />
    </div>
  );
}

/** Botón de la franja oscura del partido: icono, y el verbo cuando hay sitio. Siempre con `aria-label`. */
function BarButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-(--h-control) min-w-(--h-control) shrink-0 items-center justify-center gap-1.5 rounded-control px-2 text-on-club-deep transition-colors hover:bg-white/10 disabled:opacity-40 compact:h-10 compact:min-w-10"
    >
      {children}
    </button>
  );
}

/** Tiempo del cronómetro con el periodo y el estado debajo (en compacto, en una sola línea). */
function ClockFace({
  time,
  caption,
  running,
}: {
  time: string;
  caption: string;
  running: boolean;
}) {
  return (
    <span className="flex min-h-12 min-w-36 flex-col items-center justify-center px-4 py-1 compact:min-h-10 compact:min-w-0 compact:flex-row compact:gap-2 compact:px-3">
      <span className="flex items-center gap-2 font-mono text-title1 tabular compact:text-body">
        {running ? (
          <Icon.Pause size={20} weight="fill" aria-hidden="true" />
        ) : (
          <Icon.Play size={20} weight="fill" aria-hidden="true" />
        )}
        {time}
      </span>
      <span className="text-label uppercase tracking-wide text-muted">{caption}</span>
    </span>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-label uppercase tracking-wide text-muted">{children}</span>;
}

/**
 * Pista completa dibujada en SVG, estirada al hueco que tenga; los jugadores van encima como
 * botones de verdad. El nombre del rival junto a la portería que se ataca orienta sin texto aparte.
 */
function Court({
  flip,
  attackLabel,
  goalLabel,
  children,
}: {
  flip: boolean;
  attackLabel: string;
  goalLabel: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={attackLabel}
      className="relative w-full max-h-full aspect-[16/10] overflow-hidden rounded-card bg-club-deep shadow-card select-none"
    >
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
        {/* Flecha de la dirección de ataque, sobre la línea de medio campo */}
        <path
          d={flip ? "M84 7 L77 10 L84 13 Z" : "M76 7 L83 10 L76 13 Z"}
          fill="white"
          fillOpacity="0.7"
        />
      </svg>
      <span
        aria-hidden="true"
        className={`absolute top-1.5 max-w-[40%] truncate text-label text-white/70 ${flip ? "left-3" : "right-3"}`}
      >
        {goalLabel}
      </span>
      {children}
    </div>
  );
}

/** Dorsal en círculo: color del club, o tinta con aro para el portero. */
function PlayerBadge({
  player,
  size = "md",
}: {
  player: Pick<MatchSquadPlayer, "shirtNumber" | "isGoalkeeper">;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-mono font-semibold ${
        size === "sm" ? "size-8 text-secondary" : "size-11 text-body compact:size-9"
      } ${player.isGoalkeeper ? "bg-ink text-white ring-2 ring-white/70" : "bg-club text-on-club"}`}
    >
      {player.shirtNumber ?? "–"}
    </span>
  );
}

function CourtTile({
  player,
  x,
  y,
  minutes,
  selected,
  target,
  dimmed,
  disabled,
  keeperLabel,
  onPointerDown,
  onClick,
}: {
  player: MatchSquadPlayer;
  x: number;
  y: number;
  minutes: number;
  selected: boolean;
  /** Durante un arrastre: destino posible, destino bajo el dedo, o nada. */
  target: "none" | "open" | "over";
  dimmed: boolean;
  disabled: boolean;
  keeperLabel: string;
  onPointerDown?: ((e: React.PointerEvent) => void) | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-drop={`player:${player.playerId}`}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${player.name}${player.isGoalkeeper ? ` · ${keeperLabel}` : ""}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute flex min-w-16 -translate-x-1/2 -translate-y-1/2 touch-none flex-col items-center rounded-field px-1.5 py-1 text-center transition-[box-shadow,transform,opacity] compact:min-w-14 compact:py-0.5 ${
        selected ? "bg-surface text-ink shadow-float ring-2 ring-club" : "bg-black/35 text-white"
      } ${
        target === "over"
          ? "scale-110 ring-4 ring-white"
          : target === "open"
            ? "ring-2 ring-white/60"
            : ""
      } ${dimmed ? "opacity-40" : ""}`}
    >
      <PlayerBadge player={player} />
      <span className="max-w-24 truncate text-secondary font-medium compact:text-label">
        {player.name.split(" ")[0]}
      </span>
      <span
        className={`font-mono text-label compact:hidden ${selected ? "text-muted" : "text-white/80"}`}
      >
        {minutes}′
      </span>
    </button>
  );
}

function BenchTile({
  player,
  minutes,
  selected,
  dimmed,
  sentOffLabel,
  benchLabel,
  disabled,
  onPointerDown,
  onClick,
}: {
  player: MatchSquadPlayer;
  minutes: number;
  selected: boolean;
  dimmed: boolean;
  sentOffLabel: string | null;
  benchLabel: string;
  disabled: boolean;
  onPointerDown?: ((e: React.PointerEvent) => void) | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${player.name} · ${sentOffLabel ?? benchLabel}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={`flex min-h-12 w-full touch-none items-center gap-2 rounded-field border px-2 py-1 text-left transition-colors disabled:opacity-60 compact:min-h-10 ${
        selected ? "border-club bg-club-soft" : "border-border bg-page"
      } ${dimmed ? "opacity-40" : ""}`}
    >
      <PlayerBadge player={player} size="sm" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-secondary font-medium text-ink">
          {player.name.split(" ")[0]}
        </span>
        <span className="font-mono text-label text-muted">{sentOffLabel ?? `${minutes}′`}</span>
      </span>
    </button>
  );
}

const categoryClass: Record<MatchActionType["category"], string> = {
  positive: "border-success/30 bg-success-soft text-success",
  negative: "border-danger-border bg-danger-soft text-danger",
  neutral: "border-border bg-raised text-ink",
};

const layoutClass = {
  /** Bandeja de nuestro equipo: cuantas más columnas, menos altura. */
  tray: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 compact:grid-cols-6",
  /** Columna del rival. */
  side: "grid-cols-2",
  /** Media bandeja: las del equipo a un lado y las del partido al otro. */
  half: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 compact:grid-cols-3",
  /** Catálogo completo en el panel. */
  sheet: "grid-cols-2 sm:grid-cols-3",
};

/** Botones del catálogo: color por categoría y siempre con texto (DESIGN.md 0.5). */
function ActionButtons({
  types,
  onPick,
  more,
  moreLabel,
  disabled = false,
  layout,
}: {
  types: MatchActionType[];
  onPick: (type: MatchActionType) => void;
  more?: (() => void) | undefined;
  moreLabel: string;
  disabled?: boolean;
  layout: keyof typeof layoutClass;
}) {
  return (
    <div className={`grid gap-1.5 ${layoutClass[layout]}`}>
      {types.map((type) => {
        const badge = scoreBadge(type);
        return (
          <button
            key={type.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(type)}
            className={`flex min-h-12 items-center justify-between gap-2 rounded-field border px-3 py-1.5 text-left text-secondary leading-tight font-medium transition-colors disabled:opacity-50 compact:min-h-10 ${categoryClass[type.category]}`}
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
          className="flex min-h-12 items-center justify-center gap-1 rounded-field border border-dashed border-control px-3 text-secondary font-medium text-club-text disabled:opacity-50 compact:min-h-10"
        >
          <Icon.Plus size={16} aria-hidden="true" />
          {moreLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Las nueve zonas del medio campo de ataque, sobre la propia pista: la fila 1 pegada a la
 * portería rival y la columna 1 a la izquierda de quien ataca (la pista se mira desde el banquillo,
 * así que atacando hacia la derecha la columna 1 queda arriba). La mitad propia se oscurece; el
 * nombre del rival junto a su portería y la flecha de ataque ya dicen hacia dónde se tira.
 */
function ZoneOverlay({ flip, onPick }: { flip: boolean; onPick: (zone: MatchZone) => void }) {
  // El rectángulo de juego ocupa del 2,5 % al 97,5 % en horizontal y del 4 % al 96 % en vertical.
  const colWidth = 47.5 / 3;
  const rowHeight = 92 / 3;
  return (
    <>
      <div
        aria-hidden="true"
        className={`absolute inset-y-0 w-1/2 bg-black/50 ${flip ? "right-0" : "left-0"}`}
      />
      {MATCH_ZONES.map((zone, i) => {
        const row = Number(zone[1]);
        const col = Number(zone[3]);
        const fromMid = 3 - row;
        const left = flip ? 50 - (fromMid + 1) * colWidth : 50 + fromMid * colWidth;
        const top = 4 + (flip ? 3 - col : col - 1) * rowHeight;
        return (
          <button
            key={zone}
            type="button"
            aria-label={zone}
            onClick={() => onPick(zone)}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${colWidth}%`,
              height: `${rowHeight}%`,
            }}
            className="absolute grid place-items-center border border-white/60 bg-white/10 font-mono text-body text-white transition-colors hover:bg-white/30"
          >
            {i + 1}
          </button>
        );
      })}
    </>
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
          <Button action="save" disabled={!valid} onClick={() => onSave(draft)}>
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
              <Button
                action="delete"
                variant="tertiary"
                size="sm"
                onClick={() => remove(p.playerId)}
              >
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
                    action="add"
                    variant="secondary"
                    size="sm"
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
            action="save"
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

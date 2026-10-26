import { formatSeconds } from "@sportsmanager/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/intl";
import { Button, Card, Field, Input, PageHeader, Segmented } from "@/ui";

type Mode = "fortime" | "amrap" | "emom" | "tabata";

interface TimerConfig {
  /** For time: cap en minutos (0, sin cap). AMRAP: minutos. */
  minutes: number;
  /** EMOM: segundos de cada intervalo. Tabata: segundos de trabajo. */
  work: number;
  /** Tabata: segundos de descanso. */
  rest: number;
  /** EMOM y Tabata: rondas. */
  rounds: number;
}

const DEFAULTS: Record<Mode, TimerConfig> = {
  fortime: { minutes: 12, work: 60, rest: 0, rounds: 1 },
  amrap: { minutes: 12, work: 60, rest: 0, rounds: 1 },
  emom: { minutes: 0, work: 60, rest: 0, rounds: 10 },
  tabata: { minutes: 0, work: 20, rest: 10, rounds: 8 },
};

const PREP = 10;

type Phase = "prep" | "work" | "rest" | "done";

interface Frame {
  phase: Phase;
  /** Lo que se enseña en grande, en segundos. */
  display: number;
  /** Ronda en curso (EMOM y Tabata). */
  round: number;
  /** Segundos que quedan en la fase, para los pitidos. */
  left: number;
}

/** Dónde está el reloj a los `elapsed` segundos desde que se pulsó Iniciar. */
function frameAt(mode: Mode, config: TimerConfig, elapsed: number): Frame {
  if (elapsed < PREP) {
    return { phase: "prep", display: Math.ceil(PREP - elapsed), round: 0, left: PREP - elapsed };
  }
  const t = elapsed - PREP;
  if (mode === "fortime") {
    const cap = config.minutes * 60;
    if (cap > 0 && t >= cap) return { phase: "done", display: cap, round: 0, left: 0 };
    return { phase: "work", display: Math.floor(t), round: 0, left: cap > 0 ? cap - t : Infinity };
  }
  if (mode === "amrap") {
    const total = config.minutes * 60;
    if (t >= total) return { phase: "done", display: 0, round: 0, left: 0 };
    return { phase: "work", display: Math.ceil(total - t), round: 0, left: total - t };
  }
  if (mode === "emom") {
    const total = config.work * config.rounds;
    if (t >= total) return { phase: "done", display: 0, round: config.rounds, left: 0 };
    const round = Math.floor(t / config.work) + 1;
    const inside = t - (round - 1) * config.work;
    return {
      phase: "work",
      display: Math.ceil(config.work - inside),
      round,
      left: config.work - inside,
    };
  }
  const cycle = config.work + config.rest;
  const total = cycle * config.rounds - config.rest;
  if (t >= total) return { phase: "done", display: 0, round: config.rounds, left: 0 };
  const round = Math.floor(t / cycle) + 1;
  const inside = t - (round - 1) * cycle;
  return inside < config.work
    ? { phase: "work", display: Math.ceil(config.work - inside), round, left: config.work - inside }
    : {
        phase: "rest",
        display: Math.ceil(cycle - inside),
        round,
        left: cycle - inside,
      };
}

/** Pitidos con WebAudio: cortos en la cuenta atrás, largo al cambiar de fase y al acabar. */
function useBeeper() {
  const ctx = useRef<AudioContext | null>(null);
  const unlock = useCallback(() => {
    if (ctx.current || typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx.current = new Ctor();
  }, []);
  const beep = useCallback((long: boolean) => {
    const audio = ctx.current;
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = long ? 880 : 660;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + (long ? 0.6 : 0.15));
  }, []);
  return { unlock, beep };
}

/** Pantalla encendida mientras corre el reloj, si el navegador lo permite. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    nav.wakeLock
      ?.request("screen")
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [active]);
}

/**
 * Timer del box (ADR 0049): por tiempo con cap, AMRAP con contador de rondas, EMOM y Tabata. Diez
 * segundos de cuenta atrás, pitidos y la pantalla encendida. Funciona sin red: es solo del móvil.
 */
export function TimerPage() {
  const t = useT("fitness.athlete.timer");
  const [mode, setMode] = useState<Mode>("fortime");
  const [config, setConfig] = useState<TimerConfig>(DEFAULTS.fortime);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedTotal, setPausedTotal] = useState(0);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [rounds, setRounds] = useState(0);
  const { unlock, beep } = useBeeper();
  const lastBeep = useRef<string>("");

  const running = startedAt !== null && pausedAt === null && stoppedAt === null;
  useWakeLock(running);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  const reference = stoppedAt ?? pausedAt ?? now;
  const elapsed =
    startedAt === null ? 0 : Math.max(0, (reference - startedAt - pausedTotal) / 1000);
  const frame = startedAt === null ? null : frameAt(mode, config, elapsed);

  // Pitidos: 3, 2, 1 antes de cada cambio y uno largo al cambiar de fase.
  useEffect(() => {
    if (!running || !frame) return;
    const second = Math.ceil(frame.left);
    const key = `${frame.phase}-${frame.round}-${second}`;
    if (key === lastBeep.current) return;
    const previous = lastBeep.current;
    lastBeep.current = key;
    const phaseChanged = previous !== "" && !previous.startsWith(`${frame.phase}-${frame.round}-`);
    if (phaseChanged) beep(true);
    else if (second >= 1 && second <= 3 && Number.isFinite(frame.left)) beep(false);
  }, [running, frame, beep]);

  useEffect(() => {
    if (frame?.phase === "done" && stoppedAt === null && startedAt !== null) {
      setStoppedAt(Date.now());
    }
  }, [frame?.phase, stoppedAt, startedAt]);

  function start() {
    unlock();
    lastBeep.current = "";
    setRounds(0);
    setPausedTotal(0);
    setPausedAt(null);
    setStoppedAt(null);
    const at = Date.now();
    setNow(at);
    setStartedAt(at);
  }
  function pause() {
    setPausedAt(Date.now());
  }
  function resume() {
    if (pausedAt === null) return;
    setPausedTotal((p) => p + (Date.now() - pausedAt));
    setNow(Date.now());
    setPausedAt(null);
  }
  function reset() {
    setStartedAt(null);
    setPausedAt(null);
    setStoppedAt(null);
    setPausedTotal(0);
    setRounds(0);
  }
  function finish() {
    setStoppedAt(Date.now());
  }

  const modes: { key: Mode; label: string }[] = [
    { key: "fortime", label: t("modes.fortime") },
    { key: "amrap", label: t("modes.amrap") },
    { key: "emom", label: t("modes.emom") },
    { key: "tabata", label: t("modes.tabata") },
  ];
  const number = (
    key: keyof TimerConfig,
    label: string,
    min: number,
    max: number,
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      {(id, describedBy) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={config[key]}
          onChange={(e) =>
            setConfig({
              ...config,
              [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)),
            })
          }
        />
      )}
    </Field>
  );

  const phaseLabel = frame
    ? frame.phase === "prep"
      ? t("phase.prep")
      : frame.phase === "rest"
        ? t("phase.rest")
        : frame.phase === "done"
          ? t("phase.done")
          : t("phase.work")
    : t("phase.ready");
  const tone =
    frame?.phase === "rest"
      ? "bg-success-soft text-success"
      : frame?.phase === "prep"
        ? "bg-warning-soft text-warning"
        : frame?.phase === "done"
          ? "bg-raised text-ink"
          : "bg-club text-on-club";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {startedAt === null ? (
        <Card>
          <div className="flex flex-col gap-5">
            <Segmented
              label={t("mode")}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setConfig(DEFAULTS[m]);
              }}
              options={modes}
            />
            <p className="text-secondary text-muted">{t(`hints.${mode}`)}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {mode === "fortime" ? number("minutes", t("cap"), 0, 120, t("capHint")) : null}
              {mode === "amrap" ? number("minutes", t("minutes"), 1, 120) : null}
              {mode === "emom" ? (
                <>
                  {number("work", t("interval"), 10, 600)}
                  {number("rounds", t("rounds"), 1, 60)}
                </>
              ) : null}
              {mode === "tabata" ? (
                <>
                  {number("work", t("work"), 5, 600)}
                  {number("rest", t("rest"), 0, 600)}
                  {number("rounds", t("rounds"), 1, 60)}
                </>
              ) : null}
            </div>
            <Button size="md" action="activate" onClick={start} className="h-14 text-title3">
              {t("start")}
            </Button>
          </div>
        </Card>
      ) : (
        <section
          aria-label={t("clock")}
          className={`flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-card p-6 ${tone}`}
        >
          <span className="text-title3 uppercase tracking-wide" aria-live="polite">
            {phaseLabel}
            {frame && frame.round > 0 && frame.phase !== "prep"
              ? ` · ${t("roundOf", { round: frame.round, total: config.rounds })}`
              : ""}
          </span>
          <span
            role="timer"
            className="font-mono text-[clamp(4.5rem,22vw,12rem)] leading-none font-semibold tabular-nums"
          >
            {frame ? formatSeconds(frame.display) : "0:00"}
          </span>
          {mode === "fortime" && frame?.phase !== "prep" && config.minutes > 0 ? (
            <span className="text-body">{t("capAt", { minutes: config.minutes })}</span>
          ) : null}
          {mode === "amrap" && frame && frame.phase !== "prep" ? (
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-title2">{t("roundsDone", { count: rounds })}</span>
              {frame.phase !== "done" ? (
                <button
                  type="button"
                  onClick={() => setRounds((r) => r + 1)}
                  className="h-20 min-w-48 rounded-card bg-surface px-6 text-title2 font-semibold text-ink shadow-card"
                >
                  {t("addRound")}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3">
            {frame?.phase === "done" || stoppedAt !== null ? null : pausedAt === null ? (
              <Button variant="secondary" action="suspend" onClick={pause}>
                {t("pause")}
              </Button>
            ) : (
              <Button action="activate" onClick={resume}>
                {t("resume")}
              </Button>
            )}
            {mode === "fortime" && stoppedAt === null && frame?.phase === "work" ? (
              <Button action="finish" onClick={finish}>
                {t("finish")}
              </Button>
            ) : null}
            <Button variant="secondary" action="restore" onClick={reset}>
              {t("reset")}
            </Button>
          </div>
          {stoppedAt !== null && mode === "fortime" && frame ? (
            <p className="text-body">{t("finalTime", { time: formatSeconds(frame.display) })}</p>
          ) : null}
        </section>
      )}
    </div>
  );
}

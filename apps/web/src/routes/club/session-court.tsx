import type { SessionDetailResponse } from "@sportsmanager/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ContentChips,
  DrillAnimationPlayer,
  RestrictionTags,
  useLoadFormat,
  useSessionBlocks,
  useShortDate,
} from "@/components/training-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Button, EmptyState, Icon, IconButton } from "@/ui";
import { orderedItems, SessionGate, useItemFacts, useSessionDetail } from "./session";

/** Pantalla completa del navegador; donde no se puede, la vista ya ocupa toda la ventana. */
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
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // El navegador no lo permite: la vista ya ocupa toda la ventana.
    }
  }, []);
  return { supported, active, toggle };
}

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Modo pista (ADR 0039): la sesión en el móvil o la tablet, una tarea por pantalla, con letra
 * grande, la pizarra, los puntos clave y el cronómetro de la tarea. Ocupa toda la ventana, sin la
 * navegación del club; las flechas cambian de tarea y el espacio arranca o para el cronómetro.
 */
export function SessionCourtPage() {
  const { id = "" } = useParams();
  const detail = useSessionDetail(id);
  return <SessionGate query={detail}>{(data) => <Court data={data} />}</SessionGate>;
}

function Court({ data }: { data: SessionDetailResponse }) {
  const t = useT("session.court");
  const blocksT = useSessionBlocks(data.section.sportCode).label;
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const dates = useShortDate();
  const fmt = useLoadFormat();
  const facts = useItemFacts();
  const fullscreen = useFullscreen();
  const steps = orderedItems(data.items);
  const [index, setIndex] = useState(0);
  const item = steps[index];
  const [remaining, setRemaining] = useState(() => (steps[0]?.minutes ?? 0) * 60);
  const [running, setRunning] = useState(false);

  const go = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(steps.length - 1, to));
      setIndex(next);
      setRemaining((steps[next]?.minutes ?? 0) * 60);
      setRunning(false);
    },
    [steps],
  );

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // Al acabar el tiempo, el cronómetro se para y el móvil vibra (donde se puede).
  useEffect(() => {
    if (!running || remaining > 0) return;
    setRunning(false);
    if ("vibrate" in navigator) navigator.vibrate(400);
  }, [running, remaining]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Las flechas sobre la línea de tiempo de la pizarra la mueven a ella, no cambian de tarea.
      const inControl = (e.target as HTMLElement).closest("input, select, textarea");
      if (e.key === "ArrowRight" && !inControl) go(index + 1);
      else if (e.key === "ArrowLeft" && !inControl) go(index - 1);
      else if (e.key === " " && !(e.target as HTMLElement).closest("button, a, input, select")) {
        e.preventDefault();
        setRunning((r) => !r && remaining > 0);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, index, remaining]);

  const itemFacts = item ? facts(item, data.roster) : [];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-page text-ink">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <Link
          to={paths.session(data.session.id)}
          className="inline-flex h-11 items-center gap-1.5 rounded-control px-2 text-secondary font-medium text-muted no-underline hover:text-ink"
        >
          <Icon.X size={20} aria-hidden="true" />
          {t("exit")}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span className="truncate text-secondary text-muted">
            {data.session.team.name} · {dates.weekday(data.session.date)}
          </span>
          {item ? (
            <span className="truncate text-body font-semibold" aria-live="polite">
              {t("step", { current: index + 1, total: steps.length })} · {blocksT(item.block)}
            </span>
          ) : null}
        </div>
        {fullscreen.supported ? (
          <IconButton
            label={fullscreen.active ? t("exitFullscreen") : t("fullscreen")}
            onClick={() => void fullscreen.toggle()}
          >
            {fullscreen.active ? (
              <Icon.CornersIn size={22} aria-hidden="true" />
            ) : (
              <Icon.CornersOut size={22} aria-hidden="true" />
            )}
          </IconButton>
        ) : (
          <span className="w-11" />
        )}
      </header>

      {!item ? (
        <main className="grid flex-1 place-items-center p-4">
          <EmptyState icon={<Icon.ClipboardText weight="duotone" />} title={t("empty")} />
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="flex flex-col gap-3">
              {item.diagram ? (
                <DrillAnimationPlayer
                  key={item.id}
                  diagram={item.diagram}
                  audioUrl={item.audioUrl}
                  label={item.title}
                  className="max-h-[60vh]"
                />
              ) : (
                <div className="grid aspect-[2/1] place-items-center rounded-field bg-raised text-muted [&_svg]:size-12">
                  <Icon.SportIcons.Pista aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-display leading-tight">{item.title}</h1>
                <p className="font-mono text-title2 text-club-text">{fmt.minutes(item.minutes)}</p>
                {itemFacts.length > 0 ? (
                  <p className="text-title2 font-normal text-ink">{itemFacts.join(" · ")}</p>
                ) : null}
              </div>
              {item.coachingPoints ? (
                <section className="flex flex-col gap-1">
                  <h2 className="text-label font-semibold uppercase tracking-wide text-muted">
                    {t("coachingPoints")}
                  </h2>
                  <p className="whitespace-pre-line text-title2 font-normal">
                    {item.coachingPoints}
                  </p>
                </section>
              ) : null}
              {item.description ? (
                <section className="flex flex-col gap-1">
                  <h2 className="text-label font-semibold uppercase tracking-wide text-muted">
                    {t("description")}
                  </h2>
                  <p className="whitespace-pre-line text-body">{item.description}</p>
                </section>
              ) : null}
              {item.notes ? (
                <section className="flex flex-col gap-1">
                  <h2 className="text-label font-semibold uppercase tracking-wide text-muted">
                    {t("notes")}
                  </h2>
                  <p className="whitespace-pre-line text-body">{item.notes}</p>
                </section>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                <ContentChips ids={item.contentIds} contents={data.contents} />
                <RestrictionTags tags={item.restrictionTags} />
              </div>
            </div>
          </div>
        </main>
      )}

      {item ? (
        <footer className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-line bg-surface px-3 py-3">
          <Button
            variant="secondary"
            cta
            disabled={index === 0}
            onClick={() => go(index - 1)}
            icon={<Icon.ArrowLeft size={20} aria-hidden="true" />}
          >
            <span className="hidden sm:inline">{t("previous")}</span>
            <span className="sr-only sm:hidden">{t("previous")}</span>
          </Button>
          <div className="flex items-center gap-2">
            <span
              className={`min-w-24 text-center font-mono text-display ${remaining === 0 ? "text-danger" : "text-ink"}`}
              role="timer"
              aria-live="off"
              aria-label={remaining === 0 ? t("timeUp") : clock(remaining)}
            >
              {remaining === 0 ? t("timeUp") : clock(remaining)}
            </span>
            <IconButton
              label={running ? t("pause") : t("start")}
              disabled={remaining === 0}
              onClick={() => setRunning((r) => !r)}
              className="bg-club text-on-club hover:bg-club"
            >
              {running ? (
                <Icon.Pause size={22} weight="fill" aria-hidden="true" />
              ) : (
                <Icon.Play size={22} weight="fill" aria-hidden="true" />
              )}
            </IconButton>
            <IconButton
              label={t("reset")}
              onClick={() => {
                setRunning(false);
                setRemaining(item.minutes * 60);
              }}
            >
              <Icon.ArrowCounterClockwise size={22} aria-hidden="true" />
            </IconButton>
          </div>
          <Button
            cta
            disabled={index === steps.length - 1}
            onClick={() => go(index + 1)}
            icon={<Icon.ArrowRight size={20} aria-hidden="true" />}
          >
            <span className="hidden sm:inline">{t("next")}</span>
            <span className="sr-only sm:hidden">{t("next")}</span>
          </Button>
        </footer>
      ) : null}
      <p className="sr-only">{t("keyboardHint")}</p>
    </div>
  );
}

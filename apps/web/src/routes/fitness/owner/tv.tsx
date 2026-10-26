import {
  ClassesResponseSchema,
  LeaderboardResponseSchema,
  WorkoutsResponseSchema,
  formatSeconds,
  type WorkoutBlockView,
  type WorkoutView,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { useMovementName } from "@/components/fitness/workout-blocks";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { dayRange, fitnessKey, useClassTime } from "@/lib/fitness";
import { useT } from "@/lib/intl";
import { Crest, Icon } from "@/ui";

/** El bloque que se compite: el WOD con marcador, o el último bloque que lo tenga. */
function mainBlock(workout: WorkoutView | undefined): WorkoutBlockView | undefined {
  if (!workout) return undefined;
  const scored = workout.blocks.filter((b) => b.scoreType !== "none");
  return scored.find((b) => b.kind === "wod") ?? scored[scored.length - 1];
}

/**
 * La pantalla del box (ADR 0049) para la tele de la sala: el reloj, el WOD de hoy en grande, las
 * clases del día con sus plazas y la clasificación del WOD, que se refresca sola. Ocupa toda la
 * pantalla y no enseña nada personal más allá del nombre de quien sale en la clasificación.
 */
export function BoxTvPage() {
  const t = useT("fitness.owner.tv");
  const kinds = useT("fitness.common.blockKinds");
  const levels = useT("fitness.common.levels");
  const spots = useT("fitness.common.spots");
  const intl = useIntl();
  const navigate = useNavigate();
  const movementName = useMovementName();
  const { slug, branding } = useReadyClub();
  const paths = clubPaths(slug);
  const time = useClassTime();
  const today = time.today;
  const [now, setNow] = useState(() => new Date());
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const workouts = useQuery({
    queryKey: fitnessKey(slug, "tv", "workouts", today),
    queryFn: () =>
      apiFetch(`/api/org/workouts?from=${today}&to=${today}`, { schema: WorkoutsResponseSchema }),
    refetchInterval: 60_000,
  });
  const range = dayRange(time.timezone, today);
  const classes = useQuery({
    queryKey: fitnessKey(slug, "tv", "classes", today),
    queryFn: () =>
      apiFetch(`/api/org/classes?${new URLSearchParams(range)}`, { schema: ClassesResponseSchema }),
    refetchInterval: 60_000,
  });
  const published = (workouts.data?.workouts ?? []).filter((w) => w.status === "published");
  const workout = published.find((w) => w.id === picked) ?? published[0];
  const block = mainBlock(workout);
  const board = useQuery({
    queryKey: fitnessKey(slug, "tv", "leaderboard", block?.id),
    queryFn: () =>
      // Como la ve un atleta: en la tele del box no sale quien prefiere no salir.
      apiFetch(`/api/org/workouts/blocks/${block!.id}/leaderboard?public=1`, {
        schema: LeaderboardResponseSchema,
      }),
    enabled: Boolean(block),
    refetchInterval: 30_000,
  });
  const upcoming = (classes.data?.classes ?? []).filter(
    (c) => Date.parse(c.endsAt) > now.getTime(),
  );

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }
  function exit() {
    if (document.fullscreenElement) void document.exitFullscreen();
    void navigate(paths.home);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0d12] text-white">
      <div className="mx-auto flex min-h-full max-w-[1800px] flex-col gap-8 p-6 lg:p-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Crest name={branding.name} logoUrl={branding.logoUrl} size="lg" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-2xl font-semibold lg:text-3xl">{branding.name}</span>
              <span className="text-lg text-white/70 first-letter:uppercase">
                {time.day(today)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-5xl font-semibold tabular lg:text-6xl" aria-live="off">
              {intl.formatTime(now, {
                hour: "2-digit",
                minute: "2-digit",
                ...(time.timezone ? { timeZone: time.timezone } : {}),
              })}
            </span>
            <button
              type="button"
              onClick={fullscreen}
              aria-label={t("fullscreen")}
              title={t("fullscreen")}
              className="grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <Icon.CornersOut size={24} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={exit}
              aria-label={t("exit")}
              title={t("exit")}
              className="grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <Icon.X size={24} aria-hidden="true" />
            </button>
          </div>
        </header>

        {published.length > 1 ? (
          <div role="tablist" aria-label={t("pickWorkout")} className="flex flex-wrap gap-2">
            {published.map((w) => (
              <button
                key={w.id}
                type="button"
                role="tab"
                aria-selected={w.id === workout?.id}
                onClick={() => setPicked(w.id)}
                className={`rounded-full px-5 py-2 text-lg ${
                  w.id === workout?.id ? "bg-club text-on-club" : "bg-white/10 text-white"
                }`}
              >
                {w.team ? `${w.section.name} · ${w.team.name}` : w.section.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid flex-1 gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-6" aria-label={t("wod")}>
            {!workout ? (
              <div className="grid flex-1 place-items-center rounded-3xl bg-white/5 p-10 text-center">
                <div className="flex flex-col items-center gap-3">
                  <Icon.Barbell size={64} weight="duotone" aria-hidden="true" />
                  <p className="text-3xl font-semibold">{t("noWod")}</p>
                  <p className="text-xl text-white/60">{t("noWodHint")}</p>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-4xl font-bold lg:text-6xl">{workout.title ?? t("wodOfDay")}</h1>
                {workout.notes ? (
                  <p className="whitespace-pre-line text-xl text-white/70">{workout.notes}</p>
                ) : null}
                <div className="grid gap-6 2xl:grid-cols-2">
                  {workout.blocks.map((b) => (
                    <article
                      key={b.id}
                      className={`flex flex-col gap-3 rounded-3xl p-6 ${
                        b.id === block?.id ? "bg-white/10 ring-2 ring-white/40" : "bg-white/5"
                      }`}
                    >
                      <header className="flex items-center gap-4">
                        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-club font-mono text-3xl font-bold text-on-club">
                          {b.label}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-lg uppercase tracking-wide text-white/60">
                            {kinds(b.kind)}
                            {b.timeCapSeconds ? ` · cap ${formatSeconds(b.timeCapSeconds)}` : ""}
                          </span>
                          <span className="text-3xl font-semibold">{b.title}</span>
                        </span>
                      </header>
                      {b.description ? (
                        <p className="whitespace-pre-line font-mono text-2xl leading-snug lg:text-3xl">
                          {b.description}
                        </p>
                      ) : null}
                      {b.movement ? (
                        <p className="text-xl text-white/70">
                          {movementName(b.movement.code)}
                          {b.percent ? ` · ${b.percent} %` : ""}
                          {b.rmReps ? ` · ${b.rmReps}RM` : ""}
                        </p>
                      ) : null}
                      {(
                        [
                          ["scaled", b.scaled],
                          ["rx", b.rx],
                          ["rx_plus", b.rxPlus],
                        ] as const
                      )
                        .filter(([, text]) => Boolean(text))
                        .map(([level, text]) => (
                          <p key={level} className="text-xl">
                            <span className="mr-3 font-semibold">{levels(level)}</span>
                            <span className="text-white/70">{text}</span>
                          </p>
                        ))}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <aside className="flex flex-col gap-8">
            <section className="flex flex-col gap-4 rounded-3xl bg-white/5 p-6">
              <h2 className="text-2xl font-semibold">{t("classes")}</h2>
              {upcoming.length === 0 ? (
                <p className="text-xl text-white/60">{t("noClasses")}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {upcoming.slice(0, 8).map((c) => {
                    const left = c.capacity === null ? null : Math.max(0, c.capacity - c.booked);
                    return (
                      <li key={c.id} className="flex items-center gap-4">
                        <span className="w-24 shrink-0 font-mono text-2xl font-semibold">
                          {time.hour(c.startsAt)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-xl">{c.team?.name ?? c.title}</span>
                          {c.coach ? (
                            <span className="text-lg text-white/60">
                              {c.coach.name.split(" ")[0]}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-lg ${
                            left === 0 ? "bg-white/10 text-white/60" : "bg-club text-on-club"
                          }`}
                        >
                          {left === null
                            ? spots("open")
                            : left === 0
                              ? spots("full")
                              : spots("left", { count: left })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {block ? (
              <section className="flex flex-col gap-4 rounded-3xl bg-white/5 p-6">
                <h2 className="text-2xl font-semibold">
                  {t("leaderboard", { block: `${block.label} · ${block.title}` })}
                </h2>
                {(board.data?.entries ?? []).length === 0 ? (
                  <p className="text-xl text-white/60">{t("noResults")}</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {(board.data?.entries ?? []).slice(0, 12).map((e) => (
                      <li key={e.playerId} className="flex items-center gap-4 text-xl">
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-full font-mono font-bold ${
                            e.rank === 1 ? "bg-club text-on-club" : "bg-white/10"
                          }`}
                        >
                          {e.rank}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{e.name}</span>
                        <span className="text-lg text-white/60">{levels(e.level)}</span>
                        <span className="w-28 shrink-0 text-right font-mono font-semibold">
                          {e.display}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {board.data && board.data.hiddenCount > 0 ? (
                  <p className="text-lg text-white/50">
                    {t("hidden", { count: board.data.hiddenCount })}
                  </p>
                ) : null}
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

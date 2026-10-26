import {
  BENCHMARK_FAMILIES,
  BENCHMARKS,
  type BenchmarkEntry,
  type BenchmarkFamily,
} from "@sportsmanager/shared";
import { useState } from "react";
import { FilterChips, fold } from "@/components/fitness/exercise-ui";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useLocale, useT } from "@/lib/intl";
import { Button, ButtonLink, EmptyState, Field, Icon, Input, StatusChip } from "@/ui";

/** El formato en palabras: "Por tiempo · cap 15 min", "AMRAP 20 min", "Repeticiones". */
function useFormatLabel() {
  const t = useT("fitness.exercises.workouts.format");
  const scoreTypes = useT("fitness.common.scoreTypes");
  return (b: BenchmarkEntry) => {
    const minutes = b.minutes;
    switch (b.scoreType) {
      case "time":
        return minutes ? t("timeCap", { minutes }) : t("time");
      case "rounds_reps":
        return minutes ? t("amrap", { minutes }) : scoreTypes("rounds_reps");
      case "reps":
        return minutes ? t("repsIn", { minutes }) : scoreTypes("reps");
      default:
        return scoreTypes(b.scoreType);
    }
  };
}

/**
 * Los workouts de la biblioteca: los benchmarks del catálogo (Girls, Heroes, Open e híbridos),
 * los mismos que el editor del WOD. Los ve todo el box; quien programa los lleva a un día.
 */
export function WorkoutLibrary() {
  const t = useT("fitness.exercises.workouts");
  const library = useT("fitness.exercises");
  const families = useT("fitness.staff.editor.benchmarks.family");
  const { locale } = useLocale();
  const { slug, org } = useReadyClub();
  const formatLabel = useFormatLabel();
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<BenchmarkFamily | null>(null);

  const canProgram =
    org.actor.permissions.includes("org.training.write") ||
    org.actor.permissions.includes("org.training.write_own");
  const needle = fold(search.trim());
  const visible = BENCHMARKS.filter(
    (b) =>
      (!family || b.family === family) &&
      (!needle || fold(b.name).includes(needle) || fold(b.description[locale]).includes(needle)),
  );
  const filtered = Boolean(needle || family);

  return (
    <div className="flex flex-col gap-5">
      <Field label={library("search")}>
        {(id) => (
          <Input
            id={id}
            type="search"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </Field>

      <FilterChips
        label={t("filters")}
        allLabel={library("all")}
        total={BENCHMARKS.length}
        options={BENCHMARK_FAMILIES.map((f) => ({
          key: f,
          label: families(f),
          count: BENCHMARKS.filter((b) => b.family === f).length,
        }))}
        selected={family}
        onChange={setFamily}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<Icon.Medal weight="duotone" />}
          title={t("noMatch")}
          action={
            filtered ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setFamily(null);
                }}
              >
                {library("clearFilters")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-secondary text-muted">{t("count", { count: visible.length })}</p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((b) => (
              <li
                key={b.code}
                className="flex h-full flex-col gap-3 rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border"
              >
                <span className="flex items-start justify-between gap-3">
                  <h3 className="text-title3 text-ink">{b.name}</h3>
                  <StatusChip kind="neutral">{families(b.family)}</StatusChip>
                </span>
                <p className="text-body text-ink">{b.description[locale]}</p>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-label text-muted">
                    <Icon.Timer size={14} aria-hidden="true" />
                    {formatLabel(b)}
                  </span>
                  {canProgram ? (
                    <ButtonLink
                      to={`${clubPaths(slug).workoutNew}?benchmark=${b.code}`}
                      variant="secondary"
                      size="sm"
                      icon={<Icon.CalendarBlank size={18} aria-hidden="true" />}
                      aria-label={t("programLabel", { name: b.name })}
                    >
                      {t("program")}
                    </ButtonLink>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

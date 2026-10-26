import {
  BENCHMARKS,
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  type Exercise,
  type ExerciseCategory,
  type ExerciseEquipment,
} from "@sportsmanager/shared";
import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import {
  ExerciseCard,
  ExerciseDetailSheet,
  ExerciseFormSheet,
  FilterChips,
  fold,
  useExercises,
} from "@/components/fitness/exercise-ui";
import { WorkoutLibrary } from "@/components/fitness/workout-library";
import { errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, Button, EmptyState, Field, Icon, Input, PageHeader, Select, Tabs } from "@/ui";

type Tab = "exercises" | "workouts";

/**
 * Biblioteca del box (ADR 0050): una sola pantalla para todos, con dos pestañas. En Ejercicios, el
 * atleta busca y repasa cómo se hace un ejercicio antes de la clase; el coach y el dueño, además,
 * la escriben. Sin pizarra ni campos de deporte de equipo: categoría, material, cómo se hace,
 * puntos clave, errores comunes, escalados y vídeo. En Workouts, los benchmarks del catálogo.
 * La pestaña va en la dirección (`?tab=workouts`) para poder enlazarla.
 */
export function ExercisesPage() {
  const t = useT("fitness.exercises");
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "workouts" ? "workouts" : "exercises";
  const categories = useT("fitness.exercises.categories");
  const equipmentLabel = useT("fitness.exercises.equipment");
  const errors = useT("errors");
  const [showArchived, setShowArchived] = useState(false);
  const query = useExercises(showArchived);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const [equipment, setEquipment] = useState<ExerciseEquipment | "">("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exercise | "new" | null>(null);

  const all = useMemo(() => query.data?.exercises ?? [], [query.data]);
  const canWrite = query.data?.canWrite ?? false;
  const needle = fold(search.trim());
  const visible = all.filter(
    (e) =>
      (!category || e.category === category) &&
      (!equipment || e.equipment.includes(equipment)) &&
      (!needle || fold(e.name).includes(needle) || fold(e.description ?? "").includes(needle)),
  );
  const counts = new Map<ExerciseCategory, number>();
  for (const e of all) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  const usedEquipment = EXERCISE_EQUIPMENT.filter((code) =>
    all.some((e) => e.equipment.includes(code)),
  );
  const filtered = Boolean(needle || category || equipment);
  const open = all.find((e) => e.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={tab === "workouts" ? t("workouts.description") : t("description")}
        actions={
          canWrite && tab === "exercises" ? (
            <Button action="add" onClick={() => setEditing("new")}>
              {t("new")}
            </Button>
          ) : undefined
        }
      />

      <Tabs<Tab>
        label={t("tabs.label")}
        selected={tab}
        onChange={(next) => setParams(next === "workouts" ? { tab: next } : {}, { replace: true })}
        items={[
          {
            key: "exercises",
            label: t("tabs.exercises"),
            count: query.data ? all.length : undefined,
          },
          { key: "workouts", label: t("tabs.workouts"), count: BENCHMARKS.length },
        ]}
      />

      {tab === "workouts" ? <WorkoutLibrary /> : null}

      {tab === "exercises" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Field label={t("search")}>
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
            {usedEquipment.length > 0 ? (
              <Field label={t("equipmentFilter")}>
                {(id) => (
                  <Select
                    id={id}
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value as ExerciseEquipment | "")}
                  >
                    <option value="">{t("equipmentAll")}</option>
                    {usedEquipment.map((code) => (
                      <option key={code} value={code}>
                        {equipmentLabel(code)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
          </div>

          <FilterChips
            label={t("filters")}
            allLabel={t("all")}
            total={all.length}
            options={EXERCISE_CATEGORIES.filter((c) => counts.has(c)).map((c) => ({
              key: c,
              label: categories(c),
              count: counts.get(c) ?? 0,
            }))}
            selected={category}
            onChange={setCategory}
          />

          {canWrite ? (
            <label className="flex items-center gap-2 text-secondary text-ink">
              <input
                type="checkbox"
                className="size-5 accent-(--club-fill)"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              {t("showArchived")}
            </label>
          ) : null}

          {query.isPending ? (
            <div className="h-48 animate-pulse rounded-card bg-raised" aria-busy="true" />
          ) : query.isError ? (
            <Alert kind="error" title={t("loadError")}>
              {errors(errorKey(query.error))}
            </Alert>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Icon.Target weight="duotone" />}
              title={all.length === 0 ? t("emptyTitle") : t("noMatch")}
              description={
                all.length === 0 ? (canWrite ? t("emptyHintWriter") : t("emptyHint")) : undefined
              }
              action={
                filtered ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setCategory(null);
                      setEquipment("");
                    }}
                  >
                    {t("clearFilters")}
                  </Button>
                ) : canWrite && all.length === 0 ? (
                  <Button action="add" onClick={() => setEditing("new")}>
                    {t("new")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <p className="text-secondary text-muted">{t("count", { count: visible.length })}</p>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((exercise) => (
                  <ExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    onOpen={() => setOpenId(exercise.id)}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      ) : null}

      {open && !editing ? (
        <ExerciseDetailSheet
          exercise={open}
          canWrite={canWrite}
          onEdit={() => setEditing(open)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
      {editing ? (
        <ExerciseFormSheet
          exercise={editing === "new" ? null : editing}
          sections={query.data?.sections ?? []}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setOpenId(saved.id);
          }}
        />
      ) : null}
    </div>
  );
}

/** La librería de antes (ADR 0049) es ahora la biblioteca de ejercicios. */
export function LibraryRedirect() {
  const { slug } = useReadyClub();
  return <Navigate to={clubPaths(slug).exercises} replace />;
}

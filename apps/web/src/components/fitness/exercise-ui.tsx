import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  ExerciseCreateSchema,
  ExerciseResponseSchema,
  ExercisesResponseSchema,
  ExerciseUpdateSchema,
  MOVEMENTS,
  exerciseEmbedUrl,
  movementByCode,
  type Exercise,
  type ExerciseCategory,
  type ExerciseEquipment,
} from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { fitnessKey, useInvalidateFitness } from "@/lib/fitness";
import { useLocale, useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Field,
  Icon,
  Input,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

/** La biblioteca del box (ADR 0050): con los archivados solo si los pide quien escribe. */
export function useExercises(includeArchived: boolean) {
  const { slug } = useReadyClub();
  return useQuery({
    queryKey: fitnessKey(slug, "exercises", includeArchived ? "all" : "active"),
    queryFn: () =>
      apiFetch(`/api/org/exercises${includeArchived ? "?archived=1" : ""}`, {
        schema: ExercisesResponseSchema,
      }),
  });
}

/** Sin tildes ni mayúsculas, para buscar "sentadilla" y encontrar "Sentadilla". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Un texto de varias líneas como lista: cada línea, un punto. */
function Lines({ text }: { text: string }) {
  const items = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (items.length <= 1) return <p className="whitespace-pre-line text-body text-ink">{text}</p>;
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink marker:text-muted">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-label uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Nombre del movimiento del catálogo en el idioma de quien mira. */
function useMovementLabel() {
  const { locale } = useLocale();
  return (code: string | null) => {
    const m = movementByCode(code);
    return m ? m.name[locale] : null;
  };
}

/** Fichas de filtro con su recuento: "Todos" primero y luego una por opción. */
export function FilterChips<K extends string>({
  label,
  allLabel,
  total,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  total: number;
  options: { key: K; label: string; count: number }[];
  selected: K | null;
  onChange: (key: K | null) => void;
}) {
  const chips = [{ key: null, label: allLabel, count: total }, ...options];
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {chips.map((c) => {
        const active = selected === c.key;
        return (
          <button
            key={c.key ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c.key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-chip px-3 text-secondary transition-colors ${
              active ? "bg-club text-on-club" : "bg-surface text-ink shadow-card hover:bg-raised"
            }`}
          >
            {c.label}
            <span className={`font-mono text-label ${active ? "" : "text-muted"}`}>{c.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Una tarjeta de la biblioteca: se abre entera con un toque. */
export function ExerciseCard({ exercise, onOpen }: { exercise: Exercise; onOpen: () => void }) {
  const t = useT("fitness.exercises");
  const categories = useT("fitness.exercises.categories");
  const equipment = useT("fitness.exercises.equipment");
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`flex h-full w-full flex-col gap-3 rounded-card bg-surface p-4 text-left shadow-card transition-colors hover:bg-raised precisa:border precisa:border-border ${
          exercise.status === "archived" ? "opacity-60" : ""
        }`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-title3 text-ink">{exercise.name}</span>
          <StatusChip kind="neutral">{categories(exercise.category)}</StatusChip>
        </span>
        {exercise.equipment.length > 0 ? (
          <span className="text-secondary text-muted">
            {exercise.equipment.map((e) => equipment(e)).join(" · ")}
          </span>
        ) : null}
        <span className="mt-auto flex flex-wrap items-center gap-2">
          {exercise.videoUrl ? (
            <span className="inline-flex items-center gap-1 text-label text-club-text">
              <Icon.Play size={14} aria-hidden="true" />
              {t("card.video")}
            </span>
          ) : null}
          {exercise.movementCode ? (
            <span className="inline-flex items-center gap-1 text-label text-muted">
              <Icon.Barbell size={14} aria-hidden="true" />
              {t("card.linked")}
            </span>
          ) : null}
          {exercise.section ? (
            <span className="text-label text-muted">{exercise.section.name}</span>
          ) : null}
          {exercise.status === "archived" ? (
            <StatusChip kind="warning">{t("card.archived")}</StatusChip>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** El ejercicio entero: vídeo, cómo se hace, puntos clave, errores y escalados. */
export function ExerciseDetailSheet({
  exercise,
  canWrite,
  onEdit,
  onClose,
}: {
  exercise: Exercise;
  canWrite: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const t = useT("fitness.exercises.detail");
  const categories = useT("fitness.exercises.categories");
  const equipment = useT("fitness.exercises.equipment");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const movementLabel = useMovementLabel();
  const [busy, setBusy] = useState(false);
  const embed = exerciseEmbedUrl(exercise.videoUrl);
  const movement = movementLabel(exercise.movementCode);
  const empty =
    !exercise.description &&
    !exercise.coachingPoints &&
    !exercise.commonFaults &&
    !exercise.scaling;

  async function setStatus(status: Exercise["status"]) {
    setBusy(true);
    try {
      await apiFetch(`/api/org/exercises/${exercise.id}`, {
        method: "PATCH",
        body: { status },
        schema: ExerciseResponseSchema,
      });
      toast("success", t(status === "archived" ? "archived" : "restored", { name: exercise.name }));
      void invalidate();
      onClose();
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
      closeLabel={t("close")}
      title={exercise.name}
      description={[
        categories(exercise.category),
        ...exercise.equipment.map((e) => equipment(e)),
        exercise.section?.name,
      ]
        .filter(Boolean)
        .join(" · ")}
      footer={
        canWrite ? (
          <>
            {exercise.status === "archived" ? (
              <Button
                variant="secondary"
                action="restore"
                loading={busy}
                onClick={() => void setStatus("active")}
              >
                {t("restore")}
              </Button>
            ) : (
              <Button
                variant="ghost-danger"
                action="archive"
                loading={busy}
                onClick={() => void setStatus("archived")}
              >
                {t("archive")}
              </Button>
            )}
            <Button action="edit" onClick={onEdit}>
              {t("edit")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t("close")}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {embed ? (
          <div className="aspect-video overflow-hidden rounded-field bg-raised">
            <iframe
              className="size-full"
              src={embed}
              title={t("videoTitle", { name: exercise.name })}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        ) : exercise.videoUrl ? (
          <ButtonLink
            to={exercise.videoUrl}
            external
            variant="secondary"
            icon={<Icon.Play size={18} aria-hidden="true" />}
          >
            {t("watch")}
          </ButtonLink>
        ) : null}
        {exercise.description ? (
          <DetailBlock title={t("how")}>
            <p className="whitespace-pre-line text-body text-ink">{exercise.description}</p>
          </DetailBlock>
        ) : null}
        {exercise.coachingPoints ? (
          <DetailBlock title={t("points")}>
            <Lines text={exercise.coachingPoints} />
          </DetailBlock>
        ) : null}
        {exercise.commonFaults ? (
          <DetailBlock title={t("faults")}>
            <Lines text={exercise.commonFaults} />
          </DetailBlock>
        ) : null}
        {exercise.scaling ? (
          <DetailBlock title={t("scaling")}>
            <Lines text={exercise.scaling} />
          </DetailBlock>
        ) : null}
        {empty && !exercise.videoUrl ? (
          <p className="text-body text-muted">{t("nothing")}</p>
        ) : null}
        {movement ? (
          <p className="flex items-start gap-2 rounded-field bg-club-soft px-3 py-2 text-secondary text-club-soft-text">
            <Icon.Barbell size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t("linked", { movement })}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

const textareaClass =
  "w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none " +
  "focus:border-2 focus:border-club focus:shadow-[0_0_0_4px_var(--club-soft)] aria-invalid:border-2 aria-invalid:border-danger";

/** Un chip que se marca y se desmarca (categoría o material). */
function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-chip px-3 text-secondary transition-colors ${
        selected ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-page"
      }`}
    >
      {selected ? <Icon.Check size={14} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/**
 * Alta y edición de un ejercicio: un formulario corto, sin nada de deporte de equipo. Lo que no
 * se rellena no sale en la ficha.
 */
export function ExerciseFormSheet({
  exercise,
  sections,
  onClose,
  onSaved,
}: {
  exercise: Exercise | null;
  sections: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (exercise: Exercise) => void;
}) {
  const t = useT("fitness.exercises.form");
  const categories = useT("fitness.exercises.categories");
  const equipmentLabel = useT("fitness.exercises.equipment");
  const errors = useT("errors");
  const toast = useToast();
  const invalidate = useInvalidateFitness();
  const { locale } = useLocale();
  const [name, setName] = useState(exercise?.name ?? "");
  const [category, setCategory] = useState<ExerciseCategory>(exercise?.category ?? "strength");
  const [equipment, setEquipment] = useState<ExerciseEquipment[]>(exercise?.equipment ?? []);
  const [movementCode, setMovementCode] = useState(exercise?.movementCode ?? "");
  const [sectionId, setSectionId] = useState(exercise?.section?.id ?? "");
  const [description, setDescription] = useState(exercise?.description ?? "");
  const [coachingPoints, setCoachingPoints] = useState(exercise?.coachingPoints ?? "");
  const [commonFaults, setCommonFaults] = useState(exercise?.commonFaults ?? "");
  const [scaling, setScaling] = useState(exercise?.scaling ?? "");
  const [videoUrl, setVideoUrl] = useState(exercise?.videoUrl ?? "");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; videoUrl?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (code: ExerciseEquipment) =>
    setEquipment((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      name,
      category,
      equipment: EXERCISE_EQUIPMENT.filter((c) => equipment.includes(c)),
      movementCode: movementCode || null,
      sectionId: sectionId || null,
      description: description.trim() || null,
      coachingPoints: coachingPoints.trim() || null,
      commonFaults: commonFaults.trim() || null,
      scaling: scaling.trim() || null,
      videoUrl: videoUrl.trim() || null,
    };
    const parsed = exercise
      ? ExerciseUpdateSchema.safeParse(body)
      : ExerciseCreateSchema.safeParse(body);
    if (!parsed.success) {
      const paths = new Set(parsed.error.issues.map((i) => i.path[0]));
      setFieldErrors({
        ...(paths.has("name") ? { name: t("nameRequired") } : {}),
        ...(paths.has("videoUrl") ? { videoUrl: t("videoInvalid") } : {}),
      });
      setError(t("invalid"));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const res = await apiFetch(
        exercise ? `/api/org/exercises/${exercise.id}` : "/api/org/exercises",
        {
          method: exercise ? "PATCH" : "POST",
          body: parsed.data,
          schema: ExerciseResponseSchema,
        },
      );
      toast("success", exercise ? t("saved") : t("created", { name: res.exercise.name }));
      void invalidate();
      onSaved(res.exercise);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setFieldErrors({ name: t("nameTaken") });
        setError(null);
      } else setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const area = (
    label: string,
    hint: string | undefined,
    value: string,
    set: (v: string) => void,
    rows = 4,
  ) => (
    <Field label={label} hint={hint}>
      {(id, describedBy) => (
        <textarea
          id={id}
          rows={rows}
          maxLength={2000}
          aria-describedby={describedBy}
          className={textareaClass}
          value={value}
          onChange={(e) => set(e.target.value)}
        />
      )}
    </Field>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("cancel")}
      title={exercise ? t("titleEdit", { name: exercise.name }) : t("titleNew")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="exercise-form"
            action={exercise ? "save" : "add"}
            loading={busy}
          >
            {exercise ? t("save") : t("create")}
          </Button>
        </>
      }
    >
      <form id="exercise-form" className="flex flex-col gap-5" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")} error={fieldErrors.name}>
          {(id, describedBy) => (
            <Input
              id={id}
              required
              maxLength={80}
              placeholder={t("namePlaceholder")}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={describedBy}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-secondary font-medium text-ink">{t("category")}</legend>
          <div className="flex flex-wrap gap-2">
            {EXERCISE_CATEGORIES.map((c) => (
              <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
                {categories(c)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-secondary font-medium text-ink">{t("equipment")}</legend>
          <p className="text-secondary text-muted">{t("equipmentHint")}</p>
          <div className="flex flex-wrap gap-2">
            {EXERCISE_EQUIPMENT.map((code) => (
              <Chip key={code} selected={equipment.includes(code)} onClick={() => toggle(code)}>
                {equipmentLabel(code)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("movement")} hint={t("movementHint")}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={movementCode}
                onChange={(e) => setMovementCode(e.target.value)}
              >
                <option value="">{t("movementNone")}</option>
                {MOVEMENTS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name[locale]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {sections.length > 1 ? (
            <Field label={t("section")}>
              {(id) => (
                <Select id={id} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                  <option value="">{t("sectionAll")}</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
        </div>

        {area(t("how"), t("howHint"), description, setDescription, 3)}
        {area(t("points"), t("pointsHint"), coachingPoints, setCoachingPoints)}
        {area(t("faults"), t("faultsHint"), commonFaults, setCommonFaults)}
        {area(t("scaling"), t("scalingHint"), scaling, setScaling)}

        <Field label={t("video")} hint={t("videoHint")} error={fieldErrors.videoUrl}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="url"
              inputMode="url"
              placeholder="https://"
              aria-invalid={fieldErrors.videoUrl ? true : undefined}
              aria-describedby={describedBy}
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          )}
        </Field>

        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

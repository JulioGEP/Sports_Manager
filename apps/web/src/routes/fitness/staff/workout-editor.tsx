import {
  addDays,
  AI_FAILURES,
  AiWodGenerationResponseSchema,
  benchmarkByCode,
  DAY_ROLE_INFO,
  DAY_ROLES,
  MOVEMENTS,
  TIME_DOMAINS,
  WorkoutResponseSchema,
  WorkoutUpsertSchema,
  type AiWodGenerationResponse,
  type DayRole,
  type TimeDomain,
  type WorkoutBlockKind,
  type WorkoutView,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import {
  AddBlockBar,
  AutoTextarea,
  BenchmarkSheet,
  BlockEditor,
  ScheduleSheet,
  type BlockErrors,
} from "@/components/fitness/programming-blocks";
import {
  benchmarkBlock,
  draftOf,
  emptyBlock,
  inputOf,
  MINUTES_OPTIONAL,
  MINUTES_REQUIRED,
  minutesToSeconds,
  newKey,
  previewOf,
  withKind,
  type BlockDraft,
} from "@/components/fitness/programming-model";
import { useExercises } from "@/components/fitness/exercise-ui";
import { RoleChip, usePlanNames } from "@/components/fitness/planning-ui";
import { useWorkoutState } from "@/components/fitness/programming-week";
import { useStaffError } from "@/components/fitness/staff-ui";
import { blockInputOf, planFieldsOf } from "@/components/fitness/staff-workout";
import { useMovementName, WorkoutBlocks } from "@/components/fitness/workout-blocks";
import { localToIso } from "@/lib/agenda";
import { ApiClientError, apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import {
  fitnessKey,
  useClassTime,
  useClassTypes,
  useInvalidateFitness,
  useWorkout,
  useWorkouts,
} from "@/lib/fitness";
import { useLocale, useT } from "@/lib/intl";
import { useMediaQuery } from "@/lib/media";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Icon,
  IconButton,
  Input,
  Menu,
  MenuItem,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  StatusChip,
  useToast,
} from "@/ui";

/** Lo que se edita del día; los bloques, aparte, en `BlockDraft`. */
interface Draft {
  sectionId: string;
  teamId: string;
  onDate: string;
  title: string;
  notes: string;
  blocks: BlockDraft[];
  /** Planificación (ADR 0053): el plan y la semana, el papel del día, la intención y el porqué. */
  planId: string | null;
  planWeek: number | null;
  dayRole: DayRole | null;
  intentDomain: TimeDomain | null;
  intentEffort: number | null;
  intentFeel: string;
  why: string;
  /** Sesión de un plan propio (ADR 0054): la ven sus atletas en vez del WOD del box. */
  specific: boolean;
}

/** Lo que el servidor tiene guardado de cómo se publica. */
interface Saved {
  status: "draft" | "published";
  publishAt: string | null;
  visible: boolean;
}

/** El día tal cual, sin las claves de los bloques: para saber si hay cambios sin guardar. */
const fingerprint = (d: Draft) =>
  JSON.stringify({ ...d, blocks: d.blocks.map(({ key: _key, ...rest }) => rest) });

/** A partir de aquí, el estado va en la barra de abajo; en móvil, arriba junto al día. */
const WIDE_QUERY = "(min-width: 640px)";
const orNull = (text: string) => (text.trim() ? text.trim() : null);

/**
 * Un WOD nuevo que se escribe desde la semana del plan: llega con su plan, su semana, su papel y,
 * si el plan es propio (`own=1`), como sesión de ese plan.
 */
function fromPlanParams(params: URLSearchParams) {
  const role = params.get("role");
  const dayRole =
    role && (DAY_ROLES as readonly string[]).includes(role) ? (role as DayRole) : null;
  const week = Number(params.get("week"));
  const info = dayRole ? DAY_ROLE_INFO[dayRole] : null;
  return {
    planId: params.get("plan"),
    planWeek: Number.isInteger(week) && week > 0 ? week : null,
    dayRole,
    intentDomain: info?.domain ?? null,
    intentEffort: info?.effort ?? null,
    intentFeel: "",
    why: "",
    specific: params.get("own") === "1",
  };
}

/**
 * El WOD de un día (ADR 0050): a la izquierda se escribe, a la derecha se ve como lo verá el
 * atleta. Cada bloque se piensa como lo piensa un coach (tipo, pizarra y formato) y la publicación
 * vive en una barra fija abajo con su estado en palabras. La IA puede proponerlo entero: se revisa
 * aquí y solo se guarda cuando se guarda.
 */
export function WorkoutEditorPage() {
  const { id } = useParams();
  const t = useT("fitness.staff.editor");
  const c = useT("fitness.common");
  const nav = useT("fitness.common.nav");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const workout = useWorkout(id);
  if (id && workout.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          backTo={paths.programming}
          backLabel={nav("programming")}
          title={t("titleEdit")}
        />
        <Alert kind="error">{t("notFound")}</Alert>
      </div>
    );
  }
  if (id && !workout.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  return <Editor key={id ?? "new"} existing={workout.data?.workout ?? null} />;
}

function Editor({ existing }: { existing: WorkoutView | null }) {
  const t = useT("fitness.staff.editor");
  const ai = useT("fitness.staff.editor.ai");
  const c = useT("fitness.common");
  const nav = useT("fitness.common.nav");
  const kinds = useT("fitness.common.blockKinds");
  const { locale } = useLocale();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const time = useClassTime();
  const toast = useToast();
  const client = useQueryClient();
  const invalidate = useInvalidateFitness();
  const errorText = useStaffError();
  const classTypes = useClassTypes();
  const movementName = useMovementName();
  const stateOf = useWorkoutState();
  const planNames = usePlanNames();
  const intentT = useT("fitness.staff.editor.intent");
  const library = useExercises(false);
  const exercises = useMemo(
    () =>
      (library.data?.exercises ?? [])
        .filter((e) => e.status === "active")
        .map((e) => ({ id: e.id, name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [library.data],
  );

  // `?benchmark=fran` llega desde la biblioteca de workouts con el WOD elegido; `?benchmark=1`, a elegirlo.
  const preset = benchmarkByCode(params.get("benchmark"));
  const initial = useMemo<Draft>(
    () =>
      existing
        ? {
            sectionId: existing.section.id,
            teamId: existing.team?.id ?? "",
            onDate: existing.onDate,
            title: existing.title ?? "",
            notes: existing.notes ?? "",
            blocks: existing.blocks.map((b) => draftOf(blockInputOf(b))),
            ...planFieldsOf(existing),
            intentFeel: existing.intent?.feel ?? "",
            why: existing.why.join("\n"),
          }
        : {
            sectionId: params.get("section") ?? "",
            teamId: params.get("team") ?? "",
            onDate: params.get("date") ?? time.today,
            title: "",
            notes: "",
            blocks: preset
              ? [{ ...emptyBlock("wod"), ...benchmarkBlock(preset, locale) }]
              : params.get("benchmark")
                ? [emptyBlock("wod")]
                : [],
            ...fromPlanParams(params),
          },
    // El borrador nace una vez por WOD: el editor se monta con `key` por id.
    [existing],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [baseline, setBaseline] = useState(() => fingerprint(initial));
  const [saved, setSaved] = useState<Saved | null>(
    existing
      ? { status: existing.status, publishAt: existing.publishAt, visible: existing.visible }
      : null,
  );
  const [blockErrors, setBlockErrors] = useState<Record<string, BlockErrors>>({});
  const [topErrors, setTopErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [showNotes, setShowNotes] = useState(Boolean(initial.notes));
  const [showMore, setShowMore] = useState(Boolean(initial.teamId));
  const [showIntent, setShowIntent] = useState(
    Boolean(initial.dayRole || initial.planId || initial.intentFeel),
  );
  const [benchmarkFor, setBenchmarkFor] = useState<string | null>(
    !existing && !preset && params.get("benchmark") ? (initial.blocks[0]?.key ?? null) : null,
  );
  const [scheduling, setScheduling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);
  /** Para salir sin preguntar: tras guardar uno nuevo o borrar. */
  const leaving = useRef(false);

  // Disciplinas: en las que programa quien edita, con su nombre.
  const sameDay = useWorkouts({ from: draft.onDate, to: draft.onDate });
  const writable = sameDay.data?.writableSections ?? null;
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of classTypes.data?.sections ?? []) map.set(s.id, s.name);
    if (existing) map.set(existing.section.id, existing.section.name);
    return map;
  }, [classTypes.data, existing]);
  const sectionOptions = (writable ?? []).map((id) => ({ id, name: names.get(id) ?? "" }));
  useEffect(() => {
    if (draft.sectionId || !writable || writable.length === 0) return;
    setDraft((d) => ({ ...d, sectionId: writable[0]! }));
  }, [draft.sectionId, writable]);
  const readOnly =
    writable !== null && draft.sectionId !== "" && !writable.includes(draft.sectionId);
  const teams = (classTypes.data?.classTypes ?? []).filter(
    (ct) => ct.section.id === draft.sectionId && ct.status === "active",
  );
  const results = existing ? existing.blocks.reduce((sum, b) => sum + b.results, 0) : 0;

  const dirty = existing
    ? fingerprint(draft) !== baseline
    : draft.blocks.length > 0 || draft.title.trim() !== "" || draft.notes.trim() !== "";

  // Aviso al salir con cambios sin guardar: dentro de la app y al cerrar la pestaña.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setBlock = (key: string, patch: Partial<BlockDraft>) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)),
    }));
  const addBlock = (kind: WorkoutBlockKind) =>
    setDraft((d) =>
      d.blocks.length >= 10 ? d : { ...d, blocks: [...d.blocks, emptyBlock(kind)] },
    );
  const moveBlock = (index: number, delta: number) =>
    setDraft((d) => {
      const blocks = [...d.blocks];
      const [moved] = blocks.splice(index, 1);
      blocks.splice(index + delta, 0, moved!);
      return { ...d, blocks };
    });

  const movements = useMemo(
    () =>
      MOVEMENTS.map((m) => ({ code: m.code, name: movementName(m.code) })).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [movementName],
  );

  /** El WOD como lo pide la API, o lo que hay que corregir. */
  function build(status: "draft" | "published", publishAt: string | null) {
    const e: Record<string, BlockErrors> = {};
    const add = (key: string, field: keyof BlockErrors, text: string) => {
      e[key] = { ...e[key], [field]: e[key]?.[field] ?? text };
    };
    draft.blocks.forEach((b) => {
      const seconds = minutesToSeconds(b.minutes);
      if (MINUTES_REQUIRED.includes(b.format) && seconds === null)
        add(b.key, "minutes", t("errors.minutesRequired"));
      else if (
        (MINUTES_REQUIRED.includes(b.format) || MINUTES_OPTIONAL.includes(b.format)) &&
        b.minutes.trim() &&
        (seconds === null || seconds < 30 || seconds > 4 * 3600)
      )
        add(b.key, "minutes", t("errors.minutes"));
      if (b.format === "max" && !b.movementCode) add(b.key, "movement", t("errors.movementMax"));
      if (b.format === "percent" && b.percent.trim() && !b.movementCode)
        add(b.key, "movement", t("errors.movementPercent"));
      if (b.format === "percent" && b.percent.trim()) {
        const p = Number(b.percent);
        if (!Number.isInteger(p) || p < 1 || p > 150) add(b.key, "percent", t("errors.percent"));
      }
    });
    const value = {
      sectionId: draft.sectionId,
      teamId: draft.teamId || null,
      onDate: draft.onDate,
      title: orNull(draft.title),
      notes: orNull(draft.notes),
      status,
      publishAt,
      blocks: draft.blocks.map((b) => inputOf(b, kinds(b.kind))),
      planId: draft.planId,
      planWeek: draft.planId ? draft.planWeek : null,
      dayRole: draft.dayRole,
      intentDomain: draft.intentDomain,
      intentEffort: draft.intentEffort,
      intentFeel: orNull(draft.intentFeel),
      why: orNull(draft.why),
      specific: draft.planId ? draft.specific : false,
    };
    const top: Record<string, string> = {};
    const parsed = WorkoutUpsertSchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [first, index, field] = issue.path;
        if (first === "blocks" && typeof index === "number" && draft.blocks[index]) {
          const key = draft.blocks[index].key;
          const map: Record<string, keyof BlockErrors> = {
            title: "title",
            description: "description",
            timeCapSeconds: "minutes",
            movementCode: "movement",
            rmReps: "movement",
            percent: "percent",
            scaled: "levels",
            rx: "levels",
            rxPlus: "levels",
          };
          const target = map[String(field)] ?? "description";
          add(key, target, t(`errors.${target}`));
        } else if (first === "blocks") top["blocks"] = t("errors.blocks");
        else if (first === "sectionId") top["section"] = t("errors.section");
        else if (first === "title") top["title"] = t("errors.title");
        else if (first === "notes") top["notes"] = t("errors.notes");
        else top["generic"] = t("errors.generic");
      }
    }
    return { value, errors: e, top };
  }

  async function persist(status: "draft" | "published", publishAt: string | null, done: string) {
    const { value, errors, top } = build(status, publishAt);
    setBlockErrors(errors);
    setTopErrors(top);
    if (Object.keys(errors).length > 0 || Object.keys(top).length > 0) {
      toast("error", top["blocks"] ?? t("invalid"));
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(
        existing ? `/api/org/workouts/${existing.id}` : "/api/org/workouts",
        {
          method: existing ? "PUT" : "POST",
          body: value,
          schema: WorkoutResponseSchema,
        },
      );
      client.setQueryData(fitnessKey(slug, "workout", res.workout.id), res);
      await invalidate();
      setSaved({
        status: res.workout.status,
        publishAt: res.workout.publishAt,
        visible: res.workout.visible,
      });
      setBaseline(fingerprint(draft));
      setScheduling(false);
      toast("success", done);
      if (!existing) {
        leaving.current = true;
        void navigate(paths.workoutEdit(res.workout.id), { replace: true });
      }
    } catch (err) {
      toast("error", errorText(err, t("conflict")));
    } finally {
      setSaving(false);
    }
  }

  const saveDraft = () => void persist("draft", null, t("done.draft"));
  const publish = () => void persist("published", null, t("done.published"));
  const keep = () =>
    void persist(saved?.status ?? "draft", saved?.publishAt ?? null, t("done.saved"));
  const schedule = (date: string, at: string) => {
    const iso = localToIso(time.timezone ?? "Europe/Madrid", date, at);
    void persist("published", iso, t("done.scheduled", { when: time.when(iso) }));
  };

  async function remove() {
    if (!existing) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/org/workouts/${existing.id}`, { method: "DELETE" });
      toast("success", t("deleted"));
      await invalidate();
      leaving.current = true;
      void navigate(paths.programming, { replace: true });
    } catch (err) {
      toast("error", errorText(err));
      setDeleting(false);
    }
  }

  // --- Propuesta con IA ---
  const [aiOpen, setAiOpen] = useState(!existing && params.get("ai") === "1");
  const [focus, setFocus] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [asking, setAsking] = useState(false);
  const applied = useRef<string | null>(null);
  const generation = useQuery({
    queryKey: fitnessKey(slug, "ai-wod", generationId),
    queryFn: () =>
      apiFetch(`/api/org/ai-wods/${generationId}`, { schema: AiWodGenerationResponseSchema }),
    enabled: generationId !== null,
    refetchInterval: (query) => {
      const st = query.state.data?.generation.status;
      return st === "ready" || st === "failed" ? false : 3000;
    },
  });
  const current = generation.data?.generation ?? null;
  const working = current !== null && (current.status === "queued" || current.status === "running");

  useEffect(() => {
    if (!current || applied.current === current.id) return;
    if (current.status === "ready" && current.proposal) {
      applied.current = current.id;
      const proposal = current.proposal;
      setDraft((d) => ({
        ...d,
        title: proposal.title ?? d.title,
        notes: proposal.notes ?? d.notes,
        blocks: proposal.blocks.map(draftOf),
      }));
      if (proposal.notes) setShowNotes(true);
      setBlockErrors({});
      setAiOpen(false);
      setAiLoaded(true);
    } else if (current.status === "failed") {
      applied.current = current.id;
      const failure = current.failure ?? "model_error";
      setAiError(
        ai(
          `failed.${(AI_FAILURES as readonly string[]).includes(failure) ? failure : "model_error"}`,
        ),
      );
    }
  }, [current, ai]);

  async function askAi(e: FormEvent) {
    e.preventDefault();
    if (!draft.sectionId) {
      setAiError(ai("needSection"));
      return;
    }
    setAsking(true);
    setAiError(null);
    try {
      const minutesNumber = Number(minutes);
      const created: AiWodGenerationResponse = await apiFetch("/api/org/ai-wods", {
        method: "POST",
        body: {
          sectionId: draft.sectionId,
          teamId: draft.teamId || null,
          onDate: draft.onDate,
          focus: orNull(focus),
          ...(Number.isInteger(minutesNumber) && minutesNumber >= 20 && minutesNumber <= 120
            ? { durationMinutes: minutesNumber }
            : {}),
        },
        schema: AiWodGenerationResponseSchema,
      });
      client.setQueryData(fitnessKey(slug, "ai-wod", created.generation.id), created);
      setGenerationId(created.generation.id);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 503) {
        setAiUnavailable(true);
        setAiError(ai("unavailable"));
      } else if (err instanceof ApiClientError && err.status === 429) {
        setAiError(ai("quota"));
      } else {
        setAiError(errorText(err));
      }
    } finally {
      setAsking(false);
    }
  }

  // --- Lo que se pinta ---
  const status = saved ? stateOf(saved) : null;
  const statusText = !saved
    ? t("state.new")
    : saved.status === "draft"
      ? t("state.draft")
      : !saved.visible && saved.publishAt
        ? t("state.scheduled")
        : t("state.published");
  const isPublished = saved?.status === "published";
  const wide = useMediaQuery(WIDE_QUERY);
  const statusLine = (
    <p
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-secondary text-ink"
      role="status"
    >
      {status ? <StatusChip kind={status.kind}>{status.label}</StatusChip> : null}
      <span>{statusText}</span>
      {existing && dirty ? (
        <span className="font-medium text-warning">{t("state.dirty")}</span>
      ) : null}
    </p>
  );
  const sectionName = names.get(draft.sectionId) ?? existing?.section.name ?? "";
  const preview = previewOf({
    id: existing?.id ?? "new",
    onDate: draft.onDate,
    section: { id: draft.sectionId, name: sectionName },
    title: draft.title,
    notes: draft.notes,
    blocks: draft.blocks,
    kindLabel: (k) => kinds(k),
    locale,
    dayRole: draft.dayRole,
    intent:
      draft.intentDomain || draft.intentEffort || draft.intentFeel.trim()
        ? { domain: draft.intentDomain, effort: draft.intentEffort, feel: orNull(draft.intentFeel) }
        : null,
    why: draft.why
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    exerciseName: (id) => exercises.find((e) => e.id === id)?.name ?? null,
  });
  const dayLabel =
    draft.onDate === time.today
      ? c("today")
      : draft.onDate === addDays(time.today, 1)
        ? c("tomorrow")
        : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.programming}
        backLabel={nav("programming")}
        title={existing ? t("titleEdit") : t("titleNew")}
        actions={
          readOnly ? null : (
            <>
              <Button
                action="propose"
                variant="secondary"
                disabled={aiUnavailable}
                onClick={() => {
                  setAiError(aiUnavailable ? ai("unavailable") : null);
                  setAiOpen(true);
                }}
              >
                {ai("button")}
              </Button>
              {existing ? (
                <Menu
                  label={t("moreActions")}
                  trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
                  triggerClassName="border border-control bg-surface text-ink hover:bg-raised"
                >
                  <MenuItem
                    tone="danger"
                    icon={<Icon.Trash size={20} aria-hidden="true" />}
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t("delete")}
                  </MenuItem>
                </Menu>
              ) : null}
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton
            label={t("prevDay")}
            disabled={readOnly}
            onClick={() => set("onDate", addDays(draft.onDate, -1))}
          >
            <Icon.ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
          <div className="flex min-w-44 flex-col items-center px-1 text-center">
            <span className="font-semibold text-ink first-letter:uppercase">
              {time.day(draft.onDate)}
            </span>
            {dayLabel ? <span className="text-label text-club-text">{dayLabel}</span> : null}
          </div>
          <IconButton
            label={t("nextDay")}
            disabled={readOnly}
            onClick={() => set("onDate", addDays(draft.onDate, 1))}
          >
            <Icon.ArrowRight size={20} aria-hidden="true" />
          </IconButton>
        </div>
        {sectionOptions.length > 1 && !existing ? (
          <Segmented<string>
            label={t("section")}
            value={draft.sectionId}
            onChange={(id) => setDraft((d) => ({ ...d, sectionId: id, teamId: "" }))}
            options={sectionOptions.map((s) => ({ key: s.id, label: s.name }))}
          />
        ) : sectionName ? (
          <StatusChip kind="club">{sectionName}</StatusChip>
        ) : null}
        {/* En móvil, el estado va aquí: la barra de abajo solo lleva los botones. */}
        {readOnly || wide ? null : <span className="w-full">{statusLine}</span>}
      </div>

      {topErrors["section"] ? <Alert kind="error">{topErrors["section"]}</Alert> : null}
      {readOnly ? <Alert kind="info">{t("readOnly")}</Alert> : null}
      {results > 0 ? <Alert kind="info">{t("hasResults", { count: results })}</Alert> : null}
      {aiLoaded ? (
        <Alert
          kind="success"
          title={ai("loadedTitle")}
          actions={
            <Button variant="tertiary" size="sm" onClick={() => setAiLoaded(false)}>
              {c("close")}
            </Button>
          }
        >
          {ai("loaded")}
        </Alert>
      ) : null}

      <div className="lg:hidden">
        <Segmented<"edit" | "preview">
          label={t("view")}
          value={view}
          onChange={setView}
          options={[
            { key: "edit", label: t("viewEdit") },
            { key: "preview", label: t("viewPreview") },
          ]}
        />
      </div>

      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]"
        onSubmit={(e) => {
          e.preventDefault();
          if (isPublished) keep();
          else publish();
        }}
        noValidate
      >
        <div className={`flex min-w-0 flex-col gap-5 ${view === "edit" ? "" : "hidden lg:flex"}`}>
          <Card padded={false}>
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <Field label={t("dayTitle")} hint={t("dayTitleHint")} error={topErrors["title"]}>
                {(id, describedBy) => (
                  <Input
                    id={id}
                    maxLength={80}
                    readOnly={readOnly}
                    aria-describedby={describedBy}
                    placeholder={t("dayTitlePlaceholder")}
                    value={draft.title}
                    onChange={(e) => set("title", e.target.value)}
                    className="text-title3"
                  />
                )}
              </Field>
              {showNotes ? (
                <Field label={t("notes")} hint={t("notesHint")} error={topErrors["notes"]}>
                  {(id, describedBy) => (
                    <AutoTextarea
                      id={id}
                      rows={2}
                      maxLength={1000}
                      readOnly={readOnly}
                      aria-describedby={describedBy}
                      value={draft.notes}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  )}
                </Field>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {showNotes || readOnly ? null : (
                  <Button
                    variant="tertiary"
                    size="sm"
                    action="add"
                    onClick={() => setShowNotes(true)}
                  >
                    {t("addNotes")}
                  </Button>
                )}
                <button
                  type="button"
                  aria-expanded={showMore}
                  onClick={() => setShowMore((v) => !v)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-control px-2 text-secondary font-medium text-club-text"
                >
                  <Icon.CaretDown
                    size={16}
                    aria-hidden="true"
                    className={`transition-transform ${showMore ? "" : "-rotate-90"}`}
                  />
                  {t("moreOptions")}
                </button>
              </div>
              {showMore ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("team")} hint={t("teamHint")}>
                    {(id, describedBy) => (
                      <Select
                        id={id}
                        disabled={readOnly}
                        aria-describedby={describedBy}
                        value={draft.teamId}
                        onChange={(e) => set("teamId", e.target.value)}
                      >
                        <option value="">{t("allTeams")}</option>
                        {teams.map((ct) => (
                          <option key={ct.teamId} value={ct.teamId}>
                            {ct.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={t("date")}>
                    {(id) => (
                      <Input
                        id={id}
                        type="date"
                        readOnly={readOnly}
                        value={draft.onDate}
                        onChange={(e) => e.target.value && set("onDate", e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              ) : null}
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <button
                type="button"
                aria-expanded={showIntent}
                onClick={() => setShowIntent((v) => !v)}
                className="flex items-center justify-between gap-3 text-left"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-title3 text-ink">{intentT("title")}</span>
                  <span className="text-secondary text-muted">
                    {existing?.plan
                      ? intentT("fromPlan", {
                          plan: existing.plan.name,
                          week: existing.plan.week,
                          weeks: existing.plan.weeks,
                          block: existing.plan.blockLabel,
                        })
                      : draft.planId
                        ? intentT("fromPlanNew", { week: draft.planWeek ?? 0 })
                        : intentT("hint")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {draft.dayRole ? <RoleChip role={draft.dayRole} /> : null}
                  <Icon.CaretDown
                    size={16}
                    aria-hidden="true"
                    className={`text-muted transition-transform ${showIntent ? "" : "-rotate-90"}`}
                  />
                </span>
              </button>
              {showIntent ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={intentT("role")} hint={intentT("roleHint")}>
                    {(id, describedBy) => (
                      <Select
                        id={id}
                        disabled={readOnly}
                        aria-describedby={describedBy}
                        value={draft.dayRole ?? ""}
                        onChange={(e) => {
                          const role = (e.target.value || null) as DayRole | null;
                          const info = role ? DAY_ROLE_INFO[role] : null;
                          setDraft((d) => ({
                            ...d,
                            dayRole: role,
                            intentDomain: d.intentDomain ?? info?.domain ?? null,
                            intentEffort: d.intentEffort ?? info?.effort ?? null,
                          }));
                        }}
                      >
                        <option value="">{intentT("noRole")}</option>
                        {DAY_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {planNames.role(r)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={intentT("domain")} hint={intentT("domainHint")}>
                    {(id, describedBy) => (
                      <Select
                        id={id}
                        disabled={readOnly}
                        aria-describedby={describedBy}
                        value={draft.intentDomain ?? ""}
                        onChange={(e) =>
                          set("intentDomain", (e.target.value || null) as TimeDomain | null)
                        }
                      >
                        <option value="">{intentT("noDomain")}</option>
                        {TIME_DOMAINS.map((d) => (
                          <option key={d} value={d}>
                            {planNames.domain(d)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-secondary font-medium text-ink">{intentT("effort")}</span>
                    <Segmented<string>
                      label={intentT("effort")}
                      value={draft.intentEffort ? String(draft.intentEffort) : ""}
                      onChange={(v) => !readOnly && set("intentEffort", Number(v))}
                      options={[1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: String(n) }))}
                    />
                    <span className="text-label text-muted">{intentT("effortHint")}</span>
                  </div>
                  <Field label={intentT("feel")} hint={intentT("feelHint")}>
                    {(id, describedBy) => (
                      <Input
                        id={id}
                        maxLength={300}
                        readOnly={readOnly}
                        aria-describedby={describedBy}
                        placeholder={intentT("feelPlaceholder")}
                        value={draft.intentFeel}
                        onChange={(e) => set("intentFeel", e.target.value)}
                      />
                    )}
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={intentT("why")} hint={intentT("whyHint")}>
                      {(id, describedBy) => (
                        <AutoTextarea
                          id={id}
                          rows={2}
                          maxLength={1200}
                          readOnly={readOnly}
                          aria-describedby={describedBy}
                          value={draft.why}
                          onChange={(e) => set("why", e.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <section className="flex flex-col gap-4" aria-label={t("blocks")}>
            <h2 className="text-title3 text-ink">{t("blocks")}</h2>
            {draft.blocks.length === 0 ? (
              <div className="flex flex-col items-start gap-4 rounded-card border-2 border-dashed border-line p-5">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-ink">{t("emptyTitle")}</span>
                  <span className="text-secondary text-muted">{t("emptyHint")}</span>
                </div>
                {readOnly ? null : (
                  <>
                    <AddBlockBar onAdd={addBlock} disabled={false} />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon={<Icon.Medal size={18} aria-hidden="true" />}
                        onClick={() => {
                          const block = emptyBlock("wod");
                          setDraft((d) => ({ ...d, blocks: [...d.blocks, block] }));
                          setBenchmarkFor(block.key);
                        }}
                      >
                        {t("startFromBenchmark")}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {draft.blocks.map((b, i) => (
                  <BlockEditor
                    key={b.key}
                    block={b}
                    index={i}
                    count={draft.blocks.length}
                    errors={blockErrors[b.key] ?? {}}
                    readOnly={readOnly}
                    movements={movements}
                    exercises={exercises}
                    onChange={(patch) => setBlock(b.key, patch)}
                    onKind={(kind) =>
                      setDraft((d) => ({
                        ...d,
                        blocks: d.blocks.map((x) => (x.key === b.key ? withKind(x, kind) : x)),
                      }))
                    }
                    onMove={(delta) => moveBlock(i, delta)}
                    onDuplicate={() =>
                      setDraft((d) =>
                        d.blocks.length >= 10
                          ? d
                          : {
                              ...d,
                              blocks: [
                                ...d.blocks.slice(0, i + 1),
                                { ...b, key: newKey() },
                                ...d.blocks.slice(i + 1),
                              ],
                            },
                      )
                    }
                    onRemove={() =>
                      setDraft((d) => ({ ...d, blocks: d.blocks.filter((x) => x.key !== b.key) }))
                    }
                    onBenchmark={() => setBenchmarkFor(b.key)}
                  />
                ))}
                {readOnly ? null : (
                  <div className="flex flex-col gap-2">
                    <span className="text-secondary font-medium text-muted">{t("addBlock")}</span>
                    <AddBlockBar onAdd={addBlock} disabled={draft.blocks.length >= 10} />
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <aside
          className={`min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto ${
            view === "preview" ? "" : "hidden lg:block"
          }`}
          aria-label={t("preview")}
        >
          <Card title={t("preview")} description={t("previewHint")}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-label uppercase tracking-wide text-muted">
                  {[sectionName, time.day(draft.onDate)].filter(Boolean).join(" · ")}
                </span>
                {draft.title.trim() ? (
                  <span className="text-title3 text-ink">{draft.title.trim()}</span>
                ) : null}
              </div>
              {draft.blocks.length === 0 ? (
                <p className="text-secondary text-muted">{t("previewEmpty")}</p>
              ) : (
                <WorkoutBlocks workout={preview} />
              )}
            </div>
          </Card>
        </aside>

        {readOnly ? null : (
          <div className="sticky bottom-24 z-20 lg:col-span-2 lg:bottom-4">
            {/* En móvil, una sola fila con los botones: la barra ya convive con la navegación de abajo
                y el estado va arriba, junto al día. */}
            <div className="flex items-center gap-2 rounded-card bg-surface p-3 shadow-float sm:justify-between precisa:border precisa:border-border">
              {wide ? statusLine : null}
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:ml-auto sm:flex-none">
                {isPublished ? null : (
                  <Button
                    variant="secondary"
                    action="save"
                    loading={saving}
                    onClick={saveDraft}
                    className="flex-1 sm:flex-none"
                    aria-label={t("saveDraft")}
                  >
                    {/* En móvil, "Guardar": los dos botones y las opciones caben en una fila. */}
                    <span className="sm:hidden">{c("save")}</span>
                    <span className="hidden sm:inline">{t("saveDraft")}</span>
                  </Button>
                )}
                <Button
                  type="submit"
                  action={isPublished ? "save" : "send"}
                  loading={saving}
                  className="flex-1 sm:flex-none"
                >
                  {isPublished ? t("saveChanges") : t("publish")}
                </Button>
              </div>
              <span className="shrink-0">
                <Menu
                  label={t("publishOptions")}
                  trigger={<Icon.CaretDown size={18} aria-hidden="true" />}
                  triggerClassName="border border-control bg-surface text-ink hover:bg-raised"
                >
                  <MenuItem
                    icon={<Icon.Clock size={20} aria-hidden="true" />}
                    onClick={() => setScheduling(true)}
                  >
                    {saved && !saved.visible && saved.publishAt
                      ? t("reschedule")
                      : t("scheduleAction")}
                  </MenuItem>
                  {saved && saved.status === "published" && !saved.visible ? (
                    <MenuItem icon={<Icon.Play size={20} aria-hidden="true" />} onClick={publish}>
                      {t("publishNow")}
                    </MenuItem>
                  ) : null}
                  {isPublished ? (
                    <MenuItem
                      icon={<Icon.Pause size={20} aria-hidden="true" />}
                      onClick={saveDraft}
                    >
                      {t("toDraft")}
                    </MenuItem>
                  ) : null}
                </Menu>
              </span>
            </div>
          </div>
        )}
      </form>

      {benchmarkFor ? (
        <BenchmarkSheet
          onClose={() => setBenchmarkFor(null)}
          onPick={(b) => {
            setBlock(benchmarkFor, benchmarkBlock(b, locale));
            setBenchmarkFor(null);
          }}
        />
      ) : null}

      {scheduling ? (
        <ScheduleSheet
          initialDate={
            saved?.publishAt
              ? new Date(saved.publishAt).toLocaleDateString("en-CA", { timeZone: time.timezone })
              : addDays(draft.onDate, -1) < time.today
                ? time.today
                : addDays(draft.onDate, -1)
          }
          initialTime={
            saved?.publishAt
              ? new Date(saved.publishAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: time.timezone,
                })
              : "20:00"
          }
          busy={saving}
          onClose={() => setScheduling(false)}
          onSchedule={schedule}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title={t("deleteTitle", { date: time.day(draft.onDate) })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      {deleting ? (
        <span className="sr-only" role="status">
          {t("deleting")}
        </span>
      ) : null}

      <ConfirmDialog
        open={blocker.state === "blocked"}
        tone="default"
        title={t("leaveTitle")}
        body={t("leaveBody")}
        confirmLabel={t("leave")}
        cancelLabel={t("stay")}
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />

      <Sheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        closeLabel={c("close")}
        title={ai("title")}
        description={ai("description")}
      >
        <form className="flex flex-col gap-4" onSubmit={(e) => void askAi(e)}>
          {aiError ? (
            <Alert
              kind={aiUnavailable ? "info" : "error"}
              title={aiUnavailable ? undefined : ai("failedTitle")}
            >
              {aiError}
            </Alert>
          ) : null}
          <Field label={ai("focus")} hint={ai("focusHint")}>
            {(id, describedBy) => (
              <AutoTextarea
                id={id}
                rows={3}
                maxLength={300}
                aria-describedby={describedBy}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
              />
            )}
          </Field>
          <Field label={ai("duration")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={20}
                max={120}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            )}
          </Field>
          <p className="text-secondary text-muted">
            {draft.blocks.length > 0 ? ai("replaceHint") : ai("emptyHint")}
          </p>
          {working ? <p className="text-secondary text-muted">{ai("workingHint")}</p> : null}
          {current ? (
            <p className="text-secondary text-muted">
              {ai("remaining", { remaining: current.quota.remaining })}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="tertiary" onClick={() => setAiOpen(false)}>
              {c("cancel")}
            </Button>
            <Button
              type="submit"
              action="propose"
              loading={asking || working}
              disabled={aiUnavailable}
            >
              {working ? ai("working") : ai("send")}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}

import {
  AI_FAILURES,
  AiWodGenerationResponseSchema,
  formatSeconds,
  MOVEMENTS,
  parseDuration,
  REP_MAXES,
  SCORE_TYPES,
  WORKOUT_BLOCK_KINDS,
  WorkoutResponseSchema,
  WorkoutUpsertSchema,
  type AiWodGenerationResponse,
  type ScoreType,
  type WorkoutBlockInput,
  type WorkoutBlockKind,
  type WorkoutView,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useStaffError } from "@/components/fitness/staff-ui";
import { blockInputOf } from "@/components/fitness/staff-workout";
import { useMovementName } from "@/components/fitness/workout-blocks";
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
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Icon,
  Input,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  useToast,
} from "@/ui";

/** Un bloque mientras se escribe: los números van como texto hasta guardar. */
interface BlockDraft {
  key: string;
  kind: WorkoutBlockKind;
  title: string;
  description: string;
  scoreType: ScoreType;
  timeCap: string;
  movementCode: string;
  percent: string;
  rmReps: string;
  scaled: string;
  rx: string;
  rxPlus: string;
}

interface Draft {
  sectionId: string;
  teamId: string;
  onDate: string;
  title: string;
  notes: string;
  status: "draft" | "published";
  publishLater: boolean;
  publishDate: string;
  publishTime: string;
  blocks: BlockDraft[];
}

let keySeq = 0;
const newKey = () => `b${++keySeq}`;

function blockDraftOf(b: WorkoutBlockInput): BlockDraft {
  return {
    key: newKey(),
    kind: b.kind,
    title: b.title,
    description: b.description ?? "",
    scoreType: b.scoreType,
    timeCap: b.timeCapSeconds ? formatSeconds(b.timeCapSeconds) : "",
    movementCode: b.movementCode ?? "",
    percent: b.percent ? String(b.percent) : "",
    rmReps: b.rmReps ? String(b.rmReps) : "",
    scaled: b.scaled ?? "",
    rx: b.rx ?? "",
    rxPlus: b.rxPlus ?? "",
  };
}

const emptyBlock = (kind: WorkoutBlockKind = "wod"): BlockDraft => ({
  key: newKey(),
  kind,
  title: "",
  description: "",
  scoreType: kind === "strength" ? "load" : kind === "wod" ? "time" : "none",
  timeCap: "",
  movementCode: "",
  percent: "",
  rmReps: "",
  scaled: "",
  rx: "",
  rxPlus: "",
});

const orNull = (text: string) => (text.trim() ? text.trim() : null);

/**
 * El WOD de un día (ADR 0049): disciplina y, si se quiere, tipo de clase; título y notas; los
 * bloques en orden con su pizarra, su marcador, su movimiento con porcentaje o máxima y los tres
 * niveles; y cuándo lo ven los atletas. La IA puede proponer los bloques: el coach los revisa aquí
 * y solo se guardan cuando él guarda.
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
  return <EditorForm key={id ?? "new"} existing={workout.data?.workout ?? null} />;
}

function EditorForm({ existing }: { existing: WorkoutView | null }) {
  const t = useT("fitness.staff.editor");
  const ai = useT("fitness.staff.editor.ai");
  const c = useT("fitness.common");
  const nav = useT("fitness.common.nav");
  const kinds = useT("fitness.common.blockKinds");
  const scores = useT("fitness.common.scoreTypes");
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

  const [draft, setDraft] = useState<Draft>(() => {
    if (existing) {
      const publishAt = existing.publishAt ? new Date(existing.publishAt) : null;
      const later = publishAt !== null && publishAt.getTime() > Date.now();
      return {
        sectionId: existing.section.id,
        teamId: existing.team?.id ?? "",
        onDate: existing.onDate,
        title: existing.title ?? "",
        notes: existing.notes ?? "",
        status: existing.status,
        publishLater: later,
        publishDate: publishAt
          ? publishAt.toLocaleDateString("en-CA", { timeZone: time.timezone })
          : existing.onDate,
        publishTime: publishAt
          ? publishAt.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: time.timezone,
            })
          : "06:00",
        blocks: existing.blocks.map((b) => blockDraftOf(blockInputOf(b))),
      };
    }
    const date = params.get("date") ?? time.today;
    return {
      sectionId: params.get("section") ?? "",
      teamId: params.get("team") ?? "",
      onDate: date,
      title: "",
      notes: "",
      status: "published",
      publishLater: false,
      publishDate: date,
      publishTime: "06:00",
      blocks: [emptyBlock("warmup"), emptyBlock("strength"), emptyBlock("wod")],
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Si solo hay una disciplina, va puesta.
  const sections = classTypes.data?.sections ?? [];
  useEffect(() => {
    if (!draft.sectionId && sections.length === 1)
      setDraft((d) => ({ ...d, sectionId: sections[0]!.id }));
  }, [draft.sectionId, sections]);
  const teams = (classTypes.data?.classTypes ?? []).filter(
    (ct) => ct.section.id === draft.sectionId,
  );
  const writableOf = useWorkouts({ from: draft.onDate, to: draft.onDate });
  const writable = writableOf.data?.writableSections ?? null;
  const readOnly =
    writable !== null && draft.sectionId !== "" && !writable.includes(draft.sectionId);
  const results = existing ? existing.blocks.reduce((sum, b) => sum + b.results, 0) : 0;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setBlock = (key: string, patch: Partial<BlockDraft>) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)),
    }));
  const moveBlock = (index: number, delta: number) =>
    setDraft((d) => {
      const blocks = [...d.blocks];
      const [moved] = blocks.splice(index, 1);
      blocks.splice(index + delta, 0, moved!);
      return { ...d, blocks };
    });

  /** El borrador como lo pide la API, o los errores por campo. */
  function build(): { value: unknown; errors: Record<string, string> } {
    const found: Record<string, string> = {};
    const blocks = draft.blocks.map((b, i) => {
      const cap = b.timeCap.trim() ? parseDuration(b.timeCap) : null;
      if (b.timeCap.trim() && cap === null)
        found[`blocks.${i}.timeCapSeconds`] = t("errors.timeCap");
      return {
        kind: b.kind,
        title: b.title.trim(),
        description: orNull(b.description),
        scoreType: b.scoreType,
        timeCapSeconds: cap,
        movementCode: orNull(b.movementCode),
        percent: b.percent.trim() ? Number(b.percent) : null,
        rmReps: b.rmReps ? Number(b.rmReps) : null,
        scaled: orNull(b.scaled),
        rx: orNull(b.rx),
        rxPlus: orNull(b.rxPlus),
      };
    });
    const publishAt =
      draft.status === "published" && draft.publishLater
        ? localToIso(time.timezone ?? "Europe/Madrid", draft.publishDate, draft.publishTime)
        : null;
    const value = {
      sectionId: draft.sectionId,
      teamId: draft.teamId || null,
      onDate: draft.onDate,
      title: orNull(draft.title),
      notes: orNull(draft.notes),
      status: draft.status,
      publishAt,
      blocks,
    };
    const parsed = WorkoutUpsertSchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (found[path]) continue;
        const last = String(issue.path[issue.path.length - 1] ?? "");
        const field =
          issue.path[0] === "blocks" && issue.path.length === 1
            ? "blocks"
            : issue.path[0] === "blocks" && last === "title"
              ? "blockTitle"
              : last;
        found[path] = t(`errors.${FIELD_ERRORS.has(field) ? field : "generic"}`);
      }
    }
    return { value, errors: found };
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const { value, errors: found } = build();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast("error", t("invalid"));
      return;
    }
    setSaving(true);
    try {
      const saved = await apiFetch(
        existing ? `/api/org/workouts/${existing.id}` : "/api/org/workouts",
        {
          method: existing ? "PUT" : "POST",
          body: value,
          schema: WorkoutResponseSchema,
        },
      );
      client.setQueryData(fitnessKey(slug, "workout", saved.workout.id), saved);
      await invalidate();
      toast("success", existing ? t("saved") : t("created"));
      if (!existing) void navigate(paths.workoutEdit(saved.workout.id), { replace: true });
    } catch (err) {
      toast("error", errorText(err, t("conflict")));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/org/workouts/${existing.id}`, { method: "DELETE" });
      toast("success", t("deleted"));
      await invalidate();
      void navigate(paths.programming, { replace: true });
    } catch (err) {
      toast("error", errorText(err));
      setDeleting(false);
    }
  }

  // --- Propuesta con IA ---
  const [aiOpen, setAiOpen] = useState(false);
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
        blocks: proposal.blocks.map(blockDraftOf),
      }));
      setErrors({});
      setAiOpen(false);
      toast("success", ai("ready"));
    } else if (current.status === "failed") {
      applied.current = current.id;
      const failure = current.failure ?? "model_error";
      setAiError(
        ai(
          `failed.${(AI_FAILURES as readonly string[]).includes(failure) ? failure : "model_error"}`,
        ),
      );
    }
  }, [current, ai, toast]);

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

  const movementOptions = useMemo(
    () =>
      MOVEMENTS.map((m) => ({ code: m.code, name: movementName(m.code) })).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [movementName],
  );
  const err = (path: string) => errors[path];

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-6" onSubmit={(e) => void save(e)} noValidate>
        <PageHeader
          backTo={paths.programming}
          backLabel={nav("programming")}
          eyebrow={time.day(draft.onDate)}
          title={existing ? t("titleEdit") : t("titleNew")}
          actions={
            <>
              <Button
                action="propose"
                variant="secondary"
                disabled={readOnly || aiUnavailable}
                onClick={() => {
                  setAiError(aiUnavailable ? ai("unavailable") : null);
                  setAiOpen(true);
                }}
              >
                {ai("button")}
              </Button>
              <Button type="submit" action="save" loading={saving} disabled={readOnly}>
                {t("save")}
              </Button>
            </>
          }
        />

        {readOnly ? <Alert kind="warning">{t("readOnly")}</Alert> : null}
        {results > 0 ? <Alert kind="info">{t("hasResults", { count: results })}</Alert> : null}
        {working ? (
          <Alert kind="info" title={ai("working")}>
            {ai("workingHint")}
          </Alert>
        ) : null}

        <Card title={t("day")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("section")} error={err("sectionId")}>
              {(id, describedBy) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("sectionId")) || undefined}
                  value={draft.sectionId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sectionId: e.target.value, teamId: "" }))
                  }
                >
                  <option value="">{t("chooseSection")}</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("team")} hint={t("teamHint")}>
              {(id, describedBy) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={draft.teamId}
                  disabled={!draft.sectionId}
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
            <Field label={t("date")} error={err("onDate")}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  type="date"
                  required
                  aria-describedby={describedBy}
                  value={draft.onDate}
                  onChange={(e) => set("onDate", e.target.value)}
                />
              )}
            </Field>
            <Field label={t("title")} hint={t("titleHint")} error={err("title")}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  maxLength={80}
                  aria-describedby={describedBy}
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("notes")} hint={t("notesHint")} error={err("notes")}>
                {(id, describedBy) => (
                  <textarea
                    id={id}
                    rows={3}
                    maxLength={1000}
                    aria-describedby={describedBy}
                    value={draft.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    className="w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club"
                  />
                )}
              </Field>
            </div>
          </div>
        </Card>

        <Card title={t("visibility")}>
          <div className="flex flex-col gap-4">
            <Segmented<"draft" | "published">
              label={t("status")}
              value={draft.status}
              onChange={(v) => set("status", v)}
              options={[
                { key: "draft", label: t("draft") },
                { key: "published", label: t("published") },
              ]}
            />
            {draft.status === "draft" ? (
              <p className="text-secondary text-muted">{t("draftHint")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                <Segmented<"now" | "later">
                  label={t("publish")}
                  value={draft.publishLater ? "later" : "now"}
                  onChange={(v) => set("publishLater", v === "later")}
                  options={[
                    { key: "now", label: t("publishNow") },
                    { key: "later", label: t("publishLater") },
                  ]}
                />
                {draft.publishLater ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("publishDate")} error={err("publishAt")}>
                      {(id, describedBy) => (
                        <Input
                          id={id}
                          type="date"
                          aria-describedby={describedBy}
                          value={draft.publishDate}
                          onChange={(e) => set("publishDate", e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label={t("publishTime")}>
                      {(id, describedBy) => (
                        <Input
                          id={id}
                          type="time"
                          aria-describedby={describedBy}
                          value={draft.publishTime}
                          onChange={(e) => set("publishTime", e.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </Card>

        <section className="flex flex-col gap-4" aria-labelledby="editor-blocks">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="editor-blocks" className="text-title2 text-ink">
              {t("blocks")}
            </h2>
            {err("blocks") ? (
              <span className="text-secondary text-danger" role="alert">
                {err("blocks")}
              </span>
            ) : null}
          </div>
          {draft.blocks.map((b, i) => {
            const label = String.fromCharCode(65 + i);
            const path = (field: string) => `blocks.${i}.${field}`;
            return (
              <Card
                key={b.key}
                title={t("block", { label })}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon={<Icon.ArrowUp size={16} aria-hidden="true" />}
                      disabled={i === 0}
                      onClick={() => moveBlock(i, -1)}
                    >
                      {t("moveUp", { label })}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon={<Icon.ArrowDown size={16} aria-hidden="true" />}
                      disabled={i === draft.blocks.length - 1}
                      onClick={() => moveBlock(i, 1)}
                    >
                      {t("moveDown", { label })}
                    </Button>
                    <Button
                      variant="ghost-danger"
                      size="sm"
                      iconOnly
                      action="delete"
                      disabled={draft.blocks.length === 1}
                      onClick={() =>
                        setDraft((d) => ({ ...d, blocks: d.blocks.filter((x) => x.key !== b.key) }))
                      }
                    >
                      {t("removeBlock", { label })}
                    </Button>
                  </>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("kind")}>
                    {(id) => (
                      <Select
                        id={id}
                        value={b.kind}
                        onChange={(e) =>
                          setBlock(b.key, { kind: e.target.value as WorkoutBlockKind })
                        }
                      >
                        {WORKOUT_BLOCK_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {kinds(k)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={t("blockTitle")} error={err(path("title"))}>
                    {(id, describedBy) => (
                      <Input
                        id={id}
                        maxLength={80}
                        aria-describedby={describedBy}
                        aria-invalid={Boolean(err(path("title"))) || undefined}
                        placeholder={t("blockTitlePlaceholder")}
                        value={b.title}
                        onChange={(e) => setBlock(b.key, { title: e.target.value })}
                      />
                    )}
                  </Field>
                  <div className="sm:col-span-2">
                    <Field
                      label={t("description")}
                      hint={t("descriptionHint")}
                      error={err(path("description"))}
                    >
                      {(id, describedBy) => (
                        <textarea
                          id={id}
                          rows={5}
                          maxLength={2000}
                          aria-describedby={describedBy}
                          value={b.description}
                          onChange={(e) => setBlock(b.key, { description: e.target.value })}
                          className="w-full rounded-field border border-control bg-surface px-4 py-3 font-mono text-body text-ink outline-none focus:border-2 focus:border-club"
                        />
                      )}
                    </Field>
                  </div>
                  <Field label={t("scoreType")}>
                    {(id) => (
                      <Select
                        id={id}
                        value={b.scoreType}
                        onChange={(e) =>
                          setBlock(b.key, {
                            scoreType: e.target.value as ScoreType,
                            ...(e.target.value !== "load" ? { rmReps: "" } : {}),
                          })
                        }
                      >
                        {SCORE_TYPES.map((s) => (
                          <option key={s} value={s}>
                            {scores(s)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field
                    label={t("timeCap")}
                    hint={t("timeCapHint")}
                    error={err(path("timeCapSeconds"))}
                  >
                    {(id, describedBy) => (
                      <Input
                        id={id}
                        inputMode="numeric"
                        placeholder="12:00"
                        aria-describedby={describedBy}
                        aria-invalid={Boolean(err(path("timeCapSeconds"))) || undefined}
                        value={b.timeCap}
                        onChange={(e) => setBlock(b.key, { timeCap: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label={t("movement")} error={err(path("movementCode"))}>
                    {(id, describedBy) => (
                      <Select
                        id={id}
                        aria-describedby={describedBy}
                        value={b.movementCode}
                        onChange={(e) =>
                          setBlock(b.key, {
                            movementCode: e.target.value,
                            ...(e.target.value ? {} : { percent: "", rmReps: "" }),
                          })
                        }
                      >
                        <option value="">{t("noMovement")}</option>
                        {movementOptions.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      label={t("percent")}
                      hint={t("percentHint")}
                      error={err(path("percent"))}
                    >
                      {(id, describedBy) => (
                        <Input
                          id={id}
                          type="number"
                          min={1}
                          max={150}
                          inputMode="numeric"
                          disabled={!b.movementCode || Boolean(b.rmReps)}
                          aria-describedby={describedBy}
                          aria-invalid={Boolean(err(path("percent"))) || undefined}
                          value={b.percent}
                          onChange={(e) => setBlock(b.key, { percent: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field label={t("rm")} hint={t("rmHint")} error={err(path("rmReps"))}>
                      {(id, describedBy) => (
                        <Select
                          id={id}
                          aria-describedby={describedBy}
                          disabled={!b.movementCode}
                          value={b.rmReps}
                          onChange={(e) =>
                            setBlock(b.key, {
                              rmReps: e.target.value,
                              ...(e.target.value ? { scoreType: "load", percent: "" } : {}),
                            })
                          }
                        >
                          <option value="">{t("noRm")}</option>
                          {REP_MAXES.map((r) => (
                            <option key={r} value={String(r)}>
                              {`${r}RM`}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  </div>
                  <details className="sm:col-span-2" open={Boolean(b.scaled || b.rx || b.rxPlus)}>
                    <summary className="cursor-pointer text-secondary font-medium text-ink">
                      {t("levels")}
                    </summary>
                    <div className="mt-3 grid gap-4 sm:grid-cols-3">
                      {(
                        [
                          ["scaled", "Scaled"],
                          ["rx", "RX"],
                          ["rxPlus", "RX+"],
                        ] as const
                      ).map(([field, name]) => (
                        <Field key={field} label={name}>
                          {(id) => (
                            <Input
                              id={id}
                              maxLength={400}
                              value={b[field]}
                              onChange={(e) => setBlock(b.key, { [field]: e.target.value })}
                            />
                          )}
                        </Field>
                      ))}
                    </div>
                  </details>
                </div>
              </Card>
            );
          })}
          {draft.blocks.length < 10 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                action="add"
                variant="secondary"
                onClick={() => setDraft((d) => ({ ...d, blocks: [...d.blocks, emptyBlock()] }))}
              >
                {t("addBlock")}
              </Button>
            </div>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {existing ? (
            <Button
              action="delete"
              variant="danger"
              loading={deleting}
              onClick={() => setConfirmDelete(true)}
            >
              {t("delete")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" action="save" loading={saving} disabled={readOnly}>
            {t("save")}
          </Button>
        </div>
      </form>

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
              <textarea
                id={id}
                rows={3}
                maxLength={300}
                aria-describedby={describedBy}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                className="w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club"
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
          <p className="text-secondary text-muted">{ai("replaceHint")}</p>
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

/** Campos con su propio texto de error; el resto, uno genérico. */
const FIELD_ERRORS = new Set([
  "sectionId",
  "onDate",
  "title",
  "notes",
  "publishAt",
  "blocks",
  "blockTitle",
  "description",
  "timeCapSeconds",
  "movementCode",
  "percent",
  "rmReps",
  "scaled",
  "rx",
  "rxPlus",
]);

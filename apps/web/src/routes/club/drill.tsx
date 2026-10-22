import { ActionIcon } from "@sportsmanager/design";
import {
  DrillResponseSchema,
  DrillsResponseSchema,
  RESTRICTION_TAGS,
  type DrillCreate,
  type DrillDetail,
  type DrillDiagram,
  type DrillScope,
  type DrillsResponse,
  type DrillUpdate,
  type RestrictionTag,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ContentChips,
  DrillAnimationPlayer,
  DrillBoardEditor,
  EMPTY_DIAGRAM,
  RestrictionTags,
  useLoadFormat,
} from "@/components/training-ui";
import { ApiClientError, apiFetch, errorKey, uploadFile } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { useDrillPlayers, useDrillWhere } from "@/routes/club/drills";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Definitions,
  EmptyState,
  Field,
  Icon,
  Input,
  Menu,
  MenuItem,
  PageHeader,
  Select,
  StatusChip,
  useToast,
} from "@/ui";

const textareaClass =
  "w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none " +
  "focus:border-2 focus:border-club focus:shadow-[0_0_0_4px_var(--club-soft)]";

/**
 * Ficha de una tarea de la biblioteca (ADR 0039): la pizarra, su desarrollo, su ficha y su uso.
 * Quien gestiona su ámbito la edita aquí mismo; `/drills/new` abre el alta con el mismo editor.
 */
export function DrillPage() {
  const c = useT("common");
  const errors = useT("errors");
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const { slug } = useReadyClub();
  const [editing, setEditing] = useState(false);

  // La biblioteca da las secciones, equipos y contenidos del ámbito, y si se puede crear.
  const library = useQuery({
    queryKey: ["org", slug, "drills", ""],
    queryFn: () => apiFetch("/api/org/drills", { schema: DrillsResponseSchema }),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["org", slug, "drill", id],
    queryFn: () => apiFetch(`/api/org/drills/${id}`, { schema: DrillResponseSchema }),
    enabled: !isNew,
    retry: false,
  });

  const failed = library.error ?? detail.error;
  if (failed) {
    const notFound = failed instanceof ApiClientError && failed.status === 404;
    return <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(failed))}</Alert>;
  }
  if (!library.data || (!isNew && !detail.data)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-72 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  if (isNew) {
    if (!library.data.access.create) return <Alert kind="error">{errors("forbidden")}</Alert>;
    return <DrillEditor library={library.data} drill={null} />;
  }
  const drill = detail.data!.drill;
  if (editing && drill.canEdit)
    return <DrillEditor library={library.data} drill={drill} onDone={() => setEditing(false)} />;
  return (
    <DrillView
      drill={drill}
      canCreate={library.data.access.create}
      onEdit={() => setEditing(true)}
    />
  );
}

// --- Ficha ---

function DrillView({
  drill,
  canCreate,
  onEdit,
}: {
  drill: DrillDetail;
  canCreate: boolean;
  onEdit: () => void;
}) {
  const t = useT("drills");
  const f = useT("drills.fields");
  const s = useT("drillScopes");
  const r = useT("session.rating");
  const c = useT("common");
  const errors = useT("errors");
  const intl = useIntl();
  const dates = useDates();
  const format = useLoadFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const whereOf = useDrillWhere();
  const playersOf = useDrillPlayers();
  const [removing, setRemoving] = useState(false);
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  async function setStatus(status: "active" | "archived") {
    try {
      await apiFetch(`/api/org/drills/${drill.id}`, { method: "PATCH", body: { status } });
      toast("success", status === "archived" ? t("archivedToast") : t("restored"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  async function remove() {
    setRemoving(false);
    try {
      await apiFetch(`/api/org/drills/${drill.id}`, { method: "DELETE" });
      toast("success", t("removed"));
      void reload();
      void navigate(paths.drills, { replace: true });
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  /** Copia como tarea personal: misma sección, para retocarla sin tocar la del club. */
  async function duplicate() {
    const body: DrillCreate = {
      scope: "personal",
      sectionId: drill.section?.id ?? null,
      name: t("copyName", { name: drill.name }).slice(0, 80),
      description: drill.description,
      rules: drill.rules,
      coachingPoints: drill.coachingPoints,
      variants: drill.variants,
      format: drill.format,
      space: drill.space,
      playersMin: drill.playersMin,
      playersMax: drill.playersMax,
      durationMin: drill.durationMin,
      targetRpe: drill.targetRpe,
      material: drill.material,
      diagram: drill.diagram,
      videoUrl: drill.videoUrl,
      restrictionTags: drill.restrictionTags,
      contentIds: drill.contents.map((x) => x.id),
    };
    try {
      const res = await apiFetch("/api/org/drills", {
        method: "POST",
        body,
        schema: DrillResponseSchema,
      });
      toast("success", t("duplicated"));
      void reload();
      void navigate(paths.drill(res.drill.id));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const where = whereOf(drill);
  const players = playersOf(drill.playersMin, drill.playersMax);
  const development = [
    { key: "description", text: drill.description },
    { key: "rules", text: drill.rules },
    { key: "coachingPoints", text: drill.coachingPoints },
    { key: "variants", text: drill.variants },
  ].filter((x): x is { key: string; text: string } => Boolean(x.text));
  const sheet = (
    [
      drill.format ? { term: f("format"), detail: drill.format } : null,
      drill.space ? { term: f("space"), detail: drill.space } : null,
      players ? { term: f("players"), detail: players } : null,
      drill.durationMin ? { term: f("duration"), detail: format.minutes(drill.durationMin) } : null,
      drill.targetRpe !== null ? { term: f("targetRpe"), detail: drill.targetRpe } : null,
      drill.material ? { term: f("material"), detail: drill.material } : null,
      drill.videoUrl
        ? {
            term: f("video"),
            detail: (
              <a href={drill.videoUrl} target="_blank" rel="noopener noreferrer">
                {t("openVideo")}
              </a>
            ),
          }
        : null,
    ] as ({ term: string; detail: ReactNode } | null)[]
  ).filter((x): x is { term: string; detail: ReactNode } => x !== null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.drills}
        backLabel={t("backToLibrary")}
        eyebrow={
          drill.scope === "club" || drill.scope === "personal"
            ? where
            : `${s(drill.scope)} · ${where}`
        }
        title={
          <>
            {drill.name}
            {drill.status === "archived" ? (
              <StatusChip kind="neutral">{t("archived")}</StatusChip>
            ) : null}
          </>
        }
        description={drill.canEdit ? undefined : t("readOnly")}
        actions={
          drill.canEdit || canCreate ? (
            <>
              {drill.canEdit ? (
                <Button variant="secondary" action="edit" onClick={onEdit}>
                  {t("edit")}
                </Button>
              ) : null}
              <Menu
                label={t("actions")}
                trigger={<Icon.DotsThreeVertical size={22} aria-hidden="true" />}
              >
                {canCreate ? (
                  <MenuItem
                    icon={<ActionIcon action="copy" size={20} />}
                    onClick={() => void duplicate()}
                  >
                    {t("duplicate")}
                  </MenuItem>
                ) : null}
                {drill.canEdit ? (
                  drill.status === "archived" ? (
                    <MenuItem
                      icon={<ActionIcon action="restore" size={20} />}
                      onClick={() => void setStatus("active")}
                    >
                      {t("restore")}
                    </MenuItem>
                  ) : (
                    <MenuItem
                      icon={<ActionIcon action="archive" size={20} />}
                      onClick={() => void setStatus("archived")}
                    >
                      {t("archive")}
                    </MenuItem>
                  )
                ) : null}
                {drill.canEdit ? (
                  <MenuItem
                    tone="danger"
                    icon={<ActionIcon action="delete" size={20} />}
                    onClick={() => setRemoving(true)}
                  >
                    {t("remove")}
                  </MenuItem>
                ) : null}
              </Menu>
            </>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("cards.board")}>
            {drill.diagram ? (
              <DrillAnimationPlayer
                diagram={drill.diagram}
                audioUrl={drill.audioUrl}
                label={t("boardOf", { name: drill.name })}
              />
            ) : (
              <EmptyState icon={<Icon.Target aria-hidden="true" />} title={t("noBoard")} />
            )}
          </Card>
          <Card title={t("cards.development")}>
            {development.length > 0 ? (
              <div className="flex flex-col gap-4">
                {development.map((part) => (
                  <div key={part.key} className="flex flex-col gap-1">
                    <h3 className="text-secondary font-semibold text-ink">{f(part.key)}</h3>
                    <p className="whitespace-pre-line text-body text-ink">{part.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-secondary text-muted">{t("noDevelopment")}</p>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("cards.sheet")}>
            <div className="flex flex-col gap-4">
              {sheet.length > 0 ? <Definitions items={sheet} /> : null}
              <div className="flex flex-col gap-1.5">
                <h3 className="text-secondary font-medium text-muted">{f("contents")}</h3>
                {drill.contents.length > 0 ? (
                  <ContentChips
                    ids={drill.contents.map((x) => x.id)}
                    contents={drill.contents}
                    link
                  />
                ) : (
                  <span className="text-secondary text-muted">—</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-secondary font-medium text-muted">{f("restrictions")}</h3>
                {drill.restrictionTags.length > 0 ? (
                  <RestrictionTags tags={drill.restrictionTags} />
                ) : (
                  <span className="text-secondary text-muted">{f("noDemands")}</span>
                )}
              </div>
            </div>
          </Card>
          <Card title={t("cards.usage")}>
            <div className="flex flex-col gap-4">
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-secondary text-ink">
                <span>{t("uses", { count: drill.uses })}</span>
                {drill.lastUsedOn ? (
                  <span className="text-muted">
                    {t("lastUsed", { date: dates.day(drill.lastUsedOn) })}
                  </span>
                ) : null}
                {drill.rating !== null ? (
                  <span className="text-muted">
                    {t("ratingValue", {
                      value: intl.formatNumber(drill.rating, { maximumFractionDigits: 1 }),
                    })}
                  </span>
                ) : null}
              </p>
              <div className="flex flex-col gap-2">
                <h3 className="text-secondary font-semibold text-ink">{t("cards.recent")}</h3>
                {drill.recentSessions.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-line">
                    {drill.recentSessions.map((row) => (
                      <li key={row.sessionId}>
                        <Link
                          to={paths.session(row.sessionId)}
                          className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2 text-ink no-underline hover:text-club-text"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="text-body font-medium">{row.team.name}</span>
                            <span className="text-secondary text-muted">{dates.day(row.date)}</span>
                          </span>
                          {row.rating ? (
                            <StatusChip
                              kind={
                                row.rating === 3
                                  ? "success"
                                  : row.rating === 1
                                    ? "danger"
                                    : "neutral"
                              }
                            >
                              {r(String(row.rating))}
                            </StatusChip>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-secondary text-muted">{t("recentEmpty")}</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={removing}
        title={t("confirmRemoveTitle", { name: drill.name })}
        body={t("confirmRemoveBody")}
        confirmLabel={t("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </div>
  );
}

// --- Editor ---

interface DrillForm {
  name: string;
  scope: DrillScope;
  sectionId: string;
  teamId: string;
  format: string;
  space: string;
  playersMin: string;
  playersMax: string;
  durationMin: string;
  targetRpe: string;
  material: string;
  videoUrl: string;
  description: string;
  rules: string;
  coachingPoints: string;
  variants: string;
  contentIds: string[];
  restrictionTags: RestrictionTag[];
  diagram: DrillDiagram;
}

const numberText = (n: number | null) => (n === null ? "" : String(n));

function formOf(drill: DrillDetail): DrillForm {
  return {
    name: drill.name,
    scope: drill.scope,
    sectionId: drill.section?.id ?? "",
    teamId: drill.team?.id ?? "",
    format: drill.format ?? "",
    space: drill.space ?? "",
    playersMin: numberText(drill.playersMin),
    playersMax: numberText(drill.playersMax),
    durationMin: numberText(drill.durationMin),
    targetRpe: numberText(drill.targetRpe),
    material: drill.material ?? "",
    videoUrl: drill.videoUrl ?? "",
    description: drill.description ?? "",
    rules: drill.rules ?? "",
    coachingPoints: drill.coachingPoints ?? "",
    variants: drill.variants ?? "",
    contentIds: drill.contents.map((x) => x.id),
    restrictionTags: drill.restrictionTags,
    diagram: drill.diagram ?? EMPTY_DIAGRAM,
  };
}

/**
 * Alta y edición de una tarea. El ámbito decide dónde vive y qué contenidos puede llevar: los de
 * su sección (o los de todas en una tarea del club). Al editar, la tarea solo cambia de sitio
 * cambiando el ámbito, como manda la API.
 */
function DrillEditor({
  library,
  drill,
  onDone,
}: {
  library: DrillsResponse;
  drill: DrillDetail | null;
  onDone?: () => void;
}) {
  const t = useT("drills");
  const f = useT("drills.fields");
  const s = useT("drillScopes");
  const tags = useT("tags");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [params] = useSearchParams();
  const { sections, teams, contents, access } = library;

  const [form, setForm] = useState<DrillForm>(() => {
    if (drill) return formOf(drill);
    const team = teams.find((x) => x.id === params.get("team"));
    const section = sections.find((x) => x.id === params.get("section"));
    const scope: DrillScope = team
      ? "team"
      : access.library
        ? section || sections.length === 1
          ? "section"
          : "club"
        : "personal";
    const sectionId =
      team?.sectionId ?? section?.id ?? (sections.length === 1 ? sections[0]!.id : "");
    const content = contents.find((x) => x.id === params.get("content"));
    return {
      name: "",
      scope,
      sectionId,
      teamId: team?.id ?? "",
      format: "",
      space: "",
      playersMin: "",
      playersMax: "",
      durationMin: "",
      targetRpe: "",
      material: "",
      videoUrl: "",
      description: "",
      rules: "",
      coachingPoints: "",
      variants: "",
      contentIds: content && (!sectionId || content.sectionId === sectionId) ? [content.id] : [],
      restrictionTags: [],
      diagram: EMPTY_DIAGRAM,
    };
  });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Voz de la pizarra (ADR 0040): la recién grabada se sube al guardar; `removed`, se quita. */
  const [voice, setVoice] = useState<{ blob: Blob | null; removed: boolean }>({
    blob: null,
    removed: false,
  });
  const set = <K extends keyof DrillForm>(key: K, value: DrillForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Ámbitos posibles: club y sección con la biblioteca; equipo si hay equipos; personal siempre.
  const scopes = (["club", "section", "team", "personal"] as const).filter((key) => {
    if (drill && key === drill.scope) return true;
    if (key === "club") return access.library;
    if (key === "section")
      return access.library && (drill ? Boolean(drill.section) : sections.length > 0);
    if (key === "team") return teams.length > 0;
    return access.create;
  });
  /** Al editar, la sección queda fija y el equipo solo se elige al pasar la tarea a un equipo. */
  const moving = drill !== null && form.scope !== drill.scope;
  const sectionLocked = drill !== null;
  const teamLocked = drill !== null && !moving;

  const sectionOfForm =
    form.scope === "club"
      ? null
      : form.scope === "team"
        ? (teams.find((x) => x.id === form.teamId)?.sectionId ?? null)
        : form.sectionId || null;
  const available = contents.filter(
    (x) =>
      (x.status === "active" || form.contentIds.includes(x.id)) &&
      (!sectionOfForm || x.sectionId === sectionOfForm),
  );
  const chosen = form.contentIds.filter((id) => available.some((x) => x.id === id));
  const groups = sections
    .map((section) => ({ section, items: available.filter((x) => x.sectionId === section.id) }))
    .filter((g) => g.items.length > 0);

  function toggleContent(id: string) {
    set(
      "contentIds",
      chosen.includes(id)
        ? chosen.filter((x) => x !== id)
        : chosen.length < 8
          ? [...chosen, id]
          : chosen,
    );
  }
  function toggleTag(tag: RestrictionTag) {
    set(
      "restrictionTags",
      form.restrictionTags.includes(tag)
        ? form.restrictionTags.filter((x) => x !== tag)
        : [...form.restrictionTags, tag],
    );
  }

  /**
   * La voz va aparte de la tarea y después de guardarla: la API la acepta solo si la pizarra ya
   * tiene movimiento. Sin movimiento, la propia API la quita al guardar.
   */
  async function saveVoice(saved: DrillDetail) {
    if (!saved.diagram?.animation) return;
    if (voice.blob) {
      const type = voice.blob.type || "audio/webm";
      await uploadFile(
        `/api/org/drills/${saved.id}/audio`,
        new File([voice.blob], "voz", { type }),
        DrillResponseSchema,
      );
    } else if (voice.removed && saved.audioUrl) {
      await apiFetch(`/api/org/drills/${saved.id}/audio`, {
        method: "DELETE",
        schema: DrillResponseSchema,
      });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const int = (value: string) => (value.trim() === "" ? null : Number.parseInt(value, 10));
    const text = (value: string) => value.trim() || null;
    const min = int(form.playersMin);
    const max = int(form.playersMax);
    if (!form.name.trim()) return setProblem(t("errors.name"));
    if (min !== null && max !== null && min > max) return setProblem(t("errors.players"));
    if ((form.scope === "section" && !form.sectionId) || (form.scope === "team" && !form.teamId))
      return setProblem(t("errors.where"));
    setProblem(null);
    const empty = form.diagram.pieces.length === 0 && form.diagram.arrows.length === 0;
    const fields = {
      name: form.name.trim(),
      description: text(form.description),
      rules: text(form.rules),
      coachingPoints: text(form.coachingPoints),
      variants: text(form.variants),
      format: text(form.format),
      space: text(form.space),
      playersMin: min,
      playersMax: max,
      durationMin: int(form.durationMin),
      targetRpe: int(form.targetRpe),
      material: text(form.material),
      diagram: empty ? null : form.diagram,
      videoUrl: text(form.videoUrl),
      restrictionTags: form.restrictionTags,
      contentIds: chosen,
    };
    setSaving(true);
    try {
      if (drill) {
        const body: DrillUpdate = {
          ...fields,
          ...(moving
            ? { scope: form.scope, ...(form.scope === "team" ? { teamId: form.teamId } : {}) }
            : {}),
        };
        const saved = await apiFetch(`/api/org/drills/${drill.id}`, {
          method: "PATCH",
          body,
          schema: DrillResponseSchema,
        });
        await saveVoice(saved.drill);
        toast("success", t("saved"));
        void client.invalidateQueries({ queryKey: ["org", slug] });
        onDone?.();
      } else {
        const body: DrillCreate = {
          ...fields,
          scope: form.scope,
          sectionId:
            form.scope === "section" || form.scope === "personal" ? form.sectionId || null : null,
          teamId: form.scope === "team" ? form.teamId : null,
        };
        const res = await apiFetch("/api/org/drills", {
          method: "POST",
          body,
          schema: DrillResponseSchema,
        });
        await saveVoice(res.drill);
        toast("success", t("created"));
        void client.invalidateQueries({ queryKey: ["org", slug] });
        void navigate(paths.drill(res.drill.id), { replace: true });
      }
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setSaving(false);
    }
  }

  const textarea = (key: "description" | "rules" | "coachingPoints" | "variants", rows = 3) => (
    <Field label={f(key)}>
      {(id) => (
        <textarea
          id={id}
          rows={rows}
          maxLength={2000}
          className={textareaClass}
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </Field>
  );

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void submit(e)} noValidate>
      <PageHeader
        backTo={drill ? paths.drill(drill.id) : paths.drills}
        backLabel={drill ? drill.name : t("backToLibrary")}
        title={drill ? drill.name : t("newTitle")}
        description={drill ? undefined : t("newDescription")}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("cards.data")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={f("name")}>
                  {(id, describedBy) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      required
                      maxLength={80}
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <Field label={f("scope")} hint={f("scopeHint")}>
                {(id, describedBy) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={form.scope}
                    onChange={(e) => set("scope", e.target.value as DrillScope)}
                  >
                    {scopes.map((key) => (
                      <option key={key} value={key}>
                        {s(key)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {form.scope === "section" || form.scope === "personal" ? (
                <Field label={f("section")} hint={sectionLocked ? f("fixedWhere") : undefined}>
                  {(id, describedBy) => (
                    <Select
                      id={id}
                      aria-describedby={describedBy}
                      disabled={sectionLocked}
                      value={form.sectionId}
                      onChange={(e) => set("sectionId", e.target.value)}
                    >
                      {form.scope === "personal" || !form.sectionId ? (
                        <option value="">{f("noSection")}</option>
                      ) : null}
                      {sections.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}
              {form.scope === "team" ? (
                <Field label={f("team")} hint={teamLocked ? f("fixedWhere") : undefined}>
                  {(id, describedBy) => (
                    <Select
                      id={id}
                      aria-describedby={describedBy}
                      disabled={teamLocked}
                      value={form.teamId}
                      onChange={(e) => set("teamId", e.target.value)}
                    >
                      {!form.teamId ? <option value="">—</option> : null}
                      {sections
                        .map((section) => ({
                          section,
                          items: teams.filter((x) => x.sectionId === section.id),
                        }))
                        .filter((g) => g.items.length > 0)
                        .map((g) => (
                          <optgroup key={g.section.id} label={g.section.name}>
                            {g.items.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                    </Select>
                  )}
                </Field>
              ) : null}
              <Field label={f("format")} hint={f("formatHint")}>
                {(id, describedBy) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    maxLength={30}
                    value={form.format}
                    onChange={(e) => set("format", e.target.value)}
                  />
                )}
              </Field>
              <Field label={f("space")} hint={f("spaceHint")}>
                {(id, describedBy) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    maxLength={60}
                    value={form.space}
                    onChange={(e) => set("space", e.target.value)}
                  />
                )}
              </Field>
              <Field label={f("playersMin")}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={60}
                    value={form.playersMin}
                    onChange={(e) => set("playersMin", e.target.value)}
                  />
                )}
              </Field>
              <Field label={f("playersMax")}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={60}
                    value={form.playersMax}
                    onChange={(e) => set("playersMax", e.target.value)}
                  />
                )}
              </Field>
              <Field label={f("duration")}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={240}
                    value={form.durationMin}
                    onChange={(e) => set("durationMin", e.target.value)}
                  />
                )}
              </Field>
              <Field label={f("targetRpe")} hint={f("targetRpeHint")}>
                {(id, describedBy) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={form.targetRpe}
                    onChange={(e) => set("targetRpe", e.target.value)}
                  >
                    <option value="">{f("noRpe")}</option>
                    {Array.from({ length: 11 }, (_, n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={f("material")}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={400}
                    value={form.material}
                    onChange={(e) => set("material", e.target.value)}
                  />
                )}
              </Field>
              <Field label={f("video")} hint={f("videoHint")}>
                {(id, describedBy) => (
                  <Input
                    id={id}
                    type="url"
                    inputMode="url"
                    aria-describedby={describedBy}
                    maxLength={400}
                    placeholder="https://"
                    value={form.videoUrl}
                    onChange={(e) => set("videoUrl", e.target.value)}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card title={t("cards.board")}>
            <DrillBoardEditor
              value={form.diagram}
              onChange={(diagram) => set("diagram", diagram)}
              audio={{
                blob: voice.blob,
                url: voice.removed ? null : (drill?.audioUrl ?? null),
              }}
              onAudioChange={(blob) => setVoice({ blob, removed: blob === null })}
            />
          </Card>

          <Card title={t("cards.development")}>
            <div className="flex flex-col gap-4">
              {textarea("description", 4)}
              {textarea("rules")}
              {textarea("coachingPoints")}
              {textarea("variants")}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("cards.contents")}>
            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-secondary font-medium text-ink">{f("contents")}</legend>
                <p className="text-secondary text-muted">{f("contentsHint")}</p>
                {groups.length === 0 ? (
                  <p className="text-secondary text-muted">{t("noContents")}</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.section.id} className="flex flex-col gap-1.5">
                      {groups.length > 1 ? (
                        <span className="text-label font-semibold uppercase tracking-wide text-muted">
                          {g.section.name}
                        </span>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5">
                        {g.items.map((x) => {
                          const on = chosen.includes(x.id);
                          return (
                            <button
                              key={x.id}
                              type="button"
                              aria-pressed={on}
                              disabled={!on && chosen.length >= 8}
                              onClick={() => toggleContent(x.id)}
                              className={`inline-flex min-h-10 items-center gap-1.5 rounded-chip px-3 text-secondary font-medium transition-colors disabled:opacity-50 ${
                                on
                                  ? "bg-club text-on-club"
                                  : "bg-raised text-ink hover:bg-club-soft"
                              }`}
                            >
                              {on ? <Icon.Check size={14} aria-hidden="true" /> : null}
                              {x.name}
                              {chosen[0] === x.id ? (
                                <span className="text-label opacity-80">· {t("primary")}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-secondary font-medium text-ink">{f("restrictions")}</legend>
                <p className="text-secondary text-muted">{f("restrictionsHint")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {RESTRICTION_TAGS.map((tag) => {
                    const on = form.restrictionTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(tag)}
                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-chip px-3 text-secondary font-medium transition-colors ${
                          on ? "bg-club text-on-club" : "bg-raised text-ink hover:bg-club-soft"
                        }`}
                      >
                        {on ? <Icon.Check size={14} aria-hidden="true" /> : null}
                        {tags(tag)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </Card>
        </div>
      </div>

      {problem ? <Alert kind="error">{problem}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {drill ? (
          <Button type="button" variant="tertiary" onClick={onDone}>
            {c("cancel")}
          </Button>
        ) : (
          <Button type="button" variant="tertiary" onClick={() => void navigate(paths.drills)}>
            {c("cancel")}
          </Button>
        )}
        <Button type="submit" action="save" loading={saving}>
          {c("save")}
        </Button>
      </div>
    </form>
  );
}

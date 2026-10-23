import {
  DEFAULT_INSIGHT_THRESHOLDS,
  MicrocycleTemplateResponseSchema,
  SectionEquipmentResponseSchema,
  SectionMatchConfigResponseSchema,
  TRAINING_CONTENT_KINDS,
  TRAINING_TRACKING_LEVELS,
  TrainingConfigResponseSchema,
  type InsightThresholds,
  type MicrocycleDay,
  type MicrocycleTemplate,
  type SectionEquipment,
  type TrainingConfigResponse,
  type TrainingContent,
  type TrainingContentKind,
  type TrainingTrackingLevel,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { KindBar } from "@/routes/club/section-methodology";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  DataList,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  useToast,
  type RowAction,
} from "@/ui";

type Methodology = Record<string, Target>;
type Target = Record<TrainingContentKind, number>;
const ZERO_TARGET = Object.fromEntries(TRAINING_CONTENT_KINDS.map((k) => [k, 0])) as Target;

/** Etiqueta del día respecto al partido: −3 → "MD-3", 0 → "MD", +1 → "MD+1". */
export const mdOf = (offset: number) =>
  offset === 0 ? "MD" : offset > 0 ? `MD+${offset}` : `MD${offset}`;

/**
 * Ajustes de entrenamiento de una sección (ADR 0039): el nivel de seguimiento, los umbrales de las
 * recomendaciones, el reparto objetivo de contenidos por categoría, el catálogo de contenidos y
 * las semanas tipo. El deporte propone; la sección decide. Sin permiso se ve, no se cambia.
 */
export function SectionTrainingConfigPage() {
  const t = useT("trainingConfig");
  const c = useT("common");
  const errors = useT("errors");
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const client = useQueryClient();

  const config = useQuery({
    queryKey: ["org", slug, "section", id, "training-config"],
    queryFn: () =>
      apiFetch(`/api/org/sections/${id}/training-config`, {
        schema: TrainingConfigResponseSchema,
      }),
    retry: false,
  });
  // Los nombres de las acciones del partido, para el puente con los contenidos. Si no se pueden
  // leer, se enseñan las claves.
  const matchConfig = useQuery({
    queryKey: ["org", slug, "section", id, "match-config"],
    queryFn: () =>
      apiFetch(`/api/org/sections/${id}/match-config`, {
        schema: SectionMatchConfigResponseSchema,
      }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  if (config.isError) {
    const notFound = config.error instanceof ApiClientError && config.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(config.error))}</Alert>
    );
  }
  if (!config.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const data = config.data;
  const canWrite = data.access.configure;
  const actions = (matchConfig.data?.actionTypes ?? []).filter((a) => a.status === "active");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.section(id)}
        backLabel={t("back", { section: data.section.name })}
        eyebrow={data.section.name}
        title={t("title")}
        description={t("description")}
        actions={
          <ButtonLink
            to={paths.sectionMethodology(id)}
            variant="secondary"
            icon={<Icon.ChartBar size={18} aria-hidden="true" />}
          >
            {t("methodologyLink")}
          </ButtonLink>
        }
      />
      {!canWrite ? <Alert kind="info">{t("readOnly")}</Alert> : null}

      <TrackingCard data={data} canWrite={canWrite} onSaved={() => void reload()} />
      <ThresholdsCard data={data} canWrite={canWrite} onSaved={() => void reload()} />
      <MethodologyCard data={data} canWrite={canWrite} onSaved={() => void reload()} />
      <NotesCard data={data} canWrite={canWrite} onSaved={() => void reload()} />
      <ContentsCard
        data={data}
        actions={actions.map((a) => ({ code: a.code, name: a.name }))}
        canWrite={canWrite}
        onSaved={() => void reload()}
      />
      <EquipmentCard data={data} canWrite={canWrite} onSaved={() => void reload()} />
      <TemplatesCard data={data} canWrite={canWrite} onSaved={() => void reload()} />
    </div>
  );
}

/** PATCH de los ajustes con el aviso de vuelta; lo comparten las tres tarjetas de ajustes. */
function usePatchSettings(sectionId: string, onSaved: () => void) {
  const t = useT("trainingConfig");
  const errors = useT("errors");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await apiFetch(`/api/org/sections/${sectionId}/training-config`, {
        method: "PATCH",
        body,
        schema: TrainingConfigResponseSchema,
      });
      toast("success", t("saved"));
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }
  return { busy, patch };
}

// --- Seguimiento ---

function TrackingCard({
  data,
  canWrite,
  onSaved,
}: {
  data: TrainingConfigResponse;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.tracking");
  const c = useT("common");
  const { busy, patch } = usePatchSettings(data.section.id, onSaved);
  const [tracking, setTracking] = useState<TrainingTrackingLevel>(data.settings.tracking);
  const [formative, setFormative] = useState<"auto" | "yes" | "no">(
    data.settings.formative === null ? "auto" : data.settings.formative ? "yes" : "no",
  );
  useEffect(() => {
    setTracking(data.settings.tracking);
    setFormative(
      data.settings.formative === null ? "auto" : data.settings.formative ? "yes" : "no",
    );
  }, [data.settings.tracking, data.settings.formative]);

  return (
    <Card
      title={t("title")}
      description={t("description")}
      footer={
        canWrite ? (
          <Button
            action="save"
            loading={busy}
            onClick={() =>
              void patch({
                tracking,
                formative: formative === "auto" ? null : formative === "yes",
              })
            }
          >
            {c("save")}
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">{t("title")}</legend>
          {TRAINING_TRACKING_LEVELS.map((level) => (
            <label
              key={level}
              className={`flex cursor-pointer gap-3 rounded-field border p-4 ${
                tracking === level ? "border-club bg-club-soft" : "border-border"
              } ${canWrite ? "" : "cursor-default opacity-90"}`}
            >
              <input
                type="radio"
                name="tracking"
                value={level}
                className="mt-1 size-5 accent-[var(--club-fill)]"
                checked={tracking === level}
                disabled={!canWrite}
                onChange={() => setTracking(level)}
              />
              <span className="flex flex-col gap-1">
                <span className="text-body font-semibold text-ink">
                  {t(`levels.${level}.name`)}
                </span>
                <span className="text-secondary text-muted">{t(`levels.${level}.detail`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="max-w-sm">
          <Field label={t("formative")} hint={t("formativeHint")}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                disabled={!canWrite}
                value={formative}
                onChange={(e) => setFormative(e.target.value as "auto" | "yes" | "no")}
              >
                <option value="auto">{t("formativeAuto")}</option>
                <option value="yes">{t("formativeYes")}</option>
                <option value="no">{t("formativeNo")}</option>
              </Select>
            )}
          </Field>
        </div>
      </div>
    </Card>
  );
}

// --- Umbrales ---

type ThresholdKey = keyof InsightThresholds;
interface ThresholdSpec {
  key: ThresholdKey;
  min: number;
  max: number;
  step: number;
  /** Se muestra en porcentaje y se guarda como proporción (0,4 ↔ 40 %). */
  percent?: boolean;
}

/** Los umbrales agrupados por lo que vigilan; los límites son los del esquema. */
const THRESHOLD_GROUPS: { key: string; items: ThresholdSpec[] }[] = [
  {
    key: "load",
    items: [
      { key: "weeklyLoadHigh", min: 1, max: 3, step: 0.05 },
      { key: "weeklyLoadLow", min: 0, max: 1, step: 0.05 },
      { key: "acwrHigh", min: 1, max: 3, step: 0.05 },
      { key: "acwrLow", min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    key: "match",
    items: [
      { key: "finishingDropPoints", min: 1, max: 50, step: 1 },
      { key: "turnoverRatio", min: 1, max: 3, step: 0.05 },
      { key: "earlyFoulMinute", min: 1, max: 60, step: 1 },
      { key: "lateGoalsShare", min: 10, max: 100, step: 5, percent: true },
      { key: "lateMinutes", min: 1, max: 15, step: 1 },
    ],
  },
  {
    key: "minutes",
    items: [
      { key: "recoveryMinutes", min: 1, max: 90, step: 1 },
      { key: "compensatoryMinutes", min: 0, max: 90, step: 1 },
    ],
  },
  {
    key: "players",
    items: [
      { key: "attendanceMin", min: 0, max: 100, step: 5 },
      { key: "focusMinutes", min: 0, max: 600, step: 5 },
    ],
  },
];

const shown = (spec: ThresholdSpec, value: number) =>
  spec.percent ? Math.round(value * 100) : value;

function ThresholdsCard({
  data,
  canWrite,
  onSaved,
}: {
  data: TrainingConfigResponse;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.thresholds");
  const c = useT("common");
  const { busy, patch } = usePatchSettings(data.section.id, onSaved);
  const [draft, setDraft] = useState<Record<ThresholdKey, string>>(() =>
    asText(data.settings.thresholds),
  );
  const [resetting, setResetting] = useState(false);
  useEffect(() => setDraft(asText(data.settings.thresholds)), [data.settings.thresholds]);

  function asText(values: InsightThresholds) {
    const out = {} as Record<ThresholdKey, string>;
    for (const group of THRESHOLD_GROUPS)
      for (const spec of group.items) out[spec.key] = String(shown(spec, values[spec.key]));
    return out;
  }
  function parsed(): InsightThresholds | null {
    const out = { ...data.settings.thresholds };
    for (const group of THRESHOLD_GROUPS)
      for (const spec of group.items) {
        const v = Number(draft[spec.key].replace(",", "."));
        if (!Number.isFinite(v) || v < spec.min || v > spec.max) return null;
        out[spec.key] = spec.percent ? v / 100 : spec.step >= 1 ? Math.round(v) : v;
      }
    return out;
  }
  const valid = parsed() !== null;

  return (
    <Card
      title={t("title")}
      description={t("description")}
      footer={
        canWrite ? (
          <>
            <Button action="restore" variant="secondary" onClick={() => setResetting(true)}>
              {t("reset")}
            </Button>
            <Button
              action="save"
              loading={busy}
              disabled={!valid}
              onClick={() => {
                const thresholds = parsed();
                if (thresholds) void patch({ thresholds });
              }}
            >
              {c("save")}
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-col gap-6">
        {THRESHOLD_GROUPS.map((group) => (
          <fieldset key={group.key} className="flex flex-col gap-3">
            <legend className="pb-2 text-label font-semibold uppercase tracking-wide text-muted">
              {t(`groups.${group.key}`)}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {group.items.map((spec) => {
                const value = Number(draft[spec.key].replace(",", "."));
                const invalid = !Number.isFinite(value) || value < spec.min || value > spec.max;
                return (
                  <Field
                    key={spec.key}
                    label={t(`items.${spec.key}.label`)}
                    hint={t("hint", {
                      text: t(`items.${spec.key}.hint`),
                      value: shown(spec, DEFAULT_INSIGHT_THRESHOLDS[spec.key]),
                    })}
                    error={invalid ? t("range", { min: spec.min, max: spec.max }) : undefined}
                  >
                    {(id, describedBy) => (
                      <Input
                        id={id}
                        type="number"
                        inputMode="decimal"
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        className="font-mono"
                        aria-describedby={describedBy}
                        aria-invalid={invalid || undefined}
                        disabled={!canWrite}
                        value={draft[spec.key]}
                        onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <ConfirmDialog
        open={resetting}
        title={t("resetTitle")}
        body={t("resetBody")}
        confirmLabel={t("reset")}
        confirmAction="restore"
        cancelLabel={c("cancel")}
        onConfirm={() => {
          setResetting(false);
          void patch({ thresholds: DEFAULT_INSIGHT_THRESHOLDS });
        }}
        onCancel={() => setResetting(false)}
      />
    </Card>
  );
}

// --- Metodología ---

/** Los seis tipos en cada categoría para editarlos; sin objetivo, todo a cero. */
const methodologyDraft = (data: TrainingConfigResponse): Methodology =>
  Object.fromEntries(
    data.categories.map((cat) => [
      cat.id,
      { ...ZERO_TARGET, ...data.settings.methodology[cat.id] },
    ]),
  );

function MethodologyCard({
  data,
  canWrite,
  onSaved,
}: {
  data: TrainingConfigResponse;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.methodology");
  const k = useT("contentKinds");
  const c = useT("common");
  const { busy, patch } = usePatchSettings(data.section.id, onSaved);
  const [draft, setDraft] = useState<Methodology>(() => methodologyDraft(data));
  useEffect(() => setDraft(methodologyDraft(data)), [data]);

  if (data.categories.length === 0)
    return (
      <Card title={t("title")} description={t("description")}>
        <p className="text-secondary text-muted">{t("noCategories")}</p>
      </Card>
    );

  const sum = (target: Target) =>
    TRAINING_CONTENT_KINDS.reduce((acc, kind) => acc + target[kind], 0);
  const anyOver = data.categories.some((cat) => sum(draft[cat.id] ?? ZERO_TARGET) > 100);

  return (
    <Card
      title={t("title")}
      description={t("description")}
      footer={
        canWrite ? (
          <Button
            action="save"
            loading={busy}
            disabled={anyOver}
            onClick={() => void patch({ methodology: draft })}
          >
            {c("save")}
          </Button>
        ) : null
      }
    >
      <ul className="flex flex-col divide-y divide-line">
        {data.categories.map((cat) => {
          const target = draft[cat.id] ?? ZERO_TARGET;
          const total = sum(target);
          return (
            <li key={cat.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body font-semibold text-ink">{cat.name}</span>
                <StatusChip
                  kind={
                    total === 100
                      ? "success"
                      : total === 0
                        ? "neutral"
                        : total > 100
                          ? "danger"
                          : "warning"
                  }
                >
                  {total === 0 ? t("noTarget") : t("sum", { value: total })}
                </StatusChip>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {TRAINING_CONTENT_KINDS.map((kind) => (
                  <Field key={kind} label={k(kind)}>
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={5}
                        className="font-mono"
                        disabled={!canWrite}
                        value={target[kind]}
                        onChange={(e) => {
                          const v = Math.max(
                            0,
                            Math.min(100, Math.round(Number(e.target.value) || 0)),
                          );
                          setDraft((d) => ({ ...d, [cat.id]: { ...target, [kind]: v } }));
                        }}
                      />
                    )}
                  </Field>
                ))}
              </div>
              {total > 0 ? (
                <KindBar shares={target} label={t("summary", { category: cat.name })} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// --- Contenidos ---

function ContentsCard({
  data,
  actions,
  canWrite,
  onSaved,
}: {
  data: TrainingConfigResponse;
  actions: { code: string; name: string }[];
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.contents");
  const k = useT("contentKinds");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [sheet, setSheet] = useState<"new" | TrainingContent | null>(null);
  const [removing, setRemoving] = useState<TrainingContent | null>(null);
  const active = data.contents
    .filter((ct) => ct.status === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const archived = data.contents.filter((ct) => ct.status === "archived");
  const actionName = (code: string) => actions.find((a) => a.code === code)?.name ?? code;
  const related = (ct: TrainingContent) => ct.relatedActionCodes.map(actionName).join(", ");

  async function remove(ct: TrainingContent) {
    setRemoving(null);
    try {
      const next = await apiFetch(
        `/api/org/sections/${data.section.id}/training-contents/${ct.id}`,
        {
          method: "DELETE",
          schema: TrainingConfigResponseSchema,
        },
      );
      // Si ya se usaba, la API lo archiva en vez de borrarlo.
      const kept = next.contents.some((x) => x.id === ct.id);
      toast("success", kept ? t("archived", { name: ct.name }) : t("removed", { name: ct.name }));
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function restore(ct: TrainingContent) {
    try {
      await apiFetch(`/api/org/sections/${data.section.id}/training-contents/${ct.id}`, {
        method: "PATCH",
        body: { status: "active" },
        schema: TrainingConfigResponseSchema,
      });
      toast("success", t("restored", { name: ct.name }));
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <Card
      title={t("title")}
      description={t("description")}
      padded={false}
      actions={
        canWrite ? (
          <Button action="add" size="sm" onClick={() => setSheet("new")}>
            {t("new")}
          </Button>
        ) : null
      }
    >
      <DataList<TrainingContent>
        caption={t("title")}
        rows={active}
        getKey={(ct) => ct.id}
        empty={<EmptyState icon={<Icon.ListChecks weight="duotone" />} title={t("empty")} />}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            cell: (ct) => (
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-ink">{ct.name}</span>
                <span className="font-mono text-label text-muted">{ct.code}</span>
              </span>
            ),
          },
          { key: "kind", header: t("table.kind"), cell: (ct) => k(ct.kind) },
          {
            key: "related",
            header: t("table.related"),
            cell: (ct) => <span className="text-secondary text-muted">{related(ct) || "—"}</span>,
          },
        ]}
        mobileRow={(ct) => ({
          title: ct.name,
          subtitle: [k(ct.kind), related(ct)].filter(Boolean).join(" · "),
        })}
        rowActions={
          canWrite
            ? (ct): RowAction[] => [
                { key: "edit", label: c("edit"), action: "edit", onClick: () => setSheet(ct) },
                {
                  key: "remove",
                  label: c("remove"),
                  action: "delete",
                  tone: "danger",
                  onClick: () => setRemoving(ct),
                },
              ]
            : undefined
        }
      />
      {archived.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
          <span className="text-label uppercase tracking-wide text-muted">
            {t("archivedTitle")}
          </span>
          <ul className="flex flex-wrap gap-2">
            {archived.map((ct) => (
              <li
                key={ct.id}
                className="flex items-center gap-1 rounded-chip bg-raised px-3 py-1 text-secondary text-muted"
              >
                {ct.name}
                {canWrite ? (
                  <button
                    type="button"
                    className="min-h-9 px-1 font-medium text-club-text"
                    onClick={() => void restore(ct)}
                  >
                    {t("restore")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canWrite && sheet ? (
        <ContentSheet
          sectionId={data.section.id}
          content={sheet === "new" ? null : sheet}
          nextOrder={(active.at(-1)?.sortOrder ?? 0) + 10}
          actions={actions}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            onSaved();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("confirmRemoveTitle", { name: removing?.name ?? "" })}
        body={t("confirmRemoveBody")}
        confirmLabel={c("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

function ContentSheet({
  sectionId,
  content,
  nextOrder,
  actions,
  onClose,
  onSaved,
}: {
  sectionId: string;
  content: TrainingContent | null;
  nextOrder: number;
  actions: { code: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.contentSheet");
  const k = useT("contentKinds");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(content?.name ?? "");
  const [kind, setKind] = useState<TrainingContentKind>(content?.kind ?? "technical");
  const [codes, setCodes] = useState<string[]>(content?.relatedActionCodes ?? []);
  const [codesText, setCodesText] = useState((content?.relatedActionCodes ?? []).join(", "));
  const [order, setOrder] = useState(String(content?.sortOrder ?? nextOrder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sin catálogo de acciones a mano (no se pudo leer), las claves se escriben separadas por comas.
  const known = actions.length > 0;
  // Claves guardadas que ya no están en el catálogo activo: se conservan.
  const orphan = codes.filter((code) => !actions.some((a) => a.code === code));

  function toggle(code: string, on: boolean) {
    setCodes((list) => (on ? [...list, code] : list.filter((x) => x !== code)).slice(0, 12));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const related = known
      ? codes
      : codesText
          .split(",")
          .map((x) => x.trim())
          .filter((x) => /^[a-z][a-z0-9_]{1,39}$/.test(x))
          .slice(0, 12);
    const body: Record<string, unknown> = { name: name.trim(), kind, relatedActionCodes: related };
    if (content) body.sortOrder = Math.max(0, Math.min(10_000, Math.round(Number(order) || 0)));
    try {
      await apiFetch(
        content
          ? `/api/org/sections/${sectionId}/training-contents/${content.id}`
          : `/api/org/sections/${sectionId}/training-contents`,
        { method: content ? "PATCH" : "POST", body, schema: TrainingConfigResponseSchema },
      );
      toast("success", content ? t("saved") : t("created", { name: body.name as string }));
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409
          ? t("codeTaken")
          : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={content ? t("editTitle", { name: content.name }) : t("newTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={content ? "save" : "add"}
            type="submit"
            form="content-form"
            loading={busy}
            disabled={!name.trim()}
          >
            {content ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="content-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field
          label={t("name")}
          hint={content ? t("codeHint", { code: content.code }) : t("nameHint")}
        >
          {(id, describedBy) => (
            <Input
              id={id}
              required
              maxLength={80}
              aria-describedby={describedBy}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("kind")}>
            {(id) => (
              <Select
                id={id}
                value={kind}
                onChange={(e) => setKind(e.target.value as TrainingContentKind)}
              >
                {TRAINING_CONTENT_KINDS.map((x) => (
                  <option key={x} value={x}>
                    {k(x)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {content ? (
            <Field label={t("order")} hint={t("orderHint")}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={10_000}
                  step={10}
                  className="font-mono"
                  aria-describedby={describedBy}
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                />
              )}
            </Field>
          ) : null}
        </div>
        {known ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-secondary font-medium text-ink">{t("related")}</legend>
            <p className="pb-1 text-secondary text-muted">{t("relatedHint")}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {[...actions, ...orphan.map((code) => ({ code, name: code }))].map((a) => (
                <label key={a.code} className="flex min-h-11 items-center gap-3 text-body text-ink">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--club-fill)]"
                    checked={codes.includes(a.code)}
                    disabled={!codes.includes(a.code) && codes.length >= 12}
                    onChange={(e) => toggle(a.code, e.target.checked)}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <Field label={t("related")} hint={t("relatedCodesHint")}>
            {(id, describedBy) => (
              <Input
                id={id}
                className="font-mono"
                aria-describedby={describedBy}
                value={codesText}
                onChange={(e) => setCodesText(e.target.value)}
              />
            )}
          </Field>
        )}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

// --- Semanas tipo ---

function TemplatesCard({
  data,
  canWrite,
  onSaved,
}: {
  data: TrainingConfigResponse;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.templates");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [sheet, setSheet] = useState<"new" | MicrocycleTemplate | null>(null);
  const [removing, setRemoving] = useState<MicrocycleTemplate | null>(null);
  const daysOf = (tpl: MicrocycleTemplate) =>
    [...tpl.days]
      .sort((a, b) => a.offset - b.offset)
      .map((d) => mdOf(d.offset))
      .join(" · ");

  async function remove(tpl: MicrocycleTemplate) {
    setRemoving(null);
    try {
      await apiFetch(`/api/org/sections/${data.section.id}/microcycle-templates/${tpl.id}`, {
        method: "DELETE",
      });
      toast("success", t("removed", { name: tpl.name }));
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <Card
      title={t("title")}
      description={t("description")}
      padded={false}
      actions={
        canWrite ? (
          <Button action="add" size="sm" onClick={() => setSheet("new")}>
            {t("new")}
          </Button>
        ) : null
      }
    >
      <DataList<MicrocycleTemplate>
        caption={t("title")}
        rows={data.templates}
        getKey={(tpl) => tpl.id}
        empty={
          <EmptyState
            icon={<Icon.CalendarBlank weight="duotone" />}
            title={t("empty")}
            description={t("emptyHint")}
          />
        }
        columns={[
          {
            key: "name",
            header: t("table.name"),
            cell: (tpl) => <span className="font-medium text-ink">{tpl.name}</span>,
          },
          {
            key: "days",
            header: t("table.days"),
            cell: (tpl) => <span className="font-mono text-secondary">{daysOf(tpl)}</span>,
          },
          {
            key: "minutes",
            header: t("table.minutes"),
            numeric: true,
            cell: (tpl) => tpl.days.reduce((acc, d) => acc + d.minutes, 0),
          },
        ]}
        mobileRow={(tpl) => ({ title: tpl.name, subtitle: daysOf(tpl) })}
        rowActions={
          canWrite
            ? (tpl): RowAction[] => [
                { key: "edit", label: c("edit"), action: "edit", onClick: () => setSheet(tpl) },
                {
                  key: "remove",
                  label: c("remove"),
                  action: "delete",
                  tone: "danger",
                  onClick: () => setRemoving(tpl),
                },
              ]
            : undefined
        }
      />
      {canWrite && sheet ? (
        <TemplateSheet
          sectionId={data.section.id}
          template={sheet === "new" ? null : sheet}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            onSaved();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("confirmRemoveTitle", { name: removing?.name ?? "" })}
        body={t("confirmRemoveBody")}
        confirmLabel={c("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

interface DayDraft {
  offset: number;
  objective: string;
  minutes: string;
  targetRpe: string;
  startsAt: string;
}
const OFFSETS = Array.from({ length: 13 }, (_, i) => i - 6);
/** Semana de un partido por defecto: MD-4 a MD-1, la carga baja al acercarse el partido. */
const DEFAULT_DAYS: DayDraft[] = [
  { offset: -4, objective: "", minutes: "75", targetRpe: "6", startsAt: "" },
  { offset: -3, objective: "", minutes: "90", targetRpe: "7", startsAt: "" },
  { offset: -2, objective: "", minutes: "75", targetRpe: "5", startsAt: "" },
  { offset: -1, objective: "", minutes: "60", targetRpe: "3", startsAt: "" },
];
const toDraft = (d: MicrocycleDay): DayDraft => ({
  offset: d.offset,
  objective: d.objective,
  minutes: String(d.minutes),
  targetRpe: String(d.targetRpe),
  startsAt: d.startsAt ?? "",
});

function TemplateSheet({
  sectionId,
  template,
  onClose,
  onSaved,
}: {
  sectionId: string;
  template: MicrocycleTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.templateSheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(template?.name ?? "");
  const [days, setDays] = useState<DayDraft[]>(
    template ? [...template.days].sort((a, b) => a.offset - b.offset).map(toDraft) : DEFAULT_DAYS,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedDays = days.map((d) => ({
    offset: d.offset,
    objective: d.objective.trim(),
    minutes: Math.round(Number(d.minutes)),
    targetRpe: Math.round(Number(d.targetRpe)),
    ...(d.startsAt ? { startsAt: d.startsAt } : {}),
  }));
  const offsets = new Set(days.map((d) => d.offset));
  const valid =
    name.trim().length > 0 &&
    days.length > 0 &&
    offsets.size === days.length &&
    parsedDays.every(
      (d) => d.minutes >= 1 && d.minutes <= 240 && d.targetRpe >= 0 && d.targetRpe <= 10,
    );

  function update(i: number, patch: Partial<DayDraft>) {
    setDays((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }
  function addDay() {
    const free =
      OFFSETS.find((o) => !offsets.has(o) && o < 0) ?? OFFSETS.find((o) => !offsets.has(o));
    if (free === undefined) return;
    setDays((list) =>
      [...list, { offset: free, objective: "", minutes: "60", targetRpe: "5", startsAt: "" }].sort(
        (a, b) => a.offset - b.offset,
      ),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        template
          ? `/api/org/sections/${sectionId}/microcycle-templates/${template.id}`
          : `/api/org/sections/${sectionId}/microcycle-templates`,
        {
          method: template ? "PUT" : "POST",
          body: { name: name.trim(), days: [...parsedDays].sort((a, b) => a.offset - b.offset) },
          schema: MicrocycleTemplateResponseSchema,
        },
      );
      toast("success", template ? t("saved") : t("created", { name: name.trim() }));
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409
          ? t("nameTaken")
          : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={template ? t("editTitle", { name: template.name }) : t("newTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={template ? "save" : "add"}
            type="submit"
            form="template-form"
            loading={busy}
            disabled={!valid}
          >
            {template ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="template-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")} hint={t("nameHint")}>
          {(id, describedBy) => (
            <Input
              id={id}
              required
              maxLength={80}
              aria-describedby={describedBy}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <ol className="flex flex-col gap-3">
          {days.map((d, i) => (
            <li key={i} className="flex flex-col gap-3 rounded-field border border-border p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field
                    label={t("day")}
                    error={
                      offsets.size !== days.length &&
                      days.filter((x) => x.offset === d.offset).length > 1
                        ? t("dayRepeated")
                        : undefined
                    }
                  >
                    {(id) => (
                      <Select
                        id={id}
                        className="font-mono"
                        value={d.offset}
                        onChange={(e) => update(i, { offset: Number(e.target.value) })}
                      >
                        {OFFSETS.map((o) => (
                          <option key={o} value={o}>
                            {mdOf(o)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                <Button
                  variant="ghost-danger"
                  action="delete"
                  iconOnly
                  disabled={days.length <= 1}
                  onClick={() => setDays((list) => list.filter((_, j) => j !== i))}
                >
                  {t("removeDay", { day: mdOf(d.offset) })}
                </Button>
              </div>
              <Field label={t("objective")}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={160}
                    value={d.objective}
                    onChange={(e) => update(i, { objective: e.target.value })}
                  />
                )}
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t("minutes")}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={240}
                      className="font-mono"
                      value={d.minutes}
                      onChange={(e) => update(i, { minutes: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={t("rpe")}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      className="font-mono"
                      value={d.targetRpe}
                      onChange={(e) => update(i, { targetRpe: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={t("time")}>
                  {(id) => (
                    <Input
                      id={id}
                      type="time"
                      className="font-mono"
                      value={d.startsAt}
                      onChange={(e) => update(i, { startsAt: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <Button
            action="add"
            variant="secondary"
            size="sm"
            disabled={days.length >= 10}
            onClick={addDay}
          >
            {t("addDay")}
          </Button>
        </div>
        <p className="text-secondary text-muted">{t("timeHint")}</p>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

// --- Cómo entrenamos aquí (ADR 0043) ---

function NotesCard({
  data,
  canWrite,
  onSaved,
}: {
  data: TrainingConfigResponse;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.notes");
  const c = useT("common");
  const { busy, patch } = usePatchSettings(data.section.id, onSaved);
  const [notes, setNotes] = useState(data.settings.methodologyNotes ?? "");
  useEffect(() => setNotes(data.settings.methodologyNotes ?? ""), [data.settings.methodologyNotes]);
  return (
    <Card
      title={t("title")}
      description={t("description")}
      footer={
        canWrite ? (
          <Button
            action="save"
            loading={busy}
            onClick={() => void patch({ methodologyNotes: notes.trim() || null })}
          >
            {c("save")}
          </Button>
        ) : null
      }
    >
      <Field label={t("label")} hint={t("hint")}>
        {(id, describedBy) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            rows={5}
            maxLength={2000}
            disabled={!canWrite}
            className="w-full rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none focus:border-2 focus:border-club disabled:bg-raised"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}
      </Field>
    </Card>
  );
}

// --- Material (ADR 0043) ---

function EquipmentCard({
  data,
  canWrite,
  onSaved,
}: {
  data: TrainingConfigResponse;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.equipment");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [sheet, setSheet] = useState<"new" | SectionEquipment | null>(null);
  const [removing, setRemoving] = useState<SectionEquipment | null>(null);

  async function remove(item: SectionEquipment) {
    setRemoving(null);
    try {
      await apiFetch(`/api/org/sections/${data.section.id}/equipment/${item.id}`, {
        method: "DELETE",
      });
      toast("success", t("removed", { name: item.name }));
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <Card
      title={t("title")}
      description={t("description")}
      padded={false}
      actions={
        canWrite ? (
          <Button action="add" size="sm" onClick={() => setSheet("new")}>
            {t("new")}
          </Button>
        ) : null
      }
    >
      <DataList<SectionEquipment>
        caption={t("title")}
        rows={data.equipment}
        getKey={(item) => item.id}
        empty={<EmptyState icon={<Icon.Barbell weight="duotone" />} title={t("empty")} />}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            cell: (item) => <span className="font-medium text-ink">{item.name}</span>,
          },
          {
            key: "quantity",
            header: t("table.quantity"),
            cell: (item) => <span className="font-mono">{item.quantity ?? "—"}</span>,
          },
          {
            key: "notes",
            header: t("table.notes"),
            cell: (item) => <span className="text-secondary text-muted">{item.notes ?? "—"}</span>,
          },
        ]}
        mobileRow={(item) => ({
          title: item.name,
          subtitle: [item.quantity ? String(item.quantity) : null, item.notes]
            .filter(Boolean)
            .join(" · "),
        })}
        rowActions={
          canWrite
            ? (item): RowAction[] => [
                { key: "edit", label: c("edit"), action: "edit", onClick: () => setSheet(item) },
                {
                  key: "remove",
                  label: c("remove"),
                  action: "delete",
                  tone: "danger",
                  onClick: () => setRemoving(item),
                },
              ]
            : undefined
        }
      />
      {canWrite && sheet ? (
        <EquipmentSheet
          sectionId={data.section.id}
          item={sheet === "new" ? null : sheet}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            onSaved();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("confirmRemoveTitle", { name: removing?.name ?? "" })}
        body={t("confirmRemoveBody")}
        confirmLabel={c("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

function EquipmentSheet({
  sectionId,
  item,
  onClose,
  onSaved,
}: {
  sectionId: string;
  item: SectionEquipment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("trainingConfig.equipment.sheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? "");
  const [quantity, setQuantity] = useState(item?.quantity ? String(item.quantity) : "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const amount = Math.round(Number(quantity));
    const body = {
      name: name.trim(),
      quantity: quantity.trim() && amount >= 1 ? Math.min(9999, amount) : null,
      notes: notes.trim() || null,
    };
    try {
      await apiFetch(
        item
          ? `/api/org/sections/${sectionId}/equipment/${item.id}`
          : `/api/org/sections/${sectionId}/equipment`,
        { method: item ? "PATCH" : "POST", body, schema: SectionEquipmentResponseSchema },
      );
      toast("success", item ? t("saved") : t("created", { name: body.name }));
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409 ? t("taken") : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={item ? t("editTitle", { name: item.name }) : t("newTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={item ? "save" : "add"}
            type="submit"
            form="equipment-form"
            loading={busy}
            disabled={!name.trim()}
          >
            {item ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="equipment-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("quantity")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("notes")}>
          {(id) => (
            <Input
              id={id}
              maxLength={200}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

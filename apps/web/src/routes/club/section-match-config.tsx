import {
  CLOCK_DIRECTIONS,
  MATCH_ACTION_CATEGORIES,
  MATCH_ACTION_NAME_MAX,
  MATCH_ACTION_SCOPES,
  MATCH_ACTION_WEIGHT_MAX,
  MATCH_ACTION_WEIGHT_MIN,
  SectionMatchConfigResponseSchema,
  type MatchActionCategory,
  type MatchActionScope,
  type MatchActionType,
  type MatchCard,
  type MatchSettings,
  type SectionMatchConfigResponse,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
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
  type StatusKind,
} from "@/ui";

const categoryKind: Record<MatchActionCategory, StatusKind> = {
  positive: "success",
  negative: "danger",
  neutral: "neutral",
};

/**
 * Configuración del partido en directo de una sección (Bloque 20): cómo se juega (periodos,
 * minutos, jugadores en pista, portero, faltas, sistemas, zonas) y el catálogo de acciones que se
 * pueden registrar. El deporte propone; el club decide.
 */
export function SectionMatchConfigPage() {
  const t = useT("matchConfig");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [actionSheet, setActionSheet] = useState<"new" | MatchActionType | null>(null);
  const [removing, setRemoving] = useState<MatchActionType | null>(null);
  const [resetting, setResetting] = useState(false);

  const config = useQuery({
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
  const { section, settings, customized, actionTypes, access } = config.data;
  const canWrite = access.write;
  const active = actionTypes.filter((a) => a.status === "active");
  const archived = actionTypes.filter((a) => a.status === "archived");

  async function remove(a: MatchActionType) {
    setRemoving(null);
    try {
      await apiFetch(`/api/org/sections/${id}/match-actions/${a.id}`, { method: "DELETE" });
      toast("success", t("actions.removed", { name: a.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function restore(a: MatchActionType) {
    try {
      await apiFetch(`/api/org/sections/${id}/match-actions/${a.id}`, {
        method: "PATCH",
        body: { status: "active" },
      });
      toast("success", t("actions.restored", { name: a.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function reset() {
    setResetting(false);
    try {
      await apiFetch(`/api/org/sections/${id}/match-config`, {
        method: "PATCH",
        body: { resetToSport: true },
      });
      toast("success", t("resetDone"));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  const flags = (a: MatchActionType) =>
    [
      a.ownScore > 0 ? t("flags.ownScore", { n: a.ownScore }) : null,
      a.opponentScore > 0 ? t("flags.opponentScore", { n: a.opponentScore }) : null,
      a.countsFoul ? t("flags.foul") : null,
      a.card ? t(`flags.card.${a.card}`) : null,
      a.requiresZone ? t("flags.zone") : null,
      a.keeperOnly ? t("flags.keeper") : null,
      a.quick ? t("flags.quick") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ButtonLink
          to={paths.section(id)}
          variant="tertiary"
          size="sm"
          icon={<Icon.ArrowLeft size={16} aria-hidden="true" />}
        >
          {t("back", { section: section.name })}
        </ButtonLink>
      </div>
      <PageHeader
        eyebrow={section.name}
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            <Button
              variant="secondary"
              icon={<Icon.ArrowCounterClockwise size={18} aria-hidden="true" />}
              onClick={() => setResetting(true)}
            >
              {t("reset")}
            </Button>
          ) : null
        }
      />

      <SettingsCard
        sectionId={id}
        settings={settings}
        customized={customized}
        canWrite={canWrite}
        onSaved={() => void reload()}
      />

      <Card
        title={t("actions.title")}
        description={t("actions.description")}
        padded={false}
        actions={
          canWrite ? (
            <Button
              size="sm"
              icon={<Icon.Plus size={18} aria-hidden="true" />}
              onClick={() => setActionSheet("new")}
            >
              {t("actions.new")}
            </Button>
          ) : null
        }
      >
        <DataList<MatchActionType>
          caption={t("actions.title")}
          rows={active}
          getKey={(a) => a.id}
          empty={
            <EmptyState icon={<Icon.ListChecks weight="duotone" />} title={t("actions.empty")} />
          }
          columns={[
            {
              key: "name",
              header: t("actions.table.name"),
              cell: (a) => (
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink">{a.name}</span>
                  <span className="font-mono text-label text-muted">{a.code}</span>
                </span>
              ),
            },
            { key: "scope", header: t("actions.table.scope"), cell: (a) => t(`scopes.${a.scope}`) },
            {
              key: "category",
              header: t("actions.table.category"),
              cell: (a) => (
                <StatusChip kind={categoryKind[a.category]}>
                  {t(`categories.${a.category}`)}
                </StatusChip>
              ),
            },
            {
              key: "flags",
              header: t("actions.table.flags"),
              cell: (a) => <span className="text-secondary text-muted">{flags(a) || "–"}</span>,
            },
            {
              key: "weight",
              header: t("actions.table.weight"),
              numeric: true,
              cell: (a) => a.weight,
            },
          ]}
          mobileRow={(a) => ({
            leading: (
              <StatusChip kind={categoryKind[a.category]}>
                {t(`categories.${a.category}`)}
              </StatusChip>
            ),
            title: a.name,
            subtitle: `${t(`scopes.${a.scope}`)} · ${flags(a) || t("actions.noFlags")} · ${a.weight}`,
          })}
          mobileActionsBelow
          actions={
            canWrite
              ? (a) => (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setActionSheet(a)}>
                      {c("edit")}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setRemoving(a)}>
                      {c("remove")}
                    </Button>
                  </>
                )
              : undefined
          }
        />
        {archived.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
            <span className="text-label uppercase tracking-wide text-muted">
              {t("actions.archived")}
            </span>
            <ul className="flex flex-wrap gap-2">
              {archived.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-1 rounded-chip bg-raised px-3 py-1 text-secondary text-muted"
                >
                  {a.name}
                  {canWrite ? (
                    <button
                      type="button"
                      className="min-h-9 px-1 font-medium text-club-text"
                      onClick={() => void restore(a)}
                    >
                      {t("actions.restore")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {canWrite && actionSheet ? (
        <ActionSheet
          sectionId={id}
          action={actionSheet === "new" ? null : actionSheet}
          existing={actionTypes}
          onClose={() => setActionSheet(null)}
          onSaved={() => {
            setActionSheet(null);
            void reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("actions.confirmRemoveTitle", { name: removing?.name ?? "" })}
        body={t("actions.confirmRemoveBody")}
        confirmLabel={c("remove")}
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
      <ConfirmDialog
        open={resetting}
        title={t("confirmResetTitle")}
        body={t("confirmResetBody")}
        confirmLabel={t("reset")}
        cancelLabel={c("cancel")}
        onConfirm={() => void reset()}
        onCancel={() => setResetting(false)}
      />
    </div>
  );
}

function SettingsCard({
  sectionId,
  settings,
  customized,
  canWrite,
  onSaved,
}: {
  sectionId: string;
  settings: MatchSettings;
  customized: boolean;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useT("matchConfig.settings");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [draft, setDraft] = useState<MatchSettings>(settings);
  const [formations, setFormations] = useState(settings.formations.join(", "));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft(settings);
    setFormations(settings.formations.join(", "));
  }, [settings]);
  const num =
    (key: keyof MatchSettings, min: number, max: number) => (e: { target: { value: string } }) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v))
        setDraft((d) => ({ ...d, [key]: Math.max(min, Math.min(max, Math.round(v))) }));
    };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const list = formations
        .split(",")
        .map((f) => f.trim())
        .filter((f) => /^\d(-\d){0,4}$/.test(f))
        .slice(0, 8);
      await apiFetch(`/api/org/sections/${sectionId}/match-config`, {
        method: "PATCH",
        body: { settings: { ...draft, formations: list } },
        schema: SectionMatchConfigResponseSchema,
      });
      toast("success", t("saved"));
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={t("title")}
      description={customized ? t("customized") : t("fromSport")}
      footer={
        canWrite ? (
          <Button type="submit" form="match-settings-form" loading={busy}>
            {c("save")}
          </Button>
        ) : null
      }
    >
      <form
        id="match-settings-form"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => void submit(e)}
      >
        <Field label={t("periods")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={10}
              className="font-mono"
              disabled={!canWrite}
              value={draft.periods}
              onChange={num("periods", 1, 10)}
            />
          )}
        </Field>
        <Field label={t("periodMinutes")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={90}
              className="font-mono"
              disabled={!canWrite}
              value={draft.periodMinutes}
              onChange={num("periodMinutes", 1, 90)}
            />
          )}
        </Field>
        <Field label={t("playersOnCourt")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={15}
              className="font-mono"
              disabled={!canWrite}
              value={draft.playersOnCourt}
              onChange={num("playersOnCourt", 1, 15)}
            />
          )}
        </Field>
        <Field label={t("foulLimit")} hint={t("foulLimitHint")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={20}
              className="font-mono"
              disabled={!canWrite}
              value={draft.foulLimit}
              onChange={num("foulLimit", 0, 20)}
            />
          )}
        </Field>
        <Field label={t("goalkeeper")}>
          {(id) => (
            <Select
              id={id}
              disabled={!canWrite}
              value={draft.goalkeeper ? "yes" : "no"}
              onChange={(e) => setDraft((d) => ({ ...d, goalkeeper: e.target.value === "yes" }))}
            >
              <option value="yes">{t("yes")}</option>
              <option value="no">{t("no")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("clock")}>
          {(id) => (
            <Select
              id={id}
              disabled={!canWrite}
              value={draft.clock}
              onChange={(e) =>
                setDraft((d) => ({ ...d, clock: e.target.value as MatchSettings["clock"] }))
              }
            >
              {CLOCK_DIRECTIONS.map((dir) => (
                <option key={dir} value={dir}>
                  {t(`clock_${dir}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("zones")} hint={t("zonesHint")}>
          {(id) => (
            <Select
              id={id}
              disabled={!canWrite}
              value={draft.zones ? "yes" : "no"}
              onChange={(e) => setDraft((d) => ({ ...d, zones: e.target.value === "yes" }))}
            >
              <option value="yes">{t("yes")}</option>
              <option value="no">{t("no")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("formations")} hint={t("formationsHint")}>
          {(id) => (
            <Input
              id={id}
              className="font-mono"
              disabled={!canWrite}
              value={formations}
              onChange={(e) => setFormations(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Card>
  );
}

function ActionSheet({
  sectionId,
  action,
  existing,
  onClose,
  onSaved,
}: {
  sectionId: string;
  action: MatchActionType | null;
  existing: MatchActionType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("matchConfig.actionSheet");
  const tc = useT("matchConfig");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(action?.name ?? "");
  const [category, setCategory] = useState<MatchActionCategory>(action?.category ?? "positive");
  const [scope, setScope] = useState<MatchActionScope>(action?.scope ?? "player");
  const [ownScore, setOwnScore] = useState(action?.ownScore ?? 0);
  const [opponentScore, setOpponentScore] = useState(action?.opponentScore ?? 0);
  const [countsFoul, setCountsFoul] = useState(action?.countsFoul ?? false);
  const [card, setCard] = useState<MatchCard | "">(action?.card ?? "");
  const [requiresZone, setRequiresZone] = useState(action?.requiresZone ?? false);
  const [keeperOnly, setKeeperOnly] = useState(action?.keeperOnly ?? false);
  const [weight, setWeight] = useState(String(action?.weight ?? 1));
  const [quick, setQuick] = useState(action?.quick ?? true);
  const [mirrorOf, setMirrorOf] = useState(action?.mirrorOf ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownActions = existing.filter((a) => a.scope !== "opponent" && a.status === "active");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      category,
      scope,
      ownScore: scope === "opponent" ? 0 : ownScore,
      opponentScore: scope === "opponent" ? opponentScore : 0,
      countsFoul,
      card: card || null,
      requiresZone: scope === "player" ? requiresZone : false,
      keeperOnly: scope === "player" ? keeperOnly : false,
      weight: Math.max(
        MATCH_ACTION_WEIGHT_MIN,
        Math.min(MATCH_ACTION_WEIGHT_MAX, Number(weight) || 0),
      ),
      quick,
      mirrorOf: scope === "opponent" && mirrorOf ? mirrorOf : null,
    };
    try {
      await apiFetch(
        action
          ? `/api/org/sections/${sectionId}/match-actions/${action.id}`
          : `/api/org/sections/${sectionId}/match-actions`,
        {
          method: action ? "PATCH" : "POST",
          body,
          schema: SectionMatchConfigResponseSchema,
        },
      );
      toast("success", action ? t("saved") : t("created", { name: body.name }));
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

  const check = (id: string, label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-body text-ink">
      <input
        id={id}
        type="checkbox"
        className="size-5 accent-[var(--club-fill)]"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={action ? t("editTitle", { name: action.name }) : t("newTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="action-form" loading={busy} disabled={!name.trim()}>
            {action ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="action-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field
          label={t("name")}
          hint={action ? t("codeHint", { code: action.code }) : t("nameHint")}
        >
          {(id) => (
            <Input
              id={id}
              required
              maxLength={MATCH_ACTION_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("scope")}>
            {(id) => (
              <Select
                id={id}
                value={scope}
                onChange={(e) => setScope(e.target.value as MatchActionScope)}
              >
                {MATCH_ACTION_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {tc(`scopes.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("category")}>
            {(id) => (
              <Select
                id={id}
                value={category}
                onChange={(e) => setCategory(e.target.value as MatchActionCategory)}
              >
                {MATCH_ACTION_CATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {tc(`categories.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {scope === "opponent" ? (
            <Field label={t("opponentScore")} hint={t("scoreHint")}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={10}
                  className="font-mono"
                  value={opponentScore}
                  onChange={(e) => setOpponentScore(Number(e.target.value) || 0)}
                />
              )}
            </Field>
          ) : (
            <Field label={t("ownScore")} hint={t("scoreHint")}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={10}
                  className="font-mono"
                  value={ownScore}
                  onChange={(e) => setOwnScore(Number(e.target.value) || 0)}
                />
              )}
            </Field>
          )}
          <Field label={t("weight")} hint={t("weightHint")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                step={0.5}
                min={MATCH_ACTION_WEIGHT_MIN}
                max={MATCH_ACTION_WEIGHT_MAX}
                className="font-mono"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("card")}>
            {(id) => (
              <Select
                id={id}
                value={card}
                onChange={(e) => setCard(e.target.value as MatchCard | "")}
              >
                <option value="">{t("noCard")}</option>
                <option value="yellow">{tc("flags.card.yellow")}</option>
                <option value="red">{tc("flags.card.red")}</option>
              </Select>
            )}
          </Field>
          {scope === "opponent" ? (
            <Field label={t("mirrorOf")} hint={t("mirrorHint")}>
              {(id) => (
                <Select id={id} value={mirrorOf} onChange={(e) => setMirrorOf(e.target.value)}>
                  <option value="">{t("noMirror")}</option>
                  {ownActions.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {check("action-foul", t("countsFoul"), countsFoul, setCountsFoul)}
          {check("action-quick", t("quick"), quick, setQuick)}
          {scope === "player"
            ? check("action-zone", t("requiresZone"), requiresZone, setRequiresZone)
            : null}
          {scope === "player"
            ? check("action-keeper", t("keeperOnly"), keeperOnly, setKeeperOnly)
            : null}
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

export type { SectionMatchConfigResponse };

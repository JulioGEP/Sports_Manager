import {
  SeasonCreateSchema,
  SeasonResponseSchema,
  SeasonsResponseSchema,
  SectionResponseSchema,
  SectionsResponseSchema,
  TeamResponseSchema,
  TeamsResponseSchema,
  type Season,
  type Section,
  type TeamSummary,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  DataList,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  Tabs,
  useToast,
} from "@/ui";

type Tab = "teams" | "sections" | "seasons";

/** Equipos, secciones y temporadas del club en una pantalla con tres pestañas (DESIGN.md 9.8). */
export function TeamsPage() {
  const t = useT("teams");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const dates = useDates();
  const [params, setParams] = useSearchParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const canWrite = org.actor.permissions.includes("org.structure.write");

  const rawTab = params.get("tab");
  const tab: Tab = rawTab === "sections" || rawTab === "seasons" ? rawTab : "teams";
  const creating = params.get("new") === "1";
  const seasonParam = params.get("season");

  const seasons = useQuery({
    queryKey: ["org", slug, "seasons"],
    queryFn: () => apiFetch("/api/org/seasons", { schema: SeasonsResponseSchema }),
  });
  const currentSeason = seasons.data?.seasons.find((s) => s.isCurrent) ?? null;
  const selectedSeasonId = seasonParam ?? currentSeason?.id ?? null;
  const seasonQuery = selectedSeasonId ? `?season=${encodeURIComponent(selectedSeasonId)}` : "";
  const teams = useQuery({
    queryKey: ["org", slug, "teams", selectedSeasonId],
    queryFn: () => apiFetch(`/api/org/teams${seasonQuery}`, { schema: TeamsResponseSchema }),
    enabled: seasons.isSuccess,
  });
  const sections = useQuery({
    queryKey: ["org", slug, "sections", selectedSeasonId],
    queryFn: () => apiFetch(`/api/org/sections${seasonQuery}`, { schema: SectionsResponseSchema }),
    enabled: seasons.isSuccess,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  const [editingTeam, setEditingTeam] = useState<TeamSummary | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);

  /**
   * Cambios acumulables sobre la URL. Dos llamadas seguidas en el mismo tick (cerrar la hoja y
   * refrescar) parten de la última versión, no de la del render: el enrutador no encadena solo.
   */
  const paramsRef = useRef(params);
  paramsRef.current = params;
  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(paramsRef.current);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    paramsRef.current = sp;
    setParams(sp, { replace: true });
  }
  const setTab = (next: Tab) => update({ tab: next === "teams" ? null : next, new: null });
  const setCreating = (open: boolean) => update({ new: open ? "1" : null });

  async function makeCurrent(season: Season) {
    try {
      await apiFetch(`/api/org/seasons/${season.id}`, {
        method: "PATCH",
        body: { isCurrent: true },
        schema: SeasonResponseSchema,
      });
      toast("success", t("madeCurrent", { name: season.name }));
      update({ season: null });
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { section: TeamSummary["section"]; teams: TeamSummary[] }>();
    for (const team of teams.data?.teams ?? []) {
      const entry = map.get(team.section.id) ?? { section: team.section, teams: [] };
      entry.teams.push(team);
      map.set(team.section.id, entry);
    }
    return [...map.values()];
  }, [teams.data]);

  const newLabel =
    tab === "teams" ? t("newTeam") : tab === "sections" ? t("newSection") : t("newSeason");
  const canCreateTeam = Boolean(selectedSeasonId) && (sections.data?.sections.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canWrite && (tab !== "teams" || canCreateTeam) ? (
            <Button
              icon={<Icon.Plus size={20} aria-hidden="true" />}
              onClick={() => setCreating(true)}
            >
              {newLabel}
            </Button>
          ) : null
        }
      />
      {seasons.isError ? <Alert kind="error">{errors(errorKey(seasons.error))}</Alert> : null}
      <Tabs<Tab>
        label={t("title")}
        selected={tab}
        onChange={setTab}
        items={[
          { key: "teams", label: t("tabs.teams"), count: teams.data?.teams.length },
          { key: "sections", label: t("tabs.sections"), count: sections.data?.sections.length },
          { key: "seasons", label: t("tabs.seasons"), count: seasons.data?.seasons.length },
        ]}
      />

      {tab === "teams" ? (
        <div className="flex flex-col gap-4">
          {seasons.data && seasons.data.seasons.length > 0 ? (
            <div className="max-w-xs">
              <Field label={t("season")}>
                {(id) => (
                  <Select
                    id={id}
                    value={selectedSeasonId ?? ""}
                    onChange={(e) =>
                      update({
                        season: e.target.value === currentSeason?.id ? null : e.target.value,
                      })
                    }
                  >
                    {seasons.data.seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.isCurrent ? ` · ${t("current")}` : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          ) : null}
          {seasons.data && seasons.data.seasons.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon.CalendarBlank weight="duotone" />}
                title={t("emptySeasons")}
                description={t("emptySeason")}
                action={
                  canWrite ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => update({ tab: "seasons", new: "1" })}
                    >
                      {t("newSeason")}
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : null}
          {teams.data && teams.data.teams.length === 0 && selectedSeasonId ? (
            <Card>
              <EmptyState
                icon={<Icon.UsersThree weight="duotone" />}
                title={t("empty")}
                action={
                  canWrite && canCreateTeam ? (
                    <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                      {t("newTeam")}
                    </Button>
                  ) : canWrite ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => update({ tab: "sections", new: "1" })}
                    >
                      {t("newSection")}
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : null}
          {grouped.map(({ section, teams: list }) => (
            <Card key={section.id} title={section.name} padded={false}>
              <DataList<TeamSummary>
                caption={section.name}
                rows={list}
                getKey={(team) => team.id}
                empty={null}
                columns={[
                  {
                    key: "team",
                    header: t("table.team"),
                    cell: (team) => (
                      <span className="flex flex-col">
                        <span className="font-medium text-ink">{team.name}</span>
                        <span className="text-secondary text-muted">
                          {team.category ?? t("noCategory")}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: "players",
                    header: t("table.players"),
                    numeric: true,
                    cell: (team) => team.playersCount,
                  },
                  {
                    key: "staff",
                    header: t("table.staff"),
                    cell: (team) =>
                      team.staff.length > 0 ? (
                        team.staff.map((s) => s.name).join(", ")
                      ) : (
                        <span className="text-muted">{t("noStaff")}</span>
                      ),
                  },
                  {
                    key: "status",
                    header: t("table.status"),
                    cell: (team) =>
                      team.status === "archived" ? (
                        <StatusChip kind="neutral">{t("sectionStatus.archived")}</StatusChip>
                      ) : null,
                  },
                ]}
                mobileRow={(team) => ({
                  title: team.name,
                  subtitle: `${team.category ?? t("noCategory")} · ${team.playersCount} ${t("table.players").toLowerCase()}`,
                })}
                actions={(team) => (
                  <ButtonLink to={paths.team(team.id)} variant="secondary" size="sm">
                    {t("open")}
                  </ButtonLink>
                )}
              />
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "sections" ? (
        <Card padded={false}>
          <DataList<Section>
            caption={t("tabs.sections")}
            rows={sections.data?.sections ?? []}
            getKey={(s) => s.id}
            empty={
              <EmptyState
                icon={<Icon.SquaresFour weight="duotone" />}
                title={sections.isPending ? c("loading") : t("emptySections")}
                action={
                  canWrite && sections.data ? (
                    <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                      {t("newSection")}
                    </Button>
                  ) : null
                }
              />
            }
            columns={[
              {
                key: "name",
                header: t("table.name"),
                cell: (s) => <span className="font-medium text-ink">{s.name}</span>,
              },
              { key: "teams", header: t("table.teams"), numeric: true, cell: (s) => s.teamsCount },
              {
                key: "status",
                header: t("table.status"),
                cell: (s) => (
                  <StatusChip kind={s.status === "active" ? "success" : "neutral"}>
                    {t(`sectionStatus.${s.status}`)}
                  </StatusChip>
                ),
              },
            ]}
            mobileRow={(s) => ({
              title: s.name,
              subtitle: `${s.teamsCount} ${t("table.teams").toLowerCase()}`,
              trailing: (
                <StatusChip kind={s.status === "active" ? "success" : "neutral"}>
                  {t(`sectionStatus.${s.status}`)}
                </StatusChip>
              ),
            })}
            actions={
              canWrite
                ? (s) => (
                    <Button variant="secondary" size="sm" onClick={() => setEditingSection(s)}>
                      {t("edit")}
                    </Button>
                  )
                : undefined
            }
          />
        </Card>
      ) : null}

      {tab === "seasons" ? (
        <Card padded={false}>
          <DataList<Season>
            caption={t("tabs.seasons")}
            rows={seasons.data?.seasons ?? []}
            getKey={(s) => s.id}
            empty={
              <EmptyState
                icon={<Icon.CalendarBlank weight="duotone" />}
                title={seasons.isPending ? c("loading") : t("emptySeasons")}
                action={
                  canWrite && seasons.data ? (
                    <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                      {t("newSeason")}
                    </Button>
                  ) : null
                }
              />
            }
            columns={[
              {
                key: "name",
                header: t("table.name"),
                cell: (s) => (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{s.name}</span>
                    {s.isCurrent ? <StatusChip kind="club">{t("current")}</StatusChip> : null}
                  </span>
                ),
              },
              {
                key: "dates",
                header: t("table.dates"),
                cell: (s) => dates.range(s.startsOn, s.endsOn),
              },
              { key: "teams", header: t("table.teams"), numeric: true, cell: (s) => s.teamsCount },
            ]}
            mobileRow={(s) => ({
              title: s.name,
              subtitle: dates.range(s.startsOn, s.endsOn),
              trailing: s.isCurrent ? (
                <StatusChip kind="club">{t("current")}</StatusChip>
              ) : undefined,
            })}
            mobileActionsBelow
            actions={
              canWrite
                ? (s) => (
                    <>
                      {!s.isCurrent ? (
                        <Button variant="secondary" size="sm" onClick={() => void makeCurrent(s)}>
                          {t("makeCurrent")}
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="sm" onClick={() => setEditingSeason(s)}>
                        {t("edit")}
                      </Button>
                    </>
                  )
                : undefined
            }
          />
        </Card>
      ) : null}

      {tab === "teams" && sections.data && seasons.data ? (
        <TeamSheet
          open={creating || editingTeam !== null}
          team={editingTeam}
          sections={sections.data.sections}
          seasons={seasons.data.seasons}
          defaultSeasonId={selectedSeasonId}
          onClose={() => {
            setCreating(false);
            setEditingTeam(null);
          }}
          onSaved={() => void reload()}
        />
      ) : null}
      {tab === "sections" ? (
        <SectionSheet
          open={creating || editingSection !== null}
          section={editingSection}
          onClose={() => {
            setCreating(false);
            setEditingSection(null);
          }}
          onSaved={() => void reload()}
        />
      ) : null}
      {tab === "seasons" ? (
        <SeasonSheet
          open={creating || editingSeason !== null}
          season={editingSeason}
          first={(seasons.data?.seasons.length ?? 0) === 0}
          onClose={() => {
            setCreating(false);
            setEditingSeason(null);
          }}
          onSaved={() => {
            update({ season: null });
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function conflictMessage(err: unknown, taken: string, fallback: (key: string) => string) {
  return err instanceof ApiClientError && err.status === 409 ? taken : fallback(errorKey(err));
}

/** Alta y edición de un equipo. La sección y la temporada se eligen; la categoría es texto libre. */
export function TeamSheet({
  open,
  team,
  sections,
  seasons,
  defaultSeasonId,
  onClose,
  onSaved,
}: {
  open: boolean;
  team: TeamSummary | null;
  sections: Section[];
  seasons: Season[];
  defaultSeasonId: string | null;
  onClose: () => void;
  onSaved: (team: TeamSummary) => void;
}) {
  const t = useT("teams.teamSheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const activeSections = sections.filter((s) => s.status === "active" || s.id === team?.section.id);
  const [name, setName] = useState(team?.name ?? "");
  const [category, setCategory] = useState(team?.category ?? "");
  const [sectionId, setSectionId] = useState(team?.section.id ?? activeSections[0]?.id ?? "");
  const [seasonId, setSeasonId] = useState(
    team?.season.id ?? defaultSeasonId ?? seasons.find((s) => s.isCurrent)?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const saved = team
        ? await apiFetch(`/api/org/teams/${team.id}`, {
            method: "PATCH",
            body: { name, category: category.trim() || null, sectionId },
            schema: TeamResponseSchema,
          })
        : await apiFetch("/api/org/teams", {
            method: "POST",
            body: { name, category: category.trim() || undefined, sectionId, seasonId },
            schema: TeamResponseSchema,
          });
      toast("success", team ? t("saved") : t("created", { name: saved.team.name }));
      setName("");
      setCategory("");
      onClose();
      onSaved(saved.team);
    } catch (err) {
      setError(conflictMessage(err, t("nameTaken"), errors));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={team ? t("editTitle", { name: team.name }) : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="team-form" loading={busy}>
            {team ? t("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="team-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")} hint={t("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("category")} hint={t("categoryHint")}>
          {(id) => (
            <Input
              id={id}
              maxLength={60}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("section")}>
            {(id) => (
              <Select id={id} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {activeSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("season")}>
            {(id) => (
              <Select
                id={id}
                value={seasonId}
                disabled={team !== null}
                onChange={(e) => setSeasonId(e.target.value)}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function SectionSheet({
  open,
  section,
  onClose,
  onSaved,
}: {
  open: boolean;
  section: Section | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("teams.sectionSheet");
  const tt = useT("teams");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(section?.name ?? "");
  const [status, setStatus] = useState<Section["status"]>(section?.status ?? "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const saved = section
        ? await apiFetch(`/api/org/sections/${section.id}`, {
            method: "PATCH",
            body: { name, status },
            schema: SectionResponseSchema,
          })
        : await apiFetch("/api/org/sections", {
            method: "POST",
            body: { name },
            schema: SectionResponseSchema,
          });
      toast("success", section ? t("saved") : t("created", { name: saved.section.name }));
      setName("");
      onClose();
      onSaved();
    } catch (err) {
      setError(conflictMessage(err, t("nameTaken"), errors));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={section ? t("editTitle") : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="section-form" loading={busy}>
            {section ? t("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="section-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {section ? (
          <Field label={tt("table.status")}>
            {(id) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as Section["status"])}
              >
                <option value="active">{tt("sectionStatus.active")}</option>
                <option value="archived">{tt("sectionStatus.archived")}</option>
              </Select>
            )}
          </Field>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function SeasonSheet({
  open,
  season,
  first,
  onClose,
  onSaved,
}: {
  open: boolean;
  season: Season | null;
  /** Sin temporadas todavía: la primera pasa a ser la actual sin preguntar. */
  first: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("teams.seasonSheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(season?.name ?? "");
  const [startsOn, setStartsOn] = useState(season?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(season?.endsOn ?? "");
  const [isCurrent, setIsCurrent] = useState(season?.isCurrent ?? first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = SeasonCreateSchema.safeParse({ name, startsOn, endsOn, isCurrent });
    if (!parsed.success) {
      setError(
        parsed.error.issues.some((i) => i.path[0] === "endsOn")
          ? t("dates")
          : errors("bad_request"),
      );
      return;
    }
    setBusy(true);
    try {
      const saved = season
        ? await apiFetch(`/api/org/seasons/${season.id}`, {
            method: "PATCH",
            body: {
              name,
              startsOn,
              endsOn,
              ...(isCurrent && !season.isCurrent ? { isCurrent: true } : {}),
            },
            schema: SeasonResponseSchema,
          })
        : await apiFetch("/api/org/seasons", {
            method: "POST",
            body: parsed.data,
            schema: SeasonResponseSchema,
          });
      toast("success", season ? t("saved") : t("created", { name: saved.season.name }));
      setName("");
      onClose();
      onSaved();
    } catch (err) {
      setError(conflictMessage(err, t("nameTaken"), errors));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={season ? t("editTitle") : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="season-form" loading={busy}>
            {season ? t("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="season-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")} hint={t("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("startsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("endsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        {!(season?.isCurrent ?? false) && !first ? (
          <label className="flex items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              className="size-5 accent-(--club-fill)"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
            />
            {t("isCurrent")}
          </label>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

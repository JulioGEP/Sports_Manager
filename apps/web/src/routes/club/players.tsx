import {
  PLAYER_MISSING_FILTERS,
  PlayerDetailResponseSchema,
  PlayersResponseSchema,
  playerDisplayName,
  type PlayerMissingFilter,
  type PlayerSummary,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { orgQueries } from "@/lib/queries";
import {
  Alert,
  Avatar,
  Button,
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

type Tab = "players" | "families";

/** Deportistas del club: búsqueda, filtros por sección, categoría y equipo, lo que falta, y alta. */
export function PlayersPage() {
  const t = useT("players");
  const tt = useT("team");
  const ps = useT("playerStatus");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const canWrite = org.actor.permissions.includes("org.players.write");
  const canMembers = org.actor.permissions.includes("org.members.read");
  const creating = params.get("new") === "1";
  const teamFilter = params.get("team") ?? "";
  const sectionFilter = params.get("section") ?? "";
  const categoryFilter = params.get("category") ?? "";
  const tab: Tab = params.get("tab") === "families" && canMembers ? "families" : "players";
  const rawMissing = params.get("missing");
  /** Lo que falta en la ficha (Bloque 13): llega de las alertas del inicio y lo resuelve la API. */
  const missing: PlayerMissingFilter | "" = (PLAYER_MISSING_FILTERS as readonly string[]).includes(
    rawMissing ?? "",
  )
    ? (rawMissing as PlayerMissingFilter)
    : "";
  const [query, setQuery] = useState("");

  const players = useQuery({
    queryKey: ["org", slug, "players", missing || "all"],
    queryFn: () =>
      apiFetch(`/api/org/players${missing ? `?missing=${missing}` : ""}`, {
        schema: PlayersResponseSchema,
      }),
  });
  const teams = useQuery(orgQueries.teams(slug));
  const sections = useQuery(orgQueries.sections(slug));
  const categories = useQuery(orgQueries.categories(slug, sectionFilter || null));
  const members = useQuery({
    ...orgQueries.members(slug),
    enabled: tab === "families",
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players.data?.players ?? [])
      .filter((p) => !sectionFilter || p.teams.some((x) => x.sectionId === sectionFilter))
      .filter((p) => !categoryFilter || p.teams.some((x) => x.categoryId === categoryFilter))
      .filter((p) => !teamFilter || p.teams.some((x) => x.teamId === teamFilter))
      .filter((p) => !q || playerDisplayName(p).toLowerCase().includes(q));
  }, [players.data, query, sectionFilter, categoryFilter, teamFilter]);
  const visibleTeams = (teams.data?.teams ?? []).filter(
    (team) =>
      (!sectionFilter || team.section.id === sectionFilter) &&
      (!categoryFilter || team.categoryId === categoryFilter),
  );
  const families = (members.data?.members ?? []).filter((m) => m.roles.includes("guardian"));

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

  const ageOf = (p: PlayerSummary) => {
    const age = dates.age(p.birthDate);
    return age === null ? tt("noBirthDate") : tt("age", { age });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            <Button action="add" onClick={() => update({ new: "1" })}>
              {t("new")}
            </Button>
          ) : null
        }
      />
      {players.isError ? <Alert kind="error">{errors(errorKey(players.error))}</Alert> : null}
      {canMembers ? (
        <Tabs<Tab>
          label={t("title")}
          selected={tab}
          onChange={(key) => update({ tab: key === "players" ? null : key })}
          items={[
            { key: "players", label: t("tabs.players"), count: players.data?.players.length },
            { key: "families", label: t("tabs.families"), count: families.length || undefined },
          ]}
        />
      ) : null}
      {tab === "families" ? (
        <Card padded={false}>
          <DataList<(typeof families)[number]>
            caption={t("tabs.families")}
            rows={families}
            getKey={(m) => m.userId}
            empty={
              <EmptyState
                icon={<Icon.HandHeart weight="duotone" />}
                title={members.isPending ? c("loading") : t("families.empty")}
                description={t("families.emptyHint")}
              />
            }
            columns={[
              {
                key: "person",
                header: t("families.person"),
                cell: (m) => (
                  <span className="flex items-center gap-3">
                    <Avatar name={m.name} size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink">{m.name}</span>
                      <span className="text-secondary text-muted">{m.email}</span>
                    </span>
                  </span>
                ),
              },
              {
                key: "since",
                header: t("families.since"),
                cell: (m) => dates.day(m.memberSince.slice(0, 10)),
              },
            ]}
            mobileRow={(m) => ({
              leading: <Avatar name={m.name} />,
              title: m.name,
              subtitle: m.email,
            })}
          />
        </Card>
      ) : null}
      <div className={`flex flex-wrap items-end gap-3 ${tab === "families" ? "hidden" : ""}`}>
        <div className="relative w-full max-w-sm">
          <Icon.MagnifyingGlass
            size={20}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            className="pl-11"
            placeholder={t("search")}
            aria-label={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {sections.data && sections.data.sections.length > 1 ? (
          <div className="w-full max-w-xs">
            <Select
              aria-label={t("sectionFilter")}
              value={sectionFilter}
              onChange={(e) =>
                update({ section: e.target.value || null, category: null, team: null })
              }
            >
              <option value="">{t("allSections")}</option>
              {sections.data.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {t("sectionFilter")}: {section.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {categories.data && categories.data.categories.length > 0 ? (
          <div className="w-full max-w-xs">
            <Select
              aria-label={t("categoryFilter")}
              value={categoryFilter}
              onChange={(e) => update({ category: e.target.value || null, team: null })}
            >
              <option value="">{t("allCategories")}</option>
              {categories.data.categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {t("categoryFilter")}: {cat.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {visibleTeams.length > 0 ? (
          <div className="w-full max-w-xs">
            <Select
              aria-label={t("teamFilter")}
              value={teamFilter}
              onChange={(e) => update({ team: e.target.value || null })}
            >
              <option value="">{t("allTeams")}</option>
              {visibleTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {t("teamFilter")}: {team.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="w-full max-w-xs">
          <Select
            aria-label={t("missingFilter.label")}
            value={missing}
            onChange={(e) => update({ missing: e.target.value || null })}
          >
            <option value="">{t("missingFilter.all")}</option>
            {PLAYER_MISSING_FILTERS.map((key) => (
              <option key={key} value={key}>
                {t("missingFilter.label")}: {t(`missingFilter.${key}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Card padded={false} className={tab === "families" ? "hidden" : ""}>
        <DataList<PlayerSummary>
          caption={t("title")}
          rows={filtered}
          getKey={(p) => p.id}
          empty={
            <EmptyState
              icon={<Icon.PersonSimpleRun weight="duotone" />}
              title={
                players.isPending
                  ? c("loading")
                  : (players.data?.players.length ?? 0) > 0
                    ? t("noResults")
                    : t("empty")
              }
              action={
                canWrite && players.data && players.data.players.length === 0 ? (
                  <Button
                    action="add"
                    variant="secondary"
                    size="sm"
                    onClick={() => update({ new: "1" })}
                  >
                    {t("new")}
                  </Button>
                ) : null
              }
            />
          }
          columns={[
            {
              key: "player",
              header: t("table.player"),
              cell: (p) => (
                <span className="flex items-center gap-3">
                  <Avatar name={playerDisplayName(p)} size="sm" src={p.photoUrl} />
                  <span className="flex min-w-0 flex-col">
                    <Link to={paths.player(p.id)} className="font-medium text-ink">
                      {playerDisplayName(p)}
                    </Link>
                    <span className="text-secondary text-muted">{dates.day(p.birthDate)}</span>
                  </span>
                </span>
              ),
            },
            { key: "age", header: t("table.age"), cell: (p) => ageOf(p) },
            {
              key: "teams",
              header: t("table.teams"),
              cell: (p) =>
                p.teams.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {p.teams.map((x) => (
                      <StatusChip key={x.teamId} kind="club">
                        {x.teamName}
                      </StatusChip>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted">{t("noTeam")}</span>
                ),
            },
            {
              key: "member",
              header: t("table.member"),
              cell: (p) =>
                p.memberNumber !== null ? (
                  <span className="font-mono">{t("memberNumber", { number: p.memberNumber })}</span>
                ) : (
                  <span className="text-muted">{t("notMember")}</span>
                ),
            },
            {
              key: "family",
              header: t("table.family"),
              cell: (p) => (
                <span className="flex flex-col">
                  <span>{tt("familyCount", { count: p.guardiansCount })}</span>
                  {p.pendingInvitationsCount > 0 ? (
                    <span className="text-secondary text-warning">
                      {t("pendingCount", { count: p.pendingInvitationsCount })}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "status",
              header: t("table.status"),
              cell: (p) => (
                <StatusChip kind={p.status === "active" ? "success" : "neutral"}>
                  {ps(p.status)}
                </StatusChip>
              ),
            },
          ]}
          mobileRow={(p) => ({
            leading: <Avatar name={playerDisplayName(p)} src={p.photoUrl} />,
            title: <Link to={paths.player(p.id)}>{playerDisplayName(p)}</Link>,
            subtitle: `${p.teams.map((x) => x.teamName).join(", ") || t("noTeam")} · ${ageOf(p)}`,
            trailing:
              p.status === "inactive" ? (
                <StatusChip kind="neutral">{ps(p.status)}</StatusChip>
              ) : undefined,
          })}
          href={(p) => paths.player(p.id)}
        />
      </Card>

      {canWrite ? (
        <NewPlayerSheet
          open={creating}
          teams={teams.data?.teams.map((x) => ({ id: x.id, name: x.name })) ?? []}
          defaultTeamId={teamFilter || null}
          onClose={() => update({ new: null })}
          onCreated={() => void reload()}
        />
      ) : null}
    </div>
  );
}

function NewPlayerSheet({
  open,
  teams,
  defaultTeamId,
  onClose,
  onCreated,
}: {
  open: boolean;
  teams: { id: string; name: string }[];
  defaultTeamId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT("players.sheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const navigate = useNavigate();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [joinedOn, setJoinedOn] = useState("");
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await apiFetch("/api/org/players", {
        method: "POST",
        body: {
          firstName,
          lastName,
          birthDate: birthDate || null,
          joinedOn: joinedOn || null,
          ...(teamId ? { teamId } : {}),
        },
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("created", { name: playerDisplayName(created.player) }));
      setFirstName("");
      setLastName("");
      setBirthDate("");
      setJoinedOn("");
      onClose();
      onCreated();
      void navigate(paths.player(created.player.id));
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="add" type="submit" form="player-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="player-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("firstName")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={60}
                autoComplete="off"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("lastName")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={80}
                autoComplete="off"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("birthDate")} hint={t("birthDateHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("joinedOn")} hint={t("joinedOnHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={joinedOn}
                onChange={(e) => setJoinedOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        {teams.length > 0 ? (
          <Field label={t("team")}>
            {(id) => (
              <Select id={id} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">{t("noTeam")}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

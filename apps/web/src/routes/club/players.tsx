import {
  PlayerDetailResponseSchema,
  PlayersResponseSchema,
  TeamsResponseSchema,
  playerDisplayName,
  type PlayerSummary,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
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
  useToast,
} from "@/ui";

/** Jugadores del club: búsqueda, filtro por equipo de la temporada actual y alta. */
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
  const creating = params.get("new") === "1";
  const teamFilter = params.get("team") ?? "";
  const [query, setQuery] = useState("");

  const players = useQuery({
    queryKey: ["org", slug, "players", "all"],
    queryFn: () => apiFetch("/api/org/players", { schema: PlayersResponseSchema }),
  });
  const teams = useQuery({
    queryKey: ["org", slug, "teams", null],
    queryFn: () => apiFetch("/api/org/teams", { schema: TeamsResponseSchema }),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players.data?.players ?? [])
      .filter((p) => !teamFilter || p.teams.some((x) => x.teamId === teamFilter))
      .filter((p) => !q || playerDisplayName(p).toLowerCase().includes(q));
  }, [players.data, query, teamFilter]);

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
            <Button
              icon={<Icon.Plus size={20} aria-hidden="true" />}
              onClick={() => update({ new: "1" })}
            >
              {t("new")}
            </Button>
          ) : null
        }
      />
      {players.isError ? <Alert kind="error">{errors(errorKey(players.error))}</Alert> : null}
      <div className="flex flex-wrap items-end gap-3">
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
        {teams.data && teams.data.teams.length > 0 ? (
          <div className="w-full max-w-xs">
            <Select
              aria-label={t("teamFilter")}
              value={teamFilter}
              onChange={(e) => update({ team: e.target.value || null })}
            >
              <option value="">{t("allTeams")}</option>
              {teams.data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {t("teamFilter")}: {team.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
      <Card padded={false}>
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
                  <Button variant="secondary" size="sm" onClick={() => update({ new: "1" })}>
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
              key: "family",
              header: t("table.family"),
              cell: (p) => tt("familyCount", { count: p.guardiansCount }),
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
          actions={(p) => (
            <ButtonLink to={paths.player(p.id)} variant="secondary" size="sm">
              {c("open")}
            </ButtonLink>
          )}
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
          ...(teamId ? { teamId } : {}),
        },
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("created", { name: playerDisplayName(created.player) }));
      setFirstName("");
      setLastName("");
      setBirthDate("");
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
          <Button type="submit" form="player-form" loading={busy}>
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

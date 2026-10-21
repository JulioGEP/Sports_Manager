import {
  CategoriesResponseSchema,
  EligibleMembersResponseSchema,
  PlayersResponseSchema,
  TEAM_STAFF_ROLES,
  TeamDetailResponseSchema,
  playerDisplayName,
  type RosterEntry,
  type TeamDetailResponse,
  type TeamStaffRole,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
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
} from "@/ui";
import { TeamSheet } from "./section";
import { ScheduleSheet } from "./team-schedule";

type Staff = TeamDetailResponse["staff"][number];

/** Ficha de un equipo: plantilla con dorsales y posiciones, y cuerpo técnico. */
export function TeamPage() {
  const t = useT("team");
  const staffRoles = useT("teamStaffRoles");
  const weekdays = useT("weekdays");
  const ps = useT("playerStatus");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const navigate = useNavigate();
  const dates = useDates();
  const { id = "" } = useParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canWrite = permissions.includes("org.structure.write");
  const canSeePlayers = permissions.includes("org.players.read");

  const detail = useQuery({
    queryKey: ["org", slug, "team", id],
    queryFn: () => apiFetch(`/api/org/teams/${id}`, { schema: TeamDetailResponseSchema }),
    retry: false,
  });
  const sectionId = detail.data?.team.section.id;
  const categories = useQuery({
    queryKey: ["org", slug, "categories", sectionId],
    queryFn: () =>
      apiFetch(`/api/org/categories?section=${sectionId}`, { schema: CategoriesResponseSchema }),
    enabled: canWrite && Boolean(sectionId),
  });
  const [schedule, setSchedule] = useState(false);
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [entry, setEntry] = useState<RosterEntry | null>(null);
  const [removing, setRemoving] = useState<RosterEntry | null>(null);
  const [addingStaff, setAddingStaff] = useState(false);
  const [removingStaff, setRemovingStaff] = useState<Staff | null>(null);

  if (detail.isError) {
    const notFound = detail.error instanceof ApiClientError && detail.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(detail.error))}</Alert>
    );
  }
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const { team, roster, staff, access, schedule: slots } = detail.data;
  const activity = team.section.kind === "activity";
  /** Plantilla: quien escribe la estructura o, en este equipo, su cuerpo técnico (Bloque 13). */
  const canRoster = access.roster && canSeePlayers;
  const name = (p: RosterEntry) => playerDisplayName(p);

  async function removePlayer(p: RosterEntry) {
    setRemoving(null);
    try {
      await apiFetch(`/api/org/teams/${id}/players/${p.playerId}`, { method: "DELETE" });
      toast("success", t("removed", { name: name(p), team: team.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function removeStaff(s: Staff) {
    setRemovingStaff(null);
    try {
      await apiFetch(`/api/org/teams/${id}/staff/${s.userId}`, { method: "DELETE" });
      toast("success", t("staffRemoved", { name: s.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const ageOf = (p: RosterEntry) => {
    const age = dates.age(p.birthDate);
    return age === null ? t("noBirthDate") : t("age", { age });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ButtonLink action="back" to={paths.section(team.section.id)} variant="tertiary" size="sm">
          {t("back")}
        </ButtonLink>
      </div>
      <PageHeader
        eyebrow={`${team.section.name} · ${team.season.name}`}
        title={
          <>
            {team.name}
            {team.category ? <StatusChip kind="club">{team.category}</StatusChip> : null}
            {team.capacity !== null ? (
              <StatusChip kind={team.playersCount >= team.capacity ? "warning" : "neutral"}>
                {t("capacity", { count: team.playersCount, capacity: team.capacity })}
              </StatusChip>
            ) : null}
            {team.status === "archived" ? (
              <StatusChip kind="neutral">{t("archived")}</StatusChip>
            ) : null}
          </>
        }
        actions={
          <>
            {canWrite ? (
              <Button action="edit" variant="secondary" onClick={() => setEditing(true)}>
                {t("edit")}
              </Button>
            ) : null}
            {canRoster ? (
              <Button action="add" onClick={() => setAdding(true)}>
                {t("addPlayer")}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title={t("roster")}
          description={t("rosterDescription", { count: roster.length })}
          padded={false}
        >
          {!canSeePlayers ? (
            <div className="px-5 pb-5">
              <Alert kind="info">{t("rosterHidden")}</Alert>
            </div>
          ) : (
            <DataList<RosterEntry>
              caption={t("roster")}
              rows={roster}
              getKey={(p) => p.playerId}
              empty={
                <EmptyState
                  icon={<Icon.PersonSimpleRun weight="duotone" />}
                  title={t("emptyRoster")}
                  action={
                    canRoster ? (
                      <Button
                        action="add"
                        variant="secondary"
                        size="sm"
                        onClick={() => setAdding(true)}
                      >
                        {t("addPlayer")}
                      </Button>
                    ) : null
                  }
                />
              }
              columns={[
                {
                  key: "number",
                  header: t("table.number"),
                  numeric: true,
                  cell: (p) => p.shirtNumber ?? <span className="font-sans text-muted">–</span>,
                },
                {
                  key: "player",
                  header: t("table.player"),
                  cell: (p) => (
                    <span className="flex items-center gap-3">
                      <Avatar name={name(p)} size="sm" src={p.photoUrl} />
                      <span className="flex min-w-0 flex-col">
                        <Link to={paths.player(p.playerId)} className="font-medium text-ink">
                          {name(p)}
                        </Link>
                        {p.status === "inactive" ? (
                          <span className="text-secondary text-muted">{ps(p.status)}</span>
                        ) : null}
                      </span>
                    </span>
                  ),
                },
                {
                  key: "position",
                  header: t("table.position"),
                  cell: (p) => p.position ?? <span className="text-muted">{t("noPosition")}</span>,
                },
                { key: "age", header: t("table.age"), cell: (p) => ageOf(p) },
                {
                  key: "family",
                  header: t("table.family"),
                  cell: (p) => t("familyCount", { count: p.guardiansCount }),
                },
              ]}
              mobileRow={(p) => ({
                leading: (
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-body text-club-soft-text">
                    {p.shirtNumber ?? "–"}
                  </span>
                ),
                title: <Link to={paths.player(p.playerId)}>{name(p)}</Link>,
                subtitle: `${p.position ?? t("noPosition")} · ${ageOf(p)}`,
              })}
              mobileActionsBelow
              actions={
                canRoster
                  ? (p) => (
                      <>
                        <Button
                          iconOnly
                          action="edit"
                          variant="secondary"
                          size="sm"
                          onClick={() => setEntry(p)}
                        >
                          {t("editEntry")}
                        </Button>
                        <Button
                          iconOnly
                          action="delete"
                          variant="danger"
                          size="sm"
                          onClick={() => setRemoving(p)}
                        >
                          {t("remove")}
                        </Button>
                      </>
                    )
                  : undefined
              }
            />
          )}
        </Card>

        <Card
          title={t("staff")}
          description={t("staffDescription")}
          padded={false}
          actions={
            canWrite ? (
              <Button
                action="addPerson"
                variant="secondary"
                size="sm"
                onClick={() => setAddingStaff(true)}
              >
                {t("addStaff")}
              </Button>
            ) : null
          }
        >
          {staff.length === 0 ? (
            <EmptyState icon={<Icon.Users weight="duotone" />} title={t("emptyStaff")} />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {staff.map((s) => (
                <li key={s.userId} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <Avatar name={s.name} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-ink">{s.name}</span>
                    <span className="truncate text-secondary text-muted">
                      {staffRoles(s.roleInTeam)} · {s.email}
                    </span>
                  </span>
                  {canWrite ? (
                    <Button
                      iconOnly
                      action="delete"
                      variant="danger"
                      size="sm"
                      onClick={() => setRemovingStaff(s)}
                    >
                      {t("removeStaff")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Horario semanal (Bloque 16): de aquí salen los entrenamientos de la temporada. */}
        <Card
          title={t("schedule.title")}
          description={activity ? t("schedule.descriptionActivity") : t("schedule.description")}
          padded={false}
          className="lg:col-start-2"
          actions={
            access.events ? (
              <Button action="edit" variant="secondary" size="sm" onClick={() => setSchedule(true)}>
                {slots.length === 0 ? t("schedule.set") : t("schedule.edit")}
              </Button>
            ) : null
          }
        >
          {slots.length === 0 ? (
            <EmptyState
              icon={<Icon.CalendarBlank weight="duotone" />}
              title={t("schedule.empty")}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {slots.map((slot) => (
                <li key={slot.id} className="flex min-h-12 items-center gap-3 px-5 py-2">
                  <span className="w-24 shrink-0 font-medium text-ink">
                    {weekdays(String(slot.weekday))}
                  </span>
                  <span className="font-mono text-ink">
                    {slot.startsAt}–{slot.endsAt}
                  </span>
                  <span className="truncate text-secondary text-muted">
                    {slot.facility?.name ?? t("schedule.noFacility")}
                  </span>
                </li>
              ))}
              <li className="px-5 py-3">
                <Link to={`${paths.agenda}?team=${team.id}`} className="text-secondary font-medium">
                  {t("schedule.openAgenda")}
                </Link>
              </li>
            </ul>
          )}
        </Card>
      </div>

      {canWrite && categories.data ? (
        <TeamSheet
          open={editing}
          team={team}
          sectionId={team.section.id}
          categories={categories.data.categories}
          defaultCategoryId={team.categoryId}
          seasonId={team.season.id}
          activity={activity}
          onClose={() => setEditing(false)}
          onSaved={() => void reload()}
        />
      ) : null}
      {access.events ? (
        <ScheduleSheet
          open={schedule}
          teamId={id}
          slots={slots}
          onClose={() => setSchedule(false)}
          onSaved={() => void reload()}
        />
      ) : null}
      {canRoster ? (
        <AddPlayerSheet
          open={adding}
          teamId={id}
          teamName={team.name}
          excluded={roster.map((p) => p.playerId)}
          canCreate={permissions.includes("org.players.write")}
          onClose={() => setAdding(false)}
          onAdded={() => void reload()}
          onNewPlayer={() => void navigate(`${paths.players}?new=1&team=${id}`)}
        />
      ) : null}
      {entry ? (
        <EntrySheet
          teamId={id}
          teamName={team.name}
          entry={entry}
          onClose={() => setEntry(null)}
          onSaved={() => void reload()}
        />
      ) : null}
      {canWrite ? (
        <AddStaffSheet
          open={addingStaff}
          teamId={id}
          excluded={staff.map((s) => s.userId)}
          onClose={() => setAddingStaff(false)}
          onAdded={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("confirmRemoveTitle", { name: removing ? name(removing) : "", team: team.name })}
        body={t("confirmRemoveBody")}
        confirmLabel={t("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void removePlayer(removing)}
        onCancel={() => setRemoving(null)}
      />
      <ConfirmDialog
        open={removingStaff !== null}
        title={t("confirmRemoveStaffTitle", { name: removingStaff?.name ?? "" })}
        body={t("confirmRemoveStaffBody")}
        confirmLabel={t("removeStaff")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removingStaff && void removeStaff(removingStaff)}
        onCancel={() => setRemovingStaff(null)}
      />
      <span className="sr-only">{t("srTitle")}</span>
    </div>
  );
}

function AddPlayerSheet({
  open,
  teamId,
  teamName,
  excluded,
  canCreate,
  onClose,
  onAdded,
  onNewPlayer,
}: {
  open: boolean;
  teamId: string;
  teamName: string;
  excluded: string[];
  /** Dar de alta jugadores nuevos exige escribir jugadores; el cuerpo técnico solo añade de los que hay. */
  canCreate: boolean;
  onClose: () => void;
  onAdded: () => void;
  onNewPlayer: () => void;
}) {
  const t = useT("team.addPlayerSheet");
  const tt = useT("team");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [query, setQuery] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useQuery({
    queryKey: ["org", slug, "players", "all"],
    queryFn: () => apiFetch("/api/org/players", { schema: PlayersResponseSchema }),
    enabled: open,
  });
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players.data?.players ?? [])
      .filter((p) => !excluded.includes(p.id) && p.status === "active")
      .filter((p) => !q || playerDisplayName(p).toLowerCase().includes(q));
  }, [players.data, excluded, query]);
  const selected = candidates.find((p) => p.id === playerId) ?? candidates[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/org/teams/${teamId}/players`, {
        method: "POST",
        body: {
          playerId: selected.id,
          shirtNumber: number.trim() === "" ? null : Number(number),
          position: position.trim() || null,
        },
        schema: TeamDetailResponseSchema,
      });
      toast("success", t("added", { name: playerDisplayName(selected), team: teamName }));
      setPlayerId("");
      setNumber("");
      setPosition("");
      onClose();
      onAdded();
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409
          ? t("alreadyIn")
          : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { team: teamName })}
      description={t("description")}
      footer={
        <>
          {canCreate ? (
            <Button action="add" variant="secondary" onClick={onNewPlayer}>
              {tt("newPlayer")}
            </Button>
          ) : null}
          <Button
            action="add"
            type="submit"
            form="add-player-form"
            loading={busy}
            disabled={!selected}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="add-player-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("search")}>
          {(id) => (
            <Input
              id={id}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPlayerId("");
              }}
            />
          )}
        </Field>
        {players.data && candidates.length === 0 ? (
          <Alert kind="info">{t("empty")}</Alert>
        ) : (
          <Field label={t("player")}>
            {(id) => (
              <Select
                id={id}
                value={selected?.id ?? ""}
                onChange={(e) => setPlayerId(e.target.value)}
              >
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {playerDisplayName(p)}
                    {p.teams.length > 0 ? ` · ${p.teams.map((x) => x.teamName).join(", ")}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("number")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                className="font-mono"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("position")} hint={t("positionHint")}>
            {(id) => (
              <Input
                id={id}
                maxLength={40}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function EntrySheet({
  teamId,
  teamName,
  entry,
  onClose,
  onSaved,
}: {
  teamId: string;
  teamName: string;
  entry: RosterEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("team.entrySheet");
  const ta = useT("team.addPlayerSheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [number, setNumber] = useState(entry.shirtNumber === null ? "" : String(entry.shirtNumber));
  const [position, setPosition] = useState(entry.position ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/org/teams/${teamId}/players/${entry.playerId}`, {
        method: "PATCH",
        body: {
          shirtNumber: number.trim() === "" ? null : Number(number),
          position: position.trim() || null,
        },
        schema: TeamDetailResponseSchema,
      });
      toast("success", t("saved"));
      onClose();
      onSaved();
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
      closeLabel={c("close")}
      title={t("title", { name: playerDisplayName(entry), team: teamName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="entry-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="entry-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => void submit(e)}>
        <Field label={ta("number")}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              className="font-mono"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          )}
        </Field>
        <Field label={ta("position")} hint={ta("positionHint")}>
          {(id) => (
            <Input
              id={id}
              maxLength={40}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

function AddStaffSheet({
  open,
  teamId,
  excluded,
  onClose,
  onAdded,
}: {
  open: boolean;
  teamId: string;
  excluded: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useT("team.addStaffSheet");
  const tt = useT("team");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [userId, setUserId] = useState("");
  const [roleInTeam, setRoleInTeam] = useState<TeamStaffRole>("head_coach");
  const staffRoles = useT("teamStaffRoles");
  const [busy, setBusy] = useState(false);
  const members = useQuery({
    queryKey: ["org", slug, "team", teamId, "eligible-staff"],
    queryFn: () =>
      apiFetch(`/api/org/teams/${teamId}/eligible-staff`, {
        schema: EligibleMembersResponseSchema,
      }),
    enabled: open,
  });
  const candidates = (members.data?.members ?? []).filter((m) => !excluded.includes(m.userId));
  const selected = candidates.find((m) => m.userId === userId) ?? candidates[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/org/teams/${teamId}/staff`, {
        method: "POST",
        body: { userId: selected.userId, roleInTeam },
        schema: TeamDetailResponseSchema,
      });
      toast("success", tt("staffAdded", { name: selected.name }));
      setUserId("");
      onClose();
      onAdded();
    } catch (err) {
      toast("error", errors(errorKey(err)));
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
          <Button action="add" type="submit" form="staff-form" loading={busy} disabled={!selected}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="staff-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {members.data && candidates.length === 0 ? (
          <Alert kind="info">{t("empty")}</Alert>
        ) : (
          <Field label={t("member")}>
            {(id) => (
              <Select
                id={id}
                value={selected?.userId ?? ""}
                onChange={(e) => setUserId(e.target.value)}
              >
                {candidates.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t("role")}>
          {(id) => (
            <Select
              id={id}
              value={roleInTeam}
              onChange={(e) => setRoleInTeam(e.target.value as TeamStaffRole)}
            >
              {TEAM_STAFF_ROLES.map((code) => (
                <option key={code} value={code}>
                  {staffRoles(code)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Sheet>
  );
}

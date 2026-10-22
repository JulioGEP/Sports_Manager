import {
  MatchDetailResponseSchema,
  MatchesResponseSchema,
  type HomeAway,
  type MatchesResponse,
  type MatchSummary,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
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
  type RowAction,
} from "@/ui";

const statusKind: Record<MatchSummary["status"], StatusKind> = {
  scheduled: "info",
  live: "club",
  finished: "neutral",
};

/** Partidos de un equipo (Bloque 20): la lista, el alta y la entrada al partido en directo. */
export function TeamMatchesPage() {
  const t = useT("matches");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const toast = useToast();
  const client = useQueryClient();
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const setCreating = (open: boolean) => setParams(open ? { new: "1" } : {}, { replace: true });
  const [removing, setRemoving] = useState<MatchSummary | null>(null);

  const list = useQuery({
    queryKey: ["org", slug, "team", id, "matches"],
    queryFn: () => apiFetch(`/api/org/teams/${id}/matches`, { schema: MatchesResponseSchema }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  if (list.isError) {
    const notFound = list.error instanceof ApiClientError && list.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(list.error))}</Alert>
    );
  }
  if (!list.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const { team, matches, upcoming, access } = list.data;
  const live = matches.filter((m) => m.status === "live");
  const result = (m: MatchSummary) =>
    m.status === "scheduled" ? t("notPlayed") : `${m.ownScore}–${m.opponentScore}`;
  const outcome = (m: MatchSummary): StatusKind =>
    m.ownScore > m.opponentScore ? "success" : m.ownScore < m.opponentScore ? "danger" : "neutral";
  const outcomeLabel = (m: MatchSummary) =>
    m.ownScore > m.opponentScore ? t("won") : m.ownScore < m.opponentScore ? t("lost") : t("drawn");

  async function remove(m: MatchSummary) {
    setRemoving(null);
    try {
      await apiFetch(`/api/org/matches/${m.id}`, { method: "DELETE" });
      toast("success", t("removed", { opponent: m.opponent }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.team(id)}
        backLabel={t("backToTeam")}
        eyebrow={team.name}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {matches.some((m) => m.status === "finished") ? (
              <ButtonLink
                to={paths.teamMatchHistory(id)}
                variant="secondary"
                icon={<Icon.ChartBar size={18} aria-hidden="true" />}
              >
                {t("history")}
              </ButtonLink>
            ) : null}
            {access.write ? (
              <Button action="add" onClick={() => setCreating(true)}>
                {t("new")}
              </Button>
            ) : null}
          </>
        }
      />

      {live.length > 0 ? (
        <Alert
          kind="info"
          title={t("liveNow", { count: live.length })}
          actions={live.map((m) => (
            <ButtonLink key={m.id} to={paths.match(m.id)} size="sm">
              {t("openLive", { opponent: m.opponent })}
            </ButtonLink>
          ))}
        />
      ) : null}

      <Card
        title={t("list")}
        description={t("listDescription", { count: matches.length })}
        padded={false}
      >
        <DataList<MatchSummary>
          caption={t("list")}
          rows={matches}
          getKey={(m) => m.id}
          empty={
            <EmptyState
              icon={<Icon.SportIcons.Balon />}
              title={t("empty")}
              description={t("emptyHint")}
              action={
                access.write ? (
                  <Button
                    action="add"
                    variant="secondary"
                    size="sm"
                    onClick={() => setCreating(true)}
                  >
                    {t("new")}
                  </Button>
                ) : null
              }
            />
          }
          columns={[
            { key: "date", header: t("table.date"), cell: (m) => dates.day(m.playedOn) },
            {
              key: "opponent",
              header: t("table.opponent"),
              cell: (m) => (
                <span className="flex min-w-0 flex-col">
                  <Link
                    to={m.status === "finished" ? paths.matchStats(m.id) : paths.match(m.id)}
                    className="font-medium text-ink"
                  >
                    {m.homeAway === "home"
                      ? `${team.name} – ${m.opponent}`
                      : `${m.opponent} – ${team.name}`}
                  </Link>
                  <span className="text-secondary text-muted">
                    {m.homeAway === "home" ? t("home") : t("away")}
                  </span>
                </span>
              ),
            },
            {
              key: "result",
              header: t("table.result"),
              numeric: true,
              cell: (m) => result(m),
            },
            {
              key: "status",
              header: t("table.status"),
              cell: (m) =>
                m.status === "finished" ? (
                  <StatusChip kind={outcome(m)}>{outcomeLabel(m)}</StatusChip>
                ) : (
                  <StatusChip kind={statusKind[m.status]}>{t(`status.${m.status}`)}</StatusChip>
                ),
            },
            {
              key: "events",
              header: t("table.events"),
              numeric: true,
              cell: (m) => m.eventsCount,
            },
          ]}
          mobileRow={(m) => ({
            leading: (
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-secondary text-club-soft-text">
                {result(m)}
              </span>
            ),
            title: (
              <Link to={m.status === "finished" ? paths.matchStats(m.id) : paths.match(m.id)}>
                {m.opponent}
              </Link>
            ),
            subtitle: `${dates.day(m.playedOn)} · ${m.homeAway === "home" ? t("home") : t("away")}`,
            trailing:
              m.status === "finished" ? (
                <StatusChip kind={outcome(m)}>{outcomeLabel(m)}</StatusChip>
              ) : (
                <StatusChip kind={statusKind[m.status]}>{t(`status.${m.status}`)}</StatusChip>
              ),
          })}
          href={(m) => (m.status === "finished" ? paths.matchStats(m.id) : paths.match(m.id))}
          rowActions={(m): RowAction[] => [
            ...(m.eventsCount > 0 && m.status !== "finished"
              ? [
                  {
                    key: "stats",
                    label: t("stats"),
                    icon: <Icon.ChartBar size={16} aria-hidden="true" />,
                    to: paths.matchStats(m.id),
                  },
                ]
              : []),
            ...(access.write
              ? [
                  {
                    key: "remove",
                    label: t("remove"),
                    action: "delete" as const,
                    tone: "danger" as const,
                    onClick: () => setRemoving(m),
                  },
                ]
              : []),
          ]}
          actions={(m) =>
            m.status === "live" ? (
              <ButtonLink to={paths.match(m.id)} size="sm" action="open">
                {t("continue")}
              </ButtonLink>
            ) : null
          }
        />
      </Card>

      {access.write ? (
        <NewMatchSheet
          open={creating}
          teamId={id}
          teamName={team.name}
          upcoming={upcoming}
          onClose={() => setCreating(false)}
          onCreated={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("confirmRemoveTitle", { opponent: removing?.opponent ?? "" })}
        body={t("confirmRemoveBody")}
        confirmLabel={t("remove")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

/** Alta de un partido: rival, fecha, casa o fuera; opcionalmente desde un partido de la agenda. */
export function NewMatchSheet({
  open,
  teamId,
  teamName,
  upcoming,
  onClose,
  onCreated,
}: {
  open: boolean;
  teamId: string;
  teamName: string;
  upcoming: MatchesResponse["upcoming"];
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT("matches.newSheet");
  const tm = useT("matches");
  const c = useT("common");
  const errors = useT("errors");
  const intl = useIntl();
  const toast = useToast();
  const navigate = useNavigate();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [eventId, setEventId] = useState("");
  const [opponent, setOpponent] = useState("");
  const [homeAway, setHomeAway] = useState<HomeAway>("home");
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  function pickEvent(id: string) {
    setEventId(id);
    const ev = upcoming.find((e) => e.id === id);
    if (!ev) return;
    if (ev.opponent) setOpponent(ev.opponent);
    if (ev.homeAway) setHomeAway(ev.homeAway);
    setPlayedOn(ev.startsAt.slice(0, 10));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await apiFetch(`/api/org/teams/${teamId}/matches`, {
        method: "POST",
        body: { opponent: opponent.trim(), homeAway, playedOn, eventId: eventId || null },
        schema: MatchDetailResponseSchema,
      });
      toast("success", t("created", { opponent: created.match.opponent }));
      onClose();
      onCreated();
      void navigate(paths.match(created.match.id));
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
      title={t("title", { team: teamName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="add"
            type="submit"
            form="new-match-form"
            loading={busy}
            disabled={!opponent.trim()}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="new-match-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {upcoming.length > 0 ? (
          <Field label={t("fromAgenda")} hint={t("fromAgendaHint")}>
            {(id) => (
              <Select id={id} value={eventId} onChange={(e) => pickEvent(e.target.value)}>
                <option value="">{t("noEvent")}</option>
                {upcoming.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {intl.formatDate(new Date(ev.startsAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {ev.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={t("opponent")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("homeAway")}>
            {(id) => (
              <Select
                id={id}
                value={homeAway}
                onChange={(e) => setHomeAway(e.target.value as HomeAway)}
              >
                <option value="home">{tm("home")}</option>
                <option value="away">{tm("away")}</option>
              </Select>
            )}
          </Field>
          <Field label={t("date")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={playedOn}
                onChange={(e) => setPlayedOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        <p className="text-secondary text-muted">{t("squadHint")}</p>
      </form>
    </Sheet>
  );
}

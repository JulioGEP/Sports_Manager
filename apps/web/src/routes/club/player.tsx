import {
  EligibleMembersResponseSchema,
  GUARDIAN_RELATIONSHIPS,
  InvitationSentResponseSchema,
  LOCALES,
  PlayerDetailResponseSchema,
  PlayerResponseSchema,
  playerDisplayName,
  type Guardian,
  type GuardianRelationship,
  type Locale,
  type PlayerDetailResponse,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { useVoice } from "@/lib/voice";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  CopyLink,
  Definitions,
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

type Player = PlayerDetailResponse["player"];
type Pending = PlayerDetailResponse["pendingInvitations"][number];

const inviteKind: Record<Pending["state"], StatusKind> = {
  pending: "info",
  accepted: "success",
  revoked: "neutral",
  expired: "warning",
};

/** Ficha de un jugador: datos, equipos, familia y estado. Datos de menores: solo personal del club. */
export function PlayerPage() {
  const t = useT("player");
  const ps = useT("playerStatus");
  const rel = useT("relationships");
  const states = useT("invitationState");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const dates = useDates();
  const voice = useVoice();
  const { id = "" } = useParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canWrite = permissions.includes("org.players.write");
  const canInvite = permissions.includes("org.members.invite");

  const detail = useQuery({
    queryKey: ["org", slug, "player", id],
    queryFn: () => apiFetch(`/api/org/players/${id}`, { schema: PlayerDetailResponseSchema }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<Guardian | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);

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
  const { player, teams, guardians, pendingInvitations } = detail.data;
  const name = playerDisplayName(player);
  const age = dates.age(player.birthDate);

  async function setStatus(status: Player["status"]) {
    setDeactivating(false);
    try {
      await apiFetch(`/api/org/players/${id}`, {
        method: "PATCH",
        body: { status },
        schema: PlayerResponseSchema,
      });
      toast(
        "success",
        status === "inactive" ? t("deactivated", { name }) : t("reactivated", { name }),
      );
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }
  async function unlink(g: Guardian) {
    setUnlinking(null);
    try {
      await apiFetch(`/api/org/players/${id}/guardians/${g.userId}`, { method: "DELETE" });
      toast("success", t("unlinked", { name: g.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ButtonLink
          to={paths.players}
          variant="tertiary"
          size="sm"
          icon={<Icon.ArrowLeft size={16} aria-hidden="true" />}
        >
          {t("back")}
        </ButtonLink>
      </div>
      <PageHeader
        title={
          <>
            <Avatar name={name} size="lg" />
            {name}
            <StatusChip kind={player.status === "active" ? "success" : "neutral"}>
              {ps(player.status)}
            </StatusChip>
          </>
        }
        description={
          teams
            .filter((x) => x.seasonIsCurrent)
            .map((x) => x.teamName)
            .join(", ") || undefined
        }
        actions={
          canWrite ? (
            <Button
              variant="secondary"
              icon={<Icon.PencilSimple size={18} aria-hidden="true" />}
              onClick={() => setEditing(true)}
            >
              {t("edit")}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("data")} description={t("dataDescription")}>
          <Definitions
            items={[
              { term: t("born"), detail: player.birthDate ? dates.day(player.birthDate) : "–" },
              { term: t("age"), detail: age === null ? "–" : String(age) },
              { term: t("since"), detail: dates.day(player.createdAt.slice(0, 10)) },
            ]}
          />
        </Card>

        <Card title={t("teams")} description={t("teamsDescription")} padded={false}>
          {teams.length === 0 ? (
            <EmptyState icon={<Icon.UsersThree weight="duotone" />} title={t("emptyTeams")} />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {teams.map((x) => (
                <li key={x.teamId} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-club-soft font-mono text-body text-club-soft-text">
                    {x.shirtNumber ?? "–"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link to={paths.team(x.teamId)} className="truncate font-medium text-ink">
                      {x.teamName}
                    </Link>
                    <span className="truncate text-secondary text-muted">
                      {x.sectionName} · {x.seasonName}
                      {x.position ? ` · ${x.position}` : ""}
                    </span>
                  </span>
                  {x.seasonIsCurrent ? (
                    <StatusChip kind="club">{t("currentSeason")}</StatusChip>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={t("family")}
          description={t("familyDescription")}
          padded={false}
          actions={
            canWrite ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setLinking(true)}>
                  {t("linkMember")}
                </Button>
                {canInvite ? (
                  <Button
                    size="sm"
                    icon={<Icon.Envelope size={16} aria-hidden="true" />}
                    onClick={() => setInviting(true)}
                  >
                    {t("inviteFamily")}
                  </Button>
                ) : null}
              </>
            ) : null
          }
        >
          {lastLink ? (
            <div className="px-5 pb-4">
              <CopyLink
                url={lastLink.url}
                hint={t("inviteSheet.linkHint", { email: lastLink.email })}
                copyLabel={c("copy")}
                copiedLabel={c("copied")}
              />
            </div>
          ) : null}
          {guardians.length === 0 && pendingInvitations.length === 0 ? (
            <EmptyState icon={<Icon.HandHeart weight="duotone" />} title={t("emptyFamily")} />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {guardians.map((g) => (
                <li key={g.userId} className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3">
                  <Avatar name={g.name} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-ink">{g.name}</span>
                    <span className="truncate text-secondary text-muted">{g.email}</span>
                  </span>
                  <StatusChip kind="club">{rel(g.relationship)}</StatusChip>
                  {canWrite ? (
                    <Button variant="tertiary" size="sm" onClick={() => setUnlinking(g)}>
                      {t("unlink")}
                    </Button>
                  ) : null}
                </li>
              ))}
              {pendingInvitations.map((i) => (
                <li key={i.id} className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised text-muted">
                    <Icon.Envelope size={20} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-ink">{i.email}</span>
                    <span className="truncate text-secondary text-muted">
                      {i.relationship ? rel(i.relationship) : t("pendingInvitations")} ·{" "}
                      {dates.day(i.expiresAt.slice(0, 10))}
                    </span>
                  </span>
                  <StatusChip kind={inviteKind[i.state]}>{states(i.state)}</StatusChip>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canWrite ? (
          <Card title={t("status")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusChip kind={player.status === "active" ? "success" : "neutral"}>
                {ps(player.status)}
              </StatusChip>
              {player.status === "active" ? (
                <Button variant="danger" size="sm" onClick={() => setDeactivating(true)}>
                  {t("deactivate")}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void setStatus("active")}>
                  {t("reactivate")}
                </Button>
              )}
            </div>
          </Card>
        ) : null}
      </div>

      {editing ? (
        <EditPlayerSheet
          player={player}
          onClose={() => setEditing(false)}
          onSaved={() => void reload()}
        />
      ) : null}
      {inviting ? (
        <InviteFamilySheet
          playerId={id}
          playerName={name}
          defaultLocale={org.organization.view === "full" ? org.organization.defaultLocale : "es"}
          onClose={() => setInviting(false)}
          onSent={(email, url) => {
            if (url) setLastLink({ email, url });
            void reload();
          }}
        />
      ) : null}
      {linking ? (
        <LinkMemberSheet
          playerId={id}
          playerName={name}
          excluded={guardians.map((g) => g.userId)}
          onClose={() => setLinking(false)}
          onLinked={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={unlinking !== null}
        title={t("confirmUnlinkTitle", { name: unlinking?.name ?? "" })}
        body={t("confirmUnlinkBody")}
        confirmLabel={t("unlink")}
        cancelLabel={c("cancel")}
        onConfirm={() => unlinking && void unlink(unlinking)}
        onCancel={() => setUnlinking(null)}
      />
      {/* Dar de baja es un momento sensible: texto del design system, siempre en voz profesional. */}
      <ConfirmDialog
        open={deactivating}
        title={voice("member.remove.title", { player: name })}
        body={voice("member.remove.body")}
        confirmLabel={voice("member.remove.confirm")}
        cancelLabel={c("cancel")}
        onConfirm={() => void setStatus("inactive")}
        onCancel={() => setDeactivating(false)}
      />
    </div>
  );
}

function EditPlayerSheet({
  player,
  onClose,
  onSaved,
}: {
  player: Player;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("player.editSheet");
  const tp = useT("players.sheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [firstName, setFirstName] = useState(player.firstName);
  const [lastName, setLastName] = useState(player.lastName);
  const [birthDate, setBirthDate] = useState(player.birthDate ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${player.id}`, {
        method: "PATCH",
        body: { firstName, lastName, birthDate: birthDate || null },
        schema: PlayerResponseSchema,
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
      title={t("title")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="edit-player-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="edit-player-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tp("firstName")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={60}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            )}
          </Field>
          <Field label={tp("lastName")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={80}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={tp("birthDate")} hint={tp("birthDateHint")}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

function InviteFamilySheet({
  playerId,
  playerName,
  defaultLocale,
  onClose,
  onSent,
}: {
  playerId: string;
  playerName: string;
  defaultLocale: Locale;
  onClose: () => void;
  onSent: (email: string, url: string | null) => void;
}) {
  const t = useT("player.inviteSheet");
  const rel = useT("relationships");
  const locales = useT("locales");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<GuardianRelationship>("mother");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sent = await apiFetch(`/api/org/players/${playerId}/guardians/invite`, {
        method: "POST",
        body: { email, relationship, locale },
        schema: InvitationSentResponseSchema,
      });
      toast(
        "success",
        t(sent.emailStatus === "failed" ? "failed" : "sent", { email: sent.invitation.email }),
      );
      onClose();
      onSent(sent.invitation.email, sent.acceptUrl);
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409 && /miembro/.test(err.message)
          ? t("alreadyMember")
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
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="invite-family-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form
        id="invite-family-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void submit(e)}
      >
        <Field label={t("email")}>
          {(id) => (
            <Input
              id={id}
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("relationship")}>
            {(id) => (
              <Select
                id={id}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}
              >
                {GUARDIAN_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {rel(r)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("language")}>
            {(id) => (
              <Select id={id} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {locales(code)}
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

function LinkMemberSheet({
  playerId,
  playerName,
  excluded,
  onClose,
  onLinked,
}: {
  playerId: string;
  playerName: string;
  excluded: string[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const t = useT("player.linkSheet");
  const rel = useT("relationships");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [userId, setUserId] = useState("");
  const [relationship, setRelationship] = useState<GuardianRelationship>("mother");
  const [busy, setBusy] = useState(false);
  const members = useQuery({
    queryKey: ["org", slug, "player", playerId, "eligible-guardians"],
    queryFn: () =>
      apiFetch(`/api/org/players/${playerId}/eligible-guardians`, {
        schema: EligibleMembersResponseSchema,
      }),
  });
  const candidates = (members.data?.members ?? []).filter((m) => !excluded.includes(m.userId));
  const selected = candidates.find((m) => m.userId === userId) ?? candidates[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/org/players/${playerId}/guardians`, {
        method: "POST",
        body: { userId: selected.userId, relationship },
        schema: PlayerDetailResponseSchema,
      });
      toast("success", t("linked", { member: selected.name, name: playerName }));
      onClose();
      onLinked();
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
      title={t("title", { name: playerName })}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="link-member-form" loading={busy} disabled={!selected}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="link-member-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
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
        <Field label={t("relationship")}>
          {(id) => (
            <Select
              id={id}
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}
            >
              {GUARDIAN_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {rel(r)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Sheet>
  );
}

import {
  InvitationSentResponseSchema,
  InvitationsResponseSchema,
  LOCALES,
  MemberSectionsResponseSchema,
  MembersResponseSchema,
  ROLE_CODES,
  SectionsResponseSchema,
  STAFF_POSITIONS,
  TeamsResponseSchema,
  type Invitation,
  type InvitationSentResponse,
  type Locale,
  type MembersResponse,
  type RoleCode,
  type StaffPosition,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { useSearchParams } from "react-router";
import { Link } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { AccessMatrix } from "./staff-access";
import {
  Alert,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  CopyLink,
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
  type StatusKind,
  type RowAction,
} from "@/ui";

type Member = MembersResponse["members"][number];
type Tab = "members" | "invitations" | "access";

const stateKind: Record<Invitation["state"], StatusKind> = {
  pending: "info",
  accepted: "success",
  revoked: "neutral",
  expired: "warning",
};

/**
 * Personal del club (Bloque 14): quien trabaja en el club con su rol o cargo. Las cuentas de
 * familia no salen aquí: se gestionan desde la ficha de cada deportista.
 */
export function StaffPage() {
  const t = useT("members");
  const c = useT("common");
  const roles = useT("roles");
  const positions = useT("positions");
  const locales = useT("locales");
  const states = useT("invitationState");
  const errors = useT("errors");
  const intl = useIntl();
  const toast = useToast();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canInvite = permissions.includes("org.members.invite");
  const canManage = permissions.includes("org.members.manage");
  const defaultLocale = org.organization.view === "full" ? org.organization.defaultLocale : "es";

  const tab: Tab =
    params.get("tab") === "invitations"
      ? "invitations"
      : params.get("tab") === "access" && canManage
        ? "access"
        : "members";
  const inviteOpen = params.get("invite") === "1";
  const [query, setQuery] = useState("");
  const [rolesFor, setRolesFor] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);

  const members = useQuery({
    queryKey: ["org", slug, "members"],
    queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
  });
  const invitations = useQuery({
    queryKey: ["org", slug, "invitations"],
    queryFn: () => apiFetch("/api/org/invitations", { schema: InvitationsResponseSchema }),
    enabled: canInvite,
  });
  const teams = useQuery({
    queryKey: ["org", slug, "teams", null],
    queryFn: () => apiFetch("/api/org/teams", { schema: TeamsResponseSchema }),
    enabled: canInvite,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });
  /** Rol o cargo, para enseñar: el personal se identifica por su cargo. */
  const roleLabel = (m: Member, r: RoleCode) =>
    r === "staff" && m.position ? positions(m.position) : roles(r);

  /**
   * Solo el personal: quien solo es familia o deportista (ADR 0046) no trabaja en el club; está
   * en la ficha de su deportista.
   */
  const staffOnly = useMemo(
    () =>
      (members.data?.members ?? []).filter((m) =>
        m.roles.some((r) => r !== "guardian" && r !== "athlete"),
      ),
    [members.data],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staffOnly;
    return staffOnly.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [staffOnly, query]);
  const visibleInvitations =
    invitations.data?.invitations.filter((i) => i.state !== "accepted") ?? [];
  const pendingCount =
    invitations.data?.invitations.filter((i) => i.state === "pending").length ?? 0;

  function setTab(next: Tab) {
    setParams(next === "members" ? {} : { tab: next }, { replace: true });
  }
  function setInviteOpen(open: boolean) {
    const next = new URLSearchParams(params);
    if (open) next.set("invite", "1");
    else next.delete("invite");
    setParams(next, { replace: true });
  }

  function onInvited(sent: InvitationSentResponse) {
    toast(
      "success",
      t(sent.emailStatus === "failed" ? "inviteDrawer.failed" : "inviteDrawer.sent", {
        email: sent.invitation.email,
      }),
    );
    if (sent.acceptUrl) setLastLink({ email: sent.invitation.email, url: sent.acceptUrl });
    setParams({ tab: "invitations" }, { replace: true });
    void reload();
  }

  async function resend(id: string) {
    try {
      const sent = await apiFetch(`/api/org/invitations/${id}/resend`, {
        method: "POST",
        body: {},
        schema: InvitationSentResponseSchema,
      });
      toast("success", t("invitations.resent", { email: sent.invitation.email }));
      if (sent.acceptUrl) setLastLink({ email: sent.invitation.email, url: sent.acceptUrl });
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  async function revoke(inv: Invitation) {
    setRevoking(null);
    try {
      await apiFetch(`/api/org/invitations/${inv.id}`, { method: "DELETE" });
      toast("success", t("invitations.revoked", { email: inv.email }));
      if (lastLink?.email === inv.email) setLastLink(null);
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const date = (iso: string) => intl.formatDate(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canInvite ? (
            <Button action="invite" onClick={() => setInviteOpen(true)}>
              {t("invite")}
            </Button>
          ) : null
        }
      />
      {members.isError ? <Alert kind="error">{errors(errorKey(members.error))}</Alert> : null}

      {canInvite ? (
        <Tabs<Tab>
          label={t("title")}
          selected={tab}
          onChange={setTab}
          items={[
            {
              key: "members",
              label: t("tabs.members"),
              count: members.data ? staffOnly.length : undefined,
            },
            { key: "invitations", label: t("tabs.invitations"), count: pendingCount },
            ...(canManage ? [{ key: "access" as const, label: t("tabs.access") }] : []),
          ]}
        />
      ) : null}

      {tab === "access" ? (
        <AccessMatrix />
      ) : tab === "members" ? (
        <div className="flex flex-col gap-4">
          <div className="relative max-w-sm">
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
          <Card padded={false}>
            <DataList<Member>
              caption={t("title")}
              rows={filtered}
              getKey={(m) => m.userId}
              empty={
                <EmptyState
                  icon={<Icon.Users weight="duotone" />}
                  title={members.isPending ? c("loading") : t("empty")}
                />
              }
              columns={[
                {
                  key: "person",
                  header: t("table.name"),
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
                  key: "roles",
                  header: t("table.roles"),
                  cell: (m) => (
                    <span className="flex flex-wrap gap-1">
                      {m.roles.map((r) => (
                        <StatusChip key={r} kind="club">
                          {roleLabel(m, r)}
                        </StatusChip>
                      ))}
                    </span>
                  ),
                },
                {
                  key: "teams",
                  header: t("table.teams"),
                  cell: (m) =>
                    m.teams.length > 0 ? (
                      <span className="flex flex-wrap gap-x-2 gap-y-1">
                        {m.teams.map((team) => (
                          <Link key={team.teamId} to={paths.team(team.teamId)}>
                            {team.teamName}
                          </Link>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted">{t("noTeams")}</span>
                    ),
                },
                {
                  key: "sections",
                  header: t("table.sections"),
                  cell: (m) =>
                    m.sections.length > 0 ? (
                      <span className="flex flex-wrap gap-x-2 gap-y-1">
                        {m.sections.map((section) => (
                          <Link key={section.sectionId} to={paths.section(section.sectionId)}>
                            {section.sectionName}
                          </Link>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted">{t("noSections")}</span>
                    ),
                },
                { key: "since", header: t("table.since"), cell: (m) => date(m.memberSince) },
              ]}
              mobileRow={(m) => ({
                leading: <Avatar name={m.name} />,
                title: m.name,
                subtitle: [
                  m.roles.map((r) => roleLabel(m, r)).join(" · "),
                  m.teams.map((x) => x.teamName).join(", "),
                  m.sections.map((x) => x.sectionName).join(", "),
                ]
                  .filter(Boolean)
                  .join(" · "),
              })}
              rowActions={
                canManage
                  ? (m): RowAction[] => [
                      {
                        key: "roles",
                        label: t("roles.manage"),
                        action: "edit",
                        onClick: () => setRolesFor(m),
                      },
                    ]
                  : undefined
              }
            />
          </Card>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {lastLink ? (
            <CopyLink
              url={lastLink.url}
              hint={t("inviteDrawer.linkHint", { email: lastLink.email })}
              copyLabel={c("copy")}
              copiedLabel={c("copied")}
            />
          ) : null}
          <Card padded={false}>
            <DataList<Invitation>
              caption={t("tabs.invitations")}
              rows={visibleInvitations}
              getKey={(i) => i.id}
              empty={
                <EmptyState
                  icon={<Icon.Envelope weight="duotone" />}
                  title={invitations.isPending ? c("loading") : t("emptyInvitations")}
                  action={
                    invitations.data ? (
                      <Button
                        action="invite"
                        variant="secondary"
                        size="sm"
                        onClick={() => setInviteOpen(true)}
                      >
                        {t("invite")}
                      </Button>
                    ) : null
                  }
                />
              }
              columns={[
                {
                  key: "email",
                  header: t("invitations.email"),
                  cell: (i) => <strong className="font-medium">{i.email}</strong>,
                },
                {
                  key: "role",
                  header: t("invitations.role"),
                  cell: (i) => (
                    <span className="flex flex-col">
                      <span>{i.position ? positions(i.position) : roles(i.roleCode)}</span>
                      {i.player ? (
                        <span className="text-secondary text-muted">
                          {t("invitations.player", { name: i.player.name })}
                        </span>
                      ) : null}
                      {i.team ? (
                        <span className="text-secondary text-muted">{i.team.name}</span>
                      ) : null}
                    </span>
                  ),
                },
                { key: "lang", header: t("invitations.language"), cell: (i) => locales(i.locale) },
                {
                  key: "state",
                  header: t("invitations.state"),
                  cell: (i) => <StatusChip kind={stateKind[i.state]}>{states(i.state)}</StatusChip>,
                },
                {
                  key: "expires",
                  header: t("invitations.expires"),
                  cell: (i) => date(i.expiresAt),
                },
              ]}
              mobileRow={(i) => ({
                title: i.email,
                subtitle: `${i.player ? t("invitations.player", { name: i.player.name }) : i.position ? positions(i.position) : roles(i.roleCode)}${i.team ? ` · ${i.team.name}` : ""} · ${date(i.expiresAt)}`,
                trailing: <StatusChip kind={stateKind[i.state]}>{states(i.state)}</StatusChip>,
              })}
              rowActions={(i): RowAction[] =>
                i.state === "pending" || i.state === "expired"
                  ? [
                      {
                        key: "resend",
                        label: t("invitations.resend"),
                        action: "send",
                        onClick: () => void resend(i.id),
                      },
                      {
                        key: "revoke",
                        label: t("invitations.revoke"),
                        action: "delete",
                        tone: "danger",
                        onClick: () => setRevoking(i),
                      },
                    ]
                  : []
              }
            />
          </Card>
        </div>
      )}

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        defaultLocale={defaultLocale}
        teams={teams.data?.teams.map((x) => ({ id: x.id, name: x.name })) ?? []}
        onInvited={onInvited}
      />
      {rolesFor ? (
        <RolesSheet
          member={rolesFor}
          onClose={() => setRolesFor(null)}
          onChanged={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={revoking !== null}
        title={t("invitations.confirmRevokeTitle", { email: revoking?.email ?? "" })}
        body={t("invitations.confirmRevokeBody")}
        confirmLabel={t("invitations.revoke")}
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => revoking && void revoke(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}

function InviteSheet({
  open,
  onClose,
  defaultLocale,
  teams,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  defaultLocale: Locale;
  teams: { id: string; name: string }[];
  onInvited: (sent: InvitationSentResponse) => void;
}) {
  const t = useT("members.inviteDrawer");
  const c = useT("common");
  const roles = useT("roles");
  const positions = useT("positions");
  const locales = useT("locales");
  const errors = useT("errors");
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState<RoleCode>("coach");
  const [position, setPosition] = useState<StaffPosition>("director");
  const [teamId, setTeamId] = useState("");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withTeam = roleCode === "coach" || roleCode === "staff";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sent = await apiFetch("/api/org/invitations", {
        method: "POST",
        body: {
          email,
          roleCode,
          locale,
          position: roleCode === "staff" ? position : null,
          teamId: withTeam && teamId ? teamId : null,
        },
        schema: InvitationSentResponseSchema,
      });
      setEmail("");
      setTeamId("");
      // Primero cierra (quita `invite` de la URL) y después cambia a la pestaña de invitaciones.
      onClose();
      onInvited(sent);
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
          <Button action="send" type="submit" form="invite-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="invite-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
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
          <Field label={t("role")} hint={t(`roleHint.${roleCode}`)}>
            {(id) => (
              <Select
                id={id}
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value as RoleCode)}
              >
                {/* El deportista entra desde su ficha, no desde aquí (ADR 0046). */}
                {ROLE_CODES.filter((code) => code !== "athlete").map((code) => (
                  <option key={code} value={code}>
                    {roles(code)}
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
        {roleCode === "staff" ? (
          <Field label={t("position")} hint={positions(`hint.${position}`)}>
            {(id) => (
              <Select
                id={id}
                value={position}
                onChange={(e) => setPosition(e.target.value as StaffPosition)}
              >
                {STAFF_POSITIONS.map((code) => (
                  <option key={code} value={code}>
                    {positions(code)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {withTeam && teams.length > 0 ? (
          <Field label={t("team")} hint={t("teamHint")}>
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

function RolesSheet({
  member,
  onClose,
  onChanged,
}: {
  member: Member;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT("members.roles");
  const c = useT("common");
  const roles = useT("roles");
  const positions = useT("positions");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [current, setCurrent] = useState<RoleCode[]>(member.roles);
  const [position, setPosition] = useState<StaffPosition>(member.position ?? "director");
  const [busy, setBusy] = useState<RoleCode | null>(null);

  /**
   * Alcance (Bloque 19): dirección y coordinación llevan secciones; las que ya coordina cuentan
   * solas. Las excepciones por persona no se tocan aquí: viven solo en la pestaña "Acceso".
   */
  const withSections =
    current.includes("staff") && (position === "director" || position === "coordinator");
  const sections = useQuery({
    queryKey: ["org", slug, "sections", null],
    queryFn: () => apiFetch("/api/org/sections", { schema: SectionsResponseSchema }),
    enabled: withSections,
  });
  const coordinated = new Set(
    (sections.data?.sections ?? [])
      .filter((s) => s.coordinator?.userId === member.userId)
      .map((s) => s.id),
  );
  const [chosenSections, setChosenSections] = useState<Set<string>>(
    () => new Set(member.sections.map((s) => s.sectionId)),
  );
  const [savingSections, setSavingSections] = useState(false);

  async function saveSections() {
    setSavingSections(true);
    try {
      await apiFetch(`/api/org/members/${member.userId}/sections`, {
        method: "PUT",
        body: { sectionIds: [...chosenSections].filter((id) => !coordinated.has(id)) },
        schema: MemberSectionsResponseSchema,
      });
      toast("success", t("sectionsSaved", { name: member.name }));
      onChanged();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setSavingSections(false);
    }
  }
  type RolesResult = { roles: RoleCode[]; position: StaffPosition | null };
  async function toggle(role: RoleCode) {
    setBusy(role);
    try {
      const res = current.includes(role)
        ? await apiFetch<RolesResult>(`/api/org/members/${member.userId}/roles/${role}`, {
            method: "DELETE",
          })
        : await apiFetch<RolesResult>(`/api/org/members/${member.userId}/roles`, {
            method: "POST",
            body: { roleCode: role, position: role === "staff" ? position : null },
          });
      setCurrent(res.roles);
      onChanged();
    } catch (err) {
      const key = errorKey(err);
      toast("error", key === "conflict" ? t("lastAdmin") : errors(key));
    } finally {
      setBusy(null);
    }
  }
  /** Cambiar el cargo de quien ya es personal: la misma llamada, el rol se queda. */
  async function changePosition(next: StaffPosition) {
    setPosition(next);
    if (!current.includes("staff")) return;
    setBusy("staff");
    try {
      await apiFetch<RolesResult>(`/api/org/members/${member.userId}/roles`, {
        method: "POST",
        body: { roleCode: "staff", position: next },
      });
      toast("success", t("positionSaved", { position: positions(next) }));
      onChanged();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title", { name: member.name })}
      description={t("description")}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {c("close")}
        </Button>
      }
    >
      <ul className="flex flex-col gap-2">
        {/* El rol de deportista llega con su ficha: aquí solo se puede quitar. */}
        {ROLE_CODES.filter((role) => role !== "athlete" || current.includes(role)).map((role) => {
          const has = current.includes(role);
          return (
            <li
              key={role}
              className="flex min-h-16 items-center gap-3 rounded-field border border-border px-4 py-2"
            >
              <span
                aria-hidden="true"
                className={`grid size-7 shrink-0 place-items-center rounded-full ${has ? "bg-success-soft text-success" : "border border-control text-muted"}`}
              >
                {has ? <Icon.Check size={16} weight="bold" /> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="text-body font-medium text-ink">{roles(role)}</strong>
                <span className="text-secondary text-muted">{t(`hint.${role}`)}</span>
                {role === "staff" ? (
                  <span className="pt-2">
                    <Select
                      aria-label={t("position")}
                      value={position}
                      disabled={busy === "staff"}
                      onChange={(e) => void changePosition(e.target.value as StaffPosition)}
                    >
                      {STAFF_POSITIONS.map((code) => (
                        <option key={code} value={code}>
                          {positions(code)}
                        </option>
                      ))}
                    </Select>
                  </span>
                ) : null}
              </span>
              <Button
                iconOnly
                action={has ? "delete" : "add"}
                variant={has ? "danger" : "secondary"}
                size="sm"
                loading={busy === role}
                onClick={() => void toggle(role)}
              >
                {has ? c("remove") : t("add")}
              </Button>
            </li>
          );
        })}
      </ul>

      {withSections ? (
        <section className="mt-6 flex flex-col gap-3" aria-labelledby="roles-sections">
          <div className="flex flex-col gap-0.5">
            <h3 id="roles-sections" className="text-body font-medium text-ink">
              {t("sections")}
            </h3>
            <p className="text-secondary text-muted">{t("sectionsHint")}</p>
          </div>
          {sections.data && sections.data.sections.length === 0 ? (
            <p className="text-secondary text-muted">{t("sectionsEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(sections.data?.sections ?? []).map((section) => {
                const fixed = coordinated.has(section.id);
                return (
                  <li key={section.id}>
                    <label className="flex min-h-11 items-center gap-3 rounded-field px-2 hover:bg-raised">
                      <input
                        type="checkbox"
                        className="size-5 accent-club"
                        checked={fixed || chosenSections.has(section.id)}
                        disabled={fixed || savingSections}
                        onChange={(e) =>
                          setChosenSections((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(section.id);
                            else next.delete(section.id);
                            return next;
                          })
                        }
                      />
                      <span className="flex-1 text-body text-ink">{section.name}</span>
                      {fixed ? <StatusChip kind="club">{t("coordinates")}</StatusChip> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div>
            <Button
              variant="secondary"
              size="sm"
              loading={savingSections}
              onClick={() => void saveSections()}
            >
              {c("save")}
            </Button>
          </div>
        </section>
      ) : null}
    </Sheet>
  );
}

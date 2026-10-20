import {
  InvitationSentResponseSchema,
  InvitationsResponseSchema,
  LOCALES,
  MembersResponseSchema,
  ROLE_CODES,
  type Invitation,
  type InvitationSentResponse,
  type Locale,
  type MembersResponse,
  type RoleCode,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { useSearchParams } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
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
} from "@/ui";

type Member = MembersResponse["members"][number];
type Tab = "members" | "invitations";

const stateKind: Record<Invitation["state"], StatusKind> = {
  pending: "info",
  accepted: "success",
  revoked: "neutral",
  expired: "warning",
};

export function MembersPage() {
  const t = useT("members");
  const c = useT("common");
  const roles = useT("roles");
  const locales = useT("locales");
  const states = useT("invitationState");
  const errors = useT("errors");
  const intl = useIntl();
  const toast = useToast();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { org, slug } = useReadyClub();
  const permissions = org.actor.permissions;
  const canInvite = permissions.includes("org.members.invite");
  const canManage = permissions.includes("org.members.manage");
  const defaultLocale = org.organization.view === "full" ? org.organization.defaultLocale : "es";

  const tab: Tab = params.get("tab") === "invitations" ? "invitations" : "members";
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
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  const filtered = useMemo(() => {
    const list = members.data?.members ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members.data, query]);
  const visibleInvitations =
    invitations.data?.invitations.filter((i) => i.state !== "accepted") ?? [];
  const pendingCount =
    invitations.data?.invitations.filter((i) => i.state === "pending").length ?? 0;

  function setTab(next: Tab) {
    setParams(next === "invitations" ? { tab: "invitations" } : {}, { replace: true });
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
            <Button
              icon={<Icon.Plus size={20} aria-hidden="true" />}
              onClick={() => setInviteOpen(true)}
            >
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
            { key: "members", label: t("tabs.members"), count: members.data?.members.length },
            { key: "invitations", label: t("tabs.invitations"), count: pendingCount },
          ]}
        />
      ) : null}

      {tab === "members" ? (
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
                          {roles(r)}
                        </StatusChip>
                      ))}
                    </span>
                  ),
                },
                { key: "since", header: t("table.since"), cell: (m) => date(m.memberSince) },
              ]}
              mobileRow={(m) => ({
                leading: <Avatar name={m.name} />,
                title: m.name,
                subtitle: m.roles.map((r) => roles(r)).join(" · "),
              })}
              actions={
                canManage
                  ? (m) => (
                      <Button variant="secondary" size="sm" onClick={() => setRolesFor(m)}>
                        {t("roles.manage")}
                      </Button>
                    )
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
                        variant="secondary"
                        size="sm"
                        icon={<Icon.Plus size={16} aria-hidden="true" />}
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
                { key: "role", header: t("invitations.role"), cell: (i) => roles(i.roleCode) },
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
                subtitle: `${roles(i.roleCode)} · ${date(i.expiresAt)}`,
                trailing: <StatusChip kind={stateKind[i.state]}>{states(i.state)}</StatusChip>,
              })}
              mobileActionsBelow
              actions={(i) =>
                i.state === "pending" || i.state === "expired" ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => void resend(i.id)}>
                      {t("invitations.resend")}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setRevoking(i)}>
                      {t("invitations.revoke")}
                    </Button>
                  </>
                ) : null
              }
            />
          </Card>
        </div>
      )}

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        defaultLocale={defaultLocale}
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
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  defaultLocale: Locale;
  onInvited: (sent: InvitationSentResponse) => void;
}) {
  const t = useT("members.inviteDrawer");
  const c = useT("common");
  const roles = useT("roles");
  const locales = useT("locales");
  const errors = useT("errors");
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState<RoleCode>("coach");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sent = await apiFetch("/api/org/invitations", {
        method: "POST",
        body: { email, roleCode, locale },
        schema: InvitationSentResponseSchema,
      });
      setEmail("");
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
          <Button type="submit" form="invite-form" loading={busy}>
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
                {ROLE_CODES.map((code) => (
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
  const errors = useT("errors");
  const toast = useToast();
  const [current, setCurrent] = useState<RoleCode[]>(member.roles);
  const [busy, setBusy] = useState<RoleCode | null>(null);

  async function toggle(role: RoleCode) {
    setBusy(role);
    try {
      const res = current.includes(role)
        ? await apiFetch<{ roles: RoleCode[] }>(`/api/org/members/${member.userId}/roles/${role}`, {
            method: "DELETE",
          })
        : await apiFetch<{ roles: RoleCode[] }>(`/api/org/members/${member.userId}/roles`, {
            method: "POST",
            body: { roleCode: role },
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
        {ROLE_CODES.map((role) => {
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
              </span>
              <Button
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
    </Sheet>
  );
}

"use client";

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
import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { useReadyClub } from "@/lib/club-context";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  CopyLink,
  DataTable,
  Drawer,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Tabs,
  useToast,
  type BadgeTone,
} from "@/ui";

type Member = MembersResponse["members"][number];
type Tab = "members" | "invitations";

const stateTone: Record<Invitation["state"], BadgeTone> = {
  pending: "info",
  accepted: "success",
  revoked: "neutral",
  expired: "warning",
};

export function Members() {
  const t = useTranslations("members");
  const c = useTranslations("common");
  const roles = useTranslations("roles");
  const locales = useTranslations("locales");
  const states = useTranslations("invitationState");
  const errors = useTranslations("errors");
  const format = useFormatter();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { org } = useReadyClub();
  const permissions = org.actor.permissions;
  const canInvite = permissions.includes("org.members.invite");
  const canManage = permissions.includes("org.members.manage");
  const defaultLocale = org.organization.view === "full" ? org.organization.defaultLocale : "es";

  const [tab, setTab] = useState<Tab>(
    params.get("tab") === "invitations" ? "invitations" : "members",
  );
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(params.get("invite") === "1");
  const [rolesFor, setRolesFor] = useState<Member | null>(null);
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([
        apiFetch("/api/org/members", { schema: MembersResponseSchema }),
        canInvite
          ? apiFetch("/api/org/invitations", { schema: InvitationsResponseSchema })
          : Promise.resolve({ invitations: [] }),
      ]);
      setMembers(m.members);
      setInvitations(i.invitations);
    } catch (err) {
      setError(errors(errorKey(err)));
    }
  }, [canInvite, errors]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!members) return [];
    if (!q) return members;
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, query]);
  const pendingCount = invitations?.filter((i) => i.state === "pending").length ?? 0;
  const visibleInvitations = invitations?.filter((i) => i.state !== "accepted") ?? [];

  function onInvited(sent: InvitationSentResponse) {
    toast(
      "success",
      t(sent.emailStatus === "failed" ? "inviteDrawer.failed" : "inviteDrawer.sent", {
        email: sent.invitation.email,
      }),
    );
    if (sent.acceptUrl) setLastLink({ email: sent.invitation.email, url: sent.acceptUrl });
    setTab("invitations");
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
    if (!window.confirm(t("invitations.confirmRevoke", { email: inv.email }))) return;
    try {
      await apiFetch(`/api/org/invitations/${inv.id}`, { method: "DELETE" });
      toast("success", t("invitations.revoked", { email: inv.email }));
      if (lastLink?.email === inv.email) setLastLink(null);
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canInvite ? (
            <Button icon={<Icon.Plus size={18} />} onClick={() => setInviteOpen(true)}>
              {t("invite")}
            </Button>
          ) : null
        }
      />
      {error ? <Alert kind="error">{error}</Alert> : null}

      {canInvite ? (
        <Tabs<Tab>
          label={t("title")}
          selected={tab}
          onChange={(key) => {
            setTab(key);
            router.replace(key === "invitations" ? "/members?tab=invitations" : "/members");
          }}
          items={[
            { key: "members", label: t("tabs.members"), count: members?.length },
            { key: "invitations", label: t("tabs.invitations"), count: pendingCount },
          ]}
        />
      ) : null}

      {tab === "members" ? (
        <div className="stack stack--tight">
          <div className="search">
            <Icon.Search size={18} />
            <Input
              type="search"
              placeholder={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("search")}
            />
          </div>
          <div className="card">
            <DataTable<Member>
              caption={t("title")}
              rows={filtered}
              getKey={(m) => m.userId}
              empty={
                <EmptyState
                  icon={<Icon.Users />}
                  title={members === null ? c("loading") : t("empty")}
                />
              }
              columns={[
                {
                  key: "person",
                  header: t("table.name"),
                  cell: (m) => (
                    <span className="cell-person">
                      <Avatar name={m.name} />
                      <span>
                        <span className="cell-person__name">{m.name}</span>
                        <br />
                        <span className="cell-person__sub">{m.email}</span>
                      </span>
                    </span>
                  ),
                },
                {
                  key: "roles",
                  header: t("table.roles"),
                  cell: (m) => (
                    <span className="cell-badges">
                      {m.roles.map((r) => (
                        <Badge key={r} tone="brand">
                          {roles(r)}
                        </Badge>
                      ))}
                    </span>
                  ),
                },
                {
                  key: "since",
                  header: t("table.since"),
                  cell: (m) => format.dateTime(new Date(m.memberSince), { dateStyle: "medium" }),
                },
                ...(canManage
                  ? [
                      {
                        key: "actions",
                        header: "",
                        align: "right" as const,
                        cell: (m: Member) => (
                          <span className="cell-actions">
                            <Button variant="secondary" size="sm" onClick={() => setRolesFor(m)}>
                              {t("roles.manage")}
                            </Button>
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      ) : (
        <div className="stack stack--tight">
          {lastLink ? (
            <CopyLink
              url={lastLink.url}
              hint={t("inviteDrawer.linkHint", { email: lastLink.email })}
              copyLabel={c("copy")}
              copiedLabel={c("copied")}
            />
          ) : null}
          <div className="card">
            <DataTable<Invitation>
              caption={t("tabs.invitations")}
              rows={visibleInvitations}
              getKey={(i) => i.id}
              empty={
                <EmptyState
                  icon={<Icon.Mail />}
                  title={invitations === null ? c("loading") : t("emptyInvitations")}
                  action={
                    invitations !== null ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Icon.Plus size={16} />}
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
                  cell: (i) => <strong>{i.email}</strong>,
                },
                { key: "role", header: t("invitations.role"), cell: (i) => roles(i.roleCode) },
                { key: "lang", header: t("invitations.language"), cell: (i) => locales(i.locale) },
                {
                  key: "state",
                  header: t("invitations.state"),
                  cell: (i) => <Badge tone={stateTone[i.state]}>{states(i.state)}</Badge>,
                },
                {
                  key: "expires",
                  header: t("invitations.expires"),
                  cell: (i) => format.dateTime(new Date(i.expiresAt), { dateStyle: "medium" }),
                },
                {
                  key: "actions",
                  header: "",
                  align: "right",
                  cell: (i) =>
                    i.state === "pending" || i.state === "expired" ? (
                      <span className="cell-actions">
                        <Button variant="secondary" size="sm" onClick={() => void resend(i.id)}>
                          {t("invitations.resend")}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void revoke(i)}>
                          {t("invitations.revoke")}
                        </Button>
                      </span>
                    ) : null,
                },
              ]}
            />
          </div>
        </div>
      )}

      <InviteDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        defaultLocale={defaultLocale}
        onInvited={onInvited}
      />
      {rolesFor ? (
        <RolesDrawer
          member={rolesFor}
          onClose={() => setRolesFor(null)}
          onChanged={() => void reload()}
        />
      ) : null}
    </div>
  );
}

function InviteDrawer({
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
  const t = useTranslations("members.inviteDrawer");
  const c = useTranslations("common");
  const roles = useTranslations("roles");
  const locales = useTranslations("locales");
  const errors = useTranslations("errors");
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
      onInvited(sent);
      onClose();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
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
      <form id="invite-form" className="form" onSubmit={(e) => void submit(e)}>
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
        <div className="form__row">
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
    </Drawer>
  );
}

function RolesDrawer({
  member,
  onClose,
  onChanged,
}: {
  member: Member;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("members.roles");
  const c = useTranslations("common");
  const roles = useTranslations("roles");
  const errors = useTranslations("errors");
  const toast = useToast();
  const [current, setCurrent] = useState<RoleCode[]>(member.roles);
  const [busy, setBusy] = useState<RoleCode | null>(null);

  async function toggle(role: RoleCode) {
    setBusy(role);
    try {
      if (current.includes(role)) {
        const res = await apiFetch<{ roles: RoleCode[] }>(
          `/api/org/members/${member.userId}/roles/${role}`,
          { method: "DELETE" },
        );
        setCurrent(res.roles);
      } else {
        const res = await apiFetch<{ roles: RoleCode[] }>(
          `/api/org/members/${member.userId}/roles`,
          { method: "POST", body: { roleCode: role } },
        );
        setCurrent(res.roles);
      }
      onChanged();
    } catch (err) {
      const key = errorKey(err);
      toast("error", key === "conflict" ? t("lastAdmin") : errors(key));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer
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
      <ul className="checklist" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ROLE_CODES.map((role) => {
          const has = current.includes(role);
          return (
            <li key={role} className="checklist__item">
              <span className="checklist__text">
                <span className={`checklist__mark${has ? " checklist__mark--done" : ""}`}>
                  <Icon.Check size={16} />
                </span>
                <span>
                  <strong>{roles(role)}</strong>
                  <br />
                  <span className="small muted">{t(`hint.${role}`)}</span>
                </span>
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
    </Drawer>
  );
}

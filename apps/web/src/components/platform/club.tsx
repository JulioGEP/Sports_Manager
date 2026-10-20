"use client";

import {
  InvitationSentResponseSchema,
  LOCALES,
  PlatformAdminsResponseSchema,
  PlatformOrganizationDetailSchema,
  PlatformOrganizationResponseSchema,
  type InvitationSentResponse,
  type Locale,
  type PlatformAdminsResponse,
  type PlatformOrganizationDetail,
} from "@sportsmanager/shared";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CopyLink,
  DataTable,
  Drawer,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  useToast,
} from "@/ui";
import { statusTone } from "./clubs";

type Admin = PlatformAdminsResponse["admins"][number];

export function PlatformClub({ slug }: { slug: string }) {
  const t = useTranslations("platform.club");
  const c = useTranslations("common");
  const statuses = useTranslations("status");
  const locales = useTranslations("locales");
  const states = useTranslations("invitationState");
  const errors = useTranslations("errors");
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const toast = useToast();
  const [detail, setDetail] = useState<PlatformOrganizationDetail | null>(null);
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/platform/organizations/${encodeURIComponent(slug)}`;

  const reload = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        apiFetch(base, { schema: PlatformOrganizationDetailSchema }),
        apiFetch(`${base}/admins`, { schema: PlatformAdminsResponseSchema }),
      ]);
      setDetail(d);
      setAdmins(a.admins);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) setMissing(true);
      else setError(errors(errorKey(err)));
    }
  }, [base, errors]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function setStatus(status: "active" | "suspended" | "archived") {
    const question =
      status === "archived"
        ? t("confirmArchive")
        : status === "suspended"
          ? t("confirmSuspend")
          : null;
    if (question && !window.confirm(question)) return;
    setBusy(true);
    try {
      await apiFetch(base, {
        method: "PATCH",
        body: { status },
        schema: PlatformOrganizationResponseSchema,
      });
      toast("success", t("statusChanged", { status: statuses(status) }));
      await reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <Alert kind="error">{t("notFound")}</Alert>;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!detail) {
    return (
      <div className="skeleton">
        <div className="skeleton__line" style={{ width: "40%" }} />
        <div className="skeleton__block" />
      </div>
    );
  }
  const org = detail.organization;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <Link href="/admin">
            <Icon.ArrowLeft size={16} />
            {t("eyebrow")}
          </Link>
        }
        title={
          <>
            {org.name} <Badge tone={statusTone[org.status]}>{statuses(org.status)}</Badge>
          </>
        }
        description={
          <a href={org.url} target="_blank" rel="noreferrer">
            {org.url}
          </a>
        }
        actions={
          <>
            {org.status !== "active" ? (
              <Button variant="secondary" loading={busy} onClick={() => void setStatus("active")}>
                {t("reactivate")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => void setStatus("suspended")}
              >
                {t("suspend")}
              </Button>
            )}
            {org.status !== "archived" ? (
              <Button variant="danger" loading={busy} onClick={() => void setStatus("archived")}>
                {t("archive")}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid-2">
        <Card title={t("summary")}>
          <dl className="dl">
            <dt>{t("subdomain")}</dt>
            <dd>{org.slug}</dd>
            <dt>{t("locale")}</dt>
            <dd>{locales(org.defaultLocale)}</dd>
            <dt>{t("sport")}</dt>
            <dd>{org.sport.name[locale]}</dd>
            <dt>{t("created")}</dt>
            <dd>{format.dateTime(new Date(org.createdAt), { dateStyle: "medium" })}</dd>
            <dt>{t("members")}</dt>
            <dd>{org.counts.members}</dd>
            <dt>{t("pending")}</dt>
            <dd>{org.counts.pendingInvitations}</dd>
          </dl>
        </Card>

        <Card
          title={t("admins")}
          description={t("adminsHint")}
          actions={
            <Button size="sm" icon={<Icon.Plus size={16} />} onClick={() => setInviteOpen(true)}>
              {t("invite")}
            </Button>
          }
        >
          <DataTable<Admin>
            caption={t("admins")}
            rows={admins ?? []}
            getKey={(a) => a.userId}
            empty={
              <EmptyState
                icon={<Icon.Users />}
                title={admins === null ? c("loading") : t("adminsEmpty")}
                description={admins === null ? undefined : t("adminsEmptyHint")}
              />
            }
            columns={[
              {
                key: "person",
                header: t("adminName"),
                cell: (a) => (
                  <span className="cell-person">
                    <Avatar name={a.name} size="sm" />
                    <span>
                      <span className="cell-person__name">{a.name}</span>
                      <br />
                      <span className="cell-person__sub">{a.email}</span>
                    </span>
                  </span>
                ),
              },
              {
                key: "since",
                header: t("adminSince"),
                cell: (a) => format.dateTime(new Date(a.memberSince), { dateStyle: "medium" }),
              },
            ]}
          />
        </Card>
      </div>

      {lastLink ? (
        <CopyLink
          url={lastLink.url}
          hint={t("linkHint", { email: lastLink.email })}
          copyLabel={c("copy")}
          copiedLabel={c("copied")}
        />
      ) : null}

      {detail.myInvitations.length > 0 ? (
        <Card title={t("myInvitations")} description={t("myInvitationsHint")}>
          <ul className="checklist" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {detail.myInvitations.map((i) => (
              <li key={i.id} className="checklist__item">
                <span className="checklist__text">
                  <Icon.Mail size={18} />
                  <span>
                    <strong>{i.email}</strong>
                    <br />
                    <span className="small muted">
                      {locales(i.locale)} ·{" "}
                      {format.dateTime(new Date(i.createdAt), { dateStyle: "medium" })}
                    </span>
                  </span>
                </span>
                <Badge
                  tone={
                    i.state === "accepted" ? "success" : i.state === "pending" ? "info" : "neutral"
                  }
                >
                  {states(i.state)}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <InviteAdminDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        base={base}
        defaultLocale={org.defaultLocale}
        onInvited={(sent: InvitationSentResponse) => {
          toast("success", t("inviteDrawer.sent", { email: sent.invitation.email }));
          if (sent.acceptUrl) setLastLink({ email: sent.invitation.email, url: sent.acceptUrl });
          void reload();
        }}
      />
    </div>
  );
}

function InviteAdminDrawer({
  open,
  onClose,
  base,
  defaultLocale,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  base: string;
  defaultLocale: Locale;
  onInvited: (sent: InvitationSentResponse) => void;
}) {
  const t = useTranslations("platform.club.inviteDrawer");
  const c = useTranslations("common");
  const locales = useTranslations("locales");
  const errors = useTranslations("errors");
  const [email, setEmail] = useState("");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sent = await apiFetch(`${base}/invitations`, {
        method: "POST",
        body: { email, roleCode: "org_admin", locale },
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
          <Button type="submit" form="invite-admin-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="invite-admin-form" className="form" onSubmit={(e) => void submit(e)}>
        <Field label={t("email")}>
          {(id) => (
            <Input
              id={id}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
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
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Drawer>
  );
}

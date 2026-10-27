import {
  InvitationSentResponseSchema,
  LOCALES,
  AI_MAX_WEEKLY_QUOTA,
  PlatformAdminsResponseSchema,
  PlatformAiResponseSchema,
  PlatformOrganizationDetailSchema,
  PlatformOrganizationResponseSchema,
  formatMoney,
  type InvitationSentResponse,
  type Locale,
  type PlatformAdminsResponse,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { Link, useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { useLocale, useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  CopyLink,
  DataList,
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
} from "@/ui";
import { statusKind } from "./clubs";

type Admin = PlatformAdminsResponse["admins"][number];

export function PlatformClubPage() {
  const { slug = "" } = useParams();
  const t = useT("platform.club");
  const c = useT("common");
  const statuses = useT("status");
  const locales = useT("locales");
  const states = useT("invitationState");
  const errors = useT("errors");
  const { locale } = useLocale();
  const intl = useIntl();
  const toast = useToast();
  const client = useQueryClient();
  const base = `/api/platform/organizations/${encodeURIComponent(slug)}`;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"suspended" | "archived" | null>(null);

  const detail = useQuery({
    queryKey: ["platform", "organization", slug],
    queryFn: () => apiFetch(base, { schema: PlatformOrganizationDetailSchema, club: null }),
    retry: false,
  });
  const admins = useQuery({
    queryKey: ["platform", "organization", slug, "admins"],
    queryFn: () => apiFetch(`${base}/admins`, { schema: PlatformAdminsResponseSchema, club: null }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["platform"] });

  async function setStatus(status: "active" | "suspended" | "archived") {
    setConfirming(null);
    setBusy(true);
    try {
      await apiFetch(base, {
        method: "PATCH",
        body: { status },
        schema: PlatformOrganizationResponseSchema,
        club: null,
      });
      toast("success", t("statusChanged", { status: statuses(status) }));
      await reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  if (detail.isError) {
    const missing = detail.error instanceof ApiClientError && detail.error.status === 404;
    return <Alert kind="error">{missing ? t("notFound") : errors(errorKey(detail.error))}</Alert>;
  }
  if (!detail.data)
    return <div className="h-40 animate-pulse rounded-card bg-raised" aria-busy="true" />;
  const org = detail.data.organization;
  const date = (iso: string) => intl.formatDate(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link to="/admin" className="inline-flex items-center gap-1 text-club-text">
            <Icon.ArrowLeft size={16} aria-hidden="true" />
            {t("eyebrow")}
          </Link>
        }
        title={
          <>
            {org.name} <StatusChip kind={statusKind[org.status]}>{statuses(org.status)}</StatusChip>
          </>
        }
        description={
          <a
            href={org.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-club-text"
          >
            {org.url}
            <Icon.ArrowSquareOut size={16} aria-hidden="true" />
          </a>
        }
        actions={
          <>
            {org.status !== "active" ? (
              <Button
                action="restore"
                variant="secondary"
                loading={busy}
                onClick={() => void setStatus("active")}
              >
                {t("reactivate")}
              </Button>
            ) : (
              <Button
                action="suspend"
                variant="secondary"
                loading={busy}
                onClick={() => setConfirming("suspended")}
              >
                {t("suspend")}
              </Button>
            )}
            {org.status !== "archived" ? (
              <Button
                action="archive"
                variant="danger"
                loading={busy}
                onClick={() => setConfirming("archived")}
              >
                {t("archive")}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("summary")}>
          <Definitions
            items={[
              { term: t("subdomain"), detail: <span className="font-mono">/{org.slug}</span> },
              { term: t("locale"), detail: locales(org.defaultLocale) },
              { term: t("sport"), detail: org.sport.name[locale] },
              { term: t("created"), detail: date(org.createdAt) },
              {
                term: t("members"),
                detail: <span className="font-mono">{org.counts.members}</span>,
              },
              {
                term: t("pending"),
                detail: <span className="font-mono">{org.counts.pendingInvitations}</span>,
              },
            ]}
          />
        </Card>
        <Card
          title={t("admins")}
          description={t("adminsHint")}
          padded={false}
          actions={
            <Button action="invite" size="sm" onClick={() => setInviteOpen(true)}>
              {t("invite")}
            </Button>
          }
        >
          <DataList<Admin>
            caption={t("admins")}
            rows={admins.data?.admins ?? []}
            getKey={(a) => a.userId}
            empty={
              <EmptyState
                icon={<Icon.Users weight="duotone" />}
                title={admins.isPending ? c("loading") : t("adminsEmpty")}
                description={admins.isPending ? undefined : t("adminsEmptyHint")}
              />
            }
            columns={[
              {
                key: "person",
                header: t("adminName"),
                cell: (a) => (
                  <span className="flex items-center gap-3">
                    <Avatar name={a.name} size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink">{a.name}</span>
                      <span className="text-secondary text-muted">{a.email}</span>
                    </span>
                  </span>
                ),
              },
              { key: "since", header: t("adminSince"), cell: (a) => date(a.memberSince) },
            ]}
            mobileRow={(a) => ({
              leading: <Avatar name={a.name} />,
              title: a.name,
              subtitle: a.email,
            })}
          />
        </Card>
      </div>

      <AiCard base={base} slug={slug} />

      {lastLink ? (
        <CopyLink
          url={lastLink.url}
          hint={t("linkHint", { email: lastLink.email })}
          copyLabel={c("copy")}
          copiedLabel={c("copied")}
        />
      ) : null}

      {detail.data.myInvitations.length > 0 ? (
        <Card title={t("myInvitations")} description={t("myInvitationsHint")} padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {detail.data.myInvitations.map((i) => (
              <li key={i.id} className="flex min-h-14 items-center gap-3 px-5 py-3">
                <Icon.Envelope
                  size={22}
                  weight="duotone"
                  aria-hidden="true"
                  className="text-club-text"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="truncate text-body font-medium text-ink">{i.email}</strong>
                  <span className="text-secondary text-muted">
                    {locales(i.locale)} · {date(i.createdAt)}
                  </span>
                </span>
                <StatusChip
                  kind={
                    i.state === "accepted" ? "success" : i.state === "pending" ? "info" : "neutral"
                  }
                >
                  {states(i.state)}
                </StatusChip>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <InviteAdminSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        base={base}
        defaultLocale={org.defaultLocale}
        onInvited={(sent) => {
          toast("success", t("inviteDrawer.sent", { email: sent.invitation.email }));
          if (sent.acceptUrl) setLastLink({ email: sent.invitation.email, url: sent.acceptUrl });
          void reload();
        }}
      />
      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === "archived"
            ? t("confirmArchiveTitle", { name: org.name })
            : t("confirmSuspendTitle", { name: org.name })
        }
        body={confirming === "archived" ? t("confirmArchive") : t("confirmSuspend")}
        confirmLabel={confirming === "archived" ? t("archive") : t("suspend")}
        confirmAction={confirming === "archived" ? "archive" : "suspend"}
        cancelLabel={c("cancel")}
        tone={confirming === "archived" ? "danger" : "default"}
        onConfirm={() => confirming && void setStatus(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

function InviteAdminSheet({
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
  const t = useT("platform.club.inviteDrawer");
  const c = useT("common");
  const locales = useT("locales");
  const errors = useT("errors");
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
        club: null,
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
          <Button action="send" type="submit" form="invite-admin-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="invite-admin-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
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
    </Sheet>
  );
}

/**
 * Propuesta con IA del club (ADR 0044): cuántas propuestas por semana puede pedir, cuántas lleva
 * y, en 30 días, cuántas, cuántas fallaron, cuántas se aplicaron, lo que costaron y cuántas de las
 * tareas propuestas siguen en su sesión.
 */
function AiCard({ base, slug }: { base: string; slug: string }) {
  const t = useT("platform.ai");
  const c = useT("common");
  const errors = useT("errors");
  const intl = useIntl();
  const toast = useToast();
  const client = useQueryClient();
  const ai = useQuery({
    queryKey: ["platform", "organization", slug, "ai"],
    queryFn: () => apiFetch(`${base}/ai`, { schema: PlatformAiResponseSchema, club: null }),
    retry: false,
  });
  const [quota, setQuota] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!ai.data) return null;
  const data = ai.data;
  const value = quota ?? String(data.weeklyQuota);
  const parsed = Math.round(Number(value));
  const valid = value.trim() !== "" && parsed >= 0 && parsed <= AI_MAX_WEEKLY_QUOTA;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const next = await apiFetch(`${base}/ai`, {
        method: "PUT",
        body: { weeklyQuota: parsed },
        schema: PlatformAiResponseSchema,
        club: null,
      });
      client.setQueryData(["platform", "organization", slug, "ai"], next);
      setQuota(null);
      toast("success", t("saved"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const { last30 } = data;
  return (
    <Card title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-5">
        {!data.configured ? <Alert kind="warning">{t("notConfigured")}</Alert> : null}
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void save(e)}>
          <div className="w-40">
            <Field label={t("quota")}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={AI_MAX_WEEKLY_QUOTA}
                  value={value}
                  onChange={(e) => setQuota(e.target.value)}
                />
              )}
            </Field>
          </div>
          <Button
            type="submit"
            action="save"
            loading={busy}
            disabled={!valid || parsed === data.weeklyQuota}
          >
            {c("save")}
          </Button>
          <p className="basis-full text-secondary text-muted">{t("quotaHint")}</p>
        </form>
        <Definitions
          items={[
            { term: t("model"), detail: <span className="font-mono">{data.model}</span> },
            {
              term: t("week"),
              detail: (
                <span className="font-mono">
                  {data.week.used}/{data.weeklyQuota}
                </span>
              ),
            },
            { term: t("requests"), detail: <span className="font-mono">{last30.requests}</span> },
            { term: t("failed"), detail: <span className="font-mono">{last30.failed}</span> },
            { term: t("applied"), detail: <span className="font-mono">{last30.applied}</span> },
            {
              term: t("cost"),
              detail: (
                <span className="font-mono">
                  {formatMoney(Math.round(last30.costUsd * 100), "$")}
                </span>
              ),
            },
            {
              term: t("kept"),
              detail: (
                <span className="font-mono">
                  {last30.keptShare === null
                    ? "—"
                    : intl.formatNumber(last30.keptShare, { style: "percent" })}
                </span>
              ),
            },
          ]}
        />
        <p className="text-secondary text-muted">{t("keptHint")}</p>
      </div>
    </Card>
  );
}

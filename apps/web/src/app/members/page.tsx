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
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/alert";
import { AppShell } from "@/components/app-shell";
import { apiFetch, errorKey } from "@/lib/api";

function MembersPanel({ canInvite, defaultLocale }: { canInvite: boolean; defaultLocale: Locale }) {
  const t = useTranslations("members");
  const roles = useTranslations("roles");
  const locales = useTranslations("locales");
  const errors = useTranslations("errors");
  const format = useFormatter();
  const [members, setMembers] = useState<MembersResponse["members"]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState<RoleCode>("coach");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<InvitationSentResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    const [m, i] = await Promise.all([
      apiFetch("/api/org/members", { schema: MembersResponseSchema }),
      canInvite
        ? apiFetch("/api/org/invitations", { schema: InvitationsResponseSchema })
        : Promise.resolve({ invitations: [] }),
    ]);
    setMembers(m.members);
    setInvitations(i.invitations);
  }, [canInvite]);

  useEffect(() => {
    reload().catch((err: unknown) => setError(errors(errorKey(err))));
  }, [reload, errors]);

  async function run(action: () => Promise<InvitationSentResponse | null>) {
    setError(null);
    setCopied(false);
    setBusy(true);
    try {
      const result = await action();
      setLast(result);
      await reload();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  function onInvite(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const sent = await apiFetch("/api/org/invitations", {
        method: "POST",
        body: { email, roleCode, locale },
        schema: InvitationSentResponseSchema,
      });
      setEmail("");
      return sent;
    });
  }

  const resend = (id: string) =>
    run(() =>
      apiFetch(`/api/org/invitations/${id}/resend`, {
        method: "POST",
        body: {},
        schema: InvitationSentResponseSchema,
      }),
    );
  const revoke = (id: string) =>
    run(async () => {
      await apiFetch(`/api/org/invitations/${id}`, { method: "DELETE" });
      return null;
    });

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const pending = invitations.filter((i) => i.state === "pending" || i.state === "expired");

  return (
    <>
      <section className="card">
        <h2>{t("membersTitle")}</h2>
        {members.length === 0 ? <p className="muted">{t("noMembers")}</p> : null}
        <ul className="list">
          {members.map((m) => (
            <li key={m.userId} className="list__item">
              <div>
                <strong>{m.name}</strong>
                <div className="muted">{m.email}</div>
              </div>
              <div>
                {m.roles.map((r) => (
                  <span key={r} className="pill">
                    {roles(r)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {canInvite ? (
        <>
          <section className="card">
            <h2>{t("inviteTitle")}</h2>
            <form className="form" onSubmit={onInvite}>
              <label className="field">
                <span>{t("email")}</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <div className="row">
                <label className="field">
                  <span>{t("role")}</span>
                  <select
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value as RoleCode)}
                  >
                    {ROLE_CODES.map((code) => (
                      <option key={code} value={code}>
                        {roles(code)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t("emailLanguage")}</span>
                  <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                    {LOCALES.map((code) => (
                      <option key={code} value={code}>
                        {locales(code)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {error ? <Alert kind="error">{error}</Alert> : null}
              <button type="submit" className="button" disabled={busy}>
                {busy ? t("submitting") : t("invite")}
              </button>
            </form>
            {last ? (
              <div className="stack">
                <Alert kind="ok">
                  {t(last.emailStatus === "failed" ? "emailFailed" : "invited", {
                    email: last.invitation.email,
                  })}
                </Alert>
                {last.acceptUrl ? (
                  <div className="note">
                    <p className="muted">{t("testLinkHint")}</p>
                    <code className="code">{last.acceptUrl}</code>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => void copyLink(last.acceptUrl!)}
                    >
                      {copied ? t("copied") : t("copyLink")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>{t("pendingTitle")}</h2>
            {pending.length === 0 ? <p className="muted">{t("noPending")}</p> : null}
            <ul className="list">
              {pending.map((i) => (
                <li key={i.id} className="list__item">
                  <div>
                    <strong>{i.email}</strong>
                    <div className="muted">
                      {roles(i.roleCode)} · {locales(i.locale)} ·{" "}
                      {i.state === "expired"
                        ? t("expired")
                        : t("expiresOn", {
                            date: format.dateTime(new Date(i.expiresAt), { dateStyle: "medium" }),
                          })}
                    </div>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={busy}
                      onClick={() => void resend(i.id)}
                    >
                      {t("resend")}
                    </button>
                    <button
                      type="button"
                      className="button button--danger"
                      disabled={busy}
                      onClick={() => void revoke(i.id)}
                    >
                      {t("revoke")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </>
  );
}

export default function MembersPage() {
  const t = useTranslations("members");
  return (
    <AppShell>
      {({ org }) => {
        const canRead = org.actor.permissions.includes("org.members.read");
        const canInvite = org.actor.permissions.includes("org.members.invite");
        if (!canRead) return <Alert kind="error">{t("forbidden")}</Alert>;
        const defaultLocale: Locale =
          org.organization.view === "full" ? org.organization.defaultLocale : "es";
        return <MembersPanel canInvite={canInvite} defaultLocale={defaultLocale} />;
      }}
    </AppShell>
  );
}

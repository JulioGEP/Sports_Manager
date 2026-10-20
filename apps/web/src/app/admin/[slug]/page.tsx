"use client";

import {
  InvitationSentResponseSchema,
  LOCALES,
  PlatformOrganizationDetailSchema,
  PlatformOrganizationResponseSchema,
  ROLE_CODES,
  type InvitationSentResponse,
  type Locale,
  type PlatformOrganizationDetail,
  type PlatformOrganizationUpdate,
  type RoleCode,
} from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Alert } from "@/components/alert";
import { BrandForm } from "@/components/brand-form";
import { ApiClientError, apiFetch, errorKey, uploadFile } from "@/lib/api";

function OrganizationAdmin({ slug }: { slug: string }) {
  const t = useTranslations("admin");
  const roles = useTranslations("roles");
  const locales = useTranslations("locales");
  const members = useTranslations("members");
  const errors = useTranslations("errors");
  const [detail, setDetail] = useState<PlatformOrganizationDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState<RoleCode>("org_admin");
  const [locale, setLocale] = useState<Locale | "">("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<InvitationSentResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const base = `/api/platform/organizations/${encodeURIComponent(slug)}`;

  const reload = useCallback(async () => {
    try {
      setDetail(await apiFetch(base, { schema: PlatformOrganizationDetailSchema }));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) setMissing(true);
      else setError(errors(errorKey(err)));
    }
  }, [base, errors]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSent(null);
    setCopied(false);
    setBusy(true);
    try {
      const res = await apiFetch(`${base}/invitations`, {
        method: "POST",
        body: { email, roleCode, ...(locale ? { locale } : {}) },
        schema: InvitationSentResponseSchema,
      });
      setSent(res);
      setEmail("");
      await reload();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (missing) return <Alert kind="error">{t("notFound")}</Alert>;
  if (!detail) return <p className="muted">{error ?? t("loading")}</p>;
  const org = detail.organization;

  return (
    <>
      <section className="card">
        <h1>{org.name}</h1>
        <p className="muted">
          <a href={org.url}>{org.url}</a> ·{" "}
          {t("counts", { members: org.counts.members, pending: org.counts.pendingInvitations })}
        </p>
      </section>

      <BrandForm
        key={org.id}
        withStatus
        initial={{
          name: org.name,
          defaultLocale: org.defaultLocale,
          brandPrimaryColor: org.brandPrimaryColor,
          brandSecondaryColor: org.brandSecondaryColor,
          status: org.status,
        }}
        logoUrl={org.logoUrl}
        save={async (patch: PlatformOrganizationUpdate) => {
          await apiFetch(base, {
            method: "PATCH",
            body: patch,
            schema: PlatformOrganizationResponseSchema,
          });
          await reload();
        }}
        uploadLogo={async (file) => {
          const res = await uploadFile(`${base}/logo`, file, PlatformOrganizationResponseSchema);
          await reload();
          return res.organization.logoUrl;
        }}
        removeLogo={async () => {
          await apiFetch(`${base}/logo`, {
            method: "DELETE",
            schema: PlatformOrganizationResponseSchema,
          });
          await reload();
        }}
      />

      <section className="card">
        <h2>{t("inviteTitle")}</h2>
        <p className="muted">{t("inviteHint")}</p>
        <form className="form" onSubmit={(e) => void onInvite(e)}>
          <label className="field">
            <span>{members("email")}</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <div className="row">
            <label className="field">
              <span>{members("role")}</span>
              <select value={roleCode} onChange={(e) => setRoleCode(e.target.value as RoleCode)}>
                {ROLE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {roles(code)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{members("emailLanguage")}</span>
              <select value={locale} onChange={(e) => setLocale(e.target.value as Locale | "")}>
                <option value="">
                  {t("clubLanguage", { locale: locales(org.defaultLocale) })}
                </option>
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
            {busy ? members("submitting") : members("invite")}
          </button>
        </form>
        {sent ? (
          <div className="stack">
            <Alert kind="ok">
              {members(sent.emailStatus === "failed" ? "emailFailed" : "invited", {
                email: sent.invitation.email,
              })}
            </Alert>
            {sent.acceptUrl ? (
              <div className="note">
                <p className="muted">{members("testLinkHint")}</p>
                <code className="code">{sent.acceptUrl}</code>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void copy(sent.acceptUrl!)}
                >
                  {copied ? members("copied") : members("copyLink")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {detail.myInvitations.length > 0 ? (
          <ul className="list">
            {detail.myInvitations.map((i) => (
              <li key={i.id} className="list__item">
                <div>
                  <strong>{i.email}</strong>
                  <div className="muted">
                    {roles(i.roleCode)} · {locales(i.locale)} · {t(`invitationState.${i.state}`)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

export default function AdminOrganizationPage() {
  const { slug } = useParams<{ slug: string }>();
  return <AdminShell>{() => <OrganizationAdmin slug={slug} />}</AdminShell>;
}

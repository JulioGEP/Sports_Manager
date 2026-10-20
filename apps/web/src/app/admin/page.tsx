"use client";

import {
  AuditResponseSchema,
  LOCALES,
  OrganizationCreateSchema,
  PlatformOrganizationResponseSchema,
  PlatformOrganizationsResponseSchema,
  SportsResponseSchema,
  slugify,
  type AuditEntry,
  type Locale,
  type PlatformOrganization,
  type SportsResponse,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Alert } from "@/components/alert";
import { apiFetch, errorKey } from "@/lib/api";

function AdminHome() {
  const t = useTranslations("admin");
  const locales = useTranslations("locales");
  const statuses = useTranslations("status");
  const audit = useTranslations("audit");
  const errors = useTranslations("errors");
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const [organizations, setOrganizations] = useState<PlatformOrganization[] | null>(null);
  const [sports, setSports] = useState<SportsResponse["sports"]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    slugEdited: false,
    defaultLocale: "es" as Locale,
    defaultSportCode: "",
    brandPrimaryColor: brandTokens["--color-brand-primary"],
    brandSecondaryColor: brandTokens["--color-brand-secondary"],
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<PlatformOrganization | null>(null);

  const reload = useCallback(async () => {
    const [orgs, auditRes] = await Promise.all([
      apiFetch("/api/platform/organizations", { schema: PlatformOrganizationsResponseSchema }),
      apiFetch("/api/platform/audit?limit=30", { schema: AuditResponseSchema }),
    ]);
    setOrganizations(orgs.organizations);
    setEntries(auditRes.entries);
  }, []);

  useEffect(() => {
    reload().catch((err: unknown) => setError(errors(errorKey(err))));
    apiFetch("/api/platform/sports", { schema: SportsResponseSchema })
      .then((res) => {
        setSports(res.sports);
        setForm((f) =>
          f.defaultSportCode ? f : { ...f, defaultSportCode: res.sports[0]?.code ?? "" },
        );
      })
      .catch(() => undefined);
  }, [reload, errors]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreated(null);
    const { slugEdited: _ignored, ...values } = form;
    const parsed = OrganizationCreateSchema.safeParse(values);
    if (!parsed.success) {
      setError(errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/platform/organizations", {
        method: "POST",
        body: parsed.data,
        schema: PlatformOrganizationResponseSchema,
      });
      setCreated(res.organization);
      setForm((f) => ({ ...f, name: "", slug: "", slugEdited: false }));
      await reload();
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2>{t("createTitle")}</h2>
        <form className="form" onSubmit={(e) => void onCreate(e)}>
          <div className="row">
            <label className="field">
              <span>{t("name")}</span>
              <input
                type="text"
                required
                maxLength={120}
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                    slug: form.slugEdited ? form.slug : slugify(e.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              <span>{t("slug")}</span>
              <input
                type="text"
                required
                maxLength={63}
                pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
                value={form.slug}
                onChange={(e) =>
                  setForm({ ...form, slug: e.target.value.toLowerCase(), slugEdited: true })
                }
              />
            </label>
          </div>
          <div className="row">
            <label className="field">
              <span>{t("defaultLocale")}</span>
              <select
                value={form.defaultLocale}
                onChange={(e) => setForm({ ...form, defaultLocale: e.target.value as Locale })}
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {locales(code)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("sport")}</span>
              <select
                value={form.defaultSportCode}
                onChange={(e) => setForm({ ...form, defaultSportCode: e.target.value })}
              >
                {sports.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name[locale]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            {(["brandPrimaryColor", "brandSecondaryColor"] as const).map((key) => (
              <label key={key} className="field">
                <span>{key === "brandPrimaryColor" ? t("primaryColor") : t("secondaryColor")}</span>
                <div className="row">
                  <input
                    type="color"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value.toLowerCase() })}
                  />
                  <input
                    type="text"
                    value={form[key]}
                    pattern="#[0-9a-fA-F]{6}"
                    onChange={(e) => setForm({ ...form, [key]: e.target.value.toLowerCase() })}
                  />
                </div>
              </label>
            ))}
          </div>
          {error ? <Alert kind="error">{error}</Alert> : null}
          {created ? (
            <Alert kind="ok">
              {t("created", { name: created.name })}{" "}
              <Link href={`/admin/${created.slug}`}>{t("manage")}</Link>
            </Alert>
          ) : null}
          <button type="submit" className="button" disabled={busy || !form.defaultSportCode}>
            {busy ? t("creating") : t("create")}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>{t("listTitle")}</h2>
        <p className="muted">{t("domainNote")}</p>
        {organizations === null ? <p className="muted">{t("loading")}</p> : null}
        <ul className="list">
          {organizations?.map((org) => (
            <li key={org.id} className="list__item">
              <div className="brand">
                <span
                  className="brand__swatch"
                  style={{ background: org.brandPrimaryColor }}
                  aria-hidden="true"
                >
                  {org.logoUrl ? <img src={org.logoUrl} alt="" className="brand__logo" /> : null}
                </span>
                <div>
                  <strong>{org.name}</strong> <span className="pill">{statuses(org.status)}</span>
                  <div className="muted">
                    <a href={org.url}>{org.url}</a> ·{" "}
                    {t("counts", {
                      members: org.counts.members,
                      pending: org.counts.pendingInvitations,
                    })}
                  </div>
                </div>
              </div>
              <Link className="button button--secondary" href={`/admin/${org.slug}`}>
                {t("manage")}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{t("auditTitle")}</h2>
        {entries.length === 0 ? <p className="muted">{t("auditEmpty")}</p> : null}
        <ul className="list">
          {entries.map((e) => (
            <li key={e.id} className="list__item">
              <div>
                <strong>{audit(e.action)}</strong>
                <div className="muted">
                  {e.actorName ?? t("system")}
                  {e.organizationName ? ` · ${e.organizationName}` : ""}
                  {e.target ? ` · ${e.target}` : ""}
                </div>
              </div>
              <span className="muted">
                {format.dateTime(new Date(e.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function AdminPage() {
  return <AdminShell>{() => <AdminHome />}</AdminShell>;
}

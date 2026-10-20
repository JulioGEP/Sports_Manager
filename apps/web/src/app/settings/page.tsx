"use client";

import {
  LOCALES,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  OrganizationBrandingSchema,
  OrganizationUpdateResponseSchema,
  OrganizationUpdateSchema,
  type Locale,
  type OrganizationBranding,
} from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/alert";
import { AppShell } from "@/components/app-shell";
import { useBranding } from "@/components/branding-provider";
import { apiFetch, errorKey, uploadLogo } from "@/lib/api";

function SettingsForm({
  initial,
}: {
  initial: {
    name: string;
    defaultLocale: Locale;
    brandPrimaryColor: string;
    brandSecondaryColor: string;
  };
}) {
  const t = useTranslations("settings");
  const locales = useTranslations("locales");
  const errors = useTranslations("errors");
  const router = useRouter();
  const branding = useBranding();
  const [form, setForm] = useState(initial);
  const [logo, setLogo] = useState<OrganizationBranding | null>(branding);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = OrganizationUpdateSchema.safeParse(form);
    if (!parsed.success) {
      setMessage({ kind: "error", text: errors("bad_request") });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/org", {
        method: "PATCH",
        body: parsed.data,
        schema: OrganizationUpdateResponseSchema,
      });
      setMessage({ kind: "ok", text: t("saved") });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: errors(errorKey(err)) });
    } finally {
      setBusy(false);
    }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setMessage({ kind: "error", text: errors("unsupported_media_type") });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setMessage({ kind: "error", text: errors("payload_too_large") });
      return;
    }
    setBusy(true);
    try {
      const updated = await uploadLogo(file, OrganizationBrandingSchema);
      setLogo(updated);
      setMessage({ kind: "ok", text: t("logoSaved") });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: errors(errorKey(err)) });
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveLogo() {
    setMessage(null);
    setBusy(true);
    try {
      const updated = await apiFetch("/api/org/logo", {
        method: "DELETE",
        schema: OrganizationBrandingSchema,
      });
      setLogo(updated);
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: errors(errorKey(err)) });
    } finally {
      setBusy(false);
    }
  }

  const colorField = (key: "brandPrimaryColor" | "brandSecondaryColor", label: string) => (
    <label className="field">
      <span>{label}</span>
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
  );

  return (
    <>
      <section className="card">
        <h2>{t("title")}</h2>
        <form className="form" onSubmit={(e) => void onSave(e)}>
          <label className="field">
            <span>{t("name")}</span>
            <input
              type="text"
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
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
          <div className="row">
            {colorField("brandPrimaryColor", t("primaryColor"))}
            {colorField("brandSecondaryColor", t("secondaryColor"))}
          </div>
          <div className="brand-preview" aria-hidden="true">
            <span style={{ background: form.brandPrimaryColor }} />
            <span style={{ background: form.brandSecondaryColor }} />
          </div>
          {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
          <button type="submit" className="button" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>{t("logoTitle")}</h2>
        <p className="muted">{t("logoHint", { mb: LOGO_MAX_BYTES / 1_000_000 })}</p>
        <div className="row">
          {logo?.logoUrl ? (
            <img src={logo.logoUrl} alt={t("logoAlt")} className="logo-preview" />
          ) : (
            <span className="muted">{t("noLogo")}</span>
          )}
        </div>
        <div className="row">
          <label className="button button--secondary">
            {busy ? t("uploading") : t("upload")}
            <input
              type="file"
              accept={LOGO_CONTENT_TYPES.join(",")}
              hidden
              disabled={busy}
              onChange={(e) => void onLogo(e.target.files?.[0])}
            />
          </label>
          {logo?.logoUrl ? (
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={() => void onRemoveLogo()}
            >
              {t("removeLogo")}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  return (
    <AppShell>
      {({ org }) => {
        if (
          !org.actor.permissions.includes("org.settings.write") ||
          org.organization.view !== "full"
        ) {
          return <Alert kind="error">{t("forbidden")}</Alert>;
        }
        const o = org.organization;
        return (
          <SettingsForm
            key={o.id}
            initial={{
              name: o.name,
              defaultLocale: o.defaultLocale,
              brandPrimaryColor: o.brandPrimaryColor,
              brandSecondaryColor: o.brandSecondaryColor,
            }}
          />
        );
      }}
    </AppShell>
  );
}

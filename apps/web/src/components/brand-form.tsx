"use client";

import {
  LOCALES,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  ORGANIZATION_STATUSES,
  OrganizationUpdateSchema,
  type Locale,
  type OrganizationStatus,
  type PlatformOrganizationUpdate,
} from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/alert";
import { errorKey } from "@/lib/api";

export interface BrandFormValues {
  name: string;
  defaultLocale: Locale;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  status: OrganizationStatus;
}

export interface BrandFormProps {
  initial: BrandFormValues;
  logoUrl: string | null;
  /** Solo el admin interno cambia el estado del club. */
  withStatus?: boolean;
  save: (patch: PlatformOrganizationUpdate) => Promise<void>;
  uploadLogo: (file: File) => Promise<string | null>;
  removeLogo: () => Promise<void>;
}

/** Formulario de marca y ajustes de un club. Lo usan Ajustes del club y el admin interno. */
export function BrandForm(props: BrandFormProps) {
  const t = useTranslations("settings");
  const locales = useTranslations("locales");
  const statuses = useTranslations("status");
  const errors = useTranslations("errors");
  const [form, setForm] = useState<BrandFormValues>(props.initial);
  const [logoUrl, setLogoUrl] = useState(props.logoUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function run(action: () => Promise<void>, okText: string) {
    setMessage(null);
    setBusy(true);
    try {
      await action();
      setMessage({ kind: "ok", text: okText });
    } catch (err) {
      setMessage({ kind: "error", text: errors(errorKey(err)) });
    } finally {
      setBusy(false);
    }
  }

  function onSave(event: FormEvent) {
    event.preventDefault();
    const parsed = OrganizationUpdateSchema.safeParse(form);
    if (!parsed.success) {
      setMessage({ kind: "error", text: errors("bad_request") });
      return;
    }
    const patch: PlatformOrganizationUpdate = props.withStatus
      ? { ...parsed.data, status: form.status }
      : parsed.data;
    void run(() => props.save(patch), t("saved"));
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setMessage({ kind: "error", text: errors("unsupported_media_type") });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setMessage({ kind: "error", text: errors("payload_too_large") });
      return;
    }
    void run(async () => setLogoUrl(await props.uploadLogo(file)), t("logoSaved"));
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
        <form className="form" onSubmit={onSave}>
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
            {props.withStatus ? (
              <label className="field">
                <span>{t("status")}</span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as OrganizationStatus })
                  }
                >
                  {ORGANIZATION_STATUSES.map((code) => (
                    <option key={code} value={code}>
                      {statuses(code)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
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
          {logoUrl ? (
            <img src={logoUrl} alt={t("logoAlt")} className="logo-preview" />
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
              onChange={(e) => onLogo(e.target.files?.[0])}
            />
          </label>
          {logoUrl ? (
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await props.removeLogo();
                  setLogoUrl(null);
                }, t("logoRemoved"))
              }
            >
              {t("removeLogo")}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}

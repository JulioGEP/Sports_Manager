"use client";

import {
  LOCALES,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  OrganizationBrandingSchema,
  OrganizationUpdateResponseSchema,
  OrganizationUpdateSchema,
  onBrandColor,
  type Locale,
} from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";
import { useBranding } from "@/components/branding-provider";
import { apiFetch, errorKey, uploadFile } from "@/lib/api";
import { useReadyClub } from "@/lib/club-context";
import {
  Alert,
  Button,
  Card,
  ColorInput,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Tabs,
  useToast,
} from "@/ui";

type Tab = "general" | "brand" | "logo";

export function Settings() {
  const t = useTranslations("settings");
  const { org } = useReadyClub();
  const params = useSearchParams();
  const router = useRouter();
  const initialTab = params.get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab === "brand" || initialTab === "logo" ? initialTab : "general",
  );

  if (!org.actor.permissions.includes("org.settings.write") || org.organization.view !== "full") {
    return <Alert kind="error">{t("forbidden")}</Alert>;
  }
  const o = org.organization;

  return (
    <div className="stack">
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs<Tab>
        label={t("title")}
        selected={tab}
        onChange={(key) => {
          setTab(key);
          router.replace(key === "general" ? "/settings" : `/settings?tab=${key}`);
        }}
        items={[
          { key: "general", label: t("tabs.general") },
          { key: "brand", label: t("tabs.brand") },
          { key: "logo", label: t("tabs.logo") },
        ]}
      />
      {tab === "general" ? (
        <GeneralTab key={o.id} name={o.name} defaultLocale={o.defaultLocale} />
      ) : null}
      {tab === "brand" ? (
        <BrandTab
          key={o.id}
          primary={o.brandPrimaryColor}
          secondary={o.brandSecondaryColor}
          name={o.name}
        />
      ) : null}
      {tab === "logo" ? <LogoTab /> : null}
    </div>
  );
}

function GeneralTab({
  name: initialName,
  defaultLocale: initialLocale,
}: {
  name: string;
  defaultLocale: Locale;
}) {
  const t = useTranslations("settings.general");
  const c = useTranslations("common");
  const locales = useTranslations("locales");
  const errors = useTranslations("errors");
  const toast = useToast();
  const router = useRouter();
  const { refresh } = useReadyClub();
  const [name, setName] = useState(initialName);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = OrganizationUpdateSchema.safeParse({ name, defaultLocale });
    if (!parsed.success) {
      toast("error", errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/org", {
        method: "PATCH",
        body: parsed.data,
        schema: OrganizationUpdateResponseSchema,
      });
      toast("success", t("saved"));
      router.refresh();
      await refresh();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void save(e)}>
      <Card
        title={t("title")}
        footer={
          <Button type="submit" loading={busy}>
            {c("save")}
          </Button>
        }
      >
        <div className="form">
          <Field label={t("name")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("defaultLocale")} hint={t("defaultLocaleHint")}>
            {(id) => (
              <Select
                id={id}
                value={defaultLocale}
                onChange={(e) => setDefaultLocale(e.target.value as Locale)}
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {locales(code)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Card>
    </form>
  );
}

function BrandTab({
  primary: initialPrimary,
  secondary: initialSecondary,
  name,
}: {
  primary: string;
  secondary: string;
  name: string;
}) {
  const t = useTranslations("settings.brand");
  const c = useTranslations("common");
  const errors = useTranslations("errors");
  const toast = useToast();
  const router = useRouter();
  const { refresh } = useReadyClub();
  const branding = useBranding();
  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState(initialSecondary);
  const [busy, setBusy] = useState(false);
  const valid = /^#[0-9a-f]{6}$/.test(primary) && /^#[0-9a-f]{6}$/.test(secondary);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      toast("error", errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/org", {
        method: "PATCH",
        body: { brandPrimaryColor: primary, brandSecondaryColor: secondary },
        schema: OrganizationUpdateResponseSchema,
      });
      toast("success", t("saved"));
      router.refresh();
      await refresh();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void save(e)}>
      <div className="grid-2">
        <Card
          title={t("title")}
          description={t("description")}
          footer={
            <Button type="submit" loading={busy} disabled={!valid}>
              {c("save")}
            </Button>
          }
        >
          <div className="form">
            <Field label={t("primary")} hint={t("primaryHint")}>
              {(id, describedBy) => (
                <ColorInput
                  id={id}
                  value={primary}
                  onChange={setPrimary}
                  describedBy={describedBy}
                />
              )}
            </Field>
            <Field label={t("secondary")} hint={t("secondaryHint")}>
              {(id, describedBy) => (
                <ColorInput
                  id={id}
                  value={secondary}
                  onChange={setSecondary}
                  describedBy={describedBy}
                />
              )}
            </Field>
          </div>
        </Card>
        <Card title={t("preview")} description={t("previewHint")}>
          <div className="brand-preview" aria-hidden="true">
            <div className="brand-preview__bar">
              {branding?.logoUrl ? (
                <img src={branding.logoUrl} alt="" className="topbar__logo" />
              ) : (
                <span
                  className="brand-mark"
                  style={{
                    background: valid ? primary : undefined,
                    color: valid ? onBrandColor(primary) : undefined,
                  }}
                >
                  {name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>{name}</span>
              <span
                className="navlink navlink--active"
                style={{
                  marginLeft: "auto",
                  color: valid ? primary : undefined,
                  background: valid ? `color-mix(in srgb, ${primary} 10%, white)` : undefined,
                }}
              >
                {t("previewNav")}
              </span>
            </div>
            <div className="brand-preview__body">
              <span
                className="btn btn--primary"
                style={{
                  background: valid ? primary : undefined,
                  borderColor: valid ? primary : undefined,
                  color: valid ? onBrandColor(primary) : undefined,
                }}
              >
                {t("previewButton")}
              </span>
              <span
                className="brand-preview__chip"
                style={{ background: valid ? primary : undefined }}
              />
              <span
                className="brand-preview__chip"
                style={{ background: valid ? secondary : undefined }}
              />
            </div>
          </div>
        </Card>
      </div>
    </form>
  );
}

function LogoTab() {
  const t = useTranslations("settings.logo");
  const errors = useTranslations("errors");
  const toast = useToast();
  const router = useRouter();
  const branding = useBranding();
  const [logoUrl, setLogoUrl] = useState(branding?.logoUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      toast("error", errors("unsupported_media_type"));
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast("error", errors("payload_too_large"));
      return;
    }
    setBusy(true);
    try {
      const updated = await uploadFile("/api/org/logo", file, OrganizationBrandingSchema);
      setLogoUrl(updated.logoUrl);
      toast("success", t("saved"));
      router.refresh();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const updated = await apiFetch("/api/org/logo", {
        method: "DELETE",
        schema: OrganizationBrandingSchema,
      });
      setLogoUrl(updated.logoUrl);
      toast("success", t("removed"));
      router.refresh();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files[0]);
  }

  return (
    <div className="grid-2">
      <Card title={t("title")} description={t("hint", { mb: LOGO_MAX_BYTES / 1_000_000 })}>
        <label
          className={`dropzone${dragging ? " dropzone--active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Icon.Image size={28} />
          <strong>{busy ? t("uploading") : t("drop")}</strong>
          <span className="small">{t("choose")}</span>
          <input
            type="file"
            accept={LOGO_CONTENT_TYPES.join(",")}
            hidden
            disabled={busy}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      </Card>
      <Card
        title={t("current")}
        footer={
          logoUrl ? (
            <Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>
              {t("remove")}
            </Button>
          ) : null
        }
      >
        {logoUrl ? (
          <img src={logoUrl} alt={t("alt")} className="logo-preview" />
        ) : (
          <p className="muted">{t("none")}</p>
        )}
      </Card>
    </div>
  );
}

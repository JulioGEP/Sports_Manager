import {
  LOCALES,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  OrganizationBrandingSchema,
  OrganizationUpdateResponseSchema,
  OrganizationUpdateSchema,
  type Locale,
} from "@sportsmanager/shared";
import { buildClubTheme } from "@sportsmanager/design";
import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { apiFetch, errorKey, uploadFile } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  ColorInput,
  ConfirmDialog,
  Crest,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Tabs,
  useToast,
} from "@/ui";

type Tab = "general" | "brand" | "logo";

export function SettingsPage() {
  const t = useT("settings");
  const { org } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "brand" || raw === "logo" ? raw : "general";

  if (!org.actor.permissions.includes("org.settings.write") || org.organization.view !== "full") {
    return <Alert kind="error">{t("forbidden")}</Alert>;
  }
  const o = org.organization;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs<Tab>
        label={t("title")}
        selected={tab}
        onChange={(key) => setParams(key === "general" ? {} : { tab: key }, { replace: true })}
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
  const t = useT("settings.general");
  const c = useT("common");
  const locales = useT("locales");
  const errors = useT("errors");
  const toast = useToast();
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
      await refresh();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)}>
      <Card
        title={t("title")}
        footer={
          <Button type="submit" loading={busy}>
            {c("save")}
          </Button>
        }
      >
        <div className="flex max-w-xl flex-col gap-4">
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
  const t = useT("settings.brand");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { refresh, branding } = useReadyClub();
  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState(initialSecondary);
  const [busy, setBusy] = useState(false);
  const valid = /^#[0-9a-f]{6}$/.test(primary) && /^#[0-9a-f]{6}$/.test(secondary);

  /** Vista previa en directo con el motor del design system, incluidos sus avisos (DESIGN.md 3.7). */
  const preview = useMemo(
    () => (valid ? buildClubTheme({ primary, secondary }) : null),
    [primary, secondary, valid],
  );
  const previewStyle = preview
    ? (Object.fromEntries(Object.entries(preview.vars)) as Record<string, string>)
    : {};

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
      await refresh();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={t("title")}
          description={t("description")}
          footer={
            <Button type="submit" loading={busy} disabled={!valid}>
              {c("save")}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
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
            {preview?.warnings.map((w) => (
              <Alert key={w} kind="warning">
                {w}
              </Alert>
            ))}
          </div>
        </Card>
        <Card title={t("preview")} description={t("previewHint")}>
          <div className="flex flex-col gap-3" style={previewStyle} aria-hidden="true">
            <div className="flex flex-col overflow-hidden rounded-card bg-hero text-hero-ink">
              <div className="flex items-center gap-3 p-4">
                <span className="grid size-10 place-items-center overflow-hidden rounded-full bg-hero-crest font-semibold text-hero-crest-ink ring-2 ring-club-second">
                  {branding.logoUrl ? (
                    <img src={branding.logoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="text-title2 font-semibold">{name}</span>
              </div>
              <div className="h-1.5 bg-club-second" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-(--h-control) items-center rounded-control bg-club px-5 text-body font-medium text-on-club">
                {t("previewButton")}
              </span>
              <span className="inline-flex h-(--h-control) items-center rounded-control border border-control bg-surface px-5 text-body font-medium text-ink">
                {c("cancel")}
              </span>
              <span className="rounded-chip bg-club-soft px-2.5 py-0.5 text-secondary font-medium text-club-soft-text">
                {t("previewNav")}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </form>
  );
}

function LogoTab() {
  const t = useT("settings.logo");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { branding, refresh } = useReadyClub();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
      await uploadFile("/api/org/logo", file, OrganizationBrandingSchema);
      toast("success", t("saved"));
      await refresh();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setConfirmRemove(false);
    setBusy(true);
    try {
      await apiFetch("/api/org/logo", { method: "DELETE", schema: OrganizationBrandingSchema });
      toast("success", t("removed"));
      await refresh();
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
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={t("title")} description={t("hint", { mb: LOGO_MAX_BYTES / 1_000_000 })}>
        <label
          className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-field border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? "border-club bg-club-soft" : "border-control bg-page"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Icon.Image size={36} weight="duotone" aria-hidden="true" className="text-club-text" />
          <strong className="text-body text-ink">{busy ? t("uploading") : t("drop")}</strong>
          <span className="text-secondary text-muted">{t("choose")}</span>
          <input
            type="file"
            accept={LOGO_CONTENT_TYPES.join(",")}
            className="sr-only"
            disabled={busy}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      </Card>
      <Card
        title={t("current")}
        footer={
          branding.logoUrl ? (
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              onClick={() => setConfirmRemove(true)}
            >
              {t("remove")}
            </Button>
          ) : null
        }
      >
        {branding.logoUrl ? (
          <div className="flex items-center gap-4">
            <img
              src={branding.logoUrl}
              alt={t("alt")}
              className="size-24 rounded-full object-cover ring-2 ring-club-second"
            />
            <Crest name={branding.name} logoUrl={branding.logoUrl} size="sm" />
          </div>
        ) : (
          <p className="text-body text-muted">{t("none")}</p>
        )}
      </Card>
      <ConfirmDialog
        open={confirmRemove}
        title={t("confirmRemoveTitle")}
        body={t("confirmRemoveBody")}
        confirmLabel={t("remove")}
        cancelLabel={c("cancel")}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

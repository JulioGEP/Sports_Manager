import {
  ActivityResponseSchema,
  CLUB_VOICES,
  InvitationsResponseSchema,
  LOCALES,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  MemberTypeResponseSchema,
  MemberTypesResponseSchema,
  MembersResponseSchema,
  OrganizationBrandingSchema,
  OrganizationUpdateResponseSchema,
  OrganizationUpdateSchema,
  PAYMENT_PROVIDERS,
  PaymentsSettingsResponseSchema,
  SeasonCreateSchema,
  SeasonResponseSchema,
  SeasonUpdateSchema,
  SeasonsResponseSchema,
  StructureSummarySchema,
  type ClubVoice,
  type Locale,
  type MemberType,
  type PaymentProvider,
  type Season,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { buildClubTheme } from "@sportsmanager/design";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { useSearchParams } from "react-router";
import { ApiClientError, apiFetch, errorKey, uploadFile } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ColorInput,
  ConfirmDialog,
  Crest,
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
  Tabs,
  useToast,
  type ActionKind,
  type RowAction,
} from "@/ui";

const TABS = [
  "general",
  "brand",
  "logo",
  "seasons",
  "memberTypes",
  "payments",
  "setup",
  "activity",
] as const;
type Tab = (typeof TABS)[number];

/**
 * Ajustes del club (Bloque 5; Bloque 14-18): datos, marca y logo, y ahora también temporadas,
 * tipos de socio, cobros, la puesta en marcha que antes vivía en la portada y la actividad.
 */
export function SettingsPage() {
  const t = useT("settings");
  const { org } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "general";
  const permissions = org.actor.permissions;

  if (!permissions.includes("org.settings.write") || org.organization.view !== "full") {
    return <Alert kind="error">{t("forbidden")}</Alert>;
  }
  const o = org.organization;
  const items = [
    { key: "general" as const, label: t("tabs.general") },
    { key: "brand" as const, label: t("tabs.brand") },
    { key: "logo" as const, label: t("tabs.logo") },
    ...(permissions.includes("org.structure.write")
      ? [{ key: "seasons" as const, label: t("tabs.seasons") }]
      : []),
    ...(permissions.includes("org.club_members.write")
      ? [{ key: "memberTypes" as const, label: t("tabs.memberTypes") }]
      : []),
    ...(permissions.includes("org.fees.read")
      ? [{ key: "payments" as const, label: t("tabs.payments") }]
      : []),
    { key: "setup" as const, label: t("tabs.setup") },
    ...(permissions.includes("org.activity.read")
      ? [{ key: "activity" as const, label: t("tabs.activity") }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs<Tab>
        label={t("title")}
        selected={tab}
        onChange={(key) => setParams(key === "general" ? {} : { tab: key }, { replace: true })}
        items={items}
      />
      {tab === "general" ? (
        <GeneralTab
          key={o.id}
          name={o.name}
          defaultLocale={o.defaultLocale}
          voice={o.voice}
          timezone={o.timezone}
        />
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
      {tab === "seasons" ? <SeasonsTab /> : null}
      {tab === "memberTypes" ? <MemberTypesTab /> : null}
      {tab === "payments" ? <PaymentsTab /> : null}
      {tab === "setup" ? <SetupTab /> : null}
      {tab === "activity" ? <ActivityTab /> : null}
    </div>
  );
}

const COMMON_ZONES = [
  "Europe/Madrid",
  "Atlantic/Canary",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Berlin",
  "America/Mexico_City",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/New_York",
];

function timezoneOptions(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    return intl.supportedValuesOf?.("timeZone") ?? COMMON_ZONES;
  } catch {
    return COMMON_ZONES;
  }
}

function GeneralTab({
  name: initialName,
  defaultLocale: initialLocale,
  voice: initialVoice,
  timezone: initialTimezone,
}: {
  name: string;
  defaultLocale: Locale;
  voice: ClubVoice;
  timezone: string;
}) {
  const t = useT("settings.general");
  const c = useT("common");
  const locales = useT("locales");
  const voices = useT("voices");
  const errors = useT("errors");
  const toast = useToast();
  const { refresh } = useReadyClub();
  const [name, setName] = useState(initialName);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [voice, setVoice] = useState<ClubVoice>(initialVoice);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [busy, setBusy] = useState(false);
  const zones = useMemo(timezoneOptions, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = OrganizationUpdateSchema.safeParse({ name, defaultLocale, voice, timezone });
    if (!parsed.success || !zones.includes(timezone)) {
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
          <Button action="save" type="submit" loading={busy}>
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
          <Field label={t("timezone")} hint={t("timezoneHint")}>
            {(id) => (
              <>
                <Input
                  id={id}
                  required
                  list={`${id}-zones`}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id={`${id}-zones`}>
                  {zones.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label={t("voice")} hint={`${voices(`hint.${voice}`)} ${t("voiceHint")}`}>
            {(id) => (
              <Select id={id} value={voice} onChange={(e) => setVoice(e.target.value as ClubVoice)}>
                {CLUB_VOICES.map((code) => (
                  <option key={code} value={code}>
                    {voices(code)}
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
            <Button action="save" type="submit" loading={busy} disabled={!valid}>
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
              action="delete"
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
        confirmAction="delete"
        cancelLabel={c("cancel")}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

// --- Temporadas (antes en la pantalla de equipos) ---

function SeasonsTab() {
  const t = useT("settings.seasons");
  const errors = useT("errors");
  const toast = useToast();
  const { range } = useDates();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const [editing, setEditing] = useState<Season | null>(null);
  const seasons = useQuery({
    queryKey: ["org", slug, "seasons"],
    queryFn: () => apiFetch("/api/org/seasons", { schema: SeasonsResponseSchema }),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  function setCreating(open: boolean) {
    const next = new URLSearchParams(params);
    if (open) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  }

  async function makeCurrent(season: Season) {
    try {
      await apiFetch(`/api/org/seasons/${season.id}`, {
        method: "PATCH",
        body: { isCurrent: true },
        schema: SeasonResponseSchema,
      });
      toast("success", t("madeCurrent", { name: season.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={t("title")}
        description={t("description")}
        padded={false}
        actions={
          <Button action="add" onClick={() => setCreating(true)}>
            {t("new")}
          </Button>
        }
      >
        {seasons.isError ? (
          <div className="p-5">
            <Alert kind="error">{t("loadError")}</Alert>
          </div>
        ) : null}
        <DataList<Season>
          caption={t("caption")}
          columns={[
            {
              key: "name",
              header: t("table.name"),
              cell: (s) => (
                <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  {s.name}
                  {s.isCurrent ? <StatusChip kind="club">{t("current")}</StatusChip> : null}
                </span>
              ),
            },
            { key: "range", header: t("table.range"), cell: (s) => range(s.startsOn, s.endsOn) },
            {
              key: "teams",
              header: t("table.teams"),
              align: "right",
              numeric: true,
              cell: (s) => s.teamsCount,
            },
          ]}
          rows={seasons.data?.seasons ?? []}
          getKey={(s) => s.id}
          mobileRow={(s) => ({
            title: s.name,
            subtitle: range(s.startsOn, s.endsOn),
            trailing: s.isCurrent ? <StatusChip kind="club">{t("current")}</StatusChip> : null,
          })}
          rowActions={(s): RowAction[] => [
            { key: "edit", label: t("edit"), action: "edit", onClick: () => setEditing(s) },
            ...(!s.isCurrent
              ? [
                  {
                    key: "current",
                    label: t("makeCurrent"),
                    action: "current" as const,
                    tone: "primary" as const,
                    onClick: () => void makeCurrent(s),
                  },
                ]
              : []),
          ]}
          empty={
            <EmptyState
              icon={<Icon.CalendarBlank weight="duotone" />}
              title={t("empty")}
              description={t("emptyHint")}
              action={
                <Button action="add" onClick={() => setCreating(true)}>
                  {t("new")}
                </Button>
              }
            />
          }
        />
      </Card>
      {creating || editing ? (
        <SeasonSheet
          season={editing}
          suggestCurrent={(seasons.data?.seasons.length ?? 0) === 0}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => void reload()}
        />
      ) : null}
    </div>
  );
}

function suggestSeasonName(): { name: string; startsOn: string; endsOn: string } {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `${startYear}-${String(startYear + 1).slice(2)}`,
    startsOn: `${startYear}-09-01`,
    endsOn: `${startYear + 1}-06-30`,
  };
}

function SeasonSheet({
  season,
  suggestCurrent,
  onClose,
  onSaved,
}: {
  season: Season | null;
  suggestCurrent: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("settings.seasons.sheet");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const suggestion = useMemo(suggestSeasonName, []);
  const [name, setName] = useState(season?.name ?? suggestion.name);
  const [startsOn, setStartsOn] = useState(season?.startsOn ?? suggestion.startsOn);
  const [endsOn, setEndsOn] = useState(season?.endsOn ?? suggestion.endsOn);
  const [isCurrent, setIsCurrent] = useState(suggestCurrent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = season
      ? SeasonUpdateSchema.safeParse({ name, startsOn, endsOn })
      : SeasonCreateSchema.safeParse({ name, startsOn, endsOn, isCurrent });
    if (!parsed.success) {
      setError(t("invalid"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch(season ? `/api/org/seasons/${season.id}` : "/api/org/seasons", {
        method: season ? "PATCH" : "POST",
        body: parsed.data,
        schema: SeasonResponseSchema,
      });
      toast("success", t(season ? "saved" : "created"));
      onClose();
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409
          ? t("duplicate")
          : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={season ? t("editTitle") : t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action={season ? "save" : "add"} type="submit" form="season-form" loading={busy}>
            {season ? c("save") : t("submit")}
          </Button>
        </>
      }
    >
      <form id="season-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")} hint={t("nameHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("startsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("endsOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        {!season ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-control px-3 py-2">
            <input
              type="checkbox"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
            />
            <span className="flex flex-col">
              <span className="text-body text-ink">{t("isCurrent")}</span>
              <span className="text-label text-muted">{t("isCurrentHint")}</span>
            </span>
          </label>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

// --- Tipos de socio ---

function MemberTypesTab() {
  const t = useT("settings.memberTypes");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<MemberType | null>(null);
  const types = useQuery({
    queryKey: ["org", slug, "member-types"],
    queryFn: () => apiFetch("/api/org/member-types", { schema: MemberTypesResponseSchema }),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug, "member-types"] });

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/api/org/member-types", {
        method: "POST",
        body: { name: name.trim() },
        schema: MemberTypeResponseSchema,
      });
      toast("success", t("created", { name: name.trim() }));
      setName("");
      void reload();
    } catch (err) {
      toast(
        "error",
        err instanceof ApiClientError && err.status === 409
          ? t("duplicate")
          : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(type: MemberType, status: "active" | "archived") {
    try {
      await apiFetch(`/api/org/member-types/${type.id}`, {
        method: "PATCH",
        body: { status },
        schema: MemberTypeResponseSchema,
      });
      toast("success", t(status === "archived" ? "archived" : "restored", { name: type.name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={t("title")} description={t("description")} padded={false}>
        {types.isError ? (
          <div className="p-5">
            <Alert kind="error">{t("loadError")}</Alert>
          </div>
        ) : null}
        <DataList<MemberType>
          caption={t("caption")}
          columns={[
            {
              key: "name",
              header: t("table.name"),
              cell: (m) => <span className="font-medium text-ink">{m.name}</span>,
            },
            {
              key: "members",
              header: t("table.members"),
              align: "right",
              numeric: true,
              cell: (m) => m.membersCount,
            },
            {
              key: "status",
              header: t("table.status"),
              cell: (m) => (
                <StatusChip kind={m.status === "active" ? "success" : "neutral"}>
                  {t(`status.${m.status}`)}
                </StatusChip>
              ),
            },
          ]}
          rows={types.data?.memberTypes ?? []}
          getKey={(m) => m.id}
          mobileRow={(m) => ({
            title: m.name,
            subtitle: t("membersCount", { count: m.membersCount }),
            trailing:
              m.status === "archived" ? (
                <StatusChip kind="neutral">{t("status.archived")}</StatusChip>
              ) : null,
          })}
          rowActions={(m): RowAction[] => [
            { key: "rename", label: t("rename"), action: "edit", onClick: () => setRenaming(m) },
            m.status === "active"
              ? {
                  key: "archive",
                  label: t("archive"),
                  action: "archive",
                  tone: "danger",
                  onClick: () => void setStatus(m, "archived"),
                }
              : {
                  key: "restore",
                  label: t("restore"),
                  action: "restore",
                  onClick: () => void setStatus(m, "active"),
                },
          ]}
          empty={
            <EmptyState
              icon={<Icon.IdentificationCard weight="duotone" />}
              title={t("empty")}
              description={t("emptyHint")}
            />
          }
        />
      </Card>
      <form onSubmit={(e) => void create(e)}>
        <Card
          title={t("newTitle")}
          description={t("newDescription")}
          footer={
            <Button action="add" type="submit" loading={busy} disabled={!name.trim()}>
              {t("add")}
            </Button>
          }
        >
          <Field label={t("name")}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            )}
          </Field>
        </Card>
      </form>
      {renaming ? (
        <RenameTypeSheet
          type={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => void reload()}
        />
      ) : null}
    </div>
  );
}

function RenameTypeSheet({
  type,
  onClose,
  onSaved,
}: {
  type: MemberType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("settings.memberTypes");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(type.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/org/member-types/${type.id}`, {
        method: "PATCH",
        body: { name: name.trim() },
        schema: MemberTypeResponseSchema,
      });
      toast("success", t("renamed"));
      onClose();
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 409
          ? t("duplicate")
          : errors(errorKey(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("renameTitle", { name: type.name })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="rename-type-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="rename-type-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

// --- Cobros (Bloque 18): proveedor y cuenta de Stripe ---

function PaymentsTab() {
  const t = useT("settings.payments");
  const c = useT("common");
  const providers = useT("paymentProviders");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug, refresh, org } = useReadyClub();
  const canWrite = org.actor.permissions.includes("org.settings.write");
  const settings = useQuery({
    queryKey: ["org", slug, "fees", "settings"],
    queryFn: () => apiFetch("/api/org/fees/settings", { schema: PaymentsSettingsResponseSchema }),
  });
  if (settings.isPending) return <p className="text-body text-muted">{c("loading")}</p>;
  if (settings.isError || !settings.data)
    return <Alert kind="error">{errors(errorKey(settings.error))}</Alert>;
  return (
    <PaymentsForm
      key={`${settings.data.payments.provider}:${settings.data.payments.stripeAccountId ?? ""}`}
      initial={settings.data.payments}
      canWrite={canWrite}
      labels={{ t, c, providers, errors }}
      onSaved={async () => {
        await client.invalidateQueries({ queryKey: ["org", slug, "fees", "settings"] });
        await refresh();
        toast("success", t("saved"));
      }}
    />
  );
}

function PaymentsForm({
  initial,
  canWrite,
  labels: { t, c, providers, errors },
  onSaved,
}: {
  initial: {
    provider: PaymentProvider;
    stripeAccountId: string | null;
    stripeConfigured: boolean;
    currency: string;
  };
  canWrite: boolean;
  labels: {
    t: ReturnType<typeof useT>;
    c: ReturnType<typeof useT>;
    providers: ReturnType<typeof useT>;
    errors: ReturnType<typeof useT>;
  };
  onSaved: () => Promise<void>;
}) {
  const [provider, setProvider] = useState<PaymentProvider>(initial.provider);
  const [accountId, setAccountId] = useState(initial.stripeAccountId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    provider !== initial.provider || (accountId.trim() || null) !== initial.stripeAccountId;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (provider === "stripe" && !initial.stripeConfigured) {
      setError(t("conflictPlatform"));
      return;
    }
    if (provider === "stripe" && !accountId.trim()) {
      setError(t("conflictAccount"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/org/fees/settings", {
        method: "PATCH",
        body: {
          ...(provider !== initial.provider ? { provider } : {}),
          ...((accountId.trim() || null) !== initial.stripeAccountId
            ? { stripeAccountId: accountId.trim() || null }
            : {}),
        },
        schema: PaymentsSettingsResponseSchema,
      });
      await onSaved();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setError(initial.stripeConfigured ? t("conflictAccount") : t("conflictPlatform"));
      } else if (err instanceof ApiClientError && err.status === 400) {
        setError(t("invalidAccount"));
      } else {
        setError(errors(errorKey(err)));
      }
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
            canWrite ? (
              <Button action="save" type="submit" loading={busy} disabled={!dirty}>
                {c("save")}
              </Button>
            ) : null
          }
        >
          <div className="flex flex-col gap-4">
            {!initial.stripeConfigured ? (
              <Alert kind="warning">{t("stripeNotConfigured")}</Alert>
            ) : null}
            <Field label={t("provider")} hint={t(`providerHint.${provider}`)}>
              {(id) => (
                <Select
                  id={id}
                  value={provider}
                  disabled={!canWrite}
                  onChange={(e) => setProvider(e.target.value as PaymentProvider)}
                >
                  {PAYMENT_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {providers(p)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("stripeAccount")} hint={t("stripeAccountHint")}>
              {(id) => (
                <Input
                  id={id}
                  value={accountId}
                  disabled={!canWrite}
                  placeholder="acct_…"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setAccountId(e.target.value)}
                />
              )}
            </Field>
            {error ? <Alert kind="error">{error}</Alert> : null}
          </div>
        </Card>
        <Card title={t("statusTitle")}>
          <Definitions
            items={[
              { term: t("currentProvider"), detail: providers(initial.provider) },
              {
                term: t("platformKeys"),
                detail: (
                  <StatusChip kind={initial.stripeConfigured ? "success" : "warning"}>
                    {initial.stripeConfigured ? t("ready") : t("missing")}
                  </StatusChip>
                ),
              },
              {
                term: t("connectedAccount"),
                detail: initial.stripeAccountId ? (
                  <span className="font-mono text-secondary">{initial.stripeAccountId}</span>
                ) : (
                  <StatusChip kind="neutral">{t("notConnected")}</StatusChip>
                ),
              },
              { term: t("currency"), detail: initial.currency },
            ]}
          />
          <p className="mt-4 text-secondary text-muted">{t("howItWorks")}</p>
        </Card>
      </div>
    </form>
  );
}

// --- Puesta en marcha (antes "primeros pasos" en la portada) ---

function SetupTab() {
  const t = useT("settings.setup");
  const { slug, org, branding } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const summary = useQuery({
    queryKey: ["org", slug, "summary"],
    queryFn: () => apiFetch("/api/org/summary", { schema: StructureSummarySchema }),
    enabled: permissions.includes("org.structure.read"),
  });
  const members = useQuery({
    queryKey: ["org", slug, "members"],
    queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
    enabled: permissions.includes("org.members.read"),
  });
  const invitations = useQuery({
    queryKey: ["org", slug, "invitations"],
    queryFn: () => apiFetch("/api/org/invitations", { schema: InvitationsResponseSchema }),
    enabled: permissions.includes("org.members.invite"),
  });
  const defaultColors =
    branding.brandPrimaryColor === brandTokens["--color-brand-primary"] &&
    branding.brandSecondaryColor === brandTokens["--color-brand-secondary"];
  const staff = (members.data?.members ?? []).filter((m) =>
    m.roles.some((r) => r === "coach" || r === "staff"),
  ).length;
  const pending = (invitations.data?.invitations ?? []).filter((i) => i.state === "pending").length;
  /** Cada paso lleva el icono de la acción que propone (DESIGN.md 8.1). */
  const setupActions = {
    logo: "upload",
    colors: "edit",
    season: "add",
    section: "add",
    invite: "invite",
  } as const satisfies Record<string, ActionKind>;
  const steps = [
    { key: "logo", done: Boolean(branding.logoUrl), to: `${paths.settings}?tab=logo` },
    { key: "colors", done: !defaultColors, to: `${paths.settings}?tab=brand` },
    {
      key: "season",
      done: Boolean(summary.data?.currentSeason),
      to: `${paths.settings}?tab=seasons&new=1`,
    },
    {
      key: "section",
      done: (summary.data?.sections ?? 0) > 0,
      to: summary.data?.currentSeason
        ? `${paths.sections}?new=1`
        : `${paths.settings}?tab=seasons&new=1`,
    },
    { key: "invite", done: staff > 0 || pending > 0, to: `${paths.staff}?invite=1` },
  ] as const;
  const done = steps.filter((s) => s.done).length;

  return (
    <Card
      title={t("title")}
      description={t("description", { done, total: steps.length })}
      padded={false}
    >
      <ol className="flex flex-col divide-y divide-line">
        {steps.map((step) => (
          <li key={step.key} className="flex min-h-16 items-center gap-3 px-5 py-3">
            <span
              aria-hidden="true"
              className={`grid size-7 shrink-0 place-items-center rounded-full ${
                step.done ? "bg-success-soft text-success" : "border border-control text-muted"
              }`}
            >
              {step.done ? <Icon.Check size={16} weight="bold" /> : null}
            </span>
            <span
              className={`flex-1 text-body ${step.done ? "text-muted line-through" : "text-ink"}`}
            >
              {t(step.key)}
            </span>
            {step.done ? (
              <StatusChip kind="success">{t("done")}</StatusChip>
            ) : (
              <ButtonLink
                action={setupActions[step.key]}
                to={step.to}
                variant="secondary"
                size="sm"
              >
                {t(`${step.key}Action`)}
              </ButtonLink>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

// --- Actividad: todo lo que ha pasado en el club ---

function ActivityTab() {
  const t = useT("settings.activity");
  const auditActions = useT("audit");
  const intl = useIntl();
  const { slug } = useReadyClub();
  const activity = useQuery({
    queryKey: ["org", slug, "activity", 100],
    queryFn: () => apiFetch("/api/org/activity?limit=100", { schema: ActivityResponseSchema }),
  });
  const when = (iso: string) =>
    intl.formatDate(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <Card title={t("title")} description={t("description")} padded={false}>
      {activity.isError ? (
        <div className="p-5">
          <Alert kind="error">{t("loadError")}</Alert>
        </div>
      ) : null}
      {activity.data && activity.data.entries.length === 0 ? (
        <EmptyState icon={<Icon.Pulse weight="duotone" />} title={t("empty")} />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {activity.data?.entries.map((entry) => (
            <li key={entry.id} className="flex min-h-14 items-center gap-3 px-5 py-2">
              <span className="text-club-text">
                <Icon.Pulse size={20} weight="duotone" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body text-ink">
                  {auditActions(entry.action)}
                  {entry.target ? ` · ${entry.target}` : ""}
                </span>
                <span className="truncate text-secondary text-muted">
                  {entry.actorName ?? t("system")} · {when(entry.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

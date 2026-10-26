import {
  ActivityResponseSchema,
  InvitationsResponseSchema,
  LOCALES,
  MemberTypeResponseSchema,
  MemberTypesResponseSchema,
  MembersResponseSchema,
  OrganizationUpdateResponseSchema,
  OrganizationUpdateSchema,
  PAYMENT_PROVIDERS,
  PaymentsSettingsResponseSchema,
  SeasonCreateSchema,
  StripeOnboardingResponseSchema,
  SeasonResponseSchema,
  SeasonUpdateSchema,
  SeasonsResponseSchema,
  StructureSummarySchema,
  type Locale,
  type MemberType,
  type PaymentProvider,
  type PaymentsSettings,
  type Season,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { useSearchParams } from "react-router";
import { useAccountingStatus } from "@/components/accounting";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { AccountingSection } from "./settings-accounting";
import { DevelopersTab } from "./settings-developers";
import { SettingsGroup } from "./settings-group";
import { IdentityTab } from "./settings-identity";
import { ImprovementsTab } from "./settings-improvements";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
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

/**
 * Una pestaña por función (ADR 0045; Mejoras, ADR 0048). La que absorbe a otra conserva su clave:
 * así los enlaces de siempre (`?tab=seasons&new=1`, `?tab=payments`) siguen abriendo lo mismo.
 */
const TABS = [
  "general",
  "identity",
  "seasons",
  "payments",
  "developers",
  "activity",
  "improvements",
] as const;
type Tab = (typeof TABS)[number];

/**
 * Pestañas de antes (ADR 0043 y 0045): los enlaces viejos llevan a donde vive ahora lo que abrían.
 * Si comparte pestaña con otra cosa, `section` baja hasta su bloque.
 */
const TAB_ALIASES: Record<string, { tab: Tab; section?: string }> = {
  brand: { tab: "identity" },
  logo: { tab: "identity" },
  setup: { tab: "general" },
  memberTypes: { tab: "seasons" },
  accounting: { tab: "payments", section: "settings-accounting" },
};

/**
 * Ajustes del club (Bloque 5; Bloque 14-18; ADR 0045), por función: General (la puesta en marcha
 * mientras falte algo y los datos del club), Identidad (ADR 0043), Temporadas y socios, Cobros y
 * contabilidad (ADR 0042), Web del club (ADR 0041), Actividad y Mejoras de la plataforma
 * (ADR 0047 y 0048).
 */
export function SettingsPage() {
  const t = useT("settings");
  const { org } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") ?? "";
  const alias = TAB_ALIASES[raw];
  const tab: Tab = (TABS as readonly string[]).includes(raw)
    ? (raw as Tab)
    : (alias?.tab ?? "general");
  const permissions = org.actor.permissions;

  if (!permissions.includes("org.settings.write") || org.organization.view !== "full") {
    return <Alert kind="error">{t("forbidden")}</Alert>;
  }
  const o = org.organization;
  const canSeasons = permissions.includes("org.structure.write");
  const canMemberTypes = permissions.includes("org.club_members.write");
  const items = [
    { key: "general" as const, label: t("tabs.general") },
    { key: "identity" as const, label: t("tabs.identity") },
    ...(canSeasons || canMemberTypes
      ? [{ key: "seasons" as const, label: t("tabs.seasons") }]
      : []),
    // Pasarela de pago y contabilidad (ADR 0042) juntas: es el mismo dinero, del cobro al asiento.
    ...(permissions.includes("org.fees.read")
      ? [{ key: "payments" as const, label: t("tabs.payments") }]
      : []),
    // Web del club (ADR 0041): la clave del catálogo público y el código para pegar.
    { key: "developers" as const, label: t("tabs.developers") },
    ...(permissions.includes("org.activity.read")
      ? [{ key: "activity" as const, label: t("tabs.activity") }]
      : []),
    // Mejoras de la plataforma (ADR 0048): solo la administración habla con la plataforma.
    ...(permissions.includes("org.suggestions")
      ? [{ key: "improvements" as const, label: t("tabs.improvements") }]
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
        <div className="flex flex-col gap-6">
          <SetupCard />
          <GeneralTab
            key={o.id}
            name={o.name}
            defaultLocale={o.defaultLocale}
            timezone={o.timezone}
          />
        </div>
      ) : null}
      {tab === "identity" ? <IdentityTab key={o.id} /> : null}
      {tab === "seasons" ? (
        <div className="flex flex-col gap-6">
          {canSeasons ? <SeasonsCard /> : null}
          {canMemberTypes ? <MemberTypesCard /> : null}
        </div>
      ) : null}
      {tab === "payments" ? <PaymentsTab section={alias?.section} /> : null}
      {tab === "developers" ? <DevelopersTab /> : null}
      {tab === "activity" ? <ActivityTab /> : null}
      {tab === "improvements" ? <ImprovementsTab /> : null}
    </div>
  );
}

/** Baja una vez hasta un bloque de la pestaña cuando lo de encima ya ha cargado y no lo empuja. */
function useScrollToSection(section: string | undefined, ready: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!section || !ready || done.current) return;
    done.current = true;
    document.getElementById(section)?.scrollIntoView({ block: "start" });
  }, [section, ready]);
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
  timezone: initialTimezone,
}: {
  name: string;
  defaultLocale: Locale;
  timezone: string;
}) {
  const t = useT("settings.general");
  const c = useT("common");
  const locales = useT("locales");
  const errors = useT("errors");
  const toast = useToast();
  const { refresh } = useReadyClub();
  const [name, setName] = useState(initialName);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [busy, setBusy] = useState(false);
  const zones = useMemo(timezoneOptions, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = OrganizationUpdateSchema.safeParse({ name, defaultLocale, timezone });
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
        </div>
      </Card>
    </form>
  );
}

// --- Temporadas y socios: temporadas (antes en la pantalla de equipos) ---

function SeasonsCard() {
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

// --- Temporadas y socios: tipos de socio ---

function MemberTypesCard() {
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

// --- Cobros y contabilidad (Bloque 18; ADR 0042 y 0045): la pasarela y Holded, una sola pestaña ---

function PaymentsTab({ section }: { section: string | undefined }) {
  const t = useT("settings.payments");
  const c = useT("common");
  const providers = useT("paymentProviders");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug, refresh, org } = useReadyClub();
  const [params, setParams] = useSearchParams();
  const canWrite = org.actor.permissions.includes("org.settings.write");
  const settings = useQuery({
    queryKey: ["org", slug, "fees", "settings"],
    queryFn: () => apiFetch("/api/org/fees/settings", { schema: PaymentsSettingsResponseSchema }),
  });
  // La misma consulta que pinta la contabilidad: con las dos cargadas, la pasarela ya no crece.
  const accounting = useAccountingStatus();
  useScrollToSection(section, !settings.isPending && !accounting.isPending);
  const back = params.get("stripe");
  const handled = useRef(false);

  // De vuelta del alta en Stripe: se pregunta por la cuenta. Si el enlace caducó, se pide otro.
  useEffect(() => {
    if (!back || handled.current) return;
    handled.current = true;
    const sp = new URLSearchParams(params);
    sp.delete("stripe");
    setParams(sp, { replace: true });
    if (back === "refresh" && canWrite) {
      void startOnboarding().catch((err: unknown) => toast("error", errors(errorKey(err))));
      return;
    }
    void apiFetch("/api/org/fees/settings/stripe/refresh", {
      method: "POST",
      schema: PaymentsSettingsResponseSchema,
    })
      .then((res) => {
        client.setQueryData(["org", slug, "fees", "settings"], res);
        toast("success", t("returned"));
      })
      .catch((err: unknown) => toast("error", errors(errorKey(err))));
    // Solo al volver de Stripe: el resto de dependencias no cambian el gesto.
  }, [back]);

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup title={t("groups.gateway")}>
        {settings.isPending ? (
          <p className="text-body text-muted">{c("loading")}</p>
        ) : settings.isError || !settings.data ? (
          <Alert kind="error">{errors(errorKey(settings.error))}</Alert>
        ) : (
          <PaymentsForm
            key={`${settings.data.payments.provider}:${settings.data.payments.stripeAccountId ?? ""}:${settings.data.payments.stripeAccountStatus ?? ""}`}
            initial={settings.data.payments}
            canWrite={canWrite}
            labels={{ t, c, providers, errors }}
            onSaved={async () => {
              await client.invalidateQueries({ queryKey: ["org", slug, "fees", "settings"] });
              await refresh();
              toast("success", t("saved"));
            }}
            onRefreshed={(payments) =>
              client.setQueryData(["org", slug, "fees", "settings"], { payments })
            }
          />
        )}
      </SettingsGroup>
      <SettingsGroup id="settings-accounting" title={t("groups.accounting")}>
        <AccountingSection />
      </SettingsGroup>
    </div>
  );
}

/** Pide a la API el enlace de alta en Stripe y se va allí. */
async function startOnboarding(): Promise<void> {
  const res = await apiFetch("/api/org/fees/settings/stripe/onboarding", {
    method: "POST",
    body: {},
    schema: StripeOnboardingResponseSchema,
  });
  window.location.assign(res.url);
}

const accountStatusKind = {
  none: "neutral",
  unknown: "neutral",
  onboarding: "warning",
  restricted: "warning",
  enabled: "success",
} as const;

function PaymentsForm({
  initial,
  canWrite,
  labels: { t, c, providers, errors },
  onSaved,
  onRefreshed,
}: {
  initial: PaymentsSettings;
  canWrite: boolean;
  labels: {
    t: ReturnType<typeof useT>;
    c: ReturnType<typeof useT>;
    providers: ReturnType<typeof useT>;
    errors: ReturnType<typeof useT>;
  };
  onSaved: () => Promise<void>;
  onRefreshed: (payments: PaymentsSettings) => void;
}) {
  const toast = useToast();
  const [provider, setProvider] = useState<PaymentProvider>(initial.provider);
  const [accountId, setAccountId] = useState(initial.stripeAccountId ?? "");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    provider !== initial.provider || (accountId.trim() || null) !== initial.stripeAccountId;
  const accountState = !initial.stripeAccountId
    ? "none"
    : (initial.stripeAccountStatus ?? "unknown");
  const needsOnboarding = accountState === "none" || accountState === "onboarding";

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
        setError(
          !initial.stripeConfigured
            ? t("conflictPlatform")
            : !accountId.trim()
              ? t("conflictAccount")
              : t("conflictNotReady"),
        );
      } else if (err instanceof ApiClientError && err.status === 400) {
        setError(t("invalidAccount"));
      } else {
        setError(errors(errorKey(err)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setConnecting(true);
    try {
      await startOnboarding();
    } catch (err) {
      toast("error", errors(errorKey(err)));
      setConnecting(false);
    }
  }

  async function check() {
    setChecking(true);
    try {
      const res = await apiFetch("/api/org/fees/settings/stripe/refresh", {
        method: "POST",
        schema: PaymentsSettingsResponseSchema,
      });
      onRefreshed(res.payments);
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
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
              {manual || (initial.stripeAccountId && !initial.stripeAccountStatus) ? (
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
              ) : canWrite ? (
                <span>
                  <Button size="sm" variant="tertiary" onClick={() => setManual(true)}>
                    {t("manualToggle")}
                  </Button>
                </span>
              ) : null}
              {error ? <Alert kind="error">{error}</Alert> : null}
            </div>
          </Card>
          <Card
            title={t("stripeTitle")}
            description={t("stripeDescription")}
            footer={
              canWrite && initial.stripeConfigured ? (
                <>
                  {initial.stripeAccountId ? (
                    <Button
                      variant="secondary"
                      action="restore"
                      loading={checking}
                      onClick={() => void check()}
                    >
                      {t("refresh")}
                    </Button>
                  ) : null}
                  {needsOnboarding ? (
                    <Button action="link" loading={connecting} onClick={() => void connect()}>
                      {initial.stripeAccountId ? t("continue") : t("connect")}
                    </Button>
                  ) : null}
                </>
              ) : null
            }
          >
            <div className="flex flex-col gap-3">
              <span className="flex flex-wrap items-center gap-2 text-body text-ink">
                {t("accountStatus")}
                <StatusChip kind={accountStatusKind[accountState]}>
                  {t(`statuses.${accountState}`)}
                </StatusChip>
              </span>
              {accountState !== "none" && accountState !== "unknown" ? (
                <p className="text-secondary text-muted">{t(`statusHint.${accountState}`)}</p>
              ) : null}
            </div>
          </Card>
        </div>
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
              {
                term: t("accountStatus"),
                detail: (
                  <StatusChip kind={accountStatusKind[accountState]}>
                    {t(`statuses.${accountState}`)}
                  </StatusChip>
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

// --- Puesta en marcha (antes "primeros pasos" en la portada; en General desde la ADR 0045) ---

/**
 * Lo que le falta al club para estar listo, a la entrada de los ajustes. No es un ajuste: es una
 * guía que lleva a cada sitio. Mientras carga no se pinta (no se ve un paso a medias que ya está
 * hecho) y, con todo hecho, se va.
 */
function SetupCard() {
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
    { key: "logo", done: Boolean(branding.logoUrl), to: `${paths.settings}?tab=identity` },
    { key: "colors", done: !defaultColors, to: `${paths.settings}?tab=identity` },
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
  if ([summary, members, invitations].some((q) => q.isLoading) || done === steps.length) {
    return null;
  }

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

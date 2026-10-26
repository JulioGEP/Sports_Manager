import {
  BRAND_COLOR_PATTERN,
  CLUB_MOTTO_MAX,
  CLUB_STYLE_OPTIONS,
  CLUB_VOICES,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  OrganizationBrandingSchema,
  OrganizationUpdateResponseSchema,
  type ClubStyle,
  type ClubVoice,
  type OrganizationBranding,
} from "@sportsmanager/shared";
import { buildClubTheme, buttonClassName } from "@sportsmanager/design";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { createIntl, createIntlCache } from "react-intl";
import { apiFetch, errorKey, uploadFile } from "@/lib/api";
import { useReadyClub, type BrandingDraft } from "@/lib/club";
import { useLocale, useT, voiceCatalog } from "@/lib/intl";
import { tintFor } from "@/lib/theme";
import {
  Alert,
  Button,
  Card,
  ClubHero,
  ClubHeroButton,
  ColorInput,
  ConfirmDialog,
  Crest,
  Field,
  Icon,
  IconStyleProvider,
  Input,
  StatusChip,
  useToast,
} from "@/ui";

/**
 * Identidad del club (ADR 0043): todo lo que hace que la plataforma de un club no se parezca a la de
 * otro, en una sola pestaña. Escudo, paleta y colores, tipografía, botones, iconos, fondo, portada,
 * navegación, esquinas, lema y voz. Lo que se elige es un borrador que pinta y hace hablar a toda
 * la app en directo (solo para quien lo edita); al guardar, lo ve todo el club.
 */

/** Lo que se edita aquí. El escudo va aparte: se sube y se quita al momento. */
interface Identity {
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  voice: ClubVoice;
  motto: string;
  style: ClubStyle;
}

function identityOf(branding: OrganizationBranding): Identity {
  return {
    brandPrimaryColor: branding.brandPrimaryColor,
    brandSecondaryColor: branding.brandSecondaryColor,
    voice: branding.voice,
    motto: branding.motto ?? "",
    style: branding.style,
  };
}

function sameIdentity(a: Identity, b: Identity): boolean {
  return (
    a.brandPrimaryColor === b.brandPrimaryColor &&
    a.brandSecondaryColor === b.brandSecondaryColor &&
    a.voice === b.voice &&
    a.motto.trim() === b.motto.trim() &&
    (Object.keys(a.style) as (keyof ClubStyle)[]).every((k) => a.style[k] === b.style[k])
  );
}

const validColor = (hex: string) => BRAND_COLOR_PATTERN.test(hex);

/**
 * Paletas de partida: pares de colores clásicos del deporte, por su nombre y nunca por el de un
 * club real. Luego cada color se ajusta a mano.
 */
const PALETTES = [
  { key: "redGold", primary: "#d71920", secondary: "#e8b52a" },
  { key: "greenGold", primary: "#0b6e4f", secondary: "#f2c200" },
  { key: "navyRed", primary: "#0b1f4b", secondary: "#d71920" },
  { key: "maroonWhite", primary: "#7a1f3d", secondary: "#ffffff" },
  { key: "skyWhite", primary: "#6cb4ee", secondary: "#ffffff" },
  { key: "blackGold", primary: "#0b0d12", secondary: "#e8b52a" },
  { key: "orangeBlack", primary: "#f26a1b", secondary: "#0b0d12" },
  { key: "purpleYellow", primary: "#5b2a86", secondary: "#f2c200" },
  { key: "whiteBlue", primary: "#ffffff", secondary: "#1d4ed8" },
  { key: "yellowBlack", primary: "#f2c200", secondary: "#0b0d12" },
  { key: "greenWhite", primary: "#138a36", secondary: "#ffffff" },
  { key: "blueWhite", primary: "#1d4ed8", secondary: "#ffffff" },
] as const;

/**
 * Looks de partida para un box (ADR 0049): colores, letra, botones, iconos, fondo, portada,
 * navegación, esquinas y voz de una vez, para que un club de fitness no parezca un club de fútbol.
 * Luego se ajusta cada cosa a mano.
 */
const BOX_LOOKS: { key: string; identity: Omit<Identity, "motto"> }[] = [
  {
    key: "industrial",
    identity: {
      brandPrimaryColor: "#0b0d12",
      brandSecondaryColor: "#f2c200",
      voice: "vestuario",
      style: {
        typography: "deportiva",
        buttons: "recta",
        icons: "gruesa",
        background: "neutro",
        hero: "banda",
        nav: "oscuro",
        corners: "rectas",
      },
    },
  },
  {
    key: "hybrid",
    identity: {
      brandPrimaryColor: "#f26a1b",
      brandSecondaryColor: "#0b0d12",
      voice: "cercana",
      style: {
        typography: "deportiva",
        buttons: "relieve",
        icons: "duotono",
        background: "trama",
        hero: "rayas",
        nav: "club",
        corners: "sistema",
      },
    },
  },
  {
    key: "night",
    identity: {
      brandPrimaryColor: "#111827",
      brandSecondaryColor: "#84cc16",
      voice: "vestuario",
      style: {
        typography: "geometrica",
        buttons: "pildora",
        icons: "linea",
        background: "degradado",
        hero: "degradado",
        nav: "oscuro",
        corners: "redondeadas",
      },
    },
  },
  {
    key: "studio",
    identity: {
      brandPrimaryColor: "#0f766e",
      brandSecondaryColor: "#f5f5f4",
      voice: "profesional",
      style: {
        typography: "geometrica",
        buttons: "pildora",
        icons: "fina",
        background: "liso",
        hero: "degradado",
        nav: "claro",
        corners: "redondeadas",
      },
    },
  },
];

export function IdentityTab() {
  const t = useT("settings.identity");
  const errors = useT("errors");
  const toast = useToast();
  const { branding, look, setDraft, refresh } = useReadyClub();
  const saved = useMemo(() => identityOf(branding), [branding]);
  const [form, setForm] = useState<Identity>(saved);
  const [busy, setBusy] = useState(false);
  const dirty = !sameIdentity(form, saved);
  const colorsValid = validColor(form.brandPrimaryColor) && validColor(form.brandSecondaryColor);

  // Vista previa en directo: el borrador pinta y hace hablar a toda la app. Un color a medio
  // escribir no entra (el motor necesita un #rrggbb completo).
  useEffect(() => {
    if (!dirty) {
      setDraft(null);
      return;
    }
    const draft: BrandingDraft = {
      voice: form.voice,
      motto: form.motto.trim() === "" ? null : form.motto.trim(),
      style: form.style,
    };
    if (validColor(form.brandPrimaryColor)) draft.brandPrimaryColor = form.brandPrimaryColor;
    if (validColor(form.brandSecondaryColor)) draft.brandSecondaryColor = form.brandSecondaryColor;
    setDraft(draft);
  }, [form, dirty, setDraft]);
  // Al salir de la pestaña sin guardar, el club vuelve a verse como está guardado.
  useEffect(() => () => setDraft(null), [setDraft]);

  const set = <K extends keyof Identity>(key: K, value: Identity[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setStyle = <K extends keyof ClubStyle>(key: K, value: ClubStyle[K]) =>
    setForm((f) => ({ ...f, style: { ...f.style, [key]: value } }));

  const warnings = useMemo(
    () =>
      colorsValid
        ? buildClubTheme({ primary: form.brandPrimaryColor, secondary: form.brandSecondaryColor })
            .warnings
        : [],
    [form.brandPrimaryColor, form.brandSecondaryColor, colorsValid],
  );

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!colorsValid || form.motto.trim().length > CLUB_MOTTO_MAX) {
      toast("error", errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/org", {
        method: "PATCH",
        body: {
          brandPrimaryColor: form.brandPrimaryColor,
          brandSecondaryColor: form.brandSecondaryColor,
          voice: form.voice,
          motto: form.motto.trim(),
          style: form.style,
        },
        schema: OrganizationUpdateResponseSchema,
      });
      // Primero llega la marca nueva y luego se suelta el borrador: así no parpadea la antigua.
      await refresh();
      toast("success", t("bar.saved"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setForm(saved);
    toast("success", t("bar.discarded"));
  }

  return (
    <form onSubmit={(e) => void save(e)} className="flex flex-col gap-6">
      <Alert kind="info" title={t("intro.title")}>
        {t("intro.body")}
      </Alert>

      <PreviewCard />

      <div className="flex min-w-0 flex-col gap-6">
        <LogoCard />

        {look.clubModel === "fitness" ? (
          <Card title={t("boxLooks.title")} description={t("boxLooks.description")}>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {BOX_LOOKS.map((l) => {
                const current = sameIdentity(form, { ...l.identity, motto: form.motto });
                return (
                  <button
                    key={l.key}
                    type="button"
                    aria-pressed={current}
                    onClick={() => setForm((f) => ({ ...f, ...l.identity }))}
                    className={`flex min-h-16 items-center gap-3 rounded-field border px-3 py-2 text-left transition-colors ${
                      current
                        ? "border-club bg-club-soft text-club-soft-text"
                        : "border-control bg-surface text-ink hover:bg-page"
                    }`}
                  >
                    <Swatch
                      primary={l.identity.brandPrimaryColor}
                      secondary={l.identity.brandSecondaryColor}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{t(`boxLooks.names.${l.key}`)}</span>
                      <span className="text-label text-muted">{t(`boxLooks.hints.${l.key}`)}</span>
                    </span>
                    {current ? (
                      <Icon.CheckCircle size={18} weight="fill" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null}

        <Card title={t("colors.title")} description={t("colors.description")}>
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-secondary font-medium text-ink">
                {t("palettes.title")}
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {PALETTES.map((p) => {
                  const current =
                    form.brandPrimaryColor === p.primary &&
                    form.brandSecondaryColor === p.secondary;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={current}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          brandPrimaryColor: p.primary,
                          brandSecondaryColor: p.secondary,
                        }))
                      }
                      className={`flex min-h-12 items-center gap-2.5 rounded-field border px-3 py-2 text-left text-secondary transition-colors ${
                        current
                          ? "border-club bg-club-soft text-club-soft-text"
                          : "border-control bg-surface text-ink hover:bg-page"
                      }`}
                    >
                      <Swatch primary={p.primary} secondary={p.secondary} />
                      <span className="min-w-0 flex-1">{t(`palettes.names.${p.key}`)}</span>
                      {current ? (
                        <Icon.CheckCircle size={18} weight="fill" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-secondary text-muted">{t("palettes.hint")}</p>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("colors.primary")} hint={t("colors.primaryHint")}>
                {(id, describedBy) => (
                  <ColorInput
                    id={id}
                    value={form.brandPrimaryColor}
                    onChange={(v) => set("brandPrimaryColor", v)}
                    describedBy={describedBy}
                  />
                )}
              </Field>
              <Field label={t("colors.secondary")} hint={t("colors.secondaryHint")}>
                {(id, describedBy) => (
                  <ColorInput
                    id={id}
                    value={form.brandSecondaryColor}
                    onChange={(v) => set("brandSecondaryColor", v)}
                    describedBy={describedBy}
                  />
                )}
              </Field>
            </div>
            {warnings.map((w) => (
              <Alert key={w} kind="warning">
                {w}
              </Alert>
            ))}
          </div>
        </Card>

        <OptionCard
          group="typography"
          value={form.style.typography}
          onChange={(v) => setStyle("typography", v)}
          preview={(o) => (
            <span data-type={o} className="flex flex-col gap-1 text-ink">
              <span className="[font-family:var(--type-display)] text-title1 leading-none [font-weight:var(--type-display-weight)] [letter-spacing:calc(-0.03em*var(--type-tracking))]">
                Aa
              </span>
              <span className="[font-family:var(--type-body)] text-secondary text-muted">
                {t("typography.sample")}
              </span>
            </span>
          )}
        />

        <OptionCard
          group="buttons"
          value={form.style.buttons}
          onChange={(v) => setStyle("buttons", v)}
          preview={(o) => (
            <span data-buttons={o} className="flex">
              <span className={buttonClassName({ size: "sm" })}>{t("buttons.sample")}</span>
            </span>
          )}
        />

        <OptionCard
          group="icons"
          value={form.style.icons}
          onChange={(v) => setStyle("icons", v)}
          preview={(o) => (
            <IconStyleProvider style={o}>
              <span data-icons={o} className="flex flex-wrap items-center gap-1.5 text-club-text">
                <Icon.House size={24} weight="duotone" />
                <Icon.CalendarBlank size={24} weight="duotone" />
                <Icon.Trophy size={24} weight="duotone" />
                <Icon.SportIcons.Balon size={24} />
              </span>
            </IconStyleProvider>
          )}
        />

        <OptionCard
          group="background"
          value={form.style.background}
          onChange={(v) => setStyle("background", v)}
          preview={(o) => (
            <BackgroundSwatch
              background={o}
              primary={form.brandPrimaryColor}
              secondary={form.brandSecondaryColor}
            />
          )}
        />

        <OptionCard
          group="hero"
          value={form.style.hero}
          onChange={(v) => setStyle("hero", v)}
          preview={(o) => (
            <span
              data-hero={o}
              className="relative isolate flex h-16 w-full items-center overflow-hidden rounded-[10px] bg-hero px-3"
            >
              <span className="club-hero-art" />
              <span className="relative size-7 rounded-full bg-hero-crest ring-2 ring-club-second" />
              <span className="absolute inset-x-0 bottom-0 h-1 bg-club-second" />
            </span>
          )}
          note={
            form.style.hero === "escudo" && !branding.logoUrl ? (
              <Alert kind="warning">{t("hero.noLogo")}</Alert>
            ) : null
          }
        />

        <OptionCard
          group="nav"
          value={form.style.nav}
          onChange={(v) => setStyle("nav", v)}
          preview={(o) => (
            <span
              data-nav={o}
              className="flex h-16 w-full overflow-hidden rounded-[10px] border border-border"
            >
              <span className="flex w-2/5 flex-col justify-center gap-1.5 bg-nav px-2">
                <span className="h-1.5 w-3/4 rounded-full bg-nav-muted/50" />
                <span className="h-2.5 rounded-[4px] bg-nav-active" />
                <span className="h-1.5 w-2/3 rounded-full bg-nav-muted/50" />
              </span>
              <span className="flex-1 bg-page" />
            </span>
          )}
        />

        <OptionCard
          group="corners"
          value={form.style.corners}
          onChange={(v) => setStyle("corners", v)}
          preview={(o) => (
            <span
              data-corners={o}
              className="flex h-16 w-full items-center justify-center gap-2 rounded-[10px] bg-page"
            >
              <span className="h-11 w-14 rounded-card border border-border bg-surface" />
              <span className="h-7 w-12 rounded-field border border-control bg-surface" />
            </span>
          )}
        />

        <Card title={t("motto.title")} description={t("motto.description")}>
          <Field
            label={t("motto.label")}
            hint={t("motto.hint", { count: form.motto.trim().length, max: CLUB_MOTTO_MAX })}
          >
            {(id, describedBy) => (
              <Input
                id={id}
                maxLength={CLUB_MOTTO_MAX}
                value={form.motto}
                placeholder={t("motto.example")}
                aria-describedby={describedBy}
                onChange={(e) => set("motto", e.target.value)}
              />
            )}
          </Field>
        </Card>

        <VoiceCard value={form.voice} onChange={(v) => set("voice", v)} />
      </div>

      {dirty ? (
        <div
          role="region"
          aria-label={t("bar.label")}
          className="sticky bottom-24 z-20 flex flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-float sm:flex-row sm:items-center sm:justify-between sm:p-4 lg:bottom-6"
        >
          <p className="flex min-w-0 flex-1 items-center gap-2 text-secondary text-ink">
            <Icon.Eye size={20} weight="duotone" aria-hidden="true" className="shrink-0" />
            <span className="sm:hidden">{t("bar.label")}</span>
            <span className="hidden sm:inline">{t("bar.dirty")}</span>
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={discard} disabled={busy}>
              {t("bar.discard")}
            </Button>
            <Button action="save" type="submit" loading={busy} disabled={!colorsValid}>
              {t("bar.save")}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

/** Dos colores del club en un círculo partido. */
function Swatch({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-7 shrink-0 rounded-full border border-border"
      // Los colores de una paleta son datos, no estilo: van en línea (DESIGN.md, regla 2).
      style={{ background: `linear-gradient(135deg, ${primary} 0 50%, ${secondary} 50% 100%)` }}
    />
  );
}

/** Muestra de un fondo con los colores que se están eligiendo. */
function BackgroundSwatch({
  background,
  primary,
  secondary,
}: {
  background: ClubStyle["background"];
  primary: string;
  secondary: string;
}) {
  const vars = useMemo(
    () =>
      validColor(primary) && validColor(secondary)
        ? buildClubTheme({ primary, secondary, tint: tintFor(background) }).vars
        : {},
    [primary, secondary, background],
  );
  return (
    <span
      data-bg={background}
      style={vars}
      className="flex h-16 w-full items-end overflow-hidden rounded-[10px] border border-border [background:var(--page-background)] p-2"
    >
      <span className="h-7 w-3/4 rounded-[6px] bg-surface shadow-card" />
    </span>
  );
}

/** Un grupo de opciones de la identidad visual: tarjetas con su muestra, de las que se elige una. */
function OptionCard<G extends keyof ClubStyle>({
  group,
  value,
  onChange,
  preview,
  note,
}: {
  group: G;
  value: ClubStyle[G];
  onChange: (value: ClubStyle[G]) => void;
  preview: (option: ClubStyle[G]) => ReactNode;
  note?: ReactNode;
}) {
  const t = useT(`settings.identity.${group}`);
  const name = useId();
  const options = CLUB_STYLE_OPTIONS[group] as unknown as readonly ClubStyle[G][];
  return (
    <Card title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-3">
        <div
          role="radiogroup"
          aria-label={t("title")}
          className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${options.length > 3 ? "lg:grid-cols-5" : ""}`}
        >
          {options.map((option) => (
            <OptionTile
              key={option}
              name={name}
              selected={value === option}
              label={t(`options.${option}.name`)}
              hint={t(`options.${option}.hint`)}
              preview={preview(option)}
              onSelect={() => onChange(option)}
            />
          ))}
        </div>
        {note}
      </div>
    </Card>
  );
}

function OptionTile({
  name,
  selected,
  label,
  hint,
  preview,
  onSelect,
}: {
  name: string;
  selected: boolean;
  label: string;
  hint: string;
  preview: ReactNode;
  onSelect: () => void;
}) {
  const id = useId();
  return (
    <label
      className={`relative flex cursor-pointer flex-col gap-2 rounded-field border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-club-text ${
        selected ? "border-club bg-club-soft" : "border-control bg-surface hover:bg-page"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        // Invisible y sobre toda la tarjeta: se toca en cualquier punto (DESIGN.md, regla 11).
        className="absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-field opacity-0"
      />
      <span aria-hidden="true" className="flex min-h-16 items-center">
        {preview}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="text-body font-medium text-ink">
          {label}
        </span>
        {selected ? (
          <Icon.CheckCircle
            size={20}
            weight="fill"
            aria-hidden="true"
            className="shrink-0 text-club-text"
          />
        ) : null}
      </span>
      <span id={`${id}-hint`} className="text-secondary text-muted">
        {hint}
      </span>
    </label>
  );
}

/** La voz del club, con cómo suena cada una en tres momentos de verdad. */
function VoiceCard({ value, onChange }: { value: ClubVoice; onChange: (v: ClubVoice) => void }) {
  const t = useT("settings.identity.voice");
  const voices = useT("voices");
  const { locale } = useLocale();
  const { me } = useReadyClub();
  const name = useId();
  const firstName = me.user.name.split(" ")[0] ?? me.user.name;
  const samples = useMemo(() => {
    const cache = createIntlCache();
    return Object.fromEntries(
      CLUB_VOICES.map((voice) => {
        const intl = createIntl({ locale, messages: voiceCatalog(locale, voice) }, cache);
        return [
          voice,
          [
            intl.formatMessage({ id: "home.greeting" }, { name: firstName }),
            intl.formatMessage({ id: "attendance.saved" }, { present: 12, total: 14 }),
            intl.formatMessage({ id: "agenda.empty" }),
          ],
        ];
      }),
    ) as Record<ClubVoice, string[]>;
  }, [locale, firstName]);

  return (
    <Card title={t("title")} description={t("description")}>
      <div role="radiogroup" aria-label={t("title")} className="grid gap-3 md:grid-cols-3">
        {CLUB_VOICES.map((voice) => (
          <OptionTile
            key={voice}
            name={name}
            selected={value === voice}
            label={voices(voice)}
            hint={voices(`hint.${voice}`)}
            onSelect={() => onChange(voice)}
            preview={
              <span className="flex w-full flex-col gap-1.5">
                <span className="text-label uppercase tracking-wide text-muted">{t("sample")}</span>
                {samples[voice].map((line) => (
                  <span
                    key={line}
                    className="rounded-chip bg-raised px-2.5 py-1 text-secondary text-ink"
                  >
                    {line}
                  </span>
                ))}
              </span>
            }
          />
        ))}
      </div>
    </Card>
  );
}

/** La portada y un trozo de pantalla con los componentes de verdad: se pintan con el borrador. */
function PreviewCard() {
  const t = useT("settings.identity.preview");
  const home = useT("home");
  const { look, me } = useReadyClub();
  const firstName = me.user.name.split(" ")[0] ?? me.user.name;
  return (
    <Card title={t("title")} description={t("hint")}>
      {/* Es una muestra: se ve, pero no se toca ni se recorre con el teclado. */}
      <div inert className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-stretch">
        <ClubHero
          clubName={look.name}
          crest={<Crest name={look.name} logoUrl={look.logoUrl} size="lg" />}
          subtitle={home("greeting", { name: firstName })}
          motto={look.motto}
          ariaLabel={t("heroLabel")}
          actions={
            <ClubHeroButton action="open" ghost>
              {home("hero.agenda")}
            </ClubHeroButton>
          }
        />
        <div className="flex flex-col gap-3 rounded-card border border-border bg-page p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-title2 text-ink">{t("cardTitle")}</h3>
            <StatusChip kind="club">{t("chip")}</StatusChip>
          </div>
          <p className="flex items-center gap-2 text-secondary text-muted">
            <Icon.CalendarBlank size={20} weight="duotone" aria-hidden="true" />
            {home("today.empty")}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className={buttonClassName({ size: "sm" })}>{t("primary")}</span>
            <span className={buttonClassName({ variant: "secondary", size: "sm" })}>
              {t("secondary")}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LogoCard() {
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
    <Card
      title={t("title")}
      description={t("hint", { mb: LOGO_MAX_BYTES / 1_000_000 })}
      actions={
        branding.logoUrl ? (
          <Button
            type="button"
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <div className="flex shrink-0 items-center gap-4 sm:w-44 sm:flex-col sm:justify-center">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={t("alt")}
              className="size-24 rounded-full object-cover ring-2 ring-club-second"
            />
          ) : (
            <>
              <Crest name={branding.name} size="lg" />
              <p className="text-secondary text-muted sm:text-center">{t("none")}</p>
            </>
          )}
        </div>
        <label
          className={`flex min-h-36 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-field border-2 border-dashed p-6 text-center transition-colors ${
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
      </div>
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
    </Card>
  );
}

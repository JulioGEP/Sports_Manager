import { DEFAULT_CLUB_STYLE, DEFAULT_CLUB_VOICE } from "@sportsmanager/shared";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { CommandPalette, PaletteButton, usePaletteShortcut } from "@/components/command-palette";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ViewAsBanner, ViewAsSheet } from "@/components/view-as";
import { ClubProvider, clubPaths, useClub, type ClubState } from "@/lib/club";
import { useT, VoiceProvider } from "@/lib/intl";
import { useMediaQuery } from "@/lib/media";
import { useSignOut } from "@/lib/session";
import { DESKTOP_QUERY, setShape } from "@/lib/theme";
import {
  Alert,
  Avatar,
  ButtonLink,
  Crest,
  Icon,
  IconStyleProvider,
  Menu,
  MenuDivider,
  MenuItem,
  MenuSection,
  Sheet,
} from "@/ui";

/** Espacio de un club (ADR 0027): `/<slug>/...`. Móvil envolvente con barra inferior; escritorio preciso con navegación lateral. */
export function ClubShell() {
  return (
    <ClubProvider>
      <ClubLook>
        <ClubFrame>
          <Outlet />
        </ClubFrame>
      </ClubLook>
    </ClubProvider>
  );
}

/**
 * Identidad del club (ADR 0043) para todo lo que hay dentro: su voz en los textos y el peso de los
 * iconos. Los colores, la letra, los botones y el resto los pinta `applyClubLook` en la raíz.
 */
function ClubLook({ children }: { children: ReactNode }) {
  const { look } = useClub();
  return (
    <VoiceProvider voice={look?.voice ?? DEFAULT_CLUB_VOICE}>
      <IconStyleProvider style={look?.style.icons ?? DEFAULT_CLUB_STYLE.icons}>
        {children}
      </IconStyleProvider>
    </VoiceProvider>
  );
}

/** Escudo en la navegación: con aro cuando la barra va en el color del club, para que no se funda. */
function NavCrest({ name, logoUrl }: { name: string; logoUrl: string | null | undefined }) {
  return (
    <span className="inline-flex shrink-0 rounded-full ring-2 ring-nav-crest-ring">
      <Crest name={name} logoUrl={logoUrl} />
    </span>
  );
}

function ClubFrame({ children }: { children: ReactNode }) {
  const t = useT("nav");
  const { slug, state, look } = useClub();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const navigate = useNavigate();
  const location = useLocation();
  const signOut = useSignOut();
  const paths = clubPaths(slug);

  useEffect(() => {
    setShape(desktop ? "precisa" : "envolvente");
  }, [desktop]);

  useEffect(() => {
    if (state.kind === "anonymous") {
      const next = `${location.pathname}${location.search}`;
      void navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    }
  }, [state.kind, navigate, location.pathname, location.search]);

  // La marca con el borrador de los ajustes encima (vista previa en directo, ADR 0043).
  const branding = "branding" in state ? look : null;
  const me = state.kind === "ready" || state.kind === "no_membership" ? state.me : null;
  const permissions = state.kind === "ready" ? state.org.actor.permissions : [];
  const memberships =
    state.kind === "ready" || state.kind === "no_membership" ? state.memberships : [];
  const clubName = branding?.name ?? "";

  const canViewAs =
    state.kind === "ready" && state.org.actor.kind === "member" && state.org.actor.canViewAs;
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** Paleta de mandos (DESIGN.md 9.17): ⌘K desde cualquier pantalla. */
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);
  usePaletteShortcut(togglePalette);

  /**
   * Navegación del club (Bloque 14): la sección es la unidad de gestión. En escritorio, barra lateral
   * con tres grupos; en móvil, cinco destinos y el resto en "Más" (DESIGN.md 9.10).
   */
  type NavLinkItem = { to: string; label: string; icon: typeof Icon.House; end: boolean };
  const has = (p: string) => permissions.includes(p as (typeof permissions)[number]);
  const actor =
    state.kind === "ready" && state.org.actor.kind === "member" ? state.org.actor : null;
  /** Su propia ficha de deportista (ADR 0039 y 0046): su plan, su bienestar y su RPE. */
  const athletePlayerId = actor?.athletePlayerId ?? null;
  /** El deportista sin nadie a su cargo no tiene "familia": tiene su ficha. */
  const athleteOnly =
    actor !== null && actor.roles.includes("athlete") && !actor.roles.includes("guardian");
  const groups: { key: string; label: string | null; links: NavLinkItem[] }[] = [
    {
      key: "home",
      label: null,
      links:
        state.kind === "ready"
          ? [{ to: paths.home, label: t("home"), icon: Icon.House, end: true }]
          : [],
    },
    {
      key: "club",
      label: t("groupClub"),
      links: [
        has("org.structure.read")
          ? { to: paths.sections, label: t("sections"), icon: Icon.SquaresFour, end: false }
          : null,
        has("org.players.read")
          ? { to: paths.players, label: t("players"), icon: Icon.PersonSimpleRun, end: false }
          : null,
        has("org.family.read")
          ? athleteOnly && athletePlayerId
            ? {
                to: paths.familyPlayer(athletePlayerId),
                label: t("myProfile"),
                icon: Icon.UserCircle,
                end: false,
              }
            : { to: paths.family, label: t("family"), icon: Icon.HandHeart, end: false }
          : null,
        has("org.club_members.read")
          ? {
              to: paths.clubMembers,
              label: t("clubMembers"),
              icon: Icon.IdentificationCard,
              end: false,
            }
          : null,
        has("org.members.read")
          ? { to: paths.staff, label: t("staff"), icon: Icon.Users, end: false }
          : null,
      ].filter((l): l is NavLinkItem => l !== null),
    },
    {
      key: "activity",
      label: t("groupActivity"),
      links: [
        // El deportista con cuenta (ADR 0046): lo que entrena y cómo llega, lo primero del día.
        athletePlayerId
          ? {
              to: paths.athleteTraining,
              label: t("athleteTraining"),
              icon: Icon.Barbell,
              end: false,
            }
          : null,
        athletePlayerId
          ? { to: paths.athlete, label: t("athlete"), icon: Icon.Heartbeat, end: true }
          : null,
        has("org.events.read") || has("org.family.read")
          ? { to: paths.agenda, label: t("agenda"), icon: Icon.CalendarBlank, end: false }
          : null,
        has("org.facilities.read")
          ? { to: paths.facilities, label: t("facilities"), icon: Icon.Buildings, end: false }
          : null,
        // Entrenamiento (ADR 0039): una sola entrada; la biblioteca, la carga y la enfermería
        // cuelgan de su portada.
        has("org.training.read")
          ? { to: paths.training, label: t("training"), icon: Icon.SportIcons.Silbato, end: false }
          : null,
        // El reto no va en la barra (ADR 0032): vive en la ficha de cada equipo y de cada sección,
        // y para la familia en la ficha de cada uno de los suyos.
      ].filter((l): l is NavLinkItem => l !== null),
    },
    {
      key: "management",
      label: t("groupManagement"),
      links: [
        has("org.fees.read") || has("org.family.read")
          ? {
              to: paths.fees,
              label: has("org.fees.read") ? t("fees") : t("myFees"),
              icon: Icon.Coins,
              end: false,
            }
          : null,
        // Tienda (ADR 0041): la gestiona quien tiene el área; la ve quien puede comprar (la
        // familia de un menor o el deportista adulto) cuando el club vende algo.
        has("org.store.read") || actor?.canShop
          ? { to: paths.store, label: t("store"), icon: Icon.Storefront, end: false }
          : null,
        has("org.settings.write")
          ? { to: paths.settings, label: t("settings"), icon: Icon.SlidersHorizontal, end: false }
          : null,
      ].filter((l): l is NavLinkItem => l !== null),
    },
  ].filter((g) => g.links.length > 0);
  const links = groups.flatMap((g) => g.links);
  /** La barra inferior admite cinco destinos (DESIGN.md 9.10): los cuatro primeros y "Más". */
  const mobileLinks = links.length > 5 ? links.slice(0, 4) : links;
  const moreLinks = links.length > 5 ? links.slice(4) : [];
  const palette =
    state.kind === "ready" ? (
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        links={links.map((l) => ({ to: l.to, label: l.label }))}
      />
    ) : null;

  async function onSignOut() {
    await signOut();
    void navigate("/login", { replace: true });
  }

  const userMenu = me ? (
    <Menu
      label={t("userMenu")}
      triggerClassName="text-nav-ink hover:bg-nav-hover"
      trigger={
        <>
          <Avatar name={me.user.name} size="sm" />
          <Icon.CaretDown size={16} aria-hidden="true" />
        </>
      }
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <Avatar name={me.user.name} />
        <div className="flex min-w-0 flex-col">
          <strong className="truncate text-body text-ink">{me.user.name}</strong>
          <span className="truncate text-secondary text-muted">{me.user.email}</span>
        </div>
      </div>
      <MenuDivider />
      {memberships.length > 1 ? (
        <MenuItem to="/clubs" icon={<Icon.SquaresFour size={20} aria-hidden="true" />}>
          {t("myClubs")}
        </MenuItem>
      ) : null}
      {canViewAs ? (
        <MenuItem
          icon={<Icon.Eye size={20} aria-hidden="true" />}
          onClick={() => setViewAsOpen(true)}
        >
          {t("viewAs")}
        </MenuItem>
      ) : null}
      {me.platformAdmin ? (
        <MenuItem to="/admin" icon={<Icon.ShieldCheck size={20} aria-hidden="true" />}>
          {t("platformAdmin")}
        </MenuItem>
      ) : null}
      <MenuSection>{t("language")}</MenuSection>
      <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
        <LanguageSwitcher hasSession compact />
      </div>
      <MenuDivider />
      <MenuItem
        icon={<Icon.SignOut size={20} aria-hidden="true" />}
        onClick={() => void onSignOut()}
      >
        {t("signOut")}
      </MenuItem>
    </Menu>
  ) : null;

  if (desktop) {
    return (
      <div className="grid min-h-screen grid-cols-[264px_minmax(0,1fr)]">
        <aside className="sticky top-0 flex h-screen flex-col gap-6 border-r border-nav-edge bg-nav px-4 py-5">
          <Link
            to={paths.home}
            className="flex items-center gap-3 no-underline"
            aria-label={clubName}
          >
            <NavCrest name={clubName || "SM"} logoUrl={branding?.logoUrl} />
            <span className="truncate text-body font-semibold text-nav-ink">{clubName}</span>
          </Link>
          {state.kind === "ready" ? <PaletteButton onClick={togglePalette} /> : null}
          <nav className="flex flex-col gap-4 overflow-y-auto" aria-label={t("mainNav")}>
            {groups.map((g) => (
              <div key={g.key} className="flex flex-col gap-1">
                {g.label ? (
                  <span className="px-3 pt-1 pb-1 text-label uppercase tracking-wide text-nav-muted">
                    {g.label}
                  </span>
                ) : null}
                {g.links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) =>
                      `flex h-(--h-control) items-center gap-3 rounded-control px-3 text-body font-medium no-underline transition-colors ${
                        isActive
                          ? "bg-nav-active text-nav-active-ink"
                          : "text-nav-muted hover:bg-nav-hover hover:text-nav-ink"
                      }`
                    }
                  >
                    <l.icon size={22} weight="duotone" aria-hidden="true" />
                    {l.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="mt-auto">{userMenu}</div>
        </aside>
        <main className="px-8 py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            {state.kind === "ready" ? <ViewAsBanner /> : null}
            <ClubBody state={state}>{children}</ClubBody>
          </div>
        </main>
        {state.kind === "ready" && canViewAs ? (
          <ViewAsSheet open={viewAsOpen} onClose={() => setViewAsOpen(false)} />
        ) : null}
        {palette}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-nav-line bg-nav px-5">
        <Link
          to={paths.home}
          className="flex min-w-0 items-center gap-3 no-underline"
          aria-label={clubName}
        >
          <NavCrest name={clubName || "SM"} logoUrl={branding?.logoUrl} />
          <span className="truncate text-body font-semibold text-nav-ink">{clubName}</span>
        </Link>
        <div className="flex items-center gap-1">
          {state.kind === "ready" ? <PaletteButton compact onClick={togglePalette} /> : null}
          {userMenu}
        </div>
      </header>
      <main className="flex-1 px-5 py-5 pb-28">
        <div className="flex flex-col gap-5">
          {state.kind === "ready" ? <ViewAsBanner /> : null}
          <ClubBody state={state}>{children}</ClubBody>
        </div>
      </main>
      {mobileLinks.length > 1 ? (
        <nav
          aria-label={t("mainNav")}
          className="fixed inset-x-4 bottom-4 z-30 grid h-16 grid-flow-col auto-cols-fr items-center rounded-tabbar bg-nav px-2 shadow-float"
        >
          {mobileLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex h-full flex-col items-center justify-center gap-0.5 rounded-control text-label no-underline ${
                  isActive ? "text-nav-accent" : "text-nav-muted"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-7 w-12 place-items-center rounded-chip ${isActive ? "bg-nav-active text-nav-active-ink" : ""}`}
                  >
                    <l.icon size={22} weight="duotone" aria-hidden="true" />
                  </span>
                  {l.label}
                </>
              )}
            </NavLink>
          ))}
          {moreLinks.length > 0 ? (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={`flex h-full flex-col items-center justify-center gap-0.5 rounded-control text-label ${
                moreLinks.some((l) => location.pathname.startsWith(l.to))
                  ? "text-nav-accent"
                  : "text-nav-muted"
              }`}
            >
              <span className="grid h-7 w-12 place-items-center rounded-chip">
                <Icon.DotsThree size={22} weight="duotone" aria-hidden="true" />
              </span>
              {t("more")}
            </button>
          ) : null}
        </nav>
      ) : null}
      {palette}
      {moreLinks.length > 0 ? (
        <Sheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          closeLabel={t("close")}
          title={t("more")}
        >
          <ul className="flex flex-col gap-1">
            {moreLinks.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.end}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-12 items-center gap-3 rounded-field px-3 text-body font-medium no-underline ${
                      isActive ? "bg-club-soft text-club-soft-text" : "text-ink hover:bg-raised"
                    }`
                  }
                >
                  <l.icon size={22} weight="duotone" aria-hidden="true" />
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}
      {state.kind === "ready" && canViewAs ? (
        <ViewAsSheet open={viewAsOpen} onClose={() => setViewAsOpen(false)} />
      ) : null}
    </div>
  );
}

function ClubBody({ state, children }: { state: ClubState; children: ReactNode }) {
  const t = useT("nav");
  if (state.kind === "loading" || state.kind === "anonymous") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-32 animate-pulse rounded-card bg-raised" />
        <div className="h-32 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  if (state.kind === "error") return <Alert kind="error">{t("apiError")}</Alert>;
  if (state.kind === "not_found") return <Alert kind="error">{t("clubNotFound")}</Alert>;
  if (state.kind === "no_membership") {
    return (
      <Alert
        kind="warning"
        title={t("noMembershipTitle")}
        actions={
          state.memberships.length > 0 ? (
            <ButtonLink action="open" to="/clubs" variant="secondary" size="sm">
              {t("myClubs")}
            </ButtonLink>
          ) : null
        }
      >
        {t("noMembershipBody", { email: state.me.user.email })}
      </Alert>
    );
  }
  return (
    <>
      {state.org.actor.kind === "platform_support" ? (
        <Alert kind="info">
          {state.org.actor.hasGrant ? t("supportFull") : t("supportLimited")}
        </Alert>
      ) : null}
      {children}
    </>
  );
}

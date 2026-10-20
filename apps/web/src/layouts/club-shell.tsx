import { useEffect, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ClubProvider, clubPaths, useClub, type ClubState } from "@/lib/club";
import { useT } from "@/lib/intl";
import { useMediaQuery } from "@/lib/media";
import { useSignOut } from "@/lib/session";
import { DESKTOP_QUERY, setShape } from "@/lib/theme";
import {
  Alert,
  Avatar,
  ButtonLink,
  Crest,
  Icon,
  Menu,
  MenuDivider,
  MenuItem,
  MenuSection,
} from "@/ui";

/** Espacio de un club (ADR 0027): `/<slug>/...`. Móvil envolvente con barra inferior; escritorio preciso con navegación lateral. */
export function ClubShell() {
  return (
    <ClubProvider>
      <ClubFrame>
        <Outlet />
      </ClubFrame>
    </ClubProvider>
  );
}

function ClubFrame({ children }: { children: ReactNode }) {
  const t = useT("nav");
  const { slug, state } = useClub();
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

  const branding = "branding" in state ? state.branding : null;
  const me = state.kind === "ready" || state.kind === "no_membership" ? state.me : null;
  const permissions = state.kind === "ready" ? state.org.actor.permissions : [];
  const memberships =
    state.kind === "ready" || state.kind === "no_membership" ? state.memberships : [];
  const clubName = branding?.name ?? "";

  const links = [
    { to: paths.home, label: t("home"), icon: Icon.House, show: state.kind === "ready", end: true },
    {
      to: paths.members,
      label: t("members"),
      icon: Icon.Users,
      show: permissions.includes("org.members.read"),
      end: false,
    },
    {
      to: paths.settings,
      label: t("settings"),
      icon: Icon.Gear,
      show: permissions.includes("org.settings.write"),
      end: false,
    },
  ].filter((l) => l.show);

  async function onSignOut() {
    await signOut();
    void navigate("/login", { replace: true });
  }

  const userMenu = me ? (
    <Menu
      label={t("userMenu")}
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
        <aside className="sticky top-0 flex h-screen flex-col gap-6 border-r border-border bg-surface px-4 py-5">
          <Link
            to={paths.home}
            className="flex items-center gap-3 no-underline"
            aria-label={clubName}
          >
            <Crest name={clubName || "SM"} logoUrl={branding?.logoUrl} />
            <span className="truncate text-body font-semibold text-ink">{clubName}</span>
          </Link>
          <nav className="flex flex-col gap-1" aria-label={t("mainNav")}>
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `flex h-(--h-control) items-center gap-3 rounded-control px-3 text-body font-medium no-underline transition-colors ${
                    isActive
                      ? "bg-club-soft text-club-soft-text"
                      : "text-muted hover:bg-raised hover:text-ink"
                  }`
                }
              >
                <l.icon size={22} weight="duotone" aria-hidden="true" />
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto">{userMenu}</div>
        </aside>
        <main className="px-8 py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <ClubBody state={state}>{children}</ClubBody>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface px-5">
        <Link
          to={paths.home}
          className="flex min-w-0 items-center gap-3 no-underline"
          aria-label={clubName}
        >
          <Crest name={clubName || "SM"} logoUrl={branding?.logoUrl} />
          <span className="truncate text-body font-semibold text-ink">{clubName}</span>
        </Link>
        {userMenu}
      </header>
      <main className="flex-1 px-5 py-5 pb-28">
        <div className="flex flex-col gap-5">
          <ClubBody state={state}>{children}</ClubBody>
        </div>
      </main>
      {links.length > 1 ? (
        <nav
          aria-label={t("mainNav")}
          className="fixed inset-x-4 bottom-4 z-30 grid h-16 grid-flow-col auto-cols-fr items-center rounded-tabbar bg-surface px-2 shadow-float"
        >
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex h-full flex-col items-center justify-center gap-0.5 rounded-control text-label no-underline ${
                  isActive ? "text-club-text" : "text-muted"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-7 w-12 place-items-center rounded-chip ${isActive ? "bg-club-soft" : ""}`}
                  >
                    <l.icon size={22} weight="duotone" aria-hidden="true" />
                  </span>
                  {l.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
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
            <ButtonLink to="/clubs" variant="secondary" size="sm">
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

import { useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/intl";
import { useRequiredSession, useSignOut } from "@/lib/session";
import { applyProductColors, setShape } from "@/lib/theme";
import { Alert, Avatar, Button, ButtonLink, Icon } from "@/ui";

/** Panel del negocio (ADR 0022 y 0026): forma Precisa, marca del producto, nunca la de un club. */
export function PlatformShell() {
  const t = useT("platform.nav");
  const session = useRequiredSession("/admin/login");
  const navigate = useNavigate();
  const signOut = useSignOut();

  useEffect(() => {
    setShape("precisa");
    applyProductColors();
    document.title = `Sports Manager · ${t("subtitle")}`;
  }, [t]);

  async function onSignOut() {
    await signOut();
    void navigate("/admin/login", { replace: true });
  }

  if (session.kind === "loading" || session.kind === "anonymous") {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div
          className="h-32 w-full max-w-md animate-pulse rounded-card bg-raised"
          aria-busy="true"
        />
      </div>
    );
  }
  if (session.kind === "error") {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <Alert kind="error">{t("apiError")}</Alert>
      </div>
    );
  }
  if (!session.me.platformAdmin) {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="w-full max-w-md">
          <Alert
            kind="warning"
            title={t("forbiddenTitle")}
            actions={
              <>
                <Button action="signOut" size="sm" onClick={() => void onSignOut()}>
                  {t("switchAccount")}
                </Button>
                <ButtonLink action="back" to="/" variant="secondary" size="sm">
                  {t("backToApp")}
                </ButtonLink>
              </>
            }
          >
            {t("forbiddenBody", { email: session.me.user.email })}
          </Alert>
        </div>
      </div>
    );
  }

  const links = [
    {
      to: "/admin",
      label: t("clubs"),
      icon: Icon.Buildings,
      end: false,
      match: /^\/admin(\/clubs)?(\/[^/]+)?$/,
    },
    { to: "/admin/audit", label: t("audit"), icon: Icon.Pulse, end: false },
    { to: "/admin/system", label: t("system"), icon: Icon.Info, end: false },
  ];

  const nav = (
    <nav className="flex gap-1 lg:flex-col" aria-label={t("mainNav")}>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === "/admin"}
          className={({ isActive }) => {
            const active = isActive || (l.match ? l.match.test(window.location.pathname) : false);
            return `flex h-(--h-control) items-center gap-3 rounded-control px-3 text-body font-medium no-underline transition-colors ${
              active
                ? "bg-club-soft text-club-soft-text"
                : "text-muted hover:bg-raised hover:text-ink"
            }`;
          }}
        >
          <l.icon size={22} weight="duotone" aria-hidden="true" />
          {l.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 border-b border-border bg-surface px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:gap-6 lg:border-r lg:border-b-0 lg:py-5">
        <Link to="/admin" className="flex items-center gap-3 no-underline">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand font-semibold text-white"
          >
            SM
          </span>
          <span className="flex min-w-0 flex-col">
            <strong className="truncate text-body text-ink">Sports Manager</strong>
            <span className="truncate text-label text-muted">{t("subtitle")}</span>
          </span>
        </Link>
        {nav}
        <div className="flex flex-wrap items-center gap-3 lg:mt-auto lg:flex-col lg:items-stretch">
          <div className="hidden items-center gap-3 lg:flex">
            <Avatar name={session.me.user.name} size="sm" />
            <span className="flex min-w-0 flex-col">
              <strong className="truncate text-secondary text-ink">{session.me.user.name}</strong>
              <span className="truncate text-label text-muted">{session.me.user.email}</span>
            </span>
          </div>
          <LanguageSwitcher hasSession compact />
          <ButtonLink action="back" to="/" variant="tertiary" size="sm">
            {t("backToApp")}
          </ButtonLink>
          <Button action="signOut" variant="tertiary" size="sm" onClick={() => void onSignOut()}>
            {t("signOut")}
          </Button>
        </div>
      </aside>
      <main className="px-5 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

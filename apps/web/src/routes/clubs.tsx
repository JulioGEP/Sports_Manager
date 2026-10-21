import { MyMembershipsResponseSchema } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { LanguageSwitcher } from "@/components/language-switcher";
import { apiFetch, errorKey } from "@/lib/api";
import { useT } from "@/lib/intl";
import { useRequiredSession, useSignOut } from "@/lib/session";
import { applyProductColors, setShape } from "@/lib/theme";
import { Alert, Button, ButtonLink, Crest, StatusChip } from "@/ui";

/** Selector de club: con uno solo va directo; con varios, tarjetas con el escudo y el color de cada club. */
export function ClubsPage() {
  const t = useT("clubs");
  const roles = useT("roles");
  const errors = useT("errors");
  const session = useRequiredSession();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const memberships = useQuery({
    queryKey: ["memberships"],
    queryFn: () =>
      apiFetch("/api/me/memberships", { schema: MyMembershipsResponseSchema, club: null }),
    enabled: session.kind === "authenticated",
  });

  useEffect(() => {
    applyProductColors();
    setShape("envolvente");
  }, []);

  useEffect(() => {
    const list = memberships.data?.memberships;
    if (list && list.length === 1 && list[0])
      void navigate(`/${list[0].organization.slug}`, { replace: true });
  }, [memberships.data, navigate]);

  async function onSignOut() {
    await signOut();
    void navigate("/login", { replace: true });
  }

  const list = memberships.data?.memberships ?? [];
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title1 lg:text-title1-lg text-ink">{t("title")}</h1>
          {session.kind === "authenticated" ? (
            <p className="text-body text-muted">
              {t("subtitle", { email: session.me.user.email })}
            </p>
          ) : null}
        </div>
        <Button action="signOut" variant="tertiary" size="sm" onClick={() => void onSignOut()}>
          {t("signOut")}
        </Button>
      </header>
      {memberships.isError ? (
        <Alert kind="error">{errors(errorKey(memberships.error))}</Alert>
      ) : null}
      {memberships.data && list.length === 0 ? <Alert kind="info">{t("none")}</Alert> : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {list.map((m) => (
          <li
            key={m.organization.slug}
            className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card precisa:border precisa:border-border"
          >
            <div className="flex items-center gap-3">
              <span
                className="grid size-12 shrink-0 place-items-center rounded-full font-semibold text-white"
                style={{ background: m.organization.brandPrimaryColor }}
              >
                <Crest name={m.organization.name} logoUrl={m.organization.logoUrl} size="md" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <strong className="truncate text-body text-ink">{m.organization.name}</strong>
                <div className="flex flex-wrap gap-1">
                  {m.roles.map((r) => (
                    <StatusChip key={r} kind="neutral">
                      {roles(r)}
                    </StatusChip>
                  ))}
                  {m.organization.status !== "active" ? (
                    <StatusChip kind="warning">{t("inactive")}</StatusChip>
                  ) : null}
                </div>
              </div>
            </div>
            <ButtonLink action="open" to={`/${m.organization.slug}`}>
              {t("open")}
            </ButtonLink>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-secondary whitespace-nowrap text-club-text">
          Sports Manager
        </Link>
        <LanguageSwitcher hasSession compact />
      </div>
    </div>
  );
}

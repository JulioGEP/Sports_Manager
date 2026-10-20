"use client";

import { MyMembershipsResponseSchema, type MyMembershipsResponse } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBranding } from "@/components/branding-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { apiFetch, errorKey } from "@/lib/api";
import { signOut, useRequiredSession } from "@/lib/session";
import { Alert, Badge, Button, ButtonLink, Icon, initials } from "@/ui";

type Membership = MyMembershipsResponse["memberships"][number];

function isCurrentHost(url: string): boolean {
  try {
    return new URL(url).host === window.location.host;
  } catch {
    return false;
  }
}

/** Selector de club (Bloque 5). Con un solo club, va directo; con varios, tarjetas con su marca. */
export default function ClubsPage() {
  const t = useTranslations("clubs");
  const roles = useTranslations("roles");
  const errors = useTranslations("errors");
  const router = useRouter();
  const session = useRequiredSession();
  const branding = useBranding();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.kind !== "authenticated") return;
    apiFetch("/api/me/memberships", { schema: MyMembershipsResponseSchema })
      .then((res) => {
        if (res.memberships.length === 1) {
          const only = res.memberships[0]!;
          if (isCurrentHost(only.organization.url)) router.replace("/");
          else window.location.assign(only.organization.url);
          return;
        }
        setMemberships(res.memberships);
      })
      .catch((err: unknown) => setError(errors(errorKey(err))));
  }, [session.kind, router, errors]);

  async function onSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="auth">
      <div className="auth__box" style={{ width: "min(900px, 100%)" }}>
        <div className="row row--between">
          <div>
            <h1>{t("title")}</h1>
            {session.kind === "authenticated" ? (
              <p className="muted">{t("subtitle", { email: session.me.user.email })}</p>
            ) : null}
          </div>
          <div className="row">
            {branding ? (
              <ButtonLink
                href="/"
                variant="secondary"
                size="sm"
                icon={<Icon.ArrowLeft size={16} />}
              >
                {t("backToClub", { club: branding.name })}
              </ButtonLink>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon.Logout size={16} />}
              onClick={() => void onSignOut()}
            >
              {t("signOut")}
            </Button>
          </div>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
        {memberships?.length === 0 ? <Alert kind="info">{t("none")}</Alert> : null}
        <div className="club-grid">
          {memberships?.map((m) => (
            <article key={m.organization.slug} className="club-card">
              <div className="club-card__head">
                <span
                  className="club-card__swatch"
                  style={{ background: m.organization.brandPrimaryColor }}
                >
                  {m.organization.logoUrl ? (
                    <img src={m.organization.logoUrl} alt="" />
                  ) : (
                    <span className="brand-mark" style={{ background: "transparent" }}>
                      {initials(m.organization.name)}
                    </span>
                  )}
                </span>
                <div>
                  <strong>{m.organization.name}</strong>
                  <div className="cell-badges">
                    {m.roles.map((r) => (
                      <Badge key={r} tone="neutral">
                        {roles(r)}
                      </Badge>
                    ))}
                    {m.organization.status !== "active" ? (
                      <Badge tone="warning">{t("inactive")}</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              <ButtonLink
                href={m.organization.url}
                external
                variant={isCurrentHost(m.organization.url) ? "secondary" : "primary"}
              >
                {isCurrentHost(m.organization.url) ? t("current") : t("open")}
              </ButtonLink>
            </article>
          ))}
        </div>
        <div className="auth__footer">
          <LanguageSwitcher hasSession />
        </div>
      </div>
    </div>
  );
}

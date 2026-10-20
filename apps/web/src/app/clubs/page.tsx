"use client";

import { MyMembershipsResponseSchema, type MyMembershipsResponse } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/alert";
import { useBranding } from "@/components/branding-provider";
import { apiFetch, errorKey } from "@/lib/api";
import { signOut, useRequiredSession } from "@/lib/session";

type Membership = MyMembershipsResponse["memberships"][number];

function isCurrentHost(url: string): boolean {
  try {
    return new URL(url).host === window.location.host;
  } catch {
    return false;
  }
}

/** Selector de club (Bloque 5). Con un solo club, va directo; con varios, lista con su marca. */
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

  if (session.kind !== "authenticated") return <main className="page">{t("loading")}</main>;

  return (
    <main className="page page--wide">
      <header className="topbar">
        <strong>{t("title")}</strong>
        <nav className="row">
          {branding ? <Link href="/">{t("backToClub", { club: branding.name })}</Link> : null}
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void onSignOut()}
          >
            {t("signOut")}
          </button>
        </nav>
      </header>
      <section className="card">
        <p className="muted">{t("subtitle", { email: session.me.user.email })}</p>
        {error ? <Alert kind="error">{error}</Alert> : null}
        {memberships === null && !error ? <p className="muted">{t("loading")}</p> : null}
        {memberships?.length === 0 ? <Alert kind="info">{t("none")}</Alert> : null}
        <ul className="list">
          {memberships?.map((m) => (
            <li key={m.organization.slug} className="list__item">
              <div className="brand">
                <span
                  className="brand__swatch"
                  style={{ background: m.organization.brandPrimaryColor }}
                  aria-hidden="true"
                >
                  {m.organization.logoUrl ? (
                    <img src={m.organization.logoUrl} alt="" className="brand__logo" />
                  ) : null}
                </span>
                <div>
                  <strong>{m.organization.name}</strong>
                  <div className="muted">
                    {m.roles.map((r) => roles(r)).join(" · ")}
                    {m.organization.status !== "active" ? ` · ${t("inactive")}` : ""}
                  </div>
                </div>
              </div>
              <a className="button" href={m.organization.url}>
                {isCurrentHost(m.organization.url) ? t("current") : t("open")}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

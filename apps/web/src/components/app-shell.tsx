"use client";

import {
  MyMembershipsResponseSchema,
  OrganizationResponseSchema,
  type OrganizationResponse,
} from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { signOut, useRequiredSession } from "@/lib/session";
import { useBranding } from "./branding-provider";

export type OrgState =
  | { kind: "loading" }
  | { kind: "ready"; org: OrganizationResponse }
  | { kind: "forbidden" }
  | { kind: "error" };

/** Cabecera común de las páginas con sesión: marca del club del host, persona, navegación y salir. */
export function AppShell({
  children,
}: {
  children: (ctx: {
    org: OrganizationResponse;
    userName: string;
    platformAdmin: boolean;
  }) => ReactNode;
}) {
  const t = useTranslations("shell");
  const router = useRouter();
  const session = useRequiredSession();
  const branding = useBranding();
  const [orgState, setOrgState] = useState<OrgState>({ kind: "loading" });
  const [clubCount, setClubCount] = useState(0);

  useEffect(() => {
    if (session.kind !== "authenticated") return;
    let cancelled = false;
    apiFetch("/api/org", { schema: OrganizationResponseSchema })
      .then((org) => {
        if (!cancelled) setOrgState({ kind: "ready", org });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = (error as { status?: number }).status;
        setOrgState({ kind: status === 403 ? "forbidden" : "error" });
      });
    apiFetch("/api/me/memberships", { schema: MyMembershipsResponseSchema })
      .then((res) => {
        if (!cancelled) setClubCount(res.memberships.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.kind]);

  async function onSignOut() {
    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  }

  if (session.kind === "loading" || session.kind === "anonymous") {
    return <p className="muted page page--wide">{t("loading")}</p>;
  }
  if (session.kind === "error") {
    return <p className="alert alert--error page page--wide">{t("apiError")}</p>;
  }

  const permissions = orgState.kind === "ready" ? orgState.org.actor.permissions : [];
  const canSeeMembers =
    permissions.includes("org.members.read") || permissions.includes("org.members.invite");
  const canEditSettings = permissions.includes("org.settings.write");
  const clubName =
    branding?.name ?? (orgState.kind === "ready" ? orgState.org.organization.name : t("appName"));

  return (
    <div className="page page--wide">
      <header className="topbar">
        <div className="brand">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="brand__logo brand__logo--header" />
          ) : null}
          <div>
            <strong>{clubName}</strong>
            <span className="muted"> · {session.me.user.name}</span>
          </div>
        </div>
        <nav className="row">
          <Link href="/">{t("home")}</Link>
          {canSeeMembers ? <Link href="/members">{t("members")}</Link> : null}
          {canEditSettings ? <Link href="/settings">{t("settings")}</Link> : null}
          {clubCount > 1 ? <Link href="/clubs">{t("clubs")}</Link> : null}
          {session.me.platformAdmin ? <Link href="/admin">{t("admin")}</Link> : null}
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void onSignOut()}
          >
            {t("signOut")}
          </button>
        </nav>
      </header>
      {orgState.kind === "loading" ? <p className="muted">{t("loading")}</p> : null}
      {orgState.kind === "forbidden" ? (
        <section className="card">
          <h1>{t("noMembershipTitle")}</h1>
          <p className="muted">{t("noMembershipBody", { email: session.me.user.email })}</p>
        </section>
      ) : null}
      {orgState.kind === "error" ? <p className="alert alert--error">{t("apiError")}</p> : null}
      {orgState.kind === "ready"
        ? children({
            org: orgState.org,
            userName: session.me.user.name,
            platformAdmin: session.me.platformAdmin,
          })
        : null}
    </div>
  );
}

"use client";

import { OrganizationResponseSchema, type OrganizationResponse } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { signOut, useRequiredSession } from "@/lib/session";

export type OrgState =
  | { kind: "loading" }
  | { kind: "ready"; org: OrganizationResponse }
  | { kind: "forbidden" }
  | { kind: "error" };

/** Cabecera común de las páginas con sesión: club del host, persona, navegación y salir. */
export function AppShell({
  children,
}: {
  children: (ctx: { org: OrganizationResponse; userName: string }) => ReactNode;
}) {
  const t = useTranslations("shell");
  const router = useRouter();
  const session = useRequiredSession();
  const [orgState, setOrgState] = useState<OrgState>({ kind: "loading" });

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

  const canSeeMembers =
    orgState.kind === "ready" &&
    (orgState.org.actor.permissions.includes("org.members.read") ||
      orgState.org.actor.permissions.includes("org.members.invite"));

  return (
    <div className="page page--wide">
      <header className="topbar">
        <div>
          <strong>
            {orgState.kind === "ready" ? orgState.org.organization.name : t("appName")}
          </strong>
          <span className="muted"> · {session.me.user.name}</span>
        </div>
        <nav className="row">
          <Link href="/">{t("home")}</Link>
          {canSeeMembers ? <Link href="/members">{t("members")}</Link> : null}
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
        ? children({ org: orgState.org, userName: session.me.user.name })
        : null}
    </div>
  );
}

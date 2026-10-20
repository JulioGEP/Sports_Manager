"use client";

import {
  AcceptInvitationResponseSchema,
  PASSWORD_MIN_LENGTH,
  PublicInvitationSchema,
  type PublicInvitation,
} from "@sportsmanager/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/alert";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { signOut, useSession } from "@/lib/session";

type InvitationState =
  | { kind: "loading" }
  | { kind: "ready"; invitation: PublicInvitation }
  | { kind: "missing" }
  | { kind: "error" };

export default function InvitationPage() {
  const t = useTranslations("invitation");
  const errors = useTranslations("errors");
  const roles = useTranslations("roles");
  const locale = useLocale();
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const session = useSession();
  const [state, setState] = useState<InvitationState>({ kind: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/invitations/${encodeURIComponent(token)}`, { schema: PublicInvitationSchema })
      .then((invitation) => {
        if (!cancelled) setState({ kind: "ready", invitation });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: err instanceof ApiClientError && err.status === 404 ? "missing" : "error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept(body: { name?: string; password?: string }) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body,
        schema: AcceptInvitationResponseSchema,
      });
      router.replace("/");
    } catch (err) {
      setError(errors(errorKey(err)));
      setBusy(false);
    }
  }

  function onCreateAccount(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("tooShort", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    void accept({ name: name.trim(), password });
  }

  async function onSignOut() {
    await signOut();
    window.location.reload();
  }

  if (state.kind === "loading" || session.kind === "loading") {
    return <main className="page">{t("loading")}</main>;
  }
  if (state.kind === "missing") {
    return (
      <main className="page">
        <section className="card">
          <h1>{t("missingTitle")}</h1>
          <p className="muted">{t("missingBody")}</p>
        </section>
      </main>
    );
  }
  if (state.kind === "error" || session.kind === "error") {
    return (
      <main className="page">
        <Alert kind="error">{errors("unknown")}</Alert>
      </main>
    );
  }

  const { invitation } = state;
  const roleName =
    invitation.roleName[locale as keyof typeof invitation.roleName] ?? roles(invitation.roleCode);
  const me = session.kind === "authenticated" ? session.me.user : null;
  const loginHref = `/login?next=${encodeURIComponent(`/invitations/${token}`)}`;

  let body;
  if (invitation.state === "expired") {
    body = <Alert kind="error">{errors("invitation_expired")}</Alert>;
  } else if (invitation.state === "accepted") {
    body = (
      <>
        <Alert kind="info">{t("alreadyAccepted")}</Alert>
        <Link className="button" href="/login">
          {t("goToLogin")}
        </Link>
      </>
    );
  } else if (me && me.email !== invitation.email) {
    body = (
      <>
        <Alert kind="error">
          {t("otherSession", { email: invitation.email, current: me.email })}
        </Alert>
        <button type="button" className="button button--secondary" onClick={() => void onSignOut()}>
          {t("signOutAndRetry")}
        </button>
      </>
    );
  } else if (invitation.hasAccount) {
    body = me ? (
      <>
        <p>{t("joinAs", { email: me.email })}</p>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <button type="button" className="button" disabled={busy} onClick={() => void accept({})}>
          {busy ? t("submitting") : t("join", { club: invitation.organization.name })}
        </button>
      </>
    ) : (
      <>
        <p>{t("hasAccount", { email: invitation.email })}</p>
        <Link className="button" href={loginHref}>
          {t("goToLogin")}
        </Link>
      </>
    );
  } else {
    body = (
      <form className="form" onSubmit={onCreateAccount}>
        <p>{t("createAccount", { email: invitation.email })}</p>
        <label className="field">
          <span>{t("name")}</span>
          <input
            type="text"
            autoComplete="name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("password", { min: PASSWORD_MIN_LENGTH })}</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("confirm")}</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <button type="submit" className="button" disabled={busy}>
          {busy ? t("submitting") : t("join", { club: invitation.organization.name })}
        </button>
      </form>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <h1>{t("title", { club: invitation.organization.name })}</h1>
        <p className="muted">{t("summary", { role: roleName, email: invitation.email })}</p>
        {body}
      </section>
    </main>
  );
}

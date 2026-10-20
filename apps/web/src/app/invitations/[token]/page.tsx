"use client";

import {
  AcceptInvitationResponseSchema,
  PASSWORD_MIN_LENGTH,
  PublicInvitationSchema,
  type PublicInvitation,
} from "@sportsmanager/shared";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthShell } from "@/layouts/auth-shell";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { signOut, useSession } from "@/lib/session";
import { Alert, Badge, Button, ButtonLink, Field, Input } from "@/ui";

type InvitationState =
  | { kind: "loading" }
  | { kind: "ready"; invitation: PublicInvitation }
  | { kind: "missing" }
  | { kind: "error" };

export default function InvitationPage() {
  const t = useTranslations("auth.invitation");
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
    return (
      <AuthShell title={t("loading")}>
        <div className="skeleton">
          <div className="skeleton__line" />
          <div className="skeleton__line" style={{ width: "60%" }} />
        </div>
      </AuthShell>
    );
  }
  if (state.kind === "missing") {
    return (
      <AuthShell title={t("missingTitle")} description={t("missingBody")}>
        <ButtonLink href="/login" variant="secondary" block>
          {t("goToLogin")}
        </ButtonLink>
      </AuthShell>
    );
  }
  if (state.kind === "error" || session.kind === "error") {
    return (
      <AuthShell title={t("missingTitle")}>
        <Alert kind="error">{errors("unknown")}</Alert>
      </AuthShell>
    );
  }

  const { invitation } = state;
  const roleName =
    invitation.roleName[locale as keyof typeof invitation.roleName] ?? roles(invitation.roleCode);
  const me = session.kind === "authenticated" ? session.me.user : null;
  const loginHref = `/login?next=${encodeURIComponent(`/invitations/${token}`)}`;
  const summary = (
    <p>
      {t("summary", { email: invitation.email })} <Badge tone="brand">{roleName}</Badge>
    </p>
  );

  let body;
  if (invitation.state === "expired") {
    body = <Alert kind="error">{errors("invitation_expired")}</Alert>;
  } else if (invitation.state === "accepted") {
    body = (
      <div className="stack stack--tight">
        <Alert kind="info">{t("alreadyAccepted")}</Alert>
        <ButtonLink href="/login" block>
          {t("goToLogin")}
        </ButtonLink>
      </div>
    );
  } else if (me && me.email !== invitation.email) {
    body = (
      <div className="stack stack--tight">
        <Alert kind="warning">
          {t("otherSession", { email: invitation.email, current: me.email })}
        </Alert>
        <Button variant="secondary" block onClick={() => void onSignOut()}>
          {t("signOutAndRetry")}
        </Button>
      </div>
    );
  } else if (invitation.hasAccount) {
    body = me ? (
      <div className="stack stack--tight">
        {summary}
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Button block loading={busy} onClick={() => void accept({})}>
          {t("join", { club: invitation.organization.name })}
        </Button>
      </div>
    ) : (
      <div className="stack stack--tight">
        {summary}
        <Alert kind="info">{t("hasAccount", { email: invitation.email })}</Alert>
        <ButtonLink href={loginHref} block>
          {t("goToLogin")}
        </ButtonLink>
      </div>
    );
  } else {
    body = (
      <form className="form" onSubmit={onCreateAccount}>
        {summary}
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("password")} hint={t("passwordHint", { min: PASSWORD_MIN_LENGTH })}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("confirm")}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Button type="submit" block loading={busy}>
          {t("join", { club: invitation.organization.name })}
        </Button>
      </form>
    );
  }

  return (
    <AuthShell
      title={t("title", { club: invitation.organization.name })}
      description={t("subtitle")}
    >
      {body}
    </AuthShell>
  );
}

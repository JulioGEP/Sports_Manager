import {
  AcceptInvitationResponseSchema,
  PASSWORD_MIN_LENGTH,
  PublicInvitationSchema,
  OrganizationBrandingSchema,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { AuthShell } from "@/layouts/auth-shell";
import { ApiClientError, apiFetch, errorKey, setCurrentClub } from "@/lib/api";
import { isValidClubSlug } from "@/lib/club";
import { useLocale, useT } from "@/lib/intl";
import { useSession, useSignOut } from "@/lib/session";
import { applyClubLook } from "@/lib/theme";
import { Alert, Button, ButtonLink, Field, Input, StatusChip } from "@/ui";

/** Aceptar una invitación: `/<club>/invitations/<token>`. Crea la cuenta o une la sesión actual. */
export function InvitationPage() {
  const t = useT("auth.invitation");
  const errors = useT("errors");
  const roles = useT("roles");
  const { locale } = useLocale();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { club, token = "" } = useParams();
  const slug = isValidClubSlug(club) ? club : null;
  const session = useSession();
  const signOut = useSignOut();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    setCurrentClub(slug);
    return () => setCurrentClub(null);
  }, [slug]);

  const branding = useQuery({
    queryKey: ["branding", slug],
    queryFn: () =>
      apiFetch("/api/org/branding", { schema: OrganizationBrandingSchema, club: slug }),
    enabled: slug !== null,
    retry: false,
  });
  useEffect(() => {
    if (branding.data) applyClubLook(branding.data);
  }, [branding.data]);

  const invitation = useQuery({
    queryKey: ["invitation", slug, token],
    queryFn: () =>
      apiFetch(`/api/invitations/${encodeURIComponent(token)}`, {
        schema: PublicInvitationSchema,
        club: slug,
      }),
    enabled: slug !== null && token !== "",
    retry: false,
  });

  async function accept(body: { name?: string; password?: string }) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body,
        schema: AcceptInvitationResponseSchema,
        club: slug,
      });
      await client.resetQueries();
      void navigate(`/${slug}`, { replace: true });
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
  }

  const clubInfo = branding.data
    ? { name: branding.data.name, logoUrl: branding.data.logoUrl, motto: branding.data.motto }
    : null;

  if (
    !slug ||
    (invitation.isError &&
      invitation.error instanceof ApiClientError &&
      invitation.error.status === 404)
  ) {
    return (
      <AuthShell title={t("missingTitle")} description={t("missingBody")} club={clubInfo}>
        <ButtonLink action="signIn" to="/login" variant="secondary">
          {t("goToLogin")}
        </ButtonLink>
      </AuthShell>
    );
  }
  if (invitation.isPending || session.kind === "loading") {
    return (
      <AuthShell title={t("loading")} club={clubInfo}>
        <div className="h-20 animate-pulse rounded-field bg-raised" aria-busy="true" />
      </AuthShell>
    );
  }
  if (invitation.isError || session.kind === "error") {
    return (
      <AuthShell title={t("missingTitle")} club={clubInfo}>
        <Alert kind="error">{errors("unknown")}</Alert>
      </AuthShell>
    );
  }

  const inv = invitation.data;
  const roleName = inv.roleName[locale] ?? roles(inv.roleCode);
  const me = session.kind === "authenticated" ? session.me.user : null;
  const loginHref = `/login?next=${encodeURIComponent(`/${slug}/invitations/${token}`)}`;
  const summary = (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-2 text-body text-ink">
        {t("summary", { email: inv.email })} <StatusChip kind="club">{roleName}</StatusChip>
      </p>
      {inv.playerName ? (
        <p className="text-secondary text-muted">{t("familyOf", { player: inv.playerName })}</p>
      ) : null}
    </div>
  );

  let body;
  if (inv.state === "expired") {
    body = <Alert kind="error">{errors("invitation_expired")}</Alert>;
  } else if (inv.state === "accepted") {
    body = (
      <div className="flex flex-col gap-4">
        <Alert kind="info">{t("alreadyAccepted")}</Alert>
        <ButtonLink action="signIn" to="/login">
          {t("goToLogin")}
        </ButtonLink>
      </div>
    );
  } else if (me && me.email !== inv.email) {
    body = (
      <div className="flex flex-col gap-4">
        <Alert kind="warning">{t("otherSession", { email: inv.email, current: me.email })}</Alert>
        <Button action="signOut" variant="secondary" cta onClick={() => void onSignOut()}>
          {t("signOutAndRetry")}
        </Button>
      </div>
    );
  } else if (inv.hasAccount) {
    body = me ? (
      <div className="flex flex-col gap-4">
        {summary}
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Button action="signIn" cta loading={busy} onClick={() => void accept({})}>
          {t("join", { club: inv.organization.name })}
        </Button>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        {summary}
        <Alert kind="info">{t("hasAccount", { email: inv.email })}</Alert>
        <ButtonLink action="signIn" to={loginHref}>
          {t("goToLogin")}
        </ButtonLink>
      </div>
    );
  } else {
    body = (
      <form className="flex flex-col gap-4" onSubmit={onCreateAccount}>
        {summary}
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("password")} hint={t("passwordHint", { min: PASSWORD_MIN_LENGTH })}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              aria-describedby={describedBy}
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
        <Button action="signIn" type="submit" cta loading={busy}>
          {t("join", { club: inv.organization.name })}
        </Button>
      </form>
    );
  }

  return (
    <AuthShell
      title={t("title", { club: inv.organization.name })}
      description={t("subtitle")}
      club={clubInfo}
    >
      {body}
    </AuthShell>
  );
}

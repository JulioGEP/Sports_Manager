import {
  PASSWORD_MIN_LENGTH,
  PlatformSetupBodySchema,
  PlatformSetupResponseSchema,
} from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AuthShell } from "@/layouts/auth-shell";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { useT } from "@/lib/intl";
import { Alert, Button, Field, Input } from "@/ui";

/** Alta del primer administrador de plataforma (ADR 0026). */
export function PlatformSetupPage() {
  const t = useT("platform.setup");
  const errors = useT("errors");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("tooShort", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    const parsed = PlatformSetupBodySchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setError(errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/platform-setup", {
        method: "POST",
        body: parsed.data,
        schema: PlatformSetupResponseSchema,
        club: null,
      });
      await client.resetQueries();
      void navigate("/admin", { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) setError(t("forbidden"));
      else if (err instanceof ApiClientError && err.status === 409) setError(t("exists"));
      else setError(errors(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("title")} description={t("subtitle")} club={null} platform>
      <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
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
        <Field label={t("email")}>
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          {t("submit")}
        </Button>
        <p className="text-center text-secondary">
          <Link to="/admin/login" className="text-club-text">
            {t("backToLogin")}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

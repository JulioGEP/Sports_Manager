import { RequestPasswordResetBodySchema } from "@sportsmanager/shared";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthShell } from "@/layouts/auth-shell";
import { apiFetch, errorKey } from "@/lib/api";
import { useT } from "@/lib/intl";
import { Alert, Button, Field, Input } from "@/ui";

export function ForgotPasswordPage() {
  const t = useT("auth.forgot");
  const errors = useT("errors");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = RequestPasswordResetBodySchema.safeParse({ email });
    if (!parsed.success) {
      setError(errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/request-password-reset", {
        method: "POST",
        body: parsed.data,
        club: null,
      });
      setDone(true);
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("title")} description={t("subtitle")} club={null}>
      {done ? (
        <div className="flex flex-col gap-4">
          <Alert kind="success">{t("sent")}</Alert>
          <Link to="/login" className="text-center text-secondary text-club-text">
            {t("backToLogin")}
          </Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
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
          {error ? <Alert kind="error">{error}</Alert> : null}
          <Button action="send" type="submit" cta loading={busy}>
            {t("submit")}
          </Button>
          <p className="text-center text-secondary">
            <Link to="/login" className="text-club-text">
              {t("backToLogin")}
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

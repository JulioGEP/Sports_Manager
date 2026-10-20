"use client";

import { PASSWORD_MIN_LENGTH, ResetPasswordBodySchema } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/layouts/auth-shell";
import { apiFetch, errorKey } from "@/lib/api";
import { Alert, Button, ButtonLink, Field, Input } from "@/ui";

export function ResetPasswordForm() {
  const t = useTranslations("auth.reset");
  const errors = useTranslations("errors");
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    const parsed = ResetPasswordBodySchema.safeParse({ token, newPassword: password });
    if (!parsed.success) {
      setError(t("tooShort", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/reset-password", { method: "POST", body: parsed.data });
      setDone(true);
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("title")} description={t("subtitle")}>
      {!token ? <Alert kind="error">{t("missingToken")}</Alert> : null}
      {done ? (
        <div className="stack stack--tight">
          <Alert kind="success">{t("done")}</Alert>
          <ButtonLink href="/login" block>
            {t("goToLogin")}
          </ButtonLink>
        </div>
      ) : (
        <form className="form" onSubmit={(e) => void onSubmit(e)}>
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
          <Button type="submit" block loading={busy} disabled={!token}>
            {t("submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

"use client";

import { RequestPasswordResetBodySchema } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/layouts/auth-shell";
import { apiFetch, errorKey } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/ui";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgot");
  const errors = useTranslations("errors");
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
      await apiFetch("/api/auth/request-password-reset", { method: "POST", body: parsed.data });
      setDone(true);
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("title")} description={t("subtitle")}>
      {done ? (
        <div className="stack stack--tight">
          <Alert kind="success">{t("sent")}</Alert>
          <Link href="/login">{t("backToLogin")}</Link>
        </div>
      ) : (
        <form className="form" onSubmit={(e) => void onSubmit(e)}>
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
          <Button type="submit" block loading={busy}>
            {t("submit")}
          </Button>
          <p className="small" style={{ textAlign: "center" }}>
            <Link href="/login">{t("backToLogin")}</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

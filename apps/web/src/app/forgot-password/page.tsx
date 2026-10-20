"use client";

import { RequestPasswordResetBodySchema } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/alert";
import { apiFetch, errorKey } from "@/lib/api";

export default function ForgotPasswordPage() {
  const t = useTranslations("forgot");
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
    <main className="page">
      <form className="card form" onSubmit={(e) => void onSubmit(e)}>
        <h1>{t("title")}</h1>
        <p className="muted">{t("subtitle")}</p>
        {done ? (
          <Alert kind="ok">{t("sent")}</Alert>
        ) : (
          <>
            <label className="field">
              <span>{t("email")}</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error ? <Alert kind="error">{error}</Alert> : null}
            <button type="submit" className="button" disabled={busy}>
              {busy ? t("submitting") : t("submit")}
            </button>
          </>
        )}
        <p className="muted">
          <Link href="/login">{t("backToLogin")}</Link>
        </p>
      </form>
    </main>
  );
}

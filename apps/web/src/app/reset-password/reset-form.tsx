"use client";

import { PASSWORD_MIN_LENGTH, ResetPasswordBodySchema } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/alert";
import { apiFetch, errorKey } from "@/lib/api";

export function ResetPasswordForm() {
  const t = useTranslations("reset");
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
    <main className="page">
      <form className="card form" onSubmit={(e) => void onSubmit(e)}>
        <h1>{t("title")}</h1>
        {!token ? <Alert kind="error">{t("missingToken")}</Alert> : null}
        {done ? (
          <>
            <Alert kind="ok">{t("done")}</Alert>
            <Link className="button" href="/login">
              {t("goToLogin")}
            </Link>
          </>
        ) : (
          <>
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
            <button type="submit" className="button" disabled={busy || !token}>
              {busy ? t("submitting") : t("submit")}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

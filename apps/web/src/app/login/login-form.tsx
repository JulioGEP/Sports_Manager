"use client";

import { SignInBodySchema } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/alert";
import { apiFetch, errorKey } from "@/lib/api";
import { safeNext } from "@/lib/session";

export function LoginForm() {
  const t = useTranslations("login");
  const errors = useTranslations("errors");
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = SignInBodySchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(errors("bad_request"));
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/sign-in/email", { method: "POST", body: parsed.data });
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      setError(errors(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <form className="card form" onSubmit={(e) => void onSubmit(e)}>
        <h1>{t("title")}</h1>
        <p className="muted">{t("subtitle")}</p>
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
        <label className="field">
          <span>{t("password")}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <button type="submit" className="button" disabled={busy}>
          {busy ? t("submitting") : t("submit")}
        </button>
        <p className="muted">
          <Link href="/forgot-password">{t("forgot")}</Link>
        </p>
      </form>
    </main>
  );
}

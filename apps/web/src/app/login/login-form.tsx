"use client";

import { SignInBodySchema } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/layouts/auth-shell";
import { apiFetch, errorKey } from "@/lib/api";
import { safeNext } from "@/lib/session";
import { Alert, Button, Field, Input } from "@/ui";

export function LoginForm() {
  const t = useTranslations("auth.login");
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
    <AuthShell title={t("title")} description={t("subtitle")}>
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
        <Field label={t("password")}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Button type="submit" block loading={busy}>
          {t("submit")}
        </Button>
        <p className="small" style={{ textAlign: "center" }}>
          <Link href="/forgot-password">{t("forgot")}</Link>
        </p>
      </form>
    </AuthShell>
  );
}

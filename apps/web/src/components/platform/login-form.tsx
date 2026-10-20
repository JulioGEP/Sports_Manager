"use client";

import { MeResponseSchema, SignInBodySchema } from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/layouts/auth-shell";
import { apiFetch, errorKey } from "@/lib/api";
import { safeNext, signOut } from "@/lib/session";
import { Alert, Button, Field, Input } from "@/ui";

/** Entrada del negocio (ADR 0026): misma sesión que el resto, pero sin marca de club y solo para administradores de plataforma. */
export function PlatformLoginForm() {
  const t = useTranslations("platform.login");
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
      const me = await apiFetch("/api/me", { schema: MeResponseSchema });
      if (!me.platformAdmin) {
        await signOut();
        setError(t("notAdmin"));
        setBusy(false);
        return;
      }
      const next = safeNext(params.get("next"));
      router.replace(next.startsWith("/admin") ? next : "/admin");
    } catch (err) {
      setError(errors(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <AuthShell platform title={t("title")} description={t("subtitle")}>
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
        <p className="small" style={{ textAlign: "center" }}>
          <Link href="/admin/setup">{t("setup")}</Link>
        </p>
      </form>
    </AuthShell>
  );
}

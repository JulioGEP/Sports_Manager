import { MeResponseSchema, SignInBodySchema } from "@sportsmanager/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AuthShell } from "@/layouts/auth-shell";
import { apiFetch, errorKey } from "@/lib/api";
import { useT } from "@/lib/intl";
import { ME_QUERY, safeNext, useSignOut } from "@/lib/session";
import { Alert, Button, Field, Input } from "@/ui";

/**
 * Un único login para todos los clubes. Con `platform`, es la entrada del negocio (ADR 0026):
 * solo deja pasar a administradores de plataforma y aterriza en /admin.
 */
export function LoginPage({ platform = false }: { platform?: boolean }) {
  const t = useT(platform ? "platform.login" : "auth.login");
  const errors = useT("errors");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const client = useQueryClient();
  const signOut = useSignOut();
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
      await apiFetch("/api/auth/sign-in/email", { method: "POST", body: parsed.data, club: null });
      const me = await apiFetch("/api/me", { schema: MeResponseSchema, club: null });
      if (platform && !me.platformAdmin) {
        await signOut();
        setError(t("notAdmin"));
        setBusy(false);
        return;
      }
      client.setQueryData(ME_QUERY, me);
      const next = safeNext(params.get("next"));
      if (platform) void navigate(next.startsWith("/admin") ? next : "/admin", { replace: true });
      else void navigate(next === "/" ? "/clubs" : next, { replace: true });
    } catch (err) {
      setError(errors(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("title")} description={t("subtitle")} club={null} platform={platform}>
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
        <Button type="submit" cta loading={busy}>
          {t("submit")}
        </Button>
        <p className="text-center text-secondary">
          <Link to="/forgot-password" className="text-club-text">
            {t("forgot")}
          </Link>
        </p>
        {platform ? (
          <p className="text-center text-secondary">
            <Link to="/admin/setup" className="text-club-text">
              {t("setup")}
            </Link>
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}

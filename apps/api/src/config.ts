import {
  DEFAULT_INVITATION_TTL_DAYS,
  EMAIL_TRANSPORTS,
  type EmailTransport,
} from "@sportsmanager/shared";
import { z } from "zod";

/** Secreto solo para desarrollo local y tests. Fuera de local, BETTER_AUTH_SECRET es obligatoria. */
const DEV_ONLY_SECRET = "dev-only-secret-not-for-production-0123456789abcdef";

/** Una variable vacía en Netlify cuenta como no definida. */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const EnvSchema = z.object({
  APP_BASE_DOMAIN: z.string().trim().min(1).default("sportsmanager.localhost"),
  TENANT_FALLBACK_SLUG: z.string().trim().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  SESSION_COOKIE_DOMAIN: z.string().trim().min(1).optional(),
  INVITATION_TTL_DAYS: z.coerce.number().int().positive().optional(),
  EMAIL_TRANSPORT: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(EMAIL_TRANSPORTS).optional(),
  ),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  EMAIL_DEBUG_LOG: optionalString,
  NETLIFY_DEV: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

export interface EmailConfig {
  /** `outbox` guarda sin enviar; `resend` envía por la API de Resend (ADR 0018). */
  transport: EmailTransport;
  /** Remitente, por ejemplo `Sports Manager <no-reply@dominio>`. Obligatorio con `resend`. */
  from: string | null;
  resendApiKey: string | null;
  /** Escribe cada email en el log de la función. Solo previews y local; nunca en producción. */
  debugLog: boolean;
}

export interface ApiConfig {
  /** Dominio base de la plataforma, sin protocolo. Los clubes viven en `<slug>.<baseDomain>`. */
  baseDomain: string;
  /** Club que se sirve cuando el host no lleva subdominio de club (ADR 0016). */
  tenantFallbackSlug: string | null;
  authSecret: string;
  /** Dominio de la cookie de sesión cuando exista dominio propio (ADR 0006). Nulo = cookie de host único. */
  sessionCookieDomain: string | null;
  secureCookies: boolean;
  isLocal: boolean;
  invitationTtlDays: number;
  email: EmailConfig;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ApiConfig {
  const parsed = EnvSchema.parse(env);
  const isLocal =
    parsed.NETLIFY_DEV === "true" ||
    parsed.NODE_ENV === "test" ||
    parsed.NODE_ENV === "development";
  const authSecret = parsed.BETTER_AUTH_SECRET ?? (isLocal ? DEV_ONLY_SECRET : null);
  if (!authSecret) {
    throw new Error("BETTER_AUTH_SECRET es obligatoria fuera de desarrollo local.");
  }
  const transport = parsed.EMAIL_TRANSPORT ?? "outbox";
  if (transport === "resend" && (!parsed.RESEND_API_KEY || !parsed.EMAIL_FROM)) {
    throw new Error("EMAIL_TRANSPORT=resend exige RESEND_API_KEY y EMAIL_FROM.");
  }
  return {
    baseDomain: parsed.APP_BASE_DOMAIN.toLowerCase(),
    tenantFallbackSlug: parsed.TENANT_FALLBACK_SLUG?.toLowerCase() ?? null,
    authSecret,
    sessionCookieDomain: parsed.SESSION_COOKIE_DOMAIN ?? null,
    secureCookies: !isLocal,
    isLocal,
    invitationTtlDays: parsed.INVITATION_TTL_DAYS ?? DEFAULT_INVITATION_TTL_DAYS,
    email: {
      transport,
      from: parsed.EMAIL_FROM ?? null,
      resendApiKey: parsed.RESEND_API_KEY ?? null,
      debugLog: parsed.EMAIL_DEBUG_LOG === "true" || parsed.NETLIFY_DEV === "true",
    },
  };
}

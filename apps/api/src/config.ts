import {
  DEFAULT_INVITATION_TTL_DAYS,
  EMAIL_TRANSPORTS,
  type EmailTransport,
} from "@sportsmanager/shared";
import { z } from "zod";

/** Secreto solo para desarrollo local y tests. Fuera de local, BETTER_AUTH_SECRET es obligatoria. */
const DEV_ONLY_SECRET = "dev-only-secret-not-for-production-0123456789abcdef";
/** Secreto de integraciones solo para local y tests: cifra las claves de contabilidad (ADR 0042). */
const DEV_ONLY_INTEGRATIONS_SECRET = "dev-only-integrations-secret-not-for-production-0123";

/** Una variable vacía en Netlify cuenta como no definida. */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const EnvSchema = z.object({
  APP_BASE_DOMAIN: z.string().trim().min(1).default("sportsmanager.localhost"),
  TENANT_ROUTING: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(["path", "subdomain"]).optional(),
  ),
  TENANT_FALLBACK_SLUG: optionalString,
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
  PLATFORM_ADMIN_EMAILS: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  INTEGRATIONS_SECRET: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(32, "INTEGRATIONS_SECRET necesita al menos 32 caracteres.").optional(),
  ),
  LOGO_STORE: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(["netlify", "memory"]).optional(),
  ),
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

/**
 * Cobros por Stripe (Bloque 18). Como con Resend: preparado y sin conectar hasta tener claves.
 * Sin las dos claves, ningún club puede activar el proveedor `stripe` y el webhook responde 400.
 */
export interface PaymentsConfig {
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  /** Las dos claves están configuradas: los clubes pueden cobrar por Stripe. */
  stripeConfigured: boolean;
}

/**
 * Conectores de contabilidad (ADR 0042). La clave de API de cada club se guarda cifrada con este
 * secreto. Sin secreto (fuera de local), ningún club puede conectar su herramienta: como Stripe y
 * Resend, todo queda preparado y sin conectar hasta configurarlo.
 */
export interface AccountingConfig {
  secret: string | null;
  configured: boolean;
}

export interface ApiConfig {
  /** Dominio base de la plataforma, sin protocolo. Los clubes viven en `<slug>.<baseDomain>`. */
  baseDomain: string;
  /**
   * Dónde viven los clubes en las URL (ADR 0027): `path` → `https://<dominio base>/<slug>`;
   * `subdomain` → `https://<slug>.<dominio base>`. La API acepta siempre las dos señales
   * (subdominio y cabecera `x-sm-club`); este valor solo decide cómo construye los enlaces.
   */
  tenantRouting: "path" | "subdomain";
  /** Club que se sirve cuando el host no lleva subdominio de club (ADR 0016). */
  tenantFallbackSlug: string | null;
  authSecret: string;
  /** Dominio de la cookie de sesión cuando exista dominio propio (ADR 0006). Nulo = cookie de host único. */
  sessionCookieDomain: string | null;
  secureCookies: boolean;
  isLocal: boolean;
  invitationTtlDays: number;
  email: EmailConfig;
  payments: PaymentsConfig;
  accounting: AccountingConfig;
  /**
   * Emails que cuentan como administradores de plataforma además de la tabla `platform_admins`
   * (ADR 0023). Es la vía para el primer administrador, sin contraseñas sembradas.
   */
  platformAdminEmails: string[];
  /**
   * Dónde viven los logos: Netlify Blobs (ADR 0024) o memoria. `memory` solo tiene sentido en
   * local sin Netlify (serve-local y tests); fuera de local se rechaza.
   */
  logoStore: "netlify" | "memory";
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
  const logoStore = parsed.LOGO_STORE ?? "netlify";
  if (logoStore === "memory" && !isLocal) {
    throw new Error("LOGO_STORE=memory solo está permitido en desarrollo local.");
  }
  const transport = parsed.EMAIL_TRANSPORT ?? "outbox";
  if (transport === "resend" && (!parsed.RESEND_API_KEY || !parsed.EMAIL_FROM)) {
    throw new Error("EMAIL_TRANSPORT=resend exige RESEND_API_KEY y EMAIL_FROM.");
  }
  const integrationsSecret =
    parsed.INTEGRATIONS_SECRET ?? (isLocal ? DEV_ONLY_INTEGRATIONS_SECRET : null);
  return {
    baseDomain: parsed.APP_BASE_DOMAIN.toLowerCase(),
    tenantRouting: parsed.TENANT_ROUTING ?? "path",
    tenantFallbackSlug: parsed.TENANT_FALLBACK_SLUG?.toLowerCase() ?? null,
    authSecret,
    sessionCookieDomain: parsed.SESSION_COOKIE_DOMAIN ?? null,
    secureCookies: !isLocal,
    isLocal,
    invitationTtlDays: parsed.INVITATION_TTL_DAYS ?? DEFAULT_INVITATION_TTL_DAYS,
    logoStore,
    platformAdminEmails: (parsed.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
    email: {
      transport,
      from: parsed.EMAIL_FROM ?? null,
      resendApiKey: parsed.RESEND_API_KEY ?? null,
      debugLog: parsed.EMAIL_DEBUG_LOG === "true" || parsed.NETLIFY_DEV === "true",
    },
    payments: {
      stripeSecretKey: parsed.STRIPE_SECRET_KEY ?? null,
      stripeWebhookSecret: parsed.STRIPE_WEBHOOK_SECRET ?? null,
      stripeConfigured: Boolean(parsed.STRIPE_SECRET_KEY && parsed.STRIPE_WEBHOOK_SECRET),
    },
    accounting: {
      secret: integrationsSecret,
      configured: integrationsSecret !== null,
    },
  };
}

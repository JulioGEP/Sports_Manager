import { schema, type Database } from "@sportsmanager/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@sportsmanager/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { ApiConfig } from "../../config.ts";

export interface ResetPasswordRequest {
  user: { id: string; name: string; email: string; locale?: string | null };
  token: string;
  /** Host de la petición, ya en minúsculas, o undefined si no llegó. */
  host: string | undefined;
  /** Contexto de deploy de Netlify que la API fijó en la cabecera interna. */
  deployContext: string | undefined;
}

export interface AuthHooks {
  /** Envía el email de restablecer contraseña (ADR 0018). Lo implementa la capa de datos. */
  sendResetPassword: (request: ResetPasswordRequest) => Promise<void>;
}

/**
 * Instancia de Better Auth (ADR 0004). Vive en la capa de datos porque lee y escribe
 * usuarios, sesiones y cuentas. Registro público desactivado: las cuentas nacen al
 * aceptar una invitación (ADR 0019).
 */
export function createAuth(db: Database, config: ApiConfig, hooks: AuthHooks) {
  const staticOrigins = [
    `https://${config.baseDomain}`,
    `https://*.${config.baseDomain}`,
    ...(config.isLocal
      ? [
          `http://${config.baseDomain}:8888`,
          `http://*.${config.baseDomain}:8888`,
          `http://${config.baseDomain}:3000`,
          `http://*.${config.baseDomain}:3000`,
          "http://localhost:8888",
          "http://localhost:3000",
        ]
      : []),
  ];

  return betterAuth({
    appName: "Sports Manager",
    secret: config.authSecret,
    basePath: "/api/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
        rateLimits: schema.rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      /** Al cambiar la contraseña se cierran las demás sesiones (ADR 0020). */
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }, request) => {
        await hooks.sendResetPassword({
          user: user,
          token,
          host: request?.headers.get("host")?.toLowerCase(),
          deployContext: request?.headers.get("x-sm-deploy-context") ?? undefined,
        });
      },
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false, input: true },
      },
    },
    /**
     * Límite de intentos (ADR 0020): reglas por defecto de Better Auth (3 intentos de login
     * por IP cada 10 s, 3 peticiones de restablecer por minuto), con contadores en la base
     * para que valgan entre instancias de la función. Desactivado en local y en tests.
     */
    rateLimit: {
      enabled: !config.isLocal,
      storage: "database",
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "sm",
      useSecureCookies: config.secureCookies,
      /** Netlify entrega la IP del cliente en esta cabecera; la segunda es la convención general. */
      ipAddress: { ipAddressHeaders: ["x-nf-client-connection-ip", "x-forwarded-for"] },
      ...(config.sessionCookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: config.sessionCookieDomain } }
        : {}),
    },
    /**
     * Orígenes de confianza para la comprobación CSRF: el dominio base y sus subdominios, y
     * además el propio host de la petición, porque web y API comparten host (ADR 0010).
     */
    trustedOrigins: (request) => {
      const host = request?.headers.get("host");
      const sameOrigin = host ? [`https://${host}`, `http://${host}`] : [];
      return [...staticOrigins, ...sameOrigin];
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

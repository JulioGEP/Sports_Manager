import { schema, type Database } from "@sportsmanager/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { ApiConfig } from "../../config.ts";

/**
 * Instancia de Better Auth (ADR 0004). Vive en la capa de datos porque lee y escribe
 * usuarios, sesiones y cuentas. Registro público desactivado: las cuentas nacen al
 * aceptar una invitación (Bloque 4).
 */
export function createAuth(db: Database, config: ApiConfig) {
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
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false, input: true },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "sm",
      useSecureCookies: config.secureCookies,
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

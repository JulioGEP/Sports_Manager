import { regionFromConnectionString, schema } from "@sportsmanager/db";
import type { DatabaseStatus } from "@sportsmanager/shared";
import { eq, sql } from "drizzle-orm";
import type { ApiConfig } from "../config.ts";
import { auditRepo } from "./audit.ts";
import { createAuth, type Auth } from "./auth/index.ts";
import { createResetPasswordSender } from "./auth/reset-password.ts";
import { createLazyDb } from "./db.ts";
export { isUniqueViolation } from "./db.ts";
import { emailOutboxRepo } from "./email/outbox.ts";
import type { ResendLike } from "./email/resend.ts";
import { createEmailSender, type EmailSender } from "./email/sender.ts";
import { invitationsRepo } from "./invitations.ts";
import { createNetlifyLogoStore, logosRepo, type LogoStore } from "./logos.ts";
import { membershipsRepo } from "./memberships.ts";
import { organizationsRepo } from "./organizations.ts";
import { platformRepo } from "./platform.ts";
import { rolesRepo } from "./roles.ts";
import { sportsRepo } from "./sports.ts";
import { usersRepo } from "./users.ts";

export type { OrgScope } from "./scope.ts";
export type {
  CreateOrganizationResult,
  OrganizationCounts,
  OrganizationRow,
  OrganizationSport,
  SupportCounts,
} from "./organizations.ts";
export type { AuditInput, AuditRecord } from "./audit.ts";
export type { AssignRoleResult, Member, RemoveRoleResult, UserMembership } from "./memberships.ts";
export type { InvitationByToken, InvitationRecord, IssuedInvitation } from "./invitations.ts";
export type { UserRecord } from "./users.ts";
export type { EmailSender, OutgoingEmail, SentEmail } from "./email/sender.ts";
export type { ResendLike } from "./email/resend.ts";
export {
  createMemoryLogoStore,
  isLogoContentType,
  logoUrlFor,
  logoVersion,
  sniffImageType,
  type LogoStore,
} from "./logos.ts";
export { renderEmail, type EmailContent, type RenderedEmail } from "./email/templates.ts";
export { invitationState } from "./invitation-tokens.ts";
export { userLocale } from "./memberships.ts";

/**
 * Única capa de acceso a datos de la API (ADR 0009 y 0015).
 * Fuera de este directorio nadie importa @sportsmanager/db, drizzle-orm, pg, better-auth
 * ni resend: lo impiden ESLint y src/architecture.isolation.test.ts.
 */
export interface DataLayerOptions {
  config: ApiConfig;
  connectionString?: string;
  /** Cliente de Resend sustituible en tests. */
  resend?: ResendLike | null;
  /** Destino del log de depuración de emails. */
  emailLog?: (line: string) => void;
  /** Almacén de logos. Por defecto Netlify Blobs en eu-central-1; en tests, uno en memoria. */
  logoStore?: LogoStore;
}

export function createDataLayer(options: DataLayerOptions) {
  const lazy = createLazyDb(
    options.connectionString ? { connectionString: options.connectionString } : {},
  );
  const db = () => lazy.get().db;
  let auth: Auth | null = null;

  const organizations = organizationsRepo(db);
  const email: EmailSender = createEmailSender({
    config: options.config.email,
    outbox: emailOutboxRepo(db),
    resend: options.resend ?? null,
    ...(options.emailLog ? { log: options.emailLog } : {}),
  });
  const sendResetPassword = createResetPasswordSender({
    config: options.config,
    organizations,
    email,
  });
  const getAuth = (): Auth => {
    auth ??= createAuth(db(), options.config, { sendResetPassword });
    return auth;
  };

  return {
    get auth(): Auth {
      return getAuth();
    },
    organizations,
    memberships: membershipsRepo(db),
    platform: platformRepo(db, options.config),
    audit: auditRepo(db),
    sports: sportsRepo(db),
    invitations: invitationsRepo(db),
    users: usersRepo(db, getAuth),
    roles: rolesRepo(db),
    logos: logosRepo(db, options.logoStore ?? createNetlifyLogoStore()),
    email,

    async checkDatabase(): Promise<DatabaseStatus> {
      try {
        const { db: database, connectionString } = lazy.get();
        const started = performance.now();
        await database.execute(sql`select 1`);
        return {
          ok: true,
          region: regionFromConnectionString(connectionString),
          latencyMs: Math.round(performance.now() - started),
        };
      } catch (error) {
        console.error("[data] database check failed", error);
        return { ok: false, region: null, latencyMs: null };
      }
    },

    async getAppMeta(key: string): Promise<string | null> {
      const rows = await db()
        .select({ value: schema.appMeta.value })
        .from(schema.appMeta)
        .where(eq(schema.appMeta.key, key))
        .limit(1);
      return rows[0]?.value ?? null;
    },

    async close() {
      await lazy.close();
      auth = null;
    },
  };
}

export type DataLayer = ReturnType<typeof createDataLayer>;

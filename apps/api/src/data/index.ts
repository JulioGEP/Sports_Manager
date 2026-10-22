import { regionFromConnectionString, schema } from "@sportsmanager/db";
import type { DatabaseStatus } from "@sportsmanager/shared";
import { eq, sql } from "drizzle-orm";
import type { ApiConfig } from "../config.ts";
import { accessRepo } from "./access.ts";
import { auditRepo } from "./audit.ts";
import { challengesRepo } from "./challenges.ts";
import { createAuth, type Auth } from "./auth/index.ts";
import { createResetPasswordSender } from "./auth/reset-password.ts";
import { createLazyDb } from "./db.ts";
export { isUniqueViolation } from "./db.ts";
import { emailOutboxRepo } from "./email/outbox.ts";
import { attendanceRepo, eventsRepo, facilitiesRepo, schedulesRepo } from "./events.ts";
import { feesRepo } from "./fees.ts";
import type { ResendLike } from "./email/resend.ts";
import { createEmailSender, type EmailSender } from "./email/sender.ts";
import { invitationsRepo } from "./invitations.ts";
import {
  createMemoryBlobStore,
  createNetlifyLogoStore,
  createNetlifyPhotoStore,
  logosRepo,
  type BlobStore,
} from "./logos.ts";
import { healthRepo } from "./health.ts";
import { loadRepo } from "./load.ts";
import { matchesRepo } from "./matches.ts";
import { membershipsRepo } from "./memberships.ts";
import { organizationsRepo } from "./organizations.ts";
import { clubMembersRepo, memberTypesRepo, peopleRepo } from "./people.ts";
import { platformRepo } from "./platform.ts";
import { playerProfileRepo } from "./player-profile.ts";
import { playersRepo } from "./players.ts";
import { rolesRepo } from "./roles.ts";
import { sportsRepo } from "./sports.ts";
import { categoriesRepo, seasonsRepo, sectionsRepo, teamsRepo } from "./structure.ts";
import { trainingRepo } from "./training.ts";
import { usersRepo } from "./users.ts";

export type { OrgScope } from "./scope.ts";
export type {
  CreateOrganizationResult,
  OrganizationCounts,
  OrganizationRow,
  OrganizationSport,
  SupportCounts,
} from "./organizations.ts";
export type { ActivityRecord, AuditInput, AuditRecord } from "./audit.ts";
export type { AssignRoleResult, Member, RemoveRoleResult, UserMembership } from "./memberships.ts";
export type { PlayerStaffRecord, SectionRef } from "./access.ts";
export type { InvitationByToken, InvitationRecord, IssuedInvitation } from "./invitations.ts";
export type { UserRecord } from "./users.ts";
export type {
  CategoryRecord,
  RosterRecord,
  SeasonRecord,
  SectionRecord,
  StaffRecord,
  StructureCounts,
  TeamRecord,
} from "./structure.ts";
export type { ClubMemberRecord, MemberTypeRecord, PersonRecord, PersonRow } from "./people.ts";
export type {
  AttendanceEntryRecord,
  AttendanceSummaryRecord,
  EventFilter,
  EventRecord,
  FacilityRecord,
  ScheduleSlotRecord,
} from "./events.ts";
export { dayRange, fromLocal, localParts, weekRange } from "./events.ts";
export type { FeesSummaryRecord, PersonFeesRecord } from "./fees.ts";
export type {
  FamilyPlayerRecord,
  GuardianRecord,
  PlayerOverviewRecord,
  PlayerRow,
  PlayersOperations,
  PlayersReadiness,
  PlayerSummaryRecord,
  PlayerTeamRecord,
  VisiblePlayers,
} from "./players.ts";
export type {
  ChallengeRecord,
  ChallengeTaskRecord,
  ChallengeTotals,
  StandingRecord,
  SubmissionRecord,
} from "./challenges.ts";
export type {
  MatchActionTypeRecord,
  MatchEventRecord,
  MatchRecord,
  MatchSquadRecord,
  SectionMatchConfigRecord,
} from "./matches.ts";
export type {
  CycleRecord,
  DrillFilter,
  DrillRecord,
  MicrocycleTemplateRecord,
  PlanRecord,
  SectionTrainingRecord,
  SessionItemRecord,
  SessionRecord,
  TeamEventRecord,
  TrainingContentRecord,
} from "./training.ts";
export { instantOf, localDate, plannedOf } from "./training.ts";
export type {
  AvailabilityPeriodRecord,
  CurrentAvailability,
  LoadRecord,
  PhysicalTestRecord,
  WellnessRecord,
} from "./load.ts";
export { AVAILABLE } from "./load.ts";
export type { ConsentRecord, InjuryRecord } from "./health.ts";
export type {
  DevelopmentPlanRecord,
  PlayerEventDetails,
  PlayerEventRecord,
  PlayerIndicatorRecord,
  PlayerObjectiveRecord,
} from "./player-profile.ts";
export { playerPhotoUrlFor } from "./player-profile.ts";
export type { EmailSender, OutgoingEmail, SentEmail } from "./email/sender.ts";
export type { ResendLike } from "./email/resend.ts";
export {
  createMemoryBlobStore,
  createMemoryLogoStore,
  isLogoContentType,
  logoUrlFor,
  logoVersion,
  sniffImageType,
  type BlobStore,
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
  logoStore?: BlobStore;
  /** Almacén de fotos de jugador (Bloque 12). Mismo criterio que los logos. */
  photoStore?: BlobStore;
}

export function createDataLayer(options: DataLayerOptions) {
  const lazy = createLazyDb(
    options.connectionString ? { connectionString: options.connectionString } : {},
  );
  const db = () => lazy.get().db;
  let auth: Auth | null = null;

  const organizations = organizationsRepo(db);
  const memberships = membershipsRepo(db);
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
    memberships,
    access: accessRepo(db, memberships),
    platform: platformRepo(db, options.config),
    audit: auditRepo(db),
    sports: sportsRepo(db),
    invitations: invitationsRepo(db),
    users: usersRepo(db, getAuth),
    roles: rolesRepo(db),
    seasons: seasonsRepo(db),
    sections: sectionsRepo(db),
    categories: categoriesRepo(db),
    teams: teamsRepo(db),
    players: playersRepo(db),
    people: peopleRepo(db),
    clubMembers: clubMembersRepo(db),
    memberTypes: memberTypesRepo(db),
    facilities: facilitiesRepo(db),
    events: eventsRepo(db),
    schedules: schedulesRepo(db),
    attendance: attendanceRepo(db),
    fees: feesRepo(db),
    challenges: challengesRepo(db),
    matches: matchesRepo(db),
    training: trainingRepo(db),
    load: loadRepo(db),
    health: healthRepo(db),
    logos: logosRepo(
      db,
      options.logoStore ??
        (options.config.logoStore === "memory"
          ? createMemoryBlobStore()
          : createNetlifyLogoStore()),
    ),
    playerProfile: playerProfileRepo(
      db,
      options.photoStore ??
        (options.config.logoStore === "memory"
          ? createMemoryBlobStore()
          : createNetlifyPhotoStore()),
    ),
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

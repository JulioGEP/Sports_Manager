import { schema, type Database } from "@sportsmanager/db";
import {
  isLocale,
  ROLE_CODES,
  type GuardianRelationship,
  type InvitationStatus,
  type Locale,
  type LocalizedText,
  type RoleCode,
  type StaffPosition,
} from "@sportsmanager/shared";
import { and, desc, eq } from "drizzle-orm";
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TOKEN_PATTERN,
} from "./invitation-tokens.ts";
import type { OrganizationRow } from "./organizations.ts";
import { mintOrgScope, type OrgScope } from "./scope.ts";

export interface InvitationRecord {
  id: string;
  organizationId: string;
  email: string;
  roleCode: RoleCode;
  locale: Locale;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  invitedByName: string | null;
  invitedByUserId: string | null;
  /** Invitación de familia (Bloque 11): jugador al que vincula al aceptarse. */
  player: { id: string; firstName: string; lastName: string } | null;
  relationship: GuardianRelationship | null;
  /** Bloque 13: cargo con el que entra el personal y equipo al que se une como cuerpo técnico. */
  position: StaffPosition | null;
  team: { id: string; name: string } | null;
}

export interface IssuedInvitation {
  invitation: InvitationRecord;
  /** Token en claro. Solo existe en memoria para construir el enlace; nunca se guarda. */
  token: string;
}

export type CreateInvitationResult =
  | ({ outcome: "created" } & IssuedInvitation)
  | { outcome: "pending_exists"; invitation: InvitationRecord };

export interface InvitationByToken {
  invitation: InvitationRecord;
  organization: OrganizationRow;
  roleName: LocalizedText;
}

const selection = {
  id: schema.invitations.id,
  organizationId: schema.invitations.organizationId,
  email: schema.invitations.email,
  roleCode: schema.invitations.roleCode,
  locale: schema.invitations.locale,
  status: schema.invitations.status,
  expiresAt: schema.invitations.expiresAt,
  createdAt: schema.invitations.createdAt,
  acceptedAt: schema.invitations.acceptedAt,
  invitedByName: schema.users.name,
  invitedByUserId: schema.invitations.invitedBy,
  playerId: schema.players.id,
  playerFirstName: schema.players.firstName,
  playerLastName: schema.players.lastName,
  relationship: schema.invitations.relationship,
  position: schema.invitations.position,
  teamId: schema.teams.id,
  teamName: schema.teams.name,
};

type Row = {
  [K in keyof typeof selection]: (typeof selection)[K]["_"]["data"] | null;
} & { id: string; organizationId: string; email: string; expiresAt: Date; createdAt: Date };

function toRecord(row: Row): InvitationRecord {
  const roleCode = (ROLE_CODES as readonly string[]).includes(row.roleCode ?? "")
    ? (row.roleCode as RoleCode)
    : "guardian";
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    roleCode,
    locale: isLocale(row.locale) ? row.locale : "es",
    status: (row.status ?? "pending") as InvitationStatus,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt ?? null,
    invitedByName: row.invitedByName ?? null,
    invitedByUserId: row.invitedByUserId ?? null,
    player:
      row.playerId && row.playerFirstName !== null && row.playerLastName !== null
        ? { id: row.playerId, firstName: row.playerFirstName, lastName: row.playerLastName }
        : null,
    relationship: (row.relationship as GuardianRelationship | null) ?? null,
    position: (row.position as StaffPosition | null) ?? null,
    team: row.teamId && row.teamName !== null ? { id: row.teamId, name: row.teamName } : null,
  };
}

function expiry(ttlDays: number): Date {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

/**
 * Invitaciones de un club (ADR 0019). Toda operación exige el ámbito del club salvo
 * `findByToken`, cuya clave es el propio token: el que llama compara el club del resultado
 * con el del host antes de hacer nada.
 */
export function invitationsRepo(db: () => Database) {
  const baseQuery = () =>
    db()
      .select(selection)
      .from(schema.invitations)
      .leftJoin(schema.users, eq(schema.users.id, schema.invitations.invitedBy))
      .leftJoin(schema.players, eq(schema.players.id, schema.invitations.playerId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.invitations.teamId));

  async function byId(scope: OrgScope, id: string): Promise<InvitationRecord | null> {
    const rows = await baseQuery()
      .where(
        and(
          eq(schema.invitations.organizationId, scope.organizationId),
          eq(schema.invitations.id, id),
        ),
      )
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  return {
    byId,

    /** Invitaciones del club, las más recientes primero. */
    async list(scope: OrgScope): Promise<InvitationRecord[]> {
      const rows = await baseQuery()
        .where(eq(schema.invitations.organizationId, scope.organizationId))
        .orderBy(desc(schema.invitations.createdAt))
        .limit(200);
      return rows.map(toRecord);
    },

    /** Invitaciones de familia hechas desde la ficha de un jugador (Bloque 11). */
    async listForPlayer(scope: OrgScope, playerId: string): Promise<InvitationRecord[]> {
      const rows = await baseQuery()
        .where(
          and(
            eq(schema.invitations.organizationId, scope.organizationId),
            eq(schema.invitations.playerId, playerId),
          ),
        )
        .orderBy(desc(schema.invitations.createdAt))
        .limit(50);
      return rows.map(toRecord);
    },

    /**
     * Crea una invitación pendiente. Si ya hay una pendiente para ese email, no crea otra.
     * Con `playerId` es una invitación de familia: al aceptarse vincula la cuenta al jugador.
     */
    async create(
      scope: OrgScope,
      input: {
        email: string;
        roleCode: RoleCode;
        locale: Locale;
        invitedBy: string;
        ttlDays: number;
        playerId?: string | undefined;
        relationship?: GuardianRelationship | undefined;
        position?: StaffPosition | null | undefined;
        teamId?: string | null | undefined;
      },
    ): Promise<CreateInvitationResult> {
      const pending = await baseQuery()
        .where(
          and(
            eq(schema.invitations.organizationId, scope.organizationId),
            eq(schema.invitations.email, input.email),
            eq(schema.invitations.status, "pending"),
          ),
        )
        .limit(1);
      if (pending[0]) return { outcome: "pending_exists", invitation: toRecord(pending[0]) };

      const token = generateInvitationToken();
      const inserted = await db()
        .insert(schema.invitations)
        .values({
          organizationId: scope.organizationId,
          email: input.email,
          roleCode: input.roleCode,
          locale: input.locale,
          tokenHash: hashInvitationToken(token),
          expiresAt: expiry(input.ttlDays),
          invitedBy: input.invitedBy,
          playerId: input.playerId ?? null,
          relationship: input.relationship ?? null,
          position: input.position ?? null,
          teamId: input.teamId ?? null,
        })
        .returning({ id: schema.invitations.id });
      const invitation = await byId(scope, inserted[0]!.id);
      if (!invitation) throw new Error("La invitación recién creada no aparece.");
      return { outcome: "created", invitation, token };
    },

    /** Reenvío: token nuevo y caducidad nueva. El enlace anterior deja de valer. Solo pendientes. */
    async rotate(scope: OrgScope, id: string, ttlDays: number): Promise<IssuedInvitation | null> {
      const token = generateInvitationToken();
      const updated = await db()
        .update(schema.invitations)
        .set({ tokenHash: hashInvitationToken(token), expiresAt: expiry(ttlDays) })
        .where(
          and(
            eq(schema.invitations.organizationId, scope.organizationId),
            eq(schema.invitations.id, id),
            eq(schema.invitations.status, "pending"),
          ),
        )
        .returning({ id: schema.invitations.id });
      if (!updated[0]) return null;
      const invitation = await byId(scope, id);
      return invitation ? { invitation, token } : null;
    },

    /** Revoca una pendiente. Devuelve null si no existe en este club o ya no está pendiente. */
    async revoke(scope: OrgScope, id: string): Promise<InvitationRecord | null> {
      const updated = await db()
        .update(schema.invitations)
        .set({ status: "revoked" satisfies InvitationStatus })
        .where(
          and(
            eq(schema.invitations.organizationId, scope.organizationId),
            eq(schema.invitations.id, id),
            eq(schema.invitations.status, "pending"),
          ),
        )
        .returning({ id: schema.invitations.id });
      return updated[0] ? byId(scope, id) : null;
    },

    /**
     * Busca por token en claro. Única consulta sin ámbito previo: el token es la clave y el
     * resultado trae el club para que quien llama lo compare con el host. Devuelve null para
     * tokens con formato inválido sin tocar la base.
     */
    async findByToken(token: string): Promise<InvitationByToken | null> {
      if (!INVITATION_TOKEN_PATTERN.test(token)) return null;
      const rows = await db()
        .select({
          invitation: selection,
          organization: schema.organizations,
          roleName: schema.roles.name,
        })
        .from(schema.invitations)
        .innerJoin(
          schema.organizations,
          eq(schema.organizations.id, schema.invitations.organizationId),
        )
        .innerJoin(schema.roles, eq(schema.roles.code, schema.invitations.roleCode))
        .leftJoin(schema.users, eq(schema.users.id, schema.invitations.invitedBy))
        .leftJoin(schema.players, eq(schema.players.id, schema.invitations.playerId))
        .leftJoin(schema.teams, eq(schema.teams.id, schema.invitations.teamId))
        .where(eq(schema.invitations.tokenHash, hashInvitationToken(token)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        invitation: toRecord(row.invitation),
        organization: row.organization,
        roleName: row.roleName,
      };
    },

    /** Ámbito del club de una invitación encontrada por token, para operar sobre ella. */
    scopeOf(found: InvitationByToken): OrgScope {
      return mintOrgScope(found.organization.id);
    },

    async markAccepted(scope: OrgScope, id: string, userId: string): Promise<void> {
      await db()
        .update(schema.invitations)
        .set({
          status: "accepted" satisfies InvitationStatus,
          acceptedBy: userId,
          acceptedAt: new Date(),
        })
        .where(
          and(
            eq(schema.invitations.organizationId, scope.organizationId),
            eq(schema.invitations.id, id),
            eq(schema.invitations.status, "pending"),
          ),
        );
    },
  };
}

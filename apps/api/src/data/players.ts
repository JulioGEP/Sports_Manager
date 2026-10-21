import { schema, type Database } from "@sportsmanager/db";
import type {
  DevelopmentPlanStatus,
  DominantFoot,
  GuardianRelationship,
  PlayerCreate,
  PlayerMissingFilter,
  PlayerStatus,
  PlayerUpdate,
} from "@sportsmanager/shared";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import { today } from "./player-profile.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Jugadores y familias (Fase 1, Bloque 11, ADR 0028). Datos de menores: solo salen con
 * `org.players.read`, o a su propia familia con `org.family.read`. Siempre con ámbito de club.
 */

export interface PlayerRow {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  /** Fecha de alta en el club (Bloque 13); nula si no se indicó. */
  joinedOn: string | null;
  status: PlayerStatus;
  createdAt: Date;
  /** Ficha ampliada (Bloque 12): clave de la foto en Blobs, pie dominante y altura. */
  photoBlobKey: string | null;
  dominantFoot: DominantFoot | null;
  heightCm: number | null;
}

export interface PlayerSummaryRecord extends PlayerRow {
  teams: { teamId: string; teamName: string }[];
  guardiansCount: number;
  pendingInvitationsCount: number;
}

export interface PlayerTeamRecord {
  teamId: string;
  teamName: string;
  category: string | null;
  sectionName: string;
  seasonId: string;
  seasonName: string;
  seasonIsCurrent: boolean;
  shirtNumber: number | null;
  position: string | null;
}

export interface GuardianRecord {
  userId: string;
  name: string;
  email: string;
  relationship: GuardianRelationship;
}

export interface FamilyPlayerRecord extends PlayerRow {
  relationship: GuardianRelationship;
  teams: {
    teamId: string;
    teamName: string;
    sectionName: string;
    seasonName: string;
    shirtNumber: number | null;
    staff: { userId: string; name: string }[];
  }[];
}

/** Vista de conjunto para los paneles del personal (Bloque 13). */
export interface PlayerOverviewRecord extends PlayerRow {
  teams: { teamId: string; teamName: string }[];
  guardiansCount: number;
  indicators: {
    sport: number | null;
    body: number | null;
    wellbeing: number | null;
    commitment: number | null;
  };
  objective: { progress: number; reviewOn: string | null } | null;
  plan: {
    status: DevelopmentPlanStatus;
    nextReviewOn: string | null;
    physical: boolean;
    emotional: boolean;
  } | null;
  lastNoteOn: string | null;
}

/** Recuentos de operación y preparación de las fichas para el inicio (Bloque 13). */
export interface PlayersOperations {
  pendingInvitations: number;
  playersWithoutPhoto: number;
  playersWithoutObjective: number;
  playersWithoutTeam: number;
  playersWithoutFamily: number;
  objectivesOverdue: number;
  plansOverdue: number;
}

export interface PlayersReadiness {
  total: number;
  percent: number;
  withPhoto: number;
  withBirthDate: number;
  withTeam: number;
  withFamily: number;
  withObjective: number;
  withIndicators: number;
  withPlan: number;
}

const playerSelection = {
  id: schema.players.id,
  firstName: schema.players.firstName,
  lastName: schema.players.lastName,
  birthDate: schema.players.birthDate,
  joinedOn: schema.players.joinedOn,
  status: schema.players.status,
  createdAt: schema.players.createdAt,
  photoBlobKey: schema.players.photoBlobKey,
  dominantFoot: schema.players.dominantFoot,
  heightCm: schema.players.heightCm,
};

const toRow = (row: {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  joinedOn: string | null;
  status: string;
  createdAt: Date;
  photoBlobKey: string | null;
  dominantFoot: string | null;
  heightCm: number | null;
}): PlayerRow => ({
  ...row,
  status: row.status as PlayerStatus,
  dominantFoot: row.dominantFoot as DominantFoot | null,
});

export function playersRepo(db: () => Database) {
  async function byId(scope: OrgScope, id: string): Promise<PlayerRow | null> {
    const rows = await db()
      .select(playerSelection)
      .from(schema.players)
      .where(
        and(eq(schema.players.organizationId, scope.organizationId), eq(schema.players.id, id)),
      )
      .limit(1);
    return rows[0] ? toRow(rows[0]) : null;
  }

  /** Subconsulta: ids de los jugadores en plantilla de la temporada actual (y, si se pide, de unos equipos). */
  const inCurrentRoster = (scope: OrgScope, teamIds?: string[]) =>
    db()
      .select({ id: schema.teamPlayers.playerId })
      .from(schema.teamPlayers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teamPlayers.organizationId, scope.organizationId),
          eq(schema.seasons.isCurrent, true),
          ...(teamIds ? [inArray(schema.teamPlayers.teamId, teamIds)] : []),
        ),
      );
  const withGuardianQuery = (scope: OrgScope) =>
    db()
      .select({ id: schema.playerGuardians.playerId })
      .from(schema.playerGuardians)
      .where(eq(schema.playerGuardians.organizationId, scope.organizationId));
  const withObjectiveQuery = (scope: OrgScope) =>
    db()
      .select({ id: schema.playerObjectives.playerId })
      .from(schema.playerObjectives)
      .where(eq(schema.playerObjectives.organizationId, scope.organizationId));

  /** Equipos de la temporada actual de una lista de jugadores. */
  async function currentTeamsFor(
    scope: OrgScope,
    playerIds: string[],
  ): Promise<Map<string, { teamId: string; teamName: string }[]>> {
    const map = new Map<string, { teamId: string; teamName: string }[]>();
    if (playerIds.length === 0) return map;
    const rows = await db()
      .select({
        playerId: schema.teamPlayers.playerId,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
      })
      .from(schema.teamPlayers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teamPlayers.organizationId, scope.organizationId),
          inArray(schema.teamPlayers.playerId, playerIds),
          eq(schema.seasons.isCurrent, true),
        ),
      )
      .orderBy(asc(schema.teams.name));
    for (const row of rows) {
      const list = map.get(row.playerId) ?? [];
      list.push({ teamId: row.teamId, teamName: row.teamName });
      map.set(row.playerId, list);
    }
    return map;
  }

  async function guardiansCountFor(
    scope: OrgScope,
    playerIds: string[],
  ): Promise<Map<string, number>> {
    if (playerIds.length === 0) return new Map();
    const rows = await db()
      .select({ playerId: schema.playerGuardians.playerId, total: count() })
      .from(schema.playerGuardians)
      .where(
        and(
          eq(schema.playerGuardians.organizationId, scope.organizationId),
          inArray(schema.playerGuardians.playerId, playerIds),
        ),
      )
      .groupBy(schema.playerGuardians.playerId);
    return new Map(rows.map((r) => [r.playerId, r.total]));
  }

  /** Invitaciones de familia pendientes (y vivas) por jugador. */
  async function pendingInvitationsFor(
    scope: OrgScope,
    playerIds: string[],
  ): Promise<Map<string, number>> {
    if (playerIds.length === 0) return new Map();
    const rows = await db()
      .select({ playerId: schema.invitations.playerId, total: count() })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.organizationId, scope.organizationId),
          inArray(schema.invitations.playerId, playerIds),
          eq(schema.invitations.status, "pending"),
          sql`${schema.invitations.expiresAt} > now()`,
        ),
      )
      .groupBy(schema.invitations.playerId);
    return new Map(rows.filter((r) => r.playerId).map((r) => [r.playerId!, r.total]));
  }

  async function guardiansOf(scope: OrgScope, playerId: string): Promise<GuardianRecord[]> {
    const rows = await db()
      .select({
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        relationship: schema.playerGuardians.relationship,
      })
      .from(schema.playerGuardians)
      .innerJoin(schema.users, eq(schema.users.id, schema.playerGuardians.userId))
      .where(
        and(
          eq(schema.playerGuardians.organizationId, scope.organizationId),
          eq(schema.playerGuardians.playerId, playerId),
        ),
      )
      .orderBy(asc(schema.users.name));
    return rows.map((r) => ({ ...r, relationship: r.relationship as GuardianRelationship }));
  }

  async function teamsOf(scope: OrgScope, playerId: string): Promise<PlayerTeamRecord[]> {
    return db()
      .select({
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        category: schema.teams.category,
        sectionName: schema.sections.name,
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        seasonIsCurrent: schema.seasons.isCurrent,
        shirtNumber: schema.teamPlayers.shirtNumber,
        position: schema.teamPlayers.position,
      })
      .from(schema.teamPlayers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .innerJoin(schema.sections, eq(schema.sections.id, schema.teams.sectionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teamPlayers.organizationId, scope.organizationId),
          eq(schema.teamPlayers.playerId, playerId),
        ),
      )
      .orderBy(sql`${schema.seasons.startsOn} desc`, asc(schema.teams.name));
  }

  async function staffFor(
    scope: OrgScope,
    teamIds: string[],
  ): Promise<Map<string, { userId: string; name: string }[]>> {
    const staffBy = new Map<string, { userId: string; name: string }[]>();
    if (teamIds.length === 0) return staffBy;
    const staff = await db()
      .select({
        teamId: schema.teamStaff.teamId,
        userId: schema.users.id,
        name: schema.users.name,
      })
      .from(schema.teamStaff)
      .innerJoin(schema.users, eq(schema.users.id, schema.teamStaff.userId))
      .where(
        and(
          eq(schema.teamStaff.organizationId, scope.organizationId),
          inArray(schema.teamStaff.teamId, teamIds),
        ),
      )
      .orderBy(asc(schema.users.name));
    for (const s of staff) {
      const list = staffBy.get(s.teamId) ?? [];
      list.push({ userId: s.userId, name: s.name });
      staffBy.set(s.teamId, list);
    }
    return staffBy;
  }

  return {
    byId,
    guardiansOf,
    teamsOf,

    /**
     * Jugadores del club con sus equipos de la temporada actual. Búsqueda por nombre, filtro por
     * equipo, por lo que falta en la ficha (Bloque 13) o por una lista de equipos (ámbito propio).
     */
    async list(
      scope: OrgScope,
      filter: {
        query?: string | undefined;
        teamId?: string | undefined;
        missing?: PlayerMissingFilter | undefined;
        teamIds?: string[] | undefined;
      } = {},
    ): Promise<PlayerSummaryRecord[]> {
      const conditions = [eq(schema.players.organizationId, scope.organizationId)];
      const q = filter.query?.trim();
      if (q) {
        const pattern = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        conditions.push(
          or(
            ilike(schema.players.firstName, pattern),
            ilike(schema.players.lastName, pattern),
            ilike(sql`${schema.players.firstName} || ' ' || ${schema.players.lastName}`, pattern),
          )!,
        );
      }
      if (filter.teamId) {
        conditions.push(
          inArray(
            schema.players.id,
            db()
              .select({ id: schema.teamPlayers.playerId })
              .from(schema.teamPlayers)
              .where(
                and(
                  eq(schema.teamPlayers.organizationId, scope.organizationId),
                  eq(schema.teamPlayers.teamId, filter.teamId),
                ),
              ),
          ),
        );
      }
      if (filter.teamIds) {
        if (filter.teamIds.length === 0) return [];
        conditions.push(inArray(schema.players.id, inCurrentRoster(scope, filter.teamIds)));
      }
      if (filter.missing) {
        conditions.push(eq(schema.players.status, "active"));
        if (filter.missing === "photo") conditions.push(isNull(schema.players.photoBlobKey));
        if (filter.missing === "objective")
          conditions.push(notInArray(schema.players.id, withObjectiveQuery(scope)));
        if (filter.missing === "team")
          conditions.push(notInArray(schema.players.id, inCurrentRoster(scope)));
        if (filter.missing === "family")
          conditions.push(notInArray(schema.players.id, withGuardianQuery(scope)));
      }
      const rows = await db()
        .select(playerSelection)
        .from(schema.players)
        .where(and(...conditions))
        .orderBy(asc(schema.players.lastName), asc(schema.players.firstName))
        .limit(500);
      const ids = rows.map((r) => r.id);
      const [teams, guardians, pending] = await Promise.all([
        currentTeamsFor(scope, ids),
        guardiansCountFor(scope, ids),
        pendingInvitationsFor(scope, ids),
      ]);
      return rows.map((row) => ({
        ...toRow(row),
        teams: teams.get(row.id) ?? [],
        guardiansCount: guardians.get(row.id) ?? 0,
        pendingInvitationsCount: pending.get(row.id) ?? 0,
      }));
    },

    /**
     * Vista de conjunto (Bloque 13): jugadores activos con sus indicadores, objetivo y plan, para
     * que cada cargo del personal encuentre a quién mirar hoy. Con `teamIds`, solo esos equipos.
     */
    async overview(
      scope: OrgScope,
      filter: { teamIds?: string[] | undefined } = {},
    ): Promise<PlayerOverviewRecord[]> {
      const conditions = [
        eq(schema.players.organizationId, scope.organizationId),
        eq(schema.players.status, "active"),
      ];
      if (filter.teamIds) {
        if (filter.teamIds.length === 0) return [];
        conditions.push(inArray(schema.players.id, inCurrentRoster(scope, filter.teamIds)));
      }
      const rows = await db()
        .select(playerSelection)
        .from(schema.players)
        .where(and(...conditions))
        .orderBy(asc(schema.players.lastName), asc(schema.players.firstName))
        .limit(500);
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return [];
      const [teams, guardians, indicators, objectives, plans, notes] = await Promise.all([
        currentTeamsFor(scope, ids),
        guardiansCountFor(scope, ids),
        db()
          .select({
            playerId: schema.playerIndicators.playerId,
            dimension: schema.playerIndicators.dimension,
            score: schema.playerIndicators.score,
          })
          .from(schema.playerIndicators)
          .where(
            and(
              eq(schema.playerIndicators.organizationId, scope.organizationId),
              inArray(schema.playerIndicators.playerId, ids),
            ),
          ),
        db()
          .select({
            playerId: schema.playerObjectives.playerId,
            progress: schema.playerObjectives.progress,
            reviewOn: schema.playerObjectives.reviewOn,
          })
          .from(schema.playerObjectives)
          .where(
            and(
              eq(schema.playerObjectives.organizationId, scope.organizationId),
              inArray(schema.playerObjectives.playerId, ids),
            ),
          ),
        db()
          .select({
            playerId: schema.playerDevelopmentPlans.playerId,
            status: schema.playerDevelopmentPlans.status,
            nextReviewOn: schema.playerDevelopmentPlans.nextReviewOn,
            physical: schema.playerDevelopmentPlans.physical,
            emotional: schema.playerDevelopmentPlans.emotional,
          })
          .from(schema.playerDevelopmentPlans)
          .where(
            and(
              eq(schema.playerDevelopmentPlans.organizationId, scope.organizationId),
              inArray(schema.playerDevelopmentPlans.playerId, ids),
            ),
          ),
        db()
          .select({
            playerId: schema.playerEvents.playerId,
            lastOn: sql<string>`max(${schema.playerEvents.happenedOn})`,
          })
          .from(schema.playerEvents)
          .where(
            and(
              eq(schema.playerEvents.organizationId, scope.organizationId),
              inArray(schema.playerEvents.playerId, ids),
              eq(schema.playerEvents.kind, "note"),
            ),
          )
          .groupBy(schema.playerEvents.playerId),
      ]);
      const indicatorsBy = new Map<string, PlayerOverviewRecord["indicators"]>();
      for (const row of indicators) {
        const entry = indicatorsBy.get(row.playerId) ?? {
          sport: null,
          body: null,
          wellbeing: null,
          commitment: null,
        };
        if (row.dimension in entry) entry[row.dimension as keyof typeof entry] = row.score;
        indicatorsBy.set(row.playerId, entry);
      }
      const objectiveBy = new Map(objectives.map((o) => [o.playerId, o]));
      const planBy = new Map(plans.map((p) => [p.playerId, p]));
      const noteBy = new Map(notes.map((n) => [n.playerId, n.lastOn]));
      return rows.map((row) => {
        const plan = planBy.get(row.id);
        const objective = objectiveBy.get(row.id);
        return {
          ...toRow(row),
          teams: teams.get(row.id) ?? [],
          guardiansCount: guardians.get(row.id) ?? 0,
          indicators: indicatorsBy.get(row.id) ?? {
            sport: null,
            body: null,
            wellbeing: null,
            commitment: null,
          },
          objective: objective
            ? { progress: objective.progress, reviewOn: objective.reviewOn }
            : null,
          plan: plan
            ? {
                status: plan.status as DevelopmentPlanStatus,
                nextReviewOn: plan.nextReviewOn,
                physical: Boolean(plan.physical?.trim()),
                emotional: Boolean(plan.emotional?.trim()),
              }
            : null,
          lastNoteOn: noteBy.get(row.id) ?? null,
        };
      });
    },

    /** Recuentos para las alertas y la preparación de fichas del inicio (Bloque 13). */
    async operations(
      scope: OrgScope,
    ): Promise<{ operations: PlayersOperations; readiness: PlayersReadiness }> {
      const active = and(
        eq(schema.players.organizationId, scope.organizationId),
        eq(schema.players.status, "active"),
      );
      const countWhere = async (...conditions: Parameters<typeof and>) => {
        const rows = await db()
          .select({ total: count() })
          .from(schema.players)
          .where(and(active, ...conditions));
        return rows[0]?.total ?? 0;
      };
      const todayIso = today();
      const [
        total,
        withPhoto,
        withBirthDate,
        withTeam,
        withFamily,
        withObjective,
        withIndicators,
        withPlan,
        pendingInvitations,
        objectivesOverdue,
        plansOverdue,
      ] = await Promise.all([
        countWhere(),
        countWhere(isNotNull(schema.players.photoBlobKey)),
        countWhere(isNotNull(schema.players.birthDate)),
        countWhere(inArray(schema.players.id, inCurrentRoster(scope))),
        countWhere(inArray(schema.players.id, withGuardianQuery(scope))),
        countWhere(inArray(schema.players.id, withObjectiveQuery(scope))),
        countWhere(
          inArray(
            schema.players.id,
            db()
              .select({ id: schema.playerIndicators.playerId })
              .from(schema.playerIndicators)
              .where(eq(schema.playerIndicators.organizationId, scope.organizationId))
              .groupBy(schema.playerIndicators.playerId)
              .having(sql`count(*) >= 4`),
          ),
        ),
        countWhere(
          inArray(
            schema.players.id,
            db()
              .select({ id: schema.playerDevelopmentPlans.playerId })
              .from(schema.playerDevelopmentPlans)
              .where(eq(schema.playerDevelopmentPlans.organizationId, scope.organizationId)),
          ),
        ),
        db()
          .select({ total: count() })
          .from(schema.invitations)
          .where(
            and(
              eq(schema.invitations.organizationId, scope.organizationId),
              eq(schema.invitations.status, "pending"),
              sql`${schema.invitations.expiresAt} > now()`,
            ),
          )
          .then((rows) => rows[0]?.total ?? 0),
        countWhere(
          inArray(
            schema.players.id,
            db()
              .select({ id: schema.playerObjectives.playerId })
              .from(schema.playerObjectives)
              .where(
                and(
                  eq(schema.playerObjectives.organizationId, scope.organizationId),
                  lt(schema.playerObjectives.reviewOn, todayIso),
                ),
              ),
          ),
        ),
        countWhere(
          inArray(
            schema.players.id,
            db()
              .select({ id: schema.playerDevelopmentPlans.playerId })
              .from(schema.playerDevelopmentPlans)
              .where(
                and(
                  eq(schema.playerDevelopmentPlans.organizationId, scope.organizationId),
                  lt(schema.playerDevelopmentPlans.nextReviewOn, todayIso),
                ),
              ),
          ),
        ),
      ]);
      const checks = [
        withPhoto,
        withBirthDate,
        withTeam,
        withFamily,
        withObjective,
        withIndicators,
        withPlan,
      ];
      const percent =
        total === 0
          ? 0
          : Math.round((checks.reduce((a, b) => a + b, 0) / (checks.length * total)) * 100);
      return {
        operations: {
          pendingInvitations,
          playersWithoutPhoto: total - withPhoto,
          playersWithoutObjective: total - withObjective,
          playersWithoutTeam: total - withTeam,
          playersWithoutFamily: total - withFamily,
          objectivesOverdue,
          plansOverdue,
        },
        readiness: {
          total,
          percent,
          withPhoto,
          withBirthDate,
          withTeam,
          withFamily,
          withObjective,
          withIndicators,
          withPlan,
        },
      };
    },

    /** Si una persona es cuerpo técnico, esta temporada, de algún equipo donde está el jugador. */
    async isStaffOf(scope: OrgScope, userId: string, playerId: string): Promise<boolean> {
      const rows = await db()
        .select({ id: schema.teamStaff.id })
        .from(schema.teamStaff)
        .innerJoin(schema.teamPlayers, eq(schema.teamPlayers.teamId, schema.teamStaff.teamId))
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamStaff.teamId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .where(
          and(
            eq(schema.teamStaff.organizationId, scope.organizationId),
            eq(schema.teamStaff.userId, userId),
            eq(schema.teamPlayers.playerId, playerId),
            eq(schema.seasons.isCurrent, true),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    /** Si una cuenta está vinculada como familia a un jugador. */
    async isGuardianOf(scope: OrgScope, userId: string, playerId: string): Promise<boolean> {
      const rows = await db()
        .select({ id: schema.playerGuardians.id })
        .from(schema.playerGuardians)
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.userId, userId),
            eq(schema.playerGuardians.playerId, playerId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async create(scope: OrgScope, input: PlayerCreate): Promise<PlayerRow> {
      const rows = await db()
        .insert(schema.players)
        .values({
          organizationId: scope.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate ?? null,
          joinedOn: input.joinedOn ?? null,
        })
        .returning(playerSelection);
      return toRow(rows[0]!);
    },

    async update(scope: OrgScope, id: string, patch: PlayerUpdate): Promise<PlayerRow | null> {
      const values: Partial<typeof schema.players.$inferInsert> = {};
      if (patch.firstName !== undefined) values.firstName = patch.firstName;
      if (patch.lastName !== undefined) values.lastName = patch.lastName;
      if (patch.birthDate !== undefined) values.birthDate = patch.birthDate;
      if (patch.joinedOn !== undefined) values.joinedOn = patch.joinedOn;
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.dominantFoot !== undefined) values.dominantFoot = patch.dominantFoot;
      if (patch.heightCm !== undefined) values.heightCm = patch.heightCm;
      if (Object.keys(values).length === 0) return byId(scope, id);
      const rows = await db()
        .update(schema.players)
        .set(values)
        .where(
          and(eq(schema.players.organizationId, scope.organizationId), eq(schema.players.id, id)),
        )
        .returning(playerSelection);
      return rows[0] ? toRow(rows[0]) : null;
    },

    /** Vincula una cuenta al jugador. Si ya estaba, actualiza la relación. */
    async linkGuardian(
      scope: OrgScope,
      playerId: string,
      userId: string,
      relationship: GuardianRelationship,
    ): Promise<"linked" | "updated"> {
      try {
        await db()
          .insert(schema.playerGuardians)
          .values({ organizationId: scope.organizationId, playerId, userId, relationship });
        return "linked";
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        await db()
          .update(schema.playerGuardians)
          .set({ relationship })
          .where(
            and(
              eq(schema.playerGuardians.organizationId, scope.organizationId),
              eq(schema.playerGuardians.playerId, playerId),
              eq(schema.playerGuardians.userId, userId),
            ),
          );
        return "updated";
      }
    },

    async unlinkGuardian(scope: OrgScope, playerId: string, userId: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.playerGuardians)
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.playerId, playerId),
            eq(schema.playerGuardians.userId, userId),
          ),
        )
        .returning({ id: schema.playerGuardians.id });
      return rows.length > 0;
    },

    /** Lo que ve una familia: sus jugadores con el equipo de la temporada actual y quién lo entrena. */
    async familyOf(scope: OrgScope, userId: string): Promise<FamilyPlayerRecord[]> {
      const rows = await db()
        .select({ ...playerSelection, relationship: schema.playerGuardians.relationship })
        .from(schema.playerGuardians)
        .innerJoin(schema.players, eq(schema.players.id, schema.playerGuardians.playerId))
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.userId, userId),
          ),
        )
        .orderBy(asc(schema.players.firstName), asc(schema.players.lastName));
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const teams = await db()
        .select({
          playerId: schema.teamPlayers.playerId,
          teamId: schema.teams.id,
          teamName: schema.teams.name,
          sectionName: schema.sections.name,
          seasonName: schema.seasons.name,
          shirtNumber: schema.teamPlayers.shirtNumber,
        })
        .from(schema.teamPlayers)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
        .innerJoin(schema.sections, eq(schema.sections.id, schema.teams.sectionId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
        .where(
          and(
            eq(schema.teamPlayers.organizationId, scope.organizationId),
            inArray(schema.teamPlayers.playerId, ids),
            eq(schema.seasons.isCurrent, true),
            eq(schema.teams.status, "active"),
          ),
        )
        .orderBy(asc(schema.teams.name));
      const staffBy = await staffFor(scope, [...new Set(teams.map((t) => t.teamId))]);
      return rows.map((row) => ({
        ...toRow(row),
        relationship: row.relationship as GuardianRelationship,
        teams: teams
          .filter((t) => t.playerId === row.id)
          .map((t) => ({
            teamId: t.teamId,
            teamName: t.teamName,
            sectionName: t.sectionName,
            seasonName: t.seasonName,
            shirtNumber: t.shirtNumber,
            staff: staffBy.get(t.teamId) ?? [],
          })),
      }));
    },

    /**
     * Uno de los suyos, para la ficha de familia (Bloque 13): el jugador con la relación y todos
     * sus equipos con el cuerpo técnico. Nulo si la cuenta no está vinculada a ese jugador.
     */
    async familyPlayer(
      scope: OrgScope,
      userId: string,
      playerId: string,
    ): Promise<
      | (PlayerRow & {
          relationship: GuardianRelationship;
          teams: (PlayerTeamRecord & { staff: { userId: string; name: string }[] })[];
        })
      | null
    > {
      const rows = await db()
        .select({ ...playerSelection, relationship: schema.playerGuardians.relationship })
        .from(schema.playerGuardians)
        .innerJoin(schema.players, eq(schema.players.id, schema.playerGuardians.playerId))
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.userId, userId),
            eq(schema.playerGuardians.playerId, playerId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const teams = await teamsOf(scope, playerId);
      const staffBy = await staffFor(scope, [...new Set(teams.map((t) => t.teamId))]);
      return {
        ...toRow(row),
        relationship: row.relationship as GuardianRelationship,
        teams: teams.map((t) => ({ ...t, staff: staffBy.get(t.teamId) ?? [] })),
      };
    },

    /** Miembros activos del club, para vincular como familia a quien ya tiene cuenta. */
    async eligibleGuardians(
      scope: OrgScope,
    ): Promise<{ userId: string; name: string; email: string }[]> {
      return db()
        .selectDistinct({
          userId: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
        })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.status, "active"),
          ),
        )
        .orderBy(asc(schema.users.name));
    },

    /** Recuento de familias distintas del club (para la portada). */
    async guardiansCount(scope: OrgScope): Promise<number> {
      const rows = await db()
        .select({ total: countDistinct(schema.playerGuardians.userId) })
        .from(schema.playerGuardians)
        .where(eq(schema.playerGuardians.organizationId, scope.organizationId));
      return rows[0]?.total ?? 0;
    },

    /** Últimos jugadores dados de alta (para el inicio, sin datos de más). */
    async recent(scope: OrgScope, limit = 5): Promise<PlayerRow[]> {
      const rows = await db()
        .select(playerSelection)
        .from(schema.players)
        .where(eq(schema.players.organizationId, scope.organizationId))
        .orderBy(desc(schema.players.createdAt))
        .limit(limit);
      return rows.map(toRow);
    },
  };
}

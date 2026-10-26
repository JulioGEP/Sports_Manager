import { schema, type Database } from "@sportsmanager/db";
import type {
  DevelopmentPlanStatus,
  DominantFoot,
  GuardianRelationship,
  PersonGender,
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
 * Deportistas y familias (Fase 1, Bloque 11, ADR 0028; Bloque 14, ADR 0031). Un deportista es
 * la ficha deportiva de una persona del club: nombre, nacimiento, contacto y foto viven en
 * `people`. Datos de menores: solo salen con `org.players.read`, o a su propia familia con
 * `org.family.read`. Siempre con ámbito de club.
 */

export interface PlayerRow {
  id: string;
  personId: string;
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
  /** Datos de la persona (Bloque 14). */
  gender: PersonGender | null;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  userId: string | null;
}

export interface PlayerSummaryRecord extends PlayerRow {
  teams: { teamId: string; teamName: string; sectionId: string; categoryId: string }[];
  guardiansCount: number;
  pendingInvitationsCount: number;
  memberNumber: number | null;
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

/** Lo que un ámbito restringido deja ver (Bloque 19): equipos visibles y deportistas sueltos. */
export interface VisiblePlayers {
  teamIds: string[];
  playerIds: string[];
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
  teamsWithoutStaff: number;
  playersWithoutMembership: number;
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
  personId: schema.players.personId,
  firstName: schema.people.firstName,
  lastName: schema.people.lastName,
  birthDate: schema.people.birthDate,
  joinedOn: schema.players.joinedOn,
  status: schema.players.status,
  createdAt: schema.players.createdAt,
  photoBlobKey: schema.people.photoBlobKey,
  dominantFoot: schema.players.dominantFoot,
  heightCm: schema.players.heightCm,
  gender: schema.people.gender,
  email: schema.people.email,
  phone: schema.people.phone,
  nationalId: schema.people.nationalId,
  userId: schema.people.userId,
};

const toRow = (row: {
  id: string;
  personId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  joinedOn: string | null;
  status: string;
  createdAt: Date;
  photoBlobKey: string | null;
  dominantFoot: string | null;
  heightCm: number | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  userId: string | null;
}): PlayerRow => ({
  ...row,
  status: row.status as PlayerStatus,
  dominantFoot: row.dominantFoot as DominantFoot | null,
  gender: row.gender as PersonGender | null,
});

export function playersRepo(db: () => Database) {
  /** Jugadores con su persona: toda lectura de nombre o foto pasa por aquí. */
  const playersQuery = () =>
    db()
      .select(playerSelection)
      .from(schema.players)
      .innerJoin(schema.people, eq(schema.people.id, schema.players.personId));

  async function byId(scope: OrgScope, id: string): Promise<PlayerRow | null> {
    const rows = await playersQuery()
      .where(
        and(eq(schema.players.organizationId, scope.organizationId), eq(schema.players.id, id)),
      )
      .limit(1);
    return rows[0] ? toRow(rows[0]) : null;
  }

  /** Subconsulta: personas con ficha de socio viva (activa, pendiente o suspendida). */
  const withMembershipQuery = (scope: OrgScope) =>
    db()
      .select({ id: schema.clubMembers.personId })
      .from(schema.clubMembers)
      .where(
        and(
          eq(schema.clubMembers.organizationId, scope.organizationId),
          inArray(schema.clubMembers.status, ["active", "pending", "suspended"]),
        ),
      );

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
  /**
   * Ámbito restringido (Bloque 19): un deportista se ve si está en plantilla de uno de los
   * equipos visibles esta temporada o en la lista de deportistas atendidos.
   */
  const visibleCondition = (scope: OrgScope, visible: VisiblePlayers) => {
    const parts = [];
    if (visible.teamIds.length > 0)
      parts.push(inArray(schema.players.id, inCurrentRoster(scope, visible.teamIds)));
    if (visible.playerIds.length > 0) parts.push(inArray(schema.players.id, visible.playerIds));
    return parts.length === 0 ? sql`false` : or(...parts)!;
  };
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
  ): Promise<
    Map<string, { teamId: string; teamName: string; sectionId: string; categoryId: string }[]>
  > {
    const map = new Map<
      string,
      { teamId: string; teamName: string; sectionId: string; categoryId: string }[]
    >();
    if (playerIds.length === 0) return map;
    const rows = await db()
      .select({
        playerId: schema.teamPlayers.playerId,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        sectionId: schema.teams.sectionId,
        categoryId: schema.teams.categoryId,
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
      list.push({
        teamId: row.teamId,
        teamName: row.teamName,
        sectionId: row.sectionId,
        categoryId: row.categoryId,
      });
      map.set(row.playerId, list);
    }
    return map;
  }

  async function memberNumbersFor(
    scope: OrgScope,
    personIds: string[],
  ): Promise<Map<string, number>> {
    if (personIds.length === 0) return new Map();
    const rows = await db()
      .select({
        personId: schema.clubMembers.personId,
        memberNumber: schema.clubMembers.memberNumber,
      })
      .from(schema.clubMembers)
      .where(
        and(
          eq(schema.clubMembers.organizationId, scope.organizationId),
          inArray(schema.clubMembers.personId, personIds),
        ),
      );
    return new Map(rows.map((r) => [r.personId, r.memberNumber]));
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
        category: schema.categories.name,
        sectionName: schema.sections.name,
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        seasonIsCurrent: schema.seasons.isCurrent,
        shirtNumber: schema.teamPlayers.shirtNumber,
        position: schema.teamPlayers.position,
      })
      .from(schema.teamPlayers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.teams.categoryId))
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
        sectionId?: string | undefined;
        categoryId?: string | undefined;
        missing?: PlayerMissingFilter | undefined;
        teamIds?: string[] | undefined;
        /** Ámbito restringido (Bloque 19): solo lo visible para quien pregunta. */
        visible?: VisiblePlayers | undefined;
      } = {},
    ): Promise<PlayerSummaryRecord[]> {
      const conditions = [eq(schema.players.organizationId, scope.organizationId)];
      if (filter.visible) conditions.push(visibleCondition(scope, filter.visible));
      const q = filter.query?.trim();
      if (q) {
        const pattern = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        conditions.push(
          or(
            ilike(schema.people.firstName, pattern),
            ilike(schema.people.lastName, pattern),
            ilike(sql`${schema.people.firstName} || ' ' || ${schema.people.lastName}`, pattern),
          )!,
        );
      }
      if (filter.sectionId || filter.categoryId) {
        conditions.push(
          inArray(
            schema.players.id,
            db()
              .select({ id: schema.teamPlayers.playerId })
              .from(schema.teamPlayers)
              .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
              .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
              .where(
                and(
                  eq(schema.teamPlayers.organizationId, scope.organizationId),
                  eq(schema.seasons.isCurrent, true),
                  ...(filter.sectionId ? [eq(schema.teams.sectionId, filter.sectionId)] : []),
                  ...(filter.categoryId ? [eq(schema.teams.categoryId, filter.categoryId)] : []),
                ),
              ),
          ),
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
        if (filter.missing === "photo") conditions.push(isNull(schema.people.photoBlobKey));
        if (filter.missing === "objective")
          conditions.push(notInArray(schema.players.id, withObjectiveQuery(scope)));
        if (filter.missing === "team")
          conditions.push(notInArray(schema.players.id, inCurrentRoster(scope)));
        if (filter.missing === "family")
          conditions.push(notInArray(schema.players.id, withGuardianQuery(scope)));
        if (filter.missing === "member")
          conditions.push(notInArray(schema.players.personId, withMembershipQuery(scope)));
      }
      const rows = await playersQuery()
        .where(and(...conditions))
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName))
        .limit(500);
      const ids = rows.map((r) => r.id);
      const [teams, guardians, pending, numbers] = await Promise.all([
        currentTeamsFor(scope, ids),
        guardiansCountFor(scope, ids),
        pendingInvitationsFor(scope, ids),
        memberNumbersFor(
          scope,
          rows.map((r) => r.personId),
        ),
      ]);
      return rows.map((row) => ({
        ...toRow(row),
        teams: teams.get(row.id) ?? [],
        guardiansCount: guardians.get(row.id) ?? 0,
        pendingInvitationsCount: pending.get(row.id) ?? 0,
        memberNumber: numbers.get(row.personId) ?? null,
      }));
    },

    /**
     * Vista de conjunto (Bloque 13): jugadores activos con sus indicadores, objetivo y plan, para
     * que cada cargo del personal encuentre a quién mirar hoy. Con `teamIds`, solo esos equipos.
     */
    async overview(
      scope: OrgScope,
      filter: { teamIds?: string[] | undefined; visible?: VisiblePlayers | undefined } = {},
    ): Promise<PlayerOverviewRecord[]> {
      const conditions = [
        eq(schema.players.organizationId, scope.organizationId),
        eq(schema.players.status, "active"),
      ];
      if (filter.visible) conditions.push(visibleCondition(scope, filter.visible));
      if (filter.teamIds) {
        if (filter.teamIds.length === 0) return [];
        conditions.push(inArray(schema.players.id, inCurrentRoster(scope, filter.teamIds)));
      }
      const rows = await playersQuery()
        .where(and(...conditions))
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName))
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

    /**
     * Recuentos para las alertas y la preparación de fichas del inicio (Bloque 13). Con
     * `visible` (Bloque 19), solo sobre los deportistas y equipos del ámbito de quien pregunta.
     */
    async operations(
      scope: OrgScope,
      visible?: VisiblePlayers,
    ): Promise<{ operations: PlayersOperations; readiness: PlayersReadiness }> {
      const active = and(
        eq(schema.players.organizationId, scope.organizationId),
        eq(schema.players.status, "active"),
        ...(visible ? [visibleCondition(scope, visible)] : []),
      );
      const countWhere = async (...conditions: Parameters<typeof and>) => {
        const rows = await db()
          .select({ total: count() })
          .from(schema.players)
          .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
          .where(and(active, ...conditions));
        return rows[0]?.total ?? 0;
      };
      /** Equipos activos de la temporada actual sin nadie en el cuerpo técnico (Bloque 14). */
      const teamsWithoutStaffQuery = async () => {
        const rows = await db()
          .select({ total: count() })
          .from(schema.teams)
          .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
          .where(
            and(
              eq(schema.teams.organizationId, scope.organizationId),
              eq(schema.teams.status, "active"),
              eq(schema.seasons.isCurrent, true),
              ...(visible
                ? [
                    visible.teamIds.length > 0
                      ? inArray(schema.teams.id, visible.teamIds)
                      : sql`false`,
                  ]
                : []),
              notInArray(
                schema.teams.id,
                db()
                  .select({ id: schema.teamStaff.teamId })
                  .from(schema.teamStaff)
                  .where(eq(schema.teamStaff.organizationId, scope.organizationId)),
              ),
            ),
          );
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
        teamsWithoutStaff,
        withMembership,
      ] = await Promise.all([
        countWhere(),
        countWhere(isNotNull(schema.people.photoBlobKey)),
        countWhere(isNotNull(schema.people.birthDate)),
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
        teamsWithoutStaffQuery(),
        countWhere(inArray(schema.players.personId, withMembershipQuery(scope))),
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
          teamsWithoutStaff,
          playersWithoutMembership: total - withMembership,
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

    /** Preparación de las fichas de un subconjunto (una sección): porcentaje de las siete comprobaciones. */
    async readinessFor(scope: OrgScope, playerIds: string[]): Promise<number | null> {
      if (playerIds.length === 0) return null;
      const subset = and(
        eq(schema.players.organizationId, scope.organizationId),
        eq(schema.players.status, "active"),
        inArray(schema.players.id, playerIds),
      );
      const rows = await db()
        .select({
          total: count(),
          withPhoto: sql<number>`count(*) filter (where ${schema.people.photoBlobKey} is not null)`,
          withBirthDate: sql<number>`count(*) filter (where ${schema.people.birthDate} is not null)`,
          withFamily: sql<number>`count(*) filter (where exists (select 1 from ${schema.playerGuardians} g where g.player_id = ${schema.players.id}))`,
          withObjective: sql<number>`count(*) filter (where exists (select 1 from ${schema.playerObjectives} o where o.player_id = ${schema.players.id}))`,
          withIndicators: sql<number>`count(*) filter (where (select count(*) from ${schema.playerIndicators} i where i.player_id = ${schema.players.id}) >= 4)`,
          withPlan: sql<number>`count(*) filter (where exists (select 1 from ${schema.playerDevelopmentPlans} d where d.player_id = ${schema.players.id}))`,
        })
        .from(schema.players)
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .where(subset);
      const r = rows[0];
      if (!r || r.total === 0) return null;
      // En una sección todos tienen equipo: la comprobación "con equipo" cuenta entera.
      const checks = [
        Number(r.withPhoto),
        Number(r.withBirthDate),
        r.total,
        Number(r.withFamily),
        Number(r.withObjective),
        Number(r.withIndicators),
        Number(r.withPlan),
      ];
      return Math.round((checks.reduce((a, b) => a + b, 0) / (checks.length * r.total)) * 100);
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

    /**
     * Alta de deportista (Bloque 14): sobre una persona que ya existe (un socio adulto) o creando
     * la persona con sus datos. Una persona solo tiene una ficha deportiva.
     */
    async create(
      scope: OrgScope,
      input: PlayerCreate,
    ): Promise<
      | { outcome: "created"; player: PlayerRow }
      | { outcome: "unknown_person" }
      | { outcome: "already_player" }
    > {
      let personId = input.personId ?? null;
      if (personId) {
        const person = await db()
          .select({ id: schema.people.id })
          .from(schema.people)
          .where(
            and(
              eq(schema.people.organizationId, scope.organizationId),
              eq(schema.people.id, personId),
            ),
          )
          .limit(1);
        if (!person[0]) return { outcome: "unknown_person" };
      } else {
        const rows = await db()
          .insert(schema.people)
          .values({
            organizationId: scope.organizationId,
            firstName: input.firstName!,
            lastName: input.lastName!,
            birthDate: input.birthDate ?? null,
            gender: input.gender ?? null,
            email: input.email ?? null,
            phone: input.phone?.trim() ? input.phone.trim() : null,
          })
          .returning({ id: schema.people.id });
        personId = rows[0]!.id;
      }
      try {
        const rows = await db()
          .insert(schema.players)
          .values({
            organizationId: scope.organizationId,
            personId,
            joinedOn: input.joinedOn ?? null,
          })
          .returning({ id: schema.players.id });
        return { outcome: "created", player: (await byId(scope, rows[0]!.id))! };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "already_player" };
        throw error;
      }
    },

    /** Edita la ficha: lo deportivo en `players`, lo personal en `people`. */
    async update(scope: OrgScope, id: string, patch: PlayerUpdate): Promise<PlayerRow | null> {
      const current = await byId(scope, id);
      if (!current) return null;
      const playerValues: Partial<typeof schema.players.$inferInsert> = {};
      if (patch.joinedOn !== undefined) playerValues.joinedOn = patch.joinedOn;
      if (patch.status !== undefined) playerValues.status = patch.status;
      if (patch.dominantFoot !== undefined) playerValues.dominantFoot = patch.dominantFoot;
      if (patch.heightCm !== undefined) playerValues.heightCm = patch.heightCm;
      const personValues: Partial<typeof schema.people.$inferInsert> = {};
      if (patch.firstName !== undefined) personValues.firstName = patch.firstName;
      if (patch.lastName !== undefined) personValues.lastName = patch.lastName;
      if (patch.birthDate !== undefined) personValues.birthDate = patch.birthDate;
      if (patch.gender !== undefined) personValues.gender = patch.gender;
      if (patch.email !== undefined) personValues.email = patch.email;
      if (patch.phone !== undefined)
        personValues.phone = patch.phone?.trim() ? patch.phone.trim() : null;
      if (patch.nationalId !== undefined)
        personValues.nationalId = patch.nationalId?.trim() ? patch.nationalId.trim() : null;
      if (Object.keys(playerValues).length > 0) {
        await db()
          .update(schema.players)
          .set(playerValues)
          .where(
            and(eq(schema.players.organizationId, scope.organizationId), eq(schema.players.id, id)),
          );
      }
      if (Object.keys(personValues).length > 0) {
        await db()
          .update(schema.people)
          .set(personValues)
          .where(
            and(
              eq(schema.people.organizationId, scope.organizationId),
              eq(schema.people.id, current.personId),
            ),
          );
      }
      return byId(scope, id);
    },

    /** Vincula una cuenta al jugador. Si ya estaba, actualiza la relación. */
    async linkGuardian(
      scope: OrgScope,
      playerId: string,
      userId: string,
      relationship: GuardianRelationship,
    ): Promise<"linked" | "updated"> {
      const person = await db()
        .select({ id: schema.people.id })
        .from(schema.people)
        .where(
          and(
            eq(schema.people.organizationId, scope.organizationId),
            eq(schema.people.userId, userId),
          ),
        )
        .limit(1);
      try {
        await db()
          .insert(schema.playerGuardians)
          .values({
            organizationId: scope.organizationId,
            playerId,
            userId,
            relationship,
            guardianPersonId: person[0]?.id ?? null,
          });
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

    /**
     * El deportista entra con su cuenta (ADR 0045): la cuenta pasa a ser la de su persona
     * (`people.user_id`) y queda vinculada a su ficha con la relación `self`, que es lo que le
     * abre lo suyo como a una familia. Una ficha solo tiene una cuenta y una cuenta solo es de una
     * persona del club.
     */
    async linkAthlete(
      scope: OrgScope,
      playerId: string,
      userId: string,
    ): Promise<"linked" | "unknown_player" | "player_taken" | "account_taken"> {
      const rows = await db()
        .select({ personId: schema.people.id, userId: schema.people.userId })
        .from(schema.players)
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.id, playerId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return "unknown_player";
      if (row.userId && row.userId !== userId) return "player_taken";
      if (!row.userId) {
        try {
          const updated = await db()
            .update(schema.people)
            .set({ userId })
            .where(
              and(
                eq(schema.people.organizationId, scope.organizationId),
                eq(schema.people.id, row.personId),
                isNull(schema.people.userId),
              ),
            )
            .returning({ id: schema.people.id });
          if (!updated[0]) return "player_taken";
        } catch (error) {
          if (isUniqueViolation(error)) return "account_taken";
          throw error;
        }
      }
      await db()
        .insert(schema.playerGuardians)
        .values({
          organizationId: scope.organizationId,
          playerId,
          userId,
          relationship: "self",
          guardianPersonId: row.personId,
        })
        .onConflictDoUpdate({
          target: [schema.playerGuardians.playerId, schema.playerGuardians.userId],
          set: { relationship: "self", guardianPersonId: row.personId },
        });
      return "linked";
    },

    /** Quitar el acceso del deportista: su persona deja de tener esa cuenta. */
    async unlinkAthleteAccount(scope: OrgScope, playerId: string, userId: string): Promise<void> {
      const person = db()
        .select({ id: schema.players.personId })
        .from(schema.players)
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            eq(schema.players.id, playerId),
          ),
        );
      await db()
        .update(schema.people)
        .set({ userId: null })
        .where(
          and(
            eq(schema.people.organizationId, scope.organizationId),
            eq(schema.people.userId, userId),
            inArray(schema.people.id, person),
          ),
        );
    },

    /** Lo que ve una familia: sus jugadores con el equipo de la temporada actual y quién lo entrena. */
    async familyOf(scope: OrgScope, userId: string): Promise<FamilyPlayerRecord[]> {
      const rows = await db()
        .select({ ...playerSelection, relationship: schema.playerGuardians.relationship })
        .from(schema.playerGuardians)
        .innerJoin(schema.players, eq(schema.players.id, schema.playerGuardians.playerId))
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            eq(schema.playerGuardians.userId, userId),
          ),
        )
        .orderBy(asc(schema.people.firstName), asc(schema.people.lastName));
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
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
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
      const rows = await playersQuery()
        .where(eq(schema.players.organizationId, scope.organizationId))
        .orderBy(desc(schema.players.createdAt))
        .limit(limit);
      return rows.map(toRow);
    },
  };
}

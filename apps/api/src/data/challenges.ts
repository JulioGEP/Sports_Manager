import { schema, type Database } from "@sportsmanager/db";
import {
  pointsFor,
  type ChallengeArea,
  type ChallengeCreate,
  type ChallengeStatus,
  type ChallengeTaskCreate,
  type ChallengeTaskKind,
  type ChallengeTaskStatus,
  type ChallengeTaskUpdate,
  type ChallengeUpdate,
  type SubmissionStatus,
} from "@sportsmanager/shared";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { today } from "./player-profile.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Retos por puntos (Fase 1, Bloque 13, ADR 0030). Toda consulta lleva el ámbito del club
 * (ADR 0015). Las familias solo ven lo suyo: la agregación por jugador la hace quien llama con
 * el jugador ya comprobado; la agregación del club (participación) solo sale al personal.
 *
 * Ámbito del reto (ADR 0032): cada reto es de una sección y, si se quiere, de un solo equipo.
 * Un jugador participa en los retos activos de las secciones y los equipos donde está esta
 * temporada (`activeFor`); puede tener varios a la vez.
 */

export interface ChallengeRecord {
  id: string;
  name: string;
  description: string | null;
  status: ChallengeStatus;
  section: { id: string; name: string };
  team: { id: string; name: string } | null;
  season: { id: string; name: string } | null;
  startsOn: string | null;
  endsOn: string | null;
  minPoints: number;
  targetPoints: number;
  tasksCount: number;
  participantsCount: number;
  pendingCount: number;
  updatedAt: Date;
}

export interface ChallengeTaskRecord {
  id: string;
  name: string;
  area: ChallengeArea;
  kind: ChallengeTaskKind;
  pointsPerUnit: number;
  maxPoints: number | null;
  status: ChallengeTaskStatus;
  sortOrder: number;
  submissionsCount: number;
}

export interface ChallengeTotals {
  approved: number;
  pending: number;
  byArea: Record<ChallengeArea, number>;
}

export interface SubmissionRecord {
  id: string;
  challengeId: string;
  task: { id: string; name: string; area: ChallengeArea };
  player: { id: string; firstName: string; lastName: string; photoBlobKey: string | null };
  team: { id: string; name: string } | null;
  quantity: number;
  points: number;
  note: string | null;
  happenedOn: string;
  status: SubmissionStatus;
  submittedBy: { userId: string; name: string } | null;
  reviewedBy: { userId: string; name: string } | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

export interface StandingRecord {
  player: { id: string; firstName: string; lastName: string; photoBlobKey: string | null };
  team: { id: string; name: string } | null;
  totals: ChallengeTotals;
  submissionsCount: number;
}

const emptyTotals = (): ChallengeTotals => ({
  approved: 0,
  pending: 0,
  byArea: { training: 0, technique: 0, habits: 0 },
});

export function challengesRepo(db: () => Database) {
  const submitter = { id: schema.users.id, name: schema.users.name };

  /** Recuentos por reto: pruebas activas, jugadores con registros y registros pendientes. */
  async function countsFor(
    scope: OrgScope,
    challengeIds: string[],
  ): Promise<Map<string, { tasks: number; participants: number; pending: number }>> {
    const map = new Map<string, { tasks: number; participants: number; pending: number }>();
    if (challengeIds.length === 0) return map;
    for (const id of challengeIds) map.set(id, { tasks: 0, participants: 0, pending: 0 });
    const tasks = await db()
      .select({ challengeId: schema.challengeTasks.challengeId, total: count() })
      .from(schema.challengeTasks)
      .where(
        and(
          eq(schema.challengeTasks.organizationId, scope.organizationId),
          inArray(schema.challengeTasks.challengeId, challengeIds),
          eq(schema.challengeTasks.status, "active"),
        ),
      )
      .groupBy(schema.challengeTasks.challengeId);
    for (const row of tasks) map.get(row.challengeId)!.tasks = row.total;
    const participants = await db()
      .select({
        challengeId: schema.challengeSubmissions.challengeId,
        total: countDistinct(schema.challengeSubmissions.playerId),
      })
      .from(schema.challengeSubmissions)
      .where(
        and(
          eq(schema.challengeSubmissions.organizationId, scope.organizationId),
          inArray(schema.challengeSubmissions.challengeId, challengeIds),
        ),
      )
      .groupBy(schema.challengeSubmissions.challengeId);
    for (const row of participants) map.get(row.challengeId)!.participants = row.total;
    const pending = await db()
      .select({ challengeId: schema.challengeSubmissions.challengeId, total: count() })
      .from(schema.challengeSubmissions)
      .where(
        and(
          eq(schema.challengeSubmissions.organizationId, scope.organizationId),
          inArray(schema.challengeSubmissions.challengeId, challengeIds),
          eq(schema.challengeSubmissions.status, "submitted"),
        ),
      )
      .groupBy(schema.challengeSubmissions.challengeId);
    for (const row of pending) map.get(row.challengeId)!.pending = row.total;
    return map;
  }

  const challengeQuery = () =>
    db()
      .select({
        id: schema.challenges.id,
        name: schema.challenges.name,
        description: schema.challenges.description,
        status: schema.challenges.status,
        sectionId: schema.sections.id,
        sectionName: schema.sections.name,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        startsOn: schema.challenges.startsOn,
        endsOn: schema.challenges.endsOn,
        minPoints: schema.challenges.minPoints,
        targetPoints: schema.challenges.targetPoints,
        updatedAt: schema.challenges.updatedAt,
      })
      .from(schema.challenges)
      .innerJoin(schema.sections, eq(schema.sections.id, schema.challenges.sectionId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.challenges.teamId))
      .leftJoin(schema.seasons, eq(schema.seasons.id, schema.challenges.seasonId));

  /** Los de toda la sección antes que los de un equipo; dentro, los más nuevos primero. */
  const scopeOrder = () => [
    sql`case when ${schema.challenges.teamId} is null then 0 else 1 end`,
    desc(schema.challenges.createdAt),
  ];

  type ChallengeRow = Awaited<ReturnType<ReturnType<typeof challengeQuery>["execute"]>>[number];
  const toChallenge = (
    row: ChallengeRow,
    counts: { tasks: number; participants: number; pending: number },
  ): ChallengeRecord => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as ChallengeStatus,
    section: { id: row.sectionId, name: row.sectionName },
    team: row.teamId && row.teamName ? { id: row.teamId, name: row.teamName } : null,
    season: row.seasonId && row.seasonName ? { id: row.seasonId, name: row.seasonName } : null,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    minPoints: row.minPoints,
    targetPoints: row.targetPoints,
    tasksCount: counts.tasks,
    participantsCount: counts.participants,
    pendingCount: counts.pending,
    updatedAt: row.updatedAt,
  });

  async function byId(scope: OrgScope, id: string): Promise<ChallengeRecord | null> {
    const rows = await challengeQuery().where(
      and(eq(schema.challenges.organizationId, scope.organizationId), eq(schema.challenges.id, id)),
    );
    const row = rows[0];
    if (!row) return null;
    const counts = await countsFor(scope, [row.id]);
    return toChallenge(row, counts.get(row.id)!);
  }

  async function tasksOf(scope: OrgScope, challengeId: string): Promise<ChallengeTaskRecord[]> {
    const rows = await db()
      .select({
        id: schema.challengeTasks.id,
        name: schema.challengeTasks.name,
        area: schema.challengeTasks.area,
        kind: schema.challengeTasks.kind,
        pointsPerUnit: schema.challengeTasks.pointsPerUnit,
        maxPoints: schema.challengeTasks.maxPoints,
        status: schema.challengeTasks.status,
        sortOrder: schema.challengeTasks.sortOrder,
        submissionsCount: count(schema.challengeSubmissions.id),
      })
      .from(schema.challengeTasks)
      .leftJoin(
        schema.challengeSubmissions,
        eq(schema.challengeSubmissions.taskId, schema.challengeTasks.id),
      )
      .where(
        and(
          eq(schema.challengeTasks.organizationId, scope.organizationId),
          eq(schema.challengeTasks.challengeId, challengeId),
        ),
      )
      .groupBy(schema.challengeTasks.id)
      .orderBy(asc(schema.challengeTasks.sortOrder), asc(schema.challengeTasks.name));
    return rows.map((row) => ({
      ...row,
      area: row.area as ChallengeArea,
      kind: row.kind as ChallengeTaskKind,
      status: row.status as ChallengeTaskStatus,
    }));
  }

  async function taskOf(
    scope: OrgScope,
    challengeId: string,
    taskId: string,
  ): Promise<ChallengeTaskRecord | null> {
    return (await tasksOf(scope, challengeId)).find((t) => t.id === taskId) ?? null;
  }

  /** Equipo de la temporada actual de cada jugador (el primero por nombre, si está en varios). */
  async function currentTeamFor(
    scope: OrgScope,
    playerIds: string[],
  ): Promise<Map<string, { id: string; name: string }>> {
    const map = new Map<string, { id: string; name: string }>();
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
      if (!map.has(row.playerId)) map.set(row.playerId, { id: row.teamId, name: row.teamName });
    }
    return map;
  }

  const submissionQuery = () => {
    const reviewer = {
      id: sql<string | null>`reviewer.id`,
      name: sql<string | null>`reviewer.name`,
    };
    return db()
      .select({
        id: schema.challengeSubmissions.id,
        challengeId: schema.challengeSubmissions.challengeId,
        taskId: schema.challengeTasks.id,
        taskName: schema.challengeTasks.name,
        taskArea: schema.challengeTasks.area,
        playerId: schema.players.id,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        photoBlobKey: schema.people.photoBlobKey,
        quantity: schema.challengeSubmissions.quantity,
        points: schema.challengeSubmissions.points,
        note: schema.challengeSubmissions.note,
        happenedOn: schema.challengeSubmissions.happenedOn,
        status: schema.challengeSubmissions.status,
        submitterId: submitter.id,
        submitterName: submitter.name,
        reviewerId: reviewer.id,
        reviewerName: reviewer.name,
        reviewedAt: schema.challengeSubmissions.reviewedAt,
        reviewNote: schema.challengeSubmissions.reviewNote,
        createdAt: schema.challengeSubmissions.createdAt,
      })
      .from(schema.challengeSubmissions)
      .innerJoin(
        schema.challengeTasks,
        eq(schema.challengeTasks.id, schema.challengeSubmissions.taskId),
      )
      .innerJoin(schema.players, eq(schema.players.id, schema.challengeSubmissions.playerId))
      .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
      .leftJoin(schema.users, eq(schema.users.id, schema.challengeSubmissions.submittedBy))
      .leftJoin(
        sql`${schema.users} as reviewer`,
        sql`reviewer.id = ${schema.challengeSubmissions.reviewedBy}`,
      );
  };
  type SubmissionRow = Awaited<ReturnType<ReturnType<typeof submissionQuery>["execute"]>>[number];
  const toSubmission = (
    row: SubmissionRow,
    team: { id: string; name: string } | null,
  ): SubmissionRecord => ({
    id: row.id,
    challengeId: row.challengeId,
    task: { id: row.taskId, name: row.taskName, area: row.taskArea as ChallengeArea },
    player: {
      id: row.playerId,
      firstName: row.firstName,
      lastName: row.lastName,
      photoBlobKey: row.photoBlobKey,
    },
    team,
    quantity: row.quantity,
    points: row.points,
    note: row.note,
    happenedOn: row.happenedOn,
    status: row.status as SubmissionStatus,
    submittedBy:
      row.submitterId && row.submitterName
        ? { userId: row.submitterId, name: row.submitterName }
        : null,
    reviewedBy:
      row.reviewerId && row.reviewerName
        ? { userId: row.reviewerId, name: row.reviewerName }
        : null,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  });

  async function withTeams(scope: OrgScope, rows: SubmissionRow[]): Promise<SubmissionRecord[]> {
    const teams = await currentTeamFor(scope, [...new Set(rows.map((r) => r.playerId))]);
    return rows.map((row) => toSubmission(row, teams.get(row.playerId) ?? null));
  }

  async function submissionById(scope: OrgScope, id: string): Promise<SubmissionRecord | null> {
    const rows = await submissionQuery()
      .where(
        and(
          eq(schema.challengeSubmissions.organizationId, scope.organizationId),
          eq(schema.challengeSubmissions.id, id),
        ),
      )
      .limit(1);
    const list = await withTeams(scope, rows);
    return list[0] ?? null;
  }

  /** Puntos de un jugador en un reto: aprobados, pendientes y aprobados por área. */
  async function totalsFor(
    scope: OrgScope,
    challengeId: string,
    playerId: string,
  ): Promise<ChallengeTotals> {
    const rows = await db()
      .select({
        status: schema.challengeSubmissions.status,
        area: schema.challengeTasks.area,
        points: sum(schema.challengeSubmissions.points),
      })
      .from(schema.challengeSubmissions)
      .innerJoin(
        schema.challengeTasks,
        eq(schema.challengeTasks.id, schema.challengeSubmissions.taskId),
      )
      .where(
        and(
          eq(schema.challengeSubmissions.organizationId, scope.organizationId),
          eq(schema.challengeSubmissions.challengeId, challengeId),
          eq(schema.challengeSubmissions.playerId, playerId),
        ),
      )
      .groupBy(schema.challengeSubmissions.status, schema.challengeTasks.area);
    const totals = emptyTotals();
    for (const row of rows) {
      const points = Number(row.points ?? 0);
      if (row.status === "approved") {
        totals.approved += points;
        totals.byArea[row.area as ChallengeArea] += points;
      } else if (row.status === "submitted") totals.pending += points;
    }
    return totals;
  }

  /** Comprueba que la sección es del club y que el equipo, si lo hay, es de esa sección. */
  async function checkScope(
    scope: OrgScope,
    sectionId: string,
    teamId: string | null,
  ): Promise<"ok" | "unknown_section" | "unknown_team"> {
    const section = await db()
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(
        and(
          eq(schema.sections.organizationId, scope.organizationId),
          eq(schema.sections.id, sectionId),
        ),
      )
      .limit(1);
    if (!section[0]) return "unknown_section";
    if (teamId) {
      const team = await db()
        .select({ id: schema.teams.id })
        .from(schema.teams)
        .where(
          and(
            eq(schema.teams.organizationId, scope.organizationId),
            eq(schema.teams.id, teamId),
            eq(schema.teams.sectionId, sectionId),
          ),
        )
        .limit(1);
      if (!team[0]) return "unknown_team";
    }
    return "ok";
  }

  /** Equipos de la temporada actual donde está un jugador, como subconsulta. */
  const currentTeamIdsOf = (scope: OrgScope, playerId: string) =>
    db()
      .select({ id: schema.teamPlayers.teamId })
      .from(schema.teamPlayers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teamPlayers.organizationId, scope.organizationId),
          eq(schema.teamPlayers.playerId, playerId),
          eq(schema.seasons.isCurrent, true),
        ),
      );

  /** Secciones de esos equipos, como subconsulta. */
  const currentSectionIdsOf = (scope: OrgScope, playerId: string) =>
    db()
      .select({ id: schema.teams.sectionId })
      .from(schema.teamPlayers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teams.seasonId))
      .where(
        and(
          eq(schema.teamPlayers.organizationId, scope.organizationId),
          eq(schema.teamPlayers.playerId, playerId),
          eq(schema.seasons.isCurrent, true),
        ),
      );

  /** Puntos ya contados (aprobados o pendientes) de una prueba para un jugador: para aplicar el tope. */
  async function earnedForTask(scope: OrgScope, taskId: string, playerId: string): Promise<number> {
    const rows = await db()
      .select({ points: sum(schema.challengeSubmissions.points) })
      .from(schema.challengeSubmissions)
      .where(
        and(
          eq(schema.challengeSubmissions.organizationId, scope.organizationId),
          eq(schema.challengeSubmissions.taskId, taskId),
          eq(schema.challengeSubmissions.playerId, playerId),
          inArray(schema.challengeSubmissions.status, ["approved", "submitted"]),
        ),
      );
    return Number(rows[0]?.points ?? 0);
  }

  return {
    byId,
    tasksOf,
    taskOf,
    totalsFor,
    submissionById,

    /**
     * Retos del club: activos primero, después borradores, después cerrados. Dentro de cada
     * estado, agrupados por sección (en su orden), los de toda la sección antes que los de un
     * equipo, y los más nuevos antes. Con `sectionId`, solo los de esa sección (los de toda la
     * sección y los de cada uno de sus equipos); con `team`, los de ese equipo y los de toda su
     * sección: lo que ve la ficha del equipo, con su histórico.
     */
    async list(
      scope: OrgScope,
      filter: { sectionId?: string | undefined; team?: { id: string; sectionId: string } } = {},
    ): Promise<ChallengeRecord[]> {
      const rows = await challengeQuery()
        .where(
          and(
            eq(schema.challenges.organizationId, scope.organizationId),
            ...(filter.sectionId ? [eq(schema.challenges.sectionId, filter.sectionId)] : []),
            ...(filter.team
              ? [
                  or(
                    eq(schema.challenges.teamId, filter.team.id),
                    and(
                      isNull(schema.challenges.teamId),
                      eq(schema.challenges.sectionId, filter.team.sectionId),
                    ),
                  ),
                ]
              : []),
          ),
        )
        .orderBy(
          sql`case ${schema.challenges.status} when 'active' then 0 when 'draft' then 1 else 2 end`,
          asc(schema.sections.sortOrder),
          asc(schema.sections.name),
          ...scopeOrder(),
        )
        .limit(100);
      const counts = await countsFor(
        scope,
        rows.map((r) => r.id),
      );
      return rows.map((row) => toChallenge(row, counts.get(row.id)!));
    },

    /**
     * Retos activos en los que participa un jugador: los de las secciones donde está esta
     * temporada y los de sus equipos. Los de toda la sección antes. Es lo que ve su familia.
     */
    async activeFor(scope: OrgScope, playerId: string): Promise<ChallengeRecord[]> {
      const rows = await challengeQuery()
        .where(
          and(
            eq(schema.challenges.organizationId, scope.organizationId),
            eq(schema.challenges.status, "active"),
            inArray(schema.challenges.sectionId, currentSectionIdsOf(scope, playerId)),
            or(
              isNull(schema.challenges.teamId),
              inArray(schema.challenges.teamId, currentTeamIdsOf(scope, playerId)),
            ),
          ),
        )
        .orderBy(asc(schema.sections.sortOrder), asc(schema.sections.name), ...scopeOrder())
        .limit(20);
      const counts = await countsFor(
        scope,
        rows.map((r) => r.id),
      );
      return rows.map((row) => toChallenge(row, counts.get(row.id)!));
    },

    /** Registros pendientes en los retos activos del club, o solo de unos equipos. */
    async pendingCount(scope: OrgScope, teamIds?: string[]): Promise<number> {
      if (teamIds && teamIds.length === 0) return 0;
      const rows = await db()
        .select({ total: count() })
        .from(schema.challengeSubmissions)
        .innerJoin(
          schema.challenges,
          eq(schema.challenges.id, schema.challengeSubmissions.challengeId),
        )
        .where(
          and(
            eq(schema.challengeSubmissions.organizationId, scope.organizationId),
            eq(schema.challengeSubmissions.status, "submitted"),
            eq(schema.challenges.status, "active"),
            ...(teamIds
              ? [
                  inArray(
                    schema.challengeSubmissions.playerId,
                    db()
                      .select({ id: schema.teamPlayers.playerId })
                      .from(schema.teamPlayers)
                      .where(
                        and(
                          eq(schema.teamPlayers.organizationId, scope.organizationId),
                          inArray(schema.teamPlayers.teamId, teamIds),
                        ),
                      ),
                  ),
                ]
              : []),
          ),
        );
      return rows[0]?.total ?? 0;
    },

    async create(
      scope: OrgScope,
      input: ChallengeCreate,
      createdBy: string,
      defaultTasks: ChallengeTaskCreate[] = [],
    ): Promise<ChallengeRecord | "unknown_season" | "unknown_section" | "unknown_team"> {
      const scopeCheck = await checkScope(scope, input.sectionId, input.teamId ?? null);
      if (scopeCheck !== "ok") return scopeCheck;
      if (input.seasonId) {
        const season = await db()
          .select({ id: schema.seasons.id })
          .from(schema.seasons)
          .where(
            and(
              eq(schema.seasons.organizationId, scope.organizationId),
              eq(schema.seasons.id, input.seasonId),
            ),
          )
          .limit(1);
        if (!season[0]) return "unknown_season";
      }
      const id = await db().transaction(async (tx) => {
        const rows = await tx
          .insert(schema.challenges)
          .values({
            organizationId: scope.organizationId,
            sectionId: input.sectionId,
            teamId: input.teamId ?? null,
            seasonId: input.seasonId ?? null,
            name: input.name,
            description: input.description?.trim() ? input.description.trim() : null,
            startsOn: input.startsOn ?? null,
            endsOn: input.endsOn ?? null,
            minPoints: input.minPoints,
            targetPoints: input.targetPoints,
            status: input.status ?? "draft",
            createdBy,
          })
          .returning({ id: schema.challenges.id });
        const challengeId = rows[0]!.id;
        if (defaultTasks.length > 0) {
          await tx.insert(schema.challengeTasks).values(
            defaultTasks.map((task, index) => ({
              organizationId: scope.organizationId,
              challengeId,
              name: task.name,
              area: task.area,
              kind: task.kind,
              pointsPerUnit: task.pointsPerUnit,
              maxPoints: task.maxPoints ?? null,
              sortOrder: (index + 1) * 10,
            })),
          );
        }
        return challengeId;
      });
      const created = await byId(scope, id);
      if (!created) throw new Error("El reto recién creado no aparece.");
      return created;
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: ChallengeUpdate,
    ): Promise<
      ChallengeRecord | "not_found" | "unknown_season" | "unknown_section" | "unknown_team"
    > {
      const values: Partial<typeof schema.challenges.$inferInsert> = {};
      if (patch.sectionId !== undefined || patch.teamId !== undefined) {
        const current = await byId(scope, id);
        if (!current) return "not_found";
        const sectionId = patch.sectionId ?? current.section.id;
        // Al cambiar de sección sin decir equipo, el equipo anterior ya no vale: pasa a toda la sección.
        const teamId =
          patch.teamId !== undefined
            ? patch.teamId
            : sectionId === current.section.id
              ? (current.team?.id ?? null)
              : null;
        const scopeCheck = await checkScope(scope, sectionId, teamId);
        if (scopeCheck !== "ok") return scopeCheck;
        values.sectionId = sectionId;
        values.teamId = teamId;
      }
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.description !== undefined)
        values.description = patch.description?.trim() ? patch.description.trim() : null;
      if (patch.startsOn !== undefined) values.startsOn = patch.startsOn;
      if (patch.endsOn !== undefined) values.endsOn = patch.endsOn;
      if (patch.minPoints !== undefined) values.minPoints = patch.minPoints;
      if (patch.targetPoints !== undefined) values.targetPoints = patch.targetPoints;
      if (patch.status !== undefined) {
        values.status = patch.status;
        values.closedAt = patch.status === "closed" ? new Date() : null;
      }
      if (patch.seasonId !== undefined) {
        if (patch.seasonId) {
          const season = await db()
            .select({ id: schema.seasons.id })
            .from(schema.seasons)
            .where(
              and(
                eq(schema.seasons.organizationId, scope.organizationId),
                eq(schema.seasons.id, patch.seasonId),
              ),
            )
            .limit(1);
          if (!season[0]) return "unknown_season";
        }
        values.seasonId = patch.seasonId;
      }
      if (Object.keys(values).length > 0) {
        const rows = await db()
          .update(schema.challenges)
          .set(values)
          .where(
            and(
              eq(schema.challenges.organizationId, scope.organizationId),
              eq(schema.challenges.id, id),
            ),
          )
          .returning({ id: schema.challenges.id });
        if (!rows[0]) return "not_found";
      }
      return (await byId(scope, id)) ?? "not_found";
    },

    async createTask(
      scope: OrgScope,
      challengeId: string,
      input: ChallengeTaskCreate,
    ): Promise<ChallengeTaskRecord> {
      const last = await db()
        .select({ max: sql<number>`coalesce(max(${schema.challengeTasks.sortOrder}), 0)` })
        .from(schema.challengeTasks)
        .where(
          and(
            eq(schema.challengeTasks.organizationId, scope.organizationId),
            eq(schema.challengeTasks.challengeId, challengeId),
          ),
        );
      const rows = await db()
        .insert(schema.challengeTasks)
        .values({
          organizationId: scope.organizationId,
          challengeId,
          name: input.name,
          area: input.area,
          kind: input.kind,
          pointsPerUnit: input.pointsPerUnit,
          maxPoints: input.maxPoints ?? null,
          sortOrder: Number(last[0]?.max ?? 0) + 10,
        })
        .returning({ id: schema.challengeTasks.id });
      const task = await taskOf(scope, challengeId, rows[0]!.id);
      if (!task) throw new Error("La prueba recién creada no aparece.");
      return task;
    },

    async updateTask(
      scope: OrgScope,
      challengeId: string,
      taskId: string,
      patch: ChallengeTaskUpdate,
    ): Promise<ChallengeTaskRecord | null> {
      const values: Partial<typeof schema.challengeTasks.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.area !== undefined) values.area = patch.area;
      if (patch.kind !== undefined) values.kind = patch.kind;
      if (patch.pointsPerUnit !== undefined) values.pointsPerUnit = patch.pointsPerUnit;
      if (patch.maxPoints !== undefined) values.maxPoints = patch.maxPoints;
      if (patch.status !== undefined) values.status = patch.status;
      if (Object.keys(values).length > 0) {
        const rows = await db()
          .update(schema.challengeTasks)
          .set(values)
          .where(
            and(
              eq(schema.challengeTasks.organizationId, scope.organizationId),
              eq(schema.challengeTasks.challengeId, challengeId),
              eq(schema.challengeTasks.id, taskId),
            ),
          )
          .returning({ id: schema.challengeTasks.id });
        if (!rows[0]) return null;
      }
      return taskOf(scope, challengeId, taskId);
    },

    /** Borra una prueba sin registros; con registros, la archiva para no perder puntos. */
    async removeTask(
      scope: OrgScope,
      challengeId: string,
      taskId: string,
    ): Promise<"removed" | "archived" | "not_found"> {
      const task = await taskOf(scope, challengeId, taskId);
      if (!task) return "not_found";
      if (task.submissionsCount > 0) {
        await db()
          .update(schema.challengeTasks)
          .set({ status: "archived" })
          .where(
            and(
              eq(schema.challengeTasks.organizationId, scope.organizationId),
              eq(schema.challengeTasks.id, taskId),
            ),
          );
        return "archived";
      }
      await db()
        .delete(schema.challengeTasks)
        .where(
          and(
            eq(schema.challengeTasks.organizationId, scope.organizationId),
            eq(schema.challengeTasks.id, taskId),
          ),
        );
      return "removed";
    },

    /**
     * Registro de una familia: calcula los puntos con el tope de la prueba (lo ya contado de esa
     * prueba para ese jugador se descuenta). Nace pendiente de validación.
     */
    async submit(
      scope: OrgScope,
      input: {
        challengeId: string;
        taskId: string;
        playerId: string;
        submittedBy: string;
        quantity: number;
        note: string | null;
        happenedOn: string | undefined;
      },
    ): Promise<SubmissionRecord | "unknown_task" | "task_archived"> {
      const task = await taskOf(scope, input.challengeId, input.taskId);
      if (!task) return "unknown_task";
      if (task.status !== "active") return "task_archived";
      const earned = await earnedForTask(scope, task.id, input.playerId);
      const points = pointsFor(task, input.quantity, earned);
      const rows = await db()
        .insert(schema.challengeSubmissions)
        .values({
          organizationId: scope.organizationId,
          challengeId: input.challengeId,
          taskId: task.id,
          playerId: input.playerId,
          submittedBy: input.submittedBy,
          quantity: input.quantity,
          points,
          note: input.note?.trim() ? input.note.trim() : null,
          happenedOn: input.happenedOn ?? today(),
        })
        .returning({ id: schema.challengeSubmissions.id });
      const created = await submissionById(scope, rows[0]!.id);
      if (!created) throw new Error("El registro recién creado no aparece.");
      return created;
    },

    /** La familia retira un registro suyo que todavía nadie ha validado. */
    async removeOwnSubmission(
      scope: OrgScope,
      id: string,
      submittedBy: string,
    ): Promise<SubmissionRecord | null> {
      const existing = await submissionById(scope, id);
      if (!existing || existing.status !== "submitted") return null;
      if (existing.submittedBy?.userId !== submittedBy) return null;
      await db()
        .delete(schema.challengeSubmissions)
        .where(
          and(
            eq(schema.challengeSubmissions.organizationId, scope.organizationId),
            eq(schema.challengeSubmissions.id, id),
          ),
        );
      return existing;
    },

    async review(
      scope: OrgScope,
      id: string,
      input: { decision: "approved" | "rejected"; note: string | null; reviewedBy: string },
    ): Promise<SubmissionRecord | null> {
      const rows = await db()
        .update(schema.challengeSubmissions)
        .set({
          status: input.decision,
          reviewedBy: input.reviewedBy,
          reviewedAt: new Date(),
          reviewNote: input.note?.trim() ? input.note.trim() : null,
        })
        .where(
          and(
            eq(schema.challengeSubmissions.organizationId, scope.organizationId),
            eq(schema.challengeSubmissions.id, id),
          ),
        )
        .returning({ id: schema.challengeSubmissions.id });
      return rows[0] ? submissionById(scope, id) : null;
    },

    /** Registros de un reto, para validar: por estado y, si se pide, solo de unos equipos. */
    async submissions(
      scope: OrgScope,
      challengeId: string,
      filter: { status?: SubmissionStatus | undefined; teamIds?: string[] | undefined } = {},
    ): Promise<SubmissionRecord[]> {
      if (filter.teamIds && filter.teamIds.length === 0) return [];
      const rows = await submissionQuery()
        .where(
          and(
            eq(schema.challengeSubmissions.organizationId, scope.organizationId),
            eq(schema.challengeSubmissions.challengeId, challengeId),
            ...(filter.status ? [eq(schema.challengeSubmissions.status, filter.status)] : []),
            ...(filter.teamIds
              ? [
                  inArray(
                    schema.challengeSubmissions.playerId,
                    db()
                      .select({ id: schema.teamPlayers.playerId })
                      .from(schema.teamPlayers)
                      .where(
                        and(
                          eq(schema.teamPlayers.organizationId, scope.organizationId),
                          inArray(schema.teamPlayers.teamId, filter.teamIds),
                        ),
                      ),
                  ),
                ]
              : []),
          ),
        )
        .orderBy(
          sql`case ${schema.challengeSubmissions.status} when 'submitted' then 0 else 1 end`,
          desc(schema.challengeSubmissions.happenedOn),
          desc(schema.challengeSubmissions.createdAt),
        )
        .limit(500);
      return withTeams(scope, rows);
    },

    /** Registros de un jugador en un reto, del más reciente al más antiguo. */
    async submissionsOfPlayer(
      scope: OrgScope,
      challengeId: string,
      playerId: string,
    ): Promise<SubmissionRecord[]> {
      const rows = await submissionQuery()
        .where(
          and(
            eq(schema.challengeSubmissions.organizationId, scope.organizationId),
            eq(schema.challengeSubmissions.challengeId, challengeId),
            eq(schema.challengeSubmissions.playerId, playerId),
          ),
        )
        .orderBy(
          desc(schema.challengeSubmissions.happenedOn),
          desc(schema.challengeSubmissions.createdAt),
        )
        .limit(200);
      return withTeams(scope, rows);
    },

    /**
     * Participación: puntos por jugador, para el personal. Con `teamIds`, solo esos equipos.
     * Nunca sale a las familias (DESIGN.md 10).
     */
    async standings(
      scope: OrgScope,
      challengeId: string,
      filter: { teamIds?: string[] | undefined } = {},
    ): Promise<StandingRecord[]> {
      if (filter.teamIds && filter.teamIds.length === 0) return [];
      const rows = await db()
        .select({
          playerId: schema.players.id,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
          photoBlobKey: schema.people.photoBlobKey,
          status: schema.challengeSubmissions.status,
          area: schema.challengeTasks.area,
          points: sum(schema.challengeSubmissions.points),
          total: count(),
        })
        .from(schema.challengeSubmissions)
        .innerJoin(schema.players, eq(schema.players.id, schema.challengeSubmissions.playerId))
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .innerJoin(
          schema.challengeTasks,
          eq(schema.challengeTasks.id, schema.challengeSubmissions.taskId),
        )
        .where(
          and(
            eq(schema.challengeSubmissions.organizationId, scope.organizationId),
            eq(schema.challengeSubmissions.challengeId, challengeId),
            ...(filter.teamIds
              ? [
                  inArray(
                    schema.players.id,
                    db()
                      .select({ id: schema.teamPlayers.playerId })
                      .from(schema.teamPlayers)
                      .where(
                        and(
                          eq(schema.teamPlayers.organizationId, scope.organizationId),
                          inArray(schema.teamPlayers.teamId, filter.teamIds),
                        ),
                      ),
                  ),
                ]
              : []),
          ),
        )
        .groupBy(
          schema.players.id,
          schema.people.firstName,
          schema.people.lastName,
          schema.people.photoBlobKey,
          schema.challengeSubmissions.status,
          schema.challengeTasks.area,
        );
      const byPlayer = new Map<string, StandingRecord>();
      for (const row of rows) {
        const entry = byPlayer.get(row.playerId) ?? {
          player: {
            id: row.playerId,
            firstName: row.firstName,
            lastName: row.lastName,
            photoBlobKey: row.photoBlobKey,
          },
          team: null,
          totals: emptyTotals(),
          submissionsCount: 0,
        };
        const points = Number(row.points ?? 0);
        entry.submissionsCount += row.total;
        if (row.status === "approved") {
          entry.totals.approved += points;
          entry.totals.byArea[row.area as ChallengeArea] += points;
        } else if (row.status === "submitted") entry.totals.pending += points;
        byPlayer.set(row.playerId, entry);
      }
      const teams = await currentTeamFor(scope, [...byPlayer.keys()]);
      return [...byPlayer.values()]
        .map((entry) => ({ ...entry, team: teams.get(entry.player.id) ?? null }))
        .sort(
          (a, b) =>
            b.totals.approved - a.totals.approved ||
            a.player.lastName.localeCompare(b.player.lastName) ||
            a.player.firstName.localeCompare(b.player.firstName),
        );
    },

    /** Puntos aprobados por jugador al cerrar un reto, para dejar el rastro en su timeline. */
    async approvedByPlayer(scope: OrgScope, challengeId: string): Promise<Map<string, number>> {
      const rows = await db()
        .select({
          playerId: schema.challengeSubmissions.playerId,
          points: sum(schema.challengeSubmissions.points),
        })
        .from(schema.challengeSubmissions)
        .where(
          and(
            eq(schema.challengeSubmissions.organizationId, scope.organizationId),
            eq(schema.challengeSubmissions.challengeId, challengeId),
            eq(schema.challengeSubmissions.status, "approved"),
          ),
        )
        .groupBy(schema.challengeSubmissions.playerId);
      return new Map(rows.map((r) => [r.playerId, Number(r.points ?? 0)]));
    },
  };
}

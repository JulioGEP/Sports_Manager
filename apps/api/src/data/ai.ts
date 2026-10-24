import { schema, type Database } from "@sportsmanager/db";
import {
  AI_QUOTA_STATUSES,
  AI_STALE_MINUTES,
  type AiContext,
  type AiDraftRequest,
  type AiFailure,
  type AiGenerationStatus,
  type AiProfileCode,
  type AiProposalOutput,
  type AiProposalResolved,
  type AiUsage,
  type SectionEquipmentCreate,
  type SectionEquipmentUpdate,
} from "@sportsmanager/shared";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, sql, sum } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import { mintOrgScope, type OrgScope } from "./scope.ts";

/**
 * Propuesta de sesión con IA (ADR 0044): el inventario de material de cada sección, la cuota
 * semanal del club y el registro de cada propuesta. Toda consulta lleva el ámbito del club
 * (ADR 0015), salvo la del trabajo en segundo plano, que solo conoce el id de la propuesta y saca
 * el club de su fila.
 */

export interface SectionEquipmentRecord {
  id: string;
  name: string;
  quantity: number | null;
  notes: string | null;
}

export interface AiGenerationRecord {
  id: string;
  sectionId: string;
  team: { id: string; name: string };
  requestedBy: { userId: string; name: string } | null;
  weekStart: string;
  status: AiGenerationStatus;
  failure: AiFailure | null;
  profileCode: AiProfileCode;
  profileVersion: number;
  model: string;
  request: AiDraftRequest;
  context: AiContext;
  proposal: AiProposalResolved | null;
  createdAt: Date;
  finishedAt: Date | null;
  appliedAt: Date | null;
}

/** Un entrenamiento de la agenda a planificar, con lo que la propuesta necesita saber de él. */
export interface AiTrainingEvent {
  id: string;
  startsAt: Date;
  endsAt: Date;
  facility: { id: string; name: string; kind: string; description: string | null } | null;
  session: { id: string; objective: string | null; mdLabel: string | null } | null;
}

export interface NewGeneration {
  sectionId: string;
  teamId: string;
  requestedBy: string;
  weekStart: string;
  profileCode: AiProfileCode;
  profileVersion: number;
  model: string;
  request: AiDraftRequest;
  context: AiContext;
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export function aiRepo(db: () => Database) {
  const g = schema.aiGenerations;

  const selection = {
    id: g.id,
    sectionId: g.sectionId,
    teamId: g.teamId,
    teamName: schema.teams.name,
    requestedBy: g.requestedBy,
    requestedByName: schema.users.name,
    weekStart: g.weekStart,
    status: g.status,
    failure: g.failure,
    profileCode: g.profileCode,
    profileVersion: g.profileVersion,
    model: g.model,
    request: g.request,
    context: g.context,
    proposal: g.proposal,
    createdAt: g.createdAt,
    finishedAt: g.finishedAt,
    appliedAt: g.appliedAt,
  };
  type Row = {
    id: string;
    sectionId: string;
    teamId: string;
    teamName: string;
    requestedBy: string | null;
    requestedByName: string | null;
    weekStart: string;
    status: string;
    failure: string | null;
    profileCode: string;
    profileVersion: number;
    model: string;
    request: AiDraftRequest;
    context: AiContext;
    proposal: AiProposalResolved | null;
    createdAt: Date;
    finishedAt: Date | null;
    appliedAt: Date | null;
  };
  const toRecord = (r: Row): AiGenerationRecord => ({
    id: r.id,
    sectionId: r.sectionId,
    team: { id: r.teamId, name: r.teamName },
    requestedBy:
      r.requestedBy && r.requestedByName
        ? { userId: r.requestedBy, name: r.requestedByName }
        : null,
    weekStart: r.weekStart,
    status: r.status as AiGenerationStatus,
    failure: r.failure as AiFailure | null,
    profileCode: r.profileCode as AiProfileCode,
    profileVersion: r.profileVersion,
    model: r.model,
    request: r.request,
    context: r.context,
    proposal: r.proposal,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
    appliedAt: r.appliedAt,
  });
  const base = () =>
    db()
      .select(selection)
      .from(g)
      .innerJoin(schema.teams, eq(schema.teams.id, g.teamId))
      .leftJoin(schema.users, eq(schema.users.id, g.requestedBy));

  /** Las que llevan demasiado en cola o generándose se dan por perdidas y devuelven su cuota. */
  async function failStale(organizationId: string) {
    const limit = new Date(Date.now() - AI_STALE_MINUTES * 60_000);
    await db()
      .update(g)
      .set({ status: "failed", failure: "timeout", finishedAt: new Date() })
      .where(
        and(
          eq(g.organizationId, organizationId),
          inArray(g.status, ["queued", "running"]),
          lt(g.createdAt, limit),
        ),
      );
  }

  async function usedIn(
    organizationId: string,
    weekStart: string,
    exec: Pick<Database, "select"> = db(),
  ) {
    const rows = await exec
      .select({ total: count() })
      .from(g)
      .where(
        and(
          eq(g.organizationId, organizationId),
          eq(g.weekStart, weekStart),
          inArray(g.status, [...AI_QUOTA_STATUSES]),
        ),
      );
    return rows[0]?.total ?? 0;
  }

  return {
    /** Entrenamientos de un equipo por id (solo los de tipo entrenamiento y de ese equipo). */
    async trainingEvents(
      scope: OrgScope,
      teamId: string,
      ids: string[],
    ): Promise<AiTrainingEvent[]> {
      if (ids.length === 0) return [];
      const rows = await db()
        .select({
          id: schema.events.id,
          startsAt: schema.events.startsAt,
          endsAt: schema.events.endsAt,
          facilityId: schema.facilities.id,
          facilityName: schema.facilities.name,
          facilityKind: schema.facilities.kind,
          facilityDescription: schema.facilities.description,
          sessionId: schema.trainingSessions.id,
          objective: schema.trainingSessions.objective,
          mdLabel: schema.trainingSessions.mdLabel,
        })
        .from(schema.events)
        .leftJoin(schema.facilities, eq(schema.facilities.id, schema.events.facilityId))
        .leftJoin(schema.trainingSessions, eq(schema.trainingSessions.eventId, schema.events.id))
        .where(
          and(
            eq(schema.events.organizationId, scope.organizationId),
            eq(schema.events.teamId, teamId),
            eq(schema.events.kind, "training"),
            inArray(schema.events.id, ids),
          ),
        )
        .orderBy(asc(schema.events.startsAt));
      return rows.map((r) => ({
        id: r.id,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        facility:
          r.facilityId && r.facilityName
            ? {
                id: r.facilityId,
                name: r.facilityName,
                kind: r.facilityKind ?? "other",
                description: r.facilityDescription,
              }
            : null,
        session: r.sessionId
          ? { id: r.sessionId, objective: r.objective, mdLabel: r.mdLabel }
          : null,
      }));
    },

    // --- Material ---

    async equipmentOf(scope: OrgScope, sectionId: string): Promise<SectionEquipmentRecord[]> {
      return db()
        .select({
          id: schema.sectionEquipment.id,
          name: schema.sectionEquipment.name,
          quantity: schema.sectionEquipment.quantity,
          notes: schema.sectionEquipment.notes,
        })
        .from(schema.sectionEquipment)
        .where(
          and(
            eq(schema.sectionEquipment.organizationId, scope.organizationId),
            eq(schema.sectionEquipment.sectionId, sectionId),
          ),
        )
        .orderBy(asc(schema.sectionEquipment.sortOrder), asc(schema.sectionEquipment.name));
    },

    async createEquipment(
      scope: OrgScope,
      sectionId: string,
      input: SectionEquipmentCreate,
    ): Promise<SectionEquipmentRecord | "exists"> {
      try {
        const rows = await db()
          .insert(schema.sectionEquipment)
          .values({
            organizationId: scope.organizationId,
            sectionId,
            name: input.name.trim(),
            quantity: input.quantity ?? null,
            notes: clean(input.notes),
          })
          .returning({
            id: schema.sectionEquipment.id,
            name: schema.sectionEquipment.name,
            quantity: schema.sectionEquipment.quantity,
            notes: schema.sectionEquipment.notes,
          });
        return rows[0]!;
      } catch (error) {
        if (isUniqueViolation(error)) return "exists";
        throw error;
      }
    },

    async updateEquipment(
      scope: OrgScope,
      sectionId: string,
      id: string,
      patch: SectionEquipmentUpdate,
    ): Promise<SectionEquipmentRecord | "exists" | null> {
      try {
        const rows = await db()
          .update(schema.sectionEquipment)
          .set({
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
            ...(patch.notes !== undefined ? { notes: clean(patch.notes) } : {}),
          })
          .where(
            and(
              eq(schema.sectionEquipment.organizationId, scope.organizationId),
              eq(schema.sectionEquipment.sectionId, sectionId),
              eq(schema.sectionEquipment.id, id),
            ),
          )
          .returning({
            id: schema.sectionEquipment.id,
            name: schema.sectionEquipment.name,
            quantity: schema.sectionEquipment.quantity,
            notes: schema.sectionEquipment.notes,
          });
        return rows[0] ?? null;
      } catch (error) {
        if (isUniqueViolation(error)) return "exists";
        throw error;
      }
    },

    async removeEquipment(scope: OrgScope, sectionId: string, id: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.sectionEquipment)
        .where(
          and(
            eq(schema.sectionEquipment.organizationId, scope.organizationId),
            eq(schema.sectionEquipment.sectionId, sectionId),
            eq(schema.sectionEquipment.id, id),
          ),
        )
        .returning({ id: schema.sectionEquipment.id });
      return rows.length > 0;
    },

    // --- Cuota ---

    async weeklyQuota(scope: OrgScope): Promise<number> {
      const rows = await db()
        .select({ quota: schema.organizations.aiWeeklyQuota })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, scope.organizationId))
        .limit(1);
      return rows[0]?.quota ?? 0;
    },

    async setWeeklyQuota(scope: OrgScope, quota: number): Promise<void> {
      await db()
        .update(schema.organizations)
        .set({ aiWeeklyQuota: quota })
        .where(eq(schema.organizations.id, scope.organizationId));
    },

    async usedThisWeek(scope: OrgScope, weekStart: string): Promise<number> {
      await failStale(scope.organizationId);
      return usedIn(scope.organizationId, weekStart);
    },

    /**
     * Reserva una propuesta dentro de la cuota de la semana. El bloqueo de la fila del club hace
     * que dos peticiones a la vez no gasten la misma plaza.
     */
    async reserve(
      scope: OrgScope,
      input: NewGeneration,
    ): Promise<{ id: string } | "quota_exceeded"> {
      await failStale(scope.organizationId);
      return db().transaction(async (tx) => {
        const org = await tx
          .select({ quota: schema.organizations.aiWeeklyQuota })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, scope.organizationId))
          .for("update");
        const quota = org[0]?.quota ?? 0;
        if ((await usedIn(scope.organizationId, input.weekStart, tx)) >= quota)
          return "quota_exceeded" as const;
        const rows = await tx
          .insert(g)
          .values({ organizationId: scope.organizationId, status: "queued", ...input })
          .returning({ id: g.id });
        return { id: rows[0]!.id };
      });
    },

    // --- Propuestas ---

    async byId(scope: OrgScope, id: string): Promise<AiGenerationRecord | null> {
      await failStale(scope.organizationId);
      const rows = await base()
        .where(and(eq(g.organizationId, scope.organizationId), eq(g.id, id)))
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async listForTeam(scope: OrgScope, teamId: string, limit = 8): Promise<AiGenerationRecord[]> {
      await failStale(scope.organizationId);
      const rows = await base()
        .where(and(eq(g.organizationId, scope.organizationId), eq(g.teamId, teamId)))
        .orderBy(desc(g.createdAt))
        .limit(limit);
      return rows.map((r) => toRecord(r));
    },

    /**
     * El trabajo en segundo plano toma la propuesta: solo si sigue en cola, así una segunda
     * llamada con el mismo id no vuelve a gastar. Devuelve el club para seguir con su ámbito.
     */
    async claim(id: string): Promise<{ scope: OrgScope; record: AiGenerationRecord } | null> {
      const claimed = await db()
        .update(g)
        .set({ status: "running", startedAt: new Date() })
        .where(and(eq(g.id, id), eq(g.status, "queued")))
        .returning({ organizationId: g.organizationId });
      const organizationId = claimed[0]?.organizationId;
      if (!organizationId) return null;
      const rows = await base().where(eq(g.id, id)).limit(1);
      return rows[0] ? { scope: mintOrgScope(organizationId), record: toRecord(rows[0]) } : null;
    },

    async markReady(
      scope: OrgScope,
      id: string,
      result: {
        model: string;
        output: AiProposalOutput;
        proposal: AiProposalResolved;
        usage: AiUsage;
        costMicros: number;
        durationMs: number;
      },
    ) {
      await db()
        .update(g)
        .set({
          status: "ready",
          model: result.model,
          output: result.output,
          proposal: result.proposal,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          cacheWriteTokens: result.usage.cacheWriteTokens,
          costMicros: result.costMicros,
          durationMs: result.durationMs,
          finishedAt: new Date(),
        })
        .where(and(eq(g.organizationId, scope.organizationId), eq(g.id, id)));
    },

    /** Falla: devuelve la plaza de la cuota pero guarda lo que costó, si llegó a costar. */
    async markFailed(
      scope: OrgScope,
      id: string,
      failure: AiFailure,
      spent?: { usage: AiUsage; costMicros: number; durationMs: number },
    ) {
      await db()
        .update(g)
        .set({
          status: "failed",
          failure,
          finishedAt: new Date(),
          ...(spent
            ? {
                inputTokens: spent.usage.inputTokens,
                outputTokens: spent.usage.outputTokens,
                cacheReadTokens: spent.usage.cacheReadTokens,
                cacheWriteTokens: spent.usage.cacheWriteTokens,
                costMicros: spent.costMicros,
                durationMs: spent.durationMs,
              }
            : {}),
        })
        .where(and(eq(g.organizationId, scope.organizationId), eq(g.id, id)));
    },

    async markApplied(scope: OrgScope, id: string, userId: string, items: number) {
      await db()
        .update(g)
        .set({
          appliedAt: new Date(),
          appliedBy: userId,
          appliedItems: sql`${g.appliedItems} + ${items}`,
        })
        .where(and(eq(g.organizationId, scope.organizationId), eq(g.id, id)));
    },

    /** Para la plataforma: uso, fallos, coste y cuántas tareas propuestas siguen en su sesión. */
    async stats(scope: OrgScope, since: Date) {
      const where = and(eq(g.organizationId, scope.organizationId), gte(g.createdAt, since));
      const [totals, failed, applied] = await Promise.all([
        db()
          .select({
            requests: count(),
            cost: sum(g.costMicros),
            appliedItems: sum(g.appliedItems),
          })
          .from(g)
          .where(where),
        db()
          .select({ total: count() })
          .from(g)
          .where(and(where, eq(g.status, "failed"))),
        db()
          .select({ total: count() })
          .from(g)
          .where(and(where, isNotNull(g.appliedAt))),
      ]);
      const kept = await db()
        .select({ total: count() })
        .from(schema.trainingSessionItems)
        .innerJoin(g, eq(g.id, schema.trainingSessionItems.aiGenerationId))
        .where(
          and(
            eq(schema.trainingSessionItems.organizationId, scope.organizationId),
            gte(g.createdAt, since),
          ),
        );
      return {
        requests: totals[0]?.requests ?? 0,
        failed: failed[0]?.total ?? 0,
        applied: applied[0]?.total ?? 0,
        costMicros: Number(totals[0]?.cost ?? 0),
        appliedItems: Number(totals[0]?.appliedItems ?? 0),
        keptItems: kept[0]?.total ?? 0,
      };
    },
  };
}

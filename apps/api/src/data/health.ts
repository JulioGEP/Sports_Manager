import { schema, type Database } from "@sportsmanager/db";
import {
  HEALTH_CONSENT_TEXT_VERSION,
  type BodyArea,
  type BodySide,
  type ConsentRelationship,
  type HealthConsentSet,
  type InjuryContext,
  type InjuryCreate,
  type InjuryKind,
  type InjuryMechanism,
  type InjuryStatus,
  type InjuryUpdate,
  type RehabPhasesSet,
} from "@sportsmanager/shared";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { OrgScope } from "./scope.ts";

/**
 * Salud (Bloque 24, ADR 0038): consentimiento, lesiones con diagnóstico y fases de readaptación.
 * Categoría especial del RGPD: solo se llega aquí con `org.health.read` y cada lectura queda en la
 * auditoría (lo hace la ruta). Toda consulta lleva el ámbito del club (ADR 0015).
 */

export interface ConsentRecord {
  grantedByName: string;
  relationship: ConsentRelationship;
  grantedOn: string;
  textVersion: string;
  revokedOn: string | null;
}

export interface InjuryRecord {
  id: string;
  playerId: string;
  occurredOn: string;
  context: InjuryContext;
  eventId: string | null;
  matchId: string | null;
  bodyArea: BodyArea;
  side: BodySide;
  kind: InjuryKind;
  mechanism: InjuryMechanism;
  recurrence: boolean;
  diagnosis: string | null;
  clinicalNotes: string | null;
  expectedReturnOn: string | null;
  returnedOn: string | null;
  status: InjuryStatus;
  phases: {
    id: string;
    name: string;
    criteria: string | null;
    startedOn: string | null;
    doneOn: string | null;
  }[];
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export function healthRepo(db: () => Database) {
  const injurySelection = {
    id: schema.injuries.id,
    playerId: schema.injuries.playerId,
    occurredOn: schema.injuries.occurredOn,
    context: schema.injuries.context,
    eventId: schema.injuries.eventId,
    matchId: schema.injuries.matchId,
    bodyArea: schema.injuries.bodyArea,
    side: schema.injuries.side,
    kind: schema.injuries.kind,
    mechanism: schema.injuries.mechanism,
    recurrence: schema.injuries.recurrence,
    diagnosis: schema.injuries.diagnosis,
    clinicalNotes: schema.injuries.clinicalNotes,
    expectedReturnOn: schema.injuries.expectedReturnOn,
    returnedOn: schema.injuries.returnedOn,
    status: schema.injuries.status,
  };

  async function phasesOf(scope: OrgScope, injuryIds: string[]) {
    const out = new Map<string, InjuryRecord["phases"]>();
    if (injuryIds.length === 0) return out;
    const rows = await db()
      .select({
        id: schema.rehabPhases.id,
        injuryId: schema.rehabPhases.injuryId,
        name: schema.rehabPhases.name,
        criteria: schema.rehabPhases.criteria,
        startedOn: schema.rehabPhases.startedOn,
        doneOn: schema.rehabPhases.doneOn,
      })
      .from(schema.rehabPhases)
      .where(
        and(
          eq(schema.rehabPhases.organizationId, scope.organizationId),
          inArray(schema.rehabPhases.injuryId, injuryIds),
        ),
      )
      .orderBy(asc(schema.rehabPhases.sortOrder));
    for (const r of rows) {
      const { injuryId, ...phase } = r;
      out.set(injuryId, [...(out.get(injuryId) ?? []), phase]);
    }
    return out;
  }

  async function injuriesWhere(
    scope: OrgScope,
    where: ReturnType<typeof and>,
  ): Promise<InjuryRecord[]> {
    const rows = await db()
      .select(injurySelection)
      .from(schema.injuries)
      .where(and(eq(schema.injuries.organizationId, scope.organizationId), where))
      .orderBy(desc(schema.injuries.occurredOn));
    const phases = await phasesOf(
      scope,
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      ...r,
      context: r.context as InjuryContext,
      bodyArea: r.bodyArea as BodyArea,
      side: r.side as BodySide,
      kind: r.kind as InjuryKind,
      mechanism: r.mechanism as InjuryMechanism,
      status: r.status as InjuryStatus,
      phases: phases.get(r.id) ?? [],
    }));
  }

  async function consentOf(scope: OrgScope, playerId: string): Promise<ConsentRecord | null> {
    const rows = await db()
      .select({
        grantedByName: schema.healthConsents.grantedByName,
        relationship: schema.healthConsents.relationship,
        grantedOn: schema.healthConsents.grantedOn,
        textVersion: schema.healthConsents.textVersion,
        revokedOn: schema.healthConsents.revokedOn,
      })
      .from(schema.healthConsents)
      .where(
        and(
          eq(schema.healthConsents.organizationId, scope.organizationId),
          eq(schema.healthConsents.playerId, playerId),
        ),
      )
      .limit(1);
    const r = rows[0];
    return r ? { ...r, relationship: r.relationship as ConsentRelationship } : null;
  }

  async function injuryById(scope: OrgScope, id: string): Promise<InjuryRecord | null> {
    return (await injuriesWhere(scope, and(eq(schema.injuries.id, id))))[0] ?? null;
  }

  return {
    consentOf,

    /** Consentimiento vigente: dado y sin revocar. */
    async hasConsent(scope: OrgScope, playerId: string): Promise<boolean> {
      const c = await consentOf(scope, playerId);
      return c !== null && c.revokedOn === null;
    },

    async setConsent(
      scope: OrgScope,
      playerId: string,
      input: HealthConsentSet,
      recordedBy: string,
    ): Promise<ConsentRecord> {
      const values = {
        grantedByName: input.grantedByName,
        relationship: input.relationship,
        grantedOn: input.grantedOn,
        textVersion: input.textVersion ?? HEALTH_CONSENT_TEXT_VERSION,
        revokedOn: null,
        recordedBy,
      };
      await db()
        .insert(schema.healthConsents)
        .values({ organizationId: scope.organizationId, playerId, ...values })
        .onConflictDoUpdate({ target: [schema.healthConsents.playerId], set: values });
      return (await consentOf(scope, playerId))!;
    },

    async revokeConsent(scope: OrgScope, playerId: string, today: string): Promise<boolean> {
      const rows = await db()
        .update(schema.healthConsents)
        .set({ revokedOn: today })
        .where(
          and(
            eq(schema.healthConsents.organizationId, scope.organizationId),
            eq(schema.healthConsents.playerId, playerId),
            isNull(schema.healthConsents.revokedOn),
          ),
        )
        .returning({ id: schema.healthConsents.id });
      return rows.length > 0;
    },

    async injuriesOf(scope: OrgScope, playerId: string): Promise<InjuryRecord[]> {
      return injuriesWhere(scope, and(eq(schema.injuries.playerId, playerId)));
    },

    /** Lesiones sin cerrar de unos jugadores (enfermería). */
    async openInjuries(scope: OrgScope, playerIds: string[]): Promise<InjuryRecord[]> {
      if (playerIds.length === 0) return [];
      return injuriesWhere(
        scope,
        and(inArray(schema.injuries.playerId, playerIds), ne(schema.injuries.status, "recovered")),
      );
    },

    injuryById,

    async createInjury(
      scope: OrgScope,
      playerId: string,
      input: InjuryCreate,
      createdBy: string,
    ): Promise<InjuryRecord> {
      const rows = await db()
        .insert(schema.injuries)
        .values({
          organizationId: scope.organizationId,
          playerId,
          occurredOn: input.occurredOn,
          context: input.context,
          eventId: input.eventId ?? null,
          matchId: input.matchId ?? null,
          bodyArea: input.bodyArea,
          side: input.side,
          kind: input.kind,
          mechanism: input.mechanism,
          recurrence: input.recurrence ?? false,
          diagnosis: clean(input.diagnosis),
          clinicalNotes: clean(input.clinicalNotes),
          expectedReturnOn: input.expectedReturnOn ?? null,
          createdBy,
        })
        .returning({ id: schema.injuries.id });
      return (await injuryById(scope, rows[0]!.id))!;
    },

    async updateInjury(
      scope: OrgScope,
      id: string,
      patch: InjuryUpdate,
    ): Promise<InjuryRecord | null> {
      const set: Partial<typeof schema.injuries.$inferInsert> = {};
      if (patch.occurredOn !== undefined) set.occurredOn = patch.occurredOn;
      if (patch.context !== undefined) set.context = patch.context;
      if (patch.eventId !== undefined) set.eventId = patch.eventId;
      if (patch.matchId !== undefined) set.matchId = patch.matchId;
      if (patch.bodyArea !== undefined) set.bodyArea = patch.bodyArea;
      if (patch.side !== undefined) set.side = patch.side;
      if (patch.kind !== undefined) set.kind = patch.kind;
      if (patch.mechanism !== undefined) set.mechanism = patch.mechanism;
      if (patch.recurrence !== undefined) set.recurrence = patch.recurrence;
      if (patch.diagnosis !== undefined) set.diagnosis = clean(patch.diagnosis);
      if (patch.clinicalNotes !== undefined) set.clinicalNotes = clean(patch.clinicalNotes);
      if (patch.expectedReturnOn !== undefined) set.expectedReturnOn = patch.expectedReturnOn;
      if (patch.returnedOn !== undefined) set.returnedOn = patch.returnedOn;
      if (patch.status !== undefined) set.status = patch.status;
      if (Object.keys(set).length > 0)
        await db()
          .update(schema.injuries)
          .set(set)
          .where(
            and(
              eq(schema.injuries.organizationId, scope.organizationId),
              eq(schema.injuries.id, id),
            ),
          );
      return injuryById(scope, id);
    },

    async setPhases(scope: OrgScope, injuryId: string, input: RehabPhasesSet): Promise<void> {
      await db().transaction(async (tx) => {
        await tx
          .delete(schema.rehabPhases)
          .where(
            and(
              eq(schema.rehabPhases.organizationId, scope.organizationId),
              eq(schema.rehabPhases.injuryId, injuryId),
            ),
          );
        if (input.phases.length > 0)
          await tx.insert(schema.rehabPhases).values(
            input.phases.map((p, i) => ({
              organizationId: scope.organizationId,
              injuryId,
              sortOrder: (i + 1) * 10,
              name: p.name,
              criteria: clean(p.criteria),
              startedOn: p.startedOn ?? null,
              doneOn: p.doneOn ?? null,
            })),
          );
      });
    },

    async removeInjury(scope: OrgScope, id: string): Promise<boolean> {
      const rows = await db()
        .delete(schema.injuries)
        .where(
          and(eq(schema.injuries.organizationId, scope.organizationId), eq(schema.injuries.id, id)),
        )
        .returning({ id: schema.injuries.id });
      return rows.length > 0;
    },
  };
}

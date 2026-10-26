import { schema, type Database } from "@sportsmanager/db";
import {
  isOrderedSuggestion,
  isPublicSuggestion,
  isVotableSuggestion,
  SUGGESTION_DAILY_LIMIT,
  SUGGESTION_ORDERED_STATUSES,
  SUGGESTION_PUBLIC_STATUSES,
  type PlatformSuggestionCreate,
  type PlatformSuggestionUpdate,
  type SuggestionArea,
  type SuggestionCreate,
  type SuggestionStatus,
} from "@sportsmanager/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { OrgScope } from "./scope.ts";

/**
 * Mejoras de la plataforma (ADR 0047). Dos caras:
 * - La del club, siempre con su ámbito: lo que ha enviado él y la hoja de ruta (lo publicado), con
 *   sus votos y si este club la pidió o la votó. Nunca qué otro club pidió o votó qué.
 * - La de la plataforma, sin ámbito: la bandeja entera, para revisar, publicar, ordenar y unir.
 */

export interface RoadmapItemRecord {
  id: string;
  title: string;
  body: string | null;
  area: SuggestionArea;
  status: (typeof SUGGESTION_PUBLIC_STATUSES)[number];
  eta: string | null;
  position: number | null;
  votes: number;
  votedByClub: boolean;
  requestedByClub: boolean;
  publishedAt: Date | null;
  releasedAt: Date | null;
}

export interface ClubSuggestionRecord {
  id: string;
  title: string;
  body: string;
  area: SuggestionArea;
  status: SuggestionStatus;
  createdAt: Date;
  createdBy: string | null;
  response: string | null;
  reviewedAt: Date | null;
  publicTitle: string | null;
  eta: string | null;
  votes: number;
  mergedInto: {
    id: string;
    title: string;
    status: (typeof SUGGESTION_PUBLIC_STATUSES)[number];
    eta: string | null;
  } | null;
}

export interface PlatformSuggestionRecord {
  id: string;
  title: string;
  body: string;
  area: SuggestionArea;
  status: SuggestionStatus;
  organization: { slug: string; name: string } | null;
  createdBy: { name: string; email: string } | null;
  createdAt: Date;
  publicTitle: string | null;
  publicBody: string | null;
  response: string | null;
  eta: string | null;
  position: number | null;
  votes: number;
  mergedInto: { id: string; title: string } | null;
  mergedCount: number;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  publishedAt: Date | null;
  releasedAt: Date | null;
}

export type SuggestionUpdateResult =
  | { outcome: "ok" }
  | { outcome: "not_found" }
  /** Unir exige otra mejora que exista y que no esté unida a su vez a otra. */
  | { outcome: "invalid_merge" };

export type VoteResult = "ok" | "not_found" | "closed";

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export function suggestionsRepo(db: () => Database) {
  const s = schema.suggestions;
  const v = schema.suggestionVotes;
  const target = alias(schema.suggestions, "target");
  const reviewer = alias(schema.users, "reviewer");

  /*
   * Subconsultas con nombres explícitos: sin joins, Drizzle escribe las columnas de la tabla
   * principal sin prefijo, y dentro de la subconsulta `"id"` sería el de la otra tabla.
   */
  const votes =
    sql<number>`(select count(*) from "suggestion_votes" "vote" where "vote"."suggestion_id" = "suggestions"."id")`.mapWith(
      Number,
    );

  /** Siguiente puesto en lo que viene: detrás del último. */
  async function nextPosition(exec: Pick<Database, "select">): Promise<number> {
    const rows = await exec
      .select({ max: sql<number | null>`max(${s.position})` })
      .from(s)
      .where(inArray(s.status, [...SUGGESTION_ORDERED_STATUSES]));
    return Number(rows[0]?.max ?? 0) + 1;
  }

  async function roadmapRows(scope: OrgScope, id?: string): Promise<RoadmapItemRecord[]> {
    const rows = await db()
      .select({
        id: s.id,
        title: s.publicTitle,
        body: s.publicBody,
        area: s.area,
        status: s.status,
        eta: s.eta,
        position: s.position,
        votes,
        votedByClub: sql<boolean>`exists (select 1 from "suggestion_votes" "vote" where "vote"."suggestion_id" = "suggestions"."id" and "vote"."organization_id" = ${scope.organizationId}::uuid)`,
        // Pedida por este club, directamente o con una petición suya que se unió a esta.
        requestedByClub: sql<boolean>`("suggestions"."organization_id" is not distinct from ${scope.organizationId}::uuid or exists (select 1 from "suggestions" "child" where "child"."merged_into_id" = "suggestions"."id" and "child"."organization_id" = ${scope.organizationId}::uuid))`,
        publishedAt: s.publishedAt,
        releasedAt: s.releasedAt,
      })
      .from(s)
      .where(
        and(inArray(s.status, [...SUGGESTION_PUBLIC_STATUSES]), id ? eq(s.id, id) : undefined),
      );
    return rows.map((r) => ({
      ...r,
      title: r.title ?? "",
      area: r.area as SuggestionArea,
      status: r.status as RoadmapItemRecord["status"],
    }));
  }

  async function clubRows(scope: OrgScope, id?: string): Promise<ClubSuggestionRecord[]> {
    const rows = await db()
      .select({
        id: s.id,
        title: s.title,
        body: s.body,
        area: s.area,
        status: s.status,
        createdAt: s.createdAt,
        createdBy: schema.users.name,
        response: s.response,
        reviewedAt: s.reviewedAt,
        publicTitle: s.publicTitle,
        eta: s.eta,
        votes,
        targetId: target.id,
        targetTitle: target.publicTitle,
        targetStatus: target.status,
        targetEta: target.eta,
      })
      .from(s)
      .leftJoin(schema.users, eq(schema.users.id, s.createdBy))
      .leftJoin(target, eq(target.id, s.mergedIntoId))
      .where(and(eq(s.organizationId, scope.organizationId), id ? eq(s.id, id) : undefined))
      .orderBy(desc(s.createdAt));
    return rows.map((r) => {
      const status = r.status as SuggestionStatus;
      const targetStatus = r.targetStatus as SuggestionStatus | null;
      return {
        id: r.id,
        title: r.title,
        body: r.body,
        area: r.area as SuggestionArea,
        status,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        response: r.response,
        reviewedAt: r.reviewedAt,
        publicTitle: isPublicSuggestion(status) ? r.publicTitle : null,
        eta: isPublicSuggestion(status) ? r.eta : null,
        votes: r.votes,
        // La mejora a la que se unió, solo si es pública: si no, el club no tiene nada que ver.
        mergedInto:
          status === "merged" && r.targetId && targetStatus && isPublicSuggestion(targetStatus)
            ? {
                id: r.targetId,
                title: r.targetTitle ?? "",
                status: targetStatus as RoadmapItemRecord["status"],
                eta: r.targetEta,
              }
            : null,
      };
    });
  }

  async function platformRows(id?: string): Promise<PlatformSuggestionRecord[]> {
    const rows = await db()
      .select({
        id: s.id,
        title: s.title,
        body: s.body,
        area: s.area,
        status: s.status,
        orgSlug: schema.organizations.slug,
        orgName: schema.organizations.name,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        createdAt: s.createdAt,
        publicTitle: s.publicTitle,
        publicBody: s.publicBody,
        response: s.response,
        eta: s.eta,
        position: s.position,
        votes,
        targetId: target.id,
        targetTitle: sql<string | null>`coalesce(${target.publicTitle}, ${target.title})`,
        mergedCount:
          sql<number>`(select count(*) from "suggestions" "child" where "child"."merged_into_id" = "suggestions"."id")`.mapWith(
            Number,
          ),
        reviewedBy: reviewer.name,
        reviewedAt: s.reviewedAt,
        publishedAt: s.publishedAt,
        releasedAt: s.releasedAt,
      })
      .from(s)
      .leftJoin(schema.organizations, eq(schema.organizations.id, s.organizationId))
      .leftJoin(schema.users, eq(schema.users.id, s.createdBy))
      .leftJoin(reviewer, eq(reviewer.id, s.reviewedBy))
      .leftJoin(target, eq(target.id, s.mergedIntoId))
      .where(id ? eq(s.id, id) : undefined)
      .orderBy(desc(s.createdAt));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      area: r.area as SuggestionArea,
      status: r.status as SuggestionStatus,
      organization: r.orgSlug && r.orgName ? { slug: r.orgSlug, name: r.orgName } : null,
      createdBy:
        r.authorName && r.authorEmail ? { name: r.authorName, email: r.authorEmail } : null,
      createdAt: r.createdAt,
      publicTitle: r.publicTitle,
      publicBody: r.publicBody,
      response: r.response,
      eta: r.eta,
      position: r.position,
      votes: r.votes,
      mergedInto: r.targetId ? { id: r.targetId, title: r.targetTitle ?? "" } : null,
      mergedCount: r.mergedCount,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      publishedAt: r.publishedAt,
      releasedAt: r.releasedAt,
    }));
  }

  /** Lo que tenía votado una mejora pasa a otra; un club que ya la votaba no cuenta dos veces. */
  async function moveVotes(exec: Pick<Database, "execute">, fromId: string, toId: string) {
    await exec.execute(sql`
      insert into "suggestion_votes" ("suggestion_id", "organization_id", "user_id", "created_at")
      select ${toId}::uuid, "organization_id", "user_id", "created_at" from "suggestion_votes"
      where "suggestion_id" = ${fromId}::uuid
      on conflict ("suggestion_id", "organization_id") do nothing`);
  }

  return {
    // --- El club ---

    /** La hoja de ruta para un club, sin ordenar (el orden es de `orderRoadmap`). */
    roadmap: (scope: OrgScope) => roadmapRows(scope),

    async roadmapItem(scope: OrgScope, id: string): Promise<RoadmapItemRecord | null> {
      return (await roadmapRows(scope, id))[0] ?? null;
    },

    listForClub: (scope: OrgScope) => clubRows(scope),

    async clubSuggestion(scope: OrgScope, id: string): Promise<ClubSuggestionRecord | null> {
      return (await clubRows(scope, id))[0] ?? null;
    },

    /**
     * Envía una sugerencia y la vota el propio club: quien la pide la quiere. El tope de 24 horas
     * se cuenta con la fila del club bloqueada, así dos envíos a la vez no se lo saltan.
     */
    async create(
      scope: OrgScope,
      userId: string,
      input: SuggestionCreate,
    ): Promise<{ id: string } | "limit"> {
      return db().transaction(async (tx) => {
        await tx
          .select({ id: schema.organizations.id })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, scope.organizationId))
          .for("update");
        const recent = await tx
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(s)
          .where(
            and(
              eq(s.organizationId, scope.organizationId),
              sql`${s.createdAt} > now() - interval '24 hours'`,
            ),
          );
        if ((recent[0]?.n ?? 0) >= SUGGESTION_DAILY_LIMIT) return "limit" as const;
        const rows = await tx
          .insert(s)
          .values({
            organizationId: scope.organizationId,
            createdBy: userId,
            title: input.title.trim(),
            body: input.body.trim(),
            area: input.area,
            status: "submitted",
          })
          .returning({ id: s.id });
        const id = rows[0]!.id;
        await tx
          .insert(v)
          .values({ suggestionId: id, organizationId: scope.organizationId, userId });
        return { id };
      });
    },

    /** El voto del club a una mejora publicada. Lo no publicado no existe para el club. */
    async vote(scope: OrgScope, userId: string, id: string): Promise<VoteResult> {
      const rows = await db().select({ status: s.status }).from(s).where(eq(s.id, id)).limit(1);
      const status = rows[0]?.status as SuggestionStatus | undefined;
      if (!status || !isPublicSuggestion(status)) return "not_found";
      if (!isVotableSuggestion(status)) return "closed";
      await db()
        .insert(v)
        .values({ suggestionId: id, organizationId: scope.organizationId, userId })
        .onConflictDoNothing();
      return "ok";
    },

    async unvote(scope: OrgScope, id: string): Promise<VoteResult> {
      const rows = await db().select({ status: s.status }).from(s).where(eq(s.id, id)).limit(1);
      const status = rows[0]?.status as SuggestionStatus | undefined;
      if (!status || !isPublicSuggestion(status)) return "not_found";
      if (!isVotableSuggestion(status)) return "closed";
      await db()
        .delete(v)
        .where(and(eq(v.suggestionId, id), eq(v.organizationId, scope.organizationId)));
      return "ok";
    },

    // --- La plataforma ---

    listAll: () => platformRows(),

    async byId(id: string): Promise<PlatformSuggestionRecord | null> {
      return (await platformRows(id))[0] ?? null;
    },

    /** Una mejora que la plataforma pone en la hoja de ruta sin que la pida un club. */
    async createByPlatform(userId: string, input: PlatformSuggestionCreate): Promise<string> {
      return db().transaction(async (tx) => {
        const now = new Date();
        const body = input.body.trim();
        const rows = await tx
          .insert(s)
          .values({
            organizationId: null,
            createdBy: userId,
            title: input.title.trim(),
            body,
            area: input.area,
            status: input.status,
            publicTitle: input.title.trim(),
            publicBody: clean(body),
            eta: input.eta,
            position: isOrderedSuggestion(input.status) ? await nextPosition(tx) : null,
            reviewedBy: userId,
            reviewedAt: now,
            publishedAt: now,
            releasedAt: input.status === "released" ? now : null,
          })
          .returning({ id: s.id });
        return rows[0]!.id;
      });
    },

    /**
     * Revisa una sugerencia. Publicarla sin versión pública usa lo que escribió el club; entrar en
     * lo que viene le da el último puesto; salir de ahí se lo quita; unirla a otra pasa sus votos
     * (y las que ya se le habían unido) a esa otra.
     */
    async update(
      id: string,
      reviewerId: string,
      patch: PlatformSuggestionUpdate,
    ): Promise<SuggestionUpdateResult> {
      return db().transaction(async (tx) => {
        const current = (await tx.select().from(s).where(eq(s.id, id)).for("update"))[0];
        if (!current) return { outcome: "not_found" as const };
        const was = current.status as SuggestionStatus;
        const next = patch.status ?? was;
        const now = new Date();
        const set: Partial<typeof s.$inferInsert> = { reviewedBy: reviewerId, reviewedAt: now };

        if (patch.area) set.area = patch.area;
        if (patch.publicTitle !== undefined) set.publicTitle = patch.publicTitle.trim();
        if (patch.publicBody !== undefined) set.publicBody = clean(patch.publicBody);
        if (patch.response !== undefined) set.response = clean(patch.response);
        if (patch.eta !== undefined) set.eta = patch.eta;

        if (isPublicSuggestion(next)) {
          if ((set.publicTitle ?? current.publicTitle) == null) set.publicTitle = current.title;
          if (patch.publicBody === undefined && current.publicBody == null)
            set.publicBody = clean(current.body);
          if (!current.publishedAt) set.publishedAt = now;
        }

        if (next === "merged") {
          const targetId = patch.mergedIntoId ?? current.mergedIntoId;
          if (!targetId || targetId === id) return { outcome: "invalid_merge" as const };
          const into = (
            await tx.select({ status: s.status }).from(s).where(eq(s.id, targetId)).limit(1)
          )[0];
          if (!into || into.status === "merged") return { outcome: "invalid_merge" as const };
          set.mergedIntoId = targetId;
          // Solo al unirla (o cambiar a cuál): volver a guardarla no devuelve un voto que un club
          // quitó después a la otra.
          if (was !== "merged" || current.mergedIntoId !== targetId) {
            await moveVotes(tx, id, targetId);
            // Las que se habían unido a esta pasan a la nueva: nunca una cadena de uniones.
            await tx.update(s).set({ mergedIntoId: targetId }).where(eq(s.mergedIntoId, id));
          }
        } else if (current.mergedIntoId) {
          set.mergedIntoId = null;
        }

        if (isOrderedSuggestion(next)) {
          if (!isOrderedSuggestion(was) || current.position == null)
            set.position = await nextPosition(tx);
        } else {
          set.position = null;
        }

        if (next === "released") {
          if (!current.releasedAt) set.releasedAt = now;
        } else {
          set.releasedAt = null;
        }
        set.status = next;

        await tx.update(s).set(set).where(eq(s.id, id));
        return { outcome: "ok" as const };
      });
    },

    /**
     * Fija el orden de lo que viene. `ids` va primero, en su orden; lo que viene y no está en la
     * lista sigue detrás, como estaba. Un id que no está en desarrollo ni planificado: "invalid".
     */
    async reorder(ids: string[]): Promise<"ok" | "invalid"> {
      return db().transaction(async (tx) => {
        const coming = await tx
          .select({ id: s.id, position: s.position })
          .from(s)
          .where(inArray(s.status, [...SUGGESTION_ORDERED_STATUSES]))
          .for("update");
        const known = new Set(coming.map((c) => c.id));
        if (new Set(ids).size !== ids.length || ids.some((i) => !known.has(i)))
          return "invalid" as const;
        const listed = new Set(ids);
        const rest = coming
          .filter((c) => !listed.has(c.id))
          .sort(
            (a, b) =>
              (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
          )
          .map((c) => c.id);
        const order = [...ids, ...rest];
        for (const [index, suggestionId] of order.entries())
          await tx
            .update(s)
            .set({ position: index + 1 })
            .where(eq(s.id, suggestionId));
        return "ok" as const;
      });
    },
  };
}

export type SuggestionsRepo = ReturnType<typeof suggestionsRepo>;

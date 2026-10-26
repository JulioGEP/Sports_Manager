import { schema, type Database } from "@sportsmanager/db";
import type {
  AnnouncementAudience,
  AnnouncementCreate,
  AnnouncementUpdate,
  LeadCreate,
  LeadSource,
  LeadStatus,
  LeadUpdate,
} from "@sportsmanager/shared";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { OrgScope } from "./scope.ts";

/**
 * Comunidad del club (ADR 0049): anuncios con confirmación de lectura, el hilo de mensajes entre el
 * club y cada atleta adulto, y los leads con su clase de prueba. Todo bajo el ámbito del club.
 */

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  section: { id: string; name: string } | null;
  pinned: boolean;
  author: string | null;
  publishedAt: Date;
  read: boolean;
  readCount: number | null;
}

export interface MessageRecord {
  id: string;
  playerId: string;
  body: string;
  authorUserId: string | null;
  authorName: string | null;
  fromAthlete: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface LeadRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  status: LeadStatus;
  notes: string | null;
  trialClass: { id: string; title: string; startsAt: Date } | null;
  convertedPlayerId: string | null;
  createdAt: Date;
}

export function communityRepo(db: () => Database) {
  /** Disciplinas a las que llega una persona: las de los equipos de sus deportistas y sus clases. */
  async function sectionsOfUser(scope: OrgScope, userId: string): Promise<string[]> {
    const players = db()
      .select({ playerId: schema.playerGuardians.playerId })
      .from(schema.playerGuardians)
      .where(
        and(
          eq(schema.playerGuardians.organizationId, scope.organizationId),
          eq(schema.playerGuardians.userId, userId),
        ),
      );
    const viaTeams = await db()
      .selectDistinct({ sectionId: schema.teams.sectionId })
      .from(schema.teamPlayers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamPlayers.teamId))
      .where(
        and(
          eq(schema.teamPlayers.organizationId, scope.organizationId),
          inArray(schema.teamPlayers.playerId, players),
        ),
      );
    const viaBookings = await db()
      .selectDistinct({ sectionId: schema.events.sectionId })
      .from(schema.bookings)
      .innerJoin(schema.events, eq(schema.events.id, schema.bookings.eventId))
      .where(
        and(
          eq(schema.bookings.organizationId, scope.organizationId),
          inArray(schema.bookings.playerId, players),
          gte(schema.events.startsAt, new Date(Date.now() - 120 * 86_400_000)),
        ),
      );
    return [
      ...new Set(
        [...viaTeams, ...viaBookings].map((r) => r.sectionId).filter((v): v is string => !!v),
      ),
    ];
  }

  const announcementQuery = () =>
    db()
      .select({
        announcement: schema.announcements,
        sectionName: schema.sections.name,
        authorName: schema.users.name,
      })
      .from(schema.announcements)
      .leftJoin(schema.sections, eq(schema.sections.id, schema.announcements.sectionId))
      .leftJoin(schema.users, eq(schema.users.id, schema.announcements.createdBy));

  return {
    announcements: {
      /**
       * Los anuncios que ve una persona: todos, si escribe en nombre del club; si no, los de todo el
       * club y los de sus disciplinas. Con si los ha leído y, para quien escribe, cuántos lo han hecho.
       */
      async list(
        scope: OrgScope,
        userId: string,
        options: { all: boolean; limit?: number },
      ): Promise<AnnouncementRecord[]> {
        const sections = options.all ? [] : await sectionsOfUser(scope, userId);
        const rows = await announcementQuery()
          .where(
            and(
              eq(schema.announcements.organizationId, scope.organizationId),
              options.all
                ? undefined
                : or(
                    eq(schema.announcements.audience, "all"),
                    sections.length > 0
                      ? inArray(schema.announcements.sectionId, sections)
                      : sql`false`,
                  ),
            ),
          )
          .orderBy(desc(schema.announcements.pinned), desc(schema.announcements.publishedAt))
          .limit(options.limit ?? 50);
        const ids = rows.map((r) => r.announcement.id);
        const reads =
          ids.length === 0
            ? []
            : await db()
                .select({
                  announcementId: schema.announcementReads.announcementId,
                  userId: schema.announcementReads.userId,
                })
                .from(schema.announcementReads)
                .where(inArray(schema.announcementReads.announcementId, ids));
        return rows.map((r) => {
          const mine = reads.filter((x) => x.announcementId === r.announcement.id);
          return {
            id: r.announcement.id,
            title: r.announcement.title,
            body: r.announcement.body,
            audience: r.announcement.audience as AnnouncementAudience,
            section:
              r.announcement.sectionId && r.sectionName
                ? { id: r.announcement.sectionId, name: r.sectionName }
                : null,
            pinned: r.announcement.pinned,
            author: r.authorName,
            publishedAt: r.announcement.publishedAt,
            read: mine.some((x) => x.userId === userId),
            // Quien lo escribe ya lo tiene leído al publicarlo: no cuenta.
            readCount: options.all
              ? mine.filter((x) => x.userId !== r.announcement.createdBy).length
              : null,
          };
        });
      },

      async create(
        scope: OrgScope,
        input: AnnouncementCreate,
        createdBy: string,
      ): Promise<{ outcome: "created"; id: string } | { outcome: "unknown_section" }> {
        if (input.audience === "section") {
          const section = await db()
            .select({ id: schema.sections.id })
            .from(schema.sections)
            .where(
              and(
                eq(schema.sections.organizationId, scope.organizationId),
                eq(schema.sections.id, input.sectionId!),
              ),
            )
            .limit(1);
          if (!section[0]) return { outcome: "unknown_section" };
        }
        const rows = await db()
          .insert(schema.announcements)
          .values({
            organizationId: scope.organizationId,
            title: input.title,
            body: input.body,
            audience: input.audience,
            sectionId: input.audience === "section" ? input.sectionId! : null,
            pinned: input.pinned ?? false,
            createdBy,
          })
          .returning({ id: schema.announcements.id });
        // Quien lo escribe ya lo ha leído.
        await db()
          .insert(schema.announcementReads)
          .values({
            organizationId: scope.organizationId,
            announcementId: rows[0]!.id,
            userId: createdBy,
          })
          .onConflictDoNothing();
        return { outcome: "created", id: rows[0]!.id };
      },

      async update(scope: OrgScope, id: string, patch: AnnouncementUpdate): Promise<boolean> {
        const values: Partial<typeof schema.announcements.$inferInsert> = {};
        if (patch.title !== undefined) values.title = patch.title;
        if (patch.body !== undefined) values.body = patch.body;
        if (patch.pinned !== undefined) values.pinned = patch.pinned;
        const rows = await db()
          .update(schema.announcements)
          .set(Object.keys(values).length > 0 ? values : { updatedAt: new Date() })
          .where(
            and(
              eq(schema.announcements.organizationId, scope.organizationId),
              eq(schema.announcements.id, id),
            ),
          )
          .returning({ id: schema.announcements.id });
        return rows.length > 0;
      },

      async remove(scope: OrgScope, id: string): Promise<string | null> {
        const rows = await db()
          .delete(schema.announcements)
          .where(
            and(
              eq(schema.announcements.organizationId, scope.organizationId),
              eq(schema.announcements.id, id),
            ),
          )
          .returning({ title: schema.announcements.title });
        return rows[0]?.title ?? null;
      },

      async markRead(scope: OrgScope, id: string, userId: string): Promise<boolean> {
        const exists = await db()
          .select({ id: schema.announcements.id })
          .from(schema.announcements)
          .where(
            and(
              eq(schema.announcements.organizationId, scope.organizationId),
              eq(schema.announcements.id, id),
            ),
          )
          .limit(1);
        if (!exists[0]) return false;
        await db()
          .insert(schema.announcementReads)
          .values({ organizationId: scope.organizationId, announcementId: id, userId })
          .onConflictDoNothing();
        return true;
      },
    },

    messages: {
      async thread(scope: OrgScope, playerId: string): Promise<MessageRecord[]> {
        const rows = await db()
          .select({
            message: schema.directMessages,
            authorName: schema.users.name,
          })
          .from(schema.directMessages)
          .leftJoin(schema.users, eq(schema.users.id, schema.directMessages.authorUserId))
          .where(
            and(
              eq(schema.directMessages.organizationId, scope.organizationId),
              eq(schema.directMessages.playerId, playerId),
            ),
          )
          .orderBy(schema.directMessages.createdAt);
        return rows.map((r) => ({
          id: r.message.id,
          playerId: r.message.playerId,
          body: r.message.body,
          authorUserId: r.message.authorUserId,
          authorName: r.authorName,
          fromAthlete: r.message.fromAthlete,
          readAt: r.message.readAt,
          createdAt: r.message.createdAt,
        }));
      },

      async send(
        scope: OrgScope,
        input: { playerId: string; authorUserId: string; fromAthlete: boolean; body: string },
      ): Promise<string> {
        const rows = await db()
          .insert(schema.directMessages)
          .values({ organizationId: scope.organizationId, ...input })
          .returning({ id: schema.directMessages.id });
        return rows[0]!.id;
      },

      /** Marca como leídos los mensajes del otro lado: el atleta lee los del club y al revés. */
      async markRead(scope: OrgScope, playerId: string, reader: "athlete" | "club") {
        await db()
          .update(schema.directMessages)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(schema.directMessages.organizationId, scope.organizationId),
              eq(schema.directMessages.playerId, playerId),
              eq(schema.directMessages.fromAthlete, reader === "club"),
              isNull(schema.directMessages.readAt),
            ),
          );
      },

      /** Mensajes del club sin leer por el atleta. */
      async unreadForAthlete(scope: OrgScope, playerId: string): Promise<number> {
        const rows = await db()
          .select({ n: sql<number>`count(*)` })
          .from(schema.directMessages)
          .where(
            and(
              eq(schema.directMessages.organizationId, scope.organizationId),
              eq(schema.directMessages.playerId, playerId),
              eq(schema.directMessages.fromAthlete, false),
              isNull(schema.directMessages.readAt),
            ),
          );
        return Number(rows[0]?.n ?? 0);
      },

      /** Los hilos del club: el último mensaje de cada atleta y los que el club no ha leído. */
      async threads(
        scope: OrgScope,
        onlyPlayerIds: string[] | null,
      ): Promise<{ last: MessageRecord; unread: number; firstName: string; lastName: string }[]> {
        if (onlyPlayerIds && onlyPlayerIds.length === 0) return [];
        const latest = await db()
          .selectDistinctOn([schema.directMessages.playerId], {
            message: schema.directMessages,
            authorName: schema.users.name,
            firstName: schema.people.firstName,
            lastName: schema.people.lastName,
          })
          .from(schema.directMessages)
          .innerJoin(schema.players, eq(schema.players.id, schema.directMessages.playerId))
          .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
          .leftJoin(schema.users, eq(schema.users.id, schema.directMessages.authorUserId))
          .where(
            and(
              eq(schema.directMessages.organizationId, scope.organizationId),
              onlyPlayerIds ? inArray(schema.directMessages.playerId, onlyPlayerIds) : undefined,
            ),
          )
          .orderBy(schema.directMessages.playerId, desc(schema.directMessages.createdAt));
        const unread = await db()
          .select({ playerId: schema.directMessages.playerId, n: sql<number>`count(*)` })
          .from(schema.directMessages)
          .where(
            and(
              eq(schema.directMessages.organizationId, scope.organizationId),
              eq(schema.directMessages.fromAthlete, true),
              isNull(schema.directMessages.readAt),
            ),
          )
          .groupBy(schema.directMessages.playerId);
        const unreadBy = new Map(unread.map((u) => [u.playerId, Number(u.n)]));
        return latest
          .map((r) => ({
            last: {
              id: r.message.id,
              playerId: r.message.playerId,
              body: r.message.body,
              authorUserId: r.message.authorUserId,
              authorName: r.authorName,
              fromAthlete: r.message.fromAthlete,
              readAt: r.message.readAt,
              createdAt: r.message.createdAt,
            },
            unread: unreadBy.get(r.message.playerId) ?? 0,
            firstName: r.firstName,
            lastName: r.lastName,
          }))
          .sort((a, b) => b.last.createdAt.getTime() - a.last.createdAt.getTime());
      },
    },

    leads: {
      async list(scope: OrgScope): Promise<LeadRecord[]> {
        const rows = await db()
          .select({
            lead: schema.leads,
            eventTitle: schema.events.title,
            eventStartsAt: schema.events.startsAt,
          })
          .from(schema.leads)
          .leftJoin(schema.events, eq(schema.events.id, schema.leads.trialEventId))
          .where(eq(schema.leads.organizationId, scope.organizationId))
          .orderBy(desc(schema.leads.createdAt));
        return rows.map((r) => ({
          id: r.lead.id,
          firstName: r.lead.firstName,
          lastName: r.lead.lastName,
          email: r.lead.email,
          phone: r.lead.phone,
          source: r.lead.source as LeadSource,
          status: r.lead.status as LeadStatus,
          notes: r.lead.notes,
          trialClass:
            r.lead.trialEventId && r.eventTitle && r.eventStartsAt
              ? { id: r.lead.trialEventId, title: r.eventTitle, startsAt: r.eventStartsAt }
              : null,
          convertedPlayerId: r.lead.convertedPlayerId,
          createdAt: r.lead.createdAt,
        }));
      },

      async byId(scope: OrgScope, id: string): Promise<LeadRecord | null> {
        return (await this.list(scope)).find((l) => l.id === id) ?? null;
      },

      /** Si ya hay un lead con ese email desde una fecha (la web no crea dos por la misma persona). */
      async existsByEmail(scope: OrgScope, email: string, since: Date): Promise<boolean> {
        const rows = await db()
          .select({ id: schema.leads.id })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.organizationId, scope.organizationId),
              eq(schema.leads.email, email.toLowerCase()),
              gte(schema.leads.createdAt, since),
            ),
          )
          .limit(1);
        return Boolean(rows[0]);
      },

      async eventExists(scope: OrgScope, eventId: string): Promise<boolean> {
        const rows = await db()
          .select({ id: schema.events.id })
          .from(schema.events)
          .where(
            and(
              eq(schema.events.organizationId, scope.organizationId),
              eq(schema.events.id, eventId),
            ),
          )
          .limit(1);
        return Boolean(rows[0]);
      },

      async create(
        scope: OrgScope,
        input: LeadCreate,
        createdBy: string | null,
      ): Promise<{ outcome: "created"; id: string } | { outcome: "unknown_event" }> {
        if (input.trialEventId && !(await this.eventExists(scope, input.trialEventId)))
          return { outcome: "unknown_event" };
        const rows = await db()
          .insert(schema.leads)
          .values({
            organizationId: scope.organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email ?? null,
            phone: input.phone?.trim() ? input.phone.trim() : null,
            source: input.source,
            status: input.trialEventId ? "trial_booked" : "new",
            notes: input.notes?.trim() ? input.notes.trim() : null,
            trialEventId: input.trialEventId ?? null,
            createdBy,
          })
          .returning({ id: schema.leads.id });
        return { outcome: "created", id: rows[0]!.id };
      },

      async update(
        scope: OrgScope,
        id: string,
        patch: LeadUpdate & { convertedPlayerId?: string | null },
      ): Promise<{ outcome: "updated" } | { outcome: "not_found" } | { outcome: "unknown_event" }> {
        if (patch.trialEventId && !(await this.eventExists(scope, patch.trialEventId)))
          return { outcome: "unknown_event" };
        const values: Partial<typeof schema.leads.$inferInsert> = {};
        if (patch.status !== undefined) values.status = patch.status;
        if (patch.notes !== undefined)
          values.notes = patch.notes?.trim() ? patch.notes.trim() : null;
        if (patch.trialEventId !== undefined) {
          values.trialEventId = patch.trialEventId;
          if (patch.trialEventId && patch.status === undefined) values.status = "trial_booked";
        }
        if (patch.convertedPlayerId !== undefined)
          values.convertedPlayerId = patch.convertedPlayerId;
        const rows = await db()
          .update(schema.leads)
          .set(Object.keys(values).length > 0 ? values : { updatedAt: new Date() })
          .where(
            and(eq(schema.leads.organizationId, scope.organizationId), eq(schema.leads.id, id)),
          )
          .returning({ id: schema.leads.id });
        return rows.length > 0 ? { outcome: "updated" } : { outcome: "not_found" };
      },
    },
  };
}

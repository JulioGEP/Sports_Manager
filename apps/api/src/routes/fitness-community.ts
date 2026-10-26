import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  AnnouncementCreateSchema,
  AnnouncementResponseSchema,
  AnnouncementsResponseSchema,
  AnnouncementUpdateSchema,
  isAdultOn,
  LeadConvertSchema,
  LeadCreateSchema,
  LeadResponseSchema,
  LeadsResponseSchema,
  LeadUpdateSchema,
  MessageCreateSchema,
  MessageThreadResponseSchema,
  MessageThreadsResponseSchema,
  type Announcement,
  type Lead,
  type Locale,
  type Message,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { AnnouncementRecord, DataLayer, LeadRecord, MessageRecord } from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import { monthLabel } from "./fitness-plans.ts";
import {
  auditOf,
  body,
  errorResponse,
  errors,
  fitnessChain,
  idParam,
  json,
  orgOf,
  personName,
  selfPlayer,
  todayIn,
  visibleAthleteIds,
  type Ctx,
} from "./fitness-common.ts";

export function announcementDto(a: AnnouncementRecord): Announcement {
  return { ...a, publishedAt: a.publishedAt.toISOString() };
}

function messageDto(m: MessageRecord, athleteName: string): Message {
  return {
    id: m.id,
    body: m.body,
    author: {
      userId: m.authorUserId,
      name: m.fromAthlete ? athleteName : (m.authorName ?? "—"),
    },
    fromAthlete: m.fromAthlete,
    createdAt: m.createdAt.toISOString(),
  };
}

function leadDto(l: LeadRecord): Lead {
  return {
    ...l,
    trialClass: l.trialClass
      ? { ...l.trialClass, startsAt: l.trialClass.startsAt.toISOString() }
      : null,
    createdAt: l.createdAt.toISOString(),
  };
}

/**
 * Comunidad y captación (ADR 0049). Anuncios del club que lee cada persona (y quién escribe en
 * nombre del club ve cuántos los han leído); un hilo de mensajes entre el club y cada atleta
 * adulto (nunca con menores, DESIGN.md regla 13); y los leads con su clase de prueba, que la
 * administración pasa a atleta. Escribir en nombre del club pide `org.community.write`; los leads,
 * los permisos de socios.
 */
export function createFitnessCommunityRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  for (const path of ["/api/org/announcements", "/api/org/messages", "/api/org/leads"]) {
    app.use(path, ...chain);
    app.use(`${path}/*`, ...chain);
  }
  app.use("/api/org/me/messages", ...chain);
  const audit = auditOf(data);

  // --- Anuncios ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/announcements",
      tags: ["Comunidad"],
      summary:
        "Anuncios que ve quien pregunta (los del club y los de sus disciplinas), con si los ha leído",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      responses: { 200: json("Anuncios", AnnouncementsResponseSchema), ...errors },
    }),
    async (c) => {
      const actor = c.get("actor");
      const canWrite = actor.permissions.has("org.community.write");
      const list = await data.community.announcements.list(orgOf(c).scope, actor.userId, {
        all: canWrite,
      });
      return c.json({ announcements: list.map(announcementDto), canWrite }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/announcements",
      tags: ["Comunidad"],
      summary: "Publica un anuncio para todo el club o para una disciplina",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.community.write")],
      request: body(AnnouncementCreateSchema),
      responses: { 201: json("Anuncio", AnnouncementResponseSchema), ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const actor = c.get("actor");
      const result = await data.community.announcements.create(
        orgOf(c).scope,
        input,
        c.get("sessionUser").id,
      );
      if (result.outcome === "unknown_section") throw badRequest("Esa disciplina no es del club.");
      await audit(c, "announcement.created", input.title, { audience: input.audience });
      const list = await data.community.announcements.list(orgOf(c).scope, actor.userId, {
        all: true,
      });
      return c.json({ announcement: announcementDto(list.find((a) => a.id === result.id)!) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/announcements/{id}",
      tags: ["Comunidad"],
      summary: "Corrige un anuncio o lo fija arriba",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.community.write")],
      request: { params: idParam, ...body(AnnouncementUpdateSchema) },
      responses: { 200: json("Anuncio", AnnouncementResponseSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      if (!(await data.community.announcements.update(orgOf(c).scope, id, patch)))
        throw notFound("Ese anuncio no existe.");
      await audit(c, "announcement.updated", id, patch);
      const list = await data.community.announcements.list(orgOf(c).scope, c.get("actor").userId, {
        all: true,
      });
      return c.json({ announcement: announcementDto(list.find((a) => a.id === id)!) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/announcements/{id}",
      tags: ["Comunidad"],
      summary: "Retira un anuncio",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.community.write")],
      request: { params: idParam },
      responses: { 204: { description: "Retirado" }, ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const title = await data.community.announcements.remove(orgOf(c).scope, id);
      if (!title) throw notFound("Ese anuncio no existe.");
      await audit(c, "announcement.removed", title);
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/announcements/{id}/read",
      tags: ["Comunidad"],
      summary: "Marca un anuncio como leído",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      request: { params: idParam },
      responses: { 204: { description: "Leído" }, ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      if (!(await data.community.announcements.markRead(orgOf(c).scope, id, c.get("actor").userId)))
        throw notFound("Ese anuncio no existe.");
      return c.body(null, 204);
    },
  );

  // --- Mensajes ---

  /** El atleta de un hilo: del club, adulto, y visible para quien escribe en nombre del club. */
  async function threadAthlete(c: Ctx, playerId: string) {
    const tenant = orgOf(c);
    const rows = await data.fitness.athletes(
      tenant.scope,
      tenant.organization.timezone,
      new Date(),
      [playerId],
    );
    const athlete = rows[0];
    if (!athlete) throw notFound("Ese atleta no existe.");
    if (!isAdultOn(athlete.birthDate, todayIn(tenant.organization.timezone)))
      throw forbidden("Los mensajes con el club son solo entre adultos.");
    return athlete;
  }

  async function threadDto(c: Ctx, playerId: string, name: string) {
    const messages = await data.community.messages.thread(orgOf(c).scope, playerId);
    return {
      athlete: { playerId, name },
      messages: messages.map((m) => messageDto(m, name)),
      canWrite: true,
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/messages",
      tags: ["Comunidad"],
      summary: "El hilo del atleta con el club. Al leerlo, los mensajes del club quedan leídos",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      responses: { 200: json("Mensajes", MessageThreadResponseSchema), ...errors },
    }),
    async (c) => {
      const player = await selfPlayer(data, c);
      if (!player) throw forbidden("Esto es para atletas con su propia ficha en el club.");
      const athlete = await threadAthlete(c, player.id);
      await data.community.messages.markRead(orgOf(c).scope, player.id, "athlete");
      return c.json(await threadDto(c, player.id, personName(athlete)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/me/messages",
      tags: ["Comunidad"],
      summary: "El atleta escribe al club",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      request: body(MessageCreateSchema),
      responses: { 201: json("Mensajes", MessageThreadResponseSchema), ...errors },
    }),
    async (c) => {
      const player = await selfPlayer(data, c);
      if (!player) throw forbidden("Esto es para atletas con su propia ficha en el club.");
      const athlete = await threadAthlete(c, player.id);
      await data.community.messages.send(orgOf(c).scope, {
        playerId: player.id,
        authorUserId: c.get("sessionUser").id,
        fromAthlete: true,
        body: c.req.valid("json").body,
      });
      return c.json(await threadDto(c, player.id, personName(athlete)), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/messages",
      tags: ["Comunidad"],
      summary:
        "Los hilos del club con sus atletas: el último mensaje y los que el club no ha leído",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.community.write")],
      responses: { 200: json("Hilos", MessageThreadsResponseSchema), ...errors },
    }),
    async (c) => {
      const visible = await visibleAthleteIds(data, c);
      const threads = await data.community.messages.threads(orgOf(c).scope, visible);
      return c.json(
        {
          threads: threads.map((t) => ({
            playerId: t.last.playerId,
            name: personName(t),
            lastMessage: messageDto(t.last, personName(t)),
            unread: t.unread,
          })),
        },
        200,
      );
    },
  );

  async function requireVisibleAthlete(c: Ctx, playerId: string) {
    const visible = await visibleAthleteIds(data, c);
    if (visible && !visible.includes(playerId)) throw notFound("Ese atleta no existe.");
    return threadAthlete(c, playerId);
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/messages/{id}",
      tags: ["Comunidad"],
      summary: "El hilo con un atleta. Al leerlo, sus mensajes quedan leídos para el club",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.community.write")],
      request: { params: idParam },
      responses: { 200: json("Mensajes", MessageThreadResponseSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const athlete = await requireVisibleAthlete(c, id);
      await data.community.messages.markRead(orgOf(c).scope, id, "club");
      return c.json(await threadDto(c, id, personName(athlete)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/messages/{id}",
      tags: ["Comunidad"],
      summary: "Escribe a un atleta adulto en nombre del club",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.community.write")],
      request: { params: idParam, ...body(MessageCreateSchema) },
      responses: { 201: json("Mensajes", MessageThreadResponseSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const athlete = await requireVisibleAthlete(c, id);
      await data.community.messages.send(orgOf(c).scope, {
        playerId: id,
        authorUserId: c.get("sessionUser").id,
        fromAthlete: false,
        body: c.req.valid("json").body,
      });
      return c.json(await threadDto(c, id, personName(athlete)), 201);
    },
  );

  // --- Leads y clases de prueba ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/leads",
      tags: ["Captación"],
      summary: "Personas interesadas con su origen, su estado y su clase de prueba",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.club_members.read")],
      responses: { 200: json("Leads", LeadsResponseSchema), ...errors },
    }),
    async (c) => {
      const leads = await data.community.leads.list(orgOf(c).scope);
      return c.json({ leads: leads.map(leadDto) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/leads",
      tags: ["Captación"],
      summary: "Apunta una persona interesada (en la puerta, recomendada, de redes)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.club_members.write")],
      request: body(LeadCreateSchema),
      responses: { 201: json("Lead", LeadResponseSchema), ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const result = await data.community.leads.create(
        orgOf(c).scope,
        input,
        c.get("sessionUser").id,
      );
      if (result.outcome === "unknown_event") throw badRequest("Esa clase no es del club.");
      await audit(c, "lead.created", `${input.firstName} ${input.lastName}`, {
        source: input.source,
      });
      const lead = await data.community.leads.byId(orgOf(c).scope, result.id);
      return c.json({ lead: leadDto(lead!) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/leads/{id}",
      tags: ["Captación"],
      summary: "Cambia el estado de un lead, su nota o su clase de prueba",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.club_members.write")],
      request: { params: idParam, ...body(LeadUpdateSchema) },
      responses: { 200: json("Lead", LeadResponseSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const current = await data.community.leads.byId(orgOf(c).scope, id);
      if (!current) throw notFound("Ese lead no existe.");
      if (patch.status === "converted" && !current.convertedPlayerId)
        throw badRequest("Para pasarlo a atleta, usa la conversión.");
      const result = await data.community.leads.update(orgOf(c).scope, id, patch);
      if (result.outcome === "unknown_event") throw badRequest("Esa clase no es del club.");
      if (result.outcome === "not_found") throw notFound("Ese lead no existe.");
      await audit(c, "lead.updated", `${current.firstName} ${current.lastName}`, patch);
      const lead = await data.community.leads.byId(orgOf(c).scope, id);
      return c.json({ lead: leadDto(lead!) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/leads/{id}/convert",
      tags: ["Captación"],
      summary:
        "Pasa un lead a atleta: crea su ficha con su contacto y, si se dice, su tarifa desde un día (con su primer cargo)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.club_members.write")],
      request: { params: idParam, ...body(LeadConvertSchema) },
      responses: {
        200: json("Lead", LeadResponseSchema),
        409: errorResponse("Ya era atleta"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const actor = c.get("actor");
      const lead = await data.community.leads.byId(tenant.scope, id);
      if (!lead) throw notFound("Ese lead no existe.");
      if (lead.convertedPlayerId) throw conflict("Ese lead ya es atleta del club.");
      if (input.feePlanId && !actor.permissions.has("org.fees.write"))
        throw forbidden("Dar de alta una tarifa pide permiso de cuotas.");
      const today = todayIn(tenant.organization.timezone);
      const created = await data.players.create(tenant.scope, {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        joinedOn: input.startsOn ?? today,
      });
      if (created.outcome !== "created") throw conflict("No se ha podido crear la ficha.");
      const playerId = created.player.id;
      if (input.feePlanId) {
        const startsOn = input.startsOn ?? today;
        const result = await data.bookings.subscriptions.create(
          tenant.scope,
          { playerId, feePlanId: input.feePlanId, startsOn },
          c.get("sessionUser").id,
        );
        if (result.outcome !== "created")
          throw badRequest("Esa tarifa no existe o está archivada.");
        if (input.chargeNow) {
          const sub = result.subscription;
          const label = monthLabel(
            startsOn.slice(0, 7),
            tenant.organization.defaultLocale as Locale,
          );
          await data.fees.charges.generateFor(
            tenant.scope,
            [
              {
                personId: sub.personId,
                feePlanId: sub.plan.id,
                concept: `${sub.plan.name} · ${label}`,
                amountCents: sub.plan.amountCents,
              },
            ],
            label,
            startsOn,
            c.get("sessionUser").id,
          );
        }
      }
      await data.community.leads.update(tenant.scope, id, {
        status: "converted",
        convertedPlayerId: playerId,
      });
      await audit(c, "lead.converted", `${lead.firstName} ${lead.lastName}`, { playerId });
      const fresh = await data.community.leads.byId(tenant.scope, id);
      return c.json({ lead: leadDto(fresh!) }, 200);
    },
  );

  return app;
}

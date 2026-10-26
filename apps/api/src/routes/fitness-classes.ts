import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  BookingCreateSchema,
  BookingPolicySchema,
  BookingPolicyUpdateSchema,
  BookingResultSchema,
  CancelResultSchema,
  CheckInSchema,
  ClassDetailResponseSchema,
  ClassesResponseSchema,
  ClassTypeCreateSchema,
  ClassTypeResponseSchema,
  ClassTypesResponseSchema,
  ClassTypeUpdateSchema,
  MyBookingsResponseSchema,
  percentLoad,
  TeamScheduleSetSchema,
  type Attendee,
  type ClassBrief,
  type ClassType,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  playerPhotoUrlFor,
  workoutVisible,
  type ClassRecord,
  type DataLayer,
  type PlayerBookingContext,
} from "../data/index.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import {
  athleteWorkoutDto,
  auditOf,
  body,
  canManageClass,
  classDto,
  classInStaffScope,
  errorResponse,
  errors,
  fitnessChain,
  idParam,
  initialsOf,
  json,
  oneRmByMovement,
  orgOf,
  personName,
  requireSelfPlayer,
  selfPlayer,
  staffClassScope,
  subscriptionDto,
  todayIn,
  workoutDto,
  localeOf,
  type Ctx,
} from "./fitness-common.ts";

const DAY = 86_400_000;
const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  section: z.string().uuid().optional(),
  team: z.string().uuid().optional(),
  /** Solo las clases que da quien pregunta. */
  mine: z.enum(["1"]).optional(),
});

/**
 * Clases abiertas y reservas (ADR 0049). El atleta (la cuenta de su propia ficha) ve el horario con
 * sus plazas y reserva, cancela o se apunta a la espera según la política del club. El personal ve
 * las clases de su ámbito, reserva para un atleta, hace check-in y cierra la clase. La política la
 * fija quien escribe los ajustes y los tipos de clase, quien escribe la estructura.
 */
export function createFitnessClassRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  for (const path of ["/api/org/booking-policy", "/api/org/class-types", "/api/org/classes"]) {
    app.use(path, ...chain);
    app.use(`${path}/*`, ...chain);
  }
  app.use("/api/org/me/bookings", ...chain);
  const audit = auditOf(data);

  function rangeOf(query: { from?: string | undefined; to?: string | undefined }, days: number) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 2 * 3600_000);
    const to = query.to ? new Date(query.to) : new Date(from.getTime() + days * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
      throw badRequest("Fechas inválidas: usa instantes ISO 8601.");
    if (to.getTime() <= from.getTime())
      throw badRequest("El final tiene que ir después del inicio.");
    if (to.getTime() - from.getTime() > 62 * DAY)
      throw badRequest("El rango de clases no puede superar dos meses.");
    return { from, to };
  }

  /** Una clase que existe y que quien pregunta puede ver (atleta o personal de su ámbito). */
  async function classFor(c: Ctx, id: string) {
    const tenant = orgOf(c);
    const cls = await data.bookings.classById(tenant.scope, id, tenant.organization.timezone);
    if (!cls) throw notFound("Esa clase no existe.");
    const actor = c.get("actor");
    if (actor.permissions.has("org.events.read")) {
      const scope = await staffClassScope(data, c);
      if (classInStaffScope(scope, cls)) return cls;
    }
    if (actor.permissions.has("org.family.read") && (await selfPlayer(data, c))) return cls;
    throw notFound("Esa clase no existe.");
  }

  /** Los WODs publicados y visibles de unas clases: por disciplina y día (y tipo de clase). */
  async function workoutsFor(c: Ctx, classes: ClassRecord[], staff: boolean) {
    const tenant = orgOf(c);
    if (classes.length === 0) return new Set<string>();
    const dates = classes.map((x) => x.date).sort();
    const list = await data.workouts.list(tenant.scope, dates[0]!, dates[dates.length - 1]!);
    const now = new Date();
    const has = new Set<string>();
    for (const cls of classes) {
      if (!cls.section) continue;
      const match = list.filter(
        (w) =>
          w.section.id === cls.section!.id &&
          w.onDate === cls.date &&
          (!w.team || w.team.id === cls.team?.id) &&
          (staff ? w.status === "published" : workoutVisible(w, now)),
      );
      if (match.length > 0) has.add(cls.id);
    }
    return has;
  }

  /** Una clase tal como la ve un atleta: su reserva y si puede reservar. */
  async function athleteView(
    c: Ctx,
    classes: ClassRecord[],
    playerId: string,
    context: PlayerBookingContext,
  ) {
    const tenant = orgOf(c);
    const policy = await data.bookings.policy(tenant.scope);
    const mine = await data.bookings.mine(
      tenant.scope,
      playerId,
      classes.map((x) => x.id),
    );
    const workouts = await workoutsFor(c, classes, false);
    const now = new Date();
    return classes.map((cls) => {
      const my = mine.get(cls.id) ?? null;
      const check = data.bookings.evaluate(cls, policy, context, my?.status ?? null, now);
      return classDto(cls, policy, {
        my,
        action: check.action,
        block: check.block,
        hasWorkout: workouts.has(cls.id),
      });
    });
  }

  // --- Política de reservas ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/booking-policy",
      tags: ["Fitness"],
      summary: "Reglas de reserva del club: ventana, cancelación, penalizaciones y espera",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.read")],
      responses: { 200: json("Política", BookingPolicySchema), ...errors },
    }),
    async (c) => c.json(await data.bookings.policy(orgOf(c).scope), 200),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/booking-policy",
      tags: ["Fitness"],
      summary: "Cambia las reglas de reserva (solo lo que se manda)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.write")],
      request: body(BookingPolicyUpdateSchema),
      responses: { 200: json("Política", BookingPolicySchema), ...errors },
    }),
    async (c) => {
      const patch = c.req.valid("json");
      const policy = await data.bookings.setPolicy(orgOf(c).scope, patch);
      await audit(c, "booking_policy.updated", orgOf(c).organization.name, patch);
      return c.json(policy, 200);
    },
  );

  // --- Tipos de clase ---

  async function classTypeDtos(c: Ctx, teamIds?: string[]): Promise<ClassType[]> {
    const tenant = orgOf(c);
    const season = await data.seasons.current(tenant.scope);
    if (!season) return [];
    const teams = (await data.teams.list(tenant.scope, season.id, undefined, teamIds)).filter(
      (t) => t.bookingMode === "open",
    );
    const upcoming = await data.bookings.classesBetween(
      tenant.scope,
      new Date(),
      new Date(Date.now() + 60 * DAY),
      tenant.organization.timezone,
      { teamIds: teams.map((t) => t.id) },
    );
    const out: ClassType[] = [];
    for (const team of teams) {
      const slots = await data.schedules.listForTeam(tenant.scope, team.id);
      out.push({
        teamId: team.id,
        name: team.name,
        section: { id: team.section.id, name: team.section.name },
        capacity: team.capacity,
        description: null,
        status: team.status,
        slots,
        upcoming: upcoming.filter((x) => x.team?.id === team.id).length,
      });
    }
    return out;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/class-types",
      tags: ["Fitness"],
      summary:
        "Tipos de clase con su horario semanal, más lo que hace falta para editarlos (disciplinas, coaches, salas y política)",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.structure.read")],
      responses: { 200: json("Tipos de clase", ClassTypesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const scope = await staffClassScope(data, c);
      const season = await data.seasons.current(tenant.scope);
      const [classTypes, sections, coaches, facilities, policy] = await Promise.all([
        classTypeDtos(c, scope.all ? undefined : scope.teamIds),
        data.sections.list(tenant.scope, season?.id ?? null),
        data.teams.eligibleStaff(tenant.scope),
        data.facilities.list(tenant.scope, tenant.organization.timezone, new Date(), null, null),
        data.bookings.policy(tenant.scope),
      ]);
      return c.json(
        {
          classTypes,
          sections: sections
            .filter((s) => s.status === "active")
            .map((s) => ({ id: s.id, name: s.name })),
          coaches: coaches.map((x) => ({ userId: x.userId, name: x.name })),
          facilities: facilities
            .filter((f) => f.status === "active")
            .map((f) => ({ id: f.id, name: f.name })),
          policy,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/class-types",
      tags: ["Fitness"],
      summary:
        "Crea un tipo de clase abierto en una disciplina. Pone la temporada y la categoría si faltan",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.structure.write")],
      request: body(ClassTypeCreateSchema),
      responses: {
        201: json("Tipo de clase", ClassTypeResponseSchema),
        409: errorResponse("Ya hay un tipo de clase con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const input = c.req.valid("json");
      const today = todayIn(tenant.organization.timezone);
      let season = await data.seasons.current(tenant.scope);
      if (!season) {
        const year = Number(today.slice(0, 4));
        const created = await data.seasons.create(tenant.scope, {
          name: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
          startsOn: today,
          endsOn: `${year + 1}-${today.slice(5)}`,
          isCurrent: true,
        });
        if (created.outcome !== "created") throw conflict("No se ha podido abrir la temporada.");
        season = created.season;
      }
      const section = await data.sections.byId(tenant.scope, input.sectionId, season.id);
      if (!section) throw badRequest("Esa disciplina no es de este club.");
      let category = (await data.categories.list(tenant.scope, { sectionId: section.id })).find(
        (x) => x.status === "active",
      );
      if (!category) {
        const created = await data.categories.create(tenant.scope, {
          sectionId: section.id,
          name: "General",
        });
        if (created.outcome !== "created") throw conflict("No se ha podido crear la categoría.");
        category = created.category;
      }
      const result = await data.teams.create(tenant.scope, {
        sectionId: section.id,
        seasonId: season.id,
        categoryId: category.id,
        name: input.name,
        capacity: input.capacity ?? null,
        bookingMode: "open",
      });
      if (result.outcome === "name_taken")
        throw conflict("Ya hay un tipo de clase con ese nombre.");
      if (result.outcome !== "created") throw badRequest("No se ha podido crear el tipo de clase.");
      await audit(c, "class_type.created", input.name, { sectionId: section.id });
      const [classType] = await classTypeDtos(c, [result.team.id]);
      return c.json({ classType: classType! }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/class-types/{id}",
      tags: ["Fitness"],
      summary: "Cambia el nombre, el aforo o el estado de un tipo de clase",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.structure.write")],
      request: { params: idParam, ...body(ClassTypeUpdateSchema) },
      responses: {
        200: json("Tipo de clase", ClassTypeResponseSchema),
        409: errorResponse("Ya hay un tipo de clase con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team || team.bookingMode !== "open") throw notFound("Ese tipo de clase no existe.");
      const result = await data.teams.update(tenant.scope, id, patch);
      if (result.outcome === "name_taken")
        throw conflict("Ya hay un tipo de clase con ese nombre.");
      if (result.outcome !== "updated") throw notFound("Ese tipo de clase no existe.");
      await audit(c, "class_type.updated", result.team.name, patch);
      const [classType] = await classTypeDtos(c, [id]);
      if (!classType) throw notFound("Ese tipo de clase no existe.");
      return c.json({ classType }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/class-types/{id}/schedule",
      tags: ["Fitness"],
      summary:
        "Horario semanal del tipo de clase con coach, sala y aforo por franja. Con `generate`, crea las clases hasta el fin de temporada sin tocar las que tienen reservas",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.structure.write")],
      request: { params: idParam, ...body(TeamScheduleSetSchema) },
      responses: { 200: json("Tipo de clase", ClassTypeResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const team = await data.teams.byId(tenant.scope, id);
      if (!team || team.bookingMode !== "open") throw notFound("Ese tipo de clase no existe.");
      const result = await data.schedules.set(tenant.scope, id, input.slots);
      if (result.outcome === "unknown_facility")
        throw badRequest("Alguna sala no es de este club.");
      if (result.outcome === "unknown_coach") throw badRequest("Algún coach no es del club.");
      if (result.outcome !== "saved") throw notFound("Ese tipo de clase no existe.");
      // Quien da la clase entra en su cuerpo técnico: así la ve en su ámbito y pasa lista.
      const coaches = new Set(
        input.slots.map((s) => s.coachUserId).filter((v): v is string => !!v),
      );
      for (const userId of coaches) {
        await data.teams.addStaff(tenant.scope, id, userId, "assistant");
      }
      const generated = input.generate
        ? await data.schedules.generate(
            tenant.scope,
            id,
            tenant.organization.timezone,
            new Date(),
            c.get("sessionUser").id,
          )
        : 0;
      await audit(c, "team.schedule_updated", team.name, { slots: input.slots.length, generated });
      const [classType] = await classTypeDtos(c, [id]);
      return c.json({ classType: classType!, generated }, 200);
    },
  );

  // --- Horario de clases ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/classes",
      tags: ["Fitness"],
      summary:
        "Clases abiertas de un rango (por defecto, desde hace dos horas y los siete días siguientes) con plazas, reserva propia y si se puede reservar",
      security: [{ sessionCookie: [] }],
      request: { query: rangeQuery },
      responses: { 200: json("Clases", ClassesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const query = c.req.valid("query");
      const actor = c.get("actor");
      const { from, to } = rangeOf(query, 7);
      const staff = actor.permissions.has("org.events.read");
      const player = actor.permissions.has("org.family.read") ? await selfPlayer(data, c) : null;
      if (!staff && !player) throw forbidden();
      const policy = await data.bookings.policy(tenant.scope);
      const filter = { sectionId: query.section, teamId: query.team };
      let classes: ClassRecord[];
      if (staff && !player) {
        const scope = await staffClassScope(data, c);
        classes = (
          await data.bookings.classesBetween(tenant.scope, from, to, tenant.organization.timezone, {
            ...filter,
            ...(query.mine ? { coachUserId: actor.userId } : {}),
          })
        ).filter((x) => classInStaffScope(scope, x));
        const workouts = await workoutsFor(c, classes, true);
        return c.json(
          {
            from: from.toISOString(),
            to: to.toISOString(),
            classes: classes.map((x) => classDto(x, policy, { hasWorkout: workouts.has(x.id) })),
            policy,
            plan: null,
            role: "staff" as const,
          },
          200,
        );
      }
      classes = await data.bookings.classesBetween(
        tenant.scope,
        from,
        to,
        tenant.organization.timezone,
        filter,
      );
      const context = await data.bookings.context(
        tenant.scope,
        player!.id,
        tenant.organization.timezone,
        policy,
      );
      const today = todayIn(tenant.organization.timezone);
      const plan = context.subscriptions.find(
        (s) => s.status === "active" || s.status === "paused",
      );
      return c.json(
        {
          from: from.toISOString(),
          to: to.toISOString(),
          classes: await athleteView(c, classes, player!.id, context),
          policy,
          plan: plan ? subscriptionDto(plan, context, today) : null,
          role: staff ? ("staff" as const) : ("athlete" as const),
        },
        200,
      );
    },
  );

  /** El brief del coach: nuevos, restricciones, quién vuelve y las cargas del bloque de fuerza. */
  async function briefOf(c: Ctx, cls: ClassRecord, playerIds: string[]): Promise<ClassBrief> {
    const tenant = orgOf(c);
    const now = new Date();
    if (playerIds.length === 0)
      return { newcomers: [], restrictions: [], returning: [], loads: [] };
    const [rows, before, availability, records] = await Promise.all([
      data.fitness.athletes(tenant.scope, tenant.organization.timezone, now, playerIds),
      data.fitness.trainedCounts(tenant.scope, new Date(0), cls.startsAt, now),
      data.load.currentFor(tenant.scope, playerIds),
      data.workouts.records.list(tenant.scope, playerIds),
    ]);
    const nameOf = new Map(rows.map((r) => [r.playerId, personName(r)]));
    const brief: ClassBrief = { newcomers: [], restrictions: [], returning: [], loads: [] };
    for (const r of rows) {
      const visits = before.get(r.playerId) ?? 0;
      if (visits < 2) brief.newcomers.push({ playerId: r.playerId, name: personName(r), visits });
      const a = availability.get(r.playerId);
      if (a && a.status !== "available")
        brief.restrictions.push({
          playerId: r.playerId,
          name: personName(r),
          status: a.status,
          note: a.note,
        });
      if (r.lastVisit && visits >= 2) {
        const away = Math.round(
          (Date.parse(`${cls.date}T00:00:00Z`) - Date.parse(`${r.lastVisit}T00:00:00Z`)) / DAY,
        );
        if (away >= 14)
          brief.returning.push({ playerId: r.playerId, name: personName(r), daysAway: away });
      }
    }
    const workout = cls.section
      ? await data.workouts.forClass(tenant.scope, cls.section.id, cls.team?.id ?? null, cls.date)
      : null;
    const block = workout?.blocks.find((b) => b.movementCode && b.percent);
    if (block) {
      for (const playerId of playerIds) {
        const rm = oneRmByMovement(records.get(playerId) ?? []).get(block.movementCode!);
        if (!rm) continue;
        brief.loads.push({
          playerId,
          name: nameOf.get(playerId) ?? "",
          movement: block.movementCode!,
          percent: block.percent!,
          oneRmKg: rm.kg,
          loadKg: percentLoad(rm.kg, block.percent!),
        });
      }
    }
    return brief;
  }

  async function detailOf(c: Ctx, cls: ClassRecord) {
    const tenant = orgOf(c);
    const actor = c.get("actor");
    const now = new Date();
    const policy = await data.bookings.policy(tenant.scope);
    const player = actor.permissions.has("org.family.read") ? await selfPlayer(data, c) : null;
    const staffScope = actor.permissions.has("org.events.read")
      ? await staffClassScope(data, c)
      : null;
    const staff = staffScope !== null && classInStaffScope(staffScope, cls);
    const manage = staff && (await canManageClass(data, c, cls));
    const all = await data.bookings.attendees(tenant.scope, cls.id);
    const toAttendee = (a: (typeof all)[number]): Attendee => ({
      playerId: a.playerId,
      name: personName(a),
      initials: initialsOf(a),
      photoUrl: playerPhotoUrlFor(a.photoBlobKey, tenant.organization.slug, a.playerId),
      isMe: player?.id === a.playerId,
      status: staff ? a.status : null,
      note: null,
    });
    const seated = all.filter((a) => a.status === "booked" || a.status === "attended");
    let attendees: Attendee[];
    let hiddenCount = 0;
    if (staff) {
      attendees = all.filter((a) => a.status !== "waitlist").map(toAttendee);
    } else if (policy.showAttendees) {
      const visible = seated.filter((a) => !a.hidden || a.playerId === player?.id);
      hiddenCount = seated.length - visible.length;
      attendees = visible.map(toAttendee);
    } else {
      attendees = seated.filter((a) => a.playerId === player?.id).map(toAttendee);
      hiddenCount = seated.length - attendees.length;
    }
    const waitlist = staff ? all.filter((a) => a.status === "waitlist").map(toAttendee) : [];

    let summary;
    if (player) {
      const context = await data.bookings.context(
        tenant.scope,
        player.id,
        tenant.organization.timezone,
        policy,
      );
      summary = (await athleteView(c, [cls], player.id, context))[0]!;
    } else {
      summary = classDto(cls, policy, {
        hasWorkout: (await workoutsFor(c, [cls], true)).has(cls.id),
      });
    }

    let workout = null;
    if (cls.section) {
      const w = await data.workouts.forClass(
        tenant.scope,
        cls.section.id,
        cls.team?.id ?? null,
        cls.date,
      );
      if (w && staff) {
        workout = workoutDto(w, now, localeOf(c), {
          counts: await data.workouts.results.counts(
            tenant.scope,
            w.blocks.map((b) => b.id),
          ),
        });
      } else if (w && player && workoutVisible(w, now)) {
        workout = await athleteWorkoutDto(data, c, w, player.id, now);
      }
    }
    return {
      class: summary,
      attendees,
      hiddenCount,
      waitlist,
      brief: manage
        ? await briefOf(
            c,
            cls,
            seated.map((a) => a.playerId),
          )
        : null,
      workout,
      canCheckIn: manage,
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/classes/{id}",
      tags: ["Fitness"],
      summary:
        "Una clase: quién viene (respetando a quien prefiere no salir), la espera y el brief para su coach, y el WOD",
      security: [{ sessionCookie: [] }],
      request: { params: idParam },
      responses: { 200: json("Clase", ClassDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await detailOf(c, await classFor(c, id)), 200);
    },
  );

  const blockMessages: Record<string, string> = {
    not_open_yet: "La reserva de esta clase aún no está abierta.",
    closed: "La reserva de esta clase ya está cerrada.",
    already_booked: "Ya tienes esta clase reservada.",
    full: "La clase está completa.",
    no_plan: "No tienes una tarifa que permita reservar.",
    plan_paused: "Tu tarifa está en pausa ese día.",
    plan_expired: "Tu tarifa ya no vale ese día.",
    not_covered: "Tu tarifa no incluye esta clase.",
    no_sessions_left: "No te quedan sesiones en tu tarifa para ese periodo.",
    daily_limit: "Ya tienes el máximo de clases reservadas ese día.",
  };

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/classes/{id}/bookings",
      tags: ["Fitness"],
      summary:
        "Reserva la clase (o se apunta a la espera). El atleta para sí; el personal de la clase, para un atleta, saltándose ventana y tarifa",
      security: [{ sessionCookie: [] }],
      request: { params: idParam, ...body(BookingCreateSchema) },
      responses: {
        201: json("Reserva", BookingResultSchema),
        409: errorResponse("No se puede reservar (con el motivo)"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const cls = await classFor(c, id);
      const self = await selfPlayer(data, c);
      let playerId: string;
      let source: "self" | "staff" = "self";
      if (input.playerId && input.playerId !== self?.id) {
        if (!(await canManageClass(data, c, cls))) throw forbidden();
        const athlete = await data.fitness.athletes(
          tenant.scope,
          tenant.organization.timezone,
          new Date(),
          [input.playerId],
        );
        if (athlete.length === 0) throw badRequest("Ese atleta no es de este club.");
        playerId = input.playerId;
        source = "staff";
      } else {
        playerId = (await requireSelfPlayer(data, c)).id;
      }
      const result = await data.bookings.book(tenant.scope, {
        eventId: id,
        playerId,
        timezone: tenant.organization.timezone,
        now: new Date(),
        source,
        createdBy: c.get("sessionUser").id,
        override: source === "staff",
      });
      if (result.outcome === "not_found") throw notFound("Esa clase no existe.");
      if (result.outcome === "blocked")
        throw conflict(blockMessages[result.block] ?? "No se puede reservar.");
      if (source === "staff")
        await audit(c, "booking.created", cls.title, {
          eventId: id,
          playerId,
          status: result.booking.status,
        });
      const fresh = await data.bookings.classById(tenant.scope, id, tenant.organization.timezone);
      const policy = await data.bookings.policy(tenant.scope);
      return c.json(
        { booking: result.booking, class: classDto(fresh ?? cls, policy, { my: result.booking }) },
        201,
      );
    },
  );

  async function cancelFor(c: Ctx, id: string, playerId: string, byStaff: boolean) {
    const tenant = orgOf(c);
    const result = await data.bookings.cancel(tenant.scope, {
      eventId: id,
      playerId,
      timezone: tenant.organization.timezone,
      now: new Date(),
      byStaff,
    });
    if (result.outcome === "not_found") throw notFound("Esa clase no existe.");
    if (result.outcome === "not_booked") throw conflict("No hay reserva que cancelar.");
    if (result.outcome === "too_late")
      throw conflict("La clase ya ha empezado: no se puede cancelar.");
    const fresh = (await data.bookings.classById(tenant.scope, id, tenant.organization.timezone))!;
    const policy = await data.bookings.policy(tenant.scope);
    return {
      status: result.status,
      promoted: result.promoted !== null,
      class: classDto(fresh, policy),
    };
  }

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/classes/{id}/bookings/me",
      tags: ["Fitness"],
      summary:
        "Cancela la reserva propia: a tiempo no gasta sesión; tarde, según la política. La plaza pasa a la espera",
      security: [{ sessionCookie: [] }],
      request: { params: idParam },
      responses: {
        200: json("Cancelada", CancelResultSchema),
        409: errorResponse("Sin reserva o con la clase empezada"),
        ...errors,
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      await classFor(c, id);
      const player = await requireSelfPlayer(data, c);
      return c.json(await cancelFor(c, id, player.id, false), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/classes/{id}/bookings/{playerId}",
      tags: ["Fitness"],
      summary: "El personal de la clase cancela la reserva de un atleta (siempre a tiempo)",
      security: [{ sessionCookie: [] }],
      request: { params: z.object({ id: z.string().uuid(), playerId: z.string().uuid() }) },
      responses: { 200: json("Cancelada", CancelResultSchema), ...errors },
    }),
    async (c) => {
      const { id, playerId } = c.req.valid("param");
      const cls = await classFor(c, id);
      if (!(await canManageClass(data, c, cls))) throw forbidden();
      const result = await cancelFor(c, id, playerId, true);
      await audit(c, "booking.cancelled", cls.title, { eventId: id, playerId });
      return c.json(result, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/classes/{id}/check-in",
      tags: ["Fitness"],
      summary:
        "Check-in de un atleta (con reserva o sin ella) o deshacerlo. Lo hace el coach de la clase o quien escribe la agenda",
      security: [{ sessionCookie: [] }],
      request: { params: idParam, ...body(CheckInSchema) },
      responses: { 200: json("Clase", ClassDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const cls = await classFor(c, id);
      if (!(await canManageClass(data, c, cls))) throw forbidden();
      const known = await data.fitness.athletes(
        tenant.scope,
        tenant.organization.timezone,
        new Date(),
        [input.playerId],
      );
      if (known.length === 0) throw badRequest("Ese atleta no es de este club.");
      const result = await data.bookings.checkIn(tenant.scope, {
        eventId: id,
        playerId: input.playerId,
        present: input.present,
        timezone: tenant.organization.timezone,
        now: new Date(),
        recordedBy: c.get("sessionUser").id,
      });
      if (result.outcome === "not_found") throw notFound("Esa clase no existe.");
      if (result.outcome === "not_booked") throw conflict("Ese atleta no tenía check-in.");
      await audit(c, "attendance.recorded", cls.title, { checkIn: input });
      const fresh = (await data.bookings.classById(
        tenant.scope,
        id,
        tenant.organization.timezone,
      ))!;
      return c.json(await detailOf(c, fresh), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/classes/{id}/close",
      tags: ["Fitness"],
      summary:
        "Cierra la clase: quien reservó sin check-in queda como no presentado (y gasta sesión si la política lo dice)",
      security: [{ sessionCookie: [] }],
      request: { params: idParam },
      responses: {
        200: json("Cerrada", z.object({ noShows: z.number().int().nonnegative() })),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const cls = await classFor(c, id);
      if (!(await canManageClass(data, c, cls))) throw forbidden();
      if (cls.startsAt.getTime() > Date.now())
        throw conflict("La clase aún no ha empezado: no se puede cerrar.");
      const result = await data.bookings.close(tenant.scope, id, c.get("sessionUser").id);
      if (result.outcome === "not_found") throw notFound("Esa clase no existe.");
      await audit(c, "class.closed", cls.title, { noShows: result.noShows });
      return c.json({ noShows: result.noShows }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/bookings",
      tags: ["Fitness"],
      summary: "Las clases reservadas del atleta: las próximas y el historial de dos meses",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      responses: { 200: json("Reservas", MyBookingsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const player = await requireSelfPlayer(data, c);
      const now = new Date();
      const policy = await data.bookings.policy(tenant.scope);
      const rows = await data.bookings.ofPlayer(
        tenant.scope,
        player.id,
        tenant.organization.timezone,
        {
          from: new Date(now.getTime() - 62 * DAY),
          to: new Date(now.getTime() + 62 * DAY),
        },
      );
      const upcoming = rows
        .filter(
          (r) =>
            r.cls.endsAt.getTime() > now.getTime() &&
            (r.booking.status === "booked" ||
              r.booking.status === "waitlist" ||
              r.booking.status === "attended"),
        )
        .map((r) => classDto(r.cls, policy, { my: r.booking }));
      const history = rows
        .filter((r) => r.cls.endsAt.getTime() <= now.getTime())
        .reverse()
        .map((r) => classDto(r.cls, policy, { my: r.booking }));
      return c.json({ upcoming, history }, 200);
    },
  );

  return app;
}

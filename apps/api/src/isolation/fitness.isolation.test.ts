import { OpenAPIHono } from "@hono/zod-openapi";
import { NetlifyDB } from "@netlify/database-dev";
import {
  addDays,
  type AnnouncementsResponse,
  type BookingResult,
  type CancelResult,
  type ClassDetailResponse,
  type ClassesResponse,
  type FitnessMetricsResponse,
  type LeaderboardResponse,
  type LeadsResponse,
  type MessageThreadResponse,
  type MessageThreadsResponse,
  type MyBookingsResponse,
  type ProgressResponse,
  type SubscriptionsResponse,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";
import type { AppEnv } from "../http/context.ts";
import { ApiError } from "../http/errors.ts";
import { createFeeRoutes } from "../routes/fees.ts";
import { createOrgRoutes } from "../routes/org.ts";
import { signStripePayload } from "../services/payments/stripe.ts";

/**
 * Clubs de fitness (ADR 0049) contra una base real: el box monta sus tipos de clase y su horario,
 * da tarifas (ilimitada y bono), sus atletas reservan, se apuntan a la espera y cancelan, el coach
 * hace check-in y cierra la clase, programa el WOD y los atletas apuntan resultados con su
 * clasificación y sus marcas. Con mensajes, anuncios, leads de la web, métricas, domiciliación
 * por Stripe y un segundo box que no llega a nada del primero. Si una falla, la PR no se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const STRIPE_SECRET = "sk_test_fake";
const WEBHOOK_SECRET = "whsec_test_secret_000000000000";

type Seeded = { id: string; email: string };

/** Hoy en la zona del club (Europe/Madrid, la de por defecto). */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
/** Un instante de un día del club a una hora UTC (siempre el mismo día en Madrid). */
const at = (days: number, hourUtc: number) =>
  `${addDays(today, days)}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`;

describe("clubs de fitness", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let config: ReturnType<typeof loadConfig>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let ownerA: Seeded;
  let coachA: Seeded;
  let otherCoachA: Seeded;
  let ownerB: Seeded;
  let root: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("box-a");
  const B = hostOf("box-b");

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
  type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  const requestOn = (
    target: { request: App["request"] },
    method: Method,
    path: string,
    host: string,
    options: {
      cookie?: string;
      body?: unknown;
      raw?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    target.request(path, {
      method,
      headers: {
        host,
        origin: `https://${host}`,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.body !== undefined || options.raw !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(options.headers ?? {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.raw !== undefined ? { body: options.raw } : {}),
    });
  const request = (
    method: Method,
    path: string,
    host: string,
    options: { cookie?: string; body?: unknown } = {},
  ) => requestOn(app, method, path, host, options);
  async function signIn(email: string, host: string) {
    const res = await request("POST", "/api/auth/sign-in/email", host, {
      body: { email, password: PASSWORD },
    });
    expect(res.status, `login ${email}`).toBe(200);
    return cookieOf(res);
  }
  const as = (user: Seeded) => cookies.get(user.email)!;
  const json = async <T>(res: Response, status: number): Promise<T> => {
    expect(res.status, await res.clone().text()).toBe(status);
    return (await res.json()) as T;
  };
  const status = (res: Response) => res.status;

  /** Atletas con su propia cuenta: la ficha es suya (relación `self`, ADR 0046). */
  type Athlete = Seeded & { playerId: string; personId: string };
  let marta: Athlete;
  let sergi: Athlete;
  let laura: Athlete;
  let nuria: Athlete;
  let athleteB: Athlete;
  let polMinor = "";
  let sectionA = "";
  let sectionB = "";
  let wodType = "";
  let openBoxType = "";
  let wodTypeB = "";
  let unlimitedPlan = "";
  let packPlan = "";
  let planB = "";
  const subs = new Map<string, string>();
  /** Clases a mano, con su hora fija. */
  const cls: Record<string, string> = {};
  let workoutToday = "";
  let squatBlock = "";
  let franBlock = "";
  let draftBlock = "";
  let leadId = "";

  beforeAll(async () => {
    local = new NetlifyDB();
    const connectionString = await local.start();
    await local.applyMigrations(
      new URL("../../../../netlify/database/migrations", import.meta.url).pathname,
    );
    config = loadConfig({
      NODE_ENV: "test",
      APP_BASE_DOMAIN: BASE,
      TENANT_FALLBACK_SLUG: "demo",
      TENANT_ROUTING: "subdomain",
      EMAIL_TRANSPORT: "outbox",
    });
    data = createDataLayer({ config, connectionString, photoStore: createMemoryBlobStore() });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "box-a", name: "Box A" });
    clubB = await seeder.organization({ slug: "box-b", name: "Box B" });
    const user = (name: string, email: string) => seeder.user({ name, email, password: PASSWORD });
    ownerA = await user("Olga Owner", "olga@box-a.test");
    coachA = await user("Caro Coach", "caro@box-a.test");
    otherCoachA = await user("Dani Coach", "dani@box-a.test");
    ownerB = await user("Bruno Owner", "bruno@box-b.test");
    root = await user("Raíz Plataforma", "root@plataforma.test");
    await seeder.platformAdmin(root.id);
    await seeder.membership(clubA.id, ownerA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, otherCoachA.id, "coach");
    await seeder.membership(clubB.id, ownerB.id, "org_admin");

    for (const club of [clubA, clubB])
      await seeder.season(club.id, {
        name: "2026-27",
        startsOn: addDays(today, -60),
        endsOn: addDays(today, 200),
      });
    sectionA = (await seeder.section(clubA.id, "CrossFit", "crossfit", "activity")).id;
    sectionB = (await seeder.section(clubB.id, "CrossFit", "crossfit", "activity")).id;

    const athlete = async (
      club: { id: string },
      firstName: string,
      lastName: string,
      email: string,
      birthDate: string,
    ): Promise<Athlete> => {
      const account = await user(`${firstName} ${lastName}`, email);
      const person = await seeder.person(club.id, {
        firstName,
        lastName,
        birthDate,
        userId: account.id,
      });
      const player = await seeder.player(club.id, person.id);
      await seeder.membership(club.id, account.id, "athlete");
      await seeder.guardian(club.id, player.id, account.id, "self");
      return { ...account, playerId: player.id, personId: person.id };
    };
    marta = await athlete(clubA, "Marta", "Roig", "marta@box-a.test", "1990-03-02");
    sergi = await athlete(clubA, "Sergi", "Puig", "sergi@box-a.test", "1985-07-14");
    laura = await athlete(clubA, "Laura", "Vidal", "laura@box-a.test", "1994-11-30");
    nuria = await athlete(clubA, "Nuria", "Soler", "nuria@box-a.test", "1998-05-21");
    athleteB = await athlete(clubB, "Berta", "Bosch", "berta@box-b.test", "1991-01-01");
    polMinor = (
      await seeder.player(
        clubA.id,
        (
          await seeder.person(clubA.id, {
            firstName: "Pol",
            lastName: "Puig",
            birthDate: "2013-04-04",
          })
        ).id,
      )
    ).id;

    for (const u of [ownerA, coachA, otherCoachA, marta, sergi, laura, nuria])
      cookies.set(u.email, await signIn(u.email, A));
    for (const u of [ownerB, athleteB]) cookies.set(u.email, await signIn(u.email, B));
    cookies.set(root.email, await signIn(root.email, BASE));
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("la plataforma pasa el club a modelo fitness y el club lo ve en su marca", async () => {
    type Branding = { clubModel: string };
    expect(
      (await json<Branding>(await request("GET", "/api/org/branding", A), 200)).clubModel,
    ).toBe("sports");
    expect(
      status(
        await request("PATCH", "/api/platform/organizations/box-a", BASE, {
          cookie: as(ownerA),
          body: { clubModel: "fitness" },
        }),
      ),
    ).toBe(403);
    await json(
      await request("PATCH", "/api/platform/organizations/box-a", BASE, {
        cookie: as(root),
        body: { clubModel: "fitness" },
      }),
      200,
    );
    await json(
      await request("PATCH", "/api/platform/organizations/box-b", BASE, {
        cookie: as(root),
        body: { clubModel: "fitness" },
      }),
      200,
    );
    expect(
      (await json<Branding>(await request("GET", "/api/org/branding", A), 200)).clubModel,
    ).toBe("fitness");
    expect(
      status(
        await request("PATCH", "/api/platform/organizations/box-a", BASE, {
          cookie: as(root),
          body: { clubModel: "gimnasio" },
        }),
      ),
    ).toBe(400);
  });

  it("el dueño monta los tipos de clase con su horario; el coach no", async () => {
    expect(
      status(
        await request("POST", "/api/org/class-types", A, {
          cookie: as(coachA),
          body: { sectionId: sectionA, name: "WOD" },
        }),
      ),
    ).toBe(403);
    type ClassType = { classType: { teamId: string; name: string; capacity: number | null } };
    const wod = await json<ClassType>(
      await request("POST", "/api/org/class-types", A, {
        cookie: as(ownerA),
        body: { sectionId: sectionA, name: "WOD", capacity: 2 },
      }),
      201,
    );
    wodType = wod.classType.teamId;
    expect(wod.classType).toMatchObject({ name: "WOD", capacity: 2 });
    openBoxType = (
      await json<ClassType>(
        await request("POST", "/api/org/class-types", A, {
          cookie: as(ownerA),
          body: { sectionId: sectionA, name: "Open Box", capacity: 10 },
        }),
        201,
      )
    ).classType.teamId;
    expect(
      status(
        await request("POST", "/api/org/class-types", A, {
          cookie: as(ownerA),
          body: { sectionId: sectionA, name: "WOD" },
        }),
      ),
    ).toBe(409);
    // Una disciplina de otro box no vale.
    expect(
      status(
        await request("POST", "/api/org/class-types", A, {
          cookie: as(ownerA),
          body: { sectionId: sectionB, name: "Robado" },
        }),
      ),
    ).toBe(400);
    wodTypeB = (
      await json<ClassType>(
        await request("POST", "/api/org/class-types", B, {
          cookie: as(ownerB),
          body: { sectionId: sectionB, name: "WOD", capacity: 12 },
        }),
        201,
      )
    ).classType.teamId;

    // Horario: el WOD de las 7, con su coach y su aforo, y generado hasta fin de temporada.
    const tomorrow = addDays(today, 1);
    const day = new Date(`${tomorrow}T12:00:00Z`).getUTCDay();
    const weekday = day === 0 ? 7 : day;
    const scheduled = await json<{
      classType: {
        slots: { coach: { name: string } | null; capacity: number | null }[];
        upcoming: number;
      };
      generated: number;
    }>(
      await request("PUT", `/api/org/class-types/${wodType}/schedule`, A, {
        cookie: as(ownerA),
        body: {
          slots: [
            { weekday, startsAt: "07:00", endsAt: "08:00", coachUserId: coachA.id, capacity: 2 },
          ],
          generate: true,
        },
      }),
      200,
    );
    expect(scheduled.generated).toBeGreaterThan(20);
    expect(scheduled.classType.slots).toMatchObject([
      { coach: { name: "Caro Coach" }, capacity: 2 },
    ]);
    // Un coach de otro club no puede dar la clase.
    expect(
      status(
        await request("PUT", `/api/org/class-types/${wodType}/schedule`, A, {
          cookie: as(ownerA),
          body: {
            slots: [{ weekday, startsAt: "07:00", endsAt: "08:00", coachUserId: ownerB.id }],
          },
        }),
      ),
    ).toBe(400);
    // Regenerar no duplica: el mismo horario deja las mismas clases.
    const again = await json<{ classType: { upcoming: number } }>(
      await request("PUT", `/api/org/class-types/${wodType}/schedule`, A, {
        cookie: as(ownerA),
        body: {
          slots: [
            { weekday, startsAt: "07:00", endsAt: "08:00", coachUserId: coachA.id, capacity: 2 },
          ],
          generate: true,
        },
      }),
      200,
    );
    expect(again.classType.upcoming).toBe(scheduled.classType.upcoming);

    // Clases a mano a horas fijas para el resto de pruebas.
    const event = async (
      teamId: string,
      key: string,
      days: number,
      hour: number,
      capacity: number,
    ) => {
      const created = await json<{ event: { id: string; capacity: number | null } }>(
        await request("POST", "/api/org/events", A, {
          cookie: as(ownerA),
          body: {
            kind: "training",
            title: key,
            sectionId: sectionA,
            teamId,
            startsAt: at(days, hour),
            endsAt: at(days, hour + 1),
            capacity,
            coachUserId: coachA.id,
          },
        }),
        201,
      );
      expect(created.event.capacity).toBe(capacity);
      cls[key] = created.event.id;
    };
    await event(wodType, "clase1", 1, 9, 2);
    await event(wodType, "clase2", 1, 17, 10);
    await event(wodType, "clase3", 2, 9, 2);
    await event(openBoxType, "openBox", 2, 17, 10);
    await event(wodType, "clase4", 3, 9, 2);
    await event(wodType, "carrera", 4, 9, 1);
    await event(wodType, "lejos", 9, 9, 10);
  });

  it("política de reservas: la lee quien ve los ajustes y la cambia el dueño", async () => {
    type Policy = { maxPerDay: number | null; opensDaysBefore: number; showAttendees: boolean };
    const policy = await json<Policy>(
      await request("GET", "/api/org/booking-policy", A, { cookie: as(coachA) }),
      200,
    );
    expect(policy).toMatchObject({ opensDaysBefore: 7, maxPerDay: null, showAttendees: true });
    expect(
      status(
        await request("PUT", "/api/org/booking-policy", A, {
          cookie: as(coachA),
          body: { maxPerDay: 1 },
        }),
      ),
    ).toBe(403);
    const updated = await json<Policy>(
      await request("PUT", "/api/org/booking-policy", A, {
        cookie: as(ownerA),
        body: { maxPerDay: 1 },
      }),
      200,
    );
    expect(updated).toMatchObject({ maxPerDay: 1, opensDaysBefore: 7 });
    // El otro box sigue con la suya.
    expect(
      (
        await json<Policy>(
          await request("GET", "/api/org/booking-policy", B, { cookie: as(ownerB) }),
          200,
        )
      ).maxPerDay,
    ).toBeNull();
  });

  it("tarifas: ilimitada y bono de sesiones, con lo que permite cada una", async () => {
    type Plan = { plan: { id: string; entitlement: string; sessions: number | null } };
    expect(
      status(
        await request("POST", "/api/org/fees/plans", A, {
          cookie: as(ownerA),
          body: { name: "Bono roto", amountCents: 5000, period: "once", entitlement: "pack" },
        }),
      ),
    ).toBe(400);
    unlimitedPlan = (
      await json<Plan>(
        await request("POST", "/api/org/fees/plans", A, {
          cookie: as(ownerA),
          body: {
            name: "Ilimitada",
            amountCents: 6900,
            period: "monthly",
            sectionId: sectionA,
            entitlement: "unlimited",
          },
        }),
        201,
      )
    ).plan.id;
    const pack = await json<Plan>(
      await request("POST", "/api/org/fees/plans", A, {
        cookie: as(ownerA),
        body: {
          name: "Bono 2 WOD",
          amountCents: 3000,
          period: "once",
          sectionId: sectionA,
          entitlement: "pack",
          sessions: 2,
          validityDays: 30,
          classTeamIds: [wodType],
        },
      }),
      201,
    );
    packPlan = pack.plan.id;
    expect(pack.plan).toMatchObject({ entitlement: "pack", sessions: 2 });
    planB = (
      await json<Plan>(
        await request("POST", "/api/org/fees/plans", B, {
          cookie: as(ownerB),
          body: {
            name: "Ilimitada B",
            amountCents: 5900,
            period: "monthly",
            entitlement: "unlimited",
          },
        }),
        201,
      )
    ).plan.id;

    type Sub = {
      plan: { id: string; status: string; usage: { limit: number | null; used: number } };
    };
    const give = async (who: Athlete, feePlanId: string, chargeNow = false) => {
      const created = await json<Sub>(
        await request("POST", "/api/org/subscriptions", A, {
          cookie: as(ownerA),
          body: { playerId: who.playerId, feePlanId, startsOn: today, chargeNow },
        }),
        201,
      );
      subs.set(who.email, created.plan.id);
      return created.plan;
    };
    expect(await give(marta, unlimitedPlan, true)).toMatchObject({
      status: "active",
      usage: { limit: null },
    });
    expect(await give(sergi, packPlan)).toMatchObject({ usage: { limit: 2, used: 0 } });
    await give(nuria, unlimitedPlan);
    // Una tarifa de otro box o para un atleta de otro box, no.
    expect(
      status(
        await request("POST", "/api/org/subscriptions", A, {
          cookie: as(ownerA),
          body: { playerId: laura.playerId, feePlanId: planB, startsOn: today },
        }),
      ),
    ).toBe(400);
    expect(
      status(
        await request("POST", "/api/org/subscriptions", A, {
          cookie: as(ownerA),
          body: { playerId: athleteB.playerId, feePlanId: unlimitedPlan, startsOn: today },
        }),
      ),
    ).toBe(400);
    // Ni el coach ni el atleta las gestionan.
    expect(status(await request("GET", "/api/org/subscriptions", A, { cookie: as(coachA) }))).toBe(
      403,
    );
    expect(
      status(
        await request("POST", "/api/org/subscriptions", A, {
          cookie: as(marta),
          body: { playerId: marta.playerId, feePlanId: unlimitedPlan, startsOn: today },
        }),
      ),
    ).toBe(403);

    const list = await json<SubscriptionsResponse>(
      await request("GET", "/api/org/subscriptions", A, { cookie: as(ownerA) }),
      200,
    );
    expect(list.plans.map((p) => p.player.name).sort()).toEqual([
      "Marta Roig",
      "Nuria Soler",
      "Sergi Puig",
    ]);
    // El cargo del primer mes de Marta ya está.
    const mine = await json<{ plans: { id: string }[]; canSubscribe: boolean }>(
      await request("GET", "/api/org/me/plan", A, { cookie: as(marta) }),
      200,
    );
    expect(mine.plans.map((p) => p.id)).toEqual([subs.get(marta.email)]);
    expect(mine.canSubscribe).toBe(false);
  });

  it("reservas: sin tarifa no, aforo y espera, límite diario, ventana y bono", async () => {
    const book = (who: Athlete, key: string) =>
      request("POST", `/api/org/classes/${cls[key]}/bookings`, A, { cookie: as(who), body: {} });
    const blocked = async (who: Athlete, key: string, message: RegExp) => {
      const res = await book(who, key);
      expect(res.status, key).toBe(409);
      expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(message);
    };

    // El horario del atleta: la clase con su coach y sus plazas.
    const schedule = await json<ClassesResponse>(
      await request(
        "GET",
        `/api/org/classes?from=${encodeURIComponent(at(1, 0))}&to=${encodeURIComponent(at(2, 0))}`,
        A,
        { cookie: as(marta) },
      ),
      200,
    );
    expect(schedule.role).toBe("athlete");
    expect(schedule.plan?.plan.name).toBe("Ilimitada");
    const first = schedule.classes.find((c) => c.id === cls["clase1"]);
    expect(first).toMatchObject({
      capacity: 2,
      booked: 0,
      coach: { name: "Caro Coach" },
      team: { name: "WOD" },
      action: "book",
      my: null,
    });

    await blocked(laura, "clase1", /tarifa/);
    expect((await json<BookingResult>(await book(marta, "clase1"), 201)).booking.status).toBe(
      "booked",
    );
    await blocked(marta, "clase1", /Ya tienes/);
    expect((await json<BookingResult>(await book(sergi, "clase1"), 201)).booking.status).toBe(
      "booked",
    );

    // Laura ya tiene tarifa: la clase está llena y entra en la espera.
    const lauraSub = await json<{ plan: { id: string } }>(
      await request("POST", "/api/org/subscriptions", A, {
        cookie: as(ownerA),
        body: { playerId: laura.playerId, feePlanId: unlimitedPlan, startsOn: today },
      }),
      201,
    );
    subs.set(laura.email, lauraSub.plan.id);
    const waiting = await json<BookingResult>(await book(laura, "clase1"), 201);
    expect(waiting.booking).toMatchObject({ status: "waitlist", position: 1 });
    expect(waiting.class).toMatchObject({ booked: 2, waitlist: 1 });

    // Una clase al día como mucho; la de dentro de nueve días aún no abre.
    await blocked(marta, "clase2", /máximo de clases/);
    await blocked(marta, "lejos", /aún no está abierta/);
    await json(
      await request("PUT", "/api/org/booking-policy", A, {
        cookie: as(ownerA),
        body: { maxPerDay: null },
      }),
      200,
    );

    // El bono de Sergi: solo WOD y dos sesiones.
    await blocked(sergi, "openBox", /no incluye/);
    expect((await json<BookingResult>(await book(sergi, "clase3"), 201)).booking.status).toBe(
      "booked",
    );
    await blocked(sergi, "clase4", /No te quedan sesiones/);
    const sergiPlan = await json<{
      plans: { usage: { used: number; remaining: number | null } }[];
    }>(await request("GET", "/api/org/me/plan", A, { cookie: as(sergi) }), 200);
    expect(sergiPlan.plans[0]!.usage).toMatchObject({ used: 2, remaining: 0 });

    // Marta cancela a tiempo: no gasta y Laura entra de la espera.
    const cancelled = await json<CancelResult>(
      await request("DELETE", `/api/org/classes/${cls["clase1"]}/bookings/me`, A, {
        cookie: as(marta),
      }),
      200,
    );
    expect(cancelled).toMatchObject({ status: "cancelled", promoted: true });
    expect(cancelled.class).toMatchObject({ booked: 2, waitlist: 0 });
    expect(
      status(
        await request("DELETE", `/api/org/classes/${cls["clase1"]}/bookings/me`, A, {
          cookie: as(marta),
        }),
      ),
    ).toBe(409);
    const lauraBookings = await json<MyBookingsResponse>(
      await request("GET", "/api/org/me/bookings", A, { cookie: as(laura) }),
      200,
    );
    expect(lauraBookings.upcoming.find((c) => c.id === cls["clase1"])?.my?.status).toBe("booked");

    // El personal no reserva por un atleta de otro box; el coach de la clase sí por uno del suyo.
    expect(
      status(
        await request("POST", `/api/org/classes/${cls["clase4"]}/bookings`, A, {
          cookie: as(coachA),
          body: { playerId: athleteB.playerId },
        }),
      ),
    ).toBe(400);
    expect(
      (
        await json<BookingResult>(
          await request("POST", `/api/org/classes/${cls["clase4"]}/bookings`, A, {
            cookie: as(coachA),
            body: { playerId: nuria.playerId },
          }),
          201,
        )
      ).booking.status,
    ).toBe("booked");
    // Un atleta no reserva por otro.
    expect(
      status(
        await request("POST", `/api/org/classes/${cls["clase4"]}/bookings`, A, {
          cookie: as(marta),
          body: { playerId: laura.playerId },
        }),
      ),
    ).toBe(403);
  });

  // La base embebida de las pruebas (PGlite) atiende todas las conexiones en una sola sesión: el
  // bloqueo de la fila del evento no se puede ver en paralelo aquí. Se prueba la regla en serie.
  it("la última plaza: la primera entra y la siguiente va a la espera", async () => {
    const results: BookingResult[] = [];
    for (const who of [marta, nuria])
      results.push(
        await json<BookingResult>(
          await request("POST", `/api/org/classes/${cls["carrera"]}/bookings`, A, {
            cookie: as(who),
            body: {},
          }),
          201,
        ),
      );
    expect(results.map((r) => r.booking.status)).toEqual(["booked", "waitlist"]);
    const detail = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${cls["carrera"]}`, A, { cookie: as(ownerA) }),
      200,
    );
    expect(detail.class).toMatchObject({ booked: 1, waitlist: 1 });
    expect(detail.waitlist).toHaveLength(1);
  });

  it("la lista de la clase respeta a quien prefiere no salir; el coach ve todo", async () => {
    await json(
      await request("PUT", "/api/org/me/fitness-preferences", A, {
        cookie: as(laura),
        body: { hideFromAttendees: true },
      }),
      200,
    );
    const seen = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${cls["clase1"]}`, A, { cookie: as(nuria) }),
      200,
    );
    expect(seen.attendees.map((a) => a.name)).toEqual(["Sergi Puig"]);
    expect(seen.hiddenCount).toBe(1);
    expect(seen.brief).toBeNull();
    expect(seen.canCheckIn).toBe(false);
    expect(seen.attendees[0]!.status).toBeNull();

    const coach = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${cls["clase1"]}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(coach.attendees.map((a) => a.name).sort()).toEqual(["Laura Vidal", "Sergi Puig"]);
    expect(coach.canCheckIn).toBe(true);
    expect(coach.brief).not.toBeNull();

    // Con la lista apagada por el club, el atleta no ve a nadie.
    await json(
      await request("PUT", "/api/org/booking-policy", A, {
        cookie: as(ownerA),
        body: { showAttendees: false },
      }),
      200,
    );
    const hidden = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${cls["clase1"]}`, A, { cookie: as(nuria) }),
      200,
    );
    expect(hidden.attendees).toEqual([]);
    await json(
      await request("PUT", "/api/org/booking-policy", A, {
        cookie: as(ownerA),
        body: { showAttendees: true },
      }),
      200,
    );
  });

  it("check-in y cierre: lo hace el coach de la clase; quien no vino queda como no presentado", async () => {
    expect(
      status(
        await request("POST", `/api/org/classes/${cls["clase3"]}/close`, A, { cookie: as(coachA) }),
      ),
    ).toBe(409);
    // La clase 1 empieza ya.
    const now = Date.now();
    await json(
      await request("PATCH", `/api/org/events/${cls["clase1"]}`, A, {
        cookie: as(ownerA),
        body: {
          startsAt: new Date(now - 10 * 60_000).toISOString(),
          endsAt: new Date(now + 50 * 60_000).toISOString(),
        },
      }),
      200,
    );
    // Ya no se cancela ni se reserva.
    expect(
      status(
        await request("DELETE", `/api/org/classes/${cls["clase1"]}/bookings/me`, A, {
          cookie: as(sergi),
        }),
      ),
    ).toBe(409);
    const checkIn = (who: Seeded, playerId: string, present = true) =>
      request("POST", `/api/org/classes/${cls["clase1"]}/check-in`, A, {
        cookie: as(who),
        body: { playerId, present },
      });
    expect(status(await checkIn(marta, sergi.playerId))).toBe(403);
    expect([403, 404]).toContain(status(await checkIn(otherCoachA, sergi.playerId)));
    expect(status(await checkIn(coachA, athleteB.playerId))).toBe(400);
    await json(await checkIn(coachA, sergi.playerId), 200);
    // Marta canceló, pero viene: entra igual.
    const walkIn = await json<ClassDetailResponse>(await checkIn(coachA, marta.playerId), 200);
    expect(walkIn.class.checkedIn).toBe(2);
    expect(walkIn.attendees.find((a) => a.playerId === marta.playerId)?.status).toBe("attended");

    const closed = await json<{ noShows: number }>(
      await request("POST", `/api/org/classes/${cls["clase1"]}/close`, A, { cookie: as(coachA) }),
      200,
    );
    expect(closed.noShows).toBe(1);
    const history = await json<MyBookingsResponse>(
      await request("GET", "/api/org/me/bookings", A, { cookie: as(laura) }),
      200,
    );
    expect(history.upcoming.map((c) => c.id)).not.toContain(cls["clase1"]);
    const closedView = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${cls["clase1"]}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(closedView.attendees.find((a) => a.playerId === laura.playerId)?.status).toBe("no_show");
    const attendance = await json<{ entries: { playerId: string; status: string | null }[] }>(
      await request("GET", `/api/org/events/${cls["clase1"]}/attendance`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(Object.fromEntries(attendance.entries.map((a) => [a.playerId, a.status]))).toEqual({
      [sergi.playerId]: "present",
      [marta.playerId]: "present",
      [laura.playerId]: "absent",
    });
  });

  it("programación: el coach publica el WOD de sus clases; el atleta solo ve lo publicado", async () => {
    const blocks = [
      {
        kind: "strength",
        title: "Back squat 1RM",
        scoreType: "load",
        movementCode: "back_squat",
        rmReps: 1,
      },
      { kind: "wod", title: "Fran", scoreType: "time", timeCapSeconds: 600, rx: "43/30 kg" },
    ];
    expect(
      status(
        await request("POST", "/api/org/workouts", A, {
          cookie: as(otherCoachA),
          body: { sectionId: sectionA, onDate: today, status: "published", blocks },
        }),
      ),
    ).toBe(403);
    type Workout = { workout: { id: string; blocks: { id: string; label: string }[] } };
    const published = await json<Workout>(
      await request("POST", "/api/org/workouts", A, {
        cookie: as(coachA),
        body: {
          sectionId: sectionA,
          onDate: today,
          title: "Fran day",
          status: "published",
          blocks,
        },
      }),
      201,
    );
    workoutToday = published.workout.id;
    [squatBlock, franBlock] = published.workout.blocks.map((b) => b.id) as [string, string];
    expect(published.workout.blocks.map((b) => b.label)).toEqual(["A", "B"]);
    expect(
      status(
        await request("POST", "/api/org/workouts", A, {
          cookie: as(coachA),
          body: { sectionId: sectionA, onDate: today, status: "draft", blocks },
        }),
      ),
    ).toBe(409);
    const draft = await json<Workout>(
      await request("POST", "/api/org/workouts", A, {
        cookie: as(coachA),
        body: { sectionId: sectionA, onDate: addDays(today, 1), status: "draft", blocks },
      }),
      201,
    );
    draftBlock = draft.workout.blocks[0]!.id;

    type Mine = { workouts: { id: string; blocks: { id: string }[] }[] };
    const todayView = await json<Mine>(
      await request("GET", "/api/org/me/workouts", A, { cookie: as(marta) }),
      200,
    );
    expect(todayView.workouts.map((w) => w.id)).toEqual([workoutToday]);
    const tomorrowView = await json<Mine>(
      await request("GET", `/api/org/me/workouts?date=${addDays(today, 1)}`, A, {
        cookie: as(marta),
      }),
      200,
    );
    expect(tomorrowView.workouts).toEqual([]);
    expect(
      status(
        await request("PUT", `/api/org/me/results/${draftBlock}`, A, {
          cookie: as(marta),
          body: { level: "rx", score: { loadKg: 80 } },
        }),
      ),
    ).toBe(404);
    // El atleta no ve la programación del box (eso es del personal).
    expect(status(await request("GET", "/api/org/workouts", A, { cookie: as(marta) }))).toBe(403);
  });

  it("resultados: marca personal al superar la máxima y clasificación sin quien prefiere no salir", async () => {
    const result = (who: Athlete, blockId: string, body: unknown) =>
      request("PUT", `/api/org/me/results/${blockId}`, A, { cookie: as(who), body });
    type Saved = { personalRecord: boolean; result: { display: string } };
    const first = await json<Saved>(
      await result(marta, squatBlock, { level: "rx", score: { loadKg: 100 } }),
      200,
    );
    expect(first.personalRecord).toBe(true);
    await json(
      await request("POST", "/api/org/me/records", A, {
        cookie: as(marta),
        body: { movementCode: "back_squat", reps: 1, loadKg: 110, onDate: today },
      }),
      201,
    );
    const corrected = await json<Saved>(
      await result(marta, squatBlock, { level: "rx", score: { loadKg: 105 } }),
      200,
    );
    expect(corrected.personalRecord).toBe(false);
    expect(status(await result(marta, franBlock, { level: "rx", score: {} }))).toBe(400);

    await json(await result(laura, franBlock, { level: "rx", score: { timeSeconds: 280 } }), 200);
    await json(
      await result(sergi, franBlock, { level: "scaled", score: { timeSeconds: 240 } }),
      200,
    );
    await json(
      await request("PUT", "/api/org/me/fitness-preferences", A, {
        cookie: as(nuria),
        body: { hideFromLeaderboards: true },
      }),
      200,
    );
    await json(await result(nuria, franBlock, { level: "rx", score: { timeSeconds: 250 } }), 200);

    const board = (who: Seeded, query = "") =>
      request("GET", `/api/org/workouts/blocks/${franBlock}/leaderboard${query}`, A, {
        cookie: as(who),
      });
    const seen = await json<LeaderboardResponse>(await board(marta, "?level=rx"), 200);
    expect(seen.entries.map((e) => [e.rank, e.name, e.display])).toEqual([
      [1, "Laura Vidal", "4:40"],
    ]);
    expect(seen.hiddenCount).toBe(1);
    const own = await json<LeaderboardResponse>(await board(nuria, "?level=rx"), 200);
    expect(own.entries.map((e) => [e.name, e.isMe])).toEqual([
      ["Nuria Soler", true],
      ["Laura Vidal", false],
    ]);
    const coach = await json<LeaderboardResponse>(await board(coachA), 200);
    expect(coach.entries).toHaveLength(3);
    expect(coach.hiddenCount).toBe(0);

    // Con la clasificación apagada por el club, el atleta no la ve; el coach sí.
    await json(
      await request("PUT", "/api/org/booking-policy", A, {
        cookie: as(ownerA),
        body: { showLeaderboards: false },
      }),
      200,
    );
    expect(status(await board(marta))).toBe(403);
    await json(await board(coachA), 200);
    await json(
      await request("PUT", "/api/org/booking-policy", A, {
        cookie: as(ownerA),
        body: { showLeaderboards: true },
      }),
      200,
    );
  });

  it("progreso del atleta: su calendario, sus marcas, sus benchmarks y sus medidas privadas", async () => {
    await json(
      await request("POST", "/api/org/me/benchmarks", A, {
        cookie: as(marta),
        body: { benchmarkCode: "fran", level: "rx", score: { timeSeconds: 290 }, onDate: today },
      }),
      201,
    );
    await json(
      await request("POST", "/api/org/me/body", A, {
        cookie: as(marta),
        body: { onDate: today, weightKg: 62.5 },
      }),
      201,
    );
    expect(
      status(
        await request("POST", "/api/org/me/body", A, {
          cookie: as(marta),
          body: { onDate: today },
        }),
      ),
    ).toBe(400);
    const progress = await json<ProgressResponse>(
      await request("GET", "/api/org/me/progress", A, { cookie: as(marta) }),
      200,
    );
    const squat = progress.movements.find((m) => m.movementCode === "back_squat");
    expect(squat?.oneRm).toEqual({ kg: 110, estimated: false });
    expect(progress.benchmarks.map((b) => b.benchmarkCode)).toEqual(["fran"]);
    expect(progress.body.map((b) => b.weightKg)).toEqual([62.5]);
    expect(progress.days.find((d) => d.date === addDays(today, 4))?.booked).toBe(true);

    const home = await json<{ plan: { plan: { name: string } } | null; lastRecord: unknown }>(
      await request("GET", "/api/org/me/fitness", A, { cookie: as(marta) }),
      200,
    );
    expect(home.plan?.plan.name).toBe("Ilimitada");
    expect(home.lastRecord).not.toBeNull();
    // El personal no llega a lo "mío" de nadie.
    expect(status(await request("GET", "/api/org/me/progress", A, { cookie: as(coachA) }))).toBe(
      403,
    );
  });

  it("anuncios del box y mensajes entre el club y sus atletas adultos", async () => {
    expect(
      status(
        await request("POST", "/api/org/announcements", A, {
          cookie: as(marta),
          body: { title: "Hola", body: "Nada", audience: "all" },
        }),
      ),
    ).toBe(403);
    const created = await json<{ announcement: { id: string } }>(
      await request("POST", "/api/org/announcements", A, {
        cookie: as(ownerA),
        body: { title: "Open 26.1", body: "El viernes, a las 19.", audience: "all", pinned: true },
      }),
      201,
    );
    const feed = await json<AnnouncementsResponse>(
      await request("GET", "/api/org/announcements", A, { cookie: as(marta) }),
      200,
    );
    expect(feed.canWrite).toBe(false);
    expect(feed.announcements).toMatchObject([
      { title: "Open 26.1", read: false, readCount: null },
    ]);
    await request("POST", `/api/org/announcements/${created.announcement.id}/read`, A, {
      cookie: as(marta),
    });
    const after = await json<AnnouncementsResponse>(
      await request("GET", "/api/org/announcements", A, { cookie: as(ownerA) }),
      200,
    );
    expect(after.announcements[0]).toMatchObject({ readCount: 1 });
    expect(
      (
        await json<AnnouncementsResponse>(
          await request("GET", "/api/org/announcements", B, { cookie: as(ownerB) }),
          200,
        )
      ).announcements,
    ).toEqual([]);

    await json(
      await request("POST", "/api/org/me/messages", A, {
        cookie: as(marta),
        body: { body: "¿Puedo cambiar a la clase de las 19?" },
      }),
      201,
    );
    const threads = await json<MessageThreadsResponse>(
      await request("GET", "/api/org/messages", A, { cookie: as(ownerA) }),
      200,
    );
    expect(threads.threads).toMatchObject([{ playerId: marta.playerId, unread: 1 }]);
    await json(
      await request("POST", `/api/org/messages/${marta.playerId}`, A, {
        cookie: as(ownerA),
        body: { body: "Claro, te la cambio." },
      }),
      201,
    );
    const thread = await json<MessageThreadResponse>(
      await request("GET", "/api/org/me/messages", A, { cookie: as(marta) }),
      200,
    );
    expect(thread.messages.map((m) => m.fromAthlete)).toEqual([true, false]);
    expect(status(await request("GET", "/api/org/messages", A, { cookie: as(marta) }))).toBe(403);
    // Con un menor, no hay hilo.
    expect(
      status(
        await request("POST", `/api/org/messages/${polMinor}`, A, {
          cookie: as(ownerA),
          body: { body: "Hola" },
        }),
      ),
    ).toBe(403);
    // Un coach solo escribe a atletas de sus clases.
    expect(
      status(
        await request("GET", `/api/org/messages/${laura.playerId}`, A, { cookie: as(otherCoachA) }),
      ),
    ).toBe(404);
  });

  it("la web del box: horario sin nombres y clase de prueba que deja un lead", async () => {
    const key = (
      await json<{ developer: { publicKey: string } }>(
        await request("POST", "/api/org/store/developer/key", A, { cookie: as(ownerA) }),
        200,
      )
    ).developer.publicKey;
    type Public = { club: { slug: string }; classes: { id: string; spotsLeft: number | null }[] };
    const res = await request("GET", `/api/public/v1/classes?key=${key}&days=10`, A);
    const text = await res.clone().text();
    const schedule = await json<Public>(res, 200);
    expect(schedule.club.slug).toBe("box-a");
    expect(schedule.classes.find((c) => c.id === cls["clase3"])?.spotsLeft).toBe(1);
    expect(text).not.toMatch(/Sergi|Marta|Laura/);
    expect(status(await request("GET", "/api/public/v1/classes", A))).toBe(401);

    const trial = {
      firstName: "Iris",
      lastName: "Mas",
      email: "iris@correo.test",
      eventId: cls["clase3"],
      consent: true,
    };
    expect(
      status(
        await request("POST", `/api/public/v1/trials?key=${key}`, A, {
          body: { ...trial, consent: false },
        }),
      ),
    ).toBe(400);
    await json(await request("POST", `/api/public/v1/trials?key=${key}`, A, { body: trial }), 201);
    await json(await request("POST", `/api/public/v1/trials?key=${key}`, A, { body: trial }), 201);

    expect(status(await request("GET", "/api/org/leads", A, { cookie: as(coachA) }))).toBe(403);
    const leads = await json<LeadsResponse>(
      await request("GET", "/api/org/leads", A, { cookie: as(ownerA) }),
      200,
    );
    expect(leads.leads).toHaveLength(1);
    expect(leads.leads[0]).toMatchObject({
      firstName: "Iris",
      source: "web",
      status: "trial_booked",
      trialClass: { id: cls["clase3"] },
    });
    leadId = leads.leads[0]!.id;
    expect(
      (
        await json<LeadsResponse>(
          await request("GET", "/api/org/leads", B, { cookie: as(ownerB) }),
          200,
        )
      ).leads,
    ).toEqual([]);

    const converted = await json<{ lead: { status: string; convertedPlayerId: string } }>(
      await request("POST", `/api/org/leads/${leadId}/convert`, A, {
        cookie: as(ownerA),
        body: { feePlanId: unlimitedPlan, startsOn: today, chargeNow: true },
      }),
      200,
    );
    expect(converted.lead.status).toBe("converted");
    expect(
      status(
        await request("POST", `/api/org/leads/${leadId}/convert`, A, {
          cookie: as(ownerA),
          body: {},
        }),
      ),
    ).toBe(409);
    const plans = await json<SubscriptionsResponse>(
      await request("GET", "/api/org/subscriptions", A, { cookie: as(ownerA) }),
      200,
    );
    expect(plans.plans.map((p) => p.player.name)).toContain("Iris Mas");
  });

  it("métricas del dueño y ranking del box", async () => {
    expect(
      status(await request("GET", "/api/org/fitness/metrics", A, { cookie: as(coachA) })),
    ).toBe(403);
    const metrics = await json<FitnessMetricsResponse>(
      await request("GET", "/api/org/fitness/metrics", A, { cookie: as(ownerA) }),
      200,
    );
    expect(metrics.activeAthletes).toBe(5);
    expect(metrics.recurringMonthlyCents).toBe(4 * 6900);
    expect(metrics.trialsConvertedThisMonth).toBe(1);
    expect(metrics.programming.find((p) => p.date === today)?.status).toBe("published");
    expect(metrics.programming.find((p) => p.date === addDays(today, 1))?.status).toBe("draft");

    const ranking = await json<{ consistency: { name: string }[] }>(
      await request("GET", "/api/org/fitness/ranking", A, { cookie: as(marta) }),
      200,
    );
    expect(ranking.consistency.map((r) => r.name)).toContain("Marta Roig");
    const athletes = await json<{ athletes: { name: string; plan: { name: string } | null }[] }>(
      await request("GET", "/api/org/athletes", A, { cookie: as(ownerA) }),
      200,
    );
    expect(athletes.athletes.find((a) => a.name === "Sergi Puig")?.plan?.name).toBe("Bono 2 WOD");
    expect(athletes.athletes.map((a) => a.name)).not.toContain("Berta Bosch");
  });

  it("domiciliar la tarifa por Stripe: el alta, cada factura una sola vez y la baja", async () => {
    const stripeConfig = loadConfig({
      NODE_ENV: "test",
      APP_BASE_DOMAIN: BASE,
      TENANT_FALLBACK_SLUG: "demo",
      TENANT_ROUTING: "subdomain",
      EMAIL_TRANSPORT: "outbox",
      STRIPE_SECRET_KEY: STRIPE_SECRET,
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    });
    const calls: { url: string; body: string }[] = [];
    const fakeFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, body: typeof init?.body === "string" ? init.body : "" });
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: "cs_sub_1", url: "https://checkout.stripe.com/c/pay/cs_sub_1" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const stripeApp = new OpenAPIHono<AppEnv>();
    stripeApp.onError((error, c) => {
      if (error instanceof ApiError) return c.json(error.toBody(), error.status);
      throw error;
    });
    stripeApp.route("/", createOrgRoutes(stripeConfig, data));
    stripeApp.route(
      "/",
      createFeeRoutes(stripeConfig, data, { fetch: fakeFetch, now: () => nowSeconds }),
    );

    const subscription = subs.get(marta.email)!;
    const checkout = (who: Seeded, id = subscription) =>
      requestOn(stripeApp, "POST", `/api/org/fees/subscriptions/${id}/checkout`, A, {
        cookie: as(who),
        body: { returnPath: "/plan" },
      });
    // Sin Stripe en el club, no.
    expect(status(await checkout(marta))).toBe(409);
    await seeder.stripeAccount(clubA.id, "acct_BOXA");
    await json(
      await requestOn(stripeApp, "PATCH", "/api/org/fees/settings", A, {
        cookie: as(ownerA),
        body: { provider: "stripe" },
      }),
      200,
    );
    expect(status(await checkout(nuria))).toBe(403);
    expect(status(await checkout(sergi, subs.get(sergi.email)))).toBe(409);
    const session = await json<{ url: string }>(await checkout(marta), 200);
    expect(session.url).toBe("https://checkout.stripe.com/c/pay/cs_sub_1");
    const form = new URLSearchParams(calls.at(-1)!.body);
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("metadata[subscription_id]")).toBe(subscription);
    expect(form.get("line_items[0][price_data][recurring][interval]")).toBe("month");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("6900");
    expect([form.get("payment_method_types[0]"), form.get("payment_method_types[1]")]).toEqual([
      "card",
      "sepa_debit",
    ]);

    const send = async (event: Record<string, unknown>) => {
      const raw = JSON.stringify(event);
      return json<{ received: true; recorded: boolean }>(
        await requestOn(stripeApp, "POST", "/api/webhooks/stripe", BASE, {
          raw,
          headers: { "stripe-signature": await signStripePayload(WEBHOOK_SECRET, raw, nowSeconds) },
        }),
        200,
      );
    };
    await send({
      id: "evt_sub_1",
      type: "checkout.session.completed",
      account: "acct_BOXA",
      data: {
        object: {
          id: "cs_sub_1",
          mode: "subscription",
          subscription: "sub_123",
          client_reference_id: subscription,
          metadata: {
            kind: "subscription",
            subscription_id: subscription,
            organization_id: clubA.id,
          },
        },
      },
    });
    const planOf = async () =>
      (
        await json<SubscriptionsResponse>(
          await request("GET", "/api/org/subscriptions", A, { cookie: as(ownerA) }),
          200,
        )
      ).plans.find((p) => p.id === subscription)!;
    expect(await planOf()).toMatchObject({
      billing: "stripe",
      stripeStatus: "active",
      status: "active",
    });
    expect(status(await checkout(marta))).toBe(409);

    const invoice = (id: string, account = "acct_BOXA") => ({
      id: `evt_${id}`,
      type: "invoice.paid",
      account,
      data: {
        object: {
          id,
          subscription: "sub_123",
          amount_paid: 6900,
          period_start: nowSeconds + 31 * 86_400,
          payment_intent: `pi_${id}`,
        },
      },
    });
    expect((await send(invoice("in_1"))).recorded).toBe(true);
    expect((await send(invoice("in_1"))).recorded).toBe(false);
    // Una factura que viene de la cuenta de otro club no se apunta.
    expect((await send(invoice("in_2", "acct_OTRO"))).recorded).toBe(false);

    await send({
      id: "evt_fail",
      type: "invoice.payment_failed",
      account: "acct_BOXA",
      data: { object: { id: "in_3", subscription: "sub_123" } },
    });
    expect((await planOf()).stripeStatus).toBe("past_due");
    await send({
      id: "evt_del",
      type: "customer.subscription.deleted",
      account: "acct_BOXA",
      data: { object: { id: "sub_123", status: "canceled" } },
    });
    expect(await planOf()).toMatchObject({ status: "cancelled", stripeStatus: "canceled" });
  });

  it("aislamiento: el otro box no llega a nada del primero", async () => {
    // Con su sesión en el host del primero, nada.
    expect([401, 403]).toContain(
      status(await request("GET", "/api/org/classes", A, { cookie: as(ownerB) })),
    );
    const bAs = (path: string, method: Method = "GET", body?: unknown) =>
      request(method, path, B, { cookie: as(ownerB), ...(body !== undefined ? { body } : {}) });
    const athleteAs = (path: string, method: Method = "GET", body?: unknown) =>
      request(method, path, B, { cookie: as(athleteB), ...(body !== undefined ? { body } : {}) });

    for (const [method, path, body] of [
      ["GET", `/api/org/classes/${cls["clase3"]}`],
      ["POST", `/api/org/classes/${cls["clase3"]}/bookings`, { playerId: athleteB.playerId }],
      ["DELETE", `/api/org/classes/${cls["clase3"]}/bookings/${sergi.playerId}`],
      [
        "POST",
        `/api/org/classes/${cls["clase3"]}/check-in`,
        { playerId: sergi.playerId, present: true },
      ],
      ["POST", `/api/org/classes/${cls["clase3"]}/close`],
      ["PATCH", `/api/org/class-types/${wodType}`, { name: "Mío" }],
      ["PUT", `/api/org/class-types/${wodType}/schedule`, { slots: [] }],
      ["GET", `/api/org/workouts/${workoutToday}`],
      ["DELETE", `/api/org/workouts/${workoutToday}`],
      ["GET", `/api/org/workouts/blocks/${franBlock}/leaderboard`],
      ["PATCH", `/api/org/subscriptions/${subs.get(sergi.email)}`, { status: "cancelled" }],
      ["GET", `/api/org/messages/${marta.playerId}`],
      ["POST", `/api/org/messages/${marta.playerId}`, { body: "Hola" }],
      ["PATCH", `/api/org/leads/${leadId}`, { status: "lost" }],
      ["POST", `/api/org/leads/${leadId}/convert`, {}],
      ["GET", `/api/org/athletes/${marta.playerId}`],
    ] as [Method, string, unknown?][])
      expect(status(await bAs(path, method, body)), `${method} ${path}`).toBe(404);

    // Lo de un atleta del otro box en sus propias rutas: tampoco.
    for (const [method, path, body] of [
      ["POST", `/api/org/classes/${cls["clase4"]}/bookings`, {}],
      ["DELETE", `/api/org/classes/${cls["clase4"]}/bookings/me`],
      ["PUT", `/api/org/me/results/${franBlock}`, { level: "rx", score: { timeSeconds: 100 } }],
      ["GET", `/api/org/workouts/blocks/${franBlock}/leaderboard`],
    ] as [Method, string, unknown?][])
      expect(status(await athleteAs(path, method, body)), `${method} ${path}`).toBe(404);

    // Con lo del primero en sus altas, tampoco.
    expect([400, 404]).toContain(
      status(
        await bAs("/api/org/subscriptions", "POST", {
          playerId: marta.playerId,
          feePlanId: planB,
          startsOn: today,
        }),
      ),
    );
    expect([400, 404]).toContain(
      status(
        await bAs("/api/org/workouts", "POST", {
          sectionId: sectionA,
          onDate: today,
          status: "published",
          blocks: [{ kind: "wod", title: "Robado", scoreType: "reps" }],
        }),
      ),
    );
    expect([400, 404]).toContain(
      status(
        await bAs("/api/org/events", "POST", {
          kind: "training",
          title: "Robada",
          sectionId: sectionB,
          teamId: wodTypeB,
          startsAt: at(2, 9),
          endsAt: at(2, 10),
          coachUserId: coachA.id,
        }),
      ),
    );

    // Su horario y su lista de atletas son solo suyos.
    const scheduleB = await json<ClassesResponse>(await bAs("/api/org/classes"), 200);
    expect(scheduleB.classes.map((c) => c.id)).not.toContain(cls["clase3"]);
    const athletesB = await json<{ athletes: { name: string }[] }>(
      await bAs("/api/org/athletes"),
      200,
    );
    expect(athletesB.athletes.map((a) => a.name)).toEqual(["Berta Bosch"]);
    const leaderboardWorkouts = await json<{ workouts: unknown[] }>(
      await bAs("/api/org/workouts"),
      200,
    );
    expect(leaderboardWorkouts.workouts).toEqual([]);
  });
});

import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Instalaciones, agenda, horarios y pase de lista (Bloques 16 y 17) contra una base real: dos
 * clubes, una administradora, una entrenadora con equipo, otra sin equipo y una familia. Comprueba
 * permisos por rol, el ámbito "propio" del cuerpo técnico, la repetición semanal, los solapes
 * de instalación y el aislamiento entre clubes. Si uno falla, la PR no se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };
type EventDto = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  team: { id: string; name: string } | null;
  facility: { id: string; name: string } | null;
  seriesId: string | null;
  attendance: { present: number; total: number } | null;
};

/** Instante ISO de un día dentro de `days` días a una hora UTC, siempre en el futuro. */
function at(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}
function dayAfter(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("agenda, instalaciones y pase de lista", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let coachFreeA: Seeded;
  let familyA: Seeded;
  let adminB: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");

  let teamA = "";
  let otherTeamA = "";
  let playerA = "";
  let playerA2 = "";
  let facilityA = "";
  let seriesFirst = "";
  let coachEvent = "";

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");

  const request = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    host: string,
    options: { cookie?: string; body?: unknown } = {},
  ) =>
    app.request(path, {
      method,
      headers: {
        host,
        origin: `https://${host}`,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

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

  beforeAll(async () => {
    local = new NetlifyDB();
    const connectionString = await local.start();
    await local.applyMigrations(
      new URL("../../../../netlify/database/migrations", import.meta.url).pathname,
    );
    const config = loadConfig({
      NODE_ENV: "test",
      APP_BASE_DOMAIN: BASE,
      TENANT_FALLBACK_SLUG: "demo",
      TENANT_ROUTING: "subdomain",
      EMAIL_TRANSPORT: "outbox",
    });
    data = createDataLayer({ config, connectionString, photoStore: createMemoryBlobStore() });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
    adminA = await seeder.user({ name: "Ana Admin", email: "ana@club-a.test", password: PASSWORD });
    coachA = await seeder.user({
      name: "Caro Coach",
      email: "caro@club-a.test",
      password: PASSWORD,
    });
    coachFreeA = await seeder.user({
      name: "Lola Libre",
      email: "lola@club-a.test",
      password: PASSWORD,
    });
    familyA = await seeder.user({
      name: "Fina Familia",
      email: "fina@club-a.test",
      password: PASSWORD,
    });
    adminB = await seeder.user({
      name: "Bruno Admin",
      email: "bruno@club-b.test",
      password: PASSWORD,
    });
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, coachFreeA.id, "coach");
    await seeder.membership(clubA.id, familyA.id, "guardian");
    await seeder.membership(clubB.id, adminB.id, "org_admin");

    // Estructura del club A: temporada actual, sección, categoría, dos equipos y dos jugadores.
    const season = await seeder.season(clubA.id, {
      name: "2026-27",
      startsOn: dayAfter(-30),
      endsOn: dayAfter(120),
    });
    const section = await seeder.section(clubA.id, "Fútbol sala");
    const category = await seeder.category(clubA.id, section.id, "Alevín");
    teamA = (
      await seeder.team(clubA.id, {
        sectionId: section.id,
        categoryId: category.id,
        seasonId: season.id,
        name: "Alevín A",
      })
    ).id;
    otherTeamA = (
      await seeder.team(clubA.id, {
        sectionId: section.id,
        categoryId: category.id,
        seasonId: season.id,
        name: "Alevín B",
      })
    ).id;
    const clara = await seeder.person(clubA.id, { firstName: "Clara", lastName: "Martí" });
    const jan = await seeder.person(clubA.id, { firstName: "Jan", lastName: "Garcia" });
    playerA = (await seeder.player(clubA.id, clara.id)).id;
    playerA2 = (await seeder.player(clubA.id, jan.id)).id;
    await seeder.rosterAdd(clubA.id, teamA, playerA, 1);
    await seeder.rosterAdd(clubA.id, otherTeamA, playerA2, 2);
    await seeder.teamStaff(clubA.id, teamA, coachA.id);
    await seeder.guardian(clubA.id, playerA, familyA.id);

    for (const u of [adminA, coachA, coachFreeA, familyA, adminB])
      cookies.set(u.email, await signIn(u.email, A));
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("la administración crea instalaciones con franjas; el otro club no las ve ni las toca", async () => {
    const created = await json<{ facility: { id: string; name: string; hours: unknown[] } }>(
      await request("POST", "/api/org/facilities", A, {
        cookie: as(adminA),
        body: { name: "Pista 1", kind: "court", capacity: 200 },
      }),
      201,
    );
    facilityA = created.facility.id;
    expect(created.facility.hours).toEqual([]);

    const dup = await request("POST", "/api/org/facilities", A, {
      cookie: as(adminA),
      body: { name: "Pista 1", kind: "court" },
    });
    expect(dup.status).toBe(409);

    const hours = await json<{ facility: { hours: { weekday: number }[] } }>(
      await request("PUT", `/api/org/facilities/${facilityA}/hours`, A, {
        cookie: as(adminA),
        body: {
          hours: [
            { weekday: 1, opensAt: "09:00", closesAt: "22:00" },
            { weekday: 6, opensAt: "09:00", closesAt: "14:00" },
          ],
        },
      }),
      200,
    );
    expect(hours.facility.hours.map((h) => h.weekday)).toEqual([1, 6]);
    const badHours = await request("PUT", `/api/org/facilities/${facilityA}/hours`, A, {
      cookie: as(adminA),
      body: { hours: [{ weekday: 8, opensAt: "09:00", closesAt: "10:00" }] },
    });
    expect(badHours.status).toBe(400);

    // La entrenadora solo ve las instalaciones que usa su equipo (Bloque 19): todavía ninguna.
    // Y no las cambia.
    const listed = await json<{ facilities: { id: string }[] }>(
      await request("GET", "/api/org/facilities", A, { cookie: as(coachA) }),
      200,
    );
    expect(listed.facilities).toEqual([]);
    const forbidden = await request("POST", "/api/org/facilities", A, {
      cookie: as(coachA),
      body: { name: "Pista 2", kind: "court" },
    });
    expect(forbidden.status).toBe(403);

    // El club B: lista vacía y 404 sobre la instalación del A.
    const other = await json<{ facilities: unknown[] }>(
      await request("GET", "/api/org/facilities", B, { cookie: as(adminB) }),
      200,
    );
    expect(other.facilities).toEqual([]);
    const cross = await request("PATCH", `/api/org/facilities/${facilityA}`, B, {
      cookie: as(adminB),
      body: { name: "Robada" },
    });
    expect(cross.status).toBe(404);
  });

  it("un evento con repetición semanal genera una serie, y un solape en la instalación se avisa sin impedirlo", async () => {
    const created = await json<{ event: EventDto; created: number; conflictsWith: unknown[] }>(
      await request("POST", "/api/org/events", A, {
        cookie: as(adminA),
        body: {
          kind: "training",
          title: "Entrenamiento Alevín A",
          teamId: teamA,
          facilityId: facilityA,
          startsAt: at(1, 17, 0),
          endsAt: at(1, 18, 0),
          repeatWeeklyUntil: dayAfter(22),
        },
      }),
      201,
    );
    expect(created.created).toBe(4);
    expect(created.event.seriesId).not.toBeNull();
    expect(created.event.team?.id).toBe(teamA);
    expect(created.conflictsWith).toEqual([]);
    seriesFirst = created.event.id;

    const overlapping = await json<{ event: EventDto; conflictsWith: { eventId: string }[] }>(
      await request("POST", "/api/org/events", A, {
        cookie: as(adminA),
        body: {
          kind: "booking",
          title: "Reserva solapada",
          facilityId: facilityA,
          startsAt: at(1, 17, 30),
          endsAt: at(1, 18, 30),
        },
      }),
      201,
    );
    expect(overlapping.conflictsWith.map((c) => c.eventId)).toEqual([seriesFirst]);

    const listed = await json<{
      events: EventDto[];
      conflicts: { eventId: string; withEventId: string }[];
    }>(
      await request("GET", `/api/org/events?from=${at(0, 0)}&to=${at(2, 0)}`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    expect(listed.events.map((e) => e.id)).toEqual([seriesFirst, overlapping.event.id]);
    expect(listed.conflicts).toHaveLength(1);

    // Con un entrenamiento de su equipo en la pista, la entrenadora ya la ve (Bloque 19); la
    // reserva sin equipo es del club entero y también sale en su agenda.
    const coachFacilities = await json<{ facilities: { id: string }[] }>(
      await request("GET", "/api/org/facilities", A, { cookie: as(coachA) }),
      200,
    );
    expect(coachFacilities.facilities.map((f) => f.id)).toEqual([facilityA]);
    const coachAgenda = await json<{ events: EventDto[] }>(
      await request("GET", `/api/org/events?from=${at(0, 0)}&to=${at(2, 0)}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(coachAgenda.events.map((e) => e.id)).toEqual([seriesFirst, overlapping.event.id]);

    const unknownFacility = await request("POST", "/api/org/events", A, {
      cookie: as(adminA),
      body: {
        kind: "other",
        title: "Fuera",
        facilityId: "00000000-0000-0000-0000-000000000000",
        startsAt: at(3, 10),
        endsAt: at(3, 11),
      },
    });
    expect(unknownFacility.status).toBe(400);
    const badRange = await request("POST", "/api/org/events", A, {
      cookie: as(adminA),
      body: { kind: "other", title: "Al revés", startsAt: at(3, 11), endsAt: at(3, 10) },
    });
    expect(badRange.status).toBe(400);
  });

  it("la entrenadora programa y borra solo en su equipo; la que no lleva equipo no escribe", async () => {
    const own = await json<{ event: EventDto }>(
      await request("POST", "/api/org/events", A, {
        cookie: as(coachA),
        body: {
          kind: "match",
          title: "Alevín A vs Rival",
          teamId: teamA,
          startsAt: at(5, 10),
          endsAt: at(5, 11),
          opponent: "Rival",
          homeAway: "home",
        },
      }),
      201,
    );
    coachEvent = own.event.id;

    const notOwn = await request("POST", "/api/org/events", A, {
      cookie: as(coachA),
      body: {
        kind: "training",
        title: "Ajeno",
        teamId: otherTeamA,
        startsAt: at(5, 12),
        endsAt: at(5, 13),
      },
    });
    expect(notOwn.status).toBe(403);
    const noTeam = await request("POST", "/api/org/events", A, {
      cookie: as(coachA),
      body: { kind: "meeting", title: "Reunión", startsAt: at(5, 12), endsAt: at(5, 13) },
    });
    expect(noTeam.status).toBe(403);
    const free = await request("POST", "/api/org/events", A, {
      cookie: as(coachFreeA),
      body: {
        kind: "training",
        title: "Sin equipo",
        teamId: teamA,
        startsAt: at(5, 12),
        endsAt: at(5, 13),
      },
    });
    expect(free.status).toBe(403);

    // Mover el partido a otro equipo que no es suyo: no.
    const move = await request("PATCH", `/api/org/events/${coachEvent}`, A, {
      cookie: as(coachA),
      body: { teamId: otherTeamA },
    });
    expect(move.status).toBe(403);
    const retitle = await json<{ event: EventDto }>(
      await request("PATCH", `/api/org/events/${coachEvent}`, A, {
        cookie: as(coachA),
        body: { title: "Alevín A vs Rival FC" },
      }),
      200,
    );
    expect(retitle.event.title).toBe("Alevín A vs Rival FC");

    // Su agenda propia solo lleva lo de su equipo.
    const mine = await json<{ events: EventDto[] }>(
      await request("GET", `/api/org/me/agenda?from=${at(0, 0)}&to=${at(30, 0)}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(mine.events.every((e) => e.team?.id === teamA)).toBe(true);
    expect(mine.events.map((e) => e.id)).toContain(coachEvent);
  });

  it("el pase de lista es del cuerpo técnico del equipo y solo cuenta a su plantilla", async () => {
    const sheet = await json<{
      entries: { playerId: string; status: string | null }[];
      access: { write: boolean };
    }>(
      await request("GET", `/api/org/events/${seriesFirst}/attendance`, A, { cookie: as(coachA) }),
      200,
    );
    expect(sheet.entries.map((e) => e.playerId)).toEqual([playerA]);
    expect(sheet.entries[0]!.status).toBeNull();
    expect(sheet.access.write).toBe(true);

    const saved = await json<{
      event: EventDto;
      entries: { playerId: string; status: string | null }[];
    }>(
      await request("PUT", `/api/org/events/${seriesFirst}/attendance`, A, {
        cookie: as(coachA),
        body: {
          entries: [
            { playerId: playerA, status: "present" },
            // Jan no está en el Alevín A: se ignora.
            { playerId: playerA2, status: "present" },
          ],
        },
      }),
      200,
    );
    expect(saved.entries).toEqual([
      {
        playerId: playerA,
        status: "present",
        firstName: "Clara",
        lastName: "Martí",
        photoUrl: null,
        note: null,
      },
    ]);
    expect(saved.event.attendance).toEqual({ present: 1, total: 1 });

    // Cambiar de opinión actualiza en vez de duplicar.
    const excused = await json<{ event: EventDto }>(
      await request("PUT", `/api/org/events/${seriesFirst}/attendance`, A, {
        cookie: as(coachA),
        body: { entries: [{ playerId: playerA, status: "excused", note: "Médico" }] },
      }),
      200,
    );
    expect(excused.event.attendance).toEqual({ present: 0, total: 1 });

    // Sin equipo propio, para la otra entrenadora el evento no existe (Bloque 19): ni lo lee ni lo escribe.
    expect(
      (
        await request("GET", `/api/org/events/${seriesFirst}/attendance`, A, {
          cookie: as(coachFreeA),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request("PUT", `/api/org/events/${seriesFirst}/attendance`, A, {
          cookie: as(coachFreeA),
          body: { entries: [{ playerId: playerA, status: "present" }] },
        })
      ).status,
    ).toBe(404);
    // La administración lo lee sin escribirlo desde el pase de lista propio de un equipo ajeno: todo.
    const readByAdmin = await json<{ access: { write: boolean } }>(
      await request("GET", `/api/org/events/${seriesFirst}/attendance`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    expect(readByAdmin.access.write).toBe(true);

    // La administración lee el resumen del deportista.
    const summary = await json<{
      events: number;
      present: number;
      excused: number;
      percent: number | null;
    }>(
      await request("GET", `/api/org/players/${playerA}/attendance`, A, { cookie: as(adminA) }),
      200,
    );
    expect(summary).toMatchObject({ events: 1, present: 0, excused: 1, percent: 0 });
  });

  it("el horario semanal genera los entrenamientos de la temporada y respeta los que ya tienen lista", async () => {
    const set = await json<{
      schedule: { weekday: number; facility: { id: string } | null }[];
      generated: number;
    }>(
      await request("PUT", `/api/org/teams/${teamA}/schedule`, A, {
        cookie: as(coachA),
        body: {
          slots: [
            { weekday: 2, startsAt: "17:30", endsAt: "18:30", facilityId: facilityA },
            { weekday: 4, startsAt: "17:30", endsAt: "18:30", facilityId: facilityA },
          ],
          generate: true,
        },
      }),
      200,
    );
    expect(set.schedule.map((s) => s.weekday)).toEqual([2, 4]);
    expect(set.schedule[0]!.facility?.id).toBe(facilityA);
    // Unas 17 semanas por dos franjas: entre 30 y 36 sesiones.
    expect(set.generated).toBeGreaterThan(28);
    expect(set.generated).toBeLessThan(40);

    const again = await json<{ generated: number }>(
      await request("PUT", `/api/org/teams/${teamA}/schedule`, A, {
        cookie: as(adminA),
        body: {
          slots: [{ weekday: 2, startsAt: "17:30", endsAt: "18:30", facilityId: facilityA }],
          generate: true,
        },
      }),
      200,
    );
    expect(again.generated).toBeGreaterThan(14);
    expect(again.generated).toBeLessThan(20);

    const listed = await json<{ schedule: unknown[] }>(
      await request("GET", `/api/org/teams/${teamA}/schedule`, A, { cookie: as(adminA) }),
      200,
    );
    expect(listed.schedule).toHaveLength(1);
    // Para quien no lleva el equipo, ni el horario existe (Bloque 19).
    expect(
      (await request("GET", `/api/org/teams/${teamA}/schedule`, A, { cookie: as(coachFreeA) }))
        .status,
    ).toBe(404);

    const notOwn = await request("PUT", `/api/org/teams/${otherTeamA}/schedule`, A, {
      cookie: as(coachA),
      body: { slots: [] },
    });
    expect(notOwn.status).toBe(404);
    const badFacility = await request("PUT", `/api/org/teams/${teamA}/schedule`, A, {
      cookie: as(adminA),
      body: {
        slots: [
          {
            weekday: 1,
            startsAt: "10:00",
            endsAt: "11:00",
            facilityId: "00000000-0000-0000-0000-000000000000",
          },
        ],
      },
    });
    expect(badFacility.status).toBe(400);
  });

  it("la familia ve la agenda de los suyos y nada más", async () => {
    const agenda = await json<{ events: EventDto[] }>(
      await request("GET", `/api/org/family/agenda?from=${at(0, 0)}&to=${at(30, 0)}`, A, {
        cookie: as(familyA),
      }),
      200,
    );
    expect(agenda.events.length).toBeGreaterThan(0);
    expect(agenda.events.every((e) => e.team?.id === teamA)).toBe(true);
    expect((await request("GET", "/api/org/events", A, { cookie: as(familyA) })).status).toBe(403);
    expect((await request("GET", "/api/org/facilities", A, { cookie: as(familyA) })).status).toBe(
      403,
    );
    expect(
      (
        await request("GET", `/api/org/events/${seriesFirst}/attendance`, A, {
          cookie: as(familyA),
        })
      ).status,
    ).toBe(403);
  });

  it("el club B no ve la agenda del A, y borrar una serie se lleva solo lo que sigue", async () => {
    const other = await json<{ events: unknown[]; conflicts: unknown[] }>(
      await request("GET", `/api/org/events?from=${at(0, 0)}&to=${at(30, 0)}`, B, {
        cookie: as(adminB),
      }),
      200,
    );
    expect(other.events).toEqual([]);
    expect(other.conflicts).toEqual([]);
    expect(
      (await request("GET", `/api/org/events/${seriesFirst}`, B, { cookie: as(adminB) })).status,
    ).toBe(404);
    expect(
      (await request("DELETE", `/api/org/events/${seriesFirst}`, B, { cookie: as(adminB) })).status,
    ).toBe(404);
    // Ni siquiera con sesión en el A sin pertenencia en el B.
    expect(
      (await request("GET", `/api/org/events/${seriesFirst}`, B, { cookie: as(adminA) })).status,
    ).toBe(403);

    const series = await json<{ events: EventDto[] }>(
      await request("GET", `/api/org/events?from=${at(0, 0)}&to=${at(30, 0)}&team=${teamA}`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    const first = series.events.find((e) => e.id === seriesFirst)!;
    const siblings = series.events.filter((e) => e.seriesId === first.seriesId);
    expect(siblings).toHaveLength(4);
    const second = siblings[1]!;
    const removed = await json<{ removed: number }>(
      await request("DELETE", `/api/org/events/${second.id}?series=1`, A, { cookie: as(adminA) }),
      200,
    );
    expect(removed.removed).toBe(3);
    const after = await json<{ events: EventDto[] }>(
      await request("GET", `/api/org/events?from=${at(0, 0)}&to=${at(30, 0)}&team=${teamA}`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    expect(after.events.filter((e) => e.seriesId === first.seriesId).map((e) => e.id)).toEqual([
      seriesFirst,
    ]);
  });
});

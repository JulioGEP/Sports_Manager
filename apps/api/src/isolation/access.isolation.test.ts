import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Alcance y visibilidad por rol (Bloque 19, ADR 0033) contra una base real: la entrenadora ve
 * solo sus equipos; dirección y coordinación, sus secciones; fisioterapia, a quien atiende; y la
 * administración incluye o excluye áreas por rol y por persona desde "Personal". Otro club no
 * hereda ni ve nada. Si uno falla, la PR no se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };
type PlayerList = { players: { id: string; firstName: string }[] };
type Names = string[];

/** Instante ISO a `days` días vista, a una hora local fija. */
function at(days: number, hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe("alcance y visibilidad por rol", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let directorA: Seeded;
  let coordinatorA: Seeded;
  let physioA: Seeded;
  let adminB: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");

  let futsal = "";
  let basket = "";
  let alevinA = "";
  let alevinB = "";
  let basketA = "";
  let clara = "";
  let jan = "";
  let mia = "";
  let nil = "";
  let pista = "";
  let pabellon = "";
  let sala = "";
  let trainingAlevinA = "";
  let matchBasket = "";
  let clubMeeting = "";
  let basketMeeting = "";

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
  const status = (res: Response) => Promise.resolve(res.status);
  const playerNames = async (user: Seeded): Promise<Names> =>
    (
      await json<PlayerList>(await request("GET", "/api/org/players", A, { cookie: as(user) }), 200)
    ).players
      .map((p) => p.firstName)
      .sort();
  const sectionNames = async (user: Seeded): Promise<Names> =>
    (
      await json<{ sections: { name: string }[] }>(
        await request("GET", "/api/org/sections", A, { cookie: as(user) }),
        200,
      )
    ).sections
      .map((s) => s.name)
      .sort();
  const teamNames = async (user: Seeded): Promise<Names> =>
    (
      await json<{ teams: { name: string }[] }>(
        await request("GET", "/api/org/teams", A, { cookie: as(user) }),
        200,
      )
    ).teams
      .map((t) => t.name)
      .sort();
  const eventIds = async (user: Seeded): Promise<string[]> =>
    (
      await json<{ events: { id: string }[] }>(
        await request("GET", `/api/org/events?from=${at(0, 0)}&to=${at(14, 0)}`, A, {
          cookie: as(user),
        }),
        200,
      )
    ).events
      .map((e) => e.id)
      .sort();
  const facilityNames = async (user: Seeded): Promise<Names> =>
    (
      await json<{ facilities: { name: string }[] }>(
        await request("GET", "/api/org/facilities", A, { cookie: as(user) }),
        200,
      )
    ).facilities
      .map((f) => f.name)
      .sort();
  const actorOf = async (user: Seeded) =>
    (
      await json<{
        actor: {
          permissions: string[];
          scope: { kind: string; sections?: number; teams?: number; players?: number };
        };
      }>(await request("GET", "/api/org", A, { cookie: as(user) }), 200)
    ).actor;

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
    const user = (name: string, email: string) => seeder.user({ name, email, password: PASSWORD });
    adminA = await user("Ana Admin", "ana@club-a.test");
    coachA = await user("Caro Coach", "caro@club-a.test");
    directorA = await user("Dídac Director", "didac@club-a.test");
    coordinatorA = await user("Cora Coordinadora", "cora@club-a.test");
    physioA = await user("Fina Fisio", "fina@club-a.test");
    adminB = await user("Bruno Admin", "bruno@club-b.test");
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, directorA.id, "staff", "director");
    await seeder.membership(clubA.id, coordinatorA.id, "staff", "coordinator");
    await seeder.membership(clubA.id, physioA.id, "staff", "physio");
    await seeder.membership(clubB.id, adminB.id, "org_admin");

    // Club A: una temporada, dos secciones, tres equipos y cuatro deportistas.
    const season = await seeder.season(clubA.id, {
      name: "2026-27",
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
    });
    futsal = (await seeder.section(clubA.id, "Fútbol sala")).id;
    basket = (await seeder.section(clubA.id, "Baloncesto", "basketball")).id;
    const alevin = await seeder.category(clubA.id, futsal, "Alevín");
    const senior = await seeder.category(clubA.id, basket, "Sénior");
    const team = (sectionId: string, categoryId: string, name: string) =>
      seeder.team(clubA.id, { sectionId, categoryId, seasonId: season.id, name });
    alevinA = (await team(futsal, alevin.id, "Alevín A")).id;
    alevinB = (await team(futsal, alevin.id, "Alevín B")).id;
    basketA = (await team(basket, senior.id, "Sénior A")).id;
    const player = async (firstName: string, lastName: string, teamId: string | null) => {
      const person = await seeder.person(clubA.id, { firstName, lastName });
      const created = await seeder.player(clubA.id, person.id);
      if (teamId) await seeder.rosterAdd(clubA.id, teamId, created.id);
      return created.id;
    };
    clara = await player("Clara", "Martí", alevinA);
    jan = await player("Jan", "Garcia", alevinB);
    mia = await player("Mia", "Roca", basketA);
    nil = await player("Nil", "Soler", null);
    await seeder.teamStaff(clubA.id, alevinA, coachA.id);

    for (const u of [adminA, coachA, directorA, coordinatorA, physioA, adminB])
      cookies.set(u.email, await signIn(u.email, A));

    // Instalaciones y agenda por la API, como administración: una pista para el Alevín A (por
    // horario), un pabellón para el Sénior A (por partido) y una sala que no usa nadie.
    const facility = async (name: string, kind: string) =>
      (
        await json<{ facility: { id: string } }>(
          await request("POST", "/api/org/facilities", A, {
            cookie: as(adminA),
            body: { name, kind },
          }),
          201,
        )
      ).facility.id;
    pista = await facility("Pista 1", "court");
    pabellon = await facility("Pabellón", "court");
    sala = await facility("Sala de reuniones", "room");
    await json(
      await request("PUT", `/api/org/teams/${alevinA}/schedule`, A, {
        cookie: as(adminA),
        body: {
          slots: [{ weekday: 1, startsAt: "17:00", endsAt: "18:00", facilityId: pista }],
          generate: false,
        },
      }),
      200,
    );
    const event = async (body: Record<string, unknown>) =>
      (
        await json<{ event: { id: string } }>(
          await request("POST", "/api/org/events", A, { cookie: as(adminA), body }),
          201,
        )
      ).event.id;
    trainingAlevinA = await event({
      kind: "training",
      title: "Entrenamiento Alevín A",
      teamId: alevinA,
      facilityId: pista,
      startsAt: at(1, 17),
      endsAt: at(1, 18),
    });
    matchBasket = await event({
      kind: "match",
      title: "Sénior A contra Rival",
      teamId: basketA,
      facilityId: pabellon,
      startsAt: at(2, 19),
      endsAt: at(2, 21),
    });
    clubMeeting = await event({
      kind: "meeting",
      title: "Asamblea del club",
      facilityId: sala,
      startsAt: at(3, 20),
      endsAt: at(3, 21),
    });
    basketMeeting = await event({
      kind: "meeting",
      title: "Reunión de baloncesto",
      sectionId: basket,
      startsAt: at(4, 20),
      endsAt: at(4, 21),
    });
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("la administración ve el club entero y su actor lo dice", async () => {
    const actor = await actorOf(adminA);
    expect(actor.scope).toEqual({ kind: "club" });
    expect(await playerNames(adminA)).toEqual(["Clara", "Jan", "Mia", "Nil"]);
    expect(await sectionNames(adminA)).toEqual(["Baloncesto", "Fútbol sala"]);
    expect(await facilityNames(adminA)).toEqual(["Pabellón", "Pista 1", "Sala de reuniones"]);
  });

  it("la entrenadora ve solo lo de sus equipos: deportistas, sección, agenda e instalaciones", async () => {
    const actor = await actorOf(coachA);
    expect(actor.scope).toEqual({ kind: "restricted", sections: 1, teams: 1, players: 0 });
    for (const area of ["org.members.read", "org.club_members.read", "org.activity.read"])
      expect(actor.permissions, area).not.toContain(area);

    expect(await playerNames(coachA)).toEqual(["Clara"]);
    expect(
      await status(await request("GET", `/api/org/players/${jan}`, A, { cookie: as(coachA) })),
    ).toBe(404);
    expect(
      await status(await request("GET", `/api/org/players/${nil}`, A, { cookie: as(coachA) })),
    ).toBe(404);
    expect(
      await status(
        await request("GET", `/api/org/players/${jan}/attendance`, A, { cookie: as(coachA) }),
      ),
    ).toBe(404);

    expect(await sectionNames(coachA)).toEqual(["Fútbol sala"]);
    const section = await json<{ categories: { teams: { name: string }[] }[] }>(
      await request("GET", `/api/org/sections/${futsal}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(section.categories.flatMap((c) => c.teams.map((t) => t.name))).toEqual(["Alevín A"]);
    expect(
      await status(await request("GET", `/api/org/sections/${basket}`, A, { cookie: as(coachA) })),
    ).toBe(404);
    expect(await teamNames(coachA)).toEqual(["Alevín A"]);
    expect(
      await status(await request("GET", `/api/org/teams/${alevinB}`, A, { cookie: as(coachA) })),
    ).toBe(404);
    expect(
      await status(
        await request("GET", `/api/org/teams/${alevinB}/schedule`, A, { cookie: as(coachA) }),
      ),
    ).toBe(404);

    // Agenda: lo de su equipo y lo del club entero; nada de otro equipo ni de otra sección.
    expect(await eventIds(coachA)).toEqual([clubMeeting, trainingAlevinA].sort());
    expect(
      await status(
        await request("GET", `/api/org/events/${matchBasket}`, A, { cookie: as(coachA) }),
      ),
    ).toBe(404);
    expect(
      await status(
        await request("GET", `/api/org/events/${basketMeeting}`, A, { cookie: as(coachA) }),
      ),
    ).toBe(404);
    expect(
      await status(
        await request("GET", `/api/org/events/${matchBasket}/attendance`, A, {
          cookie: as(coachA),
        }),
      ),
    ).toBe(404);
    // Instalaciones: las que usa su equipo, por horario o por evento.
    expect(await facilityNames(coachA)).toEqual(["Pista 1"]);

    // Retos (ADR 0032): los de su sección y, de los de equipo, solo los de sus equipos.
    const challenge = async (body: Record<string, unknown>) =>
      (
        await json<{ challenge: { id: string } }>(
          await request("POST", "/api/org/challenges", A, {
            cookie: as(adminA),
            body: { minPoints: 0, targetPoints: 10, ...body },
          }),
          201,
        )
      ).challenge.id;
    const futsalChallenge = await challenge({ name: "Reto fútbol sala", sectionId: futsal });
    const alevinBChallenge = await challenge({
      name: "Reto Alevín B",
      sectionId: futsal,
      teamId: alevinB,
    });
    const basketChallenge = await challenge({ name: "Reto baloncesto", sectionId: basket });
    const challenges = await json<{ challenges: { id: string }[] }>(
      await request("GET", "/api/org/challenges", A, { cookie: as(coachA) }),
      200,
    );
    expect(challenges.challenges.map((ch) => ch.id)).toEqual([futsalChallenge]);
    for (const [id, expected] of [
      [alevinBChallenge, 404],
      [basketChallenge, 404],
      [futsalChallenge, 200],
    ] as const) {
      expect(
        await status(await request("GET", `/api/org/challenges/${id}`, A, { cookie: as(coachA) })),
      ).toBe(expected);
    }

    // Ni personal, ni socios, ni movimientos del club.
    expect(await status(await request("GET", "/api/org/members", A, { cookie: as(coachA) }))).toBe(
      403,
    );
    expect(
      await status(await request("GET", "/api/org/club-members", A, { cookie: as(coachA) })),
    ).toBe(403);
    expect(await status(await request("GET", "/api/org/activity", A, { cookie: as(coachA) }))).toBe(
      403,
    );

    // El inicio, con sus cifras: su sección, su equipo, su deportista.
    const summary = await json<{
      sections: number;
      teams: number;
      players: number;
      facilities: number;
      sectionCards: { name: string }[];
      today: unknown[];
      operations: { teamsWithoutStaff: number; playersWithoutTeam: number } | null;
      readiness: { total: number } | null;
    }>(await request("GET", "/api/org/summary", A, { cookie: as(coachA) }), 200);
    expect(summary).toMatchObject({ sections: 1, teams: 1, players: 1, facilities: 1 });
    expect(summary.sectionCards.map((s) => s.name)).toEqual(["Fútbol sala"]);
    expect(summary.operations).toMatchObject({ teamsWithoutStaff: 0, playersWithoutTeam: 0 });
    expect(summary.readiness?.total).toBe(1);
  });

  it("la dirección ve sus secciones, y sin sección asignada no ve nada", async () => {
    expect(await playerNames(directorA)).toEqual([]);
    expect(await sectionNames(directorA)).toEqual([]);
    expect((await actorOf(directorA)).scope).toEqual({
      kind: "restricted",
      sections: 0,
      teams: 0,
      players: 0,
    });

    // Solo la administración asigna secciones; la persona tiene que ser del club.
    expect(
      await status(
        await request("PUT", `/api/org/members/${directorA.id}/sections`, A, {
          cookie: as(coachA),
          body: { sectionIds: [futsal] },
        }),
      ),
    ).toBe(403);
    expect(
      await status(
        await request("PUT", `/api/org/members/${adminB.id}/sections`, A, {
          cookie: as(adminA),
          body: { sectionIds: [futsal] },
        }),
      ),
    ).toBe(404);
    const assigned = await json<{ sections: { sectionName: string }[] }>(
      await request("PUT", `/api/org/members/${directorA.id}/sections`, A, {
        cookie: as(adminA),
        body: { sectionIds: [futsal] },
      }),
      200,
    );
    expect(assigned.sections.map((s) => s.sectionName)).toEqual(["Fútbol sala"]);

    expect(await playerNames(directorA)).toEqual(["Clara", "Jan"]);
    expect(
      await status(await request("GET", `/api/org/players/${mia}`, A, { cookie: as(directorA) })),
    ).toBe(404);
    expect(await sectionNames(directorA)).toEqual(["Fútbol sala"]);
    expect(await teamNames(directorA)).toEqual(["Alevín A", "Alevín B"]);
    expect(await eventIds(directorA)).toEqual([clubMeeting, trainingAlevinA].sort());
    expect(
      await status(
        await request("PATCH", `/api/org/sections/${basket}`, A, {
          cookie: as(directorA),
          body: { name: "Básquet" },
        }),
      ),
    ).toBe(404);
    // Escribe en lo suyo.
    expect(
      await status(
        await request("PATCH", `/api/org/players/${jan}`, A, {
          cookie: as(directorA),
          body: { heightCm: 150 },
        }),
      ),
    ).toBe(200);
    // Ni socios, ni personal, ni cuotas.
    for (const path of ["/api/org/club-members", "/api/org/members", "/api/org/fees/charges"]) {
      expect(await status(await request("GET", path, A, { cookie: as(directorA) })), path).toBe(
        403,
      );
    }
    // El personal lista las secciones a cargo de cada persona.
    const members = await json<{
      members: { email: string; sections: { sectionName: string }[] }[];
    }>(await request("GET", "/api/org/members", A, { cookie: as(adminA) }), 200);
    expect(members.members.find((m) => m.email === directorA.email)?.sections).toEqual([
      { sectionId: futsal, sectionName: "Fútbol sala" },
    ]);
  });

  it("la coordinación ve la sección que coordina", async () => {
    await json(
      await request("PATCH", `/api/org/sections/${basket}`, A, {
        cookie: as(adminA),
        body: { coordinatorUserId: coordinatorA.id },
      }),
      200,
    );
    expect(await playerNames(coordinatorA)).toEqual(["Mia"]);
    expect(await sectionNames(coordinatorA)).toEqual(["Baloncesto"]);
    expect(await eventIds(coordinatorA)).toEqual([basketMeeting, clubMeeting, matchBasket].sort());
    expect(await facilityNames(coordinatorA)).toEqual(["Pabellón"]);
  });

  it("la fisio ve solo a quien atiende: asignados por el club o con una valoración suya", async () => {
    expect(await playerNames(physioA)).toEqual([]);
    expect(
      await status(await request("GET", `/api/org/players/${jan}`, A, { cookie: as(physioA) })),
    ).toBe(404);

    // Asigna la administración (o el cuerpo técnico del deportista); la fisio no se asigna sola.
    expect(
      await status(
        await request("POST", `/api/org/players/${jan}/staff`, A, {
          cookie: as(physioA),
          body: { userId: physioA.id },
        }),
      ),
    ).toBe(404);
    expect(
      await status(
        await request("POST", `/api/org/players/${jan}/staff`, A, {
          cookie: as(coachA),
          body: { userId: physioA.id },
        }),
      ),
    ).toBe(404);
    const detail = await json<{ staff: { userId: string; position: string | null }[] }>(
      await request("POST", `/api/org/players/${jan}/staff`, A, {
        cookie: as(adminA),
        body: { userId: physioA.id },
      }),
      200,
    );
    expect(detail.staff).toEqual([{ userId: physioA.id, name: "Fina Fisio", position: "physio" }]);
    expect(
      await status(
        await request("POST", `/api/org/players/${jan}/staff`, A, {
          cookie: as(adminA),
          body: { userId: adminB.id },
        }),
      ),
    ).toBe(400);

    expect(await playerNames(physioA)).toEqual(["Jan"]);
    expect((await actorOf(physioA)).scope).toMatchObject({ kind: "restricted", players: 1 });
    const rated = await json<{ indicators: { dimension: string; score: number }[] }>(
      await request("PUT", `/api/org/players/${jan}/indicators`, A, {
        cookie: as(physioA),
        body: { body: { score: 40, note: "Molestias en el tobillo" } },
      }),
      200,
    );
    expect(rated.indicators).toMatchObject([{ dimension: "body", score: 40 }]);
    expect(
      await status(await request("GET", `/api/org/players/${clara}`, A, { cookie: as(physioA) })),
    ).toBe(404);
    expect(
      await status(
        await request("PUT", `/api/org/players/${clara}/indicators`, A, {
          cookie: as(physioA),
          body: { body: { score: 50 } },
        }),
      ),
    ).toBe(404);

    // La entrenadora asigna a la fisio a su deportista; la vista de conjunto de la fisio crece.
    await json(
      await request("POST", `/api/org/players/${clara}/staff`, A, {
        cookie: as(coachA),
        body: { userId: physioA.id },
      }),
      200,
    );
    expect(await playerNames(physioA)).toEqual(["Clara", "Jan"]);
    const overview = await json<{ players: { firstName: string }[] }>(
      await request("GET", "/api/org/players/overview", A, { cookie: as(physioA) }),
      200,
    );
    expect(overview.players.map((p) => p.firstName).sort()).toEqual(["Clara", "Jan"]);

    // Al quitarla de Jan sigue viéndolo: ya le dejó una valoración. De Clara, no.
    await json(
      await request("DELETE", `/api/org/players/${jan}/staff/${physioA.id}`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    await json(
      await request("DELETE", `/api/org/players/${clara}/staff/${physioA.id}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(await playerNames(physioA)).toEqual(["Jan"]);
  });

  it("la administración incluye y excluye áreas por rol; igual que por defecto, borra la regla", async () => {
    expect(
      await status(await request("GET", "/api/org/access", A, { cookie: as(directorA) })),
    ).toBe(403);
    const overview = await json<{
      profiles: {
        profile: string;
        scope: string;
        areas: { area: string; default: boolean; visible: boolean }[];
      }[];
      people: unknown[];
    }>(await request("GET", "/api/org/access", A, { cookie: as(adminA) }), 200);
    expect(overview.profiles.map((p) => p.profile)).toEqual([
      "coach",
      "director",
      "coordinator",
      "delegate",
      "physio",
      "fitness",
      "psychologist",
      "scout",
    ]);
    const coach = overview.profiles.find((p) => p.profile === "coach")!;
    expect(coach.scope).toBe("teams");
    expect(coach.areas.find((a) => a.area === "club_members")).toEqual({
      area: "club_members",
      default: false,
      visible: false,
    });
    expect(coach.areas.find((a) => a.area === "players")).toEqual({
      area: "players",
      default: true,
      visible: true,
    });
    expect(overview.people).toEqual([]);

    // Incluir los socios para el cuerpo técnico.
    const included = await json<{ areas: { area: string; visible: boolean }[] }>(
      await request("PUT", "/api/org/access/profiles/coach/areas/club_members", A, {
        cookie: as(adminA),
        body: { visible: true },
      }),
      200,
    );
    expect(included.areas.find((a) => a.area === "club_members")?.visible).toBe(true);
    expect(
      await status(await request("GET", "/api/org/club-members", A, { cookie: as(coachA) })),
    ).toBe(200);
    expect((await actorOf(coachA)).permissions).toContain("org.club_members.read");
    expect((await actorOf(coachA)).permissions).not.toContain("org.club_members.write");

    // Excluir los deportistas: el cuerpo técnico pierde la lectura y lo propio.
    await json(
      await request("PUT", "/api/org/access/profiles/coach/areas/players", A, {
        cookie: as(adminA),
        body: { visible: false },
      }),
      200,
    );
    expect(await status(await request("GET", "/api/org/players", A, { cookie: as(coachA) }))).toBe(
      403,
    );
    expect((await actorOf(coachA)).permissions).not.toContain("org.players.assess_own");
    // La dirección no se ve afectada por la regla del cuerpo técnico.
    expect(await playerNames(directorA)).toEqual(["Clara", "Jan"]);

    // Volver a lo de por defecto borra la regla.
    await json(
      await request("PUT", "/api/org/access/profiles/coach/areas/players", A, {
        cookie: as(adminA),
        body: { visible: true },
      }),
      200,
    );
    await json(
      await request("PUT", "/api/org/access/profiles/coach/areas/club_members", A, {
        cookie: as(adminA),
        body: { visible: false },
      }),
      200,
    );
    expect(await playerNames(coachA)).toEqual(["Clara"]);
    expect(
      await status(await request("GET", "/api/org/club-members", A, { cookie: as(coachA) })),
    ).toBe(403);
    expect(
      (
        await json<{ profiles: { areas: { visible: boolean; default: boolean }[] }[] }>(
          await request("GET", "/api/org/access", A, { cookie: as(adminA) }),
          200,
        )
      ).profiles.every((p) => p.areas.every((a) => a.visible === a.default)),
    ).toBe(true);
    // Un perfil o un área desconocidos no valen.
    expect(
      await status(
        await request("PUT", "/api/org/access/profiles/org_admin/areas/fees", A, {
          cookie: as(adminA),
          body: { visible: false },
        }),
      ),
    ).toBe(400);
    expect(
      await status(
        await request("PUT", "/api/org/access/profiles/coach/areas/tienda", A, {
          cookie: as(adminA),
          body: { visible: false },
        }),
      ),
    ).toBe(400);
  });

  it("las excepciones de una persona mandan sobre su rol en los dos sentidos; la administración y la familia no tienen", async () => {
    const coachByRole = ["sections", "players", "agenda", "facilities", "challenges", "training"];
    // Ve socios (su rol no) y deja de ver la agenda y las instalaciones (su rol sí).
    const wanted = [
      "sections",
      "players",
      "challenges",
      "training",
      "club_members",
      "club_members",
    ];
    const put = (user: Seeded, visible: string[], cookie = as(adminA), host = A) =>
      request("PUT", `/api/org/access/members/${user.id}`, host, { cookie, body: { visible } });

    expect(await status(await put(coachA, wanted, as(directorA)))).toBe(403);
    expect(await status(await put(adminA, []))).toBe(409);
    expect(await status(await put(adminB, []))).toBe(404);
    // La familia tiene el club entero como ámbito: no se le abre nada por persona.
    const parent = await seeder.user({
      name: "Pau Padre",
      email: "pau@club-a.test",
      password: PASSWORD,
    });
    await seeder.membership(clubA.id, parent.id, "guardian");
    expect(await status(await put(parent, ["players"]))).toBe(409);

    const saved = await json<{ userId: string; byRole: string[]; allow: string[]; deny: string[] }>(
      await put(coachA, wanted),
      200,
    );
    expect(saved).toEqual({
      userId: coachA.id,
      byRole: coachByRole,
      allow: ["club_members"],
      deny: ["agenda", "facilities"],
    });
    expect(
      await status(
        await request("GET", `/api/org/events?from=${at(0, 0)}&to=${at(7, 0)}`, A, {
          cookie: as(coachA),
        }),
      ),
    ).toBe(403);
    expect(
      await status(await request("GET", "/api/org/facilities", A, { cookie: as(coachA) })),
    ).toBe(403);
    expect(
      await status(await request("GET", "/api/org/club-members", A, { cookie: as(coachA) })),
    ).toBe(200);
    expect(await playerNames(coachA)).toEqual(["Clara"]);
    const actor = await actorOf(coachA);
    expect(actor.permissions).not.toContain("org.events.write_own");
    expect(actor.permissions).not.toContain("org.attendance.write_own");
    expect(actor.permissions).toContain("org.club_members.read");
    expect(actor.permissions).not.toContain("org.club_members.write");
    // Las del resto del cuerpo técnico no cambian.
    expect(
      await status(await request("GET", "/api/org/club-members", A, { cookie: as(physioA) })),
    ).toBe(403);

    const overview = await json<{
      people: { userId: string; name: string; byRole: string[]; allow: string[]; deny: string[] }[];
    }>(await request("GET", "/api/org/access", A, { cookie: as(adminA) }), 200);
    expect(overview.people).toEqual([
      {
        userId: coachA.id,
        name: "Caro Coach",
        byRole: coachByRole,
        allow: ["club_members"],
        deny: ["agenda", "facilities"],
      },
    ]);
    const members = await json<{
      members: { userId: string; accessOverrides: { allow: string[]; deny: string[] } }[];
    }>(await request("GET", "/api/org/members", A, { cookie: as(adminA) }), 200);
    expect(members.members.find((m) => m.userId === coachA.id)?.accessOverrides).toEqual({
      allow: ["club_members"],
      deny: ["agenda", "facilities"],
    });

    // Lo mismo que su rol no guarda nada.
    expect(await json(await put(coachA, coachByRole), 200)).toEqual({
      userId: coachA.id,
      byRole: coachByRole,
      allow: [],
      deny: [],
    });
    expect(await facilityNames(coachA)).toEqual(["Pista 1"]);

    // Quitar las excepciones: vuelve lo de su rol.
    await json(await put(coachA, wanted), 200);
    expect(
      await status(
        await request("DELETE", `/api/org/access/members/${coachA.id}`, A, {
          cookie: as(directorA),
        }),
      ),
    ).toBe(403);
    expect(
      await status(
        await request("DELETE", `/api/org/access/members/${adminB.id}`, A, { cookie: as(adminA) }),
      ),
    ).toBe(404);
    expect(
      await status(
        await request("DELETE", `/api/org/access/members/${coachA.id}`, A, { cookie: as(adminA) }),
      ),
    ).toBe(204);
    expect(await facilityNames(coachA)).toEqual(["Pista 1"]);
    expect(
      await status(await request("GET", "/api/org/club-members", A, { cookie: as(coachA) })),
    ).toBe(403);
    expect(
      (
        await json<{ people: unknown[] }>(
          await request("GET", "/api/org/access", A, { cookie: as(adminA) }),
          200,
        )
      ).people,
    ).toEqual([]);
  });

  it("otro club ni ve ni hereda las reglas, las secciones ni el personal asignado", async () => {
    // Una regla en el club B no toca al club A.
    await json(
      await request("PUT", "/api/org/access/profiles/coach/areas/players", B, {
        cookie: as(adminB),
        body: { visible: false },
      }),
      200,
    );
    expect(await playerNames(coachA)).toEqual(["Clara"]);
    const overviewB = await json<{
      profiles: { profile: string; areas: { area: string; visible: boolean }[] }[];
      people: unknown[];
    }>(await request("GET", "/api/org/access", B, { cookie: as(adminB) }), 200);
    expect(
      overviewB.profiles.find((p) => p.profile === "coach")?.areas.find((a) => a.area === "players")
        ?.visible,
    ).toBe(false);
    expect(overviewB.people).toEqual([]);
    // Ni las secciones ni el personal asignado del A existen desde el B.
    expect(
      await status(
        await request("PUT", `/api/org/members/${directorA.id}/sections`, B, {
          cookie: as(adminB),
          body: { sectionIds: [futsal] },
        }),
      ),
    ).toBe(404);
    expect(
      await status(
        await request("POST", `/api/org/players/${jan}/staff`, B, {
          cookie: as(adminB),
          body: { userId: physioA.id },
        }),
      ),
    ).toBe(404);
    expect(
      await status(
        await request("PUT", `/api/org/access/members/${coachA.id}`, B, {
          cookie: as(adminB),
          body: { visible: ["agenda"] },
        }),
      ),
    ).toBe(404);
    expect(
      await status(
        await request("DELETE", `/api/org/access/members/${coachA.id}`, B, { cookie: as(adminB) }),
      ),
    ).toBe(404);
  });
});

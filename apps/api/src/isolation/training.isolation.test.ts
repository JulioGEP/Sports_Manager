import { NetlifyDB } from "@netlify/database-dev";
import {
  ACCESS_AREAS,
  addDays,
  type AthleteResponse,
  type DrillResponse,
  type DrillsResponse,
  type FamilyTestsResponse,
  type InfirmaryResponse,
  type MethodologyResponse,
  type PlayerHealthResponse,
  type PlayerPerformanceResponse,
  type SessionDetailResponse,
  type TeamInsightsResponse,
  type TeamLoadResponse,
  type TeamTestsResponse,
  type TeamWeekResponse,
  type TrainingConfigResponse,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Planificación de entrenamientos, carga y salud (bloques 21 a 26, ADR 0039) contra una base real:
 * catálogo y biblioteca de la sección, sesiones con bloques por papel, semana con MD, cierre con
 * RPE, disponibilidad y conflictos, salud con consentimiento y auditoría, recomendaciones, el
 * deportista adulto, tests y la familia, metodología y aislamiento entre clubes.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };

/** Hoy en la zona del club (Europe/Madrid, la de por defecto). */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

describe("entrenamiento, carga y salud", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let coachOtherA: Seeded;
  let fitnessA: Seeded;
  let physioA: Seeded;
  let guardianA: Seeded;
  let athleteA: Seeded;
  let adminB: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");

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
  const status = (res: Response) => res.status;

  let sectionId = "";
  let team1 = "";
  let team2 = "";
  const players: string[] = [];
  let otherPlayer = "";
  let sessionId = "";
  let pastSessionId = "";
  let teamDrillId = "";

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
    coachOtherA = await user("Oti Otra", "oti@club-a.test");
    fitnessA = await user("Fer Física", "fer@club-a.test");
    physioA = await user("Fina Fisio", "fina@club-a.test");
    guardianA = await user("Fam Familia", "fam@club-a.test");
    athleteA = await user("Àlex Adulto", "alex@club-a.test");
    adminB = await user("Bruno Admin", "bruno@club-b.test");
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, coachOtherA.id, "coach");
    await seeder.membership(clubA.id, fitnessA.id, "staff", "fitness");
    await seeder.membership(clubA.id, physioA.id, "staff", "physio");
    await seeder.membership(clubA.id, guardianA.id, "guardian");
    await seeder.membership(clubA.id, athleteA.id, "guardian");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    for (const u of [adminA, coachA, coachOtherA, fitnessA, physioA, guardianA, athleteA])
      cookies.set(u.email, await signIn(u.email, A));
    cookies.set(adminB.email, await signIn(adminB.email, B));

    const season = await seeder.season(clubA.id, {
      name: "2026-27",
      startsOn: addDays(today, -60),
      endsOn: addDays(today, 200),
    });
    sectionId = (await seeder.section(clubA.id, "Fútbol sala")).id;
    const category = await seeder.category(clubA.id, sectionId, "Sénior");
    team1 = (
      await seeder.team(clubA.id, {
        sectionId,
        categoryId: category.id,
        seasonId: season.id,
        name: "Sénior A",
      })
    ).id;
    team2 = (
      await seeder.team(clubA.id, {
        sectionId,
        categoryId: category.id,
        seasonId: season.id,
        name: "Sénior B",
      })
    ).id;
    const names = ["Iván", "Raúl", "Kike", "Toni", "Jordi", "Àlex"];
    for (const [i, first] of names.entries()) {
      const person = await seeder.person(clubA.id, {
        firstName: first,
        lastName: `Jugador${i}`,
        birthDate: "1997-05-10",
        ...(i === 5 ? { userId: athleteA.id } : {}),
      });
      const player = await seeder.player(clubA.id, person.id);
      await seeder.rosterAdd(clubA.id, team1, player.id, i + 1);
      players.push(player.id);
    }
    const other = await seeder.player(
      clubA.id,
      (await seeder.person(clubA.id, { firstName: "Otro", lastName: "Equipo" })).id,
    );
    await seeder.rosterAdd(clubA.id, team2, other.id, 1);
    otherPlayer = other.id;
    await seeder.teamStaff(clubA.id, team1, coachA.id, "head_coach");
    await seeder.teamStaff(clubA.id, team1, fitnessA.id, "fitness");
    await seeder.teamStaff(clubA.id, team1, physioA.id, "physio");
    await seeder.teamStaff(clubA.id, team2, coachOtherA.id, "head_coach");
    await seeder.guardian(clubA.id, players[0]!, guardianA.id);
    await seeder.guardian(clubA.id, players[5]!, athleteA.id, "other");
  });

  afterAll(async () => {
    await data?.close();
    await local?.stop();
  });

  it("la sección nace con sus contenidos y la biblioteca de arranque; solo la biblioteca la configura", async () => {
    const cfg = await json<TrainingConfigResponse>(
      await request("GET", `/api/org/sections/${sectionId}/training-config`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(cfg.contents.map((c) => c.code)).toContain("finishing");
    expect(cfg.contents.find((c) => c.code === "build_up")?.relatedActionCodes).toContain(
      "turnover",
    );
    expect(cfg.settings.tracking).toBe("basic");
    expect(cfg.access.configure).toBe(false);
    expect(
      status(
        await request("PATCH", `/api/org/sections/${sectionId}/training-config`, A, {
          cookie: as(coachA),
          body: { tracking: "full" },
        }),
      ),
    ).toBe(403);
    const changed = await json<TrainingConfigResponse>(
      await request("PATCH", `/api/org/sections/${sectionId}/training-config`, A, {
        cookie: as(adminA),
        body: { tracking: "full", thresholds: { acwrHigh: 1.4 } },
      }),
      200,
    );
    expect(changed.settings.tracking).toBe("full");
    expect(changed.settings.thresholds.acwrHigh).toBe(1.4);
    expect(changed.settings.thresholds.acwrLow).toBe(0.8);
    const library = await json<DrillsResponse>(
      await request("GET", "/api/org/drills", A, { cookie: as(coachA) }),
      200,
    );
    expect(library.drills.length).toBeGreaterThanOrEqual(14);
    expect(library.drills.find((d) => d.name.startsWith("Rondo"))?.restrictionTags).toContain(
      "contact",
    );
    expect(library.access).toEqual({ library: false, create: true });
  });

  it("biblioteca: el equipo y lo personal para quien toca, el club para la biblioteca", async () => {
    const team = await json<DrillResponse>(
      await request("POST", "/api/org/drills", A, {
        cookie: as(coachA),
        body: {
          scope: "team",
          teamId: team1,
          name: "Finalización del Sénior A",
          durationMin: 15,
          restrictionTags: ["shooting"],
        },
      }),
      201,
    );
    teamDrillId = team.drill.id;
    expect(team.drill.team?.id).toBe(team1);
    await json(
      await request("POST", "/api/org/drills", A, {
        cookie: as(coachA),
        body: { scope: "personal", name: "Mi tarea" },
      }),
      201,
    );
    expect(
      status(
        await request("POST", "/api/org/drills", A, {
          cookie: as(coachA),
          body: { scope: "club", name: "Del club" },
        }),
      ),
    ).toBe(403);
    expect(
      status(
        await request("POST", "/api/org/drills", A, {
          cookie: as(coachOtherA),
          body: { scope: "team", teamId: team1, name: "Intrusa" },
        }),
      ),
    ).toBe(404);
    await json(
      await request("POST", "/api/org/drills", A, {
        cookie: as(adminA),
        body: { scope: "club", name: "Activación del club" },
      }),
      201,
    );
    const other = await json<DrillsResponse>(
      await request("GET", "/api/org/drills", A, { cookie: as(coachOtherA) }),
      200,
    );
    const names = other.drills.map((d) => d.name);
    expect(names).toContain("Activación del club");
    expect(names).not.toContain("Finalización del Sénior A");
    expect(names).not.toContain("Mi tarea");
    expect(
      status(
        await request("GET", `/api/org/drills/${teamDrillId}`, A, { cookie: as(coachOtherA) }),
      ),
    ).toBe(404);
    // Quien no la puede editar no la toca.
    expect(
      status(
        await request("PATCH", `/api/org/drills/${teamDrillId}`, A, {
          cookie: as(coachOtherA),
          body: { name: "x" },
        }),
      ),
    ).toBe(404);
  });

  it("la sesión la planifica el primer entrenador y cada papel edita sus bloques", async () => {
    const created = await json<SessionDetailResponse>(
      await request("POST", `/api/org/teams/${team1}/sessions`, A, {
        cookie: as(coachA),
        body: {
          date: addDays(today, 1),
          startsAt: "20:00",
          minutes: 90,
          objective: "Salida de presión",
        },
      }),
      201,
    );
    sessionId = created.session.id;
    expect(created.session.date).toBe(addDays(today, 1));
    expect(created.session.status).toBe("draft");
    expect(created.access.blocks).toEqual(["warmup", "main", "goalkeepers", "rehab", "cooldown"]);
    expect(
      status(
        await request("POST", `/api/org/teams/${team1}/sessions`, A, {
          cookie: as(coachOtherA),
          body: { date: addDays(today, 1), startsAt: "18:00" },
        }),
      ),
    ).toBe(404);

    const library = await json<DrillsResponse>(
      await request("GET", "/api/org/drills", A, { cookie: as(coachA) }),
      200,
    );
    const drill = (prefix: string) => library.drills.find((d) => d.name.startsWith(prefix))!.id;

    const asFitness = await json<SessionDetailResponse>(
      await request("GET", `/api/org/sessions/${sessionId}`, A, { cookie: as(fitnessA) }),
      200,
    );
    expect(asFitness.access).toMatchObject({ header: false, blocks: ["warmup", "cooldown"] });
    await json(
      await request("PUT", `/api/org/sessions/${sessionId}/blocks/warmup`, A, {
        cookie: as(fitnessA),
        body: { items: [{ drillId: drill("Preventivo"), minutes: 12 }] },
      }),
      200,
    );
    expect(
      status(
        await request("PUT", `/api/org/sessions/${sessionId}/blocks/main`, A, {
          cookie: as(fitnessA),
          body: { items: [{ drillId: drill("Rondo"), minutes: 15 }] },
        }),
      ),
    ).toBe(403);
    expect(
      status(
        await request("PATCH", `/api/org/sessions/${sessionId}`, A, {
          cookie: as(fitnessA),
          body: { objective: "x" },
        }),
      ),
    ).toBe(403);
    await json(
      await request("PUT", `/api/org/sessions/${sessionId}/blocks/rehab`, A, {
        cookie: as(physioA),
        body: {
          items: [{ title: "Readaptación", minutes: 30, targetRpe: 4, playerIds: [players[3]] }],
        },
      }),
      200,
    );
    expect(
      status(
        await request("PUT", `/api/org/sessions/${sessionId}/blocks/rehab`, A, {
          cookie: as(physioA),
          body: { items: [{ title: "Intruso", minutes: 10, playerIds: [otherPlayer] }] },
        }),
      ),
    ).toBe(400);
    const main = await json<SessionDetailResponse>(
      await request("PUT", `/api/org/sessions/${sessionId}/blocks/main`, A, {
        cookie: as(coachA),
        body: {
          items: [
            { drillId: drill("Rondo"), minutes: 15 },
            { drillId: teamDrillId, minutes: 15, targetRpe: 6 },
          ],
        },
      }),
      200,
    );
    expect(main.session.status).toBe("planned");
    expect(main.items.map((i) => [i.block, i.title])).toEqual([
      ["warmup", "Preventivo de aductores e isquios"],
      ["main", "Rondo 4x4+2 comodines"],
      ["main", "Finalización del Sénior A"],
      ["rehab", "Readaptación"],
    ]);
    const rondo = main.items.find((i) => i.title.startsWith("Rondo"))!;
    expect(rondo.restrictionTags).toContain("contact");
    expect(rondo.contentIds.length).toBeGreaterThan(0);
    expect(main.session.plannedMinutes).toBe(12 + 15 + 15 + 30);
  });

  it("la semana pone la etiqueta MD desde el partido y aplica una semana tipo", async () => {
    await json(
      await request("POST", `/api/org/teams/${team1}/matches`, A, {
        cookie: as(coachA),
        body: { opponent: "FS Rival", homeAway: "home", playedOn: addDays(today, 3) },
      }),
      201,
    );
    const week = await json<TeamWeekResponse>(
      await request("GET", `/api/org/teams/${team1}/training/week?date=${addDays(today, 1)}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    const day = week.days.find((d) => d.date === addDays(today, 1))!;
    expect(day.mdLabel).toBe("MD-2");
    expect(day.sessions[0]?.id).toBe(sessionId);
    expect(week.access.write).toBe(true);
    expect(week.tracking).toBe("full");
    const matchDay = week.days.find((d) => d.date === addDays(today, 3));
    if (matchDay) expect(matchDay.mdLabel).toBe("MD");

    expect(
      status(
        await request("POST", `/api/org/sections/${sectionId}/microcycle-templates`, A, {
          cookie: as(coachA),
          body: {
            name: "Tipo",
            days: [{ offset: -1, objective: "Activación", minutes: 50, targetRpe: 3 }],
          },
        }),
      ),
    ).toBe(403);
    const template = await json<{ template: { id: string } }>(
      await request("POST", `/api/org/sections/${sectionId}/microcycle-templates`, A, {
        cookie: as(adminA),
        body: {
          name: "Tipo",
          days: [
            { offset: -1, objective: "Activación", minutes: 50, targetRpe: 3, startsAt: "19:00" },
          ],
        },
      }),
      201,
    );
    const applied = await json<{ sessions: number }>(
      await request("POST", `/api/org/teams/${team1}/training/week/template`, A, {
        cookie: as(coachA),
        body: { templateId: template.template.id, date: addDays(today, 3) },
      }),
      200,
    );
    expect(applied.sessions).toBe(1);
    const after = await json<TeamWeekResponse>(
      await request("GET", `/api/org/teams/${team1}/training/week?date=${addDays(today, 2)}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    const eve = after.days.find((d) => d.date === addDays(today, 2));
    if (eve) expect(eve.sessions[0]?.objective).toBe("Activación");
  });

  it("la disponibilidad la pone fisioterapia; choca con las tareas y el entrenador lo ve sin diagnóstico", async () => {
    expect(
      status(
        await request("PUT", `/api/org/players/${players[2]}/availability`, A, {
          cookie: as(coachA),
          body: { status: "limited", restrictions: ["contact"] },
        }),
      ),
    ).toBe(403);
    await json(
      await request("PUT", `/api/org/players/${players[2]}/availability`, A, {
        cookie: as(physioA),
        body: {
          status: "limited",
          restrictions: ["contact"],
          maxMinutes: 60,
          note: "Sin contacto esta semana",
        },
      }),
      200,
    );
    const detail = await json<SessionDetailResponse>(
      await request("GET", `/api/org/sessions/${sessionId}`, A, { cookie: as(coachA) }),
      200,
    );
    const kike = detail.roster.find((r) => r.playerId === players[2])!;
    expect(kike.availability).toMatchObject({
      status: "limited",
      restrictions: ["contact"],
      maxMinutes: 60,
    });
    const conflict = detail.insights.find(
      (i) => i.rule === "restriction_conflict" && i.playerId === players[2],
    );
    expect(conflict?.level).toBe("alert");
    expect(String(conflict?.values.tags)).toContain("contact");
  });

  it("cerrar la sesión guarda asistencia y RPE; la carga y el rendimiento lo recogen", async () => {
    const past = await json<SessionDetailResponse>(
      await request("POST", `/api/org/teams/${team1}/sessions`, A, {
        cookie: as(coachA),
        body: { date: addDays(today, -1), startsAt: "20:00", minutes: 60, objective: "Ayer" },
      }),
      201,
    );
    pastSessionId = past.session.id;
    expect(
      status(
        await request("PUT", `/api/org/sessions/${pastSessionId}/close`, A, {
          cookie: as(coachOtherA),
          body: { players: [] },
        }),
      ),
    ).toBe(404);
    const closed = await json<SessionDetailResponse>(
      await request("PUT", `/api/org/sessions/${pastSessionId}/close`, A, {
        cookie: as(coachA),
        body: {
          actualMinutes: 60,
          rating: 3,
          players: [
            { playerId: players[0], status: "present", rpe: 6 },
            { playerId: players[1], status: "present", rpe: 7 },
            {
              playerId: players[2],
              status: "present",
              rpe: 4,
              participation: "partial",
              minutes: 40,
            },
            { playerId: players[3], status: "excused" },
            { playerId: players[4], status: "absent" },
            { playerId: players[5], status: "present" },
          ],
        },
      }),
      200,
    );
    expect(closed.session.status).toBe("done");
    expect(closed.session.actualLoad).toBeGreaterThan(0);
    expect(closed.roster.find((r) => r.playerId === players[1])?.load).toEqual({
      rpe: 7,
      minutes: 60,
      participation: "full",
    });
    expect(closed.roster.find((r) => r.playerId === players[4])?.attendance).toBe("absent");

    const load = await json<TeamLoadResponse>(
      await request("GET", `/api/org/teams/${team1}/load`, A, { cookie: as(fitnessA) }),
      200,
    );
    expect(load.players.find((p) => p.playerId === players[1])?.metrics.acute).toBe(420);
    expect(load.access.write).toBe(true);
    // La familia no ve cargas.
    expect(
      status(await request("GET", `/api/org/teams/${team1}/load`, A, { cookie: as(guardianA) })),
    ).toBe(403);

    const perf = await json<PlayerPerformanceResponse>(
      await request("GET", `/api/org/players/${players[1]}/performance`, A, { cookie: as(coachA) }),
      200,
    );
    expect(perf.load.days.find((d) => d.date === addDays(today, -1))?.session).toBe(420);
    expect(perf.access.healthRead).toBe(false);
    expect(perf.access.availabilityWrite).toBe(false);
  });

  it("salud: consentimiento, lesión y lectura auditada; la administración solo por excepción", async () => {
    const injured = players[3]!;
    const empty = await json<PlayerHealthResponse>(
      await request("GET", `/api/org/players/${injured}/health`, A, { cookie: as(physioA) }),
      200,
    );
    expect(empty.consent).toBeNull();
    const injury = {
      occurredOn: addDays(today, -5),
      context: "training",
      bodyArea: "thigh_back",
      side: "right",
      kind: "muscle",
      mechanism: "non_contact",
      diagnosis: "Rotura fibrilar de grado I",
      expectedReturnOn: addDays(today, 10),
    };
    expect(
      status(
        await request("POST", `/api/org/players/${injured}/health/injuries`, A, {
          cookie: as(physioA),
          body: injury,
        }),
      ),
    ).toBe(409);
    await json(
      await request("PUT", `/api/org/players/${injured}/health/consent`, A, {
        cookie: as(physioA),
        body: {
          grantedByName: "Toni Jugador3",
          relationship: "self",
          grantedOn: addDays(today, -30),
        },
      }),
      200,
    );
    const withInjury = await json<PlayerHealthResponse>(
      await request("POST", `/api/org/players/${injured}/health/injuries`, A, {
        cookie: as(physioA),
        body: injury,
      }),
      201,
    );
    const injuryId = withInjury.injuries[0]!.id;
    expect(withInjury.injuries[0]).toMatchObject({
      diagnosis: "Rotura fibrilar de grado I",
      severity: "mild",
      daysOut: 5,
    });
    await json(
      await request("PUT", `/api/org/injuries/${injuryId}/phases`, A, {
        cookie: as(physioA),
        body: {
          phases: [
            { name: "Fuerza excéntrica", startedOn: addDays(today, -2) },
            { name: "Carrera" },
          ],
        },
      }),
      200,
    );
    await json(
      await request("PUT", `/api/org/players/${injured}/availability`, A, {
        cookie: as(physioA),
        body: { status: "rehab", injuryId, expectedReturnOn: addDays(today, 3) },
      }),
      200,
    );

    // Preparación física lee la salud pero no la escribe; el entrenador y la administración, nada.
    await json(
      await request("GET", `/api/org/players/${injured}/health`, A, { cookie: as(fitnessA) }),
      200,
    );
    expect(
      status(
        await request("POST", `/api/org/players/${injured}/health/injuries`, A, {
          cookie: as(fitnessA),
          body: injury,
        }),
      ),
    ).toBe(403);
    expect(
      status(await request("GET", `/api/org/players/${injured}/health`, A, { cookie: as(coachA) })),
    ).toBe(403);
    expect(
      status(await request("GET", `/api/org/players/${injured}/health`, A, { cookie: as(adminA) })),
    ).toBe(403);

    // A la administración solo se le abre Salud, y solo para leer.
    expect(
      status(
        await request("PUT", `/api/org/access/members/${adminA.id}`, A, {
          cookie: as(adminA),
          body: { visible: ["sections"] },
        }),
      ),
    ).toBe(409);
    const opened = await json<{ allow: string[]; deny: string[] }>(
      await request("PUT", `/api/org/access/members/${adminA.id}`, A, {
        cookie: as(adminA),
        body: { visible: [...ACCESS_AREAS] },
      }),
      200,
    );
    expect(opened).toMatchObject({ allow: ["health"], deny: [] });
    const asAdmin = await json<PlayerHealthResponse>(
      await request("GET", `/api/org/players/${injured}/health`, A, { cookie: as(adminA) }),
      200,
    );
    expect(asAdmin.access.write).toBe(false);
    expect(
      status(
        await request("POST", `/api/org/players/${injured}/health/injuries`, A, {
          cookie: as(adminA),
          body: injury,
        }),
      ),
    ).toBe(403);
    const activity = await json<{ entries: { action: string }[] }>(
      await request("GET", "/api/org/activity", A, { cookie: as(adminA) }),
      200,
    );
    expect(activity.entries.some((e) => e.action === "health.viewed")).toBe(true);
    expect(
      status(
        await request("DELETE", `/api/org/access/members/${adminA.id}`, A, { cookie: as(adminA) }),
      ),
    ).toBe(204);
  });

  it("enfermería: fisioterapia ve bajas y limitados con su lesión; el entrenador, no", async () => {
    const infirmary = await json<InfirmaryResponse>(
      await request("GET", "/api/org/infirmary", A, { cookie: as(physioA) }),
      200,
    );
    const toni = infirmary.players.find((p) => p.playerId === players[3]);
    expect(toni?.availability.status).toBe("rehab");
    expect(toni?.injury?.diagnosis).toBe("Rotura fibrilar de grado I");
    expect(toni?.injury?.phase).toBe("Fuerza excéntrica");
    expect(infirmary.players.find((p) => p.playerId === players[2])?.availability.status).toBe(
      "limited",
    );
    expect(status(await request("GET", "/api/org/infirmary", A, { cookie: as(coachA) }))).toBe(403);
    // La administración ve la enfermería (pone disponibilidad) pero sin diagnóstico.
    const admin = await json<InfirmaryResponse>(
      await request("GET", "/api/org/infirmary", A, { cookie: as(adminA) }),
      200,
    );
    expect(admin.access.healthRead).toBe(false);
    expect(admin.players.every((p) => p.injury === null)).toBe(true);
  });

  it("recomendaciones: explican y se pueden descartar sin volver a salir", async () => {
    const insights = await json<TeamInsightsResponse>(
      await request("GET", `/api/org/teams/${team1}/insights`, A, { cookie: as(coachA) }),
      200,
    );
    const conflict = insights.insights.find((i) => i.rule === "restriction_conflict");
    expect(conflict).toBeDefined();
    expect(insights.access.answer).toBe(true);
    expect(
      status(
        await request("POST", `/api/org/teams/${team1}/insights/feedback`, A, {
          cookie: as(coachA),
          body: {
            rule: conflict!.rule,
            fingerprint: conflict!.fingerprint,
            playerId: conflict!.playerId,
            outcome: "dismissed",
            reason: "Ya lo sé",
          },
        }),
      ),
    ).toBe(204);
    const again = await json<TeamInsightsResponse>(
      await request("GET", `/api/org/teams/${team1}/insights`, A, { cookie: as(coachA) }),
      200,
    );
    expect(again.insights.some((i) => i.fingerprint === conflict!.fingerprint)).toBe(false);
    expect(
      status(
        await request("GET", `/api/org/teams/${team1}/insights`, A, { cookie: as(guardianA) }),
      ),
    ).toBe(403);
  });

  it("el deportista adulto responde su bienestar y su RPE desde su cuenta", async () => {
    const before = await json<AthleteResponse>(
      await request("GET", "/api/org/me/athlete", A, { cookie: as(athleteA) }),
      200,
    );
    expect(before.player?.id).toBe(players[5]);
    expect(before.pendingRpe.map((p) => p.title)).toContain("Entrenamiento Sénior A");
    const wellness = await json<AthleteResponse>(
      await request("PUT", "/api/org/me/athlete/wellness", A, {
        cookie: as(athleteA),
        body: {
          date: today,
          sleep: 4,
          fatigue: 3,
          soreness: 2,
          stress: 4,
          mood: 4,
          sorenessArea: "Gemelo",
        },
      }),
      200,
    );
    expect(wellness.wellnessToday?.score).toBe(17);
    const pending = before.pendingRpe[0]!;
    const after = await json<AthleteResponse>(
      await request("PUT", `/api/org/me/athlete/sessions/${pending.eventId}/rpe`, A, {
        cookie: as(athleteA),
        body: { rpe: 6 },
      }),
      200,
    );
    expect(after.pendingRpe).toEqual([]);
    // La familia de otro jugador no tiene ficha propia.
    expect(
      (
        await json<AthleteResponse>(
          await request("GET", "/api/org/me/athlete", A, { cookie: as(guardianA) }),
          200,
        )
      ).player,
    ).toBeNull();
    // El dolor que declara aparece en la enfermería.
    const infirmary = await json<InfirmaryResponse>(
      await request("GET", "/api/org/infirmary", A, { cookie: as(physioA) }),
      200,
    );
    expect(
      infirmary.soreness.some((s) => s.playerId === players[5] && s.sorenessArea === "Gemelo"),
    ).toBe(true);
  });

  it("tests físicos: los registra el cuerpo técnico; la familia ve solo la evolución de los suyos", async () => {
    const team = await json<TeamTestsResponse>(
      await request("GET", `/api/org/teams/${team1}/physical-tests`, A, { cookie: as(fitnessA) }),
      200,
    );
    const cmj = team.tests.find((t) => t.code === "cmj")!;
    await json(
      await request("POST", `/api/org/teams/${team1}/physical-tests/results`, A, {
        cookie: as(fitnessA),
        body: {
          testId: cmj.id,
          date: today,
          results: [
            { playerId: players[0], value: 38.5 },
            { playerId: players[1], value: 41 },
          ],
        },
      }),
      201,
    );
    expect(
      status(
        await request("POST", `/api/org/teams/${team1}/physical-tests/results`, A, {
          cookie: as(coachOtherA),
          body: { testId: cmj.id, date: today, results: [{ playerId: players[0], value: 1 }] },
        }),
      ),
    ).toBe(404);
    const family = await json<FamilyTestsResponse>(
      await request("GET", `/api/org/family/players/${players[0]}/physical-tests`, A, {
        cookie: as(guardianA),
      }),
      200,
    );
    expect(family.results).toEqual([{ testId: cmj.id, date: today, value: 38.5 }]);
    expect(
      status(
        await request("GET", `/api/org/family/players/${players[1]}/physical-tests`, A, {
          cookie: as(guardianA),
        }),
      ),
    ).toBe(404);
  });

  it("copiar una sesión y la metodología de la sección", async () => {
    const target = await json<SessionDetailResponse>(
      await request("POST", `/api/org/teams/${team1}/sessions`, A, {
        cookie: as(coachA),
        body: { date: addDays(today, 8), startsAt: "20:00", minutes: 90 },
      }),
      201,
    );
    const copied = await json<SessionDetailResponse>(
      await request("POST", `/api/org/sessions/${sessionId}/copy`, A, {
        cookie: as(coachA),
        body: { eventId: target.session.eventId },
      }),
      201,
    );
    expect(copied.session.id).toBe(target.session.id);
    expect(copied.items.length).toBe(4);
    expect(copied.items.every((i) => i.playerIds === null)).toBe(true);
    const methodology = await json<MethodologyResponse>(
      await request("GET", `/api/org/sections/${sectionId}/methodology`, A, { cookie: as(adminA) }),
      200,
    );
    const row = methodology.teams.find((t) => t.id === team1)!;
    expect(row.planned).toBeGreaterThanOrEqual(1);
    expect(row.done).toBe(1);
  });

  it("nada del club A se ve ni se toca desde el club B", async () => {
    const cookie = as(adminB);
    expect(status(await request("GET", `/api/org/sessions/${sessionId}`, B, { cookie }))).toBe(404);
    expect(status(await request("GET", `/api/org/drills/${teamDrillId}`, B, { cookie }))).toBe(404);
    expect(
      status(await request("GET", `/api/org/teams/${team1}/training/week`, B, { cookie })),
    ).toBe(404);
    expect(status(await request("GET", `/api/org/teams/${team1}/insights`, B, { cookie }))).toBe(
      404,
    );
    expect(
      status(await request("GET", `/api/org/players/${players[1]}/performance`, B, { cookie })),
    ).toBe(404);
    expect(
      status(
        await request("PUT", `/api/org/players/${players[1]}/availability`, B, {
          cookie,
          body: { status: "out" },
        }),
      ),
    ).toBe(404);
    expect(
      status(
        await request("PUT", `/api/org/sessions/${sessionId}/blocks/main`, B, {
          cookie,
          body: { items: [] },
        }),
      ),
    ).toBe(404);
    const library = await json<DrillsResponse>(
      await request("GET", "/api/org/drills", B, { cookie }),
      200,
    );
    expect(library.drills.some((d) => d.id === teamDrillId)).toBe(false);
    // Las sesiones de A siguen intactas.
    const still = await json<SessionDetailResponse>(
      await request("GET", `/api/org/sessions/${sessionId}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(still.items.length).toBe(4);
  });
});

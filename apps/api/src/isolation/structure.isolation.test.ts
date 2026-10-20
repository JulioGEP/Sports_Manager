import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Estructura del club y familias (Fase 1, Bloque 11, ADR 0028) contra una base real: dos clubes,
 * una administradora, una entrenadora, una familia invitada desde la ficha de un jugador y un
 * administrador de plataforma. Comprueba permisos por rol, aislamiento entre clubes y el vínculo
 * familia-jugador al aceptar la invitación. Si uno falla, la PR no se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };

describe("estructura del club y familias", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let adminB: Seeded;
  let platform: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");

  const request = (
    method: "GET" | "POST" | "PATCH" | "DELETE",
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

  let seasonId = "";
  let sectionId = "";
  let teamId = "";
  let playerId = "";
  let familyCookie = "";
  const familyEmail = "familia-a@club-a.test";

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
    data = createDataLayer({ config, connectionString });
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
    adminB = await seeder.user({
      name: "Bruno Admin",
      email: "bruno@club-b.test",
      password: PASSWORD,
    });
    platform = await seeder.user({
      name: "Pau Plataforma",
      email: "pau@plataforma.test",
      password: PASSWORD,
    });
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    await seeder.platformAdmin(platform.id);
    for (const u of [adminA, coachA, adminB, platform])
      cookies.set(u.email, await signIn(u.email, A));
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("un club nuevo empieza sin temporada, y la primera que crea pasa a ser la actual", async () => {
    const empty = await json<{ season: unknown; teams: unknown[] }>(
      await request("GET", "/api/org/teams", A, { cookie: as(adminA) }),
      200,
    );
    expect(empty).toEqual({ season: null, teams: [] });

    const created = await json<{ season: { id: string; isCurrent: boolean } }>(
      await request("POST", "/api/org/seasons", A, {
        cookie: as(adminA),
        body: { name: "2026-27", startsOn: "2026-09-01", endsOn: "2027-06-30" },
      }),
      201,
    );
    expect(created.season.isCurrent).toBe(true);
    seasonId = created.season.id;

    const dup = await request("POST", "/api/org/seasons", A, {
      cookie: as(adminA),
      body: { name: "2026-27", startsOn: "2026-09-01", endsOn: "2027-06-30" },
    });
    expect(dup.status).toBe(409);
    const reversed = await request("POST", "/api/org/seasons", A, {
      cookie: as(adminA),
      body: { name: "mal", startsOn: "2027-09-01", endsOn: "2027-01-01" },
    });
    expect(reversed.status).toBe(400);

    // Una segunda temporada marcada como actual desplaza a la primera.
    const next = await json<{ season: { id: string; isCurrent: boolean } }>(
      await request("POST", "/api/org/seasons", A, {
        cookie: as(adminA),
        body: { name: "2027-28", startsOn: "2027-09-01", endsOn: "2028-06-30", isCurrent: true },
      }),
      201,
    );
    expect(next.season.isCurrent).toBe(true);
    const back = await json<{ season: { isCurrent: boolean } }>(
      await request("PATCH", `/api/org/seasons/${seasonId}`, A, {
        cookie: as(adminA),
        body: { isCurrent: true },
      }),
      200,
    );
    expect(back.season.isCurrent).toBe(true);
    const list = await json<{ seasons: { name: string; isCurrent: boolean }[] }>(
      await request("GET", "/api/org/seasons", A, { cookie: as(adminA) }),
      200,
    );
    expect(list.seasons.filter((s) => s.isCurrent).map((s) => s.name)).toEqual(["2026-27"]);
  });

  it("la administradora crea sección, equipo y jugador; la entrenadora lee pero no escribe", async () => {
    const section = await json<{ section: { id: string } }>(
      await request("POST", "/api/org/sections", A, {
        cookie: as(adminA),
        body: { name: "Fútbol sala" },
      }),
      201,
    );
    sectionId = section.section.id;
    expect(
      (
        await request("POST", "/api/org/sections", A, {
          cookie: as(adminA),
          body: { name: "Fútbol sala" },
        })
      ).status,
    ).toBe(409);

    const team = await json<{ team: { id: string; name: string; playersCount: number } }>(
      await request("POST", "/api/org/teams", A, {
        cookie: as(adminA),
        body: { sectionId, seasonId, name: "Alevín A", category: "Alevín" },
      }),
      201,
    );
    teamId = team.team.id;
    expect(team.team.playersCount).toBe(0);

    const player = await json<{ player: { id: string }; teams: { teamId: string }[] }>(
      await request("POST", "/api/org/players", A, {
        cookie: as(adminA),
        body: { firstName: "Clara", lastName: "Martí", birthDate: "2015-02-03", teamId },
      }),
      201,
    );
    playerId = player.player.id;
    expect(player.teams.map((t) => t.teamId)).toEqual([teamId]);

    // Dorsal y posición en la plantilla; el mismo jugador no entra dos veces.
    await json(
      await request("PATCH", `/api/org/teams/${teamId}/players/${playerId}`, A, {
        cookie: as(adminA),
        body: { shirtNumber: 1, position: "Portero" },
      }),
      200,
    );
    expect(
      (
        await request("POST", `/api/org/teams/${teamId}/players`, A, {
          cookie: as(adminA),
          body: { playerId },
        })
      ).status,
    ).toBe(409);

    // Cuerpo técnico: solo miembros del club.
    const staffed = await json<{ staff: { email: string }[] }>(
      await request("POST", `/api/org/teams/${teamId}/staff`, A, {
        cookie: as(adminA),
        body: { userId: coachA.id },
      }),
      200,
    );
    expect(staffed.staff.map((s) => s.email)).toEqual([coachA.email]);
    expect(
      (
        await request("POST", `/api/org/teams/${teamId}/staff`, A, {
          cookie: as(adminA),
          body: { userId: adminB.id },
        })
      ).status,
    ).toBe(400);

    // La entrenadora ve equipos y plantilla con datos, pero no puede cambiar nada.
    const detail = await json<{ roster: { firstName: string; shirtNumber: number }[] }>(
      await request("GET", `/api/org/teams/${teamId}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(detail.roster).toMatchObject([{ firstName: "Clara", shirtNumber: 1 }]);
    const players = await json<{ players: { teams: { teamName: string }[] }[] }>(
      await request("GET", "/api/org/players?q=cla", A, { cookie: as(coachA) }),
      200,
    );
    expect(players.players).toHaveLength(1);
    expect(players.players[0]?.teams.map((t) => t.teamName)).toEqual(["Alevín A"]);
    expect(
      (
        await request("POST", "/api/org/players", A, {
          cookie: as(coachA),
          body: { firstName: "X", lastName: "Y" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("PATCH", `/api/org/teams/${teamId}`, A, {
          cookie: as(coachA),
          body: { name: "Otro" },
        })
      ).status,
    ).toBe(403);
  });

  it("otro club no ve nada de esta estructura, ni por id", async () => {
    expect(
      (await request("GET", `/api/org/teams/${teamId}`, B, { cookie: as(adminB) })).status,
    ).toBe(404);
    expect(
      (await request("GET", `/api/org/players/${playerId}`, B, { cookie: as(adminB) })).status,
    ).toBe(404);
    const teamsB = await json<{ season: unknown; teams: unknown[] }>(
      await request("GET", "/api/org/teams", B, { cookie: as(adminB) }),
      200,
    );
    expect(teamsB.teams).toEqual([]);
    // Un equipo del club B no puede apuntar a la sección del club A.
    const seasonB = await json<{ season: { id: string } }>(
      await request("POST", "/api/org/seasons", B, {
        cookie: as(adminB),
        body: { name: "2026-27", startsOn: "2026-09-01", endsOn: "2027-06-30" },
      }),
      201,
    );
    expect(
      (
        await request("POST", "/api/org/teams", B, {
          cookie: as(adminB),
          body: { sectionId, seasonId: seasonB.season.id, name: "Intruso" },
        })
      ).status,
    ).toBe(400);
    // Ni meter en su plantilla a un jugador del club A.
    const sectionB = await json<{ section: { id: string } }>(
      await request("POST", "/api/org/sections", B, { cookie: as(adminB), body: { name: "Base" } }),
      201,
    );
    const teamB = await json<{ team: { id: string } }>(
      await request("POST", "/api/org/teams", B, {
        cookie: as(adminB),
        body: { sectionId: sectionB.section.id, seasonId: seasonB.season.id, name: "Benjamín" },
      }),
      201,
    );
    expect(
      (
        await request("POST", `/api/org/teams/${teamB.team.id}/players`, B, {
          cookie: as(adminB),
          body: { playerId },
        })
      ).status,
    ).toBe(400);
  });

  it("la familia se invita desde la ficha del jugador y, al aceptar, queda vinculada y solo ve lo suyo", async () => {
    const sent = await json<{
      acceptUrl: string | null;
      invitation: { player: { name: string } | null };
    }>(
      await request("POST", `/api/org/players/${playerId}/guardians/invite`, A, {
        cookie: as(adminA),
        body: { email: familyEmail, relationship: "mother" },
      }),
      201,
    );
    expect(sent.invitation.player?.name).toBe("Clara Martí");
    const token = sent.acceptUrl!.split("/invitations/")[1]!;

    const pub = await json<{ playerName: string | null; roleCode: string }>(
      await request("GET", `/api/invitations/${token}`, A),
      200,
    );
    expect(pub).toMatchObject({ playerName: "Clara Martí", roleCode: "guardian" });

    const accepted = await request("POST", `/api/invitations/${token}/accept`, A, {
      body: { name: "Laura Martí", password: PASSWORD },
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    familyCookie = cookieOf(accepted);

    const family = await json<{
      players: {
        firstName: string;
        relationship: string;
        teams: { teamName: string; staff: { name: string }[] }[];
      }[];
    }>(await request("GET", "/api/org/family", A, { cookie: familyCookie }), 200);
    expect(family.players).toMatchObject([
      {
        firstName: "Clara",
        relationship: "mother",
        teams: [{ teamName: "Alevín A", staff: [{ name: "Caro Coach" }] }],
      },
    ]);

    // La familia no lista jugadores ni equipos del club: eso es del personal.
    expect((await request("GET", "/api/org/players", A, { cookie: familyCookie })).status).toBe(
      403,
    );
    expect((await request("GET", "/api/org/teams", A, { cookie: familyCookie })).status).toBe(403);
    expect(
      (await request("GET", `/api/org/players/${playerId}`, A, { cookie: familyCookie })).status,
    ).toBe(403);

    // En la ficha aparece como familia; la invitación ya no está pendiente.
    const detail = await json<{
      guardians: { email: string; relationship: string }[];
      pendingInvitations: unknown[];
    }>(await request("GET", `/api/org/players/${playerId}`, A, { cookie: as(adminA) }), 200);
    expect(detail.guardians).toMatchObject([
      { name: "Laura Martí", email: familyEmail, relationship: "mother" },
    ]);
    expect(detail.pendingInvitations).toEqual([]);

    // Quien ya es miembro se vincula directamente, no por invitación.
    const again = await request("POST", `/api/org/players/${playerId}/guardians/invite`, A, {
      cookie: as(adminA),
      body: { email: familyEmail, relationship: "father" },
    });
    expect(again.status).toBe(409);
  });

  it("el administrador de plataforma sin autorización solo ve cifras; con ella, también los jugadores", async () => {
    const support = await json<{
      organization: { view: string; counts: { teams: number; players: number } };
    }>(await request("GET", "/api/org", A, { cookie: as(platform) }), 200);
    expect(support.organization.view).toBe("support");
    expect(support.organization.counts).toMatchObject({ teams: 1, players: 1 });
    const summary = await json<{ teams: number; players: number; guardians: number }>(
      await request("GET", "/api/org/summary", A, { cookie: as(platform) }),
      200,
    );
    expect(summary).toMatchObject({ teams: 1, players: 1, guardians: 1 });
    expect((await request("GET", "/api/org/players", A, { cookie: as(platform) })).status).toBe(
      403,
    );

    await seeder.supportGrant(clubA.id, platform.id, 10);
    const players = await json<{ players: unknown[] }>(
      await request("GET", "/api/org/players", A, { cookie: as(platform) }),
      200,
    );
    expect(players.players).toHaveLength(1);
    expect(
      (
        await request("POST", "/api/org/players", A, {
          cookie: as(platform),
          body: { firstName: "No", lastName: "Puede" },
        })
      ).status,
    ).toBe(403);
  });

  it("dar de baja a un jugador lo deja inactivo, sin borrarlo ni sacarlo de su historial", async () => {
    const updated = await json<{ player: { status: string } }>(
      await request("PATCH", `/api/org/players/${playerId}`, A, {
        cookie: as(adminA),
        body: { status: "inactive" },
      }),
      200,
    );
    expect(updated.player.status).toBe("inactive");
    const summary = await json<{ players: number }>(
      await request("GET", "/api/org/summary", A, { cookie: as(adminA) }),
      200,
    );
    expect(summary.players).toBe(0);
    const detail = await json<{ teams: { teamName: string }[] }>(
      await request("GET", `/api/org/players/${playerId}`, A, { cookie: as(adminA) }),
      200,
    );
    expect(detail.teams.map((t) => t.teamName)).toEqual(["Alevín A"]);
  });
});

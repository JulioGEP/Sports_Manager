import { NetlifyDB } from "@netlify/database-dev";
import type {
  MatchDetailResponse,
  MatchEventsResponse,
  MatchesResponse,
  PlayerMatchesResponse,
  SectionMatchConfigResponse,
  TeamMatchHistoryResponse,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Partido en directo (Bloque 19, ADR 0032) contra una base real: catálogo por sección sembrado
 * desde el deporte, partido con convocatoria y eventos, estadísticas calculadas, permisos por
 * equipo del cuerpo técnico, vista de la familia y aislamiento entre clubes.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };

describe("partido en directo", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let coachOtherA: Seeded;
  let guardianA: Seeded;
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

  let sectionId = "";
  let teamId = "";
  let otherTeamId = "";
  const players: string[] = [];
  let matchId = "";
  let goalTypeId = "";
  let oppGoalTypeId = "";
  let foulTypeId = "";
  let saveTypeId = "";

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
    guardianA = await user("Fam Familia", "fam@club-a.test");
    adminB = await user("Bruno Admin", "bruno@club-b.test");
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, coachOtherA.id, "coach");
    await seeder.membership(clubA.id, guardianA.id, "guardian");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    for (const u of [adminA, coachA, coachOtherA, guardianA])
      cookies.set(u.email, await signIn(u.email, A));
    cookies.set(adminB.email, await signIn(adminB.email, B));

    // Estructura del club A: temporada, sección de fútbol sala, categoría y dos equipos.
    const season = await json<{ season: { id: string } }>(
      await request("POST", "/api/org/seasons", A, {
        cookie: as(adminA),
        body: { name: "2026-27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true },
      }),
      201,
    );
    const section = await json<{ section: { id: string } }>(
      await request("POST", "/api/org/sections", A, {
        cookie: as(adminA),
        body: { name: "Fútbol sala", sportCode: "futsal", categories: [{ name: "Alevín" }] },
      }),
      201,
    );
    sectionId = section.section.id;
    const categories = await json<{ categories: { id: string }[] }>(
      await request("GET", `/api/org/categories?section=${sectionId}`, A, { cookie: as(adminA) }),
      200,
    );
    const categoryId = categories.categories[0]!.id;
    const team = await json<{ team: { id: string } }>(
      await request("POST", "/api/org/teams", A, {
        cookie: as(adminA),
        body: { sectionId, seasonId: season.season.id, categoryId, name: "Alevín A" },
      }),
      201,
    );
    teamId = team.team.id;
    const other = await json<{ team: { id: string } }>(
      await request("POST", "/api/org/teams", A, {
        cookie: as(adminA),
        body: { sectionId, seasonId: season.season.id, categoryId, name: "Alevín B" },
      }),
      201,
    );
    otherTeamId = other.team.id;
    await json(
      await request("POST", `/api/org/teams/${teamId}/staff`, A, {
        cookie: as(adminA),
        body: { userId: coachA.id, roleInTeam: "head_coach" },
      }),
      200,
    );
    const names = [
      ["Clara", "Portera", "Portero"],
      ["Àlex", "Cierre", "Cierre"],
      ["Jan", "Ala", "Ala"],
      ["Berta", "Ala", "Ala"],
      ["Oriol", "Pívot", "Pívot"],
      ["Mia", "Suplente", "Ala"],
    ] as const;
    for (const [i, [first, last, position]] of names.entries()) {
      const created = await json<{ player: { id: string } }>(
        await request("POST", "/api/org/players", A, {
          cookie: as(adminA),
          body: { firstName: first, lastName: last, teamId },
        }),
        201,
      );
      players.push(created.player.id);
      await json(
        await request("PATCH", `/api/org/teams/${teamId}/players/${created.player.id}`, A, {
          cookie: as(adminA),
          body: { shirtNumber: i + 1, position },
        }),
        200,
      );
    }
    await json(
      await request("POST", `/api/org/players/${players[0]}/guardians`, A, {
        cookie: as(adminA),
        body: { userId: guardianA.id, relationship: "mother" },
      }),
      200,
    );
  });

  afterAll(async () => {
    await data?.close();
    await local?.stop();
  });

  it("la sección nace con el catálogo y los ajustes que propone el deporte", async () => {
    const cfg = await json<SectionMatchConfigResponse>(
      await request("GET", `/api/org/sections/${sectionId}/match-config`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(cfg.section.sportCode).toBe("futsal");
    expect(cfg.settings).toMatchObject({
      periods: 2,
      periodMinutes: 20,
      playersOnCourt: 5,
      goalkeeper: true,
    });
    expect(cfg.customized).toBe(false);
    const codes = cfg.actionTypes.map((t) => t.code);
    expect(codes).toContain("goal");
    expect(codes).toContain("opp_goal");
    expect(cfg.access.write).toBe(false);
    goalTypeId = cfg.actionTypes.find((t) => t.code === "goal")!.id;
    oppGoalTypeId = cfg.actionTypes.find((t) => t.code === "opp_goal")!.id;
    foulTypeId = cfg.actionTypes.find((t) => t.code === "foul")!.id;
    saveTypeId = cfg.actionTypes.find((t) => t.code === "save")!.id;
  });

  it("la administración configura el motor: ajustes, acciones nuevas y vuelta al deporte", async () => {
    // El cuerpo técnico no configura.
    expect(
      (
        await request("PATCH", `/api/org/sections/${sectionId}/match-config`, A, {
          cookie: as(coachA),
          body: { settings: { periodMinutes: 25 } },
        })
      ).status,
    ).toBe(403);
    const changed = await json<SectionMatchConfigResponse>(
      await request("PATCH", `/api/org/sections/${sectionId}/match-config`, A, {
        cookie: as(adminA),
        body: { settings: { periodMinutes: 25, foulLimit: 6 } },
      }),
      200,
    );
    expect(changed.settings.periodMinutes).toBe(25);
    expect(changed.customized).toBe(true);

    const withCorner = await json<SectionMatchConfigResponse>(
      await request("POST", `/api/org/sections/${sectionId}/match-actions`, A, {
        cookie: as(adminA),
        body: {
          name: "Saque de banda",
          category: "neutral",
          scope: "team",
          weight: 0.5,
          quick: true,
        },
      }),
      201,
    );
    const throwIn = withCorner.actionTypes.find((t) => t.code === "saque_de_banda");
    expect(throwIn).toMatchObject({
      name: "Saque de banda",
      scope: "team",
      weight: 0.5,
      quick: true,
    });
    // Misma clave dos veces: conflicto.
    expect(
      (
        await request("POST", `/api/org/sections/${sectionId}/match-actions`, A, {
          cookie: as(adminA),
          body: { code: "saque_de_banda", name: "Otra", category: "neutral", scope: "team" },
        })
      ).status,
    ).toBe(409);
    const edited = await json<SectionMatchConfigResponse>(
      await request("PATCH", `/api/org/sections/${sectionId}/match-actions/${throwIn!.id}`, A, {
        cookie: as(adminA),
        body: { weight: 1, quick: false },
      }),
      200,
    );
    expect(edited.actionTypes.find((t) => t.id === throwIn!.id)).toMatchObject({
      weight: 1,
      quick: false,
    });
    const removed = await json<SectionMatchConfigResponse>(
      await request("DELETE", `/api/org/sections/${sectionId}/match-actions/${throwIn!.id}`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    expect(removed.actionTypes.some((t) => t.id === throwIn!.id)).toBe(false);

    const reset = await json<SectionMatchConfigResponse>(
      await request("PATCH", `/api/org/sections/${sectionId}/match-config`, A, {
        cookie: as(adminA),
        body: { resetToSport: true },
      }),
      200,
    );
    expect(reset.settings.periodMinutes).toBe(20);
    expect(reset.customized).toBe(false);
    expect(reset.actionTypes.filter((t) => t.status === "active").length).toBe(
      reset.sportDefaults.actionTypes.length,
    );
  });

  it("el cuerpo técnico crea un partido de su equipo, no de otro", async () => {
    expect(
      (
        await request("POST", `/api/org/teams/${otherTeamId}/matches`, A, {
          cookie: as(coachA),
          body: { opponent: "FS Gràcia", homeAway: "home", playedOn: "2026-10-17" },
        })
      ).status,
    ).toBe(403);
    const created = await json<MatchDetailResponse>(
      await request("POST", `/api/org/teams/${teamId}/matches`, A, {
        cookie: as(coachA),
        body: {
          opponent: "FS Gràcia",
          homeAway: "home",
          playedOn: "2026-10-17",
          settings: { periodMinutes: 15 },
        },
      }),
      201,
    );
    matchId = created.match.id;
    expect(created.match.status).toBe("scheduled");
    expect(created.match.settings.periodMinutes).toBe(15);
    // La plantilla entra como convocatoria, con la portera reconocida por su posición.
    expect(created.squad).toHaveLength(6);
    expect(created.squad.find((p) => p.playerId === players[0])?.isGoalkeeper).toBe(true);
    expect(created.roster).toHaveLength(0);
    expect(created.access.write).toBe(true);
    const list = await json<MatchesResponse>(
      await request("GET", `/api/org/teams/${teamId}/matches`, A, { cookie: as(coachOtherA) }),
      200,
    );
    expect(list.matches).toHaveLength(1);
    expect(list.access.write).toBe(false);
  });

  it("convocatoria, quinteto inicial y eventos con el marcador calculado", async () => {
    const five = players.slice(0, 5);
    const squad = await json<{ squad: MatchDetailResponse["squad"] }>(
      await request("PUT", `/api/org/matches/${matchId}/squad`, A, {
        cookie: as(coachA),
        body: {
          players: players.map((playerId, i) => ({
            playerId,
            shirtNumber: i + 1,
            isGoalkeeper: i === 0,
            starter: i < 5,
            slot: i < 5 ? i : null,
          })),
        },
      }),
      200,
    );
    expect(squad.squad.filter((p) => p.starter)).toHaveLength(5);

    await json(
      await request("PATCH", `/api/org/matches/${matchId}`, A, {
        cookie: as(coachA),
        body: {
          status: "live",
          formation: "1-2-1",
          clock: { period: 1, elapsedMs: 0, runningSince: new Date().toISOString() },
        },
      }),
      200,
    );
    const appended = await json<MatchEventsResponse>(
      await request("POST", `/api/org/matches/${matchId}/events`, A, {
        cookie: as(coachA),
        body: {
          events: [
            { clientId: "c1", kind: "lineup", period: 1, clockMs: 0, onCourt: five },
            { clientId: "c2", kind: "period_start", period: 1, clockMs: 0, onCourt: five },
            {
              clientId: "c3",
              kind: "action",
              actionTypeId: goalTypeId,
              playerId: players[2],
              period: 1,
              clockMs: 120000,
              zone: "r1c2",
              onCourt: five,
            },
            {
              clientId: "c4",
              kind: "action",
              actionTypeId: oppGoalTypeId,
              period: 1,
              clockMs: 300000,
              onCourt: five,
            },
            {
              clientId: "c5",
              kind: "action",
              actionTypeId: foulTypeId,
              playerId: players[1],
              period: 1,
              clockMs: 400000,
              onCourt: five,
            },
            {
              clientId: "c6",
              kind: "sub",
              playerId: players[5],
              relatedPlayerId: players[4],
              period: 1,
              clockMs: 600000,
              onCourt: [...five.slice(0, 4), players[5]],
            },
            {
              clientId: "c7",
              kind: "action",
              actionTypeId: saveTypeId,
              playerId: players[0],
              period: 1,
              clockMs: 700000,
              onCourt: [...five.slice(0, 4), players[5]],
            },
          ],
        },
      }),
      201,
    );
    expect(appended.events).toHaveLength(7);
    expect(appended.match.ownScore).toBe(1);
    expect(appended.match.opponentScore).toBe(1);
    expect(appended.events[2]).toMatchObject({ actionCode: "goal", side: "own", ownScoreDelta: 1 });
    expect(appended.events[3]).toMatchObject({
      actionCode: "opp_goal",
      side: "opponent",
      opponentScoreDelta: 1,
    });

    // Reenviar el mismo clientId no duplica.
    const again = await json<MatchEventsResponse>(
      await request("POST", `/api/org/matches/${matchId}/events`, A, {
        cookie: as(coachA),
        body: {
          events: [
            {
              clientId: "c3",
              kind: "action",
              actionTypeId: goalTypeId,
              playerId: players[2],
              period: 1,
              clockMs: 120000,
              onCourt: five,
            },
          ],
        },
      }),
      201,
    );
    expect(again.events).toHaveLength(7);
    expect(again.match.ownScore).toBe(1);

    // Un jugador sin convocar o una acción de otra sección: 400.
    expect(
      (
        await request("POST", `/api/org/matches/${matchId}/events`, A, {
          cookie: as(coachA),
          body: {
            events: [
              {
                kind: "action",
                actionTypeId: goalTypeId,
                playerId: adminA.id,
                period: 1,
                clockMs: 1,
                onCourt: five,
              },
            ],
          },
        })
      ).status,
    ).toBe(400);

    // Deshacer el último.
    const last = again.events[again.events.length - 1]!;
    const undone = await json<MatchEventsResponse>(
      await request("DELETE", `/api/org/matches/${matchId}/events/${last.id}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(undone.events).toHaveLength(6);

    // Otra entrenadora del club no registra en este equipo; la administración sí.
    expect(
      (
        await request("POST", `/api/org/matches/${matchId}/events`, A, {
          cookie: as(coachOtherA),
          body: {
            events: [
              {
                kind: "action",
                actionTypeId: foulTypeId,
                playerId: players[1],
                period: 1,
                clockMs: 800000,
                onCourt: five,
              },
            ],
          },
        })
      ).status,
    ).toBe(403);
    const byAdmin = await json<MatchEventsResponse>(
      await request("POST", `/api/org/matches/${matchId}/events`, A, {
        cookie: as(adminA),
        body: {
          events: [
            {
              kind: "period_end",
              period: 1,
              clockMs: 900000,
              onCourt: [...five.slice(0, 4), players[5]],
            },
          ],
        },
      }),
      201,
    );
    expect(byAdmin.events).toHaveLength(7);
  });

  it("al acabar, el partido no admite eventos y el histórico y la ficha del jugador lo recogen", async () => {
    const finished = await json<{ match: MatchDetailResponse["match"] }>(
      await request("PATCH", `/api/org/matches/${matchId}`, A, {
        cookie: as(coachA),
        body: { status: "finished", clock: { period: 1, elapsedMs: 900000, runningSince: null } },
      }),
      200,
    );
    expect(finished.match.status).toBe("finished");
    expect(finished.match.finishedAt).not.toBeNull();
    expect(
      (
        await request("POST", `/api/org/matches/${matchId}/events`, A, {
          cookie: as(coachA),
          body: { events: [{ kind: "period_start", period: 2, clockMs: 0, onCourt: [] }] },
        })
      ).status,
    ).toBe(409);

    const history = await json<TeamMatchHistoryResponse>(
      await request("GET", `/api/org/teams/${teamId}/matches/history`, A, {
        cookie: as(coachOtherA),
      }),
      200,
    );
    expect(history.matches).toHaveLength(1);
    expect(history.matches[0]!.events).toHaveLength(7);
    expect(history.actionTypes.length).toBeGreaterThan(10);

    // La línea del jugador que marcó: titular, 15 minutos, un gol, +0.
    const lines = await json<PlayerMatchesResponse>(
      await request("GET", `/api/org/players/${players[2]}/matches`, A, { cookie: as(adminA) }),
      200,
    );
    expect(lines.lines).toHaveLength(1);
    expect(lines.lines[0]).toMatchObject({
      starter: true,
      timeMs: 900000,
      plusMinus: 0,
      actions: { goal: 1 },
      rating: 5,
    });
    expect(lines.totals).toMatchObject({ matches: 1, starts: 1 });
    // El sustituido: 10 minutos; el suplente, 5.
    const subbed = await json<PlayerMatchesResponse>(
      await request("GET", `/api/org/players/${players[4]}/matches`, A, { cookie: as(adminA) }),
      200,
    );
    expect(subbed.lines[0]!.timeMs).toBe(600000);
    const bench = await json<PlayerMatchesResponse>(
      await request("GET", `/api/org/players/${players[5]}/matches`, A, { cookie: as(adminA) }),
      200,
    );
    expect(bench.lines[0]).toMatchObject({ starter: false, timeMs: 300000 });
  });

  it("la familia ve la línea de los suyos y nada más", async () => {
    const own = await json<PlayerMatchesResponse>(
      await request("GET", `/api/org/family/players/${players[0]}/matches`, A, {
        cookie: as(guardianA),
      }),
      200,
    );
    expect(own.lines).toHaveLength(1);
    // La parada se deshizo antes: la portera jugó todo el periodo sin acciones.
    expect(own.lines[0]).toMatchObject({
      starter: true,
      timeMs: 900000,
      plusMinus: 0,
      actions: {},
    });
    expect(own.lines[0]!.match.ownScore).toBe(1);
    expect(
      (
        await request("GET", `/api/org/family/players/${players[2]}/matches`, A, {
          cookie: as(guardianA),
        })
      ).status,
    ).toBe(404);
    expect(
      (await request("GET", `/api/org/matches/${matchId}`, A, { cookie: as(guardianA) })).status,
    ).toBe(403);
    expect(
      (await request("GET", `/api/org/players/${players[0]}/matches`, A, { cookie: as(guardianA) }))
        .status,
    ).toBe(403);
  });

  it("nada del club A se ve ni se toca desde el club B", async () => {
    expect(
      (await request("GET", `/api/org/matches/${matchId}`, B, { cookie: as(adminB) })).status,
    ).toBe(404);
    expect(
      (await request("GET", `/api/org/teams/${teamId}/matches`, B, { cookie: as(adminB) })).status,
    ).toBe(404);
    expect(
      (
        await request("GET", `/api/org/sections/${sectionId}/match-config`, B, {
          cookie: as(adminB),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request("POST", `/api/org/matches/${matchId}/events`, B, {
          cookie: as(adminB),
          body: { events: [{ kind: "period_start", period: 2, clockMs: 0, onCourt: [] }] },
        })
      ).status,
    ).toBe(404);
    expect(
      (await request("DELETE", `/api/org/matches/${matchId}`, B, { cookie: as(adminB) })).status,
    ).toBe(404);
    // Y la cookie del club A no vale en el club B.
    expect(
      (await request("GET", `/api/org/matches/${matchId}`, B, { cookie: as(adminA) })).status,
    ).toBe(403);
  });

  it("borrar el partido arrastra convocatoria y eventos", async () => {
    expect(
      (await request("DELETE", `/api/org/matches/${matchId}`, A, { cookie: as(coachOtherA) }))
        .status,
    ).toBe(403);
    expect(
      (await request("DELETE", `/api/org/matches/${matchId}`, A, { cookie: as(coachA) })).status,
    ).toBe(204);
    expect(
      (await request("GET", `/api/org/matches/${matchId}`, A, { cookie: as(coachA) })).status,
    ).toBe(404);
    const lines = await json<PlayerMatchesResponse>(
      await request("GET", `/api/org/players/${players[2]}/matches`, A, { cookie: as(adminA) }),
      200,
    );
    expect(lines.lines).toHaveLength(0);
  });
});

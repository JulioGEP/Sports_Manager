import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Bloque 13 (ADR 0030) contra una base real: personal con cargo, permisos por equipo, ficha para
 * la familia, reto por puntos con validación y aislamiento entre clubes. Si uno falla, la PR no
 * se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8,
]);

type Seeded = { id: string; email: string };

describe("personal con cargo, permisos por equipo, familia y reto", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let coachOtherA: Seeded;
  let physioA: Seeded;
  let delegateA: Seeded;
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
    options: { cookie?: string; body?: unknown; raw?: Uint8Array; contentType?: string } = {},
  ) =>
    app.request(path, {
      method,
      headers: {
        host,
        origin: `https://${host}`,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(options.contentType ? { "content-type": options.contentType } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.raw ? { body: options.raw } : {}),
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
  let otherTeamId = "";
  let playerId = "";
  let otherPlayerId = "";
  let familyCookie = "";
  let challengeId = "";
  let taskId = "";
  let submissionId = "";
  const familyEmail = "familia-reto@club-a.test";

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
    physioA = await user("Fina Fisio", "fina@club-a.test");
    delegateA = await user("Dani Delegado", "dani@club-a.test");
    adminB = await user("Bruno Admin", "bruno@club-b.test");
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, coachOtherA.id, "coach");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    for (const u of [adminA, coachA, coachOtherA, physioA, delegateA, adminB])
      cookies.set(u.email, await signIn(u.email, A));

    // Estructura mínima: una temporada, una sección, dos equipos y un jugador en cada uno.
    const season = await json<{ season: { id: string } }>(
      await request("POST", "/api/org/seasons", A, {
        cookie: as(adminA),
        body: { name: "2026-27", startsOn: "2026-09-01", endsOn: "2027-06-30" },
      }),
      201,
    );
    seasonId = season.season.id;
    const section = await json<{ section: { id: string } }>(
      await request("POST", "/api/org/sections", A, {
        cookie: as(adminA),
        body: { name: "Fútbol sala", sportCode: "futsal", categories: [{ name: "Base" }] },
      }),
      201,
    );
    sectionId = section.section.id;
    const categories = await json<{ categories: { id: string }[] }>(
      await request("GET", `/api/org/categories?section=${section.section.id}`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    const categoryId = categories.categories[0]!.id;
    const team = await json<{ team: { id: string } }>(
      await request("POST", "/api/org/teams", A, {
        cookie: as(adminA),
        body: { sectionId: section.section.id, seasonId, categoryId, name: "Alevín A" },
      }),
      201,
    );
    teamId = team.team.id;
    const other = await json<{ team: { id: string } }>(
      await request("POST", "/api/org/teams", A, {
        cookie: as(adminA),
        body: { sectionId: section.section.id, seasonId, categoryId, name: "Infantil A" },
      }),
      201,
    );
    otherTeamId = other.team.id;
    await json(
      await request("POST", `/api/org/teams/${teamId}/staff`, A, {
        cookie: as(adminA),
        body: { userId: coachA.id },
      }),
      200,
    );
    await json(
      await request("POST", `/api/org/teams/${otherTeamId}/staff`, A, {
        cookie: as(adminA),
        body: { userId: coachOtherA.id },
      }),
      200,
    );
    const player = await json<{ player: { id: string } }>(
      await request("POST", "/api/org/players", A, {
        cookie: as(adminA),
        body: {
          firstName: "Clara",
          lastName: "Martí",
          birthDate: "2015-02-03",
          joinedOn: "2022-09-01",
          teamId,
        },
      }),
      201,
    );
    playerId = player.player.id;
    const otherPlayer = await json<{ player: { id: string } }>(
      await request("POST", "/api/org/players", A, {
        cookie: as(adminA),
        body: { firstName: "Joel", lastName: "Castro", teamId: otherTeamId },
      }),
      201,
    );
    otherPlayerId = otherPlayer.player.id;
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("el personal entra con un cargo y los permisos siguen al cargo", async () => {
    // Invitar personal sin cargo no vale; con cargo, la invitación lo lleva.
    expect(
      (
        await request("POST", "/api/org/invitations", A, {
          cookie: as(adminA),
          body: { email: physioA.email, roleCode: "staff" },
        })
      ).status,
    ).toBe(400);
    const sent = await json<{
      acceptUrl: string | null;
      invitation: { position: string | null; team: { name: string } | null };
    }>(
      await request("POST", "/api/org/invitations", A, {
        cookie: as(adminA),
        body: { email: physioA.email, roleCode: "staff", position: "physio", teamId },
      }),
      201,
    );
    expect(sent.invitation.position).toBe("physio");
    expect(sent.invitation.team?.name).toBe("Alevín A");
    const token = sent.acceptUrl!.split("/invitations/")[1]!;
    const accepted = await request("POST", `/api/invitations/${token}/accept`, A, {
      cookie: as(physioA),
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);

    // El actor lleva el cargo y sus permisos: valora, pero no escribe estructura ni jugadores.
    const me = await json<{
      actor: { roles: string[]; position: string | null; permissions: string[] };
    }>(await request("GET", "/api/org", A, { cookie: as(physioA) }), 200);
    expect(me.actor).toMatchObject({ roles: ["staff"], position: "physio" });
    expect(me.actor.permissions).toContain("org.players.assess");
    expect(me.actor.permissions).not.toContain("org.players.write");
    expect(me.actor.permissions).not.toContain("org.structure.write");

    // Está en el cuerpo técnico del equipo de la invitación y Miembros lo enseña con cargo y equipo.
    const members = await json<{
      members: { email: string; position: string | null; teams: { teamName: string }[] }[];
    }>(await request("GET", "/api/org/members", A, { cookie: as(adminA) }), 200);
    const physio = members.members.find((m) => m.email === physioA.email);
    expect(physio).toMatchObject({ position: "physio", teams: [{ teamName: "Alevín A" }] });

    // La fisio valora el cuerpo de quien atiende: los de su equipo y los que le asignan
    // (Bloque 19). Al del otro equipo no llega hasta que la administración se lo asigna.
    const rated = await json<{ indicators: { dimension: string; score: number }[] }>(
      await request("PUT", `/api/org/players/${playerId}/indicators`, A, {
        cookie: as(physioA),
        body: { body: { score: 40, note: "Molestias en el tobillo" } },
      }),
      200,
    );
    expect(rated.indicators).toMatchObject([{ dimension: "body", score: 40 }]);
    expect(
      (
        await request("PUT", `/api/org/players/${otherPlayerId}/indicators`, A, {
          cookie: as(physioA),
          body: { body: { score: 40 } },
        })
      ).status,
    ).toBe(404);
    await json(
      await request("POST", `/api/org/players/${otherPlayerId}/staff`, A, {
        cookie: as(adminA),
        body: { userId: physioA.id },
      }),
      200,
    );
    expect(
      (
        await request("PUT", `/api/org/players/${otherPlayerId}/indicators`, A, {
          cookie: as(physioA),
          body: { body: { score: 40 } },
        })
      ).status,
    ).toBe(200);
    // No cambia su nombre.
    expect(
      (
        await request("PATCH", `/api/org/players/${otherPlayerId}`, A, {
          cookie: as(physioA),
          body: { firstName: "Otro" },
        })
      ).status,
    ).toBe(403);

    // La administración cambia el cargo a dirección: ahora escribe estructura y jugadores, en
    // las secciones a su cargo (Bloque 19).
    const changed = await json<{ roles: string[]; position: string | null }>(
      await request("POST", `/api/org/members/${physioA.id}/roles`, A, {
        cookie: as(adminA),
        body: { roleCode: "staff", position: "director" },
      }),
      200,
    );
    expect(changed).toMatchObject({ roles: ["staff"], position: "director" });
    await json(
      await request("PUT", `/api/org/members/${physioA.id}/sections`, A, {
        cookie: as(adminA),
        body: { sectionIds: [sectionId] },
      }),
      200,
    );
    expect(
      (
        await request("PATCH", `/api/org/players/${otherPlayerId}`, A, {
          cookie: as(physioA),
          body: { firstName: "Joel" },
        })
      ).status,
    ).toBe(200);

    // Delegación: entra con cargo por asignación directa y solo consulta.
    await seeder.membership(clubA.id, delegateA.id, "staff");
    await json(
      await request("POST", `/api/org/members/${delegateA.id}/roles`, A, {
        cookie: as(adminA),
        body: { roleCode: "staff", position: "delegate" },
      }),
      200,
    );
    const overview = await json<{ players: unknown[]; scope: string }>(
      await request("GET", "/api/org/players/overview", A, { cookie: as(delegateA) }),
      200,
    );
    expect(overview.scope).toBe("club");
    expect(overview.players).toHaveLength(2);
    expect(
      (
        await request("PUT", `/api/org/players/${playerId}/indicators`, A, {
          cookie: as(delegateA),
          body: { sport: { score: 50 } },
        })
      ).status,
    ).toBe(403);
  });

  it("la entrenadora gestiona lo suyo: plantilla y valoraciones de su equipo, no del otro", async () => {
    // Plantilla del equipo propio: sí. Del otro: no.
    expect(
      (
        await request("PATCH", `/api/org/teams/${teamId}/players/${playerId}`, A, {
          cookie: as(coachA),
          body: { shirtNumber: 7, position: "Ala" },
        })
      ).status,
    ).toBe(200);
    // El otro equipo no existe para ella (Bloque 19).
    expect(
      (
        await request("PATCH", `/api/org/teams/${otherTeamId}/players/${otherPlayerId}`, A, {
          cookie: as(coachA),
          body: { shirtNumber: 9 },
        })
      ).status,
    ).toBe(404);
    const detail = await json<{ access: { roster: boolean } }>(
      await request("GET", `/api/org/teams/${teamId}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(detail.access.roster).toBe(true);
    expect(
      (await request("GET", `/api/org/teams/${otherTeamId}`, A, { cookie: as(coachA) })).status,
    ).toBe(404);

    // Valoraciones: su jugador sí, el del otro equipo no.
    expect(
      (
        await request("PUT", `/api/org/players/${playerId}/objective`, A, {
          cookie: as(coachA),
          body: { title: "Conducción con la izquierda", progress: 20 },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("POST", `/api/org/players/${otherPlayerId}/events`, A, {
          cookie: as(coachA),
          body: { text: "No es mi jugador" },
        })
      ).status,
    ).toBe(404);

    // La vista de conjunto en ámbito propio solo trae su equipo.
    const own = await json<{ players: { firstName: string }[]; scope: string }>(
      await request("GET", "/api/org/players/overview?scope=own", A, { cookie: as(coachA) }),
      200,
    );
    expect(own.scope).toBe("own");
    expect(own.players.map((p) => p.firstName)).toEqual(["Clara"]);

    // La fecha de alta manda sobre la creación de la ficha.
    const player = await json<{
      player: { joinedOn: string | null };
      timeline: { kind: string; happenedOn: string }[];
    }>(await request("GET", `/api/org/players/${playerId}`, A, { cookie: as(coachA) }), 200);
    expect(player.player.joinedOn).toBe("2022-09-01");
    expect(player.timeline.at(-1)).toMatchObject({ kind: "joined", happenedOn: "2022-09-01" });
  });

  it("el inicio trae alertas y preparación solo a quien lee jugadores; la actividad, a quien tiene permiso", async () => {
    const summary = await json<{
      operations: { playersWithoutPhoto: number; playersWithoutObjective: number } | null;
      readiness: { total: number; percent: number } | null;
    }>(await request("GET", "/api/org/summary", A, { cookie: as(adminA) }), 200);
    expect(summary.operations).toMatchObject({
      playersWithoutPhoto: 2,
      playersWithoutObjective: 1,
    });
    expect(summary.readiness?.total).toBe(2);
    expect(summary.readiness!.percent).toBeGreaterThan(0);

    // Los movimientos del club son de la administración; el cuerpo técnico no los ve (Bloque 19).
    expect(
      (await request("GET", "/api/org/activity?limit=5", A, { cookie: as(coachA) })).status,
    ).toBe(403);
    const activity = await json<{ entries: { action: string; actorName: string | null }[] }>(
      await request("GET", "/api/org/activity?limit=5", A, { cookie: as(adminA) }),
      200,
    );
    expect(activity.entries.length).toBeGreaterThan(0);
    expect(activity.entries.every((e) => typeof e.action === "string")).toBe(true);

    // El club B no ve la actividad del club A.
    const activityB = await json<{ entries: unknown[] }>(
      await request("GET", "/api/org/activity", B, { cookie: as(adminB) }),
      200,
    );
    expect(activityB.entries).toEqual([]);

    // Filtro de lo que falta: fichas sin objetivo.
    const missing = await json<{
      players: { firstName: string; pendingInvitationsCount: number }[];
    }>(await request("GET", "/api/org/players?missing=objective", A, { cookie: as(adminA) }), 200);
    expect(missing.players.map((p) => p.firstName)).toEqual(["Joel"]);
  });

  it("la familia ve la ficha de los suyos sin indicadores, cambia la foto y nada más", async () => {
    const sent = await json<{ acceptUrl: string | null }>(
      await request("POST", `/api/org/players/${playerId}/guardians/invite`, A, {
        cookie: as(adminA),
        body: { email: familyEmail, relationship: "mother" },
      }),
      201,
    );
    const token = sent.acceptUrl!.split("/invitations/")[1]!;
    const accepted = await request("POST", `/api/invitations/${token}/accept`, A, {
      body: { name: "Laura Martí", password: PASSWORD },
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    familyCookie = cookieOf(accepted);

    // El PDI solo llega compartido; los indicadores y las anotaciones, nunca.
    await json(
      await request("PUT", `/api/org/players/${playerId}/development-plan`, A, {
        cookie: as(coachA),
        body: { technical: "Pase con la izquierda", status: "draft" },
      }),
      200,
    );
    await json(
      await request("POST", `/api/org/players/${playerId}/events`, A, {
        cookie: as(coachA),
        body: { text: "Anotación interna del cuerpo técnico" },
      }),
      201,
    );
    type FamilyDetail = {
      player: { firstName: string; relationship: string; joinedOn: string | null };
      objective: { title: string } | null;
      developmentPlan: { technical: string | null } | null;
      timeline: { kind: string; details: Record<string, unknown> }[];
      teams: { teamName: string; staff: { name: string }[] }[];
    };
    const first = await json<FamilyDetail>(
      await request("GET", `/api/org/family/players/${playerId}`, A, { cookie: familyCookie }),
      200,
    );
    expect(first.player).toMatchObject({ firstName: "Clara", relationship: "mother" });
    expect(first.objective?.title).toBe("Conducción con la izquierda");
    expect(first.developmentPlan).toBeNull();
    expect(first.timeline.some((e) => e.kind === "note")).toBe(false);
    expect(first.timeline.some((e) => e.kind === "indicators_updated")).toBe(false);
    expect(first.teams[0]?.teamName).toBe("Alevín A");
    expect(first.teams[0]?.staff.map((s) => s.name)).toContain("Caro Coach");
    expect(JSON.stringify(first)).not.toContain("Anotación interna");

    await json(
      await request("PUT", `/api/org/players/${playerId}/development-plan`, A, {
        cookie: as(coachA),
        body: { status: "shared" },
      }),
      200,
    );
    const shared = await json<FamilyDetail>(
      await request("GET", `/api/org/family/players/${playerId}`, A, { cookie: familyCookie }),
      200,
    );
    expect(shared.developmentPlan?.technical).toBe("Pase con la izquierda");

    // Otro jugador del club: no es suyo.
    expect(
      (
        await request("GET", `/api/org/family/players/${otherPlayerId}`, A, {
          cookie: familyCookie,
        })
      ).status,
    ).toBe(404);

    // La foto: la familia la sube y la quita; la ficha del personal, no.
    const uploaded = await request("PUT", `/api/org/players/${playerId}/photo`, A, {
      cookie: familyCookie,
      raw: PNG,
      contentType: "image/png",
    });
    expect(uploaded.status, await uploaded.clone().text()).toBe(200);
    const body = (await uploaded.json()) as { player: { photoUrl: string | null } };
    expect(body.player.photoUrl).toContain(`/api/org/players/${playerId}/photo`);
    expect("indicators" in body).toBe(false);
    expect(
      (
        await request("PUT", `/api/org/players/${otherPlayerId}/photo`, A, {
          cookie: familyCookie,
          raw: PNG,
          contentType: "image/png",
        })
      ).status,
    ).toBe(403);
    expect(
      (await request("GET", `/api/org/players/${playerId}`, A, { cookie: familyCookie })).status,
    ).toBe(403);
  });

  it("el reto: catálogo, registro de la familia, validación por equipo y cierre con rastro", async () => {
    // Crear con el catálogo de ejemplo y activar.
    const created = await json<{ challenge: { id: string; tasksCount: number; status: string } }>(
      await request("POST", "/api/org/challenges", A, {
        cookie: as(adminA),
        body: {
          name: "Reto de otoño",
          minPoints: 10,
          targetPoints: 30,
          withDefaultTasks: true,
          status: "active",
        },
      }),
      201,
    );
    challengeId = created.challenge.id;
    expect(created.challenge).toMatchObject({ tasksCount: 10, status: "active" });
    expect(
      (
        await request("POST", "/api/org/challenges", A, {
          cookie: as(adminA),
          body: { name: "Mal", minPoints: 50, targetPoints: 10 },
        })
      ).status,
    ).toBe(400);

    // La entrenadora gestiona el catálogo; la delegación no.
    const withTask = await json<{
      tasks: { id: string; name: string; maxPoints: number | null }[];
    }>(
      await request("POST", `/api/org/challenges/${challengeId}/tasks`, A, {
        cookie: as(coachA),
        body: {
          name: "Entrenamiento completo",
          area: "training",
          kind: "sessions",
          pointsPerUnit: 2,
          maxPoints: 6,
        },
      }),
      201,
    );
    const task = withTask.tasks.find(
      (t) => t.name === "Entrenamiento completo" && t.maxPoints === 6,
    )!;
    taskId = task.id;
    expect(
      (
        await request("POST", `/api/org/challenges/${challengeId}/tasks`, A, {
          cookie: as(delegateA),
          body: { name: "X", area: "habits", kind: "rating", pointsPerUnit: 1 },
        })
      ).status,
    ).toBe(403);

    // La familia registra: los puntos respetan el tope de la prueba (6): 2 sesiones = 4, 3 más = 2.
    type FamilyView = {
      challenge: { id: string } | null;
      totals: { approved: number; pending: number; byArea: { training: number } };
      submissions: { id: string; points: number; status: string }[];
    };
    const firstEntry = await json<FamilyView>(
      await request("POST", `/api/org/family/players/${playerId}/challenge/submissions`, A, {
        cookie: familyCookie,
        body: { taskId, quantity: 2, note: "Vídeo en la carpeta" },
      }),
      201,
    );
    expect(firstEntry.submissions[0]).toMatchObject({ points: 4, status: "submitted" });
    expect(firstEntry.totals).toMatchObject({ approved: 0, pending: 4 });
    submissionId = firstEntry.submissions[0]!.id;
    const second = await json<FamilyView>(
      await request("POST", `/api/org/family/players/${playerId}/challenge/submissions`, A, {
        cookie: familyCookie,
        body: { taskId, quantity: 3 },
      }),
      201,
    );
    expect(second.submissions[0]!.points).toBe(2);
    expect(second.totals.pending).toBe(6);
    // Retira el segundo; no puede registrar por un jugador que no es suyo.
    const withdrawn = await json<FamilyView>(
      await request(
        "DELETE",
        `/api/org/family/players/${playerId}/challenge/submissions/${second.submissions[0]!.id}`,
        A,
        { cookie: familyCookie },
      ),
      200,
    );
    expect(withdrawn.submissions).toHaveLength(1);
    expect(
      (
        await request("POST", `/api/org/family/players/${otherPlayerId}/challenge/submissions`, A, {
          cookie: familyCookie,
          body: { taskId, quantity: 1 },
        })
      ).status,
    ).toBe(404);

    // La familia nunca ve la participación ni la cola de validación.
    expect(
      (
        await request("GET", `/api/org/challenges/${challengeId}/standings`, A, {
          cookie: familyCookie,
        })
      ).status,
    ).toBe(403);
    expect((await request("GET", "/api/org/challenges", A, { cookie: familyCookie })).status).toBe(
      403,
    );

    // Validación por equipo: la entrenadora del otro equipo no ve ni valida este registro.
    const otherQueue = await json<{ submissions: unknown[]; scope: string }>(
      await request("GET", `/api/org/challenges/${challengeId}/submissions?status=submitted`, A, {
        cookie: as(coachOtherA),
      }),
      200,
    );
    expect(otherQueue).toEqual({ submissions: [], scope: "own" });
    expect(
      (
        await request(
          "POST",
          `/api/org/challenges/${challengeId}/submissions/${submissionId}/review`,
          A,
          { cookie: as(coachOtherA), body: { decision: "approved" } },
        )
      ).status,
    ).toBe(403);
    const queue = await json<{
      submissions: { id: string; player: { name: string } }[];
      scope: string;
    }>(
      await request("GET", `/api/org/challenges/${challengeId}/submissions?status=submitted`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(queue.scope).toBe("own");
    expect(queue.submissions.map((s) => s.player.name)).toEqual(["Clara Martí"]);
    const reviewed = await json<{
      submission: { status: string; reviewedBy: { name: string } | null };
    }>(
      await request(
        "POST",
        `/api/org/challenges/${challengeId}/submissions/${submissionId}/review`,
        A,
        {
          cookie: as(coachA),
          body: { decision: "approved" },
        },
      ),
      200,
    );
    expect(reviewed.submission).toMatchObject({
      status: "approved",
      reviewedBy: { name: "Caro Coach" },
    });

    // La familia ve sus puntos aprobados; la administración, la participación del club.
    const family = await json<FamilyView>(
      await request("GET", `/api/org/family/players/${playerId}/challenge`, A, {
        cookie: familyCookie,
      }),
      200,
    );
    expect(family.totals).toMatchObject({ approved: 4, pending: 0, byArea: { training: 4 } });
    const standings = await json<{
      standings: { player: { name: string }; totals: { approved: number }; reachedMin: boolean }[];
      scope: string;
    }>(
      await request("GET", `/api/org/challenges/${challengeId}/standings`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    expect(standings.scope).toBe("club");
    expect(standings.standings).toMatchObject([
      { player: { name: "Clara Martí" }, totals: { approved: 4 }, reachedMin: false },
    ]);

    // Una prueba con registros se archiva en vez de borrarse; el resumen cuenta pendientes.
    const removed = await json<{ tasks: { id: string; status: string }[] }>(
      await request("DELETE", `/api/org/challenges/${challengeId}/tasks/${taskId}`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    expect(removed.tasks.find((t) => t.id === taskId)?.status).toBe("archived");

    // Cerrar deja rastro en el timeline y no admite más registros.
    await json(
      await request("PATCH", `/api/org/challenges/${challengeId}`, A, {
        cookie: as(adminA),
        body: { status: "closed" },
      }),
      200,
    );
    const timeline = await json<{ timeline: { kind: string; details: Record<string, unknown> }[] }>(
      await request("GET", `/api/org/players/${playerId}`, A, { cookie: as(adminA) }),
      200,
    );
    expect(timeline.timeline[0]).toMatchObject({
      kind: "challenge_closed",
      details: { challenge: "Reto de otoño", points: 4 },
    });
    const afterClose = await json<FamilyView>(
      await request("GET", `/api/org/family/players/${playerId}/challenge`, A, {
        cookie: familyCookie,
      }),
      200,
    );
    expect(afterClose.challenge).toBeNull();
    expect(
      (
        await request("PATCH", `/api/org/challenges/${challengeId}`, A, {
          cookie: as(adminA),
          body: { status: "active" },
        })
      ).status,
    ).toBe(409);
  });

  it("otro club no ve el reto ni por id", async () => {
    expect(
      (await request("GET", `/api/org/challenges/${challengeId}`, B, { cookie: as(adminB) }))
        .status,
    ).toBe(404);
    const listB = await json<{ challenges: unknown[] }>(
      await request("GET", "/api/org/challenges", B, { cookie: as(adminB) }),
      200,
    );
    expect(listB.challenges).toEqual([]);
    expect(
      (
        await request("POST", `/api/org/challenges/${challengeId}/tasks`, B, {
          cookie: as(adminB),
          body: { name: "Intrusa", area: "habits", kind: "rating", pointsPerUnit: 1 },
        })
      ).status,
    ).toBe(404);
  });
});

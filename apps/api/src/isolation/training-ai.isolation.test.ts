import { NetlifyDB } from "@netlify/database-dev";
import {
  addDays,
  type AiApplyResponse,
  type AiDraftConfigResponse,
  type AiGenerationResponse,
  type AiProposalOutput,
  type PlatformAiResponse,
  type SessionDetailResponse,
  type TrainingConfigResponse,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import {
  createDataLayer,
  createFakeModel,
  createMemoryBlobStore,
  NO_USAGE,
  type DataLayer,
} from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";
import { signGeneration, verifyGeneration } from "../services/ai-drafts.ts";

/**
 * Propuesta de sesión con IA (ADR 0044) contra una base real y un modelo falso: el formulario con
 * el perfil de la sección, la petición sin datos personales, la validación, aplicar a las
 * sesiones, la cuota semanal por club (que no gasta lo que falla), el material de la sección, la
 * plataforma y el aislamiento entre equipos y clubes.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

type Seeded = { id: string; email: string };

/** Lo que "responde el modelo": una sesión con una tarea de la biblioteca y una nueva. */
function proposalFor(user: string): AiProposalOutput {
  const sessions = [...user.matchAll(/"ref":"(S\d+)"/g)].map((m) => m[1]!);
  return {
    summary: "Semana para salir de la presión.",
    sessions: sessions.map((ref) => ({
      session: ref,
      objective: "Salida de presión",
      targetRpe: 6,
      contents: ["C1"],
      rationale: "Perdemos muchos balones en el inicio.",
      equipment: ["Petos"],
      warnings: [],
      blocks: [
        {
          block: "warmup",
          items: [
            {
              drill: null,
              title: "Rondo de activación",
              minutes: 15,
              sets: null,
              reps: null,
              restSec: null,
              targetRpe: 4,
              group: null,
              players: null,
              contents: [],
              notes: "Dos rondos 4x1 con dos toques.",
              newDrill: {
                description: "Rondo en cuadrado de 8x8 con dos defensores.",
                rules: "Dos toques.",
                coachingPoints: "Perfilarse antes de recibir.",
                variants: null,
                format: "4x1",
                space: "8x8",
                playersMin: 5,
                playersMax: 10,
                material: "Conos",
                restrictionTags: ["contact"],
              },
            },
          ],
        },
        {
          block: "main",
          items: [
            {
              drill: "T1",
              title: "Tarea de la biblioteca",
              minutes: 25,
              sets: 3,
              reps: null,
              restSec: 60,
              targetRpe: 7,
              group: null,
              players: ["J1", "J2", "J3", "J4"],
              contents: ["C1"],
              notes: "Salida en 4x3.",
              newDrill: null,
            },
          ],
        },
      ],
    })),
  };
}

describe("propuesta de sesión con IA", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let bare: DataLayer;
  let app: App;
  let appWithoutAi: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let coachOtherA: Seeded;
  let adminB: Seeded;
  let root: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");
  const model = createFakeModel((request) =>
    request.user.includes("falla")
      ? { kind: "error", failure: "model_error", message: "caído" }
      : {
          kind: "ok",
          model: "claude-opus-5-5",
          text: JSON.stringify(proposalFor(request.user)),
          usage: { ...NO_USAGE, inputTokens: 20_000, outputTokens: 8_000 },
        },
  );

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
  const request = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    host: string,
    options: { cookie?: string; body?: unknown; via?: App } = {},
  ) =>
    (options.via ?? app).request(path, {
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
  let team1 = "";
  let team2 = "";
  const players: string[] = [];
  let plannedEvent = "";
  let freeEvent = "";
  let otherTeamEvent = "";
  let firstGeneration = "";

  const emphasis = {
    technical: 20,
    tactical: 50,
    physical: 20,
    set_piece: 10,
    goalkeeper: 0,
    psychological: 0,
  };
  const ask = (cookie: string, body: Record<string, unknown>, team = team1) =>
    request("POST", `/api/org/teams/${team}/ai-drafts`, A, {
      cookie,
      body: { intensity: "medium", emphasis, ...body },
    });

  beforeAll(async () => {
    local = new NetlifyDB();
    const connectionString = await local.start();
    await local.applyMigrations(
      new URL("../../../../netlify/database/migrations", import.meta.url).pathname,
    );
    const env = {
      NODE_ENV: "test",
      APP_BASE_DOMAIN: BASE,
      TENANT_FALLBACK_SLUG: "demo",
      TENANT_ROUTING: "subdomain",
      EMAIL_TRANSPORT: "outbox",
      PLATFORM_ADMIN_EMAILS: "root@plataforma.test",
    };
    const config = loadConfig({ ...env, ANTHROPIC_API_KEY: "clave-de-prueba" });
    expect(config.ai.runner).toBe("inline");
    data = createDataLayer({
      config,
      connectionString,
      photoStore: createMemoryBlobStore(),
      audioStore: createMemoryBlobStore(),
      aiModel: model,
    });
    app = createApp({ config, data });
    const configWithoutAi = loadConfig(env);
    bare = createDataLayer({ config: configWithoutAi, connectionString });
    appWithoutAi = createApp({ config: configWithoutAi, data: bare });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
    const user = (name: string, email: string) => seeder.user({ name, email, password: PASSWORD });
    adminA = await user("Ana Admin", "ana@club-a.test");
    coachA = await user("Caro Coach", "caro@club-a.test");
    coachOtherA = await user("Oti Otra", "oti@club-a.test");
    adminB = await user("Bruno Admin", "bruno@club-b.test");
    root = await user("Root", "root@plataforma.test");
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, coachOtherA.id, "coach");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    for (const u of [adminA, coachA, coachOtherA, root])
      cookies.set(u.email, await signIn(u.email, A));
    cookies.set(adminB.email, await signIn(adminB.email, B));

    const season = await seeder.season(clubA.id, {
      name: "2026-27",
      startsOn: addDays(today, -60),
      endsOn: addDays(today, 200),
    });
    sectionId = (await seeder.section(clubA.id, "Fútbol sala")).id;
    const category = await seeder.category(clubA.id, sectionId, "Sénior");
    const team = (name: string) =>
      seeder.team(clubA.id, { sectionId, categoryId: category.id, seasonId: season.id, name });
    team1 = (await team("Sénior A")).id;
    team2 = (await team("Sénior B")).id;
    for (const [i, first] of ["Iván", "Raúl", "Kike", "Toni"].entries()) {
      const person = await seeder.person(clubA.id, {
        firstName: first,
        lastName: `Pérez${i}`,
        birthDate: "1997-05-10",
      });
      const player = await seeder.player(clubA.id, person.id);
      await seeder.rosterAdd(clubA.id, team1, player.id, i + 1);
      players.push(player.id);
    }
    await seeder.teamStaff(clubA.id, team1, coachA.id, "head_coach");
    await seeder.teamStaff(clubA.id, team2, coachOtherA.id, "head_coach");

    // La sección con su catálogo y su biblioteca de arranque; un jugador sin contacto.
    await json<TrainingConfigResponse>(
      await request("GET", `/api/org/sections/${sectionId}/training-config`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    await json(
      await request("PUT", `/api/org/players/${players[1]}/availability`, A, {
        cookie: as(adminA),
        body: { status: "limited", restrictions: ["contact"], maxMinutes: 30 },
      }),
      200,
    );
    // Dos entrenamientos: uno ya planificado y otro que se queda sin sesión.
    const session = async (date: string, team = team1, cookie = as(coachA)) =>
      json<SessionDetailResponse>(
        await request("POST", `/api/org/teams/${team}/sessions`, A, {
          cookie,
          body: { date, startsAt: "20:00", minutes: 90, objective: "Lo de Iván" },
        }),
        201,
      );
    const planned = await session(addDays(today, 1));
    plannedEvent = planned.session.eventId;
    await json(
      await request("PUT", `/api/org/sessions/${planned.session.id}/blocks/main`, A, {
        cookie: as(coachA),
        body: { items: [{ title: "Lo de antes", minutes: 30 }] },
      }),
      200,
    );
    const free = await session(addDays(today, 2));
    freeEvent = free.session.eventId;
    expect(
      (await request("DELETE", `/api/org/sessions/${free.session.id}`, A, { cookie: as(coachA) }))
        .status,
    ).toBe(204);
    otherTeamEvent = (await session(addDays(today, 1), team2, as(coachOtherA))).session.eventId;
  });

  afterAll(async () => {
    await data?.close();
    await bare?.close();
    await local?.stop();
  });

  it("sin token del proveedor no se puede pedir", async () => {
    const cfg = await json<AiDraftConfigResponse>(
      await request("GET", `/api/org/teams/${team1}/ai-config`, A, {
        cookie: as(coachA),
        via: appWithoutAi,
      }),
      200,
    );
    expect(cfg.available).toBe(false);
    expect(cfg.configured).toBe(false);
    const res = await request("POST", `/api/org/teams/${team1}/ai-drafts`, A, {
      cookie: as(coachA),
      body: { eventIds: [freeEvent], intensity: "medium", emphasis },
      via: appWithoutAi,
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ai_unavailable");
  });

  it("el formulario trae el perfil de la sección, la cuota, el material y la semana", async () => {
    const cfg = await json<AiDraftConfigResponse>(
      await request("GET", `/api/org/teams/${team1}/ai-config?date=${addDays(today, 1)}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(cfg.available).toBe(true);
    expect(cfg.profile.code).toBe("team_performance");
    expect(cfg.profile.axes.map((a) => a.code)).toContain("goalkeeper");
    expect(Object.values(cfg.profile.defaultEmphasis).reduce((a, n) => a + n, 0)).toBe(100);
    expect(cfg.quota).toMatchObject({ limit: 5, used: 0, remaining: 5 });
    expect(cfg.week.events.map((e) => e.id)).toContain(plannedEvent);
    expect(cfg.access.request).toBe(true);
    // Fuera del ámbito, el equipo no existe.
    for (const [cookie, host] of [
      [as(coachOtherA), A],
      [cookies.get(adminB.email)!, B],
    ] as const)
      expect(
        (await request("GET", `/api/org/teams/${team1}/ai-config`, host, { cookie })).status,
      ).toBe(404);
  });

  it("pide la propuesta sin datos personales y la valida contra la plantilla", async () => {
    const res = await json<AiGenerationResponse>(
      await ask(as(coachA), {
        eventIds: [plannedEvent, freeEvent],
        objective: "Salir de la presión",
        context: "Iván viene tocado y Raúl Pérez1 vuelve",
      }),
      201,
    );
    firstGeneration = res.generation.id;
    expect(res.generation.status).toBe("ready");
    expect(res.generation.profile.code).toBe("team_performance");
    const prompt = model.requests.at(-1)!;
    const sent = `${prompt.system}\n${prompt.user}`;
    for (const secret of ["Iván", "Raúl", "Pérez", ...players]) expect(sent).not.toContain(secret);
    expect(prompt.user).toContain("J1 viene tocado y J2 vuelve");
    expect(prompt.user).toContain('"ref":"T1"');
    expect(prompt.model).toBe("claude-opus-5-5");

    const proposal = res.generation.proposal!;
    expect(proposal.sessions.map((s) => s.eventId)).toEqual([plannedEvent, freeEvent]);
    const main = proposal.sessions[0]!.blocks.find((b) => b.block === "main")!;
    expect(main.items[0]!.drillId).toBe(res.lookups.drills[0]!.id);
    expect(main.items[0]!.playerIds).toEqual(players);
    // El limitado sin contacto, en tareas con contacto y pasado de minutos.
    const checks = proposal.sessions[0]!.checks;
    expect(checks.some((c) => c.code === "restriction" && c.playerId === players[1])).toBe(true);
    expect(checks.some((c) => c.code === "max_minutes" && c.playerId === players[1])).toBe(true);
    expect(res.generation.planned).toEqual([expect.objectContaining({ eventId: plannedEvent })]);
    expect(res.access.apply).toBe(true);
    expect(res.lookups.players.map((p) => p.name)).toContain("Iván Pérez0");
  });

  it("solo quien planifica el equipo la pide y solo con sus entrenamientos y sus ejes", async () => {
    expect((await ask(as(coachOtherA), { eventIds: [freeEvent] })).status).toBe(404);
    expect((await ask(as(coachA), { eventIds: [otherTeamEvent] })).status).toBe(400);
    expect(
      (await ask(as(coachA), { eventIds: [freeEvent], emphasis: { metcon: 100 } })).status,
    ).toBe(400);
    expect(
      (await ask(as(coachA), { eventIds: [freeEvent], emphasis: { technical: 50 } })).status,
    ).toBe(400);
    expect(
      (
        await request("GET", `/api/org/ai-drafts/${firstGeneration}`, A, {
          cookie: as(coachOtherA),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request("GET", `/api/org/ai-drafts/${firstGeneration}`, B, {
          cookie: cookies.get(adminB.email)!,
        })
      ).status,
    ).toBe(404);
  });

  it("aplicar crea la sesión que falta, sustituye los bloques propuestos y guarda las tareas nuevas", async () => {
    expect(
      (
        await request("POST", `/api/org/ai-drafts/${firstGeneration}/apply`, A, {
          cookie: as(coachOtherA),
          body: {},
        })
      ).status,
    ).toBe(404);
    const applied = await json<AiApplyResponse>(
      await request("POST", `/api/org/ai-drafts/${firstGeneration}/apply`, A, {
        cookie: as(coachA),
        body: { saveNewDrills: true },
      }),
      200,
    );
    expect(applied.sessions.map((s) => s.eventId)).toEqual([plannedEvent, freeEvent]);
    expect(applied.drillsCreated).toBe(1);
    const created = await json<SessionDetailResponse>(
      await request("GET", `/api/org/sessions/${applied.sessions[1]!.sessionId}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(created.session.status).toBe("draft");
    expect(created.session.objective).toBe("Salida de presión");
    expect(created.items.map((i) => [i.block, i.fromAi])).toEqual([
      ["warmup", true],
      ["main", true],
    ]);
    expect(created.items[0]!.drillId).not.toBeNull();
    expect(created.items[0]!.restrictionTags).toEqual(["contact"]);
    const replaced = await json<SessionDetailResponse>(
      await request("GET", `/api/org/sessions/${applied.sessions[0]!.sessionId}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(replaced.items.map((i) => i.title)).not.toContain("Lo de antes");
  });

  it("la cuota es por club y semana, la fija la plataforma y lo que falla no gasta", async () => {
    const rootCookie = as(root);
    expect(
      (
        await request("PUT", `/api/platform/organizations/club-a/ai`, A, {
          cookie: as(adminA),
          body: { weeklyQuota: 2 },
        })
      ).status,
    ).toBe(403);
    await json<PlatformAiResponse>(
      await request("PUT", `/api/platform/organizations/club-a/ai`, A, {
        cookie: rootCookie,
        body: { weeklyQuota: 2 },
      }),
      200,
    );
    const failed = await json<AiGenerationResponse>(
      await ask(as(coachA), { eventIds: [freeEvent], objective: "Esto falla" }),
      201,
    );
    expect(failed.generation).toMatchObject({ status: "failed", failure: "model_error" });
    await json(await ask(as(coachA), { eventIds: [freeEvent] }), 201);
    const over = await ask(as(coachA), { eventIds: [freeEvent] });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe("quota_exceeded");
    const cfg = await json<AiDraftConfigResponse>(
      await request("GET", `/api/org/teams/${team1}/ai-config`, A, { cookie: as(coachA) }),
      200,
    );
    expect(cfg.quota).toMatchObject({ limit: 2, used: 2, remaining: 0 });
    expect(cfg.recent.map((r) => r.status)).toEqual(["ready", "failed", "ready"]);

    const stats = await json<PlatformAiResponse>(
      await request("GET", `/api/platform/organizations/club-a/ai`, A, { cookie: rootCookie }),
      200,
    );
    expect(stats).toMatchObject({ weeklyQuota: 2, week: { used: 2 } });
    expect(stats.last30).toMatchObject({ requests: 3, failed: 1, applied: 1, keptShare: 1 });
    expect(stats.last30.costUsd).toBeGreaterThan(0);
    // Otro club no comparte la cuota.
    const otherClub = await json<PlatformAiResponse>(
      await request("GET", `/api/platform/organizations/club-b/ai`, A, { cookie: rootCookie }),
      200,
    );
    expect(otherClub).toMatchObject({ weeklyQuota: 5, week: { used: 0 } });
  });

  it("el material de la sección: lo edita la biblioteca, no el entrenador, y nadie de otro club", async () => {
    const created = await json<{ equipment: { id: string } }>(
      await request("POST", `/api/org/sections/${sectionId}/equipment`, A, {
        cookie: as(adminA),
        body: { name: "Balones", quantity: 12 },
      }),
      201,
    );
    expect(
      (
        await request("POST", `/api/org/sections/${sectionId}/equipment`, A, {
          cookie: as(adminA),
          body: { name: "Balones" },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("POST", `/api/org/sections/${sectionId}/equipment`, A, {
          cookie: as(coachA),
          body: { name: "Conos" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "DELETE",
          `/api/org/sections/${sectionId}/equipment/${created.equipment.id}`,
          B,
          {
            cookie: cookies.get(adminB.email)!,
          },
        )
      ).status,
    ).toBe(404);
    const cfg = await json<TrainingConfigResponse>(
      await request("GET", `/api/org/sections/${sectionId}/training-config`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(cfg.equipment).toEqual([
      { id: created.equipment.id, name: "Balones", quantity: 12, notes: null },
    ]);
    expect(
      (
        await request(
          "DELETE",
          `/api/org/sections/${sectionId}/equipment/${created.equipment.id}`,
          A,
          {
            cookie: as(adminA),
          },
        )
      ).status,
    ).toBe(204);
  });

  it("solo la API puede encargar una propuesta al trabajo en segundo plano", () => {
    const signature = signGeneration("secreto", firstGeneration);
    expect(verifyGeneration("secreto", firstGeneration, signature)).toBe(true);
    expect(verifyGeneration("otro", firstGeneration, signature)).toBe(false);
    expect(verifyGeneration("secreto", firstGeneration, "00")).toBe(false);
  });
});

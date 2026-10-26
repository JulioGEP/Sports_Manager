import { NetlifyDB } from "@netlify/database-dev";
import {
  addDays,
  type AiWodGenerationResponse,
  type AiWodOutput,
  type WorkoutBlockInput,
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

/**
 * Propuesta de WOD con IA (ADR 0049) contra una base real y un modelo falso: el coach de las clases
 * la pide para un día, se genera con lo programado alrededor y sin nombres de atletas, se valida con
 * el formato del editor y se guarda como un WOD más. Gasta la cuota semanal del club (no lo que
 * falla), un coach sin clases en la disciplina no la pide y otro club no la ve.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

type Seeded = { id: string; email: string };

/** Lo que "responde el modelo": calentamiento, fuerza con porcentaje y un WOD por tiempo. */
const wod: AiWodOutput = {
  title: "Motor y pierna",
  notes: "Motor largo tras el día de sentadilla.",
  blocks: [
    {
      kind: "warmup",
      title: "Calentamiento",
      description: "3 rondas\n200 m remo\n10 air squats",
      scoreType: "none",
      timeCapSeconds: null,
      movementCode: null,
      percent: null,
      rmReps: null,
      scaled: null,
      rx: null,
      rxPlus: null,
    },
    {
      kind: "strength",
      title: "Front squat",
      description: "5x3 al 75 %",
      scoreType: "load",
      timeCapSeconds: null,
      movementCode: "front_squat",
      percent: 75,
      rmReps: null,
      scaled: null,
      rx: null,
      rxPlus: null,
    },
    {
      kind: "wod",
      title: "Engine",
      description: "For time\n30 cal bike\n30 wall balls\n30 cal bike",
      scoreType: "time",
      timeCapSeconds: 900,
      movementCode: null,
      percent: null,
      rmReps: null,
      scaled: "Wall ball 6/4 kg",
      rx: "Wall ball 9/6 kg",
      rxPlus: "Wall ball 12/9 kg",
    },
  ],
};

describe("propuesta de WOD con IA", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let bare: DataLayer;
  let app: App;
  let appWithoutAi: App;
  let seeder: ReturnType<typeof createSeeder>;
  let ownerA: Seeded;
  let coachA: Seeded;
  let otherCoachA: Seeded;
  let ownerB: Seeded;
  let root: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("box-a");
  const B = hostOf("box-b");
  const model = createFakeModel((request) =>
    request.user.includes("falla")
      ? { kind: "error", failure: "model_error", message: "caído" }
      : {
          kind: "ok",
          model: "claude-opus-5-5",
          text: request.user.includes("basura") ? '{"title":"Nada"}' : JSON.stringify(wod),
          usage: { ...NO_USAGE, inputTokens: 6_000, outputTokens: 2_000 },
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

  let sectionA = "";
  let sectionB = "";
  let wodType = "";
  let typeB = "";
  let firstId = "";
  const tomorrow = addDays(today, 1);
  const ask = (who: Seeded, body: Record<string, unknown>, via?: App) =>
    request("POST", "/api/org/ai-wods", A, {
      cookie: as(who),
      body: { sectionId: sectionA, teamId: wodType, onDate: tomorrow, ...body },
      ...(via ? { via } : {}),
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
    };
    const config = loadConfig({ ...env, ANTHROPIC_API_KEY: "clave-de-prueba" });
    expect(config.ai.runner).toBe("inline");
    data = createDataLayer({
      config,
      connectionString,
      photoStore: createMemoryBlobStore(),
      aiModel: model,
    });
    app = createApp({ config, data });
    const configWithoutAi = loadConfig(env);
    bare = createDataLayer({ config: configWithoutAi, connectionString });
    appWithoutAi = createApp({ config: configWithoutAi, data: bare });
    seeder = createSeeder(connectionString);

    const clubA = await seeder.organization({ slug: "box-a", name: "Box A" });
    const clubB = await seeder.organization({ slug: "box-b", name: "Box B" });
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
    for (const u of [ownerA, coachA, otherCoachA]) cookies.set(u.email, await signIn(u.email, A));
    cookies.set(ownerB.email, await signIn(ownerB.email, B));
    cookies.set(root.email, await signIn(root.email, BASE));

    for (const club of [clubA, clubB])
      await seeder.season(club.id, {
        name: "2026-27",
        startsOn: addDays(today, -60),
        endsOn: addDays(today, 200),
      });
    sectionA = (await seeder.section(clubA.id, "CrossFit", "crossfit", "activity")).id;
    sectionB = (await seeder.section(clubB.id, "CrossFit", "crossfit", "activity")).id;
    // Una atleta del box: su nombre no puede llegar al modelo.
    await seeder.player(
      clubA.id,
      (await seeder.person(clubA.id, { firstName: "Marta", lastName: "Roig" })).id,
    );

    type ClassType = { classType: { teamId: string } };
    wodType = (
      await json<ClassType>(
        await request("POST", "/api/org/class-types", A, {
          cookie: as(ownerA),
          body: { sectionId: sectionA, name: "WOD", capacity: 12 },
        }),
        201,
      )
    ).classType.teamId;
    // El coach da la clase: entra en su cuerpo técnico y programa en la disciplina.
    const day = new Date(`${tomorrow}T12:00:00Z`).getUTCDay();
    await json(
      await request("PUT", `/api/org/class-types/${wodType}/schedule`, A, {
        cookie: as(ownerA),
        body: {
          slots: [
            {
              weekday: day === 0 ? 7 : day,
              startsAt: "07:00",
              endsAt: "08:00",
              coachUserId: coachA.id,
            },
          ],
        },
      }),
      200,
    );
    typeB = (
      await json<ClassType>(
        await request("POST", "/api/org/class-types", B, {
          cookie: as(ownerB),
          body: { sectionId: sectionB, name: "WOD" },
        }),
        201,
      )
    ).classType.teamId;
    // Lo de ayer, para que el modelo no lo repita.
    await json(
      await request("POST", "/api/org/workouts", A, {
        cookie: as(ownerA),
        body: {
          sectionId: sectionA,
          onDate: addDays(today, -1),
          title: "Back squat day",
          status: "published",
          blocks: [
            {
              kind: "strength",
              title: "Back squat 5x5",
              scoreType: "load",
              movementCode: "back_squat",
            },
          ],
        },
      }),
      201,
    );
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await bare?.close();
    await local?.stop();
  });

  it("el coach de las clases la pide, se genera sin nombres y se guarda como un WOD", async () => {
    const asked = await json<AiWodGenerationResponse>(
      await ask(coachA, { focus: "Motor largo; Marta Roig vuelve de lesión", durationMinutes: 60 }),
      201,
    );
    firstId = asked.generation.id;
    expect(asked.generation).toMatchObject({
      status: "ready",
      failure: null,
      onDate: tomorrow,
      section: { id: sectionA, name: "CrossFit" },
      team: { id: wodType, name: "WOD" },
      quota: { limit: 5, used: 1, remaining: 4 },
    });
    expect(asked.generation.proposal?.title).toBe("Motor y pierna");
    expect(asked.generation.proposal?.blocks.map((b) => b.kind)).toEqual([
      "warmup",
      "strength",
      "wod",
    ]);

    // Lo que vio el modelo: el día, lo de ayer y el foco, sin el nombre de la atleta.
    const sent = model.requests.at(-1)!;
    expect(sent.system).toContain("castellano");
    expect(sent.user).toContain("Back squat day");
    expect(sent.user).toContain("Tipo de clase: WOD");
    expect(sent.user).toContain("[atleta] vuelve de lesión");
    expect(sent.user).not.toMatch(/Marta|Roig/);

    const read = await json<AiWodGenerationResponse>(
      await request("GET", `/api/org/ai-wods/${firstId}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(read.generation.proposal).toEqual(asked.generation.proposal);

    // El coach la guarda tal cual: es un WOD válido para el editor.
    const proposal = asked.generation.proposal!;
    await json(
      await request("POST", "/api/org/workouts", A, {
        cookie: as(coachA),
        body: {
          sectionId: sectionA,
          teamId: wodType,
          onDate: tomorrow,
          title: proposal.title,
          notes: proposal.notes,
          status: "draft",
          blocks: proposal.blocks satisfies WorkoutBlockInput[],
        },
      }),
      201,
    );
  });

  it("quien no programa la disciplina, lo que no es del box o sin IA, no", async () => {
    expect((await ask(otherCoachA, {})).status).toBe(403);
    expect((await ask(coachA, { sectionId: sectionB, teamId: null })).status).toBe(400);
    expect((await ask(coachA, { teamId: typeB })).status).toBe(400);
    const unavailable = await ask(coachA, {}, appWithoutAi);
    expect(unavailable.status).toBe(503);
    expect(((await unavailable.json()) as { error: { code: string } }).error.code).toBe(
      "ai_unavailable",
    );
    // Sin tipo de clase vale para toda la disciplina.
    const whole = await json<AiWodGenerationResponse>(await ask(ownerA, { teamId: null }), 201);
    expect(whole.generation).toMatchObject({ status: "ready", team: null });
  });

  it("lo que falla no gasta cuota; gastada la cuota, espera a la semana siguiente", async () => {
    const failed = await json<AiWodGenerationResponse>(
      await ask(coachA, { focus: "Esto falla" }),
      201,
    );
    expect(failed.generation).toMatchObject({
      status: "failed",
      failure: "model_error",
      proposal: null,
      quota: { used: 2 },
    });
    const invalid = await json<AiWodGenerationResponse>(
      await ask(coachA, { focus: "Devuelve basura" }),
      201,
    );
    expect(invalid.generation).toMatchObject({ status: "failed", failure: "invalid_output" });

    // La cuota es la de toda la IA del club.
    await json(
      await request("PUT", "/api/platform/organizations/box-a/ai", BASE, {
        cookie: as(root),
        body: { weeklyQuota: 3 },
      }),
      200,
    );
    await json(await ask(coachA, {}), 201);
    const over = await ask(coachA, {});
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe("quota_exceeded");
  });

  it("otro club no la ve, y no se lee como una propuesta de sesiones", async () => {
    expect(
      (await request("GET", `/api/org/ai-wods/${firstId}`, B, { cookie: as(ownerB) })).status,
    ).toBe(404);
    expect([401, 403]).toContain(
      (await request("GET", `/api/org/ai-wods/${firstId}`, A, { cookie: as(ownerB) })).status,
    );
    expect(
      (await request("GET", `/api/org/ai-drafts/${firstId}`, A, { cookie: as(ownerA) })).status,
    ).toBe(404);
    // Un coach sin clases en la disciplina tampoco la lee.
    expect(
      (await request("GET", `/api/org/ai-wods/${firstId}`, A, { cookie: as(otherCoachA) })).status,
    ).toBe(404);
  });
});

import { NetlifyDB } from "@netlify/database-dev";
import {
  addDays,
  weekStartOf,
  type AiArchitectOutput,
  type AiCopilotOutput,
  type AiPlanGenerationResponse,
  type AiWeekOutput,
  type EquipmentResponse,
  type MyCycleResponse,
  type PlanHealthResponse,
  type PlanResponse,
  type PlanReviewResponse,
  type PlanWeekResponse,
  type PlanningContextResponse,
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
 * Planificación del box (ADR 0052) contra una base real y un modelo falso: el material, el plan con
 * su estructura y su proyección, la semana con su validación, los borradores sin IA, la IA del plan
 * (arquitecto, semana y copiloto) que nunca publica sola, la revisión, la salud y lo que ve el
 * atleta. Un coach sin clases en la disciplina no planifica y otro club no ve nada.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const monday = weekStartOf(today);

type Seeded = { id: string; email: string };

const architect: AiArchitectOutput = {
  templateCode: "strength_base",
  name: "Fuerza de primavera",
  weeks: 8,
  emphasis: {
    strength: 45,
    weightlifting: 15,
    gymnastics: 15,
    engine: 15,
    intensity: 5,
    mobility: 5,
  },
  phases: [
    { kind: "test", weeks: 1, focus: "Marcas de partida" },
    { kind: "base", weeks: 3, focus: "Volumen en sentadilla" },
    { kind: "deload", weeks: 1, focus: null },
    { kind: "build", weeks: 3, focus: "Intensidad" },
  ],
  tests: ["back_squat", "deadlift"],
  rationale: "Más fuerza para quien viene tres días.",
};

const session = (date: string, title: string) => ({
  date,
  title,
  intentFeel: "Sin parar más de 5 segundos.",
  why: ["Equilibrio con la semana."],
  blocks: [
    {
      kind: "warmup",
      track: "class",
      capacity: "mobility",
      title: "Calentamiento",
      description: "2 rondas",
      scoreType: "none",
      timeCapSeconds: null,
      plannedMinutes: 12,
      movementCode: null,
      percent: null,
      rmReps: null,
      exercises: [],
      foundations: null,
      scaled: null,
      rx: null,
      rxPlus: null,
    },
    {
      kind: "wod",
      track: "class",
      capacity: "engine",
      title: "Engine",
      description: "For time\n30 cal bike\n30 wall balls",
      scoreType: "time",
      timeCapSeconds: 900,
      plannedMinutes: 15,
      movementCode: null,
      percent: null,
      rmReps: null,
      exercises: [],
      foundations: "15 cal / 15 wall balls",
      scaled: "Wall ball 6/4 kg",
      rx: "Wall ball 9/6 kg",
      rxPlus: "Wall ball 12/9 kg",
    },
  ],
});

describe("planificación del box", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let ownerA: Seeded;
  let coachA: Seeded;
  let otherCoachA: Seeded;
  let ownerB: Seeded;
  let marta: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("box-a");
  const B = hostOf("box-b");
  const model = createFakeModel((request) => {
    let output: unknown;
    if (request.system.includes("planificador")) output = architect;
    else if (request.system.includes("copiloto")) {
      const days = [...request.user.matchAll(/^- (\d{4}-\d{2}-\d{2}) \(semana/gm)].map(
        (m) => m[1]!,
      );
      const future = days.filter((d) => d > today);
      const copilot: AiCopilotOutput = {
        reply: "Cambio el WOD del día y dejo una nota.",
        changes: [
          {
            op: "update",
            date: future[0] ?? today,
            toDate: null,
            before: "WOD por escribir",
            after: "Engine con bici",
            why: "No hay remos.",
            session: session(future[0] ?? today, "Sin remos"),
          },
          {
            op: "note",
            date: today,
            toDate: null,
            before: "",
            after: "",
            why: "Aviso",
            session: null,
          },
          // Fuera del plan: se descarta.
          {
            op: "clear",
            date: "2020-01-01",
            toDate: null,
            before: "",
            after: "",
            why: "",
            session: null,
          },
        ],
      };
      output = copilot;
    } else {
      const days = [...request.user.matchAll(/^- (\d{4}-\d{2}-\d{2}) \(día/gm)].map((m) => m[1]!);
      const week: AiWeekOutput = { days: days.map((d) => session(d, "Motor y pierna")) };
      output = week;
    }
    return {
      kind: "ok",
      model: "claude-opus-5-5",
      text: JSON.stringify(output),
      usage: { ...NO_USAGE, inputTokens: 8_000, outputTokens: 3_000 },
    };
  });

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

  let sectionA = "";
  let sectionB = "";
  let planId = "";
  let equipmentId = "";

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
      ANTHROPIC_API_KEY: "clave-de-prueba",
    });
    data = createDataLayer({
      config,
      connectionString,
      photoStore: createMemoryBlobStore(),
      aiModel: model,
    });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    const clubA = await seeder.organization({ slug: "box-a", name: "Box A" });
    const clubB = await seeder.organization({ slug: "box-b", name: "Box B" });
    const user = (name: string, email: string) => seeder.user({ name, email, password: PASSWORD });
    ownerA = await user("Olga Owner", "olga@box-a.test");
    coachA = await user("Caro Coach", "caro@box-a.test");
    otherCoachA = await user("Dani Coach", "dani@box-a.test");
    ownerB = await user("Bruno Owner", "bruno@box-b.test");
    marta = await user("Marta Roig", "marta@box-a.test");
    await seeder.membership(clubA.id, ownerA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, otherCoachA.id, "coach");
    await seeder.membership(clubB.id, ownerB.id, "org_admin");
    await seeder.membership(clubA.id, marta.id, "athlete");
    const person = await seeder.person(clubA.id, {
      firstName: "Marta",
      lastName: "Roig",
      birthDate: "1990-03-02",
      userId: marta.id,
    });
    const player = await seeder.player(clubA.id, person.id);
    await seeder.guardian(clubA.id, player.id, marta.id, "self");
    for (const u of [ownerA, coachA, otherCoachA, marta])
      cookies.set(u.email, await signIn(u.email, A));
    cookies.set(ownerB.email, await signIn(ownerB.email, B));

    for (const club of [clubA, clubB])
      await seeder.season(club.id, {
        name: "2026-27",
        startsOn: addDays(today, -120),
        endsOn: addDays(today, 200),
      });
    sectionA = (await seeder.section(clubA.id, "CrossFit", "crossfit", "activity")).id;
    sectionB = (await seeder.section(clubB.id, "CrossFit", "crossfit", "activity")).id;

    type ClassType = { classType: { teamId: string } };
    const wodType = (
      await json<ClassType>(
        await request("POST", "/api/org/class-types", A, {
          cookie: as(ownerA),
          body: { sectionId: sectionA, name: "WOD", capacity: 12 },
        }),
        201,
      )
    ).classType.teamId;
    // Clase de lunes a viernes que da Caro: programa (y planifica) en la disciplina.
    await json(
      await request("PUT", `/api/org/class-types/${wodType}/schedule`, A, {
        cookie: as(ownerA),
        body: {
          slots: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startsAt: "07:00",
            endsAt: "08:00",
            coachUserId: coachA.id,
          })),
        },
      }),
      200,
    );
    await json(
      await request("POST", "/api/org/class-types", B, {
        cookie: as(ownerB),
        body: { sectionId: sectionB, name: "WOD" },
      }),
      201,
    );
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("el material es del box: se da de alta, cuenta lo que está en reparación y otro club no lo ve", async () => {
    const created = await json<{ item: { id: string; availableToday: number } }>(
      await request("POST", "/api/org/equipment", A, {
        cookie: as(coachA),
        body: { kind: "rower", name: "Remo Concept2", quantity: 8, outOfService: 2 },
      }),
      201,
    );
    equipmentId = created.item.id;
    expect(created.item.availableToday).toBe(6);
    await json(
      await request("POST", "/api/org/equipment", A, {
        cookie: as(coachA),
        body: { kind: "rower", name: "Mal", quantity: 1, outOfService: 3 },
      }),
      400,
    );
    const listA = await json<EquipmentResponse>(
      await request("GET", "/api/org/equipment", A, { cookie: as(ownerA) }),
      200,
    );
    expect(listA.items.map((i) => i.name)).toEqual(["Remo Concept2"]);
    const listB = await json<EquipmentResponse>(
      await request("GET", "/api/org/equipment", B, { cookie: as(ownerB) }),
      200,
    );
    expect(listB.items).toEqual([]);
    await json(
      await request("PUT", `/api/org/equipment/${equipmentId}`, B, {
        cookie: as(ownerB),
        body: { kind: "rower", name: "Robado", quantity: 1 },
      }),
      404,
    );
    await json(
      await request("DELETE", `/api/org/equipment/${equipmentId}`, B, { cookie: as(ownerB) }),
      404,
    );
  });

  it("el contexto del box sale del horario: días con clase, aforo y lo que puede la IA", async () => {
    const ctx = await json<PlanningContextResponse>(
      await request("GET", `/api/org/planning/context?section=${sectionA}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(ctx.classWeekdays).toEqual([1, 2, 3, 4, 5]);
    expect(ctx.classMinutes).toBe(60);
    expect(ctx.canWrite).toBe(true);
    expect(ctx.ai.available).toBe(true);
    expect(ctx.ai.quota.limit).toBe(30);
    await json(
      await request("GET", `/api/org/planning/context?section=${sectionA}`, B, {
        cookie: as(ownerB),
      }),
      404,
    );
  });

  it("el plan se crea desde una plantilla con su estructura y su proyección; solo uno activo por disciplina", async () => {
    const body = {
      sectionId: sectionA,
      templateCode: "strength_base",
      name: "Fuerza de primavera",
      startsOn: monday,
      weeks: 8,
      emphasis: {
        strength: 45,
        weightlifting: 15,
        gymnastics: 15,
        engine: 15,
        intensity: 5,
        mobility: 5,
      },
      frequency: 3,
      tests: ["back_squat", "deadlift"],
      closures: [],
      activate: true,
    };
    // Un coach sin clases en la disciplina no planifica.
    await json(await request("POST", "/api/org/plans", A, { cookie: as(otherCoachA), body }), 403);
    const created = await json<PlanResponse>(
      await request("POST", "/api/org/plans", A, { cookie: as(coachA), body }),
      201,
    );
    planId = created.plan.id;
    expect(created.plan.status).toBe("active");
    expect(created.plan.weeks).toBe(8);
    expect(created.plan.currentWeek).toBe(1);
    expect(created.plan.structure.weeks[1]!.roles.slice(0, 5).every((r) => r !== null)).toBe(true);
    expect(created.plan.projection?.tests.map((t) => t.code)).toEqual(["back_squat", "deadlift"]);
    await json(await request("POST", "/api/org/plans", A, { cookie: as(coachA), body }), 409);
    // Otro club ni lo ve ni lo toca.
    await json(await request("GET", `/api/org/plans/${planId}`, B, { cookie: as(ownerB) }), 404);
    await json(
      await request("PUT", `/api/org/plans/${planId}`, B, {
        cookie: as(ownerB),
        body: { name: "X" },
      }),
      404,
    );
    await json(await request("POST", "/api/org/plans", B, { cookie: as(ownerB), body }), 400);
  });

  it("los borradores sin IA rellenan los días con clase y la semana sale con su papel y su validación", async () => {
    await json(
      await request("POST", `/api/org/plans/${planId}/weeks/2/drafts`, A, {
        cookie: as(otherCoachA),
      }),
      404,
    );
    await json(
      await request("POST", `/api/org/plans/${planId}/weeks/2/drafts`, B, { cookie: as(ownerB) }),
      404,
    );
    const drafted = await json<{ created: number; skipped: number }>(
      await request("POST", `/api/org/plans/${planId}/weeks/2/drafts`, A, { cookie: as(coachA) }),
      200,
    );
    expect(drafted.created).toBe(5);
    // Una segunda vez no pisa nada.
    const again = await json<{ created: number }>(
      await request("POST", `/api/org/plans/${planId}/weeks/2/drafts`, A, { cookie: as(coachA) }),
      200,
    );
    expect(again.created).toBe(0);
    const week = await json<PlanWeekResponse>(
      await request("GET", `/api/org/plans/${planId}/weeks/2`, A, { cookie: as(coachA) }),
      200,
    );
    const withClass = week.days.filter((d) => d.role);
    expect(withClass).toHaveLength(5);
    for (const d of withClass) {
      expect(d.workout?.status).toBe("draft");
      expect(d.workout?.plan?.id).toBe(planId);
      expect(d.validation.length).toBeGreaterThan(0);
    }
    expect(week.limits.map((l) => l.code)).toContain("overhead_days");
    // Una semana que no es del plan.
    await json(
      await request("GET", `/api/org/plans/${planId}/weeks/9`, A, { cookie: as(coachA) }),
      404,
    );
  });

  it("la IA propone el plan, escribe una semana como borradores y el copiloto cambia un día; nada se publica", async () => {
    const asked = await json<AiPlanGenerationResponse>(
      await request("POST", "/api/org/plan-ai/architect", A, {
        cookie: as(coachA),
        body: { sectionId: sectionA, goal: "Más fuerza para la gente de 3 días", startsOn: monday },
      }),
      201,
    );
    expect(asked.generation.status).toBe("ready");
    expect(asked.generation.proposal).toMatchObject({
      kind: "plan_architect",
      templateCode: "strength_base",
      weeks: 8,
      tests: ["back_squat", "deadlift"],
    });
    expect(asked.generation.quota.used).toBe(1);
    // Lo que vio el modelo: el box en agregados, sin nombres de atletas.
    expect(model.requests.at(-1)!.user).toContain("Remo Concept2");
    expect(model.requests.at(-1)!.user).not.toMatch(/Marta|Roig/);
    await json(
      await request("GET", `/api/org/plan-ai/${asked.generation.id}`, B, { cookie: as(ownerB) }),
      404,
    );

    const week = await json<AiPlanGenerationResponse>(
      await request("POST", `/api/org/plans/${planId}/weeks/3/ai`, A, {
        cookie: as(coachA),
        body: { focus: "Semana con mucha gente" },
      }),
      201,
    );
    expect(week.generation.status).toBe("ready");
    const sessions =
      week.generation.proposal?.kind === "plan_week" ? week.generation.proposal.sessions : [];
    expect(sessions).toHaveLength(5);
    await json(
      await request("POST", `/api/org/plan-ai/${week.generation.id}/apply`, B, {
        cookie: as(ownerB),
        body: {},
      }),
      404,
    );
    const applied = await json<{ applied: number; skipped: number }>(
      await request("POST", `/api/org/plan-ai/${week.generation.id}/apply`, A, {
        cookie: as(coachA),
        body: { indexes: [0, 1, 2] },
      }),
      200,
    );
    expect(applied).toEqual({ applied: 3, skipped: 0 });
    await json(
      await request("POST", `/api/org/plan-ai/${week.generation.id}/apply`, A, {
        cookie: as(coachA),
        body: {},
      }),
      409,
    );
    const written = await json<PlanWeekResponse>(
      await request("GET", `/api/org/plans/${planId}/weeks/3`, A, { cookie: as(coachA) }),
      200,
    );
    const drafts = written.days.filter((d) => d.workout);
    expect(drafts).toHaveLength(3);
    expect(
      drafts.every((d) => d.workout!.status === "draft" && d.workout!.plan?.id === planId),
    ).toBe(true);

    const copilot = await json<AiPlanGenerationResponse>(
      await request("POST", `/api/org/plans/${planId}/copilot`, A, {
        cookie: as(coachA),
        body: { message: "El jueves no hay remos", week: 2 },
      }),
      201,
    );
    const changes =
      copilot.generation.proposal?.kind === "plan_copilot"
        ? copilot.generation.proposal.changes
        : [];
    expect(changes.map((c) => c.op)).toEqual(["update", "note"]);
    const done = await json<{ applied: number }>(
      await request("POST", `/api/org/plan-ai/${copilot.generation.id}/apply`, A, {
        cookie: as(coachA),
        body: {},
      }),
      200,
    );
    expect(done.applied).toBe(2);
  });

  it("la revisión y la salud salen para quien ve el plan y no para otro club", async () => {
    const review = await json<PlanReviewResponse>(
      await request("GET", `/api/org/plans/${planId}/review`, A, { cookie: as(coachA) }),
      200,
    );
    expect(review.week).toBe(1);
    expect(review.weeks).toEqual([1]);
    await json(
      await request("GET", `/api/org/plans/${planId}/review`, B, { cookie: as(ownerB) }),
      404,
    );
    await json(
      await request("POST", `/api/org/plans/${planId}/review/1/decide`, A, {
        cookie: as(coachA),
        body: { key: "cap:no-existe", decision: "accept" },
      }),
      404,
    );
    const health = await json<PlanHealthResponse>(
      await request("GET", `/api/org/plans/${planId}/health`, A, { cookie: as(ownerA) }),
      200,
    );
    expect(health.weeks).toEqual([1, 2]);
    expect(health.balance).toHaveLength(6);
    expect(health.ai.byKind.map((x) => x.kind).sort()).toEqual([
      "plan_architect",
      "plan_copilot",
      "plan_week",
    ]);
    await json(
      await request("GET", `/api/org/plans/${planId}/health`, B, { cookie: as(ownerB) }),
      404,
    );
  });

  it("la atleta ve su ciclo y fija su nivel; otro club no tiene ciclo", async () => {
    const cycle = await json<MyCycleResponse>(
      await request("GET", "/api/org/me/cycle", A, { cookie: as(marta) }),
      200,
    );
    expect(cycle.plan?.id).toBe(planId);
    expect(cycle.plan?.week).toBe(1);
    expect(cycle.tests.map((t) => t.code)).toEqual(["back_squat", "deadlift"]);
    expect(cycle.week).toHaveLength(7);
    expect(cycle.levels).toHaveLength(4);
    const levels = await json<{ levels: { capacity: string; level: string; reason: string }[] }>(
      await request("PUT", "/api/org/me/levels", A, {
        cookie: as(marta),
        body: { capacity: "gymnastics", level: "foundations" },
      }),
      200,
    );
    expect(levels.levels.find((l) => l.capacity === "gymnastics")).toMatchObject({
      level: "foundations",
      reason: "confirmed",
    });
    const summary = await json<{ plan: { id: string }; sessions: number; club: string }>(
      await request("GET", `/api/org/me/cycle/summary?plan=${planId}`, A, { cookie: as(marta) }),
      200,
    );
    expect(summary).toMatchObject({ plan: { id: planId }, sessions: 0, club: "Box A" });
    // Un coach sin ficha de atleta no tiene ciclo.
    await json(await request("GET", "/api/org/me/cycle", A, { cookie: as(coachA) }), 403);
  });

  it("borrar el plan deja sus WODs, fuera del plan", async () => {
    await json(await request("DELETE", `/api/org/plans/${planId}`, B, { cookie: as(ownerB) }), 404);
    const res = await request("DELETE", `/api/org/plans/${planId}`, A, { cookie: as(coachA) });
    expect(res.status).toBe(204);
    const list = await json<{ workouts: { plan: unknown }[] }>(
      await request(
        "GET",
        `/api/org/workouts?from=${addDays(monday, 7)}&to=${addDays(monday, 13)}`,
        A,
        {
          cookie: as(coachA),
        },
      ),
      200,
    );
    expect(list.workouts.length).toBeGreaterThan(0);
    expect(list.workouts.every((w) => w.plan === null)).toBe(true);
  });
});

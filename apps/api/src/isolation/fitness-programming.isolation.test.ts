import { NetlifyDB } from "@netlify/database-dev";
import { addDays, type WorkoutsResponse } from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Acciones de semana de la programación (ADR 0050) contra una base real: publicar de una vez los
 * borradores de la semana y copiar la semana anterior como borradores sin pisar lo que ya hay.
 * Cada coach solo actúa en las disciplinas de sus clases y otro club no llega a nada.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
/** Lunes de dentro de dos semanas: días sin clases ni WOD de la semilla. */
const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
const W = addDays(today, 14 - weekday);

describe("programación: acciones de semana", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let owner: Seeded;
  let coach: Seeded;
  let otherCoach: Seeded;
  let ownerB: Seeded;
  let crossfit = "";
  let hyrox = "";
  const cookies = new Map<string, string>();
  const A = hostOf("box-a");
  const B = hostOf("box-b");

  const request = (
    method: "GET" | "POST" | "PUT",
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
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
  }
  const as = (user: Seeded) => cookies.get(user.email)!;
  const json = async <T>(res: Response, status: number): Promise<T> => {
    expect(res.status, await res.clone().text()).toBe(status);
    return (await res.json()) as T;
  };

  /** Un WOD de dos bloques, en borrador. */
  const wod = (sectionId: string, onDate: string, title: string) => ({
    sectionId,
    onDate,
    title,
    status: "draft",
    blocks: [
      {
        kind: "strength",
        title: "Back squat 5x5",
        scoreType: "load",
        movementCode: "back_squat",
        percent: 75,
      },
      {
        kind: "wod",
        title: "Fran",
        description: "21-15-9",
        scoreType: "time",
        timeCapSeconds: 600,
      },
    ],
  });
  const program = async (who: Seeded, sectionId: string, onDate: string, title: string) =>
    json(
      await request("POST", "/api/org/workouts", A, {
        cookie: as(who),
        body: wod(sectionId, onDate, title),
      }),
      201,
    );
  const week = async (who: Seeded, from: string, host = A) =>
    (
      await json<WorkoutsResponse>(
        await request("GET", `/api/org/workouts?from=${from}&to=${addDays(from, 6)}`, host, {
          cookie: as(who),
        }),
        200,
      )
    ).workouts;

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

    const clubA = await seeder.organization({ slug: "box-a", name: "Box A" });
    const clubB = await seeder.organization({ slug: "box-b", name: "Box B" });
    const user = (name: string, email: string) => seeder.user({ name, email, password: PASSWORD });
    owner = await user("Olga Owner", "olga@box-a.test");
    coach = await user("Caro Coach", "caro@box-a.test");
    otherCoach = await user("Dani Coach", "dani@box-a.test");
    ownerB = await user("Bruno Owner", "bruno@box-b.test");
    await seeder.membership(clubA.id, owner.id, "org_admin");
    await seeder.membership(clubA.id, coach.id, "coach");
    await seeder.membership(clubA.id, otherCoach.id, "coach");
    await seeder.membership(clubB.id, ownerB.id, "org_admin");
    for (const u of [owner, coach, otherCoach]) cookies.set(u.email, await signIn(u.email, A));
    cookies.set(ownerB.email, await signIn(ownerB.email, B));

    for (const club of [clubA, clubB])
      await seeder.season(club.id, {
        name: "2026-27",
        startsOn: addDays(today, -60),
        endsOn: addDays(today, 200),
      });
    crossfit = (await seeder.section(clubA.id, "CrossFit", "crossfit", "activity")).id;
    hyrox = (await seeder.section(clubA.id, "HYROX", "fitness", "activity")).id;
    const classType = async (sectionId: string, name: string) =>
      (
        await json<{ classType: { teamId: string } }>(
          await request("POST", "/api/org/class-types", A, {
            cookie: as(owner),
            body: { sectionId, name },
          }),
          201,
        )
      ).classType.teamId;
    const wodType = await classType(crossfit, "WOD");
    await classType(hyrox, "HYROX");
    // La coach da el WOD de CrossFit; no da HYROX. Dani no da ninguna clase.
    await seeder.teamStaff(clubA.id, wodType, coach.id, "head_coach");

    await program(coach, crossfit, W, "Lunes");
    await program(coach, crossfit, addDays(W, 1), "Martes");
    await program(coach, crossfit, addDays(W, 2), "Miércoles");
    await program(owner, hyrox, W, "HYROX lunes");
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("publica de una vez los borradores de la semana en las disciplinas de quien programa", async () => {
    const publish = (who: Seeded, body: unknown) =>
      request("POST", "/api/org/workouts/publish", A, { cookie: as(who), body });
    expect(
      (await json<{ published: number }>(await publish(coach, { from: W, to: addDays(W, 6) }), 200))
        .published,
    ).toBe(3);
    const after = await week(owner, W);
    expect(Object.fromEntries(after.map((w) => [w.title, w.status]))).toEqual({
      Lunes: "published",
      Martes: "published",
      Miércoles: "published",
      "HYROX lunes": "draft",
    });
    // HYROX no es suyo: para ella no existe.
    expect((await publish(coach, { from: W, to: addDays(W, 6), sectionId: hyrox })).status).toBe(
      404,
    );
    expect(
      (
        await json<{ published: number }>(
          await publish(owner, { from: W, to: addDays(W, 6), sectionId: hyrox }),
          200,
        )
      ).published,
    ).toBe(1);
    expect(
      (await json<{ published: number }>(await publish(owner, { from: W, to: addDays(W, 6) }), 200))
        .published,
    ).toBe(0);
    expect((await publish(owner, { from: addDays(W, 6), to: W })).status).toBe(400);
    expect((await publish(owner, { from: W, to: addDays(W, 40) })).status).toBe(400);
  });

  it("copia la semana como borradores y salta los días que ya tienen WOD", async () => {
    const next = addDays(W, 7);
    await program(owner, crossfit, addDays(next, 1), "Ya estaba");
    const copied = await json<{ created: number; skipped: number }>(
      await request("POST", "/api/org/workouts/copy", A, {
        cookie: as(coach),
        body: { from: W, to: next, days: 7 },
      }),
      200,
    );
    expect(copied).toEqual({ created: 2, skipped: 1 });
    const copies = await week(owner, next);
    expect(copies.map((w) => [w.onDate, w.title, w.status, w.blocks.map((b) => b.title)])).toEqual([
      [next, "Lunes", "draft", ["Back squat 5x5", "Fran"]],
      [addDays(next, 1), "Ya estaba", "draft", ["Back squat 5x5", "Fran"]],
      [addDays(next, 2), "Miércoles", "draft", ["Back squat 5x5", "Fran"]],
    ]);
    // Los bloques llegan enteros: movimiento, porcentaje y time cap.
    const monday = copies.find((w) => w.title === "Lunes")!;
    expect(monday.blocks[0]).toMatchObject({ movement: { code: "back_squat" }, percent: 75 });
    expect(monday.blocks[1]).toMatchObject({ scoreType: "time", timeCapSeconds: 600 });

    // La dueña copia HYROX a otra semana; para la coach, HYROX no existe.
    const later = addDays(W, 14);
    expect(
      (
        await request("POST", "/api/org/workouts/copy", A, {
          cookie: as(coach),
          body: { from: W, to: later, days: 7, sectionId: hyrox },
        })
      ).status,
    ).toBe(404);
    expect(
      await json(
        await request("POST", "/api/org/workouts/copy", A, {
          cookie: as(owner),
          body: { from: W, to: later, days: 7, sectionId: hyrox },
        }),
        200,
      ),
    ).toEqual({ created: 1, skipped: 0 });
    for (const body of [
      { from: W, to: W, days: 7 },
      { from: W, to: later, days: 20 },
    ])
      expect(
        (await request("POST", "/api/org/workouts/copy", A, { cookie: as(owner), body })).status,
      ).toBe(400);
  });

  it("un coach sin clases no actúa y otro club no llega a nada", async () => {
    const draft = addDays(W, 4);
    await program(owner, crossfit, draft, "Viernes");
    for (const [path, body] of [
      ["/api/org/workouts/publish", { from: W, to: addDays(W, 6) }],
      ["/api/org/workouts/copy", { from: W, to: addDays(W, 21), days: 7 }],
    ] as const)
      expect(
        (await request("POST", path, A, { cookie: as(otherCoach), body })).status,
        `${path} sin clases`,
      ).toBe(403);

    // El otro club: sin disciplinas, nada que publicar ni copiar; con las del primero, no existen.
    expect(
      await json(
        await request("POST", "/api/org/workouts/publish", B, {
          cookie: as(ownerB),
          body: { from: W, to: addDays(W, 6) },
        }),
        200,
      ),
    ).toEqual({ published: 0 });
    expect(
      await json(
        await request("POST", "/api/org/workouts/copy", B, {
          cookie: as(ownerB),
          body: { from: W, to: addDays(W, 21), days: 7 },
        }),
        200,
      ),
    ).toEqual({ created: 0, skipped: 0 });
    for (const [path, body] of [
      ["/api/org/workouts/publish", { from: W, to: addDays(W, 6), sectionId: crossfit }],
      ["/api/org/workouts/copy", { from: W, to: addDays(W, 21), days: 7, sectionId: crossfit }],
    ] as const)
      expect(
        (await request("POST", path, B, { cookie: as(ownerB), body })).status,
        `${path} desde otro club`,
      ).toBe(404);
    expect((await week(owner, W)).find((w) => w.title === "Viernes")?.status).toBe("draft");
    expect(await week(owner, addDays(W, 21))).toEqual([]);
  });
});

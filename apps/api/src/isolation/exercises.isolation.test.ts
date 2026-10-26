import { NetlifyDB } from "@netlify/database-dev";
import type { ExerciseResponse, ExercisesResponse, LibraryResponse } from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Biblioteca de ejercicios del box (ADR 0050) contra una base real: la lee todo el club, también
 * el atleta; la escriben el coach y el dueño; el nombre no se repite; archivar la quita de la
 * lista sin borrarla; y otro box no llega a nada. Si una falla, la PR no se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };

describe("biblioteca de ejercicios", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let owner: Seeded;
  let coach: Seeded;
  let athlete: Seeded;
  let ownerB: Seeded;
  let sectionA = "";
  let sectionB = "";
  let swing = "";
  const cookies = new Map<string, string>();
  const A = hostOf("box-a");
  const B = hostOf("box-b");

  const request = (
    method: "GET" | "POST" | "PATCH",
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
    athlete = await user("Marta Roig", "marta@box-a.test");
    ownerB = await user("Bruno Owner", "bruno@box-b.test");
    await seeder.membership(clubA.id, owner.id, "org_admin");
    await seeder.membership(clubA.id, coach.id, "coach");
    await seeder.membership(clubA.id, athlete.id, "athlete");
    await seeder.membership(clubB.id, ownerB.id, "org_admin");
    const person = await seeder.person(clubA.id, {
      firstName: "Marta",
      lastName: "Roig",
      birthDate: "1990-03-02",
      userId: athlete.id,
    });
    const player = await seeder.player(clubA.id, person.id);
    await seeder.guardian(clubA.id, player.id, athlete.id, "self");
    sectionA = (await seeder.section(clubA.id, "CrossFit", "crossfit", "activity")).id;
    sectionB = (await seeder.section(clubB.id, "CrossFit", "crossfit", "activity")).id;
    for (const u of [owner, coach, athlete]) cookies.set(u.email, await signIn(u.email, A));
    cookies.set(ownerB.email, await signIn(ownerB.email, B));
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("el coach añade ejercicios; el atleta los lee y no escribe", async () => {
    const created = await json<ExerciseResponse>(
      await request("POST", "/api/org/exercises", A, {
        cookie: as(coach),
        body: {
          name: "Kettlebell swing",
          category: "kettlebell",
          equipment: ["kettlebell", "kettlebell"],
          sectionId: sectionA,
          description: "Balanceo con bisagra de cadera.",
          coachingPoints: "La fuerza sale de la cadera.",
          commonFaults: "Sentadilla en lugar de bisagra.",
          scaling: "Swing ruso.",
          videoUrl: "https://youtu.be/abc123",
        },
      }),
      201,
    );
    swing = created.exercise.id;
    expect(created.exercise).toMatchObject({
      name: "Kettlebell swing",
      equipment: ["kettlebell"],
      section: { id: sectionA, name: "CrossFit" },
      status: "active",
    });
    await json(
      await request("POST", "/api/org/exercises", A, {
        cookie: as(owner),
        body: {
          name: "Back squat",
          category: "strength",
          equipment: ["barbell"],
          movementCode: "back_squat",
        },
      }),
      201,
    );
    // El nombre no se repite, sin distinguir mayúsculas.
    expect(
      (
        await request("POST", "/api/org/exercises", A, {
          cookie: as(owner),
          body: { name: "kettlebell SWING", category: "kettlebell" },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("POST", "/api/org/exercises", A, {
          cookie: as(owner),
          body: { name: "Robado", category: "strength", sectionId: sectionB },
        })
      ).status,
    ).toBe(400);

    const list = await json<ExercisesResponse>(
      await request("GET", "/api/org/exercises", A, { cookie: as(athlete) }),
      200,
    );
    expect(list.canWrite).toBe(false);
    expect(list.exercises.map((e) => e.name)).toEqual(["Back squat", "Kettlebell swing"]);
    expect(
      (
        await request("POST", "/api/org/exercises", A, {
          cookie: as(athlete),
          body: { name: "Mío", category: "strength" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("PATCH", `/api/org/exercises/${swing}`, A, {
          cookie: as(athlete),
          body: { name: "Mío" },
        })
      ).status,
    ).toBe(403);

    const found = await json<ExercisesResponse>(
      await request("GET", "/api/org/exercises?search=cadera&category=kettlebell", A, {
        cookie: as(athlete),
      }),
      200,
    );
    expect(found.exercises.map((e) => e.id)).toEqual([swing]);
    // La librería de antes lee lo mismo.
    const library = await json<LibraryResponse>(
      await request("GET", "/api/org/fitness/library", A, { cookie: as(athlete) }),
      200,
    );
    expect(library.items.map((i) => i.name)).toEqual(["Back squat", "Kettlebell swing"]);
  });

  it("archivar quita el ejercicio de la lista; quien escribe lo ve y lo recupera", async () => {
    const archived = await json<ExerciseResponse>(
      await request("PATCH", `/api/org/exercises/${swing}`, A, {
        cookie: as(owner),
        body: { status: "archived" },
      }),
      200,
    );
    expect(archived.exercise.status).toBe("archived");
    const athleteList = await json<ExercisesResponse>(
      await request("GET", "/api/org/exercises?archived=1", A, { cookie: as(athlete) }),
      200,
    );
    expect(athleteList.exercises.map((e) => e.name)).toEqual(["Back squat"]);
    expect(
      (await request("GET", `/api/org/exercises/${swing}`, A, { cookie: as(athlete) })).status,
    ).toBe(404);
    const coachList = await json<ExercisesResponse>(
      await request("GET", "/api/org/exercises?archived=1", A, { cookie: as(coach) }),
      200,
    );
    expect(coachList.canWrite).toBe(true);
    expect(coachList.exercises.map((e) => e.name)).toEqual(["Back squat", "Kettlebell swing"]);

    const restored = await json<ExerciseResponse>(
      await request("PATCH", `/api/org/exercises/${swing}`, A, {
        cookie: as(coach),
        body: { status: "active", scaling: "  ", videoUrl: null },
      }),
      200,
    );
    expect(restored.exercise).toMatchObject({ status: "active", scaling: null, videoUrl: null });
    expect(
      (await request("PATCH", `/api/org/exercises/${swing}`, A, { cookie: as(coach), body: {} }))
        .status,
    ).toBe(400);
  });

  it("otro box no llega a nada", async () => {
    const list = await json<ExercisesResponse>(
      await request("GET", "/api/org/exercises", B, { cookie: as(ownerB) }),
      200,
    );
    expect(list.exercises).toEqual([]);
    expect(
      (await request("GET", `/api/org/exercises/${swing}`, B, { cookie: as(ownerB) })).status,
    ).toBe(404);
    expect(
      (
        await request("PATCH", `/api/org/exercises/${swing}`, B, {
          cookie: as(ownerB),
          body: { name: "Robado" },
        })
      ).status,
    ).toBe(404);
    // El mismo nombre sí vale en otro box.
    await json(
      await request("POST", "/api/org/exercises", B, {
        cookie: as(ownerB),
        body: { name: "Kettlebell swing", category: "kettlebell" },
      }),
      201,
    );
  });
});

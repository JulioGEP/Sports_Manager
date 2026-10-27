import { NetlifyDB } from "@netlify/database-dev";
import {
  addDays,
  weekStartOf,
  type CancelResult,
  type ClassCapacityResult,
  type ClassDetailResponse,
  type ClassesResponse,
  type PlanResponse,
  type WorkoutResponse,
  type WorkoutsResponse,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * La clase sabe qué se programa y quién hace qué (ADR 0057) contra una base real: la lista de
 * clases dice al personal el WOD de cada una y quién viene, con su plan propio; la ficha enseña la
 * sesión de ese plan y saca del brief los kilos de quien no hace el WOD del box; la programación
 * pide también las sesiones propias. La plaza que se libera pasa a la espera y el personal amplía
 * el aforo de una clase para dar plaza por orden. El atleta no ve nada de esto y otro club, tampoco.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const monday = weekStartOf(today);
const nextMonday = addDays(monday, 7);

type Seeded = { id: string; email: string };

describe("la clase sabe qué se programa y quién hace qué", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let ownerA: Seeded;
  let coachA: Seeded;
  let ownerB: Seeded;
  let marta: Seeded;
  let nil: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("box-a");
  const B = hostOf("box-b");

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
  const request = (
    method: "GET" | "POST" | "PUT" | "DELETE",
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
  let martaPlayer = "";
  let nilPlayer = "";
  let pauPlayer = "";
  let onaPlayer = "";
  let bielPlayer = "";
  let groupPlan = "";
  let classId = "";
  let boxWod = "";
  let session = "";

  const week = `from=${new Date(`${nextMonday}T00:00:00Z`).toISOString()}&to=${new Date(
    `${addDays(nextMonday, 7)}T00:00:00Z`,
  ).toISOString()}`;
  const sessionBody = (status: "draft" | "published") => ({
    sectionId: sectionA,
    onDate: nextMonday,
    title: "Sesión del grupo",
    status,
    specific: true,
    planId: groupPlan,
    planWeek: 2,
    blocks: [{ kind: "wod", title: "Fran", scoreType: "time" }],
  });

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
    ownerA = await user("Olga Owner", "olga@box-a.test");
    coachA = await user("Caro Coach", "caro@box-a.test");
    ownerB = await user("Bruno Owner", "bruno@box-b.test");
    marta = await user("Marta Roig", "marta@box-a.test");
    nil = await user("Nil Vidal", "nil@box-a.test");
    await seeder.membership(clubA.id, ownerA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubB.id, ownerB.id, "org_admin");
    const athlete = async (first: string, last: string, login?: Seeded) => {
      if (login) await seeder.membership(clubA.id, login.id, "athlete");
      const person = await seeder.person(clubA.id, {
        firstName: first,
        lastName: last,
        birthDate: "1990-03-02",
        ...(login ? { userId: login.id } : {}),
      });
      const player = await seeder.player(clubA.id, person.id);
      if (login) await seeder.guardian(clubA.id, player.id, login.id, "self");
      return player.id;
    };
    martaPlayer = await athlete("Marta", "Roig", marta);
    nilPlayer = await athlete("Nil", "Vidal", nil);
    pauPlayer = await athlete("Pau", "Serra");
    onaPlayer = await athlete("Ona", "Font");
    bielPlayer = await athlete("Biel", "Mas");
    for (const u of [ownerA, coachA, marta, nil]) cookies.set(u.email, await signIn(u.email, A));
    cookies.set(ownerB.email, await signIn(ownerB.email, B));

    for (const club of [clubA, clubB])
      await seeder.season(club.id, {
        name: "2026-27",
        startsOn: addDays(today, -120),
        endsOn: addDays(today, 200),
      });
    sectionA = (await seeder.section(clubA.id, "CrossFit", "crossfit", "activity")).id;
    await seeder.section(clubB.id, "CrossFit", "crossfit", "activity");
    const wodType = (
      await json<{ classType: { teamId: string } }>(
        await request("POST", "/api/org/class-types", A, {
          cookie: as(ownerA),
          body: { sectionId: sectionA, name: "WOD", capacity: 12 },
        }),
        201,
      )
    ).classType.teamId;
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
          generate: true,
        },
      }),
      200,
    );

    // Marta y Pau entrenan en el grupo de competición; Nil sigue el WOD del box.
    groupPlan = (
      await json<PlanResponse>(
        await request("POST", "/api/org/plans", A, {
          cookie: as(coachA),
          body: {
            sectionId: sectionA,
            templateCode: "continuous",
            name: "Grupo competición",
            startsOn: monday,
            weeks: 8,
            emphasis: {
              strength: 30,
              weightlifting: 20,
              gymnastics: 20,
              engine: 15,
              intensity: 10,
              mobility: 5,
            },
            frequency: 3,
            tests: [],
            closures: [],
            activate: true,
            audience: "group",
            audienceName: "Competición",
            members: [martaPlayer, pauPlayer],
            weekdays: [1, 3, 5],
          },
        }),
        201,
      )
    ).plan.id;

    // El WOD del box del lunes que viene: sentadilla al 80 %.
    boxWod = (
      await json<WorkoutResponse>(
        await request("POST", "/api/org/workouts", A, {
          cookie: as(ownerA),
          body: {
            sectionId: sectionA,
            onDate: nextMonday,
            title: "Sentadilla pesada",
            status: "published",
            blocks: [
              {
                kind: "strength",
                title: "Back squat 5×3",
                scoreType: "load",
                movementCode: "back_squat",
                percent: 80,
              },
            ],
          },
        }),
        201,
      )
    ).workout.id;

    // Los tres, en la clase del lunes; Marta y Nil, con su 1RM de sentadilla.
    const classes = await json<ClassesResponse>(
      await request("GET", `/api/org/classes?${week}`, A, { cookie: as(coachA) }),
      200,
    );
    classId = classes.classes.find((x) => x.date === nextMonday)!.id;
    for (const playerId of [martaPlayer, nilPlayer, pauPlayer])
      await json(
        await request("POST", `/api/org/classes/${classId}/bookings`, A, {
          cookie: as(coachA),
          body: { playerId },
        }),
        201,
      );
    for (const u of [marta, nil])
      await json(
        await request("POST", "/api/org/me/records", A, {
          cookie: as(u),
          body: { movementCode: "back_squat", reps: 1, loadKg: 100, onDate: today },
        }),
        201,
      );
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("la lista de clases dice al personal el WOD de cada una y quién viene con plan propio", async () => {
    const classes = await json<ClassesResponse>(
      await request("GET", `/api/org/classes?${week}`, A, { cookie: as(coachA) }),
      200,
    );
    const monday7 = classes.classes.find((x) => x.id === classId)!;
    expect(monday7.hasWorkout).toBe(true);
    expect(monday7.programming?.workoutId).toBe(boxWod);
    const people = Object.fromEntries(
      monday7.programming!.people.map((p) => [p.name, p.ownPlan?.id ?? null]),
    );
    expect(people).toEqual({
      "Marta Roig": groupPlan,
      "Nil Vidal": null,
      "Pau Serra": groupPlan,
    });
    expect(monday7.programming!.people.every((p) => p.status === "booked")).toBe(true);
    // El martes no hay WOD ni nadie apuntado: la clase lo dice igual.
    const tuesday = classes.classes.find((x) => x.date === addDays(nextMonday, 1))!;
    expect(tuesday.programming).toEqual({ workoutId: null, people: [] });

    // La atleta no ve ni el WOD de la clase ni quién viene.
    const mine = await json<ClassesResponse>(
      await request("GET", `/api/org/classes?${week}`, A, { cookie: as(marta) }),
      200,
    );
    expect(mine.classes.every((x) => x.programming === null)).toBe(true);
  });

  it("la ficha enseña la sesión del plan propio y, publicada, saca sus kilos del brief", async () => {
    session = (
      await json<WorkoutResponse>(
        await request("POST", "/api/org/workouts", A, {
          cookie: as(coachA),
          body: sessionBody("draft"),
        }),
        201,
      )
    ).workout.id;

    // En borrador, Marta aún hace el WOD del box: su carga sigue en el brief.
    const draft = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${classId}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(draft.workout?.id).toBe(boxWod);
    expect(draft.sessions.map((s) => [s.id, s.status, s.plan?.id])).toEqual([
      [session, "draft", groupPlan],
    ]);
    expect(Object.fromEntries(draft.attendees.map((a) => [a.name, a.ownPlanId ?? null]))).toEqual({
      "Marta Roig": groupPlan,
      "Nil Vidal": null,
      "Pau Serra": groupPlan,
    });
    expect(draft.brief?.loads.map((l) => l.name).sort()).toEqual(["Marta Roig", "Nil Vidal"]);

    // Publicada, Marta hace su sesión: solo Nil lleva kilos del WOD del box.
    await json(
      await request("PUT", `/api/org/workouts/${session}`, A, {
        cookie: as(coachA),
        body: sessionBody("published"),
      }),
      200,
    );
    const published = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${classId}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(published.sessions[0]?.status).toBe("published");
    expect(published.brief?.loads.map((l) => l.name)).toEqual(["Nil Vidal"]);

    // Marta ve su sesión en su clase, pero no las de nadie ni los planes de los demás.
    const seen = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${classId}`, A, { cookie: as(marta) }),
      200,
    );
    expect(seen.workout?.id).toBe(session);
    expect(seen.sessions).toEqual([]);
    expect(seen.attendees.every((a) => (a.ownPlanId ?? null) === null)).toBe(true);
  });

  it("la programación pide también las sesiones propias, aparte del WOD del box", async () => {
    const range = `from=${nextMonday}&to=${nextMonday}`;
    const box = await json<WorkoutsResponse>(
      await request("GET", `/api/org/workouts?${range}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(box.workouts.map((w) => w.id)).toEqual([boxWod]);
    const all = await json<WorkoutsResponse>(
      await request("GET", `/api/org/workouts?${range}&own=1`, A, { cookie: as(coachA) }),
      200,
    );
    expect(all.workouts.map((w) => [w.id, w.specific]).sort()).toEqual(
      [
        [boxWod, false],
        [session, true],
      ].sort(),
    );
  });

  it("la plaza que se libera pasa al primero de la espera que puede, y el aforo sube para dar plaza", async () => {
    // Pau tiene tarifa; Ona y Biel, no.
    const unlimited = (
      await json<{ plan: { id: string } }>(
        await request("POST", "/api/org/fees/plans", A, {
          cookie: as(ownerA),
          body: {
            name: "Ilimitada",
            amountCents: 6900,
            period: "monthly",
            sectionId: sectionA,
            entitlement: "unlimited",
          },
        }),
        201,
      )
    ).plan.id;
    await json(
      await request("POST", "/api/org/subscriptions", A, {
        cookie: as(ownerA),
        body: { playerId: pauPlayer, feePlanId: unlimited, startsOn: today, chargeNow: false },
      }),
      201,
    );
    const classes = await json<ClassesResponse>(
      await request("GET", `/api/org/classes?${week}`, A, { cookie: as(coachA) }),
      200,
    );
    const tuesday = classes.classes.find((x) => x.date === addDays(nextMonday, 1))!.id;
    const capacity = (value: number, who = coachA, host = A) =>
      request("PUT", `/api/org/classes/${tuesday}/capacity`, host, {
        cookie: as(who),
        body: { capacity: value },
      });

    // Dos plazas: Marta y Nil dentro; Ona, Pau y Biel, por ese orden, en la espera.
    const two = await json<ClassCapacityResult>(await capacity(2), 200);
    expect(two.class.capacity).toBe(2);
    expect(two.admitted).toEqual([]);
    for (const playerId of [martaPlayer, nilPlayer, onaPlayer, pauPlayer, bielPlayer])
      await json(
        await request("POST", `/api/org/classes/${tuesday}/bookings`, A, {
          cookie: as(coachA),
          body: { playerId },
        }),
        201,
      );

    // Marta se va: Ona va primera pero su tarifa no llega; entra Pau, y el box sabe quién.
    const cancelled = await json<CancelResult>(
      await request("DELETE", `/api/org/classes/${tuesday}/bookings/${martaPlayer}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(cancelled).toMatchObject({ promoted: true, promotedName: "Pau Serra" });
    const after = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${tuesday}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(after.waitlist.map((a) => a.name)).toEqual(["Ona Font", "Biel Mas"]);
    expect(after.attendees.find((a) => a.playerId === pauPlayer)?.fromWaitlist).toBe(true);
    expect(after.attendees.find((a) => a.playerId === nilPlayer)?.fromWaitlist).toBe(false);

    // Nunca por debajo de quien ya tiene plaza.
    await json(await capacity(1), 409);

    // El box amplía a cuatro: entran los dos de la espera, por orden, aunque no tengan tarifa.
    const four = await json<ClassCapacityResult>(await capacity(4), 200);
    expect(four.class.capacity).toBe(4);
    expect(four.class.booked).toBe(4);
    expect(four.admitted.map((a) => a.name)).toEqual(["Ona Font", "Biel Mas"]);
    const full = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${tuesday}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(full.waitlist).toEqual([]);
    expect(
      full.attendees
        .filter((a) => a.fromWaitlist)
        .map((a) => a.name)
        .sort(),
    ).toEqual(["Biel Mas", "Ona Font", "Pau Serra"]);

    // La atleta no cambia el aforo ni ve de dónde vino cada uno; otro club ni encuentra la clase.
    await json(await capacity(6, marta), 403);
    const seen = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${tuesday}`, A, { cookie: as(marta) }),
      200,
    );
    expect(seen.attendees.every((a) => a.fromWaitlist === undefined)).toBe(true);
    await json(await capacity(6, ownerB, B), 404);
  });

  it("otro club no ve la clase ni sus sesiones", async () => {
    await json(await request("GET", `/api/org/classes/${classId}`, B, { cookie: as(ownerB) }), 404);
    const theirs = await json<WorkoutsResponse>(
      await request("GET", `/api/org/workouts?from=${nextMonday}&to=${nextMonday}&own=1`, B, {
        cookie: as(ownerB),
      }),
      200,
    );
    expect(theirs.workouts).toEqual([]);
  });
});

import { NetlifyDB } from "@netlify/database-dev";
import {
  addDays,
  weekStartOf,
  type MyCycleResponse,
  type MyWorkoutsResponse,
  type PlanResponse,
  type PlanningCandidatesResponse,
  type PlanWeekResponse,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Planes para quien sea (ADR 0054) contra una base real: un plan de todo el box convive con planes
 * propios (una persona, un grupo); nadie sigue dos planes propios a la vez salvo que se le anule el
 * suyo; las sesiones de un plan propio van aparte del WOD del box y solo las ven sus atletas; la
 * cuota de programación dice quién la paga; y otro club no ve nada de esto.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const monday = weekStartOf(today);

type Seeded = { id: string; email: string };

const EMPHASIS = {
  strength: 30,
  weightlifting: 20,
  gymnastics: 20,
  engine: 15,
  intensity: 10,
  mobility: 5,
};

describe("planes para quien sea", () => {
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
  let martaPlayer = "";
  let nilPlayer = "";
  let carlaPlayer = "";
  let pauPlayer = "";
  let outsider = "";
  let boxPlan = "";
  let carlaPlan = "";
  let groupPlan = "";

  const planBody = (extra: Record<string, unknown>) => ({
    sectionId: sectionA,
    templateCode: "continuous",
    name: "Plan",
    startsOn: monday,
    weeks: 8,
    emphasis: EMPHASIS,
    frequency: 3,
    tests: [],
    closures: [],
    activate: true,
    ...extra,
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
    carlaPlayer = await athlete("Carla", "Prieto");
    pauPlayer = await athlete("Pau", "Serra");
    const otherPerson = await seeder.person(clubB.id, {
      firstName: "Xènia",
      lastName: "Fora",
      birthDate: "1991-01-01",
    });
    outsider = (await seeder.player(clubB.id, otherPerson.id)).id;
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
        },
      }),
      200,
    );
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("un plan de todo el box convive con uno solo para una persona, con sus días y su frecuencia", async () => {
    boxPlan = (
      await json<PlanResponse>(
        await request("POST", "/api/org/plans", A, {
          cookie: as(coachA),
          body: planBody({ name: "Plan del box" }),
        }),
        201,
      )
    ).plan.id;
    // La frecuencia va de 1 a 7.
    await json(
      await request("POST", "/api/org/plans", A, {
        cookie: as(coachA),
        body: planBody({ frequency: 8 }),
      }),
      400,
    );
    // Un plan propio pide su gente, y que sea de este club.
    await json(
      await request("POST", "/api/org/plans", A, {
        cookie: as(coachA),
        body: planBody({ audience: "athlete", members: [] }),
      }),
      400,
    );
    await json(
      await request("POST", "/api/org/plans", A, {
        cookie: as(coachA),
        body: planBody({ audience: "athlete", members: [outsider] }),
      }),
      400,
    );
    const carla = await json<PlanResponse>(
      await request("POST", "/api/org/plans", A, {
        cookie: as(coachA),
        body: planBody({
          name: "Carla · Halterofilia",
          audience: "athlete",
          members: [carlaPlayer],
          weekdays: [2, 4],
          frequency: 2,
        }),
      }),
      201,
    );
    carlaPlan = carla.plan.id;
    expect(carla.plan).toMatchObject({
      status: "active",
      audience: "athlete",
      members: 1,
      weekdays: [2, 4],
      frequency: 2,
      feeTracking: false,
    });
    expect(carla.plan.memberList.map((m) => m.name)).toEqual(["Carla Prieto"]);
    // Solo martes y jueves tienen papel.
    const roles = carla.plan.structure.weeks[1]!.roles;
    expect(roles.flatMap((r, i) => (r ? [i + 1] : []))).toEqual([2, 4]);
  });

  it("un grupo no solapa a quien ya sigue otro plan propio: se avisa y, si se anula el suyo, pasa", async () => {
    const candidates = await json<PlanningCandidatesResponse>(
      await request("GET", `/api/org/planning/candidates?section=${sectionA}`, A, {
        cookie: as(coachA),
      }),
      200,
    );
    expect(candidates.feeTracking).toBe(false);
    expect(candidates.athletes.find((a) => a.playerId === carlaPlayer)?.plan).toMatchObject({
      id: carlaPlan,
      audience: "athlete",
    });
    expect(candidates.athletes.find((a) => a.playerId === martaPlayer)?.plan).toBeNull();
    expect(candidates.athletes.some((a) => a.playerId === outsider)).toBe(false);

    const group = planBody({
      name: "Grupo competición",
      audience: "group",
      audienceName: "Competición",
      members: [martaPlayer, carlaPlayer],
      weekdays: [1, 3, 5],
      frequency: 3,
    });
    const taken = await json<{ error: { message: string } }>(
      await request("POST", "/api/org/plans", A, { cookie: as(coachA), body: group }),
      409,
    );
    expect(JSON.stringify(taken)).toContain("Carla · Halterofilia");
    const created = await json<PlanResponse>(
      await request("POST", "/api/org/plans", A, {
        cookie: as(coachA),
        body: { ...group, replace: [carlaPlayer] },
      }),
      201,
    );
    groupPlan = created.plan.id;
    expect(created.plan.audienceName).toBe("Competición");
    expect(created.plan.memberList.map((m) => m.playerId).sort()).toEqual(
      [martaPlayer, carlaPlayer].sort(),
    );
    // El plan de Carla se ha quedado sin nadie: se archiva.
    const old = await json<PlanResponse>(
      await request("GET", `/api/org/plans/${carlaPlan}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(old.plan.status).toBe("archived");
    expect(old.plan.memberList).toEqual([]);
  });

  it("los atletas del grupo se quitan y se añaden; nunca a cero ni con alguien de otro club", async () => {
    const added = await json<PlanResponse>(
      await request("PUT", `/api/org/plans/${groupPlan}/members`, A, {
        cookie: as(coachA),
        body: { add: [pauPlayer], remove: [carlaPlayer] },
      }),
      200,
    );
    expect(added.plan.memberList.map((m) => m.playerId).sort()).toEqual(
      [martaPlayer, pauPlayer].sort(),
    );
    await json(
      await request("PUT", `/api/org/plans/${groupPlan}/members`, A, {
        cookie: as(coachA),
        body: { add: [outsider] },
      }),
      400,
    );
    await json(
      await request("PUT", `/api/org/plans/${groupPlan}/members`, A, {
        cookie: as(coachA),
        body: { remove: [martaPlayer, pauPlayer] },
      }),
      400,
    );
    // Un plan de todo el box no tiene lista.
    await json(
      await request("PUT", `/api/org/plans/${boxPlan}/members`, A, {
        cookie: as(coachA),
        body: { add: [nilPlayer] },
      }),
      400,
    );
    // Otro club, nada.
    await json(
      await request("PUT", `/api/org/plans/${groupPlan}/members`, B, {
        cookie: as(ownerB),
        body: { add: [nilPlayer] },
      }),
      404,
    );
    await json(
      await request("GET", `/api/org/planning/candidates?section=${sectionA}`, B, {
        cookie: as(ownerB),
      }),
      404,
    );
  });

  it("con una tarifa de programación, se ve quién la paga, quién la debe y quién no la tiene", async () => {
    const fee = (
      await json<{ plan: { id: string; includesProgramming: boolean } }>(
        await request("POST", "/api/org/fees/plans", A, {
          cookie: as(ownerA),
          body: {
            name: "Programación personalizada",
            amountCents: 3500,
            period: "monthly",
            entitlement: "none",
            includesProgramming: true,
          },
        }),
        201,
      )
    ).plan;
    expect(fee.includesProgramming).toBe(true);
    await json(
      await request("POST", "/api/org/subscriptions", A, {
        cookie: as(ownerA),
        body: { playerId: martaPlayer, feePlanId: fee.id, startsOn: today, chargeNow: true },
      }),
      201,
    );
    const plan = await json<PlanResponse>(
      await request("GET", `/api/org/plans/${groupPlan}`, A, { cookie: as(coachA) }),
      200,
    );
    expect(plan.plan.feeTracking).toBe(true);
    const fees = Object.fromEntries(plan.plan.memberList.map((m) => [m.playerId, m.fee]));
    expect(fees).toEqual({ [martaPlayer]: "pending", [pauPlayer]: "none" });
  });

  it("las sesiones del grupo van aparte del WOD del box y solo las ven sus atletas", async () => {
    for (const id of [boxPlan, groupPlan]) {
      await json(
        await request("POST", `/api/org/plans/${id}/weeks/2/drafts`, A, { cookie: as(coachA) }),
        200,
      );
      await json(
        await request("POST", `/api/org/plans/${id}/weeks/2/publish`, A, { cookie: as(coachA) }),
        200,
      );
    }
    const week = await json<PlanWeekResponse>(
      await request("GET", `/api/org/plans/${groupPlan}/weeks/2`, A, { cookie: as(coachA) }),
      200,
    );
    const own = week.days.filter((d) => d.workout);
    expect(own.map((d) => d.date)).toEqual([0, 2, 4].map((i) => addDays(monday, 7 + i)));
    expect(own.every((d) => d.workout!.specific && d.workout!.plan?.id === groupPlan)).toBe(true);

    // La programación del box no las mezcla.
    const list = await json<{ workouts: { specific: boolean; plan: { id: string } | null }[] }>(
      await request(
        "GET",
        `/api/org/workouts?from=${addDays(monday, 7)}&to=${addDays(monday, 13)}`,
        A,
        { cookie: as(coachA) },
      ),
      200,
    );
    expect(list.workouts.length).toBe(5);
    expect(list.workouts.every((w) => !w.specific && w.plan?.id === boxPlan)).toBe(true);

    // Marta (del grupo) ve su sesión en vez del WOD del box; Nil, el del box.
    const day = addDays(monday, 7);
    const mine = await json<MyWorkoutsResponse>(
      await request("GET", `/api/org/me/workouts?date=${day}`, A, { cookie: as(marta) }),
      200,
    );
    expect(mine.workouts).toHaveLength(1);
    expect(mine.workouts[0]).toMatchObject({ specific: true, plan: { id: groupPlan } });
    const theirs = await json<MyWorkoutsResponse>(
      await request("GET", `/api/org/me/workouts?date=${day}`, A, { cookie: as(nil) }),
      200,
    );
    expect(theirs.workouts).toHaveLength(1);
    expect(theirs.workouts[0]).toMatchObject({ specific: false, plan: { id: boxPlan } });
    // El martes el grupo no entrena: Marta ve el WOD del box.
    const tuesday = await json<MyWorkoutsResponse>(
      await request("GET", `/api/org/me/workouts?date=${addDays(day, 1)}`, A, {
        cookie: as(marta),
      }),
      200,
    );
    expect(tuesday.workouts[0]).toMatchObject({ specific: false, plan: { id: boxPlan } });

    // Quien no es del grupo no puede apuntar un resultado en su sesión.
    const block = mine.workouts[0]!.blocks.find((b) => b.scoreType !== "none");
    if (block)
      await json(
        await request("PUT", `/api/org/me/results/${block.id}`, A, {
          cookie: as(nil),
          body: { level: "rx", score: { timeSeconds: 300 } },
        }),
        404,
      );

    // Su ciclo es el del grupo; el de Nil, el del box.
    const cycle = await json<MyCycleResponse>(
      await request("GET", "/api/org/me/cycle", A, { cookie: as(marta) }),
      200,
    );
    expect(cycle.plan?.id).toBe(groupPlan);
    const nilCycle = await json<MyCycleResponse>(
      await request("GET", "/api/org/me/cycle", A, { cookie: as(nil) }),
      200,
    );
    expect(nilCycle.plan?.id).toBe(boxPlan);
  });

  it("al quitar a alguien de un plan propio vuelve al plan del box", async () => {
    await json(
      await request("PUT", `/api/org/plans/${groupPlan}/members`, A, {
        cookie: as(coachA),
        body: { remove: [martaPlayer] },
      }),
      200,
    );
    const cycle = await json<MyCycleResponse>(
      await request("GET", "/api/org/me/cycle", A, { cookie: as(marta) }),
      200,
    );
    expect(cycle.plan?.id).toBe(boxPlan);
    const mine = await json<MyWorkoutsResponse>(
      await request("GET", `/api/org/me/workouts?date=${addDays(monday, 7)}`, A, {
        cookie: as(marta),
      }),
      200,
    );
    expect(mine.workouts.every((w) => !w.specific)).toBe(true);
  });
});

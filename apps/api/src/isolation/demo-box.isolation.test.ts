import { NetlifyDB } from "@netlify/database-dev";
import {
  type ClassDetailResponse,
  type ClassesResponse,
  type ExercisesResponse,
  type FitnessHomeResponse,
  type FitnessMetricsResponse,
  type LeaderboardResponse,
  type OrganizationResponse,
  type ProgressResponse,
  type WorkoutsResponse,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";

/**
 * El box de demostración (ADR 0049) tal como llega con las migraciones: la dueña, el coach y la
 * atleta entran con sus cuentas demo y cada uno ve su box lleno (clases con plazas y espera, WOD
 * publicado con clasificación, tarifas, métricas y avisos). Si la semilla se rompe, se ve aquí.
 */
const BASE = "sportsmanager.test";
const BOX = `demo-box.${BASE}`;
const PASSWORD = "123456";
const MIGRATIONS = new URL("../../../../netlify/database/migrations", import.meta.url).pathname;

describe("box de demostración", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  const cookies = new Map<string, string>();

  const request = (method: "GET" | "POST", path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        host: BOX,
        origin: `https://${BOX}`,
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const json = async <T>(res: Response, status = 200): Promise<T> => {
    expect(res.status, await res.clone().text()).toBe(status);
    return (await res.json()) as T;
  };
  async function signIn(email: string) {
    const res = await request("POST", "/api/auth/sign-in/email", undefined, {
      email,
      password: PASSWORD,
    });
    expect(res.status, `login ${email}`).toBe(200);
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
  }

  beforeAll(async () => {
    local = new NetlifyDB();
    const connectionString = await local.start();
    await local.applyMigrations(MIGRATIONS);
    const config = loadConfig({
      NODE_ENV: "test",
      APP_BASE_DOMAIN: BASE,
      TENANT_FALLBACK_SLUG: "demo",
      TENANT_ROUTING: "subdomain",
      EMAIL_TRANSPORT: "outbox",
    });
    data = createDataLayer({ config, connectionString, photoStore: createMemoryBlobStore() });
    app = createApp({ config, data });
    for (const email of ["box@demo.test", "coach@demo.test", "atleta@demo.test"])
      cookies.set(email, await signIn(email));
  });

  afterAll(async () => {
    await data?.close();
    await local?.stop();
  });

  it("es un club de fitness con cada cuenta en su sitio", async () => {
    expect(
      (await json<{ clubModel: string; name: string }>(await request("GET", "/api/org/branding")))
        .clubModel,
    ).toBe("fitness");
    const roles = async (email: string) => {
      const org = await json<OrganizationResponse>(
        await request("GET", "/api/org", cookies.get(email)),
      );
      return org.actor.kind === "member" ? org.actor.roles : [];
    };
    expect(await roles("box@demo.test")).toEqual(["org_admin"]);
    expect(await roles("coach@demo.test")).toEqual(["coach"]);
    expect(await roles("atleta@demo.test")).toEqual(["athlete"]);
  });

  it("la atleta tiene su día: próxima clase, WOD de hoy, tarifa, racha y marcas", async () => {
    const athlete = cookies.get("atleta@demo.test");
    const home = await json<FitnessHomeResponse>(
      await request("GET", "/api/org/me/fitness", athlete),
    );
    expect(home.athlete.firstName).toBe("Laia");
    expect(home.plan?.plan.name).toBe("Ilimitada");
    expect(home.nextClass).not.toBeNull();
    expect(home.streak.current).toBeGreaterThan(0);
    expect(home.unreadMessages).toBe(0);
    const progress = await json<ProgressResponse>(
      await request("GET", "/api/org/me/progress", athlete),
    );
    const squat = progress.movements.find((m) => m.movementCode === "back_squat");
    expect(squat?.oneRm).toEqual({ kg: 82.5, estimated: false });
    expect(progress.benchmarks.map((b) => b.benchmarkCode)).toContain("fran");
    expect(progress.body.length).toBe(5);
    expect(progress.totalClasses).toBeGreaterThan(5);
  });

  it("las clases tienen plazas, espera y WOD; el coach ve su brief", async () => {
    const now = new Date();
    const range = `from=${encodeURIComponent(now.toISOString())}&to=${encodeURIComponent(
      new Date(now.getTime() + 3 * 86_400_000).toISOString(),
    )}`;
    const schedule = await json<ClassesResponse>(
      await request("GET", `/api/org/classes?${range}`, cookies.get("atleta@demo.test")),
    );
    expect(schedule.classes.length).toBeGreaterThan(10);
    expect(schedule.classes.some((c) => c.waitlist > 0)).toBe(true);
    expect(schedule.classes.some((c) => c.my?.status === "booked")).toBe(true);

    const coach = cookies.get("coach@demo.test");
    const mine = await json<ClassesResponse>(
      await request("GET", `/api/org/classes?${range}&mine=1`, coach),
    );
    expect(mine.classes.length).toBeGreaterThan(0);
    expect(mine.classes.every((c) => c.coach?.name === "Álex Romero")).toBe(true);
    const detail = await json<ClassDetailResponse>(
      await request("GET", `/api/org/classes/${mine.classes[0]!.id}`, coach),
    );
    expect(detail.canCheckIn).toBe(true);
    expect(detail.brief).not.toBeNull();
  });

  it("la programación y la clasificación del WOD de ayer están", async () => {
    const coach = cookies.get("coach@demo.test");
    const workouts = await json<WorkoutsResponse>(await request("GET", "/api/org/workouts", coach));
    expect(workouts.workouts.length).toBeGreaterThan(0);
    const back = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
    const past = await json<WorkoutsResponse>(
      await request("GET", `/api/org/workouts?from=${back}`, coach),
    );
    const scored = past.workouts
      .flatMap((w) => w.blocks)
      .find((b) => b.scoreType !== "none" && b.results > 0);
    expect(scored).toBeDefined();
    const board = await json<LeaderboardResponse>(
      await request(
        "GET",
        `/api/org/workouts/blocks/${scored!.id}/leaderboard`,
        cookies.get("atleta@demo.test"),
      ),
    );
    expect(board.entries.length).toBeGreaterThan(0);
  });

  it("la biblioteca de ejercicios del box está llena y enlazada al catálogo", async () => {
    const library = await json<ExercisesResponse>(
      await request("GET", "/api/org/exercises", cookies.get("atleta@demo.test")),
    );
    expect(library.canWrite).toBe(false);
    expect(library.exercises.length).toBeGreaterThanOrEqual(30);
    const squat = library.exercises.find((e) => e.name === "Back squat");
    expect(squat).toMatchObject({ category: "strength", movementCode: "back_squat" });
    expect(squat?.coachingPoints).toBeTruthy();
    expect(library.exercises.find((e) => e.name === "Sled push")?.section?.name).toBe("HYROX");
    const coach = await json<ExercisesResponse>(
      await request("GET", "/api/org/exercises", cookies.get("coach@demo.test")),
    );
    expect(coach.canWrite).toBe(true);
  });

  it("la dueña ve sus cifras y sus avisos", async () => {
    const metrics = await json<FitnessMetricsResponse>(
      await request("GET", "/api/org/fitness/metrics", cookies.get("box@demo.test")),
    );
    expect(metrics.activeAthletes).toBe(39);
    expect(metrics.recurringMonthlyCents).toBeGreaterThan(200_000);
    expect(metrics.occupancyLastWeek).toBeGreaterThan(0.2);
    expect(metrics.alerts.map((a) => a.kind)).toEqual(
      expect.arrayContaining(["trials_pending", "charges_failed"]),
    );
    // Hoy y mañana, publicados; después, un borrador y días por programar.
    const today = metrics.programming[0];
    if (today?.date === new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format())
      expect(today.status).toBe("published");
    expect(metrics.programming.some((p) => p.status === "draft")).toBe(true);
    expect(metrics.programming.some((p) => p.status === "missing")).toBe(true);
  });
});

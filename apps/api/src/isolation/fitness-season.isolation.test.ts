import { NetlifyDB } from "@netlify/database-dev";
import { addDays, type ClassesResponse } from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Temporada continua de un box (ADR 0050): en un club de fitness nadie gestiona temporadas. Cuando
 * a la actual le quedan menos de dos meses, se alarga un año y el horario crea las clases que
 * faltan sin tocar las que ya hay. En un club deportivo, la temporada es la que es.
 */
const BASE = "sportsmanager.test";
const PASSWORD = "contraseña-de-prueba-123";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const tomorrow = addDays(today, 1);
const weekday = (() => {
  const d = new Date(`${tomorrow}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
})();

describe("temporada continua del box", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  const cookies = new Map<string, string>();

  const request = (
    method: "GET" | "POST" | "PUT" | "PATCH",
    path: string,
    slug: string,
    options: { cookie?: string; body?: unknown } = {},
  ) =>
    app.request(path, {
      method,
      headers: {
        host: `${slug}.${BASE}`,
        origin: `https://${slug}.${BASE}`,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  const json = async <T>(res: Response, status: number): Promise<T> => {
    expect(res.status, await res.clone().text()).toBe(status);
    return (await res.json()) as T;
  };

  /** Un club con su dueño, una temporada que acaba en diez días y un tipo de clase con horario. */
  async function club(slug: string) {
    const org = await seeder.organization({ slug, name: slug });
    const owner = await seeder.user({
      name: "Dueña",
      email: `duena@${slug}.test`,
      password: PASSWORD,
    });
    await seeder.membership(org.id, owner.id, "org_admin");
    const res = await request("POST", "/api/auth/sign-in/email", slug, {
      body: { email: `duena@${slug}.test`, password: PASSWORD },
    });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
    cookies.set(slug, cookie);
    await seeder.season(org.id, {
      name: "Actual",
      startsOn: addDays(today, -300),
      endsOn: addDays(today, 10),
    });
    const section = await seeder.section(org.id, "CrossFit", "crossfit", "activity");
    const created = await json<{ classType: { teamId: string } }>(
      await request("POST", "/api/org/class-types", slug, {
        cookie,
        body: { sectionId: section.id, name: "WOD", capacity: 12 },
      }),
      201,
    );
    await json(
      await request("PUT", `/api/org/class-types/${created.classType.teamId}/schedule`, slug, {
        cookie,
        body: { slots: [{ weekday, startsAt: "19:00", endsAt: "20:00" }], generate: true },
      }),
      200,
    );
    return { org, cookie };
  }

  const classesIn = async (slug: string, fromDays: number, toDays: number) =>
    (
      await json<ClassesResponse>(
        await request(
          "GET",
          `/api/org/classes?from=${encodeURIComponent(`${addDays(today, fromDays)}T00:00:00Z`)}&to=${encodeURIComponent(`${addDays(today, toDays)}T00:00:00Z`)}`,
          slug,
          { cookie: cookies.get(slug)! },
        ),
        200,
      )
    ).classes;

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
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("en un box, la temporada se alarga sola y salen las clases de los meses siguientes", async () => {
    const box = await club("box-temporada");
    await data.organizations.update((await data.organizations.findBySlug("box-temporada"))!.scope, {
      clubModel: "fitness",
    });
    // La primera consulta ya alarga: a la temporada le quedaban diez días.
    const later = await classesIn("box-temporada", 40, 62);
    expect(later.length).toBeGreaterThanOrEqual(3);
    const seasons = await json<{ seasons: { endsOn: string; isCurrent: boolean }[] }>(
      await request("GET", "/api/org/seasons", "box-temporada", { cookie: box.cookie }),
      200,
    );
    expect(seasons.seasons.find((s) => s.isCurrent)?.endsOn).toBe(addDays(today, 365));
    // Las de antes siguen siendo las mismas: no se rehacen.
    const soon = await classesIn("box-temporada", 0, 8);
    expect(soon).toHaveLength(1);
  });

  it("en un club deportivo, la temporada no se toca", async () => {
    await club("club-temporada");
    expect(await classesIn("club-temporada", 40, 62)).toEqual([]);
    const seasons = await json<{ seasons: { endsOn: string }[] }>(
      await request("GET", "/api/org/seasons", "club-temporada", {
        cookie: cookies.get("club-temporada")!,
      }),
      200,
    );
    expect(seasons.seasons[0]?.endsOn).toBe(addDays(today, 10));
  });
});

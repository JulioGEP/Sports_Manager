import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Lote de lecturas (ADR 0060): `POST /api/batch` resuelve varias GET en una sola invocación y
 * comparte entre ellas el club, la sesión y el actor. Nada de eso puede saltarse el aislamiento:
 * cada petición del lote responde exactamente lo que respondería sola, con la cookie del lote, y
 * nada de lo resuelto para una persona o un club se cuela en otra petición.
 */
const BASE = "sportsmanager.test";
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };
type Item = { path: string; headers?: Record<string, string> };
type Reply = { status: number; body: unknown };

describe("lote de lecturas", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let adminA: Seeded; // org_admin del club A
  let coachA: Seeded; // coach del club A
  let both: Seeded; // coach en A y guardian en B
  let nobody: Seeded; // sesión válida, sin pertenencias
  const cookies = new Map<string, string>();

  async function signIn(user: Seeded): Promise<string> {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { host: BASE, origin: `https://${BASE}`, "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password: PASSWORD }),
    });
    expect(res.status, `login ${user.email}: ${await res.clone().text()}`).toBe(200);
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
  }

  async function batch(items: Item[], cookie?: string, host = BASE) {
    const res = await app.request("/api/batch", {
      method: "POST",
      headers: {
        host,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ requests: items }),
    });
    return res;
  }

  async function replies(items: Item[], cookie?: string, host = BASE): Promise<Reply[]> {
    const res = await batch(items, cookie, host);
    expect(res.status).toBe(200);
    return ((await res.json()) as { responses: Reply[] }).responses;
  }

  /** La misma GET, suelta, para comparar. */
  async function alone(item: Item, cookie?: string, host = BASE): Promise<Reply> {
    const res = await app.request(item.path, {
      headers: { host, ...(item.headers ?? {}), ...(cookie ? { cookie } : {}) },
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  beforeAll(async () => {
    local = new NetlifyDB();
    const connectionString = await local.start();
    await local.applyMigrations(
      new URL("../../../../netlify/database/migrations", import.meta.url).pathname,
    );
    const config = loadConfig({
      NODE_ENV: "test",
      APP_BASE_DOMAIN: BASE,
      TENANT_ROUTING: "path",
    });
    data = createDataLayer({ config, connectionString });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    const clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    const clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
    adminA = await seeder.user({ name: "Ana Admin", email: "ana@a.test", password: PASSWORD });
    coachA = await seeder.user({ name: "Coral Coach", email: "coral@a.test", password: PASSWORD });
    both = await seeder.user({ name: "Carla Dos", email: "carla@ambos.test", password: PASSWORD });
    nobody = await seeder.user({
      name: "Dani Nadie",
      email: "dani@nadie.test",
      password: PASSWORD,
    });
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, both.id, "coach");
    await seeder.membership(clubB.id, both.id, "guardian");
    for (const u of [adminA, coachA, both, nobody]) cookies.set(u.id, await signIn(u));
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("cada petición responde lo mismo que sola: su club, su sesión y sus permisos", async () => {
    const items: Item[] = [
      { path: "/api/org", headers: { "x-sm-club": "club-a" } },
      { path: "/api/org", headers: { "x-sm-club": "club-b" } },
      { path: "/api/org/members", headers: { "x-sm-club": "club-a" } },
      { path: "/api/org/members", headers: { "x-sm-club": "club-b" } },
      { path: "/api/org/branding", headers: { "x-sm-club": "club-b" } },
      { path: "/api/org/branding", headers: { "x-sm-club": "no-existe" } },
      { path: "/api/me" },
      { path: "/api/me/memberships" },
    ];
    for (const user of [adminA, coachA, both, nobody]) {
      const cookie = cookies.get(user.id)!;
      const inBatch = await replies(items, cookie);
      const one = await Promise.all(items.map((item) => alone(item, cookie)));
      expect(inBatch, user.email).toEqual(one);
    }
    // El admin de A no entra en B por ir en el mismo lote que A.
    const admin = await replies(items.slice(0, 2), cookies.get(adminA.id));
    expect(admin.map((r) => r.status)).toEqual([200, 403]);
    // Quien está en los dos clubes es cada vez quien es en cada uno.
    const mixed = await replies(items.slice(0, 2), cookies.get(both.id));
    const roles = mixed.map((r) => (r.body as { actor: { roles: string[] } }).actor.roles);
    expect(roles).toEqual([["coach"], ["guardian"]]);
  });

  it("sin cookie, nada de dentro tiene sesión; lo público sigue siendo público", async () => {
    const out = await replies([
      { path: "/api/org", headers: { "x-sm-club": "club-a" } },
      { path: "/api/me" },
      { path: "/api/org/branding", headers: { "x-sm-club": "club-a" } },
    ]);
    expect(out.map((r) => r.status)).toEqual([401, 401, 200]);
  });

  it("una petición no puede traer su propia cookie ni otras cabeceras: la identidad es la del lote", async () => {
    const out = await replies(
      [
        {
          path: "/api/org",
          headers: { "x-sm-club": "club-a", cookie: cookies.get(adminA.id)! },
        },
        { path: "/api/me", headers: { authorization: "Bearer cualquiera" } },
      ],
      cookies.get(nobody.id),
    );
    expect(out[0]!.status).toBe(403);
    expect((out[1]!.body as { user: { email: string } }).user.email).toBe(nobody.email);
  });

  it("'ver como' va por petición: el actor de una no se cuela en la otra", async () => {
    const cookie = cookies.get(adminA.id)!;
    const out = await replies(
      [
        { path: "/api/org", headers: { "x-sm-club": "club-a", "x-sm-view-as": coachA.id } },
        { path: "/api/org", headers: { "x-sm-club": "club-a" } },
        { path: "/api/org/members", headers: { "x-sm-club": "club-a", "x-sm-view-as": coachA.id } },
      ],
      cookie,
    );
    const actors = out
      .slice(0, 2)
      .map((r) => (r.body as { actor: { viewingAs: { userId: string } | null } }).actor.viewingAs);
    expect(actors[0]?.userId).toBe(coachA.id);
    expect(actors[1]).toBeNull();
    // Con los ojos de la entrenadora, sin permiso para la lista del personal: como si fuera ella.
    expect(out[2]!.status).toBe(
      (
        await alone(
          {
            path: "/api/org/members",
            headers: { "x-sm-club": "club-a", "x-sm-view-as": coachA.id },
          },
          cookie,
        )
      ).status,
    );
  });

  it("en un subdominio de club, la cabecera de una petición no cambia de club", async () => {
    const out = await replies(
      [{ path: "/api/org/branding", headers: { "x-sm-club": "club-b" } }],
      undefined,
      `club-a.${BASE}`,
    );
    // Con TENANT_ROUTING=path el subdominio no es un club, así que vale lo que valdría suelta.
    expect(out[0]).toEqual(
      await alone(
        { path: "/api/org/branding", headers: { "x-sm-club": "club-b" } },
        undefined,
        `club-a.${BASE}`,
      ),
    );
  });

  it("solo lecturas de la API: la sesión, el propio lote, otro origen o fuera de /api no van", async () => {
    const out = await replies(
      [
        { path: "/api/auth/get-session" },
        { path: "/api/batch" },
        { path: "/api/webhooks/stripe" },
        { path: "//otro.test/api/org" },
        { path: "https://otro.test/api/me" },
        { path: "/admin" },
        { path: "/api/me" },
      ],
      cookies.get(adminA.id),
    );
    expect(out.map((r) => r.status)).toEqual([400, 400, 400, 400, 400, 400, 200]);
  });

  it("rechaza lo que no es un lote: otro tipo de contenido, vacío o demasiado grande", async () => {
    const plain = await app.request("/api/batch", {
      method: "POST",
      headers: { host: BASE, "content-type": "text/plain" },
      body: JSON.stringify({ requests: [{ path: "/api/me" }] }),
    });
    expect(plain.status).toBe(400);
    expect((await batch([])).status).toBe(400);
    const tooMany = Array.from({ length: 21 }, () => ({ path: "/api/me" }));
    expect((await batch(tooMany)).status).toBe(400);
    expect((await app.request("/api/batch", { headers: { host: BASE } })).status).toBe(404);
  });
});

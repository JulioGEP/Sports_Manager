import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Tests de aislamiento entre clubes (ADR 0009, 0015, 0017). Dos clubes, varios usuarios,
 * sesiones reales de Better Auth y peticiones HTTP a la API con el host de cada club.
 * Si uno falla, la PR no se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };

describe("aislamiento entre clubes", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded; // org_admin del club A
  let coachB: Seeded; // coach del club B
  let both: Seeded; // coach en A y guardian en B
  let nobody: Seeded; // sesión válida, sin pertenencias
  let platform: Seeded; // administrador de plataforma, sin pertenencias
  const cookies = new Map<string, string>();

  async function signIn(user: Seeded, host: string): Promise<string> {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { host, origin: `https://${host}`, "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password: PASSWORD }),
    });
    expect(res.status, `login ${user.email}: ${await res.clone().text()}`).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
    expect(cookie).toContain("session_token");
    return cookie;
  }

  const get = (path: string, host: string, cookie?: string, env?: object) =>
    app.request(path, { headers: { host, ...(cookie ? { cookie } : {}) } }, env);

  const send = (
    method: "POST" | "DELETE",
    path: string,
    host: string,
    cookie: string,
    body?: unknown,
  ) =>
    app.request(path, {
      method,
      headers: { host, origin: `https://${host}`, cookie, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
    });
    data = createDataLayer({ config, connectionString });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
    adminA = await seeder.user({ name: "Ana Admin", email: "ana@club-a.test", password: PASSWORD });
    coachB = await seeder.user({
      name: "Bruno Coach",
      email: "bruno@club-b.test",
      password: PASSWORD,
    });
    both = await seeder.user({ name: "Carla Dos", email: "carla@ambos.test", password: PASSWORD });
    nobody = await seeder.user({
      name: "Dani Nadie",
      email: "dani@nadie.test",
      password: PASSWORD,
    });
    platform = await seeder.user({
      name: "Pau Plataforma",
      email: "pau@plataforma.test",
      password: PASSWORD,
    });
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubB.id, coachB.id, "coach");
    await seeder.membership(clubA.id, both.id, "coach");
    await seeder.membership(clubB.id, both.id, "guardian");
    await seeder.platformAdmin(platform.id);

    for (const u of [adminA, coachB, both, nobody, platform])
      cookies.set(u.id, await signIn(u, hostOf("club-a")));
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("sin cookie: 401 en el club; con host desconocido o reservado: 404", async () => {
    expect((await get("/api/org", hostOf("club-a"))).status).toBe(401);
    expect((await get("/api/org", "club-a.otro.test", cookies.get(adminA.id))).status).toBe(404);
    expect((await get("/api/org", hostOf("www"), cookies.get(adminA.id))).status).toBe(404);
    expect((await get("/api/org", hostOf("no-existe"), cookies.get(adminA.id))).status).toBe(404);
  });

  it("la misma sesión vale en todos los clubes del usuario y en cada host solo ve sus roles", async () => {
    const inA = await get("/api/org", hostOf("club-a"), cookies.get(both.id));
    expect(inA.status).toBe(200);
    const bodyA = (await inA.json()) as {
      organization: { view: string; slug: string };
      actor: { kind: string; roles: string[] };
    };
    expect(bodyA.organization).toMatchObject({ view: "full", slug: "club-a" });
    expect(bodyA.actor).toMatchObject({ kind: "member", roles: ["coach"] });

    const inB = await get("/api/org", hostOf("club-b"), cookies.get(both.id));
    expect(inB.status).toBe(200);
    const bodyB = (await inB.json()) as {
      organization: { slug: string };
      actor: { roles: string[] };
    };
    expect(bodyB.organization.slug).toBe("club-b");
    expect(bodyB.actor.roles).toEqual(["guardian"]);
  });

  it("lectura cruzada: el admin del club A no entra en el club B", async () => {
    const res = await get("/api/org", hostOf("club-b"), cookies.get(adminA.id));
    expect(res.status).toBe(403);
    expect((await get("/api/org/members", hostOf("club-b"), cookies.get(adminA.id))).status).toBe(
      403,
    );
  });

  it("escritura cruzada: el admin del club A no puede tocar roles en el club B y la base no cambia", async () => {
    const before = await seeder.rolesOf(clubB.id, coachB.id);
    const res = await send(
      "POST",
      `/api/org/members/${coachB.id}/roles`,
      hostOf("club-b"),
      cookies.get(adminA.id)!,
      { roleCode: "org_admin" },
    );
    expect(res.status).toBe(403);
    expect(await seeder.rolesOf(clubB.id, coachB.id)).toEqual(before);
  });

  it("escalada: un coach no puede asignarse roles ni ver lo que no le toca", async () => {
    const self = await send(
      "POST",
      `/api/org/members/${coachB.id}/roles`,
      hostOf("club-b"),
      cookies.get(coachB.id)!,
      { roleCode: "org_admin" },
    );
    expect(self.status).toBe(403);
    expect(await seeder.rolesOf(clubB.id, coachB.id)).toEqual(["coach"]);
    // guardian en B: no ve miembros
    expect((await get("/api/org/members", hostOf("club-b"), cookies.get(both.id))).status).toBe(
      403,
    );
    // coach en A: sí ve miembros (datos personales) pero no gestiona
    expect((await get("/api/org/members", hostOf("club-a"), cookies.get(both.id))).status).toBe(
      200,
    );
    expect(
      (
        await send(
          "DELETE",
          `/api/org/members/${adminA.id}/roles/org_admin`,
          hostOf("club-a"),
          cookies.get(both.id)!,
        )
      ).status,
    ).toBe(403);
  });

  it("platform_admin no es un rol asignable por la API", async () => {
    const res = await send(
      "POST",
      `/api/org/members/${both.id}/roles`,
      hostOf("club-a"),
      cookies.get(adminA.id)!,
      { roleCode: "platform_admin" },
    );
    expect(res.status).toBe(400);
  });

  it("el admin del club A gestiona roles solo dentro del club A", async () => {
    const assign = await send(
      "POST",
      `/api/org/members/${both.id}/roles`,
      hostOf("club-a"),
      cookies.get(adminA.id)!,
      { roleCode: "guardian" },
    );
    expect(assign.status).toBe(200);
    expect(await seeder.rolesOf(clubA.id, both.id)).toEqual(["coach", "guardian"]);
    expect(await seeder.rolesOf(clubB.id, both.id)).toEqual(["guardian"]);

    const remove = await send(
      "DELETE",
      `/api/org/members/${both.id}/roles/guardian`,
      hostOf("club-a"),
      cookies.get(adminA.id)!,
    );
    expect(remove.status).toBe(200);
    expect(await seeder.rolesOf(clubA.id, both.id)).toEqual(["coach"]);

    // no se puede dar un rol a quien no es miembro, ni quitar al último admin
    expect(
      (
        await send(
          "POST",
          `/api/org/members/${nobody.id}/roles`,
          hostOf("club-a"),
          cookies.get(adminA.id)!,
          { roleCode: "coach" },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await send(
          "DELETE",
          `/api/org/members/${adminA.id}/roles/org_admin`,
          hostOf("club-a"),
          cookies.get(adminA.id)!,
        )
      ).status,
    ).toBe(409);
  });

  it("sesión válida sin pertenencia: 403 en cualquier club", async () => {
    expect((await get("/api/org", hostOf("club-a"), cookies.get(nobody.id))).status).toBe(403);
    expect((await get("/api/org", hostOf("club-b"), cookies.get(nobody.id))).status).toBe(403);
    expect((await get("/api/org/members", hostOf("club-a"), cookies.get(nobody.id))).status).toBe(
      403,
    );
  });

  it("/api/me/memberships devuelve solo los clubes propios", async () => {
    const res = await get("/api/me/memberships", hostOf("club-a"), cookies.get(both.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      memberships: { organization: { slug: string }; roles: string[] }[];
    };
    expect(body.memberships.map((m) => [m.organization.slug, m.roles])).toEqual([
      ["club-a", ["coach"]],
      ["club-b", ["guardian"]],
    ]);
    const none = (await (
      await get("/api/me/memberships", hostOf("club-a"), cookies.get(nobody.id))
    ).json()) as { memberships: unknown[] };
    expect(none.memberships).toEqual([]);
  });

  it("administrador de plataforma: entra en modo soporte sin datos personales; con autorización vigente, lectura completa", async () => {
    const support = await get("/api/org", hostOf("club-a"), cookies.get(platform.id));
    expect(support.status).toBe(200);
    const view = (await support.json()) as {
      organization: { view: string; counts?: { membersByRole: Record<string, number> } };
      actor: { kind: string; hasGrant: boolean };
    };
    expect(view.organization.view).toBe("support");
    expect(view.organization.counts?.membersByRole).toMatchObject({ org_admin: 1, coach: 1 });
    expect(view.actor).toMatchObject({ kind: "platform_support", hasGrant: false });
    expect((await get("/api/org/members", hostOf("club-a"), cookies.get(platform.id))).status).toBe(
      403,
    );
    expect(
      (
        await send(
          "POST",
          `/api/org/members/${both.id}/roles`,
          hostOf("club-a"),
          cookies.get(platform.id)!,
          { roleCode: "guardian" },
        )
      ).status,
    ).toBe(403);

    await seeder.supportGrant(clubA.id, platform.id, 30);
    const full = await get("/api/org", hostOf("club-a"), cookies.get(platform.id));
    const fullBody = (await full.json()) as {
      organization: { view: string };
      actor: { hasGrant: boolean };
    };
    expect(fullBody.organization.view).toBe("full");
    expect(fullBody.actor.hasGrant).toBe(true);
    expect((await get("/api/org/members", hostOf("club-a"), cookies.get(platform.id))).status).toBe(
      200,
    );
    // sigue sin poder escribir, y en el club B (sin autorización) sigue en modo soporte
    expect(
      (
        await send(
          "POST",
          `/api/org/members/${both.id}/roles`,
          hostOf("club-a"),
          cookies.get(platform.id)!,
          { roleCode: "guardian" },
        )
      ).status,
    ).toBe(403);
    expect((await get("/api/org/members", hostOf("club-b"), cookies.get(platform.id))).status).toBe(
      403,
    );
  });

  it("host admin: solo administradores de plataforma", async () => {
    expect((await get("/api/platform/me", hostOf("admin"), cookies.get(platform.id))).status).toBe(
      200,
    );
    expect((await get("/api/platform/me", hostOf("admin"), cookies.get(adminA.id))).status).toBe(
      403,
    );
    expect((await get("/api/platform/me", hostOf("admin"))).status).toBe(401);
    expect((await get("/api/platform/me", hostOf("club-a"), cookies.get(platform.id))).status).toBe(
      404,
    );
  });

  it("sin subdominio o en una deploy preview se sirve el club de reserva", async () => {
    const res = await get("/api/org", BASE, cookies.get(nobody.id));
    expect(res.status).toBe(403); // el club demo existe; nobody no pertenece
    const preview = await get(
      "/api/org",
      "deploy-preview-9--hubsports.netlify.app",
      cookies.get(nobody.id),
      {
        context: { deploy: { context: "deploy-preview" } },
      },
    );
    expect(preview.status).toBe(403);
  });
});

import { NetlifyDB } from "@netlify/database-dev";
import { LOGO_MAX_BYTES } from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryLogoStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Marca y logos por club (Bloque 5, ADR 0024): la marca es pública por host, los cambios
 * exigen `org.settings.write` en ese club, y el logo de un club nunca se sirve ni se toca
 * desde otro. El almacén de ficheros es uno en memoria con la misma interfaz que Netlify Blobs.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

type Seeded = { id: string; email: string };

describe("marca y logos por club", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let adminB: Seeded;
  let both: Seeded;
  const cookies = new Map<string, string>();

  const request = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    host: string,
    options: {
      cookie?: string | undefined;
      body?: unknown;
      raw?: Uint8Array;
      contentType?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    app.request(path, {
      method,
      headers: {
        host,
        origin: `https://${host}`,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(options.contentType ? { "content-type": options.contentType } : {}),
        ...(options.headers ?? {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.raw ? { body: options.raw } : {}),
    });

  async function signIn(user: Seeded, host: string): Promise<string> {
    const res = await request("POST", "/api/auth/sign-in/email", host, {
      body: { email: user.email, password: PASSWORD },
    });
    expect(res.status).toBe(200);
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
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
      TENANT_FALLBACK_SLUG: "demo",
      TENANT_ROUTING: "subdomain",
    });
    data = createDataLayer({ config, connectionString, logoStore: createMemoryLogoStore() });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    clubB = await seeder.organization({ slug: "club-b", name: "Club B", defaultLocale: "ca" });
    adminA = await seeder.user({ name: "Ana", email: "ana@club-a.test", password: PASSWORD });
    coachA = await seeder.user({ name: "Caro", email: "caro@club-a.test", password: PASSWORD });
    adminB = await seeder.user({ name: "Bruno", email: "bruno@club-b.test", password: PASSWORD });
    both = await seeder.user({ name: "Dúo", email: "duo@ambos.test", password: PASSWORD });
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    await seeder.membership(clubA.id, both.id, "guardian");
    await seeder.membership(clubB.id, both.id, "coach");
    for (const u of [adminA, coachA, adminB, both])
      cookies.set(u.id, await signIn(u, hostOf("club-a")));
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("la marca es pública y depende solo del host", async () => {
    const a = await request("GET", "/api/org/branding", hostOf("club-a"));
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({
      slug: "club-a",
      name: "Club A",
      defaultLocale: "es",
      brandPrimaryColor: "#d71920",
      brandSecondaryColor: "#e8b52a",
      logoUrl: null,
      voice: "cercana",
    });
    expect(
      await (await request("GET", "/api/org/branding", hostOf("club-b"))).json(),
    ).toMatchObject({
      slug: "club-b",
      defaultLocale: "ca",
    });
    expect(await (await request("GET", "/api/org/branding", BASE)).json()).toMatchObject({
      slug: "demo",
    });
    expect((await request("GET", "/api/org/branding", "otro.dominio.test")).status).toBe(404);
    expect((await request("GET", "/api/org/branding", hostOf("www"))).status).toBe(404);
  });

  it("solo quien tiene org.settings.write cambia la marca, y solo la de su club", async () => {
    const patch = { name: "Club A Renombrado", brandPrimaryColor: "#123456" };
    expect(
      (
        await request("PATCH", "/api/org", hostOf("club-a"), {
          cookie: cookies.get(coachA.id),
          body: patch,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("PATCH", "/api/org", hostOf("club-a"), {
          cookie: cookies.get(adminB.id),
          body: patch,
        })
      ).status,
    ).toBe(403);
    expect((await request("PATCH", "/api/org", hostOf("club-a"), { body: patch })).status).toBe(
      401,
    );
    expect(
      (
        await request("PATCH", "/api/org", hostOf("club-a"), {
          cookie: cookies.get(adminA.id),
          body: { brandPrimaryColor: "rojo" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("PATCH", "/api/org", hostOf("club-a"), {
          cookie: cookies.get(adminA.id),
          body: {},
        })
      ).status,
    ).toBe(400);

    const ok = await request("PATCH", "/api/org", hostOf("club-a"), {
      cookie: cookies.get(adminA.id),
      body: patch,
    });
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect(await ok.json()).toMatchObject({
      organization: { view: "full", name: "Club A Renombrado", brandPrimaryColor: "#123456" },
    });
    expect(
      await (await request("GET", "/api/org/branding", hostOf("club-a"))).json(),
    ).toMatchObject({
      name: "Club A Renombrado",
      brandPrimaryColor: "#123456",
    });
    expect(
      await (await request("GET", "/api/org/branding", hostOf("club-b"))).json(),
    ).toMatchObject({
      name: "Club B",
      brandPrimaryColor: "#d71920",
    });
  });

  it("logo: validación, subida, servicio con caché, aislamiento y borrado", async () => {
    const admin = cookies.get(adminA.id)!;
    expect((await request("GET", "/api/org/logo", hostOf("club-a"))).status).toBe(404);

    // formato declarado no admitido, contenido que no coincide, demasiado grande, sin permiso
    expect(
      (
        await request("PUT", "/api/org/logo", hostOf("club-a"), {
          cookie: admin,
          raw: PNG,
          contentType: "image/svg+xml",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await request("PUT", "/api/org/logo", hostOf("club-a"), {
          cookie: admin,
          raw: JPEG,
          contentType: "image/png",
        })
      ).status,
    ).toBe(415);
    const huge = new Uint8Array(LOGO_MAX_BYTES + 1);
    huge.set(PNG);
    expect(
      (
        await request("PUT", "/api/org/logo", hostOf("club-a"), {
          cookie: admin,
          raw: huge,
          contentType: "image/png",
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await request("PUT", "/api/org/logo", hostOf("club-a"), {
          cookie: cookies.get(coachA.id),
          raw: PNG,
          contentType: "image/png",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("PUT", "/api/org/logo", hostOf("club-a"), {
          cookie: cookies.get(adminB.id),
          raw: PNG,
          contentType: "image/png",
        })
      ).status,
    ).toBe(403);

    const up = await request("PUT", "/api/org/logo", hostOf("club-a"), {
      cookie: admin,
      raw: PNG,
      contentType: "image/png",
    });
    expect(up.status, await up.clone().text()).toBe(200);
    const branding = (await up.json()) as { logoUrl: string | null };
    expect(branding.logoUrl).toMatch(/^\/api\/org\/logo\?club=club-a&v=[0-9a-f-]{36}$/);
    expect(branding.logoUrl).not.toContain(clubA.id);

    const served = await request("GET", "/api/org/logo", hostOf("club-a"));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toContain("max-age");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
    const etag = served.headers.get("etag")!;
    expect(
      (
        await request("GET", "/api/org/logo", hostOf("club-a"), {
          headers: { "if-none-match": etag },
        })
      ).status,
    ).toBe(304);

    // el logo de A no existe para B ni para hosts desconocidos
    expect((await request("GET", "/api/org/logo", hostOf("club-b"))).status).toBe(404);
    expect((await request("GET", "/api/org/logo", "otro.dominio.test")).status).toBe(404);
    expect(
      await (await request("GET", "/api/org/branding", hostOf("club-b"))).json(),
    ).toMatchObject({ logoUrl: null });

    // /api/me/memberships: url por club y logo absoluto solo donde lo hay
    const me = await request("GET", "/api/me/memberships", hostOf("club-a"), {
      cookie: cookies.get(both.id),
    });
    const body = (await me.json()) as {
      memberships: { organization: { slug: string; url: string; logoUrl: string | null } }[];
    };
    const byslug = Object.fromEntries(
      body.memberships.map((m) => [m.organization.slug, m.organization]),
    );
    expect(byslug["club-a"]?.url).toBe("http://club-a.sportsmanager.test");
    expect(byslug["club-a"]?.logoUrl).toMatch(
      /^http:\/\/club-a\.sportsmanager\.test\/api\/org\/logo\?club=club-a&v=/,
    );
    expect(byslug["club-b"]).toMatchObject({
      url: "http://club-b.sportsmanager.test",
      logoUrl: null,
    });

    // borrado
    expect(
      (
        await request("DELETE", "/api/org/logo", hostOf("club-a"), {
          cookie: cookies.get(coachA.id),
        })
      ).status,
    ).toBe(403);
    const del = await request("DELETE", "/api/org/logo", hostOf("club-a"), { cookie: admin });
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ logoUrl: null });
    expect((await request("GET", "/api/org/logo", hostOf("club-a"))).status).toBe(404);
  });
});

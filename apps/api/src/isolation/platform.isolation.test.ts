import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryLogoStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Admin interno (Bloque 6, ADR 0022 y 0023): solo administradores de plataforma, por tabla o
 * por email en PLATFORM_ADMIN_EMAILS; crear clubes, editarlos, invitar al primer administrador
 * y auditar. Dentro de un club, el administrador de plataforma sigue en modo soporte.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);

type Seeded = { id: string; email: string };

describe("admin interno", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let root: Seeded; // administrador por variable de entorno
  let tableAdmin: Seeded; // administrador por tabla
  let adminA: Seeded; // org_admin del club A
  let nobody: Seeded;
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
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.raw ? { body: options.raw } : {}),
    });

  async function signIn(email: string, password: string, host: string) {
    const res = await request("POST", "/api/auth/sign-in/email", host, {
      body: { email, password },
    });
    return {
      status: res.status,
      cookie: res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0] ?? "")
        .join("; "),
    };
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
      PLATFORM_ADMIN_EMAILS: "Root@Plataforma.test, otra@plataforma.test",
    });
    data = createDataLayer({ config, connectionString, logoStore: createMemoryLogoStore() });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    root = await seeder.user({ name: "Root", email: "root@plataforma.test", password: PASSWORD });
    tableAdmin = await seeder.user({
      name: "Tabla",
      email: "tabla@plataforma.test",
      password: PASSWORD,
    });
    adminA = await seeder.user({ name: "Ana", email: "ana@club-a.test", password: PASSWORD });
    nobody = await seeder.user({ name: "Nadie", email: "nadie@test.test", password: PASSWORD });
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.platformAdmin(tableAdmin.id);
    for (const u of [root, tableAdmin, adminA, nobody]) {
      const { status, cookie } = await signIn(u.email, PASSWORD, BASE);
      expect(status).toBe(200);
      cookies.set(u.id, cookie);
    }
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("el alta del primer administrador solo vale para emails autorizados y sin cuenta (ADR 0026)", async () => {
    const setup = (body: unknown, host = BASE) =>
      request("POST", "/api/platform-setup", host, { body });

    // Email fuera de PLATFORM_ADMIN_EMAILS: nada que crear, aunque el resto sea correcto.
    const forbidden = await setup({ email: "intruso@test.test", name: "X", password: PASSWORD });
    expect(forbidden.status).toBe(403);
    expect(await seeder.userByEmail("intruso@test.test")).toBeNull();

    // Email autorizado que ya tiene cuenta: no se pisa ni se cambia la contraseña.
    const exists = await setup({ email: "root@plataforma.test", name: "X", password: "otra-1234" });
    expect(exists.status).toBe(409);
    expect((await signIn("root@plataforma.test", PASSWORD, BASE)).status).toBe(200);

    // Email autorizado sin cuenta: se crea, inicia sesión y ya es administrador en cualquier host.
    const created = await setup(
      { email: "Otra@Plataforma.test", name: "Otra", password: PASSWORD },
      hostOf("club-a"),
    );
    expect(created.status).toBe(201);
    const cookie = created.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
    expect(cookie).toContain("session");
    const me = await request("GET", "/api/platform/me", BASE, { cookie });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { platformAdmin: boolean }).platformAdmin).toBe(true);

    // Segunda vez con el mismo email: la cuenta ya existe.
    const again = await setup({ email: "otra@plataforma.test", name: "Otra", password: PASSWORD });
    expect(again.status).toBe(409);

    // Queda en la auditoría, sin club.
    const audit = await request("GET", "/api/platform/audit?limit=5", BASE, {
      cookie: cookies.get(root.id),
    });
    const { entries } = (await audit.json()) as {
      entries: { action: string; target: string | null }[];
    };
    expect(
      entries.some(
        (e) => e.action === "platform.admin_created" && e.target === "otra@plataforma.test",
      ),
    ).toBe(true);
  });

  it("solo administradores de plataforma, por tabla o por email, en cualquier host", async () => {
    for (const host of [BASE, hostOf("club-a"), hostOf("admin")]) {
      expect((await request("GET", "/api/platform/organizations", host)).status).toBe(401);
      expect(
        (
          await request("GET", "/api/platform/organizations", host, {
            cookie: cookies.get(nobody.id),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request("GET", "/api/platform/organizations", host, {
            cookie: cookies.get(adminA.id),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request("GET", "/api/platform/organizations", host, {
            cookie: cookies.get(root.id),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request("GET", "/api/platform/organizations", host, {
            cookie: cookies.get(tableAdmin.id),
          })
        ).status,
      ).toBe(200);
    }
    const me = await request("GET", "/api/me", BASE, { cookie: cookies.get(root.id) });
    expect(await me.json()).toMatchObject({ platformAdmin: true });
    const meA = await request("GET", "/api/me", BASE, { cookie: cookies.get(adminA.id) });
    expect(await meA.json()).toMatchObject({ platformAdmin: false });
  });

  it("crea clubes con validación de subdominio y deporte, sin duplicados", async () => {
    const rootCookie = cookies.get(root.id);
    const base = {
      name: "Club Nuevo",
      defaultLocale: "ca",
      defaultSportCode: "futsal",
      brandPrimaryColor: "#112233",
      brandSecondaryColor: "#445566",
    };
    expect(
      (
        await request("POST", "/api/platform/organizations", BASE, {
          cookie: rootCookie,
          body: { ...base, slug: "admin" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("POST", "/api/platform/organizations", BASE, {
          cookie: rootCookie,
          body: { ...base, slug: "Club Nuevo" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("POST", "/api/platform/organizations", BASE, {
          cookie: rootCookie,
          body: { ...base, slug: "nuevo", defaultSportCode: "curling" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("POST", "/api/platform/organizations", BASE, {
          cookie: cookies.get(adminA.id),
          body: { ...base, slug: "nuevo" },
        })
      ).status,
    ).toBe(403);

    const created = await request("POST", "/api/platform/organizations", BASE, {
      cookie: rootCookie,
      body: { ...base, slug: "nuevo" },
    });
    expect(created.status, await created.clone().text()).toBe(201);
    expect(await created.json()).toMatchObject({
      organization: {
        slug: "nuevo",
        name: "Club Nuevo",
        status: "active",
        defaultLocale: "ca",
        sport: { code: "futsal" },
        url: "http://nuevo.sportsmanager.test",
        logoUrl: null,
        counts: { members: 0, pendingInvitations: 0 },
      },
    });
    expect(
      (
        await request("POST", "/api/platform/organizations", BASE, {
          cookie: rootCookie,
          body: { ...base, slug: "nuevo" },
        })
      ).status,
    ).toBe(409);

    const list = (await (
      await request("GET", "/api/platform/organizations", BASE, { cookie: rootCookie })
    ).json()) as {
      organizations: { slug: string; counts: { members: number } }[];
    };
    expect(list.organizations.map((o) => o.slug).sort()).toEqual(["club-a", "demo", "nuevo"]);
    expect(list.organizations.find((o) => o.slug === "club-a")?.counts.members).toBe(1);

    // el club nuevo ya responde en su host
    expect(await (await request("GET", "/api/org/branding", hostOf("nuevo"))).json()).toMatchObject(
      { slug: "nuevo", name: "Club Nuevo" },
    );
  });

  it("edita marca y estado; un club suspendido deja de servirse", async () => {
    const rootCookie = cookies.get(root.id);
    expect(
      (
        await request("PATCH", "/api/platform/organizations/nuevo", BASE, {
          cookie: rootCookie,
          body: {},
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("PATCH", "/api/platform/organizations/no-existe", BASE, {
          cookie: rootCookie,
          body: { name: "X" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request("PATCH", "/api/platform/organizations/nuevo", BASE, {
          cookie: cookies.get(adminA.id),
          body: { name: "X" },
        })
      ).status,
    ).toBe(403);

    const suspended = await request("PATCH", "/api/platform/organizations/nuevo", BASE, {
      cookie: rootCookie,
      body: { name: "Club Nuevo 2", brandPrimaryColor: "#abcdef", status: "suspended" },
    });
    expect(suspended.status).toBe(200);
    expect(await suspended.json()).toMatchObject({
      organization: { name: "Club Nuevo 2", brandPrimaryColor: "#abcdef", status: "suspended" },
    });
    expect((await request("GET", "/api/org/branding", hostOf("nuevo"))).status).toBe(403);

    const active = await request("PATCH", "/api/platform/organizations/nuevo", BASE, {
      cookie: rootCookie,
      body: { status: "active" },
    });
    expect(active.status).toBe(200);
    expect((await request("GET", "/api/org/branding", hostOf("nuevo"))).status).toBe(200);

    const logo = await request("PUT", "/api/platform/organizations/nuevo/logo", BASE, {
      cookie: rootCookie,
      raw: PNG,
      contentType: "image/png",
    });
    expect(logo.status, await logo.clone().text()).toBe(200);
    const body = (await logo.json()) as { organization: { logoUrl: string | null } };
    expect(body.organization.logoUrl).toMatch(
      /^http:\/\/nuevo\.sportsmanager\.test\/api\/org\/logo\?v=/,
    );
    expect((await request("GET", "/api/org/logo", hostOf("nuevo"))).status).toBe(200);
    expect(
      (
        await request("PUT", "/api/platform/organizations/nuevo/logo", BASE, {
          cookie: rootCookie,
          raw: PNG,
          contentType: "image/gif",
        })
      ).status,
    ).toBe(415);
    const removed = await request("DELETE", "/api/platform/organizations/nuevo/logo", BASE, {
      cookie: rootCookie,
    });
    expect(await removed.json()).toMatchObject({ organization: { logoUrl: null } });
  });

  it("invita al primer administrador con el enlace en el host del club y la persona entra como org_admin", async () => {
    const rootCookie = cookies.get(root.id);
    expect(
      (
        await request("POST", "/api/platform/organizations/nuevo/invitations", BASE, {
          cookie: cookies.get(adminA.id),
          body: { email: "x@y.test" },
        })
      ).status,
    ).toBe(403);
    const res = await request("POST", "/api/platform/organizations/nuevo/invitations", BASE, {
      cookie: rootCookie,
      body: { email: "Primera@Admin.test" },
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const sent = (await res.json()) as {
      invitation: { roleCode: string; locale: string };
      acceptUrl: string | null;
    };
    expect(sent.invitation).toMatchObject({ roleCode: "org_admin", locale: "ca" });
    expect(sent.acceptUrl).toMatch(
      /^http:\/\/nuevo\.sportsmanager\.test\/invitations\/[A-Za-z0-9_-]{43}$/,
    );
    expect(await seeder.lastEmailTo("primera@admin.test")).toMatchObject({
      template: "invitation",
      locale: "ca",
    });
    expect(
      (
        await request("POST", "/api/platform/organizations/nuevo/invitations", BASE, {
          cookie: rootCookie,
          body: { email: "primera@admin.test" },
        })
      ).status,
    ).toBe(409);

    const token = sent.acceptUrl!.split("/invitations/")[1]!;
    const accepted = await request("POST", `/api/invitations/${token}/accept`, hostOf("nuevo"), {
      body: { name: "Primera Admin", password: "123456" },
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    expect(await accepted.json()).toMatchObject({
      organization: { slug: "nuevo" },
      roles: ["org_admin"],
      accountCreated: true,
    });

    const detail = (await (
      await request("GET", "/api/platform/organizations/nuevo", BASE, { cookie: rootCookie })
    ).json()) as {
      organization: { counts: { members: number } };
      myInvitations: { email: string; state: string }[];
    };
    expect(detail.organization.counts.members).toBe(1);
    expect(detail.myInvitations).toEqual([
      expect.objectContaining({ email: "primera@admin.test", state: "accepted" }),
    ]);
    const admins = (await (
      await request("GET", "/api/platform/organizations/nuevo/admins", BASE, { cookie: rootCookie })
    ).json()) as {
      admins: { email: string; name: string }[];
    };
    expect(admins.admins).toEqual([
      expect.objectContaining({ email: "primera@admin.test", name: "Primera Admin" }),
    ]);
    expect(
      (
        await request("GET", "/api/platform/organizations/nuevo/admins", BASE, {
          cookie: cookies.get(adminA.id),
        })
      ).status,
    ).toBe(403);
    // otro administrador no ve las invitaciones hechas por root
    const other = (await (
      await request("GET", "/api/platform/organizations/nuevo", BASE, {
        cookie: cookies.get(tableAdmin.id),
      })
    ).json()) as { myInvitations: unknown[] };
    expect(other.myInvitations).toEqual([]);
  });

  it("dentro de un club, el administrador de plataforma sigue en modo soporte (ADR 0017)", async () => {
    const rootCookie = cookies.get(root.id);
    const org = await request("GET", "/api/org", hostOf("nuevo"), { cookie: rootCookie });
    expect(org.status).toBe(200);
    expect(await org.json()).toMatchObject({
      organization: { view: "support" },
      actor: { kind: "platform_support" },
    });
    expect(
      (await request("GET", "/api/org/members", hostOf("nuevo"), { cookie: rootCookie })).status,
    ).toBe(403);
    expect(
      (
        await request("PATCH", "/api/org", hostOf("nuevo"), {
          cookie: rootCookie,
          body: { name: "Hack" },
        })
      ).status,
    ).toBe(403);
  });

  it("la auditoría registra quién hizo qué y solo la leen administradores de plataforma", async () => {
    expect(
      (await request("GET", "/api/platform/audit", BASE, { cookie: cookies.get(adminA.id) }))
        .status,
    ).toBe(403);
    const res = await request("GET", "/api/platform/audit?limit=50", BASE, {
      cookie: cookies.get(root.id),
    });
    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as {
      entries: {
        action: string;
        actorEmail: string | null;
        organizationSlug: string | null;
        target: string | null;
      }[];
    };
    const actions = entries.map((e) => e.action);
    for (const action of [
      "organization.created",
      "organization.updated",
      "organization.logo_updated",
      "organization.logo_removed",
      "invitation.created",
      "invitation.accepted",
    ]) {
      expect(actions, action).toContain(action);
    }
    expect(entries.find((e) => e.action === "organization.created")).toMatchObject({
      actorEmail: "root@plataforma.test",
      organizationSlug: "nuevo",
      target: "nuevo",
    });
    expect(entries.find((e) => e.action === "invitation.accepted")).toMatchObject({
      actorEmail: "primera@admin.test",
      target: "primera@admin.test",
    });
    expect(
      (await request("GET", "/api/platform/audit?limit=0", BASE, { cookie: cookies.get(root.id) }))
        .status,
    ).toBe(400);
  });
});

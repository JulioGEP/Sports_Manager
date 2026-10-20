import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Invitaciones y recuperación de contraseña (ADR 0018, 0019, 0020) contra una base real:
 * dos clubes, varios usuarios, emails capturados en `email_outbox` y peticiones HTTP a la API
 * con el host de cada club. Si uno falla, la PR no se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };
type Sent = {
  invitation: { id: string; state: string; locale: string };
  emailStatus: string;
  acceptUrl: string | null;
};

describe("invitaciones y recuperación de contraseña", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let adminB: Seeded;
  let platform: Seeded;
  const cookies = new Map<string, string>();

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");

  const request = (
    method: "GET" | "POST" | "DELETE",
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

  async function signIn(email: string, password: string, host: string) {
    const res = await request("POST", "/api/auth/sign-in/email", host, {
      body: { email, password },
    });
    return { status: res.status, cookie: cookieOf(res) };
  }

  async function invite(
    host: string,
    cookie: string,
    body: { email: string; roleCode: string; locale?: string },
  ) {
    return request("POST", "/api/org/invitations", host, { cookie, body });
  }

  const tokenOf = (acceptUrl: string) => acceptUrl.split("/invitations/")[1] ?? "";

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
      EMAIL_TRANSPORT: "outbox",
    });
    data = createDataLayer({ config, connectionString });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A", defaultLocale: "es" });
    clubB = await seeder.organization({ slug: "club-b", name: "Club B", defaultLocale: "ca" });
    adminA = await seeder.user({ name: "Ana Admin", email: "ana@club-a.test", password: PASSWORD });
    coachA = await seeder.user({
      name: "Caro Coach",
      email: "caro@club-a.test",
      password: PASSWORD,
    });
    adminB = await seeder.user({
      name: "Bruno Admin",
      email: "bruno@club-b.test",
      password: PASSWORD,
      locale: "ca",
    });
    platform = await seeder.user({
      name: "Pau Plataforma",
      email: "pau@plataforma.test",
      password: PASSWORD,
    });
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    await seeder.platformAdmin(platform.id);

    for (const u of [adminA, coachA, adminB, platform]) {
      const { status, cookie } = await signIn(u.email, PASSWORD, hostOf("club-a"));
      expect(status, `login ${u.email}`).toBe(200);
      cookies.set(u.id, cookie);
    }
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("solo quien tiene permiso invita: coach 403, soporte de plataforma 403, sin sesión 401", async () => {
    const body = { email: "nueva@persona.test", roleCode: "coach" };
    expect((await invite(hostOf("club-a"), cookies.get(coachA.id)!, body)).status).toBe(403);
    expect((await invite(hostOf("club-a"), cookies.get(platform.id)!, body)).status).toBe(403);
    expect((await request("POST", "/api/org/invitations", hostOf("club-a"), { body })).status).toBe(
      401,
    );
    // el admin del club B no invita en el club A
    expect((await invite(hostOf("club-a"), cookies.get(adminB.id)!, body)).status).toBe(403);
    expect(await seeder.invitationStatus(clubA.id, body.email)).toEqual([]);
  });

  it("platform_admin no es invitable y el email se valida", async () => {
    const admin = cookies.get(adminA.id)!;
    expect(
      (await invite(hostOf("club-a"), admin, { email: "x@y.test", roleCode: "platform_admin" }))
        .status,
    ).toBe(400);
    expect(
      (await invite(hostOf("club-a"), admin, { email: "no-es-email", roleCode: "coach" })).status,
    ).toBe(400);
  });

  it("invitar a una persona nueva: email en el idioma del club, enlace en el host del club y una sola pendiente por email", async () => {
    const admin = cookies.get(adminA.id)!;
    const res = await invite(hostOf("club-a"), admin, {
      email: "Nueva@Persona.test",
      roleCode: "coach",
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const sent = (await res.json()) as Sent;
    expect(sent.invitation.state).toBe("pending");
    expect(sent.invitation.locale).toBe("es");
    expect(sent.emailStatus).toBe("queued");
    expect(sent.acceptUrl).toMatch(
      /^http:\/\/club-a\.sportsmanager\.test\/invitations\/[A-Za-z0-9_-]{43}$/,
    );

    const email = await seeder.lastEmailTo("nueva@persona.test");
    expect(email).toMatchObject({
      template: "invitation",
      locale: "es",
      status: "queued",
      transport: "outbox",
      organizationId: clubA.id,
    });
    expect(email?.subject).toBe("Club A te invita a unirte");
    expect(email?.textBody).toContain(sent.acceptUrl);
    expect(email?.textBody).toContain("Ana Admin");
    expect(email?.textBody).toContain("Entrenador");

    const again = await invite(hostOf("club-a"), admin, {
      email: "nueva@persona.test",
      roleCode: "guardian",
    });
    expect(again.status).toBe(409);
    expect(await seeder.countEmailsTo("nueva@persona.test")).toBe(1);
  });

  it("el idioma del email lo elige quien invita", async () => {
    const res = await invite(hostOf("club-a"), cookies.get(adminA.id)!, {
      email: "english@persona.test",
      roleCode: "guardian",
      locale: "en",
    });
    expect(res.status).toBe(201);
    const email = await seeder.lastEmailTo("english@persona.test");
    expect(email?.locale).toBe("en");
    expect(email?.subject).toBe("Club A invites you to join");
    expect(email?.textBody).toContain("Guardian");
  });

  it("el token de un club no sirve en otro club ni en un host desconocido", async () => {
    const res = await invite(hostOf("club-a"), cookies.get(adminA.id)!, {
      email: "cruzada@persona.test",
      roleCode: "coach",
    });
    const { acceptUrl } = (await res.json()) as Sent;
    const token = tokenOf(acceptUrl!);
    expect((await request("GET", `/api/invitations/${token}`, hostOf("club-a"))).status).toBe(200);
    expect((await request("GET", `/api/invitations/${token}`, hostOf("club-b"))).status).toBe(404);
    expect((await request("GET", `/api/invitations/${token}`, "otro.dominio.test")).status).toBe(
      404,
    );
    expect(
      (
        await request("POST", `/api/invitations/${token}/accept`, hostOf("club-b"), {
          body: { name: "X", password: "123456" },
        })
      ).status,
    ).toBe(404);
    expect(await seeder.userByEmail("cruzada@persona.test")).toBeNull();
    // tokens inventados: 404 sin tocar nada
    expect((await request("GET", "/api/invitations/no-existe", hostOf("club-a"))).status).toBe(404);
    expect(
      (await request("GET", `/api/invitations/${"a".repeat(43)}`, hostOf("club-a"))).status,
    ).toBe(404);
  });

  it("aceptar sin cuenta: crea la cuenta, entra con sesión, obtiene el rol y el token deja de valer", async () => {
    const admin = cookies.get(adminA.id)!;
    const res = await invite(hostOf("club-a"), admin, {
      email: "nuevo@coach.test",
      roleCode: "coach",
    });
    const { acceptUrl } = (await res.json()) as Sent;
    const token = tokenOf(acceptUrl!);

    const pub = await request("GET", `/api/invitations/${token}`, hostOf("club-a"));
    expect(await pub.json()).toMatchObject({
      organization: { slug: "club-a", name: "Club A" },
      email: "nuevo@coach.test",
      roleCode: "coach",
      state: "pending",
      hasAccount: false,
    });

    const path = `/api/invitations/${token}/accept`;
    expect((await request("POST", path, hostOf("club-a"), { body: {} })).status).toBe(400);
    expect(
      (
        await request("POST", path, hostOf("club-a"), {
          body: { name: "Nuevo", password: "12345" },
        })
      ).status,
    ).toBe(400);

    const accepted = await request("POST", path, hostOf("club-a"), {
      body: { name: "Nuevo Coach", password: "123456" },
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    expect(await accepted.json()).toEqual({
      organization: { slug: "club-a", name: "Club A" },
      roles: ["coach"],
      accountCreated: true,
    });
    const cookie = cookieOf(accepted);
    expect(cookie).toContain("session_token");

    const me = await request("GET", "/api/org", hostOf("club-a"), { cookie });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ actor: { kind: "member", roles: ["coach"] } });
    expect((await request("GET", "/api/org", hostOf("club-b"), { cookie })).status).toBe(403);

    const user = await seeder.userByEmail("nuevo@coach.test");
    expect(user?.name).toBe("Nuevo Coach");
    expect(await seeder.rolesOf(clubA.id, user!.id)).toEqual(["coach"]);
    expect(await seeder.invitationStatus(clubA.id, "nuevo@coach.test")).toEqual(["accepted"]);

    // segunda aceptación: ya aceptada; el login normal funciona con la contraseña elegida
    expect(
      (
        await request("POST", path, hostOf("club-a"), {
          body: { name: "Otro", password: "123456" },
        })
      ).status,
    ).toBe(409);
    expect((await signIn("nuevo@coach.test", "123456", hostOf("club-a"))).status).toBe(200);
  });

  it("usuario existente: acepta con su sesión y suma el club; sin sesión 401; con otra sesión 403", async () => {
    const admin = cookies.get(adminA.id)!;
    const res = await invite(hostOf("club-a"), admin, {
      email: adminB.email,
      roleCode: "guardian",
    });
    expect(res.status).toBe(201);
    const { acceptUrl } = (await res.json()) as Sent;
    const token = tokenOf(acceptUrl!);
    const path = `/api/invitations/${token}/accept`;

    const pub = (await (
      await request("GET", `/api/invitations/${token}`, hostOf("club-a"))
    ).json()) as {
      hasAccount: boolean;
    };
    expect(pub.hasAccount).toBe(true);

    expect((await request("POST", path, hostOf("club-a"), { body: {} })).status).toBe(401);
    const other = await request("POST", path, hostOf("club-a"), {
      cookie: cookies.get(coachA.id)!,
      body: {},
    });
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ error: { code: "invitation_email_mismatch" } });
    expect(await seeder.rolesOf(clubA.id, adminB.id)).toEqual([]);

    const ok = await request("POST", path, hostOf("club-a"), {
      cookie: cookies.get(adminB.id)!,
      body: {},
    });
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect(await ok.json()).toEqual({
      organization: { slug: "club-a", name: "Club A" },
      roles: ["guardian"],
      accountCreated: false,
    });
    expect(await seeder.rolesOf(clubA.id, adminB.id)).toEqual(["guardian"]);
    expect(await seeder.rolesOf(clubB.id, adminB.id)).toEqual(["org_admin"]);

    // ya tiene ese rol: una nueva invitación con el mismo rol se rechaza; con otro rol, no
    expect(
      (await invite(hostOf("club-a"), admin, { email: adminB.email, roleCode: "guardian" })).status,
    ).toBe(409);
    expect(
      (await invite(hostOf("club-a"), admin, { email: adminB.email, roleCode: "coach" })).status,
    ).toBe(201);
  });

  it("una sesión ajena no puede aceptar una invitación a un email sin cuenta", async () => {
    const res = await invite(hostOf("club-a"), cookies.get(adminA.id)!, {
      email: "sin-cuenta@persona.test",
      roleCode: "guardian",
    });
    const { acceptUrl } = (await res.json()) as Sent;
    const blocked = await request(
      "POST",
      `/api/invitations/${tokenOf(acceptUrl!)}/accept`,
      hostOf("club-a"),
      {
        cookie: cookies.get(coachA.id)!,
        body: { name: "Impostor", password: "123456" },
      },
    );
    expect(blocked.status).toBe(403);
    expect(await seeder.userByEmail("sin-cuenta@persona.test")).toBeNull();
  });

  it("reenviar cambia el enlace y revocar lo anula; ambas solo desde el propio club", async () => {
    const admin = cookies.get(adminA.id)!;
    const res = await invite(hostOf("club-a"), admin, {
      email: "reenvio@persona.test",
      roleCode: "coach",
    });
    const first = (await res.json()) as Sent;
    const id = first.invitation.id;

    expect(
      (
        await request("POST", `/api/org/invitations/${id}/resend`, hostOf("club-b"), {
          cookie: cookies.get(adminB.id)!,
          body: {},
        })
      ).status,
    ).toBe(404);

    const resent = await request("POST", `/api/org/invitations/${id}/resend`, hostOf("club-a"), {
      cookie: admin,
      body: {},
    });
    expect(resent.status).toBe(200);
    const second = (await resent.json()) as Sent;
    expect(second.acceptUrl).not.toBe(first.acceptUrl);
    expect(await seeder.countEmailsTo("reenvio@persona.test")).toBe(2);
    expect(
      (await request("GET", `/api/invitations/${tokenOf(first.acceptUrl!)}`, hostOf("club-a")))
        .status,
    ).toBe(404);
    expect(
      (await request("GET", `/api/invitations/${tokenOf(second.acceptUrl!)}`, hostOf("club-a")))
        .status,
    ).toBe(200);

    expect(
      (
        await request("DELETE", `/api/org/invitations/${id}`, hostOf("club-b"), {
          cookie: cookies.get(adminB.id)!,
        })
      ).status,
    ).toBe(404);
    const revoked = await request("DELETE", `/api/org/invitations/${id}`, hostOf("club-a"), {
      cookie: admin,
    });
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toMatchObject({ invitation: { state: "revoked" } });
    expect(
      (await request("GET", `/api/invitations/${tokenOf(second.acceptUrl!)}`, hostOf("club-a")))
        .status,
    ).toBe(404);
    expect(
      (
        await request("POST", `/api/org/invitations/${id}/resend`, hostOf("club-a"), {
          cookie: admin,
          body: {},
        })
      ).status,
    ).toBe(404);

    const list = (await (
      await request("GET", "/api/org/invitations", hostOf("club-a"), { cookie: admin })
    ).json()) as {
      invitations: { email: string; state: string }[];
    };
    expect(list.invitations.find((i) => i.email === "reenvio@persona.test")?.state).toBe("revoked");
    expect(
      (
        await request("GET", "/api/org/invitations", hostOf("club-a"), {
          cookie: cookies.get(coachA.id)!,
        })
      ).status,
    ).toBe(403);
  });

  it("una invitación caducada se ve como caducada y no se puede aceptar", async () => {
    const res = await invite(hostOf("club-a"), cookies.get(adminA.id)!, {
      email: "tarde@persona.test",
      roleCode: "coach",
    });
    const { acceptUrl } = (await res.json()) as Sent;
    const token = tokenOf(acceptUrl!);
    await seeder.expireInvitation(clubA.id, "tarde@persona.test");
    const pub = await request("GET", `/api/invitations/${token}`, hostOf("club-a"));
    expect(pub.status).toBe(200);
    expect(await pub.json()).toMatchObject({ state: "expired" });
    const accept = await request("POST", `/api/invitations/${token}/accept`, hostOf("club-a"), {
      body: { name: "Tarde", password: "123456" },
    });
    expect(accept.status).toBe(410);
    expect(await accept.json()).toMatchObject({ error: { code: "invitation_expired" } });
    expect(await seeder.userByEmail("tarde@persona.test")).toBeNull();
  });

  it("login erróneo 401; cerrar sesión invalida la cookie", async () => {
    expect((await signIn(adminA.email, "incorrecta", hostOf("club-a"))).status).toBe(401);
    const { cookie } = await signIn(coachA.email, PASSWORD, hostOf("club-a"));
    expect((await request("GET", "/api/me", hostOf("club-a"), { cookie })).status).toBe(200);
    const out = await request("POST", "/api/auth/sign-out", hostOf("club-a"), { cookie, body: {} });
    expect(out.status).toBe(200);
    expect((await request("GET", "/api/me", hostOf("club-a"), { cookie })).status).toBe(401);
  });

  it("restablecer contraseña: email con enlace al host del club, en el idioma del usuario; la contraseña cambia y las sesiones anteriores se cierran", async () => {
    const before = await seeder.countEmailsTo(adminB.email);
    const req = await request("POST", "/api/auth/request-password-reset", hostOf("club-b"), {
      body: { email: adminB.email },
    });
    expect(req.status, await req.clone().text()).toBe(200);
    const email = await seeder.lastEmailTo(adminB.email);
    expect(await seeder.countEmailsTo(adminB.email)).toBe(before + 1);
    expect(email).toMatchObject({
      template: "password_reset",
      locale: "ca",
      organizationId: clubB.id,
    });
    expect(email?.subject).toBe("Restableix la contrasenya");
    expect(email?.textBody).toContain("Club B");
    const match = /http:\/\/club-b\.sportsmanager\.test\/reset-password\?token=([^\s]+)/.exec(
      email?.textBody ?? "",
    );
    expect(match).not.toBeNull();
    const token = decodeURIComponent(match![1]!);

    const oldCookie = cookies.get(adminB.id)!;
    expect((await request("GET", "/api/me", hostOf("club-b"), { cookie: oldCookie })).status).toBe(
      200,
    );

    const bad = await request("POST", "/api/auth/reset-password", hostOf("club-b"), {
      body: { token: "no-vale", newPassword: "nueva-contraseña-456" },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const reset = await request("POST", "/api/auth/reset-password", hostOf("club-b"), {
      body: { token, newPassword: "nueva-contraseña-456" },
    });
    expect(reset.status, await reset.clone().text()).toBe(200);

    expect((await request("GET", "/api/me", hostOf("club-b"), { cookie: oldCookie })).status).toBe(
      401,
    );
    expect((await signIn(adminB.email, PASSWORD, hostOf("club-b"))).status).toBe(401);
    const fresh = await signIn(adminB.email, "nueva-contraseña-456", hostOf("club-b"));
    expect(fresh.status).toBe(200);
    cookies.set(adminB.id, fresh.cookie);
    // el mismo enlace no vale dos veces
    expect(
      (
        await request("POST", "/api/auth/reset-password", hostOf("club-b"), {
          body: { token, newPassword: "otra-mas-789" },
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it("pedir restablecer para un email sin cuenta no revela nada ni genera email", async () => {
    const res = await request("POST", "/api/auth/request-password-reset", hostOf("club-a"), {
      body: { email: "nadie@persona.test" },
    });
    expect(res.status).toBe(200);
    expect(await seeder.countEmailsTo("nadie@persona.test")).toBe(0);
  });

  it("el enlace de restablecer nunca apunta a un host ajeno", async () => {
    const res = await request("POST", "/api/auth/request-password-reset", "atacante.example", {
      body: { email: adminA.email },
    });
    expect(res.status).toBe(200);
    const email = await seeder.lastEmailTo(adminA.email);
    expect(email?.textBody).toContain(`http://${BASE}/reset-password?token=`);
    expect(email?.textBody).not.toContain("atacante.example");
  });

  it("el administrador del club demo entra con la contraseña de prueba en el host base", async () => {
    const { status, cookie } = await signIn("admin@demo.test", "123456", BASE);
    expect(status).toBe(200);
    const org = await request("GET", "/api/org", BASE, { cookie });
    expect(org.status).toBe(200);
    expect(await org.json()).toMatchObject({
      organization: { view: "full", slug: "demo" },
      actor: { kind: "member", roles: ["org_admin"] },
    });
  });
});

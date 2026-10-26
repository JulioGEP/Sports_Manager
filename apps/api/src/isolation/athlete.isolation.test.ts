import { NetlifyDB } from "@netlify/database-dev";
import {
  addDays,
  type AthletePlanResponse,
  type EventsResponse,
  type FamilyResponse,
  type OrganizationResponse,
  type PlayerDetailResponse,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryBlobStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Rol de deportista (ADR 0045) contra una base real: el adulto de una sección de CrossFit entra a
 * su propia ficha por invitación o vinculando su cuenta, ve lo suyo como una familia (su ficha,
 * su agenda y su plan) y nada del club; se le quita el acceso desde su ficha. Con una familia que
 * además entrena y un segundo club para el aislamiento. Si uno falla, la PR no se mezcla.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };

/** Hoy en la zona del club (Europe/Madrid, la de por defecto). */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

describe("deportista con cuenta propia", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let adminA: Seeded;
  let coachA: Seeded;
  let guardianA: Seeded;
  let adminB: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");
  const athleteEmail = "marta@club-a.test";

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
  const status = (res: Response) => res.status;

  /** Marta (WOD mañanas) entra por invitación; Sergi (WOD tardes) es la familia que también entrena. */
  let marta = "";
  let sergi = "";
  let pol = "";
  let morningEvent = "";
  let eveningEvent = "";
  let martaUserId = "";
  let martaCookie = "";

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

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    const clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
    const user = (name: string, email: string) => seeder.user({ name, email, password: PASSWORD });
    adminA = await user("Ana Admin", "ana@club-a.test");
    coachA = await user("Caro Coach", "caro@club-a.test");
    guardianA = await user("Gina Guardiana", "gina@club-a.test");
    adminB = await user("Bruno Admin", "bruno@club-b.test");
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, guardianA.id, "guardian");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    for (const u of [adminA, coachA, guardianA]) cookies.set(u.email, await signIn(u.email, A));
    cookies.set(adminB.email, await signIn(adminB.email, B));

    const season = await seeder.season(clubA.id, {
      name: "2026-27",
      startsOn: addDays(today, -60),
      endsOn: addDays(today, 200),
    });
    const section = await seeder.section(clubA.id, "CrossFit", "crossfit", "activity");
    const category = await seeder.category(clubA.id, section.id, "Adultos");
    const team = (name: string) =>
      seeder.team(clubA.id, {
        sectionId: section.id,
        categoryId: category.id,
        seasonId: season.id,
        name,
      });
    const morning = (await team("WOD mañanas")).id;
    const evening = (await team("WOD tardes")).id;
    await seeder.teamStaff(clubA.id, morning, coachA.id, "head_coach");
    const player = async (firstName: string, lastName: string, birthDate: string) =>
      (
        await seeder.player(
          clubA.id,
          (await seeder.person(clubA.id, { firstName, lastName, birthDate })).id,
        )
      ).id;
    marta = await player("Marta", "Roig", "1990-03-02");
    sergi = await player("Sergi", "Puig", "1985-07-14");
    pol = await player("Pol", "Puig", "2015-01-20");
    await seeder.rosterAdd(clubA.id, morning, marta);
    await seeder.rosterAdd(clubA.id, evening, sergi);
    await seeder.rosterAdd(clubA.id, evening, pol);
    await seeder.guardian(clubA.id, pol, guardianA.id, "mother");

    const event = async (teamId: string, title: string, hour: string) =>
      (
        await json<{ event: { id: string } }>(
          await request("POST", "/api/org/events", A, {
            cookie: as(adminA),
            body: {
              kind: "activity",
              title,
              sectionId: section.id,
              teamId,
              startsAt: `${addDays(today, 1)}T${hour}:00+01:00`,
              endsAt: `${addDays(today, 1)}T${hour}:59+01:00`,
            },
          }),
          201,
        )
      ).event.id;
    morningEvent = await event(morning, "WOD mañanas", "07");
    eveningEvent = await event(evening, "WOD tardes", "19");
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("se invita desde su ficha y, al aceptar, entra a lo suyo con el rol de deportista", async () => {
    expect(
      status(
        await request("POST", `/api/org/players/${marta}/athlete/invite`, A, {
          cookie: as(coachA),
          body: { email: athleteEmail },
        }),
      ),
    ).toBe(403);
    const sent = await json<{
      acceptUrl: string | null;
      invitation: { roleCode: string; relationship: string; player: { name: string } | null };
    }>(
      await request("POST", `/api/org/players/${marta}/athlete/invite`, A, {
        cookie: as(adminA),
        body: { email: athleteEmail },
      }),
      201,
    );
    expect(sent.invitation).toMatchObject({
      roleCode: "athlete",
      relationship: "self",
      player: { name: "Marta Roig" },
    });
    const token = sent.acceptUrl!.split("/invitations/")[1]!;
    const accepted = await request("POST", `/api/invitations/${token}/accept`, A, {
      body: { name: "Marta Roig", password: PASSWORD },
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    martaCookie = cookieOf(accepted);

    const org = await json<OrganizationResponse>(
      await request("GET", "/api/org", A, { cookie: martaCookie }),
      200,
    );
    if (org.actor.kind !== "member") throw new Error("Esperaba un miembro.");
    expect(org.actor.roles).toEqual(["athlete"]);
    expect(org.actor.athletePlayerId).toBe(marta);
    expect([...org.actor.permissions].sort()).toEqual([
      "org.family.read",
      "org.family.write",
      "org.settings.read",
    ]);

    const family = await json<FamilyResponse>(
      await request("GET", "/api/org/family", A, { cookie: martaCookie }),
      200,
    );
    expect(family.players).toMatchObject([
      { id: marta, relationship: "self", teams: [{ teamName: "WOD mañanas" }] },
    ]);
    expect(
      status(await request("GET", `/api/org/family/players/${marta}`, A, { cookie: martaCookie })),
    ).toBe(200);
    expect(
      status(await request("GET", `/api/org/family/players/${sergi}`, A, { cookie: martaCookie })),
    ).toBe(404);
    // Nada del club: ni la lista de deportistas, ni la ficha del personal, ni la agenda entera.
    for (const path of ["/api/org/players", `/api/org/players/${marta}`, "/api/org/events"])
      expect(status(await request("GET", path, A, { cookie: martaCookie })), path).toBe(403);

    // Su agenda y su plan: su grupo, no el de los demás.
    const range = `from=${today}&to=${addDays(today, 7)}`;
    const agenda = await json<EventsResponse>(
      await request("GET", `/api/org/family/agenda?${range}`, A, { cookie: martaCookie }),
      200,
    );
    expect(agenda.events.map((e) => e.id)).toContain(morningEvent);
    expect(agenda.events.map((e) => e.id)).not.toContain(eveningEvent);
    const plan = await json<AthletePlanResponse>(
      await request("GET", "/api/org/me/athlete/plan", A, { cookie: martaCookie }),
      200,
    );
    expect(plan.player?.id).toBe(marta);
    expect(plan.sessions).toMatchObject([
      { eventId: morningEvent, status: "unplanned", team: { name: "WOD mañanas" }, blocks: [] },
    ]);

    // En su ficha, para el club, la cuenta es la suya.
    const detail = await json<PlayerDetailResponse>(
      await request("GET", `/api/org/players/${marta}`, A, { cookie: as(adminA) }),
      200,
    );
    expect(detail.guardians).toMatchObject([{ email: athleteEmail, relationship: "self" }]);
    martaUserId = detail.player.userId!;
    expect(martaUserId).toBe(detail.guardians[0]!.userId);
    expect(
      status(
        await request("POST", `/api/org/players/${marta}/athlete/invite`, A, {
          cookie: as(adminA),
          body: { email: "otra@club-a.test" },
        }),
      ),
    ).toBe(409);
  });

  it("no se entra como deportista desde 'Personal', ni como familia de uno mismo", async () => {
    expect(
      status(
        await request("POST", "/api/org/invitations", A, {
          cookie: as(adminA),
          body: { email: "nadie@club-a.test", roleCode: "athlete" },
        }),
      ),
    ).toBe(400);
    expect(
      status(
        await request("POST", `/api/org/members/${guardianA.id}/roles`, A, {
          cookie: as(adminA),
          body: { roleCode: "athlete" },
        }),
      ),
    ).toBe(400);
    expect(
      status(
        await request("POST", `/api/org/players/${marta}/guardians`, A, {
          cookie: as(adminA),
          body: { userId: martaUserId, relationship: "other" },
        }),
      ),
    ).toBe(409);
    expect(
      status(
        await request("POST", `/api/org/players/${sergi}/guardians`, A, {
          cookie: as(adminA),
          body: { userId: guardianA.id, relationship: "self" },
        }),
      ),
    ).toBe(400);
  });

  it("una familia que también entrena se vincula como deportista y ve las dos cosas", async () => {
    await json(
      await request("POST", `/api/org/players/${sergi}/athlete`, A, {
        cookie: as(adminA),
        body: { userId: guardianA.id },
      }),
      200,
    );
    expect(await seeder.rolesOf(clubA.id, guardianA.id)).toEqual(["athlete", "guardian"]);
    const family = await json<FamilyResponse>(
      await request("GET", "/api/org/family", A, { cookie: as(guardianA) }),
      200,
    );
    expect(family.players.map((p) => [p.firstName, p.relationship]).sort()).toEqual([
      ["Pol", "mother"],
      ["Sergi", "self"],
    ]);
    // Una ficha tiene una sola cuenta, y una cuenta es de una sola persona del club.
    expect(
      status(
        await request("POST", `/api/org/players/${sergi}/athlete`, A, {
          cookie: as(adminA),
          body: { userId: coachA.id },
        }),
      ),
    ).toBe(409);
    expect(
      status(
        await request("POST", `/api/org/players/${pol}/athlete`, A, {
          cookie: as(adminA),
          body: { userId: guardianA.id },
        }),
      ),
    ).toBe(409);
  });

  it("quitarle el acceso le quita su ficha y el rol", async () => {
    const detail = await json<PlayerDetailResponse>(
      await request("DELETE", `/api/org/players/${marta}/guardians/${martaUserId}`, A, {
        cookie: as(adminA),
      }),
      200,
    );
    expect(detail.player.userId).toBeNull();
    expect(detail.guardians).toEqual([]);
    expect(await seeder.rolesOf(clubA.id, martaUserId)).toEqual([]);
    expect(status(await request("GET", "/api/org", A, { cookie: martaCookie }))).toBe(403);
  });

  it("nada del club A se toca desde el club B", async () => {
    expect(
      status(
        await request("POST", `/api/org/players/${sergi}/athlete/invite`, B, {
          cookie: as(adminB),
          body: { email: "intrusa@club-b.test" },
        }),
      ),
    ).toBe(404);
    expect(
      status(
        await request("POST", `/api/org/players/${pol}/athlete`, B, {
          cookie: as(adminB),
          body: { userId: adminB.id },
        }),
      ),
    ).toBe(404);
    expect(
      status(await request("GET", "/api/org/me/athlete/plan", B, { cookie: as(guardianA) })),
    ).not.toBe(200);
  });
});

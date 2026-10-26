import { NetlifyDB } from "@netlify/database-dev";
import {
  SUGGESTION_DAILY_LIMIT,
  VIEW_AS_HEADER,
  type ClubSuggestion,
  type PlatformSuggestion,
  type RoadmapItem,
} from "@sportsmanager/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, createMemoryLogoStore, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Mejoras de la plataforma (ADR 0046). Lo único que cruza clubes, así que cruza poco:
 * - Solo la administración de un club sugiere, vota y ve la hoja de ruta.
 * - Lo que un club envía lo ven ese club y la plataforma; nada más hasta que se publica.
 * - Lo publicado lo ven todos, sin saber qué club lo pidió ni qué le contestó la plataforma.
 * - Un voto por club; unir duplicados pasa los votos; lo disponible ya no se vota.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";

type Seeded = { id: string; email: string };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

describe("mejoras de la plataforma", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let clubC: { id: string; slug: string };
  let root: Seeded;
  let adminA: Seeded;
  let adminA2: Seeded;
  let adminB: Seeded;
  let adminC: Seeded;
  let coachA: Seeded;
  let guardianA: Seeded;
  let directorA: Seeded;
  const cookies = new Map<string, string>();

  const request = (
    method: Method,
    path: string,
    host: string,
    options: { as?: Seeded; body?: unknown; headers?: Record<string, string> } = {},
  ) => {
    const cookie = options.as ? cookies.get(options.as.id) : undefined;
    return app.request(path, {
      method,
      headers: {
        host,
        origin: `https://${host}`,
        ...(cookie ? { cookie } : {}),
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  };
  const club = (slug: string, as: Seeded, method: Method, path: string, body?: unknown) =>
    request(method, path, hostOf(slug), { as, ...(body !== undefined ? { body } : {}) });
  const platform = (method: Method, path: string, body?: unknown) =>
    request(method, path, BASE, { as: root, ...(body !== undefined ? { body } : {}) });

  async function roadmapOf(slug: string, as: Seeded): Promise<RoadmapItem[]> {
    const res = await club(slug, as, "GET", "/api/org/roadmap");
    expect(res.status).toBe(200);
    return ((await res.json()) as { items: RoadmapItem[] }).items;
  }
  async function mineOf(slug: string, as: Seeded): Promise<ClubSuggestion[]> {
    const res = await club(slug, as, "GET", "/api/org/suggestions");
    expect(res.status).toBe(200);
    return ((await res.json()) as { suggestions: ClubSuggestion[] }).suggestions;
  }
  async function suggest(slug: string, as: Seeded, title: string, area = "people") {
    const res = await club(slug, as, "POST", "/api/org/suggestions", {
      title,
      body: `${title}: lo necesitamos para el día a día del club.`,
      area,
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { suggestion: ClubSuggestion }).suggestion;
  }
  async function review(id: string, patch: Record<string, unknown>, status = 200) {
    const res = await platform("PATCH", `/api/platform/suggestions/${id}`, patch);
    expect(res.status).toBe(status);
    return status === 200
      ? ((await res.json()) as { suggestion: PlatformSuggestion }).suggestion
      : null;
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
      PLATFORM_ADMIN_EMAILS: "root@plataforma.test",
    });
    data = createDataLayer({ config, connectionString, logoStore: createMemoryLogoStore() });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
    clubC = await seeder.organization({ slug: "club-c", name: "Club C" });
    const user = (name: string, email: string) => seeder.user({ name, email, password: PASSWORD });
    root = await user("Root", "root@plataforma.test");
    adminA = await user("Ana", "ana@club-a.test");
    adminA2 = await user("Alba", "alba@club-a.test");
    adminB = await user("Bea", "bea@club-b.test");
    adminC = await user("Carla", "carla@club-c.test");
    coachA = await user("Carmen", "carmen@club-a.test");
    guardianA = await user("Gema", "gema@club-a.test");
    directorA = await user("Dora", "dora@club-a.test");
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, adminA2.id, "org_admin");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    await seeder.membership(clubC.id, adminC.id, "org_admin");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubA.id, guardianA.id, "guardian");
    await seeder.membership(clubA.id, directorA.id, "staff", "director");
    for (const u of [root, adminA, adminA2, adminB, adminC, coachA, guardianA, directorA]) {
      const res = await request("POST", "/api/auth/sign-in/email", BASE, {
        body: { email: u.email, password: PASSWORD },
      });
      expect(res.status).toBe(200);
      cookies.set(
        u.id,
        res.headers
          .getSetCookie()
          .map((c) => c.split(";")[0] ?? "")
          .join("; "),
      );
    }
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("solo la administración del club sugiere, vota y ve la hoja de ruta; solo la plataforma revisa", async () => {
    for (const who of [coachA, guardianA, directorA]) {
      expect((await club("club-a", who, "GET", "/api/org/roadmap")).status, who.email).toBe(403);
      expect((await club("club-a", who, "GET", "/api/org/suggestions")).status, who.email).toBe(
        403,
      );
      const post = await club("club-a", who, "POST", "/api/org/suggestions", {
        title: "Algo",
        body: "Una mejora cualquiera para probar.",
        area: "other",
      });
      expect(post.status, who.email).toBe(403);
    }
    // La plataforma dentro de un club está en modo soporte: no habla en nombre del club.
    expect((await club("club-a", root, "GET", "/api/org/roadmap")).status).toBe(403);
    // Una administración de otro club no entra en este.
    expect((await club("club-a", adminB, "GET", "/api/org/roadmap")).status).toBe(403);
    // "Ver como" una entrenadora: con sus ojos, sin la hoja de ruta.
    const viewAs = await request("GET", "/api/org/roadmap", hostOf("club-a"), {
      as: adminA,
      headers: { [VIEW_AS_HEADER]: coachA.id },
    });
    expect(viewAs.status).toBe(403);
    expect((await request("GET", "/api/org/roadmap", hostOf("club-a"))).status).toBe(401);
    // La bandeja es de la plataforma.
    expect((await request("GET", "/api/platform/suggestions", BASE, { as: adminA })).status).toBe(
      403,
    );
    expect(
      (
        await request("PATCH", `/api/platform/suggestions/${crypto.randomUUID()}`, BASE, {
          as: adminA,
          body: { status: "open" },
        })
      ).status,
    ).toBe(403);
  });

  it("lo que envía un club solo lo ven ese club y la plataforma, y el club lo deja votado", async () => {
    const mine = await suggest("club-a", adminA, "Exportar los socios de Club A con DNI");
    expect(mine).toMatchObject({ status: "submitted", createdBy: "Ana", votes: null });

    // El otro club no la ve ni puede votarla: para él no existe.
    expect((await roadmapOf("club-b", adminB)).map((i) => i.id)).not.toContain(mine.id);
    expect(await mineOf("club-b", adminB)).toEqual([]);
    expect((await club("club-b", adminB, "PUT", `/api/org/roadmap/${mine.id}/vote`)).status).toBe(
      404,
    );
    // Tampoco el propio club la ve en la hoja de ruta hasta que se publica.
    expect((await roadmapOf("club-a", adminA)).map((i) => i.id)).not.toContain(mine.id);
    // Y la otra administración del mismo club sí la ve entre las suyas.
    expect((await mineOf("club-a", adminA2)).map((s) => s.id)).toContain(mine.id);

    const inbox = await platform("GET", "/api/platform/suggestions");
    expect(inbox.status).toBe(200);
    const row = ((await inbox.json()) as { suggestions: PlatformSuggestion[] }).suggestions.find(
      (s) => s.id === mine.id,
    );
    expect(row).toMatchObject({
      status: "submitted",
      organization: { slug: "club-a", name: "Club A" },
      createdBy: { name: "Ana", email: "ana@club-a.test" },
      votes: 1,
      publicTitle: null,
    });
  });

  it("publicada, la ven todos los clubes sin saber quién la pidió ni qué se le contestó", async () => {
    const mine = (await mineOf("club-a", adminA))[0]!;
    const reviewed = await review(mine.id, {
      status: "open",
      publicTitle: "Exportar los socios a Excel",
      publicBody: "Con todos sus datos de contacto y su cuota.",
      response: "Gracias, Ana: la ponemos en estudio para que la voten otros clubes.",
    });
    expect(reviewed).toMatchObject({ status: "open", reviewedBy: "Root" });
    expect(reviewed!.publishedAt).not.toBeNull();

    const seenByB = (await roadmapOf("club-b", adminB)).find((i) => i.id === mine.id);
    expect(seenByB).toMatchObject({
      title: "Exportar los socios a Excel",
      status: "open",
      votes: 1,
      votedByClub: false,
      requestedByClub: false,
      rank: null,
    });
    const raw = JSON.stringify(await roadmapOf("club-b", adminB));
    for (const secret of ["club-a", "Club A", "ana@club-a.test", "Ana", "DNI", "Gracias"])
      expect(raw, secret).not.toContain(secret);

    const seenByA = (await roadmapOf("club-a", adminA)).find((i) => i.id === mine.id);
    expect(seenByA).toMatchObject({ votedByClub: true, requestedByClub: true });
    expect((await mineOf("club-a", adminA))[0]).toMatchObject({
      status: "open",
      title: "Exportar los socios de Club A con DNI",
      publicTitle: "Exportar los socios a Excel",
      response: "Gracias, Ana: la ponemos en estudio para que la voten otros clubes.",
      votes: 1,
    });
  });

  it("un voto por club: votar dos veces no suma y otra administración del mismo club tampoco", async () => {
    const id = (await mineOf("club-a", adminA))[0]!.id;
    const vote = async (slug: string, as: Seeded, method: "PUT" | "DELETE") => {
      const res = await club(slug, as, method, `/api/org/roadmap/${id}/vote`);
      expect(res.status).toBe(200);
      return ((await res.json()) as { item: RoadmapItem }).item;
    };
    expect(await vote("club-b", adminB, "PUT")).toMatchObject({ votes: 2, votedByClub: true });
    expect((await vote("club-b", adminB, "PUT")).votes).toBe(2);
    expect((await vote("club-a", adminA2, "PUT")).votes).toBe(2);
    expect(await vote("club-b", adminB, "DELETE")).toMatchObject({ votes: 1, votedByClub: false });
    expect(await vote("club-b", adminB, "PUT")).toMatchObject({ votes: 2, votedByClub: true });
    expect(
      (await club("club-b", adminB, "PUT", `/api/org/roadmap/${crypto.randomUUID()}/vote`)).status,
    ).toBe(404);
  });

  it("lo que viene lleva su puesto y su fecha aproximada, y la plataforma fija el orden", async () => {
    const id = (await mineOf("club-a", adminA))[0]!.id;
    const created = async (body: Record<string, unknown>) => {
      const res = await platform("POST", "/api/platform/suggestions", body);
      expect(res.status).toBe(201);
      return ((await res.json()) as { suggestion: PlatformSuggestion }).suggestion;
    };
    const doing = await created({
      title: "Agenda en el calendario del móvil",
      area: "agenda",
      status: "in_progress",
    });
    const later = await created({
      title: "Avisos a las familias",
      body: "Notificaciones de convocatoria.",
      area: "communication",
      status: "planned",
      eta: "2027-Q2",
    });
    expect(later).toMatchObject({
      organization: null,
      publicTitle: "Avisos a las familias",
      votes: 0,
    });
    await review(id, { status: "planned", eta: "2027-03" });
    expect((await mineOf("club-a", adminA))[0]).toMatchObject({
      status: "planned",
      eta: "2027-03",
    });

    const rankOf = async () =>
      Object.fromEntries(
        (await roadmapOf("club-b", adminB)).filter((i) => i.rank).map((i) => [i.id, i.rank]),
      );
    expect(await rankOf()).toEqual({ [doing.id]: 1, [later.id]: 2, [id]: 3 });

    const reorder = await platform("PUT", "/api/platform/suggestions/order", {
      ids: [id, later.id],
    });
    expect(reorder.status).toBe(200);
    // Lo que está en desarrollo va siempre delante; lo planificado, en el orden nuevo.
    expect(await rankOf()).toEqual({ [doing.id]: 1, [id]: 2, [later.id]: 3 });
    const positions = (
      (await (await platform("GET", "/api/platform/suggestions")).json()) as {
        suggestions: PlatformSuggestion[];
      }
    ).suggestions;
    // Lo que no está en la lista va detrás, como estaba.
    expect(positions.find((s) => s.id === doing.id)!.position).toBe(3);

    const open = await created({ title: "Pagos con Bizum", area: "fees" });
    expect(
      (await platform("PUT", "/api/platform/suggestions/order", { ids: [open.id] })).status,
    ).toBe(400);
    expect(
      (await platform("PUT", "/api/platform/suggestions/order", { ids: [id, id] })).status,
    ).toBe(400);
    await review(id, { eta: "2027-03-15" }, 400);
  });

  it("unir un duplicado pasa sus votos y el club que lo pidió ve a qué mejora se unió", async () => {
    const target = (await mineOf("club-a", adminA))[0]!;
    // Club C la vota antes; luego pide lo mismo. Al unirla no cuenta dos veces.
    await club("club-c", adminC, "PUT", `/api/org/roadmap/${target.id}/vote`);
    const before = (await roadmapOf("club-c", adminC)).find((i) => i.id === target.id)!.votes;
    const dupC = await suggest("club-c", adminC, "Sacar un Excel con los socios");
    const dupB = await suggest("club-b", adminB, "Listado de socios para el seguro");
    await review(dupC.id, { status: "merged", mergedIntoId: target.id });
    await review(dupB.id, { status: "merged", mergedIntoId: target.id });
    const after = (await roadmapOf("club-c", adminC)).find((i) => i.id === target.id)!;
    expect(after).toMatchObject({ votes: before, requestedByClub: true, votedByClub: true });
    expect((await mineOf("club-b", adminB)).find((s) => s.id === dupB.id)).toMatchObject({
      status: "merged",
      mergedInto: { id: target.id, title: "Exportar los socios a Excel", status: "planned" },
    });

    // Si después el club B quita su voto, volver a guardar la unida (solo para contestar) no se lo devuelve.
    await club("club-b", adminB, "DELETE", `/api/org/roadmap/${target.id}/vote`);
    const withoutB = (await roadmapOf("club-b", adminB)).find((i) => i.id === target.id)!;
    expect(withoutB.votedByClub).toBe(false);
    await review(dupB.id, { response: "La unimos con la que ya estaba en estudio." });
    expect((await roadmapOf("club-b", adminB)).find((i) => i.id === target.id)).toMatchObject({
      votedByClub: false,
      votes: withoutB.votes,
    });
    await club("club-b", adminB, "PUT", `/api/org/roadmap/${target.id}/vote`);

    // No se une a sí misma, ni a una que ya está unida a otra, ni sin decir a cuál.
    await review(target.id, { status: "merged", mergedIntoId: target.id }, 400);
    await review(target.id, { status: "merged", mergedIntoId: dupB.id }, 400);
    await review(target.id, { status: "merged" }, 400);
    const inbox = (
      (await (await platform("GET", "/api/platform/suggestions")).json()) as {
        suggestions: PlatformSuggestion[];
      }
    ).suggestions;
    expect(inbox.find((s) => s.id === target.id)!.mergedCount).toBe(2);
  });

  it("disponible ya no se vota; descartada sale de la hoja de ruta y solo el club que la pidió ve el porqué", async () => {
    const target = (await mineOf("club-a", adminA))[0]!;
    await review(target.id, { status: "released" });
    const released = (await roadmapOf("club-b", adminB)).find((i) => i.id === target.id)!;
    expect(released).toMatchObject({ status: "released", rank: null });
    expect(released.releasedAt).not.toBeNull();
    expect(
      (await club("club-b", adminB, "DELETE", `/api/org/roadmap/${target.id}/vote`)).status,
    ).toBe(409);

    const other = await suggest("club-b", adminB, "Cambiar el color de los botones");
    await review(other.id, {
      status: "declined",
      response: "Ya se puede desde Ajustes, Identidad.",
    });
    expect((await roadmapOf("club-a", adminA)).map((i) => i.id)).not.toContain(other.id);
    expect((await mineOf("club-b", adminB)).find((s) => s.id === other.id)).toMatchObject({
      status: "declined",
      response: "Ya se puede desde Ajustes, Identidad.",
      publicTitle: null,
      votes: null,
    });
  });

  it(`un club envía como mucho ${SUGGESTION_DAILY_LIMIT} sugerencias en 24 horas`, async () => {
    const sent = (await mineOf("club-c", adminC)).length;
    for (let i = sent; i < SUGGESTION_DAILY_LIMIT; i++)
      await suggest("club-c", adminC, `Mejora número ${i + 1}`, "other");
    const res = await club("club-c", adminC, "POST", "/api/org/suggestions", {
      title: "Una más",
      body: "Esta ya no cabe en el día.",
      area: "other",
    });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("suggestion_limit");
    // El tope es de cada club: los demás siguen enviando.
    await suggest("club-b", adminB, "Otra mejora del club B", "other");
    expect(clubC.id).not.toBe(clubB.id);
  });
});

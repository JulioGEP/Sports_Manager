import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";

/**
 * Tienda del club (ADR 0041) contra una base real: dos clubes, una administradora, una familia con
 * una hija menor y un hijo adulto, un deportista adulto con su cuenta y una entrenadora. Comprueba
 * quién compra y para quién, el stock con cada pedido y cada anulación, el cobro con un cargo de
 * cuotas, los pedidos de mostrador, las fotos públicas, la API pública con su clave y que nada
 * cruza de un club a otro.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);

type Seeded = { id: string; email: string };
type Product = {
  id: string;
  status: string;
  imageUrl: string | null;
  variants: { id: string; label: string | null; stock: number | null; sold: number }[];
};
type Order = {
  id: string;
  number: number;
  code: string;
  status: string;
  channel: string;
  totalCents: number;
  person: { id: string };
  items: { productName: string; variantLabel: string | null; quantity: number }[];
  payment: { status: string; chargeId: string | null; paidCents: number; payableOnline: boolean };
};

describe("tienda del club", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let familyA: Seeded;
  let athleteA: Seeded;
  let coachA: Seeded;
  let adminB: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");

  let claraPerson = "";
  let pauPerson = "";
  let miguelPerson = "";
  let teamA = "";
  let teamB = "";
  let shirt: Product;
  let dinner: Product;
  let bottle: Product;
  let draft: Product;
  let productB: Product;
  let claraOrder: Order;

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");

  const request = (
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "OPTIONS",
    path: string,
    host: string,
    options: {
      cookie?: string;
      body?: unknown;
      binary?: Uint8Array;
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
        ...(options.headers ?? {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.binary ? { body: options.binary } : {}),
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
  const variant = (p: Product, label: string | null) => p.variants.find((v) => v.label === label)!;
  const product = async (id: string) =>
    (
      await json<{ products: Product[] }>(
        await request("GET", "/api/org/store/products", A, { cookie: as(adminA) }),
        200,
      )
    ).products.find((p) => p.id === id)!;

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
      LOGO_STORE: "memory",
    });
    data = createDataLayer({ config, connectionString });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
    const user = (name: string, email: string) => seeder.user({ name, email, password: PASSWORD });
    adminA = await user("Ana Admin", "ana@club-a.test");
    familyA = await user("Laura Martí", "laura@club-a.test");
    athleteA = await user("Miguel Lozano", "miguel@club-a.test");
    coachA = await user("Carla Coach", "carla@club-a.test");
    adminB = await user("Bruno Admin", "bruno@club-b.test");
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, familyA.id, "guardian");
    await seeder.membership(clubA.id, athleteA.id, "guardian");
    await seeder.membership(clubA.id, coachA.id, "coach");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    for (const u of [adminA, familyA, athleteA, coachA])
      cookies.set(u.email, await signIn(u.email, A));
    cookies.set(adminB.email, await signIn(adminB.email, B));

    // Club A: Clara (menor, Alevín A) y Pau (adulto, Sénior) son de Laura; Miguel es un deportista
    // adulto del Sénior con su cuenta.
    const season = await seeder.season(clubA.id, {
      name: "2026-27",
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
    });
    const section = await seeder.section(clubA.id, "Fútbol sala");
    const alevin = await seeder.category(clubA.id, section.id, "Alevín");
    const senior = await seeder.category(clubA.id, section.id, "Sénior");
    teamA = (
      await seeder.team(clubA.id, {
        sectionId: section.id,
        categoryId: alevin.id,
        seasonId: season.id,
        name: "Alevín A",
      })
    ).id;
    const seniorTeam = await seeder.team(clubA.id, {
      sectionId: section.id,
      categoryId: senior.id,
      seasonId: season.id,
      name: "Sénior A",
    });
    claraPerson = (
      await seeder.person(clubA.id, {
        firstName: "Clara",
        lastName: "Martí",
        birthDate: "2015-02-03",
      })
    ).id;
    pauPerson = (
      await seeder.person(clubA.id, {
        firstName: "Pau",
        lastName: "Martí",
        birthDate: "1998-05-10",
      })
    ).id;
    miguelPerson = (
      await seeder.person(clubA.id, {
        firstName: "Miguel",
        lastName: "Lozano",
        birthDate: "1995-01-20",
        userId: athleteA.id,
      })
    ).id;
    const clara = await seeder.player(clubA.id, claraPerson);
    const pau = await seeder.player(clubA.id, pauPerson);
    const miguel = await seeder.player(clubA.id, miguelPerson);
    await seeder.rosterAdd(clubA.id, teamA, clara.id);
    await seeder.rosterAdd(clubA.id, seniorTeam.id, pau.id);
    await seeder.rosterAdd(clubA.id, seniorTeam.id, miguel.id);
    await seeder.guardian(clubA.id, clara.id, familyA.id, "mother");
    await seeder.guardian(clubA.id, pau.id, familyA.id, "mother");

    // Club B: su sección y su equipo, para comprobar que nada cruza.
    const seasonB = await seeder.season(clubB.id, {
      name: "2026-27",
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
    });
    const sectionB = await seeder.section(clubB.id, "Fútbol sala");
    const categoryB = await seeder.category(clubB.id, sectionB.id, "Alevín");
    teamB = (
      await seeder.team(clubB.id, {
        sectionId: sectionB.id,
        categoryId: categoryB.id,
        seasonId: seasonB.id,
        name: "Alevín B",
      })
    ).id;
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("la administración crea productos con tallas y stock; el resto del club no gestiona la tienda", async () => {
    const create = (body: unknown, host = A, cookie = as(adminA)) =>
      request("POST", "/api/org/store/products", host, { cookie, body });
    shirt = (
      await json<{ product: Product }>(
        await create({
          name: "Camiseta",
          category: "apparel",
          priceCents: 3000,
          status: "active",
          visibility: "public",
          variants: [
            { label: "S", stock: 2 },
            { label: "M", stock: 0 },
          ],
        }),
        201,
      )
    ).product;
    expect(shirt.variants.map((v) => [v.label, v.stock, v.sold])).toEqual([
      ["S", 2, 0],
      ["M", 0, 0],
    ]);
    dinner = (
      await json<{ product: Product }>(
        await create({
          name: "Cena del Alevín A",
          category: "event",
          priceCents: 2500,
          status: "active",
          teamId: teamA,
          variants: [{ label: null, stock: null }],
        }),
        201,
      )
    ).product;
    bottle = (
      await json<{ product: Product }>(
        await create({
          name: "Botella",
          category: "equipment",
          priceCents: 0,
          status: "active",
          visibility: "members",
          variants: [{ label: null, stock: 10 }],
        }),
        201,
      )
    ).product;
    draft = (
      await json<{ product: Product }>(
        await create({
          name: "Mochila",
          category: "equipment",
          priceCents: 3200,
          variants: [{ label: null, stock: 5 }],
        }),
        201,
      )
    ).product;
    expect(draft.status).toBe("draft");

    // Opciones repetidas o sin nombre con varias: 400. Equipo de otro club: 400.
    expect(
      (
        await create({
          name: "Mal",
          category: "apparel",
          priceCents: 1,
          variants: [
            { label: "S", stock: 1 },
            { label: "s", stock: 1 },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await create({
          name: "Ajeno",
          category: "event",
          priceCents: 1,
          teamId: teamB,
          variants: [{ label: null, stock: null }],
        })
      ).status,
    ).toBe(400);

    // Ni la entrenadora ni la familia gestionan la tienda.
    expect(
      (
        await create(
          { name: "X", category: "other", priceCents: 1, variants: [{ label: null, stock: null }] },
          A,
          as(coachA),
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("GET", "/api/org/store/products", A, { cookie: as(familyA) })).status,
    ).toBe(403);
    expect((await request("GET", "/api/org/store/orders", A, { cookie: as(coachA) })).status).toBe(
      403,
    );

    // El club B no ve ni toca los productos del A.
    productB = (
      await json<{ product: Product }>(
        await create(
          {
            name: "Gorra B",
            category: "apparel",
            priceCents: 1500,
            status: "active",
            visibility: "public",
            variants: [{ label: null, stock: 3 }],
          },
          B,
          as(adminB),
        ),
        201,
      )
    ).product;
    const listB = await json<{ products: Product[] }>(
      await request("GET", "/api/org/store/products", B, { cookie: as(adminB) }),
      200,
    );
    expect(listB.products.map((p) => p.id)).toEqual([productB.id]);
    expect(
      (
        await request("PATCH", `/api/org/store/products/${shirt.id}`, B, {
          cookie: as(adminB),
          body: { priceCents: 1 },
        })
      ).status,
    ).toBe(404);
  });

  it("compra la familia de un menor y el deportista adulto; nadie más ve la tienda", async () => {
    const actor = async (u: Seeded) =>
      (
        await json<{ actor: { canShop?: boolean } }>(
          await request("GET", "/api/org", A, { cookie: as(u) }),
          200,
        )
      ).actor;
    expect((await actor(familyA)).canShop).toBe(true);
    expect((await actor(athleteA)).canShop).toBe(true);
    expect((await actor(coachA)).canShop).toBe(false);

    type Catalog = {
      products: {
        id: string;
        beneficiaryIds: string[];
        variants: { label: string | null; inStock: boolean; lowStock: number | null }[];
      }[];
      beneficiaries: { personId: string; kind: string }[];
      provider: string;
    };
    const family = await json<Catalog>(
      await request("GET", "/api/org/store/catalog", A, { cookie: as(familyA) }),
      200,
    );
    // Solo Clara: Pau es adulto y compra él si tiene cuenta.
    expect(family.beneficiaries).toEqual([
      {
        personId: claraPerson,
        kind: "ward",
        firstName: "Clara",
        lastName: "Martí",
        memberPrice: false,
      },
    ]);
    expect(family.products.map((p) => p.id).sort()).toEqual(
      [shirt.id, dinner.id, bottle.id].sort(),
    );
    expect(family.products.find((p) => p.id === shirt.id)!.variants).toEqual([
      { id: shirt.variants[0]!.id, label: "S", inStock: true, lowStock: 2 },
      { id: shirt.variants[1]!.id, label: "M", inStock: false, lowStock: null },
    ]);
    expect(family.provider).toBe("manual");

    // Miguel compra para sí, pero la cena es solo del Alevín A.
    const athlete = await json<Catalog>(
      await request("GET", "/api/org/store/catalog", A, { cookie: as(athleteA) }),
      200,
    );
    expect(athlete.beneficiaries.map((b) => [b.personId, b.kind])).toEqual([
      [miguelPerson, "self"],
    ]);
    expect(athlete.products.map((p) => p.id).sort()).toEqual([shirt.id, bottle.id].sort());

    const coach = await json<Catalog>(
      await request("GET", "/api/org/store/catalog", A, { cookie: as(coachA) }),
      200,
    );
    expect(coach).toMatchObject({ products: [], beneficiaries: [] });
  });

  it("un pedido baja el stock y abre un cargo que la familia ve en sus cuotas", async () => {
    const order = (u: Seeded, body: unknown) =>
      request("POST", "/api/org/store/mine/orders", A, { cookie: as(u), body });
    claraOrder = (
      await json<{ order: Order }>(
        await order(familyA, {
          personId: claraPerson,
          items: [
            { variantId: variant(shirt, "S").id, quantity: 2 },
            { variantId: dinner.variants[0]!.id, quantity: 1 },
          ],
          note: "Dorsal 7",
        }),
        201,
      )
    ).order;
    expect(claraOrder).toMatchObject({
      number: 1,
      code: "T-0001",
      status: "pending",
      channel: "app",
      totalCents: 8500,
      person: { id: claraPerson },
      payment: { status: "pending", paidCents: 0, payableOnline: false },
    });
    expect(claraOrder.payment.chargeId).toBeTruthy();
    expect(variant(await product(shirt.id), "S")).toMatchObject({ stock: 0, sold: 2 });

    const fees = await json<{ charges: { id: string; amountCents: number; concept: string }[] }>(
      await request("GET", "/api/org/fees/mine", A, { cookie: as(familyA) }),
      200,
    );
    expect(fees.charges).toEqual([
      expect.objectContaining({
        id: claraOrder.payment.chargeId,
        amountCents: 8500,
        concept: "Pedido T-0001 · Tienda",
      }),
    ]);

    // Sin stock, para un adulto de la familia, una cena que no es de su equipo, un borrador o una
    // opción de otro club: nada.
    expect(
      (
        await order(familyA, {
          personId: claraPerson,
          items: [{ variantId: variant(shirt, "S").id, quantity: 1 }],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await order(familyA, {
          personId: pauPerson,
          items: [{ variantId: bottle.variants[0]!.id, quantity: 1 }],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await order(athleteA, {
          personId: miguelPerson,
          items: [{ variantId: dinner.variants[0]!.id, quantity: 1 }],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await order(familyA, {
          personId: claraPerson,
          items: [{ variantId: draft.variants[0]!.id, quantity: 1 }],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await order(familyA, {
          personId: claraPerson,
          items: [{ variantId: productB.variants[0]!.id, quantity: 1 }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await order(coachA, {
          personId: claraPerson,
          items: [{ variantId: bottle.variants[0]!.id, quantity: 1 }],
        })
      ).status,
    ).toBe(403);

    // Un pedido de importe cero no abre cargo.
    const free = await json<{ order: Order }>(
      await order(athleteA, {
        personId: miguelPerson,
        items: [{ variantId: bottle.variants[0]!.id, quantity: 3 }],
      }),
      201,
    );
    expect(free.order).toMatchObject({
      number: 2,
      totalCents: 0,
      payment: { status: "free", chargeId: null },
    });
  });

  it("la familia anula lo suyo mientras está recibido y sin pagar; el stock vuelve y el cargo se anula", async () => {
    const extra = await json<{ order: Order }>(
      await request("POST", "/api/org/store/mine/orders", A, {
        cookie: as(familyA),
        body: {
          personId: claraPerson,
          items: [{ variantId: bottle.variants[0]!.id, quantity: 2 }],
        },
      }),
      201,
    );
    expect(variant(await product(bottle.id), null).stock).toBe(5);
    // Miguel no anula lo de Laura.
    expect(
      (
        await request("POST", `/api/org/store/mine/orders/${extra.order.id}/cancel`, A, {
          cookie: as(athleteA),
        })
      ).status,
    ).toBe(404);
    const cancelled = await json<{ order: Order }>(
      await request("POST", `/api/org/store/mine/orders/${extra.order.id}/cancel`, A, {
        cookie: as(familyA),
      }),
      200,
    );
    expect(cancelled.order.status).toBe("cancelled");
    expect(variant(await product(bottle.id), null).stock).toBe(7);

    const mine = await json<{ orders: Order[] }>(
      await request("GET", "/api/org/store/mine", A, { cookie: as(familyA) }),
      200,
    );
    expect(mine.orders.map((o) => [o.code, o.status])).toEqual([
      ["T-0003", "cancelled"],
      ["T-0001", "pending"],
    ]);
  });

  it("el club prepara, cobra a mano, entrega y vende en el mostrador", async () => {
    const admin = as(adminA);
    const list = await json<{ orders: Order[]; totals: Record<string, number> }>(
      await request("GET", "/api/org/store/orders", A, { cookie: admin }),
      200,
    );
    expect(list.orders.map((o) => o.code)).toEqual(["T-0003", "T-0002", "T-0001"]);
    expect(list.totals).toMatchObject({
      toPrepare: 2,
      ready: 0,
      unpaidCents: 8500,
      unpaidCount: 1,
    });

    const ready = await json<{ order: Order }>(
      await request("PATCH", `/api/org/store/orders/${claraOrder.id}`, A, {
        cookie: admin,
        body: { status: "ready" },
      }),
      200,
    );
    expect(ready.order.status).toBe("ready");
    // Preparado: la familia ya no lo anula.
    expect(
      (
        await request("POST", `/api/org/store/mine/orders/${claraOrder.id}/cancel`, A, {
          cookie: as(familyA),
        })
      ).status,
    ).toBe(409);

    const pay = (amountCents: number) =>
      request("POST", `/api/org/store/orders/${claraOrder.id}/payments`, A, {
        cookie: admin,
        body: { amountCents, method: "cash", paidOn: "2026-10-23" },
      });
    expect((await json<{ order: Order }>(await pay(5000), 200)).order.payment).toMatchObject({
      status: "pending",
      paidCents: 5000,
    });
    expect((await pay(9000)).status).toBe(400);
    expect((await json<{ order: Order }>(await pay(3500), 200)).order.payment).toMatchObject({
      status: "paid",
      paidCents: 8500,
    });
    expect(
      (
        await request("POST", `/api/org/store/orders/${claraOrder.id}/payments`, A, {
          cookie: as(familyA),
          body: { amountCents: 1, method: "cash", paidOn: "2026-10-23" },
        })
      ).status,
    ).toBe(403);

    // Mostrador: cualquier persona del club, también un borrador; un archivado no.
    const people = await json<{ people: { id: string }[] }>(
      await request("GET", "/api/org/store/people?q=pau", A, { cookie: admin }),
      200,
    );
    expect(people.people.map((p) => p.id)).toEqual([pauPerson]);
    const counter = await json<{ order: Order }>(
      await request("POST", "/api/org/store/orders", A, {
        cookie: admin,
        body: { personId: pauPerson, items: [{ variantId: draft.variants[0]!.id, quantity: 1 }] },
      }),
      201,
    );
    expect(counter.order).toMatchObject({ channel: "counter", totalCents: 3200, code: "T-0004" });
    await json(
      await request("PATCH", `/api/org/store/products/${draft.id}`, A, {
        cookie: admin,
        body: { status: "archived" },
      }),
      200,
    );
    expect(
      (
        await request("POST", "/api/org/store/orders", A, {
          cookie: admin,
          body: { personId: pauPerson, items: [{ variantId: draft.variants[0]!.id, quantity: 1 }] },
        })
      ).status,
    ).toBe(409);
    // Persona de otro club: 400.
    const bPerson = await seeder.person(clubB.id, { firstName: "Berta", lastName: "B" });
    expect(
      (
        await request("POST", "/api/org/store/orders", A, {
          cookie: admin,
          body: {
            personId: bPerson.id,
            items: [{ variantId: bottle.variants[0]!.id, quantity: 1 }],
          },
        })
      ).status,
    ).toBe(400);
  });

  it("anular un pedido pagado devuelve el stock y dice cuánto reembolsar; entregado ya no se anula", async () => {
    const admin = as(adminA);
    const cancelled = await json<{ order: Order; refundCents: number }>(
      await request("PATCH", `/api/org/store/orders/${claraOrder.id}`, A, {
        cookie: admin,
        body: { status: "cancelled" },
      }),
      200,
    );
    expect(cancelled.refundCents).toBe(8500);
    expect(cancelled.order.payment.status).toBe("paid");
    expect(variant(await product(shirt.id), "S")).toMatchObject({ stock: 2, sold: 0 });
    expect(
      (
        await request("PATCH", `/api/org/store/orders/${claraOrder.id}`, A, {
          cookie: admin,
          body: { status: "pending" },
        })
      ).status,
    ).toBe(409);

    const list = await json<{ orders: Order[] }>(
      await request("GET", "/api/org/store/orders?status=pending", A, { cookie: admin }),
      200,
    );
    const counter = list.orders.find((o) => o.code === "T-0004")!;
    await json(
      await request("PATCH", `/api/org/store/orders/${counter.id}`, A, {
        cookie: admin,
        body: { status: "delivered" },
      }),
      200,
    );
    expect(
      (
        await request("PATCH", `/api/org/store/orders/${counter.id}`, A, {
          cookie: admin,
          body: { status: "cancelled" },
        })
      ).status,
    ).toBe(409);

    // El club B no ve los pedidos del A.
    expect(
      (await request("GET", `/api/org/store/orders/${counter.id}`, B, { cookie: as(adminB) }))
        .status,
    ).toBe(404);
    const listB = await json<{ orders: Order[] }>(
      await request("GET", "/api/org/store/orders", B, { cookie: as(adminB) }),
      200,
    );
    expect(listB.orders).toEqual([]);
  });

  it("la foto del producto se sube con su formato real y se ve sin sesión", async () => {
    const upload = (bytes: Uint8Array, type: string) =>
      request("PUT", `/api/org/store/products/${shirt.id}/image`, A, {
        cookie: as(adminA),
        binary: bytes,
        headers: { "content-type": type },
      });
    expect((await upload(PNG, "image/jpeg")).status).toBe(415);
    const withImage = await json<{ product: Product }>(await upload(PNG, "image/png"), 200);
    expect(withImage.product.imageUrl).toMatch(
      new RegExp(`^/api/store/products/${shirt.id}/image\\?v=`),
    );
    const image = await app.request(withImage.product.imageUrl!, { headers: { host: A } });
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(
      (
        await request("PUT", `/api/org/store/products/${shirt.id}/image`, B, {
          cookie: as(adminB),
          binary: PNG,
          headers: { "content-type": "image/png" },
        })
      ).status,
    ).toBe(404);
  });

  it("la API pública enseña solo lo público y activo del club de la clave", async () => {
    type Dev = { developer: { publicKey: string | null; publicProducts: number; apiBase: string } };
    expect(
      (await request("GET", "/api/org/store/developer", A, { cookie: as(familyA) })).status,
    ).toBe(403);
    const off = await json<Dev>(
      await request("GET", "/api/org/store/developer", A, { cookie: as(adminA) }),
      200,
    );
    expect(off.developer).toMatchObject({ publicKey: null, publicProducts: 1 });
    const on = await json<Dev>(
      await request("POST", "/api/org/store/developer/key", A, { cookie: as(adminA) }),
      200,
    );
    const key = on.developer.publicKey!;
    expect(key).toMatch(/^pk_[a-f0-9]{32}$/);
    expect(on.developer.apiBase).toMatch(/\/api\/public\/v1$/);

    type Catalog = {
      club: { slug: string; storeUrl: string };
      products: { id: string; imageUrl: string | null; buyUrl: string; inStock: boolean }[];
    };
    const res = await request("GET", `/api/public/v1/catalog?key=${key}`, "api.example.test", {
      headers: { origin: "https://www.club-a.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const catalog = await json<Catalog>(res, 200);
    expect(catalog.club.slug).toBe("club-a");
    expect(catalog.products.map((p) => p.id)).toEqual([shirt.id]);
    expect(catalog.products[0]!.buyUrl).toMatch(new RegExp(`/store\\?product=${shirt.id}$`));
    expect(catalog.products[0]!.imageUrl).toMatch(/^https?:\/\//);

    // Por cabecera también; un producto solo para socios no sale.
    const viaHeader = await request("GET", `/api/public/v1/catalog/products/${shirt.id}`, A, {
      headers: { "x-sm-key": key },
    });
    expect(viaHeader.status).toBe(200);
    expect(
      (
        await request("GET", `/api/public/v1/catalog/products/${bottle.id}`, A, {
          headers: { "x-sm-key": key },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request("GET", `/api/public/v1/catalog/products/${productB.id}`, A, {
          headers: { "x-sm-key": key },
        })
      ).status,
    ).toBe(404);

    // Sin clave, con una inventada, rotada o apagada: 401.
    expect((await request("GET", "/api/public/v1/catalog", A)).status).toBe(401);
    expect(
      (await request("GET", `/api/public/v1/catalog?key=pk_${"0".repeat(32)}`, A)).status,
    ).toBe(401);
    const rotated = await json<Dev>(
      await request("POST", "/api/org/store/developer/key", A, { cookie: as(adminA) }),
      200,
    );
    expect(rotated.developer.publicKey).not.toBe(key);
    expect((await request("GET", `/api/public/v1/catalog?key=${key}`, A)).status).toBe(401);
    await json(
      await request("DELETE", "/api/org/store/developer/key", A, { cookie: as(adminA) }),
      200,
    );
    expect(
      (await request("GET", `/api/public/v1/catalog?key=${rotated.developer.publicKey}`, A)).status,
    ).toBe(401);

    // Preflight de CORS con la cabecera de la clave.
    const preflight = await request("OPTIONS", "/api/public/v1/catalog", A, {
      headers: {
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-sm-key",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("x-sm-key");
  });
});

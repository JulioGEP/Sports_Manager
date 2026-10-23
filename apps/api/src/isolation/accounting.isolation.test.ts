import { OpenAPIHono } from "@hono/zod-openapi";
import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";
import type { AppEnv } from "../http/context.ts";
import { ApiError } from "../http/errors.ts";
import { createAccountingRoutes } from "../routes/accounting.ts";
import { createFeeRoutes } from "../routes/fees.ts";
import { createOrgRoutes } from "../routes/org.ts";
import { createStoreRoutes } from "../routes/store.ts";
import { createAccountingService } from "../services/accounting/index.ts";
import { createFakeHolded, type FakeHolded } from "../services/accounting/testing/fake-holded.ts";
import { signStripePayload } from "../services/payments/stripe.ts";

/**
 * Conector de contabilidad con Holded (ADR 0042) contra una base real y un Holded falso: conectar
 * con la clave comprobada y cifrada, elegir impuesto y tesorería, mandar cargos con su contacto
 * (la familia paga lo del deportista), pagos a mano y por Stripe, anulaciones, rechazos con su
 * motivo y reintento, clave revocada, pausa, la tienda y desconectar. Ningún dato cruza de club.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
const HOLDED_KEY = "holded-clave-de-prueba-0001";
const STRIPE_SECRET = "sk_test_fake";
const WEBHOOK_SECRET = "whsec_test_secret_000000000000";

type Seeded = { id: string; email: string };
type Status = {
  platformReady: boolean;
  connection: null | {
    status: string;
    accountName: string | null;
    apiKeyHint: string;
    tax: { key: string; ratePercent: number } | null;
    treasuryAccounts: Record<string, string>;
    syncFrom: string;
    lastError: string | null;
    counts: {
      contacts: number;
      documents: number;
      payments: number;
      pending: number;
      failed: number;
    };
  };
};
type Charge = {
  id: string;
  person: { id: string };
  status: string;
  accounting?: { status: string; number: string | null } | null;
};
type Sync = {
  created: { contacts: number; documents: number; payments: number };
  cancelled: number;
  failed: number;
  remaining: number;
  done: boolean;
};

describe("contabilidad conectada con Holded", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let api: OpenAPIHono<AppEnv>;
  let holded: FakeHolded;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let adminA: Seeded;
  let familyA: Seeded;
  let adminB: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");
  const nowSeconds = Math.floor(Date.now() / 1000);

  let perePerson = "";
  let claraPerson = "";
  let socioPlan = "";
  let sectionPlan = "";
  let pereCharge = "";
  let claraCharge = "";

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");
  const send = (
    target: { request: App["request"] },
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    host: string,
    options: {
      cookie?: string;
      body?: unknown;
      raw?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    target.request(path, {
      method,
      headers: {
        host,
        origin: `https://${host}`,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.body !== undefined || options.raw !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(options.headers ?? {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.raw !== undefined ? { body: options.raw } : {}),
    });
  const request = (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    host: string,
    options: { cookie?: string; body?: unknown } = {},
  ) => send(api, method, path, host, options);
  const as = (user: Seeded) => cookies.get(user.email)!;
  const json = async <T>(res: Response, status: number): Promise<T> => {
    expect(res.status, await res.clone().text()).toBe(status);
    return (await res.json()) as T;
  };
  const status = async () =>
    json<Status>(await request("GET", "/api/org/accounting", A, { cookie: as(adminA) }), 200);
  const sync = async () =>
    json<Sync>(await request("POST", "/api/org/accounting/sync", A, { cookie: as(adminA) }), 200);
  const charge = async (id: string) =>
    (
      await json<{ charge: Charge }>(
        await request("GET", `/api/org/fees/charges/${id}`, A, { cookie: as(adminA) }),
        200,
      )
    ).charge;
  const documentOf = (chargeId: string) =>
    holded.documents.find((d) => d.notes?.includes(chargeId) && d.status !== "cancelled");

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
      STRIPE_SECRET_KEY: STRIPE_SECRET,
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    });
    data = createDataLayer({ config, connectionString });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    holded = createFakeHolded({ apiKey: HOLDED_KEY });
    // Stripe falso: la sesión de Checkout; Holded falso para todo lo demás.
    const fakeFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://api.stripe.com"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "cs_test_acc",
              url: "https://checkout.stripe.com/c/pay/cs_test_acc",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      return holded.fetch(input, init);
    };
    const accounting = createAccountingService(config, data, { fetch: fakeFetch });
    api = new OpenAPIHono<AppEnv>();
    api.onError((error, c) => {
      if (error instanceof ApiError) return c.json(error.toBody(), error.status);
      throw error;
    });
    api.route("/", createOrgRoutes(config, data));
    api.route(
      "/",
      createFeeRoutes(config, data, { accounting, fetch: fakeFetch, now: () => nowSeconds }),
    );
    api.route("/", createAccountingRoutes(config, data, { service: accounting }));
    api.route("/", createStoreRoutes(config, data, { accounting }));

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    const clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
    adminA = await seeder.user({ name: "Ana Admin", email: "ana@club-a.test", password: PASSWORD });
    familyA = await seeder.user({
      name: "Laura Martí",
      email: "laura@club-a.test",
      password: PASSWORD,
    });
    adminB = await seeder.user({
      name: "Bruno Admin",
      email: "bruno@club-b.test",
      password: PASSWORD,
    });
    await seeder.membership(clubA.id, adminA.id, "org_admin");
    await seeder.membership(clubA.id, familyA.id, "guardian");
    await seeder.membership(clubB.id, adminB.id, "org_admin");
    for (const u of [adminA, familyA, adminB]) {
      const res = await send(app, "POST", "/api/auth/sign-in/email", A, {
        body: { email: u.email, password: PASSWORD },
      });
      expect(res.status, `login ${u.email}`).toBe(200);
      cookies.set(u.email, cookieOf(res));
    }

    // Club A: Pere, socio; Clara, deportista del Alevín A con su madre Laura, que tiene cuenta.
    const socio = (await seeder.memberType(clubA.id, "Socio")).id;
    perePerson = (await seeder.person(clubA.id, { firstName: "Pere", lastName: "Soci" })).id;
    await seeder.clubMember(clubA.id, perePerson, { memberNumber: 1, memberTypeId: socio });
    await seeder.personDetails(perePerson, { email: "pere@club-a.test", nationalId: "12345678Z" });
    const laura = await seeder.person(clubA.id, {
      firstName: "Laura",
      lastName: "Martí",
      userId: familyA.id,
    });
    await seeder.personDetails(laura.id, { email: "laura@club-a.test" });
    claraPerson = (
      await seeder.person(clubA.id, {
        firstName: "Clara",
        lastName: "Martí",
        birthDate: "2015-02-03",
      })
    ).id;
    const clara = await seeder.player(clubA.id, claraPerson);
    const season = await seeder.season(clubA.id, {
      name: "2026-27",
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
    });
    const section = (await seeder.section(clubA.id, "Fútbol sala")).id;
    const category = await seeder.category(clubA.id, section, "Alevín");
    const team = await seeder.team(clubA.id, {
      sectionId: section,
      categoryId: category.id,
      seasonId: season.id,
      name: "Alevín A",
    });
    await seeder.rosterAdd(clubA.id, team.id, clara.id);
    await seeder.guardian(clubA.id, clara.id, familyA.id, "mother");

    socioPlan = (
      await json<{ plan: { id: string } }>(
        await request("POST", "/api/org/fees/plans", A, {
          cookie: as(adminA),
          body: {
            name: "Cuota de socio",
            amountCents: 1000,
            period: "monthly",
            memberTypeId: socio,
          },
        }),
        201,
      )
    ).plan.id;
    sectionPlan = (
      await json<{ plan: { id: string } }>(
        await request("POST", "/api/org/fees/plans", A, {
          cookie: as(adminA),
          body: {
            name: "Cuota de fútbol sala",
            amountCents: 4000,
            period: "monthly",
            sectionId: section,
          },
        }),
        201,
      )
    ).plan.id;
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("conecta Holded con la clave comprobada, la guarda cifrada y nunca la devuelve", async () => {
    const before = await status();
    expect(before).toEqual({ platformReady: true, connection: null });
    // La familia no ve la contabilidad del club ni puede conectarla.
    expect((await request("GET", "/api/org/accounting", A, { cookie: as(familyA) })).status).toBe(
      403,
    );
    expect(
      (
        await request("POST", "/api/org/accounting/connect", A, {
          cookie: as(familyA),
          body: { provider: "holded", apiKey: HOLDED_KEY },
        })
      ).status,
    ).toBe(403);

    const wrong = await request("POST", "/api/org/accounting/connect", A, {
      cookie: as(adminA),
      body: { provider: "holded", apiKey: "clave-que-no-vale-0000" },
    });
    expect(wrong.status).toBe(400);

    const connected = await json<Status>(
      await request("POST", "/api/org/accounting/connect", A, {
        cookie: as(adminA),
        body: { provider: "holded", apiKey: HOLDED_KEY },
      }),
      201,
    );
    expect(connected.connection).toMatchObject({
      status: "active",
      accountName: "Club A SL",
      apiKeyHint: "…0001",
      tax: null,
    });
    expect(JSON.stringify(connected)).not.toContain(HOLDED_KEY);
    const stored = await seeder.accountingCiphertext(clubA.id);
    expect(stored?.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain(HOLDED_KEY);

    expect(
      (
        await request("POST", "/api/org/accounting/connect", A, {
          cookie: as(adminA),
          body: { provider: "holded", apiKey: HOLDED_KEY },
        })
      ).status,
    ).toBe(409);
    // El club B no ve la conexión del A, y la administración del A no entra en el B.
    const b = await json<Status>(
      await request("GET", "/api/org/accounting", B, { cookie: as(adminB) }),
      200,
    );
    expect(b.connection).toBeNull();
    expect((await request("GET", "/api/org/accounting", B, { cookie: as(adminA) })).status).toBe(
      403,
    );
  });

  it("lee impuestos, series y tesorería de Holded y guarda el tipo que dice Holded", async () => {
    const options = await json<{
      taxes: { key: string }[];
      numberingSeries: { id: string }[];
      treasuryAccounts: { id: string }[];
    }>(await request("GET", "/api/org/accounting/options", A, { cookie: as(adminA) }), 200);
    expect(options.taxes.map((t) => t.key)).toEqual(["s_iva_21", "s_iva_exento"]);
    expect(options.numberingSeries[0]!.id).toBe("series-cuotas");
    expect(options.treasuryAccounts.map((t) => t.id)).toContain("stripe-01");

    expect(
      (
        await request("PATCH", "/api/org/accounting", A, {
          cookie: as(adminA),
          body: { taxKey: "s_iva_99" },
        })
      ).status,
    ).toBe(400);
    const saved = await json<Status>(
      await request("PATCH", "/api/org/accounting", A, {
        cookie: as(adminA),
        body: {
          taxKey: "s_iva_21",
          numberingSeriesId: "series-cuotas",
          treasuryAccounts: { cash: "caja-01", stripe: "stripe-01" },
        },
      }),
      200,
    );
    expect(saved.connection).toMatchObject({
      tax: { key: "s_iva_21", ratePercent: 21 },
      treasuryAccounts: { cash: "caja-01", stripe: "stripe-01" },
    });
    // Nada que no esté en el contrato, como la clave, se cuela por los ajustes.
    expect(
      (
        await request("PATCH", "/api/org/accounting", A, {
          cookie: as(adminA),
          body: { apiKey: "otra" },
        })
      ).status,
    ).toBe(400);
  });

  it("manda cada cargo una vez, con su contacto, y la factura del deportista va a su familia", async () => {
    for (const feePlanId of [socioPlan, sectionPlan])
      await json(
        await request("POST", "/api/org/fees/charges/generate", A, {
          cookie: as(adminA),
          body: { feePlanId, periodLabel: "Octubre 2026", dueOn: "2099-10-05" },
        }),
        200,
      );
    const list = await json<{ charges: Charge[] }>(
      await request("GET", "/api/org/fees/charges", A, { cookie: as(adminA) }),
      200,
    );
    expect(list.charges.map((c) => c.accounting?.status)).toEqual(["pending", "pending"]);
    pereCharge = list.charges.find((c) => c.person.id === perePerson)!.id;
    claraCharge = list.charges.find((c) => c.person.id === claraPerson)!.id;
    expect((await status()).connection!.counts.pending).toBe(2);

    const first = await sync();
    expect(first).toMatchObject({
      created: { contacts: 2, documents: 2, payments: 0 },
      failed: 0,
      remaining: 0,
      done: true,
    });
    const claraDoc = documentOf(claraCharge)!;
    const lauraContact = holded.contacts.find((c) => c.id === claraDoc.contactId)!;
    expect(lauraContact).toMatchObject({ name: "Laura Martí", email: "laura@club-a.test" });
    expect(claraDoc).toMatchObject({
      kind: "invoices",
      contactName: "Laura Martí",
      numberLineId: "series-cuotas",
      dueDate: "2099-10-05",
      items: [
        expect.objectContaining({
          name: "Cuota de fútbol sala · Octubre 2026",
          description: "Clara Martí · Octubre 2026",
          price: 33.0579,
          taxes: ["s_iva_21"],
        }),
      ],
    });
    expect(holded.contacts.find((c) => c.id === documentOf(pereCharge)!.contactId)).toMatchObject({
      name: "Pere Soci",
      code: "12345678Z",
    });

    const again = await sync();
    expect(again).toMatchObject({
      created: { contacts: 0, documents: 0, payments: 0 },
      remaining: 0,
    });
    expect(holded.documents).toHaveLength(2);
    expect(holded.contacts).toHaveLength(2);
    expect((await charge(claraCharge)).accounting).toMatchObject({ status: "synced" });
    expect((await status()).connection!.counts).toMatchObject({
      contacts: 2,
      documents: 2,
      pending: 0,
    });
  });

  it("un pago a mano sale solo, contra su factura y en su cuenta de tesorería", async () => {
    await json(
      await request("POST", `/api/org/fees/charges/${pereCharge}/payments`, A, {
        cookie: as(adminA),
        body: { amountCents: 1000, method: "cash", paidOn: "2026-10-20" },
      }),
      200,
    );
    expect(documentOf(pereCharge)!.payments).toEqual([
      { amount: "10.00", date: "2026-10-20", treasuryId: "caja-01", description: "Efectivo" },
    ]);
    expect((await sync()).created.payments).toBe(0);
  });

  it("un pago por Stripe llega a Holded desde el webhook, sin tocar nada", async () => {
    await seeder.stripeAccount(clubA.id, "acct_club_a");
    const event = JSON.stringify({
      id: "evt_acc_1",
      type: "checkout.session.completed",
      account: "acct_club_a",
      data: {
        object: {
          id: "cs_test_acc",
          client_reference_id: claraCharge,
          payment_intent: "pi_acc_1",
          amount_total: 4000,
          payment_status: "paid",
        },
      },
    });
    const res = await json<{ recorded: boolean }>(
      await send(api, "POST", "/api/webhooks/stripe", BASE, {
        raw: event,
        headers: { "stripe-signature": await signStripePayload(WEBHOOK_SECRET, event, nowSeconds) },
      }),
      200,
    );
    expect(res.recorded).toBe(true);
    expect(documentOf(claraCharge)!.payments).toEqual([
      expect.objectContaining({
        amount: "40.00",
        treasuryId: "stripe-01",
        description: "Stripe (pago en línea)",
      }),
    ]);
  });

  it("anular un cargo anula su borrador; reactivarlo emite otro", async () => {
    const loose = await json<{ charge: Charge }>(
      await request("POST", "/api/org/fees/charges", A, {
        cookie: as(adminA),
        body: {
          personId: perePerson,
          concept: "Equipación",
          amountCents: 2500,
          dueOn: "2099-01-01",
        },
      }),
      201,
    );
    // Con el envío inmediato activo, el cargo suelto ya está en Holded al responder.
    expect(loose.charge.accounting).toMatchObject({ status: "synced" });
    const firstDoc = documentOf(loose.charge.id)!;

    const cancelled = await json<{ charge: Charge }>(
      await request("PATCH", `/api/org/fees/charges/${loose.charge.id}`, A, {
        cookie: as(adminA),
        body: { status: "cancelled" },
      }),
      200,
    );
    expect(cancelled.charge.accounting).toMatchObject({ status: "cancelled" });
    expect(holded.documents.find((d) => d.id === firstDoc.id)!.status).toBe("cancelled");

    const back = await json<{ charge: Charge }>(
      await request("PATCH", `/api/org/fees/charges/${loose.charge.id}`, A, {
        cookie: as(adminA),
        body: { status: "pending" },
      }),
      200,
    );
    expect(back.charge.accounting).toMatchObject({ status: "synced" });
    expect(documentOf(loose.charge.id)!.id).not.toBe(firstDoc.id);
  });

  it("un rechazo de Holded queda con su motivo, no para la tanda y se reintenta", async () => {
    holded.failNext("POST", /^\/api\/v2\/invoices$/, 422, {
      status: 422,
      detail: "Falta el NIF del cliente",
    });
    const created = await json<{ charge: Charge }>(
      await request("POST", "/api/org/fees/charges", A, {
        cookie: as(adminA),
        body: {
          personId: claraPerson,
          concept: "Campus de Navidad",
          amountCents: 9000,
          dueOn: "2099-12-01",
        },
      }),
      201,
    );
    expect(created.charge.accounting).toMatchObject({ status: "failed" });
    const issues = await json<{
      issues: { entity: string; label: string; error: string; attempts: number }[];
    }>(await request("GET", "/api/org/accounting/issues", A, { cookie: as(adminA) }), 200);
    expect(issues.issues).toHaveLength(1);
    expect(issues.issues[0]).toMatchObject({
      entity: "document",
      label: "Campus de Navidad · Clara Martí",
      attempts: 1,
    });
    expect(issues.issues[0]!.error).toContain("Falta el NIF del cliente");
    expect((await status()).connection!.counts).toMatchObject({ failed: 1, pending: 1 });

    const retried = await sync();
    expect(retried).toMatchObject({ created: { documents: 1 }, failed: 0, remaining: 0 });
    expect((await charge(created.charge.id)).accounting).toMatchObject({ status: "synced" });
    expect(
      (
        await json<{ issues: unknown[] }>(
          await request("GET", "/api/org/accounting/issues", A, { cookie: as(adminA) }),
          200,
        )
      ).issues,
    ).toEqual([]);
  });

  it("con aprobación, la factura sale numerada; anular el cargo deja aviso de rectificativa", async () => {
    await json(
      await request("PATCH", "/api/org/accounting", A, {
        cookie: as(adminA),
        body: { approveDocuments: true },
      }),
      200,
    );
    const created = await json<{ charge: Charge }>(
      await request("POST", "/api/org/fees/charges", A, {
        cookie: as(adminA),
        body: {
          personId: perePerson,
          concept: "Cena de equipo",
          amountCents: 1500,
          dueOn: "2099-02-01",
        },
      }),
      201,
    );
    expect(created.charge.accounting).toMatchObject({ status: "synced", number: "F260001" });
    const cancelled = await json<{ charge: Charge }>(
      await request("PATCH", `/api/org/fees/charges/${created.charge.id}`, A, {
        cookie: as(adminA),
        body: { status: "cancelled" },
      }),
      200,
    );
    expect(cancelled.charge.accounting).toMatchObject({ status: "failed", number: "F260001" });
    const issues = await json<{ issues: { error: string; attempts: number }[] }>(
      await request("GET", "/api/org/accounting/issues", A, { cookie: as(adminA) }),
      200,
    );
    expect(issues.issues[0]!.error).toContain("rectificativa");
    // No se reintenta solo: no tiene arreglo desde la app.
    expect((await sync()).cancelled).toBe(0);
    await json(
      await request("PATCH", "/api/org/accounting", A, {
        cookie: as(adminA),
        body: { approveDocuments: false },
      }),
      200,
    );
  });

  it("con la clave revocada la tanda se para sin quemar intentos; con la nueva, sigue", async () => {
    holded.rotateKey("holded-clave-nueva-0002");
    await json(
      await request("POST", "/api/org/fees/charges/generate", A, {
        cookie: as(adminA),
        body: { feePlanId: socioPlan, periodLabel: "Noviembre 2026", dueOn: "2099-11-05" },
      }),
      200,
    );
    const stopped = await sync();
    expect(stopped).toMatchObject({ created: { documents: 0 }, remaining: 1, done: true });
    const after = await status();
    expect(after.connection!.lastError).toContain("Holded rechaza la clave");
    expect(after.connection!.counts.failed).toBe(1); // solo el aviso de la rectificativa

    expect(
      (
        await request("POST", "/api/org/accounting/key", A, {
          cookie: as(adminA),
          body: { apiKey: "holded-clave-que-tampoco-0003" },
        })
      ).status,
    ).toBe(400);
    const rotated = await json<Status>(
      await request("POST", "/api/org/accounting/key", A, {
        cookie: as(adminA),
        body: { apiKey: "holded-clave-nueva-0002" },
      }),
      200,
    );
    expect(rotated.connection).toMatchObject({ apiKeyHint: "…0002", lastError: null });
    expect(await sync()).toMatchObject({ created: { documents: 1 }, remaining: 0 });
  });

  it("si Holded pide esperar, la tanda para sin quemar intentos y dice cuánto esperar", async () => {
    await json(
      await request("POST", "/api/org/fees/charges/generate", A, {
        cookie: as(adminA),
        body: { feePlanId: socioPlan, periodLabel: "Diciembre 2026", dueOn: "2099-12-05" },
      }),
      200,
    );
    const failedBefore = (await status()).connection!.counts.failed;
    holded.failNext("POST", /^\/api\/v2\/invoices$/, 429, { status: 429 }, { "retry-after": "17" });
    const waiting = await sync();
    expect(waiting).toMatchObject({
      created: { documents: 0 },
      remaining: 1,
      done: false,
      retryAfterSeconds: 17,
    });
    expect((await status()).connection!.counts.failed).toBe(failedBefore);
    expect(await sync()).toMatchObject({
      created: { documents: 1 },
      remaining: 0,
      done: true,
      retryAfterSeconds: null,
    });
  });

  it("en pausa no sale nada; un pedido de la tienda sale con sus líneas al reanudar", async () => {
    await json(
      await request("PATCH", "/api/org/accounting", A, {
        cookie: as(adminA),
        body: { status: "paused" },
      }),
      200,
    );
    expect(
      (await request("POST", "/api/org/accounting/sync", A, { cookie: as(adminA) })).status,
    ).toBe(409);

    const product = await json<{ product: { variants: { id: string; label: string | null }[] } }>(
      await request("POST", "/api/org/store/products", A, {
        cookie: as(adminA),
        body: {
          name: "Camiseta de juego",
          category: "apparel",
          priceCents: 2500,
          status: "active",
          variants: [
            { label: "M", stock: 10 },
            { label: "L", stock: 10 },
          ],
        },
      }),
      201,
    );
    const order = await json<{ order: { payment: { chargeId: string | null } } }>(
      await request("POST", "/api/org/store/orders", A, {
        cookie: as(adminA),
        body: {
          personId: claraPerson,
          items: [{ variantId: product.product.variants[0]!.id, quantity: 2 }],
        },
      }),
      201,
    );
    const orderCharge = order.order.payment.chargeId!;
    expect(documentOf(orderCharge)).toBeUndefined();

    await json(
      await request("PATCH", "/api/org/accounting", A, {
        cookie: as(adminA),
        body: { status: "active" },
      }),
      200,
    );
    expect((await sync()).created.documents).toBe(1);
    const orderDoc = documentOf(orderCharge)!;
    expect(orderDoc).toMatchObject({ tags: ["tienda"], contactName: "Laura Martí" });
    expect(orderDoc.items).toHaveLength(1);
    expect(orderDoc.items[0]).toMatchObject({ name: "Camiseta de juego · M", units: 2 });
    expect(orderDoc.items[0]!.description).toMatch(/^Pedido T-\d{4} · Clara Martí$/);
  });

  it("desconectar borra la clave y los enlaces; lo ya enviado se queda en Holded", async () => {
    const sent = holded.documents.length;
    await json(await request("DELETE", "/api/org/accounting", A, { cookie: as(adminA) }), 200);
    expect((await status()).connection).toBeNull();
    expect(await seeder.accountingLinkCount(clubA.id)).toBe(0);
    expect(holded.documents).toHaveLength(sent);
    expect((await charge(claraCharge)).accounting).toBeUndefined();
    expect(
      (await request("POST", "/api/org/accounting/sync", A, { cookie: as(adminA) })).status,
    ).toBe(404);
  });
});

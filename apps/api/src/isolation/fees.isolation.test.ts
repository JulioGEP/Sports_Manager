import { OpenAPIHono } from "@hono/zod-openapi";
import { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDataLayer, type DataLayer } from "../data/index.ts";
import { createSeeder } from "../data/testing/seed.ts";
import type { AppEnv } from "../http/context.ts";
import { ApiError } from "../http/errors.ts";
import { createFeeRoutes } from "../routes/fees.ts";
import { createOrgRoutes } from "../routes/org.ts";
import { signStripePayload } from "../services/payments/stripe.ts";

/**
 * Cuotas, cobros y Stripe (Bloque 18, ADR 0031) contra una base real: dos clubes, una
 * administradora, una familia y un socio. Comprueba a quién aplica cada plan, la generación de
 * cargos, los pagos a mano, el vencimiento, lo que ve una familia, el aislamiento entre clubes y
 * que Stripe queda preparado pero no se puede activar sin claves. Con claves de prueba y un
 * `fetch` falso, la sesión de Checkout y el webhook firmado registran el pago una sola vez.
 */
const BASE = "sportsmanager.test";
const hostOf = (slug: string) => `${slug}.${BASE}`;
const PASSWORD = "contraseña-de-prueba-123";
// Clave ficticia corta: el escáner de secretos de GitHub bloquea cualquier `sk_test_` con 24 caracteres.
const STRIPE_SECRET = "sk_test_fake";
const WEBHOOK_SECRET = "whsec_test_secret_000000000000";

type Seeded = { id: string; email: string };

describe("cuotas, cobros y Stripe", () => {
  let local: NetlifyDB;
  let data: DataLayer;
  let app: App;
  let seeder: ReturnType<typeof createSeeder>;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let adminA: Seeded;
  let familyA: Seeded;
  let adminB: Seeded;
  const cookies = new Map<string, string>();
  const A = hostOf("club-a");
  const B = hostOf("club-b");

  let memberTypeA = "";
  let memberTypeB = "";
  let perePerson = "";
  let claraPerson = "";
  let sectionA = "";
  let socioPlan = "";
  let sectionPlan = "";
  let pereCharge = "";
  let claraCharge = "";

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0] ?? "")
      .join("; ");

  const requestOn = (
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
  ) => requestOn(app, method, path, host, options);

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

  type Charge = {
    id: string;
    person: { id: string };
    amountCents: number;
    paidCents: number;
    status: string;
    payments: { method: string; amountCents: number }[];
    checkoutUrl: string | null;
  };

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
    data = createDataLayer({ config, connectionString });
    app = createApp({ config, data });
    seeder = createSeeder(connectionString);

    clubA = await seeder.organization({ slug: "club-a", name: "Club A" });
    clubB = await seeder.organization({ slug: "club-b", name: "Club B" });
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
    for (const u of [adminA, familyA, adminB]) cookies.set(u.email, await signIn(u.email, A));

    // Club A: un socio (Pere), la familia (Laura, con cuenta y socia de otro tipo) y su hija Clara,
    // deportista del Alevín A de la sección de fútbol sala.
    memberTypeA = (await seeder.memberType(clubA.id, "Socio")).id;
    const familiar = (await seeder.memberType(clubA.id, "Familiar")).id;
    perePerson = (await seeder.person(clubA.id, { firstName: "Pere", lastName: "Soci" })).id;
    await seeder.clubMember(clubA.id, perePerson, { memberNumber: 1, memberTypeId: memberTypeA });
    const laura = await seeder.person(clubA.id, {
      firstName: "Laura",
      lastName: "Martí",
      userId: familyA.id,
    });
    await seeder.clubMember(clubA.id, laura.id, { memberNumber: 2, memberTypeId: familiar });
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
    sectionA = (await seeder.section(clubA.id, "Fútbol sala")).id;
    const category = await seeder.category(clubA.id, sectionA, "Alevín");
    const team = await seeder.team(clubA.id, {
      sectionId: sectionA,
      categoryId: category.id,
      seasonId: season.id,
      name: "Alevín A",
    });
    await seeder.rosterAdd(clubA.id, team.id, clara.id);
    await seeder.guardian(clubA.id, clara.id, familyA.id, "mother");

    // Club B: su propio socio, para comprobar que nada cruza.
    memberTypeB = (await seeder.memberType(clubB.id, "Socio")).id;
    const bPerson = await seeder.person(clubB.id, { firstName: "Berta", lastName: "Soci" });
    await seeder.clubMember(clubB.id, bPerson.id, { memberNumber: 1, memberTypeId: memberTypeB });
  });

  afterAll(async () => {
    await seeder?.close();
    await data?.close();
    await local?.stop();
  });

  it("un plan aplica a los socios de su tipo o a los deportistas de su sección, nunca a otro club", async () => {
    const bySocio = await json<{ plan: { id: string; appliesTo: number } }>(
      await request("POST", "/api/org/fees/plans", A, {
        cookie: as(adminA),
        body: {
          name: "Cuota de socio",
          amountCents: 1000,
          period: "monthly",
          memberTypeId: memberTypeA,
        },
      }),
      201,
    );
    expect(bySocio.plan.appliesTo).toBe(1);
    socioPlan = bySocio.plan.id;

    const bySection = await json<{ plan: { id: string; appliesTo: number } }>(
      await request("POST", "/api/org/fees/plans", A, {
        cookie: as(adminA),
        body: {
          name: "Cuota de fútbol sala",
          amountCents: 4000,
          period: "monthly",
          sectionId: sectionA,
        },
      }),
      201,
    );
    expect(bySection.plan.appliesTo).toBe(1);
    sectionPlan = bySection.plan.id;

    // El tipo de socio del club B no vale en el club A.
    const cross = await request("POST", "/api/org/fees/plans", A, {
      cookie: as(adminA),
      body: { name: "Ajeno", amountCents: 100, period: "yearly", memberTypeId: memberTypeB },
    });
    expect(cross.status).toBe(400);

    const listA = await json<{ plans: unknown[] }>(
      await request("GET", "/api/org/fees/plans", A, { cookie: as(adminA) }),
      200,
    );
    expect(listA.plans).toHaveLength(2);
    const listB = await json<{ plans: unknown[] }>(
      await request("GET", "/api/org/fees/plans", B, { cookie: as(adminB) }),
      200,
    );
    expect(listB.plans).toHaveLength(0);
    // Sin pertenencia en B, la administradora de A no entra.
    expect((await request("GET", "/api/org/fees/plans", B, { cookie: as(adminA) })).status).toBe(
      403,
    );
    // Una familia no lee las cuotas del club.
    expect((await request("GET", "/api/org/fees/plans", A, { cookie: as(familyA) })).status).toBe(
      403,
    );
  });

  it("genera los cargos de un periodo una sola vez y los marca vencidos cuando pasa la fecha", async () => {
    const first = await json<{ created: number; skipped: number }>(
      await request("POST", "/api/org/fees/charges/generate", A, {
        cookie: as(adminA),
        body: { feePlanId: socioPlan, periodLabel: "Octubre 2026", dueOn: "2026-10-05" },
      }),
      200,
    );
    expect(first).toEqual({ created: 1, skipped: 0 });
    const again = await json<{ created: number; skipped: number }>(
      await request("POST", "/api/org/fees/charges/generate", A, {
        cookie: as(adminA),
        body: { feePlanId: socioPlan, periodLabel: "Octubre 2026", dueOn: "2026-10-05" },
      }),
      200,
    );
    expect(again).toEqual({ created: 0, skipped: 1 });
    const section = await json<{ created: number }>(
      await request("POST", "/api/org/fees/charges/generate", A, {
        cookie: as(adminA),
        body: { feePlanId: sectionPlan, periodLabel: "Octubre 2026", dueOn: "2026-10-05" },
      }),
      200,
    );
    expect(section.created).toBe(1);

    const list = await json<{
      charges: Charge[];
      totals: { pendingCents: number; pendingCount: number; overdueCount: number };
    }>(await request("GET", "/api/org/fees/charges", A, { cookie: as(adminA) }), 200);
    expect(list.charges).toHaveLength(2);
    expect(list.charges.every((c) => c.status === "overdue")).toBe(true);
    expect(list.totals).toMatchObject({ pendingCents: 5000, pendingCount: 2, overdueCount: 2 });
    pereCharge = list.charges.find((c) => c.person.id === perePerson)!.id;
    claraCharge = list.charges.find((c) => c.person.id === claraPerson)!.id;

    // Un cargo suelto con fecha futura nace pendiente; el cargo del club B no se ve desde A.
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
    expect(loose.charge.status).toBe("pending");
    expect(
      (await request("GET", `/api/org/fees/charges/${claraCharge}`, B, { cookie: as(adminB) }))
        .status,
    ).toBe(404);
  });

  it("los pagos a mano suman hasta cubrir el cargo y nunca más", async () => {
    const partial = await json<{ charge: Charge }>(
      await request("POST", `/api/org/fees/charges/${pereCharge}/payments`, A, {
        cookie: as(adminA),
        body: { amountCents: 400, method: "cash", paidOn: "2026-10-10" },
      }),
      200,
    );
    expect(partial.charge).toMatchObject({ paidCents: 400, status: "overdue" });

    const tooMuch = await request("POST", `/api/org/fees/charges/${pereCharge}/payments`, A, {
      cookie: as(adminA),
      body: { amountCents: 601, method: "transfer", paidOn: "2026-10-11" },
    });
    expect(tooMuch.status).toBe(400);

    const rest = await json<{ charge: Charge }>(
      await request("POST", `/api/org/fees/charges/${pereCharge}/payments`, A, {
        cookie: as(adminA),
        body: { amountCents: 600, method: "transfer", paidOn: "2026-10-11" },
      }),
      200,
    );
    expect(rest.charge).toMatchObject({ paidCents: 1000, status: "paid" });
    expect(rest.charge.payments).toHaveLength(2);

    const paidAgain = await request("POST", `/api/org/fees/charges/${pereCharge}/payments`, A, {
      cookie: as(adminA),
      body: { amountCents: 1, method: "cash", paidOn: "2026-10-12" },
    });
    expect(paidAgain.status).toBe(409);
    // Un cargo pagado no se edita ni se anula.
    expect(
      (
        await request("PATCH", `/api/org/fees/charges/${pereCharge}`, A, {
          cookie: as(adminA),
          body: { status: "cancelled" },
        })
      ).status,
    ).toBe(409);
  });

  it("una familia ve y paga solo lo de los suyos; el club cobra a mano hasta activar Stripe", async () => {
    const mine = await json<{ charges: Charge[]; provider: string }>(
      await request("GET", "/api/org/fees/mine", A, { cookie: as(familyA) }),
      200,
    );
    expect(mine.provider).toBe("manual");
    expect(mine.charges.map((c) => c.person.id)).toEqual([claraPerson]);
    expect(mine.charges[0]!.checkoutUrl).toBeNull();
    // Sin Stripe no hay sesión de pago; y el cargo de Pere no es suyo.
    expect(
      (
        await request("POST", `/api/org/fees/charges/${claraCharge}/checkout`, A, {
          cookie: as(familyA),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("POST", `/api/org/fees/charges/${pereCharge}/checkout`, A, {
          cookie: as(familyA),
        })
      ).status,
    ).toBe(403);
    expect((await request("GET", "/api/org/fees/charges", A, { cookie: as(familyA) })).status).toBe(
      403,
    );
  });

  it("sin claves de Stripe en la plataforma, el club no puede activar el cobro por Stripe", async () => {
    const settings = await json<{ payments: { provider: string; stripeConfigured: boolean } }>(
      await request("GET", "/api/org/fees/settings", A, { cookie: as(adminA) }),
      200,
    );
    expect(settings.payments).toMatchObject({ provider: "manual", stripeConfigured: false });
    const activate = await request("PATCH", "/api/org/fees/settings", A, {
      cookie: as(adminA),
      body: { provider: "stripe", stripeAccountId: "acct_123TEST" },
    });
    expect(activate.status).toBe(409);
    // La cuenta sí se puede dejar preparada.
    const connected = await json<{
      payments: { provider: string; stripeAccountId: string | null };
    }>(
      await request("PATCH", "/api/org/fees/settings", A, {
        cookie: as(adminA),
        body: { stripeAccountId: "acct_123TEST" },
      }),
      200,
    );
    expect(connected.payments).toMatchObject({
      provider: "manual",
      stripeAccountId: "acct_123TEST",
    });
    // Una familia no toca los ajustes.
    expect(
      (
        await request("PATCH", "/api/org/fees/settings", A, {
          cookie: as(familyA),
          body: { provider: "manual" },
        })
      ).status,
    ).toBe(403);
  });

  it("con claves de prueba, Checkout da una URL y el webhook firmado registra el pago una sola vez", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      APP_BASE_DOMAIN: BASE,
      TENANT_FALLBACK_SLUG: "demo",
      TENANT_ROUTING: "subdomain",
      EMAIL_TRANSPORT: "outbox",
      STRIPE_SECRET_KEY: STRIPE_SECRET,
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    });
    expect(config.payments.stripeConfigured).toBe(true);
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fakeFetch: typeof fetch = (input, init) => {
      const headers = Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
      );
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, headers, body: typeof init?.body === "string" ? init.body : "" });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "cs_test_123",
            url: "https://checkout.stripe.com/c/pay/cs_test_123",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const stripeApp = new OpenAPIHono<AppEnv>();
    stripeApp.onError((error, c) => {
      if (error instanceof ApiError) return c.json(error.toBody(), error.status);
      throw error;
    });
    stripeApp.route("/", createOrgRoutes(config, data));
    stripeApp.route(
      "/",
      createFeeRoutes(config, data, { fetch: fakeFetch, now: () => nowSeconds }),
    );

    const activated = await json<{ payments: { provider: string } }>(
      await requestOn(stripeApp, "PATCH", "/api/org/fees/settings", A, {
        cookie: as(adminA),
        body: { provider: "stripe" },
      }),
      200,
    );
    expect(activated.payments.provider).toBe("stripe");

    const checkout = await json<{ url: string }>(
      await requestOn(stripeApp, "POST", `/api/org/fees/charges/${claraCharge}/checkout`, A, {
        cookie: as(familyA),
        body: { returnPath: "/family" },
      }),
      200,
    );
    expect(checkout.url).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0]!.headers["stripe-account"]).toBe("acct_123TEST");
    expect(calls[0]!.headers["authorization"]).toBe(`Bearer ${STRIPE_SECRET}`);
    const form = new URLSearchParams(calls[0]!.body);
    expect(form.get("client_reference_id")).toBe(claraCharge);
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("4000");
    // En local y en tests la URL del club va por http (ADR 0016); en producción, https.
    expect(form.get("success_url")).toBe(
      "http://club-a.sportsmanager.test/family?checkout=success",
    );
    expect(form.get("cancel_url")).toBe("http://club-a.sportsmanager.test/family?checkout=cancel");

    const mine = await json<{ charges: Charge[]; provider: string }>(
      await requestOn(stripeApp, "GET", "/api/org/fees/mine", A, { cookie: as(familyA) }),
      200,
    );
    expect(mine.provider).toBe("stripe");
    expect(mine.charges[0]!.checkoutUrl).toBe(`/api/org/fees/charges/${claraCharge}/checkout`);

    const event = JSON.stringify({
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          client_reference_id: claraCharge,
          payment_intent: "pi_test_1",
          amount_total: 4000,
          payment_status: "paid",
          metadata: { charge_id: claraCharge },
        },
      },
    });
    const signature = await signStripePayload(WEBHOOK_SECRET, event, nowSeconds);
    const bad = await requestOn(stripeApp, "POST", "/api/webhooks/stripe", BASE, {
      raw: event,
      headers: { "stripe-signature": `t=${nowSeconds},v1=deadbeef` },
    });
    expect(bad.status).toBe(400);

    const first = await json<{ received: true; recorded: boolean }>(
      await requestOn(stripeApp, "POST", "/api/webhooks/stripe", BASE, {
        raw: event,
        headers: { "stripe-signature": signature },
      }),
      200,
    );
    expect(first.recorded).toBe(true);
    const second = await json<{ received: true; recorded: boolean }>(
      await requestOn(stripeApp, "POST", "/api/webhooks/stripe", BASE, {
        raw: event,
        headers: { "stripe-signature": signature },
      }),
      200,
    );
    expect(second.recorded).toBe(false);

    const charge = await json<{ charge: Charge }>(
      await request("GET", `/api/org/fees/charges/${claraCharge}`, A, { cookie: as(adminA) }),
      200,
    );
    expect(charge.charge).toMatchObject({ status: "paid", paidCents: 4000 });
    expect(charge.charge.payments).toEqual([
      expect.objectContaining({ method: "stripe", amountCents: 4000 }),
    ]);

    // Un cobro que viene de la cuenta de otro club no se apunta; uno sin cobrar (SEPA), tampoco.
    const loose = await json<{ charge: Charge }>(
      await requestOn(stripeApp, "POST", "/api/org/fees/charges", A, {
        cookie: as(adminA),
        body: { personId: perePerson, concept: "Campus", amountCents: 3000, dueOn: "2099-03-01" },
      }),
      201,
    );
    const paid = (id: string, type: string, account: string, paymentStatus: string) =>
      JSON.stringify({
        id,
        type,
        account,
        data: {
          object: {
            id: `cs_${id}`,
            client_reference_id: loose.charge.id,
            payment_intent: `pi_${id}`,
            amount_total: 3000,
            payment_status: paymentStatus,
          },
        },
      });
    for (const body of [
      paid("evt_impostor", "checkout.session.completed", "acct_OTRO", "paid"),
      paid("evt_sepa", "checkout.session.completed", "acct_123TEST", "unpaid"),
    ]) {
      const res = await json<{ recorded: boolean }>(
        await requestOn(stripeApp, "POST", "/api/webhooks/stripe", BASE, {
          raw: body,
          headers: {
            "stripe-signature": await signStripePayload(WEBHOOK_SECRET, body, nowSeconds),
          },
        }),
        200,
      );
      expect(res.recorded).toBe(false);
    }
    const later = paid(
      "evt_sepa_ok",
      "checkout.session.async_payment_succeeded",
      "acct_123TEST",
      "paid",
    );
    const settled = await json<{ recorded: boolean }>(
      await requestOn(stripeApp, "POST", "/api/webhooks/stripe", BASE, {
        raw: later,
        headers: { "stripe-signature": await signStripePayload(WEBHOOK_SECRET, later, nowSeconds) },
      }),
      200,
    );
    expect(settled.recorded).toBe(true);

    // Sin claves, el webhook no existe para nadie.
    expect(
      (
        await request("POST", "/api/webhooks/stripe", BASE, {
          body: { id: "evt", type: "checkout.session.completed", data: { object: {} } },
        })
      ).status,
    ).toBe(400);
  });
  it("Stripe Connect: el club da de alta su cuenta desde los ajustes y solo cobra cuando Stripe lo deja", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      APP_BASE_DOMAIN: BASE,
      TENANT_FALLBACK_SLUG: "demo",
      TENANT_ROUTING: "subdomain",
      EMAIL_TRANSPORT: "outbox",
      STRIPE_SECRET_KEY: STRIPE_SECRET,
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    });
    const calls: { method: string; url: string; headers: Record<string, string>; body: string }[] =
      [];
    let account: Record<string, unknown> = { charges_enabled: false, details_submitted: false };
    const fakeFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
      );
      calls.push({
        method: init?.method ?? "GET",
        url,
        headers,
        body: typeof init?.body === "string" ? init.body : "",
      });
      const reply = (body: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      if (url.endsWith("/v1/accounts")) return reply({ id: "acct_clubB_1" });
      if (url.endsWith("/v1/account_links"))
        return reply({ url: "https://connect.stripe.com/setup/s/acct_clubB_1/abc" });
      if (url.endsWith("/v1/accounts/acct_clubB_1"))
        return reply({ id: "acct_clubB_1", ...account });
      return reply({ error: { message: "ruta falsa" } });
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const stripeApp = new OpenAPIHono<AppEnv>();
    stripeApp.onError((error, c) => {
      if (error instanceof ApiError) return c.json(error.toBody(), error.status);
      throw error;
    });
    stripeApp.route("/", createOrgRoutes(config, data));
    stripeApp.route(
      "/",
      createFeeRoutes(config, data, { fetch: fakeFetch, now: () => nowSeconds }),
    );
    const bAdmin = await signIn(adminB.email, B);

    // Una familia no da de alta la cuenta del club.
    expect(
      (
        await requestOn(stripeApp, "POST", "/api/org/fees/settings/stripe/onboarding", A, {
          cookie: as(familyA),
        })
      ).status,
    ).toBe(403);

    const link = await json<{ url: string }>(
      await requestOn(stripeApp, "POST", "/api/org/fees/settings/stripe/onboarding", B, {
        cookie: bAdmin,
      }),
      200,
    );
    expect(link.url).toBe("https://connect.stripe.com/setup/s/acct_clubB_1/abc");
    const created = calls.find((c) => c.url.endsWith("/v1/accounts"))!;
    const createdForm = new URLSearchParams(created.body);
    expect(createdForm.get("type")).toBe("standard");
    expect(createdForm.get("country")).toBe("ES");
    expect(createdForm.get("business_profile[name]")).toBe("Club B");
    expect(createdForm.get("metadata[organization_id]")).toBe(clubB.id);
    // La cuenta se crea en la plataforma, no en nombre de ninguna otra.
    expect(created.headers["stripe-account"]).toBeUndefined();
    const linkForm = new URLSearchParams(
      calls.find((c) => c.url.endsWith("/v1/account_links"))!.body,
    );
    expect(linkForm.get("account")).toBe("acct_clubB_1");
    expect(linkForm.get("type")).toBe("account_onboarding");
    expect(linkForm.get("return_url")).toBe(
      "http://club-b.sportsmanager.test/settings?tab=payments&stripe=return",
    );
    expect(linkForm.get("refresh_url")).toBe(
      "http://club-b.sportsmanager.test/settings?tab=payments&stripe=refresh",
    );

    const settings = async () =>
      (
        await json<{
          payments: { stripeAccountId: string | null; stripeAccountStatus: string | null };
        }>(await requestOn(stripeApp, "GET", "/api/org/fees/settings", B, { cookie: bAdmin }), 200)
      ).payments;
    expect(await settings()).toMatchObject({
      stripeAccountId: "acct_clubB_1",
      stripeAccountStatus: "onboarding",
    });
    // Con el alta a medias no se activa el cobro por Stripe.
    expect(
      (
        await requestOn(stripeApp, "PATCH", "/api/org/fees/settings", B, {
          cookie: bAdmin,
          body: { provider: "stripe" },
        })
      ).status,
    ).toBe(409);

    // Vuelve del alta con los datos enviados: Stripe aún revisa.
    account = { charges_enabled: false, details_submitted: true };
    const refreshed = await json<{ payments: { stripeAccountStatus: string } }>(
      await requestOn(stripeApp, "POST", "/api/org/fees/settings/stripe/refresh", B, {
        cookie: bAdmin,
      }),
      200,
    );
    expect(refreshed.payments.stripeAccountStatus).toBe("restricted");

    // Stripe avisa por webhook de que ya cobra.
    const event = JSON.stringify({
      id: "evt_account_1",
      type: "account.updated",
      account: "acct_clubB_1",
      data: { object: { id: "acct_clubB_1", charges_enabled: true, details_submitted: true } },
    });
    const received = await json<{ recorded: boolean }>(
      await requestOn(stripeApp, "POST", "/api/webhooks/stripe", BASE, {
        raw: event,
        headers: { "stripe-signature": await signStripePayload(WEBHOOK_SECRET, event, nowSeconds) },
      }),
      200,
    );
    expect(received.recorded).toBe(false);
    expect(await settings()).toMatchObject({ stripeAccountStatus: "enabled" });
    const activated = await json<{ payments: { provider: string } }>(
      await requestOn(stripeApp, "PATCH", "/api/org/fees/settings", B, {
        cookie: bAdmin,
        body: { provider: "stripe" },
      }),
      200,
    );
    expect(activated.payments.provider).toBe("stripe");

    // Volver al alta no crea otra cuenta; y nada de esto toca al club A.
    await json(
      await requestOn(stripeApp, "POST", "/api/org/fees/settings/stripe/onboarding", B, {
        cookie: bAdmin,
      }),
      200,
    );
    expect(calls.filter((c) => c.url.endsWith("/v1/accounts"))).toHaveLength(1);
    expect(await seeder.stripeAccountStatus(clubA.id)).toBeNull();
  });
});

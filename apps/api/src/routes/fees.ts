import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  CheckoutSessionRequestSchema,
  CheckoutSessionResponseSchema,
  FEE_CHARGE_STATUSES,
  FeeChargeCreateSchema,
  FeeChargeGenerateSchema,
  FeeChargeResponseSchema,
  FeeChargesGeneratedResponseSchema,
  FeeChargesResponseSchema,
  FeeChargeUpdateSchema,
  FeePlanCreateSchema,
  FeePlanResponseSchema,
  FeePlansResponseSchema,
  FeePlanUpdateSchema,
  MyFeesResponseSchema,
  PaymentCreateSchema,
  PaymentsSettingsResponseSchema,
  PaymentsSettingsUpdateSchema,
  StripeOnboardingRequestSchema,
  StripeOnboardingResponseSchema,
  stripeAccountCanCharge,
  type FeeCharge,
  type PaymentProvider,
  type StripeAccountStatus,
} from "@sportsmanager/shared";
import type { Context } from "hono";
import type { ApiConfig } from "../config.ts";
import type { FeeChargeRecord } from "../data/fees.ts";
import { localDate, type DataLayer, type OrganizationRow, type OrgScope } from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import { afterResponse } from "../http/background.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";
import type { AccountingService } from "../services/accounting/index.ts";
import { createManualProvider } from "../services/payments/manual.ts";
import { PaymentsProviderError, type PaymentsProvider } from "../services/payments/provider.ts";
import {
  accountStatusOf,
  createStripeProvider,
  type StripeProvider,
} from "../services/payments/stripe.ts";
import { organizationUrl } from "../tenancy.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const errors = {
  401: error("Sin sesión"),
  403: error("Sin pertenencia o sin permiso"),
  404: error("Host sin club o recurso inexistente"),
};
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const idParam = z.object({ id: z.string().uuid() });

export interface FeeRoutesOptions {
  /** `fetch` sustituible en tests para no llamar a Stripe. */
  fetch?: typeof fetch;
  /** Reloj del webhook, en segundos Unix, sustituible en tests. */
  now?: () => number;
  /** Contabilidad (ADR 0042): cada cargo y cada pago salen hacia la herramienta del club. */
  accounting?: AccountingService;
}

/** Eventos de Checkout que confirman el cobro: al momento, o más tarde (pagos que tardan, SEPA). */
const PAID_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

/**
 * Cuotas, cobros y Stripe (Bloque 18, ADR 0031). Lectura con `org.fees.read`, cambios con
 * `org.fees.write`; los ajustes de cobro, con los permisos de ajustes del club. Cada persona con
 * sesión ve y paga lo suyo (y lo de los jugadores de los que es familia) sin permiso de cuotas.
 * El webhook de Stripe entra sin sesión ni club: la firma lo autentica y el cargo dice de qué club es.
 */
export function createFeeRoutes(
  config: ApiConfig,
  data: DataLayer,
  options: FeeRoutesOptions = {},
) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  app.use("/api/org/fees", ...chain);
  app.use("/api/org/fees/*", ...chain);

  const read = requirePermission("org.fees.read");
  const write = requirePermission("org.fees.write");
  const settingsRead = requirePermission("org.settings.read");
  const settingsWrite = requirePermission("org.settings.write");

  const stripe: StripeProvider | null =
    config.payments.stripeSecretKey && config.payments.stripeWebhookSecret
      ? createStripeProvider({
          secretKey: config.payments.stripeSecretKey,
          webhookSecret: config.payments.stripeWebhookSecret,
          ...(options.fetch ? { fetch: options.fetch } : {}),
          ...(options.now ? { now: options.now } : {}),
        })
      : null;
  const manual = createManualProvider();
  const providerFor = (org: OrganizationRow): PaymentsProvider =>
    org.paymentsProvider === "stripe" && stripe ? stripe : manual;

  const scopeOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };
  const audit = (
    c: { get: (key: "sessionUser") => AppEnv["Variables"]["sessionUser"] },
    tenant: { organization: { id: string } },
    action: Parameters<DataLayer["audit"]["record"]>[0]["action"],
    target: string,
    details?: unknown,
  ) =>
    data.audit.record({
      actorUserId: c.get("sessionUser").id,
      organizationId: tenant.organization.id,
      action,
      target,
      details,
    });

  /** Manda un cargo a la contabilidad del club sin hacer esperar la respuesta. */
  const toAccounting = (c: Context<AppEnv>, scope: OrgScope, chargeId: string) =>
    options.accounting
      ? afterResponse(c, () => options.accounting!.syncChargeQuietly(scope, chargeId))
      : Promise.resolve();

  /**
   * Cargos con su documento en la contabilidad (ADR 0042): número si ya está allí, pendiente si le
   * toca y todavía no ha salido. Solo para quien gestiona las cuotas.
   */
  async function adminDtos(
    scope: OrgScope,
    org: OrganizationRow,
    charges: FeeChargeRecord[],
  ): Promise<FeeCharge[]> {
    const dtos = charges.map((ch) => chargeDto(ch, org));
    const connection = await data.accounting.connection.get(scope);
    if (!connection) return dtos;
    const links = await data.accounting.documentLinks(
      scope,
      connection,
      charges.map((ch) => ch.id),
    );
    const provider = connection.provider as "holded";
    return dtos.map((dto, i) => {
      const link = links.get(dto.id);
      const charge = charges[i]!;
      if (link)
        return {
          ...dto,
          accounting: {
            provider,
            status: link.failing && link.status === "synced" ? "failed" : link.status,
            number: link.number,
          },
        };
      // "Desde" es un día del club: se compara en su zona horaria, no en UTC.
      const due =
        charge.status !== "cancelled" &&
        localDate(org.timezone, charge.createdAt) >= connection.syncFrom;
      return { ...dto, accounting: due ? { provider, status: "pending", number: null } : null };
    });
  }
  const adminDto = async (scope: OrgScope, org: OrganizationRow, charge: FeeChargeRecord) =>
    (await adminDtos(scope, org, [charge]))[0]!;

  /** Lo que sale de la API: con enlace de pago si el club cobra por Stripe y el cargo sigue abierto. */
  const chargeDto = (charge: FeeChargeRecord, org: OrganizationRow): FeeCharge => ({
    id: charge.id,
    person: {
      id: charge.person.id,
      firstName: charge.person.firstName,
      lastName: charge.person.lastName,
    },
    plan: charge.plan,
    concept: charge.concept,
    periodLabel: charge.periodLabel,
    amountCents: charge.amountCents,
    paidCents: charge.paidCents,
    dueOn: charge.dueOn,
    status: charge.status,
    payments: charge.payments,
    checkoutUrl: null,
    createdAt: charge.createdAt.toISOString(),
    ...(org.paymentsProvider === "stripe" &&
    stripe &&
    (charge.status === "pending" || charge.status === "overdue")
      ? { checkoutUrl: `/api/org/fees/charges/${charge.id}/checkout` }
      : {}),
  });

  const settingsDto = (org: OrganizationRow) => ({
    provider: org.paymentsProvider as PaymentProvider,
    stripeAccountId: org.stripeAccountId,
    stripeConfigured: config.payments.stripeConfigured,
    stripeAccountStatus: org.stripeAccountStatus as StripeAccountStatus | null,
    currency: "EUR" as const,
  });

  /** Pregunta a Stripe por la cuenta del club y guarda lo que diga. Sin Stripe, no cambia nada. */
  async function refreshAccount(scope: OrgScope, org: OrganizationRow): Promise<OrganizationRow> {
    if (!stripe || !org.stripeAccountId) return org;
    const status = await stripe.connect.accountStatus(org.stripeAccountId);
    if (status === org.stripeAccountStatus) return org;
    return data.organizations.update(scope, { stripeAccountStatus: status });
  }

  const clubBase = (c: Context<AppEnv>, org: OrganizationRow) =>
    organizationUrl(org.slug, config, c.req.header("host"), c.env?.context?.deploy?.context);

  // --- Planes ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/fees/plans",
      tags: ["Cuotas"],
      summary: "Planes de cuota del club, con a cuántas personas aplica cada uno hoy",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Planes", FeePlansResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json({ plans: await data.fees.plans.list(tenant.scope) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/fees/plans",
      tags: ["Cuotas"],
      summary: "Crea un plan de cuota: importe, periodicidad y a quién aplica",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: { content: { "application/json": { schema: FeePlanCreateSchema } }, required: true },
      },
      responses: {
        201: json("Plan creado", FeePlanResponseSchema),
        400: error("Tipo de socio o sección desconocidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.fees.plans.create(tenant.scope, body);
      if (result.outcome === "unknown_member_type")
        throw badRequest("Ese tipo de socio no es de este club.");
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      await audit(c, tenant, "fee_plan.created", result.plan.name, {
        amountCents: body.amountCents,
      });
      return c.json({ plan: result.plan }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/fees/plans/{id}",
      tags: ["Cuotas"],
      summary: "Edita o archiva un plan de cuota",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: FeePlanUpdateSchema } }, required: true },
      },
      responses: {
        200: json("Plan", FeePlanResponseSchema),
        400: error("Tipo de socio o sección desconocidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.fees.plans.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Ese plan no existe.");
      if (result.outcome === "unknown_member_type")
        throw badRequest("Ese tipo de socio no es de este club.");
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      await audit(c, tenant, "fee_plan.updated", result.plan.name, body);
      return c.json({ plan: result.plan }, 200);
    },
  );

  // --- Cargos ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/fees/charges",
      tags: ["Cuotas"],
      summary: "Cargos del club con sus pagos y los totales. Filtros por estado, persona y plan",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        query: z.object({
          status: z.enum(FEE_CHARGE_STATUSES).optional(),
          person: z.string().uuid().optional(),
          plan: z.string().uuid().optional(),
        }),
      },
      responses: { 200: json("Cargos", FeeChargesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { status, person, plan } = c.req.valid("query");
      const result = await data.fees.charges.list(tenant.scope, {
        status,
        personId: person,
        planId: plan,
      });
      return c.json(
        {
          charges: await adminDtos(tenant.scope, tenant.organization, result.charges),
          totals: result.totals,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/fees/charges",
      tags: ["Cuotas"],
      summary: "Crea un cargo suelto para una persona",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: {
          content: { "application/json": { schema: FeeChargeCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Cargo creado", FeeChargeResponseSchema),
        400: error("Persona o plan desconocidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.fees.charges.create(tenant.scope, body, c.get("sessionUser").id);
      if (result.outcome === "unknown_person") throw badRequest("Esa persona no es de este club.");
      if (result.outcome === "unknown_plan") throw badRequest("Ese plan no es de este club.");
      await audit(c, tenant, "fee_charge.created", result.charge.id, {
        personId: body.personId,
        amountCents: body.amountCents,
      });
      await toAccounting(c, tenant.scope, result.charge.id);
      return c.json(
        { charge: await adminDto(tenant.scope, tenant.organization, result.charge) },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/fees/charges/generate",
      tags: ["Cuotas"],
      summary: "Genera el cargo de un periodo para todas las personas a las que aplica un plan",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: {
          content: { "application/json": { schema: FeeChargeGenerateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Cargos generados", FeeChargesGeneratedResponseSchema),
        400: error("Plan desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.fees.charges.generate(tenant.scope, body, c.get("sessionUser").id);
      if (result.outcome === "unknown_plan") throw badRequest("Ese plan no es de este club.");
      await audit(c, tenant, "fee_charge.created", body.feePlanId, {
        periodLabel: body.periodLabel,
        created: result.created,
      });
      return c.json({ created: result.created, skipped: result.skipped }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/fees/charges/{id}",
      tags: ["Cuotas"],
      summary: "Un cargo con sus pagos",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Cargo", FeeChargeResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const charge = await data.fees.charges.byId(tenant.scope, id);
      if (!charge) throw notFound("Ese cargo no existe.");
      return c.json({ charge: await adminDto(tenant.scope, tenant.organization, charge) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/fees/charges/{id}",
      tags: ["Cuotas"],
      summary: "Cambia concepto o vencimiento, o anula un cargo. Un cargo pagado no se toca",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: FeeChargeUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Cargo", FeeChargeResponseSchema),
        409: error("Cargo ya pagado"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.fees.charges.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Ese cargo no existe.");
      if (result.outcome === "not_editable") throw conflict("Un cargo pagado no se cambia.");
      await audit(c, tenant, "fee_charge.updated", id, body);
      if (body.status !== undefined) await toAccounting(c, tenant.scope, id);
      return c.json(
        { charge: await adminDto(tenant.scope, tenant.organization, result.charge) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/fees/charges/{id}/payments",
      tags: ["Cuotas"],
      summary:
        "Apunta un pago a mano (efectivo, transferencia, tarjeta en el club). Nunca más de lo que queda",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: PaymentCreateSchema } }, required: true },
      },
      responses: {
        200: json("Cargo con el pago", FeeChargeResponseSchema),
        400: error("El pago supera lo que queda por pagar"),
        409: error("Cargo anulado o ya pagado"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const outcome = await data.fees.payments.record(
        tenant.scope,
        id,
        body,
        c.get("sessionUser").id,
      );
      if (outcome === "not_found") throw notFound("Ese cargo no existe.");
      if (outcome === "not_payable") throw conflict("Ese cargo está anulado o ya pagado.");
      if (outcome === "exceeds") throw badRequest("El pago supera lo que queda por pagar.");
      if (outcome === "duplicate") throw conflict("Ese pago ya está registrado.");
      await audit(c, tenant, "payment.recorded", id, {
        amountCents: body.amountCents,
        method: body.method,
      });
      await toAccounting(c, tenant.scope, id);
      const charge = (await data.fees.charges.byId(tenant.scope, id))!;
      return c.json({ charge: await adminDto(tenant.scope, tenant.organization, charge) }, 200);
    },
  );

  // --- Ajustes de cobro ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/fees/settings",
      tags: ["Cuotas"],
      summary: "Cómo cobra el club y si la plataforma tiene Stripe configurado",
      security: [{ sessionCookie: [] }],
      middleware: [settingsRead],
      responses: { 200: json("Ajustes de cobro", PaymentsSettingsResponseSchema), ...errors },
    }),
    (c) => {
      const tenant = scopeOf(c);
      return c.json({ payments: settingsDto(tenant.organization) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/fees/settings",
      tags: ["Cuotas"],
      summary:
        "Cambia el proveedor de cobro o la cuenta conectada de Stripe. `stripe` solo con claves en la plataforma y cuenta conectada",
      security: [{ sessionCookie: [] }],
      middleware: [settingsWrite],
      request: {
        body: {
          content: { "application/json": { schema: PaymentsSettingsUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Ajustes de cobro", PaymentsSettingsResponseSchema),
        409: error(
          "Stripe no está configurado en la plataforma o el club no tiene cuenta conectada",
        ),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      if (body.provider === undefined && body.stripeAccountId === undefined)
        throw badRequest("No hay nada que cambiar.");
      const accountId =
        body.stripeAccountId !== undefined
          ? body.stripeAccountId
          : tenant.organization.stripeAccountId;
      const provider = body.provider ?? (tenant.organization.paymentsProvider as PaymentProvider);
      const accountChanged =
        body.stripeAccountId !== undefined &&
        body.stripeAccountId !== tenant.organization.stripeAccountId;
      // Una cuenta escrita a mano empieza sin estado; si Stripe responde, se sabe al momento.
      let accountStatus = accountChanged
        ? null
        : (tenant.organization.stripeAccountStatus as StripeAccountStatus | null);
      if (accountChanged && accountId && stripe) {
        accountStatus = await stripe.connect.accountStatus(accountId).catch(() => null);
      }
      if (provider === "stripe") {
        if (!config.payments.stripeConfigured)
          throw conflict("Stripe no está configurado en la plataforma todavía.");
        if (!accountId)
          throw conflict("Conecta la cuenta de Stripe del club antes de cobrar por Stripe.");
        if (!stripeAccountCanCharge(accountStatus))
          throw conflict(
            "La cuenta de Stripe del club todavía no puede cobrar: termina el alta en Stripe.",
          );
      }
      const updated = await data.organizations.update(tenant.scope, {
        ...(body.provider !== undefined ? { paymentsProvider: body.provider } : {}),
        ...(body.stripeAccountId !== undefined ? { stripeAccountId: body.stripeAccountId } : {}),
        ...(accountChanged ? { stripeAccountStatus: accountStatus } : {}),
      });
      await audit(c, tenant, "organization.payments_updated", tenant.organization.slug, {
        provider: updated.paymentsProvider,
        stripeConnected: Boolean(updated.stripeAccountId),
      });
      return c.json({ payments: settingsDto(updated) }, 200);
    },
  );

  // --- Stripe Connect (ADR 0042): el club da de alta su cuenta desde los ajustes ---
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/fees/settings/stripe/onboarding",
      tags: ["Cuotas"],
      summary:
        "Enlace de alta en Stripe para el club. Crea su cuenta Standard la primera vez; después, continúa el alta",
      security: [{ sessionCookie: [] }],
      middleware: [settingsWrite],
      request: {
        body: {
          content: { "application/json": { schema: StripeOnboardingRequestSchema } },
          required: false,
        },
      },
      responses: {
        200: json("Enlace de alta", StripeOnboardingResponseSchema),
        409: error("Stripe no está configurado en la plataforma o no responde"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      if (!stripe) throw conflict("Stripe no está configurado en la plataforma todavía.");
      const body = c.req.valid("json") ?? {};
      let org = tenant.organization;
      try {
        if (!org.stripeAccountId) {
          const accountId = await stripe.connect.createAccount({
            organizationId: org.id,
            name: org.name,
            email: c.get("sessionUser").email,
            country: "ES",
          });
          org = await data.organizations.update(tenant.scope, {
            stripeAccountId: accountId,
            stripeAccountStatus: "onboarding",
          });
        }
        const back = `${clubBase(c, org)}${body.returnPath ?? "/settings?tab=payments"}`;
        const joiner = back.includes("?") ? "&" : "?";
        const url = await stripe.connect.onboardingLink({
          accountId: org.stripeAccountId!,
          // Si el enlace caduca, Stripe devuelve aquí y la web pide otro.
          refreshUrl: `${back}${joiner}stripe=refresh`,
          returnUrl: `${back}${joiner}stripe=return`,
        });
        await audit(c, tenant, "organization.stripe_onboarding_started", org.slug, {
          stripeAccountId: org.stripeAccountId,
        });
        return c.json({ url }, 200);
      } catch (err) {
        if (err instanceof PaymentsProviderError) throw conflict(err.message);
        throw err;
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/fees/settings/stripe/refresh",
      tags: ["Cuotas"],
      summary: "Pregunta a Stripe cómo está la cuenta del club (al volver del alta) y lo guarda",
      security: [{ sessionCookie: [] }],
      middleware: [settingsWrite],
      responses: {
        200: json("Ajustes de cobro", PaymentsSettingsResponseSchema),
        409: error("Stripe no responde"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      try {
        const org = await refreshAccount(tenant.scope, tenant.organization);
        return c.json({ payments: settingsDto(org) }, 200);
      } catch (err) {
        if (err instanceof PaymentsProviderError) throw conflict(err.message);
        throw err;
      }
    },
  );

  // --- Lo propio: cualquier persona con sesión en el club ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/fees/mine",
      tags: ["Cuotas"],
      summary: "Las cuotas de la persona de la sesión y de los jugadores de los que es familia",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Mis cuotas", MyFeesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      if (c.get("actor").kind !== "member") throw forbidden();
      const charges = await data.fees.charges.forUser(tenant.scope, c.get("sessionUser").id);
      return c.json(
        {
          charges: charges.map((ch) => chargeDto(ch, tenant.organization)),
          provider: tenant.organization.paymentsProvider as PaymentProvider,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/fees/charges/{id}/checkout",
      tags: ["Cuotas"],
      summary:
        "Crea la sesión de pago de Stripe Checkout de un cargo propio. Solo si el club cobra por Stripe",
      security: [{ sessionCookie: [] }],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: CheckoutSessionRequestSchema } },
          required: false,
        },
      },
      responses: {
        200: json("Sesión de pago", CheckoutSessionResponseSchema),
        409: error("El club no cobra por Stripe, o el cargo no está pendiente"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json") ?? {};
      const user = c.get("sessionUser");
      const actor = c.get("actor");
      if (actor.kind !== "member") throw forbidden();
      const charge = await data.fees.charges.byId(tenant.scope, id);
      if (!charge) throw notFound("Ese cargo no existe.");
      const own = await data.fees.charges.belongsToUser(tenant.scope, id, user.id);
      if (!own && !actor.permissions.has("org.fees.write"))
        throw forbidden("Ese cargo no es tuyo.");
      if (charge.status !== "pending" && charge.status !== "overdue")
        throw conflict("Ese cargo no está pendiente de pago.");
      const provider = providerFor(tenant.organization);
      if (provider.kind !== "stripe") throw conflict("El club no cobra por Stripe.");
      const base = organizationUrl(
        tenant.organization.slug,
        config,
        c.req.header("host"),
        c.env?.context?.deploy?.context,
      );
      const returnPath = body.returnPath ?? "/fees";
      const joiner = returnPath.includes("?") ? "&" : "?";
      try {
        const session = await provider.createCheckoutSession({
          charge: {
            id: charge.id,
            concept: charge.concept,
            amountCents: charge.amountCents - charge.paidCents,
            organizationId: tenant.organization.id,
          },
          organization: {
            name: tenant.organization.name,
            stripeAccountId: tenant.organization.stripeAccountId,
          },
          successUrl: `${base}${returnPath}${joiner}checkout=success`,
          cancelUrl: `${base}${returnPath}${joiner}checkout=cancel`,
          customerEmail: user.email,
        });
        await data.fees.charges.setCheckoutSession(tenant.scope, id, session.sessionId);
        return c.json({ url: session.url }, 200);
      } catch (err) {
        if (err instanceof PaymentsProviderError) throw conflict(err.message);
        throw err;
      }
    },
  );

  // --- Webhook de Stripe: sin sesión ni club. La firma autentica; el cargo dice el club ---
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/webhooks/stripe",
      tags: ["Cuotas"],
      summary:
        "Webhook de Stripe. Registra el pago de un cargo al completarse su Checkout y guarda el estado de la cuenta conectada del club",
      request: { body: { content: { "application/json": { schema: z.any() } }, required: false } },
      responses: {
        200: json("Recibido", z.object({ received: z.literal(true), recorded: z.boolean() })),
        400: error("Firma inválida o Stripe sin configurar"),
      },
    }),
    async (c) => {
      if (!stripe) throw badRequest("Stripe no está configurado en la plataforma.");
      const raw = await c.req.text();
      const event = await stripe.verifyWebhook(raw, c.req.header("stripe-signature") ?? null);
      if (!event) throw badRequest("Firma del webhook inválida.");
      const object = event.data.object;

      // La cuenta del club ha cambiado (alta terminada, datos pendientes): se guarda su estado.
      if (event.type === "account.updated") {
        const accountId = typeof object["id"] === "string" ? object["id"] : event.account;
        const club = accountId ? await data.organizations.findByStripeAccount(accountId) : null;
        if (club) {
          await data.organizations.update(club.scope, {
            stripeAccountStatus: accountStatusOf(object),
          });
        }
        return c.json({ received: true as const, recorded: false }, 200);
      }

      if (!PAID_EVENTS.has(event.type))
        return c.json({ received: true as const, recorded: false }, 200);
      // Una sesión completada con un pago que aún no ha entrado (SEPA) llega luego como async_payment_succeeded.
      if (typeof object["payment_status"] === "string" && object["payment_status"] !== "paid")
        return c.json({ received: true as const, recorded: false }, 200);
      const metadata = (object["metadata"] ?? {}) as Record<string, unknown>;
      const chargeId =
        typeof object["client_reference_id"] === "string"
          ? object["client_reference_id"]
          : typeof metadata["charge_id"] === "string"
            ? metadata["charge_id"]
            : null;
      const sessionId = typeof object["id"] === "string" ? object["id"] : null;
      const found = await data.fees.charges.findForWebhook({ chargeId, sessionId });
      if (!found) return c.json({ received: true as const, recorded: false }, 200);
      // El cobro tiene que venir de la cuenta del club del cargo, no de la de otro club.
      if (event.account) {
        const club = await data.organizations.byScope(found.scope);
        if (!club || club.stripeAccountId !== event.account) {
          console.warn("[fees] webhook de una cuenta que no es la del club del cargo", {
            event: event.id,
          });
          return c.json({ received: true as const, recorded: false }, 200);
        }
      }
      const paymentIntent =
        typeof object["payment_intent"] === "string" ? object["payment_intent"] : null;
      const providerRef = paymentIntent ?? sessionId ?? event.id;
      const amountTotal =
        typeof object["amount_total"] === "number"
          ? object["amount_total"]
          : found.charge.amountCents - found.charge.paidCents;
      const outcome = await data.fees.payments.recordFromProvider(found.scope, found.charge.id, {
        amountCents: amountTotal,
        providerRef,
        paidOn: new Date().toISOString().slice(0, 10),
        paymentIntentId: paymentIntent,
      });
      if (outcome === "recorded") {
        await data.audit.record({
          actorUserId: null,
          organizationId: found.scope.organizationId,
          action: "payment.recorded",
          target: found.charge.id,
          details: { amountCents: amountTotal, method: "stripe", providerRef },
        });
        await toAccounting(c, found.scope, found.charge.id);
      }
      return c.json({ received: true as const, recorded: outcome === "recorded" }, 200);
    },
  );

  return app;
}

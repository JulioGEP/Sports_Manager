import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  MyPlanResponseSchema,
  PlanChargesGeneratedSchema,
  PlanChargesGenerateSchema,
  stripeAccountCanCharge,
  SubscriptionCreateSchema,
  SubscriptionResponseSchema,
  SubscriptionsResponseSchema,
  SubscriptionStatusSchema,
  SubscriptionUpdateSchema,
  type Locale,
  type StripeAccountStatus,
} from "@sportsmanager/shared";
import type { Context } from "hono";
import type { ApiConfig } from "../config.ts";
import type { DataLayer, OrgScope, SubscriptionRecord } from "../data/index.ts";
import { afterResponse } from "../http/background.ts";
import { requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, notFound } from "../http/errors.ts";
import type { AccountingService } from "../services/accounting/index.ts";
import {
  auditOf,
  body,
  errors,
  fitnessChain,
  idParam,
  json,
  orgOf,
  requireSelfPlayer,
  subscriptionDto,
  todayIn,
  type Ctx,
} from "./fitness-common.ts";

/** "noviembre de 2026" en el idioma del club, para el periodo de un cargo. */
export function monthLabel(month: string, locale: Locale): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
  (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));

/** Si una tarifa recurrente cobra ese mes: según su periodo, contado desde el mes de alta. */
export function chargesInMonth(sub: SubscriptionRecord, month: string): boolean {
  const first = `${month}-01`;
  const last = `${month}-31`;
  if (sub.billing !== "manual") return false;
  if (sub.status !== "active" && sub.status !== "paused") return false;
  if (sub.startsOn > last) return false;
  if (sub.endsOn && sub.endsOn < first) return false;
  // En pausa el mes entero: ese mes no se cobra.
  if (sub.status === "paused" && (!sub.pausedUntil || sub.pausedUntil >= last)) return false;
  const since = monthsBetween(sub.startsOn.slice(0, 7), month);
  if (since < 0) return false;
  switch (sub.plan.period) {
    case "monthly":
      return true;
    case "quarterly":
      return since % 3 === 0;
    case "yearly":
      return since % 12 === 0;
    default:
      return false;
  }
}

export interface FitnessPlanRoutesOptions {
  accounting?: AccountingService;
}

/**
 * Tarifas contratadas (ADR 0049). La administración da de alta la tarifa de un atleta (con su
 * primer cargo si quiere), la pausa o la da de baja, y genera los cargos del mes de las
 * recurrentes. El atleta ve la suya con lo que lleva gastado. Lectura con `org.fees.read`,
 * cambios con `org.fees.write`.
 */
export function createFitnessPlanRoutes(
  config: ApiConfig,
  data: DataLayer,
  options: FitnessPlanRoutesOptions = {},
) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = fitnessChain(config, data);
  app.use("/api/org/subscriptions", ...chain);
  app.use("/api/org/subscriptions/*", ...chain);
  app.use("/api/org/me/plan", ...chain);
  const audit = auditOf(data);
  const toAccounting = (c: Context<AppEnv>, scope: OrgScope, ids: string[]) =>
    options.accounting && ids.length > 0
      ? afterResponse(c, async () => {
          for (const id of ids) await options.accounting!.syncChargeQuietly(scope, id);
        })
      : Promise.resolve();

  /** Tarifas con lo gastado en el periodo de hoy, contando todas las reservas de sus atletas. */
  async function dtos(c: Ctx, subs: SubscriptionRecord[]) {
    const tenant = orgOf(c);
    const today = todayIn(tenant.organization.timezone);
    const counted = await data.bookings.countedByPlayer(
      tenant.scope,
      [...new Set(subs.map((s) => s.playerId))],
      tenant.organization.timezone,
    );
    return subs.map((s) => subscriptionDto(s, { counted: counted.get(s.playerId) ?? [] }, today));
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/subscriptions",
      tags: ["Fitness"],
      summary: "Tarifas contratadas por los atletas, con lo gastado en el periodo de hoy",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.fees.read")],
      request: {
        query: z.object({
          player: z.string().uuid().optional(),
          status: SubscriptionStatusSchema.optional(),
        }),
      },
      responses: { 200: json("Tarifas", SubscriptionsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const query = c.req.valid("query");
      const subs = await data.bookings.subscriptions.list(
        tenant.scope,
        todayIn(tenant.organization.timezone),
        {
          ...(query.player ? { playerId: query.player } : {}),
          ...(query.status ? { status: [query.status] } : {}),
        },
      );
      return c.json({ plans: await dtos(c, subs) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/subscriptions",
      tags: ["Fitness"],
      summary:
        "Da de alta la tarifa de un atleta desde una fecha. Con `chargeNow`, crea ya el cargo del primer periodo o del bono",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.fees.write")],
      request: body(SubscriptionCreateSchema),
      responses: { 201: json("Tarifa", SubscriptionResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const input = c.req.valid("json");
      const result = await data.bookings.subscriptions.create(
        tenant.scope,
        input,
        c.get("sessionUser").id,
      );
      if (result.outcome === "unknown_player") throw badRequest("Ese atleta no es de este club.");
      if (result.outcome === "unknown_plan")
        throw badRequest("Esa tarifa no existe o está archivada.");
      const sub = result.subscription;
      if (input.chargeNow) {
        const label = monthLabel(
          input.startsOn.slice(0, 7),
          tenant.organization.defaultLocale as Locale,
        );
        const created = await data.fees.charges.generateFor(
          tenant.scope,
          [
            {
              personId: sub.personId,
              feePlanId: sub.plan.id,
              concept: `${sub.plan.name} · ${label}`,
              amountCents: sub.plan.amountCents,
            },
          ],
          label,
          input.startsOn,
          c.get("sessionUser").id,
        );
        await toAccounting(c, tenant.scope, created.created);
      }
      await audit(c, "subscription.created", sub.playerName, {
        plan: sub.plan.name,
        startsOn: sub.startsOn,
      });
      const [plan] = await dtos(c, [sub]);
      return c.json({ plan: plan! }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/subscriptions/{id}",
      tags: ["Fitness"],
      summary: "Pausa, reactiva o da de baja una tarifa, o le pone fecha de fin",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.fees.write")],
      request: { params: idParam, ...body(SubscriptionUpdateSchema) },
      responses: { 200: json("Tarifa", SubscriptionResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      if (patch.status === "paused" && !patch.pausedUntil)
        throw badRequest("Una pausa necesita hasta qué día dura.");
      const result = await data.bookings.subscriptions.update(tenant.scope, id, patch);
      if (result.outcome === "not_found") throw notFound("Esa tarifa no existe.");
      if (result.outcome === "invalid_dates")
        throw badRequest("La tarifa no puede acabar antes de empezar.");
      await audit(c, "subscription.updated", result.subscription.playerName, patch);
      const [plan] = await dtos(c, [result.subscription]);
      return c.json({ plan: plan! }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/subscriptions/charges",
      tags: ["Fitness"],
      summary:
        "Genera los cargos de un mes para las tarifas recurrentes activas cobradas a mano (las domiciliadas las cobra Stripe). Salta las que ya lo tienen",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.fees.write")],
      request: body(PlanChargesGenerateSchema),
      responses: { 200: json("Cargos", PlanChargesGeneratedSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const input = c.req.valid("json");
      const subs = await data.bookings.subscriptions.list(
        tenant.scope,
        todayIn(tenant.organization.timezone),
        { status: ["active", "paused"] },
      );
      const label = monthLabel(input.month, tenant.organization.defaultLocale as Locale);
      const due = subs.filter((s) => chargesInMonth(s, input.month));
      const result = await data.fees.charges.generateFor(
        tenant.scope,
        due.map((s) => ({
          personId: s.personId,
          feePlanId: s.plan.id,
          concept: `${s.plan.name} · ${label}`,
          amountCents: s.plan.amountCents,
        })),
        label,
        input.dueOn,
        c.get("sessionUser").id,
      );
      await toAccounting(c, tenant.scope, result.created);
      await audit(c, "subscription.charges_generated", label, {
        created: result.created.length,
        skipped: result.skipped,
      });
      return c.json({ created: result.created.length, skipped: result.skipped }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/me/plan",
      tags: ["Fitness"],
      summary:
        "Las tarifas del atleta con lo gastado en el periodo de hoy, y si puede domiciliarlas por Stripe",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      responses: { 200: json("Mi tarifa", MyPlanResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = orgOf(c);
      const player = await requireSelfPlayer(data, c);
      const subs = await data.bookings.subscriptions.list(
        tenant.scope,
        todayIn(tenant.organization.timezone),
        { playerId: player.id },
      );
      const org = tenant.organization;
      const canSubscribe =
        config.payments.stripeConfigured &&
        org.paymentsProvider === "stripe" &&
        Boolean(org.stripeAccountId) &&
        stripeAccountCanCharge(org.stripeAccountStatus as StripeAccountStatus | null);
      return c.json({ plans: await dtos(c, subs), canSubscribe }, 200);
    },
  );

  return app;
}

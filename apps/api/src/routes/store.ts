import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  DeveloperSettingsResponseSchema,
  MyStoreOrdersResponseSchema,
  PaymentCreateSchema,
  STORE_IMAGE_CONTENT_TYPES,
  STORE_IMAGE_MAX_BYTES,
  STORE_LOW_STOCK,
  STORE_ORDER_STATUSES,
  StoreCatalogResponseSchema,
  StoreOrderCreateSchema,
  StoreOrderResponseSchema,
  StoreOrdersResponseSchema,
  StoreOrderUpdateSchema,
  StorePeopleResponseSchema,
  StoreProductCreateSchema,
  StoreProductResponseSchema,
  StoreProductsResponseSchema,
  StoreProductUpdateSchema,
  storeOrderCode,
  type PaymentProvider,
  type StoreOrder,
  type StorePaymentStatus,
  type StoreProduct,
} from "@sportsmanager/shared";
import type { Context } from "hono";
import type { ApiConfig } from "../config.ts";
import {
  isLogoContentType,
  sniffImageType,
  storeImageUrlFor,
  storeImageVersion,
  type DataLayer,
  type OrganizationRow,
  type StoreOrderRecord,
  type StoreProductRecord,
} from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import { afterResponse } from "../http/background.ts";
import type { AppEnv } from "../http/context.ts";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
} from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";
import type { AccountingService } from "../services/accounting/index.ts";
import { absoluteApiUrl } from "../tenancy.ts";

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
const imageBody = Object.fromEntries(
  STORE_IMAGE_CONTENT_TYPES.map((type) => [
    type,
    { schema: z.string().openapi({ format: "binary" }) },
  ]),
);

/** Lo que ve quien gestiona la tienda de un producto. */
export function productDto(product: StoreProductRecord): StoreProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    priceCents: product.priceCents,
    memberPriceCents: product.memberPriceCents,
    imageUrl: storeImageUrlFor(product.imageBlobKey, product.id),
    status: product.status,
    visibility: product.visibility,
    section: product.section,
    team: product.team,
    availableUntil: product.availableUntil,
    variants: product.variants.map(({ id, label, stock, sold }) => ({ id, label, stock, sold })),
    createdAt: product.createdAt.toISOString(),
  };
}

/** Hay stock: sin límite o con alguna unidad. */
export const inStock = (stock: number | null) => stock === null || stock > 0;

export interface StoreRoutesOptions {
  /** Contabilidad (ADR 0042): el cargo del pedido sale hacia la herramienta del club al moverse. */
  accounting?: AccountingService;
}

/**
 * Tienda del club (ADR 0041). La gestión (productos, stock y pedidos) pide `org.store.read` o
 * `org.store.write`; la clave del catálogo público, los ajustes del club. Comprar no pide permiso:
 * lo puede hacer la familia de un menor (para él) o el deportista adulto con su cuenta (para sí),
 * y la API lo comprueba en cada pedido. El cobro es un cargo de cuotas: se paga como una cuota.
 */
export function createStoreRoutes(
  config: ApiConfig,
  data: DataLayer,
  options: StoreRoutesOptions = {},
) {
  const app = new OpenAPIHono<AppEnv>();
  /** El cargo del pedido, a la contabilidad del club, sin hacer esperar a nadie. */
  const toAccounting = (c: Context<AppEnv>, tenant: Tenant, chargeId: string | undefined) =>
    options.accounting && chargeId
      ? afterResponse(c, () => options.accounting!.syncChargeQuietly(tenant.scope, chargeId))
      : Promise.resolve();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  app.use("/api/org/store", ...chain);
  app.use("/api/org/store/*", ...chain);

  const read = requirePermission("org.store.read");
  const write = requirePermission("org.store.write");
  const developer = requirePermission("org.settings.write");

  const scopeOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };
  type Tenant = ReturnType<typeof scopeOf>;
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
  const memberId = (c: { get: (key: "actor") => AppEnv["Variables"]["actor"] }) => {
    const actor = c.get("actor");
    if (actor.kind !== "member") throw forbidden();
    return actor.userId;
  };

  /** El club cobra en línea: Stripe con claves en la plataforma y cuenta conectada. */
  const onlinePayments = (org: OrganizationRow) =>
    org.paymentsProvider === "stripe" &&
    config.payments.stripeConfigured &&
    Boolean(org.stripeAccountId);

  const providerOf = (org: OrganizationRow): PaymentProvider =>
    onlinePayments(org) ? "stripe" : "manual";

  const orderDto = (order: StoreOrderRecord, org: OrganizationRow): StoreOrder => {
    const charge = order.charge;
    const status: StorePaymentStatus = charge ? charge.status : "free";
    return {
      id: order.id,
      number: order.number,
      code: storeOrderCode(order.number),
      person: order.person,
      placedBy: order.placedBy,
      channel: order.channel,
      status: order.status,
      totalCents: order.totalCents,
      note: order.note,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        productName: i.productName,
        variantLabel: i.variantLabel,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        imageUrl: i.productId ? storeImageUrlFor(i.productImageKey, i.productId) : null,
      })),
      payment: {
        status,
        chargeId: charge?.id ?? null,
        paidCents: charge?.paidCents ?? 0,
        dueOn: charge?.dueOn ?? null,
        payableOnline:
          onlinePayments(org) &&
          order.status !== "cancelled" &&
          (status === "pending" || status === "overdue"),
      },
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  };

  const orderOr404 = async (tenant: Tenant, id: string) => {
    const order = await data.store.orders.byId(tenant.scope, id);
    if (!order) throw notFound("Ese pedido no existe.");
    return order;
  };

  /** Traduce lo que dice la capa de datos al crear un pedido. */
  function orderFailure(
    result: Exclude<
      Awaited<ReturnType<DataLayer["store"]["orders"]["create"]>>,
      { outcome: "created" }
    >,
  ): never {
    switch (result.outcome) {
      case "unknown_person":
        throw badRequest("Esa persona no es de este club.");
      case "not_beneficiary":
        throw forbidden("Solo puedes comprar para ti o para los menores de tu familia.");
      case "unknown_variant":
        throw badRequest("Alguno de los productos ya no existe.");
      case "unavailable":
        throw conflict(`«${result.product}» no está a la venta para esta persona.`);
      case "out_of_stock":
        throw conflict(
          result.left === 0
            ? `«${result.product}${result.variant ? ` · ${result.variant}` : ""}» está agotado.`
            : `De «${result.product}${result.variant ? ` · ${result.variant}` : ""}» solo quedan ${result.left}.`,
        );
    }
  }

  // --- Productos ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/store/products",
      tags: ["Tienda"],
      summary: "Productos de la tienda con sus opciones, el stock y lo vendido",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Productos", StoreProductsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const products = await data.store.products.list(tenant.scope);
      return c.json({ products: products.map(productDto) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/store/products",
      tags: ["Tienda"],
      summary:
        "Crea un producto: precio, opciones con stock, a quién se vende y si sale en el catálogo público",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: {
          content: { "application/json": { schema: StoreProductCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Producto creado", StoreProductResponseSchema),
        400: error("Sección o equipo desconocidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.store.products.create(tenant.scope, body, c.get("sessionUser").id);
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "unknown_team") throw badRequest("Ese equipo no es de este club.");
      await audit(c, tenant, "store_product.created", result.product.name, {
        priceCents: body.priceCents,
        variants: body.variants.length,
      });
      return c.json({ product: productDto(result.product) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/store/products/{id}",
      tags: ["Tienda"],
      summary:
        "Edita un producto, su stock u opciones, o lo publica, lo retira o lo archiva. Los pedidos guardan lo que se compró",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: StoreProductUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Producto", StoreProductResponseSchema),
        400: error("Sección, equipo u opción desconocidos"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.store.products.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Ese producto no existe.");
      if (result.outcome === "unknown_section") throw badRequest("Esa sección no es de este club.");
      if (result.outcome === "unknown_team") throw badRequest("Ese equipo no es de este club.");
      if (result.outcome === "unknown_variant")
        throw badRequest("Alguna opción no es de este producto.");
      await audit(c, tenant, "store_product.updated", result.product.name, body);
      return c.json({ product: productDto(result.product) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/store/products/{id}/image",
      tags: ["Tienda"],
      summary: `Sube la foto del producto (cuerpo binario, ${STORE_IMAGE_CONTENT_TYPES.join(", ")}, máximo ${STORE_IMAGE_MAX_BYTES} bytes)`,
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam, body: { content: imageBody, required: true } },
      responses: {
        200: json("Producto", StoreProductResponseSchema),
        413: error("Demasiado grande"),
        415: error("Formato no admitido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const declared =
        (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!isLogoContentType(declared)) throw unsupportedMediaType();
      const length = Number(c.req.header("content-length") ?? "0");
      if (length > STORE_IMAGE_MAX_BYTES) throw payloadTooLarge();
      const body = await c.req.arrayBuffer();
      if (body.byteLength === 0) throw badRequest("El fichero está vacío.");
      if (body.byteLength > STORE_IMAGE_MAX_BYTES) throw payloadTooLarge();
      if (sniffImageType(new Uint8Array(body)) !== declared)
        throw unsupportedMediaType("El contenido no coincide con el formato declarado.");
      const key = await data.store.products.uploadImage(tenant.scope, id, body, declared, {
        cleanup: c.env?.context?.deploy?.context === "production",
      });
      if (!key) throw notFound("Ese producto no existe.");
      const product = (await data.store.products.byId(tenant.scope, id))!;
      await audit(c, tenant, "store_product.image_updated", product.name);
      return c.json({ product: productDto(product) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/store/products/{id}/image",
      tags: ["Tienda"],
      summary: "Quita la foto del producto",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam },
      responses: { 200: json("Producto", StoreProductResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const product = await data.store.products.byId(tenant.scope, id);
      if (!product) throw notFound("Ese producto no existe.");
      const removed = await data.store.products.removeImage(tenant.scope, id, {
        cleanup: c.env?.context?.deploy?.context === "production",
      });
      if (removed) await audit(c, tenant, "store_product.image_removed", product.name);
      return c.json({ product: productDto({ ...product, imageBlobKey: null }) }, 200);
    },
  );

  // --- Pedidos: gestión ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/store/orders",
      tags: ["Tienda"],
      summary:
        "Pedidos de la tienda con su cobro y los totales (por preparar, listos, por cobrar). Filtros por estado y persona",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        query: z.object({
          status: z.enum(STORE_ORDER_STATUSES).optional(),
          person: z.string().uuid().optional(),
        }),
      },
      responses: { 200: json("Pedidos", StoreOrdersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { status, person } = c.req.valid("query");
      const orders = await data.store.orders.list(tenant.scope, { status, personId: person });
      const totals = { toPrepare: 0, ready: 0, unpaidCents: 0, unpaidCount: 0, paidCents: 0 };
      for (const o of orders) {
        if (o.status === "cancelled") continue;
        if (o.status === "pending") totals.toPrepare += 1;
        if (o.status === "ready") totals.ready += 1;
        if (o.charge) {
          totals.paidCents += o.charge.paidCents;
          if (o.charge.status === "pending" || o.charge.status === "overdue") {
            totals.unpaidCents += Math.max(0, o.charge.amountCents - o.charge.paidCents);
            totals.unpaidCount += 1;
          }
        }
      }
      return c.json({ orders: orders.map((o) => orderDto(o, tenant.organization)), totals }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/store/orders/{id}",
      tags: ["Tienda"],
      summary: "Un pedido con sus líneas y su cobro",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Pedido", StoreOrderResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      return c.json({ order: orderDto(await orderOr404(tenant, id), tenant.organization) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/store/orders",
      tags: ["Tienda"],
      summary:
        "Pedido de mostrador: el club vende a cualquier persona del club. Baja el stock y abre el cargo",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: {
          content: { "application/json": { schema: StoreOrderCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Pedido creado", StoreOrderResponseSchema),
        400: error("Persona u opción desconocidas"),
        409: error("Sin stock o producto archivado"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.store.orders.create(tenant.scope, body, {
        placedBy: c.get("sessionUser").id,
        channel: "counter",
        beneficiaries: null,
      });
      if (result.outcome !== "created") orderFailure(result);
      await audit(c, tenant, "store_order.created", storeOrderCode(result.order.number), {
        personId: body.personId,
        totalCents: result.order.totalCents,
        channel: "counter",
      });
      await toAccounting(c, tenant, result.order.charge?.id);
      return c.json({ order: orderDto(result.order, tenant.organization) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/store/orders/{id}",
      tags: ["Tienda"],
      summary:
        "Cambia el estado del pedido: recibido, listo para recoger, entregado o anulado. Anular devuelve el stock y anula el cargo si no se ha cobrado",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: StoreOrderUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json(
          "Pedido y lo que hay que devolver",
          StoreOrderResponseSchema.extend({ refundCents: z.number().int().nonnegative() }),
        ),
        409: error("Cambio de estado no permitido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const result = await data.store.orders.setStatus(tenant.scope, id, status);
      if (result.outcome === "not_found") throw notFound("Ese pedido no existe.");
      if (result.outcome === "invalid_transition")
        throw conflict(
          result.from === "cancelled"
            ? "Un pedido anulado ya no cambia."
            : "Un pedido entregado no se anula.",
        );
      await audit(
        c,
        tenant,
        status === "cancelled" ? "store_order.cancelled" : "store_order.updated",
        storeOrderCode(result.order.number),
        { status, refundCents: result.refundCents },
      );
      if (status === "cancelled") await toAccounting(c, tenant, result.order.charge?.id);
      return c.json(
        { order: orderDto(result.order, tenant.organization), refundCents: result.refundCents },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/store/orders/{id}/payments",
      tags: ["Tienda"],
      summary:
        "Apunta un pago a mano del pedido (efectivo, transferencia, tarjeta en el club) en su cargo",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: PaymentCreateSchema } }, required: true },
      },
      responses: {
        200: json("Pedido con el pago", StoreOrderResponseSchema),
        400: error("El pago supera lo que queda por pagar"),
        409: error("Pedido sin cargo, anulado o ya pagado"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const order = await orderOr404(tenant, id);
      if (!order.charge) throw conflict("Este pedido no tiene nada que cobrar.");
      if (order.status === "cancelled") throw conflict("Este pedido está anulado.");
      const outcome = await data.fees.payments.record(
        tenant.scope,
        order.charge.id,
        body,
        c.get("sessionUser").id,
      );
      if (outcome === "not_found") throw notFound("El cargo del pedido no existe.");
      if (outcome === "not_payable") throw conflict("Este pedido ya está pagado.");
      if (outcome === "exceeds") throw badRequest("El pago supera lo que queda por pagar.");
      if (outcome === "duplicate") throw conflict("Ese pago ya está registrado.");
      await audit(c, tenant, "payment.recorded", order.charge.id, {
        amountCents: body.amountCents,
        method: body.method,
        order: storeOrderCode(order.number),
      });
      await toAccounting(c, tenant, order.charge.id);
      return c.json({ order: orderDto(await orderOr404(tenant, id), tenant.organization) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/store/people",
      tags: ["Tienda"],
      summary: "Busca personas del club para un pedido de mostrador (nombre o email)",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { query: z.object({ q: z.string().max(80).optional() }) },
      responses: { 200: json("Personas", StorePeopleResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { q } = c.req.valid("query");
      return c.json({ people: await data.store.people(tenant.scope, q ?? "") }, 200);
    },
  );

  // --- Comprar: la familia de un menor o el deportista adulto ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/store/catalog",
      tags: ["Tienda"],
      summary:
        "Lo que la persona de la sesión puede comprar hoy y para quién: ella misma si es deportista adulta, o los menores de su familia",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Catálogo", StoreCatalogResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const userId = memberId(c);
      const beneficiaries = await data.store.beneficiariesFor(tenant.scope, userId);
      const catalog = await data.store.catalog(tenant.scope, beneficiaries);
      return c.json(
        {
          products: catalog.map(({ product, beneficiaryIds }) => ({
            id: product.id,
            name: product.name,
            description: product.description,
            category: product.category,
            priceCents: product.priceCents,
            memberPriceCents: product.memberPriceCents,
            imageUrl: storeImageUrlFor(product.imageBlobKey, product.id),
            availableUntil: product.availableUntil,
            variants: product.variants.map((v) => ({
              id: v.id,
              label: v.label,
              inStock: inStock(v.stock),
              lowStock:
                v.stock !== null && v.stock > 0 && v.stock <= STORE_LOW_STOCK ? v.stock : null,
            })),
            beneficiaryIds,
          })),
          beneficiaries: beneficiaries.map(
            ({ personId, firstName, lastName, kind, memberPrice }) => ({
              personId,
              firstName,
              lastName,
              kind,
              memberPrice,
            }),
          ),
          provider: providerOf(tenant.organization),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/store/mine",
      tags: ["Tienda"],
      summary:
        "Los pedidos de la persona de la sesión: los que ha hecho y los de los jugadores de su familia",
      security: [{ sessionCookie: [] }],
      responses: { 200: json("Mis pedidos", MyStoreOrdersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const orders = await data.store.orders.forUser(tenant.scope, memberId(c));
      return c.json(
        {
          orders: orders.map((o) => orderDto(o, tenant.organization)),
          provider: providerOf(tenant.organization),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/store/mine/orders",
      tags: ["Tienda"],
      summary:
        "Hace un pedido para uno de los suyos. Comprueba que se vende a esa persona y que hay stock, y abre el cargo que se paga como una cuota",
      security: [{ sessionCookie: [] }],
      request: {
        body: {
          content: { "application/json": { schema: StoreOrderCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Pedido creado", StoreOrderResponseSchema),
        400: error("Producto desconocido"),
        409: error("Sin stock o fuera de venta"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const userId = memberId(c);
      const body = c.req.valid("json");
      const beneficiaries = await data.store.beneficiariesFor(tenant.scope, userId);
      const result = await data.store.orders.create(tenant.scope, body, {
        placedBy: userId,
        channel: "app",
        beneficiaries,
      });
      if (result.outcome !== "created") orderFailure(result);
      await audit(c, tenant, "store_order.created", storeOrderCode(result.order.number), {
        personId: body.personId,
        totalCents: result.order.totalCents,
        channel: "app",
      });
      await toAccounting(c, tenant, result.order.charge?.id);
      return c.json({ order: orderDto(result.order, tenant.organization) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/store/mine/orders/{id}/cancel",
      tags: ["Tienda"],
      summary:
        "Anula un pedido propio mientras el club no lo ha preparado ni se ha pagado. Devuelve el stock",
      security: [{ sessionCookie: [] }],
      request: { params: idParam },
      responses: {
        200: json("Pedido anulado", StoreOrderResponseSchema),
        409: error("El pedido ya está preparado o pagado"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const userId = memberId(c);
      const { id } = c.req.valid("param");
      if (!(await data.store.orders.belongsToUser(tenant.scope, id, userId)))
        throw notFound("Ese pedido no existe.");
      const order = await orderOr404(tenant, id);
      if (order.status !== "pending" || (order.charge?.paidCents ?? 0) > 0)
        throw conflict("El club ya lo ha preparado o está pagado: pide al club que lo anule.");
      const result = await data.store.orders.setStatus(tenant.scope, id, "cancelled");
      if (result.outcome !== "updated") throw conflict("Este pedido ya no se puede anular.");
      await audit(c, tenant, "store_order.cancelled", storeOrderCode(order.number), {
        by: "buyer",
      });
      await toAccounting(c, tenant, result.order.charge?.id);
      return c.json({ order: orderDto(result.order, tenant.organization) }, 200);
    },
  );

  // --- Desarrolladores: la clave del catálogo público ---
  const developerDto = async (tenant: Tenant, host: string | undefined, deploy?: string) => {
    const [publicKey, products] = await Promise.all([
      data.store.publicKey.of(tenant.scope),
      data.store.publicCatalog(tenant.scope),
    ]);
    return {
      publicKey,
      publicProducts: products.length,
      apiBase: absoluteApiUrl("/api/public/v1", config, host, deploy),
    };
  };

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/store/developer",
      tags: ["Tienda"],
      summary: "La clave publicable del catálogo y cuántos productos verá la web del club",
      security: [{ sessionCookie: [] }],
      middleware: [developer],
      responses: { 200: json("Desarrolladores", DeveloperSettingsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json(
        {
          developer: await developerDto(
            tenant,
            c.req.header("host"),
            c.env?.context?.deploy?.context,
          ),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/store/developer/key",
      tags: ["Tienda"],
      summary:
        "Crea la clave publicable del catálogo, o la cambia por una nueva: la anterior deja de funcionar al momento",
      security: [{ sessionCookie: [] }],
      middleware: [developer],
      responses: { 200: json("Desarrolladores", DeveloperSettingsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const had = await data.store.publicKey.of(tenant.scope);
      await data.store.publicKey.rotate(tenant.scope);
      await audit(c, tenant, "store.public_key_updated", tenant.organization.slug, {
        action: had ? "rotated" : "created",
      });
      return c.json(
        {
          developer: await developerDto(
            tenant,
            c.req.header("host"),
            c.env?.context?.deploy?.context,
          ),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/store/developer/key",
      tags: ["Tienda"],
      summary: "Apaga el catálogo público: la clave deja de funcionar",
      security: [{ sessionCookie: [] }],
      middleware: [developer],
      responses: { 200: json("Desarrolladores", DeveloperSettingsResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      await data.store.publicKey.disable(tenant.scope);
      await audit(c, tenant, "store.public_key_updated", tenant.organization.slug, {
        action: "disabled",
      });
      return c.json(
        {
          developer: await developerDto(
            tenant,
            c.req.header("host"),
            c.env?.context?.deploy?.context,
          ),
        },
        200,
      );
    },
  );

  /**
   * Foto de un producto. Sin sesión ni club: se ve en la app y en la web del club, y el id del
   * producto (un UUID) basta. Cuerpo binario; fuera de la documentación OpenAPI por no ser JSON.
   */
  app.get("/api/store/products/:id/image", async (c) => {
    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success) throw notFound();
    const image = await data.store.products.readImage(id);
    if (!image) throw notFound("Este producto no tiene foto.");
    const etag = `"${storeImageVersion(image.key)}"`;
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.body(image.body, 200, {
      "content-type": image.contentType,
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
      etag,
    });
  });

  return app;
}

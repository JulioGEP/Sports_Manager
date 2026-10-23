import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  AccountingConnectSchema,
  AccountingIssuesResponseSchema,
  AccountingOptionsResponseSchema,
  AccountingRetryResponseSchema,
  AccountingSettingsUpdateSchema,
  AccountingStatusResponseSchema,
  AccountingSyncResponseSchema,
  ApiErrorSchema,
  apiKeyHint,
  percentToBasisPoints,
  type AccountingConnection,
  type AccountingDocumentType,
  type AccountingProvider,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  localDate,
  type AccountingConnectionPatch,
  type AccountingConnectionRow,
  type DataLayer,
  type OrgScope,
} from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";
import {
  AccountingProviderError,
  createAccountingService,
  type AccountingService,
} from "../services/accounting/index.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const errors = {
  401: error("Sin sesión"),
  403: error("Sin pertenencia o sin permiso"),
  404: error("Host sin club o sin conexión"),
};
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});

export interface AccountingRoutesOptions {
  /** El servicio compartido con las cuotas; en tests, con un `fetch` falso. */
  service?: AccountingService;
}

/**
 * Conectores de contabilidad (ADR 0042). Quien gestiona las cuotas (`org.fees.read`) ve el estado
 * y lo pendiente, y con `org.fees.write` lanza tandas y reintentos. Conectar, cambiar ajustes,
 * cambiar la clave y desconectar son ajustes del club (`org.settings.write`). La clave entra una
 * vez, se comprueba contra la herramienta y se guarda cifrada: ninguna respuesta la devuelve.
 */
export function createAccountingRoutes(
  config: ApiConfig,
  data: DataLayer,
  options: AccountingRoutesOptions = {},
) {
  const app = new OpenAPIHono<AppEnv>();
  const service = options.service ?? createAccountingService(config, data);
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  app.use("/api/org/accounting", ...chain);
  app.use("/api/org/accounting/*", ...chain);

  const read = requirePermission("org.fees.read");
  const run = requirePermission("org.fees.write");
  const manage = requirePermission("org.settings.write");

  const tenantOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };
  const audit = (
    c: { get: (key: "sessionUser") => AppEnv["Variables"]["sessionUser"] },
    organizationId: string,
    action: Parameters<DataLayer["audit"]["record"]>[0]["action"],
    target: string,
    details?: unknown,
  ) =>
    data.audit.record({
      actorUserId: c.get("sessionUser").id,
      organizationId,
      action,
      target,
      details,
    });

  async function connectionDto(
    scope: OrgScope,
    row: AccountingConnectionRow,
  ): Promise<AccountingConnection> {
    return {
      provider: row.provider as AccountingProvider,
      status: row.status as AccountingConnection["status"],
      accountName: row.accountName,
      apiKeyHint: row.apiKeyHint,
      documentType: row.documentType as AccountingDocumentType,
      tax: row.taxKey
        ? { key: row.taxKey, name: row.taxName ?? row.taxKey, ratePercent: row.taxRateBp / 100 }
        : null,
      numberingSeriesId: row.numberingSeriesId,
      approveDocuments: row.approveDocuments,
      treasuryAccounts: Object.fromEntries(
        Object.entries(row.treasuryAccounts).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      syncFrom: row.syncFrom,
      autoSync: row.autoSync,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      lastError: row.lastError,
      connectedAt: row.createdAt.toISOString(),
      counts: await data.accounting.counts(scope, row),
    };
  }

  const statusOf = async (scope: OrgScope) => {
    const row = await data.accounting.connection.get(scope);
    return {
      platformReady: service.ready,
      connection: row ? await connectionDto(scope, row) : null,
    };
  };

  /** Traduce un error de la herramienta a una respuesta que la web pueda explicar. */
  const providerFailure = (err: unknown): never => {
    if (err instanceof AccountingProviderError) {
      if (err.reason === "unauthorized") throw badRequest(err.message, { reason: err.reason });
      throw conflict(err.message);
    }
    throw err;
  };

  async function connectedOrThrow(scope: OrgScope) {
    const row = await data.accounting.connection.get(scope);
    if (!row) throw notFound("El club no tiene conectada ninguna herramienta de contabilidad.");
    return row;
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/accounting",
      tags: ["Contabilidad"],
      summary:
        "Conexión del club con su herramienta de contabilidad, con lo enviado y lo pendiente",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Estado", AccountingStatusResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      return c.json(await statusOf(tenant.scope), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/accounting/connect",
      tags: ["Contabilidad"],
      summary:
        "Conecta la herramienta con su clave de API: se comprueba contra ella y se guarda cifrada",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      request: {
        body: {
          content: { "application/json": { schema: AccountingConnectSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Conectada", AccountingStatusResponseSchema),
        400: error("La herramienta no acepta la clave"),
        409: error("Ya hay una conexión, la plataforma no está lista o la herramienta no responde"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const body = c.req.valid("json");
      if (!service.ready)
        throw conflict("La plataforma todavía no puede guardar claves de integraciones.");
      if (await data.accounting.connection.get(tenant.scope))
        throw conflict("El club ya tiene una herramienta conectada. Desconéctala antes.");
      const account = await service
        .connectorWithKey(body.provider, body.apiKey)
        .verify()
        .catch(providerFailure);
      const created = await data.accounting.connection.create(tenant.scope, {
        provider: body.provider,
        apiKeyCiphertext: await service.seal(tenant.scope, body.apiKey),
        apiKeyHint: apiKeyHint(body.apiKey),
        accountName: account.accountName,
        // Desde hoy: conectar no vuelca el histórico salvo que el club lo pida.
        syncFrom: localDate(tenant.organization.timezone, new Date()),
        connectedBy: c.get("sessionUser").id,
      });
      if (created === "exists")
        throw conflict("El club ya tiene una herramienta conectada. Desconéctala antes.");
      await audit(c, tenant.organization.id, "accounting.connected", body.provider, {
        accountName: account.accountName,
      });
      return c.json(await statusOf(tenant.scope), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/accounting/key",
      tags: ["Contabilidad"],
      summary:
        "Cambia la clave de API de la conexión (rotada en la herramienta). Se comprueba antes",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({ apiKey: AccountingConnectSchema.shape.apiKey }),
            },
          },
          required: true,
        },
      },
      responses: {
        200: json("Clave cambiada", AccountingStatusResponseSchema),
        400: error("La herramienta no acepta la clave"),
        409: error("La herramienta no responde"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const { apiKey } = c.req.valid("json");
      const row = await connectedOrThrow(tenant.scope);
      const account = await service
        .connectorWithKey(row.provider as AccountingProvider, apiKey)
        .verify()
        .catch(providerFailure);
      await data.accounting.connection.update(tenant.scope, {
        apiKeyCiphertext: await service.seal(tenant.scope, apiKey),
        apiKeyHint: apiKeyHint(apiKey),
        accountName: account.accountName ?? row.accountName,
        lastError: null,
      });
      await audit(c, tenant.organization.id, "accounting.updated", row.provider, {
        apiKey: "rotated",
      });
      return c.json(await statusOf(tenant.scope), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/accounting",
      tags: ["Contabilidad"],
      summary:
        "Cambia cómo se mandan los cargos: documento, impuesto, serie, aprobación, tesorería, desde cuándo y pausa",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      request: {
        body: {
          content: { "application/json": { schema: AccountingSettingsUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Ajustes", AccountingStatusResponseSchema),
        400: error("Impuesto desconocido en la herramienta o nada que cambiar"),
        409: error("La herramienta no responde"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const body = c.req.valid("json");
      if (Object.keys(body).length === 0) throw badRequest("No hay nada que cambiar.");
      const row = await connectedOrThrow(tenant.scope);
      const patch: AccountingConnectionPatch = {};
      if (body.documentType !== undefined) patch.documentType = body.documentType;
      if (body.numberingSeriesId !== undefined) patch.numberingSeriesId = body.numberingSeriesId;
      if (body.approveDocuments !== undefined) patch.approveDocuments = body.approveDocuments;
      if (body.syncFrom !== undefined) patch.syncFrom = body.syncFrom;
      if (body.autoSync !== undefined) patch.autoSync = body.autoSync;
      if (body.status !== undefined) patch.status = body.status;
      if (body.treasuryAccounts !== undefined) {
        const merged = { ...row.treasuryAccounts, ...body.treasuryAccounts };
        patch.treasuryAccounts = Object.fromEntries(
          Object.entries(merged).filter(([, v]) => typeof v === "string" && v.length > 0),
        );
      }
      if (body.taxKey !== undefined) {
        if (body.taxKey === null) {
          Object.assign(patch, { taxKey: null, taxName: null, taxRateBp: 0 });
        } else {
          // El tipo sale de la herramienta, no de la web: así el precio sin impuesto cuadra.
          const connector = await service.connectorFor(tenant.scope, row);
          if (!connector) throw conflict("No se puede leer la clave guardada. Vuelve a conectar.");
          const taxes = await connector.listTaxes().catch(providerFailure);
          const tax = taxes.find((t) => t.key === body.taxKey);
          if (!tax) throw badRequest("Ese impuesto no existe en la herramienta.");
          Object.assign(patch, {
            taxKey: tax.key,
            taxName: tax.name,
            taxRateBp: percentToBasisPoints(tax.ratePercent),
          });
        }
      }
      await data.accounting.connection.update(tenant.scope, patch);
      await audit(c, tenant.organization.id, "accounting.updated", row.provider, body);
      return c.json(await statusOf(tenant.scope), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/accounting",
      tags: ["Contabilidad"],
      summary:
        "Desconecta la herramienta: borra la clave y los enlaces. Lo ya enviado se queda allí",
      security: [{ sessionCookie: [] }],
      middleware: [manage],
      responses: { 200: json("Desconectada", AccountingStatusResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const row = await connectedOrThrow(tenant.scope);
      await data.accounting.connection.remove(tenant.scope);
      await audit(c, tenant.organization.id, "accounting.disconnected", row.provider);
      return c.json(await statusOf(tenant.scope), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/accounting/options",
      tags: ["Contabilidad"],
      summary:
        "Impuestos, series de numeración y cuentas de tesorería de la herramienta, en directo",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        query: z.object({ documentType: z.enum(["invoice", "sales_receipt"]).optional() }),
      },
      responses: {
        200: json("Opciones", AccountingOptionsResponseSchema),
        409: error("La herramienta no responde o la clave no vale"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const row = await connectedOrThrow(tenant.scope);
      const { documentType } = c.req.valid("query");
      const connector = await service.connectorFor(tenant.scope, row);
      if (!connector) throw conflict("No se puede leer la clave guardada. Vuelve a conectar.");
      try {
        const [taxes, numberingSeries, treasuryAccounts] = await Promise.all([
          connector.listTaxes(),
          connector.listNumberingSeries(
            documentType ?? (row.documentType as AccountingDocumentType),
          ),
          connector.listTreasuryAccounts(),
        ]);
        return c.json({ taxes, numberingSeries, treasuryAccounts }, 200);
      } catch (err) {
        if (err instanceof AccountingProviderError) throw conflict(err.message);
        throw err;
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/accounting/sync",
      tags: ["Contabilidad"],
      summary:
        "Una tanda de envío: anulaciones, documentos con su contacto y pagos. Dice cuánto queda",
      security: [{ sessionCookie: [] }],
      middleware: [run],
      responses: {
        200: json("Tanda", AccountingSyncResponseSchema),
        409: error("La conexión está en pausa o no se puede leer la clave"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const row = await connectedOrThrow(tenant.scope);
      if (row.status !== "active") throw conflict("La conexión está en pausa.");
      const result = await service.sync(tenant.scope, tenant.organization, row);
      if (!result) throw conflict("No se puede leer la clave guardada. Vuelve a conectar.");
      const sent =
        result.created.documents + result.created.payments + result.cancelled + result.failed;
      if (sent > 0)
        await audit(c, tenant.organization.id, "accounting.synced", row.provider, {
          created: result.created,
          cancelled: result.cancelled,
          failed: result.failed,
        });
      return c.json(
        {
          created: result.created,
          cancelled: result.cancelled,
          failed: result.failed,
          remaining: result.remaining,
          done: result.done,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/accounting/issues",
      tags: ["Contabilidad"],
      summary: "Lo que la herramienta ha rechazado o no se ha podido completar, con su motivo",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Incidencias", AccountingIssuesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const row = await connectedOrThrow(tenant.scope);
      const issues = await data.accounting.issues(tenant.scope, row);
      return c.json(
        {
          issues: issues.map((i) => ({ ...i, updatedAt: i.updatedAt.toISOString() })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/accounting/retry",
      tags: ["Contabilidad"],
      summary: "Vuelve a poner en cola lo rechazado, tras corregirlo en la app o en la herramienta",
      security: [{ sessionCookie: [] }],
      middleware: [run],
      responses: {
        200: json("Reintentos", AccountingRetryResponseSchema),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = tenantOf(c);
      const row = await connectedOrThrow(tenant.scope);
      const retried = await data.accounting.retryFailed(tenant.scope, row);
      if (retried > 0)
        await audit(c, tenant.organization.id, "accounting.retried", row.provider, { retried });
      return c.json({ retried }, 200);
    },
  );

  return app;
}

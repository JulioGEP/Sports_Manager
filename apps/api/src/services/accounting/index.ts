import type { AccountingProvider, Locale } from "@sportsmanager/shared";
import type { ApiConfig } from "../../config.ts";
import type {
  AccountingConnectionRow,
  DataLayer,
  OrganizationRow,
  OrgScope,
} from "../../data/index.ts";
import { createSecretBox } from "../secret-box.ts";
import { createHoldedConnector } from "./holded.ts";
import type { AccountingConnector } from "./provider.ts";
import { runSync, type SyncOptions, type SyncResult } from "./sync.ts";

export { AccountingProviderError } from "./provider.ts";
export type { AccountingConnector } from "./provider.ts";
export type { SyncResult } from "./sync.ts";

export interface AccountingServiceOptions {
  /** `fetch` sustituible en tests para no llamar a Holded. */
  fetch?: typeof fetch;
  /** Reloj de las tandas, sustituible en tests. */
  now?: () => number;
}

/**
 * Servicio de contabilidad (ADR 0042): guarda la clave cifrada, construye el conector del club y
 * lanza las tandas. Lo usan las rutas de contabilidad y, para el envío inmediato, las de cuotas y
 * el webhook de Stripe. Sin secreto de integraciones en la plataforma no se conecta nada.
 */
export function createAccountingService(
  config: ApiConfig,
  data: DataLayer,
  options: AccountingServiceOptions = {},
) {
  const box = config.accounting.secret
    ? createSecretBox(config.accounting.secret, "accounting.api-key")
    : null;

  function connectorWithKey(provider: AccountingProvider, apiKey: string): AccountingConnector {
    switch (provider) {
      case "holded":
        return createHoldedConnector({
          apiKey,
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
    }
  }

  async function connectorFor(
    scope: OrgScope,
    connection: AccountingConnectionRow,
  ): Promise<AccountingConnector | null> {
    if (!box) return null;
    const apiKey = await box.open(connection.apiKeyCiphertext, scope.organizationId);
    return apiKey ? connectorWithKey(connection.provider as AccountingProvider, apiKey) : null;
  }

  async function sync(
    scope: OrgScope,
    organization: OrganizationRow,
    connection: AccountingConnectionRow,
    syncOptions: SyncOptions = {},
  ): Promise<SyncResult | null> {
    const connector = await connectorFor(scope, connection);
    if (!connector) return null;
    return runSync(
      {
        data,
        scope,
        connection,
        connector,
        locale: organization.defaultLocale as Locale,
        timezone: organization.timezone,
      },
      { ...(options.now ? { now: options.now } : {}), ...syncOptions },
    );
  }

  return {
    get ready(): boolean {
      return box !== null;
    },
    connectorWithKey,
    connectorFor,
    sync,

    async seal(scope: OrgScope, apiKey: string): Promise<string> {
      if (!box) throw new Error("Sin secreto de integraciones no se guardan claves.");
      return box.seal(apiKey, scope.organizationId);
    },

    /**
     * Envío inmediato de un cargo tras cobrar, emitir o anular, si el club lo tiene activado. Nunca
     * falla hacia fuera: lo que no salga ahora queda en la cola para "Sincronizar ahora".
     */
    async syncChargeQuietly(scope: OrgScope, chargeId: string): Promise<void> {
      try {
        const connection = await data.accounting.connection.get(scope);
        if (!connection || connection.status !== "active" || !connection.autoSync) return;
        const organization = await data.organizations.byScope(scope);
        if (!organization) return;
        await sync(scope, organization, connection, {
          chargeId,
          maxItems: 6,
          deadlineMs: 4_000,
        });
      } catch (error) {
        console.error("[accounting] envío inmediato fallido", error);
      }
    },
  };
}

export type AccountingService = ReturnType<typeof createAccountingService>;

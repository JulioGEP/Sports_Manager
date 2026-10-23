import { centsToAmount, type AccountingDocumentType } from "@sportsmanager/shared";
import {
  AccountingProviderError,
  type AccountingConnector,
  type AccountingTaxOption,
  type ContactInput,
  type CreatedDocument,
  type DocumentInput,
  type PaymentInput,
} from "./provider.ts";

/**
 * Holded (ADR 0042), API v2 de la documentación que nos pasó producto: `Authorization: Bearer`,
 * JSON, errores en formato problem+json (`detail`) y un límite de 100 peticiones por minuto por
 * clave. Sin SDK, como Stripe y Resend. Las facturas y los tickets comparten forma; cambia la ruta.
 */
export interface HoldedOptions {
  apiKey: string;
  /** Sustituible en tests. */
  fetch?: typeof fetch;
  apiBase?: string;
  /** Tiempo máximo por petición. Holded suele responder en menos de un segundo. */
  timeoutMs?: number;
}

const HOLDED_API = "https://api.holded.com";

const documentPath: Record<AccountingDocumentType, string> = {
  invoice: "/api/v2/invoices",
  sales_receipt: "/api/v2/sales-receipts",
};
/** Tipo de documento en las series de numeración de Holded. */
const seriesType: Record<AccountingDocumentType, string> = {
  invoice: "invoice",
  sales_receipt: "salesreceipt",
};

type Json = Record<string, unknown>;

export function createHoldedConnector(options: HoldedOptions): AccountingConnector {
  const doFetch = options.fetch ?? fetch;
  const base = options.apiBase ?? HOLDED_API;
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function call(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    let response: Response;
    try {
      response = await doFetch(url.href, {
        method,
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AccountingProviderError(
        "unavailable",
        `Holded no responde: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (response.ok) return { status: response.status, body: parsed };
    throw errorFrom(response, parsed);
  }

  const idOf = (body: unknown, what: string): string => {
    const id = isObject(body) ? body["id"] : null;
    if (typeof id !== "string" || !id)
      throw new AccountingProviderError("unavailable", `Holded no ha devuelto el id ${what}.`);
    return id;
  };

  return {
    provider: "holded",

    async verify() {
      const { body } = await call("GET", "/api/v2/account");
      return { accountName: accountNameOf(body) };
    },

    async findContact({ nationalId, email }) {
      for (const [param, value] of [
        ["code", nationalId],
        ["email", email],
      ] as const) {
        if (!value) continue;
        const { body } = await call("GET", "/api/v2/contacts", undefined, {
          [param]: value,
          limit: "1",
        });
        const first = itemsOf(body)[0];
        if (first && typeof first["id"] === "string") return first["id"];
      }
      return null;
    },

    async createContact(input: ContactInput) {
      const { body } = await call("POST", "/api/v2/contacts", {
        name: input.name,
        is_person: true,
        type: "client",
        email: input.email,
        mobile: input.phone,
        code: input.nationalId,
      });
      return idOf(body, "del contacto");
    },

    async createDocument(input: DocumentInput): Promise<CreatedDocument> {
      const path = documentPath[input.type];
      const { body } = await call("POST", path, {
        contact_id: input.contactId,
        contact_name: input.contactName,
        description: input.description,
        date: input.date,
        due_date: input.dueDate,
        notes: input.notes,
        language: input.language,
        currency: "EUR",
        tags: input.tags,
        ...(input.numberingSeriesId ? { number_line_id: input.numberingSeriesId } : {}),
        items: input.lines.map((line) => ({
          name: line.name,
          type: "service",
          description: line.description,
          units: line.units,
          price: line.unitPrice,
          taxes: line.taxKeys,
        })),
      });
      return { id: idOf(body, "del documento"), number: numberOf(body) };
    },

    async approveDocument(type, id) {
      const path = `${documentPath[type]}/${encodeURIComponent(id)}`;
      await call("POST", `${path}/approve`);
      const detail = await call("GET", path);
      return numberOf(detail.body);
    },

    async recordPayment(input: PaymentInput) {
      const { body } = await call(
        "POST",
        `${documentPath[input.documentType]}/${encodeURIComponent(input.documentId)}/payments`,
        {
          amount: centsToAmount(input.amountCents),
          date: input.date,
          treasury_id: input.treasuryId,
          description: input.description,
        },
      );
      const id = isObject(body) ? body["id"] : null;
      return typeof id === "string" && id ? id : null;
    },

    async cancelDocument(type, id) {
      const path = `${documentPath[type]}/${encodeURIComponent(id)}`;
      // Las facturas se cancelan; un borrador (o un ticket, que no se cancela) se borra.
      const attempts: ["POST" | "DELETE", string][] =
        type === "invoice"
          ? [
              ["POST", `${path}/cancel`],
              ["DELETE", path],
            ]
          : [["DELETE", path]];
      for (const [method, target] of attempts) {
        try {
          await call(method, target);
          return "cancelled";
        } catch (error) {
          if (
            error instanceof AccountingProviderError &&
            (error.reason === "rejected" || error.reason === "not_found")
          ) {
            if (error.reason === "not_found" && method === "DELETE") return "cancelled";
            continue;
          }
          throw error;
        }
      }
      return "locked";
    },

    async listTaxes(): Promise<AccountingTaxOption[]> {
      const { body } = await call("GET", "/api/v2/taxes");
      return (
        itemsOf(body)
          .filter((t) => typeof t["id"] === "string" && t["status"] !== false)
          // Los de compras (`p_…`) no sirven para lo que cobra el club.
          .filter((t) => !String(t["id"]).startsWith("p_"))
          .map((t) => ({
            key: String(t["id"]),
            name: typeof t["name"] === "string" ? t["name"] : String(t["id"]),
            ratePercent: rateOf(t["amount"]),
          }))
      );
    },

    async listNumberingSeries(type) {
      const { body } = await call("GET", `/api/v2/numbering-series/${seriesType[type]}`);
      return itemsOf(body)
        .filter((s) => typeof s["id"] === "string")
        .map((s) => ({
          id: String(s["id"]),
          name: typeof s["name"] === "string" ? s["name"] : String(s["id"]),
          format: typeof s["format"] === "string" ? s["format"] : "",
        }));
    },

    async listTreasuryAccounts() {
      const items: Json[] = [];
      let cursor: string | null = null;
      // Pocas cuentas por club; tres páginas son más que de sobra.
      for (let page = 0; page < 3; page++) {
        const { body } = await call("GET", "/api/v2/treasury/accounts", undefined, {
          archived: "false",
          limit: "100",
          ...(cursor ? { cursor } : {}),
        });
        items.push(...itemsOf(body));
        cursor = isObject(body) && typeof body["cursor"] === "string" ? body["cursor"] : null;
        if (!cursor || !(isObject(body) && body["has_more"] === true)) break;
      }
      return items
        .filter((a) => typeof a["id"] === "string")
        .map((a) => ({
          id: String(a["id"]),
          name: typeof a["name"] === "string" ? a["name"] : String(a["id"]),
          type: typeof a["type"] === "string" ? a["type"] : "bank",
        }));
    },
  };
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function itemsOf(body: unknown): Json[] {
  const items = isObject(body) ? body["items"] : Array.isArray(body) ? body : null;
  return Array.isArray(items) ? items.filter(isObject) : [];
}

/** Holded da el tipo como texto ("21") para no perder precisión. */
function rateOf(value: unknown): number {
  const rate =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : 0;
  return Number.isFinite(rate) ? rate : 0;
}

function numberOf(body: unknown): string | null {
  if (!isObject(body)) return null;
  const number = body["document_number"] ?? body["number"];
  return typeof number === "string" && number ? number : null;
}

/** La documentación no fija la forma de la cuenta: se mira donde suele estar el nombre. */
function accountNameOf(body: unknown): string | null {
  if (!isObject(body)) return null;
  for (const candidate of [body, body["data"], body["account"], body["company"]]) {
    if (!isObject(candidate)) continue;
    for (const key of ["name", "company_name", "trade_name", "business_name"]) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function errorFrom(response: Response, body: unknown): AccountingProviderError {
  const detail =
    isObject(body) && typeof body["detail"] === "string" && body["detail"]
      ? body["detail"]
      : isObject(body) && typeof body["title"] === "string"
        ? body["title"]
        : `HTTP ${response.status}`;
  const status = response.status;
  if (status === 401 || status === 403)
    return new AccountingProviderError(
      "unauthorized",
      `Holded rechaza la clave: ${detail}`,
      status,
    );
  if (status === 429) {
    const retry = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
    return new AccountingProviderError(
      "rate_limited",
      "Holded pide esperar: demasiadas peticiones en un minuto.",
      status,
      Number.isFinite(retry) ? retry : 60,
    );
  }
  if (status === 404) return new AccountingProviderError("not_found", detail, status);
  if (status >= 400 && status < 500)
    return new AccountingProviderError("rejected", `Holded lo rechaza: ${detail}`, status);
  return new AccountingProviderError("unavailable", `Holded falla: ${detail}`, status);
}

/**
 * Holded falso para las pruebas (ADR 0042): guarda contactos, documentos y pagos en memoria y
 * responde como la API v2 de la documentación. Deja fallar la siguiente petición que encaje, para
 * probar rechazos, límites y claves revocadas. Nunca sale a la red.
 */
export interface FakeContact {
  id: string;
  name: string;
  email: string | null;
  code: string | null;
  mobile: string | null;
}

export interface FakeDocument {
  id: string;
  kind: "invoices" | "sales-receipts";
  contactId: string;
  contactName: string;
  description: string;
  date: string;
  dueDate: string;
  notes: string | null;
  language: string;
  tags: string[];
  numberLineId: string | null;
  items: {
    name: string;
    description: string | null;
    units: number;
    price: number;
    taxes: string[];
  }[];
  status: "draft" | "approved" | "cancelled";
  number: string | null;
  payments: { amount: string; date: string; treasuryId: string | null; description: string }[];
}

export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
}

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createFakeHolded(options: { apiKey: string }) {
  let validKey = options.apiKey;
  let seq = 0;
  let approved = 0;
  const contacts: FakeContact[] = [];
  const documents: FakeDocument[] = [];
  const calls: FakeCall[] = [];
  const failures: {
    method: string;
    pattern: RegExp;
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }[] = [];
  const newId = () => (++seq).toString(16).padStart(24, "0");

  const handler = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    Promise.resolve(respond(input, init));

  function respond(input: string | URL | Request, init?: RequestInit): Response {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const method = (init?.method ?? "GET").toUpperCase();
    const body: unknown =
      typeof init?.body === "string" && init.body ? JSON.parse(init.body) : undefined;
    const path = url.pathname;
    calls.push({ method, path: `${path}${url.search}`, body });

    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== `Bearer ${validKey}`)
      return json(401, { title: "Unauthorized", status: 401, detail: "API key inválida" });

    const failure = failures.findIndex((f) => f.method === method && f.pattern.test(path));
    if (failure >= 0) {
      const [f] = failures.splice(failure, 1);
      return new Response(JSON.stringify(f!.body), {
        status: f!.status,
        headers: { "content-type": "application/json", ...(f!.headers ?? {}) },
      });
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const text = (key: string, fallback = "") => (typeof b[key] === "string" ? b[key] : fallback);
    if (method === "GET" && path === "/api/v2/account") return json(200, { name: "Club A SL" });

    if (path === "/api/v2/contacts") {
      if (method === "GET") {
        const email = url.searchParams.get("email");
        const code = url.searchParams.get("code");
        const items = contacts.filter(
          (c) => (email && c.email === email) || (code && c.code === code),
        );
        return json(200, { items, cursor: null, has_more: false });
      }
      if (method === "POST") {
        if (typeof b["name"] !== "string" || !b["name"])
          return json(422, { status: 422, detail: "El nombre es obligatorio" });
        const contact: FakeContact = {
          id: newId(),
          name: b["name"],
          email: (b["email"] as string | null) ?? null,
          code: (b["code"] as string | null) ?? null,
          mobile: (b["mobile"] as string | null) ?? null,
        };
        contacts.push(contact);
        return json(201, { id: contact.id });
      }
    }

    const doc =
      /^\/api\/v2\/(invoices|sales-receipts)(?:\/([0-9a-f]{24}))?(?:\/(approve|payments|cancel))?$/.exec(
        path,
      );
    if (doc) {
      const kind = doc[1] as FakeDocument["kind"];
      const id = doc[2];
      const action = doc[3];
      if (!id && method === "POST") {
        const items = (b["items"] as FakeDocument["items"] | undefined) ?? [];
        if (items.length === 0) return json(422, { status: 422, detail: "Sin líneas" });
        const created: FakeDocument = {
          id: newId(),
          kind,
          contactId: String(b["contact_id"]),
          contactName: text("contact_name"),
          description: text("description"),
          date: String(b["date"]),
          dueDate: String(b["due_date"]),
          notes: (b["notes"] as string | null) ?? null,
          language: text("language", "es"),
          tags: (b["tags"] as string[] | undefined) ?? [],
          numberLineId: (b["number_line_id"] as string | undefined) ?? null,
          items,
          status: "draft",
          number: null,
          payments: [],
        };
        documents.push(created);
        return json(201, { id: created.id });
      }
      const found = documents.find((d) => d.id === id && d.kind === kind);
      if (!found) return json(404, { status: 404, detail: "Documento no encontrado" });
      if (!action && method === "GET")
        return json(200, { id: found.id, document_number: found.number, status: found.status });
      if (!action && method === "DELETE") {
        if (found.status !== "draft")
          return json(422, { status: 422, detail: "Solo se borran borradores" });
        documents.splice(documents.indexOf(found), 1);
        return json(200, { status: 1 });
      }
      if (action === "approve" && method === "POST") {
        found.status = "approved";
        found.number = `F26${String(++approved).padStart(4, "0")}`;
        return json(200, { status: 1 });
      }
      if (action === "cancel" && method === "POST") {
        if (found.status !== "draft" || found.payments.length > 0)
          return json(422, { status: 422, detail: "La factura no se puede cancelar" });
        found.status = "cancelled";
        return json(200, { status: 1 });
      }
      if (action === "payments" && method === "POST") {
        found.payments.push({
          amount: String(b["amount"]),
          date: String(b["date"]),
          treasuryId: (b["treasury_id"] as string | null) ?? null,
          description: text("description"),
        });
        // La documentación no fija el cuerpo de la respuesta: aquí, vacío.
        return json(201, undefined);
      }
    }

    if (method === "GET" && path === "/api/v2/taxes")
      return json(200, {
        items: [
          { id: "s_iva_21", name: "IVA 21%", amount: "21", status: true },
          { id: "s_iva_exento", name: "Exento", amount: "0", status: true },
          { id: "p_iva_21", name: "IVA soportado 21%", amount: "21", status: true },
        ],
      });
    if (method === "GET" && path.startsWith("/api/v2/numbering-series/"))
      return json(200, {
        items: [{ id: "series-cuotas", name: "Cuotas", format: "C%[YYYY]%-%", last: 0 }],
      });
    if (method === "GET" && path === "/api/v2/treasury/accounts")
      return json(200, {
        items: [
          { id: "caja-01", name: "Caja", type: "cash" },
          { id: "banco-01", name: "Banco", type: "bank" },
          { id: "stripe-01", name: "Stripe", type: "gateway" },
        ],
        cursor: null,
        has_more: false,
      });

    return json(404, { status: 404, detail: `Ruta falsa sin respuesta: ${method} ${path}` });
  }

  return {
    fetch: handler,
    contacts,
    documents,
    calls,
    /** La siguiente petición que encaje falla con ese estado y cuerpo. */
    failNext(
      method: string,
      pattern: RegExp,
      status: number,
      body: unknown,
      headers?: Record<string, string>,
    ) {
      failures.push({ method, pattern, status, body, ...(headers ? { headers } : {}) });
    },
    /** Revoca la clave (o la cambia): desde ahí, toda petición con la vieja da 401. */
    rotateKey(next: string) {
      validKey = next;
    },
  };
}

export type FakeHolded = ReturnType<typeof createFakeHolded>;

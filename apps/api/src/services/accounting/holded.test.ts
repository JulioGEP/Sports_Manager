import { describe, expect, it } from "vitest";
import type { AccountingConnectionRow, ChargeDocumentSource } from "../../data/index.ts";
import { createSecretBox } from "../secret-box.ts";
import { createHoldedConnector } from "./holded.ts";
import { AccountingProviderError } from "./provider.ts";
import { documentFor } from "./sync.ts";
import { createFakeHolded } from "./testing/fake-holded.ts";

const KEY = "holded-test-key-0123456789";

describe("conector de Holded (ADR 0042)", () => {
  it("habla con la API v2 con la clave como Bearer y devuelve lo que necesita la app", async () => {
    const fake = createFakeHolded({ apiKey: KEY });
    const holded = createHoldedConnector({ apiKey: KEY, fetch: fake.fetch });
    expect(await holded.verify()).toEqual({ accountName: "Club A SL" });

    const contact = await holded.createContact({
      name: "Laura Martí",
      email: "laura@club.test",
      phone: "600000000",
      nationalId: "12345678Z",
    });
    expect(fake.contacts[0]).toMatchObject({
      id: contact,
      name: "Laura Martí",
      code: "12345678Z",
      mobile: "600000000",
    });
    expect(await holded.findContact({ nationalId: null, email: "laura@club.test" })).toBe(contact);
    expect(await holded.findContact({ nationalId: "12345678Z", email: null })).toBe(contact);
    expect(await holded.findContact({ nationalId: null, email: "otra@club.test" })).toBeNull();

    const doc = await holded.createDocument({
      type: "invoice",
      contactId: contact,
      contactName: "Laura Martí",
      date: "2026-10-23",
      dueDate: "2026-11-05",
      description: "Cuota de fútbol sala · Octubre 2026",
      lines: [
        {
          name: "Cuota",
          description: "Clara Martí",
          units: 1,
          unitPrice: 33.0579,
          taxKeys: ["s_iva_21"],
        },
      ],
      language: "es",
      numberingSeriesId: "series-cuotas",
      notes: "ref",
      tags: ["cuotas"],
    });
    expect(doc.number).toBeNull();
    expect(fake.documents[0]).toMatchObject({
      kind: "invoices",
      contactId: contact,
      numberLineId: "series-cuotas",
      items: [expect.objectContaining({ price: 33.0579, taxes: ["s_iva_21"], units: 1 })],
    });
    expect(await holded.approveDocument("invoice", doc.id)).toBe("F260001");

    // Holded no da cuerpo al apuntar el pago: el conector devuelve null y la app usa el documento.
    expect(
      await holded.recordPayment({
        documentType: "invoice",
        documentId: doc.id,
        amountCents: 4000,
        date: "2026-10-23",
        treasuryId: "banco-01",
        description: "Transferencia",
      }),
    ).toBeNull();
    expect(fake.documents[0]!.payments).toEqual([
      { amount: "40.00", date: "2026-10-23", treasuryId: "banco-01", description: "Transferencia" },
    ]);
    expect(fake.calls.every((c) => c.path.startsWith("/api/v2/"))).toBe(true);
  });

  it("un borrador se anula; uno aprobado o cobrado queda bloqueado", async () => {
    const fake = createFakeHolded({ apiKey: KEY });
    const holded = createHoldedConnector({ apiKey: KEY, fetch: fake.fetch });
    const contact = await holded.createContact({
      name: "Pere",
      email: null,
      phone: null,
      nationalId: null,
    });
    const base = {
      contactId: contact,
      contactName: "Pere",
      date: "2026-10-23",
      dueDate: "2026-10-23",
      description: "Cuota",
      lines: [{ name: "Cuota", description: null, units: 1, unitPrice: 10, taxKeys: [] }],
      language: "es" as const,
      numberingSeriesId: null,
      notes: null,
      tags: [],
    };
    const draft = await holded.createDocument({ ...base, type: "invoice" });
    expect(await holded.cancelDocument("invoice", draft.id)).toBe("cancelled");
    const approved = await holded.createDocument({ ...base, type: "invoice" });
    await holded.approveDocument("invoice", approved.id);
    expect(await holded.cancelDocument("invoice", approved.id)).toBe("locked");
    // Un ticket no se cancela: su borrador se borra.
    const ticket = await holded.createDocument({ ...base, type: "sales_receipt" });
    expect(fake.documents.find((d) => d.id === ticket.id)?.kind).toBe("sales-receipts");
    expect(await holded.cancelDocument("sales_receipt", ticket.id)).toBe("cancelled");
    expect(fake.documents.find((d) => d.id === ticket.id)).toBeUndefined();
  });

  it("traduce los errores: clave, límite de peticiones, rechazo con su motivo y caída", async () => {
    const fake = createFakeHolded({ apiKey: KEY });
    const holded = createHoldedConnector({ apiKey: KEY, fetch: fake.fetch });

    const bad = createHoldedConnector({ apiKey: "otra-clave-0000000000", fetch: fake.fetch });
    await expect(bad.verify()).rejects.toMatchObject({ reason: "unauthorized", stopsRun: true });

    fake.failNext("POST", /\/contacts$/, 429, { status: 429 }, { "retry-after": "17" });
    await expect(
      holded.createContact({ name: "X", email: null, phone: null, nationalId: null }),
    ).rejects.toMatchObject({ reason: "rate_limited", retryAfterSeconds: 17, stopsRun: true });

    fake.failNext("POST", /\/contacts$/, 422, { status: 422, detail: "NIF no válido" });
    const rejected = await holded
      .createContact({ name: "X", email: null, phone: null, nationalId: "1" })
      .catch((e: unknown) => e);
    expect(rejected).toBeInstanceOf(AccountingProviderError);
    expect(rejected).toMatchObject({ reason: "rejected", stopsRun: false });
    expect((rejected as Error).message).toContain("NIF no válido");

    fake.failNext("GET", /\/account$/, 503, { status: 503, title: "Service unavailable" });
    await expect(holded.verify()).rejects.toMatchObject({ reason: "unavailable" });

    const down = createHoldedConnector({
      apiKey: KEY,
      fetch: () => Promise.reject(new Error("ECONNRESET")),
    });
    await expect(down.verify()).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("solo ofrece impuestos de venta y lee series y cuentas de tesorería", async () => {
    const fake = createFakeHolded({ apiKey: KEY });
    const holded = createHoldedConnector({ apiKey: KEY, fetch: fake.fetch });
    expect(await holded.listTaxes()).toEqual([
      { key: "s_iva_21", name: "IVA 21%", ratePercent: 21 },
      { key: "s_iva_exento", name: "Exento", ratePercent: 0 },
    ]);
    expect(await holded.listNumberingSeries("sales_receipt")).toEqual([
      { id: "series-cuotas", name: "Cuotas", format: "C%[YYYY]%-%" },
    ]);
    expect(fake.calls.at(-1)?.path).toBe("/api/v2/numbering-series/salesreceipt");
    expect((await holded.listTreasuryAccounts()).map((a) => a.id)).toEqual([
      "caja-01",
      "banco-01",
      "stripe-01",
    ]);
  });
});

describe("caja de secretos", () => {
  it("cifra con el club como dato asociado: otro club, otro secreto o un cambio no descifran", async () => {
    const box = createSecretBox("s".repeat(40), "accounting.api-key");
    const sealed = await box.seal(KEY, "club-a");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(KEY);
    expect(await box.seal(KEY, "club-a")).not.toBe(sealed);
    expect(await box.open(sealed, "club-a")).toBe(KEY);
    expect(await box.open(sealed, "club-b")).toBeNull();
    expect(
      await createSecretBox("t".repeat(40), "accounting.api-key").open(sealed, "club-a"),
    ).toBeNull();
    expect(await createSecretBox("s".repeat(40), "otro-uso").open(sealed, "club-a")).toBeNull();
    const [v, iv, cipher] = sealed.split(".");
    const flipped = `${v}.${iv}.${cipher!.slice(0, -2)}${cipher!.endsWith("A") ? "B" : "A"}${cipher!.slice(-1)}`;
    expect(await box.open(flipped, "club-a")).toBeNull();
    expect(await box.open("basura", "club-a")).toBeNull();
  });
});

describe("documento de un cargo", () => {
  const connection = {
    documentType: "invoice",
    taxKey: "s_iva_21",
    taxRateBp: 2100,
    numberingSeriesId: null,
  } as AccountingConnectionRow;
  const clara = {
    personId: "p-clara",
    firstName: "Clara",
    lastName: "Martí",
    email: null,
    phone: null,
    nationalId: null,
  };
  const laura = { ...clara, personId: "p-laura", firstName: "Laura", email: "laura@club.test" };
  const source: ChargeDocumentSource = {
    id: "charge-1",
    concept: "Cuota de fútbol sala · Octubre 2026",
    periodLabel: "Octubre 2026",
    amountCents: 4000,
    dueOn: "2026-10-05",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    status: "overdue",
    planName: "Cuota de fútbol sala",
    person: clara,
    billTo: laura,
    storeOrder: null,
  };

  it("va a nombre de la familia, con el deportista en la línea, hoy y sin vencer antes de emitir", () => {
    const doc = documentFor(
      { connection, locale: "es", timezone: "Europe/Madrid" },
      source,
      "c1",
      "2026-10-23",
    );
    expect(doc).toMatchObject({
      type: "invoice",
      contactId: "c1",
      contactName: "Laura Martí",
      date: "2026-10-23",
      dueDate: "2026-10-23",
      tags: ["cuotas"],
      lines: [
        {
          name: "Cuota de fútbol sala · Octubre 2026",
          description: "Clara Martí · Octubre 2026",
          units: 1,
          unitPrice: 33.0579,
          taxKeys: ["s_iva_21"],
        },
      ],
    });
    expect(doc.notes).toContain("charge-1");
  });

  it("un pedido de la tienda lleva sus líneas; sin impuesto, el precio es el de la app", () => {
    const doc = documentFor(
      {
        connection: { ...connection, taxKey: null, taxRateBp: 0 },
        locale: "ca",
        timezone: "Europe/Madrid",
      },
      {
        ...source,
        amountCents: 3500,
        dueOn: "2026-10-30",
        billTo: clara,
        storeOrder: {
          number: 12,
          items: [
            { name: "Camiseta", variant: "M", quantity: 1, unitPriceCents: 2500 },
            { name: "Calcetines", variant: null, quantity: 2, unitPriceCents: 500 },
          ],
        },
      },
      "c2",
      "2026-10-23",
    );
    expect(doc.dueDate).toBe("2026-10-30");
    expect(doc.tags).toEqual(["tienda"]);
    expect(doc.lines).toEqual([
      { name: "Camiseta · M", description: "Comanda T-0012", units: 1, unitPrice: 25, taxKeys: [] },
      { name: "Calcetines", description: "Comanda T-0012", units: 2, unitPrice: 5, taxKeys: [] },
    ]);
  });
});

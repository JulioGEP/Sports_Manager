import { describe, expect, it } from "vitest";
import {
  AccountingConnectSchema,
  AccountingSettingsUpdateSchema,
  apiKeyHint,
  netUnitPrice,
  percentToBasisPoints,
} from "./accounting.ts";
import { stripeAccountCanCharge } from "./fees.ts";

describe("conectores de contabilidad (ADR 0042)", () => {
  it("el precio sin impuesto vuelve al total de la app al sumar el impuesto", () => {
    expect(netUnitPrice(4000, 0)).toBe(40);
    expect(netUnitPrice(4000, 2100)).toBe(33.0579);
    for (const cents of [1, 99, 1000, 2500, 4000, 12345, 99999]) {
      for (const bp of [400, 1000, 2100]) {
        const net = netUnitPrice(cents, bp);
        expect(Math.round(net * (1 + bp / 10_000) * 100)).toBe(cents);
      }
    }
  });

  it("el tipo va en puntos básicos y la clave solo enseña su final", () => {
    expect(percentToBasisPoints(21)).toBe(2100);
    expect(percentToBasisPoints(5.5)).toBe(550);
    expect(apiKeyHint("  hk_live_0123456789abcdef  ")).toBe("…cdef");
  });

  it("valida la clave y rechaza ajustes desconocidos o formas de pago que no existen", () => {
    expect(AccountingConnectSchema.safeParse({ provider: "holded", apiKey: "corta" }).success).toBe(
      false,
    );
    expect(
      AccountingConnectSchema.safeParse({ provider: "contaplus", apiKey: "x".repeat(32) }).success,
    ).toBe(false);
    expect(
      AccountingSettingsUpdateSchema.safeParse({ treasuryAccounts: { cash: "abc", stripe: null } })
        .success,
    ).toBe(true);
    expect(
      AccountingSettingsUpdateSchema.safeParse({ treasuryAccounts: { bizum: "abc" } }).success,
    ).toBe(false);
    expect(AccountingSettingsUpdateSchema.safeParse({ apiKey: "x" }).success).toBe(false);
  });

  it("una cuenta de Stripe en alta o restringida no cobra; una escrita a mano, sí", () => {
    expect(stripeAccountCanCharge("enabled")).toBe(true);
    expect(stripeAccountCanCharge(null)).toBe(true);
    expect(stripeAccountCanCharge("onboarding")).toBe(false);
    expect(stripeAccountCanCharge("restricted")).toBe(false);
  });
});

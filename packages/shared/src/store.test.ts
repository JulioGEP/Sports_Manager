import { describe, expect, it } from "vitest";
import {
  canMoveOrder,
  isMinor,
  PUBLIC_KEY_PATTERN,
  StoreOrderCreateSchema,
  storeOrderCode,
  StoreProductCreateSchema,
} from "./store.ts";

const product = (variants: { label: string | null; stock: number | null }[]) => ({
  name: "Camiseta",
  category: "apparel",
  priceCents: 3000,
  variants,
});

describe("tienda (ADR 0041)", () => {
  it("es menor quien no ha cumplido 18; sin fecha, se trata como menor", () => {
    const on = new Date("2026-10-23T12:00:00Z");
    expect(isMinor("2015-02-03", on)).toBe(true);
    expect(isMinor("2008-10-24", on)).toBe(true);
    expect(isMinor("2008-10-23", on)).toBe(false);
    expect(isMinor("1995-01-20", on)).toBe(false);
    expect(isMinor(null, on)).toBe(true);
  });

  it("un pedido va y vuelve entre recibido, listo y entregado; se anula antes de entregar y no cambia más", () => {
    expect(canMoveOrder("pending", "ready")).toBe(true);
    expect(canMoveOrder("ready", "delivered")).toBe(true);
    expect(canMoveOrder("delivered", "ready")).toBe(true);
    expect(canMoveOrder("ready", "pending")).toBe(true);
    expect(canMoveOrder("pending", "cancelled")).toBe(true);
    expect(canMoveOrder("ready", "cancelled")).toBe(true);
    expect(canMoveOrder("delivered", "cancelled")).toBe(false);
    expect(canMoveOrder("cancelled", "pending")).toBe(false);
    expect(canMoveOrder("pending", "pending")).toBe(false);
  });

  it("un producto tiene al menos una opción; con varias, todas con nombre y sin repetir", () => {
    expect(
      StoreProductCreateSchema.safeParse(product([{ label: null, stock: null }])).success,
    ).toBe(true);
    expect(StoreProductCreateSchema.safeParse(product([])).success).toBe(false);
    expect(
      StoreProductCreateSchema.safeParse(
        product([
          { label: "S", stock: 1 },
          { label: null, stock: 1 },
        ]),
      ).success,
    ).toBe(false);
    expect(
      StoreProductCreateSchema.safeParse(
        product([
          { label: "M", stock: 1 },
          { label: "m", stock: 2 },
        ]),
      ).success,
    ).toBe(false);
    expect(StoreProductCreateSchema.safeParse(product([{ label: "S", stock: -1 }])).success).toBe(
      false,
    );
  });

  it("un producto es de una sección o de un equipo, nunca de los dos", () => {
    const section = "00000000-0000-4000-8000-000000000001";
    const team = "00000000-0000-4000-8000-000000000002";
    const base = product([{ label: null, stock: null }]);
    expect(StoreProductCreateSchema.safeParse({ ...base, sectionId: section }).success).toBe(true);
    expect(
      StoreProductCreateSchema.safeParse({ ...base, sectionId: section, teamId: team }).success,
    ).toBe(false);
  });

  it("un pedido no repite opción", () => {
    const personId = "00000000-0000-4000-8000-000000000003";
    const variantId = "00000000-0000-4000-8000-000000000004";
    expect(
      StoreOrderCreateSchema.safeParse({ personId, items: [{ variantId, quantity: 2 }] }).success,
    ).toBe(true);
    expect(
      StoreOrderCreateSchema.safeParse({
        personId,
        items: [
          { variantId, quantity: 1 },
          { variantId, quantity: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it("numera los pedidos y reconoce una clave publicable", () => {
    expect(storeOrderCode(12)).toBe("T-0012");
    expect(storeOrderCode(12345)).toBe("T-12345");
    expect(PUBLIC_KEY_PATTERN.test(`pk_${"a1".repeat(16)}`)).toBe(true);
    expect(PUBLIC_KEY_PATTERN.test("pk_live_123")).toBe(false);
  });
});

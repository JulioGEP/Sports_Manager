import { describe, expect, it } from "vitest";
import { centsToAmount, formatAmount, formatMoney, parseMoney } from "./fees.ts";

describe("dinero en toda la app", () => {
  it("punto de miles, coma decimal y siempre dos decimales", () => {
    expect(formatMoney(0)).toBe("0,00 €");
    expect(formatMoney(5)).toBe("0,05 €");
    expect(formatMoney(6900)).toBe("69,00 €");
    expect(formatMoney(123456)).toBe("1.234,56 €");
    expect(formatMoney(227300)).toBe("2.273,00 €");
    expect(formatMoney(123456789)).toBe("1.234.567,89 €");
    expect(formatMoney(-123456)).toBe("-1.234,56 €");
    expect(formatMoney(1240, "$")).toBe("12,40 $");
    expect(formatAmount(100000000)).toBe("1.000.000,00");
  });

  it("lee lo que se escribe en un campo de importe", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("1234,56")).toBe(123456);
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("12,5")).toBe(1250);
    expect(parseMoney("12")).toBe(1200);
    expect(parseMoney("1.234")).toBe(123400);
    expect(parseMoney("12.50")).toBe(1250);
    expect(parseMoney(" 69,00 € ")).toBe(6900);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("doce")).toBeNull();
    expect(parseMoney("1,2,3")).toBeNull();
  });

  it("lo que se escribe con el formato de la app vuelve al mismo importe", () => {
    for (const cents of [0, 1, 99, 6900, 123456, 98765432])
      expect(parseMoney(formatAmount(cents))).toBe(cents);
  });

  it("para las APIs, el importe sigue con punto decimal y sin miles", () => {
    expect(centsToAmount(123456)).toBe("1234.56");
  });
});

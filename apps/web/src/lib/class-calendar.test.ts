import { describe, expect, it } from "vitest";
import { buildTimeline, layoutColumns } from "./class-calendar";

const at = (h: number, m = 0) => h * 60 + m;
const options = {
  hourHeight: 60,
  gapHeight: 24,
  minGapHours: 2,
  fallback: [7, 21] as [number, number],
};

describe("rejilla de horas del calendario de clases", () => {
  it("va de la hora en punto antes de la primera clase a la hora en punto después de la última", () => {
    const timeline = buildTimeline(
      [
        { start: at(7), end: at(8) },
        { start: at(9, 30), end: at(10, 30) },
      ],
      options,
    );
    expect(timeline.segments).toEqual([
      { from: at(7), to: at(11), top: 0, height: 240, collapsed: false },
    ]);
    expect(timeline.hours.map((h) => h.hour)).toEqual([7, 8, 9, 10]);
    expect(timeline.y(at(9, 30))).toBe(150);
  });

  it("pliega las horas seguidas sin clases y deja a escala un hueco de una hora", () => {
    const timeline = buildTimeline(
      [
        { start: at(7), end: at(8) },
        { start: at(9), end: at(10) },
        { start: at(18), end: at(19) },
      ],
      options,
    );
    expect(timeline.segments).toEqual([
      { from: at(7), to: at(10), top: 0, height: 180, collapsed: false },
      { from: at(10), to: at(18), top: 180, height: 24, collapsed: true },
      { from: at(18), to: at(19), top: 204, height: 60, collapsed: false },
    ]);
    expect(timeline.height).toBe(264);
    // Las horas del hueco no llevan etiqueta; las de después siguen en su sitio.
    expect(timeline.hours).toEqual([
      { hour: 7, top: 0 },
      { hour: 8, top: 60 },
      { hour: 9, top: 120 },
      { hour: 18, top: 204 },
    ]);
    expect(timeline.y(at(18, 30))).toBe(234);
    // Dentro del hueco, proporcional a la franja (la línea de "ahora" no salta).
    expect(timeline.y(at(14))).toBe(192);
  });

  it("una clase que empieza a media hora ocupa las dos horas que toca", () => {
    const timeline = buildTimeline(
      [
        { start: at(7), end: at(8) },
        { start: at(11, 15), end: at(12, 15) },
      ],
      options,
    );
    expect(timeline.segments.map((s) => [s.from / 60, s.to / 60, s.collapsed])).toEqual([
      [7, 8, false],
      [8, 11, true],
      [11, 13, false],
    ]);
  });

  it("sin clases enseña el horario de respaldo entero, sin plegar", () => {
    const timeline = buildTimeline([], options);
    expect(timeline.segments).toEqual([
      { from: at(7), to: at(21), top: 0, height: 840, collapsed: false },
    ]);
  });

  it("fuera del rango, pegado al borde", () => {
    const timeline = buildTimeline([{ start: at(7), end: at(8) }], options);
    expect(timeline.y(at(5))).toBe(0);
    expect(timeline.y(at(23))).toBe(60);
  });
});

describe("clases que coinciden", () => {
  it("las que se solapan van en columnas y las demás a todo el ancho", () => {
    const laid = layoutColumns([
      { id: "wod", start: at(19), end: at(20) },
      { id: "hyrox", start: at(19), end: at(20) },
      { id: "late", start: at(20), end: at(21) },
    ]);
    const byId = Object.fromEntries(laid.map((x) => [x.item.id, [x.column, x.columns]]));
    expect(byId).toEqual({ wod: [0, 2], hyrox: [1, 2], late: [0, 1] });
  });

  it("un solape en cadena comparte columnas y reaprovecha la que queda libre", () => {
    const laid = layoutColumns([
      { id: "a", start: at(9), end: at(11) },
      { id: "b", start: at(10), end: at(12) },
      { id: "c", start: at(11), end: at(12) },
    ]);
    const byId = Object.fromEntries(laid.map((x) => [x.item.id, [x.column, x.columns]]));
    expect(byId).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] });
  });
});

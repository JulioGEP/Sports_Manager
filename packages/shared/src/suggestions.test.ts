import { describe, expect, it } from "vitest";
import { PlatformSuggestionUpdateSchema, SuggestionCreateSchema } from "./api/suggestions.ts";
import {
  permissionsForMemberships,
  permissionsForRoles,
  ROLE_CODES,
  STAFF_POSITIONS,
} from "./roles.ts";
import {
  isOrderedSuggestion,
  isPublicSuggestion,
  isVotableSuggestion,
  orderRoadmap,
  parseSuggestionEta,
  similarSuggestions,
  SUGGESTION_STATUSES,
  suggestionEtaOptions,
  suggestionEtaSortKey,
  suggestionWords,
  type RoadmapSortable,
  type SuggestionStatus,
} from "./suggestions.ts";

describe("mejoras de la plataforma (ADR 0047)", () => {
  it("solo la administración del club sugiere, vota y ve la hoja de ruta", () => {
    expect(permissionsForRoles(["org_admin"]).has("org.suggestions")).toBe(true);
    // Ningún otro rol, tampoco los que se añadan después.
    for (const role of ROLE_CODES.filter((r) => r !== "org_admin"))
      expect(permissionsForRoles([role]).has("org.suggestions"), role).toBe(false);
    for (const position of STAFF_POSITIONS)
      expect(
        permissionsForMemberships([{ roleCode: "staff", position }]).has("org.suggestions"),
        position,
      ).toBe(false);
  });

  it("lo recibido, lo descartado y lo unido no es público; lo disponible ya no se vota", () => {
    const visible = SUGGESTION_STATUSES.filter(isPublicSuggestion);
    expect(visible).toEqual(["open", "planned", "in_progress", "released"]);
    expect(SUGGESTION_STATUSES.filter(isVotableSuggestion)).toEqual([
      "open",
      "planned",
      "in_progress",
    ]);
    expect(SUGGESTION_STATUSES.filter(isOrderedSuggestion)).toEqual(["planned", "in_progress"]);
  });

  it("la fecha aproximada es un mes o un trimestre, nunca un día", () => {
    expect(parseSuggestionEta("2027-03")).toEqual({ kind: "month", year: 2027, month: 3 });
    expect(parseSuggestionEta("2027-Q2")).toEqual({ kind: "quarter", year: 2027, quarter: 2 });
    for (const bad of ["2027-13", "2027-Q5", "2027-03-01", "Q1 2027", "", null, undefined])
      expect(parseSuggestionEta(bad), String(bad)).toBeNull();
  });

  it("ordena por cuándo empieza: el mes antes que el trimestre que empieza ese mes, sin fecha al final", () => {
    const etas = [null, "2027-Q2", "2027-04", "2027-Q1", "2026-12", "2027-02"];
    expect(
      [...etas].sort((a, b) => (suggestionEtaSortKey(a) < suggestionEtaSortKey(b) ? -1 : 1)),
    ).toEqual(["2026-12", "2027-Q1", "2027-02", "2027-04", "2027-Q2", null]);
  });

  it("ofrece los trimestres y los meses que vienen, empezando por el actual", () => {
    const { quarters, months } = suggestionEtaOptions("2026-11-15", { quarters: 4, months: 3 });
    expect(quarters).toEqual(["2026-Q4", "2027-Q1", "2027-Q2", "2027-Q3"]);
    expect(months).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("ordena la hoja de ruta: en desarrollo, planificadas por su orden, en estudio por votos y lo último disponible", () => {
    const item = (
      id: string,
      status: SuggestionStatus,
      extra: Partial<Omit<RoadmapSortable, "status">> = {},
    ) => ({
      id,
      status,
      position: null,
      eta: null,
      votes: 0,
      publishedAt: "2026-10-01T00:00:00.000Z",
      releasedAt: null,
      ...extra,
    });
    const ordered = orderRoadmap(
      [
        item("estudio-poco", "open", { votes: 1 }),
        item("plan-sin-orden-tarde", "planned", { eta: "2027-Q3" }),
        item("disponible-vieja", "released", { releasedAt: "2026-01-01T00:00:00.000Z" }),
        item("plan-2", "planned", { position: 2 }),
        item("recibida", "submitted"),
        item("estudio-mucho", "open", { votes: 7 }),
        item("plan-1", "planned", { position: 1, eta: "2027-12" }),
        item("plan-sin-orden-pronto", "planned", { eta: "2027-01" }),
        item("haciendo", "in_progress", { position: 5 }),
        item("disponible-nueva", "released", { releasedAt: "2026-09-01T00:00:00.000Z" }),
        item("descartada", "declined"),
      ],
      1,
    );
    expect(ordered.map((i) => [i.id, i.rank])).toEqual([
      ["haciendo", 1],
      ["plan-1", 2],
      ["plan-2", 3],
      ["plan-sin-orden-pronto", 4],
      ["plan-sin-orden-tarde", 5],
      ["estudio-mucho", null],
      ["estudio-poco", null],
      ["disponible-nueva", null],
    ]);
  });

  it("busca parecidas por palabras con significado, sin acentos ni mayúsculas", () => {
    expect(suggestionWords("Sincronizar la agenda con Google Calendar, por favor")).toEqual([
      "sincronizar",
      "agenda",
      "google",
      "calendar",
      "favor",
    ]);
    const items = [
      { title: "Agenda sincronizada con Google Calendar", body: null, votes: 3 },
      { title: "Exportar la agenda a PDF", body: "Para imprimirla", votes: 9 },
      { title: "Notificaciones en el móvil", body: "Avisos de convocatoria", votes: 20 },
    ];
    expect(similarSuggestions("Sincronización de la agenda con google", items)).toEqual([items[0]]);
    // Con una o dos palabras basta una en común; las más votadas primero.
    expect(similarSuggestions("agenda", items).map((i) => i.title)).toEqual([
      "Exportar la agenda a PDF",
      "Agenda sincronizada con Google Calendar",
    ]);
    // Variantes de la misma palabra cuentan: plural, otra terminación, misma raíz.
    expect(similarSuggestions("Notificación de convocatorias", items)).toEqual([items[2]]);
    expect(similarSuggestions("agendas", items)).toHaveLength(2);
    // Raíces cortas que no son la misma palabra, no.
    expect(similarSuggestions("partidos", [{ title: "Participar", body: null, votes: 0 }])).toEqual(
      [],
    );
    expect(similarSuggestions("pagos con bizum", items)).toEqual([]);
    expect(similarSuggestions("para como", items)).toEqual([]);
  });

  it("valida lo que envía el club y lo que cambia la plataforma", () => {
    expect(
      SuggestionCreateSchema.safeParse({
        title: "  Exportar socios  ",
        body: "Para el seguro de la federación.",
        area: "people",
      }),
    ).toMatchObject({ success: true, data: { title: "Exportar socios" } });
    expect(
      SuggestionCreateSchema.safeParse({ title: "Ok", body: "Corto", area: "people" }).success,
    ).toBe(false);
    expect(
      SuggestionCreateSchema.safeParse({ title: "Algo", body: "x".repeat(20), area: "x" }),
    ).toMatchObject({ success: false });
    expect(PlatformSuggestionUpdateSchema.safeParse({ eta: "2027-Q1" }).success).toBe(true);
    expect(PlatformSuggestionUpdateSchema.safeParse({ eta: null }).success).toBe(true);
    expect(PlatformSuggestionUpdateSchema.safeParse({ eta: "2027-01-15" }).success).toBe(false);
  });
});

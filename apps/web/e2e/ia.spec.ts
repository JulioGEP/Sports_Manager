import { expect, test, type Page, type Route } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, suffix } from "./helpers";

/**
 * Propuesta de sesión con IA (ADR 0044). En local no hay token del proveedor, así que el
 * navegador ve la configuración real (perfil, cuota, material y semana del Sénior A) con la IA
 * activada y respuestas del modelo simuladas: el formulario de 100 puntos, la espera y el borrador
 * con su porqué. El material de la sección y la cuota del club, contra la API real.
 */
const PASSWORD = "123456";
const WEEK = "2026-10-19";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

interface WeekEvent {
  id: string;
  date: string;
}

function generation(status: "running" | "ready", events: WeekEvent[]) {
  const sessions = events.slice(0, 2).map((event, i) => ({
    eventId: event.id,
    date: event.date,
    minutes: 90,
    objective: i === 0 ? "Salida de presión y finalización" : "Velocidad y balón parado",
    targetRpe: i === 0 ? 7 : 5,
    contentIds: [uuid(21)],
    rationale:
      "Las pérdidas en el inicio han subido un 30 % en los tres últimos partidos y el ciclo pide finalización. Es MD-3: volumen e intensidad altos, con el limitado en variante sin contacto.",
    blocks: [
      {
        block: "warmup",
        items: [
          {
            drillId: null,
            title: "Rondo de activación 4x1",
            minutes: 15,
            sets: null,
            reps: null,
            restSec: null,
            targetRpe: 4,
            groupLabel: null,
            playerIds: null,
            contentIds: [uuid(21)],
            notes: "Dos rondos en paralelo, dos toques. Cambia el defensor tras cada robo.",
            restrictionTags: [],
            newDrill: {
              description: "Rondo 4x1 en un cuadrado de 8 x 8 metros con dos toques por jugador.",
              rules: "Dos toques. Si el defensor toca el balón, cambia con quien perdió.",
              coachingPoints: "Perfilarse antes de recibir. Pase al pie lejano del compañero.",
              variants: "Limitados: rondo 5x0 de posesión sin defensor.",
              format: "4x1",
              space: "8 x 8 m",
              playersMin: 5,
              playersMax: 10,
              material: "Conos y balones",
              restrictionTags: [],
            },
          },
        ],
      },
      {
        block: "main",
        items: [
          {
            drillId: null,
            title: "Salida de presión 4x3 + portero",
            minutes: 25,
            sets: 4,
            reps: null,
            restSec: 90,
            targetRpe: 7,
            groupLabel: null,
            playerIds: null,
            contentIds: [uuid(21)],
            notes:
              "Salida desde el portero ante presión alta. Gol doble si se supera la primera línea en menos de 6 segundos.",
            restrictionTags: ["contact"],
            newDrill: null,
          },
          {
            drillId: null,
            title: "Finalización tras transición",
            minutes: 20,
            sets: 3,
            reps: 6,
            restSec: 60,
            targetRpe: 7,
            groupLabel: null,
            playerIds: null,
            contentIds: [uuid(22)],
            notes: "Transición 2x1 que acaba en tiro. Pierna no dominante en la segunda serie.",
            restrictionTags: ["shooting"],
            newDrill: null,
          },
        ],
      },
      {
        block: "cooldown",
        items: [
          {
            drillId: null,
            title: "Movilidad y charla",
            minutes: 10,
            sets: null,
            reps: null,
            restSec: null,
            targetRpe: 2,
            groupLabel: null,
            playerIds: null,
            contentIds: [],
            notes: "Movilidad de cadera y una idea para el sábado.",
            restrictionTags: [],
            newDrill: null,
          },
        ],
      },
    ],
    plannedMinutes: 70,
    equipment: ["Balones", "Petos", "Conos"],
    warnings: ["Con 10 jugadores, el 4x3 deja a tres fuera: rota cada serie."],
    checks: [
      {
        code: "restriction",
        playerId: uuid(31),
        values: { title: "Salida de presión 4x3 + portero", tags: "contact" },
      },
    ],
  }));
  return {
    generation: {
      id: uuid(1),
      status,
      failure: null,
      createdAt: new Date().toISOString(),
      appliedAt: null,
      requestedBy: "Sergio Senior",
      dates: sessions.map((s) => s.date),
      team: { id: uuid(2), name: "Sénior A" },
      request: {
        eventIds: sessions.map((s) => s.eventId),
        objective: "Salir de la presión",
        emphasis: { technical: 20, tactical: 50, physical: 20, set_piece: 10 },
        intensity: "high",
        context: null,
        libraryOnly: false,
        includeVariants: true,
      },
      profile: {
        code: "team_performance",
        name: {
          es: "Competición en deportes de equipo",
          ca: "Competició en esports d'equip",
          en: "Competitive team sports",
        },
      },
      blockLabels: [
        { block: "warmup", label: { es: "Activación", ca: "Activació", en: "Warm-up" } },
        { block: "main", label: { es: "Parte principal", ca: "Part principal", en: "Main part" } },
        {
          block: "cooldown",
          label: { es: "Vuelta a la calma", ca: "Tornada a la calma", en: "Cool-down" },
        },
      ],
      proposal:
        status === "ready"
          ? {
              summary:
                "Semana para salir mejor de la presión y afinar la finalización antes del partido del sábado.",
              sessions,
              checks: [],
            }
          : null,
      finishedAt: null,
      planned: [],
    },
    lookups: {
      players: [{ id: uuid(31), name: "Kike Ramos" }],
      contents: [
        { id: uuid(21), name: "Salida de presión", kind: "tactical" },
        { id: uuid(22), name: "Finalización", kind: "technical" },
      ],
      drills: [],
    },
    access: { apply: true },
  };
}

/** La configuración real con la IA activada; pedir, consultar y aplicar, simulados. */
async function simulateAi(page: Page) {
  let events: WeekEvent[] = [];
  let polls = 0;
  await page.route("**/api/org/teams/*/ai-config**", async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      available: boolean;
      configured: boolean;
      week: { events: WeekEvent[] };
    };
    events = body.week.events;
    await route.fulfill({ response, json: { ...body, available: true, configured: true } });
  });
  await page.route("**/api/org/teams/*/ai-drafts", (route) =>
    route.fulfill({ status: 201, json: generation("running", events) }),
  );
  await page.route("**/api/org/ai-drafts/*/apply", (route) =>
    route.fulfill({
      json: {
        sessions: events.slice(0, 2).map((e) => ({ eventId: e.id, sessionId: uuid(9) })),
        drillsCreated: 0,
      },
    }),
  );
  await page.route("**/api/org/ai-drafts/*", (route) => {
    polls += 1;
    return route.fulfill({ json: generation(polls > 1 ? "ready" : "running", events) });
  });
}

test.describe("propuesta con IA", () => {
  test("el entrenador pide la semana a la IA, revisa el porqué y la aplica", async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await login(page, "senior@demo.test", PASSWORD);
    await simulateAi(page);
    await page.goto(`${CLUB}/training`);
    await page.getByRole("link", { name: "Abrir la semana" }).first().click();
    await expect(page.getByRole("heading", { name: "Semana de entrenamiento" })).toBeVisible();
    await page.goto(`${page.url().split("?")[0]}?date=${WEEK}`);

    await page.getByRole("button", { name: "Proponer la semana con IA" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Proponer con IA" })).toBeVisible();
    await expect(sheet.getByText("Competición en deportes de equipo")).toBeVisible();
    await expect(sheet.getByText("100 puntos repartidos.")).toBeVisible();
    await expect(sheet.getByText(/Te quedan \d+ propuestas de \d+ esta semana/)).toBeVisible();
    // Mover un eje descuadra el reparto y bloquea el envío hasta volver a 100.
    const tactical = sheet.getByLabel("Táctico", { exact: true });
    await tactical.focus();
    await tactical.press("End");
    await expect(sheet.getByText(/^Sobran \d+ puntos\.$/)).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Proponer con IA" })).toBeDisabled();
    await sheet.getByRole("button", { name: "Volver al reparto de la sección" }).click();
    await sheet.getByLabel("Objetivo").fill("Salir de la presión");
    await sheet.getByLabel("Contexto").fill("Venimos de perder 2-3 y el sábado hay derbi.");
    await shot(page, "230-ia-formulario", info.project.name);
    await expectLegibleButtons(page);

    await sheet.getByRole("button", { name: "Proponer con IA" }).click();
    await expect(sheet.getByText("Preparando la propuesta")).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Resumen" })).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText("Por qué").first()).toBeVisible();
    await expect(
      sheet
        .getByText(
          "Kike Ramos tiene restricciones (Contacto) que chocan con «Salida de presión 4x3 + portero».",
        )
        .first(),
    ).toBeVisible();
    await expect(sheet.getByText("Nueva").first()).toBeVisible();
    await shot(page, "231-ia-propuesta", info.project.name);
    await expectLegibleButtons(page);

    await sheet.getByRole("button", { name: "Aplicar a las sesiones" }).click();
    await expect(page.getByText(/^Propuesta aplicada a \d+ sesion/)).toBeVisible();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("la sección guarda su material y su forma de entrenar; la plataforma fija la cuota", async ({
    page,
  }, info) => {
    const sfx = suffix(info.project.name);
    await login(page);
    const sections = (await (
      await page.request.get("/api/org/sections", { headers: { "x-sm-club": "demo" } })
    ).json()) as { sections: { id: string; name: string }[] };
    const futsal = sections.sections.find((x) => x.name === "Fútbol sala")!;
    await page.goto(`${CLUB}/sections/${futsal.id}/training-config`);
    await expect(page.getByRole("heading", { name: "Cómo entrenamos aquí" })).toBeVisible();
    await page
      .getByLabel("Metodología", { exact: true })
      .fill(
        "Juego de posición, presión tras pérdida y mucho balón. Las tareas, siempre con portero.",
      );
    await page
      .getByRole("heading", { name: "Cómo entrenamos aquí" })
      .locator("xpath=ancestor::section[1]")
      .getByRole("button", { name: "Guardar" })
      .click();
    await expect(page.getByText("Ajustes guardados.")).toBeVisible();

    await page.getByRole("button", { name: "Añadir material" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Nombre").fill(`Balones ${sfx}`);
    await sheet.getByLabel("Cantidad").fill("14");
    await sheet.getByRole("button", { name: "Añadir material" }).click();
    await expect(page.getByText(`Balones ${sfx} añadido.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Material" })).toBeVisible();
    await shot(page, "232-ia-material", info.project.name);

    await page.goto("/admin/clubs/demo");
    await expect(page.getByRole("heading", { name: "Propuesta con IA" })).toBeVisible();
    await expect(page.getByText(/Falta ANTHROPIC_API_KEY/)).toBeVisible();
    // Escritorio y móvil comparten base: cada uno deja una cuota distinta para que haya cambio.
    await page.getByLabel("Propuestas por semana").fill(info.project.name === "movil" ? "9" : "8");
    await page.getByRole("button", { name: "Guardar" }).last().click();
    await expect(page.getByText("Cuota guardada.")).toBeVisible();
    await shot(page, "233-ia-plataforma", info.project.name);
  });
});

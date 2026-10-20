import { expect, test } from "@playwright/test";
import { CLUB, expectLegibleButtons, login, shot, suffix } from "./helpers";

/** Secciones y temporadas, equipos y plantillas (Bloque 11) con el club demo precargado. */
test.describe("estructura del club", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("equipos, secciones y temporadas", async ({ page }, info) => {
    const sfx = suffix(info.project.name);
    await page.getByRole("link", { name: "Equipos" }).first().click();
    await expect(page.getByRole("heading", { name: "Equipos" })).toBeVisible();
    await expect(page.getByText("Alevín A")).toBeVisible();
    await expect(page.getByText("Infantil A")).toBeVisible();
    await shot(page, "30-equipos", info.project.name);
    await expectLegibleButtons(page);

    await page.getByRole("tab", { name: "Secciones" }).click();
    await expect(page.getByText("Fútbol sala").first()).toBeVisible();
    await shot(page, "31-secciones", info.project.name);

    await page.getByRole("tab", { name: "Temporadas" }).click();
    await expect(page.getByText("2026-27").first()).toBeVisible();
    await expect(page.getByText("Actual").first()).toBeVisible();
    await shot(page, "32-temporadas", info.project.name);
    await expectLegibleButtons(page);

    // Nueva temporada, sin marcarla como actual.
    await page.getByRole("button", { name: "Nueva temporada" }).click();
    const seasonSheet = page.getByRole("dialog");
    await seasonSheet.getByLabel("Nombre", { exact: true }).fill(`2027-28 ${sfx}`);
    await seasonSheet.getByLabel("Empieza").fill("2027-09-01");
    await seasonSheet.getByLabel("Acaba").fill("2028-06-30");
    await shot(page, "33-temporada-nueva", info.project.name);
    await seasonSheet.getByRole("button", { name: "Crear temporada" }).click();
    await expect(page.getByText(`Temporada 2027-28 ${sfx} creada.`)).toBeVisible();
    await expect(page.getByText(`2027-28 ${sfx}`)).toBeVisible();

    // Nuevo equipo en la temporada actual.
    await page.getByRole("tab", { name: "Equipos" }).click();
    await page.getByRole("button", { name: "Nuevo equipo" }).click();
    const teamSheet = page.getByRole("dialog");
    await teamSheet.getByLabel("Nombre del equipo").fill(`Cadete ${sfx}`);
    await teamSheet.getByLabel("Categoría").fill("Cadete");
    await shot(page, "34-equipo-nuevo", info.project.name);
    await teamSheet.getByRole("button", { name: "Crear equipo" }).click();
    await expect(page.getByText(`Equipo Cadete ${sfx} creado.`)).toBeVisible();
    await expect(page.getByText(`Cadete ${sfx}`).first()).toBeVisible();
  });

  test("ficha de equipo: plantilla y cuerpo técnico", async ({ page }, info) => {
    await page.goto(`${CLUB}/teams`);
    await page
      .locator("tr, li")
      .filter({ hasText: "Alevín A" })
      .getByRole("link", { name: "Abrir" })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Alevín A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clara Martí" })).toBeVisible();
    await expect(page.getByText("Carla Vidal")).toBeVisible();
    await shot(page, "35-equipo-ficha", info.project.name);
    await expectLegibleButtons(page);

    // Añadir a la plantilla a alguien que ya está en el club (el primero disponible).
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Buscar por nombre").fill("Joel");
    await sheet.getByLabel("Dorsal").fill("12");
    await sheet.getByLabel("Posición").fill("Ala");
    await shot(page, "36-equipo-anadir-jugador", info.project.name);
    await sheet.getByRole("button", { name: "Añadir a la plantilla" }).click();
    await expect(page.getByText("Joel Castro ya está en Alevín A.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Joel Castro" })).toBeVisible();

    // Y quitarlo: confirmación con el nombre.
    await page
      .locator("tr, li")
      .filter({ hasText: "Joel Castro" })
      .getByRole("button", { name: "Quitar" })
      .first()
      .click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText("¿Quitar a Joel Castro de Alevín A?")).toBeVisible();
    await confirm.getByRole("button", { name: "Quitar" }).click();
    await expect(page.getByText("Joel Castro ya no está en Alevín A.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Joel Castro" })).toHaveCount(0);
  });
});

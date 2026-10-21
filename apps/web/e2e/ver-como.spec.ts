import { expect, test } from "@playwright/test";
import { expectLegibleButtons, login, shot } from "./helpers";

/**
 * Inicio del club completo y "ver como" (Bloque 14): la administración mira el club con los ojos
 * de la entrenadora y de una familia sin volver a entrar, y vuelve a su vista con un toque.
 */
test.describe("inicio y ver como", () => {
  test("el inicio del administrador: hoy en el club, recuentos y secciones", async ({
    page,
  }, info) => {
    await login(page);
    await expect(page.getByText("Hoy en el club")).toBeVisible();
    await expect(page.getByText("Socios", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "El club por deporte" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Baloncesto/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alertas del club" })).toBeVisible();
    await shot(page, "03c-inicio-club-completo", info.project.name);
    await expectLegibleButtons(page);
  });

  test("ver el club como la entrenadora y como una familia", async ({ page }, info) => {
    await login(page);
    await page.getByRole("button", { name: /menú de usuario|user menu/i }).click();
    await page.getByRole("menuitem", { name: "Ver el club como…" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Ver el club como…" })).toBeVisible();
    await sheet.getByLabel("Buscar por nombre o email").fill("Carla");
    await shot(page, "80-ver-como", info.project.name);
    await sheet.getByRole("button", { name: /Carla Vidal/ }).click();

    // Con los ojos de la entrenadora: su panel, sin ajustes ni personal.
    await expect(page.getByText(/Estás viendo el club como Carla Vidal/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mis jugadores" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ajustes" })).toHaveCount(0);
    await shot(page, "81-ver-como-entrenadora", info.project.name);
    await expectLegibleButtons(page);

    // Cambia a una familia sin salir: solo lo suyo.
    await page.getByRole("button", { name: /menú de usuario|user menu/i }).click();
    await page.getByRole("menuitem", { name: "Ver el club como…" }).click();
    await page.getByRole("dialog").getByLabel("Buscar por nombre o email").fill("Laura");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Laura Martí/ })
      .click();
    await expect(page.getByText(/Estás viendo el club como Laura Martí/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu familia" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clara Martí" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Deportistas" })).toHaveCount(0);
    await shot(page, "82-ver-como-familia", info.project.name);

    // De vuelta a la vista propia.
    await page.getByRole("button", { name: "Volver a mi vista" }).click();
    await expect(page.getByText(/Estás viendo el club como/)).toHaveCount(0);
    await expect(page.getByText("Hoy en el club")).toBeVisible();
  });
});
